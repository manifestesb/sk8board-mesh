import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import gsap from 'gsap';
import type { SkateboardTick, SkateboardOptions } from '../core/types.js';
import { PhysicsRig } from './PhysicsRig.js';

// ---------------------------------------------------------------------------
// Asset imports — resolved by Vite (or compatible bundler) at build time.
// The assets live alongside the library source; no public/ paths needed.
// ---------------------------------------------------------------------------
import gltfUrl         from '../assets/skateboard.gltf?url';
import gripDiffuseUrl  from '../assets/skateboard/griptape-diffuse.webp?url';
import gripRoughUrl    from '../assets/skateboard/griptape-roughness.webp?url';
import metalNormalUrl  from '../assets/skateboard/metal-normal.avif?url';
import deckUrl         from '../assets/skateboard/Deck.webp?url';
import wheelUrl        from '../assets/skateboard/SkateWheel1.png?url';

// ---------------------------------------------------------------------------
// Capability interfaces
// ---------------------------------------------------------------------------

export interface Loadable {
  load(): Promise<void>;
}

export interface Tickable {
  tick(data: SkateboardTick): void;
}

export interface Disposable {
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Constants derived from the GLTF model geometry
// ---------------------------------------------------------------------------

/** Wheel center height from ground — from GLTF node position.y */
const WHEEL_RADIUS = 0.086;

/** Jump timing from InteractiveSkateboard.tsx */
const JUMP_RISE_DURATION = 0.51;
const JUMP_FALL_DURATION = 0.43;
const JUMP_RISE_DELAY    = 0.26;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GLTFNodes {
  GripTape:   THREE.Object3D;
  Wheel1:     THREE.Object3D;
  Wheel2:     THREE.Object3D;
  Wheel3:     THREE.Object3D;
  Wheel4:     THREE.Object3D;
  Deck:       THREE.Object3D;
  Bolts:      THREE.Object3D;
  Baseplates: THREE.Object3D;
  Truck1:     THREE.Object3D;
  Truck2:     THREE.Object3D;
}

interface ResolvedOptions {
  dracoPath:         string;
  defaultJumpHeight: number;
  truckColor:        string;
  boltColor:         string;
}

// ---------------------------------------------------------------------------
// Skateboard
// ---------------------------------------------------------------------------

/**
 * Telemetry-driven 3D skateboard — Three.js adapter.
 *
 * All model assets (GLTF, textures) are bundled with the library.
 * Only the Draco WASM decoder path needs to be served by the host app.
 *
 * Usage:
 *   const board = new Skateboard();
 *   await board.load();
 *   scene.add(board.root);
 *
 *   function listener(pkt) {
 *     board.tick(session.process(pkt.toRaw()));
 *     renderer.render(scene, camera);
 *   }
 */
export class Skateboard implements Loadable, Tickable, Disposable {
  /**
   * Root Three.js group — add this to your scene.
   * Hierarchy: root (yaw) → jumpGroup (Y) → tiltGroup (roll/pitch) → model
   */
  readonly root: THREE.Group;

  private readonly jumpGroup:  THREE.Group;
  private readonly tiltGroup:  THREE.Group;
  private readonly modelGroup: THREE.Group;

  private wheels: THREE.Object3D[] = [];

  private readonly physicsRig = new PhysicsRig();

  private isJumping    = false;
  private prevAirborne = false;
  private lastTime: number | null = null;

  private readonly options: ResolvedOptions;

