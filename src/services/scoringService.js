function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function average(values, fallback = 60) {
  const filtered = values.filter(
    (value) => value !== null && value !== undefined && !Number.isNaN(value)
  );

  if (!filtered.length) return fallback;

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function scoreToGrade(score) {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  return "E";
}

function buildStats(properties) {
  const prices = properties.map((p) => p.price).filter(Boolean);
  const sizes = properties.map((p) => p.sizeSqm).filter(Boolean);
  const hiddenCosts = properties
    .map((p) => p.hiddenCosts?.totalFirstYear)
    .filter(Boolean);

  return {
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    priceRange:
      prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0,
    minSize: sizes.length ? Math.min(...sizes) : null,
    maxSize: sizes.length ? Math.max(...sizes) : null,
    sizeRange:
      sizes.length > 1 ? Math.max(...sizes) - Math.min(...sizes) : 0,
    minHiddenCost: hiddenCosts.length ? Math.min(...hiddenCosts) : null,
    maxHiddenCost: hiddenCosts.length ? Math.max(...hiddenCosts) : null,
    hiddenCostRange:
      hiddenCosts.length > 1
        ? Math.max(...hiddenCosts) - Math.min(...hiddenCosts)
        : 0
  };
}

function scorePrice(property, preferences, stats) {
  if (!property.price) return 55;

  const budget = preferences.budget;
  let budgetScore = 70;

  if (budget) {
    if (property.price <= budget) {
      budgetScore = 100;
    } else {
      const overBudgetRatio = (property.price - budget) / budget;
      budgetScore = clamp(100 - overBudgetRatio * 180, 15, 100);
    }
  }

  let peerScore = 70;
  if (stats.priceRange > 0) {
    peerScore =
      45 + ((stats.maxPrice - property.price) / stats.priceRange) * 55;
  }

  const firstYearCostPressure =
    preferences.budget && property.hiddenCosts?.totalFirstYear
      ? clamp(
          100 - (property.hiddenCosts.totalFirstYear / preferences.budget) * 25,
          40,
          100
        )
      : 70;

  return round(average([budgetScore, peerScore, firstYearCostPressure]));
}

function scoreLocation(property, preferences) {
  const explicitLocationScore =
    property.locationScore !== null && property.locationScore !== undefined
      ? property.locationScore * 10
      : null;

  const signalScore =
    average(
      [property.schoolScore, property.safetyScore, property.amenityScore]
        .filter((value) => value !== null && value !== undefined)
        .map((value) => value * 10),
      60
    );

  let score = explicitLocationScore ?? signalScore ?? 60;

  if (
    preferences.maxCommuteMinutes &&
    property.commuteMinutes !== null &&
    property.commuteMinutes !== undefined
  ) {
    if (property.commuteMinutes <= preferences.maxCommuteMinutes) {
      score += 10;
    } else {
      const excess =
        (property.commuteMinutes - preferences.maxCommuteMinutes) /
        preferences.maxCommuteMinutes;
      score -= Math.min(30, excess * 40);
    }
  }

  return round(clamp(score));
}

function scoreSize(property, preferences, stats) {
  let score = 60;

  if (property.sizeSqm && stats.sizeRange > 0) {
    score = 45 + ((property.sizeSqm - stats.minSize) / stats.sizeRange) * 35;
  }

  if (preferences.minSizeSqm) {
    if (!property.sizeSqm) {
      score -= 10;
    } else if (property.sizeSqm >= preferences.minSizeSqm) {
      score += 20;
    } else {
      const deficit =
        (preferences.minSizeSqm - property.sizeSqm) / preferences.minSizeSqm;
      score -= Math.min(35, deficit * 50);
    }
  }

  if (preferences.minBedrooms) {
    if (!property.bedrooms) {
      score -= 8;
    } else if (property.bedrooms >= preferences.minBedrooms) {
      score += 10;
    } else {
      score -= 18;
    }
  }

  if (preferences.minBathrooms) {
    if (!property.bathrooms) {
      score -= 6;
    } else if (property.bathrooms >= preferences.minBathrooms) {
      score += 8;
    } else {
      score -= 14;
    }
  }

  return round(clamp(score));
}

function scoreCondition(property) {
  const conditionScores = {
    new: 95,
    excellent: 88,
    good: 76,
    fair: 58,
    needs_work: 40,
    fixer_upper: 25
  };

  return round(conditionScores[property.condition] || 60);
}

function scoreInvestmentPotential(property) {
  if (
    property.investmentPotentialScore !== null &&
    property.investmentPotentialScore !== undefined
  ) {
    return round(clamp(property.investmentPotentialScore * 10));
  }

  const rentalYieldScore =
    property.rentalYieldPercent !== null &&
    property.rentalYieldPercent !== undefined
      ? clamp((property.rentalYieldPercent / 10) * 100)
      : null;

  const appreciationScore =
    property.appreciationScore !== null &&
    property.appreciationScore !== undefined
      ? property.appreciationScore * 10
      : null;

  const locationProxy =
    property.locationScore !== null && property.locationScore !== undefined
      ? property.locationScore * 10
      : average(
          [property.schoolScore, property.safetyScore, property.amenityScore]
            .filter((value) => value !== null && value !== undefined)
            .map((value) => value * 10),
          60
        );

  return round(average([rentalYieldScore, appreciationScore, locationProxy], 60));
}

function scoreLivingQuality(property) {
  if (
    property.livingQualityScore !== null &&
    property.livingQualityScore !== undefined
  ) {
    return round(clamp(property.livingQualityScore * 10));
  }

  const signals = [];

  if (property.schoolScore !== null && property.schoolScore !== undefined) {
    signals.push(property.schoolScore * 10);
  }
  if (property.safetyScore !== null && property.safetyScore !== undefined) {
    signals.push(property.safetyScore * 10);
  }
  if (property.amenityScore !== null && property.amenityScore !== undefined) {
    signals.push(property.amenityScore * 10);
  }
  if (property.bedrooms !== null && property.bedrooms !== undefined) {
    signals.push(clamp(45 + property.bedrooms * 12));
  }
  if (property.bathrooms !== null && property.bathrooms !== undefined) {
    signals.push(clamp(45 + property.bathrooms * 14));
  }

  return round(average(signals, 60));
}

function scoreHiddenCosts(property, stats) {
  const totalHidden = property.hiddenCosts?.totalFirstYear;

  if (!totalHidden) return 55;
  if (!stats.hiddenCostRange) return 75;

  const score =
    45 +
    ((stats.maxHiddenCost - totalHidden) / stats.hiddenCostRange) * 55;

  return round(clamp(score));
}

function matchesMustHave(property, term) {
  const normalizedTerm = term.toLowerCase().trim();
  const haystack = [
    property.name,
    property.address,
    property.location,
    property.neighborhood,
    property.propertyType,
    property.notes,
    ...(property.features || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const bedroomMatch = normalizedTerm.match(/(\d+)\s*bed/);
  if (bedroomMatch && property.bedrooms !== null && property.bedrooms !== undefined) {
    return property.bedrooms >= Number(bedroomMatch[1]);
  }

  const bathroomMatch = normalizedTerm.match(/(\d+)\s*bath/);
  if (bathroomMatch && property.bathrooms !== null && property.bathrooms !== undefined) {
    return property.bathrooms >= Number(bathroomMatch[1]);
  }

  if (normalizedTerm.includes("parking")) {
    return haystack.includes("parking") || haystack.includes("garage");
  }

  return haystack.includes(normalizedTerm);
}

function evaluateMustHaveFit(property, preferences) {
  const checks = [];

  for (const item of preferences.mustHaves || []) {
    checks.push({
      label: item,
      matched: matchesMustHave(property, item)
    });
  }

  if (preferences.minBedrooms !== null && preferences.minBedrooms !== undefined) {
    checks.push({
      label: `at least ${preferences.minBedrooms} bedrooms`,
      matched:
        property.bedrooms !== null &&
        property.bedrooms !== undefined &&
        property.bedrooms >= preferences.minBedrooms
    });
  }

  if (preferences.minBathrooms !== null && preferences.minBathrooms !== undefined) {
    checks.push({
      label: `at least ${preferences.minBathrooms} bathrooms`,
      matched:
        property.bathrooms !== null &&
        property.bathrooms !== undefined &&
        property.bathrooms >= preferences.minBathrooms
    });
  }

  if (preferences.minSizeSqm !== null && preferences.minSizeSqm !== undefined) {
    checks.push({
      label: `at least ${preferences.minSizeSqm} sqm`,
      matched:
        property.sizeSqm !== null &&
        property.sizeSqm !== undefined &&
        property.sizeSqm >= preferences.minSizeSqm
    });
  }

  if (
    preferences.maxCommuteMinutes !== null &&
    preferences.maxCommuteMinutes !== undefined
  ) {
    checks.push({
      label: `commute within ${preferences.maxCommuteMinutes} minutes`,
      matched:
        property.commuteMinutes !== null &&
        property.commuteMinutes !== undefined &&
        property.commuteMinutes <= preferences.maxCommuteMinutes
    });
  }

  if (!checks.length) {
    return {
      score: 75,
      matched: [],
      missing: []
    };
  }

  const matched = checks.filter((check) => check.matched).map((check) => check.label);
  const missing = checks.filter((check) => !check.matched).map((check) => check.label);

  return {
    score: round((matched.length / checks.length) * 100),
    matched,
    missing
  };
}

function evaluateDealBreakers(property, preferences) {
  const triggered = [];
  const haystack = [
    property.name,
    property.address,
    property.location,
    property.neighborhood,
    property.propertyType,
    property.notes,
    ...(property.features || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const item of preferences.dealBreakers || []) {
    if (haystack.includes(item.toLowerCase().trim())) {
      triggered.push(item);
    }
  }

  const penalty = triggered.length * 10;

  return { triggered, penalty };
}

function generateProsAndCons(property, preferences, topScores) {
  const pros = [];
  const cons = [];

  if (preferences.budget && property.price && property.price <= preferences.budget) {
    pros.push("Within your stated budget.");
  } else if (preferences.budget && property.price && property.price > preferences.budget) {
    cons.push("Above your stated budget.");
  }

  if (property.scoreBreakdown.location >= topScores.location - 2) {
    pros.push("Strong location profile versus the other options.");
  }
  if (property.scoreBreakdown.livingQuality >= topScores.livingQuality - 2) {
    pros.push("Good everyday living quality signals.");
  }
  if (property.scoreBreakdown.investmentPotential >= topScores.investmentPotential - 2) {
    pros.push("Solid investment potential for the current comparison set.");
  }
  if (property.scoreBreakdown.hiddenCosts >= topScores.hiddenCosts - 2) {
    pros.push("Lower hidden-cost burden than most alternatives.");
  }
  if (property.scoreBreakdown.condition >= 80) {
    pros.push("Property condition suggests lower near-term repair risk.");
  }

  if (property.matchSummary.missing.length) {
    cons.push(
      `Missing some stated must-haves: ${property.matchSummary.missing.join(", ")}.`
    );
  }
  if (property.scoreBreakdown.hiddenCosts < 55) {
    cons.push("Estimated hidden costs are relatively high.");
  }
  if (property.scoreBreakdown.condition < 55) {
    cons.push("Condition risk suggests likely repair or renovation spend.");
  }
  if (property.dataCoverage < 0.5) {
    cons.push("Limited input detail reduces confidence in this recommendation.");
  }

  if (!pros.length) {
    pros.push("No major red flags in the weighted comparison.");
  }

  if (!cons.length) {
    cons.push("No major downside stood out from the available data.");
  }

  return { pros, cons };
}

function scoreAndRankProperties(properties, preferences) {
  const stats = buildStats(properties);

  const scored = properties.map((property) => {
    const matchSummary = evaluateMustHaveFit(property, preferences);
    const dealBreakerSummary = evaluateDealBreakers(property, preferences);

    const scoreBreakdown = {
      price: scorePrice(property, preferences, stats),
      location: scoreLocation(property, preferences),
      investmentPotential: scoreInvestmentPotential(property),
      livingQuality: scoreLivingQuality(property),
      size: scoreSize(property, preferences, stats),
      condition: scoreCondition(property),
      hiddenCosts: scoreHiddenCosts(property, stats),
      mustHaveFit: matchSummary.score
    };

    const weightedContributions = Object.fromEntries(
      Object.entries(preferences.priorities).map(([key, weight]) => [
        key,
        round((scoreBreakdown[key] || 60) * weight, 2)
      ])
    );

    const weightedBase = Object.values(weightedContributions).reduce(
      (sum, value) => sum + value,
      0
    );

    const mustHaveAdjustment =
      (scoreBreakdown.mustHaveFit - 70) *
      (preferences.mustHaves.length ||
      preferences.minBedrooms ||
      preferences.minBathrooms ||
      preferences.minSizeSqm
        ? 0.15
        : 0);

    const coverageAdjustment = ((property.dataCoverage * 100) - 60) * 0.05;
    const overallScore = round(
      clamp(
        weightedBase + mustHaveAdjustment + coverageAdjustment - dealBreakerSummary.penalty
      )
    );

    return {
      ...property,
      scoreBreakdown,
      weightedContributions,
      matchSummary,
      dealBreakerSummary,
      overallScore,
      grade: scoreToGrade(overallScore)
    };
  });

  const topScores = {
    location: Math.max(...scored.map((p) => p.scoreBreakdown.location)),
    livingQuality: Math.max(...scored.map((p) => p.scoreBreakdown.livingQuality)),
    investmentPotential: Math.max(
      ...scored.map((p) => p.scoreBreakdown.investmentPotential)
    ),
    hiddenCosts: Math.max(...scored.map((p) => p.scoreBreakdown.hiddenCosts))
  };

  const withProsCons = scored.map((property) => {
    const { pros, cons } = generateProsAndCons(property, preferences, topScores);

    return {
      ...property,
      pros,
      cons
    };
  });

  return withProsCons
    .sort((a, b) => {
      if (b.overallScore !== a.overallScore) {
        return b.overallScore - a.overallScore;
      }
      return b.dataCoverage - a.dataCoverage;
    })
    .map((property, index) => ({
      ...property,
      rank: index + 1
    }));
}

module.exports = {
  scoreAndRankProperties
};