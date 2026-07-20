const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const x402Middleware = require("./middleware/x402");

const compareRoutes = require("./routes/compare");
const toolRoutes = require("./routes/tools");

const productionUrl =
  process.env.TERRA_SERVICE_URL || "https://terra-ai.up.railway.app";

function paymentMetadata() {
  const fallbackMode =
    process.env.NODE_ENV === "production" ? "okx" : "off";
  const mode = (process.env.X402_MODE || fallbackMode).trim().toLowerCase();
  const configuredPrice = process.env.X402_PRICE || "$0.50";
  const feeText = configuredPrice.replace(/^\$/, "");
  const feeNumber = Number(feeText);
  const fee = Number.isFinite(feeNumber) ? feeNumber.toFixed(2) : feeText;

  if (mode === "okx") {
    return {
      mode: "x402",
      fee: `${fee} USDT`,
      network: process.env.X402_NETWORK || "eip155:196",
      unpaidResponse: "HTTP 402 Payment Required",
      paidResponse: "HTTP 200 JSON"
    };
  }

  return {
    mode,
    fee: "0 USDT",
    unpaidResponse: "HTTP 200 JSON"
  };
}

function serviceMetadata() {
  const pricing = paymentMetadata();

  return {
    service: "terra-ai",
    version: "1.1.0",
    type: "A2MCP",
    description:
      "AI property decision service for comparisons, hidden-cost estimates, investment checks, and buyer-fit analysis.",
    pricing,
    endpoints: {
      compare: { method: "POST", path: "/api/v1/compare" },
      hiddenCosts: { method: "POST", path: "/api/v1/hidden-costs" },
      investmentCheck: { method: "POST", path: "/api/v1/investment-check" },
      buyerFit: { method: "POST", path: "/api/v1/buyer-fit" },
      health: { method: "GET", path: "/health" },
      openapi: { method: "GET", path: "/api/a2mcp/openapi" }
    },
    inputMode: "structured_json",
    responseMode:
      pricing.mode === "x402"
        ? "HTTP 402 challenge before payment; HTTP 200 JSON after payment"
        : "HTTP 200 JSON"
  };
}

function openApiDocument() {
  const property = {
    type: "object",
    additionalProperties: true,
    properties: {
      name: { type: "string" },
      address: { type: "string" },
      url: { type: "string", format: "uri" },
      price: { type: "number" },
      currency: { type: "string", default: "USD" },
      bedrooms: { type: "number" },
      bathrooms: { type: "number" },
      sizeSqm: { type: "number" },
      condition: { type: "string" },
      rentalYieldPercent: { type: "number" },
      features: { type: "array", items: { type: "string" } },
      notes: { type: "string" }
    }
  };
  const preferences = {
    type: "object",
    additionalProperties: true,
    properties: {
      budget: { type: "number" },
      currency: { type: "string", default: "USD" },
      purpose: { type: "string" },
      mustHaves: { type: "array", items: { type: "string" } },
      dealBreakers: { type: "array", items: { type: "string" } }
    }
  };
  const jsonRequest = (schema) => ({
    required: true,
    content: { "application/json": { schema } }
  });
  const responses = {
    200: {
      description: "Structured Terra AI analysis after successful payment."
    },
    400: { description: "Structured validation error." },
    402: {
      description:
        "Payment required. The base64-encoded x402 v2 challenge is returned in the PAYMENT-REQUIRED response header; the response body may be empty.",
      headers: {
        "PAYMENT-REQUIRED": {
          description:
            "Base64-encoded x402 v2 payment challenge containing the accepted network, asset, amount, and pay-to address.",
          schema: { type: "string" }
        }
      }
    }
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Terra AI A2MCP API",
      version: "1.1.0",
      description: "Agent-consumable property decision services."
    },
    servers: [{ url: productionUrl }],
    paths: {
      "/api/a2mcp": {
        get: {
          summary: "A2MCP service metadata",
          responses: { 200: { description: "Terra AI metadata." } }
        }
      },
      "/api/v1/compare": {
        post: {
          summary: "Compare two to five properties",
          requestBody: jsonRequest({
            type: "object",
            required: ["properties"],
            properties: {
              properties: {
                type: "array",
                minItems: 2,
                maxItems: 5,
                items: { oneOf: [{ type: "string" }, property] }
              },
              userPreferences: preferences
            }
          }),
          responses
        }
      },
      "/api/v1/hidden-costs": {
        post: {
          summary: "Estimate first-year hidden costs",
          requestBody: jsonRequest({
            type: "object",
            required: ["property"],
            properties: { property, userPreferences: preferences }
          }),
          responses
        }
      },
      "/api/v1/investment-check": {
        post: {
          summary: "Score investment suitability",
          requestBody: jsonRequest({
            type: "object",
            required: ["property"],
            properties: { property, userPreferences: preferences }
          }),
          responses
        }
      },
      "/api/v1/buyer-fit": {
        post: {
          summary: "Score buyer fit",
          requestBody: jsonRequest({
            type: "object",
            required: ["property"],
            properties: { property, userPreferences: preferences }
          }),
          responses
        }
      },
      "/health": {
        get: {
          summary: "Runtime health",
          responses: { 200: { description: "Service is ready." } }
        }
      }
    }
  };
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Railway terminates TLS before forwarding requests to Express. Trust its
  // first proxy hop so payment challenges bind to the public HTTPS URL.
  app.set("trust proxy", 1);
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
        compare: "/api/v1/compare",
        hiddenCosts: "/api/v1/hidden-costs",
        investmentCheck: "/api/v1/investment-check",
        buyerFit: "/api/v1/buyer-fit"
      }
    });
  });

  app.get("/api/a2mcp", (req, res) => {
    res.set("Cache-Control", "no-store").json(serviceMetadata());
  });

  app.get("/api/a2mcp/openapi", (req, res) => {
    res.set("Cache-Control", "no-store").json(openApiDocument());
  });

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: process.env.TERRA_SERVICE_NAME || "Terra Compare",
      environment: process.env.NODE_ENV || "development",
      payment: x402Middleware.getX402Status(),
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/v1/compare", compareRoutes);
  app.use("/api/v1", toolRoutes);

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
