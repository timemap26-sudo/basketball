/* 全場灌籃 Full Court Slam — 3v3 full-court basketball, HTML5 canvas, no dependencies. */
'use strict';
(() => {
  // =====================================================================
  // Constants (all world units are metres)
  // =====================================================================
  const COURT_L = 28, COURT_W = 15, MID_X = COURT_L / 2, MID_Z = COURT_W / 2;
  const HOOP_Y = 3.05, RIM_R = 0.23, BALL_R = 0.12;
  const G = 9.8;
  const THREE_R = 6.75, CORNER_Z = 6.6;
  const RUN = 5.0, SPRINT = 7.4;
  const SHOT_VY = 3.6, APEX = SHOT_VY / G, SHOT_MAX_T = 0.62;
  const HOOPS = [
    { x: 1.575, z: MID_Z, board: 1.2, dir: 1, shake: 0, net: 0 },
    { x: COURT_L - 1.575, z: MID_Z, board: COURT_L - 1.2, dir: -1, shake: 0, net: 0 },
  ];
  const attackHoop = (team) => (team === 0 ? 1 : 0);
  const defendHoop = (team) => (team === 0 ? 0 : 1);

  const TEAMS = [
    { name: '烈焰', en: 'BLAZE', color: '#e8452c', dark: '#9e2614', light: '#ffc2b0', paint: 'rgba(232,69,44,0.28)' },
    { name: '浪潮', en: 'WAVES', color: '#2b7de9', dark: '#173f80', light: '#b8d6ff', paint: 'rgba(43,125,233,0.28)' },
  ];
  const ROSTER = [
    [
      { num: 7, name: '小飛', skin: '#f1c27d', hair: '#2b1b0e', style: 'spiky', height: 1.9 },
      { num: 23, name: '阿傑', skin: '#c68642', hair: '#1a1a1a', style: 'afro', height: 1.98 },
      { num: 34, name: '大山', skin: '#8d5524', hair: '#111', style: 'buzz', height: 2.08 },
    ],
    [
      { num: 3, name: '閃電', skin: '#ffdbac', hair: '#8a5a2b', style: 'bun', height: 1.9 },
      { num: 11, name: '阿浪', skin: '#e0ac69', hair: '#2a2a3a', style: 'swoop', height: 1.98 },
      { num: 21, name: '巨塔', skin: '#a1665e', hair: '#1a1a1a', style: 'mohawk', height: 2.1 },
    ],
  ];
  const DIFFS = [
    { name: '簡單', oppSkill: 0.5, steal: 0.12, block: 0.3, lag: 2.6 },
    { name: '普通', oppSkill: 0.7, steal: 0.24, block: 0.55, lag: 4.0 },
    { name: '困難', oppSkill: 0.86, steal: 0.4, block: 0.75, lag: 6.0 },
  ];
  const QUARTER_OPTS = [1, 2, 3, 5];
  // three-point make rate for the human teams' shooters (null = normal, timing-based)
  const THREE_OPTS = [null, 0.4, 0.6, 0.8, 1];
  const DUNKS = [
    { en: 'SLAM DUNK!', zh: '暴力灌籃' },
    { en: 'WINDMILL!', zh: '風車灌籃' },
    { en: 'TOMAHAWK!', zh: '戰斧灌籃' },
    { en: '360° JAM!', zh: '360 度灌籃' },
    { en: '360° WINDMILL!', zh: '360 度風車灌籃' },
  ];
  // F dunks are the power ones; S picks a fancy one
  const POWER_DUNKS = [DUNKS[0], DUNKS[2]];
  const FANCY_DUNKS = [DUNKS[1], DUNKS[3], DUNKS[4]];
  // offensive spots: [distance from hoop, angle] (angle 0 = straight out to the court)
  const SPOTS = [
    [7.3, 0], [7.0, 1.0], [7.0, -1.0], [6.8, 1.42], [6.8, -1.42],
    [2.4, 1.05], [2.4, -1.05], [4.6, 0.55], [4.6, -0.55],
  ];

  // =====================================================================
  // Helpers
  // =====================================================================
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const fmtClock = (t) => {
    t = Math.max(0, t);
    if (t < 10) return t.toFixed(1);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // =====================================================================
  // Audio (WebAudio synth, no assets)
  // =====================================================================
  const sfx = (() => {
    let ac = null, master = null, noiseBuf = null, muted = false;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      } catch (e) { ac = null; }
    }
    function tone(freq, dur, type = 'sine', vol = 0.3, slide = 1) {
      if (!ac || muted) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, type, freq, q = 1) {
      if (!ac || muted) return;
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
    }
    return {
      init,
      toggle() { muted = !muted; return muted; },
      get muted() { return muted; },
      bounce(v = 1) { tone(150, 0.11, 'sine', 0.3 * v, 0.5); },
      rim() { tone(520, 0.16, 'square', 0.06, 0.9); tone(790, 0.24, 'triangle', 0.08, 0.95); },
      board() { tone(210, 0.1, 'triangle', 0.2, 0.6); },
      swish() { noise(0.35, 0.22, 'highpass', 3200); },
      dunk() { tone(85, 0.4, 'sawtooth', 0.22, 0.4); noise(0.3, 0.3, 'lowpass', 700); },
      cheer(big) { noise(big ? 2.2 : 1.3, big ? 0.32 : 0.2, 'bandpass', 1100, 0.6); },
      whistle() { tone(2900, 0.32, 'sine', 0.1); tone(2950, 0.32, 'sine', 0.06); },
      buzzer() { tone(175, 0.9, 'sawtooth', 0.13); tone(178, 0.9, 'square', 0.05); },
      pass() { tone(320, 0.06, 'triangle', 0.1); },
      steal() { tone(660, 0.1, 'square', 0.07, 1.6); },
      block() { tone(120, 0.22, 'square', 0.14, 0.5); noise(0.15, 0.2, 'lowpass', 900); },
      click() { tone(880, 0.05, 'triangle', 0.08); },
      chat() { tone(1046, 0.09, 'sine', 0.08); },
    };
  })();

  // online session state (see the Network section below)
  const net = { role: null, peer: null, conn: null, code: '', sendT: 0, lastRecv: 0, sfxQ: [], bannerId: -1 };
  // voice chat: each side sends its own one-way audio call while its mic is on
  const voice = { on: false, busy: false, stream: null, outCall: null, inCall: null, remoteOn: false, remoteMuted: false,
    ctx: null, an: [null, null], src: [null, null], level: [0, 0], buf: null, needPlay: false };
  // sounds the host plays are forwarded to the guest
  const SFX_FX = ['bounce', 'rim', 'board', 'swish', 'dunk', 'cheer', 'whistle', 'buzzer', 'pass', 'steal', 'block'];
  const sfxRaw = {};
  for (const k of SFX_FX) {
    sfxRaw[k] = sfx[k];
    sfx[k] = (...a) => {
      sfxRaw[k](...a);
      if (net.role === 'host' && net.sfxQ.length < 40) net.sfxQ.push([k, ...a]);
    };
  }

  // =====================================================================
  // Input
  // =====================================================================
  const KEYMAP = {
    // right hand moves with the arrow keys, left hand plays on A / S / W / F / Z
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyA: 'sprint', ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyW: 'jump', KeyF: 'shoot', KeyS: 'fancy', KeyZ: 'pass', Space: 'cross',
    KeyP: 'pause', Escape: 'pause', Enter: 'start', KeyM: 'mute',
  };
  const input = {
    down: new Set(), pressed: new Set(), released: new Set(),
    stick: { x: 0, y: 0, active: false }, touch: false,
    isDown(a) { return this.down.has(a) || (a === 'sprint' && this.touchSprinting()); },
    hit(a) { return this.pressed.has(a); },
    up(a) { return this.released.has(a); },
    pressT: 0, held: null,
    // phones: the sprint button is an on/off toggle, and pushing the stick to its edge also sprints
    sprintToggle: false,
    touchSprinting() {
      return this.sprintToggle || (this.stick.active && hyp(this.stick.x, this.stick.y) > STICK_SPRINT);
    },
    press(a) {
      if (this.down.has(a)) return;
      this.down.add(a); this.pressed.add(a);
      if (a === 'shoot') this.pressT = performance.now();
    },
    release(a) {
      if (!this.down.has(a)) return;
      this.down.delete(a); this.released.add(a);
      if (a === 'shoot') this.held = (performance.now() - this.pressT) / 1000;
    },
    axis() {
      let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
      let z = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
      if (this.stick.active) { x += this.stick.x; z += this.stick.y; }
      const m = hyp(x, z);
      if (m > 1) { x /= m; z /= m; }
      return { x, z, m: Math.min(1, m) };
    },
    endFrame() { this.pressed.clear(); this.released.clear(); },
  };
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'Enter' && canChat() && game.mode === 'play' && !e.repeat) { e.preventDefault(); chatOpen(true); return; }
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    sfx.init();
    if (!e.repeat) input.press(a);
  });
  window.addEventListener('keyup', (e) => {
    if (typing(e)) return;
    const a = KEYMAP[e.code];
    if (a) { e.preventDefault(); input.release(a); }
  });
  window.addEventListener('blur', () => { for (const a of [...input.down]) input.release(a); });

  // the online opponent's controls, fed by network messages (host side)
  const NET_ACTS = new Set(['up', 'down', 'left', 'right', 'sprint', 'shoot', 'jump', 'pass', 'cross', 'fancy']);
  const remoteInput = {
    ax: 0, az: 0, down: new Set(), pressed: new Set(), released: new Set(), held: null,
    isDown(a) { return this.down.has(a); },
    hit(a) { return this.pressed.has(a); },
    up(a) { return this.released.has(a); },
    axis() { return { x: this.ax, z: this.az, m: Math.min(1, hyp(this.ax, this.az)) }; },
    endFrame() { this.pressed.clear(); this.released.clear(); },
    reset() { this.ax = this.az = 0; this.down.clear(); this.endFrame(); this.held = null; },
  };

  // touch controls
  const STICK_SPRINT = 0.9;
  const touchEl = document.getElementById('touch');
  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('knob');
  function enableTouch() {
    if (input.touch) return;
    input.touch = true;
    touchEl.classList.add('on');
  }
  window.addEventListener('touchstart', enableTouch, { passive: true });
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouch();
  let stickId = null;
  function stickMove(e) {
    const r = stickEl.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
    const m = hyp(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    input.stick.x = Math.abs(dx) < 0.15 ? 0 : dx;
    input.stick.y = Math.abs(dy) < 0.15 ? 0 : dy;
    knobEl.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    knobEl.classList.toggle('fast', hyp(dx, dy) > STICK_SPRINT);
  }
  stickEl.addEventListener('pointerdown', (e) => {
    sfx.init(); stickId = e.pointerId; input.stick.active = true;
    stickEl.setPointerCapture(e.pointerId); stickMove(e);
  });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; input.stick.active = false; input.stick.x = input.stick.y = 0;
    knobEl.style.transform = '';
    knobEl.classList.remove('fast');
  };
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);
  for (const b of document.querySelectorAll('#btns button')) {
    const act = b.dataset.act;
    if (act === 'sprint') {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); sfx.init();
        input.sprintToggle = !input.sprintToggle;
        b.classList.toggle('on', input.sprintToggle);
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      continue;
    }
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sfx.init(); b.setPointerCapture(e.pointerId); b.classList.add('down');
      if (act === 'shoot' && game.mode !== 'play') input.press('start');
      input.press(act);
    });
    const up = () => { b.classList.remove('down'); input.release(act); if (act === 'shoot') input.release('start'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // =====================================================================
  // Canvas & projection (2.5D side view of the court)
  // =====================================================================
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const VW = 1280, VH = 720;
  let fit = 1, offX = 0, offY = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    fit = Math.min(canvas.width / VW, canvas.height / VH);
    offX = (canvas.width - VW * fit) / 2;
    offY = (canvas.height - VH * fit) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  const S = 68;                       // px per metre at the near sideline
  const FLOOR_TOP = 300, FLOOR_BOT = 660; // screen y of far (z=0) and near (z=15) sidelines
  const cam = { x: MID_X, sx: 0, sy: 0 };
  const kz = (z) => 0.72 + 0.28 * z / COURT_W;
  function proj(x, y, z) {
    const k = kz(z);
    return {
      x: VW / 2 + (x - cam.x) * S * k + cam.sx,
      y: FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * z / COURT_W - y * S * k + cam.sy,
      k,
    };
  }

  // =====================================================================
  // Game state
  // =====================================================================
  const game = {
    mode: 'menu', // menu | play | paused | over
    demo: true,
    diff: 1, qIdx: 1, quarterLen: 120, threeIdx: 0,
    score: [0, 0], quarter: 1, clock: 120, shotClock: 24,
    possession: -1,
    phase: 'live', // live | dead | jump | break
    phaseT: 0, afterFn: null, nextPoss: -1,
    pendingEnd: false,
    banner: null, texts: [],
    cheer: 0, shake: 0, time: 0, playTime: 0,
    stats: null,
    winner: -1,
    humans: [false, false], localTeam: 0, online: false, bannerId: 0, lastScoreTeam: -1,
  };
  let players = [];
  let teams = [[], []];
  const ctrl = [null, null]; // the player each human team is steering (null = CPU team)
  const isHuman = (p) => !!p && ctrl[p.team] === p;
  const cpuTeam = (t) => !game.demo && !game.humans[t];
  const chasers = [null, null];
  const ball = {
    x: MID_X, y: 1, z: MID_Z, vx: 0, vy: 0, vz: 0, rot: 0,
    state: 'free', holder: null, shot: null, pass: null,
    lastTeam: -1, ignore: null, ignoreT: 0, touchedRim: false, dribbleN: 0,
  };

  function makePlayer(team, idx) {
    const r = ROSTER[team][idx];
    return {
      team, idx, ...r,
      x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, wantVx: 0, wantVz: 0, tx: 0, tz: 0,
      facing: team === 0 ? 1 : -1, state: 'idle', stateT: 0, runPhase: rand(0, 6), dribble: 0,
      lockT: 0, stunT: 0, stealCD: 0, reachT: 0, jumpAt: -1, aiT: 0, spot: [0, 1, 5][idx], spotT: rand(2, 5),
      cutT: 0, driveSide: Math.random() < 0.5 ? 1 : -1, sprint: false, releaseAt: 0, follow: 0,
      dunk: null, plan: 'drive', planT: 0, userShot: false, catchT: 0, blinkPh: rand(0, 4),
      crossT: 0, crossCD: 0, crossSide: 1,
    };
  }
  const reachOf = (p) => p.height * 1.22 + p.y + (p.y > 0.05 ? 0.15 : 0);
  const skillOf = (p) => (game.demo ? 0.74 : cpuTeam(p.team) ? DIFFS[game.diff].oppSkill : 0.76);

  function newStats() {
    const t = () => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, blocks: 0, steals: 0 });
    return [t(), t()];
  }

  function newGame(demo, opts = {}) {
    game.demo = demo;
    game.humans = demo ? [false, false] : (opts.humans || [true, false]);
    game.localTeam = opts.localTeam || 0;
    game.online = !!opts.online;
    game.mode = demo ? 'menu' : 'play';
    game.score = [0, 0];
    game.quarter = 1;
    game.quarterLen = demo ? 600 : QUARTER_OPTS[game.qIdx] * 60;
    game.clock = game.quarterLen;
    game.shotClock = 24;
    game.possession = -1;
    game.texts = [];
    game.banner = null;
    game.pendingEnd = false;
    game.stats = newStats();
    game.playTime = 0;
    game.winner = -1;
    players = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push(makePlayer(t, i));
    teams = [players.filter((p) => p.team === 0), players.filter((p) => p.team === 1)];
    for (let t = 0; t < 2; t++) ctrl[t] = game.humans[t] ? teams[t][2] : null;
    setupJumpBall();
    if (!demo) banner('跳球！', '按 W 跳起爭球', '#ffd54a', 1.8);
  }

  function setupJumpBall() {
    for (const p of players) {
      const side = p.team === 0 ? -1 : 1;
      p.state = 'idle'; p.y = 0; p.vy = 0; p.vx = p.vz = 0; p.wantVx = p.wantVz = 0; p.jumpAt = -1;
      if (p.idx === 2) { p.x = MID_X + side * 0.55; p.z = MID_Z; }
      else { p.x = MID_X + side * 3.2; p.z = p.idx === 0 ? 4.2 : 10.8; }
      p.facing = -side;
    }
    Object.assign(ball, { x: MID_X, y: 1.9, z: MID_Z, vx: 0, vy: 0, vz: 0, state: 'free', holder: null,
      shot: null, pass: null, lastTeam: -1, ignore: null, ignoreT: 0, touchedRim: false });
    game.possession = -1;
    game.phase = 'jump';
    game.phaseT = game.demo ? 0.8 : 1.6;
  }

  function resetPositions() {
    for (const p of players) {
      const hp = HOOPS[defendHoop(p.team)];
      const d = [6.5, 4.2, 2.4][p.idx];
      p.x = hp.x + hp.dir * d; p.z = MID_Z + [0, -3.5, 3.5][p.idx];
      p.y = 0; p.vy = 0; p.vx = p.vz = 0; p.state = 'idle'; p.jumpAt = -1; p.dunk = null;
    }
  }

  // =====================================================================
  // Messages
  // =====================================================================
  function banner(text, sub, color = '#fff', dur = 1.7) {
    game.banner = { text, sub, color, t: 0, dur };
    game.bannerId++;
  }
  function floatText(text, x, y, z, color = '#fff', size = 26) {
    game.texts.push({ text, x, y, z, color, size, t: 0 });
  }

  // =====================================================================
  // Ball possession
  // =====================================================================
  function giveTo(p, forceReset) {
    const wasShot = ball.shot;
    if (forceReset || p.team !== game.possession || ball.touchedRim) game.shotClock = 24;
    ball.holder = p; ball.state = 'held'; ball.pass = null; ball.shot = null;
    ball.touchedRim = false; ball.lastTeam = p.team; ball.ignore = null;
    game.possession = p.team;
    p.plan = Math.random() < (p.idx === 2 ? 0.25 : 0.55) ? 'three' : 'drive'; p.planT = 0; p.aiT = rand(0.1, 0.3);
    if (game.humans[p.team]) ctrl[p.team] = p;
    return wasShot;
  }

  function looseBall() {
    if (ball.holder) {
      const h = ball.holder;
      ball.holder = null;
      ball.x = h.x + h.facing * 0.3; ball.z = h.z; ball.y = Math.max(ball.y, 0.6);
      ball.vx = ball.vz = 0; ball.vy = 0;
    }
    ball.state = 'free';
    ball.pass = null;
  }

  function deadThen(t, fn) {
    game.phase = 'dead';
    game.phaseT = t;
    game.afterFn = fn;
  }

  function doInbound(team, x, z) {
    const p = teams[team].slice().sort((a, b) => hyp(a.x - x, a.z - z) - hyp(b.x - x, b.z - z))[0];
    p.x = x; p.z = z; p.y = 0; p.vy = 0; p.vx = p.vz = 0; p.state = 'idle'; p.dunk = null;
    p.lockT = 0.45; p.stunT = 0;
    giveTo(p, true);
    game.phase = 'live';
  }

  function inboundSpot(x, z) {
    if (x < 0 || x > COURT_L) return { x: x < 0 ? 0.35 : COURT_L - 0.35, z: clamp(z, 1, COURT_W - 1) };
    return { x: clamp(x, 1, COURT_L - 1), z: z < MID_Z ? 0.35 : COURT_W - 0.35 };
  }

  function turnover(toTeam, x, z, text, sub) {
    if (toTeam < 0) toTeam = Math.random() < 0.5 ? 0 : 1;
    looseBall();
    ball.shot = null;
    game.nextPoss = toTeam;
    sfx.whistle();
    banner(text, sub, '#ffd54a', 1.3);
    const s = inboundSpot(x, z);
    deadThen(1.2, () => doInbound(toTeam, s.x, s.z));
  }

  function outOfBounds(lastTeam, x, z) {
    const to = lastTeam < 0 ? (Math.random() < 0.5 ? 0 : 1) : 1 - lastTeam;
    turnover(to, x, z, '出界！', `${TEAMS[to].name}隊球權`);
  }

  function shotClockViolation() {
    const t = game.possession;
    turnover(1 - t, ball.x, ball.z, '24 秒違例！', `${TEAMS[1 - t].name}隊球權`);
  }

  // =====================================================================
  // Actions: shoot, dunk, pass, steal, jump
  // =====================================================================
  const qFromT = (t) => clamp(1 - Math.max(0, Math.abs(t - APEX) - 0.035) / 0.2, 0, 1);

  function reactDefenders(shooter, range, isDunk) {
    for (const o of teams[1 - shooter.team]) {
      if (isHuman(o) || o.state !== 'idle' || o.y > 0) continue;
      const d = hyp(o.x - shooter.x, o.z - shooter.z);
      const prob = game.demo ? 0.5 : cpuTeam(o.team) ? DIFFS[game.diff].block : 0.5;
      if (d < range && Math.random() < prob) o.jumpAt = isDunk ? rand(0.02, 0.15) : rand(0.04, 0.2);
    }
  }

  function startShot(p) {
    if (ball.holder !== p || p.state !== 'idle' || p.y > 0) return;
    p.state = 'shoot'; p.stateT = 0; p.vy = SHOT_VY; p.vx *= 0.25; p.vz *= 0.25;
    p.userShot = isHuman(p);
    const sk = skillOf(p);
    p.releaseAt = APEX + gauss() * (0.03 + 0.12 * (1 - sk));
    const hp = HOOPS[attackHoop(p.team)];
    p.facing = Math.sign(hp.x - p.x) || 1;
    reactDefenders(p, 1.9, false);
  }

  function releaseShot(p, q) {
    if (ball.holder !== p) return;
    const hi = attackHoop(p.team), hp = HOOPS[hi];
    const d = hyp(hp.x - p.x, hp.z - p.z);
    const three = d >= THREE_R || Math.abs(p.z - MID_Z) >= CORNER_Z;
    const st = game.stats[p.team];
    st.fga++; if (three) st.tpa++;
    let contest = 0;
    for (const o of teams[1 - p.team]) {
      const dd = hyp(o.x - p.x, o.z - p.z);
      if (dd < 2.2) contest += (2.2 - dd) / 2.2 * (o.y > 0.15 ? 1.5 : 1);
    }
    contest = Math.min(contest, 1.6);
    const sigma = (0.022 + 0.0058 * d) * (1 + 3.0 * (1 - q)) * (1 + 0.8 * contest) * (three ? 0.8 : 1);
    let tx = hp.x + gauss() * sigma, tz = hp.z + gauss() * sigma;
    // custom three-point rate: a make is aimed dead centre and can't be blocked, a miss is aimed at the rim
    const rate = three && !game.demo && !cpuTeam(p.team) ? THREE_OPTS[game.threeIdx] : null;
    const sure = rate != null && Math.random() < rate;
    if (sure) { tx = hp.x; tz = hp.z; }
    else if (rate != null) {
      const a = Math.random() * Math.PI * 2, off = RIM_R + rand(0.08, 0.2);
      tx = hp.x + Math.cos(a) * off; tz = hp.z + Math.sin(a) * off;
    }
    const rx = p.x + p.facing * 0.1, ry = p.y + p.height * 1.06, rz = p.z;
    const t = 0.6 + 0.1 * d;
    ball.holder = null; ball.state = 'free';
    ball.x = rx; ball.y = ry; ball.z = rz;
    ball.vx = (tx - rx) / t; ball.vz = (tz - rz) / t; ball.vy = (HOOP_Y - ry + 0.5 * G * t * t) / t;
    ball.shot = { team: p.team, hoop: hi, points: three ? 3 : 2, shooter: p, dunk: false, scored: false, sure };
    ball.ignore = p; ball.ignoreT = 0.5; ball.lastTeam = p.team; ball.touchedRim = false; ball.pass = null;
    p.state = 'post'; p.follow = 0.6;
    if (isHuman(p)) {
      const label = q >= 0.999 ? ['完美出手！', '#5dff7a'] : q > 0.65 ? ['不錯', '#c7ff7a']
        : p.stateT < APEX ? ['太早', '#ffb14a'] : ['太晚', '#ffb14a'];
      floatText(label[0], p.x, p.y + p.height + 0.7, p.z, label[1], 22);
    }
    // block at the release point by an airborne defender right in front
    if (!sure) for (const o of teams[1 - p.team]) {
      const dd = hyp(o.x - p.x, o.z - p.z);
      const dot = ((o.x - p.x) * (hp.x - p.x) + (o.z - p.z) * (hp.z - p.z)) / ((dd || 1) * (d || 1));
      if (dd < 1.05 && o.y > 0.2 && dot > -0.3 && reachOf(o) >= ry - 0.15) {
        const chance = isHuman(o) ? 0.7 : 0.55;
        if (Math.random() < chance) { blockBall(o, hp); break; }
      }
    }
  }

  function blockBall(o, hp) {
    const dir = hp.dir; // push back out toward the court
    ball.vx = dir * rand(2.5, 5) * (Math.abs(o.x - hp.x) < 3 ? 1 : 0.6);
    ball.vy = rand(0.5, 2.5);
    ball.vz = rand(-2.5, 2.5);
    ball.shot = null; ball.pass = null;
    ball.lastTeam = o.team; ball.ignore = o; ball.ignoreT = 0.35;
    game.stats[o.team].blocks++;
    sfx.block();
    game.shake = Math.max(game.shake, 0.15);
    banner('BLOCKED!', `${o.name} 火鍋！`, TEAMS[o.team].light, 1.2);
  }

  function canDunk(p) {
    const hp = HOOPS[attackHoop(p.team)];
    const d = hyp(hp.x - p.x, hp.z - p.z);
    const front = (p.x - hp.x) * hp.dir > -0.1;
    const fast = p.sprint || hyp(p.vx, p.vz) > 5.6;
    return front && d < (fast ? 3.9 : 2.8);
  }

  function startDunk(p, set = DUNKS) {
    if (ball.holder !== p || p.state !== 'idle' || p.y > 0) return;
    const hi = attackHoop(p.team), hp = HOOPS[hi];
    p.state = 'dunk'; p.stateT = 0; p.vx = p.vz = p.vy = 0;
    const type = pick(set);
    if (set === FANCY_DUNKS) floatText('花式灌籃！', p.x, p.height + 1.2, p.z, '#ff9cf0', 24);
    p.dunk = {
      hp, hi, type, fx: p.x, fz: p.z,
      tx: hp.x + hp.dir * 0.5, tz: hp.z + clamp(p.z - hp.z, -1, 1) * 0.25,
      slammed: false, blockChecked: false,
    };
    p.facing = -hp.dir;
    game.stats[p.team].fga++;
    reactDefenders(p, 2.6, true);
  }

  // timing of a dunk: rise for DUNK_UP seconds, slam on the way up (no pause at the top), then hang
  const DUNK_UP = 0.42, DUNK_SLAM = 0.8, DUNK_HANG = 0.32;
  function updateDunk(p, dt) {
    const D = p.dunk, T = p.stateT, UP = DUNK_UP, HANG = DUNK_HANG;
    if (!D) { p.state = 'air'; return; }
    if (T < UP) {
      const s = T / UP, e = 1 - (1 - s) * (1 - s);
      p.x = D.fx + (D.tx - D.fx) * e;
      p.z = D.fz + (D.tz - D.fz) * e;
      p.y = 1.05 * Math.sin(s * Math.PI / 2);
      if (!D.slammed && s >= DUNK_SLAM && D.blockChecked) slamDunk(p, D);
      if (!D.blockChecked && s > 0.55) {
        D.blockChecked = true;
        for (const o of teams[1 - p.team]) {
          if (hyp(o.x - p.x, o.z - p.z) < 1.25 && o.y > 0.3) {
            const chance = isHuman(o) ? 0.6 : game.demo ? 0.3 : cpuTeam(o.team) ? 0.25 + 0.25 * game.diff : 0.35;
            if (Math.random() < chance) {
              looseBall();
              ball.x = p.x; ball.y = p.y + p.height * 1.15; ball.z = p.z;
              blockBall(o, D.hp);
              banner('REJECTED!', `${o.name} 封阻灌籃！`, TEAMS[o.team].light, 1.4);
              p.state = 'air'; p.vy = -0.5; p.vx = D.hp.dir * 1.5; p.dunk = null;
              return;
            }
          }
        }
      }
    } else if (T < UP + HANG) {
      if (!D.slammed) slamDunk(p, D);
      p.x = D.tx; p.z = D.tz;
      p.y = 1.05 - (T - UP) * 0.25;
    } else {
      p.state = 'air'; p.vy = 0; p.vx = D.hp.dir * 0.8; p.vz = 0; p.dunk = null;
    }
  }

  function slamDunk(p, D) {
    D.slammed = true;
    // the ball is already just above the rim (see positionHeldBall), so it goes straight down through
    ball.holder = null; ball.state = 'free';
    ball.x = D.hp.x; ball.z = D.hp.z; ball.y = Math.max(ball.y, HOOP_Y + 0.13);
    ball.vx = 0; ball.vz = 0; ball.vy = -7.5;
    ball.shot = { team: p.team, hoop: D.hi, points: 2, shooter: p, dunk: true, scored: false, type: D.type };
    ball.ignore = p; ball.ignoreT = 1.0; ball.lastTeam = p.team; ball.pass = null;
    D.hp.shake = 1; game.shake = 0.4;
    sfx.dunk();
  }

  function passTo(p, r) {
    if (ball.holder !== p || !r || p.state !== 'idle') return;
    const sx = p.x + p.facing * 0.3, sy = 1.35, sz = p.z;
    let t = 0.3;
    for (let i = 0; i < 3; i++) {
      const tx = r.x + r.vx * t, tz = r.z + r.vz * t;
      const d = hyp(tx - sx, tz - sz);
      t = Math.max(0.22, d / (d > 13 ? 15 : 13.5));
    }
    const tx = clamp(r.x + r.vx * t, 0.3, COURT_L - 0.3), tz = clamp(r.z + r.vz * t, 0.3, COURT_W - 0.3);
    ball.holder = null; ball.state = 'free';
    ball.x = sx; ball.y = sy; ball.z = sz;
    ball.vx = (tx - sx) / t; ball.vz = (tz - sz) / t; ball.vy = (1.3 - sy + 0.5 * G * t * t) / t;
    // most passes slip past a defender's fingertips; only some can be picked off by the AI
    ball.pass = { from: p, to: r, risky: Math.random() < 0.35 }; ball.shot = null;
    ball.ignore = p; ball.ignoreT = 0.35; ball.lastTeam = p.team;
    p.facing = Math.sign(tx - p.x) || p.facing;
    p.follow = 0.25;
    sfx.pass();
  }

  // Space: crossover — a hard lateral burst with the ball switching hands; defenders close in front can get shaken
  const CROSS_DUR = 0.28, CROSS_CD = 0.9;
  function crossover(p, ax) {
    if (p.crossCD > 0 || p.state !== 'idle' || p.y > 0 || ball.holder !== p) return;
    const side = Math.abs(ax.z) > 0.25 ? Math.sign(ax.z) : -p.crossSide;
    const dir = HOOPS[attackHoop(p.team)].x > p.x ? 1 : -1;
    p.crossSide = side; p.crossT = CROSS_DUR; p.crossCD = CROSS_CD;
    p.vz = side * 7.2; p.vx = dir * 2.4 + p.vx * 0.3;
    sfx.bounce(0.6);
    let shook = false;
    for (const o of teams[1 - p.team]) {
      const dx = o.x - p.x, dz = o.z - p.z, d = hyp(dx, dz);
      if (d > 2.4 || dx * dir < -0.4 || o.y > 0.3) continue; // only defenders in front, on the ground
      const ch = (isHuman(p) ? 0.65 : 0.45) * (1 - d / 3);
      if (Math.random() < ch) {
        const fall = Math.random() < 0.3;
        o.stunT = fall ? 1.2 : 0.7; o.vx *= 0.2; o.vz = -side * 1.5;
        floatText(fall ? '腳踝斷了！' : '晃過！', o.x, o.height + 0.6, o.z, fall ? '#ff6b6b' : '#ffd54a', fall ? 26 : 22);
        shook = true;
      }
    }
    if (shook) sfx.cheer();
  }

  function trySteal(p) {
    if (p.stealCD > 0 || p.y > 0 || p.state !== 'idle') return;
    p.stealCD = 0.75; p.reachT = 0.25;
    const h = ball.holder;
    if (!h || h.team === p.team || h.state !== 'idle' || h.crossT > 0) return;
    const d = hyp(h.x - p.x, h.z - p.z);
    if (d > 1.3) return;
    p.facing = Math.sign(h.x - p.x) || p.facing;
    const ch = isHuman(p) ? 0.36 : 0.3;
    if (Math.random() < ch) {
      looseBall();
      ball.x = h.x + (p.x - h.x) * 0.4; ball.z = h.z + (p.z - h.z) * 0.4; ball.y = 0.8;
      ball.vx = (p.x - h.x) * 1.5 + rand(-1, 1); ball.vz = (p.z - h.z) * 1.5 + rand(-1, 1); ball.vy = 1.6;
      ball.lastTeam = p.team; ball.ignore = h; ball.ignoreT = 0.5;
      h.stunT = 0.5;
      game.stats[p.team].steals++;
      sfx.steal();
      banner('STEAL!', `${p.name} 抄截成功！`, TEAMS[p.team].light, 1.1);
    }
  }

  function jump(p, v = 4.5) {
    if (p.y > 0 || p.state !== 'idle' || ball.holder === p) return;
    p.vy = v; p.state = 'air'; p.stateT = 0;
  }

  function switchPlayer(team) {
    let best = null, bd = 1e9;
    for (const p of teams[team]) {
      if (p === ctrl[team]) continue;
      const d = hyp(p.x - ball.x, p.z - ball.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) ctrl[team] = best;
  }

  function pickPassTarget(p, ix, iz) {
    const mates = teams[p.team].filter((q) => q !== p);
    if (hyp(ix, iz) > 0.3) {
      let best = null, bs = -2;
      for (const q of mates) {
        const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz) || 1;
        const s = (dx * ix + dz * iz) / (d * hyp(ix, iz));
        if (s > bs) { bs = s; best = q; }
      }
      if (bs > 0.2) return best;
    }
    return bestPassTarget(p, true);
  }

  // =====================================================================
  // Scoring
  // =====================================================================
  function scoreBasket(hi) {
    const hp = HOOPS[hi];
    const team = hi === 1 ? 0 : 1;
    const shot = ball.shot && ball.shot.hoop === hi ? ball.shot : null;
    const pts = shot ? shot.points : 2;
    game.score[team] += pts;
    game.lastScoreTeam = team;
    const st = game.stats[team];
    if (shot) { st.fgm++; if (pts === 3) st.tpm++; if (shot.dunk) st.dunks++; shot.scored = true; }
    else ball.shot = { team, hoop: hi, points: 2, scored: true };
    hp.net = 1;
    ball.vx *= 0.15; ball.vz *= 0.15; ball.vy = Math.min(ball.vy, -1.2);
    game.cheer = 1.6;
    const name = shot && shot.shooter ? shot.shooter.name : TEAMS[team].name;
    floatText(`+${pts}`, hp.x, HOOP_Y + 0.6, hp.z, TEAMS[team].light, 40);
    if (shot && shot.dunk) {
      banner(shot.type.en, `${name} ${shot.type.zh}！+2`, '#ffd54a', 1.8);
      sfx.cheer(true);
    } else if (pts === 3) {
      banner('3 POINTS!', `${name} 三分命中！`, '#5dff7a', 1.6);
      sfx.swish(); sfx.cheer(true);
    } else {
      if (!ball.touchedRim) floatText('SWISH', hp.x, HOOP_Y + 1.1, hp.z, '#fff', 22);
      sfx.swish(); sfx.cheer(false);
    }
    const inTeam = 1 - team;
    game.nextPoss = inTeam;
    const ix = hp.dir > 0 ? 0.35 : COURT_L - 0.35;
    const iz = MID_Z + (Math.random() < 0.5 ? -2.6 : 2.6);
    deadThen(1.35, () => {
      if (game.pendingEnd) endPeriod();
      else doInbound(inTeam, ix, iz);
    });
  }

  // =====================================================================
  // Periods & clocks
  // =====================================================================
  function endPeriod() {
    game.pendingEnd = false;
    sfx.buzzer();
    looseBall();
    if (game.quarter >= 4 && game.score[0] !== game.score[1]) return gameOver();
    const label = game.quarter > 4 ? `延長賽 ${game.quarter - 4}` : `第 ${game.quarter} 節`;
    banner(`${label} 結束`, `${TEAMS[0].name} ${game.score[0]} : ${game.score[1]} ${TEAMS[1].name}`, '#fff', 2.6);
    game.phase = 'break';
    game.phaseT = 2.8;
  }

  function startNextPeriod() {
    game.quarter++;
    const ot = game.quarter > 4;
    game.clock = ot ? Math.max(60, game.quarterLen / 2) : game.quarterLen;
    game.shotClock = 24;
    if (ot) {
      setupJumpBall();
      banner(`延長賽 ${game.quarter - 4}`, '跳球！', '#ffd54a', 1.6);
      for (let t = 0; t < 2; t++) if (game.humans[t]) ctrl[t] = teams[t][2];
      return;
    }
    resetPositions();
    const team = game.quarter % 2 === 0 ? 1 : 0;
    const hp = HOOPS[defendHoop(team)];
    banner(`第 ${game.quarter} 節`, `${TEAMS[team].name}隊發球`, '#fff', 1.5);
    doInbound(team, hp.dir > 0 ? 0.35 : COURT_L - 0.35, MID_Z - 2.5);
    for (let t = 0; t < 2; t++) if (game.humans[t] && t !== team) ctrl[t] = teams[t][0];
  }

  function gameOver() {
    game.phase = 'break';
    game.phaseT = 1e9;
    game.winner = game.score[0] > game.score[1] ? 0 : 1;
    game.cheer = 2.5;
    sfx.cheer(true);
    if (game.demo) { newGame(true); return; }
    game.mode = 'over';
  }

  function clocks(dt) {
    if (game.clock > 0) {
      game.clock -= dt;
      if (game.clock <= 0) {
        game.clock = 0;
        if (ball.shot && ball.state === 'free' && !ball.shot.scored) {
          game.pendingEnd = true; sfx.buzzer();
        } else { endPeriod(); return; }
      }
    }
    if (game.possession >= 0 && !ball.shot && game.clock > 0) {
      game.shotClock -= dt;
      if (game.shotClock <= 0) {
        game.shotClock = 0;
        if (!ball.touchedRim) shotClockViolation();
      }
    }
  }

  // =====================================================================
  // Ball physics
  // =====================================================================
  function collideHoop(hi, prevY) {
    const hp = HOOPS[hi];
    // backboard (plane x = board)
    if (ball.z > 6.6 - BALL_R && ball.z < 8.4 + BALL_R && ball.y > 2.9 - BALL_R && ball.y < 3.95 + BALL_R) {
      const rel = (ball.x - hp.board) * hp.dir;
      if (rel < BALL_R && rel > -0.2) {
        ball.x = hp.board + hp.dir * BALL_R;
        if (ball.vx * hp.dir < 0) {
          if (Math.abs(ball.vx) > 1) sfx.board();
          ball.vx = -ball.vx * 0.6; ball.vy *= 0.9; ball.vz *= 0.9;
        }
      }
    }
    // rim (circle of radius RIM_R at HOOP_Y)
    const dx = ball.x - hp.x, dz = ball.z - hp.z;
    const hd = hyp(dx, dz);
    // nearest point on the rim ring (any point works when the ball is dead centre)
    const ux = hd > 1e-4 ? dx / hd : 1, uz = hd > 1e-4 ? dz / hd : 0;
    const qx = hp.x + ux * RIM_R, qz = hp.z + uz * RIM_R;
    const ex = ball.x - qx, ey = ball.y - HOOP_Y, ez = ball.z - qz;
    const d = hyp(ex, ey, ez);
    const minD = BALL_R + 0.012;
    if (d < minD && d > 1e-6) {
      const nx = ex / d, ny = ey / d, nz = ez / d;
      ball.x = qx + nx * minD; ball.y = HOOP_Y + ny * minD; ball.z = qz + nz * minD;
      const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
      if (vn < 0) {
        const e = 0.55;
        ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; ball.vz -= (1 + e) * vn * nz;
        ball.vx += rand(-0.25, 0.25); ball.vz += rand(-0.25, 0.25);
        if (Math.abs(vn) > 0.8) { sfx.rim(); hp.shake = Math.max(hp.shake, Math.min(0.6, Math.abs(vn) * 0.12)); }
        ball.touchedRim = true;
      }
    }
    // through the hoop?
    if (prevY >= HOOP_Y && ball.y < HOOP_Y && ball.vy < 0 && hd < RIM_R - BALL_R * 0.3) {
      if (!(ball.shot && ball.shot.scored) && game.phase === 'live') scoreBasket(hi);
    }
    // inside the net: damp and centre
    if (ball.y < HOOP_Y && ball.y > HOOP_Y - 0.45 && hd < RIM_R) {
      ball.vx += (hp.x - ball.x) * 0.6; ball.vz += (hp.z - ball.z) * 0.6;
      ball.vx *= 0.9; ball.vz *= 0.9;
    }
  }

  function ballPhysics(dt) {
    const n = 5, h = dt / n;
    for (let i = 0; i < n; i++) {
      ball.vy -= G * h;
      const py = ball.y;
      ball.x += ball.vx * h; ball.y += ball.vy * h; ball.z += ball.vz * h;
      // only test hoops that are close
      for (let hi = 0; hi < 2; hi++) if (Math.abs(ball.x - HOOPS[hi].x) < 1.6) collideHoop(hi, py);
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        if (ball.vy < 0) {
          if (ball.vy < -1.2) sfx.bounce(Math.min(1, -ball.vy / 6));
          ball.vy = -ball.vy * 0.72;
          ball.vx *= 0.86; ball.vz *= 0.86;
          if (ball.vy < 0.5) ball.vy = 0;
          onBallFloor();
        }
      }
    }
    if (ball.y <= BALL_R + 0.001) {
      const f = Math.max(0, 1 - dt * 1.2);
      ball.vx *= f; ball.vz *= f;
    }
    ball.rot += (ball.vx + ball.vz * 0.3) * dt * 4;
  }

  function onBallFloor() {
    if (ball.shot && !ball.shot.scored) ball.shot = null;
    ball.pass = null;
    if (game.pendingEnd && game.phase === 'live') endPeriod();
  }

  function positionHeldBall(dt) {
    const p = ball.holder;
    const f = p.facing;
    if (p.state === 'shoot') {
      ball.x = p.x + f * 0.1; ball.y = p.y + p.height * 1.06; ball.z = p.z + 0.05;
    } else if (p.state === 'dunk' && p.dunk) {
      const s = clamp(p.stateT / (DUNK_UP * DUNK_SLAM), 0, 1);
      const t = p.dunk.type.en;
      let ax = 0.25, ay = 1.12;
      if (t.includes('WIND')) { const a = s * Math.PI * 2; ax = Math.sin(a) * 0.55; ay = 0.75 + 0.45 * (1 - Math.cos(a)) / 2 + 0.1; }
      else if (t.startsWith('TOMA')) { ax = -0.25 + 0.6 * s; ay = 1.25 - 0.1 * s; }
      // hand position, blended toward the top of the rim so the slam has no jump
      const w = clamp((s - 0.45) / 0.55, 0, 1) ** 2;
      const hp = p.dunk.hp;
      ball.x = p.x + f * ax + (hp.x - (p.x + f * ax)) * w;
      ball.y = p.y + p.height * ay + (HOOP_Y + 0.15 - (p.y + p.height * ay)) * w;
      ball.z = p.z + 0.08 + (hp.z - (p.z + 0.08)) * w;
    } else {
      // dribble
      const spd = hyp(p.vx, p.vz);
      p.dribble += dt * (7 + spd * 0.9);
      const handY = 0.85;
      const c = Math.abs(Math.cos(p.dribble));
      const n = Math.floor(p.dribble / Math.PI + 0.5);
      if (n !== ball.dribbleN) {
        ball.dribbleN = n;
        if (Math.abs(ball.x - cam.x) < 10 && net.role !== 'guest') sfx.bounce(isHuman(p) ? 0.45 : 0.2);
      }
      ball.x = p.x + f * 0.38 + p.vx * 0.04;
      ball.z = p.z + 0.14 + (p.crossT > 0 ? p.crossSide * 0.25 * Math.sin(p.crossT / CROSS_DUR * Math.PI) : 0);
      ball.y = BALL_R + (handY - BALL_R) * c;
      ball.rot += spd * dt * 3;
    }
    ball.vx = p.vx; ball.vz = p.vz; ball.vy = 0;
  }

  function updateBall(dt) {
    if (ball.ignoreT > 0) ball.ignoreT -= dt;
    if (game.phase === 'jump' || game.phase === 'break') return;
    if (ball.state === 'held') {
      positionHeldBall(dt);
      const h = ball.holder;
      if (game.phase === 'live' && h.y <= 0 && h.state === 'idle' && h.lockT <= 0 &&
          (h.x < 0 || h.x > COURT_L || h.z < 0 || h.z > COURT_W)) {
        outOfBounds(h.team, h.x, h.z);
      }
      return;
    }
    ballPhysics(dt);
    if (game.phase !== 'live') return;
    const out = ball.x < 0 || ball.x > COURT_L || ball.z < 0 || ball.z > COURT_W;
    const far = ball.x < -2.5 || ball.x > COURT_L + 2.5 || ball.z < -2.5 || ball.z > COURT_W + 2.5;
    if ((out && ball.y < 0.35) || far) {
      if (game.pendingEnd) { endPeriod(); return; }
      outOfBounds(ball.lastTeam, ball.x, ball.z);
      return;
    }
    checkPickups();
  }

  function checkPickups() {
    let best = null, bestD = 1e9;
    for (const p of players) {
      if (p.state === 'dunk' || p.stunT > 0.2) continue;
      if (ball.ignore === p && ball.ignoreT > 0) continue;
      if (ball.shot && ball.shot.sure && !ball.shot.scored) continue; // a sure three can't be touched in flight
      const hd = hyp(ball.x - p.x, ball.z - p.z);
      let r = 0.58;
      if (ball.pass) {
        if (ball.pass.to === p) r = 0.95;
        else if (p.team !== ball.pass.from.team && (isHuman(p) || ball.pass.risky)) r = 0.45;
        else continue;
      }
      else if (!ball.pass && !ball.shot && ball.y < 1.2) r = 0.7;
      if (hd > r || ball.y > reachOf(p)) continue;
      if (ball.shot && !ball.shot.scored) {
        if (ball.vy > 0 && p.team !== ball.shot.team && p.y > 0.1) {
          blockBall(p, HOOPS[ball.shot.hoop]);
          return;
        }
        const hp = HOOPS[ball.shot.hoop];
        if (ball.y > HOOP_Y - 0.3 && hyp(ball.x - hp.x, ball.z - hp.z) < 1.2) continue; // no goaltending grabs
        if (p.team === ball.shot.team && !ball.touchedRim && ball.vy > 0) continue;
      }
      // the intended receiver always wins a tie with a nearby defender
      const score = ball.pass && ball.pass.to === p ? hd - 0.6 : hd;
      if (score < bestD) { bestD = score; best = p; }
    }
    if (!best) return;
    const wasShot = ball.shot, wasPass = ball.pass;
    giveTo(best);
    if (wasPass && wasPass.from.team === best.team) best.catchT = 0.7;
    if (wasPass && wasPass.from.team !== best.team) {
      game.stats[best.team].steals++;
      banner('INTERCEPTED!', `${best.name} 抄截傳球！`, TEAMS[best.team].light, 1.1);
      sfx.steal();
    } else if (wasShot) {
      floatText('籃板', best.x, best.y + best.height + 0.5, best.z, TEAMS[best.team].light, 20);
    }
    if (game.pendingEnd) endPeriod();
  }

  // =====================================================================
  // Player update
  // =====================================================================
  function updatePlayer(p, dt) {
    p.stateT += dt;
    if (p.lockT > 0) p.lockT -= dt;
    if (p.stunT > 0) p.stunT -= dt;
    if (p.stealCD > 0) p.stealCD -= dt;
    if (p.reachT > 0) p.reachT -= dt;
    if (p.crossCD > 0) p.crossCD -= dt;
    if (p.crossT > 0) p.crossT -= dt;
    if (p.follow > 0) p.follow -= dt;
    if (p.jumpAt > 0) {
      p.jumpAt -= dt;
      if (p.jumpAt <= 0) { p.jumpAt = -1; jump(p, 4.4); }
    }
    if (p.state === 'dunk') { updateDunk(p, dt); return; }

    const grounded = p.y <= 0 && p.vy <= 0;
    if (grounded && p.state === 'idle') {
      let wx = p.wantVx, wz = p.wantVz;
      if (p.lockT > 0) { wx = 0; wz = 0; }
      if (p.stunT > 0) { wx *= 0.3; wz *= 0.3; }
      if (p.crossT > 0) { wx = p.vx; wz = p.vz; } // ride out the crossover burst
      const a = 32 * dt;
      p.vx += clamp(wx - p.vx, -a, a);
      p.vz += clamp(wz - p.vz, -a, a);
    } else if (grounded) {
      const f = Math.max(0, 1 - 12 * dt);
      p.vx *= f; p.vz *= f;
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= G * dt; p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0;
        if (p.state === 'shoot' && ball.holder === p) releaseShot(p, 0);
        if (p.state !== 'idle') { p.state = 'idle'; p.stateT = 0; }
      }
    } else if (p.state === 'air' || p.state === 'post') {
      p.state = 'idle';
    }
    p.x = clamp(p.x, -1.5, COURT_L + 1.5);
    p.z = clamp(p.z, -1.2, COURT_W + 1.2);

    if (p.state === 'shoot' && ball.holder === p) {
      const autoT = p.userShot ? SHOT_MAX_T : p.releaseAt;
      if (p.stateT >= autoT) releaseShot(p, qFromT(p.stateT));
    }

    // facing
    if (p.state === 'idle') {
      if (ball.holder === p) {
        const hp = HOOPS[attackHoop(p.team)];
        p.facing = Math.abs(p.vx) > 1.2 ? Math.sign(p.vx) : Math.sign(hp.x - p.x) || 1;
      } else if (Math.abs(p.vx) > 0.6) p.facing = Math.sign(p.vx);
      else if (hyp(p.vx, p.vz) < 0.6) p.facing = Math.sign(ball.x - p.x) || p.facing;
    }
    p.runPhase += hyp(p.vx, p.vz) * dt * 2.4;
  }

  function separate() {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        if (a.state === 'dunk' || b.state === 'dunk') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz);
        const min = 0.62;
        if (d < min) {
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          // the ball handler holds his ground so defenders can't shove him out of bounds
          const wa = ball.holder === a ? 0 : ball.holder === b ? 1 : 0.5;
          const push = min - d;
          a.x -= nx * push * wa; a.z -= nz * push * wa;
          b.x += nx * push * (1 - wa); b.z += nz * push * (1 - wa);
        }
      }
    }
  }

  // =====================================================================
  // AI
  // =====================================================================
  function moveTo(p, tx, tz, sprint, stopR = 0.2) {
    tx = clamp(tx, 0.4, COURT_L - 0.4); tz = clamp(tz, 0.4, COURT_W - 0.4);
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
    p.sprint = sprint;
    if (d < stopR) { p.wantVx = 0; p.wantVz = 0; return; }
    let sp = (sprint ? SPRINT : RUN) * (ball.holder === p ? 0.92 : 1);
    sp *= Math.min(1, d / 0.9);
    p.wantVx = dx / d * sp; p.wantVz = dz / d * sp;
  }

  function nearestOpp(p) {
    let m = 1e9, mo = null;
    for (const o of teams[1 - p.team]) {
      const d = hyp(o.x - p.x, o.z - p.z);
      if (d < m) { m = d; mo = o; }
    }
    return { d: m, o: mo };
  }

  function spotPos(team, i) {
    const hp = HOOPS[attackHoop(team)], s = SPOTS[i];
    return { x: hp.x + hp.dir * Math.cos(s[1]) * s[0], z: hp.z + Math.sin(s[1]) * s[0] };
  }

  function pickSpot(p) {
    const used = new Set(teams[p.team].filter((q) => q !== p).map((q) => q.spot));
    const pref = p.idx === 2 ? [5, 6, 7, 8, 3, 4] : [0, 1, 2, 3, 4, 7, 8];
    const opts = pref.filter((i) => !used.has(i));
    const h = ball.holder;
    const ok = opts.filter((i) => { if (!h) return true; const s = spotPos(p.team, i); return hyp(s.x - h.x, s.z - h.z) > 3; });
    p.spot = pick(ok.length ? ok : opts.length ? opts : [0]);
    p.spotT = rand(2.5, 5.5);
  }

  function predictBall(h) {
    if (ball.y > h) {
      const t = Math.min(1.6, (ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * G * (ball.y - h)))) / G);
      return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t };
    }
    return { x: ball.x + ball.vx * 0.25, z: ball.z + ball.vz * 0.25 };
  }

  function laneBlocked(p, q) {
    const dx = q.x - p.x, dz = q.z - p.z, L = hyp(dx, dz) || 1;
    for (const o of teams[1 - p.team]) {
      const t = clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / (L * L), 0, 1);
      const cx = p.x + dx * t, cz = p.z + dz * t;
      if (t > 0.08 && t < 0.95 && hyp(o.x - cx, o.z - cz) < 1.0) return true;
    }
    return false;
  }

  function bestPassTarget(p, any) {
    const hp = HOOPS[attackHoop(p.team)];
    const myD = hyp(hp.x - p.x, hp.z - p.z);
    let best = null, bs = -1e9;
    for (const q of teams[p.team]) {
      if (q === p || q.state !== 'idle') continue;
      const open = Math.min(4, nearestOpp(q).d);
      const qd = hyp(hp.x - q.x, hp.z - q.z);
      let s = open + (myD - qd) * 0.15;
      if (laneBlocked(p, q)) s -= 3;
      if (qd < 3 && open > 1.5) s += 1.5;
      if (s > bs) { bs = s; best = q; }
    }
    if (any) return best;
    return bs > 2.0 ? best : null;
  }

  function aiShoot(p) { startShot(p); }

  function aiHolder(p, dt) {
    const hp = HOOPS[attackHoop(p.team)];
    const d = hyp(hp.x - p.x, hp.z - p.z);
    const no = nearestOpp(p);
    const front = (p.x - hp.x) * hp.dir > -0.1;
    const three = d >= THREE_R || Math.abs(p.z - MID_Z) >= CORNER_Z;
    p.aiT -= dt; p.planT += dt;
    if (p.catchT > 0) {
      p.catchT -= dt;
      // catch-and-shoot from behind the arc when there's room
      if (three && d < 8.6 && no.d > 1.3 && p.lockT <= 0 && p.state === 'idle' && p.y === 0 && game.phase === 'live') {
        p.catchT = 0;
        if (Math.random() < 0.6) return aiShoot(p);
      }
    }
    if (p.plan === 'three' && p.planT > 3.5) p.plan = 'drive';

    if (p.lockT <= 0 && p.aiT <= 0 && p.y === 0 && p.state === 'idle' && game.phase === 'live') {
      p.aiT = rand(0.18, 0.34);
      const sc = game.shotClock;
      if (front && d < 2.9 && Math.random() < 0.8) return startDunk(p);
      if (front && d < 4.0 && no.d > 1.1 && Math.random() < 0.3) return aiShoot(p);
      if (three && d < 8.4 && no.d > (p.plan === 'three' ? 1.15 : 1.8) && Math.random() < (p.plan === 'three' ? 0.5 : 0.2)) return aiShoot(p);
      if (!three && d > 3.5 && no.d > 1.7 && Math.random() < 0.18) return aiShoot(p);
      if ((sc < 2.2 || (game.clock > 0 && game.clock < 2.2)) && d < 15) return aiShoot(p);
      if (Math.random() < (d > 14 ? 0.05 : 0.17)) {
        const r = bestPassTarget(p, false);
        if (r) return passTo(p, r);
      }
    }
    // movement
    let tx, tz, sprint = d > 11;
    if (p.plan === 'three' && d > 6.0) {
      const ang = clamp(Math.atan2(p.z - hp.z, (p.x - hp.x) * hp.dir), -1.3, 1.3);
      tx = hp.x + hp.dir * Math.cos(ang) * 7.3; tz = hp.z + Math.sin(ang) * 7.3;
    } else {
      tx = hp.x + hp.dir * 1.2; tz = hp.z + (p.z - hp.z) * 0.3;
      sprint = sprint || d < 6;
    }
    if (no.o && no.d < 1.8) {
      const fx = tx - p.x, fz = tz - p.z, fd = hyp(fx, fz) || 1;
      const dot = (fx * (no.o.x - p.x) + fz * (no.o.z - p.z)) / (fd * (no.d || 1));
      if (dot > 0.35) { tx = p.x + fx / fd * 1.5 - (fz / fd) * p.driveSide * 2.5; tz = p.z + fz / fd * 1.5 + (fx / fd) * p.driveSide * 2.5; sprint = true; }
    }
    if (Math.random() < dt * 0.35) p.driveSide *= -1;
    moveTo(p, tx, tz, sprint, 0.3);
  }

  function aiOffBall(p, dt) {
    const hp = HOOPS[attackHoop(p.team)];
    p.spotT -= dt;
    if (p.cutT > 0) {
      p.cutT -= dt;
      moveTo(p, hp.x + hp.dir * 1.3, hp.z + (p.idx === 1 ? -0.9 : 0.9), true, 0.25);
      if (p.cutT <= 0) pickSpot(p);
      return;
    }
    if (p.spotT <= 0) pickSpot(p);
    let s = spotPos(p.team, p.spot);
    const h = ball.holder;
    if (h && h !== p && hyp(s.x - h.x, s.z - h.z) < 2.6) { pickSpot(p); s = spotPos(p.team, p.spot); }
    const dist = hyp(s.x - p.x, s.z - p.z);
    if (h && h.team === p.team && dist < 1 && Math.random() < dt * 0.12) p.cutT = 1.5;
    moveTo(p, s.x, s.z, dist > 4.5, 0.3);
  }

  function aiDefense(p, dt) {
    const myHoop = HOOPS[defendHoop(p.team)];
    const man = teams[1 - p.team][p.idx];
    const h = ball.holder;
    const onBall = h === man;
    const gap = onBall ? 1.0 : 1.8;
    const dx = myHoop.x - man.x, dz = myHoop.z - man.z, dd = hyp(dx, dz) || 1;
    const g = Math.min(gap, dd * 0.5);
    let tx = man.x + dx / dd * g, tz = man.z + dz / dd * g;
    if (!onBall && h) { tx += (h.x - tx) * 0.18; tz += (h.z - tz) * 0.18; }
    // reaction lag
    const lag = game.demo ? 4 : cpuTeam(p.team) ? DIFFS[game.diff].lag : 4;
    const k = Math.min(1, dt * lag);
    p.tx += (tx - p.tx) * k; p.tz += (tz - p.tz) * k;
    if (hyp(p.tx - tx, p.tz - tz) > 4) { p.tx = tx; p.tz = tz; }
    const dist = hyp(p.tx - p.x, p.tz - p.z);
    moveTo(p, p.tx, p.tz, dist > 2.0, 0.15);
    if (onBall && hyp(man.x - p.x, man.z - p.z) < 1.2 && game.phase === 'live') {
      const rate = game.demo ? 0.22 : cpuTeam(p.team) ? DIFFS[game.diff].steal : 0.22;
      if (Math.random() < dt * rate) trySteal(p);
    }
  }

  function aiLoose(p, dt) {
    const pr = predictBall(2.0);
    moveTo(p, pr.x, pr.z, true, 0.05);
    if (p.y === 0 && p.state === 'idle' && hyp(ball.x - p.x, ball.z - p.z) < 1.1 &&
        ball.y > p.height * 1.15 && ball.y < reachOf(p) + 1.1 && ball.vy < 2 && Math.random() < dt * 8) {
      jump(p, 4.4);
    }
  }

  function computeChasers() {
    chasers[0] = chasers[1] = null;
    if (ball.state !== 'free' || game.phase !== 'live') return;
    const pr = predictBall(2.0);
    for (let t = 0; t < 2; t++) {
      if (ball.pass && ball.pass.from.team === t) continue;
      if (ball.shot && ball.shot.team !== t && ball.vy > 0) {
        // defending team: still chase if close to the rim area later
      }
      let best = null, bd = 1e9;
      for (const p of teams[t]) {
        if (p.state === 'dunk') continue;
        const d = hyp(p.x - pr.x, p.z - pr.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (ball.pass && bd > 2.5) continue; // only intercept if really close
      chasers[t] = best;
    }
  }

  function ai(p, dt) {
    if (p.state !== 'idle' || p.y > 0) return;
    if (game.phase === 'jump' || game.phase === 'break') { p.wantVx = p.wantVz = 0; return; }
    const h = ball.holder;
    if (h === p) return aiHolder(p, dt);
    if (ball.state === 'free' && game.phase === 'live') {
      if (ball.pass && ball.pass.to === p) {
        const pr = predictBall(1.3);
        moveTo(p, pr.x, pr.z, false, 0.1);
        return;
      }
      if (chasers[p.team] === p) return aiLoose(p, dt);
      const off = ball.lastTeam >= 0 ? ball.lastTeam : game.possession;
      return p.team === off ? aiOffBall(p, dt) : aiDefense(p, dt);
    }
    if (h) return h.team === p.team ? aiOffBall(p, dt) : aiDefense(p, dt);
    // dead ball: get into transition
    return p.team === game.nextPoss ? aiOffBall(p, dt) : aiDefense(p, dt);
  }

  // =====================================================================
  // User control
  // =====================================================================
  function handleUser(t, inp) {
    const p = ctrl[t];
    if (!p) return;
    const ax = inp.axis();
    const hasBall = ball.holder === p;
    const sprint = inp.isDown('sprint');
    const sp = (sprint ? SPRINT : RUN) * (hasBall ? 0.92 : 1);
    p.wantVx = ax.x * sp; p.wantVz = ax.z * sp;
    p.sprint = sprint && ax.m > 0.1;
    if (game.phase === 'jump') {
      p.wantVx = p.wantVz = 0;
      return;
    }
    if (game.phase === 'break') { p.wantVx = p.wantVz = 0; return; }

    // D: shoot / dunk with the ball, steal on defence
    if (inp.hit('shoot')) {
      if (hasBall && p.state === 'idle' && p.y === 0) {
        if (canDunk(p)) startDunk(p, POWER_DUNKS); else startShot(p);
      } else if (!hasBall && ball.holder && ball.holder.team !== p.team) trySteal(p);
    }
    // S: fancy dunk (only close enough to the rim)
    if (inp.hit('fancy') && hasBall && p.state === 'idle' && p.y === 0) {
      if (canDunk(p)) startDunk(p, FANCY_DUNKS);
      else if (isHuman(p)) floatText('靠近籃框才能花式灌籃', p.x, p.height + 0.9, p.z, '#c9d3ea', 16);
    }
    // Space: crossover
    if (inp.hit('cross') && hasBall) crossover(p, ax);
    // W: jump for rebounds and blocks
    if (inp.hit('jump') && !hasBall) jump(p, 4.5);
    if (inp.up('shoot')) {
      // an online player's release is judged by how long they held the key on their own machine
      const held = inp === remoteInput && inp.held != null ? inp.held : p.stateT;
      if (inp === remoteInput) inp.held = null;
      if (hasBall && p.state === 'shoot') releaseShot(p, qFromT(held));
    }
    // Z: pass with the ball, otherwise switch to the man nearest the ball
    if (inp.hit('pass')) {
      if (hasBall && p.state === 'idle') passTo(p, pickPassTarget(p, ax.x, ax.z));
      else if (!(ball.holder && ball.holder.team === t)) switchPlayer(t);
    }
  }

  // =====================================================================
  // Main simulation step
  // =====================================================================
  function simulate(dt) {
    game.time += dt;
    if (game.phase === 'jump') {
      game.phaseT -= dt;
      if (game.phaseT <= 0) {
        game.phase = 'live';
        ball.vy = 6.2; ball.y = 1.9;
        sfx.whistle();
      }
    } else if (game.phase === 'dead') {
      game.phaseT -= dt;
      if (game.phaseT <= 0) { game.phase = 'live'; const fn = game.afterFn; game.afterFn = null; if (fn) fn(); }
    } else if (game.phase === 'break') {
      game.phaseT -= dt;
      if (game.phaseT <= 0) startNextPeriod();
    }

    if (game.phase === 'live') { clocks(dt); if (!game.demo) game.playTime += dt; }

    computeChasers();
    if (game.mode === 'play') {
      for (let t = 0; t < 2; t++) if (ctrl[t]) handleUser(t, t === game.localTeam ? input : remoteInput);
    }
    for (const p of players) if (!isHuman(p)) ai(p, dt);
    if (game.phase !== 'jump' && game.phase !== 'break') {
      for (const p of players) updatePlayer(p, dt);
      separate();
    }
    updateBall(dt);

    for (const hp of HOOPS) { hp.shake = Math.max(0, hp.shake - dt * 1.6); hp.net = Math.max(0, hp.net - dt * 1.5); }
  }

  function updateCamera(dt) {
    let tx = ball.x;
    if (ball.holder) tx = ball.holder.x + ball.holder.facing * 1.5;
    cam.x += (tx - cam.x) * Math.min(1, dt * 3);
    cam.x = clamp(cam.x, 7.6, COURT_L - 7.6);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      const m = game.shake * 24;
      cam.sx = rand(-m, m); cam.sy = rand(-m, m);
    } else { cam.sx = cam.sy = 0; }
  }

  // =====================================================================
  // Menu
  // =====================================================================
  const menuButtons = [];
  function menuInput() {
    if (lobbyOpen()) return;
    if (input.hit('left')) { game.diff = (game.diff + 2) % 3; sfx.click(); }
    if (input.hit('right')) { game.diff = (game.diff + 1) % 3; sfx.click(); }
    if (input.hit('up')) { game.qIdx = (game.qIdx + 1) % QUARTER_OPTS.length; sfx.click(); }
    if (input.hit('down')) { game.qIdx = (game.qIdx + QUARTER_OPTS.length - 1) % QUARTER_OPTS.length; sfx.click(); }
    if (input.hit('start') || (input.hit('shoot') && !input.touch)) { sfx.click(); startGame(); }
  }
  function startGame() {
    newGame(false);
    input.endFrame();
  }

  // =====================================================================
  // Network (online 1v1 over WebRTC via PeerJS)
  //  - the host runs the whole simulation and controls 烈焰 (team 0)
  //  - the guest controls 浪潮 (team 1): it sends its keys and renders the host's snapshots
  // =====================================================================
  const ROOM_PREFIX = 'fcslam-v1-';
  const STATES = ['idle', 'shoot', 'post', 'dunk', 'air'];
  const r2 = (v) => Math.round(v * 100) / 100;
  const $ = (id) => document.getElementById(id);
  const lobbyOpen = () => !$('lobby').hidden;

  function peerOptions() {
    // optional self-hosted signalling server: ?peerhost=example.com&peerport=443&peerpath=/&peersecure=1
    const q = new URLSearchParams(location.search);
    const o = { debug: 0 };
    if (q.get('peerhost')) {
      o.host = q.get('peerhost');
      o.port = Number(q.get('peerport')) || 9000;
      o.path = q.get('peerpath') || '/';
      o.secure = q.get('peersecure') === '1';
    }
    return o;
  }
  function loadPeerJS() {
    return new Promise((resolve, reject) => {
      if (window.Peer) return resolve();
      const sc = document.createElement('script');
      sc.src = 'vendor/peerjs.min.js';
      sc.onload = () => (window.Peer ? resolve() : reject(new Error('無法載入連線元件')));
      sc.onerror = () => reject(new Error('無法載入連線元件'));
      document.head.appendChild(sc);
    });
  }
  function randomCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 5; i++) c += A[(Math.random() * A.length) | 0];
    return c;
  }
  function peerErr(e) {
    if (e.type === 'peer-unavailable') return '找不到這個房間，請確認代碼是否正確';
    if (e.type === 'browser-incompatible') return '這個瀏覽器不支援連線對戰';
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) return '連不上連線伺服器，請檢查網路後重試';
    return `連線錯誤（${e.type || e.message}）`;
  }

  function showLobby(kind) {
    $('lobby').hidden = false;
    $('lobbyHost').hidden = kind !== 'host';
    $('lobbyJoin').hidden = kind !== 'join';
    setStatus('');
  }
  function hideLobby() { $('lobby').hidden = true; }
  function setStatus(text, err) {
    const el = $('lobbyStatus');
    el.textContent = text;
    el.classList.toggle('err', !!err);
  }

  function leaveNet() {
    const c = net.conn, p = net.peer;
    micOff(true);
    remoteVoiceOff();
    net.role = null; net.conn = null; net.peer = null; net.sfxQ.length = 0;
    resetChat();
    try { if (c && c.open) c.send({ t: 'bye' }); } catch (e) { /* ignore */ }
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
    remoteInput.reset();
  }
  function leaveToMenu(text) {
    leaveNet();
    hideLobby();
    newGame(true);
    if (text) banner(text, '', '#ffb14a', 2.5);
  }

  function wireConn(conn, onOpen) {
    conn.on('open', () => { if (net.conn === conn) onOpen(); });
    conn.on('data', (m) => { if (net.conn === conn) onNetData(m); });
    conn.on('close', () => { if (net.conn === conn) onNetClose(); });
    conn.on('error', () => { if (net.conn === conn) onNetClose(); });
  }

  async function hostRoom() {
    leaveNet();
    showLobby('host');
    $('roomCode').textContent = '·····';
    $('roomLink').value = '';
    setStatus('建立房間中…');
    try { await loadPeerJS(); } catch (e) { setStatus(e.message, true); return; }
    if (lobbyOpen() === false) return;
    const code = randomCode();
    const peer = new window.Peer(ROOM_PREFIX + code, peerOptions());
    net.peer = peer; net.role = 'host-wait'; net.code = code;
    peer.on('call', onIncomingCall);
    peer.on('open', () => {
      if (net.peer !== peer) return;
      $('roomCode').textContent = code;
      const u = new URL(location.href);
      u.hash = ''; u.searchParams.set('room', code);
      $('roomLink').value = u.toString();
      setStatus('等待對手加入…（對方打開連結或輸入代碼即可）');
    });
    peer.on('connection', (conn) => {
      if (net.peer !== peer) return;
      if (net.conn) { // room already taken
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); });
        return;
      }
      net.conn = conn;
      wireConn(conn, () => { hideLobby(); startOnline('host'); });
    });
    peer.on('error', (e) => {
      if (net.peer !== peer) return;
      if (e.type === 'unavailable-id') { hostRoom(); return; } // code clash: pick another
      if (net.role === 'host') return; // mid-game signalling hiccups don't matter once connected
      setStatus(peerErr(e), true);
    });
  }

  function openJoin(code, auto) {
    leaveNet();
    showLobby('join');
    $('joinCode').value = code || '';
    if (auto) doJoin(); else setTimeout(() => $('joinCode').focus(), 50);
  }

  async function doJoin() {
    const code = $('joinCode').value.trim().toUpperCase();
    $('joinCode').value = code;
    if (!/^[A-Z0-9]{5}$/.test(code)) { setStatus('請輸入 5 碼房間代碼', true); return; }
    leaveNet();
    setStatus('連線中…');
    try { await loadPeerJS(); } catch (e) { setStatus(e.message, true); return; }
    const peer = new window.Peer(peerOptions());
    net.peer = peer; net.role = 'guest-wait';
    peer.on('call', onIncomingCall);
    peer.on('open', () => {
      if (net.peer !== peer) return;
      const conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
      net.conn = conn;
      wireConn(conn, () => { hideLobby(); startOnline('guest'); });
    });
    peer.on('error', (e) => {
      if (net.peer !== peer || net.role === 'guest') return;
      setStatus(peerErr(e), true);
    });
    setTimeout(() => {
      if (net.peer === peer && net.role === 'guest-wait') setStatus('連線逾時，請確認代碼或網路後重試', true);
    }, 15000);
  }

  function startOnline(role) {
    net.role = role;
    net.lastRecv = performance.now();
    net.sendT = 0; net.sfxQ.length = 0; net.bannerId = -1;
    remoteInput.reset();
    newGame(false, { humans: [true, true], localTeam: role === 'host' ? 0 : 1, online: true });
    for (const p of players) p.nx = null;
    $('chat').classList.remove('hidden');
    banner('連線成功！', role === 'host' ? '你是 烈焰隊（紅）· 跳球開始' : '你是 浪潮隊（藍）· 跳球開始', '#5dff7a', 2);
    input.endFrame();
  }

  function onNetData(m) {
    net.lastRecv = performance.now();
    if (!m || typeof m !== 'object') return;
    if (m.t === 'i' && net.role === 'host') applyRemoteInput(m);
    else if (m.t === 's' && net.role === 'guest') applySnapshot(m);
    else if (m.t === 'chat' && (net.role === 'host' || net.role === 'guest')) recvChat(m);
    else if (m.t === 'voice' && (net.role === 'host' || net.role === 'guest')) {
      if (m.on) addSys('對手開啟了麥克風 🎤');
      else { remoteVoiceOff(); addSys('對手關閉了麥克風'); }
    }
    else if (m.t === 'full') leaveToMenu('房間已滿');
    else if (m.t === 'bye') onNetClose();
  }

  function onNetClose() {
    const role = net.role;
    if (!role) return;
    leaveNet();
    if (role === 'host' && game.online) {
      // keep playing: the CPU takes over the opponent's team
      game.online = false; game.humans[1] = false; ctrl[1] = null;
      if (game.mode === 'play') banner('對手已離線', '由電腦接手浪潮隊', '#ffb14a', 2.4);
      else if (game.mode === 'over') newGame(true);
    } else if (role === 'guest') {
      leaveToMenu('與主機的連線中斷');
    } else {
      setStatus('連線中斷，請重試', true);
    }
  }

  function applyRemoteInput(m) {
    remoteInput.ax = clamp(Number(m.x) || 0, -1, 1);
    remoteInput.az = clamp(Number(m.z) || 0, -1, 1);
    remoteInput.down = new Set((Array.isArray(m.d) ? m.d : []).filter((a) => NET_ACTS.has(a)));
    for (const a of Array.isArray(m.p) ? m.p : []) if (NET_ACTS.has(a)) remoteInput.pressed.add(a);
    for (const a of Array.isArray(m.r) ? m.r : []) if (NET_ACTS.has(a)) remoteInput.released.add(a);
    if (typeof m.h === 'number' && isFinite(m.h)) remoteInput.held = clamp(m.h, 0, 5);
  }

  function makeSnapshot() {
    return {
      t: 's',
      g: [game.mode, game.score[0], game.score[1], game.quarter, r2(game.clock), r2(game.shotClock),
        game.possession, game.phase, r2(game.cheer), r2(game.shake), game.winner, game.lastScoreTeam],
      st: game.stats,
      bid: game.bannerId,
      bn: game.banner ? { text: game.banner.text, sub: game.banner.sub, color: game.banner.color, t: r2(game.banner.t), dur: game.banner.dur } : null,
      tx: game.texts.map((t) => [t.text, r2(t.x), r2(t.y), r2(t.z), t.color, t.size, r2(t.t)]),
      p: players.map((p) => [r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vz), p.facing, STATES.indexOf(p.state),
        r2(p.stateT), r2(p.runPhase), r2(p.follow), r2(p.reachT), p.dunk ? DUNKS.indexOf(p.dunk.type) : -1, p.userShot ? 1 : 0]),
      b: [r2(ball.x), r2(ball.y), r2(ball.z), r2(ball.rot), ball.holder ? players.indexOf(ball.holder) : -1],
      h: [r2(HOOPS[0].shake), r2(HOOPS[0].net), r2(HOOPS[1].shake), r2(HOOPS[1].net)],
      c: ctrl.map((p) => (p ? players.indexOf(p) : -1)),
      sx: net.sfxQ.splice(0),
    };
  }

  function applySnapshot(m) {
    try {
      const g = m.g;
      game.mode = g[0] === 'over' ? 'over' : 'play';
      game.score = [Number(g[1]) || 0, Number(g[2]) || 0];
      game.quarter = g[3]; game.clock = g[4]; game.shotClock = g[5]; game.possession = g[6];
      game.phase = g[7]; game.cheer = g[8]; game.shake = Math.max(game.shake, g[9]); game.winner = g[10];
      game.lastScoreTeam = g[11] === 0 || g[11] === 1 ? g[11] : -1;
      if (m.st) game.stats = m.st;
      if (m.bid !== net.bannerId) { net.bannerId = m.bid; game.banner = m.bn; }
      game.texts = (m.tx || []).map((a) => ({ text: String(a[0]), x: a[1], y: a[2], z: a[3], color: a[4], size: a[5], t: a[6] }));
      (m.p || []).forEach((a, i) => {
        const p = players[i];
        if (!p) return;
        p.nx = a[0]; p.ny = a[1]; p.nz = a[2]; p.vx = a[3]; p.vz = a[4]; p.facing = a[5] < 0 ? -1 : 1;
        p.state = STATES[a[6]] || 'idle'; p.stateT = a[7]; p.runPhase = a[8]; p.follow = a[9]; p.reachT = a[10];
        p.dunk = a[11] >= 0 && DUNKS[a[11]] ? { type: DUNKS[a[11]], hp: HOOPS[attackHoop(p.team)] } : null;
        p.userShot = !!a[12];
      });
      const b = m.b;
      ball.nx = b[0]; ball.ny = b[1]; ball.nz = b[2]; ball.rot = b[3];
      ball.holder = b[4] >= 0 ? players[b[4]] || null : null;
      ball.state = ball.holder ? 'held' : 'free';
      HOOPS[0].shake = m.h[0]; HOOPS[0].net = m.h[1]; HOOPS[1].shake = m.h[2]; HOOPS[1].net = m.h[3];
      ctrl[0] = m.c[0] >= 0 ? players[m.c[0]] || null : null;
      ctrl[1] = m.c[1] >= 0 ? players[m.c[1]] || null : null;
      for (const [k, ...args] of m.sx || []) if (SFX_FX.includes(k)) sfxRaw[k](...args);
    } catch (e) { /* ignore a malformed snapshot */ }
  }

  function sendGuestInput() {
    const ax = input.axis();
    const down = [...input.down];
    if (input.touchSprinting() && !down.includes('sprint')) down.push('sprint');
    const msg = { t: 'i', x: r2(ax.x), z: r2(ax.z), d: down, p: [...input.pressed], r: [...input.released] };
    if (input.released.has('shoot') && input.held != null) msg.h = Math.round(input.held * 1000) / 1000;
    try { net.conn.send(msg); } catch (e) { /* connection closing */ }
  }

  function guestTick(dt) {
    if (input.hit('pause') && (game.mode === 'over' || window.confirm('離開連線對戰？'))) { leaveToMenu(); return; }
    game.time += dt;
    if (game.mode === 'play') game.playTime += dt;
    const k = 1 - Math.exp(-dt * 18);
    for (const p of players) {
      if (p.nx == null) continue;
      if (hyp(p.nx - p.x, p.nz - p.z) > 3) { p.x = p.nx; p.y = p.ny; p.z = p.nz; }
      else { p.x += (p.nx - p.x) * k; p.y += (p.ny - p.y) * k; p.z += (p.nz - p.z) * k; }
    }
    if (ball.holder) positionHeldBall(dt); // dribbling animates locally for smoothness
    else if (ball.nx != null) {
      const kb = 1 - Math.exp(-dt * 28);
      if (hyp(ball.nx - ball.x, ball.ny - ball.y, ball.nz - ball.z) > 2.5) { ball.x = ball.nx; ball.y = ball.ny; ball.z = ball.nz; }
      else { ball.x += (ball.nx - ball.x) * kb; ball.y += (ball.ny - ball.y) * kb; ball.z += (ball.nz - ball.z) * kb; }
    }
    if (net.conn && net.conn.open) sendGuestInput();
    if (input.released.has('shoot')) input.held = null;
    if (performance.now() - net.lastRecv > 10000) onNetClose();
  }

  function hostNetTick(dt) {
    remoteInput.endFrame();
    net.sendT += dt;
    if (net.sendT >= 1 / 30 && net.conn && net.conn.open) {
      net.sendT = 0;
      try { net.conn.send(makeSnapshot()); } catch (e) { /* connection closing */ }
    }
    if (performance.now() - net.lastRecv > 10000) onNetClose();
  }

  // ---------------------------------------------------------------------
  // Chat (online only) — same design as the tennis game: a bar at the bottom,
  // Enter / tap to type, quick replies, fading log and a speech bubble over your player
  // ---------------------------------------------------------------------
  const chatEl = $('chat'), chatLog = $('chatLog'), chatIn = $('chatIn');
  const bubbles = [null, null];
  let chatAt = 0;
  const canChat = () => !!((net.role === 'host' || net.role === 'guest') && net.conn && net.conn.open);
  const cleanChat = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  function chatOpen(on) {
    if (on && !canChat()) return;
    chatEl.classList.toggle('open', on);
    if (on) {
      // let go of every key so your player stops while you type
      for (const a of [...input.down]) input.release(a);
      input.sprintToggle = false;
      const sb = document.querySelector('[data-act=sprint]');
      if (sb) sb.classList.remove('on');
      chatIn.focus();
    } else chatIn.blur();
  }
  chatIn.addEventListener('focus', () => { if (canChat()) chatOpen(true); else chatIn.blur(); });
  chatIn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== chatIn) chatEl.classList.remove('open'); }, 200));
  chatIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendChat(chatIn.value); chatOpen(false); }
    else if (e.key === 'Escape') { e.preventDefault(); chatOpen(false); }
  });
  // tapping a quick reply / send shouldn't blur the input first
  $('chatBar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  $('chatSend').addEventListener('click', () => { sendChat(chatIn.value); chatOpen(false); });
  $('chatQuick').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { sendChat(b.textContent); chatOpen(false); }
  });
  function addChat(team, text) {
    const d = document.createElement('div');
    d.className = 'm';
    const n = document.createElement('b');
    n.textContent = (team === game.localTeam ? '你' : '對手') + '：';
    n.style.color = TEAMS[team].light;
    d.append(n, document.createTextNode(text));
    chatLog.append(d);
    while (chatLog.children.length > 6) chatLog.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 8000);
    bubbles[team] = { text: text.length > 16 ? text.slice(0, 15) + '…' : text, until: performance.now() + 4500 };
  }
  function sendChat(text) {
    text = cleanChat(text);
    chatIn.value = '';
    const now = performance.now();
    if (!text || !canChat() || now - chatAt < 400) return;
    chatAt = now;
    try { net.conn.send({ t: 'chat', m: text }); } catch (e) { return; }
    addChat(game.localTeam, text);
  }
  function recvChat(m) {
    const text = cleanChat(m.m);
    if (!text) return;
    addChat(1 - game.localTeam, text);
    sfx.chat();
  }
  function resetChat() {
    chatEl.classList.remove('open');
    chatEl.classList.add('hidden');
    if (document.activeElement === chatIn) chatIn.blur();
    chatLog.textContent = '';
    bubbles[0] = bubbles[1] = null;
  }

  function addSys(text) {
    const d = document.createElement('div');
    d.className = 'm sys';
    d.textContent = text;
    chatLog.append(d);
    while (chatLog.children.length > 6) chatLog.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 8000);
  }

  // ---------------------------------------------------------------------
  // Voice chat (online only): 🎤 turns your mic on/off, 🔊 mutes the opponent
  // ---------------------------------------------------------------------
  const micBtn = $('micBtn'), spkBtn = $('spkBtn'), voiceOut = $('voiceOut');
  function updateVoiceUI() {
    micBtn.classList.toggle('on', voice.on);
    micBtn.classList.toggle('wait', voice.busy);
    micBtn.title = voice.on ? '關閉麥克風' : '開啟麥克風和對手講話';
    spkBtn.hidden = !voice.remoteOn;
    spkBtn.textContent = voice.remoteMuted ? '🔇' : '🔊';
    spkBtn.classList.toggle('off', voice.remoteMuted);
    spkBtn.title = voice.remoteMuted ? '打開對手的聲音' : '把對手靜音';
  }
  function voiceCtx() {
    if (!voice.ctx) {
      try { voice.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      voice.buf = new Uint8Array(512);
    }
    if (voice.ctx.state === 'suspended') voice.ctx.resume();
    return voice.ctx;
  }
  // a quiet analyser per side so we can show who is talking (never routed to the speakers)
  function watchLevel(team, stream) {
    unwatchLevel(team);
    const c = voiceCtx();
    if (!c) return;
    try {
      const src = c.createMediaStreamSource(stream), an = c.createAnalyser();
      an.fftSize = 512; src.connect(an);
      voice.src[team] = src; voice.an[team] = an;
    } catch (e) { /* level meter is optional */ }
  }
  function unwatchLevel(team) {
    try { if (voice.src[team]) voice.src[team].disconnect(); } catch (e) { /* ignore */ }
    voice.src[team] = voice.an[team] = null; voice.level[team] = 0;
  }
  function updateVoiceLevels(dt) {
    for (let t = 0; t < 2; t++) {
      const an = voice.an[t];
      if (!an) { voice.level[t] = 0; continue; }
      an.getByteTimeDomainData(voice.buf);
      let sum = 0;
      for (let i = 0; i < voice.buf.length; i++) { const v = (voice.buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / voice.buf.length);
      voice.level[t] = Math.max(rms, voice.level[t] - dt * 0.25);
    }
  }
  const isTalking = (t) => voice.level[t] > 0.035 && !(t !== game.localTeam && voice.remoteMuted);

  async function micToggle() {
    if (voice.busy) return;
    if (voice.on) { micOff(); return; }
    if (!canChat()) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { addSys('這個瀏覽器不支援麥克風（需要 https）'); return; }
    voice.busy = true; updateVoiceUI();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
    } catch (e) {
      voice.busy = false; updateVoiceUI();
      addSys(e.name === 'NotAllowedError' ? '沒有麥克風權限：請在瀏覽器網址列允許使用麥克風'
        : e.name === 'NotFoundError' ? '找不到麥克風' : '無法開啟麥克風');
      return;
    }
    voice.busy = false;
    if (!canChat() || !net.peer) { stream.getTracks().forEach((tr) => tr.stop()); updateVoiceUI(); return; }
    voice.stream = stream; voice.on = true;
    const call = net.peer.call(net.conn.peer, stream, { metadata: { kind: 'voice' } });
    voice.outCall = call;
    if (call) {
      call.on('close', () => { if (voice.outCall === call) micOff(); });
      call.on('error', () => { if (voice.outCall === call) { micOff(); addSys('語音連線失敗'); } });
    }
    watchLevel(game.localTeam, stream);
    try { net.conn.send({ t: 'voice', on: true }); } catch (e) { /* ignore */ }
    addSys('麥克風已開啟，對手聽得到你 🎤');
    updateVoiceUI();
  }
  function micOff(silent) {
    const call = voice.outCall, stream = voice.stream, wasOn = voice.on;
    voice.outCall = null; voice.stream = null; voice.on = false;
    try { if (call) call.close(); } catch (e) { /* ignore */ }
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    unwatchLevel(game.localTeam);
    if (wasOn && !silent && canChat()) { try { net.conn.send({ t: 'voice', on: false }); } catch (e) { /* ignore */ } }
    if (wasOn && !silent) addSys('麥克風已關閉');
    updateVoiceUI();
  }
  function onIncomingCall(call) {
    if (!net.conn || call.peer !== net.conn.peer) { try { call.close(); } catch (e) { /* ignore */ } return; }
    if (voice.inCall) { try { voice.inCall.close(); } catch (e) { /* ignore */ } }
    voice.inCall = call;
    call.answer(); // receive only — our own mic goes out on a separate call
    call.on('stream', (remote) => {
      if (voice.inCall !== call) return;
      voiceOut.srcObject = remote;
      voiceOut.muted = voice.remoteMuted;
      playVoice();
      watchLevel(1 - game.localTeam, remote);
      voice.remoteOn = true;
      updateVoiceUI();
    });
    call.on('close', () => { if (voice.inCall === call) remoteVoiceOff(); });
  }
  function playVoice() {
    const pr = voiceOut.play();
    if (pr && pr.catch) pr.catch(() => { voice.needPlay = true; addSys('點一下畫面就能聽到對手的聲音'); });
  }
  function remoteVoiceOff() {
    const call = voice.inCall;
    voice.inCall = null;
    try { if (call) call.close(); } catch (e) { /* ignore */ }
    voiceOut.srcObject = null;
    unwatchLevel(1 - game.localTeam);
    voice.remoteOn = false;
    updateVoiceUI();
  }
  micBtn.addEventListener('click', () => { sfx.init(); micToggle(); });
  spkBtn.addEventListener('click', () => {
    voice.remoteMuted = !voice.remoteMuted;
    voiceOut.muted = voice.remoteMuted;
    updateVoiceUI();
  });
  // browsers may block audio until the page is touched: retry on the next tap / key
  const unlockVoice = () => {
    if (voice.ctx && voice.ctx.state === 'suspended') voice.ctx.resume();
    if (voice.needPlay && voiceOut.srcObject) { voice.needPlay = false; playVoice(); }
  };
  window.addEventListener('pointerdown', unlockVoice, true);
  window.addEventListener('keydown', unlockVoice, true);

  // tell the other side right away when this tab closes
  window.addEventListener('pagehide', () => { if (net.role) leaveNet(); });

  // lobby dialog wiring
  $('lobbyCancel').addEventListener('click', () => { leaveNet(); hideLobby(); });
  $('joinBtn').addEventListener('click', () => doJoin());
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  $('copyLink').addEventListener('click', async () => {
    const v = $('roomLink').value;
    if (!v) return;
    try { await navigator.clipboard.writeText(v); setStatus('已複製連結！等待對手加入…'); }
    catch (e) { $('roomLink').select(); document.execCommand && document.execCommand('copy'); setStatus('已複製連結！等待對手加入…'); }
  });

  canvas.addEventListener('pointerdown', (e) => {
    sfx.init();
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const vx = ((e.clientX - r.left) * dpr - offX) / fit, vy = ((e.clientY - r.top) * dpr - offY) / fit;
    if (game.mode === 'menu') {
      for (const b of menuButtons) {
        if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) { sfx.click(); b.fn(); return; }
      }
    } else if (game.mode === 'over') {
      if (!game.online && !net.role) newGame(true);
    } else if (game.mode === 'paused') {
      game.mode = 'play';
    }
  });

  // =====================================================================
  // Rendering
  // =====================================================================
  const FONT = '"Segoe UI","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
  const font = (px, w = 700) => `${w} ${px}px ${FONT}`;

  const fans = [];
  (() => {
    const shirts = ['#e8452c', '#2b7de9', '#f2f2f2', '#222', '#ffd54a', '#7b3fe4', '#3ec46d', '#ff8a3d'];
    const skins = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac', '#e0ac69'];
    for (let r = 0; r < 7; r++) {
      for (let i = 0; i < 104; i++) {
        fans.push({
          r, x: i * 0.55 + (r % 2) * 0.27 + rand(-0.12, 0.12), c: pick(shirts), skin: pick(skins),
          ph: rand(0, 6.28), sz: rand(0.85, 1.1), sign: Math.random() < 0.04,
        });
      }
    }
  })();

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawArena() {
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, '#05070d'); g.addColorStop(0.6, '#121829'); g.addColorStop(1, '#1b2238');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 300);
    // ceiling lights
    for (let i = 0; i < 9; i++) {
      const x = ((i * 190 - cam.x * 14) % (VW + 190) + VW + 190) % (VW + 190) - 95;
      const lg = ctx.createRadialGradient(x, 18, 2, x, 18, 70);
      lg.addColorStop(0, 'rgba(255,250,220,0.9)'); lg.addColorStop(0.15, 'rgba(255,250,220,0.25)'); lg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = lg; ctx.fillRect(x - 70, 0, 140, 90);
    }
    // crowd
    const cheer = game.cheer;
    for (const f of fans) {
      const par = 0.42 + f.r * 0.035;
      const px = 24 + f.r * 1.2;
      const sx = VW / 2 + (f.x - 28 - (cam.x - MID_X) * par) * px + cam.sx * 0.3;
      if (sx < -20 || sx > VW + 20) continue;
      let sy = 112 + f.r * 19 + cam.sy * 0.3;
      const bob = Math.sin(game.time * (cheer > 0 ? 13 : 2) + f.ph);
      sy -= cheer > 0 ? Math.max(0, bob) * 9 * Math.min(1, cheer) : bob * 0.8;
      const s = (0.75 + f.r * 0.06) * f.sz;
      ctx.fillStyle = f.c;
      ctx.fillRect(sx - 7 * s, sy - 4 * s, 14 * s, 16 * s);
      ctx.fillStyle = f.skin;
      ctx.beginPath(); ctx.arc(sx, sy - 9 * s, 5.2 * s, 0, 6.283); ctx.fill();
      if (f.sign && cheer > 0) {
        ctx.fillStyle = '#fff'; ctx.fillRect(sx - 12 * s, sy - 30 * s, 24 * s, 13 * s);
        ctx.fillStyle = '#e8452c'; ctx.font = font(9 * s); ctx.textAlign = 'center'; ctx.fillText('D!', sx, sy - 20 * s);
      }
    }
    // dim crowd slightly for depth
    ctx.fillStyle = 'rgba(8,10,20,0.28)'; ctx.fillRect(0, 90, VW, 170);
  }

  function polyFill(pts, color) {
    ctx.beginPath();
    pts.forEach((p, i) => { const q = proj(p[0], 0, p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  function polyLine(pts, closed) {
    ctx.beginPath();
    pts.forEach((p, i) => { const q = proj(p[0], 0, p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  const arcPts = (cx, cz, r, a0, a1, n = 28) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    return out;
  };

  function drawFloor() {
    // LED ad boards along the far sideline
    const a = proj(-3, 0, -2.0), b = proj(COURT_L + 3, 0, -2.0);
    const hgt = 0.9 * S * a.k;
    const lg = ctx.createLinearGradient(0, a.y - hgt, 0, a.y);
    lg.addColorStop(0, '#111a33'); lg.addColorStop(1, '#0a0f1f');
    ctx.fillStyle = lg; ctx.fillRect(a.x, a.y - hgt, b.x - a.x, hgt);
    ctx.save();
    ctx.beginPath(); ctx.rect(a.x, a.y - hgt, b.x - a.x, hgt); ctx.clip();
    ctx.font = font(Math.round(hgt * 0.5), 800); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const msgs = ['FULL COURT SLAM', '全場灌籃', 'DEFENSE!', '★ BLAZE vs WAVES ★', 'MAKE SOME NOISE'];
    let x = a.x - ((game.time * 60) % 600);
    for (let i = 0; x < b.x; i++) {
      const m = msgs[i % msgs.length];
      ctx.fillStyle = i % 2 ? '#ffd54a' : '#6fd3ff';
      ctx.fillText(m, x, a.y - hgt / 2);
      x += ctx.measureText(m).width + 70;
    }
    ctx.restore();

    // apron
    polyFill([[-3, -2], [COURT_L + 3, -2], [COURT_L + 3, COURT_W + 2.4], [-3, COURT_W + 2.4]], '#7a4b25');
    // court wood
    const c0 = proj(0, 0, 0), c1 = proj(0, 0, COURT_W);
    const wg = ctx.createLinearGradient(0, c0.y, 0, c1.y);
    wg.addColorStop(0, '#c98d4f'); wg.addColorStop(1, '#e0a565');
    polyFill([[0, 0], [COURT_L, 0], [COURT_L, COURT_W], [0, COURT_W]], wg);
    // planks
    ctx.lineWidth = 1;
    for (let z = 0.25, i = 0; z < COURT_W; z += 0.32, i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(120,70,30,0.10)' : 'rgba(255,230,190,0.06)';
      polyLine([[0, z], [COURT_L, z]]);
    }
    // paint
    polyFill([[0, 5.05], [5.8, 5.05], [5.8, 9.95], [0, 9.95]], TEAMS[0].paint);
    polyFill([[COURT_L, 5.05], [COURT_L - 5.8, 5.05], [COURT_L - 5.8, 9.95], [COURT_L, 9.95]], TEAMS[1].paint);
    // centre logo
    const cc = proj(MID_X, 0, MID_Z);
    ctx.save();
    ctx.translate(cc.x, cc.y); ctx.scale(1, 0.36);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(0, 0, 1.8 * S * cc.k, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(120,40,20,0.55)'; ctx.font = font(Math.round(46 * cc.k), 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SLAM', 0, 0);
    ctx.restore();

    // lines
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
    polyLine([[0, 0], [COURT_L, 0], [COURT_L, COURT_W], [0, COURT_W]], true);
    polyLine([[MID_X, 0], [MID_X, COURT_W]]);
    polyLine(arcPts(MID_X, MID_Z, 1.8, 0, Math.PI * 2, 40), true);
    for (const hp of HOOPS) {
      const bx = hp.dir > 0 ? 0 : COURT_L, D = hp.dir;
      polyLine([[bx, 5.05], [bx + D * 5.8, 5.05], [bx + D * 5.8, 9.95], [bx, 9.95]]);
      polyLine(arcPts(bx + D * 5.8, MID_Z, 1.8, 0, Math.PI * 2, 36), true);
      const th = Math.asin(CORNER_Z / THREE_R);
      const cxEnd = hp.x + D * Math.cos(th) * THREE_R;
      const a0 = D > 0 ? -th : Math.PI + th, a1 = D > 0 ? th : Math.PI - th;
      polyLine([[bx, MID_Z - CORNER_Z], [cxEnd, MID_Z - CORNER_Z]]);
      polyLine([[bx, MID_Z + CORNER_Z], [cxEnd, MID_Z + CORNER_Z]]);
      polyLine(arcPts(hp.x, hp.z, THREE_R, a0, a1, 40));
      const r0 = D > 0 ? -Math.PI / 2 : Math.PI / 2, r1 = D > 0 ? Math.PI / 2 : Math.PI * 1.5;
      polyLine(arcPts(hp.x, hp.z, 1.25, r0, r1, 16));
    }
  }

  function rimPts(hp, n = 20) {
    const off = Math.sin(game.time * 45) * hp.shake * 0.05;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      pts.push({ a, x: hp.x + Math.cos(a) * RIM_R, z: hp.z + Math.sin(a) * RIM_R, y: HOOP_Y + off });
    }
    return pts;
  }

  function drawNet(hp, front) {
    const top = rimPts(hp, 14);
    const stretch = hp.net;
    const botR = 0.13 + stretch * 0.04, botY = HOOP_Y - 0.42 - stretch * 0.12;
    const sway = Math.sin(game.time * 20) * stretch * 0.04;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < top.length; i++) {
      const t = top[i], tn = top[(i + 1) % top.length];
      const isFront = Math.sin(t.a) > 0;
      if (isFront !== front) continue;
      const bx = hp.x + Math.cos(t.a) * botR + sway, bz = hp.z + Math.sin(t.a) * botR;
      const bxn = hp.x + Math.cos(tn.a) * botR + sway, bzn = hp.z + Math.sin(tn.a) * botR;
      const p0 = proj(t.x, t.y, t.z), p1 = proj(bxn, botY, bzn), p2 = proj(tn.x, tn.y, tn.z), p3 = proj(bx, botY, bz);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.stroke();
    }
  }

  function drawRim(hp, front) {
    const off = Math.sin(game.time * 45) * hp.shake * 0.05;
    ctx.strokeStyle = front ? '#ff6a1a' : '#c94a10'; ctx.lineWidth = front ? 4 : 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (front ? 0 : Math.PI) + i / n * Math.PI;
      const q = proj(hp.x + Math.cos(a) * RIM_R, HOOP_Y + off, hp.z + Math.sin(a) * RIM_R);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
  }

  function drawHoopBack(hp) {
    const D = hp.dir;
    const baseX = hp.board - D * 1.8;
    // base
    const b0 = proj(baseX - 0.45, 0, 8.0), b1 = proj(baseX + 0.45, 0.9, 8.0);
    ctx.fillStyle = '#1c2233'; ctx.fillRect(Math.min(b0.x, b1.x), b1.y, Math.abs(b1.x - b0.x), b0.y - b1.y);
    ctx.fillStyle = TEAMS[D > 0 ? 0 : 1].color; ctx.fillRect(Math.min(b0.x, b1.x), b1.y + 4, Math.abs(b1.x - b0.x), 8);
    // pole + arm
    const p0 = proj(baseX, 0.9, MID_Z), p1 = proj(baseX, 3.55, MID_Z), p2 = proj(hp.board - D * 0.05, 3.55, MID_Z), p3 = proj(hp.board, 3.25, MID_Z);
    ctx.strokeStyle = '#2b3246'; ctx.lineWidth = 9 * p0.k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.lineWidth = 5 * p0.k; ctx.beginPath(); ctx.moveTo(p1.x, p1.y + 20); ctx.lineTo(p3.x, p3.y); ctx.stroke();
    // backboard
    const off = Math.sin(game.time * 45) * hp.shake * 0.03;
    const q = [[6.6, 2.9], [8.4, 2.9], [8.4, 3.95], [6.6, 3.95]].map(([z, y]) => proj(hp.board, y + off, z));
    ctx.beginPath(); q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); ctx.closePath();
    ctx.fillStyle = 'rgba(210,230,255,0.32)'; ctx.fill();
    ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 3; ctx.stroke();
    const r = [[7.2, 3.05], [7.8, 3.05], [7.8, 3.5], [7.2, 3.5]].map(([z, y]) => proj(hp.board, y + off, z));
    ctx.beginPath(); r.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); ctx.closePath();
    ctx.strokeStyle = '#ff4a2a'; ctx.lineWidth = 2.4; ctx.stroke();
    // bracket
    const m0 = proj(hp.board, HOOP_Y, MID_Z), m1 = proj(hp.x - D * RIM_R, HOOP_Y, MID_Z);
    ctx.strokeStyle = '#c94a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
    drawNet(hp, false);
    drawRim(hp, false);
  }
  function drawHoopFront(hp) {
    drawNet(hp, true);
    drawRim(hp, true);
  }

  function drawShadow(x, z, y, w) {
    const p = proj(x, 0, z);
    const s = Math.max(0.35, 1 - y * 0.22);
    ctx.fillStyle = `rgba(30,15,5,${0.32 * s})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, w * S * p.k * s, w * S * p.k * 0.28 * s, 0, 0, 6.283); ctx.fill();
  }

  function drawBall() {
    const p = proj(ball.x, ball.y, ball.z);
    const r = BALL_R * S * p.k * 1.35;
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, '#ffb35c'); g.addColorStop(1, '#d4570f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ball.rot);
    ctx.strokeStyle = 'rgba(40,15,0,0.85)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    ctx.restore();
  }

  const OUTLINE = 'rgba(45,25,20,0.55)';
  function limb(x0, y0, x1, y1, bend, w, color) {
    const mx = (x0 + x1) / 2 + bend[0], my = (y0 + y1) / 2 + bend[1];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx, my); ctx.lineTo(x1, y1);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = w + 0.045; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  function blob(color, outline = true) {
    ctx.fillStyle = color; ctx.fill();
    if (outline) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.03; ctx.stroke(); }
  }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * amt, 0, 255) | 0, g = clamp(((n >> 8) & 255) * amt, 0, 255) | 0, b = clamp((n & 255) * amt, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  // hair behind the head (drawn first)
  function hairBack(p, hx, hy, r) {
    ctx.fillStyle = p.hair;
    if (p.style === 'afro') {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.75 + i * 0.19);
        circ(hx - r * 0.1 + Math.cos(a) * r * 0.95, hy - r * 0.15 + Math.sin(a) * r * 0.95, r * 0.42); ctx.fill();
      }
    } else if (p.style === 'bun') {
      circ(hx - r * 0.35, hy - r * 1.0, r * 0.38); blob(p.hair);
    }
  }
  // hair on top of the head
  function hairFront(p, hx, hy, r) {
    const c = p.hair;
    ctx.fillStyle = c;
    if (p.style === 'mohawk') {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.75, hy - r * 0.55);
      ctx.quadraticCurveTo(hx - r * 0.2, hy - r * 1.75, hx + r * 0.55, hy - r * 0.8);
      ctx.quadraticCurveTo(hx, hy - r * 1.05, hx - r * 0.75, hy - r * 0.55);
      blob(c);
      return;
    }
    // cap of hair covering the top/back of the head
    const low = p.style === 'buzz' ? 0.08 : 0.0;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.04, Math.PI * (0.92 + low), Math.PI * (1.98 - low));
    ctx.quadraticCurveTo(hx + r * 0.3, hy - r * (0.35 + low), hx - r * 0.2, hy - r * 0.2);
    ctx.quadraticCurveTo(hx - r * 0.7, hy + r * 0.15, hx - r * 0.98, hy + r * 0.25);
    ctx.closePath();
    blob(c);
    if (p.style === 'spiky') {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (1.12 + i * 0.22);
        const bx = hx + Math.cos(a) * r * 0.9, by = hy + Math.sin(a) * r * 0.9;
        const tx = hx + Math.cos(a + 0.12) * r * 1.45, ty = hy + Math.sin(a + 0.12) * r * 1.45;
        ctx.moveTo(bx - Math.sin(a) * r * 0.22, by + Math.cos(a) * r * 0.22);
        ctx.lineTo(tx, ty);
        ctx.lineTo(bx + Math.sin(a) * r * 0.22, by - Math.cos(a) * r * 0.22);
      }
      blob(c);
    } else if (p.style === 'swoop') {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.3, hy - r * 0.95);
      ctx.quadraticCurveTo(hx + r * 1.15, hy - r * 1.05, hx + r * 0.95, hy - r * 0.15);
      ctx.quadraticCurveTo(hx + r * 0.6, hy - r * 0.6, hx - r * 0.1, hy - r * 0.55);
      ctx.closePath();
      blob(c);
    }
  }

  function drawFace(p, hx, hy, r, mood) {
    const ex1 = hx + r * 0.22, ex2 = hx + r * 0.66, ey = hy + r * 0.12;
    // blush
    ctx.fillStyle = 'rgba(255,110,130,0.45)';
    ctx.beginPath(); ctx.ellipse(hx + r * 0.08, hy + r * 0.45, r * 0.17, r * 0.1, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + r * 0.8, hy + r * 0.45, r * 0.13, r * 0.09, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#2a1a14'; ctx.fillStyle = '#2a1a14'; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.09;
    const blink = ((game.time + p.blinkPh) % 3.4) < 0.12;
    if (mood === 'happy') {
      for (const ex of [ex1, ex2]) { ctx.beginPath(); ctx.arc(ex, ey + r * 0.06, r * 0.12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    } else if (blink) {
      for (const ex of [ex1, ex2]) { ctx.beginPath(); ctx.moveTo(ex - r * 0.1, ey); ctx.lineTo(ex + r * 0.1, ey); ctx.stroke(); }
    } else {
      for (const [ex, sc] of [[ex1, 0.9], [ex2, 1]]) {
        ctx.fillStyle = '#2a1a14';
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.12 * sc, r * 0.17 * sc, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff';
        circ(ex + r * 0.04, ey - r * 0.07, r * 0.055 * sc); ctx.fill();
        circ(ex - r * 0.04, ey + r * 0.06, r * 0.025 * sc); ctx.fill();
      }
    }
    // mouth
    ctx.strokeStyle = '#7a2b22'; ctx.lineWidth = r * 0.07;
    const mx = hx + r * 0.48, my = hy + r * 0.5;
    if (mood === 'wow') {
      ctx.fillStyle = '#7a2b22'; ctx.beginPath(); ctx.ellipse(mx, my, r * 0.09, r * 0.12, 0, 0, 6.283); ctx.fill();
    } else if (mood === 'happy') {
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(mx, my - r * 0.04, r * 0.17, 0, Math.PI); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - r * 0.1, r * 0.12, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
  }

  function drawPlayer(p) {
    const P = proj(p.x, p.y, p.z);
    const u = S * P.k;
    const T = TEAMS[p.team];
    const f = p.facing;
    const hs = p.height / 2;
    const air = p.y > 0.04;
    const spd = hyp(p.vx, p.vz);
    const moving = !air && spd > 0.4;
    const sw = moving ? Math.sin(p.runPhase) : 0;
    const amp = Math.min(1, spd / 6);
    const hasBall = ball.holder === p;
    const lean = moving ? f * 0.05 * amp : 0;
    const bob = moving ? -Math.abs(Math.cos(p.runPhase)) * 0.05 * amp : 0;
    const celebrate = game.cheer > 0.6 && game.lastScoreTeam === p.team && !hasBall && !air && p.state === 'idle';

    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.scale(u, u);
    if (p.state === 'dunk' && p.dunk && p.dunk.type.en.includes('360')) {
      const s = clamp(p.stateT / (DUNK_UP * DUNK_SLAM), 0, 1);
      ctx.scale(Math.cos(s * Math.PI * 2), 1);
    }
    // chibi proportions: big head, short round body
    const hipY = -0.6 * hs + bob, shY = -1.1 * hs + bob;
    const headR = 0.33 * hs, headY = -1.45 * hs + bob;
    const skinBack = shade(p.skin, 0.85);

    // hands
    let hb, hf; // back hand, front hand [x, y]
    const ballRel = [(ball.x - p.x) * f, -(ball.y - p.y)];
    const oppHas = ball.holder && ball.holder.team !== p.team;
    if (p.state === 'shoot' && hasBall) { hf = [0.16, -2.02 * hs]; hb = [-0.06, -1.98 * hs]; }
    else if (p.state === 'dunk') {
      hf = [ballRel[0] + 0.05, ballRel[1] + 0.05];
      hb = p.dunk && p.dunk.type.en.includes('WIND') ? [-0.25, -1.75 * hs] : [hf[0] - 0.12, hf[1] + 0.05];
    }
    else if (p.follow > 0 && !hasBall) { hf = [0.36, -1.95 * hs]; hb = [0.2, -1.75 * hs]; }
    else if (air) { hf = [0.16, -2.05 * hs]; hb = [-0.08, -2.0 * hs]; }
    else if (celebrate) { const w = Math.sin(game.time * 14) * 0.08; hf = [0.3 + w, -1.95 * hs]; hb = [-0.3 - w, -1.95 * hs]; }
    else if (p.reachT > 0) { hf = [0.62, -0.85 * hs]; hb = [-0.15, -0.8 * hs]; }
    else if (hasBall) { hf = [0.36, -Math.max(0.6, ball.y - p.y + 0.1)]; hb = [-0.14 - sw * 0.1, -0.68 * hs]; }
    else if (oppHas && hyp(ball.holder.x - p.x, ball.holder.z - p.z) < 2.6) { hf = [0.45, -1.05 * hs]; hb = [-0.32, -1.1 * hs]; }
    else { hf = [0.27 + sw * 0.2, -0.6 * hs]; hb = [-0.12 - sw * 0.2, -0.62 * hs]; }

    // feet
    let fb, ff;
    if (air) { fb = [-0.14, hipY * 0.35]; ff = [0.08, hipY * 0.25]; }
    else { fb = [-sw * 0.26 * amp, -Math.max(0, sw) * 0.12 * amp]; ff = [sw * 0.26 * amp, -Math.max(0, -sw) * 0.12 * amp]; }
    const legW = 0.16;
    const shoe = (x, y, front) => {
      ctx.beginPath(); ctx.ellipse(x + 0.06, y - 0.05, 0.15, 0.085, 0, 0, 6.283); blob(front ? T.color : shade(T.color.length === 7 ? T.color : '#888888', 0.8));
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.08, y - 0.02, 0.28, 0.025);
    };
    const mood = celebrate ? 'happy' : (air || p.state === 'dunk') ? 'wow' : 'smile';

    ctx.save(); ctx.scale(f, 1);
    // back leg + arm
    limb(0, hipY, fb[0], fb[1] - 0.04, [0.06, 0], legW, skinBack);
    shoe(fb[0], fb[1], false);
    limb(lean, shY + 0.08, hb[0], hb[1], [-0.05, 0.06], 0.12, skinBack);
    circ(hb[0], hb[1], 0.075); blob(skinBack);
    // shorts
    rrect(-0.27 + lean * 0.5, hipY - 0.06, 0.54, 0.27 * hs, 0.09); blob(T.dark);
    // round jersey body
    rrect(-0.26 + lean, shY - 0.03, 0.52, hipY - shY + 0.1, 0.17); blob(T.color);
    ctx.fillStyle = T.light; ctx.fillRect(-0.22 + lean, hipY - 0.03, 0.44, 0.035);
    // front leg
    limb(0.04, hipY, ff[0], ff[1] - 0.04, [0.06, 0], legW, p.skin);
    shoe(ff[0], ff[1], true);
    // a raised front arm goes behind the big head so it never covers the face
    const armUp = hf[1] < headY + headR * 0.3;
    const frontArm = () => { limb(lean, shY + 0.08, hf[0], hf[1], [-0.05, 0.06], 0.12, p.skin); circ(hf[0], hf[1], 0.08); blob(p.skin); };
    if (armUp) frontArm();
    // head
    const hx = 0.02 + lean * 1.5;
    hairBack(p, hx, headY, headR);
    circ(hx, headY, headR); blob(p.skin);
    circ(hx - headR * 0.72, headY + headR * 0.12, headR * 0.2); blob(p.skin); // ear
    hairFront(p, hx, headY, headR);
    // team headband
    ctx.strokeStyle = T.color; ctx.lineWidth = headR * 0.2; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(hx, headY + headR * 0.1, headR * 1.0, Math.PI * 1.18, Math.PI * 1.86); ctx.stroke();
    drawFace(p, hx, headY, headR, mood);
    if (!armUp) frontArm();
    ctx.restore();
    ctx.restore();

    // jersey number (pixel-space text)
    const np = proj(p.x, p.y + 0.82 * hs - bob, p.z);
    ctx.fillStyle = '#fff'; ctx.font = font(Math.round(17 * P.k), 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num), np.x + lean * u, np.y);

    if (isHuman(p)) {
      const mine = p.team === game.localTeam;
      const tp = proj(p.x, p.y + p.height + 0.45, p.z);
      ctx.fillStyle = mine ? '#ffd54a' : TEAMS[p.team].light;
      ctx.beginPath(); ctx.moveTo(tp.x - 8, tp.y - 10); ctx.lineTo(tp.x + 8, tp.y - 10); ctx.lineTo(tp.x, tp.y); ctx.closePath(); ctx.fill();
      ctx.font = font(13); ctx.fillStyle = '#fff'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, tp.x, tp.y - 12);
      if (mine && p.state === 'shoot' && p.userShot && hasBall) drawMeter(p);
    }
  }

  function drawMeter(p) {
    const P = proj(p.x, p.y + p.height * 0.9, p.z);
    const x = P.x + 34, y = P.y - 60, w = 12, h = 90;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rrect(x - 3, y - 3, w + 6, h + 6, 5); ctx.fill();
    const zc = APEX / SHOT_MAX_T, zh = 0.035 / SHOT_MAX_T;
    ctx.fillStyle = 'rgba(93,255,122,0.85)';
    ctx.fillRect(x, y + h * (1 - zc - zh), w, h * zh * 2);
    ctx.fillStyle = 'rgba(199,255,122,0.35)';
    ctx.fillRect(x, y + h * (1 - zc - zh - 0.12), w, h * 0.12);
    ctx.fillRect(x, y + h * (1 - zc + zh), w, h * 0.12);
    // a guest sees their own key-hold time, so the meter isn't delayed by the connection
    const held = net.role === 'guest' && input.isDown('shoot') ? (performance.now() - input.pressT) / 1000 : p.stateT;
    const fill = clamp(held / SHOT_MAX_T, 0, 1);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 4, y + h * (1 - fill) - 2, w + 8, 4);
  }

  function drawWorld() {
    drawArena();
    drawFloor();
    // shadows
    for (const p of players) drawShadow(p.x, p.z, p.y, 0.32);
    drawShadow(ball.x, ball.z, ball.y, 0.14);
    // controlled rings
    for (let t = 0; t < 2; t++) {
      const cp = ctrl[t];
      if (!cp) continue;
      const c = proj(cp.x, 0, cp.z);
      ctx.strokeStyle = t === game.localTeam ? 'rgba(255,213,74,0.9)' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 0.5 * S * c.k, 0.15 * S * c.k, 0, 0, 6.283); ctx.stroke();
    }
    // painter's sort
    const list = [];
    for (const p of players) list.push({ z: p.z, fn: () => drawPlayer(p) });
    const bz = ball.holder ? ball.holder.z + 0.05 : ball.z;
    list.push({ z: bz, fn: drawBall, ball: true });
    for (const hp of HOOPS) {
      list.push({ z: 6.6, fn: () => drawHoopBack(hp) });
      list.push({ z: hp.z + RIM_R + 0.01, fn: () => drawHoopFront(hp) });
    }
    list.sort((a, b) => a.z - b.z || (a.ball ? 1 : 0) - (b.ball ? 1 : 0));
    for (const e of list) e.fn();

    // floating texts
    for (const t of game.texts) {
      const p = proj(t.x, t.y + t.t * 0.9, t.z);
      const a = clamp(1.6 - t.t, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = font(t.size, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t.text, p.x, p.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawTalking() {
    for (let t = 0; t < 2; t++) {
      const p = ctrl[t];
      if (!p || !isTalking(t)) continue;
      const s = proj(p.x, p.y + p.height + 0.55, p.z);
      const x = s.x + 44, y = s.y - 2, pulse = 1 + Math.min(1, voice.level[t] * 6) * 0.25;
      ctx.save();
      ctx.fillStyle = t === game.localTeam ? 'rgba(62,196,109,0.95)' : 'rgba(255,255,255,0.95)';
      circ(x, y, 13 * pulse); ctx.fill();
      ctx.font = font(15, 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎤', x, y + 1);
      ctx.restore();
    }
  }

  function drawBubbles() {
    drawTalking();
    const now = performance.now();
    for (let t = 0; t < 2; t++) {
      const b = bubbles[t], p = ctrl[t];
      if (!b || !p || now > b.until) continue;
      const s = proj(p.x, p.y + p.height + 1.2, p.z);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (b.until - now) / 400);
      ctx.font = font(15, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(b.text).width + 22, h = 30;
      const x = clamp(s.x, w / 2 + 6, VW - w / 2 - 6), y = Math.max(h + 6, s.y);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      rrect(x - w / 2, y - h, w, h, 13); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x - 7, y - 1); ctx.lineTo(s.x + 7, y - 1); ctx.lineTo(s.x, y + 8); ctx.fill();
      ctx.fillStyle = '#16202a'; ctx.fillText(b.text, x, y - h / 2 + 1);
      ctx.restore();
    }
  }

  function drawScoreboard() {
    const W = 560, H = 66, x = VW / 2 - W / 2, y = 10;
    ctx.fillStyle = 'rgba(8,10,20,0.85)'; rrect(x, y, W, H, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    for (let t = 0; t < 2; t++) {
      const bx = t === 0 ? x + 8 : x + W - 8 - 190;
      ctx.fillStyle = TEAMS[t].color; rrect(bx, y + 8, 190, H - 16, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(t === 0 ? bx + 112 : bx, y + 8, 78, H - 16, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.font = font(15, 800); ctx.textAlign = 'left';
      const nx = t === 0 ? bx + 12 : bx + 90;
      ctx.fillText(TEAMS[t].name, nx, y + 26);
      ctx.font = font(11, 600); ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(TEAMS[t].en + (t === game.localTeam && !game.demo ? ' (你)' : game.online ? ' (對手)' : ''), nx, y + 46);
      ctx.font = font(32, 900); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(String(game.score[t]), t === 0 ? bx + 151 : bx + 39, y + H / 2 + 1);
      if (game.possession === t && game.phase !== 'break') {
        ctx.fillStyle = '#ffd54a';
        const px = t === 0 ? bx + 104 : bx + 86;
        ctx.beginPath(); ctx.arc(px, y + H / 2, 4, 0, 6.283); ctx.fill();
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb0d0'; ctx.font = font(13, 700);
    const q = game.quarter > 4 ? `OT${game.quarter - 4}` : `Q${game.quarter}`;
    ctx.fillText(q, VW / 2, y + 20);
    ctx.fillStyle = '#fff'; ctx.font = font(24, 800);
    ctx.fillText(fmtClock(game.clock), VW / 2, y + 44);
    // shot clock
    const sc = Math.ceil(game.shotClock);
    ctx.fillStyle = 'rgba(8,10,20,0.85)'; rrect(VW / 2 - 26, y + H + 4, 52, 28, 6); ctx.fill();
    ctx.fillStyle = sc <= 5 ? '#ff4a3a' : '#ffb14a'; ctx.font = font(20, 900);
    ctx.fillText(game.possession >= 0 ? String(Math.max(0, sc)) : '--', VW / 2, y + H + 19);
  }

  function drawMinimap() {
    const x = 14, y = 12, w = 196, h = w * COURT_W / COURT_L;
    ctx.fillStyle = 'rgba(8,10,20,0.75)'; rrect(x - 6, y - 6, w + 12, h + 12, 8); ctx.fill();
    ctx.fillStyle = '#b77b42'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    const sx = w / COURT_L, sz = h / COURT_W;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 1.8 * sx, 0, 6.283); ctx.stroke();
    for (const hp of HOOPS) {
      ctx.beginPath(); ctx.arc(x + hp.x * sx, y + hp.z * sz, THREE_R * sx, hp.dir > 0 ? -1.36 : Math.PI - 1.36, hp.dir > 0 ? 1.36 : Math.PI + 1.36); ctx.stroke();
      ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(x + hp.x * sx, y + hp.z * sz, 2.5, 0, 6.283); ctx.fill();
    }
    // camera window
    const half = VW / 2 / S;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    const cx0 = Math.max(x, x + (cam.x - half) * sx), cx1 = Math.min(x + w, x + (cam.x + half) * sx);
    ctx.strokeRect(cx0, y, cx1 - cx0, h);
    for (const p of players) {
      ctx.fillStyle = TEAMS[p.team].color;
      ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.z * sz, 4.5, 0, 6.283); ctx.fill();
      if (isHuman(p)) { ctx.strokeStyle = p.team === game.localTeam ? '#ffd54a' : '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.fillStyle = '#ff9a3d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + ball.x * sx, y + ball.z * sz, 3, 0, 6.283); ctx.fill(); ctx.stroke();
  }

  function drawBanner() {
    const b = game.banner;
    if (!b) return;
    const t = b.t;
    const a = clamp(Math.min(t * 6, (b.dur - t) * 3), 0, 1);
    const sc = t < 0.15 ? 0.6 + t / 0.15 * 0.5 : t < 0.3 ? 1.1 - (t - 0.15) / 0.15 * 0.1 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(VW / 2, 230);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(64, 900);
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = font(24, 800);
      ctx.lineWidth = 6; ctx.strokeText(b.sub, 0, 50);
      ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 50);
    }
    ctx.restore();
  }

  function drawHints() {
    if (input.touch || game.mode !== 'play') return;
    const online = game.online || !!net.role;
    const show = online ? 0 : game.playTime < 25 ? 1 : 0.45;
    ctx.globalAlpha = show;
    const txt = '方向鍵 移動 · A/Shift 衝刺 · W 跳（籃板｜蓋帽）· F 投籃/灌籃/抄截 · S 花式灌籃 · Z 傳球/換人 · 空白 晃人 · '
      + (game.online || net.role ? 'Esc 離開對戰' : 'P 暫停') + ' · M 靜音';
    ctx.font = font(13, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 24;
    ctx.fillStyle = 'rgba(8,10,20,0.7)'; rrect(VW / 2 - w / 2, VH - 30, w, 22, 6); ctx.fill();
    ctx.fillStyle = '#e8ecf5'; ctx.fillText(txt, VW / 2, VH - 19);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    if (sfx.muted) { ctx.fillStyle = '#ffb14a'; ctx.fillText('🔇 靜音', VW - 14, 20); }
    if (game.online) {
      ctx.fillStyle = '#5dff7a';
      ctx.fillText(`● 連線對戰 · 你是${TEAMS[game.localTeam].name}隊 · Enter 聊天 · 🎤 語音`, VW - 14, sfx.muted ? 40 : 20);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,10,22,0.86)'; rrect(x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function button(label, x, y, w, h, active, fn) {
    ctx.fillStyle = active ? '#ffd54a' : 'rgba(255,255,255,0.1)';
    rrect(x, y, w, h, 10); ctx.fill();
    ctx.fillStyle = active ? '#1a1200' : '#fff';
    ctx.font = font(18, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    menuButtons.push({ x, y, w, h, fn });
  }

  function drawMenu() {
    menuButtons.length = 0;
    const W = 640, H = 580, x = VW / 2 - W / 2, y = 70;
    panel(x, y, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(58, 900);
    const g = ctx.createLinearGradient(x, 0, x + W, 0);
    g.addColorStop(0, '#ff7a45'); g.addColorStop(1, '#ffd54a');
    ctx.fillStyle = g; ctx.fillText('全場灌籃', VW / 2, y + 58);
    ctx.font = font(18, 800); ctx.fillStyle = '#9fb0d0';
    ctx.fillText('FULL COURT SLAM  ·  3 對 3 全場籃球', VW / 2, y + 102);

    ctx.font = font(16, 700); ctx.fillStyle = '#e8ecf5';
    ctx.fillText('難度', VW / 2, y + 140);
    DIFFS.forEach((d, i) => button(d.name, VW / 2 - 180 + i * 125, y + 156, 110, 40, game.diff === i, () => { game.diff = i; }));
    ctx.font = font(16, 700); ctx.fillStyle = '#e8ecf5';
    ctx.fillText('每節長度', VW / 2, y + 222);
    QUARTER_OPTS.forEach((m, i) => button(`${m} 分鐘`, VW / 2 - 230 + i * 118, y + 238, 106, 40, game.qIdx === i, () => { game.qIdx = i; }));
    ctx.font = font(16, 700); ctx.fillStyle = '#e8ecf5';
    ctx.fillText('三分命中率（100% = 在哪投都進）', VW / 2, y + 304);
    THREE_OPTS.forEach((r, i) => button(r == null ? '預設' : `${Math.round(r * 100)}%`, VW / 2 - 276 + i * 112, y + 320, 100, 40,
      game.threeIdx === i, () => { game.threeIdx = i; }));
    button('開始比賽（對電腦）', VW / 2 - 150, y + 382, 300, 54, true, startGame);
    ctx.font = font(15, 700); ctx.fillStyle = '#e8ecf5';
    ctx.fillText('連線對戰（和朋友 1 對 1）', VW / 2, y + 460);
    button('建立房間', VW / 2 - 150, y + 476, 142, 44, false, hostRoom);
    button('加入房間', VW / 2 + 8, y + 476, 142, 44, false, () => openJoin(''));

    ctx.font = font(13, 600); ctx.fillStyle = '#9fb0d0';
    const lines = input.touch
      ? ['左側搖桿移動（推到底自動衝刺）· 投籃鍵：按住放開投籃，籃下灌籃，防守時抄截', '跳躍鍵：籃板 / 蓋帽 · 傳球鍵：傳球 / 換人 · 晃人鍵 · 花式鍵：籃下花式灌籃 · 衝刺鍵點一下開關']
      : ['方向鍵 移動 · A/Shift 衝刺 · W 跳（搶籃板 / 蓋火鍋）', 'F 投籃（按住，綠區放開）/ 灌籃 / 抄截 · S 花式灌籃 · Z 傳球 / 換人 · 空白 晃人 · Enter 開始'];
    lines.forEach((l, i) => ctx.fillText(l, VW / 2, y + 540 + i * 20));
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, VW, VH);
    panel(VW / 2 - 220, 240, 440, 170);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(44, 900); ctx.fillStyle = '#fff'; ctx.fillText('暫停', VW / 2, 300);
    ctx.font = font(16, 600); ctx.fillStyle = '#9fb0d0';
    ctx.fillText('按 P / Esc / 點擊畫面 繼續', VW / 2, 360);
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, VW, VH);
    const W = 600, H = 400, x = VW / 2 - W / 2, y = 150;
    panel(x, y, W, H);
    const win = game.winner === game.localTeam;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(54, 900); ctx.fillStyle = win ? '#ffd54a' : '#9fb0d0';
    ctx.fillText(win ? '勝利！' : '落敗…', VW / 2, y + 55);
    ctx.font = font(40, 900);
    ctx.fillStyle = '#fff'; ctx.fillText(':', VW / 2, y + 118);
    ctx.textAlign = 'right'; ctx.fillStyle = TEAMS[0].color; ctx.fillText(`${TEAMS[0].name}  ${game.score[0]}`, VW / 2 - 28, y + 120);
    ctx.textAlign = 'left'; ctx.fillStyle = TEAMS[1].color; ctx.fillText(`${game.score[1]}  ${TEAMS[1].name}`, VW / 2 + 28, y + 120);
    ctx.textAlign = 'center';
    const rows = [
      ['投籃命中', (s) => `${s.fgm}/${s.fga}`],
      ['三分命中', (s) => `${s.tpm}/${s.tpa}`],
      ['灌籃', (s) => `${s.dunks}`],
      ['火鍋', (s) => `${s.blocks}`],
      ['抄截', (s) => `${s.steals}`],
    ];
    ctx.font = font(18, 700);
    rows.forEach(([label, fn], i) => {
      const ry = y + 175 + i * 32;
      ctx.fillStyle = '#9fb0d0'; ctx.fillText(label, VW / 2, ry);
      ctx.fillStyle = '#fff';
      ctx.fillText(fn(game.stats[0]), VW / 2 - 150, ry);
      ctx.fillText(fn(game.stats[1]), VW / 2 + 150, ry);
    });
    ctx.font = font(16, 600); ctx.fillStyle = '#ffd54a';
    const foot = !game.online ? '按 Enter / 點擊畫面 返回主選單'
      : net.role === 'host' ? (input.touch ? '投籃鍵 再來一場 · II 離開' : '按 Enter 再來一場 · Esc 離開')
        : (input.touch ? '等待主機開新局 · II 離開' : '等待主機開新局 · Esc 離開');
    ctx.fillText(foot, VW / 2, y + H - 28);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(fit, 0, 0, fit, offX, offY);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
    drawWorld();
    if (game.mode !== 'menu') { drawScoreboard(); drawMinimap(); }
    drawBubbles();
    drawBanner();
    drawHints();
    if (game.mode === 'menu') drawMenu();
    else if (game.mode === 'paused') drawPause();
    else if (game.mode === 'over') drawGameOver();
    ctx.restore();
  }

  // =====================================================================
  // Loop
  // =====================================================================
  function tick(dt) {
    if (input.hit('mute')) sfx.toggle();
    if (net.role === 'guest') {
      guestTick(dt);
    } else if (game.mode === 'menu') {
      menuInput();
      if (game.mode === 'menu') simulate(dt);
    } else if (game.mode === 'play') {
      if (input.hit('pause')) {
        if (!game.online) game.mode = 'paused';
        else if (window.confirm('離開連線對戰？')) leaveToMenu();
      } else simulate(dt);
    } else if (game.mode === 'paused') {
      if (input.hit('pause') || input.hit('start')) game.mode = 'play';
    } else if (game.mode === 'over') {
      if (game.online && net.role === 'host') {
        if (input.hit('start')) startOnline('host');
        else if (input.hit('pause')) leaveToMenu();
      } else if (input.hit('start')) newGame(true);
    }
    if (net.role === 'host') hostNetTick(dt);
    if (voice.an[0] || voice.an[1]) updateVoiceLevels(dt);
    // cosmetic timers
    game.cheer = Math.max(0, game.cheer - dt * 0.8);
    for (const t of game.texts) t.t += dt;
    game.texts = game.texts.filter((t) => t.t < 1.6);
    if (game.banner) { game.banner.t += dt; if (game.banner.t > game.banner.dur) game.banner = null; }
    updateCamera(dt);
    input.endFrame();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    tick(dt);
    render();
    requestAnimationFrame(frame);
  }

  newGame(true);
  requestAnimationFrame(frame);
  // shared invite link: ?room=CODE joins straight away
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) openJoin(roomParam.toUpperCase().slice(0, 5), true);

  // debug / test hook
  window.__bb = {
    game, ball, cam, HOOPS,
    get players() { return players; },
    get controlled() { return ctrl[game.localTeam]; },
    ctrl, net, remoteInput, voice,
    newGame, startGame,
    _: { giveTo, startShot, releaseShot, qFromT, startDunk, doInbound, hostRoom, openJoin },
    step(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) tick(dt); },
  };
})();
