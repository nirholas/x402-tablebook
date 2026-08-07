# Raw HTTP walkthrough: 402 → pay → 200

x402 is plain HTTP. Here is the exact wire flow with `curl` against a local
server (`PAY_TO_ADDRESS=0x... npm run dev`).

## 1. Free routes need no payment

```bash
curl -s http://localhost:4021/info | jq
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
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",            // 0.001 USDC in atomic units
      "resource": "http://localhost:4021/availability",
      "description": "Open reservation slots ...",
      "payTo": "0xYourMerchantAddress",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC on base-sepolia
      "maxTimeoutSeconds": 60
    }
  ]
}
```

The 402 body is machine-readable: it tells any client exactly what to pay,
to whom, on which network, in which asset.

## 3. Pay: sign the requirement, retry with X-PAYMENT

The client signs an EIP-3009 `transferWithAuthorization` for the amount in
`accepts[0]` and base64-encodes the signed payload into one header. Doing
that by hand is miserable — use the 10-line client instead:

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
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0eEhhc2giOiIweGFiYy4uLiIsIm5ldHdvcmsiOiJiYXNlLXNlcG9saWEifQ==
Content-Type: application/json

{ "restaurant": {...}, "slots": [ { "date": "...", "time": "19:00", ... } ] }
```

`X-PAYMENT-RESPONSE` base64-decodes to the settlement result (success, tx
hash, network) — your on-chain receipt.

## 5. Booking and cancelling

```bash
# paid ($0.01 refundable hold) — via the client, or any x402 library
# returns: reservationId, cancelToken, ics (base64), refund terms, signature

# free cancel with the cancelToken from the booking artifact:
curl -s -X POST http://localhost:4021/cancel/res_XXXX \
  -H 'content-type: application/json' \
  -d '{"cancelToken":"YOUR_TOKEN"}' | jq
```
