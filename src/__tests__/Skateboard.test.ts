import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Mock asset ?url imports — needed because Skateboard imports SkateboardAsset
// which statically imports these URLs (even though we inject a fake Mountable)
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
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { Skateboard } from '../adapters/Skateboard.js';
import { DeckLean } from '../adapters/DeckLean.js';
import type { Mountable, BoardRig } from '../adapters/Mountable.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTick(overrides = {}) {
  return {
    roll: 0, pitch: 0, yaw: 0, speed: 0, airborne: false,
    ...overrides,
  };
}

/** Creates a fake Mountable that populates modelGroup with deckLean + trucks */
function makeFakeMountable(): Mountable {
  const deckLean   = new DeckLean();
  const rearTruck  = new THREE.Group();
  const frontTruck = new THREE.Group();
  const wheels     = [
    new THREE.Object3D(), new THREE.Object3D(),
    new THREE.Object3D(), new THREE.Object3D(),
  ];

  return {
    mount: vi.fn().mockImplementation(async (modelGroup: THREE.Group) => {
      modelGroup.add(deckLean.group, rearTruck, frontTruck);
      return { deckLean, wheels, rearTruck, frontTruck } satisfies BoardRig;
    }),
    dispose: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Hierarchy path helpers (root → … → node)
//
//   root[0]             = jumpGroup
//   root[0][0]          = modelGroup
//   root[0][0][0]       = rearPitchPivot
//   root[0][0][0][0]    = rearPitchInverse
//   root[0][0][0][0][0] = frontPitchPivot
//   root[0][0][0][0][0][0]    = frontPitchInverse
//   root[0][0][0][0][0][0][0] = flipGroup
//   root[0][0][0][0][0][0][0][0] = flipInverse
// ---------------------------------------------------------------------------

type C = { children: THREE.Object3D[] };
const c = (n: C) => n.children[0];

function getJumpGroup(board: Skateboard)         { return c(board.root) as THREE.Group; }
function getModelGroup(board: Skateboard)        { return c(getJumpGroup(board)) as THREE.Group; }
function getRearPitchPivot(board: Skateboard)    { return c(getModelGroup(board)) as THREE.Group; }
function getRearPitchInverse(board: Skateboard)  { return c(getRearPitchPivot(board)) as THREE.Group; }
function getFrontPitchPivot(board: Skateboard)   { return c(getRearPitchInverse(board)) as THREE.Group; }
function getFrontPitchInverse(board: Skateboard) { return c(getFrontPitchPivot(board)) as THREE.Group; }
function getFlipGroup(board: Skateboard)         { return c(getFrontPitchInverse(board)) as THREE.Group; }
function getFlipInverse(board: Skateboard)       { return c(getFlipGroup(board)) as THREE.Group; }

describe('Skateboard', () => {
  let board: Skateboard;

  beforeEach(() => {
    board = new Skateboard({}, makeFakeMountable());
  });

  afterEach(() => {
    board.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor — group hierarchy
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('exposes a root THREE.Group', () => {
      expect(board.root).toBeInstanceOf(THREE.Group);
    });

    it('root has exactly one child (jumpGroup)', () => {
      expect(board.root.children).toHaveLength(1);
    });

    it('jumpGroup has exactly one child (modelGroup)', () => {
      expect(getJumpGroup(board).children).toHaveLength(1);
    });

    it('modelGroup has exactly one child (rearPitchPivot)', () => {
      expect(getModelGroup(board).children).toHaveLength(1);
    });

    it('rearPitchPivot has exactly one child (rearPitchInverse)', () => {
      expect(getRearPitchPivot(board).children).toHaveLength(1);
    });

    it('rearPitchInverse has exactly one child (frontPitchPivot)', () => {
      expect(getRearPitchInverse(board).children).toHaveLength(1);
    });

    it('frontPitchPivot has exactly one child (frontPitchInverse)', () => {
      expect(getFrontPitchPivot(board).children).toHaveLength(1);
    });

    it('frontPitchInverse has exactly one child (flipGroup)', () => {
      expect(getFrontPitchInverse(board).children).toHaveLength(1);
    });

    it('flipGroup has exactly one child (flipInverse)', () => {
      expect(getFlipGroup(board).children).toHaveLength(1);
    });

    it('flipInverse starts empty before load', () => {
      expect(getFlipInverse(board).children).toHaveLength(0);
    });

    it('root starts at origin', () => {
      expect(board.root.position.x).toBe(0);
      expect(board.root.position.y).toBe(0);
      expect(board.root.position.z).toBe(0);
    });

    it('jumpGroup starts at y=0 (on the ground)', () => {
      expect(getJumpGroup(board).position.y).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // load()
  // ---------------------------------------------------------------------------

  describe('load()', () => {
    it('resolves without throwing', async () => {
      await expect(board.load()).resolves.toBeUndefined();
    });

    it('adds deckLean.group, rearTruck, frontTruck to flipInverse after load', async () => {
      await board.load();
      // deckLean.group + rearTruck + frontTruck
      expect(getFlipInverse(board).children.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — orientation
  // ---------------------------------------------------------------------------

  describe('tick() orientation', () => {
    beforeEach(async () => {
      await board.load();
    });

    it('does not throw with default tick', () => {
      expect(() => board.tick(makeTick())).not.toThrow();
    });

    it('lerps root rotation.y toward yaw', () => {
      board.tick(makeTick({ yaw: 1.0 }), 0);
      board.tick(makeTick({ yaw: 1.0 }), 100); // 100ms later
      expect(board.root.rotation.y).toBeGreaterThan(0);
    });

    it('lerps deckGroup rotation.z toward roll', () => {
      const deckGroup = getFlipInverse(board).children[0] as THREE.Group;
      board.tick(makeTick({ roll: 0.5 }), 0);
      board.tick(makeTick({ roll: 0.5 }), 100);
      expect(deckGroup.rotation.z).toBeGreaterThan(0);
    });

    it('rearPitchPivot.rotation.x becomes negative for positive pitch (nose up)', () => {
      board.tick(makeTick({ pitch: 0.3 }), 0);
      board.tick(makeTick({ pitch: 0.3 }), 100);
      expect(getRearPitchPivot(board).rotation.x).toBeLessThan(0);
    });

    it('frontPitchPivot.rotation.x stays zero for positive pitch', () => {
      board.tick(makeTick({ pitch: 0.3 }), 0);
      board.tick(makeTick({ pitch: 0.3 }), 100);
      expect(getFrontPitchPivot(board).rotation.x).toBe(0);
    });

    it('frontPitchPivot.rotation.x becomes positive for negative pitch (nose down)', () => {
      board.tick(makeTick({ pitch: -0.3 }), 0);
      board.tick(makeTick({ pitch: -0.3 }), 100);
      expect(getFrontPitchPivot(board).rotation.x).toBeGreaterThan(0);
    });

    it('rearPitchPivot.rotation.x stays zero for negative pitch', () => {
      board.tick(makeTick({ pitch: -0.3 }), 0);
      board.tick(makeTick({ pitch: -0.3 }), 100);
      expect(getRearPitchPivot(board).rotation.x).toBe(0);
    });

    it('both pitch pivots return to zero when pitch is zero', () => {
      let t = 0;
      for (let i = 0; i < 50; i++) { t += 16; board.tick(makeTick({ pitch: 0.5 }), t); }
      for (let i = 0; i < 200; i++) { t += 16; board.tick(makeTick({ pitch: 0 }), t); }
      expect(getRearPitchPivot(board).rotation.x).toBeCloseTo(0, 1);
      expect(getFrontPitchPivot(board).rotation.x).toBeCloseTo(0, 1);
    });

    it('converges to target orientation over many ticks', () => {
      const target = 0.20; // within MAX_LEAN_ANGLE (0.23)
      const deckGroup = getFlipInverse(board).children[0] as THREE.Group;
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += 16; // ~60fps
        board.tick(makeTick({ roll: target }), t);
      }
      expect(deckGroup.rotation.z).toBeCloseTo(target, 1);
    });

    it('returns to zero when target is zero', () => {
      const deckGroup = getFlipInverse(board).children[0] as THREE.Group;
      let t = 0;
      for (let i = 0; i < 50; i++) { t += 16; board.tick(makeTick({ roll: 0.5 }), t); }
      for (let i = 0; i < 200; i++) { t += 16; board.tick(makeTick({ roll: 0 }), t); }
      expect(deckGroup.rotation.z).toBeCloseTo(0, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — jump
  // ---------------------------------------------------------------------------

  describe('tick() jump', () => {
    it('jumpGroup.position.y is 0 when grounded', () => {
      board.tick(makeTick({ airborne: false }));
      expect(getJumpGroup(board).position.y).toBe(0);
    });

    it('triggers jump animation when airborne transitions from false to true', async () => {
      await board.load();
      board.tick(makeTick({ airborne: false }), 0);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.8 }), 16);
      expect(getJumpGroup(board).position.y).toBeGreaterThanOrEqual(0);
    });

    it('does not start a second jump while already jumping', async () => {
      await board.load();
      board.tick(makeTick({ airborne: false }), 0);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.5 }), 16);
      board.tick(makeTick({ airborne: false }), 32);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.5 }), 48);
      expect(() => board.tick(makeTick({ airborne: false }), 64)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — truck steering
  // ---------------------------------------------------------------------------

  describe('tick() truck steering', () => {
    beforeEach(async () => {
      await board.load();
    });

    it('no steer when roll is zero', () => {
      const flipInverse = getFlipInverse(board);
      const rearGroup   = flipInverse.children[1] as THREE.Group; // rearTruck
      const frontGroup  = flipInverse.children[2] as THREE.Group; // frontTruck

      board.tick(makeTick({ roll: 0 }), 0);
      board.tick(makeTick({ roll: 0 }), 100);

      expect(rearGroup.rotation.y).toBeCloseTo(0, 5);
      expect(frontGroup.rotation.y).toBeCloseTo(0, 5);
    });

    it('front truck rotation.y is negative when roll is positive', () => {
      const frontGroup = getFlipInverse(board).children[2] as THREE.Group; // frontTruck
      board.tick(makeTick({ roll: 0.3 }), 0);
      expect(frontGroup.rotation.y).toBeLessThan(0);
    });

    it('rear truck rotation.y is positive when roll is positive', () => {
      const rearGroup = getFlipInverse(board).children[1] as THREE.Group; // rearTruck
      board.tick(makeTick({ roll: 0.3 }), 0);
      expect(rearGroup.rotation.y).toBeGreaterThan(0);
    });

    it('front and rear steer are symmetric (frontY === -rearY)', () => {
      const flipInverse = getFlipInverse(board);
      const rearGroup   = flipInverse.children[1] as THREE.Group; // rearTruck
      const frontGroup  = flipInverse.children[2] as THREE.Group; // frontTruck

      board.tick(makeTick({ roll: 0.3 }), 0);

      expect(frontGroup.rotation.y).toBeCloseTo(-rearGroup.rotation.y, 10);
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — boardRoll
  // ---------------------------------------------------------------------------

  describe('tick() boardRoll', () => {
    beforeEach(async () => {
      await board.load();
    });

    it('flipGroup.rotation.z equals boardRoll regardless of airborne', () => {
      board.tick(makeTick({ airborne: false, boardRoll: 1.5 }));
      expect(getFlipGroup(board).rotation.z).toBe(1.5);
    });

    it('flipGroup.rotation.z equals boardRoll when airborne', () => {
      board.tick(makeTick({ airborne: true, boardRoll: 2.0 }));
      expect(getFlipGroup(board).rotation.z).toBe(2.0);
    });

    it('flipGroup.rotation.z is 0 when boardRoll is absent', () => {
      board.tick(makeTick());
      expect(getFlipGroup(board).rotation.z).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose()
  // ---------------------------------------------------------------------------

  describe('dispose()', () => {
    it('does not throw when called before load', () => {
      expect(() => board.dispose()).not.toThrow();
    });

    it('does not throw when called after load', async () => {
      await board.load();
      expect(() => board.dispose()).not.toThrow();
    });
  });
});
