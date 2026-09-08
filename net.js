/**
 * SKETCHY SNAKE — DUEL SOCKET CLIENT
 *
 * A thin wrapper over one WebSocket to the duel server. It owns connection
 * state, reconnect-with-backoff, and the seat token that buys your seat back
 * after a drop. It knows nothing about rendering: game.js subscribes to events.
 */
(function () {
  'use strict';

  const RECONNECT_STEPS_MS = [400, 900, 1800, 3200, 5000];
  const TOKEN_KEY = 'sketchy_snake_seat';

  /**
   * Where the duel server lives. Set `window.SKETCHY_DUEL_SERVER` in index.html
   * for a deployed site; otherwise we assume the page is being served by the
   * duel server itself, which is what `npm start` does during development.
   */
  function resolveServerUrl() {
    const configured = (window.SKETCHY_DUEL_SERVER || '').trim();
    if (configured) return configured;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${scheme}//${location.host}`;
    }
    // file:// or a Capacitor bundle: there is nothing sensible to guess.
    return null;
  }

  const handlers = {};
  let socket = null;
  let status = 'idle';       // idle | connecting | online | reconnecting | failed
  let attempt = 0;
  let reconnectTimer = null;
  let intent = null;         // What we were doing, replayed after a reconnect
  let closedByUs = false;

  function emit(event, payload) {
    (handlers[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[net] handler failed', e); }
    });
  }

  function setStatus(next, detail) {
    if (status === next) return;
    status = next;
    emit('status', { status: next, detail });
  }

  function rememberSeat(room, token) {
    if (!token) return;
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ room, token }));
    } catch (e) { /* private mode: reconnect just won't reclaim the seat */ }
  }

  function recallSeat(room) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (saved && saved.room === room) return saved.token;
    } catch (e) {}
    return null;
  }

  function forgetSeat() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function send(msg) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }

  function open() {
    const url = resolveServerUrl();
    if (!url) {
      setStatus('failed', 'No duel server configured for this build.');
      return;
    }
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;

    closedByUs = false;
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    try {
      socket = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      attempt = 0;
      setStatus('online');
      // Re-enter whatever we were in the middle of before the wire dropped.
      if (intent) replayIntent();
    });

    socket.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'joined') {
        intent = { kind: 'join', room: msg.room };
        rememberSeat(msg.room, msg.token);
      }
      emit(msg.t, msg);
      emit('*', msg);
    });

    socket.addEventListener('close', () => {
      socket = null;
      if (closedByUs) {
        setStatus('idle');
        return;
      }
      scheduleReconnect();
    });

    socket.addEventListener('error', () => { /* close follows */ });
  }

  function replayIntent() {
    if (!intent) return;
    if (intent.kind === 'join') {
      send({ t: 'join', room: intent.room, token: recallSeat(intent.room) });
    } else if (intent.kind === 'quick') {
      send({ t: 'quick' });
    } else if (intent.kind === 'create') {
      send({ t: 'create' });
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (!intent) {
      setStatus('idle');
      return;
    }
    const delay = RECONNECT_STEPS_MS[Math.min(attempt, RECONNECT_STEPS_MS.length - 1)];
    attempt++;
    setStatus('reconnecting', `retrying in ${Math.round(delay / 1000)}s`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  window.SketchyNet = {
    on(event, fn) {
      (handlers[event] = handlers[event] || []).push(fn);
      return this;
    },

    get status() { return status; },
    get configuredUrl() { return resolveServerUrl(); },

    connect() { open(); },

    quickMatch() {
      intent = { kind: 'quick' };
      open();
      send({ t: 'quick' });
    },

    createRoom() {
      intent = { kind: 'create' };
      open();
      send({ t: 'create' });
    },

    joinRoom(code) {
      const room = String(code || '').trim().toUpperCase();
      if (!room) return;
      intent = { kind: 'join', room };
      open();
      send({ t: 'join', room, token: recallSeat(room) });
    },

    sendDir(dir) {
      send({ t: 'dir', d: dir });
    },

    leave() {
      send({ t: 'leave' });
      intent = null;
      forgetSeat();
      closedByUs = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) socket.close();
      socket = null;
      setStatus('idle');
    }
  };
})();
