"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, assertContractAddress } from "../utils/constants";

declare global {
    interface Window {
        ethereum?: any;
    }
}

// Define the shape of our Web3 context state
export interface Web3State {
    account: string | null;
    role: string | null;
    status: number | null; // 0=Pending, 1=Approved, 2=Rejected
    isApproved: boolean;
    isRegistered: boolean;
    contract: ethers.Contract | null;
    provider: ethers.BrowserProvider | null;
    isLoading: boolean;
    error: string | null;
    connectWallet: () => Promise<void>;
    checkUserStatus: (address: string, contractInstance: ethers.Contract) => Promise<void>;
    registerUser: (name: string, role: string) => Promise<void>;
}

const defaultState: Web3State = {
    account: null,
    role: null,
    status: null,
    isApproved: false,
    isRegistered: false,
    contract: null,
    provider: null,
    isLoading: true,
    error: null,
    connectWallet: async () => { },
    checkUserStatus: async () => { },
    registerUser: async () => { },
};

const Web3Context = createContext<Web3State>(defaultState);

export function Web3Provider({ children }: { children: ReactNode }) {
    const [account, setAccount] = useState<string | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<number | null>(null);
    const [isApproved, setIsApproved] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);
    const [contract, setContract] = useState<ethers.Contract | null>(null);
    const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initialize Ethers provider and contract locally
    const initEthers = async () => {
        if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
            try {
                const _provider = new ethers.BrowserProvider(window.ethereum);
                setProvider(_provider);

                // Get accounts without prompting
                const accounts = await _provider.send("eth_accounts", []);
                let _runner: ethers.Signer | ethers.Provider = _provider;

                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    _runner = await _provider.getSigner();
                }

                const _contract = new ethers.Contract(assertContractAddress(), CONTRACT_ABI, _runner);
                setContract(_contract);

                // Listen for accounts change
                window.ethereum.on("accountsChanged", (accs: string[]) => {
                    if (accs.length === 0) {
                        window.location.reload(); // Hard reload on disconnect for safety
                    } else {
                        // We do a hard reload to cleanly re-init Ethers and the app state
                        window.location.reload();
                    }
                });
                window.ethereum.on("chainChanged", () => window.location.reload());

                if (accounts.length > 0) {
                    await checkUserStatus(accounts[0], _contract);
                } else {
                    setIsLoading(false);
                }
            } catch (err: any) {
                console.error("Failed to initialize Web3", err);
                setError("Failed to connect to the network. Make sure Hardhat node is running.");
                setIsLoading(false);
            }
        } else {
            setError("Please install MetaMask to use this application.");
            setIsLoading(false);
        }
    };

    useEffect(() => {
        initEthers();
        return () => {
            // Cleanup not straightforward for anonymous functions, but acceptable for global singletons like ethereum
        };
    }, []);

    const checkUserStatus = async (userAddress: string, contractInstance: ethers.Contract) => {
        setIsLoading(true);
        try {
            const registered = await contractInstance.isUserRegistered(userAddress);
            setIsRegistered(registered);

            if (registered) {
                const userStatus = await contractInstance.userApprovalStatus(userAddress);
                setStatus(Number(userStatus));

                const approved = await contractInstance.isUserApproved(userAddress);
                setIsApproved(approved);

                if (approved) {
                    const userRole = await contractInstance.getUserRole(userAddress);
                    setRole(userRole);
                }
            }
        } catch (err) {
            console.error("Error checking user status:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const connectWallet = async () => {
        setError(null);
        let currentProvider = provider;

        if (!currentProvider) {
            if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
                currentProvider = new ethers.BrowserProvider(window.ethereum);
                setProvider(currentProvider);
            } else {
                setError("MetaMask not found!");
                alert("Please install MetaMask to use this application.");
                return;
            }
        }

        setIsLoading(true);
        try {
            const accounts = await currentProvider.send("eth_requestAccounts", []);
            if (accounts.length > 0) {
                setAccount(accounts[0]);
                const _signer = await currentProvider.getSigner();
                const _contract = new ethers.Contract(assertContractAddress(), CONTRACT_ABI, _signer);
                setContract(_contract);
                await checkUserStatus(accounts[0], _contract);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to connect wallet");
            alert(err.message || "Failed to connect wallet");
            setIsLoading(false);
        }
    };

    const registerUser = async (name: string, selectedRole: string) => {
        if (!contract || !account || !provider) return;
        try {
            setIsLoading(true);
            const _signer = await provider.getSigner();
            const _contractWithSigner = new ethers.Contract(assertContractAddress(), CONTRACT_ABI, _signer);

            const tx = await _contractWithSigner.registerUser(name, selectedRole);
            await tx.wait();
            // Status will be pending until admin approves
            await checkUserStatus(account, _contractWithSigner);
        } catch (err: any) {
            console.error("Registration failed", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Web3Context.Provider
            value={{
                account,
                role,
                status,
                isApproved,
                isRegistered,
                contract,
                provider,
                isLoading,
                error,
                connectWallet,
                checkUserStatus,
                registerUser
            }}
        >
            {children}
        </Web3Context.Provider>
    );
}

export const useWeb3 = () => useContext(Web3Context);
