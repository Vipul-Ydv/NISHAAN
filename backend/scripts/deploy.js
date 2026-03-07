import hre from "hardhat";

async function main() {
    console.log("Preparing to deploy EvidenceManagement contract...");

    // Compile and get the contract factory
    const EvidenceManagement = await hre.ethers.getContractFactory("EvidenceManagement");

    // Deploy the contract using modern ethers.js (v6) syntax
    const evidenceManagement = await EvidenceManagement.deploy();

    // Wait for the deployment to finish
    await evidenceManagement.waitForDeployment();

    // Print the deployed contract address
    console.log(`EvidenceManagement deployed successfully to: ${evidenceManagement.target}`);
}

// Execute the deployment script
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
