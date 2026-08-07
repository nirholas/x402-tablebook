# x402-tablebook

**Open-source Resy for the agent economy** — a self-hosted restaurant reservation server that AI agents (and humans) can book with [x402](https://x402.org) micropayments. Availability costs $0.001, a booking is a **$0.01 refundable hold**, and every payment returns its artifact — reservation, cancel token, refund terms, calendar invite — in the same HTTP response.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402%20%C2%B7%20USDC%20on%20Base%20%2B%20Solana-0052ff.svg)](https://x402.org)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-0052ff.svg)](https://nirholas.github.io/x402-tablebook/)

## Why x402 for this

Restaurant booking APIs today mean platform gatekeepers, API-key onboarding, and no-show risk with nothing at stake. With x402 the transaction *is* the authentication: any wallet — human or agent — pays $0.001 to see real availability and puts down a $0.01 refundable USDC hold to claim a table, with no account, subscription, or integration contract. The hold gives restaurants skin-in-the-game against no-shows while staying trivially refundable on timely cancellation.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-tablebook
cd x402-tablebook && npm install

# your floor plan and hours live in config/tables.json — edit to match reality
EVM_PAY_TO=0xYourMerchantAddress npm run dev
```

Add `SOLANA_PAY_TO` (plus CDP credentials) and the same routes accept Solana USDC
too — both networks are offered side by side in every `402`, and the agent picks.

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
| `GET /info`, `GET /health` | free | Restaurant profile, prices and accepted networks / liveness |
| `GET /openapi.json`, `GET /.well-known/x402` | free | Machine-readable contract and payment manifest, for discovery |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

1. Client calls a paid route with no payment → server answers **`402 Payment Required`** with a JSON `accepts[]` listing every network it can pay on (amount in USDC atomic units, token address, recipient, network).
2. Client picks the entry matching a wallet it holds, signs it — EIP-3009 authorization on EVM, an SPL transfer on Solana — and retries with the **`X-PAYMENT`** header.
3. The facilitator for that network **verifies and settles** the payment: Sperax for EVM, Coinbase CDP for Solana.
4. Server responds **`200`** with the purchased artifact in the body and a settlement receipt in **`X-PAYMENT-RESPONSE`**.

Because `accepts[]` carries both chains, an agent never needs a wallet on a
specific network — it pays with what it already has.

No API keys, no invoices, no minimums — each request pays for itself. Raw wire-level walkthrough: [examples/curl.md](examples/curl.md).

## Real backend / configuration

This server sells **real inventory you configure** — there are no fixtures and no external API keys:

- `config/tables.json` — your restaurant, hours, tables, slot/seating durations, refund policy.
- Reservations and the refundable-hold ledger persist to `data/*.json` (file-based, no database).
- `SIGNING_SECRET` — set in production; confirmations and cancellations carry an HMAC-SHA256 signature over canonical JSON (dev default is baked in for the demo).
- Refund ledger: holds, refunds, and forfeits are recorded per reservation and returned in-response. Settling refunded USDC back on-chain is the operator's action (or an automation you attach) — the signed ledger entry is the customer's claim.
- Networks: `EVM_PAY_TO` (+ `X402_EVM_NETWORK`, default `base`) and `SOLANA_PAY_TO` (+ `X402_SOLANA_NETWORK`, default `solana`). A network is only advertised once it has both a recipient and a facilitator that can settle it — the server will not offer a chain it cannot actually take money on. Solana settlement needs `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` from [CDP](https://portal.cdp.coinbase.com/), or a self-hosted `X402_FACILITATOR_SOLANA`.

All variables: [.env.example](.env.example)

## Deploying

Discovery reads `GET {origin}/openapi.json` and then probes the endpoints on that
**same origin**, so the server has to be reachable at a permanent public URL. A
static docs site cannot stand in for it — it can never return a `402`.

```bash
docker build -t x402-tablebook .
docker run -p 4021:4021 \
  -e EVM_PAY_TO=0xYourMerchantAddress \
  -e SOLANA_PAY_TO=YourSolanaAddress \
  -e CDP_API_KEY_ID=... -e CDP_API_KEY_SECRET=... \
  -e SIGNING_SECRET=$(openssl rand -hex 32) \
  -v $PWD/data:/app/data \
  x402-tablebook
```

`railway.toml` deploys the same image on Railway; mount a volume at `/app/data`
so reservations and the ledger survive redeploys. Then register that deployment's
origin — not the docs site — at [x402scan.com](https://x402scan.com).

## Human checkout

`public/index.html` is a Resy-style checkout: search slots, tap one, pay with the drop-in [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) (loaded from CDN), download the .ics, cancel with one click. The modal handles wallet connection with SIWX re-entry and per-site spending caps, so returning guests don't re-approve every $0.01.

## For AI agents

- **[skill.md](skill.md)** — agent-facing service description (endpoints, prices, schemas, payment details).
- **`GET /openapi.json`** — the canonical machine-readable contract, generated at runtime by [src/openapi.ts](src/openapi.ts) and committed as [openapi.json](openapi.json) (`npm run openapi` regenerates it). Paid routes carry `x-payment-info` and a `402` response; free routes declare `"security": []`. This is what [x402scan.com](https://x402scan.com) reads first.
- **`GET /.well-known/x402`** — secondary manifest, same prices and networks, generated by [src/well-known.ts](src/well-known.ts). Also read by the x402 Bazaar and [agentic.market](https://agentic.market).
- **MCP**: wrap the endpoints as Claude tools in ~60 lines — see [examples/mcp-tool.md](examples/mcp-tool.md).
- **Client**: [examples/agent-client.ts](examples/agent-client.ts) is the complete pay-search-book-cancel loop via `x402-fetch`.
- Agent guide: [docs/agents.md](docs/agents.md)

## Docs

Site: **<https://nirholas.github.io/x402-tablebook/>** · [Tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [For agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## License

[Apache-2.0](LICENSE)
