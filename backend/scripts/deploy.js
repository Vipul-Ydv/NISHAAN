import hre from "hardhat";
import fs from "fs";

async function main() {
    const EvidenceManagement = await hre.ethers.getContractFactory("EvidenceManagement");
    const evidenceManagement = await EvidenceManagement.deploy();
    await evidenceManagement.waitForDeployment();
    fs.writeFileSync("address.txt", evidenceManagement.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
