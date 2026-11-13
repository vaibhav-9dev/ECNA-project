import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useSimulation } from '../../simulation/SimulationContext';
import { computeElectrodeLayout } from '../../simulation/sensorEngine';
import { createGroundHatchTexture, createPcbSilkscreenTexture } from './pcbTextures';

const MM_TO_3D = 0.1; // 10 mm = 1 Three.js unit

// Pre-allocated math helpers (zero GC inside animation loop)
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _hitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeIntersect = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3(0.4, 6.2, 8.6);
const _targetCamLook = new THREE.Vector3(0, 0.2, 0);

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

/**
 * Creates a rounded rectangle THREE.Shape centered at (0, 0).
 */
function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width * 0.5;
  const y = -height * 0.5;
  const r = Math.min(radius, width * 0.4, height * 0.4);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Creates a crisp procedural CanvasTexture Sprite for Exploded View layer labels
 * (avoids secondary ReactDOM roots / Drei <Html> unmount race conditions in React 19).
 */
function createLabelSprite(text: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 88;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(7, 11, 18, 0.92)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;

  const r = 12;
  const x = 6;
  const y = 10;
  const w = canvas.width - 12;
  const h = canvas.height - 20;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f1f5f9';
  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.48, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * Builds an articulated 5-part 3D finger assembly + contact/hover footprint ring.
 */
function buildFingerAssembly(isSecondary: boolean): {
  root: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  setRadius: (r3d: number) => void;
} {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.x = 0.48;
  root.add(bodyGroup);

  const skinColor = isSecondary ? 0xd8a48f : 0xe0a990;
  const opacity = isSecondary ? 0.62 : 1.0;

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.55,
    metalness: 0.02,
    transparent: isSecondary,
    opacity,
  });

  const tipGeom = new THREE.SphereGeometry(0.47, 24, 24);
  const tipMesh = new THREE.Mesh(tipGeom, skinMat);
  tipMesh.castShadow = !isSecondary;
  bodyGroup.add(tipMesh);

  const shaftGeom = new THREE.CylinderGeometry(0.49, 0.46, 1.9, 24);
  const shaftMesh = new THREE.Mesh(shaftGeom, skinMat);
  shaftMesh.position.y = 0.95;
  shaftMesh.castShadow = !isSecondary;
  bodyGroup.add(shaftMesh);

  const capGeom = new THREE.SphereGeometry(0.49, 20, 20);
  const capMesh = new THREE.Mesh(capGeom, skinMat);
  capMesh.position.y = 1.9;
  capMesh.castShadow = !isSecondary;
  bodyGroup.add(capMesh);

  const nailMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5ddd5,
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 0.7,
    transparent: isSecondary,
    opacity,
  });
  const nailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.08), nailMat);
  nailMesh.position.set(0, 0.25, -0.43);
  nailMesh.rotation.x = -0.12;
  bodyGroup.add(nailMesh);

  const creaseMat = new THREE.MeshStandardMaterial({
    color: 0xc48a72,
    roughness: 0.7,
    transparent: isSecondary,
    opacity,
  });
  const creaseMesh = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.02, 8, 24), creaseMat);
  creaseMesh.position.y = 1.15;
  creaseMesh.rotation.x = Math.PI / 2;
  bodyGroup.add(creaseMesh);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 32), ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  root.add(ringMesh);

  const setRadius = (r3d: number) => {
    const s = Math.max(0.7, r3d / 0.64);
    bodyGroup.scale.set(s, 1, s);
    bodyGroup.position.set(0, r3d * 0.72, r3d * 0.42);
    ringMesh.scale.set(s, s, 1);
  };

  return { root, ringMesh, ringMat, setRadius };
}

function disposeObjectTree(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const anyMat = m as unknown as { map?: THREE.Texture };
        if (anyMat.map) anyMat.map.dispose();
        m.dispose();
      }
    }
  });
}

