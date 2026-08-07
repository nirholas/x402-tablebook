// x402 protocol types.
//
// Two facilitators are supported so a single route can advertise both an EVM
// and a Solana payment option in `accepts[]`:
//   - Sperax (EVM: Base, Arbitrum, Ethereum) — EIP-3009 settlement
//   - Coinbase CDP (Solana)                  — SPL token transfer settlement

export type X402Network =
  | "base"
  | "base-sepolia"
  | "arbitrum"
  | "ethereum"
  | "solana"
  | "solana-devnet";

export type X402Scheme = "exact";

export interface PaymentRequirement {
  scheme: X402Scheme;
  network: X402Network;
  /** Amount in token base units (string to avoid bigint JSON issues). USDC has 6 decimals. */
  maxAmountRequired: string;
  /** Resource URL the payment grants access to. */
  resource: string;
  description: string;
  mimeType: string;
  /** Wallet that receives the payment. */
  payTo: string;
  /** Token contract / mint address. */
  asset: string;
  extra?: Record<string, unknown>;
  maxTimeoutSeconds: number;
}

export interface PaymentRequirementsResponse {
  x402Version: 1;
  accepts: PaymentRequirement[];
  /** Human-readable reason, for clients that don't speak x402. */
  error?: string;
}

/**
 * Decoded body of the `X-PAYMENT` header. The shape of `payload` is
 * network-specific (EIP-3009 authorization for EVM, signed transaction for Solana).
 */
export interface PaymentPayload {
  x402Version: 1;
  scheme: X402Scheme;
  network: X402Network;
  payload: unknown;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  txHash?: string;
  networkId?: string;
  payer?: string;
}

/** Attached to `req` after successful settlement. */
export interface X402PaymentContext {
  network: X402Network;
  payer: string;
  txHash: string;
  amount: string;
  asset: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      x402?: X402PaymentContext;
    }
  }
}
