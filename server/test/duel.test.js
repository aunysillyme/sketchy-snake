'use strict';

const test = require('node:test');
const assert = require('node:assert');
const duel = require('../duel');

/** Build a round by hand so the assertions do not depend on random spawns. */
function fixture(p1Cells, p1Dir, p2Cells, p2Dir, food) {
  return {
    tick: 0,
    over: false,
    p1: { body: p1Cells.map(([x, y]) => ({ x, y })), dir: p1Dir, intent: p1Dir, score: 0 },
    p2: { body: p2Cells.map(([x, y]) => ({ x, y })), dir: p2Dir, intent: p2Dir, score: 0 },
    food: food || null
  };
}

test('a snake grows every tick and never pops — the trail is permanent', () => {
  const s = fixture([[5, 5], [4, 5], [3, 5]], 'RIGHT', [[12, 12], [13, 12], [14, 12]], 'LEFT');
  duel.step(s);
  duel.step(s);
  assert.strictEqual(s.p1.body.length, 5);
  assert.strictEqual(s.p2.body.length, 5);
  assert.deepStrictEqual(s.p1.body[0], { x: 7, y: 5 });
});

test('reversing into your own neck is rejected', () => {
  const s = fixture([[5, 5], [4, 5], [3, 5]], 'RIGHT', [[12, 12], [13, 12], [14, 12]], 'LEFT');
  assert.strictEqual(duel.setIntent(s, 'p1', 'LEFT'), false);
  assert.strictEqual(s.p1.intent, 'RIGHT');
  assert.strictEqual(duel.setIntent(s, 'p1', 'UP'), true);
  assert.strictEqual(s.p1.intent, 'UP');
});

test('two intents inside one tick cannot be combined into a 180', () => {
  const s = fixture([[5, 5], [4, 5], [3, 5]], 'RIGHT', [[12, 12], [13, 12], [14, 12]], 'LEFT');
  duel.setIntent(s, 'p1', 'UP');
  // Intents are checked against the last *committed* direction, so this stays a
  // reversal of RIGHT and is refused. Otherwise UP-then-LEFT inside one tick would
  // turn a RIGHT run straight into its own neck.
  assert.strictEqual(duel.setIntent(s, 'p1', 'LEFT'), false);
  assert.strictEqual(s.p1.intent, 'UP');
  duel.step(s);
  assert.deepStrictEqual(s.p1.body[0], { x: 5, y: 4 });
  assert.strictEqual(s.over, false);
});

test('running off the page loses the round to the other player', () => {
  const s = fixture([[17, 5], [16, 5], [15, 5]], 'RIGHT', [[5, 12], [6, 12], [7, 12]], 'LEFT');
  const events = duel.step(s);
  assert.strictEqual(events.ended, true);
  assert.strictEqual(events.winner, 'p2');
  assert.strictEqual(events.causes.p1, 'margin');
  assert.strictEqual(events.causes.p2, null);
});

test('crashing into the rival trail is attributed to the rival', () => {
  // p1 is one cell above a long horizontal p2 trail and turns down into it.
  const s = fixture([[8, 4], [7, 4], [6, 4]], 'RIGHT', [[12, 5], [11, 5], [10, 5], [9, 5], [8, 5], [7, 5]], 'RIGHT');
  duel.setIntent(s, 'p1', 'DOWN');
  const events = duel.step(s);
  assert.strictEqual(events.winner, 'p2');
  assert.strictEqual(events.causes.p1, 'rival');
});

test('closing a loop onto your own trail is attributed to yourself', () => {
  const s = fixture(
    [[5, 5], [4, 5], [4, 6], [5, 6]], 'RIGHT',
    [[14, 14], [15, 14], [16, 14]], 'LEFT'
  );
  duel.setIntent(s, 'p1', 'DOWN'); // (5,6) is its own tail
  const events = duel.step(s);
  assert.strictEqual(events.causes.p1, 'own');
  assert.strictEqual(events.winner, 'p2');
});

