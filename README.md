# Terra AI - Terra Compare

Terra Compare is the first Terra AI skill: an AI-powered real estate comparison API built as an A2MCP-style service for OKX.AI.

It helps agents and users compare 2 to 5 property options across global markets, apply buyer or investor preferences, estimate hidden costs, score tradeoffs, and return a structured recommendation that other AI agents can parse easily.

Terra AI is not limited to one country or city. The API accepts structured details or plain listing/address text from any market, then normalizes the comparison around the user goal, budget, must-haves, and priorities.

## Live service

- Production root: `https://terra-ai.up.railway.app/`
- Health: `https://terra-ai.up.railway.app/health`
- Compare endpoint: `POST https://terra-ai.up.railway.app/api/v1/compare`
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
- Weighted scoring and ranking
- Clear final recommendation
- x402 payment middleware isolated as an MVP stub

## Example scenarios

- A family comparing homes in Singapore, Lisbon, and Berlin
- An investor comparing rental opportunities in Tokyo, Madrid, and Bangkok
- An agent comparing listing links or structured property details for a client
- A relocation assistant helping users reason through price, commute, living quality, and long-term upside

## Project structure