  constructor(options: SkateboardOptions = {}) {
    this.options = {
      dracoPath:         options.dracoPath         ?? '/draco/',
      defaultJumpHeight: options.defaultJumpHeight ?? 0.8,
      truckColor:        options.truckColor        ?? '#888888',
      boltColor:         options.boltColor         ?? '#888888',
    };

    this.root       = new THREE.Group();
    this.jumpGroup  = new THREE.Group();
    this.tiltGroup  = new THREE.Group();
    this.modelGroup = new THREE.Group();

    // No offset needed — the GLTF already places wheel bottoms at y=0
    // (wheel centers at y=0.086, wheel radius=0.086 → bottom at y=0)

    this.tiltGroup.add(this.modelGroup);
    this.jumpGroup.add(this.tiltGroup);
    this.root.add(this.jumpGroup);
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    const draco = new DRACOLoader();
    draco.setDecoderPath(this.options.dracoPath);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const gltf = await loader.loadAsync(gltfUrl);
    const nodes = this.extractNodes(gltf.scene);
    const materials = this.buildMaterials();

    this.mountMeshes(nodes, materials);
    draco.dispose();
  }

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  tick(data: SkateboardTick, now = performance.now()): void {
    const dt = this.lastTime !== null ? (now - this.lastTime) / 1000 : 0.016;
    this.lastTime = now;

    const rig = this.physicsRig.simulate(data, dt);
    this.applyOrientation(data, dt);
    this.spinWheels(rig.wheelAngularVelocity, dt);
    this.updateJump(data);
  }

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    gsap.killTweensOf(this.jumpGroup.position);
    gsap.killTweensOf(this.tiltGroup.rotation);
  }

  // ---------------------------------------------------------------------------
  // Private — orientation
  // ---------------------------------------------------------------------------

