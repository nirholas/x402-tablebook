// Coinbase Developer Platform x402 facilitator — Solana USDC.
// Authenticated with an Ed25519-signed JWT in the Authorization header.
// Docs: https://docs.cdp.coinbase.com/

import {
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";

import { isSolanaNetwork, type Facilitator } from "./facilitator.js";
import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResponse,
  VerifyResponse,
  X402Network,
} from "./types.js";

export interface CdpCredentials {
  /** UUID-format API Key ID from the CDP dashboard. */
  apiKeyId: string;
  /** Base64-encoded Ed25519 private key from the CDP dashboard. */
  apiKeySecret: string;
}

interface FacilitatorReply {
  isValid?: boolean;
  invalidReason?: string;
  success?: boolean;
  errorReason?: string;
  txHash?: string;
  networkId?: string;
  payer?: string;
}

export class CdpFacilitator implements Facilitator {
  readonly name = "cdp";

  constructor(
    private readonly baseUrl: string,
    private readonly creds: CdpCredentials,
  ) {}

  supports(network: X402Network): boolean {
    return isSolanaNetwork(network);
  }

  async verify(
    payload: PaymentPayload,
    requirement: PaymentRequirement,
  ): Promise<VerifyResponse> {
    const r = await this.signedPost("/verify", {
      paymentPayload: payload,
      paymentRequirements: requirement,
    });
    return { isValid: Boolean(r.isValid), invalidReason: r.invalidReason, payer: r.payer };
  }

  async settle(
    payload: PaymentPayload,
    requirement: PaymentRequirement,
  ): Promise<SettleResponse> {
    const r = await this.signedPost("/settle", {
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

  private async signedPost(path: string, body: unknown): Promise<FacilitatorReply> {
    const url = new URL(this.baseUrl + path);
    const jwt = this.buildJwt("POST", url.host, url.pathname);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`cdp ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as FacilitatorReply;
  }

  /**
   * CDP authenticates with an Ed25519-signed JWT:
   *   header  = { alg: 'EdDSA', typ: 'JWT', kid: apiKeyId, nonce: <hex> }
   *   payload = { sub, iss: 'cdp', aud: ['cdp_service'], nbf, iat, exp: iat+120,
   *               uris: ['<METHOD> <host><path>'] }
   */
  private buildJwt(method: string, host: string, path: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: "EdDSA",
      typ: "JWT",
      kid: this.creds.apiKeyId,
      nonce: randomBytes(16).toString("hex"),
    };
    const payload = {
      sub: this.creds.apiKeyId,
      iss: "cdp",
      aud: ["cdp_service"],
      nbf: now,
      iat: now,
      exp: now + 120,
      uris: [`${method.toUpperCase()} ${host}${path}`],
    };

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = cryptoSign(
      null,
      Buffer.from(signingInput),
      parseEd25519PrivateKey(this.creds.apiKeySecret),
    );
    return `${signingInput}.${base64urlBuffer(signature)}`;
  }
}

function base64url(input: string): string {
  return base64urlBuffer(Buffer.from(input));
}

function base64urlBuffer(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** PKCS#8 DER prefix for a raw Ed25519 seed. */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Accepts the CDP secret either as a raw base64 Ed25519 seed (what the CDP UI
 * emits, 32 or 64 bytes) or as a PEM-encoded PKCS#8 key (older keys).
 */
function parseEd25519PrivateKey(secret: string): KeyObject {
  const trimmed = secret.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return createPrivateKey({ key: trimmed, format: "pem" });
  }
  const raw = Buffer.from(trimmed, "base64");
  if (raw.length !== 32 && raw.length !== 64) {
    throw new Error(
      `CDP_API_KEY_SECRET: unexpected key length ${raw.length} (expected 32 or 64 bytes, or PEM)`,
    );
  }
  // 64-byte expanded keys carry the seed in the first 32 bytes.
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, raw.subarray(0, 32)]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}
