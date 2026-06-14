import { db } from "./db";
import {
  expenses, budgets, investments, subscriptions, income,
  type CreateExpenseRequest, type UpdateExpenseRequest, type ExpenseResponse, type ExpensesListResponse,
  type Budget, type InsertBudget, type Investment, type InsertInvestment,
  type Subscription, type InsertSubscription, type Income, type InsertIncome,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export class DatabaseStorage {
  // ── Expenses ──
  async getExpenses(userId: number): Promise<ExpensesListResponse> {
    return db.select().from(expenses).where(eq(expenses.userId, userId)).orderBy(desc(expenses.date));
  }
  async getExpense(userId: number, id: number): Promise<ExpenseResponse | undefined> {
    const [row] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
    return row;
  }
  async createExpense(userId: number, data: CreateExpenseRequest): Promise<ExpenseResponse> {
    const [row] = await db.insert(expenses).values({ ...data, userId }).returning();
    return row;
  }
  async updateExpense(userId: number, id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse | undefined> {
    const [row] = await db.update(expenses).set(updates).where(and(eq(expenses.id, id), eq(expenses.userId, userId))).returning();
    return row;
  }
  async deleteExpense(userId: number, id: number): Promise<void> {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
  }

  // ── Budgets ──
  async getBudget(userId: number, month: string): Promise<Budget | undefined> {
    const [row] = await db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month)));
    return row;
  }
  async setBudget(userId: number, b: InsertBudget): Promise<Budget> {
    const existing = await this.getBudget(userId, b.month);
    if (existing) {
      const [row] = await db.update(budgets).set({ amount: b.amount }).where(and(eq(budgets.userId, userId), eq(budgets.month, b.month))).returning();
      return row;
    }
    const [row] = await db.insert(budgets).values({ ...b, userId }).returning();
    return row;
  }

  // ── Investments ──
  async getInvestments(userId: number): Promise<Investment[]> {
    return db.select().from(investments).where(eq(investments.userId, userId)).orderBy(desc(investments.createdAt));
  }
  async createInvestment(userId: number, data: InsertInvestment): Promise<Investment> {
    const [row] = await db.insert(investments).values({ ...data, userId }).returning();
    return row;
  }
  async updateInvestment(userId: number, id: number, data: Partial<InsertInvestment>): Promise<Investment | undefined> {
    const [row] = await db.update(investments).set(data).where(and(eq(investments.id, id), eq(investments.userId, userId))).returning();
    return row;
  }
  async deleteInvestment(userId: number, id: number): Promise<void> {
    await db.delete(investments).where(and(eq(investments.id, id), eq(investments.userId, userId)));
  }

  // ── Subscriptions ──
  async getSubscriptions(userId: number): Promise<Subscription[]> {
    return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt));
  }
  async createSubscription(userId: number, data: InsertSubscription): Promise<Subscription> {
    const [row] = await db.insert(subscriptions).values({ ...data, userId }).returning();
    return row;
  }
  async updateSubscription(userId: number, id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [row] = await db.update(subscriptions).set(data).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId))).returning();
    return row;
  }
  async deleteSubscription(userId: number, id: number): Promise<void> {
    await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
  }

  // ── Income ──
  async getIncome(userId: number): Promise<Income[]> {
    return db.select().from(income).where(eq(income.userId, userId)).orderBy(desc(income.date));
  }
  async createIncome(userId: number, data: InsertIncome): Promise<Income> {
    const [row] = await db.insert(income).values({ ...data, userId }).returning();
    return row;
  }
  async updateIncome(userId: number, id: number, data: Partial<InsertIncome>): Promise<Income | undefined> {
    const [row] = await db.update(income).set(data).where(and(eq(income.id, id), eq(income.userId, userId))).returning();
    return row;
  }
  async deleteIncome(userId: number, id: number): Promise<void> {
    await db.delete(income).where(and(eq(income.id, id), eq(income.userId, userId)));
  }

  // ── Admin stats: per-user transaction counts ──
  async transactionCounts(userId: number): Promise<{ expenses: number; income: number }> {
    const exp = await db.select().from(expenses).where(eq(expenses.userId, userId));
    const inc = await db.select().from(income).where(eq(income.userId, userId));
    return { expenses: exp.length, income: inc.length };
  }
}

export const storage = new DatabaseStorage();
