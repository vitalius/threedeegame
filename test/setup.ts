// Node globals LittleJS needs at import time, then headless + manual step.
// Mirrors the setup in the LittleJS repo's own test suite.
//
//   window/AudioContext/localStorage/Image: top-level bundle side effects
//   document: engineInit touches document.body before its headless return
//   headless: no DOM, no input listeners, no canvas
//   manual step: no requestAnimationFrame; tests advance with engineStep(n)

// The stubs below intentionally do not match the real DOM types.
const g = globalThis as Record<string, unknown>;

g.window = {};

g.AudioContext = class AudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createGain() { return { connect() {}, gain: { value: 0 } }; }
  createBuffer() { return {}; }
  createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
  resume() { return Promise.resolve(); }
};

g.localStorage = {};
g.Image = class Image {};
g.document = { body: {} };

const { setHeadlessMode, setEngineManualStep } = await import('littlejsengine');
setHeadlessMode(true);
setEngineManualStep(true);

// Marks this loader hook as an ES module so the top-level await is legal.
export {};
