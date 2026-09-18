// Three.js scene graph: world mesh, lights, projectile pool, camera.
// Everything is a plain THREE object (no renderer), so it builds and
// inspects under Node for tests. The LittleJS ThreeJSPlugin renders it.
//
//   createScene()  ──> { scene, camera }     fog, background, horizontal FOV
//   createWorld()  ──> world mesh + sun + ambient + 4x (sphere, point light)
//   syncWorld()    ──> camera pose, projectile positions, light visibility

import * as THREE from 'three';
import { MAX_PROJECTILES, PROJ_RADIUS, type Projectile } from './sim.js';

const WALL_CHAR = '#';

type Rgb = [number, number, number];

// Face colors: base albedo, lighting comes from the scene lights.
const WALL_X: Rgb = [0.72, 0.32, 0.28]; // faces with normal along x
const WALL_Y: Rgb = [0.55, 0.62, 0.35]; // faces with normal along z
const FLOOR_COLOR: Rgb = [0.22, 0.20, 0.19];
const CEIL_COLOR: Rgb = [0.85, 0.88, 0.92];

const CLEAR_COLOR: Rgb = [0.05, 0.05, 0.07];
const FOG_DENSITY = 0.1;

// Light constants carried over from the old per-fragment shader.
const AMBIENT = 1.75;
const DIFFUSE = 1.65;
const LIGHT_DIR = new THREE.Vector3(0.35, 0.8, 0.45).normalize();
const LIGHT_COLOR: Rgb = [1.0, 0.8, 0.5]; // per-projectile point light
const PROJ_COLOR: Rgb = [1.0, 0.85, 0.6]; // emissive projectile sphere

const FOV = Math.PI / 3; // 60 degree horizontal field of view
const EYE_HEIGHT = 0.5;
const NEAR = 0.1;
const FAR = 50;
const SPHERE_LON = 16; // sphere longitude segments
const SPHERE_LAT = 12; // sphere latitude segments

export function createScene() {
  const scene = new THREE.Scene();
  const fog = new THREE.Color(...CLEAR_COLOR);
  scene.background = fog;
  scene.fog = new THREE.FogExp2(fog, FOG_DENSITY);

  // Aspect 1 initially; syncWorld tracks camera.aspect set by the plugin.
  const camera = new THREE.PerspectiveCamera(FOV * 180 / Math.PI, 1, NEAR, FAR);
  return { scene, camera };
}

// What createWorld adds to the scene; syncWorld walks it every frame.
export interface World {
  worldMesh: THREE.Mesh;
  projMeshes: THREE.Mesh[];
  projLights: THREE.PointLight[];
}

// The sim module namespace; the boot layer passes the whole module in.
type Sim = typeof import('./sim.js');

export function createWorld(scene: THREE.Scene, map: readonly string[]): World {
  const worldMesh = new THREE.Mesh(
    buildWorldGeometry(map),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(worldMesh);

  // Fixed directional light: shines from LIGHT_DIR toward the origin.
  const sun = new THREE.DirectionalLight(0xffffff, DIFFUSE);
  sun.position.copy(LIGHT_DIR).multiplyScalar(10);
  const ambient = new THREE.AmbientLight(0xffffff, AMBIENT);
  scene.add(sun, ambient);

  // Pool: one sphere mesh and one point light per projectile slot.
  const sphere = new THREE.SphereGeometry(PROJ_RADIUS, SPHERE_LON, SPHERE_LAT);
  const sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...PROJ_COLOR) });
  const projMeshes: THREE.Mesh[] = [];
  const projLights: THREE.PointLight[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const mesh = new THREE.Mesh(sphere, sphereMat);
    mesh.visible = false;
    scene.add(mesh);
    projMeshes.push(mesh);

    // Squared decay approximates the old 1 / (1 + K d^2) falloff.
    const light = new THREE.PointLight(new THREE.Color(...LIGHT_COLOR), 1, 0, 2);
    light.visible = false;
    scene.add(light);
    projLights.push(light);
  }

  return { worldMesh, projMeshes, projLights };
}

// Copy sim state into the scene graph: camera pose, projectile meshes and
// their point lights. Called every frame after the sim update.
// The sim argument is the sim module itself, as passed by the boot layer.
export function syncWorld(world: World, sim: Sim, camera: THREE.PerspectiveCamera) {
  const p = sim.player;
  camera.position.set(p.x, EYE_HEIGHT, p.y);
  camera.lookAt(p.x + Math.cos(p.angle), EYE_HEIGHT, p.y + Math.sin(p.angle));
  setFov(camera);

  for (let i = 0; i < world.projMeshes.length; i++) {
    // Pool has a fixed slot count; live projectiles may fill fewer of them.
    const proj: Projectile | undefined = sim.projectiles[i];
    const mesh = world.projMeshes[i];
    const light = world.projLights[i];

    mesh.visible = proj !== undefined;
    light.visible = proj !== undefined;
    if (proj === undefined) {
      continue;
    }

    mesh.position.set(proj.x, proj.y, proj.z);
    light.position.set(proj.x, proj.y, proj.z);
  }
}

// Keep a horizontal FOV; the vertical follows the current aspect.
function setFov(camera: THREE.PerspectiveCamera) {
  const fov = 2 * Math.atan(Math.tan(FOV / 2) / camera.aspect) * 180 / Math.PI;
  if (camera.fov === fov) {
    return;
  }

  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// Map (x, y) becomes world (x, z); walls are 1 unit tall.
// Three parallel attribute arrays: position, normal, color.
function buildWorldGeometry(map: readonly string[]) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];

  const h = map.length;
  const w = map[0].length;

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (map[cy][cx] !== WALL_CHAR) {
        continue;
      }

      const x0 = cx;
      const x1 = cx + 1;
      const z0 = cy;
      const z1 = cy + 1;

      // CCW winding faces the normal; east and north mirror west and south.
      addFace(pos, nrm, col, [-1, 0, 0], WALL_X, [x0, 0, z0], [x0, 0, z1], [x0, 1, z1], [x0, 1, z0]);
      addFace(pos, nrm, col, [1, 0, 0], WALL_X, [x1, 0, z1], [x1, 0, z0], [x1, 1, z0], [x1, 1, z1]);
      addFace(pos, nrm, col, [0, 0, -1], WALL_Y, [x1, 0, z0], [x0, 0, z0], [x0, 1, z0], [x1, 1, z0]);
      addFace(pos, nrm, col, [0, 0, 1], WALL_Y, [x0, 0, z1], [x1, 0, z1], [x1, 1, z1], [x0, 1, z1]);
    }
  }

  addFace(pos, nrm, col, [0, 1, 0], FLOOR_COLOR, [0, 0, h], [w, 0, h], [w, 0, 0], [0, 0, 0]);
  addFace(pos, nrm, col, [0, -1, 0], CEIL_COLOR, [0, 1, 0], [w, 1, 0], [w, 1, h], [0, 1, h]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}

// Two triangles (v0 v1 v2, v0 v2 v3) with one normal and base color.
function addFace(pos: number[], nrm: number[], col: number[], n: Rgb, c: Rgb, v0: Rgb, v1: Rgb, v2: Rgb, v3: Rgb) {
  for (const v of [v0, v1, v2, v0, v2, v3]) {
    pos.push(v[0], v[1], v[2]);
    nrm.push(n[0], n[1], n[2]);
    col.push(c[0], c[1], c[2]);
  }
}
