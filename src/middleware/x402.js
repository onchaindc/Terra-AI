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

function buildOkxMiddleware() {
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

  const facilitatorClient = new OKXFacilitatorClient({
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_PASSPHRASE,
    baseUrl: process.env.OKX_BASE_URL || "https://www.okx.com",
    syncSettle: process.env.X402_SYNC_SETTLE === "true"
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    "eip155:*",
    new ExactEvmScheme()
  );

  const middleware = paymentMiddleware(
    {
      "POST /": {
        accepts,
        description: "Terra Compare property comparison report",
        mimeType: "application/json"
      },
      "POST /hidden-costs": {
        accepts,
        description: "Terra Hidden Costs first-year property cost estimate",
        mimeType: "application/json"
      },
      "POST /investment-check": {
        accepts,
        description: "Terra Investment Check property investment score",
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
    process.env.X402_SYNC_FACILITATOR_ON_START !== "false"
  );

  return async (req, res, next) => {
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
  };
}

let okxMiddleware = null;

function x402Middleware(req, res, next) {
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

    if (!okxMiddleware) {
      okxMiddleware = buildOkxMiddleware();
    }

    return okxMiddleware(req, res, next);
  }

  return res.status(500).json({
    success: false,
    error: "InvalidPaymentMode",
    message: `Unsupported X402_MODE: ${mode}. Use demo, okx, or off.`
  });
}

module.exports = x402Middleware;
