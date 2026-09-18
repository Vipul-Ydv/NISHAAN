/**
 * Higher-level encryption operations the dashboards call.
 *
 * Wraps the primitives in crypto.ts into the three things the UI actually does:
 * make sure the signed-in user has a published encryption key, seal a record for
 * the people who must read it, and open a record the user has been granted.
 */

import { ethers } from "ethers";

import {
    type EncryptionKeypair,
    deriveEncryptionKeypair,
    generateContentKey,
    exportContentKey,
    importContentKey,
    encryptFile,
    decryptToBlob,
    wrapContentKey,
    unwrapContentKey,
    toBase64,
    fromBase64,
} from "./crypto";

/** Public IPFS gateway used to fetch ciphertext back. */
const IPFS_GATEWAY = "https://ipfs.io/ipfs";

/**
 * The derived keypair for this browser session.
 *
 * Cached in memory only so the user signs once per session instead of once per
 * file. It is never written to storage: the keypair can always be re-derived
 * from a signature, so persisting it would add risk for no benefit.
 */
let cachedKeypair: { account: string; keypair: EncryptionKeypair } | null = null;

export function clearCachedKeypair(): void {
    cachedKeypair = null;
}

/**
 * Returns the user's encryption keypair, deriving it if needed.
 * Prompts the wallet to sign once per session per account.
 */
export async function getKeypair(
    provider: ethers.BrowserProvider,
    account: string
): Promise<EncryptionKeypair> {
    if (cachedKeypair && cachedKeypair.account.toLowerCase() === account.toLowerCase()) {
        return cachedKeypair.keypair;
    }

    const signer = await provider.getSigner();
    const keypair = await deriveEncryptionKeypair(signer);
    cachedKeypair = { account, keypair };
    return keypair;
}

/**
 * Ensures the user's public key is published on-chain, registering it if the
 * stored one is missing or stale. Returns the keypair either way.
 */
export async function ensureKeyRegistered(
    contract: ethers.Contract,
    provider: ethers.BrowserProvider,
    account: string,
    onStatus?: (message: string) => void
): Promise<EncryptionKeypair> {
    onStatus?.("Sign the message in your wallet to derive your encryption key...");
    const keypair = await getKeypair(provider, account);
    const publicKeyB64 = toBase64(keypair.publicKey);

    const published: string = await contract.getEncryptionPublicKey(account);
    if (published === publicKeyB64) return keypair;

    onStatus?.("Publishing your encryption public key on-chain...");
    const tx = await contract.registerEncryptionKey(publicKeyB64);
    await tx.wait();

    return keypair;
}

export interface KeyRecipient {
    address: string;
    name: string;
    role: string;
}

/**
 * Lists approved users who have published an encryption key and can therefore
 * be granted access.
 *
 * Reads the registration array, which retains users after approval, so it
 * doubles as the directory of everyone who has ever registered.
 */
export async function listKeyHolders(
    contract: ethers.Contract,
    roleFilter?: string
): Promise<KeyRecipient[]> {
    const count = Number(await contract.getPendingUsersCount());
    const holders: KeyRecipient[] = [];

    for (let i = 0; i < count; i++) {
        const [address, name, role, status] = await contract.getPendingUser(i);
        if (Number(status) !== 1) continue; // 1 = Approved
        if (roleFilter && role !== roleFilter) continue;
        if (!(await contract.hasEncryptionKey(address))) continue;
        holders.push({ address, name, role });
    }

    return holders;
}

/** A file encrypted and ready to pin, alongside its original metadata. */
export interface EncryptedUpload {
    blob: Blob;
    originalName: string;
    originalType: string;
}

export interface SealedRecord {
    uploads: EncryptedUpload[];
    contentKeyRaw: Uint8Array;
}

/**
 * Encrypts every file for one evidence record under a single content key.
 *
 * One key per record rather than per file keeps the number of on-chain grants
 * proportional to recipients rather than to attachments.
 */
export async function sealFiles(files: File[]): Promise<SealedRecord> {
    const contentKey = await generateContentKey();
    const uploads: EncryptedUpload[] = [];

    for (const file of files) {
        uploads.push({
            blob: await encryptFile(file, contentKey),
            originalName: file.name,
            originalType: file.type || "application/octet-stream",
        });
    }

    return { uploads, contentKeyRaw: await exportContentKey(contentKey) };
}

/**
 * Seals a record's content key to each recipient and records the grants.
 *
 * Returns the recipients that were granted, so the caller can tell the user
 * exactly who can now read the record.
 */
export async function grantAccess(
    contract: ethers.Contract,
    evidenceId: string,
    contentKeyRaw: Uint8Array,
    recipients: KeyRecipient[],
    onStatus?: (message: string) => void
): Promise<KeyRecipient[]> {
    const granted: KeyRecipient[] = [];

    for (const recipient of recipients) {
        const theirPublicKey = fromBase64(await contract.getEncryptionPublicKey(recipient.address));
        const wrapped = wrapContentKey(contentKeyRaw, theirPublicKey);

        onStatus?.(`Granting decryption access to ${recipient.name}...`);
        const tx = await contract.grantDecryptionKey(evidenceId, recipient.address, wrapped);
        await tx.wait();
        granted.push(recipient);
    }

    return granted;
}

/**
 * Returns the AES content key for a record the caller has been granted.
 *
 * Needed when adding files or revisions to an existing record: new material must
 * be encrypted under the same key, or the recipients already granted access
 * would be unable to read it.
 */
export async function getContentKeyFor(
    contract: ethers.Contract,
    provider: ethers.BrowserProvider,
    account: string,
    evidenceId: string
): Promise<CryptoKey> {
    const wrapped: string = await contract.getMyWrappedKey(evidenceId);
    if (!wrapped) {
        throw new Error(
            "You have no decryption key for this record, so new files cannot be encrypted to match it."
        );
    }

    const keypair = await getKeypair(provider, account);
    return importContentKey(unwrapContentKey(wrapped, keypair.secretKey));
}

/**
 * Fetches an encrypted file and decrypts it with the caller's granted key.
 *
 * Throws a specific error when no key has been granted, so the UI can say the
 * user lacks access rather than reporting a decryption failure.
 */
export async function openEncryptedFile(
    contract: ethers.Contract,
    provider: ethers.BrowserProvider,
    account: string,
    evidenceId: string,
    cid: string,
    mimeType: string
): Promise<Blob> {
    const wrapped: string = await contract.getMyWrappedKey(evidenceId);
    if (!wrapped) {
        throw new Error("No decryption key has been granted to this account for this record.");
    }

    const keypair = await getKeypair(provider, account);
    const contentKey = await importContentKey(unwrapContentKey(wrapped, keypair.secretKey));

    const res = await fetch(`${IPFS_GATEWAY}/${cid}`);
    if (!res.ok) {
        throw new Error(`Could not fetch the file from IPFS (status ${res.status}).`);
    }

    return decryptToBlob(await res.arrayBuffer(), contentKey, mimeType);
}

/** Triggers a browser download for a decrypted blob. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
