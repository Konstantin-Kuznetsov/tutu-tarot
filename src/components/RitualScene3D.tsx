"use client";

import { Canvas } from "@react-three/fiber";
import { Float, PerspectiveCamera } from "@react-three/drei";

export type RitualVisualStage = "idle" | "ritual-started" | "dealing" | "revealing" | "result" | "error";

const cardPlacements = [
  { x: -1.55, z: -0.05, rotation: -0.16 },
  { x: 0, z: -0.24, rotation: 0 },
  { x: 1.55, z: -0.05, rotation: 0.16 },
];

function TableScene({ stage }: { stage: RitualVisualStage }) {
  const dealing = stage === "dealing" || stage === "revealing";
  const revealed = stage === "revealing" || stage === "result";
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 4.5, 6]} rotation={[-0.62, 0, 0]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[0, 4, 2]} intensity={18} color="#c59b4d" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#26131d" roughness={0.86} />
      </mesh>
      {cardPlacements.map((placement, index) => {
        const progress = stage === "idle" ? 0.18 : dealing ? 0.72 : 1;
        const x = placement.x * progress;
        const z = 1.2 - (1.2 - placement.z) * progress;
        const lift = dealing ? 0.16 + index * 0.04 : 0.04;
        const faceColor = index === 0 ? "#e6c16f" : index === 1 ? "#a7d8cf" : "#d4b3e6";

        return (
          <Float key={placement.x} speed={revealed ? 1.2 : 2.2} rotationIntensity={revealed ? 0.06 : 0.18} floatIntensity={revealed ? 0.08 : 0.28}>
          <mesh position={[x, lift, z]} rotation={[-Math.PI / 2, 0, placement.rotation * progress]}>
            <boxGeometry args={[0.9, 1.35, 0.04]} />
            <meshStandardMaterial color={revealed ? faceColor : "#1a8f7a"} roughness={0.6} metalness={0.08} />
          </mesh>
        </Float>
        );
      })}
      <mesh position={[0, 0.16, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.95, 1.4, 0.22]} />
        <meshStandardMaterial color="#7a1f35" roughness={0.72} />
      </mesh>
    </>
  );
}

export function RitualScene3D({ stage }: { stage: RitualVisualStage }) {
  return (
    <div className="ritual-scene" aria-label="3D tarot ritual scene">
      <Canvas dpr={[1, 1.75]}>
        <TableScene stage={stage} />
      </Canvas>
    </div>
  );
}
