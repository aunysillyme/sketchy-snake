'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const WebSocket = require('ws');
const { server, wss, manager } = require('../index');
const { MAX_PAYLOAD_BYTES } = require('../protocol');

let port;
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
test.after(async () => {
  for (const socket of wss.clients) socket.terminate();
  await new Promise(resolve => wss.close(resolve));
  for (const room of manager.rooms.values()) room.dispose();
  clearInterval(manager.sweeper);
  await new Promise(resolve => server.close(resolve));
});

function request(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function connect(t) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  socket.on('message', raw => inbox.push(JSON.parse(raw.toString())));
  t.after(() => socket.terminate());
  await once(socket, 'open');
  socket.read = async type => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const index = inbox.findIndex(msg => msg.t === type);
      if (index !== -1) return inbox.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for ${type}`);
  };
  socket.sendMsg = msg => socket.send(JSON.stringify(msg));
  return socket;
}

test('bad URL encodings and decoded NUL return 400 without killing HTTP', async () => {
  for (const path of ['/%', '/%GG', '/%E0%A4%A', '/%00', '//[']) {
    assert.equal((await request(path)).status, 400, path);
    assert.equal((await request('/health')).status, 200);
  }
  const index = await request('/index.html');
  assert.equal(index.status, 200);
  assert.match(index.body, /<canvas/);
  assert.equal((await request('/does-not-exist.txt')).status, 404);
});

test('static serving exposes only explicit public game assets', async () => {
  for (const path of [
    '/package.json', '/server/index.js', '/android/app/build.gradle', '/.git/config',
    '/../sketchy-snake-secret.txt', '/%2e%2e/sketchy-snake-secret.txt',
    '/server/../package.json'
  ]) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/game.js')).status, 200);
  assert.equal((await request('/game-rules.js')).status, 200);
  assert.equal((await request('/net.js')).status, 200);
  assert.equal((await request('/privacy.html')).status, 200);
});

test('invalid JSON fields are rejected before room allocation or detachment', async t => {
  const socket = await connect(t);
  socket.sendMsg({ t: 'create', name: 'Player ✏️' });
  const joined = await socket.read('joined');
  const room = manager.get(joined.room);
  const owner = room.seats.p1.socket;
  const count = manager.rooms.size;
  const invalid = [
    null, [], 1, true, 'join', {}, { t: [] }, { t: 'x'.repeat(33) },
    { t: 'join', room: { toString: null } },
    { t: 'join', room: [{ toString: null, valueOf: null }] },
    { t: 'join', room: 1234 }, { t: 'join', room: null },
    { t: 'join', room: joined.room, token: { toString: null } },
    { t: 'join', room: joined.room, token: 'x'.repeat(1000) },
    { t: 'join', room: joined.room, name: ['nested'] },
    { t: 'create', name: { toString: null } },
    { t: 'quick', name: 'x'.repeat(65) },
    { t: 'dir', d: { toString: null, valueOf: null } },
    ...['constructor', '__proto__', 'toString', 'valueOf', 'left', null, ['UP']]
      .map(d => ({ t: 'dir', d }))
  ];
  for (const msg of invalid) {
    socket.sendMsg(msg);
    assert.equal((await socket.read('error')).code, 'bad_message');
    assert.equal(manager.rooms.size, count, 'no room allocated');
    assert.equal(room.seats.p1.socket, owner, 'owner not detached');
  }
  // Deep JSON is legal to parse but must never become a stored/broadcast name.
  socket.send('{"t":"create","name":' + '['.repeat(1000) + '0' + ']'.repeat(1000) + '}');
  assert.equal((await socket.read('error')).code, 'bad_message');
  assert.equal(manager.rooms.size, count);
  socket.sendMsg({ t: 'ping', at: 123 });
  assert.equal((await socket.read('pong')).at, 123);
});

test('null tokens, optional names, lowercase rooms and JSON ping echoes still work', async t => {
  const a = await connect(t);
  const b = await connect(t);
  a.sendMsg({ t: 'create', name: null });
  const created = await a.read('joined');
  b.sendMsg({ t: 'join', room: created.room.toLowerCase(), token: null, name: 'B'.repeat(64) });
  const joined = await b.read('joined');
  assert.equal(joined.seat, 'p2');
  assert.equal(joined.players.p1.name, 'P1');
  assert.equal(joined.players.p2.name.length, 64);
  assert.match(joined.token, /^[a-f0-9]{24}$/);
  const echo = { marker: ['a', 1, null], nested: { ok: true } };
  a.sendMsg({ t: 'ping', at: echo });
  assert.deepEqual((await a.read('pong')).at, echo);
  a.send('invalid json');
  assert.equal((await a.read('error')).code, 'bad_json');
  a.sendMsg({ t: 'unknown-message' });
  assert.equal((await a.read('error')).code, 'unknown');
});

test('oversized messages close only the offending connection', async t => {
  const socket = await connect(t);
  const closed = once(socket, 'close');
  socket.send('x'.repeat(MAX_PAYLOAD_BYTES + 1));
  assert.equal((await closed)[0], 1009);
  assert.equal((await request('/health')).status, 200);
  const next = await connect(t);
  next.sendMsg({ t: 'create' });
  assert.equal((await next.read('joined')).seat, 'p1');
});

test('unexpected dispatch errors are contained to their connection', async t => {
  const socket = await connect(t);
  const original = manager.get;
  const closed = once(socket, 'close');
  try {
    manager.get = () => { throw new Error('injected handler failure'); };
    socket.sendMsg({ t: 'join', room: 'ZZZZ' });
    assert.equal((await socket.read('error')).code, 'internal_error');
    assert.equal((await closed)[0], 1011);
  } finally {
    manager.get = original;
  }
  assert.equal((await request('/health')).status, 200);
});
