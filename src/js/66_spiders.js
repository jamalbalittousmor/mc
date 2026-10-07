// =====================================================================
//  ПАУКИ — редкие, маленькие, на стенах и потолке. Настоящие медленно
//  ползают, замирают и удирают от света и от тебя. При низком рассудке
//  их становится больше — и некоторые из них исчезают, стоит посмотреть
//  прямо. Тихий шорох лапок — только вблизи.
// =====================================================================
const SPIDER_LEGS = 8;
const Spiders = {
  list: [], next: 150, bodyGeo: null, mat: null,
  init() {
    const g1 = new THREE.SphereGeometry(.026, 8, 6).scale(1.25, .7, 1).translate(-.03, .014, 0), g2 = new THREE.SphereGeometry(.016, 8, 6).scale(1.1, .7, 1).translate(.012, .011, 0);
    this.abdGeo = g1; this.headGeo = g2;
  },
  clear() { for (const s of this.list) this.kill(s, true); this.list.length = 0; },
  make(pos, n, fwd, scale, fake) {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 1, depthWrite: true });
    g.add(new THREE.Mesh(this.abdGeo, mat), new THREE.Mesh(this.headGeo, mat));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPIDER_LEGS * 4 * 3), 3));
    const legs = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x120c08, transparent: true, opacity: 1 })); legs.frustumCulled = false; g.add(legs);
    g.scale.setScalar(scale); g.traverse(o => { o.userData.noAO = true; }); scene.add(g);
    const s = { g, mat, legs, pos: pos.clone(), n: n.clone(), fwd: fwd.clone(), scale, fake, phase: Math.random() * 6, move: 0, pause: rand(.5, 2), speed: .12, flee: false, age: 0, life: fake ? rand(10, 25) : rand(90, 200), seenT: 0, lightT: 0, sndT: 0, a: fake ? 0 : 1 };
    this.orient(s); this.list.push(s); return s;
  },
  kill(s, now = false) { scene.remove(s.g); s.legs.geometry.dispose(); s.mat.dispose(); s.legs.material.dispose(); if (!now) this.list.splice(this.list.indexOf(s), 1); },
  orient(s) {
    s.fwd.addScaledVector(s.n, -s.fwd.dot(s.n)); if (s.fwd.lengthSq() < 1e-4) s.fwd.set(s.n.y, s.n.z, s.n.x); s.fwd.normalize();
    const x = s.fwd, y = s.n, z = V3().crossVectors(x, y);
    s.g.matrix.makeBasis(x, y, z); s.g.quaternion.setFromRotationMatrix(s.g.matrix); s.g.position.copy(s.pos).addScaledVector(s.n, .002);
  },
  // найти стену/потолок рядом: луч из камеры в случайном направлении
  surfaceNear(minD, maxD, wantView, ceil = Math.random() < .3) {
    const cp = camera.position, f = camera.getWorldDirection(V3());
    for (let k = 0; k < 14; k++) {
      let d;
      if (ceil) d = V3(rand(-.6, .6), 1, rand(-.6, .6)).normalize();
      else { d = V3(f.x, 0, f.z).normalize().applyAxisAngle(yAxis, wantView ? rand(-.9, .9) : rand(1.2, Math.PI * 2 - 1.2)); d.y = rand(-.05, .25); d.normalize(); }
      const hit = world.castRayAndGetNormal(new RAPIER.Ray(cp, d), maxD, true, undefined, undefined, player.col);
      if (!hit || hit.timeOfImpact < minD) continue;
      if (placed.has(hit.collider.handle) || itemByCollider.has(hit.collider.handle)) continue;
      const n = V3(hit.normal.x, hit.normal.y, hit.normal.z); if (!(Math.abs(n.y) < .2 || n.y < -.8)) continue;
      const p = cp.clone().addScaledVector(d, hit.timeOfImpact); if (p.y < .5 && n.y > -.8) continue;
      const vh = visualRay(p.clone().addScaledVector(n, .05), n.clone().negate(), 0, .1); if (!vh || vh.kind === 'frame' || vh.kind === 'glass') continue;
      return { p, n };
    }
    return null;
  },
  spawnReal() {
    const sp = this.surfaceNear(1.6, 6, Math.random() < .6); if (!sp) return false;
    const t = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)); t.addScaledVector(sp.n, -t.dot(sp.n)).normalize();
    this.make(sp.p, sp.n, t, rand(.8, 1.4), false);
    if (!this.seenOnce) { this.seenOnce = true; later(rand(4, 8), () => { if (this.list.some(s => !s.fake)) { say(pick(['На стене паук. Обычный. Наверное.', 'Паук. Значит, здесь всё-таки кто-то живёт.']), 4); unlockNote('g_spiders'); } }); }
    return true;
  },
  // галлюцинация: россыпь пауков на стене сбоку; исчезают, если посмотреть прямо
  hallucinate(n = 6) {
    const sp = this.surfaceNear(2, 5, true, false); if (!sp) return false;
    const u = V3().crossVectors(sp.n, V3(0, 1, 0)).normalize(), v = V3(0, 1, 0);
    for (let i = 0; i < n; i++) { const p = sp.p.clone().addScaledVector(u, rand(-.8, .8)).addScaledVector(v, rand(-.5, .7)); if (p.y < .3) continue; const t = V3(rand(-1, 1), rand(-1, 1), 0).normalize(); const fw = u.clone().multiplyScalar(t.x).addScaledVector(v, t.y).normalize(); this.make(p, sp.n, fw, rand(.7, 1.6), true); }
    return true;
  },
  update(dt) {
    if (!game.started) return;
    const cp = camera.position, cf = camera.getWorldDirection(V3()), st = player.st;
    // планировщик: настоящие — редко (чаще в грязных и тёмных зонах), галлюцинации — при низком рассудке
    if (game.state === 'play' && !player.sleeping) {
      this.next -= dt;
      if (this.next <= 0) {
        const z = zoneAt(cp.x, cp.z), dirty = (z.dirt || 0) > .3 || z.key === 'dark' || z.key === 'pipes';
        this.next = rand(110, 220) / (dirty ? 1.8 : 1);
        if (this.list.filter(s => !s.fake).length < 2 && Math.random() < .6) this.spawnReal();
        if (st.sanity < 35 && Math.random() < .35) this.hallucinate(4 + (Math.random() * 6 | 0));
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.age += dt;
      const to = s.pos.clone().sub(cp), d = to.length(), look = to.divideScalar(d).dot(cf);
      // свет фонарика и близость пугают настоящих
      const flashOn = player.flash.on && look > .93 && d < 5;
      if (!s.fake && !s.flee && (flashOn || d < 1.3)) { s.flee = true; s.speed = .55; s.move = 3; audio.skitter(s.pos, 1); s.fwd.copy(s.pos).sub(cp).addScaledVector(s.n, -s.pos.clone().sub(cp).dot(s.n)).normalize(); if (s.fwd.lengthSq() < .5) s.fwd.set(1, 0, 0); this.orient(s); }
      if (s.fake) {
        // смотришь прямо — исчезает; на краю зрения — шевелится
        if (look > .975 && d < 7) s.seenT += dt; s.a = damp(s.a, s.seenT > .25 || s.age > s.life ? 0 : 1, s.seenT > .25 ? 10 : 2, dt);
        if (s.seenT > .25 && !s.told && Math.random() < .5) { s.told = 1; if (!this.toldFake) { this.toldFake = 1; later(.8, () => say('Там ничего нет. Только обои.', 3)); } addPanic(.02); }
        s.mat.opacity = s.legs.material.opacity = s.a;
        if ((s.seenT > .25 || s.age > s.life) && s.a < .02) { this.kill(s); continue; }
      } else if (d > 16 || s.age > s.life && look < .5 || (s.flee && look < .3 && s.age > 2)) { this.kill(s); continue; }
      // движение: рывки с паузами; на краю поверхности — разворот
      s.pause -= dt;
      if (s.move <= 0 && s.pause <= 0) { s.move = rand(.3, 1.2); s.pause = rand(1, 4) * (s.fake ? .5 : 1); const ang = rand(-1.2, 1.2), q = new THREE.Quaternion().setFromAxisAngle(s.n, ang); s.fwd.applyQuaternion(q).normalize(); if (!s.fake && d < 3.5) { s.sndT -= 1; if (s.sndT < 0) { s.sndT = 2; audio.skitter(s.pos, .5); } } }
      if (s.move > 0) {
        s.move -= dt; const step = s.speed * dt * (s.fake ? .6 : 1), np = s.pos.clone().addScaledVector(s.fwd, step);
        const h = visualRay(np.clone().addScaledVector(s.n, .04), s.n.clone().negate(), 0, .08);
        if (!h || np.y < .15) { s.fwd.negate(); s.move = Math.min(s.move, .3); } else { s.pos.copy(np); }
        s.phase += dt * (s.flee ? 40 : 22); this.orient(s);
      }
      this.legsAt(s, s.move > 0);
      // освещённость (раз в ~0.3 с): паук не светится в темноте
      s.lt = (s.lt || 0) - dt; if (s.lt <= 0) { s.lt = .3; const l = sampleLight(s.pos.x, s.pos.y, s.pos.z); const k = clamp((l.r + l.g + l.b) * .9, .03, 1); s.mat.color.setRGB(.13 * k + .01, .09 * k + .008, .06 * k + .006); s.legs.material.color.copy(s.mat.color).multiplyScalar(.8); }
    }
  },
  // восемь ног: бедро → колено (приподнято) → стопа на поверхности; походка «тетрапод»
  legsAt(s, walking) {
    const a = s.legs.geometry.attributes.position.array; let o = 0;
    for (let side = -1; side <= 1; side += 2) for (let j = 0; j < 4; j++) {
      const ph = s.phase + ((j + (side > 0 ? 1 : 0)) % 2) * Math.PI, sw = walking ? Math.sin(ph) * .012 : 0, lift = walking ? Math.max(0, Math.cos(ph)) * .01 : 0;
      const hx = .01 - j * .007, hz = side * .01, fx = .05 - j * .032 + sw, fz = side * (.052 + (j === 1 || j === 2 ? .01 : 0)), fy = lift;
      const kx = (hx + fx) * .5, kz = (hz + fz) * .55, ky = .034 + lift;
      a[o++] = hx; a[o++] = .012; a[o++] = hz; a[o++] = kx; a[o++] = ky; a[o++] = kz;
      a[o++] = kx; a[o++] = ky; a[o++] = kz; a[o++] = fx; a[o++] = fy; a[o++] = fz;
    }
    s.legs.geometry.attributes.position.needsUpdate = true;
  },
};
Spiders.init();
