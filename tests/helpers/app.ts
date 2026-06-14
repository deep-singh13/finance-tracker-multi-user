import express from "express";
import session from "express-session";
import { registerRoutes } from "../../server/routes";
import { createServer } from "http";

export async function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    name: "sid",
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}
