'use strict';

// Headless harness: runs map.js + game.js in a vm context with stubbed DOM
// and WebGL. game.js is a browser script, so the harness appends one line
// exposing its top-level functions for assertions.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.join(import.meta.dirname, '..');

// The WebGL constants game.js touches.
export const GL = {
  ARRAY_BUFFER: 0x8892,
  VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30,
  FLOAT: 0x1406,
  STATIC_DRAW: 0x88E4,
  DYNAMIC_DRAW: 0x88E8,
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x100,
  TRIANGLES: 4,
  DEPTH_TEST: 0xB71,
};

// Recording WebGL stub: untracked calls are no-ops.
export function createGLStub({ failLink = false } = {}) {
  const calls = {
    draws: [],
    bufferData: [],
    bufferSubData: [],
    viewport: [],
    clearColor: [],
    uniform1i: [],
    uniform3fv: [],
  };
  let attrCounter = 0;

  const gl = new Proxy({}, {
    get(_t, prop) {
      if (prop in GL) {
        return GL[prop];
      }

      switch (prop) {
        case 'getShaderParameter':
          return () => true;
        case 'getProgramParameter':
          return () => !failLink;
        case 'getAttribLocation':
          return () => attrCounter++;
        case 'drawArrays':
          return (mode, first, count) => calls.draws.push({ mode, first, count });
        case 'bufferData':
          return (_b, data, usage) => calls.bufferData.push({
            size: typeof data === 'number' ? data : data.length * 4,
            usage,
          });
        case 'bufferSubData':
          return (_b, _off, data) => calls.bufferSubData.push(data);
        case 'viewport':
          return (_x, _y, w, h) => calls.viewport.push({ w, h });
        case 'clearColor':
          return (r, g, b, a) => calls.clearColor.push([r, g, b, a]);
        case 'uniform1i':
          return (_loc, v) => calls.uniform1i.push(v);
        case 'uniform3fv':
          return (_loc, v) => calls.uniform3fv.push(v);
        case 'createShader':
        case 'createBuffer':
        case 'createProgram':
          return () => ({});
        default:
          return () => {};
      }
    },
  });

  return { gl, calls };
}

export function createDomStub(gl, { width = 320, height = 180, dpr = 1 } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: width,
    clientHeight: height,
    getContext: () => gl,
  };

  const listeners = {};
  let rafCb = null;

  const win = {
    devicePixelRatio: dpr,
    addEventListener(type, cb) {
      listeners[type] = cb;
    },
  };

  const doc = { body: {}, getElementById: () => canvas };

  return {
    canvas,
    win,
    doc,
    listeners,
    // Run one scheduled frame.
    tick(t) {
      const cb = rafCb;
      rafCb = null;
      cb(t);
    },
    raf(cb) {
      rafCb = cb;
    },
    // A frame is pending if setup() survived.
    pending() {
      return rafCb !== null;
    },
    press(code) {
      listeners.keydown({ code, preventDefault() {} });
    },
    release(code) {
      listeners.keyup({ code, preventDefault() {} });
    },
  };
}

// Load map.js + game.js; return exposed internals plus stub handles.
export function loadGame(opts = {}) {
  const { gl, calls } = createGLStub(opts);
  const dom = createDomStub(gl, opts);

  const mapSrc = fs.readFileSync(path.join(ROOT, 'map.js'), 'utf8');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const expose =
    '\nglobalThis.__t = { isWall, blocked, move, update, render, ' +
    'buildWorld, buildSphere, cameraMVP, player, keys, projectiles, canvas };\n';

  const ctx = {
    console,
    window: dom.win,
    document: dom.doc,
    requestAnimationFrame: dom.raf,
  };
  vm.createContext(ctx);
  vm.runInContext(mapSrc + '\n' + gameSrc + expose, ctx, { filename: 'game.js' });

  return { t: ctx.__t, calls, dom };
}
