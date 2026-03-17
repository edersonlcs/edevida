const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(__dirname, "../../../.env"),
});

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.APP_HOST || "127.0.0.1";

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "EdeVida API",
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    message: "EdeVida API online",
    docs: "Use /health para verificar disponibilidade",
  });
});

app.listen(port, host, () => {
  // Log claro para validar endpoint com Cloudflare Tunnel em localhost.
  console.log(`EdeVida API listening on http://${host}:${port}`);
});
