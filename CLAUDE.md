# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout note

The git repo root is `sketchy-snake/`, one level below the usual working directory `snakeescape/`. Run all git/npm/Gradle commands from `sketchy-snake/`.

## Commands

```bash
# Run locally (no build step, no bundler, no framework)
python3 -m http.server 8080     # then open http://localhost:8080

# Native Android (Capacitor)
npm install
npx cap sync android            # copies webDir (www/) into android/app/src/main/assets/public
npx cap open android
cd android && ./gradlew assembleDebug
```

There is no test suite, linter, or build pipeline (`npm test` is the default failing stub). Verify changes by loading the page and playing.

## Architecture

Three source files, zero dependencies at runtime:

- `index.html` — static DOM shell. Every interactive element the game touches is looked up by hardcoded id (`game-canvas`, `game-overlay`, `overlay-title`/`-msg`/`-icon`, `score-val`, `best-val`, `combo-badge`, `start-btn`, `pause-btn`, `sound-btn`, `music-play-btn`, `next-track-btn`, `track-name`/`-time`/`-progress-bar`, `canvas-wrap`, D-pad buttons via `data-dir`). Renaming an id silently breaks the game — grep `game.js` before changing markup.
- `style.css` — sketchbook aesthetic; palette lives in `:root` custom properties (`--paper-bg`, `--cobalt-blue`, `--magenta-pink`, `--purple-ink`, `--orange-heart`, …). `game.js` hardcodes the same hex values for canvas drawing, so a palette change must be made in both places.
- `game.js` — the whole engine inside a single IIFE (`'use strict'`), no exports, entered from `DOMContentLoaded → init()`.

### Game loop

State is module-level mutable variables (`snake`, `direction`/`nextDirection`, `food`, `score`, `combo`, `particles`, …). The loop is a `setInterval(update, ms)` — not `requestAnimationFrame` — so *changing speed means clearing and re-creating `gameInterval`* (`speedUp()` does this on every food pickup, interpolating `BASE_SPEED_MS` → `MIN_SPEED_MS` by score). `update()` moves the head, checks wall then self then food collision, and calls `draw()` itself; `draw()` clears and re-renders grid → food → snake → particles.

Grid is `GRID_SIZE` 18×18 cells; `cellSize` is derived in `resizeCanvas()`, which also applies `devicePixelRatio` scaling — canvas coordinates are CSS pixels after that transform.

Best score persists to `localStorage` under key `sketchy_snake_best`.

### Hand-drawn rendering

All canvas art goes through `roughOffset()` + `drawSketchLine` / `drawSketchRect` / `drawSketchCircle`, which draw each stroke twice along jittered quadratic beziers. New visual elements should use these helpers rather than raw `ctx.lineTo`/`strokeRect`, or they will look out of place.

Food types live in the `MUNCHKIN_TYPES` array (name, color, points, quote, optional `special`); `spawnFood()` picks one via a hardcoded cumulative-probability ladder whose thresholds are index-coupled to that array — reorder the array and the drop rates change with it.

### VS duel mode

`mode` (`'solo' | 'vs'`) switches the whole machine. Player one reuses the solo variables (`snake`, `direction`, `score`); player two adds a parallel set (`snake2`, `direction2`, `score2`), and `matchWins` tracks rounds. `update()` dispatches to `updateVs()`, which differs from solo in three ways: neither snake ever `pop()`s (the trail is the weapon), collisions are resolved for both heads *before* either moves so simultaneous crashes read as a draw, and munchkins erase `VS_ERASE_ON_EAT` tail segments instead of adding one. Speed is pinned to `VS_SPEED_MS` — `speedUp()` is solo-only.

`handleDirection(dir, player)` takes a player tag: the D-pad passes `'p1'`, canvas swipes pass `'p2'`, and the keyboard splits WASD/arrows — but in solo mode every input is forced to `'p1'`, so solo controls behave exactly as before. `applyModeUI()` owns every DOM difference between the modes (score-card labels, overlay copy, `body.mode-vs`), so new mode-dependent UI belongs there rather than scattered at call sites.

Because VS trails are permanent, the board can genuinely fill: `spawnFood()` caps its rejection sampling and leaves `food` null rather than spinning forever. Keep that guard in any rewrite.

### Audio

Zero-dependency Web Audio synth. `TRACKS` describes each song declaratively (bpm, scale, bassline, chords); `getTrackBuffer()` renders a 16-beat loop into an `AudioBuffer` sample-by-sample once and caches it in `trackBuffers`, then plays it as a looping `BufferSource`. This pre-buffering is deliberate — do not replace it with per-note scheduled oscillators, which was the mobile-framerate problem it solves. Short SFX still use one-shot oscillators in `playSound()`. `audioCtx` is created lazily in `initAudio()` from the start-button gesture (autoplay policy).

## www/ is a hand-maintained duplicate

`capacitor.config.json` sets `"webDir": "www"`, and `www/` contains byte-identical copies of `game.js`, `index.html`, `style.css`, `manifest.json`, and the icons. **There is no copy script.** Any edit to a root web asset must be mirrored into `www/` before `npx cap sync android`, or the Android build ships the old game.

## Deployment

GitHub Pages serves the repo root (`.nojekyll` present), so root files are the live web build. Absolute OG/Twitter meta URLs in `index.html` point at `aunysillyme.github.io/sketchy-snake/` — update them if the site moves.