  private applyOrientation(data: SkateboardTick, dt: number): void {
    const lerpFactor = 1 - Math.pow(0.001, dt * 6);

    this.tiltGroup.rotation.z = THREE.MathUtils.lerp(
      this.tiltGroup.rotation.z, data.roll,  lerpFactor,
    );
    this.tiltGroup.rotation.x = THREE.MathUtils.lerp(
      this.tiltGroup.rotation.x, data.pitch, lerpFactor,
    );
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y, data.yaw, lerpFactor * 0.5,
    );
  }

  // ---------------------------------------------------------------------------
  // Private — wheels
  // ---------------------------------------------------------------------------

  private spinWheels(angularVelocity: number, dt: number): void {
    const delta = angularVelocity * dt;
    for (const wheel of this.wheels) wheel.rotation.x += delta;
  }

  // ---------------------------------------------------------------------------
  // Private — jump
  // ---------------------------------------------------------------------------

  private updateJump(data: SkateboardTick): void {
    const justLaunched = data.airborne && !this.prevAirborne;
    const justLanded   = !data.airborne && this.prevAirborne;

    if (justLaunched && !this.isJumping) {
      this.triggerJump(data.jumpHeight ?? this.options.defaultJumpHeight);
    }

    if (justLanded && this.isJumping) {
      gsap.killTweensOf(this.jumpGroup.position);
      gsap.to(this.jumpGroup.position, {
        y: 0, duration: 0.1, ease: 'power2.in',
        onComplete: () => { this.isJumping = false; },
      });
    }

    this.prevAirborne = data.airborne;
  }

  private triggerJump(peakHeight: number): void {
    this.isJumping = true;
    gsap.timeline({ onComplete: () => { this.isJumping = false; } })
      .to(this.jumpGroup.position, {
        y: peakHeight, duration: JUMP_RISE_DURATION, ease: 'power2.out', delay: JUMP_RISE_DELAY,
      })
      .to(this.jumpGroup.position, {
        y: 0, duration: JUMP_FALL_DURATION, ease: 'power2.in',
      });
  }

  // ---------------------------------------------------------------------------
  // Private — model setup
  // ---------------------------------------------------------------------------

  private extractNodes(scene: THREE.Group): GLTFNodes {
    // Traverse all named objects — same strategy as @react-three/drei useGLTF.
    const all: Record<string, THREE.Object3D> = {};
    scene.traverse((obj) => { if (obj.name) all[obj.name] = obj; });

    const required = [
      'GripTape', 'Wheel1', 'Wheel2', 'Wheel3', 'Wheel4',
      'Deck', 'Bolts', 'Baseplates', 'Truck1', 'Truck2',
    ] as const;

    for (const key of required) {
      if (!all[key]) {
        const found = Object.keys(all).join(', ') || '(none)';
        throw new Error(`sk8board: GLTF missing node "${key}". Found: ${found}`);
      }
    }

    return all as unknown as GLTFNodes;
  }

  private buildMaterials() {
    const tx = new THREE.TextureLoader();

    // Color textures: sRGB space
    const loadColor = (url: string) => {
      const t = tx.load(url);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    // Data textures (roughness, normal, bump): linear space
    const loadData = (url: string) => {
      const t = tx.load(url);
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      return t;
    };

    const loadRepeatColor = (url: string, rx: number, ry: number) => {
      const t = loadColor(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      return t;
    };

    const loadRepeatData = (url: string, rx: number, ry: number) => {
      const t = loadData(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      return t;
    };

    const gripTape = new THREE.MeshStandardMaterial({
      map:          loadRepeatColor(gripDiffuseUrl, 9, 9),
      bumpMap:      loadRepeatData(gripRoughUrl,    9, 9),
      roughnessMap: loadRepeatData(gripRoughUrl,    9, 9),
      bumpScale: 3.5, roughness: 0.8, color: '#555555',
    });

    const deck = new THREE.MeshStandardMaterial({
      map: loadColor(deckUrl), roughness: 0.1,
    });

    const wheel = new THREE.MeshStandardMaterial({
      map: loadColor(wheelUrl), roughness: 0.35,
    });

    const truck = new THREE.MeshStandardMaterial({
      color:       this.options.truckColor,
      normalMap:   loadRepeatData(metalNormalUrl, 8, 8),
      normalScale: new THREE.Vector2(0.3, 0.3),
      metalness: 0.8, roughness: 0.25,
    });

    const bolt = new THREE.MeshStandardMaterial({
      color: this.options.boltColor, metalness: 0.5, roughness: 0.3,
    });

    return { gripTape, deck, wheel, truck, bolt };
  }

  private mountMeshes(nodes: GLTFNodes, mats: ReturnType<Skateboard['buildMaterials']>): void {
    const defs: Array<{
      node: THREE.Object3D;
      material: THREE.Material;
      position: [number, number, number];
      rotation?: [number, number, number];
      isWheel?: boolean;
    }> = [
      { node: nodes.GripTape,   material: mats.gripTape, position: [0,      0.286,  -0.002] },
      { node: nodes.Deck,       material: mats.deck,     position: [0,      0.271,  -0.002] },
      { node: nodes.Bolts,      material: mats.bolt,     position: [0,      0.198,   0],    rotation: [Math.PI, 0, Math.PI] },
      { node: nodes.Baseplates, material: mats.truck,    position: [0,      0.211,   0] },
      { node: nodes.Truck1,     material: mats.truck,    position: [0,      0.101,  -0.617] },
      { node: nodes.Truck2,     material: mats.truck,    position: [0,      0.101,   0.617], rotation: [Math.PI, 0, Math.PI] },
      { node: nodes.Wheel1,     material: mats.wheel,    position: [ 0.238, 0.086,   0.635], isWheel: true },
      { node: nodes.Wheel2,     material: mats.wheel,    position: [-0.237, 0.086,   0.635], isWheel: true },
      { node: nodes.Wheel3,     material: mats.wheel,    position: [ 0.237, 0.086,  -0.635], rotation: [Math.PI, 0, Math.PI], isWheel: true },
      { node: nodes.Wheel4,     material: mats.wheel,    position: [-0.238, 0.086,  -0.635], rotation: [Math.PI, 0, Math.PI], isWheel: true },
    ];

    for (const def of defs) {
      // Create a new Mesh from the node's geometry — same approach as the
      // original Skateboard.tsx which uses nodes.GripTape.geometry directly.
      // Avoids instanceof ambiguity on cloned GLTF objects.
      const geometry = (def.node as THREE.Mesh).geometry;
      const mesh = new THREE.Mesh(geometry, def.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(...def.position);
      if (def.rotation) mesh.rotation.set(...def.rotation);
      this.modelGroup.add(mesh);
      if (def.isWheel) this.wheels.push(mesh);
    }
  }
}
