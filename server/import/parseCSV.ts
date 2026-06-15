import type { RawTransaction } from '@shared/import';

const DATE_COLS   = new Set(['date','transaction date','posted date','value date','trans date','posting date']);
const DESC_COLS   = new Set(['description','details','memo','narrative','particulars','transaction description','transaction','name']);
const AMT_COLS    = new Set(['amount','value','transaction amount','net amount']);
const DEBIT_COLS  = new Set(['debit','debit amount','withdrawal','withdrawals','dr']);
const CREDIT_COLS = new Set(['credit','credit amount','deposit','deposits','cr','payment']);

const LAYOUT_ERROR = "Could not detect column layout. Try exporting as CSV from your bank's transaction history.";

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function parseAmount(s: string): number {
  const cleaned = s.replace(/[$£€,\s]/g, '').trim();
  if (/^\([\d.]+\)$/.test(cleaned)) return -parseFloat(cleaned.slice(1, -1));
  return parseFloat(cleaned);
}

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"')              { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else                         { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

export function parseCSV(text: string): RawTransaction[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error(LAYOUT_ERROR);

  const headers   = splitLine(lines[0]).map(normalizeHeader);
  const dateIdx   = headers.findIndex(h => DATE_COLS.has(h));
  const descIdx   = headers.findIndex(h => DESC_COLS.has(h));
  const amtIdx    = headers.findIndex(h => AMT_COLS.has(h));
  const debitIdx  = headers.findIndex(h => DEBIT_COLS.has(h));
  const creditIdx = headers.findIndex(h => CREDIT_COLS.has(h));

  if (dateIdx === -1 || descIdx === -1) throw new Error(LAYOUT_ERROR);
  if (amtIdx === -1 && (debitIdx === -1 || creditIdx === -1)) throw new Error(LAYOUT_ERROR);

  const rows: RawTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const date        = cols[dateIdx]?.trim();
    const description = cols[descIdx]?.trim();
    if (!date || !description) continue;

    let amount: number;
    if (amtIdx !== -1) {
      const raw = cols[amtIdx]?.trim();
      if (!raw) continue;
      amount = parseAmount(raw);
    } else {
      const debitRaw  = debitIdx  !== -1 ? cols[debitIdx]?.trim()  : '';
      const creditRaw = creditIdx !== -1 ? cols[creditIdx]?.trim() : '';
      if (!debitRaw && !creditRaw) continue;
      const d = debitRaw  ? parseAmount(debitRaw)  : 0;
      const c = creditRaw ? parseAmount(creditRaw) : 0;
      amount = c - d;
    }
    if (isNaN(amount)) continue;
    rows.push({ date, amount, description });
  }

  if (rows.length === 0) throw new Error(LAYOUT_ERROR);
  return rows;
}
