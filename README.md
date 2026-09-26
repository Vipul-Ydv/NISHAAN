# Nishaan: Decentralized Evidence Management System

![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg) ![Solidity Status](https://img.shields.io/badge/Solidity-^0.8.28-blue.svg) ![Next.js Status](https://img.shields.io/badge/Next.js-16-black.svg)

Nishaan is a Web3 application for tamper-evident evidence management for law
enforcement and judicial workflows. Evidence files are pinned to IPFS and their
CIDs are anchored on an Ethereum smart contract, so any later alteration of a
file produces a different CID and no longer matches the on-chain record.

## 🌟 Key Features

- **End-to-End Encryption:** Evidence files are encrypted in the browser with a
  per-record AES-256-GCM key before they are pinned. That content key is sealed
  to each authorised reader's X25519 public key and stored on-chain. The pinning
  service holds only ciphertext, the contract holds only sealed keys it cannot
  open, and the admin - who governs who is approved - cannot read evidence.
- **Tamper Evidence:** The CID of the encrypted file and the record metadata are
  written to an Ethereum smart contract. Because a CID is derived from content, a
  modified file cannot match the anchored hash. AES-GCM authenticates in
  addition, so an altered byte fails to decrypt rather than decrypting to
  plausible garbage.
- **Role-Based Execution Policies:** Access control is enforced in the contract.
  Only approved **Police** accounts can submit or append evidence, only **Court**
  accounts can mark evidence Verified, and an **Admin** account provisions access.
- **Transparent Chain of Custody:** Every submission, append, view and status
  change appends an immutable `AccessRecord` with the actor's address, name, role
  and timestamp. A status change also carries the reason it was made: flagging a
  record for review is refused without one, so a decision someone may later be
  asked to justify is never recorded unexplained.
- **Append-Only Case History:** New files can be added to an existing evidence
  record via `appendEvidence` without overwriting what is already anchored.
- **Metadata & Forgery Screening:** Uploaded images are scanned client-side with
  EXIF extraction to flag missing or inconsistent camera metadata.
- **Anonymous Tip Portal:** Members of the public can submit a tip and a file.
  The contract stores no submitter address (see Known Limitations).
- **Immersive UI:** Next.js, Framer Motion and WebGL (Three.js / React Three Fiber).

## ⚠️ Known Limitations

These are current gaps, stated plainly so nobody mistakes the system for
providing a guarantee it does not yet provide.

- **Tips are pinned in the clear while they sit in the tip portal.** A member of
  the public has no account and no published key to seal a file to, so a tip
  attachment is readable to anyone holding its CID until an officer acts on it.
  Converting a tip into an evidence record re-pins an encrypted copy, so evidence
  records are uniformly protected; the original unencrypted tip CID still exists
  and cannot be unpinned by this system.
- **Signature-derived keys are only as safe as the user's signing habits.** The
  EIP-712 domain binds derivation to this application, chain and contract, and a
  plain `personal_sign` prompt cannot reproduce it. But wallets do not bind a
  signature to the requesting origin, so a site that reproduces the exact same
  domain and struct can still obtain the signature from a user who approves it.
  This is hardening, not an enforcement boundary.
- **Key derivation assumes deterministic signatures.** The encryption keypair is
  re-derived from a wallet signature rather than stored. This relies on
  deterministic ECDSA (RFC 6979), which MetaMask implements. A wallet that signs
  the same payload differently each time would derive a different key and be
  unable to decrypt.
- **A user must publish an encryption key before they can be granted access.** A
  judge who has not clicked *Publish Key* cannot be sealed to, and police will be
  told that no court can read the record.
- **Tips are unlinked on-chain but not network-anonymous.** The contract stores
  and emits no submitter address, but the transaction's `from` address remains
  visible in the chain's public transaction history. A submitter who needs full
  anonymity must use a wallet not tied to their identity.
- **`getEvidence` is a state-changing call.** It appends a "Viewed" custody
  record, so reading evidence costs gas and requires a wallet confirmation. Use
  `getEvidenceData` for a free read that does not log access.
- **No key rotation or revocation.** A rejected user's prior access records
  remain, by design, but there is no mechanism to revoke an approved account.
- **The IPFS upload route is unauthenticated.** `/api/ipfs/upload` enforces a
  25 MB cap and a per-instance rate limit, but it does not verify that the caller
  is an approved officer. Anyone who can reach the deployment can spend the
  project's Pinata quota. Restricting it requires wallet signature verification
  on the server.

---

## 🔐 How Encryption Works

1. A user signs an EIP-712 payload whose domain carries the application name,
   the chain id and the contract address. The hashed signature seeds an X25519
   keypair, so the private key is never stored and can be re-derived on any
   device, and a key derived against one deployment is not valid for another.
   Only the public half is published on-chain.
2. Submitting evidence generates a random AES-256-GCM content key. Every file in
   the record is encrypted with it in the browser; only ciphertext reaches Pinata.
3. The content key is sealed to each authorised reader's published key and stored
   via `grantDecryptionKey`. Recipients must hold the Police or Court role: the
   constructor registers and approves the admin, so without that check a content
   key could be sealed to the account that is only meant to govern access. Each
   grant appends an `AccessGranted` custody record.
   Access can be extended later from the police dashboard, which is how a judge
   approved after an upload gains access to historical records.
4. A reader fetches their sealed key with `getMyWrappedKey`, which is scoped to
   `msg.sender`, opens it with their re-derived private key, and decrypts the
   file locally.

This deliberately avoids MetaMask's `eth_getEncryptionPublicKey` and
`eth_decrypt`. Both were deprecated in July 2022, are MetaMask-only and are
unsupported on hardware wallets, which makes them a poor foundation for the one
feature the system's confidentiality depends on.

See Known Limitations for what signature-derived keys do **not** protect against.

## 🏗️ Technology Stack

**Frontend (`/frontend`)**
- Next.js 16 (App Router) & React 19
- Tailwind CSS v4 & Framer Motion (Animations)
- Three.js & React Three Fiber (WebGL elements)
- Ethers.js v6 (Web3 Integration)
- Lucide React (Icons)

**Backend & Contracts (`/backend`)**
- Hardhat Node & Tooling
- Solidity (^0.8.28), optimizer enabled
- IPFS via Pinata (pinning, through a server-side route)
- Chai / Mocha (contract test suite — `backend/test`)

---

## 🚀 Getting Started

You will need multiple terminal windows.

### Prerequisites

1. **Node.js**: `v22.20.0` or higher.
2. **Browser Wallet**: MetaMask or similar.
3. **Pinata Account**: for API keys to pin evidence to IPFS.

### 1. Start the Local Blockchain Node

```bash
cd backend
npm install
cp .env.example .env
npm run node
```
*Keep this terminal running.*

### 1.5 Configure Your Wallet for the Local Network

1. Open your wallet extension and choose "Add Network".
2. Network Name: `Localhost 8545`
3. RPC URL: `http://127.0.0.1:8545`
4. Chain ID: `31338`
5. Currency Symbol: `ETH`

> The chain id is `31338`, not Hardhat's default `31337`. MetaMask caches block
> state per chain id, so a wallet that has seen any other local `31337` chain
> keeps querying a block this one does not have, and every contract call fails
> with `missing revert data`. A distinct id sidesteps that entirely.

### 2. Deploy the Smart Contract

In a second terminal:
```bash
cd backend
npm run deploy:local
```

The script prints the deployed address **and the network it belongs to**. Copy
the `NEXT_PUBLIC_CONTRACT_ADDRESS=...` line it outputs — you need it in step 3.

To deploy to Sepolia instead, set `SEPOLIA_RPC_URL` and `PRIVATE_KEY` in
`backend/.env` and run `npm run deploy:sepolia`.

> A contract address is specific to the network it was deployed on. A localhost
> address will not resolve on Sepolia, and the app will fail every call. There is
> deliberately no default address in the code.

### 3. Run the Frontend

In a third terminal:
```bash
cd frontend
npm install
cp .env.example .env.local
# paste the address from step 2 and your Pinata keys into .env.local
npm run dev
```

`frontend/.env.local` needs:

```
NEXT_PUBLIC_CONTRACT_ADDRESS="0x..."   # from step 2
PINATA_API_KEY="..."                   # server-side only
PINATA_SECRET_API_KEY="..."            # server-side only
```

> The Pinata keys must **not** be prefixed with `NEXT_PUBLIC_`. That prefix
> inlines a value into the client bundle, which would publish the secret to every
> visitor. Uploads go through the `/api/ipfs/upload` route, which reads the keys
> server-side.

The app runs at [http://localhost:3000](http://localhost:3000).

---

## 📜 Available Scripts

### Backend (`/backend`)
- `npm run node`: Starts the Hardhat local node.
- `npm run compile`: Compiles the smart contracts.
- `npm run deploy:local`: Deploys to the localhost network.
- `npm run deploy:sepolia`: Deploys to Sepolia (needs `.env`).
- `npm test`: Runs the contract test suite (23 tests).

### Frontend (`/frontend`)
- `npm run dev`: Starts the Next.js development server.
- `npm run build`: Builds for production.
- `npm run start`: Runs the production build.
- `npm run lint`: Runs ESLint.
- `npm test`: Runs the encryption tests via Node's built-in test runner.

---

## 🛡️ License & Attributions

Originally built for the Hack-N-Win hackathon.
