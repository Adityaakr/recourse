// A live 3D view of the auction. The router sits at the center; each provider
// that has quoted is a node placed around it, pulled CLOSER the cheaper its
// price (so "closest to the router" literally means "closest to winning"). The
// awarded provider glows white with a bright beam to the router; the losers are
// dim with thin beams. It reflects the selected job's real quotes in real time.

import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import type { Job } from "../lib/api.js";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Node { pos: [number, number, number]; winner: boolean }

function useNodes(job: Job): Node[] {
  return useMemo(() => {
    const q = job.quotes;
    if (q.length === 0) return [];
    const prices = q.map((x) => Number(BigInt(x.priceWei)));
    const min = Math.min(...prices), max = Math.max(...prices);
    const winner = job.winner?.toLowerCase();
    return q.map((quote, i) => {
      const angle = (i / q.length) * Math.PI * 2 - Math.PI / 2;
      const norm = max > min ? (Number(BigInt(quote.priceWei)) - min) / (max - min) : 0.4;
      const radius = 1.25 + norm * 1.6; // cheaper -> closer to the router
      return {
        pos: [Math.cos(angle) * radius, i % 2 === 0 ? 0.25 : -0.25, Math.sin(angle) * radius] as [number, number, number],
        winner: !!winner && quote.provider.toLowerCase() === winner,
      };
    });
  }, [job.quotes, job.winner]);
}

function Router() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.5; });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.55, 0]} />
      <meshStandardMaterial color="#f2f4f7" metalness={0.2} roughness={0.3} flatShading />
    </mesh>
  );
}

function ProviderNode({ node }: { node: Node }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = node.winner ? 1 + Math.sin(clock.elapsedTime * 3) * 0.14 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <group>
      <Line points={[[0, 0, 0], node.pos]} color={node.winner ? "#ffffff" : "#4a4a4a"} lineWidth={node.winner ? 2.4 : 1} />
      <mesh ref={ref} position={node.pos}>
        <sphereGeometry args={[node.winner ? 0.26 : 0.17, 24, 24]} />
        <meshStandardMaterial
          color={node.winner ? "#ffffff" : "#8a8a8a"}
          emissive={node.winner ? "#ffffff" : "#000000"}
          emissiveIntensity={node.winner ? 0.45 : 0}
          metalness={0.1} roughness={0.4}
        />
      </mesh>
    </group>
  );
}

function Arena({ job, still }: { job: Job; still: boolean }) {
  const group = useRef<Group>(null);
  const nodes = useNodes(job);
  useFrame((_, dt) => { if (group.current && !still) group.current.rotation.y += dt * 0.12; });
  return (
    <group ref={group}>
      <Router />
      {nodes.map((n, i) => <ProviderNode key={i} node={n} />)}
    </group>
  );
}

export function MarketScene3D({ job }: { job: Job }) {
  const still = useMemo(reducedMotion, []);
  return (
    <Canvas
      key={job.id}
      camera={{ position: [0, 3.1, 5.4], fov: 44 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[3.5, 3, 3]} intensity={55} color="#ffffff" />
      <pointLight position={[-3.2, -1.2, 2]} intensity={30} color="#b3b3b3" />
      <directionalLight position={[0, 3, 4]} intensity={0.5} />
      <Arena job={job} still={still} />
    </Canvas>
  );
}
