/**
 * Full agent flow against x402-tablebook:
 *   1. read the free manifest
 *   2. pay $0.001 for availability
 *   3. pay $0.01 (refundable hold) to book the first workable slot
 *   4. print the confirmation artifact + settlement receipt
 *   5. cancel for free with the cancelToken (refund ledger entry comes back)
 *
 * Usage:
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4021 npx tsx examples/agent-client.ts
 *
 * The wallet needs USDC on the EVM network the server advertises in `accepts[]`
 * — `base` by default. Run the server with X402_EVM_NETWORK=base-sepolia to test
 * for free and fund from the faucet: https://faucet.circle.com
 */
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4021";
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error(
    "Set PRIVATE_KEY to an EVM key funded with USDC on the network the server advertises " +
      "(base by default; base-sepolia faucet: https://faucet.circle.com)",
  );
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

function receipt(res: Response): unknown {
  const header = res.headers.get("x-payment-response");
  return header ? decodeXPaymentResponse(header) : null;
}

// 1. free discovery
const manifest = await fetch(`${BASE_URL}/.well-known/x402`).then((r) => r.json());
console.log("Manifest:", manifest.name, "-", manifest.description, "\n");

// 2. paid availability
const availRes = await payFetch(`${BASE_URL}/availability?party=2&days=7`);
if (!availRes.ok) throw new Error(`availability failed: ${availRes.status}`);
const avail = await availRes.json();
console.log(`Availability (${avail.slots.length} slots). Paid receipt:`);
console.log(receipt(availRes), "\n");

const slot = avail.slots[0];
if (!slot) throw new Error("no open slots — widen the search");
console.log(`Booking ${slot.date} ${slot.time} for 2...`);

// 3. paid booking (refundable hold)
const bookRes = await payFetch(`${BASE_URL}/book`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-payer-address": account.address },
  body: JSON.stringify({
    date: slot.date,
    time: slot.time,
    party: 2,
    name: "Agent Ada",
    notes: "booked autonomously via x402",
  }),
});
if (!bookRes.ok) throw new Error(`book failed: ${bookRes.status} ${await bookRes.text()}`);
const confirmation = await bookRes.json();

// 4. the purchased artifact
console.log("\n=== CONFIRMATION ARTIFACT ===");
console.log(JSON.stringify({ ...confirmation, ics: `${confirmation.ics.slice(0, 40)}...` }, null, 2));
console.log("\nX-PAYMENT-RESPONSE settlement receipt:");
console.log(receipt(bookRes));
console.log("\nICS invite decodes to:\n");
console.log(Buffer.from(confirmation.ics, "base64").toString("utf8").split("\r\n").slice(0, 8).join("\n"), "...");

// 5. free cancel with the cancelToken — refund ledger entry in the response
const cancelRes = await fetch(`${BASE_URL}/cancel/${confirmation.reservationId}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cancelToken: confirmation.cancelToken }),
});
const cancellation = await cancelRes.json();
console.log("\n=== CANCELLATION + REFUND LEDGER ===");
console.log(JSON.stringify(cancellation, null, 2));
