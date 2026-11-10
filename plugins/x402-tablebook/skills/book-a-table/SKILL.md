---
name: book-a-table
description: Run and call the x402-tablebook reservation server to check restaurant availability, book a table with a refundable USDC hold over x402, and cancel or look up a reservation. Use when an agent needs to reserve a table or operate a self-hosted booking endpoint.
---

# Book a table with x402-tablebook

x402-tablebook is an Express reservation server. Availability and booking are paid per call over x402
(HTTP 402, USDC on Base or Solana). Each paid response carries its artifact in the body.

Paying is irreversible. Before any paid call, show the user the route, price, network and payTo
address from the 402 response, and wait for an explicit yes. Never book a table without the user
confirming the date, time, party size and name.

## Run it

From a clone (not published to npm), Node with `tsx` installed by `npm install`:

```bash
git clone https://github.com/nirholas/x402-tablebook
cd x402-tablebook && npm install
npm run dev        # tsx src/server.ts, http://localhost:4021 (PORT overrides)
```

The restaurant, hours, tables and refund policy come from `config/tables.json` (override the path
with `TABLES_CONFIG`). Reservations persist as JSON under `data/` (`DATA_DIR`). Set `SIGNING_SECRET`
in production. Payment env vars: `PAY_TO_ADDRESS` and `NETWORK` (`base-sepolia` default, or `base`),
`SOLANA_PAY_TO_ADDRESS` and `SOLANA_NETWORK`, `FACILITATOR_URL`, `SOLANA_FACILITATOR_URL`.

## Routes

| Route | Price | Result |
|---|---|---|
| `GET /availability` | $0.001 | Open slots: date, time, seatable party sizes, table types, open-table counts |
| `POST /book` | $0.01 refundable hold | `reservationId`, `confirmedTime`, `cancelToken`, refund terms, ledger entry, base64 `.ics` invite, signature |
| `POST /cancel/:id` | free | Cancellation record and refund ledger entry; needs the `cancelToken` |
| `GET /reservations/:id` | free | Reservation and ledger; needs the `cancelToken` |
| `GET /info`, `GET /health`, `GET /.well-known/x402` | free | Profile, liveness, payment manifest |

`/availability` query params, all optional: `date` (`YYYY-MM-DD`), `party` (integer), `days`.
`/book` body: `date`, `time`, `party`, `name`, optional `notes`, and optionally an `X-Payer-Address`
header. Pass the cancel token as body `cancelToken`, header `X-Cancel-Token`, or (for lookup)
`?cancelToken=`. Keep the `cancelToken` safe: it is the only credential for cancel and lookup.

## Paying

An unpaid call returns 402 with an `accepts` array listing both rails. Sign the entry your wallet
supports and retry with the base64 `X-PAYMENT` header; the receipt is in `X-PAYMENT-RESPONSE`.
Settlement happens only if the route returns 2xx, so a booking that cannot be honoured is not
charged. `npm run client` (`examples/agent-client.ts`, `PRIVATE_KEY` for a Base Sepolia wallet) runs
the whole search, book, cancel loop with `x402-fetch`.

## Example

```bash
curl -i 'localhost:4021/availability?date=2026-08-08&party=2'     # 402 first
curl -s localhost:4021/book -H 'content-type: application/json' \
  -d '{"date":"2026-08-08","time":"19:00","party":2,"name":"Ada Lovelace"}'
curl -s -X POST localhost:4021/cancel/<reservationId> -H "X-Cancel-Token: <cancelToken>"
```
