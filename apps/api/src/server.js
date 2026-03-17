const { cfg, missingRequiredForRuntime } = require("./config/env");
const { createApp } = require("./app");
const { logInfo } = require("./utils/logger");

const app = createApp();
const missingVars = missingRequiredForRuntime();

if (missingVars.length > 0) {
  logInfo("runtime_env_missing", { missingVars });
}

app.listen(cfg.port, cfg.appHost, () => {
  logInfo("server_started", {
    host: cfg.appHost,
    port: cfg.port,
    env: cfg.nodeEnv,
  });
});
