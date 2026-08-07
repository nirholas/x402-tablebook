// Unauthenticated x402 facilitator client: POST /verify, POST /settle.
//
// Used for Sperax (EVM USDC on Base/Arbitrum/Ethereum, EIP-3009 settlement)
// and for any self-hosted facilitator that needs no credentials. Facilitators
// requiring auth get their own class — see cdp.ts.

import type { Facilitator } from "./facilitator.js";
import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResponse,
  VerifyResponse,
  X402Network,
} from "./types.js";

interface FacilitatorReply {
  isValid?: boolean;
  invalidReason?: string;
  success?: boolean;
  errorReason?: string;
  txHash?: string;
  networkId?: string;
  payer?: string;
}

export class HttpFacilitator implements Facilitator {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly supportsNetwork: (network: X402Network) => boolean,
  ) {}

  supports(network: X402Network): boolean {
    return this.supportsNetwork(network);
  }

  async verify(
    payload: PaymentPayload,
    requirement: PaymentRequirement,
  ): Promise<VerifyResponse> {
    const r = await this.post("/verify", {
      paymentPayload: payload,
      paymentRequirements: requirement,
    });
    return { isValid: Boolean(r.isValid), invalidReason: r.invalidReason, payer: r.payer };
  }

  async settle(
    payload: PaymentPayload,
    requirement: PaymentRequirement,
  ): Promise<SettleResponse> {
    const r = await this.post("/settle", {
      paymentPayload: payload,
      paymentRequirements: requirement,
    });
    return {
      success: Boolean(r.success),
      errorReason: r.errorReason,
      txHash: r.txHash,
      networkId: r.networkId,
      payer: r.payer,
    };
  }

  private async post(path: string, body: unknown): Promise<FacilitatorReply> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${this.name} ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as FacilitatorReply;
  }
}
