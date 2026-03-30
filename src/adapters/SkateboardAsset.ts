import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { Mountable, BoardRig } from './Mountable.js';
import { DeckLean } from './DeckLean.js';

// ---------------------------------------------------------------------------
// Asset imports — resolved by Vite (or compatible bundler) at build time
// ---------------------------------------------------------------------------
import gltfUrl        from '../assets/skateboard/skateboard.gltf?url';
import gripDiffuseUrl from '../assets/skateboard/griptape-diffuse.webp?url';
import gripRoughUrl   from '../assets/skateboard/griptape-roughness.webp?url';
import metalNormalUrl from '../assets/skateboard/metal-normal.avif?url';
import deckUrl        from '../assets/skateboard/Deck.webp?url';
import wheelUrl       from '../assets/skateboard/SkateWheel1.png?url';

// ---------------------------------------------------------------------------
// Constants derived from the GLTF model geometry
// ---------------------------------------------------------------------------

/** Y position of the hanger groups — used as the deck lean pivot so that the
 *  baseplate rotates around the same height as the kingpin/pivot-cup connection,
 *  keeping the baseplate↔hanger joint visually aligned during lean. */
const DECK_PIVOT_Y = 0.141;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GLTFNodes {
  GripTape:        THREE.Object3D;
  WheelFrontRight: THREE.Object3D;
  WheelFrontLeft:  THREE.Object3D;
  WheelRearRight:  THREE.Object3D;
  WheelRearLeft:   THREE.Object3D;
  Deck:            THREE.Object3D;
  Baseplates:      THREE.Object3D;
  TruckRear:       THREE.Object3D;
  TruckFront:      THREE.Object3D;
}

interface Materials {
  gripTape: THREE.MeshStandardMaterial;
  deck:     THREE.MeshStandardMaterial;
  wheel:    THREE.MeshStandardMaterial;
  truck:    THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------------------
// SkateboardAsset
// ---------------------------------------------------------------------------

/**
 * Loads the bundled `skateboard.gltf` model and assembles the Three.js
 * hierarchy into the provided modelGroup.
 *
 * Implements Mountable — pass an instance to the Skateboard constructor
 * to use this model, or rely on it as the default.
 */
export class SkateboardAsset implements Mountable {
  private mountedGroup: THREE.Group | null = null;

  constructor(private readonly options: {
    dracoPath:  string;
    truckColor: string;
  }) {}

  // ---------------------------------------------------------------------------
  // Mountable
  // ---------------------------------------------------------------------------

  async mount(modelGroup: THREE.Group): Promise<BoardRig> {
    const draco = new DRACOLoader();
    draco.setDecoderPath(this.options.dracoPath);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const gltf = await loader.loadAsync(gltfUrl);
    draco.dispose();

    const nodes = this.extractNodes(gltf.scene);
    const mats  = this.buildMaterials();

    return this.assemble(modelGroup, nodes, mats);
  }

  dispose(): void {
    this.mountedGroup?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.mountedGroup = null;
  }

  // ---------------------------------------------------------------------------
  // Private — assembly
  // ---------------------------------------------------------------------------

  private assemble(
    modelGroup: THREE.Group,
    nodes: GLTFNodes,
    mats: Materials,
  ): BoardRig {
    const mesh = (
      node:     THREE.Object3D,
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

    // Deck assembly — leans with roll/pitch.
    // Positions are relative to DECK_PIVOT_Y so the rotation pivots at the
    // hanger connection height, keeping the baseplate↔hanger joint aligned.
    const P = DECK_PIVOT_Y;
    const deckLean = new DeckLean();
    deckLean.group.position.y = DECK_PIVOT_Y;
    deckLean.group.add(
      mesh(nodes.GripTape,   mats.gripTape, [0, 0.286 - P, -0.002]),
      mesh(nodes.Deck,       mats.deck,     [0, 0.271 - P, -0.002]),
      mesh(nodes.Baseplates, mats.truck,    [0, 0.211 - P,  0]),
    );

    // Rear truck group — stays flat, steers.
    const rearTruck = new THREE.Group();
    rearTruck.position.set(0, 0.101, -0.617);
    const wRearRight = mesh(nodes.WheelRearRight, mats.wheel, [ 0.237, -0.015, -0.018], [Math.PI, 0, Math.PI]);
    const wRearLeft  = mesh(nodes.WheelRearLeft,  mats.wheel, [-0.238, -0.015, -0.018], [Math.PI, 0, Math.PI]);
    rearTruck.add(mesh(nodes.TruckRear, mats.truck, [0, 0, 0]), wRearRight, wRearLeft);

    // Front truck group — stays flat, steers.
    const frontTruck = new THREE.Group();
    frontTruck.position.set(0, 0.101, 0.617);
    const wFrontRight = mesh(nodes.WheelFrontRight, mats.wheel, [ 0.238, -0.015, 0.018]);
    const wFrontLeft  = mesh(nodes.WheelFrontLeft,  mats.wheel, [-0.237, -0.015, 0.018]);
    frontTruck.add(mesh(nodes.TruckFront, mats.truck, [0, 0, 0], [Math.PI, 0, Math.PI]), wFrontRight, wFrontLeft);

    modelGroup.add(deckLean.group, rearTruck, frontTruck);
    this.mountedGroup = modelGroup;

    return {
      deckLean,
      wheels:     [wRearRight, wRearLeft, wFrontRight, wFrontLeft],
      rearTruck,
      frontTruck,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — node extraction
  // ---------------------------------------------------------------------------

  private extractNodes(scene: THREE.Group): GLTFNodes {
    const all: Record<string, THREE.Object3D> = {};
    scene.traverse((obj) => { if (obj.name) all[obj.name] = obj; });

    const required = [
      'GripTape', 'WheelFrontRight', 'WheelFrontLeft', 'WheelRearRight', 'WheelRearLeft',
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

  // ---------------------------------------------------------------------------
  // Private — materials
  // ---------------------------------------------------------------------------

  private buildMaterials(): Materials {
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
}
