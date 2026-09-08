# Sketchy Snake — duel server

Authoritative WebSocket server for the online VS mode. It owns the game tick;
clients send direction intents and render the snapshots it broadcasts.

## Run it

```bash
pnpm install          # or npm install
pnpm start            # PORT defaults to 8787
```

It also serves the static game from the repo root, so with the server running,
`http://localhost:8787` is a complete playable build with no second process.

```bash
pnpm test             # rules engine + socket protocol (node --test)
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `ALLOWED_ORIGINS` | *(unset)* | Comma-separated origin allowlist. Unset accepts everything, which local dev and the Capacitor build need. Set it in production to `https://aunysillyme.github.io`. |
| `DUEL_COUNTDOWN_SECONDS` | `3` | Pre-round countdown |
| `DUEL_ROUNDOVER_MS` | `3200` | How long the result card stays up |
| `DUEL_GRACE_MS` | `20000` | Reconnect window before a dropped player forfeits |
| `DUEL_ROOM_TTL_MS` | `60000` | How long an empty room lingers before it is swept |

## Deploying on Railway

Set the service **root directory** to `server`; `railway.json` here supplies the
start command and the `/health` check. Then point the client at it by setting
`window.SKETCHY_DUEL_SERVER` in `index.html` to the service's `wss://` URL.

## Protocol

Client → server: `create`, `join {room, token?}`, `quick`, `dir {d}`, `leave`, `ping`.

Server → client: `hello`, `joined {room, seat, token, wins, players}`, `peer`,
`countdown {n}`, `state {tick, p1, p2, food, eaten?}`, `roundover {winner, causes, wins, scores}`,
`paused {seat, seconds}`, `error {code, message}`, `left`, `pong`.

Bodies travel as flat cell ids (`y * 18 + x`) rather than `{x, y}` objects.
Client messages are limited to 8 KiB. Names are optional/null or strings of at
most 64 characters; room codes are four letters/digits (case-insensitive), and
reconnect tokens are optional/null or the 24-character lowercase hex token
issued by the server. Directions must be `UP`, `DOWN`, `LEFT`, or `RIGHT`.
Invalid JSON returns `bad_json`; invalid fields return `bad_message` before any
room mutation. Oversized WebSocket messages close with code 1009. `ping` keeps
its arbitrary JSON `at` echo, subject to the message size limit.

The full board is sent every tick — roughly 1–3 KB at 9 ticks/second, which is
cheap enough that delta encoding would be premature.
