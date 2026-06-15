# Bank Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV and PDF bank statement upload with rule-based parsing, a duplicate-detection preview step, and bulk insert into the existing `expenses`/`income` tables.

**Architecture:** A new `server/import/` module exposes two Express routes (`POST /api/import/parse`, `POST /api/import/confirm`) backed by focused parser files. A new `/import` page provides a 3-step wizard (upload → review/edit → summary). Duplicate detection uses SHA-256 hashes stored in the existing `externalId` column on both tables.

**Tech Stack:** multer (file upload), pdf-parse (PDF text extraction), Node crypto (SHA-256), Drizzle ORM transactions, React + TanStack Query, shadcn/ui, Wouter, Vitest + Supertest.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `shared/import.ts` | Shared `RawTransaction`, `ParsedTransaction`, `ImportType` types |
| Create | `server/import/parseCSV.ts` | CSV column detection and row parsing |
| Create | `server/import/parsePDF.ts` | PDF text extraction + regex line matching |
| Create | `server/import/normalizeTransactions.ts` | Date normalisation, cents conversion, category guess, SHA-256 hash |
| Create | `server/import/detectDuplicates.ts` | Pure duplicate flag + DB hash loader |
| Create | `server/import/router.ts` | multer middleware + parse/confirm route handlers |
| Create | `client/src/pages/Import.tsx` | 3-step wizard page |
| Create | `tests/import/parseCSV.test.ts` | parseCSV unit tests |
| Create | `tests/import/parsePDF.test.ts` | parsePDF unit tests (pdf-parse mocked) |
| Create | `tests/import/normalizeTransactions.test.ts` | normalizeTransactions unit tests |
| Create | `tests/import/detectDuplicates.test.ts` | detectDuplicates unit tests (pure function) |
| Create | `tests/import/integration.test.ts` | API integration tests |
| Modify | `server/routes.ts` | Register import routes |
| Modify | `client/src/App.tsx` | Add `/import` route + TabBar entry |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime and type packages**

```bash
npm install pdf-parse multer
npm install -D @types/multer @types/pdf-parse
```

- [ ] **Step 2: Verify installation**

```bash
npm ls pdf-parse multer
```

Expected: both packages listed without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse and multer dependencies"
```

---

## Task 2: Define shared import types

**Files:**
- Create: `shared/import.ts`

- [ ] **Step 1: Create the types file**

Create `shared/import.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add shared/import.ts
git commit -m "feat(import): add shared ParsedTransaction types"
```

---

## Task 3: Implement parseCSV (TDD)

**Files:**
- Create: `tests/import/parseCSV.test.ts`
- Create: `server/import/parseCSV.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/import/parseCSV.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCSV } from '../../server/import/parseCSV';

