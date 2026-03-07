"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWeb3 } from "../../../context/Web3Context";
import {
    UploadCloud,
    ShieldCheck,
    Loader2,
    File as FileIcon,
    Trash2,
    Gavel,
    Lock,
    Database,
    ChevronDown,
    ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// --- THREE.JS BACKGROUND: DATA TUNNEL THEME ---
function JusticeNetworkBackground() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        containerRef.current.appendChild(renderer.domElement);

        const geometry = new THREE.PlaneGeometry(2000, 2000, 50, 50);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.08 });

        // Floor Grid
        const gridFloor = new THREE.Mesh(geometry, material);
        gridFloor.rotation.x = -Math.PI / 2;
        gridFloor.position.y = -80;
        scene.add(gridFloor);

        // Ceiling Grid
        const gridCeiling = new THREE.Mesh(geometry, material);
        gridCeiling.rotation.x = Math.PI / 2;
        gridCeiling.position.y = 80;
        scene.add(gridCeiling);

        camera.position.z = 200;
        camera.lookAt(0, 0, 0);

        const animate = () => {
            requestAnimationFrame(animate);
            // Move grids towards the camera
            gridFloor.position.z += 1;
            gridCeiling.position.z += 1;

            // Seamless reset
            if (gridFloor.position.z > 40) {
                gridFloor.position.z = 0;
                gridCeiling.position.z = 0;
            }

            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            containerRef.current?.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={containerRef} className="fixed inset-0 -z-10 bg-white" />;
}

