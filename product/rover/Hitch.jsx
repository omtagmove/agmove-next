/** Rear linkage based on the supplied hitch render; illustrative proportions, not CAD. */
import React, { useMemo } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const FINISHES = {
  housing: ["#353b40", 0.4, 0.46],
  panels: ["#454d53", 0.4, 0.45],
  mounts: ["#353b40", 0.5, 0.42],
  links: ["#50595f", 0.55, 0.38],
  coupler: ["#353b40", 0.5, 0.4],
  bearings: ["#697278", 0.65, 0.35],
  hardware: ["#bec5ca", 0.7, 0.3],
  recesses: ["#15191c", 0.05, 0.85],
};

function buildHitch() {
  const parts = new Map();
  const axisY = new Vector3(0, 1, 0);
  const axisX = new Vector3(1, 0, 0);
  const axisZ = new Vector3(0, 0, 1);
  const unitScale = new Vector3(1, 1, 1);
  const vector = (p) => new Vector3(...p);
  const between = (a, b, t) => vector(a).lerp(vector(b), t).toArray();
  const add = (part, geometry, at = [0, 0, 0], rotation = new Quaternion()) => {
    geometry.applyMatrix4(new Matrix4().compose(vector(at), rotation, unitScale));
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    if (!parts.has(part)) parts.set(part, []);
    parts.get(part).push(geometry);
  };
  const box = (part, at, size) => add(part, new BoxGeometry(...size), at);
  const beam = (part, from, to, width, depth, inset = 0) => {
    const a = vector(from),
      b = vector(to),
      direction = b.clone().sub(a);
    const length = direction.length();
    add(
      part,
      new BoxGeometry(width, length - inset * 2, depth),
      a.add(b).multiplyScalar(0.5).toArray(),
      new Quaternion().setFromUnitVectors(axisY, direction.normalize()),
    );
  };
  const rod = (part, from, to, radius, segments = 16) => {
    const a = vector(from),
      b = vector(to),
      direction = b.clone().sub(a);
    add(
      part,
      new CylinderGeometry(radius, radius, direction.length(), segments),
      a.add(b).multiplyScalar(0.5).toArray(),
      new Quaternion().setFromUnitVectors(axisY, direction.normalize()),
    );
  };
  const profile = (part, outline, thickness, at, rotation, holes = []) => {
    const shape = new Shape();
    outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    holes.forEach(([x, y, radius]) => {
      const hole = new Path();
      hole.absarc(x, y, radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    });
    const geometry = new ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 1,
      curveSegments: 12,
      steps: 1,
    });
    geometry.translate(0, 0, -thickness / 2);
    add(part, geometry, at, rotation);
  };
  const eye = (at, outer = 0.075, bore = 0.033, thickness = 0.085) => {
    const shape = new Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 1,
      curveSegments: 16,
      steps: 1,
    });
    geometry.translate(0, 0, -thickness / 2);
    add("bearings", geometry, at, new Quaternion().setFromUnitVectors(axisZ, axisX));
  };
  const pin = (at, length = 0.19, radius = 0.029, clip = false) => {
    const [x, y, z] = at,
      side = Math.sign(x) || 1;
    rod("hardware", [x - length / 2, y, z], [x + length / 2, y, z], radius);
    rod(
      "hardware",
      [x + side * (length / 2 - 0.009), y, z],
      [x + side * (length / 2 + 0.017), y, z],
      radius * 1.6,
      6,
    );
    if (clip)
      add(
        "hardware",
        new TorusGeometry(0.042, 0.006, 6, 20),
        [x - side * (length / 2 - 0.012), y - 0.034, z],
        new Quaternion().setFromAxisAngle(axisY, Math.PI / 2),
      );
  };
  const lug = (at, adjustment = false) =>
    profile(
      "coupler",
      [
        [-0.085, -0.12],
        [0.085, -0.12],
        [0.085, adjustment ? 0.18 : 0.055],
        [0.05, adjustment ? 0.215 : 0.09],
        [-0.05, adjustment ? 0.215 : 0.09],
        [-0.085, adjustment ? 0.18 : 0.055],
      ],
      0.035,
      at,
      new Quaternion().setFromUnitVectors(axisZ, axisX),
      adjustment
        ? [
            [0, 0, 0.033],
            [0, 0.12, 0.033],
          ]
        : [[0, 0, 0.033]],
    );

  // Low mounting rack extends forward across the deck, as in the assembled reference.
  for (const x of [-0.76, 0.76]) box("mounts", [x, 0.045, 0.95], [0.055, 0.07, 2.2]);
  for (const z of [0.42, 1.18, 2.02]) box("mounts", [0, 0.045, z], [1.52, 0.07, 0.055]);

  // Chamfered enclosure, recessed service panel, folded seams and side louvers.
  profile(
    "housing",
    [
      [-0.68, 0.09],
      [0.68, 0.09],
      [0.68, 0.79],
      [0.56, 0.91],
      [0.3, 0.91],
      [0.2, 0.84],
      [-0.2, 0.84],
      [-0.3, 0.91],
      [-0.56, 0.91],
      [-0.68, 0.79],
    ],
    0.49,
    [0, 0, 0.03],
  );
  box("panels", [0, 0.36, 0.283], [1.22, 0.46, 0.018]);
  for (const y of [0.13, 0.59, 0.76]) box("recesses", [0, y, 0.296], [1.24, 0.014, 0.009]);
  for (const x of [-0.54, 0.54])
    for (const y of [0.18, 0.54, 0.8]) rod("hardware", [x, y, 0.293], [x, y, 0.313], 0.022, 6);

  for (const side of [-1, 1]) {
    const x = side * 0.55;
    box("mounts", [x, 0.035, 0.02], [0.12, 0.07, 0.76]);
    for (const z of [-0.24, 0.3]) {
      box("mounts", [x, 0.025, z], [0.24, 0.05, 0.18]);
      rod("hardware", [x, 0.05, z], [x, 0.075, z], 0.027, 6);
    }
    for (const y of [0.26, 0.37, 0.48])
      box("recesses", [side * 0.685, y, 0.03], [0.012, 0.028, 0.27]);
    // Brackets tie the two lower pivots into the platform's mounting rails.
    beam("mounts", [x, 0.04, -0.24], [side * 0.5, -0.13, -0.29], 0.14, 0.16);
  }

  // Two lower draft arms, slightly splayed at the implement end.
  const lower = (side) => [side * 0.7, -0.39, -1.3];
  const top = [0, 0.62, -1.3];
  rod("links", [-0.58, 0.37, -0.28], [0.58, 0.37, -0.28], 0.065);
  for (const side of [-1, 1]) {
    const root = [side * 0.5, -0.13, -0.29];
    const knee = [side * 0.57, -0.3, -0.94];
    const end = lower(side);
    const rocker = [side * 0.58, 0.42, -0.68];
    const liftEnd = [side * 0.56, -0.27, -0.85];
    beam("links", root, knee, 0.085, 0.14, 0.035);
    beam("links", knee, end, 0.095, 0.14, 0.035);
    eye(root);
    pin(root);
    eye(end, 0.092, 0.037, 0.105);
    pin(end, 0.27, 0.034, true);

    // Rockshaft arms and lift links. The right link has a visible adjustment barrel.
    eye([side * 0.5, 0.37, -0.28], 0.095, 0.066, 0.08);
    beam("links", [side * 0.5, 0.37, -0.28], rocker, 0.1, 0.105);
    if (side > 0) {
      rod("links", between(rocker, liftEnd, 0.12), between(rocker, liftEnd, 0.58), 0.046);
      rod("hardware", between(rocker, liftEnd, 0.58), between(rocker, liftEnd, 0.91), 0.024);
      rod("hardware", between(rocker, liftEnd, 0.56), between(rocker, liftEnd, 0.63), 0.05, 6);
      const handle = between(rocker, liftEnd, 0.32);
      rod(
        "hardware",
        [handle[0] - 0.11, handle[1], handle[2]],
        [handle[0] + 0.11, handle[1], handle[2]],
        0.014,
      );
    } else beam("links", rocker, liftEnd, 0.055, 0.075, 0.055);
    eye(rocker, 0.06, 0.025, 0.065);
    pin(rocker, 0.17, 0.024);
    eye(liftEnd, 0.06, 0.025, 0.065);
    pin(liftEnd, 0.17, 0.024);

    // Sway stabilizers remain distinct from the lifting linkage.
    const swayRoot = [side * 0.21, -0.1, -0.32];
    const swayEnd = [side * 0.55, -0.28, -0.91];
    rod("links", swayRoot, between(swayRoot, swayEnd, 0.65), 0.034);
    rod("hardware", between(swayRoot, swayEnd, 0.65), swayEnd, 0.022);
    pin(swayRoot, 0.1, 0.021);

    // Welded triangular implement interface with open pin-bearing ends.
    beam("coupler", end, top, 0.11, 0.1, 0.075);
    profile(
      "coupler",
      [
        [-0.13, -0.08],
        [0.13, -0.08],
        [side * 0.08, 0.13],
      ],
      0.035,
      [side * 0.51, -0.31, -1.35],
    );
  }
  beam("coupler", [-0.6, -0.39, -1.3], [0.6, -0.39, -1.3], 0.11, 0.11);

  // Adjustable center/top link, with locknuts, handle and forked pin brackets.
  const center = [0, 0.62, -0.26];
  rod("hardware", between(center, top, 0.07), between(center, top, 0.32), 0.028);
  rod("links", between(center, top, 0.3), between(center, top, 0.7), 0.063);
  rod("hardware", between(center, top, 0.68), between(center, top, 0.93), 0.028);
  for (const t of [0.29, 0.72])
    rod("hardware", between(center, top, t - 0.025), between(center, top, t + 0.025), 0.051, 6);
  const handle = between(center, top, 0.48);
  rod("hardware", [-0.15, handle[1] + 0.04, handle[2]], [0.15, handle[1] + 0.04, handle[2]], 0.016);
  for (const [at, adjustment] of [
    [center, false],
    [top, true],
  ]) {
    eye(at, 0.073, 0.032, 0.08);
    for (const side of [-1, 1]) lug([side * 0.076, at[1], at[2]], adjustment);
    pin(at, 0.24, 0.03, true);
  }

  // Merge matching parts so detailed hardware does not add a draw call per bolt.
  return [...parts].map(([name, geometries]) => {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((part) => part.dispose());
    geometry.computeBoundingSphere();
    return { name, geometry, finish: FINISHES[name] };
  });
}

export function Hitch() {
  const parts = useMemo(buildHitch, []);
  return (
    <group name="Rear three-point hitch">
      {parts.map(({ name, geometry, finish: [color, metalness, roughness] }) => (
        <mesh key={name} name={`Hitch ${name}`} geometry={geometry}>
          <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
        </mesh>
      ))}
    </group>
  );
}
