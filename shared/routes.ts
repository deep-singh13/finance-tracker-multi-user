import { z } from 'zod';
import { insertExpenseSchema, expenses } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  expenses: {
    list: {
      method: 'GET' as const,
      path: '/api/expenses' as const,
      responses: {
        200: z.array(z.custom<typeof expenses.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/expenses/:id' as const,
      responses: {
        200: z.custom<typeof expenses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/expenses' as const,
      input: insertExpenseSchema.extend({
        amount: z.coerce.number().positive(),
      }),
      responses: {
        201: z.custom<typeof expenses.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/expenses/:id' as const,
      input: insertExpenseSchema.partial().extend({
        amount: z.coerce.number().positive().optional(),
      }),
      responses: {
        200: z.custom<typeof expenses.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/expenses/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  budgets: {
    get: {
      method: 'GET' as const,
      path: '/api/budgets/:month' as const,
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    set: {
      method: 'POST' as const,
      path: '/api/budgets' as const,
      input: z.object({
        month: z.string(),
        amount: z.coerce.number().positive(),
      }),
      responses: {
        200: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ExpenseInput = z.infer<typeof api.expenses.create.input>;
export type ExpenseResponse = z.infer<typeof api.expenses.create.responses[201]>;
export type ExpenseUpdateInput = z.infer<typeof api.expenses.update.input>;
export type ExpensesListResponse = z.infer<typeof api.expenses.list.responses[200]>;
