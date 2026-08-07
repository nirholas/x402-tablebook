import { CdpFacilitator } from "./cdp.js";
import { isEvmNetwork, isSolanaNetwork, type Facilitator } from "./facilitator.js";
import { HttpFacilitator } from "./http-facilitator.js";
import type { X402Network } from "./types.js";

/** Canonical USDC contract/mint per network. */
export const USDC_ASSETS: Record<X402Network, { address: string; decimals: number }> = {
  base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  "base-sepolia": { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
  arbitrum: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  ethereum: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  solana: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  "solana-devnet": { address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 },
};

export interface X402Config {
  /** Networks to advertise, in the order they appear in `accepts[]`. */
  networks: X402Network[];
  /** Recipient wallet per advertised network. */
  recipients: Partial<Record<X402Network, string>>;
  evmFacilitatorUrl: string;
  solanaFacilitatorUrl: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
}

const DEFAULT_EVM_FACILITATOR = "https://x402.sperax.io";
const DEFAULT_SOLANA_FACILITATOR =
  "https://api.cdp.coinbase.com/platform/v2/x402/facilitator";

/**
 * Builds the payment config from the environment.
 *
 * A network is only advertised when it has both a recipient wallet and a
 * facilitator that can settle it — advertising a network we cannot settle
 * would strand any agent that picked it out of `accepts[]`.
 *
 * Returns null when nothing is payable, which the server treats as fatal.
 */
export function loadX402ConfigFromEnv(): X402Config | null {
  const networks: X402Network[] = [];
  const recipients: Partial<Record<X402Network, string>> = {};

  // EVM. PAY_TO_ADDRESS is the pre-multi-network name, still honoured.
  const evmRecipient = (process.env.EVM_PAY_TO ?? process.env.PAY_TO_ADDRESS)?.trim();
  if (evmRecipient) {
    const network = (process.env.X402_EVM_NETWORK ?? "base").trim() as X402Network;
    if (!isEvmNetwork(network)) {
      throw new Error(`X402_EVM_NETWORK must be an EVM network, got "${network}"`);
    }
    networks.push(network);
    recipients[network] = evmRecipient;
  }

  // Solana. The default facilitator (CDP) needs credentials; a self-hosted one
  // set via X402_FACILITATOR_SOLANA is assumed open.
  const solanaFacilitatorUrl = process.env.X402_FACILITATOR_SOLANA?.trim();
  const hasCdpCreds = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
  const solRecipient = process.env.SOLANA_PAY_TO?.trim();
  if (solRecipient && (hasCdpCreds || solanaFacilitatorUrl)) {
    const network = (process.env.X402_SOLANA_NETWORK ?? "solana").trim() as X402Network;
    if (!isSolanaNetwork(network)) {
      throw new Error(`X402_SOLANA_NETWORK must be a Solana network, got "${network}"`);
    }
    networks.push(network);
    recipients[network] = solRecipient;
  } else if (solRecipient) {
    console.warn(
      "  SOLANA_PAY_TO is set but no Solana facilitator is configured — Solana will not\n" +
        "  be advertised. Set CDP_API_KEY_ID + CDP_API_KEY_SECRET, or X402_FACILITATOR_SOLANA.",
    );
  }

  if (networks.length === 0) return null;

  return {
    networks,
    recipients,
    evmFacilitatorUrl: process.env.X402_FACILITATOR_EVM ?? DEFAULT_EVM_FACILITATOR,
    solanaFacilitatorUrl: solanaFacilitatorUrl ?? DEFAULT_SOLANA_FACILITATOR,
    cdpApiKeyId: process.env.CDP_API_KEY_ID,
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
  };
}

export function buildFacilitators(config: X402Config): Facilitator[] {
  const facilitators: Facilitator[] = [
    new HttpFacilitator("evm-facilitator", config.evmFacilitatorUrl, isEvmNetwork),
  ];

  if (config.cdpApiKeyId && config.cdpApiKeySecret) {
    facilitators.push(
      new CdpFacilitator(config.solanaFacilitatorUrl, {
        apiKeyId: config.cdpApiKeyId,
        apiKeySecret: config.cdpApiKeySecret,
      }),
    );
  } else if (config.networks.some(isSolanaNetwork)) {
    facilitators.push(
      new HttpFacilitator("solana-facilitator", config.solanaFacilitatorUrl, isSolanaNetwork),
    );
  }

  return facilitators;
}
