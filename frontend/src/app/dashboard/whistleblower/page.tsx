"use client";

import { useState, useRef, useEffect } from "react";
import { useWeb3 } from "../../../context/Web3Context";
import { useRouter } from "next/navigation";
import { UploadCloud, ShieldAlert, Loader2, File as FileIcon, EyeOff, Lock, ArrowRight, Database, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// --- THREE.JS BACKGROUND: DARK INCIDENT NET ---
function DarkNetBackground() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        containerRef.current.appendChild(renderer.domElement);

        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 1000;
        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 400;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            size: 1.5,
            color: 0xff0000,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });

        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particlesMesh);
        camera.position.z = 100;

        const animate = () => {
            requestAnimationFrame(animate);
            particlesMesh.rotation.y += 0.001;
            particlesMesh.rotation.x -= 0.0005;
            renderer.render(scene, camera);
        };
        animate();

        return () => { containerRef.current?.removeChild(renderer.domElement); };
    }, []);

    return <div ref={containerRef} className="fixed inset-0 -z-10 bg-black" />;
}

export default function Whistleblower() {
    const { account, contract, connectWallet, isLoading } = useWeb3();
    const router = useRouter();

    const [description, setDescription] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const uploadToPinata = async (fileToUpload: File) => {
        // The Pinata credentials live server-side; this route returns only the CID.
        const data = new FormData();
        data.append('file', fileToUpload);

        const res = await fetch("/api/ipfs/upload", { method: "POST", body: data });

        if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "" }));
            throw new Error(error || `IPFS upload failed with status ${res.status}`);
        }

        const responseData = await res.json();
        return responseData.IpfsHash;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !contract || !description) {
            setStatusMessage("Please provide both a description and an evidence file.");
            return;
        }

        setIsUploading(true);
        setStatusMessage("Securing file network tunnel. Pinning to IPFS...");

        try {
            const hash = await uploadToPinata(file);

            setStatusMessage("File pinned. Submitting tip transaction to Ethereum...");

            const tx = await contract.submitAnonymousTip(hash, description);

            setStatusMessage("Awaiting network confirmation...");
            await tx.wait();

            setStatusMessage("✅ Evidence successfully secured on the blockchain globally. Your tip is immutable.");

            setTimeout(() => {
                setDescription("");
                setFile(null);
                setStatusMessage("");
            }, 6000);

        } catch (err: any) {
            console.error(err);
            setStatusMessage(`❌ Error: ${err.message || 'Transaction failed'}`);
        } finally {
            setIsUploading(false);
        }
    };

    if (isLoading) return (
        <div className="min-h-screen bg-black text-red-500 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin" size={48} />
            <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Establishing_Secure_Connection</span>
        </div>
    );

    return (
        <div className="min-h-screen text-white selection:bg-red-600 selection:text-white font-sans overflow-x-hidden">
            <DarkNetBackground />

            <header className="absolute top-0 w-full p-8 z-20 flex justify-between items-center">
                <div className="flex gap-6 items-center">
                    <button onClick={() => router.push("/")} className="font-black text-3xl tracking-tighter uppercase italic text-zinc-600 hover:text-white transition-colors">
                        NISHAAN
                    </button>
                    <button onClick={() => router.push("/")} className="hidden md:flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-xs font-mono uppercase font-bold bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-sm">
                        <Home size={14} /> Back to Home
                    </button>
                </div>
                {!account ? (
                    <button onClick={connectWallet} className="border-2 border-red-600 text-red-500 px-6 py-2 font-mono text-xs uppercase hover:bg-red-600 hover:text-white transition-all">
                        Connect Anonymous Wallet
                    </button>
                ) : (
                    <div className="flex items-center gap-2 border-2 border-white/20 bg-black/50 backdrop-blur-md px-4 py-2 font-mono text-[10px]">
                        <EyeOff size={14} className="text-red-500" />
                        <span className="text-zinc-400">Connected:</span>
                        <span className="text-zinc-200">{account.substring(0, 8)}...</span>
                    </div>
                )}
            </header>

            <main className="relative z-10 max-w-4xl mx-auto pt-32 pb-20 px-6">
                <div className="text-center mb-16">
                    <div className="inline-block p-4 bg-red-600 text-white mb-6 animate-pulse">
                        <ShieldAlert size={40} />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-[1000] uppercase tracking-tighter mb-4">Secure Drop</h1>
                    <p className="font-mono text-xs uppercase tracking-widest text-zinc-400 max-w-2xl mx-auto leading-relaxed border-y border-white/10 py-4">
                        This terminal routes directly to the decentralized justice ledger. Files are hashed and permanently anchored. Your identity relies solely on your connected Web3 address. Use a burner wallet for total anonymity.
                    </p>
                </div>

                <div className="bg-black border-[4px] border-zinc-800 p-8 md:p-12 shadow-[0_0_50px_rgba(255,0,0,0.1)]">
                    {!account ? (
                        <div className="text-center py-12">
                            <Lock size={48} className="mx-auto mb-6 text-zinc-600" />
                            <h3 className="text-2xl font-black uppercase mb-4">Wallet Connection Required</h3>
                            <p className="text-zinc-500 font-mono text-xs mb-8">You must connect a Web3 wallet (MetaMask) to sign the transaction.</p>
                            <button onClick={connectWallet} className="bg-red-600 text-white font-black uppercase tracking-widest px-8 py-4 hover:bg-red-700 transition-colors">
                                Authenticate Node
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-8">
                            <div className="space-y-2 group">
                                <label className="text-xs font-black uppercase tracking-widest text-zinc-500 group-focus-within:text-red-500 transition-colors">Incident Intelligence / Description</label>
                                <textarea
                                    required value={description} onChange={e => setDescription(e.target.value)}
                                    className="w-full h-40 bg-zinc-900 border-2 border-zinc-700 focus:border-red-500 p-4 font-mono text-white transition-all outline-none resize-none placeholder:text-zinc-700"
                                    placeholder="Enter details of the evidence. Do not include personally identifiable information if you wish to remain anonymous."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Evidence File Upload</label>
                                <div className={`relative h-48 border-2 border-dashed flex flex-col items-center justify-center transition-all ${file ? 'border-red-500 bg-red-500/10' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900'}`}>
                                    <input
                                        required type="file" onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    {file ? (
                                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                                            <div className="bg-red-600 p-4 text-white mb-3 rounded-sm shadow-[0_0_15px_rgba(255,0,0,0.5)]">
                                                <FileIcon size={32} />
                                            </div>
                                            <span className="font-mono font-bold text-xs">{file.name}</span>
                                        </motion.div>
                                    ) : (
                                        <div className="flex flex-col items-center text-zinc-500">
                                            <UploadCloud size={48} strokeWidth={2} className="mb-4" />
                                            <span className="font-black text-xs uppercase tracking-widest">Select Critical Evidence</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <AnimatePresence>
                                {statusMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={`p-4 border-l-[4px] font-mono text-xs font-bold ${statusMessage.includes('❌') ? 'bg-red-900/50 border-red-500 text-red-200' : statusMessage.includes('✅') ? 'bg-green-900/50 border-green-500 text-green-200' : 'bg-zinc-800 border-zinc-500 text-zinc-300'}`}
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
                                className="w-full flex items-center justify-center gap-4 py-5 bg-red-600 text-white font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-[0_0_20px_rgba(255,0,0,0.3)] hover:shadow-[0_0_30px_rgba(255,0,0,0.6)] disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> <span>Transmitting...</span></>
                                ) : (
                                    <>
                                        <span>Deploy to Ledger</span>
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
