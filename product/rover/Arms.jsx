/** Articulated geometry shaped from assembled/arms.webp; illustrative, not CAD. */
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const FINISHES = {
  casting: { color: "#454c52", metalness: 0.32, roughness: 0.36 },
  cover: { color: "#60696f", metalness: 0.44, roughness: 0.34 },
  steel: { color: "#adb5b9", metalness: 0.72, roughness: 0.28 },
  seal: { color: "#1b2024", metalness: 0.05, roughness: 0.78 },
};

function buildParts() {
  const pieces = new Map();
  const yAxis = new Vector3(0, 1, 0),
    zAxis = new Vector3(0, 0, 1);
  const scale = new Vector3(1, 1, 1);
  const rotation = (axis) => new Quaternion().setFromUnitVectors(yAxis, new Vector3(...axis));
  const add = (part, finish, geometry, at = [0, 0, 0], q = new Quaternion()) => {
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...at), q, scale));
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    if (!pieces.has(part)) pieces.set(part, new Map());
    const group = pieces.get(part);
    if (!group.has(finish)) group.set(finish, []);
    group.get(finish).push(geometry);
  };
  const box = (part, finish, at, dimensions) =>
    add(part, finish, new BoxGeometry(...dimensions), at);
  const cylinder = (part, finish, at, r, length, axis = [0, 1, 0], bottom = r, segments = 32) =>
    add(part, finish, new CylinderGeometry(r, bottom, length, segments), at, rotation(axis));
  const profile = (part, finish, outline, depth, at = [0, 0, 0], holes = [], bevel = 0.012) => {
    const shape = new Shape();
    outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    for (const points of holes) {
      const hole = new Path();
      points.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 12,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    add(part, finish, geometry, at);
  };
  const ring = (part, finish, at, r, tube, axis = [0, 0, 1]) =>
    add(
      part,
      finish,
      new TorusGeometry(r, tube, 8, 32),
      at,
      new Quaternion().setFromUnitVectors(zAxis, new Vector3(...axis)),
    );
  const bolts = (part, radius, y, z, count = 6, size = 0.013) => {
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count;
      cylinder(
        part,
        "steel",
        [Math.sin(angle) * radius, y + Math.cos(angle) * radius, z],
        size,
        0.012,
        [0, 0, 1],
        size,
        6,
      );
    }
  };
  const joint = (part, radius, depth) => {
    cylinder(part, "casting", [0, 0, 0], radius, depth, [0, 0, 1]);
    for (const side of [-1, 1]) {
      cylinder(part, "seal", [0, 0, side * (depth / 2 + 0.005)], radius * 0.84, 0.018, [0, 0, 1]);
      cylinder(part, "cover", [0, 0, side * (depth / 2 + 0.018)], radius * 0.72, 0.018, [0, 0, 1]);
      ring(part, "steel", [0, 0, side * (depth / 2 + 0.029)], radius * 0.67, 0.005);
      cylinder(
        part,
        "casting",
        [0, 0, side * (depth / 2 + 0.031)],
        radius * 0.38,
        0.012,
        [0, 0, 1],
      );
      bolts(part, radius * 0.53, 0, side * (depth / 2 + 0.035), 6, 0.009);
    }
  };

  // Stepped circular pedestals with mounting feet, bolts and a separate slew bearing.
  cylinder("base", "casting", [0, 0.075, 0], 0.29, 0.15);
  cylinder("base", "cover", [0, 0.163, 0], 0.25, 0.026);
  cylinder("base", "seal", [0, 0.19, 0], 0.219, 0.028);
  cylinder("base", "casting", [0, 0.218, 0], 0.21, 0.03);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.sin(angle) * 0.225,
      z = Math.cos(angle) * 0.225;
    box("base", "casting", [x, 0.045, z], [0.12, 0.09, 0.12]);
    cylinder("base", "steel", [x, 0.098, z], 0.022, 0.018, [0, 1, 0], 0.022, 6);
  }
  cylinder("turret", "casting", [0, 0.035, 0], 0.19, 0.07);
  profile(
    "turret",
    "casting",
    [
      [-0.15, 0.02],
      [0.15, 0.02],
      [0.12, 0.19],
      [-0.12, 0.19],
    ],
    0.21,
  );
  ring("turret", "seal", [0, 0.005, 0], 0.185, 0.009, [0, 1, 0]);

  // A continuous, tapered cast link joins the shoulder and elbow pivots.
  joint("upper", 0.165, 0.23);
  profile(
    "upper",
    "casting",
    [
      [-0.145, -0.04],
      [-0.155, 0.12],
      [-0.09, 0.29],
      [-0.073, 0.61],
      [-0.117, 0.73],
      [-0.1, 0.81],
      [0.1, 0.81],
      [0.117, 0.73],
      [0.073, 0.61],
      [0.09, 0.29],
      [0.155, 0.12],
      [0.145, -0.04],
    ],
    0.13,
    [0, 0, 0],
    [],
    0.025,
  );
  for (const side of [-1, 1]) {
    profile(
      "upper",
      "cover",
      [
        [-0.059, 0.23],
        [-0.044, 0.65],
        [0.044, 0.65],
        [0.059, 0.23],
      ],
      0.009,
      [0, 0, side * 0.085],
      [],
      0.008,
    );
  }
  const cable = new CatmullRomCurve3([
    new Vector3(0.11, 0.12, -0.13),
    new Vector3(0.14, 0.28, -0.15),
    new Vector3(0.105, 0.53, -0.13),
    new Vector3(0.06, 0.74, -0.1),
  ]);
  add("upper", "seal", new TubeGeometry(cable, 20, 0.013, 6, false));

  // Offset elbow gearbox, slim forearm tube and its clamped collars.
  joint("forearm", 0.145, 0.25);
  profile(
    "forearm",
    "casting",
    [
      [-0.14, -0.035],
      [0.14, -0.035],
      [0.145, 0.18],
      [0.085, 0.27],
      [-0.085, 0.27],
      [-0.145, 0.18],
    ],
    0.23,
    [0, 0, 0],
    [],
    0.02,
  );
  profile(
    "forearm",
    "cover",
    [
      [-0.09, 0.09],
      [0.09, 0.09],
      [0.065, 0.22],
      [-0.065, 0.22],
    ],
    0.008,
    [0, 0, 0.138],
    [],
    0.006,
  );
  cylinder("forearm", "casting", [0, 0.43, 0], 0.058, 0.43, [0, 1, 0], 0.075);
  for (const y of [0.26, 0.58]) {
    cylinder("forearm", "cover", [0, y, 0], 0.083, 0.044);
    ring("forearm", "seal", [0, y + 0.025, 0], 0.069, 0.007, [0, 1, 0]);
  }

  // Compact wrist pitch joint, tool roll bearing and bolted tool flange.
  joint("wrist", 0.103, 0.18);
  profile(
    "wrist",
    "casting",
    [
      [-0.095, -0.02],
      [0.095, -0.02],
      [0.08, 0.18],
      [-0.08, 0.18],
    ],
    0.14,
    [0, 0, 0],
    [],
    0.016,
  );
  cylinder("wrist", "casting", [0, 0.17, 0], 0.098, 0.07);
  cylinder("tool", "seal", [0, 0.005, 0], 0.092, 0.032);
  cylinder("tool", "cover", [0, 0.035, 0], 0.097, 0.025);
  cylinder("tool", "steel", [0, 0.062, 0], 0.105, 0.02);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    cylinder(
      "tool",
      "casting",
      [Math.sin(a) * 0.078, 0.078, Math.cos(a) * 0.078],
      0.012,
      0.013,
      [0, 1, 0],
      0.012,
      6,
    );
  }
  box("tool", "casting", [0, 0.112, 0], [0.235, 0.065, 0.13]);
  box("tool", "seal", [0, 0.149, 0], [0.19, 0.012, 0.085]);
  cylinder("tool", "steel", [0, 0.146, 0.055], 0.012, 0.22, [1, 0, 0]);
  for (let i = -4; i <= 4; i++)
    ring("tool", "cover", [i * 0.022, 0.146, 0.055], 0.013, 0.003, [1, 0, 0]);

  // Mirrored machined jaws, including actual open slots and inward-facing grip pads.
  for (const side of [-1, 1]) {
    const name = `jaw${side}`;
    const mirror = (points) => points.map(([x, y]) => [x * side, y]);
    box(name, "steel", [side * 0.08, 0.009, 0], [0.073, 0.025, 0.085]);
    profile(
      name,
      "casting",
      mirror([
        [0.064, 0.015],
        [0.105, 0.015],
        [0.163, 0.205],
        [0.145, 0.25],
        [0.065, 0.25],
        [0.065, 0.205],
        [0.111, 0.205],
      ]),
      0.043,
      [0, 0, 0],
      [
        mirror([
          [0.084, 0.06],
          [0.104, 0.055],
          [0.136, 0.165],
          [0.116, 0.17],
        ]),
      ],
      0.003,
    );
    box(name, "seal", [side * 0.063, 0.226, 0], [0.02, 0.047, 0.055]);
    cylinder(name, "steel", [side * 0.083, 0.038, 0.027], 0.009, 0.01, [0, 0, 1], 0.009, 6);
  }

  // Merge each rigid link by finish: hardware detail does not require a draw per bolt.
  const materials = Object.fromEntries(
    Object.entries(FINISHES).map(([name, properties]) => [
      name,
      new MeshStandardMaterial(properties),
    ]),
  );
  const parts = Object.fromEntries(
    [...pieces].map(([part, finishes]) => [
      part,
      [...finishes].map(([finish, geometries]) => {
        const geometry = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        geometry.computeBoundingSphere();
        return { geometry, material: materials[finish], finish };
      }),
    ]),
  );
  return { parts, materials };
}

