// =====================================================================
//  BAKED LIGHTING — per-vertex, occluded by grid walls (no light leaks)
// =====================================================================
const BAKE_R = 13, BAKE_R2 = BAKE_R * BAKE_R, BAKE_P = 2.5, AMBIENT = .006;
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
function contrib(f, px, py, pz, nx, ny, nz, sx, sz) {
  const lx = f.x - px, ly = f.y - py, lz = f.z - pz, d2 = lx * lx + ly * ly + lz * lz;
  if (d2 > BAKE_R2) return 0;
  const d = Math.sqrt(d2) + 1e-4, ux = lx / d, uy = ly / d, uz = lz / d;
  const lam = Math.max(0, nx * ux + ny * uy + nz * uz), emit = .3 + .7 * Math.max(0, uy);
  let v = BAKE_P * (lam * emit / (d2 + .8) + .085 / (1 + d2 * .09)) * (1 - smooth(BAKE_R * .55, BAKE_R, d));
  if (v < 2e-4) return 0;
  return losClear(sx, sz, f.x, f.z) ? v : 0;
}
const fcol = new THREE.Color();
function fixturesAround(x0, z0, x1, z1) {
  const out = [], pad = Math.ceil(BAKE_R / CELL);
  for (let gz = Math.floor(z0 / CELL) - pad; gz <= Math.floor(z1 / CELL) + pad; gz++)
    for (let gx = Math.floor(x0 / CELL) - pad; gx <= Math.floor(x1 / CELL) + pad; gx++) { const f = fixtureAt(gx, gz); if (fixtureLit(f)) out.push(f); }
  return out;
}
function bakeGeometry(g, fixtures) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, Sm = g.userData.samples, L = g.attributes.aLight.array;
  for (let i = 0; i < P.length; i += 3) {
    let r = AMBIENT, gg = AMBIENT * .95, b = AMBIENT * .8;
    for (const f of fixtures) {
      const c = contrib(f, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], Sm[i], Sm[i + 2]);
      if (c) { fcol.set(f.color); r += c * fcol.r; gg += c * fcol.g; b += c * fcol.b; }
    }
    L[i] = r; L[i + 1] = gg; L[i + 2] = b;
  }
  g.attributes.aLight.needsUpdate = true;
}
// add / remove a single fixture's contribution everywhere it reaches
function bakeDelta(f, sign) {
  fcol.set(f.color);
  for (const c of chunks.values()) {
    if (Math.abs(c.cx * CS + CS / 2 - f.x) > CS / 2 + BAKE_R || Math.abs(c.cz * CS + CS / 2 - f.z) > CS / 2 + BAKE_R) continue;
    for (const g of c.baked) {
      if (g.userData.pending) continue;
      const P = g.attributes.position.array, N = g.attributes.normal.array, Sm = g.userData.samples, L = g.attributes.aLight.array; let dirty = false;
      for (let i = 0; i < P.length; i += 3) {
        const v = contrib(f, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], Sm[i], Sm[i + 2]);
        if (v) { L[i] = Math.max(0, L[i] + sign * v * fcol.r); L[i + 1] = Math.max(0, L[i + 1] + sign * v * fcol.g); L[i + 2] = Math.max(0, L[i + 2] + sign * v * fcol.b); dirty = true; }
      }
      if (dirty) g.attributes.aLight.needsUpdate = true;
    }
  }
}
function setFixtureOff(f, off, permanent = false) {
  if (!f || f.broken || f.flicker) return;
  const was = fixtureLit(f);
  if (permanent) off ? deadFixtures.add(f.key) : deadFixtures.delete(f.key);
  else off ? tempOff.add(f.key) : tempOff.delete(f.key);
  const now = fixtureLit(f);
  if (was !== now) { bakeDelta(f, now ? 1 : -1); bus.emit('fixture:changed', f); }
}
// light probe for dynamic objects (items, pieces) and for gameplay (sanity)
function sampleLight(x, y, z, out = new THREE.Color()) {
  out.setRGB(AMBIENT, AMBIENT, AMBIENT);
  const gx0 = Math.floor(x / CELL), gz0 = Math.floor(z / CELL);
  for (let gz = gz0 - 3; gz <= gz0 + 3; gz++) for (let gx = gx0 - 3; gx <= gx0 + 3; gx++) {
    const f = fixtureAt(gx, gz); if (!fixtureLit(f)) continue;
    const c = contrib(f, x, y, z, 0, 1, 0, x, z) * .5 + contrib(f, x, y, z, 0, 0, 0, x, z);
    if (c) { fcol.set(f.color); out.r += c * fcol.r; out.g += c * fcol.g; out.b += c * fcol.b; }
  }
  return out;
}
function bakeVertsWithProbe(g, mesh) {
  mesh.updateMatrixWorld(true);
  const P = g.attributes.position, N = g.attributes.normal, L = g.attributes.aLight || new THREE.BufferAttribute(new Float32Array(P.count * 3), 3);
  const v = V3(), n = V3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    v.addScaledVector(n, .1); sampleLight(v.x, v.y, v.z, c);
    const k = .6 + .4 * Math.max(0, n.y); L.setXYZ(i, c.r * k, c.g * k, c.b * k);
  }
  g.setAttribute('aLight', L); L.needsUpdate = true;
}

