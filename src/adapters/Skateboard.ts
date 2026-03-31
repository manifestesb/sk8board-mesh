import * as THREE from 'three';
import gsap from 'gsap';
import type { SkateboardTick, SkateboardOptions } from '../core/types.js';
import { MAX_LEAN_ANGLE } from './DeckLean.js';
import { GroundContact } from '../core/GroundContact.js';
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

export interface DebugGroups {
  root:              THREE.Group;
  rearPitchPivot:    THREE.Group;
  frontPitchPivot:   THREE.Group;
  tailContactPivot:  THREE.Group;
  noseContactPivot:  THREE.Group;
  rollPivot:         THREE.Group;
  flipGroup:         THREE.Group;
  deckLeanGroup:     THREE.Group | null;
  rearTruck:         THREE.Group | null;
  frontTruck:        THREE.Group | null;
  tailTip:            THREE.Vector3 | null;
  noseTip:            THREE.Vector3 | null;
  deckHalfThickness:  number;
  tailContactAngle:   number;
  noseContactAngle:   number;
}

export interface Debuggable {
  debugGroups(): DebugGroups;
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
 *     → rearPitchPivot  (pitch > 0, pivots at rear axle)
 *     → rearPitchInverse
 *     → tailContactPivot  (overflow when tail touches ground)
 *     → tailContactInverse
 *     → frontPitchPivot (pitch < 0, pivots at front axle)
 *     → frontPitchInverse
 *     → noseContactPivot  (overflow when nose touches ground)
 *     → noseContactInverse
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
 * Ground contact:
 *   When pitch exceeds the contact angle, the deck tip reaches Y = 0.
 *   Beyond that angle the pitch pivot shifts from the truck axle to the
 *   tip contact point, so the board rotates around the ground instead of
 *   clipping through it.
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
export class Skateboard implements Loadable, Tickable, Disposable, Debuggable {
  /**
   * Root Three.js group — add this to your scene.
   * Hierarchy: root (yaw) → jumpGroup (Y) → modelGroup (carve Y) → …
   */
  readonly root: THREE.Group;

  private readonly jumpGroup:           THREE.Group;
  private readonly modelGroup:          THREE.Group;
  private readonly rearPitchPivot:      THREE.Group;
  private readonly rearPitchInverse:    THREE.Group;
  private readonly tailContactPivot:    THREE.Group;
  private readonly tailContactInverse:  THREE.Group;
  private readonly frontPitchPivot:     THREE.Group;
  private readonly frontPitchInverse:   THREE.Group;
  private readonly noseContactPivot:    THREE.Group;
  private readonly noseContactInverse:  THREE.Group;
  private readonly rollPivot:           THREE.Group;
  private readonly rollInverse:         THREE.Group;
  private readonly flipGroup:           THREE.Group;
  private readonly flipInverse:         THREE.Group;
  private readonly model:               Mountable;

  private rig: BoardRig | null = null;

  private readonly physicsRig    = new PhysicsRig();
  private readonly groundContact = new GroundContact();

  private isJumping    = false;
  private prevAirborne = false;
  private lastTime: number | null = null;
  private currentPitch = 0;
  private rearSteer    = 0;
  private frontSteer   = 0;

  /** Contact angle thresholds — Infinity when the adapter does not provide tip data. */
  private tailContactAngle = Infinity;
  private noseContactAngle = Infinity;

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

    this.root                = new THREE.Group();
    this.jumpGroup           = new THREE.Group();
    this.modelGroup          = new THREE.Group();
    this.rearPitchPivot      = new THREE.Group();
    this.rearPitchInverse    = new THREE.Group();
    this.tailContactPivot    = new THREE.Group();
    this.tailContactInverse  = new THREE.Group();
    this.frontPitchPivot     = new THREE.Group();
    this.frontPitchInverse   = new THREE.Group();
    this.noseContactPivot    = new THREE.Group();
    this.noseContactInverse  = new THREE.Group();
    this.rollPivot           = new THREE.Group();
    this.rollInverse         = new THREE.Group();
    this.flipGroup           = new THREE.Group();
    this.flipInverse         = new THREE.Group();

