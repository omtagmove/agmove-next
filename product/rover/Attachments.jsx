/** Original lightweight implement geometry, with articulated working joints. */
import React, { useMemo } from "react";
import {
  Vector3,
  Quaternion,
  CurvePath,
  LineCurve3,
  QuadraticBezierCurve3,
  TubeGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Hitch } from "./Hitch.jsx";
import Cargo from "./Cargo.jsx";
import { Arms } from "./Arms.jsx";

const colors = {
  metal: "#353b40",
  edge: "#697278",
  silver: "#bec5ca",
  tank: "#e4e5df",
  rubber: "#15191c",
  blue: "#1451a4",
};
function Material({
  color = colors.metal,
  metalness = color === colors.rubber ? 0.05 : 0.4,
  roughness = color === colors.rubber ? 0.85 : 0.42,
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />;
}
function Block({ at = [0, 0, 0], size = [1, 1, 1], color, radius = 0, rotation, ...props }) {
  const geometry = useMemo(
    () => (radius ? new RoundedBoxGeometry(...size, 2, radius) : null),
    [...size, radius],
  );
  return (
    <mesh position={at} rotation={rotation} geometry={geometry ?? undefined} {...props}>
      {!geometry && <boxGeometry args={size} />}
      <Material color={color} />
    </mesh>
  );
}
function Tube({ from, to, r = 0.035, color = colors.metal, rectangular = false }) {
  const { pos, q, length } = useMemo(() => {
    const a = new Vector3(...from),
      b = new Vector3(...to),
      d = b.clone().sub(a);
    return {
      pos: a.add(b).multiplyScalar(0.5),
      q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()),
      length: d.length(),
    };
  }, [...from, ...to]);
  return (
    <mesh position={pos} quaternion={q}>
      {rectangular ? (
        <boxGeometry args={[r * 2, length, r * 2]} />
      ) : (
        <cylinderGeometry args={[r, r, length, 12]} />
      )}
      <Material color={color} />
    </mesh>
  );
}
function CurvedRail({ x, front, back }) {
  const geometry = useMemo(() => {
    const path = new CurvePath();
    const a = new Vector3(x, 0.08, front),
      b = new Vector3(x, 0.27, front),
      c = new Vector3(x, 0.46, front - 0.19),
      d = new Vector3(x, 0.46, back + 0.19),
      e = new Vector3(x, 0.27, back),
      f = new Vector3(x, 0.08, back);
    path.add(new LineCurve3(a, b));
    path.add(new QuadraticBezierCurve3(b, new Vector3(x, 0.46, front), c));
    path.add(new LineCurve3(c, d));
    path.add(new QuadraticBezierCurve3(d, new Vector3(x, 0.46, back), e));
    path.add(new LineCurve3(e, f));
    return new TubeGeometry(path, 32, 0.034, 8, false);
  }, [x, front, back]);
  return (
    <mesh geometry={geometry}>
      <Material />
    </mesh>
  );
}
function Cylinder({ at, r, h, color, rotation, bottom = r, segments = 32 }) {
  return (
    <mesh position={at} rotation={rotation}>
      <cylinderGeometry args={[r, bottom, h, segments]} />
      <Material color={color} />
    </mesh>
  );
}
function Ring({ at, r, tube = 0.035, color, rotation }) {
  return (
    <mesh position={at} rotation={rotation}>
      <torusGeometry args={[r, tube, 10, 48]} />
      <Material color={color} />
    </mesh>
  );
}
function Plate({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <Block at={[0, 0.025, 0]} size={[0.34, 0.05, 0.32]} color={colors.silver} />
      {[-0.115, 0.115].flatMap((a) =>
        [-0.105, 0.105].map((b) => (
          <Cylinder
            key={`${a}-${b}`}
            at={[a, 0.06, b]}
            r={0.025}
            h={0.025}
            color={colors.edge}
            segments={6}
          />
        )),
      )}
    </group>
  );
}
function Sprayer() {
  return (
    <group name="Tank and rear air-blast fan">
      <Block at={[0, 0.49, 0.16]} size={[1.52, 0.98, 1.62]} radius={0.13} color={colors.tank} />
      <Block at={[0, 0.99, 0.3]} size={[0.72, 0.025, 0.73]} color={colors.silver} />
      <Cylinder at={[0, 1.04, 0.3]} r={0.24} h={0.045} color={colors.silver} />
      <Block at={[0, 1.075, 0.3]} size={[0.2, 0.025, 0.04]} color={colors.edge} />
      <Cylinder at={[0.46, 1.06, 0.65]} r={0.085} h={0.08} />
      <Block at={[0, 0.36, -0.84]} size={[0.68, 0.66, 0.63]} radius={0.06} />
      {[-1, 1].flatMap((side) =>
        [0.28, 0.4, 0.52].map((y) => (
          <Block
            key={`${side}-${y}`}
            at={[side * 0.345, y, -0.84]}
            size={[0.018, 0.035, 0.35]}
            color={colors.rubber}
          />
        )),
      )}
      <group position={[0, 0.96, -1.24]} rotation={[Math.PI / 2, 0, 0]}>
        <Cylinder at={[0, 0, 0]} r={0.76} h={0.28} color={colors.silver} />
        <Ring
          at={[0, 0.13, 0]}
          r={0.73}
          tube={0.075}
          color={colors.silver}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Ring
          at={[0, -0.13, 0]}
          r={0.73}
          tube={0.075}
          color={colors.silver}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Cylinder at={[0, 0.151, 0]} r={0.67} h={0.025} color={colors.rubber} />
        <Cylinder at={[0, -0.151, 0]} r={0.67} h={0.025} color={colors.rubber} />
        <Cylinder at={[0, -0.18, 0]} r={0.16} h={0.04} color={colors.edge} />
        {[0.28, 0.43, 0.57, 0.71].map((r) => (
          <Ring
            key={`rear-${r}`}
            at={[0, -0.19, 0]}
            r={r}
            tube={r === 0.71 ? 0.04 : 0.009}
            color={colors.silver}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <Tube
              key={`rear-spoke-${i}`}
              from={[0, -0.2, 0]}
              to={[Math.sin(a) * 0.65, -0.2, Math.cos(a) * 0.65]}
              r={0.012}
              color={colors.edge}
            />
          );
        })}

        <Ring
          at={[0, 0.19, 0]}
          r={0.71}
          tube={0.045}
          color={colors.silver}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Cylinder at={[0, 0.2, 0]} r={0.16} h={0.06} color={colors.edge} />
        <group userData={{ actuator: "fan" }}>
          {Array.from({ length: 12 }, (_, i) => (
            <group key={i} rotation={[0, (i * Math.PI) / 6, 0]}>
              <Block
                at={[0, 0.18, 0.39]}
                size={[0.11, 0.035, 0.49]}
                color={colors.edge}
                rotation={[0, 0.35, 0]}
              />
            </group>
          ))}
        </group>
        {[0.28, 0.43, 0.57].map((r) => (
          <Ring
            key={r}
            at={[0, 0.23, 0]}
            r={r}
            tube={0.009}
            color={colors.silver}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <Tube
              key={i}
              from={[0, 0.24, 0]}
              to={[Math.sin(a) * 0.65, 0.24, Math.cos(a) * 0.65]}
              r={0.009}
              color={colors.silver}
            />
          );
        })}
      </group>
      {[-0.55, 0.55].map((x) => (
        <Block key={x} at={[x, 0.025, 0]} size={[0.08, 0.05, 1.6]} color={colors.edge} />
      ))}
    </group>
  );
}
function Tray() {
  const w = 0.94,
    front = 0.9,
    back = -1.75;
  return (
    <group name="Cargo tray and guard rails">
      {[-w, w].map((x) => (
        <group key={x}>
          <Block at={[x, 0.06, (front + back) / 2]} size={[0.06, 0.12, front - back]} />
          <CurvedRail x={x} front={front} back={back} />
        </group>
      ))}
      {[back, -1.22, -0.69, -0.16, 0.37, front].map((z) => (
        <Block key={z} at={[0, 0.07, z]} size={[w * 2, 0.08, 0.055]} />
      ))}
      {[back, front].map((z) => (
        <Block key={z} at={[0, 0.06, z]} size={[w * 2, 0.12, 0.06]} />
      ))}
      {[-0.6, 0.6].flatMap((x) => [-0.9, 0.66].map((z) => <Plate key={`${x}-${z}`} x={x} z={z} />))}
    </group>
  );
}
function Trolley() {
  // The reference has a rectangular steel bed, square upper rails and a short A-frame drawbar.
  const front = -0.88,
    back = -3.5,
    middle = (front + back) / 2;
  return (
    <group name="Cargo trolley and towbar">
      <Tube from={[0, 0.77, 0]} to={[0, 0.77, -1.1]} r={0.065} rectangular />
      <Ring
        at={[0, 0.77, 0]}
        r={0.09}
        tube={0.025}
        color={colors.silver}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {[-0.97, 0.97].map((x) => (
        <Tube key={x} from={[0, 0.77, -0.25]} to={[x, 0.77, -1.15]} r={0.055} rectangular />
      ))}
      <Block at={[0, 0.9, middle]} size={[2.02, 0.12, front - back]} />
      {[-1, 1].map((x) => (
        <group key={x}>
          <Block at={[x, 1.37, middle]} size={[0.045, 0.82, front - back]} />
          {[0.9, 1.77, 2.03].map((y) => (
            <Block
              key={y}
              at={[x, y, middle]}
              size={[0.055, 0.055, front - back + 0.06]}
              color={colors.edge}
            />
          ))}
          {[front, -1.75, -2.63, back].map((z) => (
            <Block key={z} at={[x, 1.46, z]} size={[0.055, 1.14, 0.055]} color={colors.edge} />
          ))}
          <Block at={[x, 0.69, -2.4]} size={[0.1, 0.06, 1.1]} />
          <Block at={[x, 0.64, -2.4]} size={[0.1, 0.04, 0.8]} />
        </group>
      ))}
      {[front, back].map((z) => (
        <group key={z}>
          <Block at={[0, 1.37, z]} size={[2, 0.82, 0.045]} />
          {[0.9, 1.77, 2.03].map((y) => (
            <Block key={y} at={[0, y, z]} size={[2.05, 0.055, 0.055]} color={colors.edge} />
          ))}
          {[-0.65, 0.65].map((x) => (
            <Block key={x} at={[x, 1.13, z]} size={[0.055, 0.49, 0.07]} color={colors.edge} />
          ))}
        </group>
      ))}
      <Cargo />
      <Tube from={[-1.18, 0.48, -2.4]} to={[1.18, 0.48, -2.4]} r={0.075} />
      {[-1.12, 1.12].map((x) => (
        <group key={x} position={[x, 0.48, -2.4]} rotation={[0, 0, Math.PI / 2]}>
          <group userData={{ wheel: true, radius: 0.48, axis: "y", direction: -1 }}>
            <Cylinder at={[0, 0, 0]} r={0.46} h={0.27} color={colors.rubber} />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return (
                <Block
                  key={i}
                  at={[Math.sin(a) * 0.46, 0, Math.cos(a) * 0.46]}
                  size={[0.16, 0.28, 0.045]}
                  rotation={[0, a, 0]}
                  color={colors.rubber}
                />
              );
            })}
            <Cylinder at={[0, -Math.sign(x) * 0.145, 0]} r={0.25} h={0.025} color={colors.edge} />
            <Cylinder at={[0, -Math.sign(x) * 0.165, 0]} r={0.1} h={0.04} color={colors.silver} />
          </group>
        </group>
      ))}
    </group>
  );
}
export const ATTACHMENTS = [Arms, Sprayer, Hitch, Trolley, Tray];
