import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/db";
import { userStore } from "../server/users";

beforeEach(async () => { await resetDb(); });

describe("userStore", () => {
  it("creates the first user as admin and hashes the password", async () => {
    const u = await userStore.create({ username: "alice", password: "secret123" });
    expect(u.username).toBe("alice");
    expect(u.role).toBe("admin"); // first user
    expect((u as any).passwordHash).not.toBe("secret123");
  });

  it("creates subsequent users as 'user'", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    const bob = await userStore.create({ username: "bob", password: "secret123" });
    expect(bob.role).toBe("user");
  });

  it("verifies passwords", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    expect(await userStore.verify("alice", "secret123")).toBeTruthy();
    expect(await userStore.verify("alice", "wrong")).toBeNull();
  });

  it("rejects duplicate usernames", async () => {
    await userStore.create({ username: "alice", password: "secret123" });
    await expect(userStore.create({ username: "alice", password: "x2345678" }))
      .rejects.toThrow();
  });

  it("counts, lists, and deletes users", async () => {
    const a = await userStore.create({ username: "alice", password: "secret123" });
    await userStore.create({ username: "bob", password: "secret123" });
    expect(await userStore.count()).toBe(2);
    const list = await userStore.list();
    expect(list.map(u => u.username).sort()).toEqual(["alice", "bob"]);
    await userStore.remove(a.id);
    expect(await userStore.count()).toBe(1);
  });
});
