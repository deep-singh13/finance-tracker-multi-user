import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { resetDb } from "./helpers/db";
import { makeApp } from "./helpers/app";

let app: any;
async function admin() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ username: "admin", password: "secret123" });
  return agent;
}
beforeEach(async () => { await resetDb(); app = await makeApp(); });

describe("admin", () => {
  it("lists users with counts", async () => {
    const agent = await admin();
    await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty("expenseCount");
  });

  it("rejects non-admins", async () => {
    const agent = await admin();
    await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const bob = request.agent(app);
    await bob.post("/api/auth/login").send({ username: "bob", password: "secret123" });
    expect((await bob.get("/api/admin/users")).status).toBe(403);
  });

  it("admin creates and deletes a user", async () => {
    const agent = await admin();
    const created = await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    expect(created.status).toBe(201);
    const del = await agent.delete(`/api/admin/users/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("admin cannot delete self", async () => {
    const agent = await admin();
    const list = await agent.get("/api/admin/users");
    const selfId = list.body.find((u: any) => u.username === "admin").id;
    expect((await agent.delete(`/api/admin/users/${selfId}`)).status).toBe(400);
  });

  it("cannot demote the last admin", async () => {
    const agent = await admin();
    const list = await agent.get("/api/admin/users");
    const selfId = list.body.find((u: any) => u.username === "admin").id;
    const res = await agent.put(`/api/admin/users/${selfId}/role`).send({ role: "user" });
    expect(res.status).toBe(400);
  });

  it("admin resets a user's password", async () => {
    const agent = await admin();
    const created = await agent.post("/api/admin/users").send({ username: "bob", password: "secret123" });
    const reset = await agent.put(`/api/admin/users/${created.body.id}/password`).send({ password: "newpass123" });
    expect(reset.status).toBe(204);
    const bob = request.agent(app);
    expect((await bob.post("/api/auth/login").send({ username: "bob", password: "newpass123" })).status).toBe(200);
  });
});
