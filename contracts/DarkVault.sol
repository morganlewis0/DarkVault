// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title DarkVault
/// @notice Stores an encrypted vault key and encrypted string payloads per user.
contract DarkVault is ZamaEthereumConfig {
    struct Vault {
        eaddress encryptedKey;
        bool initialized;
        string[] ciphertexts;
    }

    mapping(address => Vault) private vaults;

    event VaultCreated(address indexed owner);
    event VaultKeyRotated(address indexed owner);
    event SecretStored(address indexed owner, uint256 index);

    error VaultAlreadyExists();
    error VaultMissing();
    error SecretIndexOutOfBounds();

    /// @notice Create a vault by storing the encrypted key address.
    /// @param encryptedKey The encrypted address used as the vault key.
    /// @param inputProof Proof for the encrypted input.
    function createVault(externalEaddress encryptedKey, bytes calldata inputProof) external {
        if (vaults[msg.sender].initialized) {
            revert VaultAlreadyExists();
        }

        eaddress validatedKey = FHE.fromExternal(encryptedKey, inputProof);
        vaults[msg.sender].encryptedKey = validatedKey;
        vaults[msg.sender].initialized = true;

        FHE.allowThis(validatedKey);
        FHE.allow(validatedKey, msg.sender);

        emit VaultCreated(msg.sender);
    }

    /// @notice Rotate the encrypted vault key.
    /// @param encryptedKey The new encrypted address used as the vault key.
    /// @param inputProof Proof for the encrypted input.
    function rotateVaultKey(externalEaddress encryptedKey, bytes calldata inputProof) external {
        if (!vaults[msg.sender].initialized) {
            revert VaultMissing();
        }

        eaddress validatedKey = FHE.fromExternal(encryptedKey, inputProof);
        vaults[msg.sender].encryptedKey = validatedKey;

        FHE.allowThis(validatedKey);
        FHE.allow(validatedKey, msg.sender);

        emit VaultKeyRotated(msg.sender);
    }

    /// @notice Store a ciphertext string in the caller's vault.
    /// @param ciphertext The string encrypted with the vault key off-chain.
    function storeSecret(string calldata ciphertext) external {
        if (!vaults[msg.sender].initialized) {
            revert VaultMissing();
        }

        vaults[msg.sender].ciphertexts.push(ciphertext);
        emit SecretStored(msg.sender, vaults[msg.sender].ciphertexts.length - 1);
    }

    /// @notice Returns whether an address has initialized a vault.
    /// @param owner The vault owner address.
    function hasVault(address owner) external view returns (bool) {
        return vaults[owner].initialized;
    }

    /// @notice Returns the encrypted vault key for a given owner.
    /// @param owner The vault owner address.
    function getVaultKey(address owner) external view returns (eaddress) {
        return vaults[owner].encryptedKey;
    }

    /// @notice Returns the number of ciphertext entries in a vault.
    /// @param owner The vault owner address.
    function getSecretCount(address owner) external view returns (uint256) {
        return vaults[owner].ciphertexts.length;
    }

    /// @notice Returns a ciphertext entry by index.
    /// @param owner The vault owner address.
    /// @param index The ciphertext index.
    function getSecret(address owner, uint256 index) external view returns (string memory) {
        if (index >= vaults[owner].ciphertexts.length) {
            revert SecretIndexOutOfBounds();
        }
        return vaults[owner].ciphertexts[index];
    }
}
