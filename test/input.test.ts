// KeyInput tests: game actions bound to key codes (event.code).
// The query is injected, so the code -> action mapping is testable
// without a browser; the real query is LittleJS's keyIsDown.

import test from 'node:test';
import assert from 'node:assert';
import { KeyInput } from '../src/input.ts';
import { Action } from '../src/sim.ts';

function inputWith(codes: string[]) {
  const down = new Set(codes);
  return new KeyInput((code) => down.has(code));
}

test('each key binds its action', () => {
  const cases: [string, Action][] = [
    ['KeyW', Action.Forward],
    ['KeyS', Action.Back],
    ['KeyA', Action.RotateLeft],
    ['KeyD', Action.RotateRight],
    ['KeyQ', Action.StrafeLeft],
    ['KeyE', Action.StrafeRight],
    ['Space', Action.Fire],
  ];

  for (const [code, action] of cases) {
    const input = inputWith([code]);
    assert.strictEqual(input.isDown(action), true, code);
  }
});

test('arrows bind the same actions as wasd', () => {
  const cases: [string, Action][] = [
    ['ArrowUp', Action.Forward],
    ['ArrowDown', Action.Back],
    ['ArrowLeft', Action.RotateLeft],
    ['ArrowRight', Action.RotateRight],
  ];

  for (const [code, action] of cases) {
    const input = inputWith([code]);
    assert.strictEqual(input.isDown(action), true, code);
  }
});

test('no action cross-talk', () => {
  const input = inputWith(['KeyQ']);
  for (const action of Object.values(Action)) {
    assert.strictEqual(input.isDown(action), action === Action.StrafeLeft);
  }
});

test('unbound keys trigger no action', () => {
  const input = inputWith(['KeyF']);
  for (const action of Object.values(Action)) {
    assert.strictEqual(input.isDown(action), false);
  }
});

test('no keys down, nothing is down', () => {
  const input = inputWith([]);
  for (const action of Object.values(Action)) {
    assert.strictEqual(input.isDown(action), false);
  }
});
