import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    // Using a recent stable 0.8.x version
    solidity: "0.8.28",
    networks: {
        // Local hardhat node configuration
        localhost: {
            url: "http://127.0.0.1:8545"
        },
        // Sepolia testnet deployment
        sepolia: {
          url: process.env.SEPOLIA_RPC_URL || "",
          accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
        }
    }
};
