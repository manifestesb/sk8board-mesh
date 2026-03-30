import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Skateboard, SkateboardAsset, SkatieAsset, PivotDebug, warehouseHdrUrl } from '@manifeste/sk8board';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a2e');
scene.fog = new THREE.Fog('#1a1a2e', 5, 15);

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
// Same position as InteractiveSkateboard.tsx
camera.position.set(1.5, 1, 1.4);
camera.lookAt(new THREE.Vector3(-0.2, 0.15, 0));

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const dirLight = new THREE.DirectionalLight('#ffffff', 1.6);
dirLight.position.set(3, 5, 2);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 20;
dirLight.shadow.camera.left = -3;
dirLight.shadow.camera.right = 3;
dirLight.shadow.camera.top = 3;
dirLight.shadow.camera.bottom = -3;
scene.add(dirLight);

scene.add(new THREE.AmbientLight('#ffffff', 0.3));

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: '#111122', roughness: 0.9, metalness: 0.1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);

// Grid lines for visual speed reference
const grid = new THREE.GridHelper(20, 40, '#333355', '#222244');
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// HDR environment
// ---------------------------------------------------------------------------

new RGBELoader().load(warehouseHdrUrl, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

// ---------------------------------------------------------------------------
// Model selector
// ---------------------------------------------------------------------------

type ModelId = 'skateboard' | 'skatie';

interface SkinOption {
  value:       string;
  label:       string;
  truckColor?: string;   // SkateboardAsset: truck material color
  skinUrl?:    string;   // SkatieAsset: base color texture override
}

const SKINS: Record<ModelId, SkinOption[]> = {
  skateboard: [
    { value: 'silver', label: 'Silver trucks', truckColor: '#aaaaaa' },
    { value: 'gold',   label: 'Gold trucks',   truckColor: '#d4aa70' },
    { value: 'black',  label: 'Black trucks',  truckColor: '#111111' },
    { value: 'raw',    label: 'Raw trucks',    truckColor: '#c8a96e' },
  ],
  skatie: [
    { value: 'default', label: 'Default' },
  ],
};

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

let board = new Skateboard({ truckColor: '#aaaaaa' });

// ---------------------------------------------------------------------------
// Skin helpers
// ---------------------------------------------------------------------------

function populateTextures(modelId: ModelId): void {
  ctrlTexture.innerHTML = '';
  for (const skin of SKINS[modelId]) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = skin.label;
    opt.dataset.value = skin.value;
    ctrlTexture.appendChild(opt);
  }
}

// ---------------------------------------------------------------------------
// Model loader
// ---------------------------------------------------------------------------

let debug: PivotDebug | null = null;
const debugActive = new Set<'pitch' | 'roll' | 'yaw' | 'tips'>();

