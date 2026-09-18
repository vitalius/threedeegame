# Three Dee Game

3D game in TypeScript. Three.js owns the scene, LittleJS owns the 60 Hz loop
and keyboard input. The sim is DOM-free, so tests run it headless in Node.

Try it live [https://home.cloudmotion.com/threedeegame/](https://home.cloudmotion.com/threedeegame/)

## Architecture

```
index.html ─────────────> dist/main.js   (self-contained bundle of src/ +
                                          three + littlejsengine)
```

`npm run build` bundles everything into one file, so the game needs no
`node_modules` at runtime and `dist/` can be hosted by any static server.

```
main.ts    boot: engine tick, canvas, ThreeJSPlugin wiring
  ├─ input.ts   key codes -> Action, polled each tick
  ├─ sim.ts     rules: player, projectiles, grid collision. No DOM.
  ├─ scene.ts   THREE graph: world mesh, sun, ambient, light pool, camera
  └─ map.ts     grid: '#' wall, ' ' open
```

Per tick (60 Hz), one sim step then one scene sync:

```
input.isDown(Action) > sim.update(TICK) > syncWorld(world, sim, camera)
                                                  └> ThreeJSPlugin renders
```

```
src/             TypeScript sources
dist/            build output (npm run build): main.js + index.html,
                 self-contained, servable by any static server
test/            node:test suites + setup.ts (LittleJS headless, manual step)
server.ts        zero-dependency static server (dev, serves the repo root)
build-html.mjs   emits dist/index.html with the bundle path rewritten
tsconfig.json        base compiler config
tsconfig.test.json   typecheck config: src + test + server, no emit
```

## Commands

```
npm install        install dependencies
npm start          dev server on http://localhost:3000 (serves the repo root)
npm run build      typecheck, bundle src/ + deps to dist/main.js, emit dist/index.html
npm run serve:dist serve dist/ on http://localhost:3000 (python3 http.server)
npm test           run tests (tsx loads src/ directly, no build needed)
npm run typecheck  typecheck src + test + server, no emit
```

## Hosting

`dist/` is self-contained (bundle + html, no `node_modules`, no importmap):

```
npm run build
npm run serve:dist     # or: cd dist && python3 -m http.server 3000
```

Any simple static server (nginx, GitHub Pages, `npx serve dist`, ...)
works the same way: point it at `dist/`.

## Updating packages

Dependencies are pinned exactly (no `^`), so updates are explicit:

```
npm install three@NEW littlejsengine@NEW
npm install -D @types/three@NEW    # must match three's version
```

`three` ships no types; `littlejsengine` does. After an update, re-run
`npm run build` to refresh the bundle in `dist/`.
