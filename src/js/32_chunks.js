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
const ROOM_TYPES = {
  lobby: [['empty', 7], ['lounge', 1.2], ['storage', .8], ['office', .8]],
  office: [['office', 6], ['storage', 2], ['empty', 2], ['lounge', 1]],
  dark: [['empty', 4], ['storage', 3], ['office', 2]],
  flooded: [['empty', 6], ['storage', 2]],
  industrial: [['storage', 5], ['empty', 3]],
};
function roomType(zone, rng) {
  const list = zone.roomTypes || ROOM_TYPES[zone.key] || [['empty', 1]];
  let r = rng() * list.reduce((a, x) => a + x[1], 0); for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0];
}
class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = cx + ',' + cz; this.zone = ZONES[zoneKeyOf(cx, cz)] || ZONES.lobby;
    this.group = new THREE.Group(); this.fixtures = []; this.items = []; this.baked = []; this.objects = [];
    this.build(); scene.add(this.group);
  }
  build() {
    const { cx, cz, zone } = this, H = zone.H, x0 = cx * CS, z0 = cz * CS, tiled = zone.mat === 'tile';
    const vr = variantOf(cx, cz) * 977, L = this.layout = layoutOf(cx, cz), dirty = (zone.dirt || 0) > .4;
    const B = new Map();
    const gb = (kind, tint = 0xffffff) => { const k = kind + ':' + tint; let e = B.get(k); if (!e) { e = { gb: new GB(...(UVS[kind] || [1])), kind, tint }; B.set(k, e); } return e.gb; };
    const body = this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const colBox = (a, b, c, d, e, f) => world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.005, (d - a) / 2), Math.max(.005, (e - b) / 2), Math.max(.005, (f - c) / 2)).setTranslation((a + d) / 2, (b + e) / 2, (c + f) / 2).setFriction(.6), body);
    this.gb = gb; this.colBox = colBox;
    const W = () => tiled ? gb('tile') : gb(dirty ? 'wallD' : 'wall', zone.tint);
    const F = () => tiled ? gb('tile') : gb(dirty ? 'floorD' : 'floor', zone.carpet);
    const C = () => tiled ? gb('ceilT') : gb(dirty ? 'ceilD' : 'ceil');
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
    // ---------- ямы и помосты со ступенями
    for (const f of L.features) {
      const pit = f.kind === 'pit', n = f.n, R = k => [f.x0 + k * f.sw, f.z0 + k * f.sw, f.x1 - k * f.sw, f.z1 - k * f.sw];
      const yOf = k => (pit ? -1 : 1) * f.rise * Math.min(n, k + 1);
      for (let k = 0; k < n; k++) {
        const o = R(k), i = k < n - 1 ? R(k + 1) : null, y = yOf(k), yPrev = k === 0 ? 0 : yOf(k - 1);
        const strips = i ? [[o[0], o[1], o[2], i[1]], [o[0], i[3], o[2], o[3]], [o[0], i[1], i[0], i[3]], [i[2], i[1], o[2], i[3]]] : [o];
        for (const r of strips) { F().face('py', r[0], y, r[1], r[2], y, r[3]); if (pit) colBox(r[0], -f.depth - .6, r[1], r[2], y, r[3]); else colBox(r[0], 0, r[1], r[2], y, r[3]); }
        // подступенки
        const lo = Math.min(y, yPrev), hi = Math.max(y, yPrev), g = F();
        if (pit) { g.face('px', o[0], lo, o[1], o[0], hi, o[3]); g.face('nx', o[2], lo, o[1], o[2], hi, o[3]); g.face('pz', o[0], lo, o[1], o[2], hi, o[1]); g.face('nz', o[0], lo, o[3], o[2], hi, o[3]); }
        else { g.face('nx', o[0], lo, o[1], o[0], hi, o[3]); g.face('px', o[2], lo, o[1], o[2], hi, o[3]); g.face('nz', o[0], lo, o[1], o[2], hi, o[1]); g.face('pz', o[0], lo, o[3], o[2], hi, o[3]); }
        if (!tiled) { const e = .012; gb('base').box(o[0] - (pit ? 0 : e), hi - .015, o[1] - (pit ? 0 : e), o[2] + (pit ? 0 : e), hi + .004, o[3] + (pit ? 0 : e), 'ny'); }
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
    const seg = (alongZ, fixed, a, b, y0, y1, base = true, kind = null, th = T) => {
      if (b - a < .05) return;
      const g = kind ? gb(kind) : W();
      if (alongZ) { g.box(fixed - th, y0, a, fixed + th, y1, b, 'ny'); colBox(fixed - th, y0, a, fixed + th, y1, b); if (base && !tiled && !kind) gb('base').box(fixed - th - .015, 0, a + .001, fixed + th + .015, .12, b - .001, 'nypy'); }
      else { g.box(a, y0, fixed - th, b, y1, fixed + th, 'ny'); colBox(a, y0, fixed - th, b, y1, fixed + th); if (base && !tiled && !kind) gb('base').box(a + .001, 0, fixed - th - .015, b - .001, .12, fixed + th + .015, 'nypy'); }
    };
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
          const dw = doorHalf(gx, gz); seg(alongZ, fixed, a, c - dw, 0, h); seg(alongZ, fixed, c + dw, b, 0, h); seg(alongZ, fixed, c - dw, c + dw, 2.25, h, false);
          // наличник
          if (!tiled) { const fr = gb('base'); if (alongZ) { fr.box(fixed - T - .02, 0, c - dw - .05, fixed + T + .02, 2.3, c - dw, 'ny'); fr.box(fixed - T - .02, 0, c + dw, fixed + T + .02, 2.3, c + dw + .05, 'ny'); fr.box(fixed - T - .02, 2.25, c - dw, fixed + T + .02, 2.3, c + dw, 'ny'); } else { fr.box(c - dw - .05, 0, fixed - T - .02, c - dw, 2.3, fixed + T + .02, 'ny'); fr.box(c + dw, 0, fixed - T - .02, c + dw + .05, 2.3, fixed + T + .02, 'ny'); fr.box(c - dw, 2.25, fixed - T - .02, c + dw, 2.3, fixed + T + .02, 'ny'); } }
          if (dw < .72 && hash3(gx * 2 + dir, gz, 5150 + vr) < (zone.doorObjP || 0) && !inFeature(alongZ ? fixed : c, alongZ ? c : fixed, 1)) this.objects.push(WorldObj.door(this, { gx, gz, dir, alongZ, fixed, c, dw, tiled }));
        }
        else if (t === 4) { seg(alongZ, fixed, a + .3, b - .3, 0, 1.3, false, 'cloth', .05); }
      }
      // pillars (не в ямах и не на помостах)
      const ps = zone.pillarS / 2;
      if (hash3(gx, gz, 707 + vr) < zone.pillarP && !isPool(gx, gz) && !isPool(gx - 1, gz) && !isPool(gx, gz - 1) && !isPool(gx - 1, gz - 1) && !(gx === 0 && gz === 0) && !isExitCell(gx, gz) && !inFeature(gx * CELL, gz * CELL, ps + .5)) {
        const px = gx * CELL, pz = gz * CELL;
        W().box(px - ps, 0, pz - ps, px + ps, H, pz + ps, 'nypy'); colBox(px - ps, 0, pz - ps, px + ps, H, pz + ps);
        if (!tiled) gb('base').box(px - ps - .015, 0, pz - ps - .015, px + ps + .015, .12, pz + ps + .015, 'nypy');
      }
      if (isPool(gx, gz) || isExitCell(gx, gz)) continue;
      // ---------- следы запустения — только в «грязных» зонах
      const dirt = zone.dirt || 0;
      if (!tiled && rng() < dirt * .3) { const sx = gx * CELL + .6 + rng() * 2.8, sz = gz * CELL + .6 + rng() * 2.8, rr = .4 + rng() * 1.1; if (!inFeature(sx, sz, rr)) gb('stain').face('py', sx - rr, .004, sz - rr, sx + rr, .004, sz + rr); }
      if (!tiled && !zone.flood && rng() < dirt * .1) { const sx = gx * CELL + 1 + rng() * 2, sz = gz * CELL + 1 + rng() * 2, w = .4 + rng() * .9, d = .3 + rng() * .7; if (!inFeature(sx, sz, 1)) gb('puddle').face('py', sx - w, .012, sz - d, sx + w, .012, sz + d, 2); }
      if (!tiled && rng() < dirt * .08) { // упавшая потолочная плитка + дыра
        const hx = Math.floor((gx * CELL + .3 + rng() * 3) / .6) * .6, hz = Math.floor((gz * CELL + .3 + rng() * 3) / .6) * .6;
        gb('hole').face('ny', hx, H - .004, hz, hx + .6, H - .004, hz + .6);
        const fx = hx + rng() * .8 - .4, fz = hz + rng() * .8 - .4; if (!inFeature(fx, fz, 1)) gb('ceilD').box(fx, 0, fz, fx + .6, .018, fz + .6, 'ny');
      }
    }
    // ---------- комнаты: тип, мебель, интерактивные объекты
    const ctxObj = { chunk: this, gb, colBox, rng, zone, used, H };
    if (!tiled) for (const room of L.rooms) {
      const type = room.type = room.open || room.maze ? 'empty' : roomType(zone, rng);
      const cells = []; for (let lz = room.z0; lz < room.z0 + room.h; lz++) for (let lx = room.x0; lx < room.x0 + room.w; lx++) { const gx = cx * CN + lx, gz = cz * CN + lz; if (!isExitCell(gx, gz) && !(gx === 0 && gz === 0) && !cellInFeature(gx, gz)) cells.push([gx, gz]); }
      if (!cells.length) continue;
      // выключатель у стены комнаты
      if (!room.open && !room.maze && rng() < (zone.switchP || 0)) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { const ws = wallSlots(gx, gz); if (!ws.length) continue; this.objects.push(WorldObj.lightSwitch(this, ws[0], gx, gz, room)); break; }
      }
      // питьевой фонтанчик
      if (rng() < (zone.fountainP || 0) * (room.w * room.h >= 4 ? 1 : .4)) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { if (used.has(cellKey(gx, gz))) continue; const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz)); this.objects.push(WorldObj.fountain(this, ws[ws.length - 1], gx, gz)); break; }
      }
      // телефон на стене (редко)
      if ((zone.key === 'office' || zone.key === 'lobby' || zone.key === 'dark') && rng() < .06) {
        for (const [gx, gz] of cells.sort(() => rng() - .5)) { if (used.has(cellKey(gx, gz))) continue; const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz)); this.objects.push(WorldObj.phone(this, ws[0], gx, gz)); break; }
      }
      for (const [gx, gz] of cells) {
        if (used.has(cellKey(gx, gz))) continue;
        const ccx = gx * CELL + CELL / 2, ccz = gz * CELL + CELL / 2, r = rng();
        if (type === 'office' && r < .55) { // стол с ящиком + стул
          used.add(cellKey(gx, gz));
          const rot = rng() < .5, w = 1.4, d = .7, hx = rot ? d / 2 : w / 2, hz = rot ? w / 2 : d / 2, px = ccx + (rng() - .5) * .8, pz = ccz + (rng() - .5) * .8;
          gb('wood').box(px - hx, .72, pz - hz, px + hx, .76, pz + hz);
          gb('metal').box(px - hx + .02, 0, pz - hz + .02, px - hx + .06, .72, pz + hz - .02); gb('metal').box(px + hx - .06, 0, pz - hz + .02, px + hx - .02, .72, pz + hz - .02);
          const dc = rot ? [px - hx + .08, .45, pz - .25, px + hx - .08, .7, pz + .25] : [px - .25, .45, pz - hz + .08, px + .25, .7, pz + hz - .08];
          gb('metal').box(...dc);
          const top = colBox(px - hx, 0, pz - hz, px + hx, .76, pz + hz);
          if (rng() < .7) this.objects.push(WorldObj.container(this, top, `dk:${gx},${gz},${vr}`, 'ящик стола', 'desk'));
          if (rng() < .8) { const s = .22, cx2 = px + (rot ? (rng() < .5 ? -1 : 1) * .75 : 0), cz2 = pz + (rot ? 0 : (rng() < .5 ? -1 : 1) * .75); WorldObj.chair(ctxObj, cx2, cz2, s, rng() < .5 ? 1 : -1); }
        } else if ((type === 'storage' && r < .45) || (type === 'office' && r < .7)) { // шкаф / стеллаж у стены
          const ws = wallSlots(gx, gz); if (!ws.length) continue; used.add(cellKey(gx, gz));
          const s = ws[rng() * ws.length | 0];
          const along = rng() < .5 ? -1 : 1, off = .9 * along;
          const wx = s.x + s.nx * .3 + (s.alongZ ? 0 : off), wz = s.z + s.nz * .3 + (s.alongZ ? off : 0), hw = s.alongZ ? .25 : .45, hd = s.alongZ ? .45 : .25, hh = type === 'storage' ? 1.8 : 1.3;
          gb('metal').box(wx - hw, 0, wz - hd, wx + hw, hh, wz + hd);
          // ручки/ящики
          for (let y = .25; y < hh - .1; y += hh > 1.5 ? .55 : .42) gb('darkp').box(wx - hw * .9 + (s.nx > 0 ? hw * 1.85 : s.nx < 0 ? -.01 : 0), y, wz - hd * .9 + (s.nz > 0 ? hd * 1.85 : s.nz < 0 ? -.01 : 0), wx + hw * .9 + (s.nx < 0 ? -hw * 1.85 : s.nx > 0 ? .01 : 0), y + .03, wz + hd * .9 + (s.nz < 0 ? -hd * 1.85 : s.nz > 0 ? .01 : 0));
          const col = colBox(wx - hw, 0, wz - hd, wx + hw, hh, wz + hd);
          this.objects.push(WorldObj.container(this, col, `cb:${gx},${gz},${vr}`, type === 'storage' ? 'шкафчик' : 'картотеку', type === 'storage' ? 'locker' : 'cabinet'));
        } else if (type === 'storage' && r < .7) { // коробки
          used.add(cellKey(gx, gz));
          let y = 0; const px = ccx + (rng() - .5) * 2, pz = ccz + (rng() - .5) * 2, n = 1 + (rng() * 3 | 0);
          for (let i = 0; i < n; i++) { const s = .25 + rng() * .15, h = .3 + rng() * .2, ox = (rng() - .5) * .1; gb('card').box(px - s + ox, y, pz - s, px + s + ox, y + h, pz + s, 'ny'); colBox(px - s + ox, y, pz - s, px + s + ox, y + h, pz + s); y += h; }
        } else if (type === 'lounge' && r < .4) { // ряд стульев / диван
          used.add(cellKey(gx, gz));
          if (rng() < .5) { const ws = wallSlots(gx, gz); if (ws.length) { const s = ws[0]; WorldObj.sofa(ctxObj, s); continue; } }
          const n = 2 + (rng() * 3 | 0), alongX = rng() < .5, back = rng() < .5 ? 1 : -1;
          for (let i = 0; i < n; i++) WorldObj.chair(ctxObj, ccx + (alongX ? (i - (n - 1) / 2) * .6 : 0), ccz + (alongX ? 0 : (i - (n - 1) / 2) * .6), .22, back, !alongX);
        } else if (type === 'empty' && r < .012) { // одинокий стул посреди пустоты
          used.add(cellKey(gx, gz)); WorldObj.chair(ctxObj, ccx + (rng() - .5) * 2, ccz + (rng() - .5) * 2, .22, rng() < .5 ? 1 : -1, rng() < .5);
        }
      }
    }
    // ---------- mod structures
    Mods.genChunk(this, {
      cx, cz, zone, H, x0, z0, tiled, rng, vr, gb, colBox, seg, W, F, C, layout: L, used, floorY, featureAt,
      spawn: (id, p, key) => { if (key && pickedKeys.has(key)) return null; const it = spawnItem(id, p, null, { chunkKey: this.key, key }); this.items.push(it); return it; },
      add: (o) => { this.group.add(o); return o; },
      interactable: (collider, def, key) => { const o = WorldObj.register(this, collider, def, key); this.objects.push(o); return o; },
    });
    // ---------- exit
    if (cx === WORLD.exitCx && cz === WORLD.exitCz) {
      const ex = WORLD.exitX, ez = WORLD.exitZ - 1.2, wt = tiled ? 'tile' : 'wall';
      gb(wt, zone.tint).box(ex - 2, 0, ez - .15, ex - .55, H, ez + .15, 'ny'); gb(wt, zone.tint).box(ex + .55, 0, ez - .15, ex + 2, H, ez + .15, 'ny'); gb(wt, zone.tint).box(ex - .55, 2.15, ez - .15, ex + .55, H, ez + .15, 'ny');
      colBox(ex - 2, 0, ez - .15, ex - .55, H, ez + .15); colBox(ex + .55, 0, ez - .15, ex + 2, H, ez + .15); colBox(ex - .55, 2.15, ez - .15, ex + .55, H, ez + .15);
      gb('metal').box(ex - .52, 0, ez - .05, ex + .52, 2.12, ez + .05); colBox(ex - .52, 0, ez - .05, ex + .52, 2.12, ez + .05);
      gb('exit').face('pz', ex - .4, 2.25, ez + .155, ex + .4, 2.55, ez + .155); gb('exit').face('nz', ex - .4, 2.25, ez - .155, ex + .4, 2.55, ez - .155);
      WORLD.exitDoor = V3(ex, 1.1, ez);
    }
    // ---------- light fixtures (instanced panels + haze)
    const fx = [];
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) { const f = fixtureAt(cx * CN + lx, cz * CN + lz); if (f) fx.push(f); }
    for (const f of fx) { const hw = f.rot ? .35 : .65, hd = f.rot ? .65 : .35; gb('frame').box(f.x - hw, H - .045, f.z - hd, f.x + hw, H, f.z + hd, 'py'); }
    if (fx.length) {
      const pm = new THREE.InstancedMesh(PANEL_GEO, tiled ? PANEL.cool : PANEL.warm, fx.length);
      const hm = new THREE.InstancedMesh(hazeGeo(H - .06).clone(), tiled ? HAZE_MAT_COOL : HAZE_MAT, fx.length);
      const aInt = new THREE.InstancedBufferAttribute(new Float32Array(fx.length), 1); hm.geometry.setAttribute('aInt', aInt);
      hm.userData.noAO = true;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), up = V3(0, 1, 0);
      fx.forEach((f, i) => {
        q.setFromAxisAngle(up, f.rot);
        m4.compose(V3(f.x, H - .055, f.z), q, one); pm.setMatrixAt(i, m4);
        m4.compose(V3(f.x, H - .06, f.z), q, one); hm.setMatrixAt(i, m4);
        const v = fixtureLit(f) ? 1 : .03; pm.setColorAt(i, tmpColor.setScalar(v)); aInt.array[i] = v > .5 ? 1 : 0;
        this.fixtures.push({ f, idx: i, cur: v });
      });
      pm.instanceColor.needsUpdate = true; pm.computeBoundingSphere(); hm.computeBoundingSphere();
      this.panels = pm; this.haze = hm; this.hazeAttr = aInt; this.group.add(pm, hm);
    }
    // ---------- meshes + bake
    for (const e of B.values()) {
      const g = e.gb.geo(); if (!g) continue;
      const m = new THREE.Mesh(g, zmat(e.kind, e.tint));
      const unlit = e.kind === 'stain' || e.kind === 'hole' || e.kind === 'exit';
      const water = e.kind === 'water' || e.kind === 'puddle';
      if (!unlit && !(water && S.water !== 'Простая' && e.kind === 'water')) { g.userData.pending = true; this.baked.push(g); BAKEQ.push({ g, c: this, i: 0, fx: null }); }
      if (water) { m.renderOrder = 2; m.userData.noAO = true; m.receiveShadow = true; }
      else if (unlit) m.userData.noAO = e.kind !== 'hole';
      else { m.castShadow = e.kind !== 'ceil' && e.kind !== 'ceilT' && e.kind !== 'ceilD'; m.receiveShadow = true; }
      this.group.add(m);
    }
    // ---------- loot & notes
    for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx, gz = cz * CN + lz; if (isPool(gx, gz) || (gx === 0 && gz === 0) || isExitCell(gx, gz)) continue;
      const px = gx * CELL + 1 + hash3(gx, gz, 903) * 2, pz = gz * CELL + 1 + hash3(gx, gz, 904) * 2, p = V3(px, floorY(px, pz) + .35, pz);
      if (noteAt(gx, gz)) { const key = `n${gx},${gz}`; if (!pickedKeys.has(key)) this.items.push(spawnItem('note', p, null, { chunkKey: this.key, key })); continue; }
      if (hash3(gx, gz, 901 + vr) > BAL.lootCell) continue;
      if (used.has(cellKey(gx, gz))) p.y += .9; // над мебелью — упадёт сверху
      const key = `${gx},${gz},${vr}`; if (pickedKeys.has(key)) continue;
      this.items.push(spawnItem(lootPick(zone, hash3(gx, gz, 902)), p, null, { chunkKey: this.key, key }));
    }
  }
  dispose() {
    this.disposed = true; Mods.emit('chunk:unload', this);
    for (const o of this.objects) WorldObj.remove(o);
    scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.geometry !== PANEL_GEO && !o.geometry.userData.shared) o.geometry.dispose(); });
    world.removeRigidBody(this.body);
    for (const it of this.items) if (worldItems.has(it)) removeItem(it);
  }
}
const buildQueue = [];
// time-sliced baking (keeps frame time flat when new chunks stream in)
const BAKEQ = [];
function processBake(budgetMs) {
  const t0 = performance.now(), cp = camera.position;
  if (BAKEQ.length > 1) BAKEQ.sort((a, b) => (Math.abs(a.c.cx * CS + 12 - cp.x) + Math.abs(a.c.cz * CS + 12 - cp.z)) - (Math.abs(b.c.cx * CS + 12 - cp.x) + Math.abs(b.c.cz * CS + 12 - cp.z)));
  while (BAKEQ.length) {
    const j = BAKEQ[0];
    if (j.c.disposed) { BAKEQ.shift(); continue; }
    const g = j.g; if (!j.fx) j.fx = fixturesAround(j.c.cx * CS, j.c.cz * CS, j.c.cx * CS + CS, j.c.cz * CS + CS);
    const P = g.attributes.position.array, N = g.attributes.normal.array, Sm = g.userData.samples, L = g.attributes.aLight.array;
    for (; j.i < P.length; j.i += 3) {
      const i = j.i; let r = AMBIENT, gg = AMBIENT * .95, b = AMBIENT * .8;
      for (const f of j.fx) { const c = contrib(f, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], Sm[i], Sm[i + 2]); if (c) { fcol.set(f.color); r += c * fcol.r; gg += c * fcol.g; b += c * fcol.b; } }
      L[i] = r; L[i + 1] = gg; L[i + 2] = b;
      if ((i & 255) === 0 && performance.now() - t0 > budgetMs) { g.attributes.aLight.needsUpdate = true; return; }
    }
    g.attributes.aLight.needsUpdate = true; g.userData.pending = false; BAKEQ.shift();
  }
}
const flushBake = () => processBake(1e9);
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
  for (const c of chunks.values()) c.dispose(); chunks.clear(); buildQueue.length = 0; BAKEQ.length = 0;
  for (const it of [...worldItems]) removeItem(it);
}

