# Terra AI - Terra Compare

Terra Compare is the first Terra AI skill: an AI-powered real estate comparison API built as an A2MCP-style service for OKX.AI.

It helps agents and users compare 2 to 5 property options across global markets, apply buyer or investor preferences, estimate hidden costs, score tradeoffs, and return a structured recommendation that other AI agents can parse easily.

Terra AI is not limited to one country or city. The API accepts structured details or plain listing/address text from any market, then normalizes the comparison around the user goal, budget, must-haves, and priorities.

## Live service

- Production root: `https://terra-ai.up.railway.app/`
- Health: `https://terra-ai.up.railway.app/health`
- Compare endpoint: `POST https://terra-ai.up.railway.app/api/v1/compare`
- Hidden costs endpoint: `POST https://terra-ai.up.railway.app/api/v1/hidden-costs`
- Investment check endpoint: `POST https://terra-ai.up.railway.app/api/v1/investment-check`
- Buyer fit endpoint: `POST https://terra-ai.up.railway.app/api/v1/buyer-fit`
- OpenAPI contract: [`openapi.yaml`](./openapi.yaml)
- OKX.AI ASP listing notes: [`docs/okx-asp-listing.md`](./docs/okx-asp-listing.md)
- OKX.AI listing guide: [`docs/okx-listing-guide.md`](./docs/okx-listing-guide.md)
- GitHub repo polish fields: [`docs/github-repo-settings.md`](./docs/github-repo-settings.md)
- Example requests: [`examples/`](./examples)

## Features

- Node.js + Express API
- Accepts 2 to 5 properties from any region
- Accepts buyer, renter, or investor preferences
- Side-by-side property comparison
- Pros and cons for each property
- Estimated hidden costs
- Single-property hidden-cost checks
- Rental/investment fit scoring
- Buyer-fit scoring against must-haves and deal-breakers
- Weighted scoring and ranking
- Clear final recommendation
- Production OKX x402 enforcement at 0.5 USDT per call on X Layer mainnet
- Data-quality metadata that explains whether results are based on supplied input, heuristics, or live feeds

## Current accuracy model

Terra Compare currently compares the property data supplied by the caller. It does not fetch live listing feeds, tax records, insurance quotes, rental comps, or market-price feeds yet.

That means:

- structured inputs produce the best reports
- plain addresses or links produce lower-confidence reports unless another agent enriches them first
- hidden costs are estimates, not verified local legal/tax/inspection advice
- every response includes `dataQuality` and per-property `confidence` metadata

## Production payment contract

All four live A2MCP endpoints use the same payment contract:

- Mode: `X402_MODE=okx`
- Price: `0.5 USDT` per call
- Network: X Layer mainnet (`eip155:196`)
- Payment asset: `0x779ded0c9e1022225f8e0630b35a9b54be713736`
- Payout address: `0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4`
- Unpaid response: `HTTP 402 Payment Required` with a standard `PAYMENT-REQUIRED` x402 v2 challenge
- Paid response: `HTTP 200` with the requested property analysis

Production requires:

- `OKX_API_KEY`
- `OKX_SECRET_KEY`
- `OKX_PASSPHRASE`
- `X402_PAY_TO_ADDRESS`
- `X402_NETWORK`
- `X402_PRICE`
- `X402_SYNC_SETTLE=true`

`demo` and `off` remain available only as explicit local-development overrides.
They are not the production or OKX.AI listing configuration.

## Example scenarios

- A family comparing homes in Singapore, Lisbon, and Berlin
- An investor comparing rental opportunities in Tokyo, Madrid, and Bangkok
- An agent comparing listing links or structured property details for a client
- A relocation assistant helping users reason through price, commute, living quality, and long-term upside

## Project structure
