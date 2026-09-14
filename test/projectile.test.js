'use strict';

// Projectile tests: firing on Space, flight, cooldown, wall culling, lifetime, cap.

import test from 'node:test';
import assert from 'node:assert';
import { loadGame } from './stub.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

// Spawn (3.5, 4.5); row 4 is open from col 1 to col 6.
// Projectile: speed 2, spawn 1.0 ahead, height 0.5, life 6, cooldown 0.4, cap 4.

function resetPlayer(t) {
  t.player.x = 3.5;
  t.player.y = 4.5;
  t.player.angle = 0;
}

test('space spawns a projectile in front of the player', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('Space');
  t.update(0.1);

  assert.strictEqual(t.projectiles.length, 1);
  const p = t.projectiles[0];
  assert.ok(near(p.x, 4.7)); // 3.5 + 1.0 ahead, then 2.0 * 0.1 flight
  assert.ok(near(p.y, 0.5));
  assert.ok(near(p.z, 4.5));
  assert.ok(near(p.vx, 2.0));
  assert.ok(near(p.vy, 0));
  assert.ok(near(p.vz, 0));
  assert.ok(near(p.life, 5.9));
});

test('no Space, no projectile', () => {
  const { t, dom } = loadGame();

  dom.press('KeyW');
  t.update(0.1);
  assert.strictEqual(t.projectiles.length, 0);
});

test('facing direction sets spawn point and velocity', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);
  t.player.angle = Math.PI / 2; // south (+z)

  dom.press('Space');
  t.update(0.1);
  dom.release('Space');

  const p = t.projectiles[0];
  assert.ok(near(p.x, 3.5));
  assert.ok(near(p.z, 5.7)); // 4.5 + 1.0 ahead, then 0.2 flight
  assert.ok(near(p.vz, 2.0));
});

test('cooldown: one shot per press, re-fire after it expires', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('Space');
  t.update(0.1); // shot 1, cooldown 0.4
  t.update(0.1); // 0.3 left, no shot
  assert.strictEqual(t.projectiles.length, 1);

  t.update(0.5); // 0.3 - 0.5 < 0, shot 2
  assert.strictEqual(t.projectiles.length, 2);
  dom.release('Space');
});

test('projectile is removed on wall hit', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('Space');
  t.update(0.1);
  dom.release('Space');

  const p = t.projectiles[0];
  p.x = 6.9; // 6.9 + 0.15 radius crosses the east wall at x = 7
  p.vx = 0;

  t.update(0.1);
  assert.strictEqual(t.projectiles.length, 0);
});

test('projectile is removed after its lifetime', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('Space');
  t.update(0.1);
  dom.release('Space');

  t.projectiles[0].life = 0.05;
  t.projectiles[0].vx = 0;
  t.update(0.1);
  assert.strictEqual(t.projectiles.length, 0);
});

test('at most 4 projectiles alive', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('Space');
  for (let i = 0; i < 5; i++) {
    t.update(0.5); // dt > cooldown, always able to fire
    for (const p of t.projectiles) {
      p.vx = 0; // park them: no flight, no wall hits, no expiry
      p.vz = 0;
      p.life = 100;
    }
  }

  assert.strictEqual(t.projectiles.length, 4);
  dom.release('Space');
});
