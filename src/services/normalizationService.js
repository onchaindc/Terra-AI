function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTextList(values = []) {
  if (!Array.isArray(values)) return [];

  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function normalizeCurrency(currency) {
  if (!currency) return null;
  return String(currency).trim().toUpperCase();
}

function normalizeCondition(condition) {
  if (!condition) return null;

  const value = String(condition).trim().toLowerCase();

  const map = {
    new: "new",
    brand_new: "new",
    excellent: "excellent",
    great: "excellent",
    very_good: "excellent",
    good: "good",
    fair: "fair",
    average: "fair",
    needs_work: "needs_work",
    needswork: "needs_work",
    renovation: "needs_work",
    fixer_upper: "fixer_upper",
    fixerupper: "fixer_upper"
  };

  return map[value] || value;
}

function isProbablyUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function estimateDataCoverage(property) {
  const importantFields = [
    property.price,
    property.bedrooms,
    property.bathrooms,
    property.sizeSqm,
    property.location || property.address || property.neighborhood,
    property.condition,
    property.schoolScore,
    property.safetyScore,
    property.amenityScore,
    property.investmentPotentialScore || property.rentalYieldPercent
  ];

  const present = importantFields.filter(
    (value) => value !== null && value !== undefined && value !== ""
  ).length;

  return present / importantFields.length;
}

const defaultPriorityProfiles = {
  primary_home: {
    price: 0.2,
    location: 0.22,
    investmentPotential: 0.06,
    livingQuality: 0.22,
    size: 0.14,
    condition: 0.1,
    hiddenCosts: 0.06
  },
  rental_investment: {
    price: 0.22,
    location: 0.18,
    investmentPotential: 0.28,
    livingQuality: 0.05,
    size: 0.05,
    condition: 0.08,
    hiddenCosts: 0.14
  },
  flip: {
    price: 0.24,
    location: 0.1,
    investmentPotential: 0.24,
    livingQuality: 0.04,
    size: 0.04,
    condition: 0.18,
    hiddenCosts: 0.16
  },
  vacation_home: {
    price: 0.16,
    location: 0.28,
    investmentPotential: 0.05,
    livingQuality: 0.22,
    size: 0.12,
    condition: 0.07,
    hiddenCosts: 0.1
  },
  mixed: {
    price: 0.2,
    location: 0.2,
    investmentPotential: 0.15,
    livingQuality: 0.15,
    size: 0.1,
    condition: 0.1,
    hiddenCosts: 0.1
  }
};

function normalizeWeights(rawWeights, purpose) {
  const base = {
    ...(defaultPriorityProfiles[purpose] || defaultPriorityProfiles.mixed),
    ...(rawWeights || {})
  };

  const cleaned = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
  );

  const total = Object.values(cleaned).reduce((sum, value) => sum + value, 0);

  if (!total) {
    return defaultPriorityProfiles.mixed;
  }

  return Object.fromEntries(
    Object.entries(cleaned).map(([key, value]) => [
      key,
      Number((value / total).toFixed(4))
    ])
  );
}

function normalizePreferences(input = {}) {
  const purpose = input.purpose || "mixed";
  const currency = normalizeCurrency(input.currency) || process.env.DEFAULT_CURRENCY || "USD";

  return {
    budget: toNumber(input.budget),
    currency,
    mustHaves: normalizeTextList(input.mustHaves),
    dealBreakers: normalizeTextList(input.dealBreakers),
    minBedrooms: toNumber(input.minBedrooms),
    minBathrooms: toNumber(input.minBathrooms),
    minSizeSqm: toNumber(input.minSizeSqm),
    maxCommuteMinutes: toNumber(input.maxCommuteMinutes),
    purpose,
    outputFormat: input.outputFormat || "both",
    priorities: normalizeWeights(input.priorities, purpose)
  };
}

function normalizeProperty(input, index, preferences) {
  const source =
    typeof input === "string"
      ? { rawInput: input.trim() }
      : { ...input };

  const rawInput = typeof input === "string" ? input.trim() : null;
  const features = normalizeTextList(source.features);

  const property = {
    id: source.id || `property_${index + 1}`,
    name:
      source.name?.trim() ||
      source.address?.trim() ||
      source.url?.trim() ||
      `Property ${index + 1}`,
    address:
      source.address?.trim() ||
      (rawInput && !isProbablyUrl(rawInput) ? rawInput : null),
    url: source.url || (rawInput && isProbablyUrl(rawInput) ? rawInput : null),
    rawInput,
    currency: normalizeCurrency(source.currency) || preferences.currency,
    price: toNumber(source.price),
    bedrooms: toNumber(source.bedrooms),
    bathrooms: toNumber(source.bathrooms),
    sizeSqm: toNumber(source.sizeSqm),
    location: source.location?.trim() || null,
    neighborhood: source.neighborhood?.trim() || null,
    propertyType: source.propertyType?.trim() || null,
    condition: normalizeCondition(source.condition),
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
    features,
    notes: source.notes?.trim() || null
  };

  property.pricePerSqm =
    property.price && property.sizeSqm
      ? Number((property.price / property.sizeSqm).toFixed(2))
      : null;

  property.dataCoverage = Number(estimateDataCoverage(property).toFixed(2));

  return property;
}

function normalizeRequest(payload) {
  const preferences = normalizePreferences(payload.userPreferences || {});
  const properties = payload.properties.map((property, index) =>
    normalizeProperty(property, index, preferences)
  );

  return {
    preferences,
    properties
  };
}

module.exports = {
  normalizeRequest
};