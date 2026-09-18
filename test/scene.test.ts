// Scene graph tests: world geometry, fog, camera, projectile pool.

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import * as sim from '../src/sim.ts';
import { MAP } from '../src/map.ts';
import { createScene, createWorld, syncWorld } from '../src/scene.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Wall cell count from the map: 24 verts per wall, 12 for floor + ceiling.
const wallCells = MAP.join('').split('#').length - 1;
const worldVerts = wallCells * 24 + 12;

function build() {
  const { scene, camera } = createScene();
  const world = createWorld(scene, MAP);
  return { scene, camera, world };
}

// ---- world geometry ---------------------------------------------------------

test('world mesh has one vertex per face corner from the map', () => {
  const { world } = build();
  const g = world.worldMesh.geometry;

  assert.strictEqual(g.getAttribute('position').count, worldVerts);
  assert.strictEqual(g.getAttribute('normal').count, worldVerts);
  assert.strictEqual(g.getAttribute('color').count, worldVerts);
});

// FrontSide culls clockwise triangles, so every triangle's winding
// (cross of its first two edges) must point along its normal.
test('every triangle is wound to face its normal', () => {
  const { world } = build();
  const pos = world.worldMesh.geometry.getAttribute('position');
  const nrm = world.worldMesh.geometry.getAttribute('normal');

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const wn = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    v0.fromBufferAttribute(pos, i);
    v1.fromBufferAttribute(pos, i + 1);
    v2.fromBufferAttribute(pos, i + 2);
    wn.crossVectors(v1.sub(v0), v2.sub(v0));
    n.fromBufferAttribute(nrm, i);

    assert.ok(wn.dot(n) > 0, `triangle ${i / 3} wound against its normal`);
  }
});

test('floor at y=0, ceiling at y=1, wall face on x=7', () => {
  const { world } = build();
  const pos = world.worldMesh.geometry.getAttribute('position');
  const col = world.worldMesh.geometry.getAttribute('color');

  // Border wall corners share positions with floor/ceiling corners, so a
  // position lookup can match several vertices; select by color signature.
  const colorsAt = (x: number, y: number, z: number): number[][] => {
    const out: number[][] = [];
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) === x && pos.getY(i) === y && pos.getZ(i) === z) {
        out.push([col.getX(i), col.getY(i), col.getZ(i)]);
      }
    }

    return out;
  };

  // Floor: warm hue (r > g > b) and dim; walls at the same corner are brighter.
  const floor = colorsAt(0, 0, 0).find((c) => c[0] > c[1] && c[1] > c[2] && c[0] < 0.25);
  assert.ok(floor, 'floor corner missing');

  // Ceiling: cool hue (b >= g >= r); walls at the same corner are warm or green.
  const ceil = colorsAt(0, 1, 0).find((c) => c[2] >= c[1] && c[1] >= c[0]);
  assert.ok(ceil, 'ceiling corner missing');

  // Cell (7, 4) is a wall: its x face sits on x=7 with the warm X tint.
  const face = colorsAt(7, 0, 4).find((c) => c[0] > c[1]);
  assert.ok(face, 'wall face vertex missing');
});

test('world mesh uses vertex colors', () => {
  const { world } = build();
  assert.strictEqual((world.worldMesh.material as THREE.MeshLambertMaterial).vertexColors, true);
});

// ---- scene setup -------------------------------------------------------------

test('fog is exponential with the old density and color', () => {
  const { scene } = build();
  assert.ok(scene.fog instanceof THREE.FogExp2);
  assert.ok(near(scene.fog.density, 0.1));
  assert.ok(near(scene.fog.color.r, 0.05));
  assert.ok(near(scene.fog.color.g, 0.05));
  assert.ok(near(scene.fog.color.b, 0.07));
});

test('background matches the fog color', () => {
  const { scene } = build();
  assert.ok(near((scene.background as THREE.Color).r, scene.fog!.color.r));
  assert.ok(near((scene.background as THREE.Color).g, scene.fog!.color.g));
  assert.ok(near((scene.background as THREE.Color).b, scene.fog!.color.b));
});

test('camera: horizontal 60 fov, near 0.1, far 50', () => {
  const { camera } = build();
  assert.ok(near(camera.fov, 60));
  assert.ok(near(camera.near, 0.1));
  assert.ok(near(camera.far, 50));
});

test('scene holds the sun and ambient light', () => {
  const { scene } = build();
  assert.ok(scene.children.some((o) => (o as THREE.DirectionalLight).isDirectionalLight));
  assert.ok(scene.children.some((o) => (o as THREE.AmbientLight).isAmbientLight));
});

// ---- projectile pool -----------------------------------------------------------

test('pool of 4 hidden spheres sharing one geometry', () => {
  const { world } = build();
  assert.strictEqual(world.projMeshes.length, 4);
  assert.ok(world.projMeshes.every((m) => m.visible === false));
  assert.ok(world.projMeshes.every((m) => m.geometry === world.projMeshes[0].geometry));
  assert.ok(near((world.projMeshes[0].geometry as THREE.SphereGeometry).parameters.radius, sim.PROJ_RADIUS));
});

test('pool of 4 hidden point lights, one per mesh', () => {
  const { world } = build();
  assert.strictEqual(world.projLights.length, 4);
  assert.ok(world.projLights.every((l) => l.visible === false));
});

// ---- sync ------------------------------------------------------------------------

test('camera at spawn: eye height, facing east', () => {
  const { camera, world } = build();
  sim.reset();
  syncWorld(world, sim, camera);

  assert.ok(near(camera.position.x, 3.5));
  assert.ok(near(camera.position.y, 0.5));
  assert.ok(near(camera.position.z, 4.5));

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  assert.ok(near(dir.x, 1));
  assert.ok(near(dir.y, 0));
  assert.ok(near(dir.z, 0));
});

test('camera follows rotation', () => {
  const { camera, world } = build();
  sim.reset();
  sim.player.angle = Math.PI / 2;
  syncWorld(world, sim, camera);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  assert.ok(near(dir.x, 0));
  assert.ok(near(dir.y, 0));
  assert.ok(near(dir.z, 1));
});

test('projectile fills its mesh and light slot', () => {
  const { camera, world } = build();
  sim.reset();
  sim.projectiles.push({ x: 5, y: sim.PROJ_HEIGHT, z: 4.5, vx: 0, vy: 0, vz: 0, life: 1 });
  syncWorld(world, sim, camera);

  const [mesh, light] = [world.projMeshes[0], world.projLights[0]];
  assert.strictEqual(mesh.visible, true);
  assert.ok(near(mesh.position.x, 5));
  assert.ok(near(mesh.position.y, sim.PROJ_HEIGHT));
  assert.ok(near(mesh.position.z, 4.5));
  assert.strictEqual(light.visible, true);
  assert.ok(near(light.position.x, 5));

  assert.strictEqual(world.projMeshes[1].visible, false);
  assert.strictEqual(world.projLights[1].visible, false);
});

test('empty slots stay hidden', () => {
  const { camera, world } = build();
  sim.reset();
  syncWorld(world, sim, camera);

  assert.ok(world.projMeshes.every((m) => m.visible === false));
  assert.ok(world.projLights.every((l) => l.visible === false));
});

test('vertical fov follows the aspect: 16:9 gives 35.98 degrees', () => {
  // 2 * atan(tan(30 deg) / (16/9)) in degrees.
  const { camera, world } = build();
  sim.reset();
  camera.aspect = 16 / 9;
  syncWorld(world, sim, camera);

  assert.ok(near(camera.fov, 35.9834, 0.001));
});
