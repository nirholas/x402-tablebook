import type { NextFunction, Request, RequestHandler, Response } from "express";

import { buildFacilitators, USDC_ASSETS, type X402Config } from "./config.js";
import type { Facilitator } from "./facilitator.js";
import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentRequirementsResponse,
} from "./types.js";

export interface RoutePayment {
  /** Price in USDC atomic units (6 decimals). "10000" = $0.01. */
  priceAtomic: string;
  /** Shown to the payer's wallet. */
  description: string;
}

/**
 * Every advertised network becomes one entry in `accepts[]`, so an agent with
 * either an EVM or a Solana wallet can pay for the same route.
 */
function buildRequirements(
  config: X402Config,
  route: RoutePayment,
  resource: string,
): PaymentRequirement[] {
  return config.networks
    .filter((network) => config.recipients[network])
    .map((network) => {
      const asset = USDC_ASSETS[network];
      return {
        scheme: "exact",
        network,
        maxAmountRequired: route.priceAtomic,
        resource,
        description: route.description,
        mimeType: "application/json",
        payTo: config.recipients[network]!,
        asset: asset.address,
        extra: { name: "USDC", version: "2", decimals: asset.decimals },
        maxTimeoutSeconds: 60,
      } satisfies PaymentRequirement;
    });
}

function decodePaymentHeader(raw: string): PaymentPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as PaymentPayload;
    if (parsed.x402Version !== 1) return null;
    if (parsed.scheme !== "exact") return null;
    if (!parsed.network || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Gates a route behind an x402 payment.
 *
 *   1. No `X-PAYMENT` header  → 402 carrying every acceptable payment option.
 *   2. Header present         → decode, verify and settle with the facilitator
 *                               for that network, attach `req.x402`, continue.
 *   3. Verify/settle failure  → 402 with the reason.
 *
 * This runs before any body or query validation so an unpaid probe always sees
 * the 402 challenge rather than a 400 — x402scan's discovery depends on it.
 */
export function x402Gate(config: X402Config, route: RoutePayment): RequestHandler {
  const facilitators: Facilitator[] = buildFacilitators(config);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const host = req.get("host") ?? "localhost";
    const resource = `${req.protocol}://${host}${req.originalUrl}`;
    const accepts = buildRequirements(config, route, resource);

    const challenge = (error?: string): void => {
      const body: PaymentRequirementsResponse = { x402Version: 1, accepts, ...(error ? { error } : {}) };
      res.status(402).json(body);
    };

    const header = req.header("x-payment");
    if (!header) return challenge();

    const payload = decodePaymentHeader(header);
    if (!payload) return challenge("malformed X-PAYMENT header");

    const requirement = accepts.find((r) => r.network === payload.network);
    if (!requirement) return challenge(`network ${payload.network} not accepted`);

    const facilitator = facilitators.find((f) => f.supports(payload.network));
    if (!facilitator) {
      res.status(503).json({ error: `no facilitator configured for ${payload.network}` });
      return;
    }

    try {
      const verified = await facilitator.verify(payload, requirement);
      if (!verified.isValid) return challenge(verified.invalidReason ?? "payment invalid");

      const settled = await facilitator.settle(payload, requirement);
      if (!settled.success) return challenge(settled.errorReason ?? "settlement failed");

      req.x402 = {
        network: payload.network,
        payer: settled.payer ?? verified.payer ?? "",
        txHash: settled.txHash ?? "",
        amount: requirement.maxAmountRequired,
        asset: requirement.asset,
      };

      res.setHeader(
        "X-PAYMENT-RESPONSE",
        Buffer.from(
          JSON.stringify({
            success: true,
            transaction: settled.txHash,
            network: payload.network,
            payer: req.x402.payer,
          }),
        ).toString("base64"),
      );

      next();
    } catch (err) {
      console.error("x402 settlement error:", err);
      challenge("facilitator unavailable");
    }
  };
}
