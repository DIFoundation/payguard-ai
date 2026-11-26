import type {
  RiskAssessment,
  RiskFinding,
  RiskRecommendation,
  RiskSeverity,
  SignedPaymentRequest,
} from "@/types";

export const RISK_ENGINE_VERSION = "1.0.0";

/** Facts gathered by the verification layer before the engine runs. */
export interface RiskContext {
  /** Connected payer wallet, if any. */
  payer?: string | null;
  /** Recipient address from the draft/request being evaluated. */
  recipient?: string | null;
  /** Amount in base units the payer intends to send. */
  amount?: string | null;
  /** Token address the payer intends to send. */
  token?: string | null;
  /** Whether the active chain is the expected chain. */
  chainOk?: boolean | null;
  /** Whether payer has enough token balance (base units string). */
  balanceBaseUnits?: string | null;
  /** True when recipient address has code (contract). */
  recipientIsContract?: boolean | null;

  /** The signed payment request being evaluated, if any. */
  request?: SignedPaymentRequest | null;
  /** Signature recovery result: true valid, false invalid, null not checked. */
  signatureValid?: boolean | null;
  /** Whether recovered signer equals request.recipient. */
  signerMatchesRecipient?: boolean | null;
  /** Whether request.chainId matches the active chain. */
  requestChainOk?: boolean | null;
  /** Whether request.token matches the expected token. */
  requestTokenOk?: boolean | null;
  /** Whether the request has expired at evaluation time. */
  requestExpired?: boolean | null;
  /** Whether request.payer matches the connected wallet (when specified). */
  payerMatchesRequest?: boolean | null;
  /** Whether recipient is registered in PayGuardRegistry (null = unknown). */
  recipientRegistered?: boolean | null;
  /** Whether request fields match the draft payment details. */
  requestMatchesDraft?: boolean | null;
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function finding(
  code: string,
  title: string,
  severity: RiskSeverity,
  explanation: string,
  evidence: RiskFinding["evidence"],
  action: string,
): RiskFinding {
  return { code, title, severity, explanation, evidence, action };
}

export function evaluateRisk(ctx: RiskContext, now: number = Date.now()): RiskAssessment {
  const findings: RiskFinding[] = [];
  const req = ctx.request ?? null;

  // ---- Structural / input validation ----
  if (!ctx.recipient) {
    findings.push(
      finding(
        "NO_RECIPIENT",
        "Missing recipient",
        "high",
        "No recipient address was provided. A payment cannot be verified without a destination.",
        "user_input",
        "Enter a valid recipient wallet address or import a signed payment request.",
      ),
    );
  } else if (ctx.recipient === "0x0000000000000000000000000000000000000000") {
    findings.push(
      finding(
        "ZERO_ADDRESS",
        "Recipient is the zero address",
        "critical",
        "The zero address cannot receive ERC-20 transfers in any meaningful way; funds sent there are burned or locked.",
        "user_input",
        "Do not proceed. Replace the recipient with a real wallet address.",
      ),
    );
  }

  if (ctx.amount === undefined || ctx.amount === null || !/^\d+$/.test(ctx.amount) || BigInt(ctx.amount) <= 0n) {
    findings.push(
      finding(
        "INVALID_AMOUNT",
        "Invalid payment amount",
        "high",
        "The payment amount must be a positive integer expressed in token base units (e.g. 50000000 = 50 tUSD8).",
        "user_input",
        "Enter a valid amount. Never use floating-point values for payments.",
      ),
    );
  }

  if (ctx.chainOk === false) {
    findings.push(
      finding(
        "WRONG_CHAIN",
        "Connected to the wrong network",
        "critical",
        "The wallet is not connected to QDay Aevum Testnet. Transactions on another chain would not settle tUSD8.",
        "wallet",
        "Switch the wallet network to QDay Aevum Testnet before paying.",
      ),
    );
  }

  if (ctx.token && ctx.request && ctx.request.token.toLowerCase() !== ctx.token.toLowerCase()) {
    findings.push(
      finding(
        "TOKEN_MISMATCH",
        "Token mismatch",
        "critical",
        "The signed request specifies a different token than the payment draft. Protected fields must not differ.",
        "signature",
        "Do not proceed. Re-import the correct payment request or correct the draft.",
      ),
    );
  }

  // ---- Signed request checks ----
  if (req) {
    if (ctx.signatureValid === false) {
      findings.push(
        finding(
          "INVALID_SIGNATURE",
          "Signature verification failed",
          "critical",
          "The EIP-712 signature on this payment request could not be verified. The request may have been tampered with or the signature is malformed.",
          "signature",
          "Do not proceed. Request a fresh signed payment request from the recipient.",
        ),
      );
    } else if (ctx.signatureValid === true) {
      findings.push(
        finding(
          "SIGNATURE_VALID",
          "Recipient signature verified",
          "info",
          "The EIP-712 signature is valid and was produced by the stated recipient wallet. This proves wallet control at signing time, not legal identity.",
          "signature",
          "Proceed to review the remaining checks.",
        ),
      );
    } else {
      findings.push(
        finding(
          "SIGNATURE_UNCHECKED",
          "Signature not yet verified",
          "medium",
          "The payment request signature has not been verified yet. Verification is required before payment.",
          "signature",
          "Run signature verification before authorizing any payment.",
        ),
      );
    }

    if (ctx.signerMatchesRecipient === false) {
      findings.push(
        finding(
          "SIGNER_MISMATCH",
          "Signer does not match recipient",
          "critical",
          "The wallet that signed the request does not match the recipient field. This request cannot be trusted for the stated recipient.",
          "signature",
          "Do not proceed. Reject this request and obtain one signed by the actual recipient.",
        ),
      );
    }

    if (ctx.requestChainOk === false) {
      findings.push(
        finding(
          "REQUEST_WRONG_CHAIN",
          "Request is for a different chain",
          "critical",
          "The signed request was created for a different chain ID than the active network.",
          "signature",
          "Do not proceed on this network. Verify the request was meant for QDay Aevum.",
        ),
      );
    }

    if (ctx.requestTokenOk === false) {
      findings.push(
        finding(
          "REQUEST_WRONG_TOKEN",
          "Request specifies a different token",
          "critical",
          "The signed request was created for a different token contract than expected.",
          "signature",
          "Do not proceed. Confirm the intended token with the recipient.",
        ),
      );
    }

    if (ctx.requestExpired === true) {
      findings.push(
        finding(
          "REQUEST_EXPIRED",
          "Payment request has expired",
          "high",
          `This request expired at ${new Date(Number(req.expiresAt) * 1000).toISOString()}. Paying against an expired request is unsafe.`,
          "signature",
          "Ask the recipient to issue a new signed request with a future expiry.",
        ),
      );
    }

    if (ctx.payerMatchesRequest === false) {
      findings.push(
        finding(
          "PAYER_MISMATCH",
          "Connected wallet is not the intended payer",
          "critical",
          "This request was addressed to a different payer wallet. It may be a replayed or misdirected request.",
          "signature",
          "Do not proceed from this wallet. The intended payer must connect their wallet.",
        ),
      );
    }

    if (ctx.requestMatchesDraft === false) {
      findings.push(
        finding(
          "DETAILS_MISMATCH",
          "Payment details differ from the signed request",
          "critical",
          "The amount, token, recipient, or reference in the payment draft does not match the signed request. Protected fields must be identical.",
          "signature",
          "Do not proceed. Use the exact details contained in the signed request.",
        ),
      );
    } else if (ctx.requestMatchesDraft === true) {
      findings.push(
        finding(
          "DETAILS_MATCH",
          "Payment details match the signed request",
          "info",
          "Recipient, amount, token, chain, and reference all match the signed payment request.",
          "signature",
          "Continue to the review step.",
        ),
      );
    }
  } else {
    findings.push(
      finding(
        "NO_SIGNED_REQUEST",
        "No signed payment request",
        "low",
        "This payment is not backed by a signed payment request. Recipient verification relies on weaker signals only.",
        "signature",
        "Ask the recipient for a signed PayGuard payment request for stronger verification.",
      ),
    );
  }

  // ---- Registry / destination checks ----
  if (ctx.recipientRegistered === true) {
    findings.push(
      finding(
        "REGISTERED_RECIPIENT",
        "Recipient is registered with PayGuard",
        "info",
        "This wallet has an active registration on the PayGuardRegistry contract. Registration indicates the owner opted in; it is not legal identity verification.",
        "registry",
        "Proceed with normal caution.",
      ),
    );
  } else if (ctx.recipientRegistered === false) {
    findings.push(
      finding(
        "UNREGISTERED_RECIPIENT",
        "Recipient is not registered with PayGuard",
        "low",
        "This wallet has no active PayGuard registration. It may still be legitimate, but there is no on-chain opt-in signal.",
        "registry",
        "Verify the address with the recipient through a trusted channel before paying.",
      ),
    );
  } else if (ctx.recipient) {
    findings.push(
      finding(
        "REGISTRY_UNKNOWN",
        "Registration status unknown",
        "info",
        "The PayGuardRegistry contract is not configured or the lookup could not be completed.",
        "registry",
        "Configure NEXT_PUBLIC_PAYGUARD_REGISTRY to enable registration checks.",
      ),
    );
  }

  if (ctx.recipientIsContract === true) {
    findings.push(
      finding(
        "CONTRACT_DESTINATION",
        "Recipient is a contract address",
        "medium",
        "The recipient address contains contract code. Smart-contract wallets are legitimate, but contract destinations can also be drainer or scam contracts. Review the contract before sending funds.",
        "token_contract",
        "Inspect the contract on the explorer and confirm it is the intended recipient.",
      ),
    );
  }

  // ---- Balance ----
  if (ctx.balanceBaseUnits !== undefined && ctx.balanceBaseUnits !== null && ctx.amount) {
    try {
      if (BigInt(ctx.balanceBaseUnits) < BigInt(ctx.amount)) {
        findings.push(
          finding(
            "INSUFFICIENT_BALANCE",
            "Insufficient tUSD8 balance",
            "high",
            "The connected wallet does not hold enough tUSD8 to cover this payment.",
            "balance",
            "Fund the wallet or reduce the payment amount before proceeding.",
          ),
        );
      }
    } catch {
      // ignore malformed balance
    }
  }

  // ---- Recommendation ----
  let max = 0;
  let hasCritical = false;
  for (const f of findings) {
    max = Math.max(max, SEVERITY_ORDER[f.severity]);
    if (f.severity === "critical") hasCritical = true;
  }

  let recommendation: RiskRecommendation;
  if (hasCritical) {
    recommendation = "DO_NOT_PROCEED";
  } else if (max >= SEVERITY_ORDER.high) {
    recommendation = "DO_NOT_PROCEED";
  } else if (max >= SEVERITY_ORDER.medium) {
    recommendation = "REVIEW_REQUIRED";
  } else if (max >= SEVERITY_ORDER.low) {
    recommendation = "PROCEED_WITH_CAUTION";
  } else {
    recommendation = "PROCEED";
  }

  return {
    version: RISK_ENGINE_VERSION,
    recommendation,
    findings: findings.sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
    ),
    evaluatedAt: now,
  };
}

/** Map a verification status to a human-readable explanation. */
export function describeVerificationStatus(status: string): string {
  switch (status) {
    case "VERIFIED_PAYMENT_REQUEST":
      return "A valid signed payment request was verified. The signature proves the stated recipient controls the signing wallet; it does not prove legal identity.";
    case "REGISTERED_RECIPIENT":
      return "The recipient wallet holds an active PayGuard registration on-chain. Registration is opt-in wallet control evidence, not identity verification.";
    case "WALLET_CONTROL_VERIFIED":
      return "A valid signature confirms the signer controls this wallet address at signing time.";
    case "UNREGISTERED_RECIPIENT":
      return "The wallet is valid but has no active PayGuard registration. This is not evidence of malice.";
    case "SIGNATURE_MISMATCH":
      return "The signature does not match the stated recipient. Do not proceed.";
    case "PAYMENT_DETAILS_MISMATCH":
      return "Payment details differ from the signed request. Do not proceed.";
    case "EXPIRED_REQUEST":
      return "The payment request has expired and must be re-issued.";
    case "VERIFICATION_UNAVAILABLE":
      return "Verification could not be completed. Missing information is not negative evidence.";
    default:
      return "";
  }
}
