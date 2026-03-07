"use client";

import { useRef, useEffect } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Shield, Lock, FileSearch, ArrowRight, Activity, Zap } from "lucide-react";
import * as THREE from "three";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
});

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

function FeatureCard({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      className="group p-10 border-[6px] border-black bg-white hover:bg-black hover:text-white transition-all duration-300 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-2 hover:translate-y-2"
    >
      <div className="mb-6 inline-block p-4 border-[3px] border-current">
        <Icon size={40} strokeWidth={2.5} />
      </div>
      <h3 className="text-3xl font-[1000] uppercase italic tracking-tighter mb-4">{title}</h3>
      <p className="font-bold text-sm leading-relaxed opacity-70 uppercase">{description}</p>
    </motion.div>
  );
}

export default function Home() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <div className="relative min-h-screen bg-transparent selection:bg-black selection:text-white font-sans overflow-x-hidden" ref={containerRef}>
      <NexusGrid />

      {/* Hero Section */}
      <section className="relative h-screen flex flex-col items-center justify-center px-6 pt-20">
        <motion.div style={{ y, opacity }} className="flex flex-col items-center text-center z-10 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 flex items-center justify-center"
          >
            <span className={`text-3xl md:text-5xl font-light tracking-[0.4em] uppercase text-zinc-800 leading-none -mr-[0.4em] ${montserrat.className}`}>
              NISHAAN
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[12vw] md:text-[10rem] font-[1000] tracking-[ -0.05em] leading-[0.85] uppercase italic"
          >
            <span className="bg-black text-white px-4 mr-2 pr-10">SECURE THE</span> <br />
            <span className="font-sans font-[900] not-italic text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)] [-webkit-text-stroke:4px_black]">TRUTH</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 text-lg md:text-2xl font-black uppercase max-w-3xl leading-tight text-zinc-500"
          >
            A decentralized management system for the modern justice era. Cryptographically secure, verifiable, and instantly accessible.
          </motion.p>

          <motion.div className="flex flex-wrap justify-center gap-8 mt-16">
            <Link
              href="/login"
              className="group relative px-12 py-6 bg-black text-white text-xl font-black uppercase tracking-widest shadow-[15px_15px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-none hover:translate-x-2 hover:translate-y-2 transition-all"
            >
              Access System
            </Link>
            <a
              href="#architecture"
              className="px-12 py-6 border-[4px] border-black bg-transparent text-black text-xl font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
            >
              More Details
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="architecture" className="relative py-40 px-6 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="border-l-[15px] border-black pl-8 mb-32">
            <h2 className="text-6xl md:text-8xl font-[1000] tracking-tighter uppercase mb-6 italic text-black">Designed For Trust</h2>
            <p className="text-xl font-bold uppercase text-zinc-500 max-w-2xl">
              Every piece of evidence is hashed, stored on IPFS, and permanently anchored to the Ethereum blockchain.
            </p>
          </div>

          <div className="grid text-black grid-cols-1 lg:grid-cols-3 gap-12">
            <FeatureCard
              icon={Lock}
              title="Cryptographic Integrity"
              description="Files are uploaded to the interplanetary file system (IPFS) generating a unique hash. Once logged on-chain, it is mathematically impossible to alter."
              delay={0.1}
            />
            <FeatureCard
              icon={Shield}
              title="Role-Based Execution"
              description="Strict access controls ensure only verified Police officers can upload evidence, and Court officials can verify and archive it."
              delay={0.2}
            />
            <FeatureCard
              icon={FileSearch}
              title="Transparent Chain"
              description="Every view, status change, and interaction is logged immutably. The full history of any evidence file is auditable and transparent."
              delay={0.3}
            />
          </div>
        </div>
      </section>
    </div>
  );
}