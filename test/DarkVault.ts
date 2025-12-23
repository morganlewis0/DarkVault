import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { DarkVault, DarkVault__factory } from "../types";
import { expect } from "chai";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("DarkVault")) as DarkVault__factory;
  const darkVault = (await factory.deploy()) as DarkVault;
  const darkVaultAddress = await darkVault.getAddress();

  return { darkVault, darkVaultAddress };
}

describe("DarkVault", function () {
  let signers: Signers;
  let darkVault: DarkVault;
  let darkVaultAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ darkVault, darkVaultAddress } = await deployFixture());
  });

  it("creates a vault and decrypts the key", async function () {
    const vaultKey = ethers.Wallet.createRandom().address;
    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultAddress, signers.alice.address)
      .addAddress(vaultKey)
      .encrypt();

    const tx = await darkVault
      .connect(signers.alice)
      .createVault(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const hasVault = await darkVault.hasVault(signers.alice.address);
    expect(hasVault).to.eq(true);

    const encryptedKey = await darkVault.getVaultKey(signers.alice.address);
    const clearKey = await fhevm.userDecryptEaddress(encryptedKey, darkVaultAddress, signers.alice);

    expect(clearKey).to.eq(ethers.getAddress(vaultKey));
  });

  it("stores a ciphertext string in the vault", async function () {
    const vaultKey = ethers.Wallet.createRandom().address;
    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultAddress, signers.alice.address)
      .addAddress(vaultKey)
      .encrypt();

    const createTx = await darkVault
      .connect(signers.alice)
      .createVault(encryptedInput.handles[0], encryptedInput.inputProof);
    await createTx.wait();

    const ciphertext = "dv1:example:payload";
    const storeTx = await darkVault.connect(signers.alice).storeSecret(ciphertext);
    await storeTx.wait();

    const count = await darkVault.getSecretCount(signers.alice.address);
    expect(count).to.eq(1);

    const stored = await darkVault.getSecret(signers.alice.address, 0);
    expect(stored).to.eq(ciphertext);
  });

  it("rejects duplicate vault creation", async function () {
    const vaultKey = ethers.Wallet.createRandom().address;
    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultAddress, signers.alice.address)
      .addAddress(vaultKey)
      .encrypt();

    const tx = await darkVault
      .connect(signers.alice)
      .createVault(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    const secondInput = await fhevm
      .createEncryptedInput(darkVaultAddress, signers.alice.address)
      .addAddress(ethers.Wallet.createRandom().address)
      .encrypt();

    await expect(
      darkVault.connect(signers.alice).createVault(secondInput.handles[0], secondInput.inputProof),
    ).to.be.revertedWithCustomError(darkVault, "VaultAlreadyExists");
  });
});
