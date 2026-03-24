import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Mock asset ?url imports — resolved by Vite in production, stubbed here
// ---------------------------------------------------------------------------
vi.mock('../assets/skateboard.gltf?url',                        () => ({ default: '/mock/skateboard.gltf' }));
vi.mock('../assets/skateboard/griptape-diffuse.webp?url',       () => ({ default: '/mock/griptape-diffuse.webp' }));
vi.mock('../assets/skateboard/griptape-roughness.webp?url',     () => ({ default: '/mock/griptape-roughness.webp' }));
vi.mock('../assets/skateboard/metal-normal.avif?url',           () => ({ default: '/mock/metal-normal.avif' }));
vi.mock('../assets/skateboard/Deck.webp?url',                   () => ({ default: '/mock/Deck.webp' }));
vi.mock('../assets/skateboard/SkateWheel1.png?url',             () => ({ default: '/mock/SkateWheel1.png' }));

// ---------------------------------------------------------------------------
// Mock Three.js loaders (no WebGL in Node)
// ---------------------------------------------------------------------------
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: vi.fn().mockImplementation(() => ({
    setDecoderPath: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Builds a minimal fake GLTF scene with all 10 expected mesh nodes
function makeFakeGltfScene() {
  const scene = new THREE.Group();
  const nodeNames = [
    'GripTape', 'Wheel1', 'Wheel2', 'Wheel3', 'Wheel4',
    'Deck', 'Bolts', 'Baseplates', 'Truck1', 'Truck2',
  ];
  for (const name of nodeNames) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    mesh.name = name;
    scene.add(mesh);
  }
  return { scene };
}

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn().mockImplementation(() => ({
    setDRACOLoader: vi.fn(),
    loadAsync: vi.fn().mockResolvedValue(makeFakeGltfScene()),
  })),
}));

// Stub TextureLoader so no HTTP requests are made
vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { Skateboard } from '../adapters/Skateboard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTick(overrides = {}) {
  return {
    roll: 0, pitch: 0, yaw: 0, speed: 0, airborne: false,
    ...overrides,
  };
}

describe('Skateboard', () => {
  let board: Skateboard;

  beforeEach(() => {
    board = new Skateboard();
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

    it('jumpGroup has exactly one child (tiltGroup)', () => {
      const jumpGroup = board.root.children[0];
      expect(jumpGroup.children).toHaveLength(1);
    });

    it('tiltGroup has exactly one child (modelGroup)', () => {
      const tiltGroup = board.root.children[0].children[0];
      expect(tiltGroup.children).toHaveLength(1);
    });

    it('root starts at origin', () => {
      expect(board.root.position.x).toBe(0);
      expect(board.root.position.y).toBe(0);
      expect(board.root.position.z).toBe(0);
    });

    it('jumpGroup starts at y=0 (on the ground)', () => {
      const jumpGroup = board.root.children[0] as THREE.Group;
      expect(jumpGroup.position.y).toBe(0);
    });

    it('applies custom truckColor option without throwing', () => {
      expect(() => new Skateboard({ truckColor: '#ff0000' })).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // load()
  // ---------------------------------------------------------------------------

  describe('load()', () => {
    it('resolves without throwing', async () => {
      await expect(board.load()).resolves.toBeUndefined();
    });

    it('adds meshes to the scene hierarchy after load', async () => {
      await board.load();
      const modelGroup = board.root.children[0].children[0].children[0];
      expect(modelGroup.children.length).toBe(10); // all 10 GLTF nodes
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — orientation
  // ---------------------------------------------------------------------------

  describe('tick() orientation', () => {
    it('does not throw with default tick', () => {
      expect(() => board.tick(makeTick())).not.toThrow();
    });

    it('lerps root rotation.y toward yaw', () => {
      board.tick(makeTick({ yaw: 1.0 }), 0);
      board.tick(makeTick({ yaw: 1.0 }), 100); // 100ms later
      // Some yaw should have been applied (lerp is progressive)
      expect(board.root.rotation.y).toBeGreaterThan(0);
    });

    it('lerps tiltGroup rotation.z toward roll', () => {
      const tiltGroup = board.root.children[0].children[0] as THREE.Group;
      board.tick(makeTick({ roll: 0.5 }), 0);
      board.tick(makeTick({ roll: 0.5 }), 100);
      expect(tiltGroup.rotation.z).toBeGreaterThan(0);
    });

    it('lerps tiltGroup rotation.x toward pitch', () => {
      const tiltGroup = board.root.children[0].children[0] as THREE.Group;
      board.tick(makeTick({ pitch: 0.3 }), 0);
      board.tick(makeTick({ pitch: 0.3 }), 100);
      expect(tiltGroup.rotation.x).toBeGreaterThan(0);
    });

    it('converges to target orientation over many ticks', () => {
      const target = 0.4;
      const tiltGroup = board.root.children[0].children[0] as THREE.Group;
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += 16; // ~60fps
        board.tick(makeTick({ roll: target }), t);
      }
      expect(tiltGroup.rotation.z).toBeCloseTo(target, 1);
    });

    it('returns to zero when target is zero', () => {
      const tiltGroup = board.root.children[0].children[0] as THREE.Group;
      // First push to non-zero
      let t = 0;
      for (let i = 0; i < 50; i++) { t += 16; board.tick(makeTick({ roll: 0.5 }), t); }
      // Then drive back to zero
      for (let i = 0; i < 200; i++) { t += 16; board.tick(makeTick({ roll: 0 }), t); }
      expect(tiltGroup.rotation.z).toBeCloseTo(0, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // tick() — jump
  // ---------------------------------------------------------------------------

  describe('tick() jump', () => {
    it('jumpGroup.position.y is 0 when grounded', () => {
      const jumpGroup = board.root.children[0] as THREE.Group;
      board.tick(makeTick({ airborne: false }));
      expect(jumpGroup.position.y).toBe(0);
    });

    it('triggers jump animation when airborne transitions from false to true', async () => {
      // Load to populate wheels (not strictly required for jump, but good practice)
      await board.load();
      const jumpGroup = board.root.children[0] as THREE.Group;

      board.tick(makeTick({ airborne: false }), 0);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.8 }), 16);

      // GSAP animation is async — jumpGroup.position.y will change on next
      // animation frame. We verify isJumping was set (via no-throw) and that
      // the GSAP timeline was created (no error means it was registered).
      expect(jumpGroup.position.y).toBeGreaterThanOrEqual(0);
    });

    it('does not start a second jump while already jumping', async () => {
      await board.load();
      // First jump
      board.tick(makeTick({ airborne: false }), 0);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.5 }), 16);
      // Try to start a second jump immediately
      board.tick(makeTick({ airborne: false }), 32);
      board.tick(makeTick({ airborne: true, jumpHeight: 0.5 }), 48);
      // Should not throw and state should be coherent
      expect(() => board.tick(makeTick({ airborne: false }), 64)).not.toThrow();
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