test('both heads onto the same cell is a draw, not a race', () => {
  const s = fixture([[8, 8], [7, 8], [6, 8]], 'RIGHT', [[10, 8], [11, 8], [12, 8]], 'LEFT');
  const events = duel.step(s);
  assert.strictEqual(events.ended, true);
  assert.strictEqual(events.winner, null);
  assert.strictEqual(events.causes.p1, 'headOn');
  assert.strictEqual(events.causes.p2, 'headOn');
});

test('heads swapping cells is also a draw', () => {
  const s = fixture([[8, 8], [7, 8], [6, 8]], 'RIGHT', [[9, 8], [10, 8], [11, 8]], 'LEFT');
  const events = duel.step(s);
  assert.strictEqual(events.winner, null);
  assert.strictEqual(events.causes.p1, 'headOn');
  assert.strictEqual(events.causes.p2, 'headOn');
});

test('a munchkin scores points and erases tail segments', () => {
  const long = [];
  for (let i = 0; i < 12; i++) long.push([5 - 0, 5 + i]); // vertical stack below the head
  const s = fixture(long, 'UP', [[15, 15], [16, 15], [17, 15]], 'LEFT',
    { x: 5, y: 4, type: { name: 'pumpkin', points: 20, color: '#F97316', quote: 'autumn vibes!' } });

  const before = s.p1.body.length;
  const events = duel.step(s);

  assert.strictEqual(s.p1.score, 20);
  // +1 head, then ERASE_ON_EAT off the tail.
  assert.strictEqual(s.p1.body.length, before + 1 - duel.ERASE_ON_EAT);
  assert.strictEqual(events.eaten[0].seat, 'p1');
  assert.strictEqual(events.eaten[0].points, 20);
});

test('the eraser never shortens a snake below its starting length', () => {
  const s = fixture([[5, 5], [5, 6], [5, 7]], 'UP', [[15, 15], [16, 15], [17, 15]], 'LEFT',
    { x: 5, y: 4, type: { name: 'heart', points: 50, color: '#EA580C', quote: 'built with 🧡' } });
  duel.step(s);
  assert.strictEqual(s.p1.body.length, duel.START_LENGTH);
});

test('food never spawns underneath either snake', () => {
  for (let i = 0; i < 200; i++) {
    const s = duel.createRound();
    const onSnake = [...s.p1.body, ...s.p2.body]
      .some(seg => s.food && seg.x === s.food.x && seg.y === s.food.y);
    assert.strictEqual(onSnake, false);
  }
});

test('random spawns are separated and fully on the board', () => {
  for (let i = 0; i < 200; i++) {
    const s = duel.createRound();
    for (const seg of [...s.p1.body, ...s.p2.body]) {
      assert.ok(seg.x >= 0 && seg.x < duel.GRID_SIZE, 'x on board');
      assert.ok(seg.y >= 0 && seg.y < duel.GRID_SIZE, 'y on board');
    }
    const gap = Math.abs(s.p1.body[0].x - s.p2.body[0].x) + Math.abs(s.p1.body[0].y - s.p2.body[0].y);
    assert.ok(gap >= 9, `heads should start apart, got ${gap}`);
    const overlap = s.p1.body.some(a => s.p2.body.some(b => a.x === b.x && a.y === b.y));
    assert.strictEqual(overlap, false, 'bodies must not overlap at spawn');
  }
});

test('serialize packs bodies as flat cell ids', () => {
  const s = fixture([[1, 0], [0, 0]], 'RIGHT', [[3, 1], [4, 1]], 'LEFT');
  const wire = duel.serialize(s);
  assert.deepStrictEqual(wire.p1.cells, [1, 0]);
  assert.deepStrictEqual(wire.p2.cells, [duel.GRID_SIZE + 3, duel.GRID_SIZE + 4]);
});
