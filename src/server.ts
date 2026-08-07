import "dotenv/config";
import express from "express";
import { paymentMiddleware, type RoutesConfig, type Network } from "x402-express";
import { BookingError, book, cancel, config, getAvailability, getReservation } from "./service.js";

const PORT = Number(process.env.PORT || 4021);
const NETWORK = (process.env.NETWORK || "base-sepolia") as Network;
const FACILITATOR_URL = (process.env.FACILITATOR_URL ||
  "https://x402.org/facilitator") as `${string}://${string}`;

const payTo = process.env.PAY_TO_ADDRESS;
if (!payTo || !payTo.startsWith("0x")) {
  console.error(
    "\n  Missing PAY_TO_ADDRESS.\n" +
      "  Set it to the EVM address that should receive USDC payments, e.g.\n" +
      "    PAY_TO_ADDRESS=0xYourAddress npm run dev\n",
  );
  process.exit(1);
}

export const PRICES = {
  availability: "$0.001",
  book: "$0.01",
} as const;

const routes: RoutesConfig = {
  "GET /availability": {
    price: PRICES.availability,
    network: NETWORK,
    config: {
      description:
        "Open reservation slots (date, time, seatable party sizes, table types) for the booking window",
      discoverable: true,
    },
  },
  "POST /book": {
    price: PRICES.book,
    network: NETWORK,
    config: {
      description:
        "Book a table with a refundable hold. Returns reservationId, confirmed time, table, refund terms, cancel token, and a base64 ICS calendar invite",
      discoverable: true,
    },
  },
};

const app = express();
app.use(express.json());
app.use(paymentMiddleware(payTo as `0x${string}`, routes, { url: FACILITATOR_URL }));
app.use(express.static("public"));

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
    network: NETWORK,
  });
});

// ---- paid routes (payment enforced by middleware above) --------------------

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
    const payer = req.header("x-payer-address") ?? req.body?.payerWallet;
    res.json(book({ ...req.body, payerWallet: payer }));
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
  console.log("  Paid routes (x402, USDC on " + NETWORK + "):");
  console.log(`    GET  /availability      ${PRICES.availability}`);
  console.log(`    POST /book              ${PRICES.book}  (refundable hold)`);
  console.log("  Free routes:");
  console.log("    GET  /health  /info  /reservations/:id");
  console.log("    POST /cancel/:id        (auth: cancelToken)");
  console.log(`  Manifest: http://localhost:${PORT}/.well-known/x402\n`);
});
