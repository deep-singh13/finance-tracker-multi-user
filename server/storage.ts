import { db } from "./db";
import {
  expenses,
  budgets,
  gmailSync,
  investments,
  subscriptions,
  income,
  type CreateExpenseRequest,
  type UpdateExpenseRequest,
  type ExpenseResponse,
  type ExpensesListResponse,
  type Budget,
  type InsertBudget,
  type GmailSync,
  type Investment,
  type InsertInvestment,
  type Subscription,
  type InsertSubscription,
  type Income,
  type InsertIncome,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getExpenses(): Promise<ExpensesListResponse>;
  getExpense(id: number): Promise<ExpenseResponse | undefined>;
  createExpense(expense: CreateExpenseRequest): Promise<ExpenseResponse>;
  updateExpense(id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse>;
  deleteExpense(id: number): Promise<void>;
  getBudget(month: string): Promise<Budget | undefined>;
  setBudget(budget: InsertBudget): Promise<Budget>;
  getGmailSync(): Promise<GmailSync | undefined>;
  upsertGmailSync(data: Partial<GmailSync>): Promise<GmailSync>;
  expenseExistsByExternalId(externalId: string): Promise<boolean>;
  incomeExistsByExternalId(externalId: string): Promise<boolean>;
  // Investments
  getInvestments(): Promise<Investment[]>;
  createInvestment(data: InsertInvestment): Promise<Investment>;
  updateInvestment(id: number, data: Partial<InsertInvestment>): Promise<Investment>;
  deleteInvestment(id: number): Promise<void>;
  // Subscriptions
  getSubscriptions(): Promise<Subscription[]>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription>;
  deleteSubscription(id: number): Promise<void>;
  // Income
  getIncome(): Promise<Income[]>;
  createIncome(data: InsertIncome): Promise<Income>;
  updateIncome(id: number, data: Partial<InsertIncome>): Promise<Income>;
  deleteIncome(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getExpenses(): Promise<ExpensesListResponse> {
    return await db.select().from(expenses).orderBy(desc(expenses.date));
  }

  async getExpense(id: number): Promise<ExpenseResponse | undefined> {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
    return expense;
  }

  async createExpense(insertExpense: CreateExpenseRequest): Promise<ExpenseResponse> {
    const [expense] = await db.insert(expenses).values(insertExpense).returning();
    return expense;
  }

  async updateExpense(id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse> {
    const [updated] = await db.update(expenses)
      .set(updates)
      .where(eq(expenses.id, id))
      .returning();
    return updated;
  }

  async deleteExpense(id: number): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async getBudget(month: string): Promise<Budget | undefined> {
    const [budget] = await db.select().from(budgets).where(eq(budgets.month, month));
    return budget;
  }

  async setBudget(insertBudget: InsertBudget): Promise<Budget> {
    const [existing] = await db.select().from(budgets).where(eq(budgets.month, insertBudget.month));
    if (existing) {
      const [updated] = await db.update(budgets)
        .set({ amount: insertBudget.amount })
        .where(eq(budgets.month, insertBudget.month))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(budgets).values(insertBudget).returning();
    return inserted;
  }

  async getGmailSync(): Promise<GmailSync | undefined> {
    const [record] = await db.select().from(gmailSync).limit(1);
    return record;
  }

  async upsertGmailSync(data: Partial<GmailSync>): Promise<GmailSync> {
    const [existing] = await db.select().from(gmailSync).limit(1);
    if (existing) {
      const [updated] = await db.update(gmailSync)
        .set(data)
        .where(eq(gmailSync.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(gmailSync).values(data as any).returning();
    return inserted;
  }

  async expenseExistsByExternalId(externalId: string): Promise<boolean> {
    const [found] = await db.select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.externalId, externalId))
      .limit(1);
    return !!found;
  }

  async incomeExistsByExternalId(externalId: string): Promise<boolean> {
    const [found] = await db.select({ id: income.id })
      .from(income)
      .where(eq(income.externalId, externalId))
      .limit(1);
    return !!found;
  }

  // ── Investments ────────────────────────────────────────────────────────────

  async getInvestments(): Promise<Investment[]> {
    return await db.select().from(investments).orderBy(desc(investments.createdAt));
  }

  async createInvestment(data: InsertInvestment): Promise<Investment> {
    const [row] = await db.insert(investments).values(data).returning();
    return row;
  }

  async updateInvestment(id: number, data: Partial<InsertInvestment>): Promise<Investment> {
    const [row] = await db.update(investments).set(data).where(eq(investments.id, id)).returning();
    return row;
  }

  async deleteInvestment(id: number): Promise<void> {
    await db.delete(investments).where(eq(investments.id, id));
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getSubscriptions(): Promise<Subscription[]> {
    return await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [row] = await db.insert(subscriptions).values(data).returning();
    return row;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [row] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
    return row;
  }

  async deleteSubscription(id: number): Promise<void> {
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
  }

  // ── Income ─────────────────────────────────────────────────────────────────

  async getIncome(): Promise<Income[]> {
    return await db.select().from(income).orderBy(desc(income.date));
  }

  async createIncome(data: InsertIncome): Promise<Income> {
    const [row] = await db.insert(income).values(data).returning();
    return row;
  }

  async updateIncome(id: number, data: Partial<InsertIncome>): Promise<Income> {
    const [row] = await db.update(income).set(data).where(eq(income.id, id)).returning();
    return row;
  }

  async deleteIncome(id: number): Promise<void> {
    await db.delete(income).where(eq(income.id, id));
  }
}

export const storage = new DatabaseStorage();