async function loadModel(modelId: ModelId, skinValue: string): Promise<void> {
  if (board.root.parent === scene) scene.remove(board.root);
  debug?.dispose();
  board.dispose();

  const skin = SKINS[modelId].find((s) => s.value === skinValue) ?? SKINS[modelId][0];

  const truckColor = skin.truckColor ?? '#aaaaaa';
  const asset = modelId === 'skatie'
    ? new SkatieAsset({ skinUrl: skin.skinUrl })
    : new SkateboardAsset({ dracoPath: '/draco/', truckColor });

  board = new Skateboard({ truckColor, defaultJumpHeight: 0.8 }, asset);
  await board.load();

  debug = new PivotDebug(board);
  for (const layer of debugActive) debug.show(layer);

  scene.add(board.root);
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const ctrlTexture = document.getElementById('ctrl-texture') as HTMLSelectElement;

const ctrlModel = document.getElementById('ctrl-model') as HTMLSelectElement;
ctrlModel.addEventListener('change', () => {
  const modelId = ctrlModel.value as ModelId;
  populateTextures(modelId);
  loadModel(modelId, SKINS[modelId][0].value);
});

ctrlTexture.addEventListener('change', () => {
  const modelId  = ctrlModel.value as ModelId;
  const skinValue = ctrlTexture.selectedOptions[0]?.dataset.value ?? SKINS[modelId][0].value;
  loadModel(modelId, skinValue);
});

populateTextures('skateboard');
loadModel('skateboard', SKINS.skateboard[0].value);

// ---------------------------------------------------------------------------
// HUD references
// ---------------------------------------------------------------------------

const hudCarve = document.getElementById('v-carve')!;
const hudFlip  = document.getElementById('v-flip')!;
const hudPitch = document.getElementById('v-pitch')!;
const hudYaw   = document.getElementById('v-yaw')!;
const hudSpeed = document.getElementById('v-speed')!;
const hudAir   = document.getElementById('v-air')!;

const ctrlSpeed    = document.getElementById('ctrl-speed') as HTMLInputElement;
const ctrlSpeedVal = document.getElementById('ctrl-speed-val')!;
ctrlSpeed.addEventListener('input', () => {
  ctrlSpeedVal.textContent = `${parseFloat(ctrlSpeed.value).toFixed(1)} m/s`;
});

const ctrlCarve    = document.getElementById('ctrl-carve') as HTMLInputElement;
const ctrlCarveVal = document.getElementById('ctrl-carve-val')!;
ctrlCarve.addEventListener('input', () => {
  ctrlCarveVal.textContent = `${parseFloat(ctrlCarve.value).toFixed(2)} rad`;
});

const ctrlFlip    = document.getElementById('ctrl-flip') as HTMLInputElement;
const ctrlFlipVal = document.getElementById('ctrl-flip-val')!;
ctrlFlip.addEventListener('input', () => {
  const deg = (parseFloat(ctrlFlip.value) * 180 / Math.PI).toFixed(0);
  ctrlFlipVal.textContent = `${deg}°`;
});

const ctrlPitch    = document.getElementById('ctrl-pitch') as HTMLInputElement;
const ctrlPitchVal = document.getElementById('ctrl-pitch-val')!;
ctrlPitch.addEventListener('input', () => {
  const deg = (parseFloat(ctrlPitch.value) * 180 / Math.PI).toFixed(0);
  ctrlPitchVal.textContent = `${deg}°`;
});

const ctrlYaw    = document.getElementById('ctrl-yaw') as HTMLInputElement;
const ctrlYawVal = document.getElementById('ctrl-yaw-val')!;
ctrlYaw.addEventListener('input', () => {
  ctrlYawVal.textContent = `${parseFloat(ctrlYaw.value).toFixed(2)} rad`;
});

let airborne = false;
const ctrlAir = document.getElementById('ctrl-air') as HTMLButtonElement;
ctrlAir.addEventListener('click', () => {
  airborne = !airborne;
  ctrlAir.classList.toggle('active', airborne);
});

// ---------------------------------------------------------------------------
// Debug axis selector + contextual tuning sliders
// ---------------------------------------------------------------------------

interface SliderDef {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  apply: (v: number) => void;
}

// Fixed constants from SkateboardAsset (not tunable)
const DECK_PIVOT_Y  = 0.141;
const DECK_OFFSET_Y = 0.130;
const DECK_OFFSET_Z = -0.002;

// Mutable tuning state (survives axis switches)
const tuneState: Record<string, number> = {
  DECK_Y_MIN: -0.051,
  DECK_Z_MIN: -1.163,
  DECK_Z_MAX:  1.163,
  DECK_PIVOT_Y: 0.141,
};

function pitchSliders(): SliderDef[] {
  return [
    { label: 'DECK_Y_MIN', min: -0.15, max: 0.15, step: 0.001, value: tuneState.DECK_Y_MIN,
      apply(v) { tuneState.DECK_Y_MIN = v; applyTipTune(); } },
    { label: 'DECK_Z_MIN', min: -1.5, max: -0.5, step: 0.001, value: tuneState.DECK_Z_MIN,
      apply(v) { tuneState.DECK_Z_MIN = v; applyTipTune(); } },
    { label: 'DECK_Z_MAX', min: 0.5, max: 1.5, step: 0.001, value: tuneState.DECK_Z_MAX,
      apply(v) { tuneState.DECK_Z_MAX = v; applyTipTune(); } },
  ];
}

function rollSliders(): SliderDef[] {
  return [
    { label: 'DECK_PIVOT_Y', min: 0.05, max: 0.3, step: 0.001, value: tuneState.DECK_PIVOT_Y,
      apply(v) {
        tuneState.DECK_PIVOT_Y = v;
        board.tuneRollPivot(v);
      } },
  ];
}

const SLIDERS_BY_AXIS: Record<string, () => SliderDef[]> = {
  pitch: pitchSliders,
  roll:  rollSliders,
  tips:  pitchSliders,
};

function applyTipTune(): void {
  const tipY  = DECK_PIVOT_Y + DECK_OFFSET_Y + tuneState.DECK_Y_MIN;
  const tailZ = DECK_OFFSET_Z + tuneState.DECK_Z_MIN;
  const noseZ = DECK_OFFSET_Z + tuneState.DECK_Z_MAX;
  board.tuneTip('tail', tipY, tailZ);
  board.tuneTip('nose', tipY, noseZ);
  if (debugActive.has('tips')) { debug?.hide('tips'); debug?.show('tips'); }
  if (debugActive.has('pitch')) { debug?.hide('pitch'); debug?.show('pitch'); }
}

const tunePanel = document.getElementById('tune-panel')!;
let selectedAxis: string | null = null;

function renderTunePanel(axis: string | null): void {
  tunePanel.innerHTML = '';
  if (!axis || !SLIDERS_BY_AXIS[axis]) return;
  for (const def of SLIDERS_BY_AXIS[axis]()) {
    const label = document.createElement('label');
    const name = document.createTextNode(def.label + ' ');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(def.value);
    input.style.cssText = 'accent-color:#b8fc39;width:120px';
    const span = document.createElement('span');
    span.style.cssText = 'color:#fff;min-width:52px';
    span.textContent = def.value.toFixed(3);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      span.textContent = v.toFixed(3);
      def.apply(v);
    });
    label.append(name, input, span);
    tunePanel.appendChild(label);
  }
}

