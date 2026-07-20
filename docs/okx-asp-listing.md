# Terra Compare OKX.AI ASP Listing

## Service Name

Terra Compare

## Project

Terra AI

## Live Endpoint

`POST https://terra-ai.up.railway.app/api/v1/compare`

## Category

Lifestyle Companion / Real Estate / Decision Support

## Short Description

Terra Compare helps agents and users compare 2 to 5 global real estate options, estimate hidden costs, rank properties, and return a clear recommendation.

## Long Description

Terra Compare is the first Terra AI skill: an A2MCP-style real estate comparison service for OKX.AI. It accepts property details from any market, including listing links, addresses, price, bedrooms, size, condition, fees, and user preferences. It returns a structured report with side-by-side comparisons, pros and cons, hidden-cost estimates, weighted scoring, confidence labels, and a final recommendation with reasoning.

## User Problem

Property decisions are difficult because listings are fragmented, emotional, and often hide tradeoffs. Buyers and investors must compare price, location, condition, size, commute, amenities, hidden costs, and long-term upside. Terra Compare turns messy property choices into a clean decision report.

## Agent Use Case

An OKX.AI agent can call Terra Compare when a user asks:

- Which of these apartments should I choose?
- Compare these property links for me.
- Which option is best for rental investment?
- Estimate the hidden costs and rank these homes.

## Request Format

The service accepts:

- `properties`: 2 to 5 property strings or structured property objects
- `userPreferences`: budget, currency, must-haves, deal-breakers, minimum size/bedrooms, purpose, and priority weights

See [`openapi.yaml`](../openapi.yaml) and [`examples/compare-primary-home.json`](../examples/compare-primary-home.json).

## Response Format

The service returns:

- recommendation summary
- normalized preferences
- side-by-side comparison table
- ranked property list
- property-level pros and cons
- estimated first-year hidden costs
- scoring breakdown
- confidence labels
- markdown report

## Live Pricing

All four Terra AI A2MCP services use the live OKX.AI listing price:

- `0.5 USDT` per API call
- X Layer mainnet (`eip155:196`)
- x402 asset: `0x779ded0c9e1022225f8e0630b35a9b54be713736`
- payout address: `0x9873dd140c12ecbfe9fcf70c16dc7b94b649e0b4`

## x402 Payment Status

Production uses the OKX Payment SDK and standard x402 v2 middleware.

Current production settings:

- `X402_MODE=okx`
- `X402_NETWORK=eip155:196`
- `X402_PRICE=$0.50`
- `X402_SYNC_SETTLE=true`
- unpaid requests return `HTTP 402` with `PAYMENT-REQUIRED`
- successfully paid requests return `HTTP 200` with the requested analysis

The production listing does not use the legacy demo header or any draft
pricing configuration.

## Data Accuracy Status

Terra Compare currently compares the property data supplied by the caller. It does not fetch live listing feeds, tax records, rental comps, or insurance quotes yet. The API response includes `dataQuality` and per-property `confidence` metadata so agents can disclose whether a report is high-confidence or based on limited supplied data.

## 90-Second Demo Voiceover

Terra AI is an AI-powered real estate assistant for global property decisions. Our first OKX.AI ASP is Terra Compare, a pay-per-call property comparison service. A user or agent can send two to five properties from any market, along with preferences like budget, must-haves, location priority, living quality, and investment potential. Terra Compare returns a structured report with side-by-side comparison, hidden-cost estimates, pros and cons, weighted scoring, and a final recommendation.

This matters because property decisions are high-stakes and messy. Listings do not explain tradeoffs clearly, and buyers often miss hidden costs. Terra Compare gives agents a professional decision layer they can call instantly and present to users in plain language. This is the first Terra AI skill, and later Terra AI will expand into a full real estate planning agent.

## Submission Checklist

- Live API endpoint is deployed.
- Health endpoint returns production status.
- Compare endpoint accepts sample payloads.
- OpenAPI spec is present.
- Example request is present.
- All four endpoints return a standard unpaid x402 challenge.
- A paid marketplace request settles on X Layer and returns analysis.
- Demo video is 90 seconds or less.
- X launch post includes `#OKXAI`.
