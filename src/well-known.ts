/**
 * `/.well-known/x402` manifest.
 *
 * Secondary to the OpenAPI document in x402scan's discovery precedence, but
 * cheap to serve and read by other agent tooling. Generated from the same
 * price and network config as the 402 challenge so the three never disagree.
 */

import { PRICES } from "./pricing.js";
import { config } from "./service.js";
import type { X402Config } from "./x402/index.js";

export function buildX402Manifest(x402: X402Config): Record<string, unknown> {
  return {
    x402Version: 1,
    name: "x402-tablebook",
    description:
      `Restaurant reservations at ${config.restaurant.name}, bookable by AI agents. ` +
      "Paid per call in USDC over x402; the booking fee is a refundable hold.",
    networks: x402.networks,
    accepts: x402.networks.map((network) => ({ network, payTo: x402.recipients[network] })),
    resources: [
      {
        resource: "GET /availability",
        description:
          "Open reservation slots for the booking window: date, time, seatable party sizes, " +
          "table types, open table count. Filter with ?date=YYYY-MM-DD&party=N&days=N.",
        price: PRICES.availability.label,
        priceAtomic: PRICES.availability.atomic,
        networks: x402.networks,
        asset: "USDC",
      },
      {
        resource: "POST /book",
        description:
          `Book a table with a ${PRICES.book.label} refundable hold. Body: {date, time, party, name, notes?}. ` +
          "Returns the confirmed reservation, table assignment, refund terms, cancelToken, ledger " +
          "entry, HMAC signature, and a base64 ICS calendar invite.",
        price: PRICES.book.label,
        priceAtomic: PRICES.book.atomic,
        networks: x402.networks,
        asset: "USDC",
      },
    ],
    freeResources: [
      { resource: "GET /info", description: "Restaurant profile, hours, refund policy, prices" },
      {
        resource: "POST /cancel/:id",
        description:
          "Cancel a reservation (auth: cancelToken from /book). Returns the cancellation record " +
          "and refund ledger entry.",
      },
      {
        resource: "GET /reservations/:id",
        description: "Look up a reservation (auth: cancelToken)",
      },
      { resource: "GET /health", description: "Liveness check" },
      { resource: "GET /openapi.json", description: "OpenAPI 3.1 document" },
    ],
  };
}
