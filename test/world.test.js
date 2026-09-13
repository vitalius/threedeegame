'use strict';

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
import { loadGame } from './stub.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

// Map rows, for reference in the expected values below.
// row0: ########   row1: # #    #   row2: #    # #
// row3: #    # #   row4: #      #   row5: #      #
// row6: ##  ####   row7: ########

// ---- isWall -------------------------------------------------------------------

test('in-grid cells', () => {
  const { t } = loadGame();
  assert.strictEqual(t.isWall(7, 4), true);
  assert.strictEqual(t.isWall(3, 4), false);
  assert.strictEqual(t.isWall(5, 2), true); // pillar at col 5, rows 2-3
  assert.strictEqual(t.isWall(5, 3), true);
  assert.strictEqual(t.isWall(4, 3), false);
  assert.strictEqual(t.isWall(6, 6), true); // row 6 block, cols 4-6
  assert.strictEqual(t.isWall(3, 6), false);
});

test('out-of-bounds is solid on all sides', () => {
  const { t } = loadGame();
  assert.strictEqual(t.isWall(-1, 0), true);
  assert.strictEqual(t.isWall(8, 0), true);
  assert.strictEqual(t.isWall(0, -1), true);
  assert.strictEqual(t.isWall(0, 8), true);
});

test('fractional coords snap to the cell', () => {
  const { t } = loadGame();
  assert.strictEqual(t.isWall(0.9, 4.5), true);  // col 0
  assert.strictEqual(t.isWall(4.9, 4.1), false); // (4, 4) open
  assert.strictEqual(t.isWall(-0.2, 0.5), true); // floors to (-1, 0)
});

// ---- blocked --------------------------------------------------------------------

test('spawn cell is open', () => {
  const { t } = loadGame();
  assert.strictEqual(t.blocked(3.5, 4.5), false);
});

test('hugging the west border is blocked until radius clears', () => {
  const { t } = loadGame();
  assert.strictEqual(t.blocked(0.5, 4.5), true);
  assert.strictEqual(t.blocked(1.0, 4.5), true);
  assert.strictEqual(t.blocked(1.3, 4.5), false);
});

test('hugging the top and bottom borders is blocked', () => {
  const { t } = loadGame();
  assert.strictEqual(t.blocked(3.5, 0.5), true);
  assert.strictEqual(t.blocked(3.5, 7.3), true);
  assert.strictEqual(t.blocked(3.5, 6.5), false);
});

// ---- move -----------------------------------------------------------------------

test('huge step into the west wall is fully blocked', () => {
  const { t } = loadGame();
  t.move(-10, 0);
  assert.ok(near(t.player.x, 3.5));
  assert.ok(near(t.player.y, 4.5));
});

test('free step lands', () => {
  const { t } = loadGame();
  t.move(0.1, 0);
  assert.ok(near(t.player.x, 3.6));
});

test('axis separation: blocked x stays, free y slides', () => {
  const { t } = loadGame();
  t.move(-3, -3); // west hits col 0, north is open at col 3
  assert.ok(near(t.player.x, 3.5));
  assert.ok(near(t.player.y, 1.5));
});

// ---- update (input-driven) ---------------------------------------------------------

function resetPlayer(t) {
  t.player.x = 3.5;
  t.player.y = 4.5;
  t.player.angle = 0;
}

test('KeyA rotates left, KeyD rotates right', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyA');
  t.update(0.1);
  assert.ok(near(t.player.angle, -0.25));
  dom.release('KeyA');

  dom.press('KeyD');
  t.update(0.1);
  assert.ok(near(t.player.angle, 0));
  dom.release('KeyD');
});

test('arrow keys rotate like wasd', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('ArrowLeft');
  t.update(0.1);
  assert.ok(near(t.player.angle, -0.25));
  dom.release('ArrowLeft');
});

test('KeyW moves forward along the facing direction', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyW');
  t.update(0.1); // 3 cells/s * 0.1 s
  assert.ok(near(t.player.x, 3.8));
  assert.ok(near(t.player.y, 4.5));
});

test('KeyS moves backward', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyS');
  t.update(0.1);
  assert.ok(near(t.player.x, 3.2));
});

test('releasing the key stops movement', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyW');
  t.update(0.1);
  dom.release('KeyW');
  t.update(0.1);
  assert.ok(near(t.player.x, 3.8));
});

test('KeyE strafes right, perpendicular to the facing direction', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyE');
  t.update(0.1);
  assert.ok(near(t.player.x, 3.5));
  assert.ok(near(t.player.y, 4.8));
  dom.release('KeyE');
});

test('KeyQ strafes left', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyQ');
  t.update(0.1);
  assert.ok(near(t.player.x, 3.5));
  assert.ok(near(t.player.y, 4.2));
  dom.release('KeyQ');
});

test('forward + strafe keep full speed (normalized diagonal)', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyW');
  dom.press('KeyE');
  t.update(0.1); // 0.3 * cos(pi/4)
  assert.ok(near(t.player.x, 3.5 + 0.3 * Math.SQRT1_2));
  assert.ok(near(t.player.y, 4.5 + 0.3 * Math.SQRT1_2));
  dom.release('KeyW');
  dom.release('KeyE');
});

test('non-game keys have no effect', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyF');
  t.update(0.1);
  assert.ok(near(t.player.x, 3.5));
  assert.ok(near(t.player.y, 4.5));
  assert.ok(near(t.player.angle, 0));
});

test('rotate + move in one frame: turn right then step', () => {
  const { t, dom } = loadGame();
  resetPlayer(t);

  dom.press('KeyD');
  dom.press('KeyW');
  t.update(0.1);
  assert.ok(near(t.player.angle, 0.25));
  assert.ok(t.player.x > 3.5);
  assert.ok(near(t.player.y, 4.5 + 0.3 * Math.sin(0.25), 1e-9));
});
