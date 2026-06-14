import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { resetDb } from "./helpers/db";
import { makeApp } from "./helpers/app";

let app: any;
beforeEach(async () => { await resetDb(); app = await makeApp(); });

describe("auth", () => {
  it("first register creates an admin and logs in", async () => {
    const res = await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("closes public registration after first user", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const res = await request(app).post("/api/auth/register").send({ username: "bob", password: "secret123" });
    expect(res.status).toBe(403);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const agent = request.agent(app);
    const ok = await agent.post("/api/auth/login").send({ username: "alice", password: "secret123" });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ username: "alice", password: "nope12345" });
    expect(bad.status).toBe(401);
  });

  it("me reports needsBootstrap when no users exist", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.needsBootstrap).toBe(true);
  });

  it("blocks data routes without a session", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const res = await request(app).get("/api/expenses");
    expect(res.status).toBe(401);
  });

  it("lets a logged-in user change their password", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "alice", password: "secret123" });

    // wrong current password is rejected
    const bad = await agent.post("/api/auth/change-password").send({ currentPassword: "wrong1234", newPassword: "newpass123" });
    expect(bad.status).toBe(400);

    // correct current password succeeds
    const ok = await agent.post("/api/auth/change-password").send({ currentPassword: "secret123", newPassword: "newpass123" });
    expect(ok.status).toBe(204);

    // old password no longer works; new one does
    const relog = request.agent(app);
    expect((await relog.post("/api/auth/login").send({ username: "alice", password: "secret123" })).status).toBe(401);
    expect((await relog.post("/api/auth/login").send({ username: "alice", password: "newpass123" })).status).toBe(200);
  });

  it("rejects change-password without a session", async () => {
    await request(app).post("/api/auth/register").send({ username: "alice", password: "secret123" });
    const res = await request(app).post("/api/auth/change-password").send({ currentPassword: "secret123", newPassword: "newpass123" });
    expect(res.status).toBe(401);
  });
});
