import "./styles.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x0d1b2a);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/ window.innerHeight, 1, 2000);
camera.position.set(2,2,2);

// Lighting: ambient fill + hemisphere sky/ground + two directionals
const ambientLight = new THREE.AmbientLight(0x6688aa, 0.7);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xaaccaa, 0x223344, 1.0);
scene.add(hemiLight);
const light = new THREE.DirectionalLight(0xffffff, 1.8);
light.position.set(2, 4, 2);
const fillLight = new THREE.DirectionalLight(0x4499ff, 0.5);
fillLight.position.set(-3, 1, -2);
scene.add(fillLight);

//Make a box
const box1_geo = new THREE.BoxGeometry(1,0.1,1);
const box_mat = new THREE.MeshStandardMaterial({
  color: 0x99ccff,
  transparent: true,
  opacity: 0.10,
  roughness: 0.0,
  metalness: 0.15,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const box1_mesh = new THREE.Mesh(box1_geo, box_mat);
const box2_geo = new THREE.BoxGeometry(1,0.5,0.1);
const box3_geo = new THREE.BoxGeometry(0.1,1.0,1.0);
const box4_geo = new THREE.BoxGeometry(0.1,0.5,1.0);
const box2_mesh = new THREE.Mesh(box2_geo, box_mat);
const box3_mesh = new THREE.Mesh(box2_geo, box_mat);
const box4_mesh = new THREE.Mesh(box3_geo, box_mat);
const box5_mesh = new THREE.Mesh(box4_geo, box_mat);
box2_mesh.position.set(0,0.25,0.55);
box3_mesh.position.set(0,0.25,-0.55);
box4_mesh.position.set(0.55,0.5,0);
box5_mesh.position.set(-0.55,0.25,0);
scene.add(box1_mesh);
scene.add(box2_mesh);
scene.add(box3_mesh);
scene.add(box4_mesh);
scene.add(box5_mesh);

camera.lookAt(new THREE.Vector3(0,0,0));
scene.add(light);

// ---- SPH Parameters ----
const PARTICLE_RADIUS = 0.05; // visual size
const SPACING = 0.075;        // initial particle spacing

const H = 0.1;              // smoothing length (must be > SPACING)
const H2 = H * H;
const REST_DENSITY = 1000;

// Kernel coefficients (defined before MASS since MASS depends on POLY6)
const POLY6 = 315.0 / (64.0 * Math.PI * Math.pow(H, 9));
const SPIKY_GRAD = -45.0 / (Math.PI * Math.pow(H, 6));
const VISC_LAP = 45.0 / (Math.PI * Math.pow(H, 6));

// MASS calibrated so an interior particle (self + 6 face neighbors at SPACING) has density = REST_DENSITY.
// MASS = REST_DENSITY / sum_j W(r_ij) for the actual discrete neighbor config.
const _Wself = POLY6 * Math.pow(H2, 3);
const _Wface = POLY6 * Math.pow(H2 - SPACING * SPACING, 3);
const MASS = REST_DENSITY / (_Wself + 6 * _Wface);   // ≈ 0.638

const GAS_CONST = 80;
const VISCOSITY = 1.0;
const GRAVITY = -9.8;
const DT = 0.005;
const MAX_PARTICLES = 1500;

// Basin interior bounds
const BX_MIN = -0.495, BX_MAX = 0.495;
const BY_MIN = 0.055;
const BZ_MIN = -0.495, BZ_MAX = 0.495;

// ---- Particle data ----
const pos = [];  // THREE.Vector3[]
const vel = [];  // THREE.Vector3[]
const acc = [];  // THREE.Vector3[] — acceleration (updated each step)
let dens = [];   // float[]
let pres = [];   // float[]

// ---- Instanced mesh for rendering ----
const pGeo = new THREE.SphereGeometry(PARTICLE_RADIUS, 10, 8);
// White base: per-instance color (set in updateMesh) multiplies this
const pMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.04,
  metalness: 0.10,
  transparent: true,
  opacity: 0.40,
});
const instancedMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
instancedMesh.count = 0;
scene.add(instancedMesh);
const dummy = new THREE.Object3D();

// ---- Spatial grid for O(N) neighbor search ----
// The basin interior is divided into cells of size H.
// For each particle, only the 3x3x3=27 surrounding cells are checked.
const grid = new Map();

