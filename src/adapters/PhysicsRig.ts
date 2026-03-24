import type { SkateboardTick } from '../core/types.js';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface RigState {
  wheelAngularVelocity: number; // rad/s — uniform for all 4 wheels
}

export interface Simulatable {
  simulate(tick: SkateboardTick, dt: number): RigState;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Real skateboard wheel radius in metres (52mm wheel) */
const REAL_WHEEL_RADIUS = 0.026;

/** Minimum visual roll speed at rest — keeps wheels alive when speed = 0 */
const IDLE_SPEED = 0.3; // m/s

// ---------------------------------------------------------------------------
// PhysicsRig
// ---------------------------------------------------------------------------

export class PhysicsRig implements Simulatable {
  simulate(tick: SkateboardTick, _dt: number): RigState {
    if (tick.airborne) {
      return { wheelAngularVelocity: 0 };
    }

    const effectiveSpeed = Math.max(tick.speed, IDLE_SPEED);
    return { wheelAngularVelocity: effectiveSpeed / REAL_WHEEL_RADIUS };
  }

  reset(): void {}
}
