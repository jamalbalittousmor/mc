// =====================================================================
//  CHUNKS — геометрия, коллизии, свет и наполнение одного чанка
// =====================================================================
const chunks = new Map();
const tmpColor = new THREE.Color();
// прямоугольник минус прямоугольник → до 4 прямоугольников (для пола вокруг ям)
function rectDiff(a, b) {
  const ix0 = Math.max(a[0], b[0]), iz0 = Math.max(a[1], b[1]), ix1 = Math.min(a[2], b[2]), iz1 = Math.min(a[3], b[3]);
  if (ix0 >= ix1 || iz0 >= iz1) return [a];
  const out = [];
  if (a[1] < iz0) out.push([a[0], a[1], a[2], iz0]);
  if (iz1 < a[3]) out.push([a[0], iz1, a[2], a[3]]);
  if (a[0] < ix0) out.push([a[0], iz0, ix0, iz1]);
  if (ix1 < a[2]) out.push([ix1, iz0, a[2], iz1]);
  return out;
}
// стены вокруг клетки, к которым можно что-то прислонить: нормаль смотрит внутрь клетки
function wallSlots(gx, gz) {
  const out = [], x0 = gx * CELL, z0 = gz * CELL, T = WALL_T / 2;
  if (edgeWall(gx, gz, 0) === 1) out.push({ nx: -1, nz: 0, x: x0 + CELL - T, z: z0 + CELL / 2, alongZ: true });
  if (edgeWall(gx - 1, gz, 0) === 1) out.push({ nx: 1, nz: 0, x: x0 + T, z: z0 + CELL / 2, alongZ: true });
  if (edgeWall(gx, gz, 1) === 1) out.push({ nx: 0, nz: -1, x: x0 + CELL / 2, z: z0 + CELL - T, alongZ: false });
  if (edgeWall(gx, gz - 1, 1) === 1) out.push({ nx: 0, nz: 1, x: x0 + CELL / 2, z: z0 + T, alongZ: false });
  return out;
}
// лиминальные пространства в основном ПУСТЫЕ: мебель — редкость, а не правило
const ROOM_TYPES = {
  lobby: [['empty', 12], ['lounge', .5], ['storage', .25], ['office', .35]],
  office: [['office', 6], ['storage', 1.5], ['empty', 3], ['lounge', 1]],
  dark: [['empty', 5], ['storage', 2], ['office', 2]],
  flooded: [['empty', 7], ['storage', 1]],
  industrial: [['storage', 5], ['empty', 3]],
};
function roomType(zone, rng) {
  const list = zone.roomTypes || ROOM_TYPES[zone.key] || [['empty', 1]];
  let r = rng() * list.reduce((a, x) => a + x[1], 0); for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0];
}
// ---------------------------------------------------------------------
//  FURN — разбираемая мебель. Каждый предмет обстановки запоминает диапазоны
//  своих вершин в общих геометриях чанка, коллайдеры и окклюдеры света.
//  Разбор: вершины схлопываются, коллайдеры удаляются, свет перепекается,
//  ключ попадает в salvaged → после перезагрузки предмета нет.
// ---------------------------------------------------------------------
const FURN = new Map();          // collider.handle → rec
const Furn = {
  at: h => FURN.get(h?.handle ?? h),
  near(p, r = 2) { const out = []; for (const c of chunks.values()) for (const f of c.furn) if (!f.gone && Math.hypot(f.x - p.x, f.z - p.z) < r) out.push(f); return out; },
  remove(rec, rebake = true) {
    if (!rec || rec.gone) return; rec.gone = true; salvaged.add(rec.key);
    for (const [b, v0, v1] of rec.ranges) {
      const g = b.geom; if (!g) continue; const P = g.attributes.position.array;
      for (let v = v0; v < v1; v++) { P[v * 3] = P[v0 * 3]; P[v * 3 + 1] = P[v0 * 3 + 1]; P[v * 3 + 2] = P[v0 * 3 + 2]; }
      g.attributes.position.needsUpdate = true;
    }
    for (const c of rec.cols) { FURN.delete(c.handle); const o = WorldObj.byCollider.get(c.handle); if (o) WorldObj.remove(o); try { world.removeCollider(c, false); } catch (e) {} }
    rec.cols.length = 0;
    if (rec.occ.length) { removeOccluders(rec.chunk, rec.occ); rec.occ.length = 0; }
    if (rebake) { queueRebake(rec.x, rec.z, 9); bus.emit('furn:removed', rec); }
  },
};
class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = cx + ',' + cz; this.zone = ZONES[zoneKeyOf(cx, cz)] || ZONES.lobby;
    this.group = new THREE.Group(); this.fixtures = []; this.items = []; this.baked = []; this.objects = []; this.occ = []; this.furn = [];
    this.build(); scene.add(this.group);
  }
  build() {
    const { cx, cz, zone } = this, H = zone.H, x0 = cx * CS, z0 = cz * CS, tiled = zone.mat === 'tile';
    const vr = variantOf(cx, cz) * 977, L = this.layout = layoutOf(cx, cz), dirty = (zone.dirt || 0) > .4;
    const B = new Map();
    let fr = null; // текущий собираемый предмет мебели
    const gb = (kind, tint = 0xffffff) => { const k = kind + ':' + tint; let e = B.get(k); if (!e) { e = { gb: new GB(...(UVS[kind] || [1])), kind, tint }; B.set(k, e); } if (fr && !fr.b.has(e.gb)) fr.b.set(e.gb, e.gb.vcount()); return e.gb; };
    const body = this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const colBox = (a, b, c, d, e, f) => {
      const col = world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.005, (d - a) / 2), Math.max(.005, (e - b) / 2), Math.max(.005, (f - c) / 2)).setTranslation((a + d) / 2, (b + e) / 2, (c + f) / 2).setFriction(.6), body);
      if (fr) { fr.cols.push(col); if (e - b > .3 && (d - a > .12 || f - c > .12)) fr.occ.push(addOccluder([a + .02, b, c + .02, d - .02, e, f - .02], this)); }
      return col;
    };
    const addOcc = b => { this.occ.push(addOccluder(b, this)); };
    // мебель: всё, что построено внутри fn, становится одним разбираемым предметом
    const furn = (kind, name, key, fn) => {
      if (fr) { fn(); return null; }
      fr = { b: new Map(), cols: [], occ: [] };
      try { fn(); } finally {
        const r = fr; fr = null;
        if (r.cols.length) {
          let x = 0, z = 0, y = 0; for (const c of r.cols) { const t = c.translation(); x += t.x; y += t.y; z += t.z; } const n = r.cols.length;
          const rec = { kind, name, key: 'f:' + key, chunk: this, x: x / n, y: y / n, z: z / n, cols: r.cols, occ: r.occ, ranges: [...r.b].map(([b, v0]) => [b, v0, b.vcount()]), gone: false };
          for (const o of rec.occ) this.occ.push(o);
          this.furn.push(rec); for (const c of r.cols) FURN.set(c.handle, rec); return rec;
        }
        for (const o of r.occ) this.occ.push(o);
      }
      return null;
    };
    this.gb = gb; this.colBox = colBox; this.furnFn = furn;
    // ---------- палитра зоны
    const wallK = tiled ? 'tile' : zone.wallK || (dirty ? 'wallD' : 'wall'), wallT = zone.wallTint ?? zone.tint ?? 0xffffff;
    const floorK = tiled ? 'tile' : zone.floorK || (dirty ? 'floorD' : 'floor'), floorT = zone.floorTint ?? (zone.floorK ? 0xffffff : zone.carpet ?? 0xffffff);
    const ceilK = tiled ? 'ceilT' : zone.ceilK || (dirty ? 'ceilD' : 'ceil'), ceilT = zone.ceilTint ?? 0xffffff;
    const hasBase = !tiled && !zone.noBase, soft = !zone.floorK || zone.floorK === 'hotelC';
    const W = () => gb(wallK, wallT), F = () => gb(floorK, floorT), C = () => gb(ceilK, ceilT);
    const rng = mulberry((hash3(cx, cz, 999 + vr) * 4294967296) | 0);
    const used = new Set(), cellKey = (gx, gz) => gx + ',' + gz;
    const inFeature = (x, z, pad = 0) => L.features.some(f => x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad);
    const cellInFeature = (gx, gz) => L.features.some(f => gx * CELL < f.x1 && gx * CELL + CELL > f.x0 && gz * CELL < f.z1 && gz * CELL + CELL > f.z0);
    // ---------- floors, pools, ceiling
    let anyPool = false; const floorRects = [];
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx, gz = cz * CN + lz, ax = gx * CELL, az = gz * CELL, bx = ax + CELL, bz = az + CELL;
      C().face('ny', ax, H, az, bx, H, bz);
      if (isPool(gx, gz)) {
        anyPool = true; const P = gb('ptile');
        P.face('py', ax, -POOL_D, az, bx, -POOL_D, bz);
        if (!isPool(gx - 1, gz)) P.face('px', ax, -POOL_D, az, ax, 0, bz);
        if (!isPool(gx + 1, gz)) P.face('nx', bx, -POOL_D, az, bx, 0, bz);
        if (!isPool(gx, gz - 1)) P.face('pz', ax, -POOL_D, az, bx, 0, az);
        if (!isPool(gx, gz + 1)) P.face('nz', ax, -POOL_D, bz, bx, 0, bz);
        gb('water').face('py', ax, WATER_Y, az, bx, WATER_Y, bz, 2);
        colBox(ax, -POOL_D - 1, az, bx, -POOL_D, bz);
        continue;
      }
      let pieces = [[ax, az, bx, bz]];
      for (const f of L.features) if (f.kind === 'pit') pieces = pieces.flatMap(r => rectDiff(r, [f.x0, f.z0, f.x1, f.z1]));
      for (const r of pieces) { F().face('py', r[0], 0, r[1], r[2], 0, r[3]); floorRects.push(r); }
    }
    if (!anyPool && !L.features.some(f => f.kind === 'pit')) colBox(x0, -1, z0, x0 + CS, 0, z0 + CS);
    else for (const r of floorRects) colBox(r[0], -1, r[1], r[2], 0, r[3]);
    colBox(x0, H, z0, x0 + CS, H + 1, z0 + CS);
    // ---------- ямы и помосты со ступенями: светлый кант по краю каждой ступени, дно другим покрытием
    for (const f of L.features) {
      const pit = f.kind === 'pit', n = f.n, R = k => [f.x0 + k * f.sw, f.z0 + k * f.sw, f.x1 - k * f.sw, f.z1 - k * f.sw];
      const yOf = k => (pit ? -1 : 1) * f.rise * Math.min(n, k + 1);
      for (let k = 0; k < n; k++) {
        const o = R(k), i = k < n - 1 ? R(k + 1) : null, y = yOf(k), yPrev = k === 0 ? 0 : yOf(k - 1);
        const strips = i ? [[o[0], o[1], o[2], i[1]], [o[0], i[3], o[2], o[3]], [o[0], i[1], i[0], i[3]], [i[2], i[1], o[2], i[3]]] : [o];
        const fl = i || !pit ? F() : gb(zone.pitK || (tiled ? 'tile' : 'terrazzo'));
        for (const r of strips) { fl.face('py', r[0], y, r[1], r[2], y, r[3]); if (pit) colBox(r[0], -f.depth - .6, r[1], r[2], y, r[3]); else colBox(r[0], 0, r[1], r[2], y, r[3]); }
        const lo = Math.min(y, yPrev), hi = Math.max(y, yPrev), g = gb(tiled ? 'tile' : 'base');
        if (pit) { g.face('px', o[0], lo, o[1], o[0], hi, o[3]); g.face('nx', o[2], lo, o[1], o[2], hi, o[3]); g.face('pz', o[0], lo, o[1], o[2], hi, o[1]); g.face('nz', o[0], lo, o[3], o[2], hi, o[3]); }
        else { g.face('nx', o[0], lo, o[1], o[0], hi, o[3]); g.face('px', o[2], lo, o[1], o[2], hi, o[3]); g.face('nz', o[0], lo, o[1], o[2], hi, o[1]); g.face('pz', o[0], lo, o[3], o[2], hi, o[3]); }
        // кант (нос ступени) — узкая светлая полоса по периметру, чуть выше пола
        const e = .05, K = gb('frame'), top = hi + .006, a = pit ? .003 : -.003;
        const ox0 = o[0] + a, oz0 = o[1] + a, ox1 = o[2] - a, oz1 = o[3] - a;
        K.box(ox0 - (pit ? e : 0), hi - .02, oz0 - (pit ? e : 0), ox1 + (pit ? e : 0), top, oz0 + (pit ? 0 : e), 'ny');
        K.box(ox0 - (pit ? e : 0), hi - .02, oz1 - (pit ? 0 : e), ox1 + (pit ? e : 0), top, oz1 + (pit ? e : 0), 'ny');
        K.box(ox0 - (pit ? e : 0), hi - .02, oz0 + (pit ? 0 : e), ox0 + (pit ? 0 : e), top, oz1 - (pit ? 0 : e), 'ny');
        K.box(ox1 - (pit ? 0 : e), hi - .02, oz0 + (pit ? 0 : e), ox1 + (pit ? e : 0), top, oz1 - (pit ? 0 : e), 'ny');
      }
    }
    if (zone.flood) gb('puddle').face('py', x0, FLOOD_Y, z0, x0 + CS, FLOOD_Y, z0 + CS, 2);
    const nH = (dx, dz) => (ZONES[zoneKeyOf(cx + dx, cz + dz)] || ZONES.lobby).H;
    if (nH(-1, 0) < H) W().face('px', x0, nH(-1, 0), z0, x0, H, z0 + CS);
    if (nH(1, 0) < H) W().face('nx', x0 + CS, nH(1, 0), z0, x0 + CS, H, z0 + CS);
    if (nH(0, -1) < H) W().face('pz', x0, nH(0, -1), z0, x0 + CS, H, z0);
    if (nH(0, 1) < H) W().face('nz', x0, nH(0, 1), z0 + CS, x0 + CS, H, z0 + CS);
    // ---------- walls
    const T = WALL_T / 2;
    const seg = (alongZ, fixed, a, b, y0, y1, base = true, kind = null, th = T, skip = 'ny') => {
      if (b - a < .05) return;
      const g = kind ? gb(kind) : W();
      if (alongZ) { g.box(fixed - th, y0, a, fixed + th, y1, b, skip); colBox(fixed - th, y0, a, fixed + th, y1, b); if (base && hasBase && !kind) gb('base').box(fixed - th - .015, 0, a + .001, fixed + th + .015, .12, b - .001, 'nypy'); }
      else { g.box(a, y0, fixed - th, b, y1, fixed + th, skip); colBox(a, y0, fixed - th, b, y1, fixed + th); if (base && hasBase && !kind) gb('base').box(a + .001, 0, fixed - th - .015, b - .001, .12, fixed + th + .015, 'nypy'); }
    };
    const DH = 2.25; // высота проёма
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx, gz = cz * CN + lz;
      for (let dir = 0; dir < 2; dir++) {
        const t = edgeWall(gx, gz, dir); if (!t) continue;
        const nx = gx + (dir === 0 ? 1 : 0), nz = gz + (dir === 1 ? 1 : 0);
        const h = Math.max(H, zoneOfCell(nx, nz).H);
        const alongZ = dir === 0, fixed = alongZ ? (gx + 1) * CELL : (gz + 1) * CELL;
        const a = (alongZ ? gz * CELL : gx * CELL) + .002, b = a + CELL - .004, c = a + CELL / 2;
        if (t === 1) seg(alongZ, fixed, a, b, 0, h);
        else if (t === 3) halfFlip(gx, gz, dir) ? seg(alongZ, fixed, a, c + .4, 0, h) : seg(alongZ, fixed, c - .4, b, 0, h);
        else if (t === 2) {
          const dw = doorHalf(gx, gz);
          seg(alongZ, fixed, a, c - dw, 0, h); seg(alongZ, fixed, c + dw, b, 0, h);
          // перемычка — с нижней гранью (раньше её не было → «дыра» и мелькание в проёме)
          seg(alongZ, fixed, c - dw, c + dw, DH, h, false, null, T, alongZ ? 'pznz' : 'pxnx');
          addOcc(alongZ ? [fixed - T, DH, c - dw, fixed + T, h, c + dw] : [c - dw, DH, fixed - T, c + dw, h, fixed + T]);
          // наличник: выступает в проём на 1.2 см и ниже перемычки на 1.2 см → нет совпадающих плоскостей
          if (hasBase) {
            const fb = gb('base'), o = T + .02, j = .012, w = .05, top = DH + .05;
            if (alongZ) { fb.box(fixed - o, 0, c - dw - w, fixed + o, top, c - dw + j, 'ny'); fb.box(fixed - o, 0, c + dw - j, fixed + o, top, c + dw + w, 'ny'); fb.box(fixed - o, DH - j, c - dw + j, fixed + o, top, c + dw - j, ''); }
            else { fb.box(c - dw - w, 0, fixed - o, c - dw + j, top, fixed + o, 'ny'); fb.box(c + dw - j, 0, fixed - o, c + dw + w, top, fixed + o, 'ny'); fb.box(c - dw + j, DH - j, fixed - o, c + dw - j, top, fixed + o, ''); }
          }
          if (dw < .72 && hash3(gx * 2 + dir, gz, 5150 + vr) < (zone.doorObjP || 0) && !inFeature(alongZ ? fixed : c, alongZ ? c : fixed, 1)) this.objects.push(WorldObj.door(this, { gx, gz, dir, alongZ, fixed, c, dw, tiled: !hasBase }));
        }
        else if (t === 4) { seg(alongZ, fixed, a + .3, b - .3, 0, 1.3, false, 'cloth', .05); }
      }
      // колонны (не в ямах и не на помостах); на парковке — регулярной сеткой
      const ps = zone.pillarS / 2, pg = zone.pillarGrid;
      const pillarHere = pg ? (((gx % pg) + pg) % pg === 0 && ((gz % pg) + pg) % pg === 0) : hash3(gx, gz, 707 + vr) < zone.pillarP;
      if (pillarHere && !isPool(gx, gz) && !isPool(gx - 1, gz) && !isPool(gx, gz - 1) && !isPool(gx - 1, gz - 1) && !(gx === 0 && gz === 0) && !isExitCell(gx, gz) && !inFeature(gx * CELL, gz * CELL, ps + .5)) {
        const px = gx * CELL, pz = gz * CELL;
        W().box(px - ps, 0, pz - ps, px + ps, H, pz + ps, 'nypy'); colBox(px - ps, 0, pz - ps, px + ps, H, pz + ps); addOcc([px - ps, 0, pz - ps, px + ps, H, pz + ps]);
        if (hasBase) gb('base').box(px - ps - .015, 0, pz - ps - .015, px + ps + .015, .12, pz + ps + .015, 'nypy');
        if (zone.key === 'garage') { const Y = gb('car', 0xd8b030); Y.box(px - ps - .01, 0, pz - ps - .01, px + ps + .01, .9, pz + ps + .01, 'nypy'); }
      }
      if (isPool(gx, gz) || isExitCell(gx, gz)) continue;
      // ---------- трубы под потолком (Уровень 2)
      if (zone.pipes) for (const s of wallSlots(gx, gz)) {
        const k = hash3(gx * 3 + s.nx, gz * 3 + s.nz, 77); if (k > .7) continue;
        const P = gb(k < .25 ? 'rust' : 'pipe'), off = .16 + k * .12, y = H - .2 - k * .35, r = .05 + k * .05;
        if (s.alongZ) P.box(s.x + s.nx * off - r, y - r, gz * CELL, s.x + s.nx * off + r, y + r, gz * CELL + CELL, '', 2);
        else P.box(gx * CELL, y - r, s.z + s.nz * off - r, gx * CELL + CELL, y + r, s.z + s.nz * off + r, '', 2);
      }
      // ---------- следы запустения — только в «грязных» зонах
      const dirt = zone.dirt || 0;
      if (!tiled && rng() < dirt * .3) { const sx = gx * CELL + .6 + rng() * 2.8, sz = gz * CELL + .6 + rng() * 2.8, rr = .4 + rng() * 1.1; if (!inFeature(sx, sz, rr)) gb('stain').decal('py', sx - rr, .004, sz - rr, sx + rr, .004, sz + rr); }
      if (!tiled && !zone.flood && rng() < dirt * .1) { const sx = gx * CELL + 1 + rng() * 2, sz = gz * CELL + 1 + rng() * 2, w = .4 + rng() * .9, d = .3 + rng() * .7; if (!inFeature(sx, sz, 1)) gb('puddle').face('py', sx - w, .012, sz - d, sx + w, .012, sz + d, 2); }
      if (!tiled && rng() < dirt * .08 && ceilK !== 'ceilC') { // упавшая потолочная плитка + дыра
        const hx = Math.floor((gx * CELL + .3 + rng() * 3) / .6) * .6, hz = Math.floor((gz * CELL + .3 + rng() * 3) / .6) * .6;
        gb('hole').face('ny', hx, H - .004, hz, hx + .6, H - .004, hz + .6);
        const fx = hx + rng() * .8 - .4, fz = hz + rng() * .8 - .4; if (!inFeature(fx, fz, 1)) gb('ceilD').box(fx, 0, fz, fx + .6, .018, fz + .6, 'ny');
      }
      if (!tiled && wallK.startsWith('wall') && rng() < dirt * .12) { // отклеившиеся обои
        const ws = wallSlots(gx, gz); if (ws.length) { const s = ws[rng() * ws.length | 0], w = .4 + rng() * .5, y0 = .3 + rng() * 1.2, o = s.alongZ ? s.z + (rng() - .5) * 2.4 : s.x + (rng() - .5) * 2.4, P = gb('peel');
          if (s.alongZ) P.decal(s.nx > 0 ? 'px' : 'nx', s.x + s.nx * .004, y0, o - w / 2, s.x + s.nx * .004, y0 + w * 1.8, o + w / 2); else P.decal(s.nz > 0 ? 'pz' : 'nz', o - w / 2, y0, s.z + s.nz * .004, o + w / 2, y0 + w * 1.8, s.z + s.nz * .004); }
      }
    }
    // ---------- комнаты: тип, мебель, интерактивные объекты
    const ctxObj = { chunk: this, gb, colBox, rng, zone, used, H, furn };
    const FK = (t, gx, gz, i = 0) => `${t}:${gx},${gz},${i},${vr}`;
    const desk = (px, pz, rot, w, d, gx, gz, withBox = true) => furn('desk', 'стол', FK('dk', gx, gz, px * 7 + pz | 0), () => {
      const hx = rot ? d / 2 : w / 2, hz = rot ? w / 2 : d / 2;
      gb('wood').box(px - hx, .72, pz - hz, px + hx, .76, pz + hz);
      gb('metal').box(px - hx + .02, 0, pz - hz + .02, px - hx + .06, .72, pz + hz - .02); gb('metal').box(px + hx - .06, 0, pz - hz + .02, px + hx - .02, .72, pz + hz - .02);
      if (withBox) { const dc = rot ? [px - hx + .08, .45, pz - .25, px + hx - .08, .7, pz + .25] : [px - .25, .45, pz - hz + .08, px + .25, .7, pz + hz - .08]; gb('metal').box(...dc); }
      const top = colBox(px - hx, 0, pz - hz, px + hx, .76, pz + hz);
      if (withBox && rng() < .7) this.objects.push(WorldObj.container(this, top, `dk:${gx},${gz},${vr}`, 'ящик стола', 'desk'));
    });
    const chair = (x, z, s, back, rot, gx, gz, i) => furn('chair', 'стул', FK('ch', gx, gz, i), () => WorldObj.chair(ctxObj, x, z, s, back, rot));
    const wallUnit = (gx, gz, s, hh, kind, label, ckind, off = .9 * (rng() < .5 ? -1 : 1), depth = .25, width = .45) => {
      const wx = s.x + s.nx * (depth + .05) + (s.alongZ ? 0 : off), wz = s.z + s.nz * (depth + .05) + (s.alongZ ? off : 0), hw = s.alongZ ? depth : width, hd = s.alongZ ? width : depth;
      return furn(kind, label, FK(kind, gx, gz, off * 10 | 0), () => {
        gb('metal').box(wx - hw, 0, wz - hd, wx + hw, hh, wz + hd);
        for (let y = .25; y < hh - .1; y += hh > 1.5 ? .55 : .42) gb('darkp').box(wx - hw * .9 + (s.nx > 0 ? hw * 1.85 : s.nx < 0 ? -.01 : 0), y, wz - hd * .9 + (s.nz > 0 ? hd * 1.85 : s.nz < 0 ? -.01 : 0), wx + hw * .9 + (s.nx < 0 ? -hw * 1.85 : s.nx > 0 ? .01 : 0), y + .03, wz + hd * .9 + (s.nz < 0 ? -hd * 1.85 : s.nz > 0 ? .01 : 0));
        const col = colBox(wx - hw, 0, wz - hd, wx + hw, hh, wz + hd);
        if (ckind) this.objects.push(WorldObj.container(this, col, `cb:${gx},${gz},${off * 10 | 0},${vr}`, label, ckind));
      });
    };
    const flatOnWall = (s, off, w, y0, y1, d, kind, tint) => { // плоский предмет на стене (доска, щиток, витрина)
      const g = gb(kind, tint), a = s.alongZ ? s.z + off : s.x + off;
      if (s.alongZ) g.box(Math.min(s.x, s.x + s.nx * d), y0, a - w / 2, Math.max(s.x, s.x + s.nx * d), y1, a + w / 2, s.nx > 0 ? 'nx' : 'px');
      else g.box(a - w / 2, y0, Math.min(s.z, s.z + s.nz * d), a + w / 2, y1, Math.max(s.z, s.z + s.nz * d), s.nz > 0 ? 'nz' : 'pz');
    };
    if (!tiled) for (const room of L.rooms) {
      const type = room.type = room.maze ? 'empty' : room.corridor ? 'corridor' : room.open && !zone.roomTypes ? 'empty' : roomType(zone, rng);
      const cells = []; for (let lz = room.z0; lz < room.z0 + room.h; lz++) for (let lx = room.x0; lx < room.x0 + room.w; lx++) { const gx = cx * CN + lx, gz = cz * CN + lz; if (!isExitCell(gx, gz) && !(gx === 0 && gz === 0) && !cellInFeature(gx, gz) && !(Math.abs(gx) <= 1 && Math.abs(gz) <= 1)) cells.push([gx, gz]); }
      if (!cells.length) continue;
      if (!room.open && !room.maze && !room.corridor && rng() < (zone.switchP || 0)) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { const ws = wallSlots(gx, gz); if (!ws.length) continue; this.objects.push(WorldObj.lightSwitch(this, ws[0], gx, gz, room)); break; }
      }
      if (rng() < (zone.fountainP || 0) * (room.w * room.h >= 4 ? 1 : .4)) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { if (used.has(cellKey(gx, gz))) continue; const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz)); this.objects.push(WorldObj.fountain(this, ws[ws.length - 1], gx, gz)); break; }
      }
      if (['office', 'lobby', 'dark', 'hotel', 'school'].includes(zone.key) && rng() < .05) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { if (used.has(cellKey(gx, gz))) continue; const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz)); this.objects.push(WorldObj.phone(this, ws[0], gx, gz)); break; }
      }
      let bedDone = false, boardDone = false;
      for (const [gx, gz] of cells) {
        if (used.has(cellKey(gx, gz))) continue;
        const ccx = gx * CELL + CELL / 2, ccz = gz * CELL + CELL / 2, r = rng();
        if (type === 'office' && r < .5) {
          used.add(cellKey(gx, gz));
          const rot = rng() < .5, px = ccx + (rng() - .5) * .8, pz = ccz + (rng() - .5) * .8; desk(px, pz, rot, 1.4, .7, gx, gz);
          if (rng() < .8) { const s = .22, cx2 = px + (rot ? (rng() < .5 ? -1 : 1) * .75 : 0), cz2 = pz + (rot ? 0 : (rng() < .5 ? -1 : 1) * .75); chair(cx2, cz2, s, rng() < .5 ? 1 : -1, false, gx, gz, 0); }
        } else if ((type === 'storage' && r < .4) || (type === 'office' && r < .62)) {
          const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz));
          const s = ws[rng() * ws.length | 0], st = type === 'storage';
          wallUnit(gx, gz, s, st ? 1.8 : 1.3, st ? 'locker' : 'cabinet', st ? 'шкафчик' : 'картотеку', st ? 'locker' : 'cabinet');
        } else if (type === 'storage' && r < .6) {
          used.add(cellKey(gx, gz));
          furn('boxes', 'коробки', FK('bx', gx, gz), () => { let y = 0; const px = ccx + (rng() - .5) * 2, pz = ccz + (rng() - .5) * 2, n = 1 + (rng() * 3 | 0);
            for (let i = 0; i < n; i++) { const s = .25 + rng() * .15, h = .3 + rng() * .2, ox = (rng() - .5) * .1; gb('card').box(px - s + ox, y, pz - s, px + s + ox, y + h, pz + s, 'ny'); colBox(px - s + ox, y, pz - s, px + s + ox, y + h, pz + s); y += h; } });
        } else if (type === 'lounge' && r < .35) {
          used.add(cellKey(gx, gz));
          if (rng() < .5) { const ws = wallSlots(gx, gz); if (ws.length) { const s = ws[0]; furn('sofa', 'диван', FK('sf', gx, gz), () => WorldObj.sofa(ctxObj, s)); continue; } }
          const n = 2 + (rng() * 3 | 0), alongX = rng() < .5, back = rng() < .5 ? 1 : -1;
          for (let i = 0; i < n; i++) chair(ccx + (alongX ? (i - (n - 1) / 2) * .6 : 0), ccz + (alongX ? 0 : (i - (n - 1) / 2) * .6), .22, back, !alongX, gx, gz, i);
        } else if (type === 'empty' && r < .01) {
          used.add(cellKey(gx, gz)); chair(ccx + (rng() - .5) * 2, ccz + (rng() - .5) * 2, .22, rng() < .5 ? 1 : -1, rng() < .5, gx, gz, 0);
        } else if (type === 'hotel' && !bedDone) { // кровать у стены + тумбочка
          const ws = wallSlots(gx, gz); if (!ws.length) continue; bedDone = true; used.add(cellKey(gx, gz));
          const s = ws[rng() * ws.length | 0], L2 = 1.0, D = .8, bx = s.x + s.nx * (L2 + .02), bz = s.z + s.nz * (L2 + .02), hx = s.alongZ ? L2 : D, hz = s.alongZ ? D : L2;
          furn('bed', 'кровать', FK('bd', gx, gz), () => {
            gb('wood').box(bx - hx, 0, bz - hz, bx + hx, .32, bz + hz); gb('bed').box(bx - hx + .03, .32, bz - hz + .03, bx + hx - .03, .52, bz + hz - .03);
            const hx2 = s.x + s.nx * .07, hz2 = s.z + s.nz * .07;
            if (s.alongZ) gb('woodpanel').box(Math.min(s.x, hx2), 0, bz - D, Math.max(s.x, hx2), 1.0, bz + D); else gb('woodpanel').box(bx - D, 0, Math.min(s.z, hz2), bx + D, 1.0, Math.max(s.z, hz2));
            colBox(bx - hx, 0, bz - hz, bx + hx, .52, bz + hz);
          });
          const off = (s.alongZ ? 1 : 1) * (D + .35); wallUnit(gx, gz, s, .55, 'nightstand', 'тумбочку', 'desk', off, .22, .22);
          if (rng() < .5) flatOnWall(s, -off, .6, 1.3, 1.75, .03, 'woodpanel');
        } else if (type === 'class' && r < .7) { // парты рядами
          used.add(cellKey(gx, gz));
          for (let i = 0; i < 4; i++) { const px = gx * CELL + 1 + (i % 2) * 2, pz = gz * CELL + 1.1 + (i >> 1) * 1.8; desk(px, pz, false, .9, .5, gx, gz, false); if (rng() < .85) chair(px, pz + .55, .19, 1, false, gx, gz, i); }
        } else if (type === 'class' && !boardDone) { const ws = wallSlots(gx, gz); if (ws.length) { boardDone = true; flatOnWall(ws[0], 0, 2.6, .9, 2.1, .04, 'green'); used.add(cellKey(gx, gz)); } }
        else if (type === 'garage' && r < .22) { // машина на парковочном месте
          used.add(cellKey(gx, gz)); const rot = hash3(gx, gz, 31) < .5, cxp = ccx + (rng() - .5) * .3, czp = ccz + (rng() - .5) * .3, tint = [0x6a6e72, 0x3a4a5a, 0x7a2a22, 0xb8b4a8, 0x2a2c2a, 0x5a6a4a][rng() * 6 | 0];
          const hx = rot ? 2.1 : .9, hz = rot ? .9 : 2.1, cxw = rot ? 1.1 : .78, czw = rot ? .78 : 1.1;
          furn('car', 'брошенную машину', FK('car', gx, gz), () => {
            gb('car', tint).box(cxp - hx, .28, czp - hz, cxp + hx, .95, czp + hz); gb('glass').box(cxp - cxw, .95, czp - czw, cxp + cxw, 1.42, czp + czw, 'ny');
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb('darkp').box(cxp + sx * (hx - .45) - .17, 0, czp + sz * (hz - .45) - .17, cxp + sx * (hx - .45) + .17, .36, czp + sz * (hz - .45) + .17);
            colBox(cxp - hx, 0, czp - hz, cxp + hx, .95, czp + hz); colBox(cxp - cxw, .95, czp - czw, cxp + cxw, 1.42, czp + czw);
          });
        } else if (type === 'mall') {
          if (r < .05) { used.add(cellKey(gx, gz)); const rot = rng() < .5; furn('bench', 'скамейку', FK('bn', gx, gz), () => { const hx = rot ? .25 : .9, hz = rot ? .9 : .25; gb('wood').box(ccx - hx, .42, ccz - hz, ccx + hx, .48, ccz + hz); gb('metal').box(ccx - hx + .05, 0, ccz - hz + .05, ccx + hx - .05, .42, ccz + hz - .05, 'ny'); colBox(ccx - hx, 0, ccz - hz, ccx + hx, .48, ccz + hz); }); }
          else if (r < .09) { used.add(cellKey(gx, gz)); furn('planter', 'кадку', FK('pl', gx, gz), () => { gb('terrazzo').box(ccx - .5, 0, ccz - .5, ccx + .5, .6, ccz + .5); gb('green').box(ccx - .42, .6, ccz - .42, ccx + .42, .95, ccz + .42, 'ny'); colBox(ccx - .5, 0, ccz - .5, ccx + .5, .95, ccz + .5); }); }
          else { const ws = wallSlots(gx, gz); if (ws.length && rng() < .5) { const s = ws[0]; flatOnWall(s, 0, 3.4, .05, 2.9, .04, 'glass'); flatOnWall(s, 0, 3.6, 2.9, 3.4, .08, 'frame'); } }
        } else if (type === 'electric' && r < .6) { // электрощиты на стенах
          const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz)); const s = ws[rng() * ws.length | 0];
          for (let i = 0; i < 2 + (rng() * 2 | 0); i++) { const off = -1.2 + i * .85; furn('epanel', 'электрощит', FK('ep', gx, gz, i), () => { const d = .22, a = s.alongZ ? s.z + off : s.x + off, x1 = s.x + s.nx * d, z1 = s.z + s.nz * d;
            if (s.alongZ) { gb('metal').box(Math.min(s.x, x1), .9, a - .3, Math.max(s.x, x1), 1.9, a + .3); colBox(Math.min(s.x, x1), .9, a - .3, Math.max(s.x, x1), 1.9, a + .3); gb('darkp').box(x1 - .01 * s.nx - .005, 1.2, a - .2, x1 + .005, 1.6, a + .2); }
            else { gb('metal').box(a - .3, .9, Math.min(s.z, z1), a + .3, 1.9, Math.max(s.z, z1)); colBox(a - .3, .9, Math.min(s.z, z1), a + .3, 1.9, Math.max(s.z, z1)); gb('darkp').box(a - .2, 1.2, z1 - .005, a + .2, 1.6, z1 + .005); } }); }
          if (rng() < .4) flatOnWall(s, 0, CELL - .1, H - .45, H - .35, .3, 'metal');
        } else if (type === 'corridor' && zone.key === 'school' && r < .45) { // шкафчики вдоль коридора
          const ws = wallSlots(gx, gz); if (!ws.length) continue; const s = ws[rng() * ws.length | 0]; used.add(cellKey(gx, gz));
          for (let i = 0; i < 4; i++) wallUnit(gx, gz, s, 1.85, 'locker', 'шкафчик', i === 1 ? 'locker' : null, -1.35 + i * .9, .2, .43);
        }
      }
    }
    // ---------- «неправильные» детали и ориентиры (редко): дверь в никуда, лестница в потолок, знак «мокрый пол»
    if (!tiled && !isSpawnChunk(cx, cz) && rng() < .28) {
      const tries = 12;
      for (let k = 0; k < tries; k++) {
        const lx = rng() * CN | 0, lz = rng() * CN | 0, gx = cx * CN + lx, gz = cz * CN + lz; if (used.has(cellKey(gx, gz)) || cellInFeature(gx, gz) || isExitCell(gx, gz)) continue;
        const kind = rng(), ccx = gx * CELL + CELL / 2, ccz = gz * CELL + CELL / 2;
        if (kind < .4) { const ws = wallSlots(gx, gz); if (!ws.length) continue; const s = ws[0]; used.add(cellKey(gx, gz));
          flatOnWall(s, 0, .9, 0, 2.05, .035, 'door'); flatOnWall(s, 0, 1.0, 2.05, 2.12, .05, 'base'); const hs = { ...s, x: s.x + s.nx * .035, z: s.z + s.nz * .035 }; flatOnWall(hs, .33, .1, 1.0, 1.06, .05, 'brass');
          this.landmark = 'door'; break; }
        if (kind < .65 && H > 3.5) { used.add(cellKey(gx, gz)); const rot = rng() < .5, n = Math.ceil(H / .19);
          furn('stairs', 'лестницу', FK('st', gx, gz), () => { for (let i = 0; i < n; i++) { const y = i * .19, d0 = -1.6 + i * (3.2 / n); if (rot) { gb('terrazzo').box(ccx + d0, 0, ccz - .7, ccx + d0 + 3.2 / n + .01, Math.min(H, y + .19), ccz + .7, 'ny'); } else gb('terrazzo').box(ccx - .7, 0, ccz + d0, ccx + .7, Math.min(H, y + .19), ccz + d0 + 3.2 / n + .01, 'ny'); }
            for (let i = 0; i < n; i += 2) { const y = Math.min(H, (i + 1) * .19), d0 = -1.6 + i * (3.2 / n), d1 = d0 + 6.4 / n; if (rot) colBox(ccx + d0, 0, ccz - .7, ccx + d1, y, ccz + .7); else colBox(ccx - .7, 0, ccz + d0, ccx + .7, y, ccz + d1); } });
          this.landmark = 'stairs'; break; }
        if (kind < .85) { used.add(cellKey(gx, gz)); const x = ccx + (rng() - .5) * 2, z = ccz + (rng() - .5) * 2; furn('sign', 'знак «Мокрый пол»', FK('wf', gx, gz), () => { gb('car', 0xe8c020).box(x - .15, 0, z - .2, x + .15, .62, z + .2); colBox(x - .15, 0, z - .2, x + .15, .62, z + .2); }); this.landmark = 'sign'; break; }
        if (soft) { // цепочка следов к стене
          const sx = ccx, sz = ccz, ws = wallSlots(gx, gz); if (!ws.length) continue; const s = ws[0];
          for (let i = 0; i < 4; i++) { const t = i / 4, x = sx + (s.x - sx) * t * .9, z = sz + (s.z - sz) * t * .9; gb('footprint').decal('py', x - .2, .005, z - .3, x + .2, .005, z + .3); }
          this.landmark = 'steps'; break;
        }
      }
    }
    // ---------- mod structures
    Mods.genChunk(this, {
      cx, cz, zone, H, x0, z0, tiled, rng, vr, gb, colBox, seg, W, F, C, layout: L, used, floorY, featureAt, furn, addOccluder: addOcc,
      spawn: (id, p, key) => { if (key && pickedKeys.has(key)) return null; const it = spawnItem(id, p, null, { chunkKey: this.key, key }); this.items.push(it); return it; },
      add: (o) => { this.group.add(o); return o; },
      interactable: (collider, def, key) => { const o = WorldObj.register(this, collider, def, key); this.objects.push(o); return o; },
    });
    // ---------- exit
    if (cx === WORLD.exitCx && cz === WORLD.exitCz) {
      const ex = WORLD.exitX, ez = WORLD.exitZ - 1.2, wt = wallK, wtn = wallT;
      gb(wt, wtn).box(ex - 2, 0, ez - .15, ex - .55, H, ez + .15, 'ny'); gb(wt, wtn).box(ex + .55, 0, ez - .15, ex + 2, H, ez + .15, 'ny'); gb(wt, wtn).box(ex - .55, 2.15, ez - .15, ex + .55, H, ez + .15, 'pxnx');
      colBox(ex - 2, 0, ez - .15, ex - .55, H, ez + .15); colBox(ex + .55, 0, ez - .15, ex + 2, H, ez + .15); colBox(ex - .55, 2.15, ez - .15, ex + .55, H, ez + .15);
      gb('metal').box(ex - .52, 0, ez - .05, ex + .52, 2.12, ez + .05); colBox(ex - .52, 0, ez - .05, ex + .52, 2.12, ez + .05);
      gb('exit').face('pz', ex - .4, 2.25, ez + .155, ex + .4, 2.55, ez + .155); gb('exit').face('nz', ex - .4, 2.25, ez - .155, ex + .4, 2.55, ez - .155);
      WORLD.exitDoor = V3(ex, 1.1, ez);
    }
    // ---------- light fixtures (instanced glow + haze)
    const fx = [], FT = FIXTYPES[zone.fix] || FIXTYPES.panel;
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) { const f = fixtureAt(cx * CN + lx, cz * CN + lz); if (f) fx.push(f); }
    for (const f of fx) {
      const [fw, fd] = FT.frame, hw = f.rot ? fd : fw, hd = f.rot ? fw : fd;
      if (FT.hang) { gb('frame').box(f.x - .06, H - .03, f.z - .06, f.x + .06, H, f.z + .06, 'py'); gb('darkp').box(f.x - .008, H - FT.drop, f.z - .008, f.x + .008, H - .03, f.z + .008, 'pyny'); if (zone.fix === 'tube') gb('frame').box(f.x - hw, H - FT.drop + .03, f.z - hd, f.x + hw, H - FT.drop + .06, f.z + hd); }
      else gb('frame').box(f.x - hw, H - .045, f.z - hd, f.x + hw, H, f.z + hd, 'py');
    }
    if (fx.length) {
      const pm = new THREE.InstancedMesh(FT.geo, panelMat(zone.color), fx.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), up = V3(0, 1, 0);
      let hm = null, aInt = null;
      if (FT.haze) { hm = new THREE.InstancedMesh(hazeGeo(H - FT.drop - .01).clone(), hazeMat(zone.color), fx.length); aInt = new THREE.InstancedBufferAttribute(new Float32Array(fx.length), 1); hm.geometry.setAttribute('aInt', aInt); hm.userData.noAO = true; }
      fx.forEach((f, i) => {
        q.setFromAxisAngle(up, f.rot);
        m4.compose(V3(f.x, H - FT.drop, f.z), q, one); pm.setMatrixAt(i, m4);
        if (hm) { m4.compose(V3(f.x, H - FT.drop - .005, f.z), q, one); hm.setMatrixAt(i, m4); }
        const v = fixtureLit(f) ? 1 : .03; pm.setColorAt(i, tmpColor.setScalar(v)); if (aInt) aInt.array[i] = v > .5 ? 1 : 0;
        this.fixtures.push({ f, idx: i, cur: v });
      });
      pm.instanceColor.needsUpdate = true; pm.computeBoundingSphere(); this.group.add(pm); this.panels = pm;
      if (hm) { hm.computeBoundingSphere(); this.group.add(hm); this.haze = hm; this.hazeAttr = aInt; }
      else this.hazeAttr = { array: new Float32Array(fx.length), needsUpdate: false };
    }
    // ---------- meshes + bake
    const fancyWater = S.water !== 'Простая';
    for (const e of B.values()) {
      const g = e.gb.geo(); if (!g) continue; e.gb.geom = g;
      const m = new THREE.Mesh(g, zmat(e.kind, e.tint));
      const unlit = e.kind === 'stain' || e.kind === 'hole' || e.kind === 'exit' || e.kind === 'footprint';
      const deep = e.kind === 'water', water = deep || e.kind === 'puddle';
      if (!unlit && !(deep && fancyWater)) { g.userData.pending = true; this.baked.push(g); queueBake(g, this); }
      if (deep) { this.hasWater = true; if (fancyWater) { m.layers.set(1); m.frustumCulled = true; } }
      if (water) { m.renderOrder = 2; m.userData.noAO = true; m.receiveShadow = !(deep && fancyWater); }
      else if (unlit) m.userData.noAO = e.kind !== 'hole';
      else { m.castShadow = !e.kind.startsWith('ceil'); m.receiveShadow = true; }
      this.group.add(m);
    }
    // разобранная ранее мебель (ключи в salvaged) — сразу убираем, без перепекания
    for (const f of this.furn) if (salvaged.has(f.key)) Furn.remove(f, false);
    // ---------- loot & notes
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx, gz = cz * CN + lz; if (isPool(gx, gz) || (gx === 0 && gz === 0) || isExitCell(gx, gz)) continue;
      const px = gx * CELL + 1 + hash3(gx, gz, 903) * 2, pz = gz * CELL + 1 + hash3(gx, gz, 904) * 2, p = V3(px, floorY(px, pz) + .35, pz);
      if (noteAt(gx, gz)) { const key = `n${gx},${gz}`; if (!pickedKeys.has(key)) this.items.push(spawnItem('note', p, null, { chunkKey: this.key, key })); continue; }
      if (hash3(gx, gz, 901 + vr) > BAL.lootCell) continue;
      if (used.has(cellKey(gx, gz))) p.y += .9;
      const key = `${gx},${gz},${vr}`; if (pickedKeys.has(key)) continue;
      this.items.push(spawnItem(lootPick(zone, hash3(gx, gz, 902)), p, null, { chunkKey: this.key, key }));
    }
  }
  dispose() {
    this.disposed = true; Mods.emit('chunk:unload', this);
    for (const o of this.objects) WorldObj.remove(o);
    for (const f of this.furn) for (const c of f.cols) FURN.delete(c.handle);
    if (this.occ.length) removeOccluders(this, this.occ);
    scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
    world.removeRigidBody(this.body);
    for (const it of this.items) if (worldItems.has(it)) removeItem(it);
  }
}
const buildQueue = [];
let lastChunkBuild = 0;
function chunkUpdate(px, pz, budget = 1) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
  for (let dz = -RADIUS; dz <= RADIUS; dz++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const k = (pcx + dx) + ',' + (pcz + dz);
    if (!chunks.has(k) && !buildQueue.some(q => q.k === k)) buildQueue.push({ k, cx: pcx + dx, cz: pcz + dz });
  }
  buildQueue.sort((a, b) => (Math.abs(a.cx - pcx) + Math.abs(a.cz - pcz)) - (Math.abs(b.cx - pcx) + Math.abs(b.cz - pcz)));
  // не строим чанки в соседних кадрах подряд — иначе при беге через границу чанков получается серия подтормаживаний
  const now = performance.now(); if (budget <= 1 && now - lastChunkBuild < 70) budget = 0;
  while (budget-- > 0 && buildQueue.length) { lastChunkBuild = now;
    const q = buildQueue.shift(); if (Math.max(Math.abs(q.cx - pcx), Math.abs(q.cz - pcz)) > RADIUS + 1) continue;
    const ch = new Chunk(q.cx, q.cz); chunks.set(q.k, ch); Mods.emit('chunk:load', ch);
  }
  for (const [k, c] of chunks) if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > RADIUS + 1) { c.dispose(); chunks.delete(k); }
}
function cullChunks(cp) {
  const vd = S.viewdist;
  for (const c of chunks.values()) { const x0 = c.cx * CS, z0 = c.cz * CS, dx = Math.max(x0 - cp.x, 0, cp.x - x0 - CS), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - CS); c.group.visible = Math.hypot(dx, dz) < vd; }
}
function rebuildChunk(cx, cz) {
  const k = cx + ',' + cz, c = chunks.get(k); if (!c) return false;
  for (let gz = cz * CN - 1; gz <= cz * CN + CN; gz++) for (let gx = cx * CN - 1; gx <= cx * CN + CN; gx++) { edgeCache.delete(ckey(gx, gz) * 2); edgeCache.delete(ckey(gx, gz) * 2 + 1); fixCache.delete(ckey(gx, gz)); }
  layoutCache.delete(ckey(cx, cz));
  c.dispose(); chunks.delete(k); const ch = new Chunk(cx, cz); chunks.set(k, ch); Mods.emit('chunk:load', ch); return true;
}
function clearWorld() {
  for (const c of chunks.values()) c.dispose(); chunks.clear(); buildQueue.length = 0; BAKEQ.length = 0; OCC.clear(); FURN.clear();
  for (const l of [...LAMPS.values()]) removeLamp(l);
  FIX.slot.clear(); FIX.byslot.length = 0; FIX.free.length = 0; FIX.next = 2; FIX.data.fill(0); FIX.dirty = true;
  for (const it of [...worldItems]) removeItem(it);
  Mods.emit('world:clear', {});
}

