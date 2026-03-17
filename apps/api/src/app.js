const express = require("express");
const morgan = require("morgan");
const { apiRoutes } = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.use(morgan("combined"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_req, res) => {
    res.json({
      message: "EdeVida API online",
      docs: "Use /health para verificar disponibilidade",
    });
  });

  app.use(apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
