import { describe, it, expect, vi, afterEach } from 'vitest';
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

// Builds a minimal fake GLTF scene with all required mesh nodes
function makeFakeGltfScene() {
  const scene = new THREE.Group();
  const nodeNames = [
    'GripTape', 'WheelFrontRight', 'WheelFrontLeft', 'WheelRearRight', 'WheelRearLeft',
    'Deck', 'Baseplates', 'TruckRear', 'TruckFront',
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

vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { SkateboardAsset } from '../adapters/SkateboardAsset.js';
import { DeckLean } from '../adapters/DeckLean.js';

// ---------------------------------------------------------------------------
// SkateboardAsset
// ---------------------------------------------------------------------------

describe('SkateboardAsset', () => {
  let asset: SkateboardAsset;
  const opts = { dracoPath: '/draco/', truckColor: '#888888' };

  afterEach(() => {
    asset.dispose();
  });

  // -------------------------------------------------------------------------
  // mount()
  // -------------------------------------------------------------------------

  describe('mount()', () => {
    it('resolves without throwing', async () => {
      asset = new SkateboardAsset(opts);
      const modelGroup = new THREE.Group();
      await expect(asset.mount(modelGroup)).resolves.not.toThrow();
    });

    it('returns a deckLean that is a DeckLean instance', async () => {
      asset = new SkateboardAsset(opts);
      const modelGroup = new THREE.Group();
      const rig = await asset.mount(modelGroup);
      expect(rig.deckLean).toBeInstanceOf(DeckLean);
      expect(rig.deckLean.group).toBeInstanceOf(THREE.Group);
    });

    it('returns 4 wheels', async () => {
      asset = new SkateboardAsset(opts);
      const modelGroup = new THREE.Group();
      const rig = await asset.mount(modelGroup);
      expect(rig.wheels).toHaveLength(4);
    });

    it('returns rearTruck and frontTruck as THREE.Groups', async () => {
      asset = new SkateboardAsset(opts);
      const modelGroup = new THREE.Group();
      const rig = await asset.mount(modelGroup);
      expect(rig.rearTruck).toBeInstanceOf(THREE.Group);
      expect(rig.frontTruck).toBeInstanceOf(THREE.Group);
    });

    it('adds deckLean.group, rearTruck, frontTruck to modelGroup', async () => {
      asset = new SkateboardAsset(opts);
      const modelGroup = new THREE.Group();
      const rig = await asset.mount(modelGroup);
      expect(modelGroup.children).toContain(rig.deckLean.group);
      expect(modelGroup.children).toContain(rig.rearTruck);
      expect(modelGroup.children).toContain(rig.frontTruck);
    });

    it('accepts custom truckColor without throwing', async () => {
      asset = new SkateboardAsset({ ...opts, truckColor: '#ff0000' });
      const modelGroup = new THREE.Group();
      await expect(asset.mount(modelGroup)).resolves.not.toThrow();
    });

    it('throws with the missing node name when GLTF is incomplete', async () => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      vi.mocked(GLTFLoader).mockImplementationOnce(() => ({
        setDRACOLoader: vi.fn(),
        loadAsync: vi.fn().mockResolvedValue({ scene: new THREE.Group() }),
      }) as any);

      asset = new SkateboardAsset(opts);
      await expect(asset.mount(new THREE.Group())).rejects.toThrow('GripTape');
    });
  });

  // -------------------------------------------------------------------------
  // dispose()
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('does not throw before mount', () => {
      asset = new SkateboardAsset(opts);
      expect(() => asset.dispose()).not.toThrow();
    });

    it('does not throw after mount', async () => {
      asset = new SkateboardAsset(opts);
      await asset.mount(new THREE.Group());
      expect(() => asset.dispose()).not.toThrow();
    });
  });
});
