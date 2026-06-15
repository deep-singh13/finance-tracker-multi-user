import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: vi.fn() }));

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePDF } from '../../server/import/parsePDF';

// Build a mock page from an array of {x, y, str} items
function makePage(items: Array<{ x: number; y: number; str: string }>) {
  return {
    getTextContent: async () => ({
      items: items.map(({ x, y, str }) => ({ str, transform: [1, 0, 0, 1, x, y] })),
    }),
  };
}

function mockDoc(pages: ReturnType<typeof makePage>[]) {
  vi.mocked(getDocument).mockReturnValue({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (n: number) => pages[n - 1],
    }),
  } as any);
}

describe('parsePDF', () => {
  beforeEach(() => vi.mocked(getDocument).mockReset());

  it('extracts a debit transaction (SBI columnar layout)', async () => {
    mockDoc([makePage([
      { x: 27,  y: 297, str: '01/06/2026' },
      { x: 82,  y: 297, str: '01/06/2026' },
      { x: 304, y: 297, str: '-' },
      { x: 360, y: 297, str: '2.00' },
      { x: 446, y: 297, str: '-' },
      { x: 514, y: 297, str: '7,668.54' },
      { x: 138, y: 305, str: 'POS ATM PURCH' },
      { x: 138, y: 295, str: '615219609531AMAZON' },
    ])]);

    const result = await parsePDF(Buffer.from(''));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: '01/06/2026', amount: -2, description: expect.stringContaining('POS ATM PURCH') });
  });

  it('extracts a credit transaction (amount close to balance column)', async () => {
    mockDoc([makePage([
      { x: 27,  y: 235, str: '03/06/2026' },
      { x: 82,  y: 235, str: '03/06/2026' },
      { x: 304, y: 235, str: '-' },
      { x: 366, y: 235, str: '-' },
      { x: 440, y: 235, str: '2.00' },
      { x: 514, y: 235, str: '7,668.54' },
      { x: 138, y: 243, str: 'CEMTEX DEP RREF' },
    ])]);

    const result = await parsePDF(Buffer.from(''));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: '03/06/2026', amount: 2, description: 'CEMTEX DEP RREF' });
  });

  it('handles ISO date format (YYYY-MM-DD) in date column', async () => {
    mockDoc([makePage([
      { x: 27,  y: 300, str: '2026-05-01' },
      { x: 360, y: 300, str: '4.50' },
      { x: 514, y: 300, str: '100.00' },
      { x: 138, y: 308, str: 'Coffee Shop' },
    ])]);

    const result = await parsePDF(Buffer.from(''));
    expect(result[0].date).toBe('2026-05-01');
  });

  it('throws when no transaction lines are found', async () => {
    mockDoc([makePage([
      { x: 50, y: 300, str: 'Statement Header' },
      { x: 50, y: 280, str: 'Page 1 of 1' },
      { x: 50, y: 260, str: 'Account Summary' },
    ])]);

    await expect(parsePDF(Buffer.from(''))).rejects.toThrow(/No transactions found/);
  });

  it('throws a readable error when PDF extraction fails', async () => {
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
    } as any);

    await expect(parsePDF(Buffer.from(''))).rejects.toThrow(/Could not read PDF/);
  });
});
