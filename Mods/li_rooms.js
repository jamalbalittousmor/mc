// =====================================================================
//  Liminal Industry · «Голоса и комнаты»
//  Мир становится населённым — вещами, которые ведут себя как люди:
//   • Телефоны на стенах звонят. Ответишь — услышишь К., оператора M.E.G.,
//     подсказку о тайнике… или собственное дыхание.
//   • Телевизоры в пустых комнатах: шум, настроечная таблица, сообщения.
//     Рядом с работающим экраном спокойнее, но в Смятении в шуме кто-то есть.
//   • Пейзажи маслом («счастливые деревца»). Успокаивают. Пока ты в своём уме.
//   • Новые события: мокрые следы, уходящие в стену; «дышащий» свет; зов по имени.
// =====================================================================
Backrooms.mod({
  id: 'li.rooms', name: 'Liminal Industry · Голоса и комнаты', version: '1.0.0',
  requires: ['core.industry@>=1.0'], loadAfter: ['li.mind'],
  description: 'Звонящие телефоны, телевизоры, картины-пейзажи и новые тихие события.',
  init(api) {
    const { V3, rand, pick, clamp, damp, smooth } = api.util, E = api.engine, THREE = api.THREE, A = api.audio;
    const P = () => E.player, ST = () => E.player.st, T = () => E.clock.elapsedTime;
    const playing = () => E.game.state === 'play' && !P().sleeping && !P().dead;
    const stage = () => { const m = api.require('mind'); if (m) return m.stage(); const s = ST().sanity; return s >= 70 ? 0 : s >= 45 ? 1 : s >= 25 ? 2 : 3; };
    const later = (s, fn) => E.later(s, fn);
    const dropSan = v => { const st = ST(); st.sanity = clamp(st.sanity - v, 0, 100); };
    const lvKey = k => E.game.level + ':' + k; // данные мода общие на все уровни — ключи привязываем к уровню
    const chunkOfPos = p => [Math.floor(p.x / E.CS), Math.floor(p.z / E.CS)];
    const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    // точки интерактива (как в example_vending): ключ -> запись; чистим при выгрузке чанка
    const spots = new Map();
    api.on('chunk:unload', ch => { for (const [k, s] of spots) { const [cx, cz] = chunkOfPos(s.pos); if (cx === ch.cx && cz === ch.cz) { s.onUnload?.(); spots.delete(k); } } });
    api.on('world:clear', () => { for (const s of spots.values()) s.onUnload?.(); spots.clear(); prints.splice(0).forEach(p => E.scene.remove(p.g)); });
    // ориентированная коробка у стены: u — вдоль стены, n — от стены
    const wallBox = (gb, s, u0, u1, y0, y1, n0, n1) => {
      if (s.alongZ) { const x0 = s.x + s.nx * n0, x1 = s.x + s.nx * n1; gb.box(Math.min(x0, x1), y0, s.z + u0, Math.max(x0, x1), y1, s.z + u1); return [Math.min(x0, x1), y0, s.z + u0, Math.max(x0, x1), y1, s.z + u1]; }
      const z0 = s.z + s.nz * n0, z1 = s.z + s.nz * n1; gb.box(s.x + u0, y0, Math.min(z0, z1), s.x + u1, y1, Math.max(z0, z1)); return [s.x + u0, y0, Math.min(z0, z1), s.x + u1, y1, Math.max(z0, z1)];
    };
    const wallPlane = (mat, s, w, h, y, off) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(s.x + s.nx * off, y, s.z + s.nz * off); m.rotation.y = Math.atan2(s.nx, s.nz); m.userData.noAO = true; return m; };

    // ================================================================ ТЕЛЕФОНЫ
    api.structures.register('li.phone', {
      zones: ['lobby', 'office', 'hotel', 'school', 'electrical', 'maze', 'mall'], chance: z => z.key === 'office' || z.key === 'hotel' ? .009 : .005, salt: 9701,
      cell(ctx, c) {
        const ws = E.wallSlots(c.gx, c.gz); if (!ws.length) return; const s = ws[(c.rng() * ws.length) | 0], u = (c.rng() - .5) * 1.6;
        const M = ctx.gb('darkp'), box = wallBox(M, s, u - .11, u + .11, 1.22, 1.52, .002, .09); ctx.colBox(...box);
        wallBox(ctx.gb('plastic'), s, u - .035, u + .035, 1.25, 1.5, .09, .14); // трубка
        spots.set(c.key(0), { kind: 'phone', pos: V3(s.x + s.nx * .12 + (s.alongZ ? 0 : u), 1.37, s.z + s.nz * .12 + (s.alongZ ? u : 0)), key: c.key(0) });
      },
    });
    const PHONE = { ring: null, cd: rand(70, 140) };
    const LINES = {
      k: [['…ты меня слышишь? Это К. Я оставил записки… не верь стрелкам на стенах, которые рисовал не ты.', 'Голос обрывается. Гудки.'],
        ['…если дозвонился — значит, ещё в себе. Держись света. Свет — это время.', 'Щелчок. Тишина.'],
        ['…я нашёл, где они выключают свет. Там никого нет. Совсем никого. Слышишь? Никого…', 'Связь пропадает в шорохе.']],
      meg: [['«Говорит станция M.E.G. Странник, если слышите: Безликие не любят музыку. Шкатулка — ваш друг».', 'Автоматический голос повторяет это ещё раз и отключается.'],
        ['«Станция M.E.G.: на шаги, повторяющие ваши, светите назад. Повторяю: светите назад».', 'Гудки.'],
        ['«Станция M.E.G.: перед Отбоем свет мигает трижды. Не будьте в коридоре».', 'Короткие гудки.'],
        ['«M.E.G.: знаки на полу видят только те, кто на грани. Тайники настоящие. Цена — тоже».', 'Отбой.']],
      breath: [['На том конце — только дыхание. Медленное. Твоё.'], ['Дыхание. Потом — смешок, очень тихий, будто кто-то прикрыл трубку ладонью.']],
      self: [['«Алло?» — говорит твой голос. — «Если ты это слышишь, не бери трубку». Гудки.'], ['Твой голос, издалека: «…я всё ещё в той комнате. Ты стоишь у меня за спиной».']],
    };
    function relDir(p) {
      const fp = E.feetPos(), f = E.camera.getWorldDirection(V3()).setY(0).normalize(), d = V3(p.x - fp.x, 0, p.z - fp.z), dist = d.length(); d.normalize();
      const a = Math.atan2(f.x * d.z - f.z * d.x, f.dot(d)), steps = Math.round(dist / .75 / 10) * 10;
      const where = Math.abs(a) < .5 ? 'прямо перед тобой' : Math.abs(a) > 2.5 ? 'у тебя за спиной' : a > 0 ? 'справа от тебя' : 'слева от тебя';
      return `${where}, шагов ${steps}`;
    }
    const X_TEX = canvas(128, 128, g => { g.strokeStyle = 'rgba(240,240,232,.9)'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(24, 24); g.lineTo(104, 104); g.moveTo(104, 24); g.lineTo(24, 104); g.stroke(); g.beginPath(); g.arc(64, 64, 52, 0, 6.3); g.stroke(); });
    const xMat = new THREE.MeshBasicMaterial({ map: X_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: 0xd8d4c4 });
    function phoneStash() {
      const fp = E.feetPos(); let p = null;
      for (let k = 0; k < 12 && !p; k++) { const c = E.findFreeSpot(fp.x, fp.z, 8); if (c && c.distanceTo(fp) > 16 && c.distanceTo(fp) < 38) p = c; }
      if (!p) return null;
      const ids = ['battery', 'almond', 'can', 'bandage', 'fuel', 'wire', 'bulb', 'pills', 'tea', 'photo'].filter(id => E.ITEMS[id]);
      for (let i = 0; i < 3; i++) E.spawnItem(pick(ids), V3(p.x + rand(-.4, .4), p.y + .3 + i * .1, p.z + rand(-.4, .4)));
      const x = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), xMat); x.position.set(p.x, p.y + .012, p.z); x.userData.noAO = true; E.scene.add(x);
      stashMarks.push({ m: x, p, t: 0 }); return p;
    }
    const stashMarks = [];
    function answer(sp) {
      const ring = PHONE.ring; PHONE.ring = null; A.click(); api.quest.count('rooms:call');
      const stg = stage(), opts = [['k', 3], ['meg', 2.2], ['stash', 2.2], ['breath', .8 + stg * .6], ['self', stg >= 2 ? 1.2 : 0], ['curfew', E.CURFEW?.state === 'idle' && E.CURFEW.next < 200 ? 4 : 0]];
      let tot = opts.reduce((a, o) => a + o[1], 0), r = Math.random() * tot, kind = 'k'; for (const [k, w] of opts) { r -= w; if (r <= 0) { kind = k; break; } }
      const v = sp.pos, sayAt = (lines, gap = 3.6) => lines.forEach((l, i) => later(.8 + i * gap, () => api.say(l, gap + .8)));
      if (kind === 'stash') {
        const p = phoneStash(); if (!p) kind = 'k';
        else { A.murmur?.(v, 3); sayAt([`Женский голос, спокойно: «Я оставила тебе кое-что. ${relDir(p)}. Крестик мелом на полу».`, 'Гудки. Голос был добрым. Это пугает сильнее всего.']); ST().sanity = Math.min(100, ST().sanity + 3); return; }
      }
      if (kind === 'curfew') { A.murmur?.(v, 2.4); sayAt([`Сухой голос: «До Отбоя ${Math.max(1, Math.round(E.CURFEW.next / 60))} мин. Найди свой угол».`, 'Короткие гудки.']); return; }
      if (kind === 'breath') { A.breath(v); E.addPanic(.15); dropSan(6); sayAt(pick(LINES.breath)); return; }
      if (kind === 'self') { A.murmur?.(v, 2); dropSan(10); E.addPanic(.25); sayAt(pick(LINES.self)); api.notes.unlock('r_phone_self'); return; }
      A.murmur?.(v, 3); ST().sanity = Math.min(100, ST().sanity + (kind === 'k' ? 4 : 2)); sayAt(pick(LINES[kind]));
    }
    function phoneUpdate(dt) {
      const r = PHONE.ring;
      if (r) {
        if (!spots.has(r.key) || !playing()) { PHONE.ring = null; return; }
        r.t -= dt; if ((r.snd -= dt) <= 0) { r.snd = 3.4; A.phone(r.pos); }
        if (r.t <= 0) PHONE.ring = null;
        return;
      }
      if (!playing() || (PHONE.cd -= dt) > 0) return;
      PHONE.cd = rand(100, 220) / (1 + stage() * .25);
      const fp = E.feetPos(); let best = null, bd = 1e9;
      for (const s of spots.values()) if (s.kind === 'phone') { const d = s.pos.distanceTo(fp); if (d > 5 && d < 26 && d < bd) { bd = d; best = s; } }
      if (best) { PHONE.ring = { key: best.key, pos: best.pos, t: 15, snd: 0 }; if (!api.data.phoneTold) { api.data.phoneTold = true; later(2, () => api.say('Где-то рядом звонит телефон. Настоящий.', 3.5)); } }
    }

    // ================================================================ ТЕЛЕВИЗОРЫ
    const STATIC = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 72; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return { c, g: c.getContext('2d'), t, acc: 0, face: 0 }; })();
    function drawStatic(face) {
      const { g, c } = STATIC, img = g.createImageData(c.width, c.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      if (face > 0) { g.fillStyle = `rgba(0,0,0,${face * .55})`; g.beginPath(); g.ellipse(48, 32, 14, 18, 0, 0, 6.3); g.fill(); g.fillRect(30, 48, 36, 30); }
      STATIC.t.needsUpdate = true;
    }
    const BARS = canvas(128, 96, (g, w, h) => { const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 7, 0, w / 7 + 1, h * .7); }); g.fillStyle = '#101010'; g.fillRect(0, h * .7, w, h * .3); g.fillStyle = '#e0e0e0'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.fillText('НЕТ СИГНАЛА', w / 2, h * .88); });
    const MSG = { calm: ['ВСЁ В ПОРЯДКЕ', 'ОСТАВАЙТЕСЬ НА МЕСТЕ', 'ПОГОДА: ЯСНО', 'ВЫ НЕ ОДНИ'], dark: ['ОНО ЗА ТОБОЙ', 'НЕ СПИ', 'ТЫ УЖЕ БЫЛ ЗДЕСЬ', 'ВЫКЛЮЧИ МЕНЯ'] }, msgTex = new Map();
    const msgTexOf = t => { if (!msgTex.has(t)) msgTex.set(t, canvas(128, 96, (g, w, h) => { g.fillStyle = '#06103a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8ecff'; g.font = 'bold 12px monospace'; g.textAlign = 'center'; const words = t.split(' '); let line = '', y = h / 2 - (words.length > 2 ? 8 : 0); for (const wd of words) { if ((line + ' ' + wd).length > 12) { g.fillText(line, w / 2, y); line = wd; y += 16; } else line = line ? line + ' ' + wd : wd; } g.fillText(line, w / 2, y); })); return msgTex.get(t); };
    const screenMat = { off: new THREE.MeshBasicMaterial({ color: 0x0b0d0c }), static: new THREE.MeshBasicMaterial({ map: STATIC.t, color: new THREE.Color(1.5, 1.5, 1.5) }), bars: new THREE.MeshBasicMaterial({ map: BARS, color: new THREE.Color(1.4, 1.4, 1.4) }), msg: new Map() };
    const msgMat = t => { if (!screenMat.msg.has(t)) screenMat.msg.set(t, new THREE.MeshBasicMaterial({ map: msgTexOf(t), color: new THREE.Color(1.4, 1.4, 1.5) })); return screenMat.msg.get(t); };
    const CH = ['off', 'static', 'bars', 'msg'];
    const tvState = k => (api.data.tv ||= {})[lvKey(k)] ||= { ch: hashOn(k) ? 1 : 0, msg: 0 };
    const hashOn = k => [...k].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0;
    api.structures.register('li.tv', {
      zones: ['lobby', 'office', 'hotel', 'school', 'mall', 'dark'], chance: z => z.key === 'hotel' ? .008 : .004, salt: 9702,
      cell(ctx, c) {
        const ws = E.wallSlots(c.gx, c.gz); if (!ws.length) return; const s = ws[(c.rng() * ws.length) | 0];
        const W = ctx.gb('wood'), D = ctx.gb('darkp');
        ctx.colBox(...wallBox(W, s, -.45, .45, 0, .55, .002, .5));             // тумба
        ctx.colBox(...wallBox(D, s, -.32, .32, .55, 1.05, .04, .48));        // корпус «пузатого» телевизора
        wallBox(D, s, -.06, .06, 1.05, 1.2, .2, .24);                          // антенна-основание
        const scr = wallPlane(screenMat.off, s, .48, .36, .8, .485); ctx.add(scr);
        const key = c.key(0), sp = { kind: 'tv', pos: V3(s.x + s.nx * .5, .8, s.z + s.nz * .5), key, scr, calm: { pos: null, on: false, r: 4.5, kind: 'tv' } };
        sp.calm.pos = sp.pos; spots.set(key, sp); applyTv(sp);
        sp.onUnload = () => { api.require('mind')?.calmSources.delete(sp.calm); if (TV.voice?.key === key) stopVoice(); };
      },
    });
    function applyTv(sp) {
      const st = tvState(sp.key), ch = CH[st.ch];
      sp.scr.material = ch === 'off' ? screenMat.off : ch === 'static' ? screenMat.static : ch === 'bars' ? screenMat.bars : msgMat(currentMsg(st));
      sp.calm.on = ch === 'bars' || ch === 'msg'; const mind = api.require('mind'); if (mind) mind.calmSources.add(sp.calm);
    }
    const currentMsg = st => { const dark = stage() >= 2, list = dark ? MSG.dark : MSG.calm; return list[st.msg % list.length]; };
    const TV = { voice: null, near: null };
    function stopVoice() { const v = TV.voice; if (!v) return; try { v.g.gain.setTargetAtTime(0, A.ctx.currentTime, .1); v.src.stop(A.ctx.currentTime + .5); } catch (e) {} TV.voice = null; }
    function startVoice(sp, ch) {
      stopVoice(); if (!A.ready) return; const ctx = A.ctx, out = A.out(sp.pos, .25), g = ctx.createGain(); g.gain.value = 0; g.connect(out);
      let src;
      if (ch === 'static') { src = ctx.createBufferSource(); src.buffer = A.white; src.loop = true; const f = A.bp(2600, .7); src.connect(f).connect(g); g.gain.setTargetAtTime(.035, ctx.currentTime, .2); }
      else { src = ctx.createOscillator(); src.type = 'sine'; src.frequency.value = ch === 'bars' ? 1000 : 440; src.connect(g); g.gain.setTargetAtTime(ch === 'bars' ? .008 : .004, ctx.currentTime, .2); }
      src.start(); TV.voice = { key: sp.key, ch, src, g };
    }
    function tvUpdate(dt) {
      const fp = E.feetPos(); let near = null, nd = 12;
      for (const s of spots.values()) if (s.kind === 'tv' && CH[tvState(s.key).ch] !== 'off') { const d = s.pos.distanceTo(fp); if (d < nd) { nd = d; near = s; } }
      // звук только у ближайшего работающего телевизора
      const ch = near ? CH[tvState(near.key).ch] : null;
      if (!near || !playing()) { if (TV.voice) stopVoice(); }
      else if (!TV.voice || TV.voice.key !== near.key || TV.voice.ch !== ch) startVoice(near, ch);
      // шум на экране: один общий холст; в Смятении в шуме иногда проступает силуэт
      if (near && ch === 'static') {
        STATIC.acc -= dt; if (STATIC.acc <= 0) { STATIC.acc = 1 / 15; STATIC.face = stage() >= 2 && Math.random() < .015 ? 1 : Math.max(0, STATIC.face - .2); drawStatic(STATIC.face); }
        if (STATIC.face > .9 && nd < 6 && E.inView(near.pos, .8)) { dropSan(2); E.addPanic(.08); if (!TV.faceTold) { TV.faceTold = true; api.say('В шуме на экране — силуэт. Голова, плечи. Повернулся к тебе.', 4); } }
      }
      // компания: настроечная таблица и сообщения успокаивают, шум — наоборот
      if (near && nd < 4.5 && playing()) { const st = ST(); if (ch === 'static') st.sanity = Math.max(0, st.sanity - dt * .05); else st.sanity = Math.min(100, st.sanity + dt * .12); }
    }

    // ================================================================ КАРТИНЫ
    const paintBase = (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h * .55); sky.addColorStop(0, '#5f8fc0'); sky.addColorStop(1, '#f2d8a8'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 4; i++) { const x = 30 + i * 60, y = 30 + (i % 2) * 12; g.beginPath(); g.ellipse(x, y, 26, 9, 0, 0, 6.3); g.ellipse(x + 16, y - 5, 18, 8, 0, 0, 6.3); g.fill(); }
      g.fillStyle = '#6a7a96'; g.beginPath(); g.moveTo(0, h * .58); g.lineTo(60, h * .3); g.lineTo(110, h * .5); g.lineTo(170, h * .25); g.lineTo(w, h * .55); g.lineTo(w, h * .62); g.lineTo(0, h * .62); g.fill();
      g.fillStyle = '#e8eef4'; g.beginPath(); g.moveTo(170, h * .25); g.lineTo(158, h * .33); g.lineTo(183, h * .33); g.fill();
      const lake = g.createLinearGradient(0, h * .6, 0, h); lake.addColorStop(0, '#7aa8c8'); lake.addColorStop(1, '#2c4a5a'); g.fillStyle = lake; g.fillRect(0, h * .6, w, h * .4);
      g.fillStyle = '#3d5a2a'; g.fillRect(0, h * .78, w, h * .22);
      const tree = (x, y, s) => { g.fillStyle = '#4a3420'; g.fillRect(x - s * .06, y, s * .12, s * .3); g.fillStyle = '#1f3a1e'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x, y - s * (1 - k * .22)); g.lineTo(x - s * (.25 + k * .08), y - s * (.55 - k * .2)); g.lineTo(x + s * (.25 + k * .08), y - s * (.55 - k * .2)); g.fill(); } };
      tree(28, h * .86, 60); tree(58, h * .9, 46); tree(220, h * .88, 54); tree(240, h * .93, 40);
      g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 18; i++) g.fillRect(rand(60, 200), h * (.64 + Math.random() * .1), rand(6, 18), 1.5);
    };
    const figure = (g, w, h, s) => { g.fillStyle = 'rgba(12,10,8,.92)'; const x = 150, y = h * .8; g.beginPath(); g.ellipse(x, y - s * 1.05, s * .14, s * .18, 0, 0, 6.3); g.fill(); g.fillRect(x - s * .2, y - s * .88, s * .4, s * .55); g.fillRect(x - s * .16, y - s * .35, s * .12, s * .35); g.fillRect(x + s * .04, y - s * .35, s * .12, s * .35); };
    const PAINT = [0, 1, 2].map(v => new THREE.MeshStandardMaterial({ map: canvas(256, 192, (g, w, h) => { paintBase(g, w, h); if (v) figure(g, w, h, v === 1 ? 26 : 70); }), roughness: .6 }));
    const paintings = [];
    api.structures.register('li.painting', {
      zones: ['lobby', 'office', 'hotel', 'school', 'mall', 'maze', 'fun'], chance: z => z.key === 'hotel' ? .012 : .005, salt: 9703,
      cell(ctx, c) {
        const ws = E.wallSlots(c.gx, c.gz); if (!ws.length) return; const s = ws[(c.rng() * ws.length) | 0], u = (c.rng() - .5) * 1.2;
        wallBox(ctx.gb('wood', 0x8a6a40), s, u - .52, u + .52, 1.08, 1.92, .002, .04);
        const so = { ...s, x: s.alongZ ? s.x : s.x + u, z: s.alongZ ? s.z + u : s.z };
        const m = wallPlane(PAINT[0], so, .92, .7, 1.5, .044); ctx.add(m);
        const key = c.key(0), rec = { kind: 'painting', pos: V3(so.x + s.nx * .06, 1.5, so.z + s.nz * .06), key, m, v: 0 };
        paintings.push(rec); spots.set(key, rec); rec.onUnload = () => { const i = paintings.indexOf(rec); if (i >= 0) paintings.splice(i, 1); };
      },
    });
    function paintUpdate() {
      const want = stage() >= 3 ? 2 : stage() >= 2 ? 1 : 0;
      for (const r of paintings) if (r.v !== want && !E.inView(r.pos, .5)) { r.v = want; r.m.material = PAINT[want]; if (want === 2 && r.pos.distanceTo(E.camera.position) < 8) r.creep = true; }
    }

    // ================================================================ взаимодействие (E)
    api.interactions.register('li.rooms', {
      priority: 5,
      test(h) {
        for (const sp of spots.values()) {
          if (sp.pos.distanceTo(h.point) > (sp.kind === 'painting' ? .75 : .55)) continue;
          if (sp.kind === 'phone') {
            if (PHONE.ring && PHONE.ring.key === sp.key) return { text: 'E — снять трубку', run: () => answer(sp) };
            return { text: 'Телефон. Гудка нет.', run() { A.click(); api.say(stage() >= 2 ? 'В трубке кто-то молчит. Совсем рядом.' : 'Тишина в трубке. Даже без гудка.', 2.5); } };
          }
          if (sp.kind === 'tv') {
            const st = tvState(sp.key), ch = CH[st.ch];
            const label = { off: 'включить телевизор', static: 'переключить канал', bars: 'переключить канал', msg: 'выключить телевизор' }[ch];
            return { text: `E — ${label}`, run() { st.ch = (st.ch + 1) % CH.length; if (CH[st.ch] === 'msg') st.msg++; A.click(); applyTv(sp); api.quest.count('rooms:tv'); if (CH[st.ch] === 'msg' && stage() >= 2) dropSan(3); } };
          }
          if (sp.kind === 'painting') {
            const seen = (api.data.paint ||= {})[lvKey(sp.key)];
            return { text: 'E — рассмотреть картину', run() {
              api.quest.count('rooms:painting');
              if (sp.v >= 1) { dropSan(sp.v === 2 ? 6 : 3); E.addPanic(.12); api.say(sp.v === 2 ? 'У озера стоит человек. Он ближе, чем был. Он смотрит не на озеро.' : 'У самой воды — крошечная тёмная фигурка. Её точно не было.', 4.5); return; }
              if (seen) { api.say('Озеро, горы, ёлки. Ты уже знаешь эту картину наизусть.', 3); return; }
              api.data.paint[lvKey(sp.key)] = 1; ST().sanity = Math.min(100, ST().sanity + 6); api.notes.unlock('r_trees');
              api.say(pick(['Горы, озеро, пушистые облака. В углу подпись и приписка карандашом: «счастливые деревца».', 'Мягкий пейзаж. Мазки уверенные и добрые. «Здесь нет ошибок — только счастливые случайности».']), 5);
            } };
          }
        }
        return null;
      },
    });

    // ================================================================ события
    const prints = [], printMat = () => E.zmat('footprint');
    api.events.register('li_footprints', {
      w: () => .35 + stage() * .2,
      run() {
        const fp = E.feetPos(), gx = Math.floor(fp.x / E.CELL), gz = Math.floor(fp.z / E.CELL); let s = null;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = E.wallSlots(gx + dx, gz + dz); if (w.length) { s = pick(w); break; } }
        if (!s) return false;
        const start = V3(s.x + s.nx * 3.2, 0, s.z + s.nz * 3.2); if (E.inView(start.clone().setY(.2), .3) || E.inView(V3(s.x, .2, s.z), .3)) return false;
        const g = new THREE.Group(), geo = new THREE.PlaneGeometry(.16, .3).rotateX(-Math.PI / 2), yaw = Math.atan2(-s.nx, -s.nz);
        for (let i = 0; i < 7; i++) { const t = i / 7, side = i % 2 ? .1 : -.1, x = start.x + (s.x - start.x) * t * .96 + Math.cos(yaw) * side, z = start.z + (s.z - start.z) * t * .96 - Math.sin(yaw) * side; const m = new THREE.Mesh(geo, printMat()); m.position.set(x, E.floorY(x, z) + .006, z); m.rotation.y = yaw; m.userData.noAO = true; g.add(m); }
        E.scene.add(g); prints.push({ g, t: 0, pos: start.clone().lerp(V3(s.x, 0, s.z), .5).setY(.1), told: false });
        return true;
      },
    });
    api.events.register('li_lights_breathe', {
      w: () => [.05, .4, .7, .9][stage()],
      run() {
        const n = E.nearFixtures(14); if (n.length < 3) return false;
        const fp = E.feetPos(); n.sort((a, b) => Math.hypot(a.f.x - fp.x, a.f.z - fp.z) - Math.hypot(b.f.x - fp.x, b.f.z - fp.z));
        n.forEach((o, i) => later(i * .35, () => E.dimFixture(o.f, 1.6, .25)));
        later(1.5, () => api.say(pick(['Свет вокруг медленно вдохнул — и выдохнул.', 'Лампы потускнели по очереди, волной. Как дыхание.']), 3.5)); return true;
      },
    });
    api.events.register('li_name_call', {
      w: () => [0, .08, .45, .7][stage()],
      run() { const p = E.sidePos(rand(14, 22)); p.y = 1.6; A.voice(p); dropSan(3); later(1.4, () => api.say(pick(['Кто-то позвал тебя. По имени.', 'Голос, далеко: твоё имя. Так звала мама.']), 3.5)); return true; },
    });
    function printsUpdate(dt) {
      for (let i = prints.length - 1; i >= 0; i--) {
        const p = prints[i]; p.t += dt;
        if (!p.told && p.pos.distanceTo(E.feetPos()) < 7 && E.inView(p.pos, .7)) { p.told = true; dropSan(2); api.say(pick(['Мокрые следы босых ног. Уходят прямо в стену.', 'Следы. Свежие. Их не было минуту назад.']), 4); }
        if (p.t > 120) { E.scene.remove(p.g); p.g.children[0]?.geometry.dispose(); prints.splice(i, 1); }
      }
      for (let i = stashMarks.length - 1; i >= 0; i--) { const s = stashMarks[i]; if (s.p.distanceTo(E.feetPos()) < 1.6) { api.quest.count('rooms:stash'); E.scene.remove(s.m); stashMarks.splice(i, 1); } }
    }
    api.on('world:clear', () => { stashMarks.splice(0).forEach(s => E.scene.remove(s.m)); PHONE.ring = null; stopVoice(); });

    // ================================================================ цикл, записи, задания
    let slow = 0;
    api.on('update', dt => { phoneUpdate(dt); tvUpdate(dt); printsUpdate(dt); if ((slow -= dt) <= 0) { slow = .5; paintUpdate(); } });
    const N = (id, kind, order, t, b) => api.notes.register(id, { kind, order, t, b });
    N('r_trees', 'lore', 96, 'Подпись на обороте пейзажа', '«Давайте поселим здесь маленькое счастливое деревце. Каждому деревцу нужен друг». Кто-то повесил десятки таких картин в коридорах, где никогда не бывает людей. Возможно, именно поэтому.');
    N('r_phone_self', 'lore', 97, 'Расшифровка звонка (карандашом)', 'Я позвонил сам себе. Трубку снял я. Мы долго молчали. Потом тот, второй, сказал: «Ты опоздал на семнадцать минут». Я не знаю, куда я опоздал. Я не знаю, кто из нас повесил трубку первым.');
    N('r_tv', 'lore', 98, 'Телепрограмма, вырванная из газеты', '03:00 — Настроечная таблица. 03:15 — «Всё в порядке» (повтор). 03:30 — Тишина. 03:45 — Не смотрите. 04:00 — Настроечная таблица.');
    api.quests.chapter('ch_rooms', { title: 'Глава · Голоса', order: 6, desc: 'Здесь есть кому звонить. И кому ответить.' });
    const Q = (id, order, title, desc, check, reward, after = []) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch_rooms' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    Q('q_rooms_call', 50, 'Алло?', 'сними трубку звонящего телефона', cnt('rooms:call', 1), { almond: 1 }, ['q_look']);
    Q('q_rooms_stash', 51, 'Крестик мелом', 'найди тайник, о котором сказали по телефону', cnt('rooms:stash', 1), { battery: 1, photo: 1 }, ['q_rooms_call']);
    Q('q_rooms_paint', 52, 'Счастливые деревца', 'рассмотри пейзаж на стене', cnt('rooms:painting', 1), { tea: 1 }, ['q_look']);
    api.commands.register('ring', { help: 'позвонить на ближайший телефон', run: () => { PHONE.cd = 0; return 'ok'; } });
  },
});
