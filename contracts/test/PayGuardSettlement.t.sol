// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayGuardRegistry} from "../src/PayGuardRegistry.sol";
import {PayGuardSettlement, IPayGuardRegistry} from "../src/PayGuardSettlement.sol";
import {MockERC20, FeeToken, ReentrantToken, Wallet1271} from "./mocks/Mocks.sol";

contract PayGuardSettlementTest is Test {
    PayGuardRegistry registry;
    PayGuardSettlement settlement;
    MockERC20 token;

    address recipient;
    uint256 recipientPk;
    address payer;
    uint256 payerPk;
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");

    uint256 constant ONE = 1e6; // 1 tUSD8
    bytes32 constant NONCE = keccak256("nonce-1");

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

    function setUp() public {
        vm.chainId(44005);
        vm.warp(1_800_000_000);
        (recipient, recipientPk) = makeAddrAndKey("recipient");
        (payer, payerPk) = makeAddrAndKey("payer");

        registry = new PayGuardRegistry();
        settlement = new PayGuardSettlement(IPayGuardRegistry(address(registry)));
        token = new MockERC20();
        token.mint(payer, 1_000 * ONE);
        vm.prank(payer);
        token.approve(address(settlement), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _req(uint256 amount, bytes32 nonce) internal view returns (PayGuardSettlement.PaymentRequest memory) {
        return PayGuardSettlement.PaymentRequest({
            recipient: recipient,
            payer: address(0),
            chainId: block.chainid,
            token: address(token),
            amount: amount,
            paymentRef: "INV-1042",
            purpose: "Design invoice",
            expiresAt: block.timestamp + 1 days,
            nonce: nonce
        });
    }

    function _sign(uint256 pk, PayGuardSettlement.PaymentRequest memory r) internal view returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(pk, settlement.hashRequest(r));
        return abi.encodePacked(rr, s, v);
    }

    function _signed(uint256 amount, bytes32 nonce)
        internal
        view
        returns (PayGuardSettlement.PaymentRequest memory r, bytes memory sig)
    {
        r = _req(amount, nonce);
        sig = _sign(recipientPk, r);
    }

    function _policy(uint256 perTx, uint256 daily) internal {
        vm.prank(payer);
        settlement.setPolicy(
            agent, address(token), uint128(perTx), uint128(daily), uint64(block.timestamp + 7 days), false
        );
    }

    // ---------------------------------------------------------------- human settle

    function test_Settle_HappyPath() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(50 * ONE, NONCE);
        bytes32 h = settlement.hashRequest(r);

        vm.expectEmit(true, true, true, true);
        emit PaymentSettled(h, recipient, payer, address(0), address(token), 50 * ONE, "INV-1042");
        vm.prank(payer);
        bytes32 got = settlement.settle(r, sig);

        assertEq(got, h);
        assertEq(token.balanceOf(recipient), 50 * ONE);
        assertEq(token.balanceOf(payer), 950 * ONE);
        assertEq(token.balanceOf(address(settlement)), 0);
        assertTrue(settlement.consumed(recipient, NONCE));
        assertTrue(settlement.isPaid(h));
        (address rp, address rc, address tk, address ag, uint256 amt, uint64 at) = settlement.receipts(h);
        assertEq(rp, payer);
        assertEq(rc, recipient);
        assertEq(tk, address(token));
        assertEq(ag, address(0));
        assertEq(amt, 50 * ONE);
        assertEq(at, block.timestamp);
    }

    function test_Settle_PayerBoundRequest() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.payer = payer;
        bytes memory sig = _sign(recipientPk, r);

        vm.prank(payer);
        settlement.settle(r, sig);
        assertEq(token.balanceOf(recipient), 10 * ONE);
    }

    function test_Settle_WrongPayerReverts() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.payer = payer;
        bytes memory sig = _sign(recipientPk, r);

        token.mint(stranger, 100 * ONE);
        vm.startPrank(stranger);
        token.approve(address(settlement), type(uint256).max);
        vm.expectRevert(PayGuardSettlement.WrongPayer.selector);
        settlement.settle(r, sig);
        vm.stopPrank();
    }

    function test_Settle_ExpiredReverts() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.warp(r.expiresAt + 1);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.RequestExpired.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_AtExactExpiryStillValid() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.warp(r.expiresAt);
        vm.prank(payer);
        settlement.settle(r, sig);
    }

    function test_Settle_WrongChainReverts() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.chainId = 1; // signed for Ethereum mainnet, replayed on Aevum
        bytes memory sig = _sign(recipientPk, r);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.WrongChain.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_ReplayReverts() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.startPrank(payer);
        settlement.settle(r, sig);
        vm.expectRevert(PayGuardSettlement.NonceAlreadyUsed.selector);
        settlement.settle(r, sig);
        vm.stopPrank();
        assertEq(token.balanceOf(recipient), 10 * ONE);
    }

    function test_Settle_SignatureFromWrongKeyReverts() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        bytes memory sig = _sign(payerPk, r); // payer signs their own "invoice"
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidSignature.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_GarbageSignatureReverts() public {
        (PayGuardSettlement.PaymentRequest memory r,) = _signed(10 * ONE, NONCE);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidSignature.selector);
        settlement.settle(r, hex"deadbeef");
    }

    function test_Settle_ZeroAmountReverts() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(0, NONCE);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidRequest.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_SelfPaymentReverts() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.recipient = payer;
        bytes memory sig = _sign(payerPk, r);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidRequest.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_ZeroRecipientReverts() public {
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.recipient = address(0);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidRequest.selector);
        settlement.settle(r, hex"00");
    }

    function test_Settle_NoAllowanceReverts() public {
        vm.prank(payer);
        token.approve(address(settlement), 0);
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.prank(payer);
        vm.expectRevert(); // ERC20InsufficientAllowance
        settlement.settle(r, sig);
        // The failed payment must not burn the nonce.
        assertFalse(settlement.consumed(recipient, NONCE));
    }

    function test_Settle_InsufficientBalanceReverts() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(5_000 * ONE, NONCE);
        vm.prank(payer);
        vm.expectRevert(); // ERC20InsufficientBalance
        settlement.settle(r, sig);
    }

    function test_Settle_FeeOnTransferTokenReverts() public {
        FeeToken fee = new FeeToken();
        fee.mint(payer, 100 * ONE);
        vm.prank(payer);
        fee.approve(address(settlement), type(uint256).max);

        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.token = address(fee);
        bytes memory sig = _sign(recipientPk, r);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.TransferAmountMismatch.selector);
        settlement.settle(r, sig);
    }

    function test_Settle_ReentrancyBlocked() public {
        ReentrantToken rt = new ReentrantToken();
        rt.mint(payer, 100 * ONE);
        vm.prank(payer);
        rt.approve(address(settlement), type(uint256).max);

        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.token = address(rt);
        bytes memory sig = _sign(recipientPk, r);
        rt.arm(settlement, r, sig);

        vm.prank(payer);
        settlement.settle(r, sig);
        assertTrue(rt.blocked());
        assertFalse(rt.reentered());
        assertEq(rt.balanceOf(recipient), 10 * ONE); // paid exactly once
    }

    // ---------------------------------------------------------------- ERC-1271 recipient

    function test_Settle_Erc1271ContractWalletRecipient() public {
        Wallet1271 wallet = new Wallet1271(recipient); // recipient EOA controls the smart wallet
        PayGuardSettlement.PaymentRequest memory r = _req(25 * ONE, NONCE);
        r.recipient = address(wallet);
        bytes memory sig = _sign(recipientPk, r);

        vm.prank(payer);
        settlement.settle(r, sig);
        assertEq(token.balanceOf(address(wallet)), 25 * ONE);
    }

    function test_Settle_Erc1271RejectsOtherSigner() public {
        Wallet1271 wallet = new Wallet1271(recipient);
        PayGuardSettlement.PaymentRequest memory r = _req(25 * ONE, NONCE);
        r.recipient = address(wallet);
        bytes memory sig = _sign(payerPk, r);
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidSignature.selector);
        settlement.settle(r, sig);
    }

    // ---------------------------------------------------------------- recipient cancel

    function test_Cancel_BlocksPayment() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.expectEmit(true, true, false, false);
        emit RequestCancelled(recipient, NONCE);
        vm.prank(recipient);
        settlement.cancelRequest(NONCE);

        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.NonceAlreadyUsed.selector);
        settlement.settle(r, sig);
    }

    function test_Cancel_OnlyAffectsCallersOwnNonce() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.prank(stranger);
        settlement.cancelRequest(NONCE); // burns stranger's nonce, not the recipient's
        vm.prank(payer);
        settlement.settle(r, sig);
        assertEq(token.balanceOf(recipient), 10 * ONE);
    }

    // ---------------------------------------------------------------- checkRequest (pre-flight)

    function test_CheckRequest_StatusCodes() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        (PayGuardSettlement.Status s,) = settlement.checkRequest(r, sig, payer);
        assertEq(uint8(s), uint8(PayGuardSettlement.Status.Ok));

        r.amount = 11 * ONE; // tampered
        (s,) = settlement.checkRequest(r, sig, payer);
        assertEq(uint8(s), uint8(PayGuardSettlement.Status.InvalidSignature));
        r.amount = 10 * ONE;

        vm.warp(r.expiresAt + 1);
        (s,) = settlement.checkRequest(r, sig, payer);
        assertEq(uint8(s), uint8(PayGuardSettlement.Status.Expired));
    }

    // ---------------------------------------------------------------- tamper fuzz

    /// @dev Mutating ANY signed field after signing must make settlement revert.
    function testFuzz_AnyFieldTamperReverts(uint8 field, uint256 salt) public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(50 * ONE, NONCE);
        address other = address(uint160(uint256(keccak256(abi.encode(salt)))));
        vm.assume(other != address(0) && other != recipient && other != payer && other != address(token));

        uint256 f = field % 9;
        if (f == 0) r.recipient = other;
        else if (f == 1) r.payer = payer; // was "any payer"
        else if (f == 2) r.chainId = r.chainId + 1 + (salt % 1000);
        else if (f == 3) r.token = other;
        else if (f == 4) r.amount = r.amount + 1 + (salt % 1_000_000);
        else if (f == 5) r.paymentRef = "INV-9999";
        else if (f == 6) r.purpose = "Different purpose";
        else if (f == 7) r.expiresAt = r.expiresAt + 1 + (salt % 1000);
        else r.nonce = keccak256(abi.encode("other", salt));

        vm.prank(payer);
        vm.expectRevert();
        settlement.settle(r, sig);
        assertEq(token.balanceOf(recipient), 0);
    }

    // ---------------------------------------------------------------- agent policy

    function test_Agent_HappyPath() public {
        _policy(100 * ONE, 300 * ONE);
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(50 * ONE, NONCE);

        vm.prank(agent);
        bytes32 h = settlement.settleAsAgent(payer, r, sig);

        assertEq(token.balanceOf(recipient), 50 * ONE);
        assertEq(token.balanceOf(payer), 950 * ONE);
        (address rp,,, address ag,,) = settlement.receipts(h);
        assertEq(rp, payer);
        assertEq(ag, agent);
        (, uint128 spent) = settlement.usage(payer, agent);
        assertEq(spent, 50 * ONE);
    }

    function test_Agent_NoPolicyReverts() public {
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.NoActivePolicy.selector);
        settlement.settleAsAgent(payer, r, sig);
    }

    function test_Agent_CannotSpendAnotherOwnersFunds() public {
        _policy(100 * ONE, 300 * ONE); // policy is payer -> agent
        token.mint(stranger, 100 * ONE);
        vm.prank(stranger);
        token.approve(address(settlement), type(uint256).max);

        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.NoActivePolicy.selector); // no stranger -> agent policy
        settlement.settleAsAgent(stranger, r, sig);
    }

    function test_Agent_ExpiredPolicyReverts() public {
        _policy(100 * ONE, 300 * ONE);
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.warp(block.timestamp + 7 days + 1);
        r.expiresAt = block.timestamp + 1 days; // keep request itself valid
        sig = _sign(recipientPk, r);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.PolicyExpired.selector);
        settlement.settleAsAgent(payer, r, sig);
    }

    function test_Agent_ExceedsPerTxCapMustEscalate() public {
        _policy(100 * ONE, 300 * ONE);
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(101 * ONE, NONCE);

        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.ExceedsPerTxCap.selector);
        settlement.settleAsAgent(payer, r, sig);

        // The human can still approve the very same signed request.
        vm.prank(payer);
        settlement.settle(r, sig);
        assertEq(token.balanceOf(recipient), 101 * ONE);
    }

    function test_Agent_DailyCapAccumulatesAndResets() public {
        _policy(100 * ONE, 150 * ONE);

        (PayGuardSettlement.PaymentRequest memory r1, bytes memory s1) = _signed(100 * ONE, keccak256("a"));
        vm.prank(agent);
        settlement.settleAsAgent(payer, r1, s1);

        (PayGuardSettlement.PaymentRequest memory r2, bytes memory s2) = _signed(60 * ONE, keccak256("b"));
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.ExceedsDailyCap.selector); // 160 > 150
        settlement.settleAsAgent(payer, r2, s2);

        (PayGuardSettlement.PaymentRequest memory r3, bytes memory s3) = _signed(50 * ONE, keccak256("c"));
        vm.prank(agent);
        settlement.settleAsAgent(payer, r3, s3); // 150 == cap, allowed

        // After the 24h window the budget resets.
        vm.warp(block.timestamp + 1 days);
        (PayGuardSettlement.PaymentRequest memory r4, bytes memory s4) = _signed(100 * ONE, keccak256("d"));
        vm.prank(agent);
        settlement.settleAsAgent(payer, r4, s4);
        assertEq(token.balanceOf(recipient), 250 * ONE);
    }

    function test_Agent_TokenNotAllowedReverts() public {
        _policy(100 * ONE, 300 * ONE);
        MockERC20 other = new MockERC20();
        other.mint(payer, 100 * ONE);
        vm.prank(payer);
        other.approve(address(settlement), type(uint256).max);

        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.token = address(other);
        bytes memory sig = _sign(recipientPk, r);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.TokenNotAllowed.selector);
        settlement.settleAsAgent(payer, r, sig);
    }

    function test_Agent_RegisteredOnly() public {
        vm.prank(payer);
        settlement.setPolicy(
            agent, address(token), uint128(100 * ONE), uint128(300 * ONE), uint64(block.timestamp + 7 days), true
        );
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);

        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.RecipientNotRegistered.selector);
        settlement.settleAsAgent(payer, r, sig);

        vm.prank(recipient);
        registry.registerRecipient(keccak256("profile"));
        vm.prank(agent);
        settlement.settleAsAgent(payer, r, sig);
        assertEq(token.balanceOf(recipient), 10 * ONE);

        // Registration revoked -> blocked again.
        vm.prank(recipient);
        registry.revokeRegistration();
        (PayGuardSettlement.PaymentRequest memory r2, bytes memory s2) = _signed(10 * ONE, keccak256("n2"));
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.RecipientNotRegistered.selector);
        settlement.settleAsAgent(payer, r2, s2);
    }

    function test_Agent_RevokeIsInstant() public {
        _policy(100 * ONE, 300 * ONE);
        vm.expectEmit(true, true, false, false);
        emit PolicyRevoked(payer, agent);
        vm.prank(payer);
        settlement.revokeAgent(agent);

        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.NoActivePolicy.selector);
        settlement.settleAsAgent(payer, r, sig);
    }

    function test_Agent_RevokeWithoutPolicyReverts() public {
        vm.prank(payer);
        vm.expectRevert(PayGuardSettlement.NoActivePolicy.selector);
        settlement.revokeAgent(agent);
    }

    /// @dev Prompt-injection / compromised-agent scenario: the agent cannot redirect funds.
    function test_Agent_CannotRedirectFunds() public {
        _policy(100 * ONE, 300 * ONE);
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(10 * ONE, NONCE);
        r.recipient = agent; // attacker swaps in their own address
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.InvalidSignature.selector);
        settlement.settleAsAgent(payer, r, sig);
        assertEq(token.balanceOf(agent), 0);
    }

    function test_Agent_PayerBoundToOtherAddressReverts() public {
        _policy(100 * ONE, 300 * ONE);
        PayGuardSettlement.PaymentRequest memory r = _req(10 * ONE, NONCE);
        r.payer = stranger; // invoice addressed to someone else
        bytes memory sig = _sign(recipientPk, r);
        vm.prank(agent);
        vm.expectRevert(PayGuardSettlement.WrongPayer.selector);
        settlement.settleAsAgent(payer, r, sig);
    }

    function test_Agent_AllowanceStillACeiling() public {
        _policy(100 * ONE, 300 * ONE);
        vm.prank(payer);
        token.approve(address(settlement), 20 * ONE); // human-set ceiling
        (PayGuardSettlement.PaymentRequest memory r, bytes memory sig) = _signed(50 * ONE, NONCE);
        vm.prank(agent);
        vm.expectRevert(); // ERC20InsufficientAllowance
        settlement.settleAsAgent(payer, r, sig);
    }

    // ---------------------------------------------------------------- policy validation

    function test_SetPolicy_Validation() public {
        uint64 ok = uint64(block.timestamp + 1 days);
        uint128 O = uint128(ONE);
        vm.startPrank(payer);
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(address(0), address(token), O, O, ok, false); // zero agent
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(payer, address(token), O, O, ok, false); // self as agent
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(agent, address(0), O, O, ok, false); // zero token
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(agent, address(token), 0, O, ok, false); // zero per-tx cap
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(agent, address(token), 2 * O, O, ok, false); // daily < per-tx
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(agent, address(token), O, O, uint64(block.timestamp), false); // already expired
        vm.expectRevert(PayGuardSettlement.InvalidPolicy.selector);
        settlement.setPolicy(agent, address(token), O, O, uint64(block.timestamp + 31 days), false); // > 30d
        vm.stopPrank();
    }

    function test_SetPolicy_EmitsAndStores() public {
        uint64 exp = uint64(block.timestamp + 3 days);
        vm.expectEmit(true, true, false, true);
        emit PolicySet(payer, agent, address(token), 10 * uint128(ONE), 30 * uint128(ONE), exp, true);
        vm.prank(payer);
        settlement.setPolicy(agent, address(token), uint128(10 * ONE), uint128(30 * ONE), exp, true);
        (address tk, uint128 perTx, uint128 daily, uint64 expiry, bool regOnly, bool active) =
            settlement.policies(payer, agent);
        assertEq(tk, address(token));
        assertEq(perTx, 10 * ONE);
        assertEq(daily, 30 * ONE);
        assertEq(expiry, exp);
        assertTrue(regOnly);
        assertTrue(active);
    }

    // ---------------------------------------------------------------- no admin surface

    function test_ContractHoldsNoFundsAndHasNoAdmin() public view {
        assertEq(token.balanceOf(address(settlement)), 0);
        assertEq(address(settlement.registry()), address(registry));
    }
}

