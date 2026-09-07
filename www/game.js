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

  const MUNCHKIN_TYPES = [
    { name: 'avocado', label: '🥑 Avocado Head', color: '#10B981', points: 10, quote: 'fresh munchkin!' },
    { name: 'cucumber', label: '🥒 Cucumber Head', color: '#84CC16', points: 15, quote: 'crispy doodle!' },
    { name: 'pumpkin', label: '🎃 Pumpkin Head', color: '#F97316', points: 20, quote: 'autumn vibes!' },
    { name: 'potato', label: '🥔 Potato Head', color: '#D97706', points: 15, quote: 'potato power!' },
    { name: 'coffee', label: '☕ Coffee Fuel', color: '#854D0E', points: 30, quote: 'coffee = fuel ⚡', special: 'speed' },
    { name: 'heart', label: '🧡 Orange Heart', color: '#EA580C', points: 50, quote: 'built with 🧡', special: 'heart' }
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
  let snake = [];
  let direction = 'RIGHT';
  let nextDirection = 'RIGHT';
  let food = null;
  let score = 0;
  let bestScore = parseInt(localStorage.getItem('sketchy_snake_best') || '0', 10);
  let combo = 0;
  let comboTimer = null;
  let gameInterval = null;
  let isRunning = false;
  let isPaused = false;
  let particles = [];
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
    } else {
      drawSketchCircle(px, py, r, food.type.color, '#2A2B32');
    }
  }

  function renderSnake() {
    for (let i = 0; i < snake.length; i++) {
      const seg = snake[i];
      const x = seg.x * cellSize;
      const y = seg.y * cellSize;
      const isHead = i === 0;

      if (isHead) {
        // Head: Cobalt Blue with sketch contour
        drawSketchRect(x + 1, y + 1, cellSize - 2, cellSize - 2, '#1D4ED8', '#1E3A8A');
        
        // Eyes based on direction
        const eyeOffset = cellSize * 0.3;
        let ex1 = x + eyeOffset, ey1 = y + eyeOffset;
        let ex2 = x + cellSize - eyeOffset, ey2 = y + eyeOffset;
        if (direction === 'DOWN') { ey1 = y + cellSize - eyeOffset; ey2 = y + cellSize - eyeOffset; }
        if (direction === 'LEFT') { ex1 = x + eyeOffset; ex2 = x + eyeOffset; ey2 = y + cellSize - eyeOffset; }
        if (direction === 'RIGHT') { ex1 = x + cellSize - eyeOffset; ex2 = x + cellSize - eyeOffset; ey2 = y + cellSize - eyeOffset; }

        ctx.fillStyle = '#FFF';
        ctx.fillRect(ex1 - 2, ey1 - 2, 4, 4);
        ctx.fillRect(ex2 - 2, ey2 - 2, 4, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(ex1 - 1, ey1 - 1, 2, 2);
        ctx.fillRect(ex2 - 1, ey2 - 1, 2, 2);

        // Crown on combo streak
        if (combo >= 2) {
          ctx.font = '12px sans-serif';
          ctx.fillText('👑', x + 2, y - 4);
        }
      } else {
        // Body: Gradient sketch fill from Cobalt to Magenta
        const ratio = i / snake.length;
        const color = ratio > 0.5 ? '#DB2777' : '#2563EB';
        drawSketchRect(x + 2, y + 2, cellSize - 4, cellSize - 4, color, '#2A2B32');
        
        // Cross-hatch sketch detail
        if (i % 2 === 0) {
          drawSketchLine(x + 4, y + 4, x + cellSize - 4, y + cellSize - 4, 'rgba(255,255,255,0.4)', 1);
        }
      }
    }
  }

  // --- Game Mechanics ---
  function spawnFood() {
    let valid = false;
    let newX, newY;
    while (!valid) {
      newX = Math.floor(Math.random() * GRID_SIZE);
      newY = Math.floor(Math.random() * GRID_SIZE);
      valid = !snake.some(seg => seg.x === newX && seg.y === newY);
    }

    // Pick munchkin type with weighted probability
    const rand = Math.random();
    let type = MUNCHKIN_TYPES[0];
    if (rand < 0.35) type = MUNCHKIN_TYPES[0]; // Avocado
    else if (rand < 0.60) type = MUNCHKIN_TYPES[1]; // Cucumber
    else if (rand < 0.80) type = MUNCHKIN_TYPES[2]; // Pumpkin
    else if (rand < 0.90) type = MUNCHKIN_TYPES[3]; // Potato
    else if (rand < 0.96) type = MUNCHKIN_TYPES[4]; // Coffee
    else type = MUNCHKIN_TYPES[5]; // Orange Heart

    food = { x: newX, y: newY, type };
  }

  function update() {
    if (!isRunning || isPaused) return;

    direction = nextDirection;
    const head = { ...snake[0] };

    if (direction === 'UP') head.y -= 1;
    else if (direction === 'DOWN') head.y += 1;
    else if (direction === 'LEFT') head.x -= 1;
    else if (direction === 'RIGHT') head.x += 1;

    // Wall Collision Check
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      gameOver('Ouch! Hit the margin border!');
      return;
    }

    // Self Collision Check
    if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      gameOver('Tangled up in your own sketch!');
      return;
    }

    snake.unshift(head);

    // Food Collision Check
    if (food && head.x === food.x && head.y === food.y) {
      const points = food.type.points * (combo > 0 ? combo + 1 : 1);
      score += points;
      updateScoreUI();

      combo++;
      showComboBadge();
      resetComboTimer();

      spawnFloatingDoodle(head.x * cellSize, head.y * cellSize, `+${points} ${food.type.quote}`, food.type.color);
      triggerHaptic([30]);
      playSound(food.type.name === 'coffee' ? 'coffee' : 'eat');

      spawnFood();
      speedUp();
    } else {
      snake.pop();
    }

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderGrid();
    renderFood();
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
    document.getElementById('score-val').textContent = score;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('sketchy_snake_best', bestScore.toString());
      document.getElementById('best-val').textContent = bestScore;
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
    updateScoreUI();

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
    triggerHaptic([60, 50, 80]);
    playSound('gameover');

    const overlay = document.getElementById('game-overlay');
    document.getElementById('overlay-title').textContent = 'Sketch Paused!';
    document.getElementById('overlay-msg').textContent = `${reason} Final Score: ${score}`;
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
  function handleDirection(newDir) {
    initAudio();
    if (
      (newDir === 'UP' && direction !== 'DOWN') ||
      (newDir === 'DOWN' && direction !== 'UP') ||
      (newDir === 'LEFT' && direction !== 'RIGHT') ||
      (newDir === 'RIGHT' && direction !== 'LEFT')
    ) {
      nextDirection = newDir;
    }
  }

  function setupControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); handleDirection('UP'); }
      else if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); handleDirection('DOWN'); }
      else if (['ArrowLeft', 'KeyA'].includes(e.code)) { e.preventDefault(); handleDirection('LEFT'); }
      else if (['ArrowRight', 'KeyD'].includes(e.code)) { e.preventDefault(); handleDirection('RIGHT'); }
      else if (e.code === 'Space') {
        e.preventDefault();
        if (!isRunning) startGame();
        else togglePause();
      }
    });

    // Touch D-Pad buttons
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const dir = btn.getAttribute('data-dir');
        handleDirection(dir);
        triggerHaptic([15]);
      });
    });

    // Swipe Gestures on Canvas
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
      startGame();
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
    document.getElementById('best-val').textContent = bestScore;

    window.addEventListener('resize', resizeCanvas);
    setupControls();
    updateMusicUI();
    resizeCanvas();
    draw();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
