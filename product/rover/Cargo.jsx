/** Six secured cartons, merged by finish to keep the loaded trolley inexpensive. */
import { useEffect, useMemo } from "react";
import { BoxGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export default function Cargo() {
  const parts = useMemo(() => {
    const groups = new Map();
    const box = (color, at, size) => {
      const g = new BoxGeometry(...size).translate(...at);
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color).push(g);
    };
    // All boxes rest on the bed and remain inside the trolley's side walls.
    for (const x of [-0.46, 0.46])
      for (const [row, z] of [-1.32, -2.18, -3.04].entries()) {
        const h = [0.95, 1.12, 0.82][row];
        box(x < 0 ? "#a78353" : "#b99b70", [x, 0.96 + h / 2, z], [0.84, h, 0.78]);
        box("#c9af83", [x, 0.966 + h, z], [0.08, 0.012, 0.78]);
        box("#c9af83", [x, 0.89 + h, z + 0.397], [0.08, 0.15, 0.014]);
        box("#ddd8c7", [x + 0.17, 0.75 + h, z + 0.4], [0.22, 0.16, 0.016]);
        // Small dark handling marks, with no invented brand or specifications.
        box("#505555", [x + 0.17, 0.77 + h, z + 0.412], [0.14, 0.012, 0.008]);
        box("#505555", [x + 0.17, 0.73 + h, z + 0.412], [0.1, 0.012, 0.008]);
      }
    return [...groups].map(([color, geometry]) => {
      const merged = mergeGeometries(geometry);
      geometry.forEach((g) => g.dispose());
      return { color, geometry: merged };
    });
  }, []);
  useEffect(() => () => parts.forEach(({ geometry }) => geometry.dispose()), [parts]);
  return (
    <group name="Loaded trolley goods" userData={{ cargoCount: 6 }}>
      {parts.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry}>
          <meshStandardMaterial color={color} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}