/// @dev Cross-implementation check: the contract's EIP-712 digest must equal the digest the
///      TypeScript library (viem `hashTypedData`) computes for the same request. If either side
///      changes its type string or domain, this and the matching vitest fail together.
contract PayGuardSettlementVectorTest is Test {
    address constant SETTLEMENT = 0x00000000000000000000000000000000000fa11e;
    address constant RECIPIENT = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant TOKEN = 0x456569838f1d43009A91ebA4263147Afd7233483;

    // Produced by src/lib/signatures/paymentRequest.test.ts (see "matches the Solidity vector").
    bytes32 constant EXPECTED_DIGEST = 0xfdb7657e27eca5c31481db90debfb2f211a64f55218fb5316c64e7871f57cbc5;

    function test_DigestMatchesFrontendVector() public {
        vm.chainId(44005);
        deployCodeTo("PayGuardSettlement.sol:PayGuardSettlement", abi.encode(address(0)), SETTLEMENT);
        PayGuardSettlement s = PayGuardSettlement(SETTLEMENT);

        PayGuardSettlement.PaymentRequest memory r = PayGuardSettlement.PaymentRequest({
            recipient: RECIPIENT,
            payer: address(0),
            chainId: 44005,
            token: TOKEN,
            amount: 50_000_000,
            paymentRef: "INV-1042",
            purpose: "Design invoice",
            expiresAt: 1_900_000_000,
            nonce: bytes32(uint256(1))
        });
        assertEq(s.hashRequest(r), EXPECTED_DIGEST);
    }
}

