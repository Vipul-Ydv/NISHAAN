import hre from "hardhat";

async function main() {
    const contractAddress = "0xA7755BD515CeD9661779ac8F46426f57cdf123D";

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
