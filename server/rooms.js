'use strict';

/**
 * SKETCHY SNAKE — ROOM MANAGER
 *
 * Owns the lifecycle of a duel: seating, the tick loop, round results, the
 * quick-match queue, spectators, and the grace period that lets a dropped
 * player reconnect into their own seat.
 *
 * Phases: waiting -> countdown -> playing -> roundover -> countdown ...
 * A drop during countdown/playing moves the room to `paused` until the player
 * returns or the grace period expires (which forfeits the round).
 */

const crypto = require('crypto');
const duel = require('./duel');

// Overridable so the socket tests do not have to wait out real countdowns.
const COUNTDOWN_SECONDS = Number(process.env.DUEL_COUNTDOWN_SECONDS ?? 3);
const ROUNDOVER_MS = Number(process.env.DUEL_ROUNDOVER_MS ?? 3200);   // Result card dwell time
const RECONNECT_GRACE_MS = Number(process.env.DUEL_GRACE_MS ?? 20000);
const EMPTY_ROOM_TTL_MS = Number(process.env.DUEL_ROOM_TTL_MS ?? 60000);

// No 0/O/1/I — these get read aloud and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Room {
  constructor(code, manager) {
    this.code = code;
    this.manager = manager;
    this.seats = { p1: null, p2: null };   // { token, name, socket|null, connected }
    this.spectators = new Set();
    this.isPublic = false;
    this.wins = { p1: 0, p2: 0, draws: 0 };
    this.state = null;
    this.phase = 'waiting';
    this.tickTimer = null;
    this.phaseTimer = null;
    this.graceTimers = { p1: null, p2: null };
    this.emptySince = Date.now();
  }

  // --- Membership -----------------------------------------------------------

  occupiedSeats() {
    return duel.SEATS.filter(s => this.seats[s]);
  }

  freeSeat() {
    return duel.SEATS.find(s => !this.seats[s]) || null;
  }

  seatOfToken(token) {
    return duel.SEATS.find(s => this.seats[s] && this.seats[s].token === token) || null;
  }

  /**
   * Seat a socket. A matching token reclaims its old seat (reconnect); otherwise
   * the first free seat is taken, and a full room means spectating.
   */
  join(socket, { token, name }) {
    const existing = token ? this.seatOfToken(token) : null;
    if (existing) {
      const seat = this.seats[existing];
      if (seat.socket && seat.socket !== socket && seat.connected) {
        // Someone is already playing this seat with the same token — spectate instead.
        return this.joinAsSpectator(socket);
      }
      seat.socket = socket;
      seat.connected = true;
      if (name) seat.name = name;
      socket.seat = existing;
      socket.room = this;
      this.clearGrace(existing);
      this.broadcastPeers('reconnect', existing);
      this.resumeAfterReconnect();
      return { seat: existing, token: seat.token };
    }

    const free = this.freeSeat();
    if (!free) return this.joinAsSpectator(socket);

    const seatToken = crypto.randomBytes(12).toString('hex');
    this.seats[free] = { token: seatToken, name: name || free.toUpperCase(), socket, connected: true };
    socket.seat = free;
    socket.room = this;
    this.emptySince = null;
    this.broadcastPeers('join', free);
    this.maybeStart();
    return { seat: free, token: seatToken };
  }

  joinAsSpectator(socket) {
    this.spectators.add(socket);
    socket.seat = 'spectator';
    socket.room = this;
    this.emptySince = null;
    this.broadcastPeers('join', 'spectator');
    // Drop a spectator straight into the action rather than making them wait.
    if (this.state) this.sendTo(socket, { t: 'state', ...duel.serialize(this.state) });
    return { seat: 'spectator', token: null };
  }

  leave(socket, { reconnect = true } = {}) {
    if (this.spectators.delete(socket)) {
      this.broadcastPeers('leave', 'spectator');
      this.checkEmpty();
      return;
    }

    const seat = socket.seat;
    if (!seat || !this.seats[seat] || this.seats[seat].socket !== socket) return;

    if (!reconnect) {
      this.clearGrace(seat);
      this.seats[seat].connected = false;
      this.seats[seat].socket = null;
      if (this.phase === 'playing' || this.phase === 'countdown' || this.phase === 'paused') {
        this.phase = 'paused';
        this.finishForfeit(seat);
      } else {
        this.seats[seat] = null;
        this.broadcastPeers('leave', seat);
        this.checkEmpty();
        this.maybeStart();
      }
      return;
    }

    this.seats[seat].connected = false;
    this.seats[seat].socket = null;
    this.broadcastPeers('leave', seat);

    if (this.phase === 'playing' || this.phase === 'countdown' || this.phase === 'paused') {
      // Hold the round open — they may be reconnecting rather than quitting.
      this.pauseForReconnect(seat);
    } else {
      this.checkEmpty();
    }
  }

  connectedPlayers() {
    return this.occupiedSeats().filter(s => this.seats[s].connected);
  }

  checkEmpty() {
    const anyone = this.connectedPlayers().length > 0 || this.spectators.size > 0;
    if (!anyone && this.emptySince === null) this.emptySince = Date.now();
    if (anyone) this.emptySince = null;
  }

  // --- Reconnect grace ------------------------------------------------------

  pauseForReconnect(seat) {
    if (this.phase !== 'paused') {
      this.stopTick();
      this.clearPhaseTimer();
      this.phase = 'paused';
    }
    this.broadcast({ t: 'paused', seat, seconds: RECONNECT_GRACE_MS / 1000 });
    this.clearGrace(seat);
    this.graceTimers[seat] = setTimeout(() => this.finishForfeit(seat), RECONNECT_GRACE_MS);
  }

  finishForfeit(seat) {
    this.clearGrace(seat);
    if (!this.seats[seat]) return;
    const other = seat === 'p1' ? 'p2' : 'p1';
    if (this.phase === 'paused' && this.seats[other] && this.seats[other].connected) {
      this.wins[other]++;
      this.broadcast({ t: 'roundover', winner: other, causes: { [seat]: 'forfeit' }, wins: this.wins, scores: this.scores(), forfeit: true });
    }
    this.seats[seat] = null;
    this.state = null;
    this.phase = 'waiting';
    this.broadcastPeers('leave', seat);
    this.checkEmpty();
    this.maybeStart();
  }

  clearGrace(seat) {
    for (const key of seat ? [seat] : duel.SEATS) {
      if (this.graceTimers[key]) clearTimeout(this.graceTimers[key]);
      this.graceTimers[key] = null;
    }
  }

  resumeAfterReconnect() {
    if (this.phase !== 'paused') return;
    if (this.connectedPlayers().length < 2) return;
    // Re-rack rather than resuming a half-played round nobody was watching.
    this.phase = 'waiting';
    this.state = null;
    this.maybeStart();
  }

  // --- Round lifecycle ------------------------------------------------------

  maybeStart() {
    if (this.phase !== 'waiting') return;
    if (this.connectedPlayers().length < 2) return;
    this.startCountdown();
  }

  startCountdown() {
    this.phase = 'countdown';
    this.state = duel.createRound();
    this.broadcast({ t: 'state', ...duel.serialize(this.state) });

    let n = COUNTDOWN_SECONDS;
    const tickDown = () => {
      if (this.phase !== 'countdown') return;
      this.broadcast({ t: 'countdown', n });
      if (n === 0) {
        this.startPlaying();
        return;
      }
      n--;
      this.phaseTimer = setTimeout(tickDown, 1000);
    };
    tickDown();
  }

  startPlaying() {
    this.phase = 'playing';
    this.clearPhaseTimer();
    this.stopTick();
    this.tickTimer = setInterval(() => this.tick(), duel.TICK_MS);
  }

  tick() {
    if (this.phase !== 'playing' || !this.state) return;

    const events = duel.step(this.state);
    if (events.ended) {
      this.endRound(events);
      return;
    }

    const payload = { t: 'state', ...duel.serialize(this.state) };
    if (events.eaten && events.eaten.length) payload.eaten = events.eaten;
    this.broadcast(payload);
  }

  endRound(events) {
    this.stopTick();
    this.phase = 'roundover';

    if (events.winner) this.wins[events.winner]++;
    else this.wins.draws++;

    this.broadcast({
      t: 'roundover',
      winner: events.winner || null,
      causes: events.causes,
      wins: this.wins,
      scores: this.scores(),
      final: duel.serialize(this.state)
    });

    this.phaseTimer = setTimeout(() => {
      this.phase = 'waiting';
      this.state = null;
      this.maybeStart();
    }, ROUNDOVER_MS);
  }

  scores() {
    return this.state ? { p1: this.state.p1.score, p2: this.state.p2.score } : { p1: 0, p2: 0 };
  }

  input(socket, dir) {
    if (this.phase !== 'playing' || !this.state) return;
    const seat = socket.seat;
    if (seat !== 'p1' && seat !== 'p2') return;           // Spectators cannot steer
    if (!this.seats[seat] || this.seats[seat].socket !== socket) return;
    duel.setIntent(this.state, seat, dir);
  }

  // --- Plumbing -------------------------------------------------------------

  peerSummary() {
    return {
      p1: this.seats.p1 ? { name: this.seats.p1.name, connected: this.seats.p1.connected } : null,
      p2: this.seats.p2 ? { name: this.seats.p2.name, connected: this.seats.p2.connected } : null,
      spectators: this.spectators.size
    };
  }

  sendTo(socket, msg) {
    if (socket.readyState !== 1) return;
    try { socket.send(JSON.stringify(msg)); } catch (e) { /* socket died mid-write */ }
  }

  broadcast(msg) {
    const line = JSON.stringify(msg);
    for (const seat of duel.SEATS) {
      const s = this.seats[seat];
      if (s && s.socket && s.socket.readyState === 1) {
        try { s.socket.send(line); } catch (e) {}
      }
    }
    for (const sp of this.spectators) {
      if (sp.readyState === 1) {
        try { sp.send(line); } catch (e) {}
      }
    }
  }

  broadcastPeers(event, seat) {
    this.broadcast({ t: 'peer', event, seat, players: this.peerSummary(), phase: this.phase, wins: this.wins });
  }

  stopTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  clearPhaseTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  dispose() {
    this.stopTick();
    this.clearPhaseTimer();
    this.clearGrace();
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.sweeper = setInterval(() => this.sweep(), 20000);
    if (this.sweeper.unref) this.sweeper.unref();
  }

  newCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () =>
        CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  create({ isPublic = false } = {}) {
    const code = this.newCode();
    const room = new Room(code, this);
    room.isPublic = isPublic;
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase()) || null;
  }

  /**
   * Quick match is just "the oldest public room that is short a player". No queue
   * to keep in sync with socket lifetimes: an abandoned room ages out on its own.
   */
  quickMatch() {
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      if (room.freeSeat() && room.connectedPlayers().length < 2) return room;
    }
    return this.create({ isPublic: true });
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      room.checkEmpty();
      if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  stats() {
    const waiting = [...this.rooms.values()].filter(r => r.isPublic && r.connectedPlayers().length < 2).length;
    return { rooms: this.rooms.size, openPublicRooms: waiting };
  }
}

module.exports = { Room, RoomManager, COUNTDOWN_SECONDS, RECONNECT_GRACE_MS };
