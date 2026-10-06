// =====================================================================
//  DYNAMIC LIGHTS — flicker fixtures, placed lamps, exit glow, power
// =====================================================================
const POWER = U.bake;              // 0..1 global mains power (scales baked light too)
const flickUntil = new Map();      // fixture key -> time until which it stutters (events)
const lightPool = [];
function setupLightPool(n) {
  for (const l of lightPool) scene.remove(l.light);
  lightPool.length = 0;
  for (let i = 0; i < n; i++) { const light = new THREE.PointLight(0xffeecc, 0, 12, 2); scene.add(light); lightPool.push({ light, src: null }); }
}
const LIGHT_INT = 9;
function fixtureValue(f, t) {
  if (f.broken || deadFixtures.has(f.key)) return 0;
  if (tempOff.has(f.key) || switchOff.has(f.key)) return 0;
  let v = 1;
  const fu = flickUntil.get(f.key);
  if (f.flicker || (fu && t < fu)) {
    const n = vnoise(t * (f.flicker ? 6 : 14) + f.seed * 100, f.seed * 50, 9);
    v = n > .42 ? 1 : n > .3 ? .3 : 0;
    if (f.flicker && vnoise(t * .25 + f.seed * 10, 1, 10) > .72) v = 0;
  } else if (fu) flickUntil.delete(f.key);
  return v;
}
function flickerFixture(f, sec) { if (f && !f.broken) flickUntil.set(f.key, clock.elapsedTime + sec); }
const exitLight = new THREE.PointLight(0x7dff9a, 0, 7, 2); scene.add(exitLight);
const _c = new THREE.Color();
let lightScanT = 0;
function updateLights(dt, t, cam) {
  const pw = POWER.value * SFX.lightMul;
  // instanced panels + haze
  for (const c of chunks.values()) {
    if (!c.panels) continue; let dirty = false;
    for (const e of c.fixtures) {
      const f = e.f; if (f.broken) continue;
      const fv = fixtureValue(f, t);
      // non-flicker fixtures follow mains power; flicker ones are "on another circuit" only when power is up
      const v = fv * pw;
      if (Math.abs(v - e.cur) > .004) { e.cur = v; dirty = true; c.panels.setColorAt(e.idx, _c.setScalar(Math.max(v, .03))); c.hazeAttr.array[e.idx] = v; }
    }
    if (dirty) { c.panels.instanceColor.needsUpdate = true; c.hazeAttr.needsUpdate = true; }
  }
  // choose dynamic light sources: nearest flickering/stuttering fixtures, lamps, exit
  lightScanT -= dt;
  if (lightScanT <= 0) {
    lightScanT = .25;
    const cand = [];
    for (const c of chunks.values()) for (const e of c.fixtures) {
      const f = e.f; if (f.broken || deadFixtures.has(f.key)) continue;
      if (!(f.flicker || flickUntil.has(f.key))) continue;
      const d = Math.hypot(f.x - cam.x, f.z - cam.z); if (d < 22) cand.push({ kind: 'f', f, d });
    }
    for (const pc of pieces) if (pc.light) { const d = Math.hypot(pc.light.x - cam.x, pc.light.z - cam.z); if (d < 26) cand.push({ kind: 'l', l: pc.light, d: d - 6 }); }
    cand.sort((a, b) => a.d - b.d);
    lightPool.forEach((p, i) => { p.src = cand[i] || null; });
  }
  for (const p of lightPool) {
    const s = p.src, L = p.light;
    if (!s) { L.intensity = 0; continue; } // остаётся visible — без перекомпиляции шейдеров
    if (s.kind === 'f') { const v = fixtureValue(s.f, t) * pw; L.position.set(s.f.x, s.f.y - .05, s.f.z); L.color.set(s.f.color); L.intensity = LIGHT_INT * v; L.distance = 12; }
    else { const l = s.l; L.position.set(l.x, l.y, l.z); L.color.set(l.color); L.distance = 9; L.intensity = l.on ? 6 * (l.boost || 1) * (1 + Math.sin(t * 31) * .01) : 0; L.distance = 9 * Math.sqrt(l.boost || 1); }
  }
  for (const pc of pieces) if (pc.light && pc.light.mat) pc.light.mat.color.setRGB(1, .82, .55).multiplyScalar(pc.light.on ? 2.5 : .05);
  // exit sign glow
  if (WORLD.exitDoor) { exitLight.position.copy(WORLD.exitDoor).add(V3(0, 1.3, .6)); exitLight.intensity = 2.2 * (.92 + .08 * Math.sin(t * 3)); } else exitLight.intensity = 0;
  // panel materials follow power for global brownout
  PANEL.warm.color.setRGB(1, .94, .78).multiplyScalar(4 * Math.max(.05, pw));
  PANEL.cool.color.setRGB(.91, .96, 1).multiplyScalar(4.3 * Math.max(.05, pw));
  HAZE_MAT.uniforms.uStrength.value = .026 * pw;
}
// how lit is the player's surroundings (0..~1) — drives sanity
let lightLevelT = 0;
function measureLight(dt, cam) {
  lightLevelT -= dt; if (lightLevelT > 0) return; lightLevelT = .2;
  const c = sampleLight(cam.x, cam.y - .3, cam.z);
  let L = (c.r * .3 + c.g * .59 + c.b * .11) * POWER.value;
  for (const p of lightPool) if (p.light.visible && p.light.intensity > 0) { const d2 = p.light.position.distanceToSquared(cam); L += p.light.intensity * .012 / (1 + d2 * .5); }
  for (const pc of pieces) if (pc.light && pc.light.on) { const dx = pc.light.x - cam.x, dz = pc.light.z - cam.z; L += .3 * (pc.light.boost || 1) / (1 + (dx * dx + dz * dz) * .12); }
  if (player.flash.on) L += .05 + .06 * player.flash.battery;
  player.lightLevel = damp(player.lightLevel, L, 6, .2);
}

