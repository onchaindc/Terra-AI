const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const compareRoutes = require("./routes/compare");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/", (req, res) => {
    res.json({
      service: process.env.TERRA_SERVICE_NAME || "Terra Compare",
      status: "ok",
      description:
        "A2MCP property comparison service for real estate buyers, renters, and investors.",
      endpoints: {
        health: "/health",
        compare: "/api/v1/compare"
      }
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: process.env.TERRA_SERVICE_NAME || "Terra Compare",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/v1/compare", compareRoutes);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: "Not Found",
      message: `Route ${req.method} ${req.originalUrl} does not exist.`
    });
  });

  app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
      success: false,
      error: error.name || "InternalServerError",
      message: error.message || "Something went wrong.",
      ...(process.env.NODE_ENV !== "production" && error.stack
        ? { stack: error.stack }
        : {})
    });
  });

  return app;
}

module.exports = createApp;