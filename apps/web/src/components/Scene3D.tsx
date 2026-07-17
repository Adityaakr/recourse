// The signature 3D visual: a slowly turning glass prism — the router — lit from
// two sides by the lane colors (teal = injected, violet = L1). The object IS
// the product idea: one node, two lanes refracting through it. Kept restrained
// and calm so it reads as craft, not decoration.

import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useRef, useMemo } from "react";
import type { Mesh } from "three";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Prism({ still }: { still: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && !still) ref.current.rotation.y += dt * 0.28;
  });
  return (
    <Float speed={still ? 0 : 1.4} rotationIntensity={still ? 0 : 0.5} floatIntensity={still ? 0 : 0.9}>
      <mesh ref={ref} rotation={[0.5, 0.3, 0]}>
        <octahedronGeometry args={[1.15, 0]} />
        {/* No env map (avoids a CDN HDR fetch); the two colored lights carry
            the look and the lane story. */}
        <meshStandardMaterial color="#eef1f6" metalness={0.15} roughness={0.28} flatShading />
      </mesh>
    </Float>
  );
}

export function Scene3D() {
  const still = useMemo(prefersReducedMotion, []);
  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.7} />
      {/* injected lane — teal — and L1 lane — violet — from opposite sides */}
      <pointLight position={[3.2, 2, 2.5]} intensity={55} color="#12c9d6" />
      <pointLight position={[-3.2, -1.4, 2]} intensity={55} color="#a78bfa" />
      <pointLight position={[0, 3, -2]} intensity={22} color="#ffffff" />
      <directionalLight position={[0, 2, 4]} intensity={0.6} />
      <Prism still={still} />
    </Canvas>
  );
}
