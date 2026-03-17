const { cfg } = require("../config/env");

function getHealthPayload() {
  return {
    status: "ok",
    app: "EdeVida API",
    env: cfg.nodeEnv,
    timezone: cfg.appTimezone,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getHealthPayload,
};
