// Game rules: player, projectiles, grid collision.
// No DOM, no rendering, no input device: update(dt, input) takes an
// object with isDown(action), so tests drive it with a fake.
//
//   input.isDown(Action) ──> update(dt) ──> player {x, y, angle}
//                                       └──> projectiles [{x, y, z, vx, vy, vz, life}]

import { MAP } from './map.js';

// Game actions; the input layer binds these to keys.
export const Action = Object.freeze({
  Forward: 'Forward',
  Back: 'Back',
  RotateLeft: 'RotateLeft',
  RotateRight: 'RotateRight',
  StrafeLeft: 'StrafeLeft',
  StrafeRight: 'StrafeRight',
  Fire: 'Fire',
} as const);

export type Action = (typeof Action)[keyof typeof Action];

// The only contract the sim has with the input layer.
export interface Input {
  isDown(action: Action): boolean;
}

const MAP_H = MAP.length;
const MAP_W = MAP[0].length;
const WALL_CHAR = '#';

// x, y may be fractional (player box corners); snap to the cell.
export function isWall(x: number, y: number) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) {
    return true; // outside the grid counts as solid
  }

  return MAP[cy][cx] === WALL_CHAR;
}

const MOVE_SPEED = 3;      // cells / sec
const ROT_SPEED = 2.5;     // rad / sec
const PLAYER_RADIUS = 0.2; // box half-size used for collision

// Spawn in an open cell (row 4, col 3), facing east.
const SPAWN_X = 3.5;
const SPAWN_Y = 4.5;
const SPAWN_ANGLE = 0;

export const player = { x: SPAWN_X, y: SPAWN_Y, angle: SPAWN_ANGLE };

export function update(dt: number, input: Input) {
  if (input.isDown(Action.RotateLeft)) {
    player.angle -= ROT_SPEED * dt;
  }

  if (input.isDown(Action.RotateRight)) {
    player.angle += ROT_SPEED * dt;
  }

  let mx = 0;
  let my = 0;

  if (input.isDown(Action.Forward)) {
    mx += Math.cos(player.angle);
    my += Math.sin(player.angle);
  }

  if (input.isDown(Action.Back)) {
    mx -= Math.cos(player.angle);
    my -= Math.sin(player.angle);
  }

  // Strafe is the facing direction rotated 90 degrees: right = (-sin, cos).
  if (input.isDown(Action.StrafeLeft)) {
    mx += Math.sin(player.angle);
    my -= Math.cos(player.angle);
  }

  if (input.isDown(Action.StrafeRight)) {
    mx -= Math.sin(player.angle);
    my += Math.cos(player.angle);
  }

  fireCd -= dt;
  if (input.isDown(Action.Fire) && fireCd <= 0 && projectiles.length < MAX_PROJECTILES) {
    spawnProjectile();
    fireCd = FIRE_COOLDOWN;
  }

  updateProjectiles(dt);

  const len = Math.hypot(mx, my);
  if (len === 0) {
    return;
  }

  move((mx / len) * MOVE_SPEED * dt, (my / len) * MOVE_SPEED * dt);
}

// Move one axis at a time so the player slides along walls.
export function move(mx: number, my: number) {
  if (!blocked(player.x + mx, player.y)) {
    player.x += mx;
  }

  if (!blocked(player.x, player.y + my)) {
    player.y += my;
  }
}

// Player is a box; all four corners must sit on open cells.
export function blocked(x: number, y: number) {
  const r = PLAYER_RADIUS;

  return isWall(x - r, y - r) ||
         isWall(x + r, y - r) ||
         isWall(x - r, y + r) ||
         isWall(x + r, y + r);
}

// Restore spawn state; used by tests between cases.
export function reset() {
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.angle = SPAWN_ANGLE;
  projectiles.length = 0;
  fireCd = 0;
}

// ---- Projectile -------------------------------------------------------------

const PROJ_SPEED = 2.0;           // cells / sec; slower than the player
export const PROJ_RADIUS = 0.15;   // collision radius, also the sphere size
export const PROJ_HEIGHT = 0.5;    // flight height, eye level
const PROJ_SPAWN_DIST = 1.0;       // spawn offset in front of the player
const PROJ_LIFE = 6;               // seconds of flight before self-destruct
const FIRE_COOLDOWN = 0.4;         // seconds between shots
export const MAX_PROJECTILES = 4;  // cap; also the scene light pool size

// One flying sphere is one light source: {x, y, z, vx, vy, vz, life}.
// x, z are map coords; y is world height.
export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export const projectiles: Projectile[] = [];
let fireCd = 0;

function spawnProjectile() {
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);

  projectiles.push({
    x: player.x + fx * PROJ_SPAWN_DIST,
    y: PROJ_HEIGHT,
    z: player.y + fy * PROJ_SPAWN_DIST,
    vx: fx * PROJ_SPEED,
    vy: 0,
    vz: fy * PROJ_SPEED,
    life: PROJ_LIFE,
  });
}

function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    if (p.life <= 0 || hitsWall(p)) {
      projectiles.splice(i, 1);
    }
  }
}

// Walls span the full 0..1 height, so a 2D corner check suffices.
function hitsWall(p: Projectile) {
  const r = PROJ_RADIUS;

  return isWall(p.x - r, p.z - r) ||
         isWall(p.x + r, p.z - r) ||
         isWall(p.x - r, p.z + r) ||
         isWall(p.x + r, p.z + r);
}
