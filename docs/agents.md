# For AI agents

x402-tablebook is built agent-first: no signup, no API key, no OAuth dance.
If your agent controls a wallet holding USDC on **either** Base or Solana, it
can book a table — every paid route offers both networks at once.

## Discovery

Three machine-readable entry points, all free:

1. **`GET /openapi.json`** — the canonical OpenAPI 3.1 contract: every route,
   parameter, response schema, and — on paid routes — an `x-payment-info`
   block and a documented `402`. This is what
   [x402scan.com](https://x402scan.com) reads first.
2. **`GET /.well-known/x402`** — the x402 manifest: every resource, price,
   accepted network, asset, and output schema. Secondary, but cheap to read;
   also indexed by the x402 Bazaar and [agentic.market](https://agentic.market).
3. **[`skill.md`](https://github.com/nirholas/x402-tablebook/blob/main/skill.md)**
   (repo root) — a prose+schema skill file (the agentres.dev pattern) an LLM
   can read directly to learn endpoints, prices, request shapes, and error
   codes.

Recommended agent bootstrap: fetch `/openapi.json`, feed `skill.md` into
context, then call endpoints with an x402-capable HTTP client.

## Paying

The `402` body's `accepts[]` lists one entry per network the merchant can
settle on — same price, different `network`, `payTo` and `asset`. Match it
against the wallets you hold and sign that entry; you never need a wallet on
a particular chain.

Any x402 client works. With `x402-fetch` (EVM side):

```ts
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(KEY));
const res = await payFetch(`${BASE}/book`, { method: "POST", headers: {"content-type":"application/json"}, body });
const artifact = await res.json();                       // the reservation
const receipt = decodeXPaymentResponse(res.headers.get("x-payment-response")!); // on-chain receipt
```

The client handles the 402 → sign → retry loop automatically. Cap per-call
spend with the `maxValue` argument.

## What you get back (and should persist)

| Field | Why it matters |
|---|---|
| `reservationId` | canonical reference |
| `cancelToken` | **bearer credential** — required to cancel or look up; store securely |
| `refundTerms` | when the $0.01 hold is refundable |
| `ics` | base64 calendar invite — attach to the user's calendar |
| `signature` | merchant HMAC over the artifact — keep for dispute evidence |
| `X-PAYMENT-RESPONSE` header | settlement receipt (`transaction`, `network`, `payer`) — your proof of payment |

## Booking policy for agents

- Always call `GET /availability` (paid, $0.001) before booking; slots move.
- On `409 NO_TABLE`, re-query availability rather than retrying blind.
- Cancel with `POST /cancel/:id` as soon as plans change — ≥ 2h ahead the
  hold refunds; the response includes the signed refund ledger entry.
- Idempotency: booking twice books two tables. Track `reservationId` before
  retrying network failures.

## MCP integration

Expose the service as Claude tools (`check_availability`, `book_table`,
`cancel_reservation`) with the ~60-line wrapper in
[`examples/mcp-tool.md`](https://github.com/nirholas/x402-tablebook/blob/main/examples/mcp-tool.md),
including a `claude_desktop_config.json` snippet.

## Listing your deployment

Running a public instance? Get discovered:

- **x402scan.com** — fetches `GET {origin}/openapi.json` and then probes the
  paid routes on that **same origin**, ignoring the OpenAPI `servers` field.
  Submit the URL where the server actually runs; a static site (including
  this GitHub Pages docs site) can never return a `402` and will not index.
- **x402 Bazaar** — the facilitator-side discovery list; facilitators that
  support discovery pick up the routes advertised in your `402` challenges.
- **agentic.market** — agent-service marketplace; list the base URL and
  point at `skill.md`.

Keep the service over HTTPS at a permanent public origin — indexers and
agents will refuse plaintext payment endpoints. Behind a proxy that rewrites
the Host header, set `PUBLIC_URL` so the `resource` field in each `402` and
the OpenAPI `servers` entry name the real origin.
