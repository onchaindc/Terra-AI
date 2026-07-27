const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildHiddenCostsReport
} = require("../src/services/toolsService");

test("decodes object-like property strings produced by the payment client", () => {
  const result = buildHiddenCostsReport({
    property:
      "{name:Kaduna Property,address:Kaduna, Nigeria,price:10000000,currency:NGN,condition:good,estimatedHoaMonthly:0,notes:Annual property tax and expected repair or maintenance costs are unknown.}"
  });

  assert.equal(result.property.name, "Kaduna Property");
  assert.equal(result.property.address, "Kaduna, Nigeria");
  assert.equal(result.property.price, 10000000);
  assert.equal(result.property.currency, "NGN");
  assert.equal(result.property.condition, "good");
  assert.equal(typeof result.hiddenCosts.totalFirstYear, "number");
  assert.match(result.summary.headline, /^Estimated first-year hidden costs are NGN /);
});

test("decodes valid JSON property strings without changing normal object handling", () => {
  const result = buildHiddenCostsReport({
    property: JSON.stringify({
      name: "Kaduna Property",
      address: "Kaduna, Nigeria",
      price: 10000000,
      currency: "NGN",
      condition: "good"
    })
  });

  assert.equal(result.property.price, 10000000);
  assert.equal(result.property.currency, "NGN");
  assert.equal(result.property.condition, "good");
});

test("keeps ordinary listing text as a string input", () => {
  const listing = "Three-bedroom home in Kaduna, Nigeria";
  const result = buildHiddenCostsReport({ property: listing });

  assert.equal(result.property.address, listing);
  assert.equal(result.property.price, null);
  assert.equal(result.property.currency, "USD");
  assert.equal(result.hiddenCosts.totalFirstYear, null);
});
