const path = require("path");
const express = require("express");
const morgan = require("morgan");
const { apiRoutes } = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  const webPublicPath = path.resolve(__dirname, "../../web/public");
  const uploadsPath = path.resolve(__dirname, "../../../temp/uploads");

  app.use(morgan("combined"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/web", express.static(webPublicPath));
  app.use("/uploads", express.static(uploadsPath));

  app.get("/", (_req, res) => {
    res.redirect(302, "/painel");
  });

  app.get("/painel", (_req, res) => {
    res.sendFile(path.join(webPublicPath, "index.html"));
  });

  app.use(apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
