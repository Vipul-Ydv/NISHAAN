# Nishaan: Decentralized Evidence Management System

![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg) ![Solidity Status](https://img.shields.io/badge/Solidity-^0.8.28-blue.svg) ![Next.js Status](https://img.shields.io/badge/Next.js-16-black.svg)

Nishaan is a Web3 application for tamper-evident evidence management for law
enforcement and judicial workflows. Evidence files are pinned to IPFS and their
CIDs are anchored on an Ethereum smart contract, so any later alteration of a
file produces a different CID and no longer matches the on-chain record.

## 🌟 Key Features

- **Tamper Evidence:** Files are pinned to IPFS via Pinata. The resulting CID and
  the evidence metadata are written to an Ethereum smart contract. Because a CID
  is derived from the file's content, a modified file cannot match the anchored
  hash — alteration is detectable.
- **Role-Based Execution Policies:** Access control is enforced in the contract.
  Only approved **Police** accounts can submit or append evidence, only **Court**
  accounts can mark evidence Verified, and an **Admin** account provisions access.
- **Transparent Chain of Custody:** Every submission, append, view and status
  change appends an immutable `AccessRecord` with the actor's address, name, role
  and timestamp.
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

- **Evidence files are not encrypted.** Files are pinned to IPFS as-is and the
  court dashboard links them through a public IPFS gateway. Anyone who obtains a
  CID can read the file contents. The contract provides *integrity and
  auditability*, not *confidentiality*. Client-side encryption is not yet
  implemented and is required before any real case data is used.
- **Tips are unlinked on-chain but not network-anonymous.** The contract stores
  and emits no submitter address, but the transaction's `from` address remains
  visible in the chain's public transaction history. A submitter who needs full
  anonymity must use a wallet not tied to their identity.
- **`getEvidence` is a state-changing call.** It appends a "Viewed" custody
  record, so reading evidence costs gas and requires a wallet confirmation. Use
  `getEvidenceData` for a free read that does not log access.
- **No key rotation or revocation.** A rejected user's prior access records
  remain, by design, but there is no mechanism to revoke an approved account.

---

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
4. Chain ID: `31337`
5. Currency Symbol: `ETH`

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

---

## 🛡️ License & Attributions

Originally built for the Hack-N-Win hackathon.
