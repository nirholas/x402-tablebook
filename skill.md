# x402-tablebook

Self-hosted restaurant reservation server payable with x402 micropayments (USDC). Query live table availability for a small fee, then book with a refundable $0.01 hold. Every paid call returns its artifact directly in the 200 response body: availability returns the slot list; booking returns the confirmed reservation with a cancel token, refund terms, an HMAC signature, and a base64 ICS calendar invite. Cancellation is free and authenticated by the cancel token you received when booking.

**Base URL**: `https://YOUR-DEPLOYMENT.example.com` (self-hosted — each restaurant runs its own instance)

**Machine-readable manifest**: `GET /.well-known/x402` (free)

## Endpoints

### GET /availability — $0.001

Open reservation slots across the booking window.

Query params (all optional):
- `date` — `YYYY-MM-DD`, restrict to one day
- `party` — integer, only slots that can seat this many
- `days` — integer, scan window when no `date` given (max = configured bookingWindowDays)

Response:
```json
{
  "restaurant": { "name": "Chez x402", "timezone": "America/New_York", "address": "..." },
  "slotMinutes": 30,
  "seatingMinutes": 90,
  "refundPolicy": { "holdPrice": "$0.01", "freeCancellationHours": 2, "description": "..." },
  "generatedAt": "2026-08-07T18:00:00.000Z",
  "slots": [
    { "date": "2026-08-08", "time": "19:00", "partySizes": [1,2,3,4,5,6,7,8], "tableTypes": ["window","standard","round","patio","counter"], "openTables": 8 }
  ]
}
```

### POST /book — $0.01 (refundable hold)

Body:
```json
{ "date": "2026-08-08", "time": "19:00", "party": 2, "name": "Ada Lovelace", "notes": "window please" }
```

Response (the purchased artifact — keep `cancelToken`):
```json
{
  "reservationId": "res_1a2b3c4d5e6f",
  "status": "confirmed",
  "restaurant": "Chez x402",
  "confirmedTime": "2026-08-08T19:00",
  "party": 2,
  "name": "Ada Lovelace",
  "table": { "id": "T1", "name": "Window 1", "type": "window", "seats": 2 },
  "refundTerms": { "holdPrice": "$0.01", "freeCancellationHours": 2, "description": "..." },
  "cancelToken": "3f9c...32 hex chars",
  "cancelEndpoint": "POST /cancel/res_1a2b3c4d5e6f",
  "ledgerEntry": { "kind": "hold", "amount": "$0.01", "reason": "refundable reservation hold paid via x402" },
  "ics": "QkVHSU46VkNBTEVOREFS... (base64 .ics file)",
  "signature": "hex HMAC-SHA256 over the canonical confirmation JSON",
  "createdAt": "2026-08-07T18:00:01.000Z"
}
```

Errors: `400 INVALID_DATE|INVALID_TIME|INVALID_PARTY|INVALID_NAME`, `409 OUTSIDE_HOURS|SLOT_IN_PAST|NO_TABLE`.

### POST /cancel/:id — free (auth: cancelToken)

Body: `{ "cancelToken": "..." }` (or header `X-Cancel-Token`).

Response: cancellation record + refund ledger entry, signed:
```json
{
  "reservationId": "res_1a2b3c4d5e6f",
  "status": "cancelled",
  "refunded": true,
  "refundLedgerEntry": { "kind": "refund", "amount": "$0.01", "reason": "cancelled 26.5h before seating — hold refunded" },
  "ledger": [ { "kind": "hold" }, { "kind": "refund" } ],
  "signature": "..."
}
```

`refunded` is `false` (`kind: "forfeit"`) when cancelling inside the free-cancellation window. Errors: `404 NOT_FOUND`, `403 BAD_CANCEL_TOKEN`, `409 ALREADY_CANCELLED`.

### Free routes

- `GET /info` — restaurant profile, hours, refund policy, prices
- `GET /reservations/:id?cancelToken=...` — reservation + ledger
- `GET /health` — liveness
- `GET /.well-known/x402` — this service's payment manifest

## Payment

**Pay in USDC on Base or Solana — your client picks the rail.** Every paid route
answers an unpaid request with a `402` whose `accepts` array carries both rails;
choose the one your wallet can settle and ignore the other.

- Protocol: [x402](https://x402.org) (HTTP 402 Payment Required), `x402Version: 1`, scheme `exact`
- **EVM rail** — network `base-sepolia` (default; `NETWORK=base` for mainnet), asset USDC
  (`0x036CbD53842c5426634e7929541eC2318f3dCF7e` on base-sepolia), payTo
  `0x40252CFDF8B20Ed757D61ff157719F33Ec332402`
- **Solana rail** — network `solana` (`SOLANA_NETWORK=devnet` for `solana-devnet`), asset USDC
  (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), payTo
  `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW`
- Facilitators (one per rail — no public facilitator settles both chains):
  EVM `https://x402.org/facilitator` (`FACILITATOR_URL`), Solana
  `https://facilitator.payai.network` (`SOLANA_FACILITATOR_URL`)
- Flow: call the route → receive `402` + `accepts[]` → sign the USDC payment for one rail
  (EVM: EIP-3009 `transferWithAuthorization`; Solana: SPL `transferChecked`) → retry with the
  `X-PAYMENT` header → receive `200` + the artifact in the body + an
  `X-PAYMENT-RESPONSE` settlement receipt naming the rail and transaction.
- Clients: `x402-fetch` (EVM), `@three-ws/x402-payment-modal` (browser, both rails),
  or any x402-compatible client.
- Settlement happens only when the route returns `2xx`. A rejected booking never charges you.

Example 402 body:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "10000",
      "resource": "https://YOUR-DEPLOYMENT.example.com/book", "mimeType": "application/json",
      "maxTimeoutSeconds": 300, "description": "Book a table with a refundable hold..." },
    { "scheme": "exact", "network": "solana", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "10000",
      "resource": "https://YOUR-DEPLOYMENT.example.com/book", "mimeType": "application/json",
      "maxTimeoutSeconds": 300, "description": "Book a table with a refundable hold..." }
  ]
}
```

## Verifying signatures

`signature` fields are HMAC-SHA256 (hex) over the canonical JSON (sorted keys, `signature` field excluded) using the server's `SIGNING_SECRET`. Verify with the exported `verify()` in `src/sign.ts` if you share the secret, or treat the signature as a tamper-evidence tag issued by the merchant.

## Contact

Questions, integration help, or a bug: **nichxbt@gmail.com** ·
[github.com/nirholas/x402-tablebook](https://github.com/nirholas/x402-tablebook)
