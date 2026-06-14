import { pgTable, text, serial, timestamp, date, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  date: date("date").notNull(),
  source: text("source").default("manual").notNull(), // 'manual' | 'subscription'
  externalId: text("external_id"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("expenses_user_idx").on(t.userId) }));

export const income = pgTable("income", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull().default("other"),
  date: date("date").notNull(),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("income_user_idx").on(t.userId) }));

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  amount: integer("amount").notNull(),
}, (t) => ({ userMonth: uniqueIndex("budgets_user_month_idx").on(t.userId, t.month) }));

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  startDate: date("start_date"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("investments_user_idx").on(t.userId) }));

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  billingDay: integer("billing_day").default(1).notNull(),
  category: text("category").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastBilledMonth: text("last_billed_month"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({ userIdx: index("subscriptions_user_idx").on(t.userId) }));

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, userId: true }).extend({
  tags: z.array(z.string()).optional().nullable(),
});
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, userId: true });
export const insertInvestmentSchema = createInsertSchema(investments).omit({ id: true, createdAt: true, userId: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, userId: true });
export const insertIncomeSchema = createInsertSchema(income).omit({ id: true, createdAt: true, userId: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Income = typeof income.$inferSelect;
export type InsertIncome = z.infer<typeof insertIncomeSchema>;

export type CreateExpenseRequest = InsertExpense;
export type UpdateExpenseRequest = Partial<InsertExpense>;
export type ExpenseResponse = Expense;
export type ExpensesListResponse = Expense[];
