// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PayGuardSettlement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct PaymentRequest {
        address recipient;
        address payer;       // address(0) = any payer
        address token;
        uint256 amount;
        bytes32 reference;
        bytes32 purposeHash;
        uint64  expiry;
        bytes32 nonce;
    }

    bytes32 public constant REQUEST_TYPEHASH = keccak256(
        "PaymentRequest(address recipient,address payer,address token,uint256 amount,bytes32 reference,bytes32 purposeHash,uint64 expiry,bytes32 nonce)"
    );

    mapping(address => mapping(bytes32 => bool)) public consumed; // recipient => nonce
    mapping(bytes32 => Receipt) public receipts;                  // requestHash => receipt

    struct Receipt { address payer; uint64 paidAt; uint256 amount; }

    event PaymentSettled(bytes32 indexed requestHash, address indexed recipient,
        address indexed payer, address token, uint256 amount, bytes32 reference);
    event RequestCancelled(address indexed recipient, bytes32 indexed nonce);

    constructor() EIP712("PayGuardSettlement", "1") {}

    function settle(PaymentRequest calldata r, bytes calldata sig) external nonReentrant {
        require(block.timestamp <= r.expiry, "EXPIRED");
        require(r.payer == address(0) || r.payer == msg.sender, "WRONG_PAYER");
        require(r.recipient != address(0) && r.amount > 0, "BAD_REQUEST");
        require(!consumed[r.recipient][r.nonce], "NONCE_USED");

        bytes32 digest = hashRequest(r);
        require(SignatureChecker.isValidSignatureNow(r.recipient, digest, sig), "BAD_SIGNATURE"); // EOA + ERC-1271

        consumed[r.recipient][r.nonce] = true;

        IERC20 t = IERC20(r.token);
        uint256 before = t.balanceOf(r.recipient);
        t.safeTransferFrom(msg.sender, r.recipient, r.amount);
        require(t.balanceOf(r.recipient) - before == r.amount, "FEE_ON_TRANSFER");

        receipts[digest] = Receipt(msg.sender, uint64(block.timestamp), r.amount);
        emit PaymentSettled(digest, r.recipient, msg.sender, r.token, r.amount, r.reference);
    }

    function cancelRequest(bytes32 nonce) external {
        consumed[msg.sender][nonce] = true;
        emit RequestCancelled(msg.sender, nonce);
    }

    function hashRequest(PaymentRequest calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            REQUEST_TYPEHASH, r.recipient, r.payer, r.token, r.amount,
            r.reference, r.purposeHash, r.expiry, r.nonce)));
    }
}