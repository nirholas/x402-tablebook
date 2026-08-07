import "dotenv/config";
import express from "express";
import { CHECKOUT_PATH, mountSolanaCheckout } from "./checkout.js";
import {
  EVM_NETWORK,
  EVM_PAY_TO,
  SOLANA_NETWORK,
  SOLANA_PAY_TO,
  USING_DEFAULT_PAY_TO,
  paywall,
  railSummary,
  type RouteMap,
} from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import { BookingError, book, cancel, config, getAvailability, getReservation } from "./service.js";

const PORT = Number(process.env.PORT || 4021);

export const PRICES = {
  availability: "$0.001",
  book: "$0.01",
} as const;

/** Paid routes. Anything not listed here is free. */
const routes: RouteMap = {
  "GET /availability": {
    price: PRICES.availability,
    description:
      "Open reservation slots (date, time, seatable party sizes, table types) for the booking window",
    // Request/response schemas mirror openapi.json — see src/schemas.ts.
    ...ROUTE_SCHEMAS["GET /availability"],
  },
  "POST /book": {
    price: PRICES.book,
    description:
      "Book a table with a refundable hold. Returns reservationId, confirmed time, table, refund terms, cancel token, and a base64 ICS calendar invite",
    ...ROUTE_SCHEMAS["POST /book"],
  },
};

const app = express();
app.use(express.json());
// A malformed JSON body must not pre-empt the paywall. The x402 discovery spec
// requires a probe to reach the 402 challenge *before* body validation rejects
// the request, so a parse failure drops the body and falls through instead of
// answering 400. The route handler still rejects it once payment verifies, and
// a 4xx from the handler never settles — so a bad body is never charged for.
app.use(
  (
    err: unknown,
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (err instanceof SyntaxError && "body" in err) {
      req.body = {};
      next();
      return;
    }
    next(err);
  },
);
// Solana browser checkout for public/index.html (EVM needs no server help).
const solanaCheckout = await mountSolanaCheckout(app);
app.use(paywall(routes, { baseUrl: process.env.PUBLIC_BASE_URL }));
app.use(express.static("public", { setHeaders: (res, p) => {
  if (p.endsWith("/.well-known/x402")) res.setHeader("Content-Type", "application/json");
} }));

// ---- free routes -----------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-tablebook", restaurant: config.restaurant.name });
});

app.get("/info", (_req, res) => {
  res.json({
    restaurant: config.restaurant,
    hours: config.hours,
    refundPolicy: config.refundPolicy,
    prices: PRICES,
    payment: {
      rails: [
        { rail: "evm", network: EVM_NETWORK, asset: "USDC", payTo: EVM_PAY_TO },
        { rail: "solana", network: SOLANA_NETWORK, asset: "USDC", payTo: SOLANA_PAY_TO },
      ],
    },
  });
});

// ---- paid routes (payment enforced by the paywall above) -------------------

app.get("/availability", (req, res) => {
  const q = {
    date: typeof req.query.date === "string" ? req.query.date : undefined,
    party: req.query.party ? Number(req.query.party) : undefined,
    days: req.query.days ? Number(req.query.days) : undefined,
  };
  res.json(getAvailability(q));
});

app.post("/book", (req, res) => {
  try {
    const payer = req.header("x-payer-address") ?? res.locals.x402?.payer ?? req.body?.payerWallet;
    const confirmation = book({ ...req.body, payerWallet: payer });
    // If settlement fails after this point, release the table again.
    res.locals.x402Rollback = () => {
      try {
        cancel(confirmation.reservationId, confirmation.cancelToken);
      } catch {
        /* already gone */
      }
    };
    res.json(confirmation);
  } catch (err) {
    handleError(err, res);
  }
});

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

function handleError(err: unknown, res: express.Response): void {
  if (err instanceof BookingError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "INTERNAL", message: "unexpected error" });
}

app.listen(PORT, () => {
  console.log(`\n  x402-tablebook — ${config.restaurant.name}`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log("  Paid routes — pay in USDC on Base or Solana, your client picks the rail:");
  console.log(`    GET  /availability      ${PRICES.availability}`);
  console.log(`    POST /book              ${PRICES.book}  (refundable hold)`);
  console.log("  Free routes:");
  console.log("    GET  /health  /info  /reservations/:id");
  console.log("    POST /cancel/:id        (auth: cancelToken)");
  console.log("");
  for (const line of railSummary()) console.log(`  ${line}`);
  console.log(
    `  Solana browser checkout: ${solanaCheckout ? `mounted at ${CHECKOUT_PATH}` : "disabled"}`,
  );
  if (USING_DEFAULT_PAY_TO) {
    console.log(
      "  NOTE: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log(`  Manifest: http://localhost:${PORT}/.well-known/x402`);
  console.log(`  Demo:     http://localhost:${PORT}/\n`);
});
