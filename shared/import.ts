export interface RawTransaction {
  date: string;        // raw string from file, e.g. "05/15/2026"
  amount: number;      // signed float in source currency (negative = debit)
  description: string;
}

export interface ParsedTransaction {
  date: string;        // YYYY-MM-DD
  amount: number;      // cents, always positive
  description: string;
  type: 'expense' | 'income';
  category: string;
  hash: string;        // SHA-256 for duplicate detection
  isDuplicate: boolean;
}

export type ImportType = 'expense' | 'income' | 'both';
