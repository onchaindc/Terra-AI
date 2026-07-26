const { OKXFacilitatorClient } = require("@okxweb3/x402-core");
const {
  paymentMiddleware,
  x402ResourceServer
} = require("@okxweb3/x402-express");
const { ExactEvmScheme } = require("@okxweb3/x402-evm/exact/server");

const requiredOkxEnv = [
  "OKX_API_KEY",
  "OKX_SECRET_KEY",
  "OKX_PASSPHRASE",
  "X402_PAY_TO_ADDRESS"
];

function readMode() {
  const fallbackMode =
    process.env.NODE_ENV === "production" ? "okx" : "off";
  return (process.env.X402_MODE || fallbackMode).trim().toLowerCase();
}

function hasOkxConfig() {
  return requiredOkxEnv.every((key) => Boolean(process.env[key]));
}

function facilitatorTimeoutMs() {
  const configured = Number(process.env.X402_FACILITATOR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 15000;
}

function withTimeout(operation, label) {
  const timeoutMs = facilitatorTimeoutMs();
  let timeoutId;

  return Promise.race([
    operation(),
    new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(
          `OKX x402 facilitator ${label} timed out after ${timeoutMs}ms.`
        );
        error.name = "FacilitatorTimeoutError";
        error.statusCode = 504;
        reject(error);
      }, timeoutMs);
    })
  ]).finally(() => clearTimeout(timeoutId));
}

function addFacilitatorTimeouts(client) {
  return {
    getSupported: () =>
      withTimeout(() => client.getSupported(), "capability check"),
    verify: (payload, requirements) =>
      withTimeout(() => client.verify(payload, requirements), "verification"),
    settle: (payload, requirements) =>
      withTimeout(() => client.settle(payload, requirements), "settlement"),
    getSettleStatus: (transactionHash) =>
      withTimeout(
        () => client.getSettleStatus(transactionHash),
        "settlement status check"
      )
  };
}

function buildDemoPayment(req) {
  const headerName = (
    process.env.X402_PAYMENT_HEADER_NAME || "x-terra-payment-proof"
  ).toLowerCase();
  const paymentHeader = req.get(headerName);

  return {
    protocol: "x402",
    mode: "demo",
    status: paymentHeader ? "demo_header_received" : "demo_bypassed",
    accepted: true,
    verified: false,
    headerName,
    reference: paymentHeader || null,
    note:
      "Demo mode does not verify or settle payment. Set X402_MODE=okx with OKX credentials to enforce real x402 payment."
  };
}

const propertyExample = {
  name: "Maple Court",
  price: 120000,
  currency: "USD",
  sizeSqm: 95,
  location: "Lagos"
};

const userPreferencesExample = {
  purpose: "primary_home",
  currency: "USD"
};

const propertySchema = {
  oneOf: [
    {
      type: "string",
      minLength: 3,
      description: "Property listing text, address, or URL."
    },
    {
      type: "object",
      additionalProperties: true,
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        url: { type: "string", format: "uri" },
        price: { type: "number", exclusiveMinimum: 0 },
        currency: { type: "string" },
        bedrooms: { type: "number", minimum: 0 },
        bathrooms: { type: "number", minimum: 0 },
        sizeSqm: { type: "number", exclusiveMinimum: 0 },
        location: { type: "string" },
        condition: { type: "string" },
        rentalYieldPercent: { type: "number", minimum: 0 },
        features: { type: "array", items: { type: "string" } },
        notes: { type: "string" }
      }
    }
  ]
};

const preferencesSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    budget: { type: "number", exclusiveMinimum: 0 },
    currency: { type: "string" },
    purpose: {
      type: "string",
      enum: [
        "primary_home",
        "rental_investment",
        "flip",
        "vacation_home",
        "mixed"
      ]
    },
    mustHaves: { type: "array", items: { type: "string" } },
    dealBreakers: { type: "array", items: { type: "string" } }
  }
};

function buildOutputSchema(bodySchema, outputExample) {
  return {
    method: "POST",
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: bodySchema
    },
    output: {
      type: "json",
      example: outputExample
    }
  };
}

function discoveryExtension(body, bodySchema, outputExample) {
  const input = {
    type: "http",
    method: "POST",
    bodyType: "json",
    body
  };
  const output = {
    type: "json",
    example: outputExample
  };

  const outputSchema = buildOutputSchema(bodySchema, outputExample);

  return {
    outputSchema,
    bazaar: {
      info: { input, output },
      outputSchema,
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", const: "POST" },
              bodyType: { type: "string", const: "json" },
              body: bodySchema
            },
            required: ["type", "method", "bodyType", "body"]
          },
          output: {
            type: "object",
            properties: {
              type: { type: "string", const: "json" },
              example: { type: "object" }
            },
            required: ["type", "example"]
          }
        },
        required: ["input", "output"]
      }
    }
  };
}