    this.flipGroup.add(this.flipInverse);
    this.rollPivot.add(this.rollInverse);
    this.noseContactInverse.add(this.flipGroup);
    this.noseContactPivot.add(this.noseContactInverse);
    this.frontPitchInverse.add(this.noseContactPivot);
    this.frontPitchPivot.add(this.frontPitchInverse);
    this.tailContactInverse.add(this.frontPitchPivot);
    this.tailContactPivot.add(this.tailContactInverse);
    this.rearPitchInverse.add(this.tailContactPivot);
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

    // Only the deck assembly leans — trucks stay flat in flipInverse so
    // their wheels remain on the ground. Steering (rotation.y) is applied
    // independently on each truck group.
    const deckY = this.rig.deckLean.group.position.y;
    this.rollInverse.add(this.rig.deckLean.group);
    this.flipInverse.add(this.rollPivot);
    this.rollPivot.position.y   =  deckY;
    this.rollInverse.position.y = -deckY;

    // Position the flip pivot at deck-lean height so boardRoll rotates the
    // board around its own longitudinal centre, not the ground.
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

    // Ground contact pivots — positioned at the tip rest positions so that
    // when the pitch rotation brings the tip to Y = 0, additional rotation
    // happens around the ground contact point.
    if (this.rig.tailTip) {
      this.tailContactAngle = this.groundContact.contactAngle(
        rearPos.y, rearPos.z, this.rig.tailTip.y, this.rig.tailTip.z,
      );
      this.tailContactPivot.position.set(0,  this.rig.tailTip.y,  this.rig.tailTip.z);
      this.tailContactInverse.position.set(0, -this.rig.tailTip.y, -this.rig.tailTip.z);
    }
    if (this.rig.noseTip) {
      this.noseContactAngle = this.groundContact.contactAngle(
        frontPos.y, frontPos.z, this.rig.noseTip.y, this.rig.noseTip.z,
      );
      this.noseContactPivot.position.set(0,  this.rig.noseTip.y,  this.rig.noseTip.z);
      this.noseContactInverse.position.set(0, -this.rig.noseTip.y, -this.rig.noseTip.z);
    }
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
    this.applyCarve(rig, dt, data.airborne);
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
  // Debuggable
  // ---------------------------------------------------------------------------

  debugGroups(): DebugGroups {
    return {
      root:              this.root,
      rearPitchPivot:    this.rearPitchPivot,
      frontPitchPivot:   this.frontPitchPivot,
      tailContactPivot:  this.tailContactPivot,
      noseContactPivot:  this.noseContactPivot,
      rollPivot:         this.rollPivot,
      flipGroup:         this.flipGroup,
      deckLeanGroup:     this.rig?.deckLean.group ?? null,
      rearTruck:         this.rig?.rearTruck ?? null,
      frontTruck:        this.rig?.frontTruck ?? null,
      tailTip:            this.rig?.tailTip ?? null,
      noseTip:            this.rig?.noseTip ?? null,
      deckHalfThickness:  this.rig?.deckHalfThickness ?? 0.008,
      tailContactAngle:   this.tailContactAngle,
      noseContactAngle:  this.noseContactAngle,
    };
  }

  /**
   * Live-adjusts a tip position and recomputes the contact angle.
   * Use this from a debug UI to find the correct offset values, then
   * hardcode them in the adapter constants.
   */
  tuneTip(which: 'tail' | 'nose', y: number, z: number): void {
    if (which === 'tail') {
      const rearPos = this.rearPitchPivot.position;
      this.tailContactPivot.position.set(0, y, z);
      this.tailContactInverse.position.set(0, -y, -z);
      this.tailContactAngle = this.groundContact.contactAngle(rearPos.y, rearPos.z, y, z);
      if (this.rig?.tailTip) this.rig.tailTip.set(0, y, z);
    } else {
      const frontPos = this.frontPitchPivot.position;
      this.noseContactPivot.position.set(0, y, z);
      this.noseContactInverse.position.set(0, -y, -z);
      this.noseContactAngle = this.groundContact.contactAngle(frontPos.y, frontPos.z, y, z);
      if (this.rig?.noseTip) this.rig.noseTip.set(0, y, z);
    }
  }

  /**
   * Live-adjusts the steer visual scale for debug tuning.
   */
  tuneSteerScale(scale: number): void {
    this.physicsRig.tuneSteerScale(scale);
  }

