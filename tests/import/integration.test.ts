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
