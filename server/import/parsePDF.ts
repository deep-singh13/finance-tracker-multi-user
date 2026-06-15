import type { RawTransaction } from '@shared/import';

interface TextItem { x: number; y: number; str: string; page: number }

// Matches DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD, etc.
const DATE_RE   = /^(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})$/;
// Matches 2.00, 1,200.00, 7,668.54 (no negative — sign is determined by column position)
const AMOUNT_RE = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;

async function extractItems(buffer: Buffer): Promise<TextItem[]> {
  // Dynamic import keeps pdfjs-dist external (not bundled to CJS) so import.meta.url
  // inside pdfjs-dist resolves correctly at runtime on the production server.
  // @ts-ignore — ESM entry; resolved correctly by Node.js dynamic import at runtime
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page    = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const [,,,, x, y] = item.transform;
        out.push({ x: Math.round(x), y: Math.round(y), str: item.str.trim(), page: p });
      }
    }
  }
  return out;
}

// Groups items by y-coordinate within a single page (tolerance ±4px).
// Must receive items from a single page only — cross-page merging causes
// rows with the same y on different pages to be conflated.
function groupByY(pageItems: TextItem[], tol = 4): Map<number, TextItem[]> {
  const groups = new Map<number, TextItem[]>();
  for (const item of pageItems) {
    let found = false;
    for (const ky of Array.from(groups.keys())) {
      if (Math.abs(ky - item.y) <= tol) { groups.get(ky)!.push(item); found = true; break; }
    }
    if (!found) groups.set(item.y, [item]);
  }
  return groups;
}

interface TxRow { y: number; page: number; items: TextItem[] }

export async function parsePDF(buffer: Buffer): Promise<RawTransaction[]> {
  let items: TextItem[];
  try {
    items = await extractItems(buffer);
  } catch {
    throw new Error('Could not read PDF. Make sure it is a text-based PDF, not a scanned image.');
  }

  // Group by page first, then by y within each page — prevents cross-page row merging
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const txRows: TxRow[] = [];
  for (const [page, pageItems] of Array.from(byPage.entries())) {
    const byY = groupByY(pageItems);
    for (const [y, ri] of Array.from(byY.entries())) {
      const sorted = ri.sort((a: TextItem, b: TextItem) => a.x - b.x);
      if (
        sorted.some((i: TextItem) => i.x < 150 && DATE_RE.test(i.str)) &&
        sorted.some((i: TextItem) => i.x > 200 && AMOUNT_RE.test(i.str))
      ) {
        txRows.push({ y, page, items: sorted });
      }
    }
  }

  if (txRows.length === 0) {
    throw new Error('No transactions found. This PDF may be a scanned image. Try a text-based PDF or CSV instead.');
  }

  // Sort: page asc, then y desc (high y = top of page in PDF coordinates)
  txRows.sort((a: TxRow, b: TxRow) => a.page !== b.page ? a.page - b.page : b.y - a.y);

  // Assign description items (x 100-280, not a date, not an amount) to the nearest
  // transaction row within the window [item_y - 10, item_y + 50] on the same page.
  const descCandidates = items.filter(
    i => i.x >= 100 && i.x <= 280 && !DATE_RE.test(i.str) && !AMOUNT_RE.test(i.str) && i.str !== '-'
  );
  // Key: "${page}:${y}" to avoid collisions between same-y rows on different pages
  const descByKey = new Map<string, Array<{ y: number; str: string }>>();
  for (const dc of descCandidates) {
    const candidates = txRows.filter(r =>
      r.page === dc.page && r.y >= dc.y - 10 && r.y <= dc.y + 50
    );
    if (candidates.length === 0) continue;
    const nearest = candidates.reduce(
      (a: TxRow, b: TxRow) => Math.abs(a.y - dc.y) <= Math.abs(b.y - dc.y) ? a : b
    );
    const key = `${nearest.page}:${nearest.y}`;
    if (!descByKey.has(key)) descByKey.set(key, []);
    descByKey.get(key)!.push({ y: dc.y, str: dc.str });
  }

  const rows: RawTransaction[] = [];

  for (const { y, page, items: ri } of txRows) {
    const dateItem = ri.find((i: TextItem) => i.x < 150 && DATE_RE.test(i.str));
    if (!dateItem) continue;

    const amounts = ri.filter((i: TextItem) => i.x > 200 && AMOUNT_RE.test(i.str));
    if (amounts.length < 2) continue; // need at least one tx amount + one balance

    // Rightmost amount = running balance; everything else is the transaction amount(s)
    const balanceItem = amounts.reduce((a: TextItem, b: TextItem) => (a.x > b.x ? a : b));
    const txAmts      = amounts.filter((i: TextItem) => i !== balanceItem);
    if (txAmts.length === 0) continue;

    // Debit vs credit: amount further LEFT from balance = debit; within 80 px = credit
    const creditThreshold = balanceItem.x - 80;
    const debitAmts  = txAmts.filter((i: TextItem) => i.x < creditThreshold);
    const creditAmts = txAmts.filter((i: TextItem) => i.x >= creditThreshold);

    let signedAmount: number;
    if (debitAmts.length > 0 && creditAmts.length === 0) {
      signedAmount = -parseFloat(debitAmts[0].str.replace(/,/g, ''));
    } else if (creditAmts.length > 0 && debitAmts.length === 0) {
      signedAmount =  parseFloat(creditAmts[0].str.replace(/,/g, ''));
    } else if (debitAmts.length > 0) {
      signedAmount = -parseFloat(debitAmts[0].str.replace(/,/g, ''));
    } else {
      signedAmount =  parseFloat(creditAmts[0].str.replace(/,/g, ''));
    }

    if (isNaN(signedAmount)) continue;

    const key = `${page}:${y}`;
    const descLines = (descByKey.get(key) ?? []).sort((a, b) => b.y - a.y);
    const description = descLines.map(d => d.str).join(' ').trim() || 'Unknown';

    rows.push({ date: dateItem.str, amount: signedAmount, description });
  }

  // Deduplicate (same date + amount + description seen on repeated pages like totals)
  const seen = new Set<string>();
  const result = rows.filter(r => {
    const k = `${r.date}|${r.amount}|${r.description}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });

  if (result.length === 0) {
    throw new Error('No transactions found. This PDF may be a scanned image. Try a text-based PDF or CSV instead.');
  }

  return result;
}
