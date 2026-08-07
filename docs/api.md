# API reference

Base URL: your deployment (default `http://localhost:4021`). Machine-readable
spec: [`openapi.json`](https://github.com/nirholas/x402-tablebook/blob/main/openapi.json).
Paid routes return `402 Payment Required` until called with a valid
`X-PAYMENT` header; successful paid responses carry an `X-PAYMENT-RESPONSE`
settlement receipt header.

---

## GET /availability — $0.001

Open reservation slots for the booking window.

| Query param | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | optional — one day only |
| `party` | integer ≥ 1 | optional — only slots that can seat this many |
| `days` | integer | optional — days to scan (capped at `bookingWindowDays`) |

**200 response**

```json
{
  "restaurant": { "name": "Chez x402", "timezone": "America/New_York", "address": "...", "phone": "..." },
  "slotMinutes": 30,
  "seatingMinutes": 90,
  "refundPolicy": { "holdPrice": "$0.01", "freeCancellationHours": 2, "description": "..." },
  "generatedAt": "2026-08-07T18:00:00.000Z",
  "slots": [
    {
      "date": "2026-08-08",
      "time": "19:00",
      "partySizes": [1, 2, 3, 4, 5, 6, 7, 8],
      "tableTypes": ["window", "standard", "round", "patio", "counter"],
      "openTables": 8
    }
  ]
}
```

Past slots are excluded. `partySizes` reflects the largest free table at
that slot; `openTables` counts free tables (after the `party` filter, when
given).

**Errors**: `402` (no/invalid payment).

---

## POST /book — $0.01 (refundable hold)

Books the smallest free table that fits the party.

**Request body**

```json
{
  "date": "2026-08-08",
  "time": "19:00",
  "party": 2,
  "name": "Ada Lovelace",
  "notes": "window please"
}
```

Optionally identify the paying wallet with an `X-Payer-Address` header (or
`payerWallet` in the body) — recorded on the hold ledger entry for refunds.

**200 response** — the purchased artifact

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
  "cancelToken": "3f9c8e2d…",
  "cancelEndpoint": "POST /cancel/res_1a2b3c4d5e6f",
  "ledgerEntry": { "entryId": "led_…", "kind": "hold", "amount": "$0.01", "reason": "refundable reservation hold paid via x402", "at": "…" },
  "ics": "QkVHSU46VkNBTEVOREFS…",
  "signature": "hex HMAC-SHA256",
  "createdAt": "2026-08-07T18:00:01.000Z"
}
```

`ics` is a base64 RFC 5545 calendar invite. `signature` is HMAC-SHA256 over
the canonical (sorted-keys) JSON of the confirmation minus the `signature`
field.

**Errors**

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_DATE` / `INVALID_TIME` / `INVALID_PARTY` / `INVALID_NAME` | malformed input |
| 402 | — | payment missing/invalid |
| 409 | `OUTSIDE_HOURS` | no seating at that date/time |
| 409 | `SLOT_IN_PAST` | slot already passed |
| 409 | `NO_TABLE` | nothing free that fits the party |

---

## POST /cancel/:id — free (auth: cancelToken)

Body `{ "cancelToken": "…" }` or header `X-Cancel-Token`.

**200 response**

```json
{
  "reservationId": "res_1a2b3c4d5e6f",
  "status": "cancelled",
  "cancelledAt": "2026-08-07T20:11:00.000Z",
  "refunded": true,
  "refundLedgerEntry": { "kind": "refund", "amount": "$0.01", "reason": "cancelled 22.8h before seating — hold refunded", "at": "…" },
  "ledger": [ { "kind": "hold", "…": "…" }, { "kind": "refund", "…": "…" } ],
  "signature": "hex HMAC-SHA256"
}
```

`refunded: false` with a `forfeit` entry when cancelling inside the
free-cancellation window.

**Errors**: `403 BAD_CANCEL_TOKEN`, `404 NOT_FOUND`, `409 ALREADY_CANCELLED`.

---

## GET /reservations/:id — free (auth: cancelToken)

`?cancelToken=…` or header `X-Cancel-Token`. Returns the reservation record
plus its full ledger. Errors: `403`, `404`.

---

## Free utility routes

| Route | Returns |
|---|---|
| `GET /info` | restaurant profile, hours, refund policy, prices, network |
| `GET /health` | `{ ok: true, service, restaurant }` |
| `GET /.well-known/x402` | x402 discovery manifest (resources, prices, schemas) |

---

## 402 response shape

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "resource": "http://localhost:4021/book",
      "description": "Book a table with a refundable hold…",
      "payTo": "0xMerchant…",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "maxTimeoutSeconds": 60
    }
  ]
}
```
