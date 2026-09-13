'use strict';

// Render tests: draw order, world buffer layout, geometry, resize, frame loop.

import test from 'node:test';
import assert from 'node:assert';
import { loadGame, GL } from './stub.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

// Vertex count from the map, not hardcoded; stride is 6 (pos + color).
const vertCount = (t) => t.buildWorld().length / 6;

// ---- draw sequence ----------------------------------------------------------------

test('each frame: one world draw call', () => {
  const { t, calls, dom } = loadGame();
  dom.tick(16);
  dom.tick(32);

  const n = vertCount(t);
  assert.deepStrictEqual(calls.draws, [
    { mode: GL.TRIANGLES, first: 0, count: n },
    { mode: GL.TRIANGLES, first: 0, count: n },
  ]);
});

test('clear color matches the fog color', () => {
  const { calls, dom } = loadGame();
  dom.tick(16);
  assert.deepStrictEqual(calls.clearColor.at(-1), [0.05, 0.05, 0.07, 1]);
});

// ---- world buffer -----------------------------------------------------------------

test('world buffer: one static upload, 6 floats per vertex', () => {
  const { t, calls, dom } = loadGame();
  dom.tick(16);

  const n = vertCount(t);
  assert.strictEqual(calls.bufferData.length, 1);
  assert.strictEqual(calls.bufferData[0].size, n * 6 * 4);
  assert.strictEqual(calls.bufferData[0].usage, GL.STATIC_DRAW);
});

// ---- geometry ------------------------------------------------------------------------

// Border wall corners share positions with floor/ceiling corners, so a
// position lookup can match several vertices; select by color signature.
test('floor at y=0, ceiling at y=1, wall face on x=7', () => {
  const { t } = loadGame();
  const w = t.buildWorld();

  const colorsAt = (x, y, z) => {
    const out = [];
    for (let i = 0; i < w.length; i += 6) {
      if (w[i] === x && w[i + 1] === y && w[i + 2] === z) {
        out.push([w[i + 3], w[i + 4], w[i + 5]]);
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

// ---- camera ------------------------------------------------------------------------

test('camera at spawn: wall ahead centered, wall behind clipped', () => {
  const { t } = loadGame();
  const m = t.cameraMVP(320 / 180); // stub's default canvas size

  // Column-major clip transform of a world point.
  const clip = (v) => {
    const p = [v[0], v[1], v[2], 1];
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        out[r] += m[c * 4 + r] * p[c];
      }
    }

    return out;
  };

  // East wall face, straight ahead at eye height: screen center.
  const ahead = clip([7, 0.5, 4.5]);
  assert.ok(ahead[3] > 0);
  assert.ok(Math.abs(ahead[0] / ahead[3]) < 1e-4);
  assert.ok(Math.abs(ahead[1] / ahead[3]) < 1e-4);

  // West border is behind the player: w < 0, the GPU clips it.
  const behind = clip([0.5, 0.5, 4.5]);
  assert.ok(behind[3] < 0);
});

// ---- resize ---------------------------------------------------------------------------

test('canvas resize updates the viewport', () => {
  const { calls, dom } = loadGame();
  dom.tick(16);
  dom.canvas.clientWidth = 640;
  dom.tick(32);

  assert.strictEqual(dom.canvas.width, 640);
  assert.deepStrictEqual(calls.viewport.at(-1), { w: 640, h: 180 });
});

test('HiDPI: backing store scales with devicePixelRatio', () => {
  const { calls, dom } = loadGame({ dpr: 2 });
  dom.tick(16);

  assert.strictEqual(dom.canvas.width, 640);
  assert.strictEqual(dom.canvas.height, 360);
  assert.deepStrictEqual(calls.viewport.at(-1), { w: 640, h: 360 });
});

// ---- frame loop ---------------------------------------------------------------------------

test('dt is clamped: a 1 s gap moves at most MAX_DT', () => {
  const { t, dom } = loadGame();
  dom.press('KeyW');

  dom.tick(16);   // dt 0.016 -> 0.048 cells
  dom.tick(1016); // dt 1.0 clamped to 0.05 -> 0.15 cells

  assert.ok(near(t.player.x, 3.698));
});

test('frame loop reschedules itself', () => {
  const { dom } = loadGame();
  dom.tick(16);
  assert.strictEqual(dom.pending(), true);
});

// ---- setup guards ------------------------------------------------------------------------

test('failed program link: no frame loop scheduled', () => {
  const { dom } = loadGame({ failLink: true });
  assert.strictEqual(dom.pending(), false);
});
