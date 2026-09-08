'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../game-rules');

test('a non-growing snake may move into its vacating tail cell', () => {
  const body = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }];
  assert.equal(rules.wouldHitSelf(body, { x: 1, y: 2 }, false), false);
  assert.equal(rules.wouldHitSelf(body, { x: 1, y: 2 }, true), true);
  assert.equal(rules.wouldHitSelf(body, { x: 2, y: 3 }, false), true);
});

test('a newly fired projectile advances to the adjacent cell first', () => {
  const shot = { x: 5, y: 5, dx: 1, dy: 0, life: 14 };
  rules.advanceProjectile(shot);
  assert.deepEqual(shot, { x: 6, y: 5, dx: 1, dy: 0, life: 13 });
});
