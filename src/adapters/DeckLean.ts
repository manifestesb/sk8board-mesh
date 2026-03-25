import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface Leanable {
  lean(roll: number, pitch: number, dt: number): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum lateral lean before the deck edge contacts the wheels (wheel bite).
 * Value validated empirically against the GLTF model geometry.
 */
export const MAX_LEAN_ANGLE = 0.23; // rad (~13°)

// ---------------------------------------------------------------------------
// DeckLean
// ---------------------------------------------------------------------------

/**
 * Manages the lean group for the deck assembly (deck, griptape, baseplates).
 * Only these components rotate with roll/pitch; hangers and wheels remain flat.
 *
 * Roll is clamped to ±MAX_LEAN_ANGLE to prevent wheel bite.
 * The `group` must be added to the scene hierarchy by the caller.
 */
export class DeckLean implements Leanable {
  readonly group = new THREE.Group();

  lean(roll: number, pitch: number, dt: number): void {
    const clampedRoll = Math.max(-MAX_LEAN_ANGLE, Math.min(MAX_LEAN_ANGLE, roll));
    const factor = 1 - Math.pow(0.001, dt * 6);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, clampedRoll, factor);
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, pitch,       factor);
  }
}
