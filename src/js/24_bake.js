// =====================================================================
//  BAKED LIGHTING v5 — per-vertex, occluded by grid walls AND by furniture,
//  pillars, lintels and player-built pieces (3D occluder grid).
//  Каждая вершина хранит 4 самых сильных светильника (номер слота + вес):
//  их текущая яркость берётся из текстуры FIX каждый кадр → мигание, выключатели,
//  отключения и торшеры работают без перепекания и без «двойного» света.
//  Остальной (слабый) свет — статичный остаток в aLight.
// =====================================================================
const BAKE_R = 12.5, BAKE_R2 = BAKE_R * BAKE_R, BAKE_P = 2.5, AMBIENT = .006;
// слоты 0 и 1 всегда чёрные: атрибут vec4 по умолчанию (0,0,0,1) у чужих геометрий не даёт света
// ---------------- fixture slots → texture (rgb = цвет × текущая яркость)
const FIX_W = 64, FIX_N = FIX_W * FIX_W;
const FIX = { data: new Float32Array(FIX_N * 4), slot: new Map(), byslot: [], next: 2, free: [], dirty: true, tex: null };
FIX.tex = new THREE.DataTexture(FIX.data, FIX_W, FIX_W, THREE.RGBAFormat, THREE.FloatType);
FIX.tex.minFilter = FIX.tex.magFilter = THREE.NearestFilter; FIX.tex.generateMipmaps = false; FIX.tex.needsUpdate = true;
U.fixTex.value = FIX.tex;
const fixCol = f => f._col || (f._col = new THREE.Color(f.color));
function fixSlot(f) {
  let s = FIX.slot.get(f.key); if (s) return s;
  if (FIX.free.length) s = FIX.free.pop();
  else if (FIX.next < FIX_N) s = FIX.next++;
  else { // освобождаем слоты далёких светильников
    const cp = camera.position, far = (RADIUS + 2.5) * CS;
    for (const [k, sl] of FIX.slot) { const o = FIX.byslot[sl]; if (o && !o.lamp && Math.hypot(o.x - cp.x, o.z - cp.z) > far) { FIX.slot.delete(k); FIX.byslot[sl] = null; FIX.free.push(sl); } }
    if (!FIX.free.length) return 0; s = FIX.free.pop();
  }
  FIX.slot.set(f.key, s); FIX.byslot[s] = f;
  setFixVal(f, f._v ?? (staticLit(f) ? 1 : 0), s); return s;
}
function setFixVal(f, v, s = FIX.slot.get(f.key)) {
  if (!s) return; const c = fixCol(f), i = s * 4, d = FIX.data;
  const r = c.r * v, g = c.g * v, b = c.b * v;
  if (d[i] !== r || d[i + 1] !== g || d[i + 2] !== b) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 1; FIX.dirty = true; }
}
// ---------------- lamps placed by the player (баки как светильники)
const LAMPS = new Map(); let lampSeq = 0;
function addLamp(l) { l.lamp = true; l.key = l.key || 'lamp:' + (++lampSeq); l.seed = Math.random(); LAMPS.set(l.key, l); l._v = l.on ? 1 : 0; queueRebake(l.x, l.z, l.R || lampRange(l)); return l; }
function removeLamp(l) { if (!l || !LAMPS.has(l.key)) return; LAMPS.delete(l.key); setFixVal(l, 0); const s = FIX.slot.get(l.key); if (s) { FIX.slot.delete(l.key); FIX.byslot[s] = null; FIX.free.push(s); } queueRebake(l.x, l.z, lampRange(l)); }
const lampRange = l => 8.5 * Math.sqrt(l.boost || 1);
// «обычно горит» — для статичного остатка
const staticLit = f => f.lamp ? !!f.on : fixtureLit(f);
const canLight = f => f && (f.lamp || (!f.broken && !deadFixtures.has(f.key)));
// ---------------- 2D wall line of sight (grid walls)
function losClear(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  if (Math.abs(dx) > 1e-6) {
    const k0 = Math.floor(x0 / CELL), k1 = Math.floor(x1 / CELL);
    if (dx > 0) { for (let k = k0 + 1; k <= k1; k++) { const zc = z0 + dz * ((k * CELL - x0) / dx), gz = Math.floor(zc / CELL); if (edgeBlocks(k - 1, gz, 0, zc - gz * CELL)) return false; } }
    else { for (let k = k0; k > k1; k--) { const zc = z0 + dz * ((k * CELL - x0) / dx), gz = Math.floor(zc / CELL); if (edgeBlocks(k - 1, gz, 0, zc - gz * CELL)) return false; } }
  }
  if (Math.abs(dz) > 1e-6) {
    const k0 = Math.floor(z0 / CELL), k1 = Math.floor(z1 / CELL);
    if (dz > 0) { for (let k = k0 + 1; k <= k1; k++) { const xc = x0 + dx * ((k * CELL - z0) / dz), gx = Math.floor(xc / CELL); if (edgeBlocks(gx, k - 1, 1, xc - gx * CELL)) return false; } }
    else { for (let k = k0; k > k1; k--) { const xc = x0 + dx * ((k * CELL - z0) / dz), gx = Math.floor(xc / CELL); if (edgeBlocks(gx, k - 1, 1, xc - gx * CELL)) return false; } }
  }
  return true;
}
// ---------------- 3D occluders (furniture, pillars, lintels, pieces), stored per cell
const OCC = new Map();
function addOccluder(b, owner) {
  const gx0 = Math.floor(b[0] / CELL), gx1 = Math.floor(b[3] / CELL), gz0 = Math.floor(b[2] / CELL), gz1 = Math.floor(b[5] / CELL);
  b.owner = owner;
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) { const k = ckey(gx, gz); let l = OCC.get(k); if (!l) OCC.set(k, l = []); l.push(b); }
  return b;
}
function removeOccluders(owner, boxes) {
  for (const b of boxes) {
    const gx0 = Math.floor(b[0] / CELL), gx1 = Math.floor(b[3] / CELL), gz0 = Math.floor(b[2] / CELL), gz1 = Math.floor(b[5] / CELL);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) { const k = ckey(gx, gz), l = OCC.get(k); if (!l) continue; const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); if (!l.length) OCC.delete(k); }
  }
}
function segBox(ox, oy, oz, dx, dy, dz, b) {
  let t0 = .002, t1 = .998, ta, tb;
  if (Math.abs(dx) < 1e-9) { if (ox < b[0] || ox > b[3]) return false; } else { ta = (b[0] - ox) / dx; tb = (b[3] - ox) / dx; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false; }
  if (Math.abs(dy) < 1e-9) { if (oy < b[1] || oy > b[4]) return false; } else { ta = (b[1] - oy) / dy; tb = (b[4] - oy) / dy; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false; }
  if (Math.abs(dz) < 1e-9) { if (oz < b[2] || oz > b[5]) return false; } else { ta = (b[2] - oz) / dz; tb = (b[5] - oz) / dz; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false; }
  return true;
}
function occBlocked(x0, y0, z0, x1, y1, z1) {
  if (!OCC.size) return false;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  let gx = Math.floor(x0 / CELL), gz = Math.floor(z0 / CELL); const gx1 = Math.floor(x1 / CELL), gz1 = Math.floor(z1 / CELL);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : 1e9, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : 1e9;
  let tmx = Math.abs(dx) > 1e-9 ? (sx > 0 ? (gx + 1) * CELL - x0 : x0 - gx * CELL) / Math.abs(dx) : 1e9;
  let tmz = Math.abs(dz) > 1e-9 ? (sz > 0 ? (gz + 1) * CELL - z0 : z0 - gz * CELL) / Math.abs(dz) : 1e9;
  for (let n = 0; n < 24; n++) {
    const l = OCC.get(ckey(gx, gz)); if (l) for (let i = 0; i < l.length; i++) if (segBox(x0, y0, z0, dx, dy, dz, l[i])) return true;
    if (gx === gx1 && gz === gz1) break;
    if (tmx < tmz) { tmx += tdx; gx += sx; } else { tmz += tdz; gz += sz; }
  }
  return false;
}
// ---------------- one light's contribution to a surface point
function contrib(f, px, py, pz, nx, ny, nz, sx, sy, sz) {
  const R = f.lamp ? lampRange(f) : BAKE_R, R2 = R * R;
  const lx = f.x - px, ly = f.y - py, lz = f.z - pz, d2 = lx * lx + ly * ly + lz * lz;
  if (d2 > R2) return 0;
  const d = Math.sqrt(d2) + 1e-4, ux = lx / d, uy = ly / d, uz = lz / d;
  const lam = (nx || ny || nz) ? Math.max(0, nx * ux + ny * uy + nz * uz) : 1;
  const emit = f.lamp ? 1 : .3 + .7 * Math.max(0, uy), I = f.lamp ? .55 * (f.boost || 1) : 1;
  let v = BAKE_P * I * (lam * emit / (d2 + .8) + .085 / (1 + d2 * .09)) * (1 - smooth(R * .55, R, d));
  if (v < 2e-4) return 0;
  if (!losClear(sx, sz, f.x, f.z)) return 0;
  // мебель/колонны: мягкая тень — проверяем центр и края лампы
  if (OCC.size) {
    const ly0 = f.lamp ? f.y : f.y - .02;
    if (occBlocked(sx, sy, sz, f.x, ly0, f.z)) {
      if (f.lamp) return v * .04;
      const ax = f.rot ? 0 : .5, az = f.rot ? .5 : 0;
      let vis = 0; if (!occBlocked(sx, sy, sz, f.x + ax, ly0, f.z + az)) vis += .5; if (!occBlocked(sx, sy, sz, f.x - ax, ly0, f.z - az)) vis += .5;
      v *= .04 + vis * .6;
    }
  }
  return v;
}
function fixturesAround(x0, z0, x1, z1) {
  const out = [], pad = Math.ceil(BAKE_R / CELL);
  for (let gz = Math.floor(z0 / CELL) - pad; gz <= Math.floor(z1 / CELL) + pad; gz++)
    for (let gx = Math.floor(x0 / CELL) - pad; gx <= Math.floor(x1 / CELL) + pad; gx++) { const f = fixtureAt(gx, gz); if (canLight(f)) out.push(f); }
  for (const l of LAMPS.values()) { const r = lampRange(l); if (l.x > x0 - r && l.x < x1 + r && l.z > z0 - r && l.z < z1 + r) out.push(l); }
  return out;
}
// bake vertices [i0, i1) of a geometry. P/N/S in world space (S — точка выборки).
const _ids = [0, 0, 0, 0], _ws = [0, 0, 0, 0];
function bakeVertex(g, vi, px, py, pz, nx, ny, nz, sx, sy, sz, fx) {
  let r = AMBIENT, gg = AMBIENT * .95, b = AMBIENT * .8, n = 0;
  _ws[0] = _ws[1] = _ws[2] = _ws[3] = 0; _ids[0] = _ids[1] = _ids[2] = _ids[3] = 0;
  for (let k = 0; k < fx.length; k++) {
    const f = fx[k], c = contrib(f, px, py, pz, nx, ny, nz, sx, sy, sz); if (!c) continue;
    // в топ-4 — самые сильные; вытесненный уходит в статичный остаток
    let ef = f, ec = c;
    let slotIdx = -1, minW = 1e9, mi = 0;
    for (let q = 0; q < 4; q++) if (_ws[q] < minW) { minW = _ws[q]; mi = q; }
    if (c > minW) {
      const s = fixSlot(f);
      if (s) { if (_ws[mi] > 0) { ef = FIX.byslot[_ids[mi]]; ec = _ws[mi]; } else ef = null; _ids[mi] = s; _ws[mi] = c; slotIdx = mi; }
    }
    if (slotIdx >= 0 && !ef) continue;
    if (ef && staticLit(ef) && !(ef.flicker)) { const col = fixCol(ef); r += ec * col.r; gg += ec * col.g; b += ec * col.b; }
  }
  const L = g.attributes.aLight.array, I = g.attributes.aFixI.array, W = g.attributes.aFixW.array;
  L[vi * 3] = r; L[vi * 3 + 1] = gg; L[vi * 3 + 2] = b;
  for (let q = 0; q < 4; q++) { I[vi * 4 + q] = _ids[q]; W[vi * 4 + q] = _ws[q]; }
}
function markBaked(g) { g.attributes.aLight.needsUpdate = true; g.attributes.aFixI.needsUpdate = true; g.attributes.aFixW.needsUpdate = true; }
// ---------------- time-sliced bake queue (chunks and re-bakes)
const BAKEQ = [];
function queueBake(g, c) {
  if (g.userData.job) { g.userData.job.i = 0; g.userData.job.fx = null; return; }
  const j = { g, c, i: 0, fx: null }; g.userData.job = j; BAKEQ.push(j);
}
function queueRebake(x, z, r = BAKE_R) {
  bus.emit('bake:rebake', { x, z, r });
  for (const c of chunks.values()) {
    if (Math.abs(c.cx * CS + CS / 2 - x) > CS / 2 + r || Math.abs(c.cz * CS + CS / 2 - z) > CS / 2 + r) continue;
    for (const g of c.baked) {
      if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
      if (x < bb.min.x - r || x > bb.max.x + r || z < bb.min.z - r || z > bb.max.z + r) continue;
      queueBake(g, c);
    }
  }
  for (const pc of pieces) if (pc.pos.distanceTo(V3(x, pc.pos.y, z)) < r + 1) pc.rebake = true;
}
function processBake(budgetMs) {
  const t0 = performance.now(), cp = camera.position;
  if (BAKEQ.length > 1) BAKEQ.sort((a, b) => (Math.abs(a.c.cx * CS + 12 - cp.x) + Math.abs(a.c.cz * CS + 12 - cp.z)) - (Math.abs(b.c.cx * CS + 12 - cp.x) + Math.abs(b.c.cz * CS + 12 - cp.z)));
  while (BAKEQ.length) {
    const j = BAKEQ[0];
    if (j.c.disposed) { BAKEQ.shift(); j.g.userData.job = null; continue; }
    const g = j.g; if (!j.fx) j.fx = fixturesAround(j.c.cx * CS, j.c.cz * CS, j.c.cx * CS + CS, j.c.cz * CS + CS);
    const P = g.attributes.position.array, N = g.attributes.normal.array, Sm = g.userData.samples, n = P.length / 3;
    for (; j.i < n; j.i++) {
      const i = j.i * 3;
      bakeVertex(g, j.i, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], Sm[i], Sm[i + 1], Sm[i + 2], j.fx);
      if ((j.i & 127) === 0 && performance.now() - t0 > budgetMs) { markBaked(g); return; }
    }
    markBaked(g); g.userData.pending = false; g.userData.job = null; BAKEQ.shift();
  }
  // re-bake pieces near changes (small, synchronous)
  for (const pc of pieces) if (pc.rebake) { pc.rebake = false; pc.obj.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial && o.geometry.attributes.aFixI) bakeVertsWithProbe(o.geometry, o); }); if (performance.now() - t0 > budgetMs) return; }
}
const flushBake = () => processBake(1e9);
// bake an arbitrary mesh (doors, pieces) with the same model
function bakeVertsWithProbe(g, mesh) {
  mesh.updateMatrixWorld(true); addFixAttrs(g);
  const P = g.attributes.position, N = g.attributes.normal, v = V3(), n = V3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const box = new THREE.Box3().setFromBufferAttribute(P).applyMatrix4(mesh.matrixWorld), fx = fixturesAround(box.min.x, box.min.z, box.max.x, box.max.z);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    bakeVertex(g, i, v.x, v.y, v.z, n.x, n.y, n.z, v.x + n.x * .1, v.y + n.y * .1, v.z + n.z * .1, fx);
  }
  markBaked(g);
}
// fixture on/off (switches, events, salvage)
function setFixtureOff(f, off, permanent = false) {
  if (!f || f.broken) return;
  const was = fixtureLit(f);
  if (permanent) off ? deadFixtures.add(f.key) : deadFixtures.delete(f.key);
  else off ? tempOff.add(f.key) : tempOff.delete(f.key);
  const now = fixtureLit(f);
  if (permanent) queueRebake(f.x, f.z);
  if (was !== now) bus.emit('fixture:changed', f);
}
// light probe for dynamic objects (items, doors) and for gameplay (sanity)
function lightValue(f) { return f._v ?? (staticLit(f) ? 1 : 0); }
function sampleLight(x, y, z, out = new THREE.Color()) {
  out.setRGB(AMBIENT, AMBIENT, AMBIENT);
  const gx0 = Math.floor(x / CELL), gz0 = Math.floor(z / CELL);
  const add = f => { const v = lightValue(f); if (v <= 0) return; const c = (contrib(f, x, y, z, 0, 1, 0, x, y, z) * .5 + contrib(f, x, y, z, 0, 0, 0, x, y, z)) * v; if (c) { const col = fixCol(f); out.r += c * col.r; out.g += c * col.g; out.b += c * col.b; } };
  for (let gz = gz0 - 3; gz <= gz0 + 3; gz++) for (let gx = gx0 - 3; gx <= gx0 + 3; gx++) { const f = fixtureAt(gx, gz); if (canLight(f)) add(f); }
  for (const l of LAMPS.values()) if (Math.abs(l.x - x) < 10 && Math.abs(l.z - z) < 10) add(l);
  out.multiplyScalar(U.bake.value);
  return out;
}
