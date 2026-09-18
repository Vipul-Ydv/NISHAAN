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
            await contract.connect(court).updateEvidenceStatus("EV-1", 2); // Verified
            expect(await contract.getEvidenceStatus("EV-1")).to.equal(2n);
        });

        it("stops police from verifying their own evidence", async function () {
            await expect(
                contract.connect(police).updateEvidenceStatus("EV-1", 2)
            ).to.be.revertedWith("Only court officials can verify evidence");
        });

        it("lets police move evidence to UnderReview", async function () {
            await contract.connect(police).updateEvidenceStatus("EV-1", 1); // UnderReview
            expect(await contract.getEvidenceStatus("EV-1")).to.equal(1n);
        });

        it("logs the status change in the chain of custody", async function () {
            await contract.connect(court).updateEvidenceStatus("EV-1", 2);
            const record = await contract.getChainOfCustodyRecord("EV-1", 1);
            expect(record.action).to.equal("StatusChanged");
            expect(record.accessorRole).to.equal("Court");
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
