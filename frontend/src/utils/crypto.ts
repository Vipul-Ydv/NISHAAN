/**
 * Client-side evidence encryption.
 *
 * Files are encrypted in the browser before they ever reach IPFS, so a CID alone
 * reveals nothing. Each evidence record gets a random AES-256-GCM content key.
 * That content key is then sealed to a recipient's X25519 public key and stored
 * on-chain, which means:
 *
 *   - the pinning service holds only ciphertext
 *   - the contract holds only sealed keys it cannot open
 *   - the admin governs who is approved but cannot read evidence
 *
 * Key derivation avoids MetaMask's eth_getEncryptionPublicKey and eth_decrypt.
 * Those are deprecated, MetaMask-only, and unsupported on hardware wallets.
 * Instead a user signs EIP-712 typed data and the signature seeds an X25519
 * keypair. Any wallet that can sign typed data can take part.
 *
 * The EIP-712 domain binds the signature to this application, chain and contract
 * address, so a key derived for one deployment cannot be reproduced by prompting
 * on another, and a generic personal_sign phishing prompt cannot produce it.
 *
 * This is hardening, not a boundary. Wallets do not bind a signature to the
 * requesting origin, so a site that reproduces this exact domain and struct can
 * still obtain the signature from a user who approves it. Treat the derived key
 * as being only as safe as the user's signing habits - see Known Limitations.
 *
 * Derivation also relies on ECDSA signatures being deterministic (RFC 6979),
 * which MetaMask and other common wallets implement: signing the same payload
 * with the same key always yields the same bytes, so the keypair is re-derivable
 * on any device and never has to be stored.
 */

import nacl from "tweetnacl";
import { ethers } from "ethers";

/**
 * The EIP-712 payload a user signs to derive their encryption keypair.
 *
 * Changing any of this - the domain name, version, types or values - changes
 * everyone's derived keys and orphans every previously sealed content key. Treat
 * it as permanent once any evidence exists.
 */
export const KEY_DERIVATION_DOMAIN_NAME = "Nishaan Evidence Management";
export const KEY_DERIVATION_DOMAIN_VERSION = "1";

export const KEY_DERIVATION_TYPES = {
    EncryptionKeyDerivation: [
        { name: "purpose", type: "string" },
        { name: "notice", type: "string" },
    ],
} as const;

export const KEY_DERIVATION_VALUE = {
    purpose: "Derive my Nishaan evidence encryption key",
    notice:
        "This signature never leaves your browser and authorises no transaction. " +
        "Only sign it on a Nishaan dashboard.",
} as const;

const AES_KEY_BITS = 256;
const GCM_IV_BYTES = 12;

// --- encoding helpers ----------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// --- keypair derivation --------------------------------------------------

export interface EncryptionKeypair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}

/**
 * Derives the caller's X25519 keypair from an EIP-712 signature.
 *
 * The signature is hashed to a 32-byte seed, so the raw signature is never used
 * as key material directly. chainId and verifyingContract enter the EIP-712
 * domain, which is what ties a derived key to one deployment.
 */
export async function deriveEncryptionKeypair(
    signer: ethers.Signer,
    chainId: bigint | number,
    verifyingContract: string
): Promise<EncryptionKeypair> {
    const domain = {
        name: KEY_DERIVATION_DOMAIN_NAME,
        version: KEY_DERIVATION_DOMAIN_VERSION,
        chainId: Number(chainId),
        verifyingContract,
    };

    const signature = await signer.signTypedData(
        domain,
        KEY_DERIVATION_TYPES as unknown as Record<string, ethers.TypedDataField[]>,
        KEY_DERIVATION_VALUE
    );

    const seed = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(signature)));
    const pair = nacl.box.keyPair.fromSecretKey(seed);
    return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

// --- content key ---------------------------------------------------------

/** Generates a fresh AES-256-GCM content key for one evidence record. */
export async function generateContentKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: AES_KEY_BITS },
        true, // extractable: the key must be exportable to be sealed to recipients
        ["encrypt", "decrypt"]
    );
}

export async function exportContentKey(key: CryptoKey): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

export async function importContentKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, [
        "encrypt",
        "decrypt",
    ]);
}

// --- file encryption -----------------------------------------------------

/**
 * Encrypts a file with the content key.
 *
 * The 12-byte IV is prepended to the ciphertext so the encrypted blob is
 * self-contained and nothing extra has to be tracked on-chain.
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<Blob> {
    const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
    const plaintext = new Uint8Array(await file.arrayBuffer());

    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext as BufferSource)
    );

    const packed = new Uint8Array(iv.length + ciphertext.length);
    packed.set(iv, 0);
    packed.set(ciphertext, iv.length);
    return new Blob([packed as BufferSource], { type: "application/octet-stream" });
}

/** Reverses encryptFile. Throws if the key is wrong or the data was altered. */
export async function decryptToBlob(
    encrypted: ArrayBuffer,
    key: CryptoKey,
    mimeType: string
): Promise<Blob> {
    const packed = new Uint8Array(encrypted);
    if (packed.length <= GCM_IV_BYTES) {
        throw new Error("Encrypted file is too short to contain an IV.");
    }

    const iv = packed.slice(0, GCM_IV_BYTES);
    const ciphertext = packed.slice(GCM_IV_BYTES);

    // AES-GCM authenticates: a wrong key or a tampered byte throws rather than
    // returning garbage, so a failure here is a genuine integrity signal.
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext as BufferSource
    );

    return new Blob([plaintext], { type: mimeType || "application/octet-stream" });
}

// --- key wrapping --------------------------------------------------------

/**
 * Seals a content key to a recipient's published X25519 public key.
 *
 * Uses an ephemeral sender keypair, so the sealed blob carries everything the
 * recipient needs and the sender's own key is not involved. Returns base64 for
 * on-chain storage.
 */
export function wrapContentKey(
    contentKey: Uint8Array,
    recipientPublicKey: Uint8Array
): string {
    const ephemeral = nacl.box.keyPair();
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const sealed = nacl.box(contentKey, nonce, recipientPublicKey, ephemeral.secretKey);

    const packed = new Uint8Array(
        ephemeral.publicKey.length + nonce.length + sealed.length
    );
    packed.set(ephemeral.publicKey, 0);
    packed.set(nonce, ephemeral.publicKey.length);
    packed.set(sealed, ephemeral.publicKey.length + nonce.length);
    return toBase64(packed);
}

/** Opens a wrapped content key with the recipient's secret key. */
export function unwrapContentKey(wrapped: string, recipientSecretKey: Uint8Array): Uint8Array {
    const packed = fromBase64(wrapped);
    const pkLength = nacl.box.publicKeyLength;
    const nonceLength = nacl.box.nonceLength;

    if (packed.length <= pkLength + nonceLength) {
        throw new Error("Wrapped key is malformed.");
    }

    const ephemeralPublicKey = packed.slice(0, pkLength);
    const nonce = packed.slice(pkLength, pkLength + nonceLength);
    const sealed = packed.slice(pkLength + nonceLength);

    const contentKey = nacl.box.open(sealed, nonce, ephemeralPublicKey, recipientSecretKey);
    if (!contentKey) {
        throw new Error("Could not open the wrapped key. It was not sealed to this account.");
    }
    return contentKey;
}
