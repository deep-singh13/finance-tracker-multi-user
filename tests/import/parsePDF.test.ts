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
    vi.mocked(pdfParse).mockRejectedValueOnce(new Error('Invalid PDF'));
    await expect(parsePDF(Buffer.from(''))).rejects.toThrow(/Could not read PDF/);
  });
});
