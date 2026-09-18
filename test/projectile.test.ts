// Projectile tests: firing on Fire, flight, cooldown, wall culling, lifetime, cap.

import test from 'node:test';
import assert from 'node:assert';
import { update, reset, player, projectiles, Action, PROJ_HEIGHT, type Input } from '../src/sim.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Input fake for update(): press and release actions directly.
class FakeInput implements Input {
  #down = new Set<Action>();

  press(action: Action) { this.#down.add(action); }
  release(action: Action) { this.#down.delete(action); }
  isDown(action: Action) { return this.#down.has(action); }
}

// Spawn (3.5, 4.5); row 4 is open from col 1 to col 6.
// Projectile: speed 2, spawn 1.0 ahead, height 0.5, life 6, cooldown 0.4, cap 4.

test('fire spawns a projectile in front of the player', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Fire);
  update(0.1, input);

  assert.strictEqual(projectiles.length, 1);
  const p = projectiles[0];
  assert.ok(near(p.x, 4.7)); // 3.5 + 1.0 ahead, then 2.0 * 0.1 flight
  assert.ok(near(p.y, PROJ_HEIGHT));
  assert.ok(near(p.z, 4.5));
  assert.ok(near(p.vx, 2.0));
  assert.ok(near(p.vy, 0));
  assert.ok(near(p.vz, 0));
  assert.ok(near(p.life, 5.9));
});

test('no fire, no projectile', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Forward);
  update(0.1, input);
  assert.strictEqual(projectiles.length, 0);
});

test('facing direction sets spawn point and velocity', () => {
  const input = new FakeInput();
  reset();
  player.angle = Math.PI / 2; // south (+z)

  input.press(Action.Fire);
  update(0.1, input);
  input.release(Action.Fire);

  const p = projectiles[0];
  assert.ok(near(p.x, 3.5));
  assert.ok(near(p.z, 5.7)); // 4.5 + 1.0 ahead, then 0.2 flight
  assert.ok(near(p.vz, 2.0));
});

test('cooldown: one shot per press, re-fire after it expires', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Fire);
  update(0.1, input); // shot 1, cooldown 0.4
  update(0.1, input); // 0.3 left, no shot
  assert.strictEqual(projectiles.length, 1);

  update(0.5, input); // 0.3 - 0.5 < 0, shot 2
  assert.strictEqual(projectiles.length, 2);
  input.release(Action.Fire);
});

test('projectile is removed on wall hit', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Fire);
  update(0.1, input);
  input.release(Action.Fire);

  const p = projectiles[0];
  p.x = 6.9; // 6.9 + 0.15 radius crosses the east wall at x = 7
  p.vx = 0;

  update(0.1, input);
  assert.strictEqual(projectiles.length, 0);
});

test('projectile is removed after its lifetime', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Fire);
  update(0.1, input);
  input.release(Action.Fire);

  projectiles[0].life = 0.05;
  projectiles[0].vx = 0;
  update(0.1, input);
  assert.strictEqual(projectiles.length, 0);
});

test('at most 4 projectiles alive', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Fire);
  for (let i = 0; i < 5; i++) {
    update(0.5, input); // dt > cooldown, always able to fire
    for (const p of projectiles) {
      p.vx = 0; // park them: no flight, no wall hits, no expiry
      p.vz = 0;
      p.life = 100;
    }
  }

  assert.strictEqual(projectiles.length, 4);
  input.release(Action.Fire);
});
