'use strict';

/**
 * SKETCHY SNAKE — DUEL SERVER
 *
 * An authoritative WebSocket server: it owns the tick, and clients send nothing
 * but direction intents. That keeps the two boards identical, makes disconnects
 * and draws unambiguous, and means a modified client cannot cheat.
 *
 * It also serves the static game so `npm start` gives you the whole thing on one
 * origin during development; in production the site is on GitHub Pages and only
 * the socket lives here.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const duel = require('./duel');
const { RoomManager, RECONNECT_GRACE_MS } = require('./rooms');
const { validMessage, MAX_PAYLOAD_BYTES } = require('./protocol');

const PORT = process.env.PORT || 8787;
const STATIC_ROOT = path.resolve(__dirname, '..');
const HEARTBEAT_MS = 30000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const manager = new RoomManager();

// --- Static file serving (development convenience) --------------------------

function serveStatic(req, res) {
  let rel;
  try {
    const url = new URL(req.url, 'http://localhost');
    rel = decodeURIComponent(url.pathname);
    if (rel.includes('\0')) throw new URIError('NUL in pathname');
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
    return;
  }
  if (rel === '/') rel = '/index.html';

  const filePath = path.join(STATIC_ROOT, rel);
  // Never serve outside the project, whatever the request says.
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...manager.stats() }));
    return;
  }
  serveStatic(req, res);
});

// --- WebSocket protocol -----------------------------------------------------

// Optional origin allowlist, so a deployed server is not free compute for anyone
// who copies the client. Unset (the default) accepts every origin, which is what
// local development and the Capacitor build need.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  if (!origin) return true;   // Native apps and CLI clients send no Origin header
  return ALLOWED_ORIGINS.includes(origin);
}

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: ({ origin }) => originAllowed(origin)
});

function send(socket, msg) {
  if (socket.readyState !== 1) return;
  try { socket.send(JSON.stringify(msg)); } catch (e) {}
}

function fail(socket, code, message) {
  send(socket, { t: 'error', code, message });
}

function seatInto(socket, room, payload) {
  detach(socket);
  const result = room.join(socket, payload || {});
  send(socket, {
    t: 'joined',
    room: room.code,
    seat: result.seat,
    token: result.token,
    isPublic: room.isPublic,
    phase: room.phase,
    wins: room.wins,
    players: room.peerSummary(),
    grace: RECONNECT_GRACE_MS / 1000,
    grid: duel.GRID_SIZE
  });
}

/** Take a socket out of whatever room it is in, without killing the socket. */
function detach(socket) {
  if (socket.room) {
    socket.room.leave(socket);
    socket.room = null;
    socket.seat = null;
  }
}

function dispatch(socket, msg) {
  switch (msg.t) {
    case 'create': {
      const room = manager.create({ isPublic: false });
      seatInto(socket, room, { name: msg.name });
      break;
    }

    case 'join': {
      const room = manager.get(msg.room);
      if (!room) return fail(socket, 'no_room', `No duel found with code ${String(msg.room || '').toUpperCase()}.`);
      seatInto(socket, room, { name: msg.name, token: msg.token });
      break;
    }

    case 'quick': {
      const room = manager.quickMatch();
      seatInto(socket, room, { name: msg.name });
      break;
    }

    case 'dir': {
      if (socket.room) socket.room.input(socket, msg.d);
      break;
    }

    case 'leave': {
      detach(socket);
      send(socket, { t: 'left' });
      break;
    }

    case 'ping':
      send(socket, { t: 'pong', at: msg.at });
      break;

    default:
      fail(socket, 'unknown', `Unknown message type: ${msg.t}`);
  }
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.room = null;
  socket.seat = null;
  socket.on('pong', () => { socket.isAlive = true; });

  send(socket, { t: 'hello', tick: duel.TICK_MS, grid: duel.GRID_SIZE });

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return fail(socket, 'bad_json', 'Could not parse that message.');
    }
    if (!validMessage(msg)) return fail(socket, 'bad_message', 'Invalid message fields.');

    try {
      dispatch(socket, msg);
    } catch (e) {
      // Contain unexpected handler failures without logging client data.
      console.error('[sketchy-snake] message handler failed');
      fail(socket, 'internal_error', 'Could not process that message.');
      socket.close(1011, 'Message processing failed');
    }
  });

  socket.on('close', () => {
    if (socket.room) socket.room.leave(socket);
    socket.room = null;
  });

  socket.on('error', () => {
    if (socket.room) socket.room.leave(socket);
    socket.room = null;
  });
});

// Drop sockets that stopped answering, so seats do not stay held by ghosts.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    try { socket.ping(); } catch (e) {}
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

// Only bind a port when run directly, so tests can listen on an ephemeral one.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[sketchy-snake] duel server listening on :${PORT}`);
  });
}

module.exports = { server, wss, manager };
