function round(value, decimals = 0) {
  return Number(value.toFixed(decimals));
}

function estimateHiddenCosts(property) {
  const price = property.price;

  if (!price) {
    return {
      confidence: "low",
      assumptions: [
        "Price missing, so hidden-cost estimates could not be calculated reliably."
      ],
      breakdown: {
        closingCosts: null,
        immediateRepairs: null,
        annualPropertyTax: property.annualPropertyTax || null,
        annualInsurance: null,
        annualMaintenance: null,
        hoaAnnual: property.estimatedHoaMonthly
          ? round(property.estimatedHoaMonthly * 12)
          : null
      },
      totalOneTime: null,
      totalAnnual: null,
      totalFirstYear: null
    };
  }

  const conditionRepairRate = {
    new: 0.003,
    excellent: 0.007,
    good: 0.015,
    fair: 0.035,
    needs_work: 0.06,
    fixer_upper: 0.1
  };

  const conditionMaintenanceRate = {
    new: 0.006,
    excellent: 0.008,
    good: 0.01,
    fair: 0.012,
    needs_work: 0.015,
    fixer_upper: 0.018
  };

  const closingCosts = price * 0.03;
  const immediateRepairs =
    price * (conditionRepairRate[property.condition] || 0.02);
  const annualPropertyTax =
    property.annualPropertyTax !== null && property.annualPropertyTax !== undefined
      ? property.annualPropertyTax
      : price * 0.012;
  const annualInsurance = price * 0.0035;
  const annualMaintenance =
    price * (conditionMaintenanceRate[property.condition] || 0.01);
  const hoaAnnual = (property.estimatedHoaMonthly || 0) * 12;

  const totalOneTime = closingCosts + immediateRepairs;
  const totalAnnual =
    annualPropertyTax + annualInsurance + annualMaintenance + hoaAnnual;
  const totalFirstYear = totalOneTime + totalAnnual;

  const assumptions = [
    "Closing costs estimated at 3% of purchase price.",
    property.annualPropertyTax
      ? "Property tax used from provided input."
      : "Property tax estimated at 1.2% of purchase price.",
    "Insurance estimated at 0.35% of purchase price annually.",
    "Maintenance estimated from condition-based annual upkeep assumptions.",
    "Immediate repair reserve estimated from condition risk.",
    property.estimatedHoaMonthly
      ? "HOA annualized from provided monthly amount."
      : "HOA set to zero because no HOA amount was provided."
  ];

  const confidenceScore = [
    property.price ? 1 : 0,
    property.condition ? 1 : 0,
    property.annualPropertyTax ? 1 : 0,
    property.estimatedHoaMonthly ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);

  const confidence =
    confidenceScore >= 3 ? "high" : confidenceScore >= 2 ? "medium" : "low";

  return {
    confidence,
    assumptions,
    breakdown: {
      closingCosts: round(closingCosts),
      immediateRepairs: round(immediateRepairs),
      annualPropertyTax: round(annualPropertyTax),
      annualInsurance: round(annualInsurance),
      annualMaintenance: round(annualMaintenance),
      hoaAnnual: round(hoaAnnual)
    },
    totalOneTime: round(totalOneTime),
    totalAnnual: round(totalAnnual),
    totalFirstYear: round(totalFirstYear)
  };
}

function estimateHiddenCostsForProperties(properties) {
  return properties.map((property) => ({
    ...property,
    hiddenCosts: estimateHiddenCosts(property)
  }));
}

module.exports = {
  estimateHiddenCosts,
  estimateHiddenCostsForProperties
};