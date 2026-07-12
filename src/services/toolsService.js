const { estimateHiddenCosts } = require("./hiddenCostService");
const { scoreAndRankProperties } = require("./scoringService");

const DEFAULT_PRIORITIES = {
  price: 0.25,
  location: 0.2,
  investmentPotential: 0.15,
  livingQuality: 0.15,
  size: 0.1,
  condition: 0.05,
  hiddenCosts: 0.1
};

const PURPOSE_PRIORITIES = {
  primary_home: {
    price: 0.25,
    location: 0.25,
    livingQuality: 0.25,
    investmentPotential: 0.06,
    size: 0.08,
    condition: 0.05,
    hiddenCosts: 0.06
  },
  rental_investment: {
    price: 0.18,
    location: 0.18,
    investmentPotential: 0.28,
    livingQuality: 0.08,
    size: 0.1,
    condition: 0.04,
    hiddenCosts: 0.14
  }
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePriorityWeights(priorities, purpose = "mixed") {
  const source = priorities || PURPOSE_PRIORITIES[purpose] || DEFAULT_PRIORITIES;
  const numeric = Object.fromEntries(
    Object.entries({ ...DEFAULT_PRIORITIES, ...source }).map(([key, value]) => [
      key,
      Number(value) > 1 ? Number(value) / 100 : Number(value)
    ])
  );
  const total = Object.values(numeric).reduce((sum, value) => sum + value, 0);

  if (!total) return DEFAULT_PRIORITIES;

  return Object.fromEntries(
    Object.entries(numeric).map(([key, value]) => [key, value / total])
  );
}

function normalizePreferences(input = {}, fallbackPurpose = "mixed") {
  const purpose = input.purpose || fallbackPurpose;

  return {
    budget: toNumber(input.budget),
    currency: input.currency || "USD",
    mustHaves: Array.isArray(input.mustHaves) ? input.mustHaves : [],
    dealBreakers: Array.isArray(input.dealBreakers) ? input.dealBreakers : [],
    minBedrooms: toNumber(input.minBedrooms),
    minBathrooms: toNumber(input.minBathrooms),
    minSizeSqm: toNumber(input.minSizeSqm),
    maxCommuteMinutes: toNumber(input.maxCommuteMinutes),
    purpose,
    priorities: normalizePriorityWeights(input.priorities, purpose),
    outputFormat: input.outputFormat || "json"
  };
}

function normalizeProperty(input, preferences = {}, id = "property_1") {
  if (typeof input === "string") {
    return {
      id,
      name: input.slice(0, 80) || "Property",
      rawInput: input,
      address: input,
      currency: preferences.currency || "USD",
      features: [],
      dataCoverage: 0.2,
      price: null,
      pricePerSqm: null
    };
  }

  const source = input || {};
  const price = toNumber(source.price);
  const sizeSqm = toNumber(source.sizeSqm);
  const signalFields = [
    source.address,
    source.url,
    price,
    source.bedrooms,
    source.bathrooms,
    sizeSqm,
    source.condition,
    source.estimatedHoaMonthly,
    source.annualPropertyTax,
    source.schoolScore,
    source.safetyScore,
    source.amenityScore,
    source.locationScore,
    source.rentalYieldPercent,
    source.appreciationScore,
    source.livingQualityScore,
    source.investmentPotentialScore,
    source.features,
    source.notes
  ];
  const coverage =
    signalFields.filter((value) =>
      Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ""
    ).length / signalFields.length;

  return {
    ...source,
    id: source.id || id,
    name: source.name || source.address || `Property ${id.replace("property_", "")}`,
    price,
    currency: source.currency || preferences.currency || "USD",
    bedrooms: toNumber(source.bedrooms),
    bathrooms: toNumber(source.bathrooms),
    sizeSqm,
    estimatedHoaMonthly: toNumber(source.estimatedHoaMonthly),
    annualPropertyTax: toNumber(source.annualPropertyTax),
    schoolScore: toNumber(source.schoolScore),
    safetyScore: toNumber(source.safetyScore),
    amenityScore: toNumber(source.amenityScore),
    locationScore: toNumber(source.locationScore),
    commuteMinutes: toNumber(source.commuteMinutes),
    rentalYieldPercent: toNumber(source.rentalYieldPercent),
    appreciationScore: toNumber(source.appreciationScore),
    livingQualityScore: toNumber(source.livingQualityScore),
    investmentPotentialScore: toNumber(source.investmentPotentialScore),
    features: Array.isArray(source.features) ? source.features : [],
    dataCoverage: Number(Math.max(coverage, 0.15).toFixed(2)),
    pricePerSqm: price && sizeSqm ? Number((price / sizeSqm).toFixed(2)) : null
  };
}

function paymentSummary(payment) {
  if (!payment) return null;

  return {
    protocol: payment.protocol,
    mode: payment.mode,
    status: payment.status,
    accepted: payment.accepted,
    verified: payment.verified,
    network: payment.network || null,
    price: payment.price || null
  };
}

function buildHiddenCostsReport(payload, payment) {
  const preferences = normalizePreferences(payload.userPreferences || payload.preferences);
  const property = normalizeProperty(payload.property || payload, preferences);
  const hiddenCosts = estimateHiddenCosts(property);

  return {
    generatedAt: new Date().toISOString(),
    service: "Terra Hidden Costs",
    version: "1.0.0",
    payment: paymentSummary(payment),
    property: {
      id: property.id,
      name: property.name,
      address: property.address || null,
      price: property.price,
      currency: property.currency,
      condition: property.condition || "unknown",
      dataCoverage: property.dataCoverage
    },
    hiddenCosts,
    summary: {
      totalFirstYear: hiddenCosts.totalFirstYear,
      confidence: hiddenCosts.confidence,
      headline:
        hiddenCosts.totalFirstYear === null
          ? "Price is missing, so hidden costs could not be estimated reliably."
          : `Estimated first-year hidden costs are ${property.currency} ${hiddenCosts.totalFirstYear.toLocaleString("en-US")}.`
    }
  };
}

function scoreSingleProperty(payload, payment, purpose) {
  const preferences = normalizePreferences(
    payload.userPreferences || payload.preferences,
    purpose
  );
  const property = normalizeProperty(payload.property || payload, preferences);
  const propertyWithCosts = {
    ...property,
    hiddenCosts: estimateHiddenCosts(property)
  };
  const [scored] = scoreAndRankProperties([propertyWithCosts], preferences);

  return {
    generatedAt: new Date().toISOString(),
    service:
      purpose === "rental_investment" ? "Terra Investment Check" : "Terra Buyer Fit",
    version: "1.0.0",
    payment: paymentSummary(payment),
    property: {
      id: scored.id,
      name: scored.name,
      address: scored.address || null,
      price: scored.price,
      currency: scored.currency,
      bedrooms: scored.bedrooms,
      bathrooms: scored.bathrooms,
      sizeSqm: scored.sizeSqm,
      condition: scored.condition || "unknown",
      dataCoverage: scored.dataCoverage
    },
    preferencesUsed: preferences,
    score: {
      overall: scored.overallScore,
      grade: scored.grade,
      breakdown: scored.scoreBreakdown,
      weightedContributions: scored.weightedContributions
    },
    hiddenCosts: scored.hiddenCosts,
    matchSummary: scored.matchSummary,
    dealBreakerSummary: scored.dealBreakerSummary,
    pros: scored.pros,
    cons: scored.cons,
    recommendation:
      purpose === "rental_investment"
        ? buildInvestmentRecommendation(scored)
        : buildBuyerFitRecommendation(scored)
  };
}

function buildInvestmentRecommendation(property) {
  const cautionFlags = [
    ...(property.dealBreakerSummary.triggered.length
      ? [`Deal-breakers triggered: ${property.dealBreakerSummary.triggered.join(", ")}.`]
      : []),
    ...(property.dataCoverage < 0.5
      ? ["Input detail is limited, so treat this investment score as provisional."]
      : [])
  ];

  return {
    headline: `${property.name} scores ${property.overallScore}/100 for rental or investment fit.`,
    strongestSignals: [
      `Investment potential: ${property.scoreBreakdown.investmentPotential}/100`,
      `Location: ${property.scoreBreakdown.location}/100`,
      `Hidden-cost profile: ${property.scoreBreakdown.hiddenCosts}/100`
    ],
    cautionFlags
  };
}

function buildBuyerFitRecommendation(property) {
  const cautionFlags = [
    ...property.matchSummary.missing.map((item) => `Missing must-have: ${item}.`),
    ...(property.dealBreakerSummary.triggered.length
      ? [`Deal-breakers triggered: ${property.dealBreakerSummary.triggered.join(", ")}.`]
      : []),
    ...(property.dataCoverage < 0.5
      ? ["Input detail is limited, so this buyer-fit score is provisional."]
      : [])
  ];

  return {
    headline: `${property.name} scores ${property.overallScore}/100 for buyer fit.`,
    fitSummary: {
      matched: property.matchSummary.matched,
      missing: property.matchSummary.missing
    },
    cautionFlags
  };
}

module.exports = {
  buildHiddenCostsReport,
  scoreSingleProperty
};
