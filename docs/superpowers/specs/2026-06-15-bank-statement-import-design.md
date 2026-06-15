# Bank Statement Import — Design

**Date:** 2026-06-15
**Status:** Approved (pending implementation)

## Summary

Add a bank statement import feature that lets users upload CSV or PDF statements and auto-populate transactions into their expenses and/or income records, with a full preview-and-edit step before anything is saved.

## Goals

1. Accept CSV and PDF bank statement uploads.
2. Parse transactions using rule-based logic (no external AI APIs).
3. Let the user choose per upload whether to import as expenses, income, or both.
4. Show a full editable preview table before committing — user can edit any field, deselect rows, and see duplicate warnings.
5. Detect probable duplicates via hash and highlight them in the preview (unchecked by default); user makes the final call.

## Non-Goals

- AI/LLM-powered parsing.
- Scanned-image PDF support (text-layer PDFs only).
- Automatic bank format detection that covers every bank — we handle common formats and fail clearly on unknown ones.
- Scheduled/recurring automatic imports.

## Architecture

### New server module: `server/import/`

| File | Responsibility |
|---|---|
| `parseCSV.ts` | Detect header columns (date, description, amount or debit/credit), parse rows into `RawTransaction[]` |
| `parsePDF.ts` | Use `pdf-parse` to extract text, regex-match lines into `RawTransaction[]` |
| `normalizeTransactions.ts` | Convert `RawTransaction[]` → `ParsedTransaction[]`: dates to `YYYY-MM-DD`, amounts to cents (always positive), type inferred from sign |
| `detectDuplicates.ts` | SHA-256 hash of `date\|amount\|description`, checked against existing `externalId` values in `expenses` and `income` tables |

### New API routes (in `server/routes.ts`)

```
POST /api/import/parse
  - multipart/form-data: file (csv or pdf), importType ('expense' | 'income' | 'both')
  - Returns: ParsedTransaction[]  (with isDuplicate flag per row)
  - Errors: 400 if no parseable rows found, file > 10 MB rejected

POST /api/import/confirm
  - Body: confirmed ParsedTransaction[] (after user edits)
  - Transactional: all-or-nothing bulk insert into expenses and/or income
  - Sets source: 'import', externalId: hash on each inserted row
  - Returns: { expensesAdded: number, incomeAdded: number }
```

### ParsedTransaction contract

```ts
interface ParsedTransaction {
  date: string;          // YYYY-MM-DD
  amount: number;        // cents, always positive
  description: string;
  type: 'expense' | 'income';
  category: string;      // best-guess from description keywords, or 'Other'
  hash: string;          // SHA-256 for duplicate detection
  isDuplicate: boolean;  // true if hash already exists in DB
}
```

### Schema changes

None. The existing `source` column on `expenses` (text, already has 'manual' and 'subscription') will get a new value `'import'`. The `externalId` column already exists on both `expenses` and `income` for exactly this purpose.

## Duplicate Detection

On `POST /api/import/parse`, each parsed row is hashed as:

```
SHA-256(`${date}|${amount}|${description.toLowerCase().trim()}`)
```

The server checks this hash against all existing `externalId` values for the user in both `expenses` and `income`. Rows that match are returned with `isDuplicate: true` and are unchecked by default in the preview table. The user can re-check them if they want to import anyway.

Hashes are stored as `externalId` on import so future uploads of the same statement correctly flag the same rows.

## UI — `/import` page

New route added to the sidebar nav alongside Dashboard, Expenses, Income, etc.

### Step 1 — Upload

- Drag-and-drop zone + "Browse files" button (accepts `.csv`, `.pdf`)
- File size limit: 10 MB (enforced client and server side)
- Radio group: **Import as expenses / Import as income / Let me choose per transaction**
- "Parse Statement" button → calls `POST /api/import/parse` → advances to Step 2

### Step 2 — Review & Edit

- Full-width table with columns: ☐ select, Date, Description, Amount, Type, Category
- All fields inline-editable (date picker, text input, amount input, type toggle, category dropdown)
- Duplicate rows highlighted in amber with a "Possible duplicate" badge; unchecked by default
- Summary bar: "X expenses · Y income · Z duplicates skipped"
- "Import Selected" button → calls `POST /api/import/confirm` with only checked rows

### Step 3 — Summary

- "Import complete" confirmation with counts: X expenses added, Y income added
- Quick links to Expenses and Income pages

## Error Handling

| Scenario | Behaviour |
|---|---|
| CSV: no recognizable columns | 400 — "Could not detect column layout. Try exporting as CSV from your bank's transaction history." |
| PDF: no parseable rows (image PDF) | 400 — "No transactions found. This PDF may be a scanned image. Try a text-based PDF or CSV." |
| File > 10 MB | 400 — "File too large. Maximum size is 10 MB." |
| Confirm: any row fails to insert | Full batch rolls back; user sees error and can retry |
| Invalid field values in confirm payload | Field-level validation errors surfaced in the preview table before submission |

## Testing

Following the existing Vitest + Supertest pattern in `tests/`:

- **`tests/import.test.ts`** — integration tests for both API routes: parse a fixture CSV, parse a fixture PDF, confirm inserts, duplicate detection, error cases
- **Unit tests** for `parseCSV`, `parsePDF`, `normalizeTransactions`, `detectDuplicates` using fixture files
- Fixture files stored in `tests/fixtures/` (sample bank CSV + sample text-layer PDF)

## Dependencies

- `pdf-parse` (new, server-only) — PDF text extraction
- `multer` (new) — multipart file upload middleware for Express
- Node built-in `crypto` — SHA-256 hashing (no new dep)
