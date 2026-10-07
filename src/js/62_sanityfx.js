// =====================================================================
//  SANITY FX — hallucination effects. Variety & intensity grow as sanity
//  falls; a few "rare" ones occasionally happen even when fully sane.
//  Mods: api.sanity.register(id, { minT, rare, w, dur:[a,b], start, update, end })
// =====================================================================
const SFX = {
  T: 0, next: 40, list: [], fov: 0, flashStutter: 0, hudGlitch: 0, lightMul: 1, drift: 0, muffle: 0,
  breath: { value: 0 }, hue: 0, dbl: 0, zoom: 0, tunnel: 0, snow: 0, fakes: [], texts: [], log: [],
};
U.breath = SFX.breath;
const SFX_TEXTS = ['ТЫ ЗДЕСЬ УЖЕ БЫЛ', 'НЕ ОБОРАЧИВАЙСЯ', 'ОНО СЛЫШИТ ШАГИ', 'ВЫХОДА НЕТ', 'СПИ', 'ПОСМОТРИ НАЗАД', 'К. ВРАЛ', 'ЭТО НЕ ТВОИ МЕТКИ', 'ТИШЕ', 'МЫ ВИДИМ СВЕТ'];
const SFX_LIES = ['Кто-то вытащил предмет из твоего рюкзака.', 'Сохранение повреждено.', '✔ Задание выполнено: Проснуться', 'Ты слышишь своё имя. Голос — твой.', 'Записка в кармане — пустая. Была ли она?', 'Шаги за спиной совпадают с твоими.', 'Здесь пахнет домом.', 'Свет мигнул три раза. Это сигнал?'];
const textTexCache = new Map();
function textTex(t) {
  if (textTexCache.has(t)) return textTexCache.get(t);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = 'bold 54px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(40,12,8,${.35 + i * .2})`; g.fillText(t, 256 + (Math.random() - .5) * 4, 64 + (Math.random() - .5) * 4); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; textTexCache.set(t, tx); return tx;
}
AudioEngine.prototype.phone = function (pos) { if (!this.ready) return; const t = this.now(), d = this.out(pos, .5, .6); for (let r = 0; r < 2; r++) for (let i = 0; i < 16; i++) { const tt = t + r * 1.6 + i * .05; this.tone(d, tt, 440, 440, .045, .05, 'square'); this.tone(d, tt, 480, 480, .045, .04, 'square'); } };
AudioEngine.prototype.musicBox = function (pos) { if (!this.ready) return; const t = this.now(), d = this.out(pos, .8, .4), notes = [0, 3, 7, 12, 10, 7, 3, 5, 2, -2]; notes.forEach((n, i) => this.tone(d, t + i * .38 + Math.random() * .02, 880 * Math.pow(2, n / 12), 870 * Math.pow(2, n / 12), .6, .035, 'triangle')); };
const inViewOf = (p, cos) => p.clone().sub(camera.position).normalize().dot(camera.getWorldDirection(V3())) > cos;
const SANITY_FX = [
  { id: 'fake_sound', minT: 0, rare: true, w: 3, dur: [1, 1], start() {
    const T = SFX.T, k = rand(0, 1), p = behindPos(rand(3, 9), .8);
    if (k < .25) audio.knock(p); else if (k < .45) audio.phantomSteps(p, camera.position.clone().sub(p).setY(0).normalize(), 3, 'carpet', 480);
    else if (k < .6) audio.phone(sidePos(rand(8, 14))); else if (k < .72) audio.musicBox(sidePos(rand(6, 12))); else if (k < .84) audio.creak(p);
    else if (k < .92 || T < .4) audio.pickup(); else audio.whisper(behindPos(1.2, .3));
  } },
  { id: 'light_pulse', minT: 0, rare: true, w: 2, dur: [1.2, 2.5], update(e, k) { SFX.lightMul = Math.min(SFX.lightMul, 1 - .45 * k); if (!e.hum) { e.hum = 1; humEvent(.5, 1.5); } } },
  { id: 'flash_stutter', minT: 0, rare: true, w: 1.5, dur: [.3, .3], start() { if (player.flash.on) SFX.flashStutter = rand(.8, 1.8); } },
  { id: 'periphery', minT: 0, rare: true, w: 1.5, dur: [.1, .1], start() { hall.spawnT = 0; hall.forced = true; } },
  { id: 'deja_vu', minT: .12, w: 1, dur: [2, 3], start() { say(pick(['Ты уже был здесь.', 'Этот угол… ты его помнишь.', 'Всё это уже происходило.']), 3); }, update(e, k) { SFX.zoom = Math.max(SFX.zoom, .03 * k); } },
  { id: 'fov_warp', minT: .25, w: 1.4, dur: [2.5, 4.5], update(e, k) { e.s ??= Math.random() < .5 ? -1 : 1; SFX.fov += e.s * 14 * k; } },
  { id: 'hue_shift', minT: .3, w: 1.2, dur: [4, 7], update(e, k) { e.s ??= rand(-1, 1); SFX.hue += e.s * 1.1 * k; } },
  { id: 'breathing_walls', minT: .35, w: 1.5, dur: [6, 11], start() { audio.breath(null); }, update(e, k) { SFX.breath.value = Math.max(SFX.breath.value, k * (.5 + SFX.T * .7)); } },
  { id: 'false_message', minT: .35, w: 1, dur: [.1, .1], start() { say(pick(SFX_LIES), 4); } },
  { id: 'fake_item', minT: .4, w: 1.2, dur: [40, 60], start(e) {
    const fp = feetPos(), d = camera.getWorldDirection(V3()).setY(0).normalize().applyAxisAngle(yAxis, rand(-.6, .6)), p = fp.clone().addScaledVector(d, rand(4, 7));
    const hit = world.castRay(new RAPIER.Ray({ x: fp.x, y: fp.y + 1, z: fp.z }, { x: d.x, y: 0, z: d.z }), 7, true, undefined, undefined, player.col); if (hit && hit.timeOfImpact < fp.distanceTo(p)) { e.t = e.dur; return; }
    const id = pick(['almond', 'water', 'battery', 'note', 'bar', 'pills']), m = itemMesh(id); m.position.set(p.x, fp.y + .05, p.z); m.rotation.y = rand(0, 6); m.material.emissive = new THREE.Color(m.material.color).multiplyScalar(.25); m.userData.noAO = true; scene.add(m); e.mesh = m;
  }, update(e) { if (e.mesh && e.mesh.position.distanceTo(feetPos()) < 1.7) { say('Там ничего не было.', 3); addPanic(.05); e.t = e.dur; } }, end(e) { if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); } } },
  { id: 'double_vision', minT: .45, w: 1.2, dur: [3, 6], update(e, k) { SFX.dbl = Math.max(SFX.dbl, .007 * k); } },
  { id: 'hud_glitch', minT: .5, w: 1, dur: [2, 4], update() { SFX.hudGlitch = .2; } },
  { id: 'wall_text', minT: .5, w: 1.3, dur: [70, 90], start(e) {
    for (let i = 0; i < 8 && !e.mesh; i++) {
      const d = camera.getWorldDirection(V3()).setY(0).normalize().applyAxisAngle(yAxis, Math.PI + rand(-1.3, 1.3)), o = camera.position;
      const hit = world.castRayAndGetNormal(new RAPIER.Ray(o, d), 7, true, undefined, undefined, player.col); if (!hit || hit.timeOfImpact < 1.5 || Math.abs(hit.normal.y) > .3) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .4), new THREE.MeshBasicMaterial({ map: textTex(pick(SFX_TEXTS)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0 }));
      const p = o.clone().addScaledVector(d, hit.timeOfImpact).add(V3(hit.normal.x, 0, hit.normal.z).multiplyScalar(.01)); p.y = o.y + rand(-.3, .15);
      m.position.copy(p); m.lookAt(p.clone().add(V3(hit.normal.x, 0, hit.normal.z))); m.userData.noAO = true; scene.add(m); e.mesh = m;
    }
    if (!e.mesh) e.t = e.dur;
  }, update(e, k, dt) {
    if (!e.mesh) return; const seen = inViewOf(e.mesh.position, .85);
    if (seen) { e.seen = (e.seen || 0) + dt; if (e.seen > .3 && !e.told) { e.told = 1; addPanic(.06); } }
    else if (e.seen > 1.5) e.t = Math.max(e.t, e.dur - .5); // looked at it, looked away → gone
    e.mesh.material.opacity = Math.min(.85, k * 2);
  }, end(e) { if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); } } },
  { id: 'tunnel', minT: .55, w: 1, dur: [3, 6], start() { audio.heartbeat(.7); }, update(e, k) { SFX.tunnel = Math.max(SFX.tunnel, k); } },
  { id: 'visual_snow', minT: .5, w: 1, dur: [4, 8], update(e, k) { SFX.snow = Math.max(SFX.snow, k); } },
  { id: 'muffle', minT: .6, w: 1, dur: [3, 6], update(e, k) { SFX.muffle = Math.max(SFX.muffle, k); } },
  { id: 'echo_voice', minT: .65, w: .9, dur: [.1, .1], start() { audio.voice(behindPos(rand(2, 4), .4)); say(pick(['«…вернись…»', '«…ты слышишь?..»', '«…не туда…»', '«…я здесь…»']), 3); addPanic(.08); } },
  { id: 'head_spin', minT: .7, w: .9, dur: [2.5, 4], update(e, k) { e.s ??= Math.random() < .5 ? -1 : 1; SFX.drift = e.s * .22 * k; } },
  { id: 'missing_time', minT: .8, w: .6, dur: [.1, .1], start() {
    if (player.swim || player.sleeping) return; fade(1, .25); player.sleeping = true;
    setTimeout(() => { const fp = feetPos(), d = camera.getWorldDirection(V3()).setY(0).normalize(), q = fp.clone().addScaledVector(d, rand(2, 4));
      const free = !world.intersectionWithShape({ x: q.x, y: q.y + CENTER + .1, z: q.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(CAP_HH, CAP_R + .05), undefined, undefined, player.col);
      if (free) teleport(q.x, fp.y, q.z); player.yaw += rand(-1.4, 1.4); player.st.thirst = Math.max(0, player.st.thirst - 3); player.st.hunger = Math.max(0, player.st.hunger - 2);
      player.sleeping = false; fade(0, 1.2); say('…Сколько ты так простоял?', 4); }, 900);
  } },
];
function updateSanityFX(dt) {
  const st = player.st, T = SFX.T = clamp(1 - st.sanity / 100 + st.panic * .15, 0, 1) * Math.min(1.5, S.halluc), reg = Mods.R.sanity ? Mods.R.sanity.all() : SANITY_FX;
  // continuous baselines grow with T
  SFX.fov = 0; SFX.lightMul = 1; SFX.drift = 0; SFX.hudGlitch = Math.max(0, SFX.hudGlitch - dt); SFX.breath.value = smooth(.8, 1, T) * .25;
  SFX.hue = 0; SFX.dbl = smooth(.75, 1, T) * .002; SFX.zoom = 0; SFX.tunnel = smooth(.55, 1, T) * .35; SFX.snow = smooth(.6, 1, T) * .4; SFX.muffle = 0; SFX.crawl = smooth(.85, 1, T) * .25;
  if (player.dead || player.sleeping || game.state !== 'play') { for (const e of SFX.list) e.def.end?.(e); SFX.list.length = 0; return; }
  // scheduler
  SFX.next -= dt;
  if (SFX.next <= 0) {
    SFX.next = lerp(75, 5, Math.pow(T, 1.1)) * rand(.6, 1.4);
    const gate = T < .1 ? .45 : 1, maxN = 1 + Math.floor(T * 3.5);
    if (Math.random() < gate && SFX.list.length < maxN) {
      const n = T > .65 && Math.random() < T - .4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const opts = reg.filter(d => (d.minT ?? 0) <= T + .02 && !SFX.list.some(e => e.def === d)).map(d => [d, (typeof d.w === 'function' ? d.w(T) : d.w ?? 1) * (1 + Math.max(0, T - (d.minT ?? 0)) * 2) * (T < .1 && !d.rare ? 0 : 1)]).filter(x => x[1] > 0);
        let tot = opts.reduce((a, x) => a + x[1], 0), r = Math.random() * tot, pickd = null; for (const [d, w] of opts) { r -= w; if (r <= 0) { pickd = d; break; } }
        if (!pickd) break;
        const dur = rand(...(pickd.dur || [3, 5])) * (pickd.dur && pickd.dur[1] > 10 ? 1 : .8 + T * .5);
        const e = { def: pickd, t: 0, dur }; SFX.list.push(e); SFX.log.push(pickd.id); if (SFX.log.length > 20) SFX.log.shift();
        try { pickd.start?.(e, T); } catch (err) { console.error(err); }
        Mods.emit('sanity:effect', { id: pickd.id, T });
      }
    }
  }
  for (let i = SFX.list.length - 1; i >= 0; i--) {
    const e = SFX.list[i]; e.t += dt; const u = clamp(e.t / e.dur, 0, 1), k = smooth(0, .18, u) * smooth(1, .75, u) * (.6 + T * .6);
    try { e.def.update?.(e, k, dt); } catch (err) { console.error(err); }
    if (e.t >= e.dur) { try { e.def.end?.(e); } catch (err) {} SFX.list.splice(i, 1); }
  }
  if (SFX.drift) player.yaw += SFX.drift * dt;
}
function forceSanityFX(id) { const d = (Mods.R.sanity ? Mods.R.sanity.all() : SANITY_FX).find(x => x.id === id); if (!d) return false; const e = { def: d, t: 0, dur: rand(...(d.dur || [3, 5])) }; SFX.list.push(e); d.start?.(e, SFX.T); return true; }

