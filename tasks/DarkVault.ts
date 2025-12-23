import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy the DarkVault contract
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with the DarkVault contract
 *
 *   npx hardhat --network localhost task:create-vault
 *   npx hardhat --network localhost task:store-secret --ciphertext "..."
 *   npx hardhat --network localhost task:secret-count --owner <address>
 *   npx hardhat --network localhost task:get-secret --owner <address> --index 0
 *   npx hardhat --network localhost task:decrypt-key --owner <address>
 *
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy the DarkVault contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with the DarkVault contract
 *
 *   npx hardhat --network sepolia task:create-vault
 *   npx hardhat --network sepolia task:store-secret --ciphertext "..."
 *   npx hardhat --network sepolia task:secret-count --owner <address>
 *   npx hardhat --network sepolia task:get-secret --owner <address> --index 0
 *   npx hardhat --network sepolia task:decrypt-key --owner <address>
 */

task("task:address", "Prints the DarkVault address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const darkVault = await deployments.get("DarkVault");
  console.log("DarkVault address is " + darkVault.address);
});

task("task:create-vault", "Creates a vault and stores an encrypted key address")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addOptionalParam("key", "Optional vault key address to encrypt (defaults to random)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const ownerSigner = signers[0];

    const vaultKey =
      taskArguments.key && hreEthers.isAddress(taskArguments.key)
        ? hreEthers.getAddress(taskArguments.key)
        : hreEthers.Wallet.createRandom().address;

    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultDeployment.address, ownerSigner.address)
      .addAddress(vaultKey)
      .encrypt();

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const tx = await darkVault
      .connect(ownerSigner)
      .createVault(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Vault key address: ${vaultKey}`);
  });

task("task:rotate-key", "Rotates the encrypted vault key")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addOptionalParam("key", "Optional vault key address to encrypt (defaults to random)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const ownerSigner = signers[0];

    const vaultKey =
      taskArguments.key && hreEthers.isAddress(taskArguments.key)
        ? hreEthers.getAddress(taskArguments.key)
        : hreEthers.Wallet.createRandom().address;

    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultDeployment.address, ownerSigner.address)
      .addAddress(vaultKey)
      .encrypt();

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const tx = await darkVault
      .connect(ownerSigner)
      .rotateVaultKey(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Rotated vault key address: ${vaultKey}`);
  });

task("task:store-secret", "Stores an encrypted string in the caller's vault")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addParam("ciphertext", "Ciphertext string encrypted off-chain with the vault key")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments } = hre;

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const ownerSigner = signers[0];

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const tx = await darkVault.connect(ownerSigner).storeSecret(taskArguments.ciphertext);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:secret-count", "Returns the number of ciphertext entries for an owner")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addParam("owner", "Vault owner address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments } = hre;

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const count = await darkVault.getSecretCount(hreEthers.getAddress(taskArguments.owner));
    console.log(`Secret count: ${count}`);
  });

task("task:get-secret", "Reads a ciphertext entry by index for an owner")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addParam("owner", "Vault owner address")
  .addParam("index", "Ciphertext index")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments } = hre;

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const ciphertext = await darkVault.getSecret(
      hreEthers.getAddress(taskArguments.owner),
      BigInt(taskArguments.index),
    );
    console.log(`Ciphertext: ${ciphertext}`);
  });

task("task:decrypt-key", "Decrypts the vault key for an owner")
  .addOptionalParam("address", "Optionally specify the DarkVault contract address")
  .addParam("owner", "Vault owner address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const darkVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkVault");
    console.log(`DarkVault: ${darkVaultDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const ownerSigner = signers[0];

    const darkVault = await hreEthers.getContractAt("DarkVault", darkVaultDeployment.address);
    const encryptedKey = await darkVault.getVaultKey(hreEthers.getAddress(taskArguments.owner));
    if (encryptedKey === hreEthers.ZeroHash) {
      console.log("Encrypted key is not initialized.");
      return;
    }

    const clearKey = await fhevm.userDecryptEaddress(
      encryptedKey,
      darkVaultDeployment.address,
      ownerSigner,
    );
    console.log(`Vault key address: ${clearKey}`);
  });
