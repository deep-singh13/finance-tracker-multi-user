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
