# Tutorial — from zero to a paid reservation

This walkthrough takes you from clone to a booked (and cancelled) table using
real x402 payments on Base Sepolia testnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-tablebook
cd x402-tablebook
npm install
```

Requirements: Node 18+.

## 2. Configure

Copy the env template and set your merchant address (any EVM address you
control — it receives the USDC):

```bash
cp .env.example .env
# edit .env → EVM_PAY_TO=0xYourMerchantAddress
#             X402_EVM_NETWORK=base-sepolia   # testnet for this walkthrough
```

`X402_EVM_NETWORK` defaults to Base **mainnet**; set it to `base-sepolia`
while you are following along so the payments below cost nothing real. To
also take Solana USDC, add `SOLANA_PAY_TO` plus `CDP_API_KEY_ID` /
`CDP_API_KEY_SECRET` — both networks then appear side by side in every 402.

Describe your actual floor in `config/tables.json`: restaurant profile,
opening hours per weekday (`null` = closed), tables with seat counts and
types, `slotMinutes` (booking grid), `seatingMinutes` (how long a table is
blocked), and the refund policy for the hold.

## 3. Run the server

```bash
npm run dev
```

You'll see the banner with paid routes and prices. Sanity checks:

```bash
curl -s http://localhost:4021/health | jq
curl -s http://localhost:4021/info | jq
curl -s http://localhost:4021/openapi.json | jq
curl -s http://localhost:4021/.well-known/x402 | jq
```

The banner also lists every network you are accepting payment on — if you
set `SOLANA_PAY_TO` but no facilitator credentials, Solana is deliberately
left out rather than advertised unsettleable.

## 4. Your first 402

Call a paid route without paying:

```bash
curl -si "http://localhost:4021/availability?party=2" | head -20
```

You get `HTTP/1.1 402 Payment Required` and a JSON body whose `accepts[]`
array tells any x402 client the exact amount (in atomic USDC units), the
USDC contract or mint, your merchant address, and the network — **one entry
per configured network**, so a client with only a Solana wallet and a client
with only an EVM wallet can both pay the same route. This is the whole
protocol: the 402 *is* the price list.

## 5. Fund a client wallet

Create a throwaway key (e.g. `openssl rand -hex 32` prefixed with `0x`, or
export one from a test wallet) and fund it with **Base Sepolia USDC** from
<https://faucet.circle.com>. You need a few cents' worth.

## 6. Make the paid calls

```bash
PRIVATE_KEY=0xYourFundedKey npm run client
```

`examples/agent-client.ts` will:

1. read the free manifest,
2. pay **$0.001** for `GET /availability`,
3. pay **$0.01** (refundable hold) for `POST /book` on the first open slot,
4. print the confirmation artifact — reservation id, table, refund terms,
   `cancelToken`, HMAC signature — plus the decoded `X-PAYMENT-RESPONSE`
   settlement receipt (transaction hash on Base Sepolia),
5. decode the base64 `ics` field into a calendar invite,
6. cancel for free with the `cancelToken` and print the refund ledger entry.

## 7. Reading the artifact

Everything you paid for is in the 200 body:

- `reservationId` — your reference; `cancelToken` — bearer credential for
  cancellation. Store both.
- `ics` — base64 `.ics`; `Buffer.from(ics, "base64")` and save to a file to
  import into any calendar.
- `signature` — HMAC-SHA256 over the canonical confirmation JSON with the
  server's `SIGNING_SECRET`; tamper-evidence for disputes.
- `ledgerEntry` — the recorded hold. Cancelling ≥ 2h ahead (configurable)
  yields a `refund` entry; later cancellations yield `forfeit`.

## 8. The human checkout

Open <http://localhost:4021> — a Resy-style page using the drop-in
`@three-ws/x402-payment-modal`. Search slots, tap one, pay from a browser
wallet, download the invite, cancel with one click.

## 9. Going to mainnet

1. Drop `X402_EVM_NETWORK=base-sepolia` (or set it to `base`) — mainnet is
   the default.
2. Use a real merchant wallet for `EVM_PAY_TO`. `X402_FACILITATOR_EVM`
   already points at a production facilitator (Sperax); override it to use
   another.
3. Optionally accept Solana too: `SOLANA_PAY_TO` plus `CDP_API_KEY_ID` and
   `CDP_API_KEY_SECRET` from <https://portal.cdp.coinbase.com/> (or a
   self-hosted `X402_FACILITATOR_SOLANA`). Without a facilitator that can
   settle it, Solana is not advertised at all.
4. Set a strong `SIGNING_SECRET`.
5. Deploy behind HTTPS at a permanent public URL (agents will refuse to pay
   plaintext endpoints) and keep `data/` on a persistent volume. Set
   `PUBLIC_URL` if a proxy rewrites the Host header.

Discovery indexers fetch `GET {origin}/openapi.json` and then probe the paid
routes on that **same origin**, so register the deployment's URL — the
GitHub Pages docs site can never return a 402 and cannot stand in for it.

Prices live in one place (`src/pricing.ts`) as both a dollar label (`$0.01`)
and USDC atomic units (`10000`); the 402 challenge advertises the atomic
amount on each configured network.
