# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout note

The git repo root is `sketchy-snake/`, one level below the usual working directory `snakeescape/`. Run all git/npm/Gradle commands from `sketchy-snake/`.

## Commands

```bash
# Solo only (no build step, no bundler, no framework)
python3 -m http.server 8080     # then open http://localhost:8080

# Game + online duels: the duel server also serves the static files
cd server && pnpm install && pnpm start   # http://localhost:8787
cd server && pnpm test                    # rules engine + socket protocol

# Native Android (Capacitor)
npm install
npx cap sync android            # copies webDir (www/) into android/app/src/main/assets/public
npx cap open android
cd android && ./gradlew assembleDebug
```

The web client has no build step, linter, or tests — verify it by loading the page and playing. The server does have tests (`cd server && pnpm test`), and they are the right place to pin duel-rule behaviour.

## Architecture

The web client is dependency-free; the duel server has one (`ws`).

- `index.html` — static DOM shell. Every interactive element the game touches is looked up by hardcoded id (`game-canvas`, `game-overlay`, `overlay-title`/`-msg`/`-icon`, `score-val`, `best-val`, `combo-badge`, `start-btn`, `pause-btn`, `sound-btn`, `music-play-btn`, `next-track-btn`, `track-name`/`-time`/`-progress-bar`, `canvas-wrap`, D-pad buttons via `data-dir`). Renaming an id silently breaks the game — grep `game.js` before changing markup.
- `style.css` — sketchbook aesthetic; palette lives in `:root` custom properties (`--paper-bg`, `--cobalt-blue`, `--magenta-pink`, `--purple-ink`, `--orange-heart`, …). `game.js` hardcodes the same hex values for canvas drawing, so a palette change must be made in both places.
- `game.js` — the whole engine inside a single IIFE (`'use strict'`), no exports, entered from `DOMContentLoaded → init()`.
- `net.js` — the duel socket client, also an IIFE, exposing `window.SketchyNet`.
- `server/` — the authoritative duel server (Node + `ws`), with its own `package.json` and tests.

### Game loop

State is module-level mutable variables (`snake`, `direction`/`nextDirection`, `food`, `score`, `combo`, `particles`, …). The loop is a `setInterval(update, ms)` — not `requestAnimationFrame` — so *changing speed means clearing and re-creating `gameInterval`* (`speedUp()` does this on every food pickup, interpolating `BASE_SPEED_MS` → `MIN_SPEED_MS` by score). `update()` moves the head, checks wall then self then food collision, and calls `draw()` itself; `draw()` clears and re-renders grid → food → snake → particles.

Grid is `GRID_SIZE` 18×18 cells; `cellSize` is derived in `resizeCanvas()`, which also applies `devicePixelRatio` scaling — canvas coordinates are CSS pixels after that transform.

Best score persists to `localStorage` under key `sketchy_snake_best`.

### Hand-drawn rendering

All canvas art goes through `roughOffset()` + `drawSketchLine` / `drawSketchRect` / `drawSketchCircle`, which draw each stroke twice along jittered quadratic beziers. New visual elements should use these helpers rather than raw `ctx.lineTo`/`strokeRect`, or they will look out of place.

Food types live in the `MUNCHKIN_TYPES` array (name, color, points, quote, optional `special`); `spawnFood()` picks one via a hardcoded cumulative-probability ladder whose thresholds are index-coupled to that array — reorder the array and the drop rates change with it.

### Online duel mode

`mode` is `'solo' | 'online'`. The client **never simulates a duel** — the server in `server/` owns the rules and the tick, and the client renders authoritative snapshots. When adding duel behaviour, change `server/duel.js`, not `game.js`.

- `net.js` (loaded before `game.js`) wraps the socket and exposes `window.SketchyNet`: `connect/quickMatch/createRoom/joinRoom/sendDir/leave` plus an `on(event, fn)` subscription for every server message type. It owns reconnect backoff and the seat token in `sessionStorage`, and knows nothing about rendering.
- `setupNet()` in `game.js` subscribes to those events. `applyServerState()` decodes flat cell ids into the same `snake`/`snake2`/`food` shapes the renderer already used, so all the sketch drawing works unchanged.
- `handleDirection()` forwards intents in online mode and returns — no local movement, no prediction. Solo still simulates locally through `update()`.
- `applyModeUI()` plus `setLobbyView`/`setOverlayResult` own every DOM difference between modes. The overlay hosts both the round-result card and the lobby; `has-result` on `.overlay-content` is what CSS keys off to trim the redundant lobby chrome.
- A `?room=CODE` query parameter auto-joins that room on load (`joinFromUrl()`), which is what the copy-link button hands out.
- `window.SKETCHY_DUEL_SERVER` in `index.html` selects the server; empty means "same origin as this page".

### Duel server

`server/duel.js` is the pure rules engine — no sockets, no timers, so a round can be stepped by hand in a test. `server/rooms.js` owns the phase machine (`waiting → countdown → playing → roundover`, plus `paused` while a dropped player's 20s grace runs) and quick-match. `server/index.js` is transport only.

Rules worth preserving: both heads are resolved *before* either body moves (so simultaneous crashes are a real draw, not an ordering artifact); nothing ever `pop()`s except the eraser; intents are validated against the last **committed** direction, so two inputs inside one tick cannot compose a 180; and `spawnFood()` caps its rejection sampling because permanent trails can genuinely fill the board.

Phase timings are env-overridable (`DUEL_COUNTDOWN_SECONDS`, `DUEL_ROUNDOVER_MS`, `DUEL_GRACE_MS`) — that is how the socket tests run fast. `node --test "server/test/*.test.js"` covers both layers; note the glob is required, `node --test test/` does not work here.

### Audio

Zero-dependency Web Audio synth. `TRACKS` describes each song declaratively (bpm, scale, bassline, chords); `getTrackBuffer()` renders a 16-beat loop into an `AudioBuffer` sample-by-sample once and caches it in `trackBuffers`, then plays it as a looping `BufferSource`. This pre-buffering is deliberate — do not replace it with per-note scheduled oscillators, which was the mobile-framerate problem it solves. Short SFX still use one-shot oscillators in `playSound()`. `audioCtx` is created lazily in `initAudio()` from the start-button gesture (autoplay policy).

## www/ is a hand-maintained duplicate

`capacitor.config.json` sets `"webDir": "www"`, and `www/` contains byte-identical copies of `game.js`, `net.js`, `index.html`, `style.css`, `manifest.json`, and the icons. **There is no copy script.** Any edit to a root web asset must be mirrored into `www/` before `npx cap sync android`, or the Android build ships the old game.

## Deployment

GitHub Pages serves the repo root (`.nojekyll` present), so root files are the live web build. Pages is static, so online duels need the server deployed elsewhere (see `server/README.md`) and `window.SKETCHY_DUEL_SERVER` pointed at its `wss://` URL; the Android build must set it too, since a Capacitor bundle has no origin to fall back on. Absolute OG/Twitter meta URLs in `index.html` point at `aunysillyme.github.io/sketchy-snake/` — update them if the site moves.
