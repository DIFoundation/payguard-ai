# Security

## Threat model

PayGuard protects against **payment-detail tampering** and **recipient deception** for
stablecoin transfers. It does not (and cannot) prove legal identity or off-chain legitimacy.

## Controls

### Cryptographic integrity
- EIP-712 typed-data signatures bind every protected payment field.
- Signer recovery must equal the stated recipient; any field change invalidates the digest.
- Random per-request nonce + expiry bound replay windows.
- Tampered/altered requests surface as `SIGNATURE_MISMATCH` /
  `PAYMENT_DETAILS_MISMATCH` → `DO_NOT_PROCEED` (cannot be overridden by positive signals).

### Fund safety
- Payments are plain `tUSD8.transfer()` calls — the user sees the exact calldata in their wallet.
- No token approvals, no allowances, no custom payment router.
- PayGuard never custodies keys; signing happens in the user's wallet (AppKit/injected).
- Completion requires an actual transaction receipt — never just a broadcast hash.

### Data handling
- localStorage holds only non-sensitive drafts/history; it is never treated as evidence —
  registration, contract code, and balances are always re-read from chain.
- No private keys, seed phrases, or credentials stored or transmitted.
- `GEMINI_API_KEY` exists only server-side; AI endpoint cannot sign or move funds.

### Contract
- `PayGuardRegistry` holds no funds, has no admin role, no arbitrary calls.
- Only `msg.sender` can register/revoke; inputs validated; events emitted.

### Honest reporting
- Unregistered ≠ malicious; missing info ≠ negative evidence (reported as unknown/info).
- Every risk finding includes code, severity, explanation, evidence source, and action.
- Statuses explain their own limitations in the UI.

## Known limitations

- **Unaudited.** Hackathon project; do not use with real funds.
- Signature proves wallet control at signing time — not that the person behind the wallet is
  who they claim, nor that off-chain obligations will be honored.
- Registry registration is opt-in evidence only.
- Contract-address detection is heuristic (`eth_getCode`); it flags, not condemns.
- AI explanations are advisory; the deterministic engine is the risk authority.
