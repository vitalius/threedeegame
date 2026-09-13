'use strict';

// 3D game: the grid map (map.js) becomes real geometry, drawn in WebGL.
//
//   map.js ──> buildWorld() ──> one static vertex buffer
//   input ──> player {x, y, angle}
//                │  perspective camera at eye height
//                ▼
//          WebGL: depth test + fog, one draw call per frame

// ---- Map -------------------------------------------------------------------

// Grid data lives in map.js: '#' = wall, ' ' = open.
const MAP = spacemap;
const MAP_H = MAP.length;
const MAP_W = MAP[0].length;
const WALL_CHAR = '#';

// x, y may be fractional (player box corners); snap to the cell.
function isWall(x, y) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) {
    return true; // outside the grid counts as solid
  }

  return MAP[cy][cx] === WALL_CHAR;
}

// ---- Player + input ----------------------------------------------------------

const Key = Object.freeze({
  Forward: ['KeyW', 'ArrowUp'],
  Back: ['KeyS', 'ArrowDown'],
  RotateLeft: ['KeyA', 'ArrowLeft'],
  RotateRight: ['KeyD', 'ArrowRight'],
  StrafeLeft: ['KeyQ'],
  StrafeRight: ['KeyE'],
});

const GAME_CODES = new Set(Object.values(Key).flat());

const MOVE_SPEED = 3;      // cells / sec
const ROT_SPEED = 2.5;     // rad / sec
const PLAYER_RADIUS = 0.2; // box half-size used for collision
const MAX_DT = 0.05;       // clamp frame time (tab switches, hiccups)

// Spawn in an open cell (row 4, col 3), facing east.
const SPAWN_X = 3.5;
const SPAWN_Y = 4.5;
const SPAWN_ANGLE = 0;

const player = { x: SPAWN_X, y: SPAWN_Y, angle: SPAWN_ANGLE };
const keys = new Set();

