import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mountable, BoardRig } from './Mountable.js';
import { DeckLean } from './DeckLean.js';
import { TruckAnimation } from './TruckAnimation.js';

// ---------------------------------------------------------------------------
// Asset import
// ---------------------------------------------------------------------------
import gltfUrl from '../assets/skatie/scene.gltf?url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The Skatie model is exported in centimetres from Sketchfab (1 unit = 1 cm).
 * The SkateboardAsset model is ~3× real-world size; multiplying by 0.03 instead
 * of the true 0.01 (cm→m) matches SkatieAsset's visual proportions to it.
 */
const SCALE = 0.03;

/**
 * Y position of the deckLean pivot (in metres, after scale).
 * Calibrated so the hanger sits at the same height as in SkateboardAsset (~0.101 m).
 * Derivation: hanger_y_in_scene ≈ −1.28 raw units → −1.28 × 0.03 = −0.038 m
 *             DECK_PIVOT_Y = 0.101 + 0.038 = 0.139 m
 */
const DECK_PIVOT_Y = 0.139;

/**
 * Vertical offset applied to the sceneWrapper so wheel bottoms sit at Y = 0.
 * Derivation: wheel mesh centre in scene space ≈ −0.013 m after scale + rotation;
 *             wheel radius ≈ 2.552 raw × 0.03 = 0.077 m
 *             offset = radius − centre = 0.077 − (−0.013) = 0.090 m
 */
const WHEEL_GROUND_OFFSET = 0.090;

// ---------------------------------------------------------------------------
// SkatieAsset
// ---------------------------------------------------------------------------

/**
 * Loads the "Skatie" low-poly model and assembles a BoardRig.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Attribution (CC-BY-NC-4.0 — non-commercial use only):
 *   This work is based on "Skatie"
 *   (https://sketchfab.com/3d-models/skatie-ae3181c81cf34876b187b353291a2f96)
 *   by Kaye (https://sketchfab.com/kaye-simonson)
 *   licensed under CC-BY-NC-4.0
 *   (http://creativecommons.org/licenses/by-nc/4.0/)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Note: the model uses a non-standard axis/scale convention (Z-up, centimetres).
 * The assembly below applies corrective transforms. Visual fine-tuning
 * (scale, pivot offsets, wheel-spin axis) may require further adjustment.
 */
export class SkatieAsset implements Mountable {
  private mountedGroup: THREE.Group | null = null;

  constructor(private readonly options: { skinUrl?: string } = {}) {}

  // ---------------------------------------------------------------------------
  // Mountable
  // ---------------------------------------------------------------------------

