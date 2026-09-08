'use strict';

/**
 * SKETCHY SNAKE — DUEL RULES ENGINE
 *
 * Pure, transport-free simulation of one Tron-style duel round. The server owns
 * this: clients never run it, they only render the states it produces. Keeping it
 * free of sockets and timers means a round can be stepped by hand in a test.
 */

const GRID_SIZE = 18;
const TICK_MS = 110;        // Fixed tempo — nobody speeds up by scoring
const START_LENGTH = 3;
const ERASE_ON_EAT = 5;     // Munchkins are erasers: they rub out tail segments
const MIN_SPAWN_GAP = 9;    // Manhattan distance between the two spawn points

const MUNCHKIN_TYPES = [
  { name: 'avocado', points: 10, color: '#10B981', quote: 'fresh munchkin!' },
  { name: 'cucumber', points: 15, color: '#84CC16', quote: 'crispy doodle!' },
  { name: 'pumpkin', points: 20, color: '#F97316', quote: 'autumn vibes!' },
  { name: 'potato', points: 15, color: '#D97706', quote: 'potato power!' },
  { name: 'coffee', points: 30, color: '#854D0E', quote: 'coffee = fuel ⚡' },
  { name: 'heart', points: 50, color: '#EA580C', quote: 'built with 🧡' }
];

// Cumulative spawn weights, index-aligned with MUNCHKIN_TYPES above.
const MUNCHKIN_WEIGHTS = [0.35, 0.60, 0.80, 0.90, 0.96, 1.0];

const SEATS = ['p1', 'p2'];

const DELTAS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

function cellId(x, y) {
  return y * GRID_SIZE + x;
}

function randomInnerCell() {
  // Stay 3 cells clear of the margins so the starting body always fits on the paper.
  const span = GRID_SIZE - 6;
  return {
    x: 3 + Math.floor(Math.random() * span),
    y: 3 + Math.floor(Math.random() * span)
  };
}

function dirTowardCenter(cell) {
  const c = (GRID_SIZE - 1) / 2;
  const dx = c - cell.x;
  const dy = c - cell.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
  return dy > 0 ? 'DOWN' : 'UP';
}

function spawnBodyAt(cell, dir) {
  // Lay the starting segments out behind the head so nobody spawns mid-turn.
  const back = DELTAS[OPPOSITE[dir]];
  const body = [];
  for (let i = 0; i < START_LENGTH; i++) {
    body.push({ x: cell.x + back.x * i, y: cell.y + back.y * i });
  }
  return body;
}

function createRound() {
  let a = randomInnerCell();
  let b = randomInnerCell();
  let guard = 0;
  while (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < MIN_SPAWN_GAP && guard < 300) {
    b = randomInnerCell();
    guard++;
  }

  const dirA = dirTowardCenter(a);
  const dirB = dirTowardCenter(b);

  const state = {
    tick: 0,
    over: false,
    p1: { body: spawnBodyAt(a, dirA), dir: dirA, intent: dirA, score: 0 },
    p2: { body: spawnBodyAt(b, dirB), dir: dirB, intent: dirB, score: 0 },
    food: null
  };
  state.food = spawnFood(state);
  return state;
}

function occupied(state, x, y) {
  return state.p1.body.some(s => s.x === x && s.y === y) ||
         state.p2.body.some(s => s.x === x && s.y === y);
}

function spawnFood(state) {
  // Trails are permanent, so the board can genuinely fill — give up rather than spin.
  let attempts = 0;
  let x, y;
  do {
    x = Math.floor(Math.random() * GRID_SIZE);
    y = Math.floor(Math.random() * GRID_SIZE);
    attempts++;
  } while (occupied(state, x, y) && attempts < 400);
  if (occupied(state, x, y)) return null;

  const roll = Math.random();
  let idx = MUNCHKIN_WEIGHTS.findIndex(w => roll < w);
  if (idx < 0) idx = MUNCHKIN_TYPES.length - 1;
  return { x, y, type: MUNCHKIN_TYPES[idx] };
}

