// Logic tests: grid queries, collision, input-driven update.
//
//   ########
//   # #    #
//   #    # #
//   #    # #
//   #      #
//   #      #
//   ##  ####
//   ########
//
// Spawn (3.5, 4.5) is the open cell at row 4, col 3.

import test from 'node:test';
import assert from 'node:assert';
import { isWall, blocked, move, update, reset, player, Action, type Input } from '../src/sim.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Input fake for update(): press and release actions directly.
class FakeInput implements Input {
  #down = new Set<Action>();

  press(action: Action) { this.#down.add(action); }
  release(action: Action) { this.#down.delete(action); }
  isDown(action: Action) { return this.#down.has(action); }
}

// ---- isWall -------------------------------------------------------------------

test('in-grid cells', () => {
  assert.strictEqual(isWall(7, 4), true);
  assert.strictEqual(isWall(3, 4), false);
  assert.strictEqual(isWall(5, 2), true); // pillar at col 5, rows 2-3
  assert.strictEqual(isWall(5, 3), true);
  assert.strictEqual(isWall(4, 3), false);
  assert.strictEqual(isWall(6, 6), true); // row 6 block, cols 4-6
  assert.strictEqual(isWall(3, 6), false);
});

test('out-of-bounds is solid on all sides', () => {
  assert.strictEqual(isWall(-1, 0), true);
  assert.strictEqual(isWall(8, 0), true);
  assert.strictEqual(isWall(0, -1), true);
  assert.strictEqual(isWall(0, 8), true);
});

test('fractional coords snap to the cell', () => {
  assert.strictEqual(isWall(0.9, 4.5), true);  // col 0
  assert.strictEqual(isWall(4.9, 4.1), false); // (4, 4) open
  assert.strictEqual(isWall(-0.2, 0.5), true); // floors to (-1, 0)
});

// ---- blocked --------------------------------------------------------------------

test('spawn cell is open', () => {
  assert.strictEqual(blocked(3.5, 4.5), false);
});

test('hugging the west border is blocked until radius clears', () => {
  assert.strictEqual(blocked(0.5, 4.5), true);
  assert.strictEqual(blocked(1.0, 4.5), true);
  assert.strictEqual(blocked(1.3, 4.5), false);
});

test('hugging the top and bottom borders is blocked', () => {
  assert.strictEqual(blocked(3.5, 0.5), true);
  assert.strictEqual(blocked(3.5, 7.3), true);
  assert.strictEqual(blocked(3.5, 6.5), false);
});

// ---- move -----------------------------------------------------------------------

test('huge step into the west wall is fully blocked', () => {
  reset();
  move(-10, 0);
  assert.ok(near(player.x, 3.5));
  assert.ok(near(player.y, 4.5));
});

test('free step lands', () => {
  reset();
  move(0.1, 0);
  assert.ok(near(player.x, 3.6));
});

test('axis separation: blocked x stays, free y slides', () => {
  reset();
  move(-3, -3); // west hits col 0, north is open at col 3
  assert.ok(near(player.x, 3.5));
  assert.ok(near(player.y, 1.5));
});

// ---- update (input-driven) ---------------------------------------------------------

test('rotate left, then right, cancels out', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.RotateLeft);
  update(0.1, input);
  assert.ok(near(player.angle, -0.25));
  input.release(Action.RotateLeft);

  input.press(Action.RotateRight);
  update(0.1, input);
  assert.ok(near(player.angle, 0));
  input.release(Action.RotateRight);
});

test('forward moves along the facing direction', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Forward);
  update(0.1, input); // 3 cells/s * 0.1 s
  assert.ok(near(player.x, 3.8));
  assert.ok(near(player.y, 4.5));
  input.release(Action.Forward);
});

test('back moves against the facing direction', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Back);
  update(0.1, input);
  assert.ok(near(player.x, 3.2));
  input.release(Action.Back);
});

test('releasing the key stops movement', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Forward);
  update(0.1, input);
  input.release(Action.Forward);
  update(0.1, input);
  assert.ok(near(player.x, 3.8));
});

test('strafe right, perpendicular to the facing direction', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.StrafeRight);
  update(0.1, input);
  assert.ok(near(player.x, 3.5));
  assert.ok(near(player.y, 4.8));
  input.release(Action.StrafeRight);
});

test('strafe left, perpendicular to the facing direction', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.StrafeLeft);
  update(0.1, input);
  assert.ok(near(player.x, 3.5));
  assert.ok(near(player.y, 4.2));
  input.release(Action.StrafeLeft);
});

test('forward + strafe keep full speed (normalized diagonal)', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.Forward);
  input.press(Action.StrafeRight);
  update(0.1, input); // 0.3 * cos(pi/4)
  assert.ok(near(player.x, 3.5 + 0.3 * Math.SQRT1_2));
  assert.ok(near(player.y, 4.5 + 0.3 * Math.SQRT1_2));
  input.release(Action.Forward);
  input.release(Action.StrafeRight);
});

test('no input, no movement', () => {
  const input = new FakeInput();
  reset();

  update(0.1, input);
  assert.ok(near(player.x, 3.5));
  assert.ok(near(player.y, 4.5));
  assert.ok(near(player.angle, 0));
});

test('rotate + move in one frame: turn right then step', () => {
  const input = new FakeInput();
  reset();

  input.press(Action.RotateRight);
  input.press(Action.Forward);
  update(0.1, input);
  assert.ok(near(player.angle, 0.25));
  assert.ok(player.x > 3.5);
  assert.ok(near(player.y, 4.5 + 0.3 * Math.sin(0.25)));
  input.release(Action.RotateRight);
  input.release(Action.Forward);
});
