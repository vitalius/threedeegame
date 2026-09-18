// Boot: LittleJS owns the loop (fixed 60 Hz tick), keyboard input and the
// canvas; Three.js owns the 3D scene through the engine's ThreeJSPlugin.
//
//   engineInit ──> gameInit:   ThreeJSPlugin, scene + world build
//                ──> gameUpdate (each 60 Hz tick):
//                          sim.update(TICK, input)
//                          syncWorld(world, sim, camera)
//                          (the plugin renders the Three.js scene)

import * as THREE from 'three';
import * as LJS from 'littlejsengine';
import { MAP } from './map.js';
import * as sim from './sim.js';
import { KeyInput } from './input.js';
import { createScene, createWorld, syncWorld, type World } from './scene.js';

const TICK = 1 / LJS.frameRate; // one engine tick == one simulation step
const CANVAS_ASPECT = 16 / 9;

// Letterbox the engine canvas to 16:9 inside the window.
LJS.setCanvasMinAspect(CANVAS_ASPECT);
LJS.setCanvasMaxAspect(CANVAS_ASPECT);

const input = new KeyInput();
const { scene, camera } = createScene();
let world: World;

function gameInit() {
  // In headless mode the plugin is inert; ours are plain THREE objects.
  const plugin = new LJS.ThreeJSPlugin(THREE);
  plugin.cameraAlign2D = false; // the game drives the camera
  plugin.scene = scene;
  plugin.camera = camera;
  world = createWorld(scene, MAP);
}

function gameUpdate() {
  sim.update(TICK, input);
  syncWorld(world, sim, camera);
}

// Resolves once the engine started and gameInit finished.
export const ready = LJS.engineInit(gameInit, gameUpdate);
export { scene, camera };
