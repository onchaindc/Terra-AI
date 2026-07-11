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

function getMethodologySummary() {
  return {
    model: "terra-compare-mvp-weighted-scoring",
    description:
      "This MVP uses deterministic normalization, heuristic hidden-cost estimation, and weighted scoring based on user priorities.",
    strengths: [
      "Easy for AI agents to parse",
      "Works without an external LLM",
      "Fast and predictable for pay-per-call usage"
    ],
    caveats: [
      "If the input contains only links or plain addresses, the comparison confidence will be lower.",
      "Hidden-cost estimates are heuristic and should not replace local legal, tax, or inspection advice.",
      "Scores are best used as a decision aid, not a final buying decision."
    ]
  };
}

function buildMarkdownReport(report) {
  const lines = [];

  lines.push(`# Terra Compare Report`);
  lines.push("");
  lines.push(
    `Top recommendation: **${report.recommendation.recommendedPropertyName}** (${report.recommendation.score}/100)`
  );
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  for (const reason of report.recommendation.reasoning) {
    lines.push(`- ${reason}`);
  }

  if (report.recommendation.cautionFlags.length) {
    lines.push("");
    lines.push(`## Cautions`);
    lines.push("");
    for (const caution of report.recommendation.cautionFlags) {
      lines.push(`- ${caution}`);
    }
  }

  lines.push("");
  lines.push(`## Ranking`);
  lines.push("");
  for (const item of report.ranking) {
    lines.push(
      `${item.rank}. **${item.propertyName}** â€” ${item.overallScore}/100 (${item.grade})`
    );
    lines.push(`   - ${item.keyReason}`);
  }

  lines.push("");
  lines.push(`## Property Breakdown`);
  lines.push("");

  for (const property of report.propertyReports) {
    lines.push(`### ${property.rank}. ${property.name}`);
    lines.push("");
    lines.push(`- Overall score: **${property.overallScore}/100**`);
    lines.push(
      `- Price: ${formatCurrency(property.propertySnapshot.price, property.propertySnapshot.currency)}`
    );
    lines.push(
      `- Hidden costs (first year): ${formatCurrency(
        property.hiddenCosts.totalFirstYear,
        property.propertySnapshot.currency
      )}`
    );
    lines.push(`- Condition: ${property.propertySnapshot.condition || "unknown"}`);
    lines.push(
      `- Confidence: ${property.confidence.label} (${property.confidence.dataCoverage})`
    );
    lines.push("");
    lines.push(`Pros:`);
    for (const pro of property.pros) {
      lines.push(`- ${pro}`);
    }
    lines.push("");
    lines.push(`Cons:`);
    for (const con of property.cons) {
      lines.push(`- ${con}`);
    }
    lines.push("");
  }

  lines.push(`## Methodology`);
  lines.push("");
  lines.push(
    `This result uses normalized inputs, hidden-cost heuristics, and weighted scoring based on your stated priorities.`
  );

  return lines.join("\n");
}

module.exports = {
  getMethodologySummary,
  buildMarkdownReport
};