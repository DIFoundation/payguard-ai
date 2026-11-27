// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayGuardRegistry} from "../src/PayGuardRegistry.sol";

contract PayGuardRegistryTest is Test {
    PayGuardRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 profileHash = keccak256("alice-profile");

    event RecipientRegistered(address indexed wallet, bytes32 indexed profileHash, uint256 registeredAt);
    event RecipientRegistrationRevoked(address indexed wallet, uint256 revokedAt);

    function setUp() public {
        registry = new PayGuardRegistry();
    }

    function test_RegisterRecipient() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit RecipientRegistered(alice, profileHash, block.timestamp);
        registry.registerRecipient(profileHash);

        assertTrue(registry.isRegistered(alice));
        (address wallet, bytes32 hash, uint256 ts, bool active) = registry.getRecipient(alice);
        assertEq(wallet, alice);
        assertEq(hash, profileHash);
        assertEq(ts, block.timestamp);
        assertTrue(active);
    }

    function test_DuplicateRegistrationReverts() public {
        vm.prank(alice);
        registry.registerRecipient(profileHash);

        vm.prank(alice);
        vm.expectRevert(PayGuardRegistry.AlreadyRegistered.selector);
        registry.registerRecipient(profileHash);
    }

    function test_RevokeRegistration() public {
        vm.prank(alice);
        registry.registerRecipient(profileHash);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit RecipientRegistrationRevoked(alice, block.timestamp);
        registry.revokeRegistration();

        assertFalse(registry.isRegistered(alice));
        (,,, bool active) = registry.getRecipient(alice);
        assertFalse(active);
    }

    function test_RevokeWithoutRegistrationReverts() public {
        vm.prank(alice);
        vm.expectRevert(PayGuardRegistry.NotRegistered.selector);
        registry.revokeRegistration();
    }

    function test_CannotRegisterForAnotherWallet() public {
        // Only msg.sender is recorded; there is no way to register `bob` as alice.
        vm.prank(alice);
        registry.registerRecipient(profileHash);
        assertFalse(registry.isRegistered(bob));
    }

    function test_ZeroProfileHashReverts() public {
        vm.prank(alice);
        vm.expectRevert(PayGuardRegistry.ZeroProfileHash.selector);
        registry.registerRecipient(bytes32(0));
    }

    function test_ReRegisterAfterRevoke() public {
        vm.prank(alice);
        registry.registerRecipient(profileHash);
        vm.prank(alice);
        registry.revokeRegistration();

        bytes32 newHash = keccak256("alice-profile-v2");
        vm.prank(alice);
        registry.registerRecipient(newHash);

        assertTrue(registry.isRegistered(alice));
        (, bytes32 hash,,) = registry.getRecipient(alice);
        assertEq(hash, newHash);
    }
}
