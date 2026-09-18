import hre from "hardhat";
import fs from "fs";

/**
 * Seeds a local node with realistic demo data.
 *
 * Run after deploy:local so the dashboards have records to search and a case
 * with a real revision trail. Uses the default Hardhat accounts:
 *   #0 admin (deployer)  #1 police officer  #2 court official
 *
 * Intended for localhost only - it registers and approves users automatically,
 * which is not how the real onboarding flow works.
 */
async function main() {
    const network = hre.network.name;
    if (network !== "localhost" && network !== "hardhat") {
        throw new Error(`Refusing to seed network "${network}". This script is for local demos only.`);
    }

    const address = fs.readFileSync("address.txt", "utf8").trim();
    const [admin, police, court] = await hre.ethers.getSigners();
    const contract = await hre.ethers.getContractAt("EvidenceManagement", address);

    console.log(`Seeding ${address} on ${network}`);
    console.log(`  admin  ${admin.address}`);
    console.log(`  police ${police.address}`);
    console.log(`  court  ${court.address}\n`);

    // --- onboard (idempotent: the contract may already know these accounts) ---
    async function onboard(signer, name, role) {
        if (await contract.isUserRegistered(signer.address)) {
            console.log(`Already registered: ${await contract.getUserName(signer.address)}`);
            return;
        }
        await (await contract.connect(signer).registerUser(name, role)).wait();
        await (await contract.connect(admin).approveUser(signer.address)).wait();
        console.log(`Registered and approved: ${name}`);
    }

    await onboard(police, "Insp. A. Rane", "Police");
    await onboard(court, "Judge S. Menon", "Court");

    // --- cases, worded so search has something to discriminate on ---
    const cases = [
        {
            id: "EVD-2026-0001",
            hashes: ["QmDemoFirScan001"],
            caseNumber: "FIR/2026/0142",
            location: "Kothrud, Pune",
            description: "Burglary reported at a residential flat. Rear window forced open, jewellery missing.",
            types: ["application/pdf"],
        },
        {
            id: "EVD-2026-0002",
            hashes: ["QmDemoCctv002", "QmDemoPhoto002"],
            caseNumber: "FIR/2026/0155",
            location: "Andheri East, Mumbai",
            description: "Vehicle theft from a society parking lot. CCTV footage and number plate photographs collected.",
            types: ["video/mp4", "image/jpeg"],
        },
        {
            id: "EVD-2026-0003",
            hashes: ["QmDemoLedger003"],
            caseNumber: "FIR/2026/0163",
            location: "Sector 62, Noida",
            description: "Financial fraud complaint involving forged cheque leaves and an altered ledger.",
            types: ["application/pdf"],
        },
        {
            id: "EVD-2026-0004",
            hashes: ["QmDemoStatement004"],
            caseNumber: "FIR/2026/0171",
            location: "Kothrud, Pune",
            description: "Witness statement recorded in the Kothrud burglary investigation.",
            types: ["application/pdf"],
        },
    ];

    for (const c of cases) {
        const existing = await contract.getEvidenceData(c.id);
        if (existing.exists) {
            console.log(`Skipped ${c.id} (already present)`);
            continue;
        }
        await (await contract.connect(police).addEvidence(
            c.id, c.hashes, c.caseNumber, c.location, c.description, c.types
        )).wait();
        console.log(`Added ${c.id}  ${c.caseNumber}`);
    }

    // --- a revision trail on the first case ---
    const revisions = [
        ["QmDemoFirScanV2", "Corrected the complainant address and added the missing item list."],
        ["QmDemoFirScanV3", "Attached the forensic fingerprint annexure referenced in para 4."],
    ];

    for (const [hash, note] of revisions) {
        await (await contract.connect(police).addDocumentVersion(
            "EVD-2026-0001", hash, "application/pdf", note
        )).wait();
        console.log(`Revision on EVD-2026-0001: ${note}`);
    }

    // --- one court action so a status other than Submitted exists ---
    await (await contract.connect(court).updateEvidenceStatus("EVD-2026-0003", 2)).wait(); // Verified
    console.log("EVD-2026-0003 marked Verified by the court");

    // --- an anonymous tip ---
    await (await contract.connect(admin).submitAnonymousTip(
        "QmDemoTip001", "Stolen vehicles are being repainted at a garage off the highway."
    )).wait();
    console.log("Submitted one anonymous tip");

    console.log(`\nDone. ${await contract.getEvidenceCount()} records, ` +
        `${await contract.getVersionCount("EVD-2026-0001")} revisions on EVD-2026-0001.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
