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
