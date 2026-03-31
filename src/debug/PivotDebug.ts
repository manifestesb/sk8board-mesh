import * as THREE from 'three';
import type { Debuggable, DebugGroups } from '../adapters/Skateboard.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPHERE_RADIUS  = 0.015;
const SPHERE_DETAIL  = 8;
const AXIS_LENGTH    = 0.3;
const ARC_SEGMENTS   = 32;

const COLOR_PITCH    = 0xff3333;
const COLOR_ROLL     = 0x3333ff;
const COLOR_YAW      = 0x33ff33;
const COLOR_CONTACT  = 0xff8833;
const COLOR_TAIL     = 0xffff33;
const COLOR_NOSE     = 0x33ffff;
const COLOR_STEER    = 0xff33ff;

type Layer = 'pitch' | 'roll' | 'yaw' | 'tips' | 'steer';

// ---------------------------------------------------------------------------
// PivotDebug
// ---------------------------------------------------------------------------

/**
 * Decorator that adds visual debug helpers (pivot spheres, axis lines,
 * angle arcs) directly as children of a Skateboard's internal groups.
 *
 * Because helpers are parented to the groups they decorate, they inherit
 * transforms automatically.
 */
export class PivotDebug {
  private readonly groups: DebugGroups;
  private readonly helpers = new Map<Layer, THREE.Object3D[]>();
  private readonly materials: THREE.Material[] = [];

  constructor(board: Debuggable) {
    this.groups = board.debugGroups();
  }

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  show(layer: Layer): void {
    if (this.helpers.has(layer)) return;

    const objects: THREE.Object3D[] = [];

    switch (layer) {
      case 'pitch':  this.buildPitch(objects); break;
      case 'roll':   this.buildRoll(objects);  break;
      case 'yaw':    this.buildYaw(objects);   break;
      case 'tips':   this.buildTips(objects);  break;
      case 'steer':  this.buildSteer(objects); break;
    }

    this.helpers.set(layer, objects);
  }

  hide(layer: Layer): void {
    const objects = this.helpers.get(layer);
    if (!objects) return;
    for (const obj of objects) obj.removeFromParent();
    this.helpers.delete(layer);
  }

  dispose(): void {
    for (const [layer] of this.helpers) this.hide(layer);
    this.helpers.clear();
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
  }

  // -------------------------------------------------------------------------
  // Private — builders
  // -------------------------------------------------------------------------

  private buildPitch(out: THREE.Object3D[]): void {
    const g = this.groups;

    // Rear pitch pivot — sphere + X-axis line
    this.addSphere(g.rearPitchPivot, COLOR_PITCH, out);
    this.addAxisLine(g.rearPitchPivot, 'x', COLOR_PITCH, out);

    // Front pitch pivot — sphere + X-axis line
    this.addSphere(g.frontPitchPivot, COLOR_PITCH, out);
    this.addAxisLine(g.frontPitchPivot, 'x', COLOR_PITCH, out);

    // Tail contact pivot — sphere + contact limit arc
    this.addSphere(g.tailContactPivot, COLOR_CONTACT, out);
    if (g.tailContactAngle < Infinity) {
      this.addArc(g.tailContactPivot, 'x', g.tailContactAngle, COLOR_CONTACT, out);
    }

    // Nose contact pivot — sphere + contact limit arc
    this.addSphere(g.noseContactPivot, COLOR_CONTACT, out);
    if (g.noseContactAngle < Infinity) {
      this.addArc(g.noseContactPivot, 'x', g.noseContactAngle, COLOR_CONTACT, out);
    }
  }

  private buildRoll(out: THREE.Object3D[]): void {
    const pivot = this.groups.rollPivot;
    this.addSphere(pivot, COLOR_ROLL, out);
    this.addAxisLine(pivot, 'z', COLOR_ROLL, out);
  }

  private buildYaw(out: THREE.Object3D[]): void {
    this.addSphere(this.groups.root, COLOR_YAW, out);
    this.addAxisLine(this.groups.root, 'y', COLOR_YAW, out);
  }

  private buildSteer(out: THREE.Object3D[]): void {
    const g = this.groups;
    if (g.rearTruck) {
      this.addSphere(g.rearTruck, COLOR_STEER, out);
      this.addAxisLine(g.rearTruck, 'y', COLOR_STEER, out);
    }
    if (g.frontTruck) {
      this.addSphere(g.frontTruck, COLOR_STEER, out);
      this.addAxisLine(g.frontTruck, 'y', COLOR_STEER, out);
    }
  }

  private buildTips(out: THREE.Object3D[]): void {
    const g = this.groups;
    const radius = g.deckHalfThickness;
    if (g.tailTip) {
      const offset = g.tailTip.clone().sub(g.rearPitchPivot.position);
      this.addSphere(g.rearPitchPivot, COLOR_TAIL, out, offset, radius);
      this.addDropLine(g.rearPitchPivot, offset, COLOR_TAIL, out);
    }
    if (g.noseTip) {
      const offset = g.noseTip.clone().sub(g.frontPitchPivot.position);
      this.addSphere(g.frontPitchPivot, COLOR_NOSE, out, offset, radius);
      this.addDropLine(g.frontPitchPivot, offset, COLOR_NOSE, out);
    }
  }

  // -------------------------------------------------------------------------
  // Private — primitives
  // -------------------------------------------------------------------------

  private addSphere(
    parent: THREE.Group, color: number, out: THREE.Object3D[],
    offset?: THREE.Vector3, radius = SPHERE_RADIUS,
  ): void {
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: radius > SPHERE_RADIUS, opacity: radius > SPHERE_RADIUS ? 0.4 : 1 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, SPHERE_DETAIL, SPHERE_DETAIL), mat);
    mesh.renderOrder = 999;
    if (offset) mesh.position.copy(offset);
    parent.add(mesh);
    out.push(mesh);
  }

  private addAxisLine(parent: THREE.Group, axis: 'x' | 'y' | 'z', color: number, out: THREE.Object3D[]): void {
    const points = [new THREE.Vector3(), new THREE.Vector3()];
    points[0][axis] = -AXIS_LENGTH;
    points[1][axis] =  AXIS_LENGTH;
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
    this.materials.push(mat);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
    line.renderOrder = 999;
    parent.add(line);
    out.push(line);
  }

  private addArc(
    parent: THREE.Group, axis: 'x' | 'y' | 'z',
    angle: number, color: number, out: THREE.Object3D[],
  ): void {
    const radius = AXIS_LENGTH * 0.6;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = (i / ARC_SEGMENTS) * angle;
      const p = new THREE.Vector3();
      // Arc in the plane perpendicular to the rotation axis
      if (axis === 'x') { p.y = Math.cos(t) * radius; p.z = -Math.sin(t) * radius; }
      if (axis === 'y') { p.x = Math.cos(t) * radius; p.z =  Math.sin(t) * radius; }
      if (axis === 'z') { p.x = Math.cos(t) * radius; p.y =  Math.sin(t) * radius; }
      points.push(p);
    }

    const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
    this.materials.push(mat);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
    line.renderOrder = 999;
    parent.add(line);
    out.push(line);
  }

  private addDropLine(
    parent: THREE.Group, offset: THREE.Vector3, color: number, out: THREE.Object3D[],
  ): void {
    const top = offset.clone();
    const bottom = offset.clone();
    bottom.y = -parent.position.y; // drop to Y=0 in world space
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, opacity: 0.5, transparent: true });
    this.materials.push(mat);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, bottom]), mat);
    line.renderOrder = 999;
    parent.add(line);
    out.push(line);
  }
}
