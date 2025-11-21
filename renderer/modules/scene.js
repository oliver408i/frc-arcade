const THREE = require('three');
const {
  ARENA_RADIUS,
  GAME2_ARENA_RADIUS,
  FLOOR_TEXTURE_SIZE,
  ARENA_BOUNDARY_PADDING,
  RIM_HALF_WIDTH,
} = require('./constants');
const { appContainer } = require('./dom');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030f);
scene.fog = new THREE.Fog(0x010109, 30, 90);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
const turretCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
const cameraBasePosition = new THREE.Vector3(0, 32, 0);
camera.position.copy(cameraBasePosition);
camera.lookAt(0, 0, 0);
camera.up.set(0, 0, -1);
turretCamera.position.set(6, 8, -6);
turretCamera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const spot = new THREE.SpotLight(0xffffff, 1.4, 180, Math.PI / 4, 0.3, 1);
spot.position.set(0, 60, 0);
spot.target.position.set(0, 0, 0);
scene.add(spot);
scene.add(spot.target);

const RENDER_ARENA_RADIUS = Math.max(ARENA_RADIUS, GAME2_ARENA_RADIUS);
const arenaSurface = new THREE.Mesh(
  new THREE.CircleGeometry(RENDER_ARENA_RADIUS, 64),
  new THREE.MeshStandardMaterial({
    color: 0x03071a,
    roughness: 0.9,
    metalness: 0.1,
    emissive: 0x040d2c,
    emissiveIntensity: 0.3,
  })
);
arenaSurface.rotation.x = -Math.PI / 2;
scene.add(arenaSurface);

function createRimMesh(radius, color, rimWidth, yOffset) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.depthTest = true;
  const geometry = new THREE.RingGeometry(Math.max(0.05, radius - rimWidth), radius + rimWidth, 96);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yOffset;
  mesh.renderOrder = 0;
  return mesh;
}

const glowingRim = createRimMesh(
  ARENA_RADIUS - ARENA_BOUNDARY_PADDING,
  0xa0ffe8,
  RIM_HALF_WIDTH,
  0.12
);
scene.add(glowingRim);
const shooterRim = createRimMesh(
  GAME2_ARENA_RADIUS - ARENA_BOUNDARY_PADDING,
  0xfff0c2,
  RIM_HALF_WIDTH,
  0.12
);
shooterRim.visible = false;
scene.add(shooterRim);

const grid = new THREE.GridHelper(RENDER_ARENA_RADIUS * 2, 24, 0x11223d, 0x081326);
scene.add(grid);
const shooterGrid = new THREE.GridHelper(GAME2_ARENA_RADIUS * 2, 46, 0xa8ffe1, 0x16273b);
shooterGrid.position.y = 0.08;
shooterGrid.material.transparent = true;
shooterGrid.material.opacity = 0.8;
shooterGrid.visible = false;
scene.add(shooterGrid);

const floorCanvas = document.createElement('canvas');
floorCanvas.width = floorCanvas.height = FLOOR_TEXTURE_SIZE;
const floorCtx = floorCanvas.getContext('2d');
floorCtx.fillStyle = '#02030f';
floorCtx.fillRect(0, 0, FLOOR_TEXTURE_SIZE, FLOOR_TEXTURE_SIZE);
floorCtx.strokeStyle = 'rgba(83,255,210,0.5)';
floorCtx.lineWidth = 2;
const step = 64;
for (let i = 0; i <= FLOOR_TEXTURE_SIZE; i += step) {
  floorCtx.beginPath();
  floorCtx.moveTo(i, 0);
  floorCtx.lineTo(i, FLOOR_TEXTURE_SIZE);
  floorCtx.stroke();
  floorCtx.beginPath();
  floorCtx.moveTo(0, i);
  floorCtx.lineTo(FLOOR_TEXTURE_SIZE, i);
  floorCtx.stroke();
}
const floorTexture = new THREE.CanvasTexture(floorCanvas);
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(RENDER_ARENA_RADIUS / 6, RENDER_ARENA_RADIUS / 6);
const floorMaterial = new THREE.MeshStandardMaterial({
  map: floorTexture,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.65,
});
const floorPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(RENDER_ARENA_RADIUS * 2, RENDER_ARENA_RADIUS * 2),
  floorMaterial
);
floorPlane.rotation.x = -Math.PI / 2;
floorPlane.position.y = -0.01;
scene.add(floorPlane);

module.exports = {
  THREE,
  renderer,
  scene,
  camera,
  turretCamera,
  cameraBasePosition,
  ambientLight,
  spot,
  arenaSurface,
  glowingRim,
  shooterRim,
  grid,
  shooterGrid,
  floorMaterial,
  floorPlane,
};
