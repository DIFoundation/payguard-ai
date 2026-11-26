# Smart Contract Specification — PayGuardRegistry

**File:** `contracts/src/PayGuardRegistry.sol`
**Language:** Solidity ^0.8.24 (no external dependencies)
**Purpose:** Minimal on-chain registry of wallets that opted in to be PayGuard recipients.

## Design constraints

- Holds **no funds**, performs **no token transfers**, has **no admin role**.
- Registration proves only that `msg.sender` registered that address with PayGuard —
  it is **not** legal identity verification.
- Only the wallet owner can register or revoke **their own** address (enforced by `msg.sender`).

## Storage

```solidity
struct Recipient {
    address wallet;
    bytes32 profileHash;   // hash of off-chain profile metadata
    uint256 registeredAt;
    bool active;
}
mapping(address => Recipient) private _recipients;
```

No PII is stored on-chain; `profileHash` commits to off-chain metadata.

## Functions

| Function | Access | Behavior |
|---|---|---|
| `registerRecipient(bytes32 profileHash)` | any wallet | Reverts `ZeroProfileHash` on zero hash, `AlreadyRegistered` if active. Sets record, emits event. |
| `revokeRegistration()` | wallet owner only (implicit via msg.sender) | Reverts `NotRegistered`; clears `active`, emits event. |
| `isRegistered(address)` | view | Returns `active` flag. |
| `getRecipient(address)` | view | Returns `(wallet, profileHash, registeredAt, active)`. |

## Events

- `RecipientRegistered(address indexed wallet, bytes32 indexed profileHash, uint256 registeredAt)`
- `RecipientRegistrationRevoked(address indexed wallet, uint256 revokedAt)`

## Errors

- `AlreadyRegistered()`
- `NotRegistered()`
- `ZeroProfileHash()`

## Security notes

- Re-registration after revocation is allowed (supports key/profile rotation).
- Revoked records retain historical fields but `active == false`; consumers must check `active`.
- No upgradeability, no proxy, no owner — minimal attack surface.
- Contract is intentionally dependency-free; OpenZeppelin was considered but unnecessary
  for this surface (no access control beyond msg.sender, no fund handling).

## Deployment

```bash
cd contracts
forge build
PRIVATE_KEY=0x... forge script script/DeployPayGuardRegistry.s.sol \
  --rpc-url https://rpc-test.qday.info --broadcast
```

Then set `NEXT_PUBLIC_PAYGUARD_REGISTRY=<deployed address>`.
