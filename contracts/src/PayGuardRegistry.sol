// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayGuardRegistry
/// @notice Minimal on-chain registry for PayGuard recipients.
/// @dev Allows a wallet owner to register (or revoke) their own address with a
///      hash of an off-chain profile. The registry records wallet control only;
///      it is not a legal identity verification system and holds no funds.
contract PayGuardRegistry {
    struct Recipient {
        address wallet;
        bytes32 profileHash;
        uint256 registeredAt;
        bool active;
    }

    /// @notice wallet => recipient record
    mapping(address => Recipient) private _recipients;

    /// @notice Emitted when a wallet registers itself as a PayGuard recipient.
    event RecipientRegistered(
        address indexed wallet,
        bytes32 indexed profileHash,
        uint256 registeredAt
    );

    /// @notice Emitted when a wallet revokes its PayGuard registration.
    event RecipientRegistrationRevoked(address indexed wallet, uint256 revokedAt);

    error AlreadyRegistered();
    error NotRegistered();
    error ZeroProfileHash();

    /// @notice Register the caller's wallet as a PayGuard recipient.
    /// @param profileHash Hash of the recipient's off-chain profile metadata.
    function registerRecipient(bytes32 profileHash) external {
        if (profileHash == bytes32(0)) revert ZeroProfileHash();
        Recipient storage r = _recipients[msg.sender];
        if (r.active) revert AlreadyRegistered();

        r.wallet = msg.sender;
        r.profileHash = profileHash;
        r.registeredAt = block.timestamp;
        r.active = true;

        emit RecipientRegistered(msg.sender, profileHash, block.timestamp);
    }

    /// @notice Revoke the caller's PayGuard registration.
    function revokeRegistration() external {
        Recipient storage r = _recipients[msg.sender];
        if (!r.active) revert NotRegistered();

        r.active = false;
        emit RecipientRegistrationRevoked(msg.sender, block.timestamp);
    }

    /// @notice Whether a wallet currently holds an active registration.
    function isRegistered(address wallet) external view returns (bool) {
        return _recipients[wallet].active;
    }

    /// @notice Full recipient record for a wallet. Inactive records return zeros
    ///         for profileHash/registeredAt consumers should check `active`.
    function getRecipient(address wallet)
        external
        view
        returns (address recipientWallet, bytes32 profileHash, uint256 registeredAt, bool active)
    {
        Recipient storage r = _recipients[wallet];
        return (r.wallet, r.profileHash, r.registeredAt, r.active);
    }
}
