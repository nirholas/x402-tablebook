/**
 * Single source of truth for prices.
 *
 * The two representations must never drift: the OpenAPI document advertises
 * decimal USD (`x-payment-info.price.amount`) while the runtime 402 challenge
 * advertises token atomic units (`accepts[].maxAmountRequired`). USDC has 6
 * decimals, so $0.01 => "10000".
 */
export interface Price {
  /** Decimal USD, for OpenAPI `x-payment-info`. */
  usd: string;
  /** USDC atomic units, for the runtime 402 challenge. */
  atomic: string;
  /** Short human-readable form, for docs and the /info response. */
  label: string;
}

export const PRICES = {
  availability: { usd: "0.001000", atomic: "1000", label: "$0.001" },
  book: { usd: "0.010000", atomic: "10000", label: "$0.01" },
} as const satisfies Record<string, Price>;
