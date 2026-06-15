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
