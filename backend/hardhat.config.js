import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    // Using a recent stable 0.8.x version
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        // Local demo chain. chainId is 31338 rather than the default 31337 so
        // MetaMask has no cached block state for it: a wallet that saw an older
        // 31337 chain keeps querying a block this fresh chain does not have.
        hardhat: {
            chainId: 31338
        },
        // Local hardhat node configuration
        localhost: {
            chainId: 31338,
            url: "http://127.0.0.1:8545"
        },
        // Sepolia testnet deployment
        sepolia: {
          url: process.env.SEPOLIA_RPC_URL || "",
          accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
        }
    }
};
