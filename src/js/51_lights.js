// =====================================================================
//  DYNAMIC LIGHTS — значения светильников пишутся в текстуру FIX (см. 24_bake):
//  мигание, выключатели, отключения и торшеры меняют запечённый свет напрямую,
//  без PointLight'ов (нет «двойной» яркости, свет не проходит сквозь стены).
// =====================================================================
const POWER = U.bake;              // 0..1 global mains power (scales baked light too)
const flickUntil = new Map();      // fixture key -> time until which it stutters (events)
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
  if (f.dimT && t < f.dimT) v *= f.dimV ?? .15;
  return v;
}
function flickerFixture(f, sec) { if (f && !f.broken) flickUntil.set(f.key, clock.elapsedTime + sec); }
// плавно «притушить» светильник на время (для событий режиссёра)
function dimFixture(f, sec, v = .1) { if (f && !f.broken) { f.dimT = clock.elapsedTime + sec; f.dimV = v; } }
const exitLight = new THREE.PointLight(0x7dff9a, 0, 7, 2); scene.add(exitLight);
const _c = new THREE.Color();
// карта светильников вокруг камеры (32×32 клетки) — для отражений в воде
const FMAP_N = 32, FMAP = { data: new Float32Array(FMAP_N * FMAP_N * 4), tex: null, ox: 0, oz: 0, t: 0 };
FMAP.tex = new THREE.DataTexture(FMAP.data, FMAP_N, FMAP_N, THREE.RGBAFormat, THREE.FloatType);
FMAP.tex.minFilter = FMAP.tex.magFilter = THREE.NearestFilter; FMAP.tex.needsUpdate = true;
function updateFixMap(cam) {
  const gx0 = Math.floor(cam.x / CELL) - FMAP_N / 2, gz0 = Math.floor(cam.z / CELL) - FMAP_N / 2, d = FMAP.data;
  FMAP.ox = gx0; FMAP.oz = gz0;
  for (let j = 0; j < FMAP_N; j++) for (let i = 0; i < FMAP_N; i++) {
    const f = fixtureAt(gx0 + i, gz0 + j), k = (j * FMAP_N + i) * 4;
    if (!f) { d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = -1; continue; }
    const v = (f._v ?? (fixtureLit(f) ? 1 : 0)) * POWER.value, c = fixCol(f);
    d[k] = c.r * v; d[k + 1] = c.g * v; d[k + 2] = c.b * v; d[k + 3] = f.rot ? 1 : 0;
  }
  FMAP.tex.needsUpdate = true;
}
function updateLights(dt, t, cam) {
  const pw = POWER.value, mul = SFX.lightMul;
  // светильники в загруженных чанках: панели, дымка, слоты FIX
  for (const c of chunks.values()) {
    if (!c.panels) continue; let dirty = false;
    for (const e of c.fixtures) {
      const f = e.f; if (f.broken) continue;
      const fv = fixtureValue(f, t) * mul; f._v = fv; setFixVal(f, fv);
      const v = fv * pw;
      if (Math.abs(v - e.cur) > .004) { e.cur = v; dirty = true; c.panels.setColorAt(e.idx, _c.setScalar(Math.max(v, .03))); c.hazeAttr.array[e.idx] = v; }
    }
    if (dirty) { c.panels.instanceColor.needsUpdate = true; c.hazeAttr.needsUpdate = true; }
  }
  // торшеры/прожекторы игрока: свои батареи — не зависят от сети (компенсируем uBake)
  for (const l of LAMPS.values()) {
    const v = l.on ? (1 + Math.sin(t * 31 + l.seed * 9) * .01) / Math.max(pw, .05) : 0;
    l._v = v; setFixVal(l, v);
    if (l.mat) l.mat.color.setRGB(1, .82, .55).multiplyScalar(l.on ? 2.5 : .05);
  }
  if (FIX.dirty) { FIX.tex.needsUpdate = true; FIX.dirty = false; }
  FMAP.t -= dt; if (FMAP.t <= 0) { FMAP.t = .1; updateFixMap(cam); }
  // exit sign glow
  if (WORLD.exitDoor) { exitLight.position.copy(WORLD.exitDoor).add(V3(0, 1.3, .6)); exitLight.intensity = 2.2 * (.92 + .08 * Math.sin(t * 3)); } else exitLight.intensity = 0;
  const k = Math.max(.05, pw * mul);
  for (const key in PANEL) { const m = PANEL[key]; m.color.copy(m.userData.base).multiplyScalar(k); }
  HAZE_MAT.uniforms.uStrength.value = .026 * pw * mul;
}
// how lit is the player's surroundings (0..~1) — drives sanity
let lightLevelT = 0;
function measureLight(dt, cam) {
  lightLevelT -= dt; if (lightLevelT > 0) return; lightLevelT = .2;
  const c = sampleLight(cam.x, cam.y - .3, cam.z);
  let L = c.r * .3 + c.g * .59 + c.b * .11;
  if (player.flash.on) L += .05 + .06 * player.flash.battery;
  player.lightLevel = damp(player.lightLevel, L, 6, .2);
}
