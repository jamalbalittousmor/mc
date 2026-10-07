// =====================================================================
//  УЖАС БЕЗ СКРИМЕРОВ — то, что замечаешь сам и не сразу.
//  • Улыбки в темноте (Smilers): глаза и улыбка там, куда не достаёт свет.
//  • Другой странник: далёкий луч фонарика, который замечает тебя.
//  • Взгляд через плечо: резкий поворот — и на долю секунды там кто-то стоит.
//  • Мокрые отпечатки ладоней вдоль стены за спиной.
//  • Стеснительный свет: лампа впереди гаснет, пока ты под ней, и зажигается за спиной.
//  • Кто-то был на твоей базе, пока тебя не было.
//  Никаких внезапных громких звуков и лиц во весь экран.
// =====================================================================
const HTEX = {};
HTEX.smile = canvasTex(256, 192, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const eye = (x, y) => { const gr = g.createRadialGradient(x, y, 0, x, y, 22); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.35, 'rgba(240,240,220,.9)'); gr.addColorStop(1, 'rgba(240,240,220,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 22, 13, 0, 0, 7); g.fill(); };
  eye(86, 62); eye(170, 62);
  g.fillStyle = 'rgba(250,250,235,.95)'; g.beginPath(); g.moveTo(40, 110); g.quadraticCurveTo(128, 190, 216, 110); g.quadraticCurveTo(128, 150, 40, 110); g.fill();
  g.strokeStyle = 'rgba(20,20,16,.9)'; g.lineWidth = 2.5; for (let x = 52; x < 206; x += 11) { const y0 = 112 + Math.sin((x - 40) / 176 * Math.PI) * 26; g.beginPath(); g.moveTo(x, y0 - 8); g.lineTo(x + 1, y0 + 14); g.stroke(); }
}, true, false);
HTEX.glow = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,245,220,1)'); gr.addColorStop(.25, 'rgba(255,235,190,.5)'); gr.addColorStop(1, 'rgba(255,235,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, true, false);
HTEX.hand = canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(30,24,14,.75)';
  g.beginPath(); g.ellipse(64, 80, 24, 28, 0, 0, 7); g.fill();
  [[-22, -24, -.5], [-11, -38, -.15], [2, -42, 0], [15, -38, .15], [30, -10, .9]].forEach(([dx, dy, a]) => { g.save(); g.translate(64 + dx * .8, 70 + dy * .55); g.rotate(a); g.beginPath(); g.ellipse(0, -10, 6, 17, 0, 0, 7); g.fill(); g.restore(); });
  for (let i = 0; i < 4; i++) { const x = 46 + Math.random() * 36, l = 10 + Math.random() * 26; g.fillRect(x, 100, 2.5, l); g.beginPath(); g.arc(x + 1.2, 100 + l, 2.5, 0, 7); g.fill(); }
}, true, false);
const Horror = {
  smilers: [], wand: null, glimpse: null, prints: [], shy: null, intr: null, yawV: 0, lastYaw: 0, turnT: 0, glimpseArm: 0, glimpseCd: 120, dark: 0,
  reset() { this.clearWorld(); this.glimpseCd = 120; },
  save() { return {}; }, load() {},
  clearWorld() {
    for (const s of this.smilers) scene.remove(s.m); this.smilers.length = 0;
    if (this.wand) { scene.remove(this.wand.g); this.wand = null; }
    if (this.glimpse) { this.glimpse.m.visible = false; this.glimpse = null; }
    for (const p of this.prints) scene.remove(p.m); this.prints.length = 0;
    if (this.shy) { tempOff.delete(this.shy.f.key); this.shy = null; }
    this.intr = null;
  },
  // ---- улыбки в темноте
  smiler() {
    if (player.lightLevel > .14 || this.smilers.length >= 2) return false;
    const cp = camera.position, f = camFwd();
    for (let k = 0; k < 16; k++) {
      const a = rand(-1.2, 1.2), d = rand(6, 12), dv = f.clone().applyAxisAngle(yAxis, a), x = cp.x + dv.x * d, z = cp.z + dv.z * d;
      if (!chunks.has(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || !losClear(cp.x, cp.z, x, z)) continue;
      const hit = world.castRay(new RAPIER.Ray(cp, { x: dv.x, y: 0, z: dv.z }), d, true, undefined, undefined, player.col); if (hit && hit.timeOfImpact < d - .3) continue;
      const y = Math.random() < .25 ? rand(.35, .7) : rand(1.45, 1.95), l = sampleLight(x, y, z); if (l.r + l.g + l.b > .12) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.5, .375), new THREE.MeshBasicMaterial({ map: HTEX.smile, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, color: 0xd8d8c8 }));
      m.position.set(x, y, z); m.userData.noAO = true; scene.add(m);
      this.smilers.push({ m, t: rand(14, 24), a: 0, seen: 0, gone: false, blink: rand(2, 5) }); return true;
    }
    return false;
  },
  updateSmilers(dt) {
    const cp = camera.position, cf = camera.getWorldDirection(V3());
    for (let i = this.smilers.length - 1; i >= 0; i--) {
      const s = this.smilers[i], m = s.m; m.lookAt(cp); s.t -= dt; s.blink -= dt;
      const to = m.position.clone().sub(cp), d = to.length(), look = to.divideScalar(d).dot(cf);
      const flashed = player.flash.on && look > .95 && d < 16, close = d < 3.5, lit = player.lightLevel > .3;
      if (!s.gone && (flashed || close || lit || s.t <= 0)) { s.gone = true; if (flashed) say(pick(['Луч — и там пусто. Только стена.', 'Улыбка погасла раньше, чем её коснулся свет.']), 3); }
      if (!s.gone && look > .9) { s.seen += dt; if (s.seen > .4 && !s.told) { s.told = 1; addPanic(.12); player.st.sanity = Math.max(0, player.st.sanity - 4); later(1.5, () => say(pick(['В темноте кто-то улыбается. Не моргая.', 'Глаза. И улыбка — слишком широкая для лица.', 'Оно улыбается. Не подходи. Не свети… или свети.']), 4)); } }
      if (s.blink < 0) { s.blink = rand(3, 7); s.bt = .12; } s.bt = Math.max(0, (s.bt || 0) - dt);
      s.a = damp(s.a, s.gone ? 0 : s.bt > 0 ? .05 : .75, s.gone ? 14 : 1.2, dt); m.material.opacity = s.a;
      if (s.gone && s.a < .01) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.smilers.splice(i, 1); }
    }
  },
  // ---- другой странник с фонариком вдалеке
  wanderer() {
    if (this.wand) return false;
    const cp = camera.position, f = camFwd(), d = rand(22, 34), c = cp.clone().addScaledVector(f, d);
    if (!chunks.has(Math.floor(c.x / CS) + ',' + Math.floor(c.z / CS)) || !losClear(cp.x, cp.z, c.x, c.z)) return false;
    const side = V3(-f.z, 0, f.x).multiplyScalar(Math.random() < .5 ? 1 : -1), start = c.clone().addScaledVector(side, -4);
    const g = new THREE.Group(), glow = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: HTEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.9, 4.5, 16, 1, true).translate(0, -2.25, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffeccc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide, fog: true }));
    g.add(glow, cone); g.position.set(start.x, 1.3, start.z); g.traverse(o => o.userData.noAO = true); scene.add(g);
    this.wand = { g, glow, cone, v: side.multiplyScalar(1.3), t: 9, a: 0, look: 0, turned: false, stepT: 0, low: player.st.sanity < 45 };
    later(2, () => say(pick(['Вдалеке — луч фонарика. Кто-то ещё здесь.', 'Там кто-то идёт со светом. Не зови. Или позови.']), 4));
    return true;
  },
  updateWanderer(dt) {
    const w = this.wand; if (!w) return; const cp = camera.position; w.t -= dt;
    const to = w.g.position.clone().sub(cp), d = to.length(), look = to.normalize().dot(camera.getWorldDirection(V3()));
    if (look > .97) w.look += dt;
    if (!w.turned && (w.look > 1.2 || (w.low && w.t < 5))) { w.turned = true; w.v.set(0, 0, 0); w.t = Math.min(w.t, 1.6); audio.click(); if (w.low) later(.6, () => say('Луч повернулся к тебе — и погас. Кто-то знает, что ты здесь.', 4)); }
    w.g.position.addScaledVector(w.v, dt);
    const dirv = w.turned ? cp.clone().sub(w.g.position).normalize() : w.v.clone().normalize();
    w.cone.lookAt(w.g.position.clone().sub(dirv)); w.glow.lookAt(cp);
    w.stepT -= dt; if (w.stepT <= 0 && !w.turned) { w.stepT = .55; audio.footstep('tile', .25, w.g.position.clone().setY(.05), .6); }
    w.a = damp(w.a, w.t > .3 ? 1 : 0, w.turned && w.t < .4 ? 30 : 2, dt); const flick = vnoise(clock.elapsedTime * 8, 3, 77) > .15 ? 1 : .5;
    w.glow.material.opacity = w.a * .9 * flick * (w.turned ? 1.4 : 1); w.cone.material.opacity = w.a * .05 * flick;
    if (w.t <= 0 || d > 60) { scene.remove(w.g); w.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this.wand = null; }
  },
  // ---- взгляд через плечо: силуэт на 0.2 с после резкого поворота
  updateGlimpse(dt) {
    const yaw = player.yaw, dy = Math.abs(yaw - this.lastYaw) / Math.max(dt, 1e-3); this.lastYaw = yaw;
    this.glimpseCd -= dt; this.glimpseArm = Math.max(0, this.glimpseArm - dt);
    if (dy > 3.2) this.turnT += dt; else {
      if (this.turnT > .12 && dy < 1 && this.glimpseCd <= 0 && !this.glimpse && game.state === 'play') {
        const chance = this.glimpseArm > 0 ? .9 : player.st.sanity < 50 ? .25 : .015;
        if (Math.random() < chance) this.showGlimpse();
        this.glimpseCd = this.glimpseArm > 0 ? 60 : rand(25, 60);
      }
      this.turnT = 0;
    }
    const g = this.glimpse; if (!g) return; g.t -= dt; g.m.material.uniforms.uTime.value = clock.elapsedTime; g.m.material.uniforms.uA.value = g.t > .05 ? .9 : 0;
    if (g.t <= 0) { g.m.visible = false; this.glimpse = null; if (Math.random() < .4) later(.8, () => say(pick(['…Показалось.', 'Там никого. Там никого не было.', 'Ты успел увидеть — или нет?']), 3)); addPanic(.08); }
  },
  showGlimpse() {
    const cp = camera.position, f = camFwd(), d = rand(4.5, 8), p = cp.clone().addScaledVector(f, d);
    if (!losClear(cp.x, cp.z, p.x, p.z)) return;
    const hit = world.castRay(new RAPIER.Ray(cp, { x: f.x, y: 0, z: f.z }), d, true, undefined, undefined, player.col); if (hit && hit.timeOfImpact < d) return;
    const m = this.glimpseMesh || (this.glimpseMesh = shadowMesh()); m.position.set(p.x, floorY(p.x, p.z), p.z); m.rotation.y = Math.atan2(cp.x - p.x, cp.z - p.z); m.visible = true; m.material.uniforms.uRun.value = 0;
    this.glimpse = { m, t: rand(.16, .26) }; this.glimpseArm = 0;
  },
  // ---- мокрые отпечатки ладоней вдоль стены за спиной
  handprints() {
    const cp = camera.position, f = camFwd(), back = cp.clone().addScaledVector(f, -rand(3, 6));
    for (const side of [1, -1]) {
      const sd = V3(-f.z, 0, f.x).multiplyScalar(side), hit = world.castRayAndGetNormal(new RAPIER.Ray({ x: back.x, y: 1.2, z: back.z }, sd), 3, true, undefined, undefined, player.col);
      if (!hit || Math.abs(hit.normal.y) > .2 || placed.has(hit.collider.handle)) continue;
      const n = V3(hit.normal.x, 0, hit.normal.z), along = f.clone().negate(); let made = 0;
      for (let i = 0; i < 6; i++) {
        const o = V3(back.x, 1.2, back.z).addScaledVector(along, i * .65), h2 = world.castRayAndGetNormal(new RAPIER.Ray(o, sd), 3, true, undefined, undefined, player.col);
        if (!h2 || Math.abs(h2.normal.x - n.x) > .1 || Math.abs(h2.normal.z - n.z) > .1) break;
        const p = o.clone().addScaledVector(sd, h2.timeOfImpact).addScaledVector(n, .006); p.y = rand(.95, 1.45) + (i & 1) * .06;
        if (inView(p, .3)) continue;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), new THREE.MeshBasicMaterial({ map: HTEX.hand, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: .85 }));
        m.position.copy(p); m.lookAt(p.clone().add(n)); m.rotateZ(rand(-.3, .3)); if (i & 1) m.scale.x = -1; m.userData.noAO = true;
        const l = sampleLight(p.x, p.y, p.z); m.material.color.setRGB(clamp(l.r * 2, .05, 1), clamp(l.g * 2, .05, 1), clamp(l.b * 2, .05, 1));
        scene.add(m); this.prints.push({ m, t: rand(90, 150) }); made++;
      }
      if (made) { later(rand(5, 15), () => say(pick(['На стене — мокрые отпечатки ладоней. Кто-то шёл, держась за стену. За тобой.', 'Следы рук на обоях. Ещё влажные.']), 4)); addPanic(.05); return true; }
    }
    return false;
  },
  // ---- стеснительный свет
  shyLight() {
    if (this.shy || POWER.value < .8) return false;
    const n = nearFixtures(14).filter(o => o.d > 6 && inView(V3(o.f.x, o.f.y, o.f.z), .8)); if (!n.length) return false;
    this.shy = { f: n[0].f, phase: 'wait', t: 40 }; return true;
  },
  updateShy(dt) {
    const s = this.shy; if (!s) return; s.t -= dt; const fp = feetPos(), d = Math.hypot(fp.x - s.f.x, fp.z - s.f.z);
    if (s.phase === 'wait' && d < 3.4) { s.phase = 'off'; tempOff.add(s.f.key); audio.ballast(V3(s.f.x, s.f.y, s.f.z)); }
    else if (s.phase === 'off' && d > 4.2) { s.phase = 'done'; later(rand(.8, 1.6), () => { tempOff.delete(s.f.key); audio.ballast(V3(s.f.x, s.f.y, s.f.z)); if (Math.random() < .6) say(pick(['Лампа за спиной снова горит. Она ждала, пока ты уйдёшь.', 'Свет погас, когда ты встал под ним. И вернулся, когда ты ушёл.']), 4); addPanic(.04); }); this.shy = null; return; }
    if (s.t <= 0) { tempOff.delete(s.f.key); this.shy = null; }
  },
  // ---- база навещена в твоё отсутствие (вызывается при возвращении на уровень)
  onReturn(away) {
    if (away < 360 || !pieces.size || Math.random() > .65) return;
    const ps = [...pieces], lamps = ps.filter(p => p.light && p.light.on), doors = ps.filter(p => p.def.door && !p.open);
    const c = ps.reduce((a, p) => a.add(p.pos), V3()).divideScalar(ps.length); const did = [];
    if (lamps.length && Math.random() < .7) { pick(lamps).light.on = false; did.push('lamp'); }
    if (doors.length && Math.random() < .6) { toggleDoor(pick(doors), true); did.push('door'); }
    if (!did.length || Math.random() < .35) did.push('text');
    this.intr = { c, did, done: false };
  },
  updateIntrusion() {
    const I = this.intr; if (!I || I.done) return; const fp = feetPos(); if (fp.distanceTo(I.c) > 9) return; I.done = true;
    if (I.did.includes('text')) { for (let k = 0; k < 10; k++) { const d = V3(rand(-1, 1), 0, rand(-1, 1)).normalize(), hit = world.castRayAndGetNormal(new RAPIER.Ray({ x: I.c.x, y: 1.4, z: I.c.z }, d), 5, true); if (!hit || Math.abs(hit.normal.y) > .2) continue; const p = V3(I.c.x, 1.4, I.c.z).addScaledVector(d, hit.timeOfImpact - .01); if (inView(p, .5)) continue; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .35), new THREE.MeshBasicMaterial({ map: textTex(pick(['Я ЖДАЛ', 'ГДЕ ТЫ БЫЛ', 'ЭТО МОЙ УГОЛ', 'ТЫ ВЕРНУЛСЯ'])), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); m.position.copy(p); m.lookAt(p.clone().add(V3(hit.normal.x, 0, hit.normal.z))); m.userData.noAO = true; scene.add(m); this.prints.push({ m, t: 400 }); break; } }
    later(1.5, () => say(I.did.includes('lamp') ? 'Торшер выключен. Ты точно оставлял его гореть.' : I.did.includes('door') ? 'Дверь твоего убежища открыта. Изнутри.' : 'Кто-то был здесь, пока тебя не было.', 5));
    addPanic(.12); player.st.sanity = Math.max(0, player.st.sanity - 3);
  },
};
function updateHorror(dt) {
  if (!game.started) return;
  U.crawl.value = damp(U.crawl.value, game.state === 'play' ? SFX.crawl || 0 : 0, 2, dt);
  Horror.updateSmilers(dt); Horror.updateWanderer(dt); Horror.updateGlimpse(dt); Horror.updateShy(dt); Horror.updateIntrusion();
  for (let i = Horror.prints.length - 1; i >= 0; i--) { const p = Horror.prints[i]; p.t -= dt; if (p.t < 3) p.m.material.opacity = Math.max(0, p.t / 3) * .85; if (p.t <= 0) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); Horror.prints.splice(i, 1); } }
  // в долгой темноте (особенно в «Огнях выключены» и при Отбое) — улыбки
  Horror.dark = player.lightLevel < .07 && game.state === 'play' && !player.sleeping ? Horror.dark + dt : 0;
  const zk = zoneAt(camera.position.x, camera.position.z).key;
  if (Horror.dark > (zk === 'lightsout' ? 12 : CURFEW.state === 'dark' ? 18 : 40) && Math.random() < dt * .05) { if (Horror.smiler()) Horror.dark = 0; }
}
// ---- новые события режиссёра
Object.assign(EVENTS, {
  shy_light: { w: () => .45, run: () => Horror.shyLight() },
  handprints: { w: () => player.st.sanity < 70 ? .4 : .08, run: () => Horror.handprints() },
  wanderer: { w: () => .22, run: () => Horror.wanderer() },
  smiler: { w: () => player.lightLevel < .08 ? (CURFEW.state === 'dark' ? 1.4 : .5) : 0, run: () => Horror.smiler() },
  spider: { w: () => .25, run: () => Spiders.spawnReal() },
});
// ---- новые эффекты рассудка (часть — rare: случаются и при ясной голове, но очень редко)
SANITY_FX.push(
  { id: 'wallpaper_crawl', minT: .3, w: 1.2, dur: [5, 9], update(e, k) { SFX.crawl = Math.max(SFX.crawl || 0, k); } },
  { id: 'shadow_cross', minT: 0, rare: true, w: .5, dur: [.1, .1], start() { Shadow.crossNow(); } },
  { id: 'glimpse', minT: 0, rare: true, w: .6, dur: [.1, .1], start() { Horror.glimpseArm = 25; Horror.glimpseCd = 0; } },
  { id: 'far_light', minT: 0, rare: true, w: .35, dur: [.1, .1], start() { Horror.wanderer(); } },
  { id: 'smiler', minT: .35, w: .8, dur: [.1, .1], start() { Horror.smiler(); } },
  { id: 'spider_swarm', minT: .45, w: .9, dur: [.1, .1], start() { Spiders.hallucinate(5 + (Math.random() * 6 | 0)); } },
  { id: 'lonely_light', minT: .5, w: .8, dur: [4, 7], start(e) { e.fx = nearFixtures(14).slice(1).map(o => o.f); for (const f of e.fx) dimFixture(f, e.dur, .05); say('Лампы гаснут. Все, кроме той, что над тобой.', 3); } },
);
