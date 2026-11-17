"use client";
import React, {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, CanvasTexture, Color, Vector3 } from "three";
import { ATTACHMENTS } from "./Attachments.jsx";
import { sampleFlow, MOUNTS } from "./flow.js";
import { STAGES } from "./stages.js";
import FarmWorld from "./FarmWorld.jsx";
import WorkActions from "./WorkActions.jsx";

class ModelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onSource("illustration");
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function PlaceholderRover() {
  return (
    <group name="Illustrative rover">
      <mesh name="Box chassis" position={[0, 0.8, 0]}>
        <boxGeometry args={[1.55, 0.45, 2.35]} />
        <meshStandardMaterial color="#dce4ec" metalness={0.5} roughness={0.48} />
      </mesh>
      <mesh name="Electric platform" position={[0, 0.52, 0]}>
        <boxGeometry args={[1.25, 0.18, 2.1]} />
        <meshStandardMaterial color="#1451a4" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group
            key={`${x}-${z}`}
            position={[x * 0.93, 0.4, z * 0.85]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <group userData={{ wheel: true, axis: "y", direction: -1, radius: 0.4 }}>
              <mesh name={`Wheel ${x}-${z}`}>
                <cylinderGeometry args={[0.4, 0.4, 0.32, 24]} />
                <meshStandardMaterial color="#171c25" roughness={0.95} />
              </mesh>
              <mesh position={[0, x * 0.17, 0]}>
                <cylinderGeometry args={[0.19, 0.19, 0.025, 16]} />
                <meshStandardMaterial color="#8e9cac" metalness={0.65} roughness={0.3} />
              </mesh>
            </group>
          </group>
        )),
      )}
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * 0.58, 1.55, -0.9]}>
          <boxGeometry args={[0.08, 1.4, 0.08]} />
          <meshStandardMaterial color="#243143" metalness={0.5} />
        </mesh>
      ))}
      <mesh name="Sensor crossbar" position={[0, 2.22, -0.9]}>
        <boxGeometry args={[1.26, 0.1, 0.12]} />
        <meshStandardMaterial color="#27364c" />
      </mesh>
      <mesh position={[0, 2.32, -0.9]}>
        <cylinderGeometry args={[0.13, 0.13, 0.13, 16]} />
        <meshStandardMaterial color="#8eb6ed" emissive="#1451a4" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function disposeModel(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
}
function RealRover({ url, onSource, motion }) {
  const [scene, setScene] = useState(null);
  useEffect(() => {
    let alive = true,
      loaded = null;
    // An explicit error callback keeps corrupt/missing models out of the global error channel.
    // No remote Draco/Meshopt decoder or external environment is requested.
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      url,
      (gltf) => {
        if (!alive) {
          disposeModel(gltf.scene);
          return;
        }
        loaded = gltf.scene;
        let hasMesh = false;
        loaded.traverse((object) => {
          if (object.isMesh) hasMesh = true;
        });
        if (!hasMesh) {
          onSource("illustration");
          return;
        }
        setScene(loaded);
        onSource("model");
      },
      undefined,
      () => {
        if (alive) {
          setScene(null);
          onSource("illustration");
        }
      },
    );
    return () => {
      alive = false;
      if (loaded) disposeModel(loaded);
    };
  }, [url, onSource]);
  const normalized = useMemo(() => {
    if (!scene) return null;
    const clone = scene.clone(true),
      bounds = new Box3().setFromObject(clone);
    const size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = 3.9 / Math.max(size.x, size.y, size.z, 0.001);
    const wheels = [];
    clone.traverse((object) => {
      if (/^Wheel_(Front|Rear)_(Left|Right)$/.test(object.name)) {
        const extent = new Box3().setFromObject(object).getSize(new Vector3());
        object.userData.wheel = true;
        object.userData.axis = "x";
        object.userData.direction = 1;
        object.userData.radius = Math.max(0.1, (extent.y * scale) / 2);
        wheels.push(object);
      }
    });
    return { clone, center, bottom: bounds.min.y, scale, wheels };
  }, [scene]);
  useFrame(() => {
    const { distance } = sampleFlow(motion.current.progress);
    normalized?.wheels.forEach((wheel) => {
      wheel.rotation.x = distance / wheel.userData.radius;
    });
  });
  if (!normalized) return <PlaceholderRover />;
  const { clone, center, bottom, scale } = normalized;
  return (
    <group scale={scale}>
      <primitive object={clone} dispose={null} position={[-center.x, -bottom, -center.z]} />
    </group>
  );
}

