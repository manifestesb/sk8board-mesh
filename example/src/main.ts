import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Skateboard, warehouseHdrUrl } from '@manifeste/sk8board';

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
// Skateboard
// ---------------------------------------------------------------------------

const board = new Skateboard({ truckColor: '#aaaaaa' });

board.load().then(() => {
  scene.add(board.root);
  // Center board on scene
  board.root.position.set(0, 0, 0);
  console.log('Skateboard loaded');
});

// ---------------------------------------------------------------------------
// HUD references
// ---------------------------------------------------------------------------

const hudRoll  = document.getElementById('v-roll')!;
const hudPitch = document.getElementById('v-pitch')!;
const hudYaw   = document.getElementById('v-yaw')!;
const hudSpeed = document.getElementById('v-speed')!;
const hudAir   = document.getElementById('v-air')!;

const ctrlSpeed    = document.getElementById('ctrl-speed') as HTMLInputElement;
const ctrlSpeedVal = document.getElementById('ctrl-speed-val')!;
ctrlSpeed.addEventListener('input', () => {
  ctrlSpeedVal.textContent = `${parseFloat(ctrlSpeed.value).toFixed(1)} m/s`;
});

const ctrlRoll    = document.getElementById('ctrl-roll') as HTMLInputElement;
const ctrlRollVal = document.getElementById('ctrl-roll-val')!;
ctrlRoll.addEventListener('input', () => {
  ctrlRollVal.textContent = `${parseFloat(ctrlRoll.value).toFixed(2)} rad`;
});

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

  const tick = {
    roll:     parseFloat(ctrlRoll.value),
    pitch:    0,
    yaw:      0,
    speed:    parseFloat(ctrlSpeed.value),
    airborne: false,
  };

  // Drive the skateboard model
  board.tick(tick);

  // Update HUD
  hudRoll.textContent  = tick.roll.toFixed(3);
  hudPitch.textContent = tick.pitch.toFixed(3);
  hudYaw.textContent   = tick.yaw.toFixed(3);
  hudSpeed.textContent = tick.speed.toFixed(2);
  hudAir.textContent   = tick.airborne ? 'TRUE ↑' : 'false';
  hudAir.style.color   = tick.airborne ? '#ff7a51' : '#fff';

  controls.update();
  renderer.render(scene, camera);
}

loop();
