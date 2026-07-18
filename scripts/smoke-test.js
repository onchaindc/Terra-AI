const assert = require("node:assert/strict");

let baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
let server;

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

async function main() {
  if (!baseUrl) {
    const createApp = require("../src/app");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  const health = await request("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);

  const metadata = await request("/api/a2mcp");
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.body.type, "A2MCP");
  assert.ok(metadata.body.pricing);

  const openapi = await request("/api/a2mcp/openapi");
  assert.equal(openapi.response.status, 200);
  assert.equal(openapi.body.openapi, "3.1.0");
  assert.ok(openapi.body.paths["/api/v1/compare"]);

  const cases = [
    {
      path: "/api/v1/compare",
      payload: {
        properties: [
          { name: "Colombo bungalow", price: 68000, bedrooms: 3 },
          { name: "Galle bungalow", price: 70000, bedrooms: 2 }
        ],
        userPreferences: { budget: 70000, purpose: "primary_home" }
      }
    },
    {
      path: "/api/v1/hidden-costs",
      payload: { property: { name: "Colombo bungalow", price: 68000 } }
    },
    {
      path: "/api/v1/investment-check",
      payload: {
        property: {
          name: "Galle bungalow",
          price: 70000,
          rentalYieldPercent: 6
        }
      }
    },
    {
      path: "/api/v1/buyer-fit",
      payload: {
        property: { name: "Colombo bungalow", price: 68000, bedrooms: 3 },
        userPreferences: { budget: 70000, minBedrooms: 2 }
      }
    }
  ];

  for (const testCase of cases) {
    const result = await request(testCase.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testCase.payload)
    });
    if (metadata.body.pricing.mode === "x402") {
      assert.equal(
        result.response.status,
        402,
        `${testCase.path} returned ${result.response.status}: ${JSON.stringify(result.body)}`
      );

      const encodedChallenge = result.response.headers.get("payment-required");
      assert.ok(encodedChallenge, `${testCase.path} did not return PAYMENT-REQUIRED`);

      const challenge = JSON.parse(
        Buffer.from(encodedChallenge, "base64").toString("utf8")
      );
      assert.equal(challenge.x402Version, 2);
      assert.equal(challenge.resource.url, `${baseUrl}${testCase.path}`);
      assert.equal(challenge.accepts[0].scheme, "exact");
      assert.equal(challenge.accepts[0].network, "eip155:196");
      assert.equal(challenge.accepts[0].amount, "500000");
      assert.equal(challenge.accepts[0].maxTimeoutSeconds, 300);
      assert.deepEqual(result.body, challenge);
    } else {
      assert.equal(
        result.response.status,
        200,
        `${testCase.path} returned ${result.response.status}: ${JSON.stringify(result.body)}`
      );
      assert.equal(result.body.success, true);
      assert.ok(result.body.data);
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      baseUrl,
      metadata: "/api/a2mcp",
      openapi: "/api/a2mcp/openapi",
      pricing: metadata.body.pricing,
      testedServices: cases.map((testCase) => testCase.path)
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) {
      server.closeAllConnections();
      server.close();
    }
  });
