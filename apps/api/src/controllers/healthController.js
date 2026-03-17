const { getHealthPayload } = require("../services/healthService");

function healthController(_req, res) {
  res.json(getHealthPayload());
}

module.exports = {
  healthController,
};