export const TouchSliderScene: React.FC<{ className?: string }> = ({ className = '' }) => {
  const sim = useSimulation();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Store latest simulation state & callbacks in refs so React updates never recreate the WebGL canvas
  const simRef = useRef(sim);
  simRef.current = sim;

  const cameraTriggerRef = useRef<number>(-1);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const initW = Math.max(container.clientWidth, 320);
    const initH = Math.max(container.clientHeight, 240);
    renderer.setSize(initW, initH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // Scene + Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080c14');
    scene.fog = new THREE.Fog('#080c14', 18, 42);

    // Studio Environment Reflection (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();

    // Camera + OrbitControls
    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 100);
    camera.position.set(0.4, 6.2, 8.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 3.2;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.2, 0);

    let animatingCamera = false;
    const onControlStart = () => {
      animatingCamera = false;
    };
    controls.addEventListener('start', onControlStart);

    // 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xa5c8ff, 0x1e293b, 0.55);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.65);
    keyLight.position.set(5, 9, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.85);
    rimLight.position.set(-6, 4, -6);
    scene.add(rimLight);

    // Workbench Ground & Grid
    const benchGroup = new THREE.Group();
    benchGroup.position.y = -0.82;
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e18,
      roughness: 0.92,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    benchGroup.add(floorMesh);

    const gridHelper = new THREE.GridHelper(32, 32, 0x1e293b, 0x111827);
    gridHelper.position.y = 0.01;
    benchGroup.add(gridHelper);
    scene.add(benchGroup);

    // Cross-section clipping plane
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.04);

    // Sensor Assembly Layer Groups
    const enclosureGroup = new THREE.Group();
    const groundGroup = new THREE.Group();
    const pcbGroup = new THREE.Group();
    const copperGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    const fieldGroup = new THREE.Group();
    const calipersGroup = new THREE.Group();
    scene.add(
      enclosureGroup,
      groundGroup,
      pcbGroup,
      copperGroup,
      overlayGroup,
      fieldGroup,
      calipersGroup
    );

    // Interactive invisible hit plane for direct finger dragging
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitPlaneMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), hitMat);
    hitPlaneMesh.rotation.x = -Math.PI / 2;
    scene.add(hitPlaneMesh);

    // Finger assemblies
    const primaryFinger = buildFingerAssembly(false);
    const secondaryFinger = buildFingerAssembly(true);
    scene.add(primaryFinger.root, secondaryFinger.root);

    // Live 3D Calipers (Actual X vs Estimated Centroid X)
    const actualPinMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const actualPin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), actualPinMat);
    const estPinMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const estPin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 12), estPinMat);
    estPin.rotation.x = Math.PI;
    calipersGroup.add(actualPin, estPin);

    // Exploded view label sprites (pure WebGL, zero secondary React roots)
    const labelEnclosure = createLabelSprite('Enclosure Housing (ABS / Al)', '#64748b');
    const labelGround = createLabelSprite('Bottom Ground Shield (Copper)', '#f59e0b');
    const labelPcb = createLabelSprite('FR-4 PCB Substrate', '#10b981');
    const labelCopper = createLabelSprite('Copper Electrodes & Connector', '#fb923c');
    const labelOverlay = createLabelSprite('Protective Dielectric Overlay', '#22d3ee');
    enclosureGroup.add(labelEnclosure);
    groundGroup.add(labelGround);
    pcbGroup.add(labelPcb);
    copperGroup.add(labelCopper);
    overlayGroup.add(labelOverlay);

    // Pool of conceptual fringing E-field lines (max 30 lines, zero runtime allocations)
    const FIELD_SEGMENTS = 15;
    const MAX_FIELD_LINES = 30;
    const fieldLines: {
      line: THREE.Line;
      mat: THREE.LineBasicMaterial;
      positions: Float32Array;
    }[] = [];

    for (let i = 0; i < MAX_FIELD_LINES; i++) {
      const positions = new Float32Array((FIELD_SEGMENTS + 1) * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.5,
      });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      line.visible = false;
      fieldGroup.add(line);
      fieldLines.push({ line, mat, positions });
    }

    // Track dynamic copper pad materials + current geometry signature
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const groundHatchTex = createGroundHatchTexture(maxAniso);
    let silkscreenTex: THREE.CanvasTexture | null = null;
    let padMaterials: THREE.MeshStandardMaterial[] = [];
    let clippableMaterials: THREE.Material[] = [];
    let lastGeomKey = '';
    let lastClipEnabled = false;
    let currentOverlayTopY = 0.2;
    let currentBoardDepth3d = 4.0;

    const rebuildAssemblyGeometry = () => {
      const g = simRef.current.geometry;
      const key = `${g.electrodeCount}|${g.sliderLengthMm}|${g.sliderWidthMm}|${g.electrodeGapMm}|${g.overlayThicknessMm}|${g.pcbThicknessMm}`;
      if (key === lastGeomKey) return;
      lastGeomKey = key;

      // Clear previous meshes cleanly while keeping label sprites
      const clearMeshes = (grp: THREE.Group, keepSprite: THREE.Sprite) => {
        const toRemove = grp.children.filter((c) => c !== keepSprite);
        for (const c of toRemove) {
          disposeObjectTree(c);
          grp.remove(c);
        }
      };

      clearMeshes(enclosureGroup, labelEnclosure);
      clearMeshes(groundGroup, labelGround);
      clearMeshes(pcbGroup, labelPcb);
      clearMeshes(copperGroup, labelCopper);
      clearMeshes(overlayGroup, labelOverlay);

      if (silkscreenTex) {
        silkscreenTex.dispose();
        silkscreenTex = null;
      }

      padMaterials = [];
      clippableMaterials = [];

      const sliderLen3d = g.sliderLengthMm * MM_TO_3D;
      const boardLenMm = g.sliderLengthMm / 0.832;
      const boardLen3d = boardLenMm * MM_TO_3D;
      const trackWidth3d = g.sliderWidthMm * MM_TO_3D;
      const boardDepth3d = Math.max(3.6, trackWidth3d + 2.2);
      currentBoardDepth3d = boardDepth3d;

      const pcbThick3d = Math.max(0.08, g.pcbThicknessMm * MM_TO_3D);
      const copperThick3d = 0.032;
      const overlayThick3d = Math.max(0.03, g.overlayThicknessMm * MM_TO_3D);
      const groundThick3d = 0.025;
      const enclosureHeight3d = 0.42;

      const yEnclosureCenter = -pcbThick3d * 0.5 - groundThick3d - enclosureHeight3d * 0.5;
      const yGroundCenter = -pcbThick3d * 0.5 - groundThick3d * 0.5;
      const yPcbCenter = 0;
      const yCopperCenter = pcbThick3d * 0.5 + copperThick3d * 0.5;
      const yOverlayCenter = pcbThick3d * 0.5 + copperThick3d + overlayThick3d * 0.5;
      currentOverlayTopY = pcbThick3d * 0.5 + copperThick3d + overlayThick3d;

      // 1. Enclosure Base (ExtrudeGeometry with smooth bevel)
      const encShape = createRoundedRectShape(boardLen3d + 0.65, boardDepth3d + 0.65, 0.18);
      const encGeom = new THREE.ExtrudeGeometry(encShape, {
        depth: enclosureHeight3d - 0.08,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
      });
      encGeom.rotateX(Math.PI / 2);
      encGeom.center();
      const encMat = new THREE.MeshStandardMaterial({
        color: 0x151c28,
        roughness: 0.48,
        metalness: 0.65,
        clipShadows: true,
      });
      clippableMaterials.push(encMat);
      const encMesh = new THREE.Mesh(encGeom, encMat);
      encMesh.position.y = yEnclosureCenter;
      encMesh.castShadow = true;
      encMesh.receiveShadow = true;
      enclosureGroup.add(encMesh);

      // Brass Standoffs
      const standoffGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
      const standoffMat = new THREE.MeshStandardMaterial({
        color: 0xd4a34a,
        metalness: 0.85,
        roughness: 0.25,
      });
      const standoffCoords = [
        [-boardLen3d * 0.45, -boardDepth3d * 0.41],
        [boardLen3d * 0.45, -boardDepth3d * 0.41],
        [-boardLen3d * 0.45, boardDepth3d * 0.41],
        [boardLen3d * 0.45, boardDepth3d * 0.41],
      ];
      for (const [sx, sz] of standoffCoords) {
        const st = new THREE.Mesh(standoffGeom, standoffMat);
        st.position.set(sx, yEnclosureCenter + enclosureHeight3d * 0.5 + 0.03, sz);
        enclosureGroup.add(st);
      }
      labelEnclosure.position.set(-boardLen3d * 0.42, yEnclosureCenter + 0.35, boardDepth3d * 0.55);

      // 2. Ground Plane Shield
      const gndMat = new THREE.MeshStandardMaterial({
        map: groundHatchTex,
        color: 0xd88248,
        metalness: 0.82,
        roughness: 0.32,
      });
      clippableMaterials.push(gndMat);
      const gndMesh = new THREE.Mesh(
        new THREE.BoxGeometry(boardLen3d - 0.12, groundThick3d, boardDepth3d - 0.12),
        gndMat
      );
      gndMesh.position.y = yGroundCenter;
      gndMesh.receiveShadow = true;
      groundGroup.add(gndMesh);
      labelGround.position.set(boardLen3d * 0.42, yGroundCenter + 0.3, boardDepth3d * 0.55);

      // 3. FR-4 PCB Substrate + Silkscreen
      const pcbMat = new THREE.MeshStandardMaterial({
        color: 0x102a2e,
        roughness: 0.62,
        metalness: 0.08,
      });
      clippableMaterials.push(pcbMat);
      const pcbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(boardLen3d, pcbThick3d, boardDepth3d),
        pcbMat
      );
      pcbMesh.position.y = yPcbCenter;
      pcbMesh.castShadow = true;
      pcbMesh.receiveShadow = true;
      pcbGroup.add(pcbMesh);

      silkscreenTex = createPcbSilkscreenTexture(
        g.sliderLengthMm,
        g.electrodeCount,
        g.electrodeGapMm,
        maxAniso
      );
      const silkMat = new THREE.MeshStandardMaterial({
        map: silkscreenTex,
        roughness: 0.68,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      clippableMaterials.push(silkMat);
      const silkMesh = new THREE.Mesh(new THREE.PlaneGeometry(boardLen3d, boardDepth3d), silkMat);
      silkMesh.position.y = yPcbCenter + pcbThick3d * 0.5 + 0.003;
      silkMesh.rotation.x = -Math.PI / 2;
      silkMesh.receiveShadow = true;
      pcbGroup.add(silkMesh);
      labelPcb.position.set(-boardLen3d * 0.44, yPcbCenter + 0.38, boardDepth3d * 0.55);

      // 4. Copper Electrodes + Routed Traces + 8-Pin Connector
      const layout = computeElectrodeLayout(g.electrodeCount, g.sliderLengthMm, g.electrodeGapMm);
      const traceMat = new THREE.MeshStandardMaterial({
        color: 0xc9713b,
        metalness: 0.85,
        roughness: 0.25,
      });
      clippableMaterials.push(traceMat);

      for (const pad of layout) {
        const padX3d = (pad.centerMm - g.sliderLengthMm * 0.5) * MM_TO_3D;
        const padW3d = pad.widthMm * MM_TO_3D;
        const padMat = new THREE.MeshStandardMaterial({
          color: 0xd17840,
          metalness: 0.88,
          roughness: 0.22,
          emissive: 0x0284c7,
          emissiveIntensity: 0,
        });
        clippableMaterials.push(padMat);
        padMaterials.push(padMat);

        const padMesh = new THREE.Mesh(
          new THREE.BoxGeometry(padW3d, copperThick3d, trackWidth3d),
          padMat
        );
        padMesh.position.set(padX3d, yCopperCenter, 0);
        padMesh.castShadow = true;
        padMesh.receiveShadow = true;
        copperGroup.add(padMesh);

        const traceMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, copperThick3d * 0.65, 0.72),
          traceMat
        );
        traceMesh.position.set(padX3d, yCopperCenter - 0.005, -trackWidth3d * 0.5 - 0.35);
        copperGroup.add(traceMesh);
      }

      // Rear 8-Pin Header Connector
      const headerGroup = new THREE.Group();
      headerGroup.position.set(0, yCopperCenter + 0.12, -boardDepth3d * 0.5 + 0.36);
      const shroudMesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.24, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.1 })
      );
      shroudMesh.castShadow = true;
      headerGroup.add(shroudMesh);

      const pinGeom = new THREE.BoxGeometry(0.064, 0.32, 0.064);
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.94,
        roughness: 0.16,
      });
      for (let pIdx = 0; pIdx < 8; pIdx++) {
        const pin = new THREE.Mesh(pinGeom, pinMat);
        pin.position.set((pIdx - 3.5) * 0.254, 0.16, 0);
        headerGroup.add(pin);
      }
      copperGroup.add(headerGroup);
      labelCopper.position.set(boardLen3d * 0.44, yCopperCenter + 0.42, boardDepth3d * 0.55);

      // 5. Dielectric Protective Overlay
      const overlayMat = new THREE.MeshPhysicalMaterial({
        color: 0xa5f3fc,
        roughness: 0.14,
        metalness: 0.02,
        transparent: true,
        opacity: 0.26,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        depthWrite: false,
      });
      clippableMaterials.push(overlayMat);
      const overlayMesh = new THREE.Mesh(
        new THREE.BoxGeometry(boardLen3d - 0.08, overlayThick3d, boardDepth3d - 0.08),
        overlayMat
      );
      overlayMesh.position.y = yOverlayCenter;
      overlayMesh.receiveShadow = true;
      overlayGroup.add(overlayMesh);
      labelOverlay.position.set(-boardLen3d * 0.4, yOverlayCenter + 0.45, boardDepth3d * 0.55);

      // Update hit plane geometry scale
      hitPlaneMesh.geometry.dispose();
      hitPlaneMesh.geometry = new THREE.PlaneGeometry(sliderLen3d + 0.8, trackWidth3d + 1.0);
    };

    // Direct Pointer Drag Interaction on 3D PCB Surface
    let dragging = false;

    const updatePointerNdc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const projectFingerToTrack = (e: PointerEvent) => {
      updatePointerNdc(e);
      _raycaster.setFromCamera(_pointer, camera);
      const yPlane = currentOverlayTopY + simRef.current.explodedFactor * 1.85;
      _hitPlane.constant = -yPlane;
      if (_raycaster.ray.intersectPlane(_hitPlane, _planeIntersect)) {
        const g = simRef.current.geometry;
        const xMm = THREE.MathUtils.clamp(
          _planeIntersect.x / MM_TO_3D + g.sliderLengthMm * 0.5,
          0,
          g.sliderLengthMm
        );
        simRef.current.setFinger((prev) => ({
          ...prev,
          xMm,
          isTouching: true,
          heightMm: 0,
        }));
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      updatePointerNdc(e);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObject(hitPlaneMesh, false);
      if (hits.length > 0) {
        e.stopPropagation();
        dragging = true;
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
        renderer.domElement.setPointerCapture?.(e.pointerId);
        simRef.current.setIsDraggingFinger(true);
        simRef.current.setTouchMode('manual');
        projectFingerToTrack(e);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        projectFingerToTrack(e);
        return;
      }
      updatePointerNdc(e);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObject(hitPlaneMesh, false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'grab' : 'auto';
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      controls.enabled = true;
      renderer.domElement.style.cursor = 'grab';
      simRef.current.setIsDraggingFinger(false);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // WebGL Context Loss Listeners
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // ResizeObserver keeps canvas synced without tearing down WebGL
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, Math.floor(entry.contentRect.width));
        const h = Math.max(100, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Pre-compile shaders on hardware GPUs
    rebuildAssemblyGeometry();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Software WebGL GPU-fence pacing
    let frameId = 0;
    let disposed = false;
    let prevTime = performance.now();
    let dampedExplode = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;

      const s = simRef.current;
      rebuildAssemblyGeometry();

      // Update cross-section clipping
      if (s.showCrossSection !== lastClipEnabled) {
        lastClipEnabled = s.showCrossSection;
        const planes = s.showCrossSection ? [clipPlane] : [];
        for (const m of clippableMaterials) {
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        }
      }

      // Check camera preset changes
      if (cameraTriggerRef.current !== s.cameraResetCounter) {
        cameraTriggerRef.current = s.cameraResetCounter;
        animatingCamera = true;
        switch (s.cameraPreset) {
          case 'top':
            _targetCamPos.set(0, 10.8, 0.01);
            _targetCamLook.set(0, 0, 0);
            break;
          case 'side':
            _targetCamPos.set(0, 1.35, 9.8);
            _targetCamLook.set(0, 0.35, 0);
            break;
          case 'cross-section':
            _targetCamPos.set(3.2, 2.2, 6.8);
            _targetCamLook.set(0, 0.3, 0);
            break;
          case 'perspective':
          default:
            _targetCamPos.set(0.4, 6.2, 8.6);
            _targetCamLook.set(0, 0.2, 0);
            break;
        }
      }

      if (animatingCamera) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 7, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetCamLook.x, 7, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetCamLook.y, 7, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetCamLook.z, 7, dt);
        if (camera.position.distanceTo(_targetCamPos) < 0.03) {
          animatingCamera = false;
        }
      }
      controls.update();

      // Smooth Exploded View Layer Offsets & Label Opacities
      dampedExplode = THREE.MathUtils.damp(dampedExplode, s.explodedFactor, 7, dt);
      enclosureGroup.position.y = -dampedExplode * 1.45;
      groundGroup.position.y = -dampedExplode * 0.55;
      pcbGroup.position.y = dampedExplode * 0.15;
      copperGroup.position.y = dampedExplode * 0.95;
      overlayGroup.position.y = dampedExplode * 1.85;

      const labelOpacity = dampedExplode > 0.16 ? Math.min(1, (dampedExplode - 0.16) * 2.5) : 0;
      labelEnclosure.material.opacity = labelOpacity;
      labelGround.material.opacity = labelOpacity;
      labelPcb.material.opacity = labelOpacity;
      labelCopper.material.opacity = labelOpacity;
      labelOverlay.material.opacity = labelOpacity;

      // Update hit plane height
      const overlaySurfaceY = currentOverlayTopY + dampedExplode * 1.85;
      hitPlaneMesh.position.y = overlaySurfaceY + 0.05;

      // Update Copper Pad Emissive Responses
      const { channels, strongestChannelIndex, improvedEstimate } = s.tickOutput;
      for (let i = 0; i < padMaterials.length; i++) {
        const ch = channels[i];
        const mat = padMaterials[i];
        if (!ch || !mat) continue;
        const isPeak = improvedEstimate.detected && strongestChannelIndex === i;
        const intensity = Math.min(1, Math.max(0, ch.compensatedWeightPf / 1.8));
        mat.color.setHex(isPeak ? 0xe59256 : 0xd17840);
        mat.emissive.setHex(isPeak ? 0x06b6d4 : 0x0284c7);
        mat.emissiveIntensity = intensity * (isPeak ? 0.95 : 0.45);
      }

      // Update Fingers
      const r3d = Math.max(0.42, s.geometry.fingerRadiusMm * MM_TO_3D * 0.85);
      primaryFinger.setRadius(r3d);
      const hoverLift = s.finger.isTouching ? 0 : Math.max(0.08, s.finger.heightMm * MM_TO_3D);
      const f1X3d = (s.finger.xMm - s.geometry.sliderLengthMm * 0.5) * MM_TO_3D;
      const f1Y3d = overlaySurfaceY + hoverLift;
      primaryFinger.root.position.x = THREE.MathUtils.damp(primaryFinger.root.position.x, f1X3d, 24, dt);
      primaryFinger.root.position.y = THREE.MathUtils.damp(primaryFinger.root.position.y, f1Y3d, 20, dt);
      primaryFinger.ringMesh.position.y = -hoverLift + 0.018;
      primaryFinger.ringMat.color.setHex(s.finger.isTouching ? 0x22d3ee : 0xf59e0b);
      primaryFinger.ringMat.opacity = s.finger.isTouching ? 0.78 : 0.42;

      secondaryFinger.root.visible = s.finger.secondFingerEnabled;
      if (s.finger.secondFingerEnabled) {
        secondaryFinger.setRadius(r3d);
        const f2X3d = (s.finger.secondFingerXMm - s.geometry.sliderLengthMm * 0.5) * MM_TO_3D;
        secondaryFinger.root.position.x = THREE.MathUtils.damp(
          secondaryFinger.root.position.x,
          f2X3d,
          24,
          dt
        );
        secondaryFinger.root.position.y = f1Y3d;
        secondaryFinger.ringMesh.position.y = -hoverLift + 0.018;
      }

      // Update Caliper Pins
      calipersGroup.position.set(0, overlaySurfaceY + 0.04, currentBoardDepth3d * 0.42);
      actualPin.position.set(f1X3d, 0.08, 0);
      if (improvedEstimate.positionMm !== null) {
        estPin.visible = true;
        const estX3d = (improvedEstimate.positionMm - s.geometry.sliderLengthMm * 0.5) * MM_TO_3D;
        estPin.position.set(estX3d, 0.14, 0.16);
      } else {
        estPin.visible = false;
      }

      // Update Conceptual Fringing E-Field Lines (pooled, zero allocations)
      fieldGroup.visible = s.showFieldLines;
      if (s.showFieldLines) {
        const layout = computeElectrodeLayout(
          s.geometry.electrodeCount,
          s.geometry.sliderLengthMm,
          s.geometry.electrodeGapMm
        );
        const copperTopY =
          Math.max(0.08, s.geometry.pcbThicknessMm * MM_TO_3D) * 0.5 +
          0.032 +
          dampedExplode * 0.95;
        const fingerTipY =
          overlaySurfaceY + (s.finger.isTouching ? 0.06 : Math.max(0.1, s.finger.heightMm * MM_TO_3D));

        let lineIdx = 0;
        const writeQuadratic = (
          x0: number,
          y0: number,
          z0: number,
          x1: number,
          y1: number,
          z1: number,
          x2: number,
          y2: number,
          z2: number,
          colorHex: number,
          opacity: number
        ) => {
          if (lineIdx >= MAX_FIELD_LINES) return;
          const slot = fieldLines[lineIdx++];
          slot.line.visible = true;
          slot.mat.color.setHex(colorHex);
          slot.mat.opacity = opacity;
          const pos = slot.positions;
          for (let j = 0; j <= FIELD_SEGMENTS; j++) {
            const u = j / FIELD_SEGMENTS;
            const iu = 1 - u;
            const k = j * 3;
            pos[k] = iu * iu * x0 + 2 * iu * u * x1 + u * u * x2;
            pos[k + 1] = iu * iu * y0 + 2 * iu * u * y1 + u * u * y2;
            pos[k + 2] = iu * iu * z0 + 2 * iu * u * z1 + u * u * z2;
          }
          slot.line.geometry.attributes.position.needsUpdate = true;
        };

        for (const pad of layout) {
          const cx = (pad.centerMm - s.geometry.sliderLengthMm * 0.5) * MM_TO_3D;
          const halfW = pad.widthMm * MM_TO_3D * 0.42;
          const distMm = Math.abs(pad.centerMm - s.finger.xMm);
          const prox = Math.exp(-(distMm * distMm) / (2 * 13 * 13));

          for (const side of [-1, 1]) {
            const sx = cx + side * halfW * 0.45;
            const ex = cx + side * (halfW + 0.16);
            const mx = THREE.MathUtils.lerp((sx + ex) * 0.5, f1X3d, prox * 0.45);
            const my = overlaySurfaceY + 0.22 + prox * 0.18;
            writeQuadratic(
              sx,
              copperTopY,
              0,
              mx,
              my,
              0,
              ex,
              copperTopY,
              0,
              prox > 0.35 ? 0x38bdf8 : 0x0284c7,
              0.25 + prox * 0.55
            );
          }

          if (prox > 0.2) {
            for (const zOff of [-0.32, 0, 0.32]) {
              writeQuadratic(
                cx,
                copperTopY,
                zOff,
                (cx + f1X3d) * 0.5,
                Math.max(copperTopY, fingerTipY) + 0.14,
                zOff * 0.7,
                f1X3d,
                fingerTipY,
                zOff * 0.3,
                s.finger.isTouching ? 0x22d3ee : 0xfbbf24,
                Math.min(0.92, prox * (s.finger.isTouching ? 0.9 : 0.55))
              );
            }
          }
        }

        for (let i = lineIdx; i < MAX_FIELD_LINES; i++) {
          fieldLines[i].line.visible = false;
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => {
          if (!disposed) tick(performance.now());
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      tick(performance.now());
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      if (silkscreenTex) silkscreenTex.dispose();
      groundHatchTex.dispose();
      envRT.dispose();
      pmrem.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (contextLost) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-[#090d16] text-slate-300 ${className}`}
      >
        <div className="max-w-md rounded-lg border border-slate-800 bg-slate-900/90 p-6 text-center">
          <p className="text-sm font-medium text-slate-100">WebGL Context Suspended</p>
          <p className="mt-2 text-xs text-slate-400">
            The 3D graphics context was interrupted by the browser. Click below to restore the interactive PCB viewport.
          </p>
          <button
            onClick={() => setContextLost(false)}
            className="mt-4 rounded bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500"
          >
            Restore 3D Viewport
          </button>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className={`relative h-full w-full select-none ${className}`} />;
};
