/** A small, feathered road patch adds moving ground beneath the photographed farm. */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from "three";
import { sampleFlow } from "./flow.js";

function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function roadTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d"),
    rand = random(58321);
  ctx.fillStyle = "#665747";
  ctx.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 24000; i++) {
    ctx.fillStyle = i % 3 ? "#b09c7b18" : "#201e1b24";
    ctx.fillRect(rand() * 512, rand() * 1024, 1 + rand() * 4, 1 + rand() * 7);
  }
  // Continuous wheel ruts, brushed edges, wet depressions and staggered tread marks.
  for (const x of [164, 348]) {
    const rut = ctx.createLinearGradient(x - 38, 0, x + 38, 0);
    rut.addColorStop(0, "#443a2e00");
    rut.addColorStop(0.22, "#342e29aa");
    rut.addColorStop(0.55, "#201f1a99");
    rut.addColorStop(0.85, "#ac957448");
    rut.addColorStop(1, "#443a2e00");
    ctx.fillStyle = rut;
    ctx.fillRect(x - 38, 0, 76, 1024);
    for (let y = -10; y < 1040; y += 24) {
      ctx.strokeStyle = "#302c25a0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 24, y);
      ctx.lineTo(x - 4, y + 7);
      ctx.moveTo(x + 24, y + 5);
      ctx.lineTo(x + 4, y + 12);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const y = 50 + rand() * 920;
      ctx.fillStyle = "#82918b36";
      ctx.beginPath();
      ctx.ellipse(x + rand() * 8 - 4, y, 12 + rand() * 8, 20 + rand() * 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c1c3a92e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x - 4, y - 2, 9, 20, 0, Math.PI * 0.8, Math.PI * 1.6);
      ctx.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 5);
  texture.anisotropy = 4;
  return texture;
}

function softenRoad(shader) {
  shader.vertexShader = "varying vec2 vRoadPosition;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvRoadPosition = position.xz;",
  );
  shader.fragmentShader = "varying vec2 vRoadPosition;\n" + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <dithering_fragment>",
    "gl_FragColor.a *= (1.0 - smoothstep(2.5, 11.0, length(vRoadPosition))) * (1.0 - smoothstep(1.4, 2.7, abs(vRoadPosition.x)));\n#include <dithering_fragment>",
  );
}
export default function FarmWorld({ motion, review }) {
  const road = useRef(null),
    surface = useRef(null);
  const resources = useMemo(() => {
    const geometry = new PlaneGeometry(5.4, 40, 8, 32);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, 0.018 * Math.sin(p.getZ(i) * 1.7) * Math.cos(p.getX(i) * 2.4));
    geometry.computeVertexNormals();
    return { geometry, texture: roadTexture() };
  }, []);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.texture.dispose();
    },
    [resources],
  );
  useFrame(() => {
    const flow = sampleFlow(motion.current.progress);
    road.current.rotation.y = flow.heading;
    resources.texture.offset.y = -flow.distance / 8;
    // The warehouse settings have their own concrete floor; fade out the farm ruts.
    const transition = Math.max(0, Math.min(1, (motion.current.progress * 5 - 2.88) / 0.24));
    surface.current.opacity = 0.8 * (1 - transition * transition * (3 - 2 * transition));
    if (review)
      review.current = {
        distance: flow.distance,
        roadOffset: resources.texture.offset.y,
        heading: flow.heading,
      };
  });
  return (
    <group ref={road} name="Straight farm route">
      <mesh
        name="Moving farm road"
        geometry={resources.geometry}
        position={[0, -0.025, 0]}
        renderOrder={-1}
      >
        <meshLambertMaterial
          ref={surface}
          map={resources.texture}
          transparent
          opacity={0.8}
          depthWrite={false}
          onBeforeCompile={softenRoad}
        />
      </mesh>
    </group>
  );
}
