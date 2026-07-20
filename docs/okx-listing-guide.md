# OKX.AI ASP Listing Guide

Use this guide to list Terra Compare as an Agent Service Provider service on OKX.AI.

## Live Service

- API base URL: `https://terra-ai.up.railway.app`
- Compare endpoint: `POST https://terra-ai.up.railway.app/api/v1/compare`
- Health endpoint: `GET https://terra-ai.up.railway.app/health`
- OpenAPI spec: `https://github.com/onchaindc/Terra-AI/blob/main/openapi.yaml`
- GitHub repo: `https://github.com/onchaindc/Terra-AI`

## Listing Fields

Service name:

`Terra Compare`

Project name:

`Terra AI`

Short description:

`AI-powered global real estate comparison service for buyers, renters, investors, and other agents.`

Long description:

`Terra Compare is an OKX.AI-ready ASP that compares 2 to 5 real estate options across global markets. It accepts listing links, addresses, or structured property data plus user preferences such as budget, must-haves, location priority, living quality, and investment goals. It returns a clean structured report with side-by-side comparisons, hidden-cost estimates, pros and cons, weighted scores, confidence labels, and a final recommendation.`

Category:

`Lifestyle Companion` or `Productivity`

Pricing:

`0.5 USDT per API call` on X Layer mainnet.

Interface URL:

`https://terra-ai.up.railway.app/api/v1/compare`

Method:

`POST`

Headers:

`Content-Type: application/json`

Unpaid response:

`HTTP 402 Payment Required` with the standard x402 v2 challenge in the
`PAYMENT-REQUIRED` response header.

Paid response:

`HTTP 200` with the requested property analysis after OKX payment
authorization and settlement.

Production payment configuration:

- `X402_MODE=okx`
- `X402_NETWORK=eip155:196`
- `X402_PRICE=$0.50`
- `X402_PAY_TO_ADDRESS=0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4`
- `X402_SYNC_SETTLE=true`
- payment asset: `0x779ded0c9e1022225f8e0630b35a9b54be713736`

Required env vars:

- `OKX_API_KEY`
- `OKX_SECRET_KEY`
- `OKX_PASSPHRASE`
- `X402_PAY_TO_ADDRESS`
- `X402_NETWORK`
- `X402_PRICE`
- `X402_SYNC_SETTLE`

## Data Accuracy Disclosure

Use this wording in the listing if there is a disclosure field:

`Terra Compare analyzes property data supplied by the caller. It does not fetch live listing feeds or verify market data in the current MVP. Reports include confidence and data-quality metadata, and hidden costs are estimates for decision support only.`

## Example Request

Use [`examples/compare-primary-home.json`](../examples/compare-primary-home.json) for a global home-buyer scenario.

Use [`examples/compare-investment.json`](../examples/compare-investment.json) for a global rental-investment scenario.

## Listing Steps

1. Open OKX.AI and go to the Agent Service Provider or ASP listing area.
2. Create a new service.
3. Fill in the service name, description, endpoint, method, pricing, and category from this guide.
4. Add the OpenAPI URL or copy the schema from [`openapi.yaml`](../openapi.yaml), depending on what the OKX.AI listing form accepts.
5. Submit the service for review.
6. After approval, test the live listing from OKX.AI with the sample payload.
7. Record a demo video under 90 seconds.
8. Post on X with `#OKXAI`.
9. Submit the hackathon form with the repo, live endpoint, listing link, X post, and demo video.

## Demo Angle

Position Terra Compare as a global real estate decision layer for agents. The core value is not local market coverage in one country; it is a clean agent-callable comparison engine that turns messy property options into a ranked, structured recommendation.
