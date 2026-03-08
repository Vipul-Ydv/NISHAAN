"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWeb3 } from "../../../context/Web3Context";
import {
    Scale, Loader2, Search, CheckCircle, FileWarning,
    Eye, Gavel, ShieldCheck, Fingerprint, Database, Home
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// --- THREE.JS BACKGROUND: DATA TUNNEL THEME ---
function ThreeBackground() {
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

export default function CourtDashboard() {
    const { account, role, status, isApproved, contract, isLoading } = useWeb3();
    const router = useRouter();

    const [evidenceId, setEvidenceId] = useState("");
    const [evidenceData, setEvidenceData] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    useEffect(() => {
        if (!isLoading) {
            if (!account || (role !== "Court" && status !== 2)) {
                router.push("/login");
            }
        }
    }, [account, role, status, isLoading, router]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contract || !evidenceId) return;

        setIsSearching(true);
        setStatusMessage("");
        setEvidenceData(null);

        try {
            setStatusMessage("Querying state and logging access...");
            const evidence = await contract.getEvidenceData(evidenceId);

            if (!evidence.exists) {
                setStatusMessage("❌ Evidence ID not found in the ledger.");
                setIsSearching(false);
                return;
            }

            const tx = await contract.getEvidence(evidenceId);
            await tx.wait();

            setEvidenceData({
                ipfsHashes: evidence[0] || evidence.ipfsHashes || [],
                caseNumber: evidence[1] || evidence.caseNumber,
                location: evidence[2] || evidence.location,
                crimeDescription: evidence[3] || evidence.crimeDescription,
                fileTypes: evidence[4] || evidence.fileTypes || [],
                officerName: evidence[5] || evidence.officerName,
                timestamp: evidence[6] || evidence.timestamp,
                status: Number(evidence[7] || evidence.status)
            });

            setStatusMessage("");
        } catch (err: any) {
            console.error(err);
            setStatusMessage("❌ Error fetching evidence or logging access.");
        } finally {
            setIsSearching(false);
        }
    };

    const updateStatus = async (newStatus: number) => {
        if (!contract || !evidenceId) return;
        setIsUpdating(true);
        setStatusMessage("Submitting status change to blockchain...");
        try {
            const tx = await contract.updateEvidenceStatus(evidenceId, newStatus);
            await tx.wait();
            setStatusMessage("✅ Evidence status updated cryptographically!");
            setEvidenceData({ ...evidenceData, status: newStatus });
        } catch (err: any) {
            console.error(err);
            setStatusMessage(`❌ Error updating status: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusText = (status: number) => {
        switch (status) {
            case 0: return "Submitted";
            case 1: return "Under Review";
            case 2: return "Verified";
            case 3: return "Archived";
            default: return "Unknown";
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
                <Loader2 className="text-black animate-spin" size={48} />
                <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Syncing_Justice_Node</span>
            </div>
        );
    }

    if (status === 2) return (
        <div className="min-h-screen bg-red-600 flex flex-col items-center justify-center p-8 text-center text-white selection:bg-black selection:text-white font-sans">
            <div className="border-[8px] border-white p-12 max-w-2xl bg-black/10 backdrop-blur-sm shadow-[20px_20px_0px_0px_rgba(0,0,0,0.5)]">
                <ShieldCheck size={64} className="mb-6 mx-auto animate-pulse" strokeWidth={3} />
                <h1 className="text-5xl font-[1000] uppercase tracking-tighter mb-4 italic">Clearance Revoked</h1>
                <p className="font-mono font-bold tracking-widest text-sm text-red-100 uppercase mb-8 border-y-2 border-white/20 py-4">
                    Your judicial authorization request has been explicitly rejected by the System Administrator. Access to the ledger is denied.
                </p>
                <div className="inline-block bg-white text-red-600 px-6 py-2 font-black uppercase text-xs tracking-widest">
                    Code: 403_REJECTED
                </div>
            </div>
        </div>
    );

    if (role !== "Court" || !isApproved) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
            <Loader2 className="text-black animate-spin" size={48} />
            <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Awaiting_Admin_Clearance</span>
        </div>
    );

    return (
        <div className="min-h-screen text-black selection:bg-black selection:text-white font-sans overflow-x-hidden pb-20">
            <ThreeBackground />

            <main className="relative z-10 max-w-7xl mx-auto pt-32 px-8">
                <div className="flex flex-col lg:flex-row gap-12">

                    {/* --- Sidebar Info --- */}
                    <aside className="lg:w-80 space-y-8">
                        <div className="border-l-[10px] border-black pl-8 py-2">
                            <h1 className="text-6xl font-[1000] tracking-tighter uppercase leading-none italic">NISHAAN</h1>
                            <div className="bg-black text-white inline-block px-3 py-1 mt-4 text-[10px] font-mono font-black uppercase tracking-[0.3em]">
                                COURT PANEL
                            </div>
                        </div>

                        <button onClick={() => router.push("/")} className="w-full flex items-center justify-center gap-3 bg-white border-[4px] border-black p-4 font-black uppercase text-sm tracking-tighter hover:bg-black hover:text-white transition-colors shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-2 hover:translate-y-2">
                            <Home size={20} strokeWidth={3} /> Return to Home
                        </button>

                        <div className="border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center gap-3 mb-4">
                                <Fingerprint size={20} strokeWidth={3} />
                                <span className="font-black uppercase text-xs tracking-tighter">Court Wallet ID</span>
                            </div>
                            <p className="font-mono text-[10px] text-blue-700 break-all p-2">
                                {account}
                            </p>
                        </div>
                    </aside>

                    {/* --- Main Action Area --- */}
                    <section className="flex-1 space-y-12">

                        {/* Search Module */}
                        <div className="bg-white border-[8px] border-black p-10 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center gap-4 mb-8 pb-4">
                                <Search size={32} strokeWidth={3} />
                                <h2 className="text-3xl font-[1000] uppercase tracking-tighter">Query Blockchain</h2>
                            </div>

                            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                                <input
                                    required type="text" value={evidenceId} onChange={e => setEvidenceId(e.target.value)}
                                    className="flex-1 border-[4px] border-black px-6 py-4 text-xl font-bold uppercase placeholder:text-zinc-300 focus:outline-none focus:bg-zinc-50 transition-colors"
                                    placeholder="EVD-ID-NUMBER"
                                />
                                <button
                                    type="submit"
                                    disabled={isSearching}
                                    className="bg-black text-white px-10 py-4 font-black uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isSearching ? <Loader2 className="animate-spin" /> : <><Gavel size={20} /> Execute</>}
                                </button>
                            </form>

                            {statusMessage && (
                                <div className={`mt-6 p-4 border-[3px] border-black font-mono text-[10px] font-black uppercase tracking-wider ${statusMessage.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {statusMessage}
                                </div>
                            )}
                        </div>

                        {/* Evidence Result Display */}
                        <AnimatePresence mode="wait">
                            {evidenceData ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white border-[8px] border-black p-10 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]"
                                >
                                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-12">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-zinc-400 uppercase font-black text-[10px] tracking-[0.3em]">
                                                <ShieldCheck size={14} /> Immutable Evidence Record
                                            </div>
                                            <h3 className="text-6xl font-[1000] tracking-tighter uppercase italic">{evidenceId}</h3>
                                            <p className="font-mono text-xs font-bold text-zinc-400 uppercase">Timestamp: {new Date(Number(evidenceData.timestamp) * 1000).toLocaleString()}</p>
                                        </div>
                                        <div className="bg-black text-white px-6 py-3 border-[4px] border-black font-black uppercase tracking-tighter text-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)]">
                                            {getStatusText(evidenceData.status)}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                                        <div className="space-y-4">
                                            {[
                                                { label: "Case Ref", value: evidenceData.caseNumber },
                                                { label: "Reporting Personnel", value: evidenceData.officerName },
                                                { label: "Geo-Location", value: evidenceData.location },
                                                { label: "Attached Files", value: `${evidenceData.ipfsHashes?.length || 0} File(s)` },
                                            ].map((field) => (
                                                <div key={field.label} className="border-b-[3px] border-black pb-2">
                                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{field.label}</p>
                                                    <p className="text-xl font-black uppercase tracking-tight">{field.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-6">
                                            <div className="bg-zinc-50 border-[4px] border-black p-6 italic font-medium text-zinc-700 leading-tight border-dashed">
                                                <p className="not-italic text-[10px] font-black text-black uppercase mb-4 tracking-widest">Formal Narrative</p>
                                                "{evidenceData.crimeDescription}"
                                            </div>
                                            <div className="font-mono bg-black text-white p-4">
                                                <p className="text-[9px] font-black uppercase mb-2 opacity-60">FILE_TYPES</p>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {evidenceData.fileTypes && evidenceData.fileTypes.map((t: string, i: number) => (
                                                        <span key={i} className="text-[8px] bg-zinc-800 px-2 py-1 uppercase truncate max-w-[150px] inline-block">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="pt-8 border-t-[6px] border-black mt-8">
                                        <h4 className="text-xl font-black uppercase tracking-tighter mb-4">Attached Evidence Files</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                                            {evidenceData.ipfsHashes && evidenceData.ipfsHashes.map((hash: string, idx: number) => {
                                                const fileType = evidenceData.fileTypes[idx] || "Unknown";
                                                return (
                                                    <a
                                                        key={hash}
                                                        href={`https://ipfs.io/ipfs/${hash}`}
                                                        target="_blank" rel="noreferrer"
                                                        className="flex items-center gap-3 p-4 border-[4px] border-black hover:bg-zinc-100 transition-all bg-white"
                                                    >
                                                        <Eye size={20} strokeWidth={3} className="shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="font-black uppercase text-xs truncate">File {idx + 1}</p>
                                                            <p className="text-[9px] font-mono text-zinc-500 uppercase truncate">{fileType}</p>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t-[3px] border-dashed border-black/20">
                                            <button
                                                disabled={isUpdating || evidenceData.status === 2}
                                                onClick={() => updateStatus(2)}
                                                className="flex items-center justify-center gap-3 py-4 bg-black text-white border-[4px] border-black font-black uppercase tracking-tighter hover:bg-zinc-800 disabled:opacity-20 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]"
                                            >
                                                {isUpdating ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                                                Verify Files (Approve)
                                            </button>
                                            <button
                                                disabled={isUpdating || evidenceData.status === 1}
                                                onClick={() => updateStatus(1)}
                                                className="flex items-center justify-center gap-3 py-4 border-[4px] border-black font-black uppercase tracking-tighter hover:bg-red-50 hover:text-red-600 hover:border-red-600 transition-all disabled:opacity-20"
                                            >
                                                {isUpdating ? <Loader2 className="animate-spin" /> : <FileWarning size={20} />}
                                                Flag for Review
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center justify-center h-80 border-[8px] border-dashed border-black/40 bg-white/50 p-12 text-center"
                                >
                                    <Database size={64} className="text-black mb-4" />
                                    <h3 className="text-2xl font-black uppercase tracking-tighter text-black">Awaiting Query</h3>
                                    <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-black/40 mt-2 max-w-xs leading-relaxed">
                                        The judicial node is idle. Enter an Evidence ID to pull encrypted records from the master ledger.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </section>
                </div>
            </main>
        </div>
    );
}