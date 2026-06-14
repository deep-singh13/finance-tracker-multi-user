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
});
