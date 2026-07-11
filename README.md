# Terra Compare MVP

Terra Compare is the first Terra AI skill: an AI-powered real estate comparison API built as an A2MCP-style service for OKX.AI.

It compares 2 to 5 properties, applies user preferences, estimates hidden costs, scores each option, and returns a structured report that other AI agents can parse easily.

## Live service

- Production root: `https://terra-ai.up.railway.app/`
- Health: `https://terra-ai.up.railway.app/health`
- Compare endpoint: `POST https://terra-ai.up.railway.app/api/v1/compare`
- OpenAPI contract: [`openapi.yaml`](./openapi.yaml)
- OKX.AI ASP listing notes: [`docs/okx-asp-listing.md`](./docs/okx-asp-listing.md)
- Example requests: [`examples/`](./examples)

## Features

- Node.js + Express API
- Accepts 2 to 5 properties
- Accepts user preferences
- Side-by-side property comparison
- Pros and cons for each property
- Estimated hidden costs
- Weighted scoring and ranking
- Clear final recommendation
- x402 payment middleware isolated as an MVP stub

## Project structure
