// Engine integration: main.ts boots headless (LittleJS manual step) and
// engineStep drives the real game wiring: sim update + scene sync.

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import * as LJS from 'littlejsengine';
import { ready, scene, camera } from '../src/main.ts';
import { player } from '../src/sim.ts';

await ready;

test('boot: scene holds the world and the projectile pool', () => {
  LJS.engineStep(1);
  const meshes = scene.children.filter((o) => o instanceof THREE.Mesh);
  assert.strictEqual(meshes.length, 5); // 1 world + 4 pool
});

test('boot: camera at spawn, eye height', () => {
  assert.strictEqual(camera.position.x, 3.5);
  assert.strictEqual(camera.position.y, 0.5);
  assert.strictEqual(camera.position.z, 4.5);
});

test('engineStep advances time at 60 Hz', () => {
  const t0 = LJS.time;
  LJS.engineStep(60);
  assert.ok(Math.abs(LJS.time - (t0 + 1)) < 1e-9);
});

test('no input: player stays at spawn', () => {
  LJS.engineStep(120);
  assert.strictEqual(player.x, 3.5);
  assert.strictEqual(player.y, 4.5);
  assert.strictEqual(player.angle, 0);
});
