# DarkVault

DarkVault is an end-to-end FHE (Fully Homomorphic Encryption) vault that lets users create a private encrypted vault key, store encrypted strings, and later decrypt them only after recovering the vault key. It is built on Zama FHEVM smart contracts and a React + Vite frontend, with a strict split between read/write clients and a privacy-first UX.

This repository contains:
- Solidity smart contracts that handle encrypted key and data storage
- Hardhat deployment and task tooling
- Tests to validate encryption and access flows
- A React + Vite frontend that interacts with the contracts

---

## What This Project Does

DarkVault provides a full privacy-preserving flow:
1. A user generates a random EVM address A locally.
2. Address A is encrypted with Zama FHE and stored in the user's vault as the vault key.
3. The user encrypts a string using address A and stores the encrypted string in the vault.
4. To decrypt stored strings, the user first decrypts address A, then uses A to decrypt the string.

This keeps plaintext secrets off-chain and enforces a two-step decryption flow.

---

## Problems Solved

- **On-chain privacy for secrets**: data is stored encrypted; only ciphertext is visible on-chain.
- **Key management separation**: the encryption key (address A) is itself encrypted and stored in the vault.
- **Progressive disclosure**: decrypting content requires first recovering the encrypted key, then the data.
- **Deterministic user flow**: clear, repeatable steps to generate, store, and recover encrypted content.

---

## Key Advantages

- **FHE-native design**: leverages Zama FHEVM to operate on encrypted data.
- **No plaintext storage**: plaintext never touches the chain.
- **Strict frontend rules**: no localhost network usage, no localStorage, and no environment variables in the frontend.
- **Clear read/write split**: contract reads via viem and writes via ethers.
- **Upgradeable UX**: the frontend is structured to expand to more vault features without rewriting contract logic.

---

## Tech Stack

**Smart Contracts**
- Solidity
- Hardhat
- Zama FHEVM
- Hardhat Deploy and Tasks

**Frontend**
- React
- Vite
- viem (read-only calls)
- ethers (write transactions)
- Rainbow integration (wallet UX)
- No Tailwind CSS

**Tooling**
- npm
- dotenv for contract deploy config (only in Hardhat context)

---

## Repository Structure

```
.
├── contracts/         Smart contract source files
├── deploy/            Deployment scripts
├── docs/              Zama-related references and notes
├── frontend/          React + Vite frontend app
├── tasks/             Hardhat tasks
├── test/              Hardhat tests
├── hardhat.config.ts  Hardhat configuration
└── README.md          Project overview
```

---

## How It Works (Detailed Flow)

### Vault Creation
1. Generate a random EVM address A locally.
2. Encrypt A using Zama FHE.
3. Store the encrypted A in the vault contract as the vault key.

### Store a Secret
1. Take a plaintext string.
2. Encrypt the string using address A.
3. Store the encrypted string in the vault.

### Decrypt a Secret
1. Decrypt the encrypted address A from the vault.
2. Use A to decrypt the encrypted string.

---

## Contracts

- Handle encrypted address and encrypted strings storage.
- Expose read-only view methods (no use of msg.sender inside view methods).
- Enforce encrypted data types through FHEVM.

---

## Frontend Expectations

- Uses ABI generated from `deployments/sepolia`.
- Reads data with viem, writes data with ethers.
- No localStorage usage.
- No localhost network usage.
- No environment variables.
- No Tailwind CSS.
- No JSON files in the frontend.

---

## Installation

```bash
npm install
```

---

## Local Development

### Compile

```bash
npm run compile
```

### Test

```bash
npm run test
```

### Local Node (FHEVM-ready)

```bash
npx hardhat node
```

### Deploy to Local Node

```bash
npx hardhat deploy --network localhost
```

---

## Deploy to Sepolia

This project deploys using a private key (no mnemonic). Ensure you have a `.env` with:
- `INFURA_API_KEY`
- `PRIVATE_KEY`

Then run:

```bash
npx hardhat deploy --network sepolia
```

---

## Testing on Sepolia

```bash
npx hardhat test --network sepolia
```

---

## Documentation References

- Zama FHEVM documentation: `docs/zama_llm.md`
- Zama frontend relayer notes: `docs/zama_doc_relayer.md`

---

## Future Plans

- **Multi-secret support**: multiple encrypted strings per vault with indexing.
- **Access control layers**: optional shared vaults and delegated access.
- **Improved key recovery UX**: clear UI flows to guide decrypt-then-decrypt.
- **Audit-ready tests**: expanded coverage for edge cases and invalid ciphertext.
- **Relayer and gas abstraction**: reduce friction for first-time users.
- **UX hardening**: better error messaging and encrypted state previews.

---

## License

BSD-3-Clause-Clear. See `LICENSE`.