for (const layer of ['pitch', 'roll', 'yaw', 'tips'] as const) {
  const btn = document.getElementById(`dbg-${layer}`) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    // Toggle debug visibility
    if (debugActive.has(layer)) {
      debugActive.delete(layer);
      debug?.hide(layer);
      btn.classList.remove('active');
    } else {
      debugActive.add(layer);
      debug?.show(layer);
      btn.classList.add('active');
    }
    // Select axis for tuning panel
    selectedAxis = debugActive.has(layer) ? layer : null;
    renderTunePanel(selectedAxis);
  });
}

// ---------------------------------------------------------------------------
// Camera controls
// ---------------------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.2, 0.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function loop(): void {
  requestAnimationFrame(loop);

  const carve = parseFloat(ctrlCarve.value);
  const flip  = parseFloat(ctrlFlip.value);
  const pitch = parseFloat(ctrlPitch.value);

  const tick = {
    roll:      carve,
    boardRoll: flip,
    pitch,
    yaw:       parseFloat(ctrlYaw.value),
    speed:     parseFloat(ctrlSpeed.value),
    airborne,
  };

  // Drive the skateboard model
  board.tick(tick);

  // Update HUD
  hudCarve.textContent = carve.toFixed(3);
  hudFlip.textContent  = `${(flip * 180 / Math.PI).toFixed(0)}°`;
  hudPitch.textContent = `${(pitch * 180 / Math.PI).toFixed(0)}°`;
  hudYaw.textContent   = tick.yaw.toFixed(3);
  hudSpeed.textContent = tick.speed.toFixed(2);
  hudAir.textContent   = tick.airborne ? 'TRUE ↑' : 'false';
  hudAir.style.color   = tick.airborne ? '#ff7a51' : '#fff';

  controls.update();
  renderer.render(scene, camera);
}

loop();
