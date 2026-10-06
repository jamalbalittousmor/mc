// =====================================================================
//  WORLD GENERATION — pure functions of (seed, cell)
//  Мир — бесконечная сетка клеток CELL×CELL, сгруппированных в чанки CN×CN.
//  Каждому чанку соответствует зона; планировка чанка строится одним из
//  генераторов (LAYOUTS) и кешируется. Стены на границе чанков считаются
//  отдельной функцией от общей границы, поэтому соседи всегда согласованы,
//  а на каждой стороне чанка есть хотя бы один проход (мир связный).
// =====================================================================
const CELL = 4, CN = 6, CS = CELL * CN, RADIUS = 2;
const POOL_D = 2.2, WATER_Y = -0.3, WALL_T = 0.2, FLOOD_Y = 0.07;
const WARM = 0xffe9c0, COOL = 0xe4f3ff;
// layout: rooms | maze | open | office | noise (старый генератор по wallP/doorP — для модов)
// dirt: 0 — чисто … 1 — разруха (пятна, лужи, упавшие плитки). Лиминальные пространства в основном чистые.
// pitP / stageP: шанс, что большая комната получит утопленную «яму» со ступенями или помост.
// doorObjP: шанс настоящей двери в дверном проёме; switchP: выключатели света в комнатах.
const ZONES = {
  lobby:   { name: 'Уровень 0 · «Лобби»', layout: 'rooms', H: 2.9, roomMax: 10, gapP: .3, openP: .45, extraP: .35, halfP: .15, pillarP: .03, pillarS: .5, lightP: .96, lightGrid: 1, brokenP: .03, flickerP: .03, pitP: .14, stageP: .05, doorObjP: .1, switchP: .35, fountainP: .5, dirt: .03, color: WARM, mat: 'yellow', tint: 0xffffff, carpet: 0xffffff, fog: [0x0e0c07, .045], reverb: .3 },
  maze:    { name: 'Коридоры', layout: 'maze', H: 2.7, loopP: .16, doorP: .25, pillarP: 0, pillarS: .5, lightP: .9, lightGrid: 2, brokenP: .08, flickerP: .06, doorObjP: .18, dirt: .1, color: WARM, mat: 'yellow', tint: 0xf3e9c6, carpet: 0xe8e0c8, fog: [0x0c0a06, .055], reverb: .25 },
  office:  { name: 'Пустой офис', layout: 'office', H: 2.8, roomMax: 12, gapP: .05, openP: .2, extraP: .25, halfP: .08, lowP: .5, pillarP: .05, pillarS: .45, lightP: .95, lightGrid: 1, brokenP: .1, flickerP: .06, pitP: .04, doorObjP: .45, switchP: .7, fountainP: .35, dirt: .12, color: 0xf3f6e8, mat: 'yellow', tint: 0xdde3cf, carpet: 0xa3acaa, fog: [0x0a0b09, .05], reverb: .3 },
  dark:    { name: 'Обесточенный сектор', layout: 'rooms', H: 2.9, roomMax: 6, gapP: .1, openP: .3, extraP: .3, halfP: .2, pillarP: .06, pillarS: .5, lightP: .35, brokenP: .7, flickerP: .25, pitP: .08, doorObjP: .35, switchP: .2, dirt: .7, color: 0xffdca0, mat: 'yellow', tint: 0xe4d4a4, carpet: 0xd8ccaa, fog: [0x040302, .07], reverb: .35 },
  hall:    { name: 'Колонный зал', layout: 'open', H: 4.6, wallP: .04, pillarP: .9, pillarS: .75, lightP: .9, lightGrid: 2, brokenP: .08, flickerP: .03, pitP: .3, stageP: .3, dirt: .02, color: 0xfff0d0, mat: 'yellow', tint: 0xffffff, carpet: 0xffffff, fog: [0x0c0b08, .042], reverb: .75 },
  void:    { name: 'Пустошь', layout: 'open', H: 6.5, wallP: .03, pillarP: .16, pillarS: 1.3, lightP: .14, brokenP: .25, flickerP: .12, pitP: .2, stageP: .1, dirt: .08, color: 0xffe2b0, mat: 'yellow', tint: 0xd8c898, carpet: 0xb8aa88, fog: [0x030302, .06], reverb: 1.0 },
  pools:   { name: 'Уровень 37 · «Бассейны»', layout: 'open', H: 4.2, wallP: .08, pillarP: .28, pillarS: .6, lightP: .95, lightGrid: 1, brokenP: .03, flickerP: .02, fountainP: .4, dirt: 0, color: COOL, mat: 'tile', tint: 0xffffff, carpet: 0xffffff, fog: [0x081012, .04], reverb: 1.0 },
  flooded: { name: 'Затопленный сектор', layout: 'rooms', H: 2.9, roomMax: 8, gapP: .25, openP: .4, extraP: .3, halfP: .12, pillarP: .06, pillarS: .5, lightP: .85, lightGrid: 1, brokenP: .12, flickerP: .06, doorObjP: .15, switchP: .2, dirt: .3, color: WARM, mat: 'yellow', tint: 0xe6d8a8, carpet: 0x8c8a6a, fog: [0x0a0c0a, .055], reverb: .55, flood: true },
};
for (const k in ZONES) ZONES[k].key = k;
const ZONE_W = [['lobby', .27], ['maze', .12], ['office', .12], ['dark', .08], ['hall', .1], ['pools', .14], ['flooded', .09], ['void', .06]];
const WORLD = { exitCx: 0, exitCz: 0, exitX: 0, exitZ: 0, level: 1 };
const zoneCache = new Map(), edgeCache = new Map(), fixCache = new Map(), layoutCache = new Map();
const deadFixtures = new Set(), tempOff = new Set(), switchOff = new Set();
const variants = new Map();
function initWorldGen(seed, level = 1) {
  SEED = seed | 0; WORLD.level = level; zoneCache.clear(); edgeCache.clear(); fixCache.clear(); layoutCache.clear();
  const a = hash3(0, 0, 555) * Math.PI * 2, d = BAL.exitDist[0] + hash3(0, 0, 556) * (BAL.exitDist[1] - BAL.exitDist[0]) + (level - 1) * BAL.exitDistPerLevel;
  WORLD.exitCx = Math.floor(Math.cos(a) * d / CS); WORLD.exitCz = Math.floor(Math.sin(a) * d / CS);
  WORLD.exitX = WORLD.exitCx * CS + CS / 2; WORLD.exitZ = WORLD.exitCz * CS + CS / 2;
}
const isSpawnChunk = (cx, cz) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
function zoneKeyOf(cx, cz) {
  const k = ckey(cx, cz); let z = zoneCache.get(k); if (z) return z;
  if (isSpawnChunk(cx, cz)) z = 'lobby';
  else if ((cx === 2 || cx === 3) && (cz === 0 || cz === -1)) z = 'pools';
  else if (cx === WORLD.exitCx && cz === WORLD.exitCz) z = 'lobby';
  else {
    const wx = cx + (vnoise(cx * .25, cz * .25, 11) - .5) * 3, wz = cz + (vnoise(cx * .25, cz * .25, 12) - .5) * 3;
    const list = ZONE_W.filter(w => ZONES[w[0]]);
    let r = hash3(Math.floor(wx / 3), Math.floor(wz / 3), 13) * list.reduce((a, x) => a + x[1], 0); z = 'lobby';
    for (const [n, w] of list) { if (r < w) { z = n; break; } r -= w; }
  }
  zoneCache.set(k, z); return z;
}
const chunkOf = g => Math.floor(g / CN);
const zoneOfCell = (gx, gz) => ZONES[zoneKeyOf(chunkOf(gx), chunkOf(gz))] || ZONES.lobby;
const zoneAt = (x, z) => zoneOfCell(Math.floor(x / CELL), Math.floor(z / CELL));
const variantOf = (cx, cz) => variants.get(cx + ',' + cz) || 0;
const isExitCell = (gx, gz) => chunkOf(gx) === WORLD.exitCx && chunkOf(gz) === WORLD.exitCz && Math.abs(gx - (WORLD.exitCx * CN + CN / 2)) <= 1 && Math.abs(gz - (WORLD.exitCz * CN + CN / 2)) <= 1;
function isPool(gx, gz) {
  const cx = chunkOf(gx), cz = chunkOf(gz);
  if (zoneKeyOf(cx, cz) !== 'pools') return false;
  const lx = gx - cx * CN, lz = gz - cz * CN;
  if (lx === 0 || lz === 0 || lx === CN - 1 || lz === CN - 1) return false;
  return vnoise(gx * .45, gz * .45, 404) > 0.42;
}
const isPoolAt = (x, z) => isPool(Math.floor(x / CELL), Math.floor(z / CELL));

