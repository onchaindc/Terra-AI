const { normalizeRequest } = require("./normalizationService");
const {
  estimateHiddenCostsForProperties
} = require("./hiddenCostService");
const { scoreAndRankProperties } = require("./scoringService");
const {
  buildMarkdownReport,
  getMethodologySummary
} = require("../utils/prompts");

function formatCurrency(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toLocaleString("en-US")}`;
  }
}

function formatNumber(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${Number(value).toLocaleString("en-US")}${suffix}`;
}

function confidenceLabel(coverage) {
  if (coverage >= 0.75) return "high";
  if (coverage >= 0.5) return "medium";
  return "low";
}

function buildSideBySide(properties) {
  const columns = properties.map((property) => ({
    id: property.id,
    name: property.name
  }));

  const rows = [
    {
      label: "Price",
      values: Object.fromEntries(
        properties.map((p) => [p.id, formatCurrency(p.price, p.currency)])
      )
    },
    {
      label: "Bedrooms",
      values: Object.fromEntries(
        properties.map((p) => [p.id, formatNumber(p.bedrooms)])
      )
    },
    {
      label: "Bathrooms",
      values: Object.fromEntries(
        properties.map((p) => [p.id, formatNumber(p.bathrooms)])
      )
    },
    {
      label: "Size (sqm)",
      values: Object.fromEntries(
        properties.map((p) => [p.id, formatNumber(p.sizeSqm)])
      )
    },
    {
      label: "Price / sqm",
      values: Object.fromEntries(
        properties.map((p) => [p.id, formatCurrency(p.pricePerSqm, p.currency)])
      )
    },
    {
      label: "Condition",
      values: Object.fromEntries(
        properties.map((p) => [p.id, p.condition || "unknown"])
      )
    },
    {
      label: "Estimated first-year hidden costs",
      values: Object.fromEntries(
        properties.map((p) => [
          p.id,
          formatCurrency(p.hiddenCosts.totalFirstYear, p.currency)
        ])
      )
    },
    {
      label: "Location score",
      values: Object.fromEntries(
        properties.map((p) => [p.id, `${p.scoreBreakdown.location}/100`])
      )
    },
    {
      label: "Living quality score",
      values: Object.fromEntries(
        properties.map((p) => [p.id, `${p.scoreBreakdown.livingQuality}/100`])
      )
    },
    {
      label: "Investment score",
      values: Object.fromEntries(
        properties.map((p) => [
          p.id,
          `${p.scoreBreakdown.investmentPotential}/100`
        ])
      )
    },
    {
      label: "Overall score",
      values: Object.fromEntries(
        properties.map((p) => [p.id, `${p.overallScore}/100`])
      )
    }
  ];

  return { columns, rows };
}

function buildRecommendation(properties, preferences) {
  const [top, second] = properties;

  const primaryReasons = Object.entries(top.weightedContributions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);

  const readableLabels = {
    price: "price fit",
    location: "location strength",
    investmentPotential: "investment upside",
    livingQuality: "living quality",
    size: "space fit",
    condition: "property condition",
    hiddenCosts: "hidden-cost profile"
  };

  const topReasons = primaryReasons.map((key) => readableLabels[key] || key);

  const cautionFlags = [];
  if (top.matchSummary.missing.length) {
    cautionFlags.push(
      `Top property is still missing some must-haves: ${top.matchSummary.missing.join(", ")}`
    );
  }
  if (top.dataCoverage < 0.5) {
    cautionFlags.push(
      "Top property has limited detail, so this recommendation should be treated as provisional."
    );
  }
  if (second && top.overallScore - second.overallScore < 4) {
    cautionFlags.push(
      `This is a close decision. The score gap between #1 and #2 is only ${(top.overallScore - second.overallScore).toFixed(1)} points.`
    );
  }

  return {
    recommendedPropertyId: top.id,
    recommendedPropertyName: top.name,
    score: top.overallScore,
    reasoning: [
      `${top.name} ranks highest overall for your stated goal (${preferences.purpose}).`,
      `Its strongest areas are ${topReasons.join(", ")}.`,
      top.pros[0] || "It offers the best balance of trade-offs in this set."
    ],
    runnerUp: second
      ? {
          propertyId: second.id,
          propertyName: second.name,
          score: second.overallScore,
          whyItAlmostWon: second.pros[0] || "It performed strongly but fell just short overall."
        }
      : null,
    cautionFlags
  };
}

function buildRanking(properties) {
  return properties.map((property) => ({
    rank: property.rank,
    propertyId: property.id,
    propertyName: property.name,
    overallScore: property.overallScore,
    grade: property.grade,
    keyReason: property.pros[0] || "Balanced performance across the weighted criteria."
  }));
}

function buildPropertyReports(properties) {
  return properties.map((property) => ({
    id: property.id,
    name: property.name,
    rank: property.rank,
    grade: property.grade,
    overallScore: property.overallScore,
    propertySnapshot: {
      address: property.address || null,
      url: property.url || null,
      price: property.price,
      currency: property.currency,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sizeSqm: property.sizeSqm,
      location: property.location || null,
      neighborhood: property.neighborhood || null,
      propertyType: property.propertyType || null,
      condition: property.condition || "unknown"
    },
    scoreBreakdown: property.scoreBreakdown,
    weightedContributions: property.weightedContributions,
    pros: property.pros,
    cons: property.cons,
    hiddenCosts: property.hiddenCosts,
    matchSummary: property.matchSummary,
    confidence: {
      dataCoverage: Number(property.dataCoverage.toFixed(2)),
      label: confidenceLabel(property.dataCoverage)
    }
  }));
}

function compareProperties(payload, payment = null) {
  const normalized = normalizeRequest(payload);
  const propertiesWithCosts = estimateHiddenCostsForProperties(
    normalized.properties
  );
  const rankedProperties = scoreAndRankProperties(
    propertiesWithCosts,
    normalized.preferences
  );

  const report = {
    generatedAt: new Date().toISOString(),
    service: process.env.TERRA_SERVICE_NAME || "Terra Compare",
    version: "1.0.0",
    payment: payment
      ? {
          protocol: payment.protocol,
          status: payment.status,
          accepted: payment.accepted,
          verified: payment.verified
        }
      : null,
    summary: {
      totalPropertiesCompared: rankedProperties.length,
      recommendedPropertyId: rankedProperties[0].id,
      recommendedPropertyName: rankedProperties[0].name,
      userGoal: normalized.preferences.purpose,
      recommendationHeadline: `${rankedProperties[0].name} is the strongest overall match based on your priorities and the available data.`
    },
    preferencesUsed: normalized.preferences,
    sideBySide: buildSideBySide(rankedProperties),
    ranking: buildRanking(rankedProperties),
    propertyReports: buildPropertyReports(rankedProperties),
    recommendation: buildRecommendation(
      rankedProperties,
      normalized.preferences
    ),
    methodology: getMethodologySummary()
  };

  report.reportMarkdown = buildMarkdownReport(report);

  return report;
}

module.exports = {
  compareProperties
};