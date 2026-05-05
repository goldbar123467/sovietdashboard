import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import type { Object3D } from "three";
import type { PetMode } from "./petLogic";

interface SovietPetSceneProps {
  mode: PetMode;
  onInteract: () => void;
}

function createStarGeometry() {
  const shape = new Shape();
  const points = 10;
  for (let index = 0; index <= points; index += 1) {
    const radius = index % 2 === 0 ? 1 : 0.43;
    const angle = -Math.PI / 2 + (index / points) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  return new ShapeGeometry(shape);
}

function disposeObject(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

export function SovietPetScene({ mode, onInteract }: SovietPetSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const interactRef = useRef(onInteract);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    interactRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.62, 4.95);

    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("data-testid", "soviet-pet-canvas");
    renderer.domElement.setAttribute("aria-label", "Tovarish Byte 3D pet");
    host.appendChild(renderer.domElement);

    const ambient = new AmbientLight(0xffead0, 0.65);
    const key = new DirectionalLight(0xffcf6e, 2.1);
    key.position.set(3.6, 5, 4);
    const rim = new PointLight(0xc41e1e, 6, 9);
    rim.position.set(-2.4, 0.2, 2.2);
    scene.add(ambient, key, rim);

    const bodyMaterial = new MeshStandardMaterial({
      color: 0x060407,
      metalness: 0.5,
      roughness: 0.32,
    });
    const redMaterial = new MeshStandardMaterial({
      color: 0xc41e1e,
      emissive: 0x4c0606,
      emissiveIntensity: 0.85,
      metalness: 0.28,
      roughness: 0.38,
    });
    const goldMaterial = new MeshStandardMaterial({
      color: 0xd4a843,
      emissive: 0x3a2700,
      emissiveIntensity: 0.45,
      metalness: 0.42,
      roughness: 0.28,
    });
    const glassMaterial = new MeshStandardMaterial({
      color: 0x76d17c,
      emissive: 0x50ff65,
      emissiveIntensity: 1.45,
      metalness: 0,
      roughness: 0.12,
    });

    const pet = new Group();
    pet.scale.setScalar(1.08);
    scene.add(pet);

    const base = new Mesh(new TorusGeometry(0.9, 0.035, 12, 96), redMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.y = -1.0;
    pet.add(base);

    const body = new Mesh(new BoxGeometry(1.28, 1.05, 0.72), bodyMaterial);
    body.position.y = -0.32;
    pet.add(body);

    const chestStar = new Mesh(createStarGeometry(), redMaterial);
    chestStar.scale.set(0.24, 0.24, 0.24);
    chestStar.position.set(0, -0.3, 0.373);
    pet.add(chestStar);

    const head = new Mesh(new SphereGeometry(0.47, 32, 18), bodyMaterial);
    head.scale.set(1.0, 0.78, 0.92);
    head.position.y = 0.45;
    pet.add(head);

    const hat = new Mesh(new CylinderGeometry(0.58, 0.45, 0.32, 32), redMaterial);
    hat.position.y = 0.9;
    pet.add(hat);

    const hatBand = new Mesh(new TorusGeometry(0.47, 0.035, 8, 48), goldMaterial);
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.y = 0.76;
    pet.add(hatBand);

    const foreheadStar = new Mesh(createStarGeometry(), goldMaterial);
    foreheadStar.scale.set(0.1, 0.1, 0.1);
    foreheadStar.position.set(0, 0.77, 0.43);
    pet.add(foreheadStar);

    const leftEar = new Mesh(new BoxGeometry(0.18, 0.45, 0.18), redMaterial);
    leftEar.position.set(-0.55, 0.42, 0);
    leftEar.rotation.z = 0.18;
    const rightEar = leftEar.clone();
    rightEar.position.x = 0.55;
    rightEar.rotation.z = -0.18;
    pet.add(leftEar, rightEar);

    const leftEye = new Mesh(new SphereGeometry(0.06, 16, 10), glassMaterial);
    leftEye.position.set(-0.17, 0.46, 0.4);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.17;
    pet.add(leftEye, rightEye);

    const antenna = new Group();
    const mast = new Mesh(new CylinderGeometry(0.015, 0.015, 0.52, 10), goldMaterial);
    mast.position.y = 1.3;
    const signal = new Mesh(new SphereGeometry(0.07, 14, 10), redMaterial);
    signal.position.y = 1.6;
    antenna.add(mast, signal);
    pet.add(antenna);

    const leftArm = new Mesh(new BoxGeometry(0.16, 0.58, 0.16), goldMaterial);
    leftArm.position.set(-0.78, -0.22, 0.04);
    leftArm.rotation.z = 0.24;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.78;
    rightArm.rotation.z = -0.24;
    pet.add(leftArm, rightArm);

    const scanlineMaterial = new MeshBasicMaterial({
      color: 0xf5ecd0,
      transparent: true,
      opacity: 0.16,
    });
    const scanline = new Mesh(new PlaneGeometry(2.5, 0.018), scanlineMaterial);
    scanline.position.z = 0.92;
    pet.add(scanline);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const handleClick = () => interactRef.current();
    renderer.domElement.addEventListener("click", handleClick);

    let animationFrame = 0;
    const startedAt = performance.now();
    const centerLift = 0.42;

    const animate = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const activeMode = modeRef.current;
      const speed = activeMode === "play" ? 1.85 : activeMode === "review" ? 1.18 : 0.74;
      const wobble = Math.sin(elapsed * speed * 2.2);

      pet.rotation.y = Math.sin(elapsed * speed) * 0.34;
      pet.rotation.z = activeMode === "failed" ? -0.17 : wobble * 0.018;
      pet.position.y = centerLift + Math.sin(elapsed * speed * 1.7) * 0.04;
      base.rotation.z = elapsed * (activeMode === "review" ? 1.8 : 0.8);
      antenna.rotation.z = Math.sin(elapsed * 4.5) * 0.08;
      signal.scale.setScalar(1 + Math.max(0, Math.sin(elapsed * 8)) * 0.22);
      scanline.position.y = -0.9 + ((elapsed * (activeMode === "review" ? 0.95 : 0.55)) % 1.9);

      if (activeMode === "play") {
        pet.rotation.y = elapsed * 1.7;
        pet.position.y = centerLift + Math.abs(Math.sin(elapsed * 4.4)) * 0.2;
      } else if (activeMode === "salute") {
        rightArm.rotation.z = -1.02 + Math.sin(elapsed * 6) * 0.06;
        rightArm.position.y = 0.05;
      } else {
        rightArm.rotation.z = -0.24;
        rightArm.position.y = -0.22;
      }

      if (activeMode === "failed") {
        glassMaterial.emissive.setHex(0xe52222);
        glassMaterial.color.setHex(0xe52222);
      } else {
        glassMaterial.emissive.setHex(0x50ff65);
        glassMaterial.color.setHex(0x76d17c);
      }

      renderer.render(scene, camera);
      window.__tovarishByteFrame = (window.__tovarishByteFrame || 0) + 1;
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener("click", handleClick);
      resizeObserver.disconnect();
      host.removeChild(renderer.domElement);
      disposeObject(scene);
      renderer.dispose();
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}

declare global {
  interface Window {
    __tovarishByteFrame?: number;
  }
}
