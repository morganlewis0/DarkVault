import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { DARK_VAULT_ABI, DARK_VAULT_ADDRESS } from '../config/contracts';
import { Header } from './Header';
import '../styles/VaultApp.css';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(address: string): Promise<CryptoKey> {
  const normalized = address.toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(normalized));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(address: string, plaintext: string): Promise<string> {
  const key = await deriveKey(address);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plaintext));
  const payload = bytesToBase64(new Uint8Array(encrypted));
  return `dv1:${bytesToBase64(iv)}:${payload}`;
}

async function decryptSecret(address: string, payload: string): Promise<string> {
  const [prefix, ivValue, dataValue] = payload.split(':');
  if (prefix !== 'dv1' || !ivValue || !dataValue) {
    throw new Error('Unsupported ciphertext format');
  }
  const key = await deriveKey(address);
  const iv = base64ToBytes(ivValue);
  const data = base64ToBytes(dataValue);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(decrypted);
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function VaultApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasVault, setHasVault] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [vaultKey, setVaultKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [isStoring, setIsStoring] = useState(false);
  const [ciphertexts, setCiphertexts] = useState<string[]>([]);
  const [decryptedSecrets, setDecryptedSecrets] = useState<string[]>([]);

  const contractAddress = useMemo(() => DARK_VAULT_ADDRESS as `0x${string}`, []);

  const syncVault = useCallback(async () => {
    if (!address || !publicClient) {
      return;
    }
    setIsFetching(true);
    setStatusMessage(null);

    try {
      const vaultExists = (await publicClient.readContract({
        address: contractAddress,
        abi: DARK_VAULT_ABI,
        functionName: 'hasVault',
        args: [address],
      })) as boolean;

      setHasVault(vaultExists);
      if (!vaultExists) {
        setCiphertexts([]);
        return;
      }

      const count = (await publicClient.readContract({
        address: contractAddress,
        abi: DARK_VAULT_ABI,
        functionName: 'getSecretCount',
        args: [address],
      })) as bigint;

      const total = Number(count);
      const entries = await Promise.all(
        Array.from({ length: total }, (_, index) =>
          publicClient.readContract({
            address: contractAddress,
            abi: DARK_VAULT_ABI,
            functionName: 'getSecret',
            args: [address, BigInt(index)],
          }),
        ),
      );

      setCiphertexts(entries as string[]);
    } catch (error) {
      console.error('Failed to sync vault:', error);
      setStatusMessage('Unable to sync vault data. Try again in a moment.');
    } finally {
      setIsFetching(false);
    }
  }, [address, contractAddress, publicClient]);

  useEffect(() => {
    setVaultKey(null);
    setCiphertexts([]);
    setDecryptedSecrets([]);
    if (address) {
      syncVault();
    }
  }, [address, syncVault]);

  useEffect(() => {
    if (!vaultKey) {
      setDecryptedSecrets([]);
      return;
    }

    let isActive = true;
    const decryptAll = async () => {
      const results = await Promise.all(
        ciphertexts.map(async (payload) => {
          try {
            return await decryptSecret(vaultKey, payload);
          } catch (error) {
            console.error('Decrypt failed:', error);
            return 'Unable to decrypt with the current key.';
          }
        }),
      );
      if (isActive) {
        setDecryptedSecrets(results);
      }
    };

    decryptAll();
    return () => {
      isActive = false;
    };
  }, [ciphertexts, vaultKey]);

  const createVault = async () => {
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Connect a wallet and wait for the relayer to initialize.');
      return;
    }

    setIsCreating(true);
    setStatusMessage(null);

    try {
      const generatedKey = ethers.Wallet.createRandom().address;
      const encryptedInput = await instance
        .createEncryptedInput(contractAddress, address)
        .addAddress(generatedKey)
        .encrypt();

      const signer = await signerPromise;
      const contract = new Contract(contractAddress, DARK_VAULT_ABI, signer);
      const tx = await contract.createVault(encryptedInput.handles[0], encryptedInput.inputProof);
      await tx.wait();

      setVaultKey(ethers.getAddress(generatedKey));
      setStatusMessage('Vault created. Your key is ready for encryption.');
      await syncVault();
    } catch (error) {
      console.error('Vault creation failed:', error);
      setStatusMessage('Vault creation failed. Please retry.');
    } finally {
      setIsCreating(false);
    }
  };

  const decryptVaultKey = async () => {
    if (!instance || !address || !signerPromise || !publicClient) {
      setStatusMessage('Connect a wallet and wait for the relayer to initialize.');
      return;
    }

    setIsDecrypting(true);
    setStatusMessage(null);

    try {
      const encryptedKey = (await publicClient.readContract({
        address: contractAddress,
        abi: DARK_VAULT_ABI,
        functionName: 'getVaultKey',
        args: [address],
      })) as string;

      if (encryptedKey === ethers.ZeroHash) {
        setStatusMessage('Vault key is not initialized yet.');
        return;
      }

      const signer = await signerPromise;
      const signerAddress = await signer.getAddress();
      const keypair = instance.generateKeypair();
      const contractAddresses = [contractAddress];
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '3';
      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      );
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        [{ handle: encryptedKey, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        signerAddress,
        startTimestamp,
        durationDays,
      );

      const decrypted = result[encryptedKey] || result.clearValues?.[encryptedKey];
      if (!decrypted) {
        throw new Error('No decrypted key found');
      }

      setVaultKey(ethers.getAddress(decrypted));
      setStatusMessage('Vault key decrypted for this session.');
    } catch (error) {
      console.error('Decrypt key failed:', error);
      setStatusMessage('Failed to decrypt vault key. Try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const storeSecret = async () => {
    if (!vaultKey) {
      setStatusMessage('Decrypt the vault key before storing secrets.');
      return;
    }
    if (!secretInput.trim()) {
      setStatusMessage('Enter a secret message before encrypting.');
      return;
    }
    if (!signerPromise) {
      setStatusMessage('Connect a wallet to store encrypted secrets.');
      return;
    }

    setIsStoring(true);
    setStatusMessage(null);

    try {
      const ciphertext = await encryptSecret(vaultKey, secretInput.trim());
      const signer = await signerPromise;
      const contract = new Contract(contractAddress, DARK_VAULT_ABI, signer);
      const tx = await contract.storeSecret(ciphertext);
      await tx.wait();

      setSecretInput('');
      setStatusMessage('Encrypted secret stored on-chain.');
      await syncVault();
    } catch (error) {
      console.error('Store secret failed:', error);
      setStatusMessage('Failed to store secret. Please retry.');
    } finally {
      setIsStoring(false);
    }
  };

  const connectionStatus = isConnected && address ? formatAddress(address) : 'Wallet not connected';
  const vaultKeyDisplay = vaultKey ? formatAddress(vaultKey) : 'Not decrypted yet';

  return (
    <div className="vault-app">
      <Header />
      <main className="vault-main">
        <section className="vault-hero">
          <div className="vault-hero-text">
            <p className="vault-eyebrow">Encrypted vaults on Sepolia</p>
            <h2 className="vault-title">Store secrets with a private key you control.</h2>
            <p className="vault-subtitle">
              Generate a vault key, encrypt strings locally, and commit ciphertexts on-chain. Only
              you can decrypt by re-encrypting the key through the relayer.
            </p>
            <div className="vault-tags">
              <span>Relayer-backed encryption</span>
              <span>AES-GCM payloads</span>
              <span>No local storage</span>
            </div>
          </div>
          <div className="vault-card vault-status-card">
            <div className="status-row">
              <span>Connection</span>
              <strong>{connectionStatus}</strong>
            </div>
            <div className="status-row">
              <span>Vault status</span>
              <strong>{hasVault ? 'Active vault found' : 'No vault yet'}</strong>
            </div>
            <div className="status-row">
              <span>Vault key</span>
              <strong>{vaultKeyDisplay}</strong>
            </div>
            <button
              className="vault-button ghost"
              onClick={syncVault}
              disabled={isFetching || !isConnected}
            >
              {isFetching ? 'Refreshing...' : 'Refresh vault'}
            </button>
            {zamaError && <p className="status-note">Relayer error: {zamaError}</p>}
          </div>
        </section>

        <section className="vault-grid">
          <div className="vault-card">
            <h3>Vault key</h3>
            <p className="vault-body">
              A random address is generated client-side and encrypted with FHE for the vault. The
              encrypted key lives on-chain so you can decrypt it later.
            </p>
            <div className="vault-actions">
              <button
                className="vault-button primary"
                onClick={createVault}
                disabled={isCreating || !isConnected || zamaLoading || hasVault}
              >
                {isCreating ? 'Creating...' : 'Create vault'}
              </button>
              <button
                className="vault-button secondary"
                onClick={decryptVaultKey}
                disabled={isDecrypting || !isConnected || zamaLoading || !hasVault}
              >
                {isDecrypting ? 'Decrypting...' : 'Decrypt vault key'}
              </button>
            </div>
            <p className="vault-hint">
              The decrypted key stays in memory only. Refreshing the page will require a new decrypt
              request.
            </p>
          </div>

          <div className="vault-card">
            <h3>Store a secret</h3>
            <p className="vault-body">
              Encrypt a string using your vault key and store the ciphertext on-chain. Decryption
              happens locally with the same key.
            </p>
            <textarea
              className="vault-textarea"
              placeholder="Enter a secret string..."
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              rows={4}
            />
            <div className="vault-actions">
              <button
                className="vault-button primary"
                onClick={storeSecret}
                disabled={!isConnected || !vaultKey || isStoring || zamaLoading}
              >
                {isStoring ? 'Encrypting...' : 'Encrypt and store'}
              </button>
            </div>
            {!vaultKey && <p className="vault-hint">Decrypt the vault key before encrypting.</p>}
          </div>
        </section>

        <section className="vault-card vault-list-card">
          <div className="vault-list-header">
            <div>
              <h3>Stored secrets</h3>
              <p className="vault-body">
                Ciphertexts are retrieved with viem. Decrypted previews appear when the vault key is
                available.
              </p>
            </div>
            <span className="vault-count">{ciphertexts.length} stored</span>
          </div>

          {ciphertexts.length === 0 ? (
            <div className="vault-empty">
              <p>No encrypted strings stored yet.</p>
            </div>
          ) : (
            <div className="vault-list">
              {ciphertexts.map((ciphertext, index) => (
                <div key={`${ciphertext}-${index}`} className="vault-list-item">
                  <div className="vault-list-row">
                    <span>Ciphertext</span>
                    <code>{ciphertext.slice(0, 42)}...</code>
                  </div>
                  <div className="vault-list-row">
                    <span>Decrypted</span>
                    <strong>{decryptedSecrets[index] || 'Decrypt the vault key.'}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {statusMessage && <div className="vault-banner">{statusMessage}</div>}
      </main>
    </div>
  );
}
