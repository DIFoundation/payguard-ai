// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {PayGuardSettlement} from "../../src/PayGuardSettlement.sol";

/// @dev 6-decimal stand-in for tUSD8.
contract MockERC20 is ERC20 {
    constructor() ERC20("Test USD 8", "tUSD8") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes a 1% fee on every transfer, so the recipient receives less than `amount`.
contract FeeToken is MockERC20 {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev Tries to re-enter `settle` while the settlement contract is mid-transfer.
contract ReentrantToken is MockERC20 {
    PayGuardSettlement public target;
    PayGuardSettlement.PaymentRequest internal req;
    bytes internal sig;
    bool public reentered;
    bool public blocked;

    function arm(PayGuardSettlement t, PayGuardSettlement.PaymentRequest memory r, bytes memory s) external {
        target = t;
        req = r;
        sig = s;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (address(target) != address(0) && !reentered && !blocked) {
            try target.settle(req, sig) {
                reentered = true;
            } catch {
                blocked = true;
            }
        }
        return super.transferFrom(from, to, value);
    }
}

/// @dev Minimal ERC-1271 smart wallet whose signatures are produced by `signer`.
contract Wallet1271 {
    address public immutable SIGNER;

    constructor(address signer_) {
        SIGNER = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, signature);
        return rec == SIGNER ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