/**
 * Queue a direction for a seat. Reversing into your own neck is rejected, and we
 * compare against the last *committed* direction so two intents inside one tick
 * cannot be combined into a 180.
 */
function setIntent(state, seat, dir) {
  const player = state[seat];
  if (!player || !DELTAS[dir]) return false;
  if (dir === OPPOSITE[player.dir]) return false;
  player.intent = dir;
  return true;
}

function stepHead(head, dir) {
  const d = DELTAS[dir];
  return { x: head.x + d.x, y: head.y + d.y };
}

function hitsWall(cell) {
  return cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE;
}

// Returns null when the move is safe, otherwise how this player died.
function crashCause(state, head, rivalSeat) {
  if (hitsWall(head)) return 'margin';
  const rival = state[rivalSeat].body;
  if (rival.some(s => s.x === head.x && s.y === head.y)) return 'rival';
  if (occupied(state, head.x, head.y)) return 'own';
  return null;
}

/**
 * Advance one tick. Both heads are resolved before either body moves, so
 * simultaneous crashes are a genuine draw rather than an ordering artifact.
 * Returns an events object describing what the clients need to be told.
 */
function step(state) {
  if (state.over) return { ended: true };

  state.tick++;
  state.p1.dir = state.p1.intent;
  state.p2.dir = state.p2.intent;

  const head1 = stepHead(state.p1.body[0], state.p1.dir);
  const head2 = stepHead(state.p2.body[0], state.p2.dir);

  let cause1 = crashCause(state, head1, 'p2');
  let cause2 = crashCause(state, head2, 'p1');

  // Both heads onto one cell, or heads swapping cells, is a mutual wipeout.
  const sameCell = head1.x === head2.x && head1.y === head2.y;
  const swapped = head1.x === state.p2.body[0].x && head1.y === state.p2.body[0].y &&
                  head2.x === state.p1.body[0].x && head2.y === state.p1.body[0].y;
  if (sameCell || swapped) {
    // Override rather than default: a swap also matches "hit the rival's body",
    // but head-on is the truthful thing to tell the players.
    cause1 = 'headOn';
    cause2 = 'headOn';
  }

  if (cause1 || cause2) {
    state.over = true;
    return {
      ended: true,
      causes: { p1: cause1, p2: cause2 },
      winner: cause1 && cause2 ? null : (cause1 ? 'p2' : 'p1')
    };
  }

  state.p1.body.unshift(head1);
  state.p2.body.unshift(head2);
  // No pop anywhere: the trail is the weapon.

  const eaten = [];
  for (const seat of SEATS) {
    const head = state[seat].body[0];
    if (!state.food || head.x !== state.food.x || head.y !== state.food.y) continue;

    const type = state.food.type;
    state[seat].score += type.points;
    // The eraser: the only way to reclaim space on a filling board.
    for (let i = 0; i < ERASE_ON_EAT && state[seat].body.length > START_LENGTH; i++) {
      state[seat].body.pop();
    }
    eaten.push({ seat, type: type.name, points: type.points, color: type.color, quote: type.quote, at: cellId(head.x, head.y) });
    state.food = spawnFood(state);
  }

  return { ended: false, eaten };
}

// Wire format: bodies as flat cell ids, which is a lot cheaper than {x,y} objects.
function serialize(state) {
  return {
    tick: state.tick,
    p1: { cells: state.p1.body.map(s => cellId(s.x, s.y)), dir: state.p1.dir, score: state.p1.score },
    p2: { cells: state.p2.body.map(s => cellId(s.x, s.y)), dir: state.p2.dir, score: state.p2.score },
    food: state.food ? { at: cellId(state.food.x, state.food.y), type: state.food.type.name, color: state.food.type.color } : null
  };
}

module.exports = {
  GRID_SIZE,
  TICK_MS,
  ERASE_ON_EAT,
  START_LENGTH,
  MUNCHKIN_TYPES,
  SEATS,
  createRound,
  setIntent,
  step,
  serialize,
  cellId
};
