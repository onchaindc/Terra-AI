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
  return (process.env.X402_MODE || "demo").trim().toLowerCase();
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
  const price = process.env.X402_PRICE || "$0.01";
  const payTo = process.env.X402_PAY_TO_ADDRESS;
  const accepts = {
    scheme: "exact",
    network,
    payTo,
    price,
    maxTimeoutSeconds: Number(process.env.X402_MAX_TIMEOUT_SECONDS) || 60
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
      "GET /": {
        accepts,
        description: "Terra Compare property comparison report",
        mimeType: "application/json"
      },
      "POST /": {
        accepts,
        description: "Terra Compare property comparison report",
        mimeType: "application/json"
      },
      "GET /hidden-costs": {
        accepts,
        description: "Terra Hidden Costs first-year property cost estimate",
        mimeType: "application/json"
      },
      "POST /hidden-costs": {
        accepts,
        description: "Terra Hidden Costs first-year property cost estimate",
        mimeType: "application/json"
      },
      "GET /investment-check": {
        accepts,
        description: "Terra Investment Check property investment score",
        mimeType: "application/json"
      },
      "POST /investment-check": {
        accepts,
        description: "Terra Investment Check property investment score",
        mimeType: "application/json"
      },
      "GET /buyer-fit": {
        accepts,
        description: "Terra Buyer Fit property preference score",
        mimeType: "application/json"
      },
      "POST /buyer-fit": {
        accepts,
        description: "Terra Buyer Fit property preference score",
        mimeType: "application/json"
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
    price: mode === "okx" ? process.env.X402_PRICE || "$0.01" : null
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
