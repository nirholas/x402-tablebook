import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResponse,
  VerifyResponse,
  X402Network,
} from "./types.js";

/**
 * A facilitator verifies and settles payments for the networks it supports.
 * Sperax handles EVM, CDP handles Solana.
 */
export interface Facilitator {
  readonly name: string;
  supports(network: X402Network): boolean;
  verify(payload: PaymentPayload, requirement: PaymentRequirement): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirement: PaymentRequirement): Promise<SettleResponse>;
}

const EVM_NETWORKS: X402Network[] = ["base", "base-sepolia", "arbitrum", "ethereum"];
const SOLANA_NETWORKS: X402Network[] = ["solana", "solana-devnet"];

export function isEvmNetwork(n: X402Network): boolean {
  return EVM_NETWORKS.includes(n);
}

export function isSolanaNetwork(n: X402Network): boolean {
  return SOLANA_NETWORKS.includes(n);
}
