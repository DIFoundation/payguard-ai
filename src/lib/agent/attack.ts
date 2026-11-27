import type { Address } from "viem";
import type { SignedPaymentRequest } from "@/types";

export type TamperKind = "redirect-recipient" | "alter-amount";

/**
 * Simulates what a compromised or prompt-injected agent would try: keep the recipient's genuine
 * signature but change a signed field. The contract must reject every variant.
 */
export function tamperRequest(
  req: SignedPaymentRequest,
  kind: TamperKind,
  attacker: Address,
): SignedPaymentRequest {
  switch (kind) {
    case "redirect-recipient":
      return { ...req, recipient: attacker };
    case "alter-amount":
      // +1 token (6 decimals): small enough to stay under typical caps, so the contract
      // rejects it for the signature mismatch rather than for a spending limit.
      return { ...req, amount: (BigInt(req.amount) + 1_000_000n).toString() };
  }
}