function acceptsWithOutputSchema(accepts, bodySchema, outputExample) {
  return {
    ...accepts,
    extra: {
      ...(accepts.extra || {}),
      outputSchema: buildOutputSchema(bodySchema, outputExample)
    }
  };
}

function inputRequiredBody(description, bodySchema, example, outputExample) {
  return {
    contentType: "application/json",
    body: {
      success: false,
      error: "PaymentRequired",
      message: description,
      required: bodySchema.required || [],
      inputSchema: bodySchema,
      outputSchema: buildOutputSchema(bodySchema, outputExample),
      example
    }
  };
}

const compareBodySchema = {
  type: "object",
  properties: {
    properties: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: propertySchema
    },
    userPreferences: preferencesSchema
  },
  required: ["properties"]
};

const singlePropertyBodySchema = {
  type: "object",
  properties: {
    property: propertySchema,
    userPreferences: preferencesSchema
  },
  required: ["property"]
};

const compareExample = {
  properties: [
    propertyExample,
    {
      ...propertyExample,
      name: "Riverside Flat",
      price: 135000,
      sizeSqm: 110,
      location: "Abuja"
    }
  ],
  userPreferences: userPreferencesExample
};

const singlePropertyExample = {
  property: propertyExample,
  userPreferences: userPreferencesExample
};

const compareOutputExample = {
  success: true,
  data: {
    ranking: [],
    recommendation: {}
  }
};

const hiddenCostsOutputExample = {
  success: true,
  data: { totalFirstYearCosts: 0 }
};

const investmentCheckOutputExample = {
  success: true,
  data: { overallScore: 0 }
};

const buyerFitOutputExample = {
  success: true,
  data: { overallScore: 0 }
};

function demoMiddleware(req, res, next) {
  const requireHeader = process.env.X402_REQUIRE_HEADER === "true";
  const payment = buildDemoPayment(req);

  if (requireHeader && !payment.reference) {
    return res.status(402).json({
      success: false,
      error: "PaymentRequired",
      message: `Missing required demo payment header: ${payment.headerName}`,
      payment: {
        protocol: payment.protocol,
        mode: payment.mode,
        status: "demo_rejected",
        accepted: false,
        verified: false
      }
    });
  }

  req.payment = payment;
  next();
}

function missingConfigMiddleware(req, res) {
  res.status(503).json({
    success: false,
    error: "PaymentConfigurationError",
    message:
      "X402_MODE=okx is enabled, but required OKX x402 environment variables are missing.",
    requiredEnv: requiredOkxEnv
  });
}

