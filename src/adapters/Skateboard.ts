import * as THREE from 'three';
import gsap from 'gsap';
import type { SkateboardTick, SkateboardOptions } from '../core/types.js';
import { PhysicsRig, type RigState } from './PhysicsRig.js';
import type { Mountable, BoardRig } from './Mountable.js';
import { SkateboardAsset } from './SkateboardAsset.js';

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
// Constants
// ---------------------------------------------------------------------------

/** Jump timing from InteractiveSkateboard.tsx */
const JUMP_RISE_DURATION = 0.51;
const JUMP_FALL_DURATION = 0.43;
const JUMP_RISE_DELAY    = 0.26;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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
 *     → rearPitchPivot  (rotation.x = pitch>0 ? -pitch : 0, pivots at rear axle)
 *     → rearPitchInverse
 *     → frontPitchPivot (rotation.x = pitch<0 ? -pitch : 0, pivots at front axle)
 *     → frontPitchInverse
 *     → flipGroup (boardRoll Z, pivot at deck height)
 *         → flipInverse
 *             ├── deckLean.group (lean Z)  ← deck, griptape, bolts, baseplates
 *             ├── rearTruck  (steer Y)     ← hanger + wheels
 *             └── frontTruck (steer Y)     ← hanger + wheels
 *
 * Pitch sign convention (matches IMU telemetry):
 *   pitch > 0 → nose up   (tail down, rear axle is fixed pivot)
 *   pitch < 0 → nose down (tail up,   front axle is fixed pivot)
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
   * Hierarchy: root (yaw) → jumpGroup (Y) → modelGroup (carve Y) → …
   */
  readonly root: THREE.Group;

  private readonly jumpGroup:        THREE.Group;
  private readonly modelGroup:       THREE.Group;
  private readonly rearPitchPivot:   THREE.Group;
  private readonly rearPitchInverse: THREE.Group;
  private readonly frontPitchPivot:  THREE.Group;
  private readonly frontPitchInverse: THREE.Group;
  private readonly flipGroup:        THREE.Group;
  private readonly flipInverse:      THREE.Group;
  private readonly model:            Mountable;

  private rig: BoardRig | null = null;

  private readonly physicsRig = new PhysicsRig();

  private isJumping    = false;
  private prevAirborne = false;
  private lastTime: number | null = null;
  private currentPitch = 0;

  private readonly options: ResolvedOptions;

  constructor(options: SkateboardOptions = {}, model?: Mountable) {
    this.options = {
      dracoPath:         options.dracoPath         ?? '/draco/',
      defaultJumpHeight: options.defaultJumpHeight ?? 0.8,
      truckColor:        options.truckColor        ?? '#888888',
    };

    this.model = model ?? new SkateboardAsset({
      dracoPath:  this.options.dracoPath,
      truckColor: this.options.truckColor,
    });

    this.root              = new THREE.Group();
    this.jumpGroup         = new THREE.Group();
    this.modelGroup        = new THREE.Group();
    this.rearPitchPivot    = new THREE.Group();
    this.rearPitchInverse  = new THREE.Group();
    this.frontPitchPivot   = new THREE.Group();
    this.frontPitchInverse = new THREE.Group();
    this.flipGroup         = new THREE.Group();
    this.flipInverse       = new THREE.Group();

    this.flipGroup.add(this.flipInverse);
    this.frontPitchInverse.add(this.flipGroup);
    this.frontPitchPivot.add(this.frontPitchInverse);
    this.rearPitchInverse.add(this.frontPitchPivot);
    this.rearPitchPivot.add(this.rearPitchInverse);
    this.modelGroup.add(this.rearPitchPivot);
    this.jumpGroup.add(this.modelGroup);
    this.root.add(this.jumpGroup);
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    this.rig = await this.model.mount(this.flipInverse);

    // Position the flip pivot at deck-lean height so boardRoll rotates the
    // board around its own longitudinal centre, not the ground.
    const deckY = this.rig.deckLean.group.position.y;
    this.flipGroup.position.y   =  deckY;
    this.flipInverse.position.y = -deckY;

    // Position pitch pivots at each truck axle so rotation stays fixed at the
    // axle. When all rotations are zero the pivot+inverse pairs cancel to net
    // zero displacement, so the board stays at its rest position.
    const rearPos  = this.rig.rearTruck.position;
    const frontPos = this.rig.frontTruck.position;
    this.rearPitchPivot.position.set(0,  rearPos.y,  rearPos.z);
    this.rearPitchInverse.position.set(0, -rearPos.y, -rearPos.z);
    this.frontPitchPivot.position.set(0,  frontPos.y,  frontPos.z);
    this.frontPitchInverse.position.set(0, -frontPos.y, -frontPos.z);
  }

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  tick(data: SkateboardTick, now = performance.now()): void {
    const dt = this.lastTime !== null ? (now - this.lastTime) / 1000 : 0.016;
    this.lastTime = now;

    const rig = this.physicsRig.simulate(data, dt);
    this.applyOrientation(data, dt);
    this.applyBoardRoll(data);
    this.spinWheels(rig.wheelAngularVelocity, dt);
    this.applyCarve(rig);
    this.updateJump(data);
  }

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.model.dispose();
    gsap.killTweensOf(this.jumpGroup.position);
  }

  // ---------------------------------------------------------------------------
  // Private — orientation
  // ---------------------------------------------------------------------------

  private applyOrientation(data: SkateboardTick, dt: number): void {
    this.rig?.deckLean.lean(data.roll, 0, dt);

    // Smooth pitch then distribute to the correct axle pivot.
    // pitch > 0 → nose up  → rear axle fixed: rearPitchPivot.rotation.x = -pitch
    // pitch < 0 → nose down → front axle fixed: frontPitchPivot.rotation.x = -pitch
    const pitchFactor = 1 - Math.pow(0.001, dt * 6);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, data.pitch, pitchFactor);
    this.rearPitchPivot.rotation.x  = this.currentPitch > 0 ? -this.currentPitch : 0;
    this.frontPitchPivot.rotation.x = this.currentPitch < 0 ? -this.currentPitch : 0;

    const yawFactor = 1 - Math.pow(0.001, dt * 3);
    this.root.rotation.y = THREE.MathUtils.lerp(
      this.root.rotation.y, data.yaw, yawFactor,
    );
  }

  // ---------------------------------------------------------------------------
  // Private — wheels
  // ---------------------------------------------------------------------------

  private spinWheels(angularVelocity: number, dt: number): void {
    if (!this.rig) return;
    const delta = angularVelocity * dt;
    for (const wheel of this.rig.wheels) wheel.rotation.x += delta;
  }

  // ---------------------------------------------------------------------------
  // Private — board roll (airborne flip motion)
  // ---------------------------------------------------------------------------

  private applyBoardRoll(data: SkateboardTick): void {

    this.flipGroup.rotation.z = data.boardRoll ?? 0;

  }

  // ---------------------------------------------------------------------------
  // Private — carve
  // ---------------------------------------------------------------------------

  private applyCarve(rig: RigState): void {
    if (this.rig) {
      // Steer: front truck −θ, rear truck +θ (opposite directions; sign validated
      // against Three.js Y-axis convention where positive = counter-clockwise from above)
      this.rig.frontTruck.rotation.y = -rig.steerAngle;
      this.rig.rearTruck.rotation.y  =  rig.steerAngle;
      this.rig.truckAnimation?.animate(rig.steerAngle, this.rig.deckLean.group.rotation.z);
    }

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
}
