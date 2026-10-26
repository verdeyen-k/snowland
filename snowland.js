// Snow Land: 2 to 4 players take turns in a snowy field. Scoop up snow, then spend it: 1 snow throws a snowball,
// 3 builds a wall that blocks snowballs, 5 builds a tower to stand on so your snowballs fly farther.
// Get hit and you're out. The last one standing wins.
(() => {
  // ── The rules ────────────────────────────────────────────────────────────
  const N = 11;                    // the field is N × N squares
  const STEPS = 2, RANGE = 4, TOWER_RANGE = 7, SCOOP = 2, MAX_SNOW = 10, START_SNOW = 1, WALL_HP = 2;
  const COST = { throw: 1, wall: 3, tower: 5 };
  const COLORS = ['#ff6b6b', '#51cf66', '#4dabf7', '#ffd43b'];
  const COLOR_NAMES = ['Red', 'Green', 'Blue', 'Yellow'];
  const MAX_PLAYERS = COLORS.length;
  // The 8 straight-line directions, clockwise from up. Walking uses the even ones (up, right, down, left).
  const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const CORNERS = [[0, 0], [N - 1, N - 1], [N - 1, 0], [0, N - 1]];

  // A seeded random number generator, so every device grows the same trees from the room's seed.
  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const inField = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const key = (x, y) => y * N + x;

  // Trees: the same pattern in all four corners of the field so nobody gets a better start. The corners
  // themselves are kept clear, and every open square can be reached.
  function buildTrees(seed) {
    for (let s = seed; ; s++) {
      const r = rng(s), trees = new Set(), half = (N - 1) / 2;
      for (let k = 0, placed = 0; placed < 5 && k < 50; k++) {
        const x = Math.floor(r() * (half + 1)), y = Math.floor(r() * (half + 1));
        if (x + y < 4 || (x === half && y === half) || trees.has(key(x, y))) continue;
        placed++;
        for (const [a, b] of [[x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y]]) trees.add(key(a, b));
      }
      const seen = new Set([0]), q = [[0, 0]];
      while (q.length) {
        const [x, y] = q.pop();
        for (let d = 0; d < 8; d += 2) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (inField(nx, ny) && !trees.has(key(nx, ny)) && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); q.push([nx, ny]); }
        }
      }
      if (seen.size === N * N - trees.size) return trees;
    }
  }

  function newState(seed, n, lives) {
    return { trees: buildTrees(seed), builds: new Map(), turn: 0, over: false, winner: -1,
      players: CORNERS.slice(0, n).map(([x, y]) => ({ x, y, hp: lives, snow: START_SNOW, out: false })) };
  }
  const playerAt = (st, x, y) => st.players.findIndex(p => !p.out && p.x === x && p.y === y);
  const wallAt = (st, x, y) => { const b = st.builds.get(key(x, y)); return b && b.k === 'wall'; };
  const solid = (st, x, y) => !inField(x, y) || st.trees.has(key(x, y)) || wallAt(st, x, y);
  const rangeAt = (st, x, y) => { const b = st.builds.get(key(x, y)); return b && b.k === 'tower' ? TOWER_RANGE : RANGE; };

  // Squares player i can walk to this turn (key → steps): up to STEPS steps, around trees, walls and other players.
  function reach(st, i) {
    const p = st.players[i], dist = new Map([[key(p.x, p.y), 0]]), q = [[p.x, p.y]];
    while (q.length) {
      const [x, y] = q.shift(), d = dist.get(key(x, y));
      if (d === STEPS) continue;
      for (let k = 0; k < 8; k += 2) {
        const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
        if (solid(st, nx, ny) || dist.has(key(nx, ny)) || playerAt(st, nx, ny) >= 0) continue;
        dist.set(key(nx, ny), d + 1); q.push([nx, ny]);
      }
    }
    return dist;
  }

  // Where a snowball thrown from (x, y) in direction d goes: the squares it flies over, and what it hits.
  function flight(st, x, y, d) {
    const [dx, dy] = DIRS[d], path = [], r = rangeAt(st, x, y);
    for (let k = 1; k <= r; k++) {
      const tx = x + dx * k, ty = y + dy * k;
      if (!inField(tx, ty)) break;
      path.push([tx, ty]);
      if (st.trees.has(key(tx, ty))) return { path, hit: 'tree' };
      if (wallAt(st, tx, ty)) return { path, hit: 'wall' };
      const v = playerAt(st, tx, ty);
      if (v >= 0) return { path, hit: 'player', victim: v };
    }
    return { path, hit: null };
  }

  // Play move mv: { p: player, a: action, x, y: where they walked to, d: direction }. Returns what happened
  // (for the animation), or null if the move isn't allowed.
  function apply(st, mv) {
    if (st.over || !mv) return null;
    const i = mv.p, p = st.players[i];
    if (!p || p.out) return null;
    // Someone left the game.
    if (mv.a === 'quit') { p.out = true; endTurn(st, i, st.turn === i); return { a: 'quit', p: i }; }
    if (st.turn !== i) return null;
    const from = [p.x, p.y], to = [mv.x ?? p.x, mv.y ?? p.y];
    if (!reach(st, i).has(key(to[0], to[1]))) return null;
    const info = { a: mv.a, p: i, from, to };
    p.x = to[0]; p.y = to[1];
    if (!act(st, p, mv, info)) { p.x = from[0]; p.y = from[1]; return null; }
    endTurn(st, i, true);
    return info;
  }
  function act(st, p, mv, info) {
    if (mv.a === 'pass') return true;
    if (mv.a === 'scoop') { p.snow = Math.min(MAX_SNOW, p.snow + SCOOP); return true; }
    if (mv.a === 'throw') {
      if (p.snow < COST.throw || !DIRS[mv.d]) return false;
      p.snow -= COST.throw;
      const f = flight(st, p.x, p.y, mv.d), end = f.path[f.path.length - 1];
      Object.assign(info, f);
      if (f.hit === 'wall') { const b = st.builds.get(key(...end)); if (--b.hp <= 0) { st.builds.delete(key(...end)); info.broke = true; } }
      if (f.hit === 'player') { const v = st.players[f.victim]; if (--v.hp <= 0) { v.out = true; info.out = true; } }
      return true;
    }
    if (mv.a === 'wall') {
      const D = DIRS[mv.d];
      if (!D || p.snow < COST.wall) return false;
      const tx = p.x + D[0], ty = p.y + D[1];
      if (solid(st, tx, ty) || st.builds.has(key(tx, ty)) || playerAt(st, tx, ty) >= 0) return false;
      p.snow -= COST.wall;
      st.builds.set(key(tx, ty), { k: 'wall', hp: WALL_HP });
      info.at = [tx, ty];
      return true;
    }
    if (mv.a === 'tower') {
      if (p.snow < COST.tower || st.builds.has(key(p.x, p.y))) return false;
      p.snow -= COST.tower;
      st.builds.set(key(p.x, p.y), { k: 'tower' });
      info.at = [p.x, p.y];
      return true;
    }
    return false;
  }
  function endTurn(st, i, advance) {
    const alive = st.players.map((_, k) => k).filter(k => !st.players[k].out);
    if (alive.length <= 1 && st.players.length > 1) { st.over = true; st.winner = alive.length ? alive[0] : -1; return; }
    if (!advance) return;
    for (let k = 1; k <= st.players.length; k++) {
      const j = (i + k) % st.players.length;
      if (!st.players[j].out) { st.turn = j; return; }
    }
  }
  function replay(seed, n, lives, moves) {
    const st = newState(seed, n, lives);
    st.last = null;
    for (const mv of moves) { const r = apply(st, mv); if (r) st.last = r; }
    return st;
  }

  // ── Online rooms ─────────────────────────────────────────────────────────
  // Bump with the ?v= on the script in index.html whenever what goes in the room changes.
  const VERSION = 1;
  const OUTDATED = 'That room is using a different version of Snow Land. Everyone needs to refresh the page.';
  const ROOMS = 'snowland/rooms';

  const db = window.firebase ? (firebase.initializeApp({
    apiKey:            'AIzaSyAsJboNGVuESMhkivllUD0o8MUB5LUCMRQ',
    authDomain:        'kvgames.firebaseapp.com',
    databaseURL:       'https://kvgames-default-rtdb.firebaseio.com',
    projectId:         'kvgames',
    storageBucket:     'kvgames.firebasestorage.app',
    messagingSenderId: '463308384695',
    appId:             '1:463308384695:web:5d57623ebd52101ad26032',
  }), firebase.database()) : null;

  const $ = id => document.getElementById(id);
  const show = id => {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    if (id !== 'game') $('over').hidden = true;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const myId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  // Online: { code, ref, st, listener, joining }. On this device: { local: true, st }. st is the room:
  // { host, phase, players: {id: {name, slot}}, lives, seed, order: [{id, name, slot}], moves: [...] }
  let room = null;

  // Firebase hands arrays back as objects ({0: x, 1: y}) and drops empty ones.
  const toArr = v => !v ? [] : Array.isArray(v) ? v.filter(x => x != null) : Object.keys(v).sort((a, b) => a - b).map(k => v[k]);
  const playerList = st => Object.entries((st && st.players) || {}).filter(([, p]) => p && p.name)
    .map(([id, p]) => ({ id, ...p })).sort((a, b) => a.slot - b.slot);
  const clampLives = n => Math.max(1, Math.min(3, Number(n) || 1));
  const roomState = st => replay(st.seed, toArr(st.order).length, clampLives(st.lives), toArr(st.moves));

  function genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  function busy(on) { for (const b of document.querySelectorAll('#menu button')) b.disabled = on; }
  function myName() {
    const name = $('name').value.trim().slice(0, 14);
    if (!name) { $('menu-error').textContent = 'Type your name first.'; $('name').focus(); return null; }
    store.set('snowland-name', name);
    return name;
  }
  const NO_SERVER = "Can't reach the game server. Check the internet connection.";

  async function createRoom(name) {
    if (!db) { $('menu-error').textContent = NO_SERVER; return; }
    busy(true);
    $('menu-error').textContent = '';
    try {
      let code, ref;
      for (let i = 0; i < 10; i++) {
        code = genCode();
        ref = db.ref(`${ROOMS}/${code}`);
        if (!(await ref.get()).exists()) break;
      }
      await ref.set({ host: myId, v: VERSION, created: firebase.database.ServerValue.TIMESTAMP, phase: 'lobby',
        lives: clampLives(store.get('snowland-lives')), players: { [myId]: { name, slot: 0 } } });
      ref.onDisconnect().remove();
      await enterRoom(code, ref);
    } catch (e) {
      $('menu-error').textContent = "Couldn't create a room. Check the internet connection.";
    }
    busy(false);
  }

  async function joinRoom(code, name) {
    if (!db) { $('menu-error').textContent = NO_SERVER; return; }
    busy(true);
    $('menu-error').textContent = '';
    const ref = db.ref(`${ROOMS}/${code}`);
    try {
      const st = await enterRoom(code, ref, true);
      const problem = !st || !st.host ? `There's no room ${code}.` : st.v !== VERSION ? OUTDATED
        : st.phase !== 'lobby' ? 'That game has already started. Wait for it to finish, then join.'
        : playerList(st).length >= MAX_PLAYERS ? `That room is full (${MAX_PLAYERS} players).` : null;
      if (problem) throw new Error(problem);
      // A transaction, so two people joining at once can't take the same color.
      const res = await ref.child('players').transaction(cur => {
        if (!cur) return;
        const taken = new Set(Object.values(cur).filter(p => p && p.name).map(p => p.slot));
        const slot = COLORS.findIndex((_, i) => !taken.has(i));
        if (slot < 0) return;
        cur[myId] = { name, slot };
        return cur;
      });
      if (!res.committed) throw new Error(`That room is full (${MAX_PLAYERS} players).`);
      ref.child(`players/${myId}`).onDisconnect().remove();
      room.joining = false;
      render();
    } catch (e) {
      leaveRoom();
      show('menu');
      $('menu-error').textContent = e.message && !/^FIREBASE|permission/i.test(e.message) ? e.message
        : "Couldn't join. Check the code and the internet connection.";
    }
    busy(false);
  }

  // Start listening to the room. Resolves with its first data, so a join can check it before taking a seat.
  function enterRoom(code, ref, joining = false) {
    leaveRoom();
    room = { code, ref, st: null, joining };
    const r = room;
    return new Promise(resolve => {
      r.listener = ref.on('value', snap => {
        if (room !== r) return;
        r.st = snap.val();
        if (resolve) { const f = resolve; resolve = null; f(r.st); if (joining) return; }
        if (!r.joining) render();
      }, () => { if (resolve) { const f = resolve; resolve = null; f(null); } });
    });
  }
  function leaveRoom() {
    const r = room;
    if (!r) return;
    room = null;
    view = null;
    if (r.local) return;
    r.ref.off('value', r.listener);
    if (r.st && r.st.host === myId) { r.ref.onDisconnect().cancel(); r.ref.remove(); }
    else if (!r.joining) {
      const c = r.ref.child(`players/${myId}`);
      c.onDisconnect().cancel();
      c.remove();
    }
  }

  const newSeed = () => Math.floor(Math.random() * 2 ** 31);
  function startGame() {
    const st = room && room.st;
    if (!st || st.host !== myId || playerList(st).length < 2) return;
    room.ref.update({ phase: 'play', seed: newSeed(), moves: null,
      order: playerList(st).map(p => ({ id: p.id, name: p.name, slot: p.slot })) });
  }
  function playAgain() {
    if (room && room.local) { startLocal(toArr(room.st.order).length, room.st.lives); return; }
    if (room && room.st && room.st.host === myId) room.ref.update({ phase: 'lobby', seed: null, order: null, moves: null });
  }

  // Everyone on one device: the same room, kept here instead of online, and whoever's turn it is plays.
  function startLocal(n, lives) {
    leaveRoom();
    const order = COLOR_NAMES.slice(0, n).map((name, slot) => ({ id: 'p' + slot, name, slot }));
    room = { local: true, st: { phase: 'play', lives, seed: newSeed(), order, moves: [],
      players: Object.fromEntries(order.map(p => [p.id, { name: p.name, slot: p.slot }])) } };
    render();
  }

  // Send my move. Online it's a transaction, so it only goes through if it's still my turn and the move still works.
  function sendMove(mv) {
    if (!room) return;
    if (room.local) {
      const st = room.st, g = roomState(st);
      if (!apply(g, mv)) return;
      st.moves.push(mv);
      if (g.over) st.phase = 'over';
      render();
      return;
    }
    room.ref.transaction(cur => {
      if (!cur || cur.phase !== 'play') return;
      const order = toArr(cur.order), moves = toArr(cur.moves), g = roomState(cur);
      if (!order[mv.p] || order[mv.p].id !== myId || !apply(g, mv)) return;
      moves.push(mv);
      cur.moves = moves;
      if (g.over) cur.phase = 'over';
      return cur;
    });
  }

  // ── The game on screen ───────────────────────────────────────────────────
  // view: { seed, count, g: the replayed state, anim, mode: 'move' | 'throw' | 'wall', pending: [x, y] or null }
  let view = null;
  const MOVE_MS = 170, BALL_MS = 85;

  const order = () => toArr(room.st.order);
  const colorOf = i => COLORS[(order()[i] || {}).slot ?? i];
  const nameOf = i => (order()[i] || {}).name || COLOR_NAMES[i];
  // On one device, whoever's turn it is plays. Online, only on my turn.
  const myTurn = () => view && !view.g.over && room.st.phase === 'play' && !view.anim &&
    (room.local || (order()[view.g.turn] || {}).id === myId);
  const myIndex = () => room.local ? -1 : order().findIndex(o => o.id === myId);

  function syncView() {
    const st = room.st, moves = toArr(st.moves);
    if (!view || view.seed !== st.seed) view = { seed: st.seed, count: 0, g: roomState({ ...st, moves: [] }), anim: null, mode: 'move', pending: null, wasMine: false };
    if (moves.length === view.count) return;
    const fresh = moves.length === view.count + 1;
    view.g = roomState(st);
    view.count = moves.length;
    view.mode = 'move'; view.pending = null;
    if (fresh && view.g.last) startAnim(view.g.last);
  }

  // Animate the last move: walk over, then the snowball flies.
  function startAnim(info) {
    if (info.a === 'quit') return;
    const walk = Math.abs(info.to[0] - info.from[0]) + Math.abs(info.to[1] - info.from[1]);
    const a = { info, t0: performance.now(), walk: walk * MOVE_MS, fly: info.path ? info.path.length * BALL_MS : 0 };
    a.end = a.walk + a.fly + (info.path ? 450 : 150);
    view.anim = a;
    if (info.a === 'scoop') setTimeout(() => sfx.scoop(), a.walk);
    if (info.a === 'wall' || info.a === 'tower') setTimeout(() => sfx.build(), a.walk);
    if (info.a === 'throw') {
      setTimeout(() => sfx.whoosh(), a.walk);
      setTimeout(() => {
        if (info.hit === 'player') { sfx.splat(); if (info.out) setTimeout(() => sfx.out(), 150); }
        else sfx.thud();
        const [x, y] = info.path.length ? info.path[info.path.length - 1] : info.to;
        for (let k = 0; k < 12; k++) particles.push({ x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 0.5 });
      }, a.walk + a.fly);
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  const canvas = $('canvas'), g2 = canvas.getContext('2d');
  let T = 30, particles = [], lastFrame = performance.now();

  function fit() {
    const wrap = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(100, Math.floor(Math.min(wrap.width - 12, wrap.height)));
    canvas.style.width = canvas.style.height = size + 'px';
    canvas.width = canvas.height = Math.round(size * dpr);
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    T = size / N;
  }
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 300));

  function drawTree(x, y) {
    const cx = (x + 0.5) * T, by = (y + 0.92) * T;
    g2.fillStyle = 'rgba(60,90,130,.18)'; g2.beginPath(); g2.ellipse(cx, by, T * 0.38, T * 0.12, 0, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#7a4f2a'; g2.fillRect(cx - T * 0.07, by - T * 0.2, T * 0.14, T * 0.2);
    for (let k = 0; k < 3; k++) {
      const w = T * (0.42 - k * 0.1), top = by - T * (0.55 + k * 0.22), bot = by - T * (0.15 + k * 0.22);
      g2.fillStyle = '#2f8f5b'; g2.beginPath(); g2.moveTo(cx, top); g2.lineTo(cx + w, bot); g2.lineTo(cx - w, bot); g2.closePath(); g2.fill();
      g2.fillStyle = '#fff'; g2.beginPath(); g2.moveTo(cx, top); g2.lineTo(cx + w * 0.4, top + (bot - top) * 0.4); g2.lineTo(cx - w * 0.4, top + (bot - top) * 0.4); g2.closePath(); g2.fill();
    }
  }

  function drawWall(x, y, hp, alpha = 1) {
    const px = x * T, py = y * T;
    g2.globalAlpha = alpha;
    g2.fillStyle = 'rgba(60,90,130,.2)'; g2.fillRect(px + T * 0.06, py + T * 0.82, T * 0.9, T * 0.14);
    g2.fillStyle = '#c6dcf2'; g2.fillRect(px + T * 0.04, py + T * 0.3, T * 0.92, T * 0.58);      // front
    g2.fillStyle = '#ffffff'; g2.fillRect(px + T * 0.04, py + T * 0.08, T * 0.92, T * 0.26);     // top
    g2.strokeStyle = '#8fb3d4'; g2.lineWidth = Math.max(1, T / 30);
    g2.strokeRect(px + T * 0.04, py + T * 0.08, T * 0.92, T * 0.8);
    g2.beginPath();
    g2.moveTo(px + T * 0.04, py + T * 0.59); g2.lineTo(px + T * 0.96, py + T * 0.59);
    g2.moveTo(px + T * 0.5, py + T * 0.34); g2.lineTo(px + T * 0.5, py + T * 0.59);
    g2.moveTo(px + T * 0.27, py + T * 0.59); g2.lineTo(px + T * 0.27, py + T * 0.88);
    g2.moveTo(px + T * 0.73, py + T * 0.59); g2.lineTo(px + T * 0.73, py + T * 0.88);
    g2.stroke();
    if (hp < WALL_HP) {
      g2.strokeStyle = '#4a6c8f'; g2.lineWidth = Math.max(1.5, T / 18); g2.beginPath();
      g2.moveTo(px + T * 0.3, py + T * 0.12); g2.lineTo(px + T * 0.45, py + T * 0.45); g2.lineTo(px + T * 0.36, py + T * 0.62); g2.lineTo(px + T * 0.52, py + T * 0.85);
      g2.stroke();
    }
    g2.globalAlpha = 1;
  }

  function drawTower(x, y) {
    const px = x * T, py = y * T, m = T * 0.06;
    g2.fillStyle = 'rgba(60,90,130,.22)'; g2.fillRect(px + m, py + T * 0.86, T - 2 * m, T * 0.12);
    g2.fillStyle = '#b9d3ec'; g2.fillRect(px + m, py + m, T - 2 * m, T - 2 * m);
    g2.fillStyle = '#e6f1fc'; g2.fillRect(px + T * 0.18, py + T * 0.18, T * 0.64, T * 0.64);
    // Battlements around the top.
    g2.fillStyle = '#ffffff'; const b = T * 0.16;
    for (const [a, c] of [[0, 0], [0.42, 0], [0.84, 0], [0, 0.42], [0.84, 0.42], [0, 0.84], [0.42, 0.84], [0.84, 0.84]]) g2.fillRect(px + m + a * (T - 2 * m - b) / 0.84, py + m + c * (T - 2 * m - b) / 0.84, b, b);
    g2.strokeStyle = '#7fa6cc'; g2.lineWidth = Math.max(1, T / 30); g2.strokeRect(px + m, py + m, T - 2 * m, T - 2 * m);
  }

  // A kid in a snowsuit, in their color, with a bobble hat.
  function drawKid(fx, fy, color, raised, alpha = 1) {
    const cx = (fx + 0.5) * T, cy = (fy + 0.55) * T - (raised ? T * 0.16 : 0), s = raised ? 1.12 : 1;
    g2.globalAlpha = alpha;
    g2.fillStyle = 'rgba(60,90,130,.22)'; g2.beginPath(); g2.ellipse((fx + 0.5) * T, (fy + 0.86) * T, T * 0.3, T * 0.1, 0, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = color; g2.strokeStyle = 'rgba(0,0,0,.35)'; g2.lineWidth = Math.max(1, T / 25);
    g2.beginPath(); g2.ellipse(cx, cy + T * 0.12 * s, T * 0.26 * s, T * 0.22 * s, 0, 0, Math.PI * 2); g2.fill(); g2.stroke();
    g2.fillStyle = '#f2c9a0'; g2.beginPath(); g2.arc(cx, cy - T * 0.12 * s, T * 0.17 * s, 0, Math.PI * 2); g2.fill(); g2.stroke();
    g2.fillStyle = color; g2.beginPath(); g2.arc(cx, cy - T * 0.15 * s, T * 0.18 * s, Math.PI, 0); g2.fill(); g2.stroke();
    g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(cx, cy - T * 0.34 * s, T * 0.07 * s, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#222'; for (const ex of [-0.06, 0.06]) { g2.beginPath(); g2.arc(cx + T * ex * s, cy - T * 0.08 * s, T * 0.025 * s + 0.5, 0, Math.PI * 2); g2.fill(); }
    g2.globalAlpha = 1;
  }

  function shade(x, y, color) { g2.fillStyle = color; g2.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); }

  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastFrame) / 1000); lastFrame = t;
    if (!view || !room || $('game').hidden) return;
    const g = view.g, size = T * N, a = view.anim, at = a ? t - a.t0 : 0;
    if (a && at > a.end) { view.anim = null; updateControls(); }

    // The snowy field, in a soft checkerboard so squares are easy to count.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g2.fillStyle = (x + y) % 2 ? '#eaf3fc' : '#f6faff'; g2.fillRect(x * T, y * T, T + 0.5, T + 0.5); }

    // What I can do: squares to walk to, throw lines, or wall spots.
    const mine = myTurn(), me = g.players[g.turn];
    const here = view.pending || [me.x, me.y];
    if (mine) {
      if (view.mode === 'move') for (const k of reach(g, g.turn).keys()) { const x = k % N, y = Math.floor(k / N); if (x !== here[0] || y !== here[1]) shade(x, y, 'rgba(255,184,77,.38)'); }
      if (view.mode === 'throw') withPending(() => {
        for (let d = 0; d < 8; d++) {
          const f = flight(g, here[0], here[1], d);
          f.path.forEach(([x, y], k) => shade(x, y, k === f.path.length - 1 && f.hit === 'player' ? 'rgba(255,80,80,.5)' : 'rgba(77,171,247,.32)'));
        }
      });
      if (view.mode === 'wall') withPending(() => {
        for (const [x, y] of wallSpots(here)) {
          g2.strokeStyle = '#ff9f1c'; g2.lineWidth = 3; g2.setLineDash([5, 4]); g2.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6); g2.setLineDash([]);
        }
      });
    }

    // Towers first (they're under people), then everything else, top to bottom so nearer things overlap.
    for (const [k, b] of g.builds) if (b.k === 'tower') drawTower(k % N, Math.floor(k / N));
    const things = [];
    for (const k of g.trees) things.push({ y: Math.floor(k / N), draw: () => drawTree(k % N, Math.floor(k / N)) });
    for (const [k, b] of g.builds) if (b.k === 'wall') things.push({ y: Math.floor(k / N), draw: () => drawWall(k % N, Math.floor(k / N), b.hp) });
    // A wall that just broke, until the snowball reaches it.
    if (a && a.info.broke && at < a.walk + a.fly) { const [x, y] = a.info.path[a.info.path.length - 1]; things.push({ y, draw: () => drawWall(x, y, 1) }); }
    g.players.forEach((p, i) => {
      let x = p.x, y = p.y, alpha = 1;
      if (p.out) {
        // Knocked out just now: fade away once the snowball lands.
        if (!(a && a.info.victim === i && at < a.end)) return;
        alpha = at < a.walk + a.fly ? 1 : Math.max(0, 1 - (at - a.walk - a.fly) / 400);
      }
      if (a && a.info.p === i && at < a.walk) {
        const k = at / a.walk; x = a.info.from[0] + (a.info.to[0] - a.info.from[0]) * k; y = a.info.from[1] + (a.info.to[1] - a.info.from[1]) * k;
      }
      if (mine && i === g.turn && view.pending) {
        things.push({ y: p.y, draw: () => drawKid(p.x, p.y, colorOf(i), false, 0.3) });
        x = view.pending[0]; y = view.pending[1];
      }
      const b = g.builds.get(key(Math.round(x), Math.round(y))), raised = b && b.k === 'tower' && Number.isInteger(x) && Number.isInteger(y);
      things.push({ y: y + 0.01, draw: () => {
        drawKid(x, y, colorOf(i), raised, alpha);
        // A bouncing arrow over whoever's turn it is.
        if (i === g.turn && !g.over && !a) {
          const bob = Math.sin(t / 180) * T * 0.06, cx = (x + 0.5) * T, top = Math.max(T * 0.16, y * T - T * 0.12 - (raised ? T * 0.16 : 0)) + bob;
          g2.fillStyle = '#ff9f1c'; g2.strokeStyle = 'rgba(0,0,0,.4)'; g2.lineWidth = 1.5;
          g2.beginPath(); g2.moveTo(cx - T * 0.14, top - T * 0.14); g2.lineTo(cx + T * 0.14, top - T * 0.14); g2.lineTo(cx, top + T * 0.02); g2.closePath(); g2.fill(); g2.stroke();
        }
      } });
    });
    things.sort((p, q) => p.y - q.y);
    for (const th of things) th.draw();

    // The snowball in the air, with its shadow on the snow.
    if (a && a.info.path && at >= a.walk && at < a.walk + a.fly) {
      const k = (at - a.walk) / a.fly, [sx, sy] = a.info.to, [ex, ey] = a.info.path[a.info.path.length - 1];
      const bx = (sx + (ex - sx) * k + 0.5) * T, by = (sy + (ey - sy) * k + 0.5) * T, h = Math.sin(Math.PI * k) * T * 0.4 + T * 0.25;
      g2.fillStyle = 'rgba(60,90,130,.25)'; g2.beginPath(); g2.ellipse(bx, by + T * 0.2, T * 0.12, T * 0.05, 0, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = '#fff'; g2.strokeStyle = '#7fa6cc'; g2.lineWidth = 2; g2.beginPath(); g2.arc(bx, by - h + T * 0.2, T * 0.13, 0, Math.PI * 2); g2.fill(); g2.stroke();
    }
    particles = particles.filter(q => (q.life -= dt) > 0);
    for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; g2.fillStyle = `rgba(255,255,255,${q.life * 2})`; g2.strokeStyle = `rgba(127,166,204,${q.life * 2})`; g2.beginPath(); g2.arc(q.x * T, q.y * T, T * 0.06, 0, Math.PI * 2); g2.fill(); g2.stroke(); }
    g2.strokeStyle = 'rgba(127,166,204,.8)'; g2.lineWidth = 2; g2.strokeRect(1, 1, size - 2, size - 2);
  }
  requestAnimationFrame(frame);

  // Work out throws and walls as if the current player were already standing where they're about to walk.
  function withPending(fn) {
    const p = view.g.players[view.g.turn];
    if (!view.pending) return fn();
    const was = [p.x, p.y];
    [p.x, p.y] = view.pending;
    try { return fn(); } finally { [p.x, p.y] = was; }
  }
  const wallSpots = ([x, y]) => DIRS.map(([dx, dy], d) => [x + dx, y + dy, d])
    .filter(([tx, ty]) => !solid(view.g, tx, ty) && !view.g.builds.has(key(tx, ty)) && playerAt(view.g, tx, ty) < 0);

  // ── Controls ─────────────────────────────────────────────────────────────
  function doAction(a, d) {
    if (!myTurn()) return;
    const g = view.g, p = g.players[g.turn], to = view.pending || [p.x, p.y];
    const mv = { p: g.turn, a, x: to[0], y: to[1] };
    if (d != null) mv.d = d;
    if (!apply(roomState(room.st), mv)) { sfx.nope(); return; }
    sendMove(mv);
  }

  canvas.addEventListener('pointerdown', e => {
    if (!myTurn()) return;
    const r = canvas.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / T), y = Math.floor((e.clientY - r.top) / T);
    if (!inField(x, y)) return;
    const g = view.g, p = g.players[g.turn], here = view.pending || [p.x, p.y];
    if (view.mode === 'move') {
      if (reach(g, g.turn).has(key(x, y))) { view.pending = x === p.x && y === p.y ? null : [x, y]; sfx.step(); updateControls(); }
      return;
    }
    // Throw or build toward the tapped square: it has to be in a straight line (or right next to me, for a wall).
    const dx = x - here[0], dy = y - here[1];
    if ((dx || dy) && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) {
      const d = DIRS.findIndex(([a, b]) => a === Math.sign(dx) && b === Math.sign(dy));
      if (view.mode === 'throw') { doAction('throw', d); return; }
      if (view.mode === 'wall' && Math.max(Math.abs(dx), Math.abs(dy)) === 1 && withPending(() => wallSpots(here)).some(s => s[2] === d)) { doAction('wall', d); return; }
    }
    sfx.nope();
  });

  function setMode(m) {
    if (!myTurn()) return;
    view.mode = view.mode === m ? 'move' : m;
    updateControls();
  }
  $('act-scoop').onclick = () => doAction('scoop');
  $('act-throw').onclick = () => setMode('throw');
  $('act-wall').onclick = () => setMode('wall');
  $('act-tower').onclick = () => doAction('tower');
  $('act-pass').onclick = () => doAction('pass');

  function updateControls() {
    if (!view || !room) return;
    const g = view.g, mine = myTurn(), p = g.players[g.turn];
    const tile = view.pending || [p.x, p.y];
    $('act-scoop').disabled = !mine;
    $('act-pass').disabled = !mine;
    $('act-throw').disabled = !mine || p.snow < COST.throw;
    $('act-wall').disabled = !mine || p.snow < COST.wall;
    $('act-tower').disabled = !mine || p.snow < COST.tower || g.builds.has(key(...tile));
    $('act-throw').classList.toggle('on', mine && view.mode === 'throw');
    $('act-wall').classList.toggle('on', mine && view.mode === 'wall');
    if (!mine && view.mode !== 'move') view.mode = 'move';
    const meOut = myIndex() >= 0 && g.players[myIndex()].out;
    $('hint').textContent = g.over ? '' : meOut ? "You're out! ⛄ Watch who wins." : !mine ? (view.anim ? '' : `Waiting for ${nameOf(g.turn)}…`)
      : view.mode === 'throw' ? 'Tap a square in a straight line to throw that way.'
      : view.mode === 'wall' ? 'Tap a square next to you to build the wall.'
      : p.snow === 0 ? 'Walk up to 2 squares (tap one), then scoop some snow.'
      : 'Walk up to 2 squares (tap one), then pick what to do.';
    // Turn and players.
    const sw = i => `<span class="sw" style="background:${colorOf(i)}"></span>`;
    $('turn').innerHTML = g.over ? '' : `${sw(g.turn)} ${room.local ? esc(nameOf(g.turn)) + "'s turn" : (order()[g.turn] || {}).id === myId ? 'Your turn!' : esc(nameOf(g.turn)) + "'s turn"}`;
    $('chips').innerHTML = g.players.map((q, i) => `<span class="chip${i === g.turn && !g.over ? ' on' : ''}${q.out ? ' out' : ''}">${sw(i)}${esc(nameOf(i))}${!room.local && order()[i] && order()[i].id === myId ? ' (you)' : ''}
      <span>${q.out ? '💥' : '❤️'.repeat(q.hp)}</span><span>❄️${q.snow}</span></span>`).join('');
  }

  // ── Sounds ───────────────────────────────────────────────────────────────
  // Made on the fly with Web Audio, so there are no sound files. Phones only allow sound after a tap.
  const sfx = (() => {
    let ac = null, muted = store.get('snowland-mute') === '1';
    function ctx() {
      if (muted) return null;
      if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f, dur, type = 'square', vol = 0.08, slide = 1) {
      const a = ctx(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
    }
    function noise(dur, vol, freq, type = 'lowpass') {
      const a = ctx(); if (!a) return;
      const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = b; f.type = type; f.frequency.value = freq; g.gain.value = vol;
      s.connect(f).connect(g).connect(a.destination); s.start();
    }
    return {
      step() { tone(520, 0.05, 'triangle', 0.06, 1.2); },
      scoop() { noise(0.18, 0.3, 1400); tone(400, 0.12, 'triangle', 0.06, 1.6); },
      build() { noise(0.25, 0.35, 700); setTimeout(() => noise(0.15, 0.3, 900), 120); },
      whoosh() { noise(0.25, 0.25, 2500, 'bandpass'); },
      thud() { noise(0.15, 0.4, 500); },
      splat() { noise(0.25, 0.5, 1200); tone(300, 0.2, 'square', 0.06, 0.5); },
      out() { [523, 392, 330, 262].forEach((f, k) => setTimeout(() => tone(f, 0.2, 'square', 0.07), k * 110)); },
      nope() { tone(160, 0.12, 'square', 0.06, 0.8); },
      ding() { tone(880, 0.12, 'triangle', 0.08); setTimeout(() => tone(1320, 0.18, 'triangle', 0.08), 110); },
      win() { [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 0.25, 'square', 0.09), k * 120)); },
      unlock() { ctx(); },
      get muted() { return muted; },
      toggle() { muted = !muted; store.set('snowland-mute', muted ? '1' : '0'); },
    };
  })();

  // ── Screens ──────────────────────────────────────────────────────────────
  function drawLives(id, n, canChange) {
    for (const b of $(id).children) { b.classList.toggle('on', Number(b.dataset.n) === n); b.disabled = !canChange; }
  }

  function render() {
    if (!room) { show('menu'); return; }
    const st = room.st;
    if (!room.local) {
      if (!st || !st.host) { leaveRoom(); show('menu'); $('menu-error').textContent = 'The host left, so the room closed.'; return; }
      if (!st.players || !st.players[myId]) { leaveRoom(); show('menu'); $('menu-error').textContent = 'You left the room.'; return; }
    }
    const host = room.local || st.host === myId;

    if (st.phase === 'lobby') {
      view = null;
      show('lobby');
      const players = playerList(st);
      $('code').textContent = room.code;
      $('lobby-players').innerHTML = players.map(p => `<li><span class="sw" style="background:${COLORS[p.slot]}"></span><span class="pname">${esc(p.name)}</span>
        <span class="muted">${COLOR_NAMES[p.slot]}${p.id === st.host ? ' · host' : ''}${p.id === myId ? ' · you' : ''}</span></li>`).join('');
      drawLives('lives-lobby', clampLives(st.lives), host);
      $('start').hidden = !host;
      $('start').disabled = players.length < 2;
      $('start').textContent = players.length < 2 ? 'Need 2 players' : `Start (${players.length} players)`;
      $('lobby-wait').hidden = host;
      return;
    }

    const wasMine = myTurn(), before = view && view.count;
    syncView();
    show('game');
    fit();
    const g = view.g;
    // A ding when it becomes my turn online (after the last move's animation).
    if (!room.local && !wasMine && before !== view.count && (order()[g.turn] || {}).id === myId && !g.over)
      setTimeout(() => sfx.ding(), view.anim ? view.anim.end : 0);
    updateControls();
    if (view.anim) setTimeout(updateControls, view.anim.end + 20);

    const over = st.phase === 'over' && g.over;
    if (over && !view.overShown) {
      view.overShown = true;
      const showOver = () => {
        if (!room || room.st.phase !== 'over') return;
        const w = g.winner;
        $('winner').innerHTML = w < 0 ? "Nobody's left standing! ⛄"
          : `<span class="sw" style="background:${colorOf(w)}"></span> ${!room.local && order()[w].id === myId ? 'You are' : esc(nameOf(w)) + ' is'} the last one standing! ⛄`;
        $('again').hidden = !host;
        $('again-wait').hidden = host;
        $('over').hidden = false;
        sfx.win();
      };
      setTimeout(showOver, view.anim ? view.anim.end : 0);
    }
    if (!over) $('over').hidden = true;

    // If someone leaves partway through, the host takes them out of the game.
    if (!room.local && host && st.phase === 'play') {
      order().forEach((o, i) => {
        if (st.players[o.id] || g.players[i].out) return;
        room.ref.transaction(cur => {
          if (!cur || cur.phase !== 'play' || (cur.players || {})[o.id]) return;
          const gg = roomState(cur), mv = { p: i, a: 'quit' };
          if (!apply(gg, mv)) return;
          cur.moves = [...toArr(cur.moves), mv];
          if (gg.over) cur.phase = 'over';
          return cur;
        });
      });
    }
  }

  // ── Menu ─────────────────────────────────────────────────────────────────
  let menuLives = clampLives(store.get('snowland-lives')), localCount = Math.max(2, Math.min(4, Number(store.get('snowland-local')) || 2));
  const drawMenu = () => {
    drawLives('lives-menu', menuLives, true);
    for (const b of $('local-count').children) b.classList.toggle('on', Number(b.dataset.n) === localCount);
  };
  for (const b of $('lives-menu').children) b.onclick = () => { menuLives = Number(b.dataset.n); store.set('snowland-lives', menuLives); drawMenu(); };
  for (const b of $('local-count').children) b.onclick = () => { localCount = Number(b.dataset.n); store.set('snowland-local', localCount); drawMenu(); };
  for (const b of $('lives-lobby').children) b.onclick = () => {
    if (room && !room.local && room.st && room.st.host === myId) { store.set('snowland-lives', b.dataset.n); room.ref.child('lives').set(Number(b.dataset.n)); }
  };
  drawMenu();

  $('local').onclick = () => startLocal(localCount, menuLives);
  $('name').value = store.get('snowland-name') || '';
  $('create').onclick = () => { const n = myName(); if (n) createRoom(n); };
  $('join').onclick = () => {
    const n = myName(); if (!n) return;
    const code = $('join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { $('menu-error').textContent = 'Room codes are 4 letters.'; return; }
    joinRoom(code, n);
  };
  $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
  $('start').onclick = startGame;
  $('again').onclick = playAgain;
  for (const id of ['lobby-leave', 'game-leave', 'over-leave']) $(id).onclick = () => { leaveRoom(); show('menu'); drawMenu(); };
  const drawMute = () => { $('mute').textContent = sfx.muted ? '🔇' : '🔊'; };
  $('mute').onclick = () => { sfx.toggle(); drawMute(); };
  drawMute();
  window.addEventListener('pagehide', leaveRoom);
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(ev, () => sfx.unlock(), { capture: true, passive: true });

  if (!db) $('menu-error').textContent = NO_SERVER;
  show('menu');
})();
