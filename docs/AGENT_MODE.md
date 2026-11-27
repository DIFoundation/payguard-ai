# Agent mode: bounded, revocable, auditable agent payments

## The problem
Autonomous agents that can pay are dangerous: a prompt-injected or compromised agent can be tricked
into paying the wrong address, too much, or too often. Most designs give the agent a key or a large
allowance and hope.

## The design
An agent never gets a key to the owner's funds. The owner grants a **policy** to the agent's address
in `PayGuardSettlement`, and the contract enforces it on every call to `settleAsAgent`:

| Control | Enforced by |
|---|---|
| Only pays requests the **recipient signed** (EIP-712: recipient, amount, token, payer, expiry, nonce) | `InvalidSignature` |
| One token only (tUSD8) | `TokenNotAllowed` |
| Per-payment cap; above it the agent must ask the human | `ExceedsPerTxCap` |
| Rolling 24h cap | `ExceedsDailyCap` |
| Session expiry (max 30 days) | `PolicyExpired` |
| Optional: registered recipients only | `RecipientNotRegistered` |
| Instant revocation by the owner | `revokeAgent` → `NoActivePolicy` |
| Replay / double-pay protection; recipient can cancel | single-use nonce, `cancelRequest` |
| Token allowance is a ceiling (set to the daily budget) | ERC-20 allowance |

The contract holds no funds and has no admin or upgrade path.

## Why prompt injection cannot redirect money
The agent can only submit a request the recipient already signed. Changing the recipient, amount,
token or any other signed field invalidates the signature, so the contract rejects it. The "Compromised-agent demo"
on the Agent page shows this live, and can broadcast the rejected transaction so it is visible on the explorer.

## Flow
1. Owner opens **Agent** and (for the demo) generates a throwaway agent key held in browser memory only.
2. Owner sends the agent a little tQDAY for gas, then grants a permission (two wallet prompts: allowance
   ceiling, then `setPolicy`).
3. A recipient creates a signed request on **Create Request**; it is pasted into the agent runner.
4. The agent pays within policy. The app mirrors the contract's checks first (to explain a block before spending
   gas), runs the contract's `checkRequest` pre-flight, sends `settleAsAgent`, and verifies the
   `PaymentSettled` event (including the agent address) before reporting success.
5. Above the limit, the agent is blocked and the owner sees an **approval needed** panel. Approving runs the normal
   human payment.
6. The **audit trail** lists grants, revocations and payments straight from chain events.

## Demo script (3 to 5 minutes)
1. Grant the agent: 100 per payment, 300 per 24h, 7 days.
2. Recipient signs a 50 tUSD8 invoice. The agent pays it. Show the tx and the audit trail.
3. Recipient signs a 150 tUSD8 invoice. The agent is blocked ("above the per-payment limit"). Approve as owner.
4. Run the attack (redirect funds). Show the contract refusal and the reverted tx on the explorer.
5. Revoke the agent. Run the payment again. It is refused. Show the audit trail.

## Known constraints
- The 24h cap is a fixed window that starts at the first spend. Two adjacent windows could allow up to 2x the cap
  around a boundary.
- The demo agent runs in the browser for presentation purposes only. A real agent is a separate service with its own key.
- The UI's signature check recovers a plain ECDSA signer; the contract also accepts ERC-1271 smart-wallet recipients.
- Session expiry is computed with a 10 minute safety margin so a fast local clock cannot exceed the contract's 30-day maximum.
- The contracts have been tested (Foundry unit, fuzz and invariant tests) but not independently audited.