window.addEventListener('keydown', (e) => {
  if (GAME_CODES.has(e.code)) {
    e.preventDefault(); // arrow keys must not scroll the page
  }

  keys.add(e.code);
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

function pressed(group) {
  for (const code of group) {
    if (keys.has(code)) {
      return true;
    }
  }

  return false;
}

function update(dt) {
  if (pressed(Key.RotateLeft)) {
    player.angle -= ROT_SPEED * dt;
  }

  if (pressed(Key.RotateRight)) {
    player.angle += ROT_SPEED * dt;
  }

  let mx = 0;
  let my = 0;

  if (pressed(Key.Forward)) {
    mx += Math.cos(player.angle);
    my += Math.sin(player.angle);
  }

  if (pressed(Key.Back)) {
    mx -= Math.cos(player.angle);
    my -= Math.sin(player.angle);
  }

  // Strafe is the facing direction rotated 90 degrees: right = (-sin, cos).
  if (pressed(Key.StrafeLeft)) {
    mx += Math.sin(player.angle);
    my -= Math.cos(player.angle);
  }

  if (pressed(Key.StrafeRight)) {
    mx -= Math.sin(player.angle);
    my += Math.cos(player.angle);
  }

  const len = Math.hypot(mx, my);
  if (len === 0) {
    return;
  }

  move((mx / len) * MOVE_SPEED * dt, (my / len) * MOVE_SPEED * dt);
}

// Move one axis at a time so the player slides along walls.
function move(mx, my) {
  if (!blocked(player.x + mx, player.y)) {
    player.x += mx;
  }

  if (!blocked(player.x, player.y + my)) {
    player.y += my;
  }
}

// Player is a box; all four corners must sit on open cells.
function blocked(x, y) {
  const r = PLAYER_RADIUS;

  return isWall(x - r, y - r) ||
         isWall(x + r, y - r) ||
         isWall(x - r, y + r) ||
         isWall(x + r, y + r);
}

// ---- Math ----------------------------------------------------------------------

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---- World geometry ----------------------------------------------------------------

// One interleaved vertex: x, y, z, r, g, b.
const STRIDE = 6;

// Map (x, y) becomes world (x, z); walls are 1 unit tall.
const WALL_X = [0.72, 0.32, 0.28]; // faces with normal along x
const WALL_Y = [0.55, 0.62, 0.35]; // faces with normal along z
const CEIL_COLOR = [0.85, 0.88, 0.92];
const FLOOR_COLOR = [0.22, 0.20, 0.19];
const CLEAR_COLOR = [0.05, 0.05, 0.07];

// Fixed light, baked into vertex colors at build time.
const LIGHT = [0.35, 0.8, 0.45];
const AMBIENT = 1.75;
const DIFFUSE = 1.65;

function litColor(base, n) {
  const d = AMBIENT + DIFFUSE * Math.max(dot(n, LIGHT), 0);
  return [base[0] * d, base[1] * d, base[2] * d];
}

// Two triangles (v0 v1 v2, v0 v2 v3) with one pre-lit color.
function addFace(out, n, c, v0, v1, v2, v3) {
  const col = litColor(c, n);
  for (const v of [v0, v1, v2, v0, v2, v3]) {
    out.push(v[0], v[1], v[2], col[0], col[1], col[2]);
  }
}

// Every wall cell gets four side faces; floor and ceiling span the map.
function buildWorld() {
  const out = [];

  for (let cy = 0; cy < MAP_H; cy++) {
    for (let cx = 0; cx < MAP_W; cx++) {
      if (MAP[cy][cx] !== WALL_CHAR) {
        continue;
      }

      const x0 = cx;
      const x1 = cx + 1;
      const z0 = cy;
      const z1 = cy + 1;

      addFace(out, [-1, 0, 0], WALL_X, [x0, 0, z0], [x0, 0, z1], [x0, 1, z1], [x0, 1, z0]);
      addFace(out, [1, 0, 0], WALL_X, [x1, 0, z0], [x1, 0, z1], [x1, 1, z1], [x1, 1, z0]);
      addFace(out, [0, 0, -1], WALL_Y, [x0, 0, z0], [x1, 0, z0], [x1, 1, z0], [x0, 1, z0]);
      addFace(out, [0, 0, 1], WALL_Y, [x0, 0, z1], [x1, 0, z1], [x1, 1, z1], [x0, 1, z1]);
    }
  }

  addFace(out, [0, 1, 0], FLOOR_COLOR, [0, 0, 0], [MAP_W, 0, 0], [MAP_W, 0, MAP_H], [0, 0, MAP_H]);
  addFace(out, [0, -1, 0], CEIL_COLOR, [0, 1, 0], [MAP_W, 1, 0], [MAP_W, 1, MAP_H], [0, 1, MAP_H]);

  return new Float32Array(out);
}

// ---- Shaders --------------------------------------------------------------------

// World: pre-lit per-vertex colors, distance fog in the fragment.
const VERT_SRC = [
  'attribute vec3 aPos;',
  'attribute vec3 aColor;',
  'uniform mat4 uMVP;',
  'varying vec3 vColor;',
  'varying float vDist;',
  'void main() {',
  '  vColor = aColor;',
  '  gl_Position = uMVP * vec4(aPos, 1.0);',
  '  vDist = gl_Position.w;',
  '}',
].join('\n');

const FRAG_SRC = [
  'precision mediump float;',
  'varying vec3 vColor;',
  'varying float vDist;',
  '',
  '#define FOG_DENSITY 0.5',
  'const vec3 FOG_COLOR = vec3(0.05, 0.05, 0.07);',
  '',
  'void main() {',
  '  float fog = 1.0 - exp(-vDist * FOG_DENSITY);',
  '  gl_FragColor = vec4(mix(vColor, FOG_COLOR, fog), 1.0);',
  '}',
].join('\n');

// ---- Camera ------------------------------------------------------------------------

const FOV = Math.PI / 3; // 60 degree horizontal field of view
const EYE_HEIGHT = 0.5;
const NEAR = 0.1;
const FAR = 50;

// MVP for the current player pose; aspect from the canvas.
function cameraMVP(aspect) {
  const eye = [player.x, EYE_HEIGHT, player.y];
  const center = [
    player.x + Math.cos(player.angle),
    EYE_HEIGHT,
    player.y + Math.sin(player.angle),
  ];

  const view = matLookAt(eye, center, [0, 1, 0]);
  const fovY = 2 * Math.atan(Math.tan(FOV / 2) / aspect);
  return matMultiply(matPerspective(fovY, aspect, NEAR, FAR), view);
}

// Column-major 4x4 matrices, WebGL convention.
function matPerspective(fovY, aspect, near, far) {
  const m = new Float32Array(16);
  const f = 1 / Math.tan(fovY / 2);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function matLookAt(eye, center, up) {
  const z = normalize(sub(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function matMultiply(a, b) {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + r] * b[c * 4 + k];
      }
      m[c * 4 + r] = s;
    }
  }
  return m;
}

// ---- WebGL ---------------------------------------------------------------------------

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });

let worldProg;
let worldBuf;
let worldVerts;
let posLoc;
let colLoc;
let mvpLoc;
let lastT = 0;

if (!gl) {
  document.body.textContent = 'WebGL not supported';
} else {
  setup();
}

function setup() {
  worldProg = buildProgram(VERT_SRC, FRAG_SRC);
  if (!worldProg) {
    return;
  }

  posLoc = gl.getAttribLocation(worldProg, 'aPos');
  colLoc = gl.getAttribLocation(worldProg, 'aColor');
  mvpLoc = gl.getUniformLocation(worldProg, 'uMVP');

  worldVerts = buildWorld();
  worldBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
  gl.bufferData(gl.ARRAY_BUFFER, worldVerts, gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);

  window.addEventListener('resize', render);
  requestAnimationFrame(frame);
}

// ---- Render ----------------------------------------------------------------------------

function frame(t) {
  const dt = Math.min((t - lastT) / 1000, MAX_DT);
  lastT = t;

  update(dt);
  render();
  requestAnimationFrame(frame);
}

function render() {
  resize();

  gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = canvas.width / canvas.height;

  gl.useProgram(worldProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
  attr(posLoc, 3, STRIDE * 4, 0);
  attr(colLoc, 3, STRIDE * 4, 3 * 4);
  gl.uniformMatrix4fv(mvpLoc, false, cameraMVP(aspect));
  gl.drawArrays(gl.TRIANGLES, 0, worldVerts.length / STRIDE);
}

// ---- GL helpers ---------------------------------------------------------------------------

// Point a vertex attribute at the currently bound buffer.
function attr(loc, size, stride, offset) {
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
}

// Match the backing store to the CSS size for crisp pixels on HiDPI.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
}

function buildProgram(vsSrc, fsSrc) {
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }

  return program;
}

function compile(type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
