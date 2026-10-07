// =====================================================================
//  Liminal Industry · «Обитатели»
//  Не монстры, которые убивают, — те, кто отнимают рассудок.
//   • Безликий — человек в офисной рубашке без лица. Пока смотришь на него,
//     он стоит, но взгляд обходится рассудку дорого. Отвернёшься — подходит.
//     Луч фонаря в лицо «сковывает» его на несколько секунд. Касание — тяжёлый удар
//     по рассудку. Свет убежища и музыка держат его на расстоянии.
//   • Эхо — невидимое. Повторяет твои шаги за спиной. Остановишься — оно делает
//     ещё пару шагов. Обернись и посвети назад — и оно замолчит. Стой долго — и
//     оно подойдёт вплотную.
//   • Мотыльки — слетаются на фонарь в долгой темноте, жрут батарею и заставляют
//     луч мигать. Погаси свет на пару секунд — разлетятся.
//  Частота зависит от стадии рассудка (мод li_mind), Отбоя и уровня.
// =====================================================================
Backrooms.mod({
  id: 'li.dwellers', name: 'Liminal Industry · Обитатели', version: '1.0.0',
  requires: ['core.industry@>=1.0'], loadAfter: ['li.mind'],
  description: 'Безликий, Эхо и Мотыльки: «противники», которые не убивают, а отнимают рассудок.',
  init(api) {
    const { V3, rand, pick, clamp, damp, smooth, vnoise } = api.util, E = api.engine, THREE = api.THREE, RAPIER = api.RAPIER, A = api.audio;
    const P = () => E.player, ST = () => E.player.st, T = () => E.clock.elapsedTime;
    const playing = () => E.game.state === 'play' && !P().sleeping && !P().dead;
    const stage = () => { const m = api.require('mind'); if (m) return m.stage(); const s = ST().sanity; return s >= 70 ? 0 : s >= 45 ? 1 : s >= 25 ? 2 : 3; };
    const calmNear = (p, r) => api.require('mind')?.calmNear(p, r) || null;
    const curfewDark = () => E.CURFEW?.state === 'dark';
    const camFwd = () => E.camera.getWorldDirection(V3());
    const drain = v => { const st = ST(); st.sanity = clamp(st.sanity - v, 0, 100); };
    const rayFree = (o, d, len) => !E.world.castRay(new RAPIER.Ray(o, d), len, true, undefined, undefined, P().col);
    // освещение «живых» мешей: эмиссия = альбедо × запечённый свет в точке (фонарик добавляет обычное освещение)
    const relight = (mats, p, y = 1.3) => { const l = E.sampleLight(p.x, y, p.z), k = clamp((l.r * .3 + l.g * .59 + l.b * .11) * .9, .012, 1.1); for (const m of mats) m.emissive.copy(m.userData.base).multiplyScalar(k); };
    const mat = (color, rough = .85) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); m.userData.base = new THREE.Color(color); return m; };

    // ================================================================ БЕЗЛИКИЙ
    const FACE_TEX = (() => { // кожа с едва заметными впадинами там, где должны быть глаза
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#d9bfa6'; g.fillRect(0, 0, 256, 128);
      for (const [x, y, r, a] of [[52, 56, 13, .16], [76, 56, 13, .16], [64, 80, 9, .08]]) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(120,80,60,${a})`); gr.addColorStop(1, 'rgba(120,80,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    function facelingMesh() {
      const g = new THREE.Group(), mats = [];
      const M = (c, r) => { const m = mat(c, r); mats.push(m); return m; };
      const pants = M(0x2b2c33), shirt = M(0xd6d2c4), tie = M(0x5c1c1c), skin = M(0xd9bfa6, .7), shoe = M(0x141210, .5);
      const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; o.userData.noAO = true; g.add(o); return o; };
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(.075, .062, .88, 10), pants, sx * .1, .5, 0);
        add(new THREE.BoxGeometry(.11, .07, .26), shoe, sx * .1, .035, .04);
        add(new THREE.CylinderGeometry(.052, .044, .66, 8), shirt, sx * .245, 1.17, 0, 0, sx * .06);
        add(new THREE.SphereGeometry(.05, 8, 6), skin, sx * .265, .82, .01);
      }
      add(new THREE.CylinderGeometry(.19, .165, .64, 12), shirt, 0, 1.24, 0);
      add(new THREE.CylinderGeometry(.165, .16, .1, 12), pants, 0, .94, 0);
      add(new THREE.BoxGeometry(.05, .38, .02), tie, 0, 1.3, .175);
      add(new THREE.CylinderGeometry(.055, .062, .1, 8), skin, 0, 1.6, 0);
      const pivot = new THREE.Group(); pivot.position.set(0, 1.62, 0); g.add(pivot);
      const headMat = new THREE.MeshStandardMaterial({ map: FACE_TEX, roughness: .65 }); headMat.userData.base = new THREE.Color(0xffffff); mats.push(headMat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.12, 24, 18), headMat); head.scale.set(.9, 1.2, 1); head.position.y = .13; head.rotation.y = 0; head.castShadow = true; head.userData.noAO = true; pivot.add(head);
      g.userData = { mats, pivot, noAO: true }; g.visible = false; E.scene.add(g); return g;
    }
    const FACE = { s: null, cd: rand(160, 260), mesh: null, stepT: 0 };
    const FACE_ZONES_NO = new Set(['pools', 'flooded']);
    function faceSpawn(force = false) {
      if (FACE.s || (!force && (!playing() || P().inShelter || P().swim))) return false;
      const zk = E.zoneAt(E.feetPos().x, E.feetPos().z).key; if (!force && FACE_ZONES_NO.has(zk)) return false;
      const p = E.Watcher.findSpot(12, 22, true); if (!p) return false;
      FACE.mesh ||= facelingMesh();
      const fp = E.feetPos(), away = Math.atan2(p.x - fp.x, p.z - fp.z); // стоит спиной к тебе
      FACE.s = { pos: p.clone(), yaw: away, head: 0, life: rand(70, 110), seenT: 0, seenEver: false, frozen: 0, stuck: 0, hold: 0, told: false, turned: false };
      FACE.mesh.visible = true; FACE.mesh.position.copy(p); FACE.mesh.rotation.y = away; FACE.mesh.userData.pivot.rotation.y = 0;
      api.emit('dw:faceling', { pos: p }); return true;
    }
    function faceVanish(escaped) {
      const s = FACE.s; if (!s) return; FACE.s = null; FACE.mesh.visible = false;
      if (escaped && s.seenEver) { api.quest.count('dw:face:escape'); api.say(pick(['Его больше нет. Только запах пыльного пиджака.', 'Проход пуст. Ты и не заметил, когда он ушёл.']), 3.5); }
    }
    function faceTouch() {
      const s = FACE.s; faceVanish(false);
      E.fade(1, .05); setTimeout(() => E.fade(0, .9), 260); A.rush?.(.9); A.whisper(null);
      drain(16 + stage() * 2); E.addPanic(.35); for (const o of E.nearFixtures(10)) E.flickerFixture(o.f, rand(.6, 1.6));
      api.quest.count('dw:touch'); api.notes.unlock('g_faceling');
      api.say(pick(['Холодные пальцы на щеке. Там, где у него нет лица, у тебя на секунду тоже ничего не было.', 'Он наклонился вплотную. Ты услышал, как он дышит — твоим дыханием.']), 5);
    }
    const STEER = [0, .5, -.5, 1, -1, 1.6, -1.6];
    function faceUpdate(dt) {
      const s = FACE.s, m = FACE.mesh;
      if (!s) {
        if (!playing()) return;
        const k = [.15, 1, 1.6, 2.3][stage()] * (curfewDark() ? 1.6 : 1) * (1 + Math.min(4, E.game.level - 1) * .08);
        if ((FACE.cd -= dt * k) <= 0) { FACE.cd = rand(220, 340); faceSpawn(); }
        return;
      }
      if (P().sleeping || P().dead) { faceVanish(false); return; }
      const cp = E.camera.position, fp = E.feetPos(), t = T();
      const head = V3(s.pos.x, 1.72, s.pos.z), to = head.clone().sub(cp), dist = to.length(); to.divideScalar(dist);
      const look = to.dot(camFwd()), los = E.losClear(cp.x, cp.z, s.pos.x, s.pos.z), seen = los && look > .62 && dist < 30;
      const flashed = seen && P().flash.on && P().flash.battery > 0 && look > .97 && dist < 14;
      const st = ST(), stg = stage();
      if (seen) {
        s.seenT += dt; s.seenEver = true;
        drain(dt * (.25 + .9 * smooth(14, 2.5, dist)) * [.6, .8, 1, 1.1][stg] * (flashed ? 1.3 : 1));
        st.panic = Math.min(1, st.panic + dt * .025 * smooth(16, 3, dist));
        if (flashed) s.frozen = t + 6;
        if (!s.told && s.seenT > .5) { s.told = true; E.addPanic(.1); api.notes.unlock('g_faceling'); later(1, () => api.say(pick(['В проходе стоит человек. Офисная рубашка, галстук. У него нет лица.', 'Человек. Стоит спиной. Затылок слишком гладкий.', 'Там кто-то есть. Без лица — просто кожа, натянутая там, где должны быть глаза.']), 4.5)); }
        // медленно поворачивает голову, потом корпус — к тебе
        const want = Math.atan2(cp.x - s.pos.x, cp.z - s.pos.z);
        let dh = ((want - s.yaw - s.head + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        s.head += clamp(dh, -dt * .7, dt * .7); if (Math.abs(s.head) > 1.1) { const sh = clamp(s.head, -dt * .9, dt * .9); s.yaw += sh; s.head -= sh; }
      } else if (t < s.frozen) {
        // скован светом — стоит, даже когда не смотришь
      } else {
        // не видишь — идёт к тебе. Свет убежища и музыка держат на расстоянии
        const calm = calmNear(fp, 9), hold = (calm && dist < 9) || (P().inShelter && dist < 6.5);
        if (hold) { s.hold += dt; if (s.hold > 9) { faceVanish(true); return; } }
        else {
          s.hold = 0;
          const sp = ([1.1, 1.35, 1.75, 2.2][stg] + (curfewDark() ? .35 : 0)) * (P().lightLevel > E.BAL.dimLevel ? .75 : 1), want = V3(fp.x - s.pos.x, 0, fp.z - s.pos.z); const wl = want.length(); want.divideScalar(wl || 1);
          let moved = false;
          for (const a of STEER) {
            const d = want.clone().applyAxisAngle(V3(0, 1, 0), a);
            if (rayFree({ x: s.pos.x, y: 1, z: s.pos.z }, { x: d.x, y: 0, z: d.z }, .65) && rayFree({ x: s.pos.x, y: .3, z: s.pos.z }, { x: d.x, y: 0, z: d.z }, .65)) {
              s.pos.addScaledVector(d, Math.min(wl, sp * dt)); s.yaw = damp(s.yaw, Math.atan2(d.x, d.z), 6, dt); s.head = damp(s.head, 0, 3, dt); moved = true; break;
            }
          }
          s.stuck = moved ? Math.max(0, s.stuck - dt) : s.stuck + dt;
          // застрял или далеко за стенами — «оказывается» ближе, там, куда ты не смотришь
          if (s.stuck > 2 || (!los && dist > 16)) { const np = E.Watcher.findSpot(Math.max(4, dist - 7), Math.max(6, dist - 2), true); if (np) { s.pos.copy(np); s.stuck = 0; } }
          if (dist < 9 && (FACE.stepT -= dt) <= 0) { FACE.stepT = .62; A.footstep(E.surfaceAt(s.pos.x, s.pos.z), .16, s.pos.clone().setY(.05), .25); }
          if (Math.hypot(fp.x - s.pos.x, fp.z - s.pos.z) < 1.25) { faceTouch(); return; }
        }
      }
      s.life -= dt;
      if (s.life <= 0 && !seen) { faceVanish(true); return; }
      s.pos.y = E.floorY(s.pos.x, s.pos.z);
      m.position.copy(s.pos); m.rotation.y = s.yaw; m.userData.pivot.rotation.y = s.head;
      if ((s.lt = (s.lt || 0) - dt) <= 0) { s.lt = .2; relight(m.userData.mats, s.pos); }
    }
    const later = (sec, fn) => E.later(sec, fn);

    // ================================================================ ЭХО
    const ECHO = { on: false, d: 9, q: [], life: 0, lastStep: 0, extraDone: true, still: 0, reveal: 0, bright: 0, back: V3(0, 0, 1), cd: rand(150, 260), told: false };
    api.on('player:step', ev => {
      ECHO.lastStep = T();
      const v = P().vel, sp = Math.hypot(v.x, v.z); if (sp > .8) ECHO.back.set(-v.x / sp, 0, -v.z / sp);
      if (ECHO.on) { ECHO.q.push({ t: T() + rand(.28, .38), loud: ev.loud }); ECHO.extraDone = false; ECHO.still = 0; }
    });
    const echoPos = () => { const fp = E.feetPos(); return V3(fp.x + ECHO.back.x * ECHO.d, fp.y + .05, fp.z + ECHO.back.z * ECHO.d); };
    const echoStep = (loud = .6) => { const p = echoPos(); A.footstep(E.surfaceAt(p.x, p.z), loud * .75, p, .35); };
    function echoStart() {
      ECHO.on = true; ECHO.d = rand(7, 10); ECHO.life = rand(45, 80); ECHO.q.length = 0; ECHO.extraDone = true; ECHO.still = 0; ECHO.reveal = 0; ECHO.bright = 0; ECHO.toldStop = false;
      api.emit('dw:echo', {});
    }
    function echoEnd(how) {
      ECHO.on = false; ECHO.q.length = 0;
      if (how === 'reveal') { echoStep(.5); ST().sanity = Math.min(100, ST().sanity + 2); api.quest.count('dw:echo'); api.say(pick(['Луч упёрся в пустой коридор. Шаги больше не повторились.', 'Ты посветил назад — и тишина. Настоящая.']), 4); }
      else if (how === 'light') api.say('В свете шаги позади запнулись и пропали.', 3);
    }
    function echoUpdate(dt) {
      const t = T();
      if (!ECHO.on) {
        if (!playing()) return;
        const dim = P().lightLevel < E.BAL.dimLevel, walking = t - ECHO.lastStep < 1;
        if (dim && walking && !P().inShelter && !P().swim) {
          const k = [.25, 1, 1.5, 2][stage()] * (curfewDark() ? 1.4 : 1);
          if ((ECHO.cd -= dt * k) <= 0) { ECHO.cd = rand(170, 300); echoStart(); }
        }
        return;
      }
      if (!playing()) { echoEnd(); return; }
      // шаги-повторы
      for (let i = ECHO.q.length - 1; i >= 0; i--) if (ECHO.q[i].t <= t) { echoStep(ECHO.q[i].loud); ECHO.q.splice(i, 1); }
      if (!ECHO.told && ECHO.q.length === 0 && t - ECHO.lastStep < .5) { ECHO.told = true; later(3, () => { if (ECHO.on) { api.say('Шаги позади повторяют твои. Почти точно.', 4); api.notes.unlock('g_echo'); } }); }
      // ты остановился — оно нет
      if (t - ECHO.lastStep > .65 && !ECHO.extraDone) {
        ECHO.extraDone = true; const n = 1 + (Math.random() * (1 + stage()) | 0);
        for (let i = 0; i < n; i++) later(.45 + i * .5, () => { if (!ECHO.on) return; ECHO.d = Math.max(1.8, ECHO.d - .6); echoStep(.55); });
        if (!ECHO.toldStop) { ECHO.toldStop = true; later(.6 + n * .5, () => { if (ECHO.on) api.say(pick(['Ты остановился. Шаги — нет.', 'Ещё шаг позади. И ещё. Потом — тишина, слишком близко.']), 4); }); }
      }
      if (t - ECHO.lastStep > 6) { ECHO.still += dt; ECHO.d -= dt * .22; if ((ECHO.br = (ECHO.br || 0) - dt) <= 0) { ECHO.br = rand(3, 5); A.breath(echoPos().setY(1.5)); } }
      if (ECHO.d < 1.6) { A.whisper(null); drain(10); E.addPanic(.3); api.quest.count('dw:echo:close'); api.say('Шёпот прямо в ухо. Слов не разобрать — только твоё имя.', 4.5); echoEnd(); return; }
      drain(dt * .2 * [.6, .8, 1, 1.3][stage()]);
      // обернуться и посветить назад
      const p = echoPos(), to = p.clone().setY(1.2).sub(E.camera.position).normalize();
      if (P().flash.on && P().flash.battery > 0 && to.dot(camFwd()) > .82) { ECHO.reveal += dt; if (ECHO.reveal > 1.2) { echoEnd('reveal'); return; } } else ECHO.reveal = Math.max(0, ECHO.reveal - dt);
      ECHO.bright = P().lightLevel > .42 ? ECHO.bright + dt : 0; if (ECHO.bright > 3) { echoEnd('light'); return; }
      if ((ECHO.life -= dt) <= 0) echoEnd();
    }

    // ================================================================ МОТЫЛЬКИ
    const MOTH_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      g.fillStyle = 'rgba(190,170,130,.9)'; g.beginPath(); g.ellipse(10, 15, 8, 6, -.5, 0, Math.PI * 2); g.ellipse(22, 15, 8, 6, .5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(70,55,35,1)'; g.beginPath(); g.ellipse(16, 17, 2.2, 7, 0, 0, Math.PI * 2); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const MOTH_ZONES = new Set(['dark', 'void', 'garage', 'pipes', 'electrical', 'lightsout', 'industrial']);
    const MOTH = { on: false, pts: null, n: 30, dark: 0, off: 0, scatter: 0, cd: 60, stut: 2, flut: 0, ph: [] };
    function mothStart() {
      const n = MOTH.n, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      MOTH.ph = Array.from({ length: n }, () => ({ r: rand(.12, .55), w: rand(2, 6) * (Math.random() < .5 ? -1 : 1), a: rand(0, 6.28), y: rand(-.25, .25), z: rand(-1.9, -.9), v: V3() }));
      MOTH.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: MOTH_TEX, size: .07, sizeAttenuation: true, transparent: true, depthWrite: false, color: 0xe8dcc0, opacity: 0 }));
      MOTH.pts.frustumCulled = false; MOTH.pts.userData.noAO = true; E.camera.add(MOTH.pts);
      MOTH.on = true; MOTH.off = 0; MOTH.scatter = 0; MOTH.stut = rand(2, 4);
      api.say(pick(['Вокруг луча вьются мотыльки. Откуда они здесь?', 'Мотыльки. Десятки. Бьются в стекло фонаря.']), 4); api.notes.unlock('g_moths');
    }
    function mothEnd() { if (MOTH.pts) { E.camera.remove(MOTH.pts); MOTH.pts.geometry.dispose(); MOTH.pts.material.dispose(); MOTH.pts = null; } MOTH.on = false; MOTH.dark = 0; }
    function mothUpdate(dt) {
      const f = P().flash, base = P().lightLevel - (f.on ? .05 + .06 * f.battery : 0) - (P().extraLight || 0);
      const zk = E.zoneAt(E.feetPos().x, E.feetPos().z).key, darkZone = MOTH_ZONES.has(zk) || curfewDark();
      if (!MOTH.on) {
        if (!playing()) return;
        MOTH.cd -= dt;
        MOTH.dark = f.on && base < E.BAL.darkLevel && darkZone ? MOTH.dark + dt : Math.max(0, MOTH.dark - dt * 2);
        if (MOTH.dark > 28 && MOTH.cd <= 0) { MOTH.cd = rand(150, 260); mothStart(); }
        return;
      }
      const t = T(), pos = MOTH.pts.geometry.attributes.position, arr = pos.array;
      if (!MOTH.scatter) {
        MOTH.off = f.on ? 0 : MOTH.off + dt;
        if (MOTH.off > 2.5 || base > E.BAL.dimLevel || !playing()) { MOTH.scatter = t; if (MOTH.off > 2.5) { api.quest.count('dw:moths'); api.say('Темнота — и шорох крыльев разлетается в стороны.', 3); } }
        else if (f.on) {
          f.battery = Math.max(0, f.battery - dt / (E.BAL.flashMinutes * 60) * 1.6); // свет «съедается»
          if ((MOTH.stut -= dt) <= 0) { MOTH.stut = rand(2.5, 5); E.SFX.flashStutter = rand(.3, .7); }
          drain(dt * .035);
        }
        if ((MOTH.flut -= dt) <= 0) { MOTH.flut = rand(.25, .7); A.cloth?.(.12); }
      }
      const sc = MOTH.scatter ? (t - MOTH.scatter) : 0, op = MOTH.scatter ? Math.max(0, 1 - sc / 1.3) : Math.min(1, MOTH.pts.material.opacity + dt);
      MOTH.pts.material.opacity = op * (f.on ? 1 : .35);
      for (let i = 0; i < MOTH.ph.length; i++) {
        const p = MOTH.ph[i]; p.a += p.w * dt;
        const jit = vnoise(t * 3 + i, i, 1) - .5, r = p.r + sc * 2.5;
        arr[i * 3] = .05 + Math.cos(p.a) * r + jit * .1; arr[i * 3 + 1] = -.08 + p.y + Math.sin(p.a * 1.7) * .08 + sc * (i % 2 ? 1 : -1) * .8; arr[i * 3 + 2] = p.z + Math.sin(p.a) * r * .6 - sc;
      }
      pos.needsUpdate = true;
      if (MOTH.scatter && sc > 1.4) mothEnd();
    }
    api.on('world:clear', () => { faceVanish(false); if (ECHO.on) echoEnd(); mothEnd(); });

    // ================================================================ цикл, записи, задания
    api.on('update', dt => { faceUpdate(dt); echoUpdate(dt); mothUpdate(dt); });
    const N = (id, kind, order, t, b) => api.notes.register(id, { kind, order, t, b });
    N('g_faceling', 'guide', 55, 'Руководство: Безликий', 'Человек в офисной одежде без лица. Пока ты смотришь на него — стоит, но рассудок тает, и тем быстрее, чем он ближе. Отвернёшься — подходит, иногда оказываясь ближе, чем мог бы дойти. Луч фонаря в лицо сковывает его секунд на шесть — успей уйти. На свету он идёт медленнее, а убежище и заведённая музыкальная шкатулка не дают ему подойти. Касание — тяжёлый удар по рассудку. Он уходит сам, если продержаться.');
    N('g_echo', 'guide', 56, 'Руководство: Эхо', 'Если шаги позади повторяют твои — остановись и прислушайся: Эхо всегда делает лишний шаг. Обернись и посвети туда, откуда шли шаги, — оно замолчит. Яркий свет тоже его спугнёт. Не стой на месте слишком долго: Эхо подойдёт вплотную.');
    N('g_moths', 'guide', 57, 'Руководство: мотыльки', 'В долгой темноте мотыльки слетаются на фонарь: батарея садится быстрее, луч мигает. Выключи фонарь на пару секунд — они разлетятся. Коптилка их не привлекает.');
    N('d_memo', 'lore', 93, 'Служебная записка Liminal Industries', '«Сотрудникам, работающим в ночную смену: если вы встретили коллегу, который не отвечает на приветствие и чьё лицо вы не можете вспомнить, — не останавливайтесь. Не смотрите. Не позволяйте ему идти за вами в освещённые помещения. Это не коллега. Отдел кадров сотрудников без лиц не нанимал».');
    N('d_echo', 'lore', 94, 'Каракули на полях', 'Я считаю шаги. Мои — 1, 2, 3, 4. Его — 1, 2, 3, 4, 5. Он всегда ошибается на один. Если обернуться с фонарём, он стесняется.');
    N('d_moth', 'lore', 95, 'Записка, приклеенная скотчем к фонарю', 'Не свети долго в темноте! Их много, они жрут свет, как еду. Выключи — и они улетят искать другого дурака с фонарём.');
    api.quests.chapter('ch_dw', { title: 'Глава · Обитатели', order: 5, desc: 'Научиться жить рядом с теми, кто здесь живёт.' });
    const Q = (id, order, title, desc, check, reward, after = []) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch_dw' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    Q('q_dw_face', 40, 'Не смотри', 'переживи встречу с Безликим, не дав ему коснуться тебя', cnt('dw:face:escape', 1), { pills: 1 }, ['q_look']);
    Q('q_dw_echo', 41, 'Лишний шаг', 'останови Эхо: обернись и посвети назад', cnt('dw:echo', 1), { battery: 1 }, ['q_look']);
    Q('q_dw_moths', 42, 'На свет', 'разгони мотыльков, погасив фонарь', cnt('dw:moths', 1), { battery: 1 }, ['q_look']);
    api.commands.register('faceling', { help: 'вызвать Безликого', run: () => String(faceSpawn(true)) });
    api.commands.register('echo', { help: 'вызвать Эхо', run: () => { echoStart(); return 'ok'; } });
    api.commands.register('moths', { help: 'вызвать мотыльков', run: () => { if (!MOTH.on) mothStart(); return 'ok'; } });
    api.provide('dwellers', { faceling: () => FACE.s, echo: () => ECHO.on, moths: () => MOTH.on, faceSpawn, echoStart, mothStart });
  },
});