// ---------------------------------------------------------------------
//  LAYOUT — планировка чанка: стены на внутренних рёбрах, комнаты, перепады высот
//  Типы рёбер: 0 нет стены, 1 стена, 2 проём с перемычкой, 3 полстены, 4 низкая перегородка
// ---------------------------------------------------------------------
const EX = (lx, lz) => lz * (CN - 1) + lx;   // ребро между (lx,lz) и (lx+1,lz)
const EZ = (lx, lz) => lz * CN + lx;         // ребро между (lx,lz) и (lx,lz+1)
const LAYOUTS = {
  rooms(L, z, rng) { bspRooms(L, z, rng, z.roomMax ?? 9); },
  office(L, z, rng) {
    bspRooms(L, z, rng, z.roomMax ?? 12);
    // перегородки-«кабинки» внутри больших комнат
    for (const r of L.rooms) if (r.w * r.h >= 6) for (let lz = r.z0; lz < r.z0 + r.h; lz++) for (let lx = r.x0; lx < r.x0 + r.w - 1; lx++)
      if (rng() < (z.lowP ?? .4) * .5 && L.ex[EX(lx, lz)] === 0) L.ex[EX(lx, lz)] = 4;
  },
  maze(L, z, rng) {
    L.ex.fill(1); L.ez.fill(1);
    const seen = new Uint8Array(CN * CN), st = [[rng() * CN | 0, rng() * CN | 0]]; seen[st[0][1] * CN + st[0][0]] = 1;
    while (st.length) {
      const [x, y] = st[st.length - 1], nb = [];
      if (x > 0 && !seen[y * CN + x - 1]) nb.push([x - 1, y, 0]); if (x < CN - 1 && !seen[y * CN + x + 1]) nb.push([x + 1, y, 1]);
      if (y > 0 && !seen[(y - 1) * CN + x]) nb.push([x, y - 1, 2]); if (y < CN - 1 && !seen[(y + 1) * CN + x]) nb.push([x, y + 1, 3]);
      if (!nb.length) { st.pop(); continue; }
      const [nx, ny, d] = nb[rng() * nb.length | 0], open = rng() < (z.doorP ?? .25) ? 2 : 0;
      if (d === 0) L.ex[EX(nx, y)] = open; else if (d === 1) L.ex[EX(x, y)] = open; else if (d === 2) L.ez[EZ(x, ny)] = open; else L.ez[EZ(x, y)] = open;
      seen[ny * CN + nx] = 1; st.push([nx, ny]);
    }
    for (let i = 0; i < L.ex.length; i++) if (L.ex[i] === 1 && rng() < (z.loopP ?? .15)) L.ex[i] = 0;
    for (let i = 0; i < L.ez.length; i++) if (L.ez[i] === 1 && rng() < (z.loopP ?? .15)) L.ez[i] = 0;
    L.rooms.push({ id: 0, x0: 0, z0: 0, w: CN, h: CN, maze: true });
  },
  open(L, z, rng) {
    for (let i = 0; i < L.ex.length; i++) if (rng() < (z.wallP ?? .04)) L.ex[i] = rng() < .3 ? 3 : 1;
    for (let i = 0; i < L.ez.length; i++) if (rng() < (z.wallP ?? .04)) L.ez[i] = rng() < .3 ? 3 : 1;
    L.rooms.push({ id: 0, x0: 0, z0: 0, w: CN, h: CN, open: true });
  },
  // старый генератор (шум по рёбрам) — используется для зон модов без layout
  noise(L, z, rng, cx, cz) {
    const v = L.variant * 977;
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx, gz = cz * CN + lz;
      for (let dir = 0; dir < 2; dir++) {
        if (dir === 0 ? lx === CN - 1 : lz === CN - 1) continue;
        const r0 = hash3(gx * 2 + dir, gz, 505 + v); let t;
        if (r0 > (z.wallP ?? .3)) t = r0 < (z.wallP ?? .3) + (z.lowP || 0) ? 4 : 0;
        else { const r = hash3(gx * 2 + dir, gz, 606 + v); t = r < (z.doorP ?? .4) ? 2 : r > 1 - (z.halfP || 0) ? 3 : 1; }
        if (dir === 0) L.ex[EX(lx, lz)] = t; else L.ez[EZ(lx, lz)] = t;
      }
    }
    L.rooms.push({ id: 0, x0: 0, z0: 0, w: CN, h: CN, open: true });
  },
};
// BSP: делим прямоугольник на комнаты; каждое деление получает хотя бы один проход → связность
function bspRooms(L, z, rng, maxArea) {
  const split = (x0, z0, w, h, depth) => {
    const canV = w >= 4 || (w >= 3 && rng() < .3), canH = h >= 4 || (h >= 3 && rng() < .3);
    const stop = (!canV && !canH) || (w * h <= maxArea && rng() < .55 + depth * .08) || depth > 5;
    if (stop) { L.rooms.push({ id: L.rooms.length, x0, z0, w, h }); return; }
    const vert = canV && (!canH || w > h || (w === h && rng() < .5));
    const len = vert ? w : h, minS = len >= 4 ? 2 : 1, pos = minS + (rng() * (len - 2 * minS + 1) | 0);
    const along = vert ? h : w, line = [];
    for (let i = 0; i < along; i++) {
      const idx = vert ? EX(x0 + pos - 1, z0 + i) : EZ(x0 + i, z0 + pos - 1);
      const t = rng() < (z.gapP ?? 0) ? 0 : rng() < (z.halfP ?? 0) ? 3 : 1;
      (vert ? L.ex : L.ez)[idx] = t; line.push(idx);
    }
    const doors = 1 + (rng() < (z.extraP ?? .3) ? 1 : 0) + (along > 3 && rng() < (z.extraP ?? .3) ? 1 : 0);
    for (let k = 0; k < doors; k++) (vert ? L.ex : L.ez)[line[rng() * line.length | 0]] = rng() < (z.openP ?? .4) ? 0 : 2;
    if (vert) { split(x0, z0, pos, h, depth + 1); split(x0 + pos, z0, w - pos, h, depth + 1); }
    else { split(x0, z0, w, pos, depth + 1); split(x0, z0 + pos, w, h - pos, depth + 1); }
  };
  split(0, 0, CN, CN, 0);
}
// доступность клеток: если генератор (или мод) отрезал часть чанка — прорубаем проём
function ensureConnected(L) {
  const pass = t => t !== 1 && t !== 4;
  for (let guard = 0; guard < 40; guard++) {
    const seen = new Uint8Array(CN * CN), q = [0]; seen[0] = 1;
    while (q.length) {
      const c = q.pop(), x = c % CN, y = (c / CN) | 0;
      const go = (nx, ny, t) => { if (nx < 0 || ny < 0 || nx >= CN || ny >= CN || !pass(t)) return; const k = ny * CN + nx; if (!seen[k]) { seen[k] = 1; q.push(k); } };
      if (x > 0) go(x - 1, y, L.ex[EX(x - 1, y)]); if (x < CN - 1) go(x + 1, y, L.ex[EX(x, y)]);
      if (y > 0) go(x, y - 1, L.ez[EZ(x, y - 1)]); if (y < CN - 1) go(x, y + 1, L.ez[EZ(x, y)]);
    }
    let fixed = false;
    for (let c = 0; c < CN * CN && !fixed; c++) {
      if (seen[c]) continue; const x = c % CN, y = (c / CN) | 0;
      if (x > 0 && seen[c - 1]) { L.ex[EX(x - 1, y)] = 2; fixed = true; }
      else if (x < CN - 1 && seen[c + 1]) { L.ex[EX(x, y)] = 2; fixed = true; }
      else if (y > 0 && seen[c - CN]) { L.ez[EZ(x, y - 1)] = 2; fixed = true; }
      else if (y < CN - 1 && seen[c + CN]) { L.ez[EZ(x, y)] = 2; fixed = true; }
    }
    if (!fixed) return;
  }
}
function layoutOf(cx, cz) {
  const key = ckey(cx, cz); let L = layoutCache.get(key); if (L) return L;
  const z = ZONES[zoneKeyOf(cx, cz)] || ZONES.lobby, variant = variantOf(cx, cz);
  L = { cx, cz, zone: z, variant, ex: new Uint8Array((CN - 1) * CN), ez: new Uint8Array(CN * (CN - 1)), room: new Int16Array(CN * CN).fill(0), rooms: [], features: [] };
  const rng = mulberry((hash3(cx, cz, 4242 + variant * 977) * 4294967296) | 0);
  const gen = (typeof z.layout === 'function' ? z.layout : LAYOUTS[z.layout]) || LAYOUTS.rooms;
  try { gen(L, z, rng, cx, cz); } catch (e) { console.error('layout', z.key, e); }
  if (!L.rooms.length) L.rooms.push({ id: 0, x0: 0, z0: 0, w: CN, h: CN });
  for (const r of L.rooms) for (let lz = r.z0; lz < r.z0 + r.h; lz++) for (let lx = r.x0; lx < r.x0 + r.w; lx++) L.room[lz * CN + lx] = r.id;
  ensureConnected(L);
  // ---- перепады высот: утопленная «яма» со ступенями или помост в больших комнатах
  const exitChunk = cx === WORLD.exitCx && cz === WORLD.exitCz;
  if (!isSpawnChunk(cx, cz) && !exitChunk && z.mat !== 'tile' && !z.flood) for (const r of L.rooms) {
    if (r.w < 3 || r.h < 3 || r.maze) continue;
    const roll = rng(), kind = roll < (z.pitP || 0) ? 'pit' : roll < (z.pitP || 0) + (z.stageP || 0) ? 'stage' : null; if (!kind) continue;
    const x0 = (cx * CN + r.x0) * CELL, z0 = (cz * CN + r.z0) * CELL, x1 = x0 + r.w * CELL, z1 = z0 + r.h * CELL;
    const m = kind === 'pit' ? 1.3 + rng() * .8 : 2 + rng() * 1.2, n = kind === 'pit' ? 3 + (rng() * 3 | 0) : 2 + (rng() * 2 | 0);
    const f = { kind, x0: x0 + m, z0: z0 + m, x1: x1 - m, z1: z1 - m, n, sw: .42, rise: kind === 'pit' ? .2 : .19, room: r.id };
    f.depth = f.rise * n; if (f.x1 - f.x0 < n * f.sw * 2 + 1.6 || f.z1 - f.z0 < n * f.sw * 2 + 1.6) continue;
    r.feature = f; L.features.push(f);
  }
  layoutCache.set(key, L); return L;
}
// высота пола в точке (ямы, помосты, бассейны) — для спавна предметов и логики
function featureAt(x, z) {
  const L = layoutOf(Math.floor(x / CS), Math.floor(z / CS));
  for (const f of L.features) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return f;
  return null;
}
function floorY(x, z) {
  if (isPoolAt(x, z)) return -POOL_D;
  const f = featureAt(x, z); if (!f) return 0;
  const inset = Math.min(x - f.x0, f.x1 - x, z - f.z0, f.z1 - z), ring = Math.min(f.n, Math.floor(inset / f.sw));
  return f.kind === 'pit' ? -f.rise * (ring + (ring >= f.n ? 0 : 1)) : f.rise * Math.min(f.n, ring + 1);
}
// стены на границе чанков: считаются по общей границе → соседние чанки согласованы
const zoneOpenness = z => z.boundOpen ?? (z.layout === 'open' ? 1 : z.layout === 'maze' ? .12 : z.layout === 'office' ? .25 : .4);
function boundaryEdge(gx, gz, dir) {
  const nx = gx + (dir === 0 ? 1 : 0), nz = gz + (dir === 1 ? 1 : 0);
  const o = Math.min(zoneOpenness(zoneOfCell(gx, gz)), zoneOpenness(zoneOfCell(nx, nz)));
  if (o >= .95) return hash3(gx * 2 + dir, gz, 4711) < .06 ? 1 : 0;
  // 6 рёбер этой стороны чанка: k самых «удачных» по хешу — проходы
  const v = variantOf(chunkOf(gx), chunkOf(gz)) + variantOf(chunkOf(nx), chunkOf(nz)), base = dir === 0 ? chunkOf(gz) * CN : chunkOf(gx) * CN, i0 = dir === 0 ? gz : gx;
  const h = i => dir === 0 ? hash3(gx, base + i, 4700 + v * 31) : hash3(base + i, gz, 4701 + v * 31);
  const mine = h(i0 - base); let rank = 0; for (let i = 0; i < CN; i++) if (h(i) < mine) rank++;
  const k = 1 + Math.round(o * 4 + hash3(gx + gz, dir, 4702 + v) * 1.2);
  if (rank < k) return hash3(gx, gz, 4703 + dir) < o ? 0 : 2;
  return hash3(gx, gz, 4704 + dir) < .1 ? 3 : 1;
}
function edgeWall(gx, gz, dir) {
  const key = ckey(gx, gz) * 2 + dir; let v = edgeCache.get(key); if (v !== undefined) return v;
  v = edgeWallRaw(gx, gz, dir); edgeCache.set(key, v); return v;
}
function edgeWallRaw(gx, gz, dir) {
  const nx = gx + (dir === 0 ? 1 : 0), nz = gz + (dir === 1 ? 1 : 0);
  if (isPool(gx, gz) || isPool(nx, nz)) return 0;
  if (isExitCell(gx, gz) || isExitCell(nx, nz)) return 0;
  if ((gx === 0 || gx === -1) && (gz === 0 || gz === -1)) return 0; // точка появления — без стен
  const cx = chunkOf(gx), cz = chunkOf(gz);
  if (cx !== chunkOf(nx) || cz !== chunkOf(nz)) return boundaryEdge(gx, gz, dir);
  const L = layoutOf(cx, cz), lx = gx - cx * CN, lz = gz - cz * CN;
  return dir === 0 ? L.ex[EX(lx, lz)] : L.ez[EZ(lx, lz)];
}
const doorHalf = (gx, gz) => .55 + hash3(gx, gz, 62) * .35;
const halfFlip = (gx, gz, dir) => hash3(gx, gz, 61 + dir) < .5;
// does a wall on this edge block at offset `off` (0..CELL) along the edge?
function edgeBlocks(gx, gz, dir, off) {
  const t = edgeWall(gx, gz, dir);
  if (t === 0 || t === 4) return false;
  if (t === 1) return true;
  if (t === 2) return Math.abs(off - CELL / 2) > doorHalf(gx, gz);
  return halfFlip(gx, gz, dir) ? off < CELL / 2 + .4 : off > CELL / 2 - .4;
}
// ceiling fixture in a cell (pure, cached). Регулярная сетка светильников — «чистый» лиминальный вид.
function fixtureAt(gx, gz) {
  const key = ckey(gx, gz); if (fixCache.has(key)) return fixCache.get(key);
  let f = null;
  const zone = zoneOfCell(gx, gz), vr = variantOf(chunkOf(gx), chunkOf(gz)) * 977, lvl = Math.max(0, WORLD.level - 1);
  const forced = (gx === 0 && gz === 0) || isExitCell(gx, gz) && gx === WORLD.exitCx * CN + CN / 2 && gz === WORLD.exitCz * CN + CN / 2;
  const grid = zone.lightGrid === 2 ? ((gx + gz) & 1) === 0 : true;
  const lightP = zone.lightP * Math.max(.5, 1 - lvl * BAL.levelDark);
  if (forced || (grid && hash3(gx, gz, 808 + vr) < lightP)) {
    const broken = !forced && hash3(gx, gz, 809 + vr) < Math.min(.9, zone.brokenP + lvl * .03);
    const flicker = !broken && !forced && hash3(gx, gz, 810 + vr) < zone.flickerP;
    const rot = zone.layout === 'maze' ? (edgeWall(gx, gz, 0) && edgeWall(gx - 1, gz, 0) ? Math.PI / 2 : 0) : (hash3(chunkOf(gx), chunkOf(gz), 811) < .5 ? 0 : Math.PI / 2);
    f = { gx, gz, key: gx + ',' + gz, x: gx * CELL + CELL / 2, z: gz * CELL + CELL / 2, H: zone.H, y: zone.H - .5, rot, broken, flicker, color: zone.color, seed: hash3(gx, gz, 3) };
  }
  fixCache.set(key, f); return f;
}
const fixtureLit = f => f && !f.broken && !f.flicker && !deadFixtures.has(f.key) && !tempOff.has(f.key) && !switchOff.has(f.key);
// клетки одной комнаты (для выключателей)
function roomCells(gx, gz) {
  const cx = chunkOf(gx), cz = chunkOf(gz), L = layoutOf(cx, cz), id = L.room[(gz - cz * CN) * CN + (gx - cx * CN)], out = [];
  for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) if (L.room[lz * CN + lx] === id) out.push([cx * CN + lx, cz * CN + lz]);
  return out;
}
