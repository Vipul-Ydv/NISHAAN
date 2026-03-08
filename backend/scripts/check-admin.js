import { ethers } from "ethers";

async function main() {
    const rpcUrl = "https://sepolia.infura.io/v3/3d905737fa054dc2b8a0d3d70e826bc8";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const contractAddress = "0xf7A7F22e5a5d6f52Ab52FA07ddBC45A5484Af250";
    const abi = ["function admin() view returns (address)"];

    const contract = new ethers.Contract(contractAddress, abi, provider);
    const adminAddress = await contract.admin();

    console.log("Admin on contract: ", adminAddress);

    const testAddress = "0x8Df0e70768962734771500bA32c4d6214c2cca0b";
    console.log("Expected test address: ", testAddress);
    console.log("Match: ", adminAddress.toLowerCase() === testAddress.toLowerCase());
}

main().catch(console.error);