function cellKey(x, y, z) {
  const ix = Math.floor(x / H) | 0;
  const iy = Math.floor(y / H) | 0;
  const iz = Math.floor(z / H) | 0;
  return `${ix},${iy},${iz}`;
}

function buildGrid() {
  grid.clear();
  for (let i = 0; i < pos.length; i++) {
    const key = cellKey(pos[i].x, pos[i].y, pos[i].z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
}

function forEachNeighbor(i, callback) {
  const ix = Math.floor(pos[i].x / H) | 0;
  const iy = Math.floor(pos[i].y / H) | 0;
  const iz = Math.floor(pos[i].z / H) | 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = grid.get(`${ix+dx},${iy+dy},${iz+dz}`);
        if (cell) { for (const j of cell) callback(j); }
      }
    }
  }
}

// ---- SPH steps ----
function computeDensityPressure() {
  const n = pos.length;
  dens = new Array(n);
  pres = new Array(n);
  for (let i = 0; i < n; i++) {
    let rho = 0;
    const pi = pos[i];
    forEachNeighbor(i, (j) => {
      const r2 = pi.distanceToSquared(pos[j]);
      if (r2 < H2) {
        // W(r, h) = (315 / (64π h^9)) * (h^2 - r^2)^3
        rho += MASS * POLY6 * Math.pow(H2 - r2, 3);
      }
    });
    dens[i] = Math.max(rho, 1e-3);
    pres[i] = Math.max(0, GAS_CONST * (dens[i] - REST_DENSITY));
  }
}

function computeForces() {
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    const fp = new THREE.Vector3();
    const fv = new THREE.Vector3();
    const pi = pos[i];
    forEachNeighbor(i, (j) => {
      if (i === j) return;
      const rVec = new THREE.Vector3().subVectors(pi, pos[j]);
      const r = rVec.length();
      if (r < H && r > 1e-6) {
        // Pressure force using Spiky kernel gradient
        const pScale = -MASS * ((pres[j] / (dens[j] * dens[j])) + pres[i]/(dens[i]*dens[i]));
        //const pScale = -MASS * (pres[j] - pres[i]) / (2.0 * dens[j]);
        fp.addScaledVector(rVec, pScale * SPIKY_GRAD * (H - r) * (H - r) / r);

        // Viscosity force using Viscosity kernel Laplacian
        const vd = new THREE.Vector3().subVectors(vel[j], vel[i]);
        fv.addScaledVector(vd, VISCOSITY * MASS * VISC_LAP * (H - r) / dens[j]);
      }
    });
    // fp is already acceleration (symmetric SPH formula: a = -sum m_j*(p_i/rho_i^2 + p_j/rho_j^2)*gradW)
    // fv is force density -> divide by rho_i to get acceleration
    const di = Math.max(dens[i], 1e-3);
    acc[i] = fp.add(fv.divideScalar(di)).add(new THREE.Vector3(0, GRAVITY, 0));
  }
}

// ---- Mouse interaction (mode 1) ----
// Cast a ray from the camera, apply repulsive force to particles near the ray.
const INTERACT_RADIUS = 0.5;
const INTERACT_STRENGTH = 24000;

function applyMouseForce() {
  raycaster.setFromCamera(mousePosition, camera);
  const origin = raycaster.ray.origin;
  const dir = raycaster.ray.direction; // normalized unit vector

  for (let i = 0; i < pos.length; i++) {
    const toP = new THREE.Vector3().subVectors(pos[i], origin);
    const t = toP.dot(dir);
    if (t < 0) continue;
    const radial = toP.clone().addScaledVector(dir, -t); // perpendicular component
    const dist = radial.length();
    if (dist < INTERACT_RADIUS && dist > 1e-6) {
      const strength = INTERACT_STRENGTH * (1.0 - dist / INTERACT_RADIUS);
      acc[i].addScaledVector(radial, strength / (dist * Math.max(dens[i], 1e-3)));
    }
  }
}