/// @dev Handler for the "never holds funds / accounting balances" invariant.
contract SettleHandler is Test {
    PayGuardSettlement public settlement;
    MockERC20 public token;
    address public recipient;
    uint256 public recipientPk;
    address public payer;
    uint256 public totalPaid;
    uint256 public nonceCounter;

    constructor(PayGuardSettlement s, MockERC20 t, address rec, uint256 recPk, address payer_) {
        settlement = s;
        token = t;
        recipient = rec;
        recipientPk = recPk;
        payer = payer_;
    }

    function pay(uint256 amountSeed, bool replay) external {
        uint256 amount = bound(amountSeed, 1, 25_000_000);
        bytes32 nonce = bytes32(replay && nonceCounter > 0 ? nonceCounter : ++nonceCounter);
        PayGuardSettlement.PaymentRequest memory r = PayGuardSettlement.PaymentRequest({
            recipient: recipient,
            payer: address(0),
            chainId: block.chainid,
            token: address(token),
            amount: amount,
            paymentRef: "H",
            purpose: "invariant",
            expiresAt: block.timestamp + 1 days,
            nonce: nonce
        });
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(recipientPk, settlement.hashRequest(r));
        vm.prank(payer);
        try settlement.settle(r, abi.encodePacked(rr, ss, v)) {
            totalPaid += amount;
        } catch {}
    }
}

contract PayGuardSettlementInvariantTest is Test {
    PayGuardSettlement settlement;
    MockERC20 token;
    SettleHandler handler;

    function setUp() public {
        PayGuardRegistry registry = new PayGuardRegistry();
        settlement = new PayGuardSettlement(IPayGuardRegistry(address(registry)));
        token = new MockERC20();
        (address rec, uint256 recPk) = makeAddrAndKey("rec");
        address pay = makeAddr("pay");
        token.mint(pay, 1_000_000_000_000);
        vm.prank(pay);
        token.approve(address(settlement), type(uint256).max);
        handler = new SettleHandler(settlement, token, rec, recPk, pay);
        targetContract(address(handler));
    }

    function invariant_SettlementNeverHoldsFunds() public view {
        assertEq(token.balanceOf(address(settlement)), 0);
    }

    function invariant_RecipientReceivedExactlyWhatWasSettled() public view {
        assertEq(token.balanceOf(handler.recipient()), handler.totalPaid());
    }
}