function Part({ resources, name }) {
  return (
    <group name={`Arm ${name}`}>
      {resources.parts[name].map(({ geometry, material, finish }) => (
        <mesh key={finish} geometry={geometry} material={material} />
      ))}
    </group>
  );
}

function Arm({ side, resources }) {
  const shoulder = -side * 0.1,
    elbow = -side * 0.5,
    wrist = side * 0.16,
    toolRoll = side < 0 ? 0.65 : 0.25;
  return (
    <group
      position={[side * 0.55, 0, -0.56 + side * 0.025]}
      name={side < 0 ? "Left manipulator" : "Right manipulator"}
    >
      <Part resources={resources} name="base" />
      <group
        position={[0, 0.24, 0]}
        rotation={[0, side * 0.14, 0]}
        userData={{ actuator: "baseYaw", side, rest: side * 0.14 }}
      >
        <Part resources={resources} name="turret" />
        <group
          position={[0, 0.17, 0]}
          rotation={[0, 0, shoulder]}
          userData={{ actuator: "shoulder", side, rest: shoulder }}
        >
          <Part resources={resources} name="upper" />
          <group
            position={[0, 0.78, 0]}
            rotation={[0, 0, elbow]}
            userData={{ actuator: "elbow", side, rest: elbow }}
          >
            <Part resources={resources} name="forearm" />
            <group
              position={[0, 0.65, 0]}
              rotation={[0, 0, wrist]}
              userData={{ actuator: "wrist", side, rest: wrist }}
            >
              <Part resources={resources} name="wrist" />
              <group
                position={[0, 0.21, 0]}
                rotation={[0, toolRoll, 0]}
                userData={{ actuator: "toolRoll", side, rest: toolRoll }}
              >
                <Part resources={resources} name="tool" />
                <group position={[0, 0.16, 0]}>
                  {[-1, 1].map((jaw) => (
                    <group key={jaw} userData={{ actuator: "gripper", side: jaw, armSide: side }}>
                      <Part resources={resources} name={`jaw${jaw}`} />
                    </group>
                  ))}
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function Arms() {
  const resources = useMemo(buildParts, []);
  useEffect(
    () => () => {
      Object.values(resources.parts)
        .flat()
        .forEach(({ geometry }) => geometry.dispose());
      Object.values(resources.materials).forEach((material) => material.dispose());
    },
    [resources],
  );
  return (
    <group name="Twin articulated arms" dispose={null}>
      <Arm side={-1} resources={resources} />
      <Arm side={1} resources={resources} />
    </group>
  );
}
