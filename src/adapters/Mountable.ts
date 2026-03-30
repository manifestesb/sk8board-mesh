import * as THREE from 'three';
import type { Leanable } from './DeckLean.js';

// ---------------------------------------------------------------------------
// BoardRig — assembled model rig returned by Mountable.mount()
// ---------------------------------------------------------------------------

/**
 * The mounted rig that Skateboard needs to drive the model.
 * Returned by Mountable.mount() after all geometry is assembled.
 */
export interface BoardRig {
  /** Deck lean controller — already added to modelGroup by the mountable */
  deckLean:        Leanable & { group: THREE.Group };
  /** All 4 wheel objects — spun on their rotation.x axis */
  wheels:          THREE.Object3D[];
  /** Rear truck group — rotated on Y axis for steering */
  rearTruck:       THREE.Group;
  /** Front truck group — rotated on Y axis for steering (opposite sign) */
  frontTruck:      THREE.Group;
  /** Optional per-frame truck accessory animation (bushings, hanger drift) */
  truckAnimation?: TruckAnimatable;
  /** Tail tip position in model-local space (bottom of deck at tail extremity) */
  tailTip?: THREE.Vector3;
  /** Nose tip position in model-local space (bottom of deck at nose extremity) */
  noseTip?: THREE.Vector3;
  /** Half-thickness of the deck (radius for debug contact spheres) */
  deckHalfThickness?: number;
}

// ---------------------------------------------------------------------------
// TruckAnimatable — optional capability for truck accessory animation
// ---------------------------------------------------------------------------

/**
 * Drives per-frame visual animation of truck accessories (bushings, hanger
 * lateral drift) in response to the current steer angle.
 * Implemented by model-specific adapters that need it (e.g. SkatieAsset).
 */
export interface TruckAnimatable {
  animate(steerAngle: number, leanAngle: number): void;
}

// ---------------------------------------------------------------------------
// Mountable — interface for 3D model adapters
// ---------------------------------------------------------------------------

/**
 * Contract for a 3D skateboard model.
 * Implementations load assets, build materials, and assemble the Three.js
 * hierarchy into the provided modelGroup.
 *
 * Usage:
 *   const rig = await mountable.mount(modelGroup);
 *   // modelGroup now contains deckLean.group, rearTruck, frontTruck
 *   // Skateboard drives them via rig.*
 */
export interface Mountable {
  /**
   * Loads assets and assembles the model hierarchy into modelGroup.
   * Adds deckLean.group, rearTruck, and frontTruck as children of modelGroup.
   */
  mount(modelGroup: THREE.Group): Promise<BoardRig>;
  /** Releases all geometry and material GPU resources. */
  dispose(): void;
}
