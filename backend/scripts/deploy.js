import hre from "hardhat";
import fs from "fs";

async function main() {
    const network = hre.network.name;

    const EvidenceManagement = await hre.ethers.getContractFactory("EvidenceManagement");
    const evidenceManagement = await EvidenceManagement.deploy();
    await evidenceManagement.waitForDeployment();

    const address = evidenceManagement.target;
    fs.writeFileSync("address.txt", address);

    // The address differs per network, so state which one this belongs to. Pasting
    // a localhost address into a Sepolia frontend is the failure this avoids.
    console.log(`EvidenceManagement deployed to ${address} on network "${network}".`);
    console.log(`Set NEXT_PUBLIC_CONTRACT_ADDRESS="${address}" in frontend/.env.local`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
