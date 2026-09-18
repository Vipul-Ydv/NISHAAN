/**
 * Integration check for the encryption flow against a real contract.
 *
 * Exercises the whole path the dashboards take - publish key, encrypt, anchor,
 * seal, unwrap, decrypt - against a deployed EvidenceManagement on a local
 * Hardhat node. The unit tests in crypto.test.ts prove the primitives in
 * isolation; this proves they line up with what the contract actually stores.
 *
 * IPFS is stood in for by keeping the ciphertext in memory. Everything else -
 * the contract, the signatures, the sealing - is real.
 *
 * Skipped automatically unless a node is reachable and CONTRACT_ADDRESS is set:
 *   CONTRACT_ADDRESS=0x... node --experimental-strip-types --test src/utils/encryptionFlow.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import { CONTRACT_ABI } from "./constants.ts";
import {
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

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? "";

// Default Hardhat accounts: #0 admin (deployer), #1 police, #2 court.
const KEYS = {
    admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    police: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    court: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
};

async function reachable(): Promise<boolean> {
    if (!CONTRACT_ADDRESS) return false;
    try {
        const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
        return (await provider.getCode(CONTRACT_ADDRESS)) !== "0x";
    } catch {
        return false;
    }
}

const available = await reachable();

test(
    "end-to-end: police encrypts and seals, court decrypts, admin cannot",
    { skip: available ? false : "no local node or CONTRACT_ADDRESS unset" },
    async () => {
        // cacheTimeout: -1 disables nonce/state caching. These accounts are shared
        // with seed-demo.js, so a cached nonce from another process is stale.
        const provider = new ethers.JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
        const admin = new ethers.Wallet(KEYS.admin, provider);
        const police = new ethers.Wallet(KEYS.police, provider);
        const court = new ethers.Wallet(KEYS.court, provider);

        const asAdmin = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, admin);
        const asPolice = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, police);
        const asCourt = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, court);

        const evidenceId = `EV-CRYPTO-${Date.now()}`;

        // --- onboarding ---
        if (!(await asPolice.isUserRegistered(police.address))) {
            await (await asPolice.registerUser("Insp. Crypto", "Police")).wait();
            await (await asAdmin.approveUser(police.address)).wait();
        }
        if (!(await asCourt.isUserRegistered(court.address))) {
            await (await asCourt.registerUser("Judge Crypto", "Court")).wait();
            await (await asAdmin.approveUser(court.address)).wait();
        }

        // --- both publish encryption keys ---
        const courtKeys = await deriveEncryptionKeypair(court, 31337, CONTRACT_ADDRESS);
        const policeKeys = await deriveEncryptionKeypair(police, 31337, CONTRACT_ADDRESS);
        await (await asCourt.registerEncryptionKey(toBase64(courtKeys.publicKey))).wait();
        await (await asPolice.registerEncryptionKey(toBase64(policeKeys.publicKey))).wait();

        assert.equal(await asCourt.hasEncryptionKey(court.address), true);

        // --- police encrypts and anchors ---
        const plaintext = "CONFIDENTIAL: complainant statement, FIR/2026/0142.";
        const contentKey = await generateContentKey();
        const encrypted = await encryptFile(
            new File([plaintext], "statement.txt", { type: "text/plain" }),
            contentKey
        );
        const ciphertext = await encrypted.arrayBuffer(); // stands in for IPFS

        // What a gateway would serve must not contain the plaintext.
        assert.ok(
            !Buffer.from(ciphertext).toString("latin1").includes("complainant statement"),
            "plaintext reached the bytes that would be pinned"
        );

        await (await asPolice.addEvidence(
            evidenceId, ["QmFakeCidForCiphertext"], "FIR/2026/0142", "Pune",
            "Encrypted statement", ["text/plain"]
        )).wait();

        // --- police seals the content key to the court ---
        const contentKeyRaw = await exportContentKey(contentKey);
        const courtPublished = fromBase64(await asPolice.getEncryptionPublicKey(court.address));
        await (await asPolice.grantDecryptionKey(
            evidenceId, court.address, wrapContentKey(contentKeyRaw, courtPublished)
        )).wait();

        // --- court reads its sealed key from chain and decrypts ---
        const sealedForCourt = await asCourt.getMyWrappedKey(evidenceId);
        assert.notEqual(sealedForCourt, "", "court was granted no key");

        const recoveredKey = await importContentKey(
            unwrapContentKey(sealedForCourt, courtKeys.secretKey)
        );
        const decrypted = await decryptToBlob(ciphertext, recoveredKey, "text/plain");
        assert.equal(await decrypted.text(), plaintext);

        // --- admin governs access but holds no key ---
        assert.equal(await asAdmin.hasDecryptionAccess(evidenceId, admin.address), false);
        assert.equal(await asAdmin.getMyWrappedKey(evidenceId), "");

        // --- the grant is auditable ---
        const custodyLength = Number(await asCourt.getChainOfCustodyLength(evidenceId));
        const lastRecord = await asCourt.getChainOfCustodyRecord(evidenceId, custodyLength - 1);
        assert.equal(lastRecord[4], "AccessGranted");
    }
);
