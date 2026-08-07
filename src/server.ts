import "dotenv/config";
import express from "express";

import { buildOpenApiDocument } from "./openapi.js";
import { PRICES } from "./pricing.js";
import {
  BookingError,
  book,
  cancel,
  config,
  getAvailability,
  getReservation,
} from "./service.js";
import { buildX402Manifest } from "./well-known.js";
import { loadX402ConfigFromEnv, x402Gate } from "./x402/index.js";

const PORT = Number(process.env.PORT || 4021);

/**
 * Public origin of this deployment, used as the `servers` entry in the OpenAPI
 * document. Behind a proxy the request host is already correct, so this is only
 * needed when the proxy rewrites it.
 */
const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");

const x402 = loadX402ConfigFromEnv();
if (!x402) {
  console.error(
    "\n  No payment recipient configured.\n" +
      "  Set at least one of:\n" +
      "    EVM_PAY_TO=0xYourAddress          (USDC on Base by default)\n" +
      "    SOLANA_PAY_TO=YourSolanaAddress   (needs CDP_API_KEY_ID + CDP_API_KEY_SECRET)\n" +
      "  See .env.example.\n",
  );
  process.exit(1);
}

const app = express();

// Trust the proxy so req.protocol/req.get('host') reflect the public origin
// rather than the internal one — the 402 challenge embeds them in `resource`.
app.set("trust proxy", true);

app.use(express.json());

function originOf(req: express.Request): string {
  return PUBLIC_URL ?? `${req.protocol}://${req.get("host") ?? `localhost:${PORT}`}`;
}

// ---- discovery (free) ------------------------------------------------------

app.get("/openapi.json", (req, res) => {
  res.json(buildOpenApiDocument(originOf(req)));
});

app.get("/.well-known/x402", (_req, res) => {
  res.json(buildX402Manifest(x402));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-tablebook", restaurant: config.restaurant.name });
});

app.get("/info", (_req, res) => {
  res.json({
    restaurant: config.restaurant,
    hours: config.hours,
    refundPolicy: config.refundPolicy,
    prices: { availability: PRICES.availability.label, book: PRICES.book.label },
    networks: x402.networks,
  });
});

// ---- paid routes -----------------------------------------------------------
//
// The gate is mounted per route and ahead of every handler, so an unpaid probe
// always gets the 402 challenge instead of a validation error.

app.get(
  "/availability",
  x402Gate(x402, {
    priceAtomic: PRICES.availability.atomic,
    description:
      "Open reservation slots (date, time, seatable party sizes, table types) for the booking window",
  }),
  (req, res) => {
    res.json(
      getAvailability({
        date: typeof req.query.date === "string" ? req.query.date : undefined,
        party: req.query.party ? Number(req.query.party) : undefined,
        days: req.query.days ? Number(req.query.days) : undefined,
      }),
    );
  },
);

app.post(
  "/book",
  x402Gate(x402, {
    priceAtomic: PRICES.book.atomic,
    description:
      "Book a table with a refundable hold. Returns reservationId, confirmed time, table, refund " +
      "terms, cancel token, and a base64 ICS calendar invite",
  }),
  (req, res) => {
    try {
      const payer = req.x402?.payer ?? req.header("x-payer-address") ?? req.body?.payerWallet;
      res.json(book({ ...req.body, payerWallet: payer }));
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ---- free, authenticated by cancelToken ------------------------------------

app.post("/cancel/:id", (req, res) => {
  try {
    const token = req.body?.cancelToken ?? req.header("x-cancel-token") ?? undefined;
    res.json(cancel(req.params.id, token));
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/reservations/:id", (req, res) => {
  try {
    const token =
      (typeof req.query.cancelToken === "string" ? req.query.cancelToken : undefined) ??
      req.header("x-cancel-token") ??
      undefined;
    res.json(getReservation(req.params.id, token));
  } catch (err) {
    handleError(err, res);
  }
});

// Static assets last so they can never shadow an API route.
app.use(express.static("public"));

function handleError(err: unknown, res: express.Response): void {
  if (err instanceof BookingError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "INTERNAL", message: "unexpected error" });
}

app.listen(PORT, () => {
  const networks = x402.networks
    .map((n) => `${n} → ${x402.recipients[n]}`)
    .join("\n                            ");
  console.log(`\n  x402-tablebook — ${config.restaurant.name}`);
  console.log(`  ${PUBLIC_URL ?? `http://localhost:${PORT}`}\n`);
  console.log("  Paid routes (x402, USDC):");
  console.log(`    GET  /availability      ${PRICES.availability.label}`);
  console.log(`    POST /book              ${PRICES.book.label}  (refundable hold)`);
  console.log(`  Accepting payment on:     ${networks}`);
  console.log("  Free routes:");
  console.log("    GET  /health  /info  /reservations/:id");
  console.log("    POST /cancel/:id        (auth: cancelToken)");
  console.log("  Discovery:");
  console.log(`    GET  /openapi.json`);
  console.log(`    GET  /.well-known/x402\n`);
});
