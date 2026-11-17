/** Small, scroll-scrubbed working actions; the existing implement geometry stays intact. */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace } from "three";
import { sampleFlow, MOUNTS } from "./flow.js";

export default function WorkActions({ motion, review }) {
  const mist = useRef(null),
    hitch = useRef(null),
    coupling = useRef(null),
    cargo = useRef(null);
  const particles = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(180 * 3), 3));
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d"),
      v = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    v.addColorStop(0, "#d5e8e9b0");
    v.addColorStop(0.45, "#d5e8e950");
    v.addColorStop(1, "#d5e8e900");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new CanvasTexture(c);
    texture.colorSpace = SRGBColorSpace;
    return { g, texture };
  }, []);
  useEffect(
    () => () => {
      particles.g.dispose();
      particles.texture.dispose();
    },
    [particles],
  );
  useFrame(() => {
    const f = sampleFlow(motion.current.progress),
      t = f.actionProgress;
    mist.current.visible = f.index === 1 && f.dock > 0.99 && f.action > 0.001;
    const p = particles.g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const q = (t * 3.2 + i * 0.61803398875) % 1,
        side = i % 2 ? 1 : -1;
      p.setXYZ(
        i,
        side * (0.55 + q * 2.4),
        2.66 + Math.sin(i * 1.9) * q * 0.48 - q * q * 0.3,
        -1.52 + Math.cos(i * 0.7) * q * 0.5,
      );
    }
    p.needsUpdate = true;
    mist.current.material.opacity = f.action * 0.68;
    hitch.current.visible = f.index === 2 && f.dock > 0.99;
    hitch.current.position.set(
      0.27 * (1 - Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 2),
      2.375,
      -2.28,
    );
    coupling.current.visible = f.index === 3 && f.dock > 0.99;
    coupling.current.position.set(
      0,
      0.92 + 0.22 * (1 - Math.min(1, t * 3)),
      MOUNTS.trolley[2] + 0.025,
    );
    cargo.current.visible = f.index === 4 && f.dock > 0.99 && t > 0.001;
    cargo.current.position.y = 0.72 * (1 - Math.min(1, t * 2.5));
    cargo.current.scale.setScalar(Math.min(1, t * 8));
    if (review)
      review.current = {
        mist: mist.current.visible,
        mistOpacity: mist.current.material.opacity,
        mistPoint: Array.from(p.array.slice(0, 3)),
        hitchPin: hitch.current.position.toArray(),
        couplingPin: coupling.current.position.toArray(),
        cargoHeight: cargo.current.position.y,
        cargoVisible: cargo.current.visible,
      };
  });
  return (
    <>
      <points ref={mist} geometry={particles.g} name="Air-blast spray mist" frustumCulled={false}>
        <pointsMaterial
          map={particles.texture}
          color="#c8e4df"
          size={0.19}
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <mesh ref={hitch} rotation={[0, 0, Math.PI / 2]} name="Hitch engagement pin">
        <cylinderGeometry args={[0.028, 0.028, 0.34, 8]} />
        <meshStandardMaterial color="#c7d3d7" metalness={0.7} roughness={0.35} />
      </mesh>
      <group ref={coupling} name="Trolley coupling latch">
        <mesh>
          <cylinderGeometry args={[0.027, 0.027, 0.3, 8]} />
          <meshStandardMaterial color="#becbd0" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.065, 0.013, 6, 12]} />
          <meshStandardMaterial color="#8eb6ed" metalness={0.3} roughness={0.4} />
        </mesh>
      </group>
      <group ref={cargo} name="Harvest trays loading onto rack">
        {[-0.48, 0.15].map((z, i) => (
          <group key={z} position={[0, 1.96, z]}>
            <mesh>
              <boxGeometry args={[1.22, 0.3, 0.53]} />
              <meshStandardMaterial color={i ? "#64735a" : "#82906b"} roughness={0.9} />
            </mesh>
            {[-0.17, 0, 0.17].map((x) => (
              <mesh key={x} position={[x, 0.17, 0.02]}>
                <icosahedronGeometry args={[0.12, 0]} />
                <meshStandardMaterial color="#aeb573" roughness={0.95} />
              </mesh>
            ))}
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[1.24, 0.035, 0.55]} />
              <meshStandardMaterial color="#a0a68a" roughness={0.9} />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}