describe('parseCSV', () => {
  it('parses a single signed-amount column', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-05-01,Grocery Store,-45.50',
      '2026-05-15,Salary,3000.00',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-05-01', amount: -45.50, description: 'Grocery Store' });
    expect(result[1]).toEqual({ date: '2026-05-15', amount: 3000.00, description: 'Salary' });
  });

  it('parses separate Debit and Credit columns', () => {
    const csv = [
      'Date,Description,Debit,Credit',
      '2026-05-01,Uber Eats,12.50,',
      '2026-05-15,Salary,,3000.00',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result[0]).toEqual({ date: '2026-05-01', amount: -12.50, description: 'Uber Eats' });
    expect(result[1]).toEqual({ date: '2026-05-15', amount: 3000.00, description: 'Salary' });
  });

  it('strips dollar signs and commas from quoted amounts', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-05-01,Rent,"$1,200.00"',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result[0].amount).toBe(1200.00);
  });

  it('treats parentheses as negative amounts', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-05-01,Bank Fee,(5.00)',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result[0].amount).toBe(-5.00);
  });

  it('skips rows with empty amount fields', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-05-01,Header Row,',
      '2026-05-02,Real Transaction,-50.00',
    ].join('\n');
    expect(parseCSV(csv)).toHaveLength(1);
  });

  it('throws a readable error on unrecognized headers', () => {
    const csv = 'Col1,Col2,Col3\nval1,val2,val3\n';
    expect(() => parseCSV(csv)).toThrow(/column layout/i);
  });

  it('throws when no parseable rows remain', () => {
    const csv = 'Date,Description,Amount\n';
    expect(() => parseCSV(csv)).toThrow(/column layout/i);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/import/parseCSV.test.ts
```

Expected: FAIL — `Cannot find module '../../server/import/parseCSV'`

- [ ] **Step 3: Implement parseCSV**

Create `server/import/parseCSV.ts`:

```typescript
import type { RawTransaction } from '@shared/import';

const DATE_COLS  = new Set(['date','transaction date','posted date','value date','trans date','posting date']);
const DESC_COLS  = new Set(['description','details','memo','narrative','particulars','transaction description','transaction','name']);
const AMT_COLS   = new Set(['amount','value','transaction amount','net amount']);
const DEBIT_COLS = new Set(['debit','debit amount','withdrawal','withdrawals','dr']);
const CREDIT_COLS= new Set(['credit','credit amount','deposit','deposits','cr','payment']);

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
    if (ch === '"')           { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else                      { cur += ch; }
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
      const d = debitIdx  !== -1 && cols[debitIdx]?.trim()  ? parseAmount(cols[debitIdx].trim())  : 0;
      const c = creditIdx !== -1 && cols[creditIdx]?.trim() ? parseAmount(cols[creditIdx].trim()) : 0;
      amount = c - d;
    }
    if (isNaN(amount)) continue;
    rows.push({ date, amount, description });
  }

  if (rows.length === 0) throw new Error(LAYOUT_ERROR);
  return rows;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/import/parseCSV.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/import/parseCSV.ts tests/import/parseCSV.test.ts
git commit -m "feat(import): implement CSV parser with TDD"
```

---

## Task 4: Implement parsePDF (TDD)

**Files:**
- Create: `tests/import/parsePDF.test.ts`
- Create: `server/import/parsePDF.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/import/parsePDF.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdf-parse', () => ({ default: vi.fn() }));

import pdfParse from 'pdf-parse';
import { parsePDF } from '../../server/import/parsePDF';

describe('parsePDF', () => {
  beforeEach(() => vi.mocked(pdfParse).mockReset());

  it('extracts transactions from a standard bank PDF layout', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: [
        '05/01/2026 UBER EATS -12.50',
        '05/15/2026 DIRECT DEPOSIT SALARY 3000.00',
      ].join('\n'),
    } as any);

    const result = await parsePDF(Buffer.from(''));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '05/01/2026', amount: -12.50,  description: 'UBER EATS' });
    expect(result[1]).toEqual({ date: '05/15/2026', amount: 3000.00, description: 'DIRECT DEPOSIT SALARY' });
  });

  it('handles ISO date format', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: '2026-05-01 Coffee Shop -4.50\n',
    } as any);

    const result = await parsePDF(Buffer.from(''));
    expect(result[0].date).toBe('2026-05-01');
  });

  it('throws when no transaction lines are found', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'Statement Header\nPage 1 of 1\nAccount Summary',
    } as any);

    await expect(parsePDF(Buffer.from(''))).rejects.toThrow(/No transactions found/);
  });

  it('throws a readable error when pdf-parse itself fails', async () => {
    vi.mocked(pdfParse).mockRejectedValue(new Error('Invalid PDF'));
    await expect(parsePDF(Buffer.from(''))).rejects.toThrow(/Could not read PDF/);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/import/parsePDF.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parsePDF**

Create `server/import/parsePDF.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/import/parsePDF.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/import/parsePDF.ts tests/import/parsePDF.test.ts
git commit -m "feat(import): implement PDF parser with TDD"
```

---

## Task 5: Implement normalizeTransactions (TDD)

**Files:**
- Create: `tests/import/normalizeTransactions.test.ts`
- Create: `server/import/normalizeTransactions.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/import/normalizeTransactions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDate, guessCategory, normalizeTransactions } from '../../server/import/normalizeTransactions';

describe('parseDate', () => {
  it('passes through ISO dates unchanged', () => {
    expect(parseDate('2026-05-15')).toBe('2026-05-15');
  });
  it('converts MM/DD/YYYY', () => {
    expect(parseDate('05/15/2026')).toBe('2026-05-15');
  });
  it('converts MM-DD-YYYY', () => {
    expect(parseDate('05-15-2026')).toBe('2026-05-15');
  });
  it('converts 2-digit year MM/DD/YY', () => {
    expect(parseDate('05/15/26')).toBe('2026-05-15');
  });
  it('pads single-digit month and day', () => {
    expect(parseDate('5/3/2026')).toBe('2026-05-03');
  });
  it('throws on unrecognized format', () => {
    expect(() => parseDate('not a date')).toThrow(/Unrecognized date format/);
  });
});

describe('guessCategory', () => {
  it('matches grocery stores to Food', () => {
    expect(guessCategory('WHOLE FOODS MARKET')).toBe('Food');
  });
  it('matches Uber (not Uber Eats) to Transport', () => {
    expect(guessCategory('UBER TRIP')).toBe('Transport');
  });
  it('matches UberEats to Food', () => {
    expect(guessCategory('UBEREATS ORDER')).toBe('Food');
  });
  it('returns Other for unrecognized descriptions', () => {
    expect(guessCategory('WIRE TRANSFER ABC')).toBe('Other');
  });
});

describe('normalizeTransactions', () => {
  const raw = [
    { date: '2026-05-01', amount: -45.50, description: 'Grocery Store' },
    { date: '05/15/2026', amount:  3000,  description: 'Salary Deposit' },
  ];

  it('converts amounts to integer cents (always positive)', () => {
    const result = normalizeTransactions(raw, 'both');
    expect(result[0].amount).toBe(4550);
    expect(result[1].amount).toBe(300000);
  });

  it('infers expense/income from sign when importType is both', () => {
    const result = normalizeTransactions(raw, 'both');
    expect(result[0].type).toBe('expense');
    expect(result[1].type).toBe('income');
  });

  it('forces all rows to expense when importType is expense', () => {
    const result = normalizeTransactions(raw, 'expense');
    expect(result.every(r => r.type === 'expense')).toBe(true);
  });

  it('forces all rows to income when importType is income', () => {
    const result = normalizeTransactions(raw, 'income');
    expect(result.every(r => r.type === 'income')).toBe(true);
  });

  it('normalises dates to YYYY-MM-DD', () => {
    const result = normalizeTransactions(raw, 'both');
    expect(result[0].date).toBe('2026-05-01');
    expect(result[1].date).toBe('2026-05-15');
  });

  it('generates a 64-char hex hash', () => {
    const result = normalizeTransactions(raw, 'both');
    expect(result[0].hash).toHaveLength(64);
    expect(result[0].hash).toMatch(/^[a-f0-9]+$/);
  });

  it('produces the same hash for identical inputs', () => {
    const [a] = normalizeTransactions([raw[0]], 'both');
    const [b] = normalizeTransactions([raw[0]], 'both');
    expect(a.hash).toBe(b.hash);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/import/normalizeTransactions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement normalizeTransactions**

Create `server/import/normalizeTransactions.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/import/normalizeTransactions.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/import/normalizeTransactions.ts tests/import/normalizeTransactions.test.ts
git commit -m "feat(import): implement transaction normalisation with TDD"
```

---

## Task 6: Implement detectDuplicates (TDD)

**Files:**
- Create: `tests/import/detectDuplicates.test.ts`
- Create: `server/import/detectDuplicates.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/import/detectDuplicates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectDuplicates } from '../../server/import/detectDuplicates';

const base = {
  date: '2026-05-01',
  amount: 4550,
  description: 'Grocery Store',
  type: 'expense' as const,
  category: 'Food',
  hash: 'a'.repeat(64),
};

describe('detectDuplicates', () => {
  it('flags a transaction whose hash exists in the set', () => {
    const existing = new Set([base.hash]);
    const [result] = detectDuplicates([base], existing);
    expect(result.isDuplicate).toBe(true);
  });

  it('does not flag a transaction with an unknown hash', () => {
    const [result] = detectDuplicates([base], new Set());
    expect(result.isDuplicate).toBe(false);
  });

  it('handles mixed results in one batch', () => {
    const t1 = { ...base, hash: 'a'.repeat(64) };
    const t2 = { ...base, hash: 'b'.repeat(64) };
    const results = detectDuplicates([t1, t2], new Set(['a'.repeat(64)]));
    expect(results[0].isDuplicate).toBe(true);
    expect(results[1].isDuplicate).toBe(false);
  });

  it('returns an empty array for empty input', () => {
    expect(detectDuplicates([], new Set())).toEqual([]);
  });

  it('preserves all other fields on each transaction', () => {
    const [result] = detectDuplicates([base], new Set());
    const { isDuplicate, ...rest } = result;
    expect(rest).toEqual(base);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/import/detectDuplicates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement detectDuplicates**

Create `server/import/detectDuplicates.ts`:

```typescript
import { db } from '../db';
import { expenses, income } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { ParsedTransaction } from '@shared/import';

// Pure function — testable without DB
export function detectDuplicates(
  transactions: Omit<ParsedTransaction, 'isDuplicate'>[],
  existingHashes: Set<string>,
): ParsedTransaction[] {
  return transactions.map(t => ({ ...t, isDuplicate: existingHashes.has(t.hash) }));
}

// DB-dependent — covered by integration tests
export async function loadExistingHashes(userId: number): Promise<Set<string>> {
  const [expRows, incRows] = await Promise.all([
    db.select({ externalId: expenses.externalId }).from(expenses).where(eq(expenses.userId, userId)),
    db.select({ externalId: income.externalId }).from(income).where(eq(income.userId, userId)),
  ]);
  return new Set([
    ...expRows.map(r => r.externalId).filter((x): x is string => x != null),
    ...incRows.map(r => r.externalId).filter((x): x is string => x != null),
  ]);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/import/detectDuplicates.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/import/detectDuplicates.ts tests/import/detectDuplicates.test.ts
git commit -m "feat(import): implement duplicate detection with TDD"
```

---

## Task 7: Add import API routes + integration tests

**Files:**
- Create: `server/import/router.ts`
- Create: `tests/import/integration.test.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/import/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { resetDb } from '../helpers/db';
import { makeApp } from '../helpers/app';

let app: any;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  await resetDb();
  app = await makeApp();
  agent = request.agent(app);
  await request(app).post('/api/auth/register').send({ username: 'alice', password: 'secret123' });
  await agent.post('/api/auth/login').send({ username: 'alice', password: 'secret123' });
});

const CSV_SIGNED = [
  'Date,Description,Amount',
  '2026-05-01,Grocery Store,-45.50',
  '2026-05-15,Salary,3000.00',
].join('\n');

describe('POST /api/import/parse', () => {
  it('returns ParsedTransactions from a signed-amount CSV', async () => {
    const res = await agent
      .post('/api/import/parse')
      .field('importType', 'both')
      .attach('file', Buffer.from(CSV_SIGNED), { filename: 'stmt.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ amount: 4550, type: 'expense', isDuplicate: false });
    expect(res.body[1]).toMatchObject({ amount: 300000, type: 'income', isDuplicate: false });
  });

  it('forces all rows to expense when importType is expense', async () => {
    const res = await agent
      .post('/api/import/parse')
      .field('importType', 'expense')
      .attach('file', Buffer.from(CSV_SIGNED), { filename: 'stmt.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.every((r: any) => r.type === 'expense')).toBe(true);
  });

  it('returns 400 for unrecognized CSV headers', async () => {
    const bad = 'Col1,Col2,Col3\nval1,val2,100\n';
    const res = await agent
      .post('/api/import/parse')
      .field('importType', 'both')
      .attach('file', Buffer.from(bad), { filename: 'stmt.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/column layout/i);
  });

  it('flags previously confirmed transactions as duplicates', async () => {
    const parse1 = await agent
      .post('/api/import/parse')
      .field('importType', 'both')
      .attach('file', Buffer.from(CSV_SIGNED), { filename: 'stmt.csv', contentType: 'text/csv' });

    const expenseRow = parse1.body.find((r: any) => r.type === 'expense');
    await agent.post('/api/import/confirm').send({ transactions: [expenseRow] });

    const parse2 = await agent
      .post('/api/import/parse')
      .field('importType', 'both')
      .attach('file', Buffer.from(CSV_SIGNED), { filename: 'stmt.csv', contentType: 'text/csv' });

    const flagged = parse2.body.find((r: any) => r.type === 'expense');
    expect(flagged.isDuplicate).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/import/parse')
      .field('importType', 'both')
      .attach('file', Buffer.from(CSV_SIGNED), { filename: 'stmt.csv', contentType: 'text/csv' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/import/confirm', () => {
  it('inserts expenses and returns correct counts', async () => {
    const t = {
      date: '2026-05-01', amount: 4550, description: 'Grocery Store',
      type: 'expense' as const, category: 'Food', hash: 'a'.repeat(64),
    };
    const res = await agent.post('/api/import/confirm').send({ transactions: [t] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expensesAdded: 1, incomeAdded: 0 });
  });

  it('inserts income records and returns correct counts', async () => {
    const t = {
      date: '2026-05-15', amount: 300000, description: 'Salary',
      type: 'income' as const, category: 'Other', hash: 'b'.repeat(64),
    };
    const res = await agent.post('/api/import/confirm').send({ transactions: [t] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expensesAdded: 0, incomeAdded: 1 });
  });

  it('inserted expense is visible in /api/expenses', async () => {
    const t = {
      date: '2026-05-01', amount: 4550, description: 'Grocery Store',
      type: 'expense' as const, category: 'Food', hash: 'c'.repeat(64),
    };
    await agent.post('/api/import/confirm').send({ transactions: [t] });
    const list = await agent.get('/api/expenses');
    expect(list.body.some((e: any) => e.description === 'Grocery Store' && e.source === 'import')).toBe(true);
  });

  it('returns 400 for an empty transactions array', async () => {
    const res = await agent.post('/api/import/confirm').send({ transactions: [] });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const t = {
      date: '2026-05-01', amount: 100, description: 'Test',
      type: 'expense' as const, category: 'Other', hash: 'd'.repeat(64),
    };
    const res = await request(app).post('/api/import/confirm').send({ transactions: [t] });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/import/integration.test.ts
```

Expected: FAIL — routes not registered yet.

- [ ] **Step 3: Create the import router**

Create `server/import/router.ts`:

```typescript
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db';
import { expenses, income } from '@shared/schema';
import { parseCSV } from './parseCSV';
import { parsePDF } from './parsePDF';
import { normalizeTransactions } from './normalizeTransactions';
import { detectDuplicates, loadExistingHashes } from './detectDuplicates';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const importTypeSchema = z.enum(['expense', 'income', 'both']);

const confirmSchema = z.object({
  transactions: z.array(z.object({
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount:      z.number().int().positive(),
    description: z.string().min(1),
    type:        z.enum(['expense', 'income']),
    category:    z.string().min(1),
    hash:        z.string().length(64),
  })).min(1),
});

export function registerImportRoutes(app: Express, requireAuth: any) {
  app.post(
    '/api/import/parse',
    requireAuth,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const parsed = importTypeSchema.safeParse(req.body.importType);
        if (!parsed.success) {
          return res.status(400).json({ message: 'importType must be expense, income, or both' });
        }

        const { buffer, originalname, mimetype } = req.file;
        const isCSV = mimetype === 'text/csv' || originalname.toLowerCase().endsWith('.csv');
        const isPDF = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');

        let raw;
        if (isCSV) {
          raw = parseCSV(buffer.toString('utf-8'));
        } else if (isPDF) {
          raw = await parsePDF(buffer);
        } else {
          return res.status(400).json({ message: 'Only CSV and PDF files are supported' });
        }

        const normalized     = normalizeTransactions(raw, parsed.data);
        const existingHashes = await loadExistingHashes(req.userId!);
        res.json(detectDuplicates(normalized, existingHashes));
      } catch (err) {
        if (err instanceof Error) return res.status(400).json({ message: err.message });
        throw err;
      }
    }
  );

  app.post('/api/import/confirm', requireAuth, async (req: Request, res: Response) => {
    try {
      const { transactions } = confirmSchema.parse(req.body);
      const userId = req.userId!;
      let expensesAdded = 0;
      let incomeAdded   = 0;

      await db.transaction(async tx => {
        for (const t of transactions) {
          if (t.type === 'expense') {
            await tx.insert(expenses).values({
              userId,
              amount:      t.amount,
              description: t.description,
              category:    t.category,
              date:        t.date,
              source:      'import',
              externalId:  t.hash,
            });
            expensesAdded++;
          } else {
            await tx.insert(income).values({
              userId,
              amount:      t.amount,
              description: t.description,
              source:      'other',
              date:        t.date,
              externalId:  t.hash,
            });
            incomeAdded++;
          }
        }
      });

      res.json({ expensesAdded, incomeAdded });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
}
```

- [ ] **Step 4: Register the import routes in `server/routes.ts`**

Add the import at the top of `server/routes.ts` (after existing imports):

```typescript
import { registerImportRoutes } from './import/router';
```

Add the call inside `registerRoutes`, after `registerAdminRoutes(app, requireAdmin)`:

```typescript
registerImportRoutes(app, requireAuth);
```

- [ ] **Step 5: Run all tests — verify they pass**

```bash
npm test -- tests/import/integration.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/import/router.ts server/routes.ts tests/import/integration.test.ts
git commit -m "feat(import): add parse and confirm API routes"
```

---

## Task 8: Build Import page — Step 1 (upload)

**Files:**
- Create: `client/src/pages/Import.tsx` (partial — step 1 only)

- [ ] **Step 1: Create the Import page with step 1 UI**

Create `client/src/pages/Import.tsx`:

```tsx
import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ImportType = 'expense' | 'income' | 'both';

interface ParsedTransaction {
  date: string;
  amount: number;   // cents, always positive
  description: string;
  type: 'expense' | 'income';
  category: string;
  hash: string;
  isDuplicate: boolean;
}

interface ReviewRow extends ParsedTransaction {
  selected: boolean;
}

const CATEGORIES = [
  'Food', 'Transport', 'Entertainment', 'Shopping', 'Healthcare',
  'Utilities', 'Health', 'Housing', 'Education', 'Other',
];

export default function Import() {
  const [step, setStep]           = useState<1 | 2 | 3>(1);
  const [file, setFile]           = useState<File | null>(null);
  const [importType, setImportType] = useState<ImportType>('both');
  const [rows, setRows]           = useState<ReviewRow[]>([]);
  const [summary, setSummary]     = useState<{ expensesAdded: number; incomeAdded: number } | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const fileInputRef              = useRef<HTMLInputElement>(null);
  const [, navigate]              = useLocation();
  const { toast }                 = useToast();

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const form = new FormData();
      form.append('file', file);
      form.append('importType', importType);
      const res = await fetch('/api/import/parse', { method: 'POST', body: form });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Parse failed'); }
      return res.json() as Promise<ParsedTransaction[]>;
    },
    onSuccess: data => {
      setRows(data.map(t => ({ ...t, selected: !t.isDuplicate })));
      setStep(2);
    },
    onError: (err: Error) => toast({ title: 'Parse failed', description: err.message, variant: 'destructive' }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const selected = rows.filter(r => r.selected);
      if (!selected.length) throw new Error('No transactions selected');
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: selected }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Import failed'); }
      return res.json();
    },
    onSuccess: data => { setSummary(data); setStep(3); },
    onError: (err: Error) => toast({ title: 'Import failed', description: err.message, variant: 'destructive' }),
  });

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.pdf')) {
      toast({ title: 'Unsupported file', description: 'Please upload a CSV or PDF file', variant: 'destructive' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 10 MB', variant: 'destructive' });
      return;
    }
    setFile(f);
  }

  // ── Step 1: Upload ──────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold">Import Bank Statement</h1>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
        >
          <Upload className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            {file ? file.name : 'Drop a CSV or PDF here, or click to browse'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Import transactions as</Label>
          <RadioGroup value={importType} onValueChange={v => setImportType(v as ImportType)} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="r-both" />
              <Label htmlFor="r-both">Let me choose per transaction (debits → expenses, credits → income)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="expense" id="r-exp" />
              <Label htmlFor="r-exp">All as expenses</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="income" id="r-inc" />
              <Label htmlFor="r-inc">All as income</Label>
            </div>
          </RadioGroup>
        </div>

        <Button
          className="w-full"
          disabled={!file || parseMutation.isPending}
          onClick={() => parseMutation.mutate()}
        >
          {parseMutation.isPending ? 'Parsing…' : 'Parse Statement'}
        </Button>
      </div>
    );
  }

  // Steps 2 and 3 are added in the next tasks — render nothing for now
  return null;
}
```

- [ ] **Step 2: Wire the route in App.tsx (step 1 only — add route, skip tab for now)**

In `client/src/App.tsx`:

Add the import at the top with the other page imports:

```tsx
import Import from "@/pages/Import";
```

Add the route inside the `<Switch>` block in the `Router` function, before `<Route component={NotFound} />`:

```tsx
<Route path="/import" component={Import} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Import.tsx client/src/App.tsx
git commit -m "feat(import): add Import page step 1 — file upload"
```

---

## Task 9: Build Import page — Step 2 (review + edit table)

**Files:**
- Modify: `client/src/pages/Import.tsx` (replace the `return null` with step 2 JSX)

- [ ] **Step 1: Replace the `return null` placeholder with the step-2 review table**

In `client/src/pages/Import.tsx`, replace:

```tsx
  // Steps 2 and 3 are added in the next tasks — render nothing for now
  return null;
```

with:

```tsx
  // ── Step 2: Review & Edit ────────────────────────────────────────────────
  if (step === 2) {
    const selected = rows.filter(r => r.selected);
    const dupSkipped = rows.filter(r => r.isDuplicate && !r.selected).length;
    const expCount   = selected.filter(r => r.type === 'expense').length;
    const incCount   = selected.filter(r => r.type === 'income').length;

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold">Review Transactions</h1>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{expCount} expense{expCount !== 1 ? 's' : ''}</Badge>
          <Badge variant="outline">{incCount} income</Badge>
          {dupSkipped > 0 && (
            <Badge variant="secondary" className="text-amber-600">
              {dupSkipped} duplicate{dupSkipped !== 1 ? 's' : ''} skipped
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left w-8">
                  <Checkbox
                    checked={rows.length > 0 && rows.every(r => r.selected)}
                    onCheckedChange={v => setRows(prev => prev.map(r => ({ ...r, selected: !!v })))}
                  />
                </th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.hash}-${i}`}
                  className={`border-t ${row.isDuplicate ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                >
                  <td className="p-2">
                    <Checkbox checked={row.selected} onCheckedChange={v => updateRow(i, { selected: !!v })} />
                  </td>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={row.date}
                      onChange={e => updateRow(i, { date: e.target.value })}
                      className="h-7 w-32 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {row.isDuplicate && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" title="Possible duplicate" />
                      )}
                      <Input
                        value={row.description}
                        onChange={e => updateRow(i, { description: e.target.value })}
                        className="h-7 text-xs min-w-[160px]"
                      />
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(row.amount / 100).toFixed(2)}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) updateRow(i, { amount: Math.round(v * 100) });
                      }}
                      className="h-7 w-24 text-xs text-right"
                    />
                  </td>
                  <td className="p-2">
                    <Select value={row.type} onValueChange={v => updateRow(i, { type: v as 'expense' | 'income' })}>
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Select value={row.category} onValueChange={v => updateRow(i, { category: v })}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button
          className="w-full"
          disabled={selected.length === 0 || confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
        >
          {confirmMutation.isPending
            ? 'Importing…'
            : `Import ${selected.length} transaction${selected.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    );
  }

  // Step 3 added in next task
  return null;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Import.tsx
git commit -m "feat(import): add Import page step 2 — review and edit table"
```

---

## Task 10: Build Import page — Step 3 (summary) + wire nav

**Files:**
- Modify: `client/src/pages/Import.tsx` (replace final `return null` with step-3 JSX)
- Modify: `client/src/App.tsx` (add Upload icon + TabBar entry)

- [ ] **Step 1: Replace the final `return null` with the step-3 summary**

In `client/src/pages/Import.tsx`, replace:

```tsx
  // Step 3 added in next task
  return null;
```

with:

```tsx
  // ── Step 3: Summary ──────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 text-center">
      <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
      <h1 className="text-xl font-bold">Import complete</h1>
      {summary && (
        <div className="flex justify-center gap-3 flex-wrap">
          {summary.expensesAdded > 0 && (
            <Badge variant="outline">{summary.expensesAdded} expense{summary.expensesAdded !== 1 ? 's' : ''} added</Badge>
          )}
          {summary.incomeAdded > 0 && (
            <Badge variant="outline">{summary.incomeAdded} income record{summary.incomeAdded !== 1 ? 's' : ''} added</Badge>
          )}
        </div>
      )}
      <div className="flex gap-3 justify-center flex-wrap">
        {summary?.expensesAdded ? (
          <Button variant="outline" onClick={() => navigate('/')}>View Expenses</Button>
        ) : null}
        {summary?.incomeAdded ? (
          <Button variant="outline" onClick={() => navigate('/income')}>View Income</Button>
        ) : null}
        <Button onClick={() => { setStep(1); setFile(null); setRows([]); setSummary(null); }}>
          Import Another
        </Button>
      </div>
    </div>
  );
```

- [ ] **Step 2: Add the Import tab to the TabBar in App.tsx**

In `client/src/App.tsx`, add `Upload` to the existing lucide-react import line:

```tsx
import { LayoutDashboard, History as HistoryIcon, TrendingUp, RefreshCw, Wallet, LogOut, Users, Settings, KeyRound, Upload } from "lucide-react";
```

Add the Import entry to the `tabs` array in `TabBar`, after the History entry and before the admin conditional:

```tsx
{ href: "/import", label: "Import", icon: Upload },
```

- [ ] **Step 3: Run TypeScript check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Import.tsx client/src/App.tsx
git commit -m "feat(import): complete Import wizard — step 3 summary and nav tab"
```

---

## Done

All 10 tasks implemented and tested. The feature adds:
- `server/import/` — 5 focused modules (parseCSV, parsePDF, normalizeTransactions, detectDuplicates, router)
- `shared/import.ts` — shared types
- `client/src/pages/Import.tsx` — 3-step wizard (upload → review/edit → summary)
- `client/src/App.tsx` — new `/import` route + Upload tab in TabBar
- `tests/import/` — unit tests for all pure modules + integration tests for both API routes
