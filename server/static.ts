import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.join(__dirname, "public");

  console.log("Serving static files from:", distPath);

  if (!fs.existsSync(distPath)) {
    console.error("Static build folder not found:", distPath);
    process.exit(1);
  }

  app.use(express.static(distPath));

  // Express 5 compatible SPA fallback (regex version)
  app.use(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}