import hre from "hardhat";

async function main() {
    const contractAddress = "0x6257ccfDBdFB3Ae347a6340c14fFf7a1D352Fc858";

    const abi = [
        "function admin() view returns (address)",
        "function isUserRegistered(address) view returns (bool)",
        "function isUserApproved(address) view returns (bool)",
        "function getUserRole(address) view returns (string)"
    ];

    const provider = hre.ethers.provider;
    const contract = new hre.ethers.Contract(contractAddress, abi, provider);

    const adminAddress = await contract.admin();
    console.log("Admin address on contract:", adminAddress);

    const testAddress = "0x8Df0e70768962734771500bA32c4d6214c2cca0b";
    console.log("Your MetaMask address:    ", testAddress);
    console.log("Match:", adminAddress.toLowerCase() === testAddress.toLowerCase());

    const isRegistered = await contract.isUserRegistered(testAddress);
    console.log("Is registered:", isRegistered);

    if (isRegistered) {
        const isApproved = await contract.isUserApproved(testAddress);
        console.log("Is approved:", isApproved);
        const role = await contract.getUserRole(testAddress);
        console.log("Role:", role);
    }
}

main().catch(console.error);
