'use strict';

// Shrink the phase timers before the server module reads them.
process.env.DUEL_COUNTDOWN_SECONDS = '0';
process.env.DUEL_ROUNDOVER_MS = '150';
process.env.DUEL_GRACE_MS = '600';

const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

const { server, wss, manager } = require('../index');

let baseUrl;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  wss.close();
  server.close();
});

/** A tiny client that records every message so tests can await one by type. */
function connect() {
  const ws = new WebSocket(baseUrl);
  ws.inbox = [];
  ws.on('message', raw => ws.inbox.push(JSON.parse(raw.toString())));
  ws.sendMsg = (msg) => ws.send(JSON.stringify(msg));
  ws.waitFor = (type, timeout = 4000) => new Promise((resolve, reject) => {
    const found = ws.inbox.find(m => m.t === type);
    if (found) return resolve(found);
    const deadline = Date.now() + timeout;
    const poll = setInterval(() => {
      const hit = ws.inbox.find(m => m.t === type);
      if (hit) {
        clearInterval(poll);
        resolve(hit);
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error(`timed out waiting for "${type}"; saw: ${ws.inbox.map(m => m.t).join(', ')}`));
      }
    }, 15);
  });
  ws.forget = (type) => { ws.inbox = ws.inbox.filter(m => m.t !== type); };
  return new Promise(resolve => ws.on('open', () => resolve(ws)));
}

test('a private room seats the creator as p1 and the joiner as p2', async () => {
  const a = await connect();
  const b = await connect();

  a.sendMsg({ t: 'create' });
  const seatedA = await a.waitFor('joined');
  assert.strictEqual(seatedA.seat, 'p1');
  assert.match(seatedA.room, /^[A-Z2-9]{4}$/);
  assert.ok(seatedA.token, 'a player gets a reconnect token');

  b.sendMsg({ t: 'join', room: seatedA.room });
  const seatedB = await b.waitFor('joined');
  assert.strictEqual(seatedB.seat, 'p2');
  assert.strictEqual(seatedB.room, seatedA.room);

  // Two players present: the round starts on its own and states begin flowing.
  const state = await a.waitFor('state');
  assert.strictEqual(state.p1.cells.length, 3);
  assert.strictEqual(state.p2.cells.length, 3);

  a.close(); b.close();
});

test('room codes are case-insensitive and a bad code is a clean error', async () => {
  const a = await connect();
  const b = await connect();

  a.sendMsg({ t: 'create' });
  const { room } = await a.waitFor('joined');

  b.sendMsg({ t: 'join', room: room.toLowerCase() });
  assert.strictEqual((await b.waitFor('joined')).seat, 'p2');

  const c = await connect();
  c.sendMsg({ t: 'join', room: 'ZZZZ' });
  const err = await c.waitFor('error');
  assert.strictEqual(err.code, 'no_room');

  a.close(); b.close(); c.close();
});

test('the board actually advances under the server tick', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const { room } = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room });
  await b.waitFor('joined');

  const first = await a.waitFor('state');
  await new Promise(r => setTimeout(r, 500));
  const latest = [...a.inbox].reverse().find(m => m.t === 'state' || m.t === 'roundover');
  assert.ok(latest, 'the server keeps sending updates');
  if (latest.t === 'state') {
    assert.ok(latest.tick > first.tick, `tick should advance (${first.tick} -> ${latest.tick})`);
    assert.ok(latest.p1.cells.length > first.p1.cells.length, 'trails grow every tick');
  }

  a.close(); b.close();
});

test('a third client spectates instead of taking a seat', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const { room } = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room });
  await b.waitFor('joined');

  const c = await connect();
  c.sendMsg({ t: 'join', room });
  const seatedC = await c.waitFor('joined');
  assert.strictEqual(seatedC.seat, 'spectator');
  assert.strictEqual(seatedC.token, null, 'spectators hold no seat token');

  // A spectator still sees the game.
  await c.waitFor('state');

  // ...and steering from a spectator is ignored rather than crashing the room.
  c.sendMsg({ t: 'dir', d: 'UP' });
  await new Promise(r => setTimeout(r, 200));
  const alive = [...a.inbox].reverse().find(m => m.t === 'state' || m.t === 'roundover');
  assert.ok(alive, 'the room survives spectator input');

  a.close(); b.close(); c.close();
});

