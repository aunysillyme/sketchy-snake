(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.SketchyRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function wouldHitSelf(body, head, grows) {
    const occupied = grows ? body : body.slice(0, -1);
    return occupied.some(segment => segment.x === head.x && segment.y === head.y);
  }

  function advanceProjectile(projectile) {
    projectile.x += projectile.dx;
    projectile.y += projectile.dy;
    projectile.life--;
    return projectile;
  }

  function nextPlayer(player) {
    return player === 'p1' ? 'p2' : 'p1';
  }

  return { wouldHitSelf, advanceProjectile, nextPlayer };
});
