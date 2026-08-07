# Raw HTTP walkthrough: 402 → pay → 200

x402 is plain HTTP. Here is the exact wire flow with `curl` against a local
server started with both networks enabled:

```bash
EVM_PAY_TO=0xYourMerchantAddress SOLANA_PAY_TO=YourSolanaAddress \
  CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... npm run dev
```

(EVM alone is enough — `EVM_PAY_TO=0x... npm run dev`. Solana is only
advertised once a facilitator can settle it.)

## 1. Free routes need no payment

```bash
curl -s http://localhost:4021/info | jq
curl -s http://localhost:4021/openapi.json | jq
curl -s http://localhost:4021/.well-known/x402 | jq
```

## 2. Calling a paid route without payment → HTTP 402

```bash
curl -si "http://localhost:4021/availability?party=2"
```

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base",
      "maxAmountRequired": "1000",            // 0.001 USDC in atomic units
      "resource": "http://localhost:4021/availability",
      "description": "Open reservation slots ...",
      "mimeType": "application/json",
      "payTo": "0xYourMerchantAddress",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on base
      "extra": { "name": "USDC", "version": "2", "decimals": 6 },
      "maxTimeoutSeconds": 60
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4021/availability",
      "description": "Open reservation slots ...",
      "mimeType": "application/json",
      "payTo": "YourSolanaAddress",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  // USDC mint on solana
      "extra": { "name": "USDC", "version": "2", "decimals": 6 },
      "maxTimeoutSeconds": 60
    }
  ]
}
```

The 402 body is machine-readable: it tells any client exactly what to pay,
to whom, and in which asset — once per network the merchant can settle on.
The client picks the entry matching a wallet it holds; the price is the same
on every chain. (An unpaid probe like this one has no `error` field — that
shows up only when an `X-PAYMENT` header was supplied and rejected.)

## 3. Pay: sign the requirement, retry with X-PAYMENT

The client picks its entry from `accepts[]` and signs it — an EIP-3009
`transferWithAuthorization` on EVM, an SPL transfer on Solana — then
base64-encodes the signed payload into one header. Doing that by hand is
miserable — use the 10-line client instead:

```bash
PRIVATE_KEY=0x... npm run client        # runs examples/agent-client.ts
```

Under the hood it retries:

```
GET /availability?party=2
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLC...
```

## 4. 200 + artifact + settlement receipt

```
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4YWJjLi4uIiwibmV0d29yayI6ImJhc2UiLCJwYXllciI6IjB4UGF5ZXIuLi4ifQ==
Content-Type: application/json

{ "restaurant": {...}, "slots": [ { "date": "...", "time": "19:00", ... } ] }
```

`X-PAYMENT-RESPONSE` base64-decodes to the settlement result (`success`,
`transaction`, `network`, `payer`) — your on-chain receipt, on whichever
network you chose to pay on.

## 5. Booking and cancelling

```bash
# paid ($0.01 refundable hold) — via the client, or any x402 library
# returns: reservationId, cancelToken, ics (base64), refund terms, signature

# free cancel with the cancelToken from the booking artifact:
curl -s -X POST http://localhost:4021/cancel/res_XXXX \
  -H 'content-type: application/json' \
  -d '{"cancelToken":"YOUR_TOKEN"}' | jq
```
