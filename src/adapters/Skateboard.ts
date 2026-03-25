import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import gsap from 'gsap';
import type { SkateboardTick, SkateboardOptions } from '../core/types.js';
import { PhysicsRig, type RigState } from './PhysicsRig.js';
import { DeckLean } from './DeckLean.js';

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

/** Y position of the hanger groups — used as the deck lean pivot so that the
 *  baseplate rotates around the same height as the kingpin/pivot-cup connection,
 *  keeping the baseplate↔hanger joint visually aligned during lean. */
const DECK_PIVOT_Y = 0.141;


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
  Baseplates: THREE.Object3D;
  TruckRear:  THREE.Object3D;
  TruckFront: THREE.Object3D;
}

interface ResolvedOptions {
  dracoPath:         string;
  defaultJumpHeight: number;
  truckColor:        string;
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
 * Hierarchy:
 *   root (yaw) → jumpGroup (Y) → modelGroup (carve Y)
 *     ├── deckLean.group (roll/pitch)  ← deck, griptape, bolts, baseplates
 *     ├── rearGroup  (steer/compression, no lean)  ← TruckRear hanger + wheels
 *     └── frontGroup (steer/compression, no lean)  ← TruckFront hanger + wheels
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
   * Hierarchy: root (yaw) → jumpGroup (Y) → modelGroup (carve Y)
   */
  readonly root: THREE.Group;

  private readonly jumpGroup:  THREE.Group;
  private readonly modelGroup: THREE.Group;
  private readonly deckLean = new DeckLean();

  private wheels:      THREE.Object3D[]  = [];
  private truckGroup1: THREE.Group | null = null;
  private truckGroup2: THREE.Group | null = null;

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
    };

    this.root       = new THREE.Group();
    this.jumpGroup  = new THREE.Group();
    this.modelGroup = new THREE.Group();

    this.deckLean.group.position.y = DECK_PIVOT_Y;
    this.modelGroup.add(this.deckLean.group);
    this.jumpGroup.add(this.modelGroup);
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
    this.applyCarve(rig);
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
  }

  // ---------------------------------------------------------------------------
  // Private — orientation
  // ---------------------------------------------------------------------------

  private applyOrientation(data: SkateboardTick, dt: number): void {
    this.deckLean.lean(data.roll, data.pitch, dt);

    const yawFactor = 1 - Math.pow(0.001, dt * 3);
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y, data.yaw, yawFactor,
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
  // Private — carve
  // ---------------------------------------------------------------------------

  private applyCarve(rig: RigState): void {
    // Steer: front truck −θ, rear truck +θ (opposite directions; sign validated
    // against Three.js Y-axis convention where positive = counter-clockwise from above)
    if (this.truckGroup2) this.truckGroup2.rotation.y = -rig.steerAngle; // front
    if (this.truckGroup1) this.truckGroup1.rotation.y =  rig.steerAngle; // rear

    this.modelGroup.rotation.y = rig.carveAngle;
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
    const all: Record<string, THREE.Object3D> = {};
    scene.traverse((obj) => { if (obj.name) all[obj.name] = obj; });

    const required = [
      'GripTape', 'Wheel1', 'Wheel2', 'Wheel3', 'Wheel4',
      'Deck', 'Baseplates', 'TruckRear', 'TruckFront',
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

    const loadColor = (url: string) => {
      const t = tx.load(url);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

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

    return { gripTape, deck, wheel, truck };
  }

  private mountMeshes(nodes: GLTFNodes, mats: ReturnType<Skateboard['buildMaterials']>): void {
    const mesh = (
      node: THREE.Object3D,
      material: THREE.Material,
      position: [number, number, number],
      rotation?: [number, number, number],
    ): THREE.Mesh => {
      const m = new THREE.Mesh((node as THREE.Mesh).geometry, material);
      m.castShadow = m.receiveShadow = true;
      m.position.set(...position);
      if (rotation) m.rotation.set(...rotation);
      return m;
    };

    // Deck assembly — lean with roll/pitch.
    // Positions are relative to DECK_PIVOT_Y so the rotation pivots at the
    // hanger connection height, keeping the baseplate↔hanger joint aligned.
    const P = DECK_PIVOT_Y;
    this.deckLean.group.add(
      mesh(nodes.GripTape,   mats.gripTape, [0, 0.286 - P, -0.002]),
      mesh(nodes.Deck,       mats.deck,     [0, 0.271 - P, -0.002]),
      mesh(nodes.Baseplates, mats.truck,    [0, 0.211 - P,  0]),
    );

    // Rear truck group (TruckRear + Wheel3 + Wheel4) — stays flat, steers.
    const rearGroup = new THREE.Group();
    rearGroup.position.set(0, 0.101, -0.617);
    const w3 = mesh(nodes.Wheel3, mats.wheel, [ 0.237, -0.015, -0.018], [Math.PI, 0, Math.PI]);
    const w4 = mesh(nodes.Wheel4, mats.wheel, [-0.238, -0.015, -0.018], [Math.PI, 0, Math.PI]);
    rearGroup.add(mesh(nodes.TruckRear, mats.truck, [0, 0, 0]), w3, w4);
    this.modelGroup.add(rearGroup);
    this.truckGroup1 = rearGroup;
    this.wheels.push(w3, w4);

    // Front truck group (TruckFront + Wheel1 + Wheel2) — stays flat, steers.
    const frontGroup = new THREE.Group();
    frontGroup.position.set(0, 0.101, 0.617);
    const w1 = mesh(nodes.Wheel1, mats.wheel, [ 0.238, -0.015, 0.018]);
    const w2 = mesh(nodes.Wheel2, mats.wheel, [-0.237, -0.015, 0.018]);
    frontGroup.add(mesh(nodes.TruckFront, mats.truck, [0, 0, 0], [Math.PI, 0, Math.PI]), w1, w2);
    this.modelGroup.add(frontGroup);
    this.truckGroup2 = frontGroup;
    this.wheels.push(w1, w2);
  }
}
