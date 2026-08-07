# x402-tablebook

**Open-source Resy for the agent economy** — a self-hosted restaurant reservation server that AI agents (and humans) can book with [x402](https://x402.org) micropayments. Availability costs $0.001, a booking is a **$0.01 refundable hold**, and every payment returns its artifact — reservation, cancel token, refund terms, calendar invite — in the same HTTP response.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402%20%C2%B7%20USDC-0052ff.svg)](https://x402.org)
[![rails](https://img.shields.io/badge/rails-Base%20%2B%20Solana-14f195.svg)](#how-x402-works)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-0052ff.svg)](https://nirholas.github.io/x402-tablebook/)

## Why x402 for this

Restaurant booking APIs today mean platform gatekeepers, API-key onboarding, and no-show risk with nothing at stake. With x402 the transaction *is* the authentication: any wallet — human or agent — pays $0.001 to see real availability and puts down a $0.01 refundable USDC hold to claim a table, with no account, subscription, or integration contract. The hold gives restaurants skin-in-the-game against no-shows while staying trivially refundable on timely cancellation.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-tablebook
cd x402-tablebook && npm install

# your floor plan and hours live in config/tables.json — edit to match reality
npm run dev
```

The server ships with the suite's public receive addresses so it runs out of the
box. Set `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana) in `.env`
to receive the payments yourself.

Then, in another terminal, run the full agent flow (search → book → cancel):

```bash
PRIVATE_KEY=0xFundedBaseSepoliaKey npm run client
```

Fund the client wallet with testnet USDC at [faucet.circle.com](https://faucet.circle.com). Open <http://localhost:4021> for the human checkout demo.

## API

| Route | Price | What you get back |
|---|---|---|
| `GET /availability` | $0.001 | Open slots: date, time, seatable party sizes, table types, open-table counts |
| `POST /book` | $0.01 (refundable hold) | `{reservationId, confirmedTime, party, table, refundTerms, cancelToken, ledgerEntry, ics (base64 invite), signature}` |
| `POST /cancel/:id` | free (auth: cancelToken) | Cancellation record + refund ledger entry, signed |
| `GET /reservations/:id` | free (auth: cancelToken) | Reservation + full ledger |
| `GET /info`, `GET /health`, `GET /.well-known/x402` | free | Profile / liveness / machine-readable payment manifest |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

**Pay in USDC on Base or Solana — your client picks the rail.**

1. Client calls a paid route with no payment → server answers **`402 Payment Required`** with an `accepts[]` array holding **both rails**: USDC on Base (`base-sepolia` by default) and USDC on Solana, each with amount, token address, and recipient.
2. Client picks one and signs — EVM: an EIP-3009 `transferWithAuthorization`; Solana: an SPL `transferChecked` — then retries with the **`X-PAYMENT`** header.
3. The facilitator for that rail **verifies and settles** on the chosen chain —
   x402.org's for Base, PayAI's for Solana (each overridable by env; no public
   facilitator settles both).
4. Server responds **`200`** with the purchased artifact in the body and a settlement receipt in **`X-PAYMENT-RESPONSE`**.

Settlement is deliberately last: the payment only settles when the route returns
`2xx`, so a booking that can't be honoured never charges the payer.

No API keys, no invoices, no minimums — each request pays for itself. Raw wire-level walkthrough: [examples/curl.md](examples/curl.md).

## Real backend / configuration

This server sells **real inventory you configure** — there are no fixtures and no external API keys:

- `config/tables.json` — your restaurant, hours, tables, slot/seating durations, refund policy.
- Reservations and the refundable-hold ledger persist to `data/*.json` (file-based, no database).
- `SIGNING_SECRET` — set in production; confirmations and cancellations carry an HMAC-SHA256 signature over canonical JSON (dev default is baked in for the demo).
- Refund ledger: holds, refunds, and forfeits are recorded per reservation and returned in-response. Settling refunded USDC back on-chain is the operator's action (or an automation you attach) — the signed ledger entry is the customer's claim.
- Payment addresses: `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana). Both default to the suite's public receive addresses so the demo runs unconfigured — the server prints a reminder while the defaults are active.
- Facilitators are per-rail: `FACILITATOR_URL` (EVM, default x402.org) and `SOLANA_FACILITATOR_URL` (Solana, default PayAI). No public facilitator settles both chains.
- Mainnet: `NETWORK=base` + a production EVM `FACILITATOR_URL`. Solana defaults to mainnet; `SOLANA_NETWORK=devnet` switches it. Use a dedicated `SOLANA_RPC_URL` in production.

All variables: [.env.example](.env.example)

## Human checkout

`public/index.html` is a Resy-style checkout: search slots, tap one, pay with the drop-in [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) (loaded from CDN), download the .ics, cancel with one click. The modal reads the dual-rail 402 and offers **Phantom/Solflare/Backpack on Solana or MetaMask on Base** automatically. It also brings **SIWX wallet re-entry** (a wallet that already paid signs back in instead of paying again) and **client-side spending caps** (per-call / hourly / daily), so returning guests don't re-approve every $0.01.

The Solana browser path needs one small server route — Phantom signs serialized
transactions, so the SPL transfer has to be built somewhere. `src/checkout.ts`
mounts the package's own Express adapter at `/api/x402-checkout`; if the optional
peer deps aren't installed, that path degrades and the Base path keeps working.

## For AI agents

- **[skill.md](skill.md)** — agent-facing service description (endpoints, prices, schemas, payment details).
- **[/.well-known/x402](public/.well-known/x402)** — machine-readable manifest served by the app; indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). Deploy publicly and submit your base URL to be discovered.
- **MCP**: wrap the endpoints as Claude tools in ~60 lines — see [examples/mcp-tool.md](examples/mcp-tool.md).
- **Client**: [examples/agent-client.ts](examples/agent-client.ts) is the complete pay-search-book-cancel loop via `x402-fetch`.
- Agent guide: [docs/agents.md](docs/agents.md)

## Docs

Site: **<https://nirholas.github.io/x402-tablebook/>** · [Tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [For agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

Questions, integration help, or a bug report: **nichxbt@gmail.com** — or open an
[issue](https://github.com/nirholas/x402-tablebook/issues).

## License

[Apache-2.0](LICENSE)