function buildOkxRuntime() {
  const network = process.env.X402_NETWORK || "eip155:196";
  const price = process.env.X402_PRICE || "$0.50";
  const payTo = process.env.X402_PAY_TO_ADDRESS;
  const accepts = {
    scheme: "exact",
    network,
    payTo,
    price,
    maxTimeoutSeconds: Number(process.env.X402_MAX_TIMEOUT_SECONDS) || 300
  };

  const facilitatorClient = addFacilitatorTimeouts(
    new OKXFacilitatorClient({
      apiKey: process.env.OKX_API_KEY,
      secretKey: process.env.OKX_SECRET_KEY,
      passphrase: process.env.OKX_PASSPHRASE,
      baseUrl: process.env.OKX_BASE_URL || "https://www.okx.com",
      syncSettle: process.env.X402_SYNC_SETTLE === "true"
    })
  );

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    "eip155:*",
    new ExactEvmScheme()
  );

  const middleware = paymentMiddleware(
    {
      "GET /api/v1/compare": {
        accepts,
        description: "Terra Compare property comparison report",
        mimeType: "application/json"
      },
      "POST /api/v1/compare": {
        accepts: acceptsWithOutputSchema(
          accepts,
          compareBodySchema,
          compareOutputExample
        ),
        description: "Terra Compare property comparison report",
        mimeType: "application/json",
        extensions: discoveryExtension(
          compareExample,
          compareBodySchema,
          compareOutputExample
        ),
        unpaidResponseBody: () =>
          inputRequiredBody(
            "Payment is required. The paid request body must include two to five properties.",
            compareBodySchema,
            compareExample,
            compareOutputExample
          )
      },
      "GET /api/v1/hidden-costs": {
        accepts,
        description: "Terra Hidden Costs first-year property cost estimate",
        mimeType: "application/json"
      },
      "POST /api/v1/hidden-costs": {
        accepts: acceptsWithOutputSchema(
          accepts,
          singlePropertyBodySchema,
          hiddenCostsOutputExample
        ),
        description: "Terra Hidden Costs first-year property cost estimate",
        mimeType: "application/json",
        extensions: discoveryExtension(
          singlePropertyExample,
          singlePropertyBodySchema,
          hiddenCostsOutputExample
        ),
        unpaidResponseBody: () =>
          inputRequiredBody(
            "Payment is required. The paid request body must include a property.",
            singlePropertyBodySchema,
            singlePropertyExample,
            hiddenCostsOutputExample
          )
      },
      "GET /api/v1/investment-check": {
        accepts,
        description: "Terra Investment Check property investment score",
        mimeType: "application/json"
      },
      "POST /api/v1/investment-check": {
        accepts: acceptsWithOutputSchema(
          accepts,
          singlePropertyBodySchema,
          investmentCheckOutputExample
        ),
        description: "Terra Investment Check property investment score",
        mimeType: "application/json",
        extensions: discoveryExtension(
          singlePropertyExample,
          singlePropertyBodySchema,
          investmentCheckOutputExample
        ),
        unpaidResponseBody: () =>
          inputRequiredBody(
            "Payment is required. The paid request body must include a property.",
            singlePropertyBodySchema,
            singlePropertyExample,
            investmentCheckOutputExample
          )
      },
      "GET /api/v1/buyer-fit": {
        accepts,
        description: "Terra Buyer Fit property preference score",
        mimeType: "application/json"
      },
      "POST /api/v1/buyer-fit": {
        accepts: acceptsWithOutputSchema(
          accepts,
          singlePropertyBodySchema,
          buyerFitOutputExample
        ),
        description: "Terra Buyer Fit property preference score",
        mimeType: "application/json",
        extensions: discoveryExtension(
          singlePropertyExample,
          singlePropertyBodySchema,
          buyerFitOutputExample
        ),
        unpaidResponseBody: () =>
          inputRequiredBody(
            "Payment is required. The paid request body must include a property.",
            singlePropertyBodySchema,
            singlePropertyExample,
            buyerFitOutputExample
          )
      }
    },
    resourceServer,
    undefined,
    undefined,
    false
  );

  return {
    middleware: async (req, res, next) => {
      req.payment = {
        protocol: "x402",
        mode: "okx",
        status: "verification_required",
        accepted: false,
        verified: false,
        network,
        price
      };

      await middleware(req, res, (error) => {
        if (error) return next(error);

        req.payment = {
          protocol: "x402",
          mode: "okx",
          status: "verified",
          accepted: true,
          verified: true,
          network,
          price
        };

        next();
      });
    },
    resourceServer,
    network,
    price
  };
}

let okxRuntime = null;

async function initializeX402() {
  const mode = readMode();

  if (mode !== "okx") {
    return;
  }

  if (!hasOkxConfig()) {
    throw new Error(
      "X402_MODE=okx is enabled, but required OKX x402 environment variables are missing."
    );
  }

  if (!okxRuntime) {
    okxRuntime = buildOkxRuntime();
  }

  if (!okxRuntime.initialization) {
    okxRuntime.initialization = okxRuntime.resourceServer
      .initialize()
      .then(() => {
        okxRuntime.ready = true;
      })
      .catch((error) => {
        okxRuntime.initialization = null;
        okxRuntime.ready = false;
        throw error;
      });
  }

  await okxRuntime.initialization;
}

function getX402Status() {
  const mode = readMode();

  return {
    mode,
    configured: mode !== "okx" || hasOkxConfig(),
    ready: mode !== "okx" || Boolean(okxRuntime?.ready),
    network: mode === "okx" ? process.env.X402_NETWORK || "eip155:196" : null,
    price: mode === "okx" ? process.env.X402_PRICE || "$0.50" : null
  };
}

async function x402Middleware(req, res, next) {
  const mode = readMode();

  if (mode === "off") {
    req.payment = {
      protocol: "none",
      mode: "off",
      status: "disabled",
      accepted: true,
      verified: false
    };
    return next();
  }

  if (mode === "demo") {
    return demoMiddleware(req, res, next);
  }

  if (mode === "okx") {
    if (!hasOkxConfig()) {
      return missingConfigMiddleware(req, res);
    }

    try {
      await initializeX402();
    } catch (error) {
      return next(error);
    }

    return okxRuntime.middleware(req, res, next);
  }

  return res.status(500).json({
    success: false,
    error: "InvalidPaymentMode",
    message: `Unsupported X402_MODE: ${mode}. Use demo, okx, or off.`
  });
}

x402Middleware.initializeX402 = initializeX402;
x402Middleware.getX402Status = getX402Status;

module.exports = x402Middleware;
