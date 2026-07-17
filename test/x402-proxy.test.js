const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  isPaymentRequired
} = require("@okxweb3/x402-core/schemas");

function startFacilitatorStub() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      if (
        request.method === "GET" &&
        request.url === "/api/v6/pay/x402/supported"
      ) {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            data: {
              kinds: [
                {
                  x402Version: 2,
                  scheme: "exact",
                  network: "eip155:196"
                }
              ],
              extensions: [],
              signers: {}
            }
          })
        );
        return;
      }

      response.statusCode = 404;
      response.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function requestChallenge(server, method, path, payload) {
  const address = server.address();
  const body = method === "POST" ? JSON.stringify(payload) : "";

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers: {
          "content-type": "application/json",
          ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
          host: "terra-ai.up.railway.app",
          "x-forwarded-proto": "https"
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );

    request.on("error", reject);
    request.end(body);
  });
}

test("x402 challenges use public HTTPS URLs behind Railway", async (t) => {
  const facilitator = await startFacilitatorStub();
  t.after(() => {
    facilitator.closeAllConnections();
    facilitator.close();
  });

  process.env.X402_MODE = "okx";
  process.env.OKX_API_KEY = "test-api-key";
  process.env.OKX_SECRET_KEY = "test-secret-key";
  process.env.OKX_PASSPHRASE = "test-passphrase";
  process.env.X402_PAY_TO_ADDRESS =
    "0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4";
  process.env.X402_NETWORK = "eip155:196";
  process.env.X402_PRICE = "$0.50";
  process.env.OKX_BASE_URL = `http://127.0.0.1:${facilitator.address().port}`;
  process.env.X402_SYNC_FACILITATOR_ON_START = "true";

  const createApp = require("../src/app");
  const server = createApp().listen(0);
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const cases = [
    {
      path: "/api/v1/compare",
      payload: {
        properties: ["Property A", "Property B"],
        userPreferences: {}
      }
    },
    {
      path: "/api/v1/hidden-costs",
      payload: { property: { name: "Property A", price: 100000 } }
    },
    {
      path: "/api/v1/investment-check",
      payload: { property: { name: "Property A", price: 100000 } }
    },
    {
      path: "/api/v1/buyer-fit",
      payload: { property: { name: "Property A", price: 100000 } }
    }
  ];

  for (const currentCase of cases) {
    for (const method of ["GET", "POST"]) {
      const response = await requestChallenge(
        server,
        method,
        currentCase.path,
        currentCase.payload
      );
      assert.equal(response.statusCode, 402);

      const encodedChallenge = response.headers["payment-required"];
      assert.ok(encodedChallenge);

      const challenge = JSON.parse(
        Buffer.from(encodedChallenge, "base64").toString("utf8")
      );
      const bodyChallenge = JSON.parse(response.body);

      assert.equal(isPaymentRequired(challenge), true);
      assert.deepEqual(bodyChallenge, challenge);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(challenge.x402Version, 2);
      assert.equal(challenge.error, "Payment required");
      assert.equal(
        challenge.resource.url,
        `https://terra-ai.up.railway.app${currentCase.path}`
      );
      assert.equal(challenge.resource.mimeType, "application/json");
      assert.equal(challenge.accepts.length, 1);
      assert.equal(challenge.accepts[0].scheme, "exact");
      assert.equal(challenge.accepts[0].network, "eip155:196");
      assert.equal(challenge.accepts[0].amount, "500000");
      assert.equal(
        challenge.accepts[0].asset,
        "0x779ded0c9e1022225f8e0630b35a9b54be713736"
      );
      assert.equal(
        challenge.accepts[0].payTo,
        "0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4"
      );
    }
  }
});
