// @ts-ignore — pdf-parse is CJS; ESM type entry lacks a default export under moduleResolution:bundler
import pdfParse from 'pdf-parse';
import type { RawTransaction } from '@shared/import';

// Matches: DATE  DESCRIPTION  AMOUNT (at end of line)
// Dates: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
const DATE_PAT = String.raw`(?:\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2})`;
const AMT_PAT  = String.raw`-?\$?[\d,]+\.\d{2}`;
const LINE_RE  = new RegExp(`^(${DATE_PAT})\\s+(.+?)\\s+(${AMT_PAT})\\s*$`);

export async function parsePDF(buffer: Buffer): Promise<RawTransaction[]> {
  let text: string;
  try {
    const data = await pdfParse(buffer);
    text = data.text;
  } catch {
    throw new Error('Could not read PDF. Make sure it is a text-based PDF, not a scanned image.');
  }

  const rows: RawTransaction[] = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, date, description, amtStr] = m;
    const amount = parseFloat(amtStr.replace(/[$,]/g, ''));
    if (isNaN(amount)) continue;
    rows.push({ date, amount, description: description.trim() });
  }

  if (rows.length === 0) {
    throw new Error('No transactions found. This PDF may be a scanned image. Try a text-based PDF or CSV instead.');
  }
  return rows;
}
