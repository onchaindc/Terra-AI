const express = require("express");

const validateCompareRequest = require("../middleware/validateRequest");
const { compareProperties } = require("../services/compareService");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    service: process.env.TERRA_SERVICE_NAME || "Terra Compare",
    method: "POST",
    endpoint: "/api/v1/compare",
    supports: {
      propertiesPerRequest: "2 to 5",
      paymentProtocol: "OKX x402 v2 on X Layer",
      output: ["json", "markdown"]
    },
    notes: [
      "This MVP accepts rich property objects or plain strings/links.",
      "Richer property details produce much better recommendations.",
      "Production requests are verified and settled through the OKX x402 middleware."
    ]
  });
});

router.post("/", validateCompareRequest, (req, res, next) => {
  try {
    const report = compareProperties(req.validatedBody, req.payment);

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
