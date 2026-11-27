// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal view of PayGuardRegistry used for the optional "registered recipients only" policy.
interface IPayGuardRegistry {
    function isRegistered(address wallet) external view returns (bool);
}

/// @title PayGuardSettlement
/// @notice Settles tUSD8 (any ERC-20) payments only against a payment request that the *recipient*
///         signed with EIP-712. Any change to a protected field (recipient, payer, chain, token,
///         amount, reference, purpose, expiry, nonce) invalidates the signature, so the transfer
///         reverts on-chain instead of relying on a UI warning.
///
///         Two ways to pay:
///           1. `settle`         - the payer calls it directly.
///           2. `settleAsAgent`  - an agent the payer authorised calls it, bounded by an on-chain
///                                 policy (token, per-tx cap, rolling 24h cap, expiry, optional
///                                 registered-recipients-only). The payer can revoke instantly.
///
/// @dev    The contract never holds funds and has no owner/admin/upgrade path. It moves tokens
///         with `transferFrom(payer -> recipient)` using the payer's ERC-20 allowance, so the
///         payer's allowance is a ceiling and the policy is the real control. A compromised or
///         prompt-injected agent can only pay requests the recipient already signed.
contract PayGuardSettlement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @dev Field order and types MUST match src/lib/signatures/paymentRequest.ts.
    ///      `reference` is a reserved word in Solidity, so the member is named `paymentRef`;
    ///      the EIP-712 *type string* below still calls it `reference` (that is what is signed).
    struct PaymentRequest {
        address recipient;
        address payer; // address(0) = any payer
        uint256 chainId;
        address token;
        uint256 amount; // token base units
        string paymentRef;
        string purpose;
        uint256 expiresAt; // unix seconds
        bytes32 nonce;
    }

    struct Policy {
        address token; // only this token may be paid by the agent
        uint128 perTxCap; // above this the agent must escalate to the human (`settle`)
        uint128 dailyCap; // max total per rolling 24h window
        uint64 expiry; // session expiry, <= MAX_SESSION from creation
        bool registeredOnly; // recipient must be active in PayGuardRegistry
        bool active;
    }

    struct Usage {
        uint64 windowStart;
        uint128 spent;
    }

    struct Receipt {
        address payer;
        address recipient;
        address token;
        address agent; // address(0) when the payer settled directly
        uint256 amount;
        uint64 paidAt;
    }

    /// @notice Result of the read-only pre-flight check (`checkRequest`). Lets a UI explain a
    ///         failure in plain language before the user spends gas.
    enum Status {
        Ok,
        Expired,
        WrongChain,
        WrongPayer,
        InvalidRequest,
        NonceUsed,
        InvalidSignature
    }

    // ---------------------------------------------------------------------
    // Constants & storage
    // ---------------------------------------------------------------------

    bytes32 public constant REQUEST_TYPEHASH = keccak256(
        "PaymentRequest(address recipient,address payer,uint256 chainId,address token,uint256 amount,string reference,string purpose,uint256 expiresAt,bytes32 nonce)"
    );

    uint64 public constant MAX_SESSION = 30 days;
    uint64 public constant WINDOW = 1 days;

    IPayGuardRegistry public immutable registry;

    /// @notice recipient => nonce => consumed (paid or cancelled)
    mapping(address => mapping(bytes32 => bool)) public consumed;
    /// @notice EIP-712 request digest => receipt (paidAt == 0 means not paid)
    mapping(bytes32 => Receipt) public receipts;
    /// @notice owner => agent => policy
    mapping(address => mapping(address => Policy)) public policies;
    /// @notice owner => agent => rolling-window usage
    mapping(address => mapping(address => Usage)) public usage;

    // ---------------------------------------------------------------------
    // Events & errors
    // ---------------------------------------------------------------------

    event PaymentSettled(
        bytes32 indexed requestHash,
        address indexed recipient,
        address indexed payer,
        address agent,
        address token,
        uint256 amount,
        string paymentRef
    );
    event RequestCancelled(address indexed recipient, bytes32 indexed nonce);
    event PolicySet(
        address indexed owner,
        address indexed agent,
        address token,
        uint128 perTxCap,
        uint128 dailyCap,
        uint64 expiry,
        bool registeredOnly
    );
    event PolicyRevoked(address indexed owner, address indexed agent);

    error RequestExpired();
    error WrongChain();
    error WrongPayer();
    error InvalidRequest();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error TransferAmountMismatch();
    error NoActivePolicy();
    error PolicyExpired();
    error TokenNotAllowed();
    /// @dev The agent tried to pay more than its per-tx cap: the human must approve via `settle`.
    error ExceedsPerTxCap();
    error ExceedsDailyCap();
    error RecipientNotRegistered();
    error InvalidPolicy();

    constructor(IPayGuardRegistry registry_) EIP712("PayGuard", "1") {
        registry = registry_;
    }

    // ---------------------------------------------------------------------
    // Human payment
    // ---------------------------------------------------------------------

    /// @notice Pay a recipient-signed request. `msg.sender` is the payer.
    function settle(PaymentRequest calldata r, bytes calldata signature)
        external
        nonReentrant
        returns (bytes32 requestHash)
    {
        requestHash = _verify(r, signature, msg.sender);
        _pay(requestHash, r, msg.sender, address(0));
    }

    // ---------------------------------------------------------------------
    // Agent payment (bounded by on-chain policy)
    // ---------------------------------------------------------------------

    /// @notice Pay a recipient-signed request on behalf of `owner`, within the policy `owner`
    ///         set for `msg.sender`. Reverts with `ExceedsPerTxCap` if the human must approve.
    function settleAsAgent(address owner, PaymentRequest calldata r, bytes calldata signature)
        external
        nonReentrant
        returns (bytes32 requestHash)
    {
        Policy memory p = policies[owner][msg.sender];
        if (!p.active) revert NoActivePolicy();
        if (block.timestamp > p.expiry) revert PolicyExpired();
        if (r.token != p.token) revert TokenNotAllowed();
        if (r.amount > p.perTxCap) revert ExceedsPerTxCap();
        if (p.registeredOnly && !registry.isRegistered(r.recipient)) revert RecipientNotRegistered();

        // Signature, expiry, nonce etc. are all checked against `owner` as the payer.
        requestHash = _verify(r, signature, owner);

        // Rolling 24h window starting at the first spend.
        Usage memory u = usage[owner][msg.sender];
        if (block.timestamp >= u.windowStart + WINDOW) {
            u.windowStart = uint64(block.timestamp);
            u.spent = 0;
        }
        uint256 newSpent = uint256(u.spent) + r.amount; // r.amount <= perTxCap <= uint128
        if (newSpent > p.dailyCap) revert ExceedsDailyCap();
        // forge-lint: disable-next-line(unsafe-typecast)
        u.spent = uint128(newSpent); // safe: newSpent <= dailyCap (a uint128), checked above
        usage[owner][msg.sender] = u;

        _pay(requestHash, r, owner, msg.sender);
    }

    /// @notice Authorise `agent` to pay recipient-signed requests on the caller's behalf.
    ///         The caller must also keep an ERC-20 allowance for this contract (the ceiling).
    function setPolicy(
        address agent,
        address token,
        uint128 perTxCap,
        uint128 dailyCap,
        uint64 expiry,
        bool registeredOnly
    ) external {
        if (
            agent == address(0) || agent == msg.sender || token == address(0) || perTxCap == 0 || dailyCap < perTxCap
                || expiry <= block.timestamp || expiry > block.timestamp + MAX_SESSION
        ) revert InvalidPolicy();

        policies[msg.sender][agent] = Policy({
            token: token,
            perTxCap: perTxCap,
            dailyCap: dailyCap,
            expiry: expiry,
            registeredOnly: registeredOnly,
            active: true
        });
        delete usage[msg.sender][agent]; // a new policy starts with a fresh window
        emit PolicySet(msg.sender, agent, token, perTxCap, dailyCap, expiry, registeredOnly);
    }

    /// @notice Instantly revoke an agent. Takes effect in the same block.
    function revokeAgent(address agent) external {
        if (!policies[msg.sender][agent].active) revert NoActivePolicy();
        delete policies[msg.sender][agent];
        delete usage[msg.sender][agent];
        emit PolicyRevoked(msg.sender, agent);
    }

    // ---------------------------------------------------------------------
    // Recipient controls
    // ---------------------------------------------------------------------

    /// @notice Recipient cancels an unpaid request (burns its nonce). Instant.
    function cancelRequest(bytes32 nonce) external {
        consumed[msg.sender][nonce] = true;
        emit RequestCancelled(msg.sender, nonce);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest of a request (bound to chainId + this contract address).
    function hashRequest(PaymentRequest calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REQUEST_TYPEHASH,
                    r.recipient,
                    r.payer,
                    r.chainId,
                    r.token,
                    r.amount,
                    keccak256(bytes(r.paymentRef)),
                    keccak256(bytes(r.purpose)),
                    r.expiresAt,
                    r.nonce
                )
            )
        );
    }

    /// @notice Read-only pre-flight. Same checks `settle` runs, without reverting.
    function checkRequest(PaymentRequest calldata r, bytes calldata signature, address payer)
        external
        view
        returns (Status status, bytes32 requestHash)
    {
        return _check(r, signature, payer);
    }

    function isPaid(bytes32 requestHash) external view returns (bool) {
        return receipts[requestHash].paidAt != 0;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _check(PaymentRequest calldata r, bytes calldata signature, address payer)
        internal
        view
        returns (Status, bytes32 digest)
    {
        digest = hashRequest(r);
        if (r.recipient == address(0) || r.recipient == payer || r.token == address(0) || r.amount == 0) {
            return (Status.InvalidRequest, digest);
        }
        if (r.chainId != block.chainid) return (Status.WrongChain, digest);
        if (block.timestamp > r.expiresAt) return (Status.Expired, digest);
        if (r.payer != address(0) && r.payer != payer) return (Status.WrongPayer, digest);
        if (consumed[r.recipient][r.nonce]) return (Status.NonceUsed, digest);
        // EOA (ECDSA) or smart-contract wallet (ERC-1271) recipients.
        if (!SignatureChecker.isValidSignatureNow(r.recipient, digest, signature)) {
            return (Status.InvalidSignature, digest);
        }
        return (Status.Ok, digest);
    }

    function _verify(PaymentRequest calldata r, bytes calldata signature, address payer)
        internal
        view
        returns (bytes32 digest)
    {
        Status s;
        (s, digest) = _check(r, signature, payer);
        if (s == Status.Ok) return digest;
        if (s == Status.Expired) revert RequestExpired();
        if (s == Status.WrongChain) revert WrongChain();
        if (s == Status.WrongPayer) revert WrongPayer();
        if (s == Status.NonceUsed) revert NonceAlreadyUsed();
        if (s == Status.InvalidSignature) revert InvalidSignature();
        revert InvalidRequest();
    }

    function _pay(bytes32 requestHash, PaymentRequest calldata r, address payer, address agent) internal {
        consumed[r.recipient][r.nonce] = true; // effects before interactions

        IERC20 token = IERC20(r.token);
        uint256 before = token.balanceOf(r.recipient);
        token.safeTransferFrom(payer, r.recipient, r.amount);
        if (token.balanceOf(r.recipient) - before != r.amount) revert TransferAmountMismatch();

        receipts[requestHash] = Receipt({
            payer: payer,
            recipient: r.recipient,
            token: r.token,
            agent: agent,
            amount: r.amount,
            paidAt: uint64(block.timestamp)
        });
        emit PaymentSettled(requestHash, r.recipient, payer, agent, r.token, r.amount, r.paymentRef);
    }
}
