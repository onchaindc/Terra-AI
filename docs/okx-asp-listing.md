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

## Pricing Model

Suggested MVP price: a small fixed pay-per-call fee per comparison request.

Recommended first test price:

- `0.01 USDC` per comparison call
- or the OKX.AI/x402 marketplace minimum if a required minimum exists

## x402 Payment Status

The current MVP has an isolated x402 middleware layer and accepts the `x-terra-payment-proof` header in stub mode. This keeps the API shape ready for pay-per-call usage while final OKX.AI x402 verification details are connected.

Current production settings:

- `X402_STUB_MODE=true`
- `X402_REQUIRE_HEADER=false`
- `X402_PAYMENT_HEADER_NAME=x-terra-payment-proof`

Before final marketplace launch, replace the stubbed verifier with the OKX.AI-required x402 verification flow while keeping the route contract unchanged.

## 90-Second Demo Voiceover

Terra AI is an AI-powered real estate assistant for global property decisions. Our first OKX.AI ASP is Terra Compare, a pay-per-call property comparison service. A user or agent can send two to five properties from any market, along with preferences like budget, must-haves, location priority, living quality, and investment potential. Terra Compare returns a structured report with side-by-side comparison, hidden-cost estimates, pros and cons, weighted scoring, and a final recommendation.

This matters because property decisions are high-stakes and messy. Listings do not explain tradeoffs clearly, and buyers often miss hidden costs. Terra Compare gives agents a professional decision layer they can call instantly and present to users in plain language. This is the first Terra AI skill, and later Terra AI will expand into a full real estate planning agent.

## Submission Checklist

- Live API endpoint is deployed.
- Health endpoint returns production status.
- Compare endpoint accepts sample payloads.
- OpenAPI spec is present.
- Example request is present.
- x402 middleware is isolated.
- Demo video is 90 seconds or less.
- X launch post includes `#OKXAI`.
