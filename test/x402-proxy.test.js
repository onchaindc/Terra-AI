const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

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

function requestChallenge(server, path, payload) {
  const address = server.address();
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
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
  t.after(() => facilitator.close());

  process.env.X402_MODE = "okx";
  process.env.OKX_API_KEY = "test-api-key";
  process.env.OKX_SECRET_KEY = "test-secret-key";
  process.env.OKX_PASSPHRASE = "test-passphrase";
  process.env.X402_PAY_TO_ADDRESS =
    "0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4";
  process.env.X402_NETWORK = "eip155:196";
  process.env.X402_PRICE = "$1";
  process.env.OKX_BASE_URL = `http://127.0.0.1:${facilitator.address().port}`;
  process.env.X402_SYNC_FACILITATOR_ON_START = "true";

  const createApp = require("../src/app");
  const server = createApp().listen(0);
  t.after(() => server.close());

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
    const response = await requestChallenge(
      server,
      currentCase.path,
      currentCase.payload
    );
    assert.equal(response.statusCode, 402);

    const encodedChallenge = response.headers["payment-required"];
    assert.ok(encodedChallenge);

    const challenge = JSON.parse(
      Buffer.from(encodedChallenge, "base64").toString("utf8")
    );

    assert.equal(
      challenge.resource.url,
      `https://terra-ai.up.railway.app${currentCase.path}`
    );
  }
});