test('a dropped player pauses the round and can reclaim their seat with the token', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const seatedA = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room: seatedA.room });
  const seatedB = await b.waitFor('joined');
  await a.waitFor('state');

  b.close();
  const paused = await a.waitFor('paused');
  assert.strictEqual(paused.seat, 'p2');

  const b2 = await connect();
  b2.sendMsg({ t: 'join', room: seatedA.room, token: seatedB.token });
  const rejoined = await b2.waitFor('joined');
  assert.strictEqual(rejoined.seat, 'p2', 'the token buys back the same seat');

  a.close(); b2.close();
});

test('a player who never comes back forfeits the round', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const seatedA = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room: seatedA.room });
  await b.waitFor('joined');
  await a.waitFor('state');
  a.forget('roundover');

  b.close();
  await a.waitFor('paused');

  const result = await a.waitFor('roundover');   // grace expires
  assert.strictEqual(result.forfeit, true);
  assert.strictEqual(result.winner, 'p1');
  assert.strictEqual(result.causes.p2, 'forfeit');
  assert.strictEqual(result.wins.p1, 1);

  a.close();
});

test('two dropped players both release their seats after grace', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const joined = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room: joined.room });
  await b.waitFor('joined');
  await a.waitFor('state');
  a.close();
  b.close();
  await new Promise(resolve => setTimeout(resolve, 900));
  const room = manager.get(joined.room);
  assert.strictEqual(room.seats.p1, null);
  assert.strictEqual(room.seats.p2, null);
  assert.strictEqual(room.phase, 'waiting');
});

test('an explicit leave releases the seat immediately', async () => {
  const a = await connect();
  a.sendMsg({ t: 'create' });
  const joined = await a.waitFor('joined');
  a.sendMsg({ t: 'leave' });
  await a.waitFor('left');
  assert.strictEqual(manager.get(joined.room).seats.p1, null);
  a.close();
});

test('quick match pairs two strangers into one room', async () => {
  const a = await connect();
  const b = await connect();

  a.sendMsg({ t: 'quick' });
  const seatedA = await a.waitFor('joined');
  assert.strictEqual(seatedA.seat, 'p1');
  assert.strictEqual(seatedA.isPublic, true);

  b.sendMsg({ t: 'quick' });
  const seatedB = await b.waitFor('joined');
  assert.strictEqual(seatedB.room, seatedA.room, 'the second player lands in the waiting room');
  assert.strictEqual(seatedB.seat, 'p2');

  await a.waitFor('state');

  a.close(); b.close();
});

test('a round ends with a winner and the match tally increments', async () => {
  const a = await connect();
  const b = await connect();
  a.sendMsg({ t: 'create' });
  const { room } = await a.waitFor('joined');
  b.sendMsg({ t: 'join', room });
  await b.waitFor('joined');

  // Nobody steers, so both run into a margin within a few seconds.
  const result = await a.waitFor('roundover', 8000);
  assert.ok(['p1', 'p2', null].includes(result.winner));
  const total = result.wins.p1 + result.wins.p2 + result.wins.draws;
  assert.strictEqual(total, 1, 'exactly one result recorded per round');

  a.close(); b.close();
});

test('malformed input is rejected without taking the server down', async () => {
  const a = await connect();
  a.send('not json at all');
  const err = await a.waitFor('error');
  assert.strictEqual(err.code, 'bad_json');

  a.sendMsg({ t: 'nonsense' });
  assert.ok(await a.waitFor('error'));

  // Still healthy afterwards.
  a.sendMsg({ t: 'create' });
  assert.ok(await a.waitFor('joined'));
  a.close();
});
