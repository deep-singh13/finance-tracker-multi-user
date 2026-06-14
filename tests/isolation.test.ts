import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { userStore } from "../server/users";
import { storage } from "../server/storage";

let alice: number, bob: number;
beforeEach(async () => {
  await resetDb();
  alice = (await userStore.create({ username: "alice", password: "secret123" })).id;
  bob = (await userStore.create({ username: "bob", password: "secret123" })).id;
});

describe("storage isolation", () => {
  it("only returns the owner's expenses", async () => {
    await storage.createExpense(alice, { amount: 100, description: "a", category: "Food", date: "2026-01-01", source: "manual" });
    await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    const aList = await storage.getExpenses(alice);
    expect(aList).toHaveLength(1);
    expect(aList[0].description).toBe("a");
  });

  it("cannot read another user's expense by id", async () => {
    const e = await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    expect(await storage.getExpense(alice, e.id)).toBeUndefined();
  });

  it("cannot update or delete another user's expense", async () => {
    const e = await storage.createExpense(bob, { amount: 200, description: "b", category: "Food", date: "2026-01-01", source: "manual" });
    expect(await storage.updateExpense(alice, e.id, { amount: 1 })).toBeUndefined();
    await storage.deleteExpense(alice, e.id);
    expect(await storage.getExpense(bob, e.id)).toBeDefined(); // still there
  });

  it("scopes budgets per user with same month", async () => {
    await storage.setBudget(alice, { month: "2026-01", amount: 1000 });
    await storage.setBudget(bob, { month: "2026-01", amount: 2000 });
    expect((await storage.getBudget(alice, "2026-01"))!.amount).toBe(1000);
    expect((await storage.getBudget(bob, "2026-01"))!.amount).toBe(2000);
  });
});
