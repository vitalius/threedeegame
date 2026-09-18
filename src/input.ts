// Keyboard input: game actions bound to key codes, polled through
// LittleJS's keyIsDown (event.code based, WASD emulates arrows).

import { keyIsDown } from 'littlejsengine';
import { Action } from './sim.js';

const Key: Record<Action, readonly string[]> = Object.freeze({
  [Action.Forward]: ['KeyW', 'ArrowUp'],
  [Action.Back]: ['KeyS', 'ArrowDown'],
  [Action.RotateLeft]: ['KeyA', 'ArrowLeft'],
  [Action.RotateRight]: ['KeyD', 'ArrowRight'],
  [Action.StrafeLeft]: ['KeyQ'],
  [Action.StrafeRight]: ['KeyE'],
  [Action.Fire]: ['Space'],
});

type KeyQuery = (code: string) => boolean;

export class KeyInput {
  #query: KeyQuery;

  constructor(query: KeyQuery = keyIsDown) {
    this.#query = query;
  }

  isDown(action: Action) {
    for (const code of Key[action]) {
      if (this.#query(code)) {
        return true;
      }
    }

    return false;
  }
}
