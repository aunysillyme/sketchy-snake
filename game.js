/**
 * SKETCHY SNAKE GAME ENGINE
 * Style: 'Sketchy' Art Spec (Hand-drawn, gestural strokes, munchkin foods, warm mantras)
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const GRID_SIZE = 18; // 18x18 grid
  const BASE_SPEED_MS = 135;
  const MIN_SPEED_MS = 65;
  const VS_SPEED_MS = 140;
  const VS_ERASE_ON_EAT = 5;
  const VS_MIN_SPAWN_GAP = 8;

  const PLAYERS = {
    p1: { head: '#2B4C7E', headStroke: '#1E3557', bodyNear: '#2B4C7E', bodyFar: '#4A6FA5', label: 'P1 ✏️' },
    p2: { head: '#BE185D', headStroke: '#831843', bodyNear: '#E11D48', bodyFar: '#F43F5E', label: 'P2 ⚔️' }
  };

  const MUNCHKIN_TYPES = [
    { name: 'avocado', label: '🥑 Avocado Head', color: '#10B981', points: 10, quote: 'fresh munchkin!' },
    { name: 'cucumber', label: '🥒 Cucumber Head', color: '#84CC16', points: 15, quote: 'crispy doodle!' },
    { name: 'pumpkin', label: '🎃 Pumpkin Head', color: '#F97316', points: 20, quote: 'autumn vibes!' },
    { name: 'potato', label: '🥔 Potato Head', color: '#D97706', points: 15, quote: 'potato power!' },
    { name: 'coffee', label: '☕ Coffee Fuel', color: '#854D0E', points: 30, quote: 'coffee = fuel ⚡', special: 'speed' },
    { name: 'heart', label: '🧡 Orange Heart', color: '#EA580C', points: 50, quote: 'built with 🧡', special: 'heart' },
    { name: 'highlighter', label: '✨ Neon Highlighter', color: '#FACC15', points: 35, quote: 'ghost sketch! ✨', special: 'ghost' }
  ];

  const MANTRAS = [
    '"progress not perfection" · ✏️',
    '"discipline today, freedom tomorrow" · ⚡',
    '"build better, ship faster" · 🚀',
    '"coffee = fuel ☕"',
    '"duality is architecture 🧡"',
    '"an introvert with a loud sense of humor" · 🐱'
  ];

  // --- State Variables ---
  let canvas, ctx;
  let cellSize = 20;
  let mode = 'solo'; // 'solo' | 'vs' | 'online'
  let snake = [];
  let direction = 'RIGHT';
  let nextDirection = 'RIGHT';
  let snake2 = [];
  let direction2 = 'LEFT';
  let nextDirection2 = 'LEFT';
  let currentTurn = 'p1'; // 'p1' | 'p2' (alternating turns in vs mode)
  let onlineSeat = null;
  let onlineRoom = null;
  let food = null;
  let score = 0;
  let score2 = 0;
  let matchWins = { p1: 0, p2: 0 };
  let bestScore = parseInt(localStorage.getItem('sketchy_snake_best') || '0', 10);
  let combo = 0;
  let comboTimer = null;
  let gameInterval = null;
  let isRunning = false;
  let isPaused = false;
  let particles = [];
  let inkProjectiles = [];
  let erasers = [];
  let isGhostMode = false;
  let ghostSecondsLeft = 0;
  let ghostTimer = null;
  let soundEnabled = true;
  let audioCtx = null;

  // --- High-Performance Pre-Buffered Music Engine ---
  const TRACKS = [
    {
      name: 'Blue Lightning ⚡',
      duration: 166,
      bpm: 124,
      scale: [220, 261.63, 293.66, 329.63, 392, 440, 523.25],
      bassline: [110, 87.31, 130.81, 98], // A, F, C, G
      chords: [
        [220, 261.63, 329.63], // Am
        [174.61, 220, 261.63], // F
        [130.81, 164.81, 196], // C
        [196, 246.94, 293.66]  // G
      ]
    },
    {
      name: 'Afterglow 🌅',
      duration: 184,
      bpm: 88,
      scale: [174.61, 220, 261.63, 329.63, 392, 440, 523.25],
      bassline: [87.31, 98, 82.41, 110], // F, G, E, A
      chords: [
        [174.61, 220, 261.63, 329.63], // Fmaj7
        [196, 246.94, 293.66],         // G
        [164.81, 196, 246.94, 329.63], // Em7
        [220, 261.63, 329.63]          // Am
      ]
    },
    {
      name: 'Run Away 🏃‍♀️',
      duration: 152,
      bpm: 120,
      scale: [196, 220, 246.94, 293.66, 329.63, 392, 440],
      bassline: [98, 110, 87.31, 98],
      chords: [
        [196, 246.94, 293.66],
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [196, 246.94, 293.66]
      ]
    }
  ];

  let currentTrackIdx = 0;
  let isMusicPlaying = false;
  let currentMusicSource = null;
  let musicGainNode = null;
  let trackBuffers = {};
  let trackElapsedSec = 0;
  let trackTimer = null;

  // --- Sound Effects Synthesizer (Web Audio API) ---
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
        musicGainNode = audioCtx.createGain();
        musicGainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
        musicGainNode.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Pre-generate smooth 8-bar loop in memory (0% CPU during playback)
  function getTrackBuffer(trackIdx) {
    if (trackBuffers[trackIdx]) return trackBuffers[trackIdx];
    if (!audioCtx) return null;

    const track = TRACKS[trackIdx];
    const sampleRate = audioCtx.sampleRate || 44100;
    const beatSec = 60 / track.bpm;
    const loopSec = beatSec * 16; // 16 beats loop
    const numSamples = Math.floor(sampleRate * loopSec);
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const stepSamples = Math.floor(sampleRate * (beatSec / 2));

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const step = Math.floor(i / stepSamples);
      const chordIdx = Math.floor(step / 4) % track.chords.length;
      const chord = track.chords[chordIdx];
      const bassFreq = track.bassline[Math.floor(step / 4) % track.bassline.length];

      // Warm Bassline
      const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.18;

      // Soft Arpeggio Pluck
      const noteFreq = chord[step % chord.length];
      const noteTime = (i % stepSamples) / sampleRate;
      const env = Math.exp(-noteTime * 14);
      const pluck = Math.sin(2 * Math.PI * noteFreq * t) * 0.15 * env;

      // Subtle Lo-Fi Melody
      let lead = 0;
      if (step % 8 >= 4) {
        const leadFreq = track.scale[(step * 2) % track.scale.length] * 2;
        lead = Math.sin(2 * Math.PI * leadFreq * t) * 0.09 * Math.exp(-noteTime * 9);
      }

      data[i] = bass + pluck + lead;
    }

    trackBuffers[trackIdx] = buffer;
    return buffer;
  }

  function stopMusicPlayback() {
    if (currentMusicSource) {
      try {
        currentMusicSource.stop();
        currentMusicSource.disconnect();
      } catch (e) {}
      currentMusicSource = null;
    }
    clearInterval(trackTimer);
  }

  function toggleMusic(forceState) {
    initAudio();
    isMusicPlaying = typeof forceState === 'boolean' ? forceState : !isMusicPlaying;

    const playBtn = document.getElementById('music-play-btn');
    if (playBtn) {
      playBtn.textContent = isMusicPlaying ? '⏸' : '▶';
      if (isMusicPlaying) playBtn.classList.add('playing');
      else playBtn.classList.remove('playing');
    }

    stopMusicPlayback();

    if (isMusicPlaying && audioCtx && soundEnabled) {
      const buffer = getTrackBuffer(currentTrackIdx);
      if (buffer) {
        currentMusicSource = audioCtx.createBufferSource();
        currentMusicSource.buffer = buffer;
        currentMusicSource.loop = true;
        currentMusicSource.connect(musicGainNode);
        currentMusicSource.start();
      }

      const track = TRACKS[currentTrackIdx];
      trackTimer = setInterval(() => {
        trackElapsedSec = (trackElapsedSec + 1) % track.duration;
        updateMusicUI();
      }, 1000);
    }
  }

  function nextTrack() {
    currentTrackIdx = (currentTrackIdx + 1) % TRACKS.length;
    trackElapsedSec = 0;
    updateMusicUI();
    if (isMusicPlaying) {
      toggleMusic(true);
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateMusicUI() {
    const track = TRACKS[currentTrackIdx];
    const nameEl = document.getElementById('track-name');
    const timeEl = document.getElementById('track-time');
    const barEl = document.getElementById('track-progress-bar');

    if (nameEl) nameEl.textContent = track.name;
    if (timeEl) timeEl.textContent = `${formatTime(trackElapsedSec)} / ${formatTime(track.duration)}`;
    if (barEl) {
      const pct = (trackElapsedSec / track.duration) * 100;
      barEl.style.setProperty('--progress', `${pct}%`);
    }
  }

  function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'eat') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(840, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'coffee') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(680, now + 0.06);
        osc.frequency.setValueAtTime(920, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'eraser_splat') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.16);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'eraser_hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.linearRampToValueAtTime(480, now + 0.07);
        osc.frequency.linearRampToValueAtTime(140, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'ghost') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        osc.frequency.setValueAtTime(1046.50, now + 0.24);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {}
  }

  function triggerHaptic(pattern = [25]) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  // --- Procedural Sketch Drawing Helpers ---
  function roughOffset(magnitude = 1.2) {
    return (Math.random() - 0.5) * magnitude;
  }

  function drawSketchLine(x1, y1, x2, y2, color = '#2A2B32', width = 2) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Double stroke for hand-drawn sketchy graphite look
    for (let i = 0; i < 2; i++) {
      const jx1 = x1 + roughOffset(1.5);
      const jy1 = y1 + roughOffset(1.5);
      const jx2 = x2 + roughOffset(1.5);
      const jy2 = y2 + roughOffset(1.5);
      const mx = (jx1 + jx2) / 2 + roughOffset(2);
      const my = (jy1 + jy2) / 2 + roughOffset(2);

      ctx.beginPath();
      ctx.moveTo(jx1, jy1);
      ctx.quadraticCurveTo(mx, my, jx2, jy2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSketchRect(x, y, w, h, fillColor, strokeColor = '#2A2B32') {
    ctx.save();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }
    drawSketchLine(x, y, x + w, y, strokeColor);
    drawSketchLine(x + w, y, x + w, y + h, strokeColor);
    drawSketchLine(x + w, y + h, x, y + h, strokeColor);
    drawSketchLine(x, y + h, x, y, strokeColor);
    ctx.restore();
  }

  function drawSketchCircle(cx, cy, r, fillColor, strokeColor = '#2A2B32') {
    ctx.save();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    // Overlapping sketchy arc passes
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const segments = 8;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const rad = r + roughOffset(1.4);
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Particle Effects ---
  function spawnFloatingDoodle(x, y, text, color) {
    particles.push({
      x, y,
      text,
      color,
      vy: -1.2,
      vx: (Math.random() - 0.5) * 0.8,
      alpha: 1.0,
      life: 38
    });
  }

  function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 1 / p.life;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.font = 'bold 15px "Caveat", cursive';
      ctx.fillStyle = p.color || '#DB2777';
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  // --- Grid & Game Rendering ---
  function renderGrid() {
    ctx.save();
    ctx.strokeStyle = '#F0EBE1';
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderFood() {
    if (!food) return;
    const px = food.x * cellSize + cellSize / 2;
    const py = food.y * cellSize + cellSize / 2;
    const r = cellSize * 0.42;

    if (food.type.name === 'avocado') {
      drawSketchCircle(px, py, r, '#10B981', '#065F46');
      drawSketchCircle(px, py, r * 0.4, '#92400E', '#78350F'); // seed
    } else if (food.type.name === 'pumpkin') {
      drawSketchCircle(px, py, r, '#F97316', '#9A3412');
      drawSketchLine(px, py - r, px, py - r - 4, '#15803D', 3); // stem
    } else if (food.type.name === 'coffee') {
      drawSketchRect(px - r, py - r * 0.8, r * 2, r * 1.6, '#FFF', '#854D0E');
      drawSketchLine(px - 2, py - r - 4, px - 2, py - r - 8, '#854D0E', 1.5); // steam
      drawSketchLine(px + 2, py - r - 3, px + 2, py - r - 7, '#854D0E', 1.5);
    } else if (food.type.name === 'heart') {
      ctx.save();
      ctx.font = `${cellSize * 0.9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧡', px, py);
      ctx.restore();
    } else if (food.type.name === 'highlighter') {
      ctx.save();
      ctx.font = `${cellSize * 0.95}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🖍️', px, py);
      ctx.restore();
    } else {
      drawSketchCircle(px, py, r, food.type.color, '#2A2B32');
    }
  }

  function renderErasers() {
    for (const e of erasers) {
      const px = e.x * cellSize + cellSize / 2;
      const py = e.y * cellSize + cellSize / 2;
      ctx.save();
      ctx.font = `${cellSize * 0.95}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧼', px, py);
      ctx.restore();
    }
  }

  function renderProjectiles() {
    for (const p of inkProjectiles) {
      const px = p.x * cellSize + cellSize / 2;
      const py = p.y * cellSize + cellSize / 2;
      ctx.save();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(px, py, cellSize * 0.26, 0, Math.PI * 2);
      ctx.fill();

      // Lead streak trail
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.arc(px - p.dx * 6, py - p.dy * 6, cellSize * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSnakeBody(body, dir, palette, comboVal, ghost) {
    if (ghost) {
      ctx.save();
      ctx.setLineDash([4, 4]);
    }

    for (let i = 0; i < body.length; i++) {
      const seg = body[i];
      const x = seg.x * cellSize;
      const y = seg.y * cellSize;
      const isHead = i === 0;

      if (isHead) {
        // Head: player ink or ghost gold with sketch contour
        const headFill = ghost ? '#FACC15' : palette.head;
        const headStroke = ghost ? '#CA8A04' : palette.headStroke;
        drawSketchRect(x + 1, y + 1, cellSize - 2, cellSize - 2, headFill, headStroke);
        
        // Eyes based on direction
        const eyeOffset = cellSize * 0.3;
        let ex1 = x + eyeOffset, ey1 = y + eyeOffset;
        let ex2 = x + cellSize - eyeOffset, ey2 = y + eyeOffset;
        if (dir === 'DOWN') { ey1 = y + cellSize - eyeOffset; ey2 = y + cellSize - eyeOffset; }
        if (dir === 'LEFT') { ex1 = x + eyeOffset; ex2 = x + eyeOffset; ey2 = y + cellSize - eyeOffset; }
        if (dir === 'RIGHT') { ex1 = x + cellSize - eyeOffset; ex2 = x + cellSize - eyeOffset; ey2 = y + cellSize - eyeOffset; }

        ctx.fillStyle = '#FFF';
        ctx.fillRect(ex1 - 2, ey1 - 2, 4, 4);
        ctx.fillRect(ex2 - 2, ey2 - 2, 4, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(ex1 - 1, ey1 - 1, 2, 2);
        ctx.fillRect(ex2 - 1, ey2 - 1, 2, 2);

        // Crown on combo streak or ghost sparkle
        if (ghost) {
          ctx.font = '12px sans-serif';
          ctx.fillText('✨', x + 2, y - 4);
        } else if (comboVal >= 2) {
          ctx.font = '12px sans-serif';
          ctx.fillText('👑', x + 2, y - 4);
        }
      } else {
        // Body: Gradient sketch fill from player near ink to far ink
        const ratio = i / body.length;
        const color = ghost ? (ratio > 0.5 ? '#FEF08A' : '#FDE047') : (ratio > 0.5 ? palette.bodyFar : palette.bodyNear);
        drawSketchRect(x + 2, y + 2, cellSize - 4, cellSize - 4, color, ghost ? '#A16207' : '#2A2B32');
        
        // Cross-hatch sketch detail
        if (i % 2 === 0) {
          drawSketchLine(x + 4, y + 4, x + cellSize - 4, y + cellSize - 4, 'rgba(255,255,255,0.4)', 1);
        }
      }
    }

    if (ghost) {
      ctx.restore();
    }
  }

  function renderSnake() {
    if (mode === 'vs' || mode === 'online') {
      drawSnakeBody(snake, direction, PLAYERS.p1, 0, false);
      drawSnakeBody(snake2, direction2, PLAYERS.p2, 0, false);
      if (isRunning && mode === 'vs') {
        ctx.save();
        ctx.font = `${Math.max(12, cellSize * 0.75)}px sans-serif`;
        ctx.textAlign = 'center';
        if (currentTurn === 'p1' && snake.length > 0) {
          ctx.fillText('✏️', snake[0].x * cellSize + cellSize / 2, snake[0].y * cellSize - 4);
        } else if (currentTurn === 'p2' && snake2.length > 0) {
          ctx.fillText('⚔️', snake2[0].x * cellSize + cellSize / 2, snake2[0].y * cellSize - 4);
        }
        ctx.restore();
      }
    } else {
      drawSnakeBody(snake, direction, PLAYERS.p1, combo, isGhostMode);
    }
  }

  // --- Game Mechanics ---
  function cellOccupied(x, y) {
    if (snake.some(seg => seg.x === x && seg.y === y)) return true;
    if ((mode === 'vs' || mode === 'online') && snake2.some(seg => seg.x === x && seg.y === y)) return true;
    if (erasers.some(e => e.x === x && e.y === y)) return true;
    return false;
  }

  function spawnFood() {
    let valid = false;
    let newX, newY;
    let attempts = 0;
    const maxAttempts = mode === 'vs' ? 400 : 100;
    while (!valid && attempts < maxAttempts) {
      attempts++;
      newX = Math.floor(Math.random() * GRID_SIZE);
      newY = Math.floor(Math.random() * GRID_SIZE);
      valid = !cellOccupied(newX, newY);
    }
    if (!valid) {
      food = null;
      return;
    }

    // Pick munchkin type with weighted probability
    const rand = Math.random();
    let type = MUNCHKIN_TYPES[0];
    if (rand < 0.28) type = MUNCHKIN_TYPES[0]; // Avocado
    else if (rand < 0.50) type = MUNCHKIN_TYPES[1]; // Cucumber
    else if (rand < 0.68) type = MUNCHKIN_TYPES[2]; // Pumpkin
    else if (rand < 0.80) type = MUNCHKIN_TYPES[3]; // Potato
    else if (rand < 0.88) type = MUNCHKIN_TYPES[4]; // Coffee
    else if (rand < 0.94) type = MUNCHKIN_TYPES[5]; // Orange Heart
    else type = MUNCHKIN_TYPES[6]; // Neon Highlighter (Ghost Mode!)

    food = { x: newX, y: newY, type };
  }

  function spawnEraser() {
    if (erasers.length >= 2) return;
    let valid = false;
    let ex, ey;
    let tries = 0;
    while (!valid && tries < 50) {
      tries++;
      ex = Math.floor(Math.random() * GRID_SIZE);
      ey = Math.floor(Math.random() * GRID_SIZE);
      const onSnake = snake.some(s => s.x === ex && s.y === ey);
      const onFood = food && food.x === ex && food.y === ey;
      const onEraser = erasers.some(e => e.x === ex && e.y === ey);
      const nearHead = Math.abs(ex - snake[0].x) <= 2 && Math.abs(ey - snake[0].y) <= 2;
      if (!onSnake && !onFood && !onEraser && !nearHead) {
        valid = true;
      }
    }
    if (valid) {
      erasers.push({ x: ex, y: ey, ticksAlive: 0, maxTicks: 45 });
      spawnFloatingDoodle(ex * cellSize, ey * cellSize, 'ROGUE ERASER! 🧼', '#EC4899');
    }
  }

  function shootInk() {
    if (!isRunning || isPaused || snake.length <= 1) return;
    if (snake.length <= 3) {
      spawnFloatingDoodle(snake[0].x * cellSize, snake[0].y * cellSize, 'NEED 4+ SEGMENTS! ✏️', '#DC2626');
      triggerHaptic([40]);
      return;
    }

    // Shed 1 segment from tail
    snake.pop();

    const head = snake[0];
    let dx = 0, dy = 0;
    if (direction === 'UP') dy = -1;
    else if (direction === 'DOWN') dy = 1;
    else if (direction === 'LEFT') dx = -1;
    else if (direction === 'RIGHT') dx = 1;

    inkProjectiles.push({
      x: head.x,
      y: head.y,
      dx, dy,
      life: 14
    });

    playSound('shoot');
    triggerHaptic([20, 15, 20]);
    spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, 'LEAD SHED! ✏️💨', '#0F172A');
    updateInkButtonState();
  }

  function activateGhostMode(seconds = 4) {
    isGhostMode = true;
    ghostSecondsLeft = seconds;
    clearInterval(ghostTimer);

    const badge = document.getElementById('power-badge');
    if (badge) {
      badge.textContent = `✨ GHOST ${ghostSecondsLeft}s`;
      badge.classList.add('active');
    }

    ghostTimer = setInterval(() => {
      ghostSecondsLeft--;
      if (ghostSecondsLeft <= 0) {
        isGhostMode = false;
        clearInterval(ghostTimer);
        if (badge) badge.classList.remove('active');
      } else {
        if (badge) badge.textContent = `✨ GHOST ${ghostSecondsLeft}s`;
      }
    }, 1000);
  }

  function updateInkButtonState() {
    const btn = document.getElementById('ink-btn');
    if (!btn) return;
    if (snake.length <= 3) {
      btn.classList.add('disabled');
      btn.textContent = '✏️ INK (need 4+)';
    } else {
      btn.classList.remove('disabled');
      btn.textContent = `✏️ INK (${snake.length - 3})`;
    }
  }

  function update() {
    if (!isRunning || isPaused) return;
    if (mode === 'vs' || mode === 'online') return;

    direction = nextDirection;
    const head = { ...snake[0] };

    if (direction === 'UP') head.y -= 1;
    else if (direction === 'DOWN') head.y += 1;
    else if (direction === 'LEFT') head.x -= 1;
    else if (direction === 'RIGHT') head.x += 1;

    // 1. Move Ink Projectiles & Check Hits
    for (let i = inkProjectiles.length - 1; i >= 0; i--) {
      const p = inkProjectiles[i];
      window.SketchyRules.advanceProjectile(p);

      if (p.x < 0 || p.x >= GRID_SIZE || p.y < 0 || p.y >= GRID_SIZE || p.life <= 0) {
        inkProjectiles.splice(i, 1);
        continue;
      }

      // Check hit eraser
      let hit = false;
      for (let j = erasers.length - 1; j >= 0; j--) {
        const e = erasers[j];
        if (e.x === p.x && e.y === p.y) {
          erasers.splice(j, 1);
          hit = true;
          score += 40;
          updateScoreUI();
          playSound('eraser_splat');
          triggerHaptic([30, 20, 40]);
          spawnFloatingDoodle(e.x * cellSize, e.y * cellSize, '+40 INKED! 💥', '#059669');
          break;
        }
      }
      if (hit) {
        inkProjectiles.splice(i, 1);
      }
    }

    // 2. Update Eraser Lifetimes & Chance to Spawn
    for (let i = erasers.length - 1; i >= 0; i--) {
      erasers[i].ticksAlive++;
      if (erasers[i].ticksAlive > erasers[i].maxTicks) {
        erasers.splice(i, 1);
      }
    }
    if (score >= 15 && erasers.length === 0 && Math.random() < 0.08) {
      spawnEraser();
    }

    // 3. Wall Collision Check
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      gameOver('Ouch! Hit the margin border!');
      return;
    }

    // 4. Self Collision Check (Bypassed if Ghost Mode!)
    const willGrow = food && head.x === food.x && head.y === food.y;
    if (!isGhostMode && window.SketchyRules.wouldHitSelf(snake, head, willGrow)) {
      gameOver('Tangled up in your own sketch!');
      return;
    }

    // 5. Eraser Collision Check with Snake Head
    for (let i = erasers.length - 1; i >= 0; i--) {
      const e = erasers[i];
      if (head.x === e.x && head.y === e.y) {
        if (isGhostMode) {
          erasers.splice(i, 1);
          score += 30;
          updateScoreUI();
          playSound('eraser_splat');
          triggerHaptic([30, 30]);
          spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, '+30 GHOST SMASH! 👻', '#FACC15');
        } else {
          if (snake.length > 4) {
            snake.pop();
            snake.pop();
            erasers.splice(i, 1);
            playSound('eraser_hit');
            triggerHaptic([80, 50, 80]);
            spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, 'ERASED 2 SEGMENTS! 🧼', '#EF4444');
            updateInkButtonState();
          } else {
            gameOver('Erased by the rogue eraser 🧼!');
            return;
          }
        }
      }
    }

    snake.unshift(head);

    // 6. Food Collision Check
    if (food && head.x === food.x && head.y === food.y) {
      const points = food.type.points * (combo > 0 ? combo + 1 : 1);
      score += points;
      updateScoreUI();

      combo++;
      showComboBadge();
      resetComboTimer();

      spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, `+${points} ${food.type.quote}`, food.type.color);
      triggerHaptic([30]);

      if (food.type.special === 'ghost') {
        activateGhostMode(4);
        playSound('ghost');
      } else if (food.type.name === 'coffee') {
        playSound('coffee');
      } else {
        playSound('eat');
      }

      spawnFood();
      speedUp();
    } else {
      snake.pop();
    }

    updateInkButtonState();
    draw();
  }

  // --- VS Duel Mechanics ---
  function stepHead(head, dir) {
    const next = { x: head.x, y: head.y };
    if (dir === 'UP') next.y -= 1;
    else if (dir === 'DOWN') next.y += 1;
    else if (dir === 'LEFT') next.x -= 1;
    else if (dir === 'RIGHT') next.x += 1;
    return next;
  }

  function hitsWall(cell) {
    return cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE;
  }

  // Returns null if the move is safe, otherwise how this player died.
  function crashCause(head, rivalBody) {
    if (hitsWall(head)) return 'margin';
    if (rivalBody.some(seg => seg.x === head.x && seg.y === head.y)) return 'rival';
    if (cellOccupied(head.x, head.y)) return 'own';
    return null;
  }

  function stepDuelTurn(newDir) {
    if (!isRunning || isPaused || mode !== 'vs') return;

    const isP1 = currentTurn === 'p1';
    const activeSnake = isP1 ? snake : snake2;
    const rivalSnake = isP1 ? snake2 : snake;
    const curDir = isP1 ? direction : direction2;

    if (isReverse(newDir, curDir)) return;

    if (isP1) {
      direction = newDir;
      nextDirection = newDir;
    } else {
      direction2 = newDir;
      nextDirection2 = newDir;
    }

    const nextHead = stepHead(activeSnake[0], newDir);

    let crash = null;
    if (hitsWall(nextHead)) {
      crash = 'margin';
    } else if (rivalSnake.some(seg => seg.x === nextHead.x && seg.y === nextHead.y)) {
      crash = 'rival';
    } else if (activeSnake.some(seg => seg.x === nextHead.x && seg.y === nextHead.y)) {
      crash = 'own';
    }

    if (crash) {
      roundOver(isP1 ? crash : null, !isP1 ? crash : null);
      return;
    }

    activeSnake.unshift(nextHead);
    eatInVs(nextHead, activeSnake, currentTurn);

    currentTurn = isP1 ? 'p2' : 'p1';
    updateTurnUI();
    draw();
  }

  function eatInVs(head, body, who) {
    if (!food || head.x !== food.x || head.y !== food.y) return;

    const points = food.type.points;
    if (who === 'p1') score += points; else score2 += points;

    spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, `${who.toUpperCase()} +${points} eraser!`, food.type.color);
    // Munchkins act as erasers in VS: rub out tail segments to reclaim space!
    for (let i = 0; i < VS_ERASE_ON_EAT && body.length > 3; i++) body.pop();

    triggerHaptic([30]);
    playSound(food.type.name === 'coffee' ? 'coffee' : 'eat');
    spawnFood();
  }

  function dirTowardCenter(cell) {
    const c = (GRID_SIZE - 1) / 2;
    const dx = c - cell.x;
    const dy = c - cell.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
    return dy > 0 ? 'DOWN' : 'UP';
  }

  function spawnBodyAt(cell, dir) {
    // Lay 3 starting segments behind head
    const back = {
      UP: { x: 0, y: 1 }, DOWN: { x: 0, y: -1 },
      LEFT: { x: 1, y: 0 }, RIGHT: { x: -1, y: 0 }
    }[dir];
    const body = [];
    for (let i = 0; i < 3; i++) body.push({ x: cell.x + back.x * i, y: cell.y + back.y * i });
    return body;
  }

  function randomInnerCell() {
    const span = GRID_SIZE - 6;
    return {
      x: 3 + Math.floor(Math.random() * span),
      y: 3 + Math.floor(Math.random() * span)
    };
  }

  function spawnVsPlayers() {
    let a = randomInnerCell();
    let b = randomInnerCell();
    let guard = 0;
    while (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < VS_MIN_SPAWN_GAP && guard < 300) {
      b = randomInnerCell();
      guard++;
    }

    direction = dirTowardCenter(a);
    direction2 = dirTowardCenter(b);
    nextDirection = direction;
    nextDirection2 = direction2;
    snake = spawnBodyAt(a, direction);
    snake2 = spawnBodyAt(b, direction2);
  }

  function causeText(loser, cause) {
    if (cause === 'margin') return `${loser} ran off the edge of the page.`;
    if (cause === 'own') return `${loser} got tangled in their own trail.`;
    if (cause === 'headOn') return `${loser} met their rival head-on.`;
    return `${loser} slithered straight into the rival's trail.`;
  }

  function roundOver(cause1, cause2) {
    isRunning = false;
    clearInterval(gameInterval);
    triggerHaptic([60, 50, 80]);
    playSound('gameover');

    let title, icon, msg;
    if (cause1 && cause2) {
      title = 'Double Smudge!';
      icon = '💥🤝';
      msg = 'Both snakes crashed on the same stroke — nobody scores this round.';
    } else if (cause2) {
      matchWins.p1++;
      title = 'P1 Wins The Round! ✏️';
      icon = '🏆✏️';
      msg = causeText('P2', cause2);
    } else {
      matchWins.p2++;
      title = 'P2 Wins The Round! ⚔️';
      icon = '🏆⚔️';
      msg = causeText('P1', cause1);
    }
    msg += ` Munchkins — P1: ${score} · P2: ${score2}. Match: ${matchWins.p1}–${matchWins.p2}.`;

    updateScoreUI();
    updateTurnUI();
    const overlay = document.getElementById('game-overlay');
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-msg').textContent = msg;
    document.getElementById('overlay-icon').textContent = icon;
    document.getElementById('start-btn').textContent = 'NEXT ROUND ⚔️';
    overlay.classList.remove('hidden');
  }

  function setMode(newMode) {
    if (mode === newMode) return;
    const previousMode = mode;
    mode = newMode;
    isRunning = false;
    isPaused = false;
    clearInterval(gameInterval);
    clearInterval(ghostTimer);
    clearTimeout(comboTimer);
    hideComboBadge();
    combo = 0;
    particles = [];
    inkProjectiles = [];
    erasers = [];
    food = null;
    snake = [];
    snake2 = [];
    score = 0;
    score2 = 0;
    matchWins = { p1: 0, p2: 0 };
    if (previousMode === 'online' && newMode !== 'online' && window.SketchyNet) window.SketchyNet.leave();
    if (newMode === 'solo') {
      bestScore = parseInt(localStorage.getItem('sketchy_snake_best') || '0', 10);
    }
    applyModeUI();
    draw();
  }

  function applyModeUI() {
    const isVs = mode === 'vs' || mode === 'online';
    document.body.classList.toggle('mode-vs', isVs);
    const scoreLabel = document.getElementById('score-label');
    const bestLabel = document.getElementById('best-label');
    if (scoreLabel) scoreLabel.textContent = isVs ? 'P1 ✏️' : 'SCORE';
    if (bestLabel) bestLabel.textContent = isVs ? 'P2 ⚔️' : 'BEST';

    const soloBtn = document.getElementById('mode-solo-btn');
    const vsBtn = document.getElementById('mode-vs-btn');
    const onlineBtn = document.getElementById('mode-online-btn');
    if (soloBtn) soloBtn.classList.toggle('active', !isVs);
    if (vsBtn) vsBtn.classList.toggle('active', isVs);
    if (vsBtn) vsBtn.classList.toggle('active', mode === 'vs');
    if (onlineBtn) onlineBtn.classList.toggle('active', mode === 'online');
    document.getElementById('online-controls').classList.toggle('hidden', mode !== 'online');

    const overlay = document.getElementById('game-overlay');
    document.getElementById('overlay-title').textContent = mode === 'online' ? 'Online Tron Duel! 🌐' : (isVs ? 'Tron Duel! ⚔️' : 'Ready to Sketch?');
    document.getElementById('overlay-msg').innerHTML = mode === 'online'
      ? 'Create a private room, enter a friend’s code, or find a quick match. The server runs the shared board.'
      : isVs
      ? 'Pass & Play: Take turns stepping 1 cell! Every step leaves a permanent pencil line. Box your rival in!<br>Munchkins act as erasers to shave your tail.<br><strong>Controls:</strong> Share the D-pad, swipe, or arrows on each turn.'
      : 'Swipe or arrows to slither. <strong>[SPACE]</strong> or <strong>✏️ INK</strong> shoots lead! Beware rogue erasers 🧼 & grab highlighters for ghost immunity ✨';
    document.getElementById('overlay-icon').textContent = isVs ? '✏️⚔️🐍' : '🐱💤';
    document.getElementById('start-btn').textContent = mode === 'online' ? 'QUICK MATCH 🌐' : (isVs ? 'START DUEL ⚔️' : 'START SLITHERING ✏️');
    overlay.classList.remove('hidden');
    if (mode === 'solo') {
      bestScore = parseInt(localStorage.getItem('sketchy_snake_best') || '0', 10);
    }
    updateScoreUI();
    updateTurnUI();
    updateInkButtonState();
  }

  function startRound() {
    if (mode === 'online') window.SketchyNet.quickMatch();
    else if (mode === 'vs') startVsGame();
    else startGame();
  }

  function startVsGame() {
    initAudio();
    spawnVsPlayers();
    currentTurn = 'p1';
    score = 0;
    score2 = 0;
    combo = 0;
    particles = [];
    inkProjectiles = [];
    erasers = [];
    hideComboBadge();
    spawnFood();
    isRunning = true;
    isPaused = false;
    updateScoreUI();
    updateTurnUI();

    document.getElementById('game-overlay').classList.add('hidden');
    clearInterval(gameInterval);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderGrid();
    renderFood();
    if (mode === 'solo') {
      renderErasers();
      renderProjectiles();
    }
    renderSnake();
    updateAndDrawParticles();
  }

  function speedUp() {
    const newSpeed = Math.max(MIN_SPEED_MS, BASE_SPEED_MS - Math.floor(score / 40) * 4);
    clearInterval(gameInterval);
    gameInterval = setInterval(update, newSpeed);
  }

  function resetComboTimer() {
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      combo = 0;
      hideComboBadge();
    }, 4500);
  }

  function showComboBadge() {
    const badge = document.getElementById('combo-badge');
    if (badge && combo >= 2) {
      badge.textContent = `COMBO x${combo}! 🔥`;
      badge.classList.add('active');
    }
  }

  function hideComboBadge() {
    const badge = document.getElementById('combo-badge');
    if (badge) badge.classList.remove('active');
  }

  function updateScoreUI() {
    if (mode === 'vs' || mode === 'online') {
      document.getElementById('score-val').textContent = matchWins.p1;
      document.getElementById('best-val').textContent = matchWins.p2;
      return;
    }
    document.getElementById('score-val').textContent = score;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('sketchy_snake_best', bestScore.toString());
    }
    document.getElementById('best-val').textContent = bestScore;
  }

  function updateTurnUI() {
    const card1 = document.querySelector('.score-card.current');
    const card2 = document.querySelector('.score-card.best');
    const badge = document.getElementById('power-badge');

    if (mode !== 'vs' || !isRunning) {
      if (card1) card1.classList.remove('active-turn');
      if (card2) card2.classList.remove('active-turn');
      if (badge && !isGhostMode) {
        badge.classList.remove('active', 'p1-turn', 'p2-turn');
      }
      return;
    }

    const isP1 = currentTurn === 'p1';
    if (card1) card1.classList.toggle('active-turn', isP1);
    if (card2) card2.classList.toggle('active-turn', !isP1);

    if (badge) {
      badge.textContent = isP1 ? "✏️ P1'S TURN (YOUR MOVE)" : "⚔️ P2'S TURN (YOUR MOVE)";
      badge.classList.remove('p1-turn', 'p2-turn');
      badge.classList.add('active', isP1 ? 'p1-turn' : 'p2-turn');
    }
  }

  // --- Game Lifecycle ---
  function startGame() {
    initAudio();
    snake = [
      { x: 5, y: 8 },
      { x: 4, y: 8 },
      { x: 3, y: 8 }
    ];
    direction = 'RIGHT';
    nextDirection = 'RIGHT';
    score = 0;
    combo = 0;
    particles = [];
    inkProjectiles = [];
    erasers = [];
    isGhostMode = false;
    ghostSecondsLeft = 0;
    clearInterval(ghostTimer);

    const powerBadge = document.getElementById('power-badge');
    if (powerBadge) powerBadge.classList.remove('active');

    updateScoreUI();
    updateTurnUI();
    updateInkButtonState();

    spawnFood();
    isRunning = true;
    isPaused = false;

    document.getElementById('game-overlay').classList.add('hidden');
    clearInterval(gameInterval);
    gameInterval = setInterval(update, BASE_SPEED_MS);
  }

  function gameOver(reason) {
    isRunning = false;
    clearInterval(gameInterval);
    clearInterval(ghostTimer);
    isGhostMode = false;
    const powerBadge = document.getElementById('power-badge');
    if (powerBadge) powerBadge.classList.remove('active');

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('sketchy_snake_best', bestScore.toString());
    }
    updateScoreUI();
    updateTurnUI();

    triggerHaptic([60, 50, 80]);
    playSound('gameover');

    const overlay = document.getElementById('game-overlay');
    document.getElementById('overlay-title').textContent = 'Sketch Paused!';
    document.getElementById('overlay-msg').textContent = `${reason} Final Score: ${score} · Best: ${bestScore}`;
    document.getElementById('overlay-icon').textContent = '✏️💥';
    document.getElementById('start-btn').textContent = 'RE-SKETCH ↺';
    overlay.classList.remove('hidden');
  }

  function togglePause() {
    if (!isRunning) return;
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
  }

  // --- Controls & Event Listeners ---
  function isReverse(newDir, curDir) {
    return (newDir === 'UP' && curDir === 'DOWN') ||
           (newDir === 'DOWN' && curDir === 'UP') ||
           (newDir === 'LEFT' && curDir === 'RIGHT') ||
           (newDir === 'RIGHT' && curDir === 'LEFT');
  }

  function handleDirection(newDir) {
    initAudio();
    if (mode === 'online') {
      if (onlineSeat === 'p1' || onlineSeat === 'p2') window.SketchyNet.sendDir(newDir);
      return;
    }
    if (mode === 'vs') {
      stepDuelTurn(newDir);
      return;
    }
    if (isReverse(newDir, direction)) return;
    nextDirection = newDir;
  }

  function setupControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') { e.preventDefault(); handleDirection('UP'); }
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') { e.preventDefault(); handleDirection('DOWN'); }
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') { e.preventDefault(); handleDirection('LEFT'); }
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') { e.preventDefault(); handleDirection('RIGHT'); }
      else if (e.code === 'Space') {
        e.preventDefault();
        if (!isRunning) {
          startRound();
          if (!isMusicPlaying) toggleMusic(true);
        } else if (!isPaused && mode === 'solo') {
          shootInk();
        }
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        togglePause();
      }
    });

    // Ink Shot Button (Solo only)
    const inkBtn = document.getElementById('ink-btn');
    if (inkBtn) {
      inkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (mode === 'solo') shootInk();
      });
    }

    // Touch D-Pad buttons (shared across Solo and VS Duel turns)
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const dir = btn.getAttribute('data-dir');
        handleDirection(dir);
        triggerHaptic([15]);
      });
    });

    // Swipe Gestures on Canvas (shared across Solo and VS Duel turns)
    let touchStartX = 0;
    let touchStartY = 0;
    const canvasWrap = document.getElementById('canvas-wrap');

    canvasWrap.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    canvasWrap.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) > 25) {
        if (absDx > absDy) {
          handleDirection(dx > 0 ? 'RIGHT' : 'LEFT');
        } else {
          handleDirection(dy > 0 ? 'DOWN' : 'UP');
        }
      }
    }, { passive: true });

    // Mode Selector Buttons
    const soloBtn = document.getElementById('mode-solo-btn');
    if (soloBtn) {
      soloBtn.addEventListener('click', () => setMode('solo'));
    }
    const vsBtn = document.getElementById('mode-vs-btn');
    if (vsBtn) {
      vsBtn.addEventListener('click', () => setMode('vs'));
    }
    document.getElementById('mode-online-btn').addEventListener('click', () => setMode('online'));
    document.getElementById('quick-match-btn').addEventListener('click', () => window.SketchyNet.quickMatch());
    document.getElementById('create-room-btn').addEventListener('click', () => window.SketchyNet.createRoom());
    document.getElementById('join-room-btn').addEventListener('click', () => {
      window.SketchyNet.joinRoom(document.getElementById('room-code-input').value);
    });

    // Credits Modal Trigger and Close
    const creditsBtn = document.getElementById('credits-btn');
    const creditsModal = document.getElementById('credits-modal');
    const closeCreditsBtn = document.getElementById('close-credits-btn');
    if (creditsBtn && creditsModal) {
      creditsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        creditsModal.classList.remove('hidden');
      });
    }
    if (closeCreditsBtn && creditsModal) {
      closeCreditsBtn.addEventListener('click', () => {
        creditsModal.classList.add('hidden');
      });
    }
    if (creditsModal) {
      creditsModal.addEventListener('click', (e) => {
        if (e.target === creditsModal) {
          creditsModal.classList.add('hidden');
        }
      });
    }

    // Music Controls
    const musicPlayBtn = document.getElementById('music-play-btn');
    if (musicPlayBtn) {
      musicPlayBtn.addEventListener('click', () => toggleMusic());
    }

    const nextTrackBtn = document.getElementById('next-track-btn');
    if (nextTrackBtn) {
      nextTrackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        nextTrack();
      });
    }

    // Buttons
    document.getElementById('start-btn').addEventListener('click', () => {
      startRound();
      if (!isMusicPlaying) toggleMusic(true);
    });
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    
    const soundBtn = document.getElementById('sound-btn');
    soundBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? '🔊 Sound' : '🔇 Muted';
      if (!soundEnabled && isMusicPlaying) toggleMusic(false);
    });
  }

  // --- Resize & Init ---
  function resizeCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const size = wrap.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    cellSize = size / GRID_SIZE;
    draw();
  }

  function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    setupOnline();
    document.getElementById('best-val').textContent = bestScore;

    window.addEventListener('resize', resizeCanvas);
    setupControls();
    applyModeUI();
    updateMusicUI();
    resizeCanvas();
    draw();
  }

  function setupOnline() {
    const status = document.getElementById('online-status');
    if (!window.SketchyNet) {
      status.textContent = 'Online play is unavailable in this build.';
      return;
    }
    window.SketchyNet
      .on('status', event => { status.textContent = event.detail ? `${event.status}: ${event.detail}` : event.status; })
      .on('joined', msg => {
        onlineSeat = msg.seat;
        onlineRoom = msg.room;
        matchWins = msg.wins || matchWins;
        status.textContent = `${msg.seat === 'spectator' ? 'Watching' : `Playing as ${msg.seat.toUpperCase()}`} · room ${msg.room}`;
      })
      .on('state', msg => {
        if (mode !== 'online') return;
        snake = msg.p1.cells.map(cell => ({ x: cell % GRID_SIZE, y: Math.floor(cell / GRID_SIZE) }));
        snake2 = msg.p2.cells.map(cell => ({ x: cell % GRID_SIZE, y: Math.floor(cell / GRID_SIZE) }));
        direction = msg.p1.dir;
        direction2 = msg.p2.dir;
        score = msg.p1.score;
        score2 = msg.p2.score;
        const type = msg.food && MUNCHKIN_TYPES.find(item => item.name === msg.food.type);
        food = msg.food ? { x: msg.food.at % GRID_SIZE, y: Math.floor(msg.food.at / GRID_SIZE), type: type || MUNCHKIN_TYPES[0] } : null;
        isRunning = true;
        isPaused = false;
        document.getElementById('game-overlay').classList.add('hidden');
        updateScoreUI();
        draw();
      })
      .on('paused', msg => {
        isPaused = true;
        status.textContent = `${msg.seat.toUpperCase()} disconnected; waiting ${msg.seconds}s.`;
        document.getElementById('overlay-title').textContent = 'Match paused';
        document.getElementById('overlay-msg').textContent = 'Waiting for the other player to reconnect.';
        document.getElementById('game-overlay').classList.remove('hidden');
      })
      .on('roundover', msg => {
        isRunning = false;
        matchWins = msg.wins || matchWins;
        const winner = msg.winner ? `${msg.winner.toUpperCase()} wins` : 'Draw';
        document.getElementById('overlay-title').textContent = winner;
        document.getElementById('overlay-msg').textContent = msg.forfeit ? 'The other player disconnected.' : 'Round complete.';
        document.getElementById('start-btn').textContent = 'FIND ANOTHER MATCH 🌐';
        document.getElementById('game-overlay').classList.remove('hidden');
        updateScoreUI();
      })
      .on('error', msg => { status.textContent = msg.message || 'Could not join that match.'; });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