export default function PoliceDashboard() {
    const { account, role, status, isApproved, contract, isLoading } = useWeb3();
    const router = useRouter();

    // Original State
    const [evidenceId, setEvidenceId] = useState("");
    const [caseNumber, setCaseNumber] = useState("");
    const [location, setLocation] = useState("");
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState<File[]>([]);

    const [isUploading, setIsUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Original Logic: Refresh
    const handleRefresh = () => {
        setIsRefreshing(true);
        setEvidenceId("");
        setCaseNumber("");
        setLocation("");
        setDescription("");
        setFiles([]);
        setStatusMessage("");
        setIsUploading(false);
        setTimeout(() => setIsRefreshing(false), 500);
    };

    // Original Logic: Auth Check
    useEffect(() => {
        if (!isLoading) {
            // Give them the boot if they aren't even a police user attempting login
            if (!account || (role !== "Police" && status !== 2)) {
                router.push("/login");
            }
        }
    }, [account, role, status, isLoading, router]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
        }
    };

    // Original Logic: Pinata
    const uploadToPinata = async (fileToUpload: File) => {
        const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
        let data = new FormData();
        data.append('file', fileToUpload);
        const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
        const pinataSecretApiKey = process.env.NEXT_PUBLIC_PINATA_SECRET_API_KEY;

        if (!pinataApiKey || !pinataSecretApiKey) {
            throw new Error("Pinata API keys are missing in .env.local");
        }

        const res = await fetch(url, {
            method: "POST",
            headers: {
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataSecretApiKey,
            },
            body: data,
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(`Pinata upload failed: ${res.status} - ${JSON.stringify(errorData)}`);
        }

        const responseData = await res.json();
        return responseData.IpfsHash;
    };

    // Original Logic: Submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0 || !contract) {
            setStatusMessage("Please select at least one file to upload.");
            return;
        }

        setIsUploading(true);
        setStatusMessage("Uploading files to IPFS via Pinata...");

        try {
            const ipfsHashes: string[] = [];
            const fileTypes: string[] = [];

            for (let i = 0; i < files.length; i++) {
                setStatusMessage(`Uploading file ${i + 1} of ${files.length}...`);
                const hash = await uploadToPinata(files[i]);
                ipfsHashes.push(hash);

                let typeStr = files[i].type;
                if (!typeStr) typeStr = "application/octet-stream";
                fileTypes.push(typeStr);
            }

            setStatusMessage("Files securely pinned to IPFS. Submitting to Ethereum blockchain...");

            const tx = await contract.addEvidence(
                evidenceId,
                ipfsHashes,
                caseNumber,
                location,
                description,
                fileTypes
            );

            setStatusMessage("Transaction submitted. Waiting for blockchain confirmation...");
            await tx.wait();
            setStatusMessage("✅ Evidence successfully secured on the blockchain!");

            setTimeout(() => {
                setEvidenceId("");
                setCaseNumber("");
                setLocation("");
                setDescription("");
                setFiles([]);
                setStatusMessage("");
            }, 5000);

        } catch (err: any) {
            console.error(err);
            setStatusMessage(`❌ Error: ${err.message || 'Transaction failed'}`);
        } finally {
            setIsUploading(false);
        }
    };

    if (isLoading) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
            <Loader2 className="text-black animate-spin" size={48} />
            <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Verifying_Credentials</span>
        </div>
    );

    if (status === 2) return (
        <div className="min-h-screen bg-red-600 flex flex-col items-center justify-center p-8 text-center text-white selection:bg-black selection:text-white font-sans">
            <div className="border-[8px] border-white p-12 max-w-2xl bg-black/10 backdrop-blur-sm shadow-[20px_20px_0px_0px_rgba(0,0,0,0.5)]">
                <Lock size={64} className="mb-6 mx-auto animate-pulse" strokeWidth={3} />
                <h1 className="text-5xl font-[1000] uppercase tracking-tighter mb-4 italic">Access Denied</h1>
                <p className="font-mono font-bold tracking-widest text-sm text-red-100 uppercase mb-8 border-y-2 border-white/20 py-4">
                    Your clearance request has been explicitly rejected by the System Administrator. Connection to the Justice Node terminated.
                </p>
                <div className="inline-block bg-white text-red-600 px-6 py-2 font-black uppercase text-xs tracking-widest">
                    Code: 403_REJECTED
                </div>
            </div>
        </div>
    );

    if (role !== "Police" || !isApproved) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
            <Loader2 className="text-black animate-spin" size={48} />
            <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Awaiting_Admin_Clearance</span>
        </div>
    );

    return (
        <div className="min-h-screen text-black selection:bg-black selection:text-white font-sans overflow-x-hidden">
            <JusticeNetworkBackground />

            <main className="relative z-10 max-w-7xl mx-auto pt-24 pb-20 px-8">
                <div className="flex flex-col lg:flex-row gap-12">

                    {/* Left Sidebar: ID & Status */}
                    <aside className="lg:w-80 space-y-8">
                        <div className="border-l-[10px] border-black pl-8 py-2">
                            <h1 className="text-6xl font-[1000] tracking-tighter uppercase leading-none italic">NISHAAN</h1>
                            <div className="bg-black text-white inline-block px-3 py-1 mt-4 text-[10px] font-mono font-black uppercase tracking-[0.3em]">
                                POLICE PANEL
                            </div>
                        </div>

                        <div className="border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center gap-3 mb-4">
                                <ShieldCheck size={20} strokeWidth={3} />
                                <span className="font-black uppercase text-xs tracking-tighter">Police Wallet ID</span>
                            </div>
                            <p className="font-mono text-[10px] text-blue-700 break-all p-2">
                                {account}
                            </p>
                        </div>



                        <div className="hidden lg:block p-6 border-[4px] border-dashed border-black/70 text-black/70">
                            <p className="text-[10px] font-mono leading-relaxed uppercase">
                                Warning: All evidence uploads are cryptographically signed. Unauthorized attempts to alter records are logged and prosecuted under federal digital asset acts.
                            </p>
                        </div>
                    </aside>

                    {/* Right Side: Form Content */}
                    <section className="flex-1 bg-white border-[8px] border-black p-8 md:p-12 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]">
                        <div className="flex items-center gap-4 mb-10 pb-4">
                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="group relative flex items-center justify-center p-3 text-white bg-red-600 hover:bg-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 disabled:opacity-50 z-10 border-[3px] border-black mr-2"
                            >
                                <Trash2 size={24} strokeWidth={3} className={isRefreshing ? 'animate-pulse' : ''} />
                                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 px-3 py-2 bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]">
                                    Clear Form
                                </div>
                            </button>
                            <h2 className="text-3xl font-[1000] uppercase tracking-tighter">Store Case Evidence Details</h2>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2 group">
                                    <label className="text-xs font-black uppercase tracking-widest text-zinc-500 group-focus-within:text-black">Evidence ID</label>
                                    <input
                                        required type="text" value={evidenceId} onChange={e => setEvidenceId(e.target.value)}
                                        className="w-full bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none uppercase placeholder:text-zinc-300"
                                        placeholder="EVD-2026-X"
                                    />
                                </div>
                                <div className="space-y-2 group">
                                    <label className="text-xs font-black uppercase tracking-widest text-zinc-500 group-focus-within:text-black">Case Reference</label>
                                    <input
                                        required type="text" value={caseNumber} onChange={e => setCaseNumber(e.target.value)}
                                        className="w-full bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none uppercase"
                                        placeholder="CASE-100"
                                    />
                                </div>
                                <div className="space-y-2 group">
                                    <label className="text-xs font-black uppercase tracking-widest text-zinc-500 group-focus-within:text-black">Collection Location</label>
                                    <input
                                        required type="text" value={location} onChange={e => setLocation(e.target.value)}
                                        className="w-full bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none"
                                        placeholder="District Sector"
                                    />
                                </div>

                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Official Case Notes</label>
                                <textarea
                                    required value={description} onChange={e => setDescription(e.target.value)}
                                    className="w-full h-32 bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none resize-none"
                                    placeholder="Enter descriptive evidence context..."
                                />
                            </div>

                            {/* File Upload Area */}
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Immutable File Attachment</label>
                                <div className="relative h-40 border-[4px] border-dashed border-black bg-zinc-50 flex flex-col items-center justify-center group hover:bg-zinc-100 transition-colors">
                                    <input
                                        required type="file" multiple onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    {files.length > 0 ? (
                                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                                            <div className="flex gap-2 mb-2">
                                                {files.slice(0, 3).map((_, i) => (
                                                    <div key={i} className="bg-black p-3 text-white">
                                                        <FileIcon size={24} />
                                                    </div>
                                                ))}
                                                {files.length > 3 && (
                                                    <div className="bg-black p-3 text-white flex items-center justify-center font-black text-xs">
                                                        +{files.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="font-black text-xs uppercase">{files.length} Files Selected</span>
                                        </motion.div>
                                    ) : (
                                        <div className="flex flex-col items-center text-zinc-400 group-hover:text-black transition-colors">
                                            <UploadCloud size={40} strokeWidth={3} />
                                            <span className="mt-2 font-black text-[10px] uppercase tracking-tighter">Select Multiple Media Files</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Status Messages */}
                            <AnimatePresence>
                                {statusMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={`p-5 border-[4px] font-mono text-[10px] font-black uppercase leading-tight ${statusMessage.includes('❌')
                                            ? 'bg-red-50 border-red-600 text-red-600'
                                            : statusMessage.includes('✅')
                                                ? 'bg-green-50 border-green-600 text-green-600'
                                                : 'bg-zinc-100 border-black text-black'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Database size={16} />
                                            {statusMessage}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                type="submit"
                                disabled={isUploading}
                                className="w-full flex items-center justify-center gap-4 py-6 bg-black text-white hover:bg-zinc-800 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-50 group"
                            >
                                {isUploading ? (
                                    <><Loader2 className="w-6 h-6 animate-spin" /> <span className="font-black uppercase tracking-widest">Encrypting_and_Hashing...</span></>
                                ) : (
                                    <>
                                        <Lock size={20} />
                                        <span className="font-black uppercase tracking-widest text-lg">Cryptographically Sign & Commit</span>
                                        <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    </section>
                </div>
            </main>
        </div>
    );
}