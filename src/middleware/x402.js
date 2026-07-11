/**
 * x402 payment middleware STUB for MVP.
 *
 * IMPORTANT:
 * This file is intentionally a stub for now.
 * It isolates payment verification from the rest of the app so you can later
 * replace it with a real x402 verification flow without changing your route
 * handlers or comparison logic.
 *
 * In a real x402 integration, this middleware should:
 * 1. Read the required x402 payment headers / proof.
 * 2. Verify signature, nonce, expiry, and amount.
 * 3. Confirm the payment destination and expected price-per-call.
 * 4. Reject unpaid requests with HTTP 402 Payment Required.
 * 5. Attach verified payment metadata to req.payment.
 */

function x402Middleware(req, res, next) {
  const stubMode = process.env.X402_STUB_MODE !== "false";
  const requireHeader = process.env.X402_REQUIRE_HEADER === "true";
  const headerName = (
    process.env.X402_PAYMENT_HEADER_NAME || "x-terra-payment-proof"
  ).toLowerCase();

  const paymentHeader = req.get(headerName);

  if (!stubMode) {
    return res.status(501).json({
      success: false,
      error: "NotImplemented",
      message:
        "Real x402 verification is not implemented yet. Set X402_STUB_MODE=true for MVP testing or replace this middleware with a real verifier."
    });
  }

  if (requireHeader && !paymentHeader) {
    return res.status(402).json({
      success: false,
      error: "PaymentRequired",
      message: `Missing required payment header: ${headerName}`,
      payment: {
        protocol: "x402",
        status: "stub_rejected",
        accepted: false,
        nextAction:
          `For MVP testing, send the ${headerName} header or disable X402_REQUIRE_HEADER.`
      }
    });
  }

  req.payment = {
    protocol: "x402",
    status: paymentHeader ? "stub_header_received" : "stub_bypassed",
    accepted: true,
    verified: false,
    headerName,
    reference: paymentHeader || null,
    note:
      "This is a stubbed x402 middleware. Replace with real x402 verification before production or hackathon final submission."
  };

  next();
}

module.exports = x402Middleware;