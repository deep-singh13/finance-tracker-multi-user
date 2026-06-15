import { createHash } from 'crypto';
import type { RawTransaction, ParsedTransaction, ImportType } from '@shared/import';

const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/grocery|supermarket|whole foods|trader joe|safeway|kroger|albertsons|aldi|lidl|costco/i, 'Food'],
  [/restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|sushi|dining|doordash|grubhub|ubereats/i, 'Food'],
  [/\buber\b(?!eats)|lyft|taxi|transit|metro|train|airline|flight|parking/i, 'Transport'],
  [/netflix|spotify|hulu|disney\+|apple tv|youtube premium|amazon prime/i, 'Entertainment'],
  [/\bamazon\b(?! prime)|walmart|target|ebay|etsy/i, 'Shopping'],
  [/doctor|hospital|pharmacy|cvs|walgreens|dental|medical/i, 'Healthcare'],
  [/electric|water bill|internet|phone bill|verizon|comcast|utility/i, 'Utilities'],
  [/\bgym\b|fitness|yoga|crossfit/i, 'Health'],
];

export function parseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const mdy4 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (mdy4) {
    const [, m, d, y] = mdy4;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const mdy2 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
  if (mdy2) {
    const [, m, d, y] = mdy2;
    const year = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  throw new Error(`Unrecognized date format: ${raw}`);
}

export function guessCategory(description: string): string {
  for (const [re, cat] of CATEGORY_MAP) {
    if (re.test(description)) return cat;
  }
  return 'Other';
}

export function makeHash(date: string, amountCents: number, description: string): string {
  return createHash('sha256')
    .update(`${date}|${amountCents}|${description.toLowerCase().trim()}`)
    .digest('hex');
}

export function normalizeTransactions(
  rows: RawTransaction[],
  importType: ImportType,
): Omit<ParsedTransaction, 'isDuplicate'>[] {
  return rows.map(row => {
    const date        = parseDate(row.date);
    const amountCents = Math.round(Math.abs(row.amount) * 100);
    const type: 'expense' | 'income' =
      importType === 'expense' ? 'expense' :
      importType === 'income'  ? 'income'  :
      row.amount <= 0          ? 'expense' : 'income';

    return {
      date,
      amount:      amountCents,
      description: row.description,
      type,
      category:    guessCategory(row.description),
      hash:        makeHash(date, amountCents, row.description),
    };
  });
}