// ---- Leapfrog KDK (Kick-Drift-Kick) integration ----
function sphStep() {
  const restitution = 0.2;
  const n = pos.length;

  // Kick 1: v(t) -> v(t + dt/2)  using acc from previous step
  for (let i = 0; i < n; i++) {
    vel[i].addScaledVector(acc[i], DT * 0.5);
  }

  // Drift: x(t) -> x(t + dt)  then enforce boundary
  for (let i = 0; i < n; i++) {
    pos[i].addScaledVector(vel[i], DT);
    const p = pos[i], v = vel[i];
    if (p.x < BX_MIN) { p.x = BX_MIN; v.x =  Math.abs(v.x) * restitution; }
    if (p.x > BX_MAX) { p.x = BX_MAX; v.x = -Math.abs(v.x) * restitution; }
    if (p.y < BY_MIN) { p.y = BY_MIN; v.y =  Math.abs(v.y) * restitution; }
    if (p.z < BZ_MIN) { p.z = BZ_MIN; v.z =  Math.abs(v.z) * restitution; }
    if (p.z > BZ_MAX) { p.z = BZ_MAX; v.z = -Math.abs(v.z) * restitution; }
  }

  // Recompute forces at new positions -> acc(t + dt)
  buildGrid();
  computeDensityPressure();
  computeForces();
  if (mode === 1) applyMouseForce();

  // Kick 2: v(t + dt/2) -> v(t + dt)  using new acc
  for (let i = 0; i < n; i++) {
    vel[i].addScaledVector(acc[i], DT * 0.5);
  }
}

// Color anchors for depth/density blending
const _colorDeep = new THREE.Color(0x002266);  // deep bulk water
const _colorMid  = new THREE.Color(0x0055bb);  // mid water
const _colorSurf = new THREE.Color(0x55ddff);  // surface / low-density spray
const _c = new THREE.Color();

function updateMesh() {
  instancedMesh.count = pos.length;
  const fillTop = 0.45;
  for (let i = 0; i < pos.length; i++) {
    dummy.position.copy(pos[i]);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    // Depth: 0 = floor, 1 = fill surface
    const t = Math.max(0, Math.min(1, (pos[i].y - BY_MIN) / (fillTop - BY_MIN)));
    _c.lerpColors(_colorDeep, _colorMid, t);

    // Low density → surface/spray particle → blend toward light cyan
    if (i < dens.length) {
      const dr = Math.min(1, dens[i] / REST_DENSITY);
      if (dr < 0.85) _c.lerp(_colorSurf, (0.85 - dr) / 0.85);
    }
    instancedMesh.setColorAt(i, _c);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
}

// ---- Initial fluid fill ----
function initializeFluid() {
  const margin = PARTICLE_RADIUS;
  for (let x = BX_MIN + margin; x <= BX_MAX - margin; x += SPACING) {
    for (let y = BY_MIN + margin; y <= 0.45; y += SPACING) {
      for (let z = BZ_MIN + margin; z <= BZ_MAX - margin; z += SPACING) {
        if (pos.length >= MAX_PARTICLES) return;
        pos.push(new THREE.Vector3(x, y, z));
        vel.push(new THREE.Vector3());
        acc.push(new THREE.Vector3());
      }
    }
  }
}

// ---- Auto-spawn from above box4 (right wall inner top edge) ----
let spawnFrame = 0;
const SPAWN_EVERY = 2;

function autoSpawn() {
  if (pos.length >= MAX_PARTICLES) return;
  if (++spawnFrame < SPAWN_EVERY) return;
  spawnFrame = 0;
  const p = new THREE.Vector3(
    BX_MAX - 0.02,
    0.85 + Math.random() * 0.1,
    (Math.random() - 0.5) * 0.1
  );
  pos.push(p);
  vel.push(new THREE.Vector3(-0.5, 0, 0));
  acc.push(new THREE.Vector3());
}

//動作mode
let mode = 0;
const mousePosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

window.addEventListener("mousemove", function (e) {
  mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
  mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
window.addEventListener("click", (e) => {
  const mode_val = document.getElementsByName("mode");
  console.log("mode:", mode_val.item(0).checked);
  mode = (mode_val.item(0).checked)? 1 : 0;
});

scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);

initializeFluid();

function animate() {
  requestAnimationFrame(animate);
  controls.enabled = (mode === 0);
  controls.update();
  //autoSpawn();
  if (pos.length > 0) {
    sphStep();
    updateMesh();
  }
  renderer.render(scene, camera);
}
animate();
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
