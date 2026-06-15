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
