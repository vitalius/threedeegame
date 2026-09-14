'use strict';

// Render tests: draw order, world buffer layout, geometry, resize, frame loop.

import test from 'node:test';
import assert from 'node:assert';
import { loadGame, GL } from './stub.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

// Vertex counts from the map, not hardcoded; stride is 9 (pos + normal + color).
const vertCount = (t) => t.buildWorld().length / 9;
const sphereVerts = (t) => t.buildSphere().length / 9;

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

test('Space adds one sphere draw after the world draw', () => {
  const { t, calls, dom } = loadGame();
  dom.tick(16);
  dom.press('Space');
  dom.tick(32);
  dom.tick(48); // cooldown 0.4 s: still a single projectile

  const w = vertCount(t);
  const s = sphereVerts(t);
  assert.deepStrictEqual(calls.draws, [
    { mode: GL.TRIANGLES, first: 0, count: w },
    { mode: GL.TRIANGLES, first: 0, count: w },
    { mode: GL.TRIANGLES, first: 0, count: s },
    { mode: GL.TRIANGLES, first: 0, count: w },
    { mode: GL.TRIANGLES, first: 0, count: s },
  ]);
});

test('projectile position feeds the point light uniforms', () => {
  const { t, calls, dom } = loadGame();
  dom.press('Space');
  dom.tick(16);

  assert.strictEqual(calls.uniform1i.at(-1), 1);

  // Per frame the shader gets lightPos then lightColor, both 4 * 3 floats.
  // float32 precision: the uniform is a Float32Array.
  const f32 = (a, b) => Math.abs(a - b) < 1e-5;
  const pos = calls.uniform3fv.at(-2);
  const color = calls.uniform3fv.at(-1);
  const p = t.projectiles[0];
  assert.ok(f32(pos[0], p.x));
  assert.ok(f32(pos[1], p.y));
  assert.ok(f32(pos[2], p.z));
  assert.deepStrictEqual(
    Array.from(color, (v) => Number(v.toFixed(5))),
    [1.0, 0.8, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

// ---- world buffer -----------------------------------------------------------------

test('static buffers: world and sphere, 9 floats per vertex', () => {
  const { t, calls, dom } = loadGame();
  dom.tick(16);

  const w = vertCount(t);
  const s = sphereVerts(t);
  assert.strictEqual(calls.bufferData.length, 2);
  assert.strictEqual(calls.bufferData[0].size, w * 9 * 4);
  assert.strictEqual(calls.bufferData[0].usage, GL.STATIC_DRAW);
  assert.strictEqual(calls.bufferData[1].size, s * 9 * 4);
  assert.strictEqual(calls.bufferData[1].usage, GL.STATIC_DRAW);
});

// ---- geometry ------------------------------------------------------------------------

// Border wall corners share positions with floor/ceiling corners, so a
// position lookup can match several vertices; select by color signature.
test('floor at y=0, ceiling at y=1, wall face on x=7', () => {
  const { t } = loadGame();
  const w = t.buildWorld();

  const colorsAt = (x, y, z) => {
    const out = [];
    for (let i = 0; i < w.length; i += 9) {
      if (w[i] === x && w[i + 1] === y && w[i + 2] === z) {
        out.push([w[i + 6], w[i + 7], w[i + 8]]);
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
