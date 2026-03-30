import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Mock asset ?url imports
// ---------------------------------------------------------------------------
vi.mock('../assets/skateboard.gltf?url',                        () => ({ default: '/mock/skateboard.gltf' }));
vi.mock('../assets/skateboard/griptape-diffuse.webp?url',       () => ({ default: '/mock/griptape-diffuse.webp' }));
vi.mock('../assets/skateboard/griptape-roughness.webp?url',     () => ({ default: '/mock/griptape-roughness.webp' }));
vi.mock('../assets/skateboard/metal-normal.avif?url',           () => ({ default: '/mock/metal-normal.avif' }));
vi.mock('../assets/skateboard/Deck.webp?url',                   () => ({ default: '/mock/Deck.webp' }));
vi.mock('../assets/skateboard/SkateWheel1.png?url',             () => ({ default: '/mock/SkateWheel1.png' }));

vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: vi.fn().mockImplementation(() => ({
    setDecoderPath: vi.fn(),
    dispose: vi.fn(),
  })),
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn().mockImplementation(() => ({
    setDRACOLoader: vi.fn(),
    loadAsync: vi.fn().mockResolvedValue({ scene: new THREE.Group() }),
  })),
}));
vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());

// ---------------------------------------------------------------------------
import { Skateboard } from '../adapters/Skateboard.js';
import { DeckLean } from '../adapters/DeckLean.js';
import { PivotDebug } from '../debug/PivotDebug.js';
import type { Mountable, BoardRig } from '../adapters/Mountable.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeMountable(): Mountable {
  const deckLean   = new DeckLean();
  const rearTruck  = new THREE.Group();
  const frontTruck = new THREE.Group();
  rearTruck.position.set(0, 0.101, -0.617);
  frontTruck.position.set(0, 0.101, 0.617);

  return {
    mount: vi.fn().mockImplementation(async (modelGroup: THREE.Group) => {
      modelGroup.add(deckLean.group, rearTruck, frontTruck);
      return {
        deckLean, wheels: [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()],
        rearTruck, frontTruck,
        tailTip: new THREE.Vector3(0, 0.220, -1.165),
        noseTip: new THREE.Vector3(0, 0.220,  1.161),
      } satisfies BoardRig;
    }),
    dispose: vi.fn(),
  };
}

// ---------------------------------------------------------------------------

describe('PivotDebug', () => {
  let board: Skateboard;
  let debug: PivotDebug;

  beforeEach(async () => {
    board = new Skateboard({}, makeFakeMountable());
    await board.load();
    debug = new PivotDebug(board);
  });

  afterEach(() => {
    debug.dispose();
    board.dispose();
  });

  // -------------------------------------------------------------------------
  // show / hide
  // -------------------------------------------------------------------------

  describe('show() and hide()', () => {
    it('show("pitch") adds children to pitch pivot groups', () => {
      const g = board.debugGroups();
      const before = g.rearPitchPivot.children.length;
      debug.show('pitch');
      expect(g.rearPitchPivot.children.length).toBeGreaterThan(before);
    });

    it('hide("pitch") removes the added children', () => {
      const g = board.debugGroups();
      const before = g.rearPitchPivot.children.length;
      debug.show('pitch');
      debug.hide('pitch');
      expect(g.rearPitchPivot.children.length).toBe(before);
    });

    it('show("roll") adds children to rollPivot', () => {
      const g = board.debugGroups();
      const before = g.rollPivot.children.length;
      debug.show('roll');
      expect(g.rollPivot.children.length).toBeGreaterThan(before);
    });

    it('show("yaw") adds children to root', () => {
      const before = board.root.children.length;
      debug.show('yaw');
      expect(board.root.children.length).toBeGreaterThan(before);
    });

    it('show("tips") adds children to pitch pivot groups for tip markers', () => {
      const g = board.debugGroups();
      const before = g.rearPitchPivot.children.length;
      debug.show('tips');
      expect(g.rearPitchPivot.children.length).toBeGreaterThan(before);
    });

    it('calling show() twice does not duplicate helpers', () => {
      const g = board.debugGroups();
      debug.show('pitch');
      const count = g.rearPitchPivot.children.length;
      debug.show('pitch');
      expect(g.rearPitchPivot.children.length).toBe(count);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('removes all helpers from all groups', () => {
      const g = board.debugGroups();
      debug.show('pitch');
      debug.show('roll');
      debug.show('yaw');
      debug.show('tips');
      debug.dispose();
      // After dispose, groups should be back to pre-debug state
      // (only the model children, no debug helpers)
      // rearPitchPivot's only structural child is rearPitchInverse
      expect(g.rearPitchPivot.children.length).toBe(1);
    });
  });
});