function RoverContactShadow({ position = [0, -0.005, 0], size = [3.9, 3.9] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const spot = (x, y, radius, opacity) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${opacity})`);
      gradient.addColorStop(0.35, `rgba(0,0,0,${opacity * 0.7})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    spot(128, 128, 105, 0.65);
    for (const x of [67, 189]) for (const y of [72, 184]) spot(x, y, 36, 0.65);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh name="Soft rover contact shadow" position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const LIGHT = [
  ["#142637", "#73878a", "#e6c691", "#ffe3b8"],
  ["#183345", "#839b9b", "#dfd8b8", "#f1f1df"],
  ["#203b50", "#9aafb0", "#e1e8d7", "#e7eff5"],
  ["#1d3042", "#8b9291", "#d8b68d", "#f3d9b8"],
  ["#122234", "#617888", "#bdab97", "#c0d6ed"],
];
function Scene({ assets, motion, eventTarget, onReady, onFailure, onSource }) {
  const rover = useRef(null),
    layout = useRef(null),
    attachments = useRef([]),
    materials = useRef([]),
    actuators = useRef([]),
    wheels = useRef([]);
  const rendered = useRef({ ...sampleFlow(0), progress: 0 });
  const worldReview = useRef(null),
    actionReview = useRef(null),
    sun = useRef(null);
  const direction = useMemo(() => new Vector3(6, 3.6, 9).normalize(), []);
  const target = useMemo(() => new Vector3(), []),
    tint = useMemo(() => new Color(), []);
  const palettes = useMemo(() => LIGHT.map((row) => row.map((c) => new Color(c))), []);
  const slow = useRef({ frames: 0, total: 0 });
  const { invalidate, gl, camera, size } = useThree();
  const [modelSettled, setModelSettled] = useState(!assets.model);
  const shown = useRef(false);
  useEffect(() => {
    if (modelSettled) invalidate();
  }, [modelSettled, invalidate]);
  const modelSource = useCallback(
    (value) => {
      onSource(value);
      setModelSettled(true);
    },
    [onSource],
  );
  useEffect(() => {
    actuators.current = [];
    wheels.current = [];
    materials.current = attachments.current.map((group, index) => {
      const list = [];
      group.traverse((object) => {
        if (object.isMesh) {
          object.material.transparent = true;
          list.push(object.material);
        }
        if (object.userData.actuator) actuators.current.push({ object, index });
      });
      return list;
    });
    rover.current.traverse((object) => {
      if (object.userData.wheel) wheels.current.push(object);
    });
    const host = eventTarget.current;
    if (new URLSearchParams(location.search).has("rover-review")) {
      host.__roverReview = () => {
        const wheelState = [];
        let cargoCount = 0;
        rover.current.traverseVisible((object) => {
          cargoCount += object.userData.cargoCount || 0;
        });
        rover.current.traverse((object) => {
          if (object.userData.wheel)
            wheelState.push({
              name: object.name,
              axis: object.userData.axis,
              angle: object.rotation[object.userData.axis],
            });
        });
        // Project visible geometry only (Box3.setFromObject also includes hidden tools).
        rover.current.updateWorldMatrix(true, true);
        const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
        const point = new Vector3();
        rover.current.traverseVisible((object) => {
          if (!object.isMesh || object.name.includes("shadow")) return;
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
          const box = object.geometry.boundingBox;
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z]) {
                point.set(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
                bounds.left = Math.min(bounds.left, ((point.x + 1) * size.width) / 2);
                bounds.right = Math.max(bounds.right, ((point.x + 1) * size.width) / 2);
                bounds.top = Math.min(bounds.top, ((1 - point.y) * size.height) / 2);
                bounds.bottom = Math.max(bounds.bottom, ((1 - point.y) * size.height) / 2);
              }
        });
        // Fixed chassis reference points exclude the rotating tyre tread bounds.
        const leftAnchor = new Vector3(-0.8, 1.2, 0)
          .applyMatrix4(layout.current.matrixWorld)
          .project(camera);
        const rightAnchor = new Vector3(0.8, 1.2, 0)
          .applyMatrix4(layout.current.matrixWorld)
          .project(camera);
        return {
          ...rendered.current,
          bounds,
          chassisSpan: (Math.abs(rightAnchor.x - leftAnchor.x) * size.width) / 2,
          cameraPosition: camera.position.toArray(),
          cameraFov: camera.fov,
          cameraZoom: camera.zoom,
          framingOffset: camera.view.offsetX,
          rotation: rover.current.rotation.y,
          bodyPosition: rover.current.position.toArray(),
          bodyRoll: rover.current.rotation.z,
          wheels: wheelState,
          cargoCount,
          backgroundBlend: [...host.querySelectorAll(".rover-farm-photo")]
            .map((image) => ({
              scene: Number(image.dataset.scene),
              opacity: Number(getComputedStyle(image).opacity),
            }))
            .filter((image) => image.opacity > 0),
          world: worldReview.current,
          backgroundTransform: getComputedStyle(host.querySelector(".rover-farm-photo")).transform,
          actions: actionReview.current,
          joints: actuators.current.map(({ object, index }) => ({
            index,
            role: object.userData.actuator,
            side: object.userData.side,
            position: object.position.toArray(),
            rotation: object.rotation.toArray().slice(0, 3),
          })),
          attachments: attachments.current.map((g, i) => ({
            name: g.name,
            visible: g.visible,
            position: g.position.toArray(),
            mount: MOUNTS[STAGES[i].implement],
            parent: g.parent.name,
            meshes: materials.current[i].length,
          })),
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
        };
      };
    }
    invalidate();
    return () => {
      if (host) delete host.__roverReview;
    };
  }, [eventTarget, gl, invalidate, motion, modelSettled, camera, size]);
  useEffect(() => {
    const node = eventTarget.current,
      requestRender = () => invalidate();
    node?.addEventListener("rover-invalidate", requestRender);
    const lost = (event) => {
      event.preventDefault();
      onFailure();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    invalidate();
    return () => {
      node?.removeEventListener("rover-invalidate", requestRender);
      gl.domElement.removeEventListener("webglcontextlost", lost);
    };
  }, [gl, eventTarget, invalidate, onFailure]);
  useFrame((_, delta) => {
    if (modelSettled && !shown.current) {
      shown.current = true;
      requestAnimationFrame(onReady);
    }
    const f = sampleFlow(motion.current.progress);
    rendered.current = { ...f, progress: motion.current.progress };
    rover.current.rotation.set(f.moving * Math.sin(f.distance * 2.1) * 0.004, f.heading, f.roll);
    rover.current.position.set(f.moving * Math.sin(f.distance * 0.2) * 0.12, f.bounce, 0);
    wheels.current.forEach((wheel) => {
      wheel.rotation[wheel.userData.axis] =
        (f.distance / wheel.userData.radius) * wheel.userData.direction;
    });
    attachments.current.forEach((group, i) => {
      group.visible = i === f.index && f.visible;
      const kind = STAGES[i].implement;
      group.position.set(...MOUNTS[kind]);
      if (!group.visible) return;
      if (kind === "trolley") group.position.z -= (1 - f.dock) * 3.4;
      else {
        group.position.y += (1 - f.dock) * 1.6;
        group.position.x += (1 - f.dock) * 1.3;
      }
      materials.current[i]?.forEach((m) => {
        m.opacity = f.opacity;
      });
    });
    actuators.current.forEach(({ object, index }) => {
      const phase = index === f.index ? f.actionProgress : 0,
        side = object.userData.side || 1,
        armSide = object.userData.armSide || side,
        rest = object.userData.rest || 0;
      // A slight offset between arms avoids perfectly mirrored motion. Every
      // hinge rotates around its visible pin; the jaws slide along their guide.
      const reachPhase = Math.max(
        0,
        Math.min(1, (phase - (armSide > 0 ? 0.06 : 0)) / (armSide > 0 ? 0.94 : 1)),
      );
      const reach = Math.sin(Math.PI * reachPhase) ** 2;
      const gripPhase = Math.max(0, Math.min(1, (reachPhase - 0.18) / 0.66));
      const grip = Math.sin(Math.PI * gripPhase) ** 2;
      switch (object.userData.actuator) {
        case "baseYaw":
          object.rotation.y = rest + side * 0.09 * reach;
          break;
        case "shoulder":
          object.rotation.z = rest - side * 0.17 * reach;
          break;
        case "elbow":
          object.rotation.z = rest + side * 0.18 * reach;
          break;
        case "wrist":
          object.rotation.z = rest - side * 0.12 * reach;
          break;
        case "toolRoll":
          object.rotation.y = rest + side * 0.2 * reach;
          break;
        case "gripper":
          object.position.x = -side * 0.038 * grip;
          break;
        case "fan":
          object.rotation.y = phase * Math.PI * 12;
          break;
      }
    });
    const trailer = f.index === 3 ? f.dock : 0;
    // Keep the same camera distance and rover scale for every implement.
    // A lateral framing offset makes room for the trailer without moving the
    // assembly toward/away from the camera or zooming the whole robot out.
    const radius = 2.25,
      height = 3.3;
    const vertical = Math.tan((camera.fov * Math.PI) / 360) * 0.8;
    const horizontal = (vertical * size.width * 0.64) / Math.max(size.height, 1);
    const distance = Math.max(
      radius / horizontal + radius * 0.5,
      (height * 0.65) / vertical + radius * 0.55,
    );
    target.set(0, height * 0.47, 0);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.setViewOffset(
      size.width,
      size.height,
      size.width * (0.17 + trailer * 0.075),
      0,
      size.width,
      size.height,
    );
    camera.updateMatrixWorld();
    const day = Math.min(3.9999, motion.current.progress * 4),
      part = Math.floor(day),
      mix = day - part;
    const host = eventTarget.current;
    ["--farm-sky-top", "--farm-sky-horizon", "--farm-sun"].forEach((property, i) => {
      tint.copy(palettes[part][i]).lerp(palettes[part + 1][i], mix);
      host.style.setProperty(property, tint.getStyle());
    });
    // Crossfade only while travelling between stops. The same scroll position
    // produces the same image blend in either direction, including fast jumps.
    for (let i = 0; i < STAGES.length; i++) {
      const t = Math.max(
        0,
        Math.min(1, (motion.current.progress * STAGES.length - i + 0.12) / 0.24),
      );
      host.style.setProperty(`--farm-scene-${i}`, String(i === 0 ? 1 : t * t * (3 - 2 * t)));
    }
    sun.current.color.copy(palettes[part][3]).lerp(palettes[part + 1][3], mix);
    host.style.setProperty("--farm-photo-shift", `${f.distance * 0.8}px`);
    host.style.setProperty("--farm-photo-rise", `${-f.distance * 0.25}px`);
    if (delta > 0.015 && delta < 0.2) {
      slow.current.frames++;
      slow.current.total += delta;
    }
    if (slow.current.frames >= 90) {
      if (slow.current.total / slow.current.frames > 0.055) onFailure();
      slow.current = { frames: 0, total: 0 };
    }
  });
  const placeholder = <PlaceholderRover />;
  return (
    <>
      <fog attach="fog" args={["#4b6465", 25, 90]} />
      <ambientLight intensity={0.95} />
      <hemisphereLight args={["#d8e8f0", "#39432d", 2]} />
      <directionalLight ref={sun} position={[4, 7, 5]} intensity={2.6} />
      <directionalLight position={[-4, 3, -2]} color="#8eb6ed" intensity={1.2} />
      <FarmWorld motion={motion} review={worldReview} />
      <group ref={rover} name="Travelling rover assembly">
        <group ref={layout} name="Rover mounting frame">
          {assets.model ? (
            <ModelBoundary key={assets.model} onSource={modelSource} fallback={placeholder}>
              <Suspense fallback={placeholder}>
                <RealRover url={assets.model} onSource={modelSource} motion={motion} />
              </Suspense>
            </ModelBoundary>
          ) : (
            placeholder
          )}
          {ATTACHMENTS.map((Attachment, i) => (
            <group
              key={STAGES[i].implement}
              name={`Attachment_${STAGES[i].implement}`}
              ref={(node) => {
                attachments.current[i] = node;
              }}
              visible={false}
            >
              <Attachment />
              {i === 3 && <RoverContactShadow position={[0, -0.005, -2.4]} size={[3, 3.6]} />}
            </group>
          ))}
          <WorkActions motion={motion} review={actionReview} />
          <RoverContactShadow />
        </group>
      </group>
    </>
  );
}
export default function RoverCanvas(props) {
  return (
    <Canvas
      className="rover-canvas"
      frameloop="demand"
      dpr={[1, 1.25]}
      camera={{ position: [6, 3.6, 9], fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      fallback={<span className="rover-native-fallback">3D is unavailable on this device.</span>}
    >
      <Scene {...props} />
    </Canvas>
  );
}
