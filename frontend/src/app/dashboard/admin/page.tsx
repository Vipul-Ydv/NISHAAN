"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWeb3 } from "../../../context/Web3Context";
import {
    Loader2, Users, FileStack, Activity, Check, X,
    ArrowRight, Database, ShieldAlert, RefreshCw
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

        return () => { containerRef.current?.removeChild(renderer.domElement); };
    }, []);

    return <div ref={containerRef} className="fixed inset-0 -z-10 bg-[#f8fafc]" />;
}

// --- REUSABLE EMPTY STATE ---
function EmptyState({ icon: Icon, title, message }: { icon: any, title: string, message: string }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-80 border-[4px] border-dashed border-black/20 bg-zinc-50/50 p-12 text-center"
        >
            <div className="bg-black text-white p-4 mb-4">
                <Icon size={40} />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter text-black">{title}</h3>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400 mt-2 max-w-xs leading-relaxed">
                {message}
            </p>
        </motion.div>
    );
}

export default function AdminDashboard() {
    // --- BLOCKCHAIN LOGIC ---
    const { account, role, contract, isLoading } = useWeb3();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState("pending");
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [allEvidence, setAllEvidence] = useState<any[]>([]);
    const [stats, setStats] = useState({ evidenceCount: 0, pendingCount: 0, adminAddress: "" });
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchAdminData();
        setIsRefreshing(false);
    };

    useEffect(() => {
        if (!isLoading) {
            if (!account || role !== "Admin") {
                router.push("/login");
            } else {
                fetchAdminData();
            }
        }
    }, [account, role, isLoading, router]);

    const fetchAdminData = async () => {
        if (!contract || role !== "Admin") return;

        try {
            const evidenceCount = await contract.getEvidenceCount();
            const pendingCount = await contract.getPendingUsersCount();
            const adminAddr = await contract.admin();
            setStats({
                evidenceCount: Number(evidenceCount),
                pendingCount: Number(pendingCount),
                adminAddress: adminAddr
            });

            let pUsers = [];
            for (let i = 0; i < Number(pendingCount); i++) {
                const user = await contract.getPendingUser(i);
                pUsers.push({ address: user[0], name: user[1], role: user[2], status: Number(user[3]) });
            }
            setPendingUsers(pUsers.reverse());

            let evidenceArr = [];
            for (let i = 0; i < Number(evidenceCount); i++) {
                const eId = await contract.evidenceIds(i);
                const ev = await contract.getEvidenceData(eId);
                const hashesArr = ev[0] || ev.ipfsHashes || [];
                const typeDisplay = hashesArr.length > 0 ? `${hashesArr.length} File${hashesArr.length > 1 ? 's' : ''}` : "—";

                evidenceArr.push({
                    id: eId,
                    caseNumber: ev[1] || ev.caseNumber || "—",
                    type: typeDisplay,
                    officer: ev[5] || ev.officerName || "—",
                    timestamp: Number(ev[6] || ev.timestamp || 0),
                    status: Number(ev[7] || ev.status || 0)
                });
            }
            setAllEvidence(evidenceArr.sort((a, b) => b.timestamp - a.timestamp));
        } catch (err) {
            console.error("Error fetching admin data", err);
        }
    };

    const handleUserAction = async (userAddress: string, action: 'approve' | 'reject') => {
        if (!contract) return;
        setIsProcessing(true);
        try {
            if (action === 'approve') {
                const tx = await contract.approveUser(userAddress);
                await tx.wait();
            } else {
                const tx = await contract.rejectUser(userAddress);
                await tx.wait();
            }
            await fetchAdminData();
        } catch (err) {
            console.error(err);
            alert(`Failed to ${action} user.`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading || role !== "Admin") {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
                <Loader2 className="text-black animate-spin" size={48} />
                <span className="font-mono text-xs uppercase font-black tracking-[0.5em]">Syncing_Justice_Node</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen text-black selection:bg-black selection:text-white font-sans overflow-x-hidden">
            <ThreeBackground />

            <main className="relative z-10 max-w-7xl mx-auto pt-32 pb-20 px-8">
                <div className="flex flex-col lg:flex-row gap-16">

                    {/* Sidebar Navigation */}
                    <aside className="lg:w-80 space-y-12">
                        <div className="border-l-[10px] border-black pl-8 py-2">
                            <h1 className="text-6xl font-[1000] tracking-tighter uppercase leading-none">NISHAAN</h1>
                            <div className="bg-black text-white inline-block px-3 py-1 mt-4 text-[10px] font-mono font-black uppercase tracking-[0.3em]">
                                Admin Panel
                            </div>
                        </div>

                        <nav className="flex flex-col border-[4px] border-black bg-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                            {[
                                { id: "pending", label: "Registration Requests", icon: Users, count: pendingUsers.filter((u: any) => u.status === 0).length },
                                { id: "evidence", label: "Received Evidences", icon: FileStack },
                                { id: "stats", label: "System Telemetry", icon: Activity }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group flex items-center justify-between p-6 transition-all border-b-[4px] border-black last:border-0 ${activeTab === tab.id ? "bg-zinc-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]" : "hover:bg-zinc-50 text-black"
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <tab.icon size={20} strokeWidth={3} className={activeTab === tab.id ? "text-blue-600" : ""} />
                                        <span className="font-[900] uppercase text-sm tracking-tighter">{tab.label}</span>
                                    </div>
                                    {tab.count !== undefined && tab.count > 0 ? (
                                        <span className={`px-2 py-1 font-mono text-xs font-black ${activeTab === tab.id ? "bg-blue-600 text-white" : "bg-black text-white"}`}>
                                            {tab.count}
                                        </span>
                                    ) : <ArrowRight size={16} />}
                                </button>
                            ))}


                        </nav>
                    </aside>

                    {/* Content Area */}
                    <section className="flex-1 bg-white border-[8px] border-black p-10 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                {/* PENDING USERS TAB */}
                                {activeTab === "pending" && (
                                    <div>
                                        <div className="flex items-center gap-4 mb-8 pb-4 inline-flex">
                                            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2.5 bg-black text-white hover:bg-zinc-800 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 disabled:opacity-50">
                                                <RefreshCw size={22} strokeWidth={3} className={isRefreshing ? 'animate-spin' : ''} />
                                            </button>
                                            <h2 className="text-3xl font-[1000] uppercase tracking-tighter">Registration Requests</h2>
                                        </div>
                                        {pendingUsers.length === 0 ? (
                                            <EmptyState
                                                icon={Users}
                                                title="Queue Cleared"
                                                message="No personnel are currently awaiting access authorization. All nodes are synced."
                                            />
                                        ) : (
                                            <div className="space-y-4">
                                                {pendingUsers.map((user, idx) => (
                                                    <div key={idx} className="flex flex-col md:flex-row items-center justify-between p-6 border-[4px] border-black bg-white hover:translate-x-1 hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                                        <div className="mb-4 md:mb-0">
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <h3 className="text-xl font-black uppercase tracking-tighter">{user.name}</h3>
                                                                <span className="bg-black text-white text-[10px] font-mono px-2 py-0.5">
                                                                    {user.role}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-mono text-zinc-500">{user.address}</p>
                                                        </div>
                                                        <div className="flex gap-4 w-full md:w-auto">
                                                            {user.status === 0 ? (
                                                                <>
                                                                    <button
                                                                        disabled={isProcessing}
                                                                        onClick={() => handleUserAction(user.address, 'approve')}
                                                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-green-500 text-white font-black uppercase text-xs border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all disabled:opacity-50"
                                                                    >
                                                                        <Check size={16} strokeWidth={4} /> Grant Access
                                                                    </button>
                                                                    <button
                                                                        disabled={isProcessing}
                                                                        onClick={() => handleUserAction(user.address, 'reject')}
                                                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-red-500 text-white font-black uppercase text-xs border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all disabled:opacity-50"
                                                                    >
                                                                        <X size={16} strokeWidth={4} /> Reject
                                                                    </button>
                                                                </>
                                                            ) : user.status === 1 ? (
                                                                <div className="flex-1 flex items-center justify-center gap-2 px-8 py-2 bg-zinc-50 text-green-600 font-black uppercase text-xs border-[3px] border-black">
                                                                    <Check size={16} strokeWidth={4} /> Approved
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 flex items-center justify-center gap-2 px-8 py-2 bg-zinc-50 text-red-600 font-black uppercase text-xs border-[3px] border-black">
                                                                    <X size={16} strokeWidth={4} /> Rejected
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* LEDGER TAB */}
                                {activeTab === "evidence" && (
                                    <div>
                                        <div className="flex items-center gap-4 mb-8 pb-4 inline-flex">
                                            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2.5 bg-black text-white hover:bg-zinc-800 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 disabled:opacity-50">
                                                <RefreshCw size={22} strokeWidth={3} className={isRefreshing ? 'animate-spin' : ''} />
                                            </button>
                                            <h2 className="text-3xl font-[1000] uppercase tracking-tighter">Received Evidences</h2>
                                        </div>
                                        {allEvidence.length === 0 ? (
                                            <EmptyState
                                                icon={Database}
                                                title="Ledger Empty"
                                                message="The blockchain ledger is active but contains no records. Logged cases and evidence files will appear here."
                                            />
                                        ) : (
                                            <div className="overflow-x-auto border-[4px] border-black">
                                                <table className="w-full text-left text-xs font-mono">
                                                    <thead className="bg-black text-white uppercase">
                                                        <tr>
                                                            <th className="px-4 py-3 border-r border-white/20">Case / ID</th>
                                                            <th className="px-4 py-3 border-r border-white/20">Officer</th>
                                                            <th className="px-4 py-3 border-r border-white/20">Type</th>
                                                            <th className="px-4 py-3 border-r border-white/20">Status</th>
                                                            <th className="px-4 py-3">Timestamp</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y-[2px] divide-black">
                                                        {allEvidence.map((ev, i) => (
                                                            <tr key={i} className="hover:bg-zinc-50 transition-colors">
                                                                <td className="px-4 py-4 border-r border-black/10">
                                                                    <div className="font-black text-black">{ev.id}</div>
                                                                    <div className="text-[10px] text-zinc-500">{ev.caseNumber}</div>
                                                                </td>
                                                                <td className="px-4 py-4 border-r border-black/10 font-bold">{ev.officer}</td>
                                                                <td className="px-4 py-4 border-r border-black/10 text-zinc-600">{ev.type}</td>
                                                                <td className="px-4 py-4 border-r border-black/10">
                                                                    <span className={`px-2 py-1 font-black uppercase ${ev.status === 2 ? 'bg-green-100 text-green-700' :
                                                                        ev.status === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                                            'bg-blue-100 text-blue-700'
                                                                        }`}>
                                                                        {ev.status === 2 ? 'Verified' : ev.status === 1 ? 'Reviewing' : 'Logged'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-4 text-zinc-400">
                                                                    {ev.timestamp > 0 ? new Date(ev.timestamp * 1000).toLocaleString() : "Syncing..."}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STATS TAB */}
                                {activeTab === "stats" && (
                                    <div className="space-y-10">
                                        <div className="flex items-center gap-4 mb-2 pb-4 inline-flex">
                                            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2.5 bg-black text-white hover:bg-zinc-800 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 disabled:opacity-50">
                                                <RefreshCw size={22} strokeWidth={3} className={isRefreshing ? 'animate-spin' : ''} />
                                            </button>
                                            <h2 className="text-3xl font-[1000] uppercase tracking-tighter">System Telemetry</h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <div className="border-[4px] border-black p-8 bg-zinc-50 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                                                <p className="text-black text-xs font-black uppercase mb-4 tracking-[0.2em]">Total Immutable Evidences</p>
                                                <p className="text-8xl font-[1000] tracking-tighter leading-none">{stats.evidenceCount}</p>
                                            </div>
                                            <div className="border-[4px] border-black p-8 bg-zinc-50 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                                                <p className="text-black text-xs font-black uppercase mb-4 tracking-[0.2em]">Total Authorized Users</p>
                                                <p className="text-8xl font-[1000] tracking-tighter leading-none">{stats.pendingCount}</p>
                                            </div>
                                            <div className="col-span-1 md:col-span-2 border-[4px] border-black p-8 bg-black text-white shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)]">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <ShieldAlert className="text-blue-300" size={20} />
                                                    <p className="text-xs font-black uppercase tracking-[0.2em]">Admin Wallet ID</p>
                                                </div>
                                                <p className="font-mono text-sm break-all text-blue-300">{stats.adminAddress}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </section>
                </div>
            </main>
        </div>
    );
}