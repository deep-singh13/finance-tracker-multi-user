import { eq } from 'drizzle-orm';
import type { ParsedTransaction } from '@shared/import';

// Pure function — testable without DB
export function detectDuplicates(
  transactions: Omit<ParsedTransaction, 'isDuplicate'>[],
  existingHashes: Set<string>,
): ParsedTransaction[] {
  return transactions.map(t => ({ ...t, isDuplicate: existingHashes.has(t.hash) }));
}

// DB-dependent — covered by integration tests.
// Uses dynamic import so the module can be loaded in unit tests without
// triggering the DATABASE_URL check in server/db.ts.
export async function loadExistingHashes(userId: number): Promise<Set<string>> {
  const { db } = await import('../db');
  const { expenses, income } = await import('@shared/schema');
  const [expRows, incRows] = await Promise.all([
    db.select({ externalId: expenses.externalId }).from(expenses).where(eq(expenses.userId, userId)),
    db.select({ externalId: income.externalId }).from(income).where(eq(income.userId, userId)),
  ]);
  return new Set([
    ...expRows.map(r => r.externalId).filter((x): x is string => x != null),
    ...incRows.map(r => r.externalId).filter((x): x is string => x != null),
  ]);
}