  /**
   * Live-adjusts the roll pivot height. Updates rollPivot, rollInverse,
   * flipGroup and flipInverse so the rotation centre moves without
   * shifting the deck rest position.
   */
  tuneRollPivot(y: number): void {
    this.rollPivot.position.y   =  y;
    this.rollInverse.position.y = -y;
    this.flipGroup.position.y   =  y;
    this.flipInverse.position.y = -y;
  }

  // ---------------------------------------------------------------------------
  // Private — orientation
  // ---------------------------------------------------------------------------

  private applyOrientation(data: SkateboardTick, dt: number): void {
    // Roll — smoothed & clamped, applied to rollPivot (decoupled from deck position).
    const clampedRoll = Math.max(-MAX_LEAN_ANGLE, Math.min(MAX_LEAN_ANGLE, data.roll));
    const rollFactor  = 1 - Math.pow(0.001, dt * 6);
    this.rollPivot.rotation.z = THREE.MathUtils.lerp(this.rollPivot.rotation.z, clampedRoll, rollFactor);

    // Smooth pitch then distribute to the correct axle pivot.
    const pitchFactor = 1 - Math.pow(0.001, dt * 6);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, data.pitch, pitchFactor);

    if (this.currentPitch > 0) {
      // Nose up — rear axle pivot, possibly constrained by tail contact.
      const skipConstraint = data.airborne || this.tailContactAngle === Infinity;
      if (!skipConstraint && this.currentPitch > this.tailContactAngle) {
        const [pivot, overflow] = this.groundContact.constrain(this.currentPitch, this.tailContactAngle);
        this.rearPitchPivot.rotation.x   = -pivot;
        this.tailContactPivot.rotation.x = -overflow;
      } else {
        this.rearPitchPivot.rotation.x   = -this.currentPitch;
        this.tailContactPivot.rotation.x = 0;
      }
      this.frontPitchPivot.rotation.x  = 0;
      this.noseContactPivot.rotation.x = 0;
    } else if (this.currentPitch < 0) {
      // Nose down — front axle pivot, possibly constrained by nose contact.
      const absPitch = -this.currentPitch;
      const skipConstraint = data.airborne || this.noseContactAngle === Infinity;
      if (!skipConstraint && absPitch > this.noseContactAngle) {
        const [pivot, overflow] = this.groundContact.constrain(absPitch, this.noseContactAngle);
        this.frontPitchPivot.rotation.x  = pivot;
        this.noseContactPivot.rotation.x = overflow;
      } else {
        this.frontPitchPivot.rotation.x  = -this.currentPitch;
        this.noseContactPivot.rotation.x = 0;
      }
      this.rearPitchPivot.rotation.x   = 0;
      this.tailContactPivot.rotation.x = 0;
    } else {
      this.rearPitchPivot.rotation.x   = 0;
      this.tailContactPivot.rotation.x = 0;
      this.frontPitchPivot.rotation.x  = 0;
      this.noseContactPivot.rotation.x = 0;
    }

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

  private applyCarve(rig: RigState, dt: number, airborne: boolean): void {
    if (this.rig) {
      // A truck only steers when its wheels touch the ground — the rider's
      // weight compresses the bushing. When airborne or in manual, the
      // bushing decompresses and the steer angle springs back to centre.
      const rearGrounded  = !airborne && !(this.currentPitch < 0 && -this.currentPitch > this.noseContactAngle);
      const frontGrounded = !airborne && !(this.currentPitch > 0 && this.currentPitch > this.tailContactAngle);

      const rearTarget  = rearGrounded  ?  rig.steerAngle : 0;
      const frontTarget = frontGrounded ? -rig.steerAngle : 0;

      const factor = 1 - Math.pow(0.001, dt * 6);
      this.rearSteer  = THREE.MathUtils.lerp(this.rearSteer,  rearTarget,  factor);
      this.frontSteer = THREE.MathUtils.lerp(this.frontSteer, frontTarget, factor);

      this.rig.rearTruck.rotation.y  = this.rearSteer;
      this.rig.frontTruck.rotation.y = this.frontSteer;

      this.rig.truckAnimation?.animate(rig.steerAngle, this.rollPivot.rotation.z);
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

    this.jumpGroup.position.y = Math.max(0, this.jumpGroup.position.y);
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
