import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { DarkVault } from "../types";
import { expect } from "chai";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("DarkVaultSepolia", function () {
  let signers: Signers;
  let darkVault: DarkVault;
  let darkVaultAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("DarkVault");
      darkVaultAddress = deployment.address;
      darkVault = await ethers.getContractAt("DarkVault", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("creates a vault and stores a ciphertext", async function () {
    steps = 6;
    this.timeout(4 * 40000);

    const vaultKey = ethers.Wallet.createRandom().address;
    progress("Encrypting vault key...");
    const encryptedInput = await fhevm
      .createEncryptedInput(darkVaultAddress, signers.alice.address)
      .addAddress(vaultKey)
      .encrypt();

    progress("Calling createVault...");
    let tx = await darkVault
      .connect(signers.alice)
      .createVault(encryptedInput.handles[0], encryptedInput.inputProof);
    await tx.wait();

    progress("Calling hasVault...");
    const hasVault = await darkVault.hasVault(signers.alice.address);
    expect(hasVault).to.eq(true);

    progress("Storing ciphertext...");
    tx = await darkVault.connect(signers.alice).storeSecret("dv1:sepolia:sample");
    await tx.wait();

    progress("Fetching count...");
    const count = await darkVault.getSecretCount(signers.alice.address);
    expect(count).to.eq(1);

    progress("Fetching ciphertext...");
    const stored = await darkVault.getSecret(signers.alice.address, 0);
    expect(stored).to.eq("dv1:sepolia:sample");
  });
});
