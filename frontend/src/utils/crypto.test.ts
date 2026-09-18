/**
 * Tests for the evidence encryption module.
 *
 * Run with: npm run test  (node --experimental-strip-types --test)
 *
 * These cover the properties the design depends on, not just the happy path:
 * that derivation is deterministic, that a wrong recipient cannot open a sealed
 * key, and that tampering with ciphertext is detected rather than ignored.
 */

import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { ethers } from "ethers";

import {
    KEY_DERIVATION_VALUE,
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
} from "./crypto.ts";

const COURT_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const POLICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function fileFrom(text: string, name = "fir.txt"): File {
    return new File([text], name, { type: "text/plain" });
}

test("base64 round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    assert.deepEqual(Array.from(fromBase64(toBase64(bytes))), Array.from(bytes));
});

test("key derivation is deterministic for the same wallet", async () => {
    const wallet = new ethers.Wallet(COURT_KEY);

    const first = await deriveEncryptionKeypair(wallet, 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const second = await deriveEncryptionKeypair(wallet, 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");

    // The keypair is never stored, so it must be re-derivable on any device.
    assert.deepEqual(Array.from(first.publicKey), Array.from(second.publicKey));
    assert.deepEqual(Array.from(first.secretKey), Array.from(second.secretKey));
});

test("different wallets derive different keypairs", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const police = await deriveEncryptionKeypair(new ethers.Wallet(POLICE_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");

    assert.notDeepEqual(Array.from(court.publicKey), Array.from(police.publicKey));
});

test("derivation signs typed data bound to the chain and contract", async () => {
    let seenDomain: Record<string, unknown> | null = null;
    let seenValue: Record<string, unknown> | null = null;
    const wallet = new ethers.Wallet(COURT_KEY);
    const spy = {
        signTypedData: async (domain: never, types: never, value: never) => {
            seenDomain = domain;
            seenValue = value;
            return wallet.signTypedData(domain, types, value);
        },
    } as unknown as ethers.Signer;

    await deriveEncryptionKeypair(spy, 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");

    assert.equal(seenDomain!.chainId, 31337);
    assert.equal(seenDomain!.verifyingContract, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    assert.deepEqual(seenValue, KEY_DERIVATION_VALUE);
});

test("a different chain or contract derives a different key", async () => {
    const wallet = new ethers.Wallet(COURT_KEY);
    const a = await deriveEncryptionKeypair(wallet, 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const b = await deriveEncryptionKeypair(wallet, 11155111, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const c = await deriveEncryptionKeypair(wallet, 31337, "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9");

    // The domain is what scopes a derived key to one deployment.
    assert.notDeepEqual(Array.from(a.publicKey), Array.from(b.publicKey));
    assert.notDeepEqual(Array.from(a.publicKey), Array.from(c.publicKey));
});

test("a file round-trips through encrypt and decrypt", async () => {
    const key = await generateContentKey();
    const original = "FIR/2026/0142 - burglary, Kothrud. Complainant: withheld.";

    const encrypted = await encryptFile(fileFrom(original), key);
    const decrypted = await decryptToBlob(await encrypted.arrayBuffer(), key, "text/plain");

    assert.equal(await decrypted.text(), original);
});

test("ciphertext does not contain the plaintext", async () => {
    const key = await generateContentKey();
    const secret = "COMPLAINANT_NAME_SHOULD_NOT_APPEAR";

    const encrypted = await encryptFile(fileFrom(secret), key);
    const raw = Buffer.from(await encrypted.arrayBuffer()).toString("latin1");

    assert.ok(!raw.includes(secret), "plaintext leaked into the encrypted blob");
});

test("the wrong content key cannot decrypt", async () => {
    const key = await generateContentKey();
    const otherKey = await generateContentKey();

    const encrypted = await encryptFile(fileFrom("sealed record"), key);
    const bytes = await encrypted.arrayBuffer();
    await assert.rejects(() => decryptToBlob(bytes, otherKey, "text/plain"));
});

test("tampering with ciphertext is detected", async () => {
    const key = await generateContentKey();
    const encrypted = await encryptFile(fileFrom("original evidence text"), key);

    const bytes = new Uint8Array(await encrypted.arrayBuffer());
    bytes[bytes.length - 1] ^= 0xff; // flip a byte in the authentication tag region

    // AES-GCM authenticates, so alteration must throw rather than return garbage.
    await assert.rejects(() => decryptToBlob(bytes.buffer as ArrayBuffer, key, "text/plain"));
});

test("truncated ciphertext is rejected", async () => {
    const key = await generateContentKey();
    await assert.rejects(
        () => decryptToBlob(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, key, "text/plain"),
        /too short/i
    );
});

test("a content key round-trips through wrapping to the right recipient", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const contentKey = await exportContentKey(await generateContentKey());

    const wrapped = wrapContentKey(contentKey, court.publicKey);
    const opened = unwrapContentKey(wrapped, court.secretKey);

    assert.deepEqual(Array.from(opened), Array.from(contentKey));
});

test("a different account cannot open a sealed key", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const police = await deriveEncryptionKeypair(new ethers.Wallet(POLICE_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const contentKey = await exportContentKey(await generateContentKey());

    const wrappedForCourt = wrapContentKey(contentKey, court.publicKey);

    // This is the guarantee the whole design rests on.
    assert.throws(
        () => unwrapContentKey(wrappedForCourt, police.secretKey),
        /not sealed to this account/i
    );
});

test("wrapping the same key twice produces different blobs", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const contentKey = await exportContentKey(await generateContentKey());

    // Fresh ephemeral keypair and nonce each time, so sealed blobs must differ.
    assert.notEqual(
        wrapContentKey(contentKey, court.publicKey),
        wrapContentKey(contentKey, court.publicKey)
    );
});

test("a malformed wrapped key is rejected", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    assert.throws(() => unwrapContentKey(toBase64(new Uint8Array(8)), court.secretKey), /malformed/i);
});

test("end to end: police seals to court, court decrypts, admin cannot", async () => {
    const court = await deriveEncryptionKeypair(new ethers.Wallet(COURT_KEY), 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const admin = { secretKey: nacl.box.keyPair().secretKey };

    // Police side.
    const contentKey = await generateContentKey();
    const encryptedFile = await encryptFile(fileFrom("Seized ledger, page 14."), contentKey);
    const wrappedForCourt = wrapContentKey(await exportContentKey(contentKey), court.publicKey);

    // Court side: unwrap, then decrypt.
    const courtKey = await importContentKey(unwrapContentKey(wrappedForCourt, court.secretKey));
    const recovered = await decryptToBlob(await encryptedFile.arrayBuffer(), courtKey, "text/plain");
    assert.equal(await recovered.text(), "Seized ledger, page 14.");

    // Admin side: holds no wrapped key sealed to them.
    assert.throws(() => unwrapContentKey(wrappedForCourt, admin.secretKey));
});
