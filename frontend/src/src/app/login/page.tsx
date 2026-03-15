"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWeb3 } from "../../context/Web3Context";
import { ShieldAlert, Loader2, ArrowRight, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// --- THREE.JS BACKGROUND: THE GRID ---
function NexusGrid() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        containerRef.current.appendChild(renderer.domElement);

        const geometry = new THREE.PlaneGeometry(2000, 2000, 50, 50);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.1 });
        const grid = new THREE.Mesh(geometry, material);
        grid.rotation.x = -Math.PI / 2;
        scene.add(grid);

        camera.position.y = 100;
        camera.position.z = 200;
        camera.lookAt(0, 0, 0);

        const animate = () => {
            requestAnimationFrame(animate);
            grid.position.z += 1;
            if (grid.position.z > 40) grid.position.z = 0;
            renderer.render(scene, camera);
        };
        animate();

        return () => { containerRef.current?.removeChild(renderer.domElement); };
    }, []);

    return <div ref={containerRef} className="fixed inset-0 -z-10 bg-white" />;
}

export default function LoginPage() {
    const { account, role, status, isApproved, isRegistered, isLoading, error, connectWallet, registerUser } = useWeb3();
    const router = useRouter();

    const [name, setName] = useState("");
    const [selectedRole, setSelectedRole] = useState("Police");
    const [isRegistering, setIsRegistering] = useState(false);

    // Original Redirect Logic
    useEffect(() => {
        if (!isLoading && account && isRegistered && isApproved && role) {
            if (role === "Police") {
                router.push("/dashboard/police");
            } else if (role === "Court") {
                router.push("/dashboard/court");
            } else if (role === "Admin") {
                router.push("/dashboard/admin");
            }
        }
    }, [account, role, isApproved, isRegistered, isLoading, router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsRegistering(true);
            await registerUser(name, selectedRole);
        } catch (err) {
            console.error(err);
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className="min-h-screen text-black selection:bg-black selection:text-white font-sans flex items-center justify-center p-6">
            <NexusGrid />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg z-10"
            >
                {/* Header Section */}
                <div className="mb-8 border-l-[12px] border-black pl-6 py-2">
                    <h1 className="text-6xl font-[1000] tracking-tighter uppercase leading-none italic">NISHAAN</h1>
                    <div className="bg-black text-white inline-block px-3 py-1 mt-4 text-[10px] font-mono font-black uppercase tracking-[0.3em]">
                        Secure The Truth
                    </div>
                </div>

                <div className="bg-white border-[8px] border-black p-8 md:p-12 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center gap-4 mb-8 border-b-[4px] border-black pb-6">
                        <Lock size={32} strokeWidth={3} />
                        <h2 className="text-2xl font-[900] uppercase tracking-tight">System Access</h2>
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="mb-6 p-4 border-[3px] border-red-600 bg-red-50 text-red-600 font-mono text-xs font-bold uppercase"
                            >
                                [Auth_Error]: {error}
                            </motion.div>
                        )}

                        {isLoading ? (
                            <motion.div key="loading" className="flex flex-col items-center justify-center py-12 space-y-6">
                                <Loader2 className="w-12 h-12 text-black animate-spin" strokeWidth={3} />
                                <p className="font-black uppercase text-xs tracking-[0.2em]">Verifying_Blockchain_Node...</p>
                            </motion.div>
                        ) : !account ? (
                            <motion.div key="connect" className="space-y-6">
                                <p className="text-zinc-500 font-bold text-sm leading-relaxed uppercase">
                                    Establishing secure connection to Ethereum . Connect your cryptographic signature to proceed.
                                </p>
                                <button
                                    onClick={connectWallet}
                                    className="w-full flex items-center justify-between py-6 px-8 bg-black text-white font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)] group"
                                >
                                    <span>Initialize Wallet</span>
                                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                                </button>
                            </motion.div>
                        ) : isRegistered && !isApproved ? (
                            <motion.div key="pending" className={`text-center p-8 border-[4px] border-black ${status === 2 ? 'bg-red-50 border-red-600' : 'bg-zinc-50'}`}>
                                <ShieldAlert size={48} className={`mx-auto mb-4 ${status === 2 ? 'text-red-600' : 'text-black'}`} />
                                <h3 className="text-xl font-black uppercase mb-4 tracking-tighter">
                                    {status === 2 ? "Application Rejected" : "Access Restricted"}
                                </h3>
                                <p className={`text-xs font-bold uppercase leading-relaxed ${status === 2 ? 'text-red-600' : 'text-zinc-500'}`}>
                                    Identity Profile ({account.slice(0, 6)}...{account.slice(-4)}) {status === 2 ? 'has been explicitly rejected by the system administrator.' : 'is logged. Awaiting manual override by system administrator.'}
                                </p>
                                <div className={`mt-6 font-mono text-[10px] text-white inline-block px-4 py-2 uppercase tracking-widest ${status === 2 ? 'bg-red-600' : 'bg-black'}`}>
                                    Status: {status === 2 ? "Application_Rejected" : "Pending_Approval"}
                                </div>
                            </motion.div>
                        ) : !isRegistered ? (
                            <motion.form key="register" onSubmit={handleRegister} className="space-y-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Officer Identity Name</label>
                                        <input
                                            required
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="EX: OFFICER SMITH"
                                            className="w-full bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Department Designation</label>
                                        <select
                                            value={selectedRole}
                                            onChange={(e) => setSelectedRole(e.target.value)}
                                            className="w-full bg-white border-[4px] border-black p-4 font-bold focus:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all outline-none uppercase appearance-none cursor-pointer"
                                        >
                                            <option value="Police">Police Department</option>
                                            <option value="Court">Court Official</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isRegistering}
                                    className="w-full flex items-center justify-center gap-4 py-6 bg-black text-white font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-50"
                                >
                                    {isRegistering ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                        <>
                                            <Fingerprint size={24} />
                                            <span>Register Identity</span>
                                        </>
                                    )}
                                </button>
                            </motion.form>
                        ) : null}
                    </AnimatePresence>

                    {account && (
                        <div className="mt-10 pt-6 border-t-[1px] border-black/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-[10px] font-mono font-black uppercase">Socket_Live</span>
                            </div>
                            <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-tighter">
                                ID: {account}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Meta */}
                <div className="mt-6 flex justify-between items-center px-4">
                    <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-[0.2em]">© 2026 NISHAAN_BY_HACKC</p>
                    <div className="flex gap-4">
                        <ShieldCheck size={16} className="text-zinc-300" />
                        <Lock size={16} className="text-zinc-300" />
                    </div>
                </div>
            </motion.div>
        </div>
    );
}