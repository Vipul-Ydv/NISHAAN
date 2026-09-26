import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;

describe("EvidenceManagement", function () {
    let contract, admin, police, court, outsider;

    beforeEach(async function () {
        [admin, police, court, outsider] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("EvidenceManagement");
        contract = await Factory.deploy();
        await contract.waitForDeployment();
    });

    /** Registers and admin-approves a signer in the given role. */
    async function onboard(signer, name, role) {
        await contract.connect(signer).registerUser(name, role);
        await contract.connect(admin).approveUser(signer.address);
    }

    describe("deployment", function () {
        it("makes the deployer an approved admin", async function () {
            expect(await contract.getAdmin()).to.equal(admin.address);
            expect(await contract.getUserRole(admin.address)).to.equal("Admin");
            expect(await contract.isUserApproved(admin.address)).to.equal(true);
        });

        it("starts with no evidence and no tips", async function () {
            expect(await contract.getEvidenceCount()).to.equal(0n);
            expect(await contract.getTipsCount()).to.equal(0n);
        });
    });

    describe("user registration", function () {
        it("registers a police officer as pending", async function () {
            await contract.connect(police).registerUser("Officer Rane", "Police");
            expect(await contract.isUserRegistered(police.address)).to.equal(true);
            expect(await contract.isUserApproved(police.address)).to.equal(false);
            expect(await contract.getPendingUsersCount()).to.equal(1n);
        });

        it("rejects a role other than Police or Court", async function () {
            await expect(
                contract.connect(outsider).registerUser("Nobody", "Hacker")
            ).to.be.revertedWith("Role must be either Police or Court");
        });

        it("rejects double registration", async function () {
            await contract.connect(police).registerUser("Officer Rane", "Police");
            await expect(
                contract.connect(police).registerUser("Officer Rane", "Police")
            ).to.be.revertedWith("User already registered");
        });

        it("lets only the admin approve", async function () {
            await contract.connect(police).registerUser("Officer Rane", "Police");
            await expect(
                contract.connect(outsider).approveUser(police.address)
            ).to.be.revertedWith("Only admin can perform this action");
        });

        it("records a rejection", async function () {
            await contract.connect(police).registerUser("Officer Rane", "Police");
            await contract.connect(admin).rejectUser(police.address);
            expect(await contract.isUserApproved(police.address)).to.equal(false);
        });
    });

    describe("addEvidence", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
        });

        it("stores evidence submitted by approved police", async function () {
            await contract.connect(police).addEvidence(
                "EV-1", ["Qm1", "Qm2"], "FIR/2026/001", "Pune", "Theft", ["image/png", "application/pdf"]
            );

            const data = await contract.getEvidenceData("EV-1");
            expect(data.exists).to.equal(true);
            expect(data.ipfsHashes).to.deep.equal(["Qm1", "Qm2"]);
            expect(data.caseNumber).to.equal("FIR/2026/001");
            expect(data.officerName).to.equal("Officer Rane");
            expect(data.status).to.equal(0n); // Submitted
            expect(await contract.getEvidenceCount()).to.equal(1n);
        });

        it("blocks a court official from submitting", async function () {
            await expect(
                contract.connect(court).addEvidence("EV-2", ["Qm1"], "FIR/2", "Pune", "Theft", ["image/png"])
            ).to.be.revertedWith("Only police officers can perform this action");
        });

        it("blocks an unapproved officer from submitting", async function () {
            await contract.connect(outsider).registerUser("Unapproved", "Police");
            await expect(
                contract.connect(outsider).addEvidence("EV-3", ["Qm1"], "FIR/3", "Pune", "Theft", ["image/png"])
            ).to.be.revertedWith("User not approved by admin");
        });

        it("rejects a duplicate evidence id", async function () {
            await contract.connect(police).addEvidence("EV-1", ["Qm1"], "FIR/1", "Pune", "Theft", ["image/png"]);
            await expect(
                contract.connect(police).addEvidence("EV-1", ["Qm9"], "FIR/9", "Pune", "Fraud", ["image/png"])
            ).to.be.revertedWith("Evidence ID already exists");
        });

        it("opens the chain of custody with a Submitted record", async function () {
            await contract.connect(police).addEvidence("EV-1", ["Qm1"], "FIR/1", "Pune", "Theft", ["image/png"]);
            expect(await contract.getChainOfCustodyLength("EV-1")).to.equal(1n);

            const record = await contract.getChainOfCustodyRecord("EV-1", 0);
            expect(record.accessedBy).to.equal(police.address);
            expect(record.accessorRole).to.equal("Police");
            expect(record.action).to.equal("Submitted");
        });
    });

    describe("appendEvidence", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await contract.connect(police).addEvidence(
                "EV-1", ["Qm1"], "FIR/2026/001", "Pune", "Theft", ["image/png"]
            );
        });

        it("appends files to an existing record", async function () {
            await contract.connect(police).appendEvidence("EV-1", ["Qm2", "Qm3"], ["image/jpeg", "video/mp4"]);

            const data = await contract.getEvidenceData("EV-1");
            expect(data.ipfsHashes).to.deep.equal(["Qm1", "Qm2", "Qm3"]);
            expect(data.fileTypes).to.deep.equal(["image/png", "image/jpeg", "video/mp4"]);
        });

        it("logs the append in the chain of custody", async function () {
            await contract.connect(police).appendEvidence("EV-1", ["Qm2"], ["image/jpeg"]);
            expect(await contract.getChainOfCustodyLength("EV-1")).to.equal(2n);

            const record = await contract.getChainOfCustodyRecord("EV-1", 1);
            expect(record.action).to.equal("AppendedFiles");
        });

        it("emits EvidenceAppended", async function () {
            await expect(contract.connect(police).appendEvidence("EV-1", ["Qm2"], ["image/jpeg"]))
                .to.emit(contract, "EvidenceAppended");
        });

        it("rejects an unknown evidence id", async function () {
            await expect(
                contract.connect(police).appendEvidence("EV-404", ["Qm2"], ["image/jpeg"])
            ).to.be.revertedWith("Evidence does not exist");
        });
    });

    describe("updateEvidenceStatus", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
            await contract.connect(police).addEvidence(
                "EV-1", ["Qm1"], "FIR/2026/001", "Pune", "Theft", ["image/png"]
            );
        });

        it("lets the court verify", async function () {
            await contract.connect(court).updateEvidenceStatus("EV-1", 2, ""); // Verified
            expect(await contract.getEvidenceStatus("EV-1")).to.equal(2n);
        });

        it("stops police from verifying their own evidence", async function () {
            await expect(
                contract.connect(police).updateEvidenceStatus("EV-1", 2, "")
            ).to.be.revertedWith("Only court officials can verify evidence");
        });

        it("lets police move evidence to UnderReview", async function () {
            await contract.connect(police).updateEvidenceStatus("EV-1", 1, "Awaiting the forensic report."); // UnderReview
            expect(await contract.getEvidenceStatus("EV-1")).to.equal(1n);
        });

        it("logs the status change in the chain of custody", async function () {
            await contract.connect(court).updateEvidenceStatus("EV-1", 2, "");
            const record = await contract.getChainOfCustodyRecord("EV-1", 1);
            expect(record.action).to.equal("StatusChanged");
            expect(record.accessorRole).to.equal("Court");
        });
    });

    describe("document versioning", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
            await contract.connect(police).addEvidence(
                "EV-1", ["QmOriginal"], "FIR/2026/001", "Pune", "Theft", ["application/pdf"]
            );
        });

        it("starts with no versions", async function () {
            expect(await contract.getVersionCount("EV-1")).to.equal(0n);
        });

        it("records a revision with its author and note", async function () {
            await contract.connect(police).addDocumentVersion(
                "EV-1", "QmV1", "application/pdf", "Corrected the complainant address"
            );

            expect(await contract.getVersionCount("EV-1")).to.equal(1n);

            const version = await contract.getDocumentVersion("EV-1", 0);
            expect(version.ipfsHash).to.equal("QmV1");
            expect(version.note).to.equal("Corrected the complainant address");
            expect(version.author).to.equal(police.address);
            expect(version.authorName).to.equal("Officer Rane");
        });

        it("keeps earlier versions unchanged when a new one is added", async function () {
            await contract.connect(police).addDocumentVersion("EV-1", "QmV1", "application/pdf", "first revision");
            await contract.connect(police).addDocumentVersion("EV-1", "QmV2", "application/pdf", "second revision");

            expect(await contract.getVersionCount("EV-1")).to.equal(2n);

            // The whole point of the feature: v1 is still readable and untouched.
            const first = await contract.getDocumentVersion("EV-1", 0);
            expect(first.ipfsHash).to.equal("QmV1");
            expect(first.note).to.equal("first revision");

            const second = await contract.getDocumentVersion("EV-1", 1);
            expect(second.ipfsHash).to.equal("QmV2");
        });

        it("returns the newest revision from getLatestVersion", async function () {
            await contract.connect(police).addDocumentVersion("EV-1", "QmV1", "application/pdf", "first");
            await contract.connect(police).addDocumentVersion("EV-1", "QmV2", "application/pdf", "second");

            const latest = await contract.getLatestVersion("EV-1");
            expect(latest.ipfsHash).to.equal("QmV2");
            expect(latest.note).to.equal("second");
        });

        it("logs every revision in the chain of custody", async function () {
            await contract.connect(police).addDocumentVersion("EV-1", "QmV1", "application/pdf", "first");

            expect(await contract.getChainOfCustodyLength("EV-1")).to.equal(2n);
            const record = await contract.getChainOfCustodyRecord("EV-1", 1);
            expect(record.action).to.equal("VersionAdded");
            expect(record.accessorName).to.equal("Officer Rane");
        });

        it("emits DocumentVersionAdded with the version index", async function () {
            await expect(contract.connect(police).addDocumentVersion("EV-1", "QmV1", "application/pdf", "first"))
                .to.emit(contract, "DocumentVersionAdded");
        });

        it("blocks a court official from adding a version", async function () {
            await expect(
                contract.connect(court).addDocumentVersion("EV-1", "QmV1", "application/pdf", "tampering")
            ).to.be.revertedWith("Only police officers can perform this action");
        });

        it("rejects a version on an unknown evidence id", async function () {
            await expect(
                contract.connect(police).addDocumentVersion("EV-404", "QmV1", "application/pdf", "x")
            ).to.be.revertedWith("Evidence does not exist");
        });

        it("rejects a version with no IPFS hash", async function () {
            await expect(
                contract.connect(police).addDocumentVersion("EV-1", "", "application/pdf", "x")
            ).to.be.revertedWith("Version requires an IPFS hash");
        });

        it("rejects reading past the end of the history", async function () {
            await expect(contract.getDocumentVersion("EV-1", 0)).to.be.revertedWith("Version does not exist");
        });

        it("rejects getLatestVersion when nothing is recorded", async function () {
            await expect(contract.getLatestVersion("EV-1")).to.be.revertedWith("No versions recorded");
        });
    });

    describe("status change reasons", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
            await contract.connect(police).addEvidence(
                "EV-1", ["Qm1"], "FIR/2026/001", "Pune", "Theft", ["application/pdf"]
            );
        });

        it("records the reason a record was flagged for review", async function () {
            await contract.connect(court).updateEvidenceStatus(
                "EV-1", 1, "Medical report contradicts the complainant statement."
            );

            const length = Number(await contract.getChainOfCustodyLength("EV-1"));
            const record = await contract.getChainOfCustodyRecord("EV-1", length - 1);
            expect(record.action).to.equal("StatusChanged");
            expect(record.note).to.equal("Medical report contradicts the complainant statement.");
        });

        it("refuses to flag for review without a reason", async function () {
            // Flagging is the decision someone will later be asked to justify, so
            // the contract will not accept it unexplained.
            await expect(
                contract.connect(court).updateEvidenceStatus("EV-1", 1, "")
            ).to.be.revertedWith("A reason is required to flag for review");

            expect(await contract.getEvidenceStatus("EV-1")).to.equal(0n);
        });

        it("allows verification without a reason", async function () {
            await contract.connect(court).updateEvidenceStatus("EV-1", 2, "");

            expect(await contract.getEvidenceStatus("EV-1")).to.equal(2n);
            const length = Number(await contract.getChainOfCustodyLength("EV-1"));
            expect((await contract.getChainOfCustodyRecord("EV-1", length - 1)).note).to.equal("");
        });

        it("keeps a reason given on verification", async function () {
            await contract.connect(court).updateEvidenceStatus("EV-1", 2, "Chain of custody is intact.");

            const length = Number(await contract.getChainOfCustodyLength("EV-1"));
            expect((await contract.getChainOfCustodyRecord("EV-1", length - 1)).note)
                .to.equal("Chain of custody is intact.");
        });

        it("leaves other custody entries with an empty note", async function () {
            // Submitted was written before this feature existed; it must still read.
            const record = await contract.getChainOfCustodyRecord("EV-1", 0);
            expect(record.action).to.equal("Submitted");
            expect(record.note).to.equal("");
        });
    });

    describe("encryption key directory", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
        });

        it("publishes a public key for an approved user", async function () {
            await contract.connect(court).registerEncryptionKey("court-x25519-pubkey");

            expect(await contract.hasEncryptionKey(court.address)).to.equal(true);
            expect(await contract.getEncryptionPublicKey(court.address)).to.equal("court-x25519-pubkey");
        });

        it("reports no key before registration", async function () {
            expect(await contract.hasEncryptionKey(police.address)).to.equal(false);
            expect(await contract.getEncryptionPublicKey(police.address)).to.equal("");
        });

        it("lets a user replace their key", async function () {
            await contract.connect(court).registerEncryptionKey("first-key");
            await contract.connect(court).registerEncryptionKey("second-key");
            expect(await contract.getEncryptionPublicKey(court.address)).to.equal("second-key");
        });

        it("blocks an unapproved user from registering", async function () {
            await expect(
                contract.connect(outsider).registerEncryptionKey("nope")
            ).to.be.revertedWith("User not approved by admin");
        });

        it("rejects an empty key", async function () {
            await expect(
                contract.connect(court).registerEncryptionKey("")
            ).to.be.revertedWith("Public key required");
        });

        it("emits EncryptionKeyRegistered", async function () {
            await expect(contract.connect(court).registerEncryptionKey("k"))
                .to.emit(contract, "EncryptionKeyRegistered");
        });
    });

    describe("decryption access", function () {
        beforeEach(async function () {
            await onboard(police, "Officer Rane", "Police");
            await onboard(court, "Judge Menon", "Court");
            await contract.connect(court).registerEncryptionKey("court-x25519-pubkey");
            await contract.connect(police).addEvidence(
                "EV-1", ["QmCiphertext"], "FIR/2026/001", "Pune", "Theft", ["application/pdf"]
            );
        });

        it("grants a wrapped key the recipient can read back", async function () {
            await contract.connect(police).grantDecryptionKey("EV-1", court.address, "sealed-for-court");

            expect(await contract.hasDecryptionAccess("EV-1", court.address)).to.equal(true);
            expect(await contract.connect(court).getMyWrappedKey("EV-1")).to.equal("sealed-for-court");
        });

        it("does not give the admin a key, so the admin cannot decrypt", async function () {
            await contract.connect(police).grantDecryptionKey("EV-1", court.address, "sealed-for-court");

            // The whole point of the design: governing access is not reading evidence.
            expect(await contract.hasDecryptionAccess("EV-1", admin.address)).to.equal(false);
            expect(await contract.connect(admin).getMyWrappedKey("EV-1")).to.equal("");
        });

        it("scopes getMyWrappedKey to the caller", async function () {
            await contract.connect(police).grantDecryptionKey("EV-1", court.address, "sealed-for-court");

            // Police granted it but was not itself a recipient.
            expect(await contract.connect(police).getMyWrappedKey("EV-1")).to.equal("");
        });

        it("logs the grant in the chain of custody", async function () {
            await contract.connect(police).grantDecryptionKey("EV-1", court.address, "sealed-for-court");

            expect(await contract.getChainOfCustodyLength("EV-1")).to.equal(2n);
            const record = await contract.getChainOfCustodyRecord("EV-1", 1);
            expect(record.action).to.equal("AccessGranted");
            expect(record.accessorRole).to.equal("Police");
        });

        it("refuses a recipient who has published no encryption key", async function () {
            await expect(
                contract.connect(police).grantDecryptionKey("EV-1", police.address, "sealed")
            ).to.be.revertedWith("Recipient has not published an encryption key");
        });

        it("refuses an unregistered recipient", async function () {
            await expect(
                contract.connect(police).grantDecryptionKey("EV-1", outsider.address, "sealed")
            ).to.be.revertedWith("Recipient not registered");
        });

        it("refuses an unknown evidence id", async function () {
            await expect(
                contract.connect(police).grantDecryptionKey("EV-404", court.address, "sealed")
            ).to.be.revertedWith("Evidence does not exist");
        });

        it("refuses an empty wrapped key", async function () {
            await expect(
                contract.connect(police).grantDecryptionKey("EV-1", court.address, "")
            ).to.be.revertedWith("Wrapped key required");
        });

        it("refuses to seal a key to the admin", async function () {
            // The constructor registers and approves the admin, so without an
            // explicit role check the admin would be a valid recipient and could
            // be handed evidence it is only supposed to govern.
            await contract.connect(admin).registerEncryptionKey("admin-x25519-pubkey");

            await expect(
                contract.connect(police).grantDecryptionKey("EV-1", admin.address, "sealed-for-admin")
            ).to.be.revertedWith("Recipient must be Police or Court");

            expect(await contract.hasDecryptionAccess("EV-1", admin.address)).to.equal(false);
        });

        it("allows sealing to another police officer", async function () {
            await contract.connect(police).registerEncryptionKey("police-x25519-pubkey");
            await contract.connect(police).grantDecryptionKey("EV-1", police.address, "sealed-for-self");

            expect(await contract.hasDecryptionAccess("EV-1", police.address)).to.equal(true);
        });

        it("blocks a court official from granting access", async function () {
            await expect(
                contract.connect(court).grantDecryptionKey("EV-1", court.address, "self-grant")
            ).to.be.revertedWith("Only police officers can perform this action");
        });

        it("emits DecryptionAccessGranted", async function () {
            await expect(contract.connect(police).grantDecryptionKey("EV-1", court.address, "sealed"))
                .to.emit(contract, "DecryptionAccessGranted");
        });
    });

    describe("anonymous tips", function () {
        it("stores a tip without any submitter address", async function () {
            await contract.connect(outsider).submitAnonymousTip("QmTip", "Saw a handoff near the docks");

            expect(await contract.getTipsCount()).to.equal(1n);

            const tip = await contract.getTip(0);
            expect(tip.ipfsHash).to.equal("QmTip");
            expect(tip.description).to.equal("Saw a handoff near the docks");

            // Regression guard: getTip must not expose a submitter address.
            expect(tip.length).to.equal(3);
            for (const field of tip) {
                expect(String(field).toLowerCase()).to.not.equal(outsider.address.toLowerCase());
            }
        });

        it("emits TipSubmitted without a submitter address", async function () {
            const tx = await contract.connect(outsider).submitAnonymousTip("QmTip", "A description");
            const receipt = await tx.wait();

            const parsed = receipt.logs
                .map((log) => {
                    try {
                        return contract.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find((entry) => entry && entry.name === "TipSubmitted");

            expect(parsed, "TipSubmitted was not emitted").to.not.equal(undefined);
            expect(parsed.args.length).to.equal(2);
            expect(parsed.fragment.inputs.map((input) => input.name)).to.deep.equal(["tipId", "timestamp"]);
        });

        it("accepts tips from anyone, including unregistered wallets", async function () {
            await contract.connect(outsider).submitAnonymousTip("QmA", "one");
            await contract.connect(police).submitAnonymousTip("QmB", "two");
            expect(await contract.getTipsCount()).to.equal(2n);
        });
    });
});
