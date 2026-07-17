const express = require("express");

const x402Middleware = require("../middleware/x402");
const {
  buildHiddenCostsReport,
  scoreSingleProperty
} = require("../services/toolsService");

const router = express.Router();

function sendToolResponse(builder) {
  return (req, res, next) => {
    try {
      res.status(200).json({
        success: true,
        data: builder(req.body || {}, req.payment)
      });
    } catch (error) {
      next(error);
    }
  };
}

router.get("/hidden-costs", x402Middleware, (req, res) => {
  res.json({
    service: "Terra Hidden Costs",
    method: "POST",
    endpoint: "/api/v1/hidden-costs",
    description:
      "Estimate first-year hidden costs for one property using supplied price, condition, taxes, fees, and maintenance signals."
  });
});

router.post(
  "/hidden-costs",
  x402Middleware,
  sendToolResponse(buildHiddenCostsReport)
);

router.get("/investment-check", x402Middleware, (req, res) => {
  res.json({
    service: "Terra Investment Check",
    method: "POST",
    endpoint: "/api/v1/investment-check",
    description:
      "Score one property for rental or investment fit using yield, appreciation, location, condition, and hidden-cost signals."
  });
});

router.post(
  "/investment-check",
  x402Middleware,
  sendToolResponse((payload, payment) =>
    scoreSingleProperty(payload, payment, "rental_investment")
  )
);

router.get("/buyer-fit", x402Middleware, (req, res) => {
  res.json({
    service: "Terra Buyer Fit",
    method: "POST",
    endpoint: "/api/v1/buyer-fit",
    description:
      "Score one property against a buyer's budget, must-haves, deal-breakers, commute, size, and lifestyle priorities."
  });
});

router.post(
  "/buyer-fit",
  x402Middleware,
  sendToolResponse((payload, payment) =>
    scoreSingleProperty(payload, payment, "primary_home")
  )
);

module.exports = router;