  async mount(modelGroup: THREE.Group): Promise<BoardRig> {
    const loader = new GLTFLoader();
    const gltf   = await loader.loadAsync(gltfUrl);

    return await this.assemble(modelGroup, gltf.scene);
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

  private async assemble(modelGroup: THREE.Group, scene: THREE.Group): Promise<BoardRig> {
    // The Sketchfab_model and FBX intermediate matrices cancel each other out,
    // so GLTFLoader already delivers the scene in Y-up coordinates.
    // No additional rotation is needed — only scale (centimetres → metres).
    const sceneWrapper = new THREE.Group();
    sceneWrapper.scale.setScalar(SCALE);
    // The Skatie model is exported with its long axis along X.
    // Rotate 90° around Y to align it with Z, matching the SkateboardAsset
    // convention and ensuring DeckLean roll/pitch map to the correct axes.
    sceneWrapper.rotation.y = Math.PI / 2;
    // Lift the entire model so wheel bottoms sit at world Y = 0 (floor contact).
    sceneWrapper.position.y = WHEEL_GROUND_OFFSET;
    sceneWrapper.add(scene);

    // ── Deck lean ────────────────────────────────────────────────────────────
    // Deck, griptape, baseplates and screws lean with roll/pitch.
    const deckLean = new DeckLean();
    deckLean.group.position.y = DECK_PIVOT_Y;
    deckLean.group.add(sceneWrapper);

    // ── Truck groups ─────────────────────────────────────────────────────────
    const rearTruck  = new THREE.Group();
    const frontTruck = new THREE.Group();

    modelGroup.add(deckLean.group, rearTruck, frontTruck);
    this.mountedGroup = modelGroup;

    // Re-parent hangers and wheels into their steering groups.
    // attach() preserves world-space transforms so geometry stays in place;
    // afterwards rotation.y on each group steers hanger + wheels together.
    // Baseplates and all other fixed parts stay under deckLean/sceneWrapper.
    modelGroup.updateWorldMatrix(true, true);

    const named: Record<string, THREE.Object3D> = {};
    scene.traverse((obj) => { if (obj.name) named[obj.name] = obj; });

    const hanger1 = named['trucks_hanger_1_low'];
    const hanger2 = named['trucks_hanger_2_low'];

    // Determine front (+Z world) vs rear (-Z world) from hanger bounding-box centres.
    const hc1 = new THREE.Vector3();
    const hc2 = new THREE.Vector3();
    new THREE.Box3().setFromObject(hanger1).getCenter(hc1);
    new THREE.Box3().setFromObject(hanger2).getCenter(hc2);

    const [frontHanger, rearHanger, frontCenter, rearCenter] = hc1.z > hc2.z
      ? [hanger1, hanger2, hc1, hc2]
      : [hanger2, hanger1, hc2, hc1];

    // Place each truck group at the hanger's world centre so that rotation.y
    // pivots in place (at the axle) rather than orbiting around an offset point.
    frontTruck.position.copy(frontCenter);
    rearTruck.position.copy(rearCenter);

    frontTruck.attach(frontHanger);
    rearTruck.attach(rearHanger);

    // Assign each wheel to the nearest truck by world-space Z distance.
    for (const name of ['wheel1', 'wheel2', 'wheel3', 'wheel4']) {
      const wheelNode = named[name];
      const wc = new THREE.Vector3();
      new THREE.Box3().setFromObject(wheelNode).getCenter(wc);
      const toFront = Math.abs(wc.z - frontCenter.z);
      const toRear  = Math.abs(wc.z - rearCenter.z);
      (toFront < toRear ? frontTruck : rearTruck).attach(wheelNode);
    }

    // ── Bushings ─────────────────────────────────────────────────────────────
    // Bushings stay in sceneWrapper (fixed to baseplate). TruckAnimation drives
    // their rotation.y each frame to simulate rubber shear during steering.
    const bushing1 = named['trucks_bushing_1_low'];
    const bushing2 = named['trucks_bushing_2_low'];

    const bc1 = new THREE.Vector3();
    const bc2 = new THREE.Vector3();
    new THREE.Box3().setFromObject(bushing1).getCenter(bc1);
    new THREE.Box3().setFromObject(bushing2).getCenter(bc2);

    const [frontBushing, rearBushing] = bc1.z > bc2.z
      ? [bushing1, bushing2]
      : [bushing2, bushing1];

    // ── Wheels ───────────────────────────────────────────────────────────────
    // Wheel nodes have negative-scale matrices that cause rotation.x += delta
    // to orbit instead of spin. Visual wheels steer correctly via the truck
    // groups above; invisible dummies satisfy the BoardRig contract.
    const wheels: THREE.Object3D[] = Array.from({ length: 4 }, () => new THREE.Object3D());

    const truckAnimation = new TruckAnimation(rearTruck, frontTruck);

    if (this.options.skinUrl) {
      const tx = await new THREE.TextureLoader().loadAsync(this.options.skinUrl);
      tx.flipY      = false;
      tx.colorSpace = THREE.SRGBColorSpace;
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
            mat.map = tx;
            mat.needsUpdate = true;
          }
        }
      });
    }

    return { deckLean, wheels, rearTruck, frontTruck, truckAnimation };
  }
}
