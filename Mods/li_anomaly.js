// =====================================================================
//  Liminal Industry · «Аномалии»
//  Статика, эхо и осадок; компас тонких мест; стабилизатор рассудка;
//  банки статики; Резонансные врата — построенный выход. Глава 6.
// =====================================================================
Backrooms.mod({
  id: 'li.anomaly', name: 'Liminal Industry · Аномалии', version: '1.0.0',
  requires: ['li.industry@>=1.0'],
  description: 'Собирай статику мерцающих ламп, застывшее эхо и осадок. Компас тонких мест, стабилизатор, банки статики и Резонансные врата наружу. Глава 6.',
  init(api) {
    const { V3, clamp, pick } = api.util, E = api.engine, THREE = api.THREE;
    const P = api.require('li.proc');
    const B = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
    const I = (id, d) => api.items.register(id, d);
    I('jar', { name: 'Пустая банка', icon: '🫙', stack: 6, desc: 'Стеклянная банка с металлической крышкой. Подходит для того, что нельзя взять руками.', mesh: ['cyl', [.05, .1], 0xbfdfe8] });
    I('staticjar', { name: 'Банка статики', icon: '⚡', stack: 6, desc: 'Внутри потрескивает голубоватый туман. Собрана у мерцающей лампы. Источник энергии и настройки.', mesh: ['cyl', [.05, .1], 0x7ab8ff] });
    I('echo', { name: 'Застывшее эхо', icon: '🌀', stack: 6, desc: 'Кусочек звука, который не долетел. Если поднести к уху — слышно твоё же дыхание с опозданием.', mesh: ['box', [.07, .07, .07], 0xb8a0ff] });
    I('residue', { name: 'Осадок', icon: '🫧', stack: 6, desc: 'Тяжёлая жёлтая муть со дна бассейнов и пустот. Тянет вниз сильнее, чем должна.', mesh: ['cyl', [.05, .1], 0xc8b040] });
    I('compass', { name: 'Компас тонких мест', icon: '🧭', stack: 1, desc: 'Используй — стрелка покажет, где реальность тоньше всего. Там можно построить врата.', mesh: ['cyl', [.06, .02], 0xc08a40],
      onUse() { compassUse(); return false; } });
    api.recipes.register('jar', { out: { jar: 1 }, in: { glass: 2, scrap: 1 }, station: 'workbench' });
    api.recipes.register('compass', { out: { compass: 1 }, in: { lens: 1, staticjar: 1, circuit: 1, alloy: 1 }, station: 'assembler' });
    const give = P.give;
    // ---------------- static: мерцающие лампы
    api.interactions.register('li.static', {
      priority: 6,
      test(h) {
        if (h.normal.y > -.7 || !api.inv.count('jar')) return null;
        const f = E.fixtureAt(Math.floor(h.point.x / E.CELL), Math.floor(h.point.z / E.CELL));
        if (!f || !f.flicker || f.broken || E.salvaged.has(f.key) || Math.hypot(h.point.x - f.x, h.point.z - f.z) > 1) return null;
        const k = 'st:' + f.key, used = api.data.static ||= {};
        if ((used[k] || 0) > E.game.playT) return { text: 'Лампа выдохлась. Статика вернётся позже.', run() { api.audio.click(); } };
        const pos = V3(f.x, f.y, f.z);
        return { text: 'Удерживай E — собрать статику в банку', hold: 4, holdKey: k, onHoldTick: () => { if (Math.random() < .08) api.audio.crackle(pos, .3); E.player.st.sanity -= .01; }, run() {
          if (!api.inv.take('jar', 1)) return; give('staticjar', 1); used[k] = E.game.playT + 240; api.audio.humBurst(pos); E.flickerFixture?.(f, 1.5);
          E.dir.attention = clamp(E.dir.attention + .06, 0, 1); api.quest.count('li.static'); api.notes.unlock('g_li_anomaly'); api.say('Банка гудит в ладони.', 2.5);
        } };
      },
    });
    // ---------------- residue: дно бассейнов, затопленные и тёмные зоны
    api.interactions.register('li.residue', {
      priority: 2,
      test(h) {
        if (h.normal.y < .7 || !api.inv.count('jar') || h.dist > 2.2) return null;
        const gx = Math.floor(h.point.x / E.CELL), gz = Math.floor(h.point.z / E.CELL), z = E.zoneAt(h.point.x, h.point.z);
        if (!(E.isPool(gx, gz) || z.flood || z.key === 'void' || z.key === 'pipes')) return null;
        const k = 'rs:' + gx + ',' + gz; if (E.salvaged.has(k)) return null;
        return { text: 'Удерживай E — зачерпнуть осадок', hold: 3, holdKey: k, onHoldTick: () => { if (Math.random() < .05) api.audio.drip(h.point); }, run() { if (!api.inv.take('jar', 1)) return; E.salvaged.add(k); give('residue', 1); api.audio.splash?.(h.point); api.quest.count('li.residue'); api.notes.unlock('g_li_anomaly'); } };
      },
    });
    // ---------------- echo: остаётся после событий
    api.on('director:event', () => {
      if (Math.random() > .35 || E.player.dead) return;
      setTimeout(() => {
        const d = E.camera.getWorldDirection(V3()).setY(0).normalize(), p = E.feetPos().addScaledVector(d, -2.5 - Math.random() * 2); p.y = 1.2;
        const it = E.spawnItem('echo', p); if (it) { api.audio.whisper(p); api.say('Позади что-то повисло в воздухе — там, где был звук.', 3.5); }
      }, 1500 + Math.random() * 2000);
    });
    // ---------------- thin places (детерминированно от уровня)
    const isThin = (gx, gz) => Math.hypot(gx, gz) * E.CELL > 45 && api.util.hash3(gx, gz, 9907 + (E.game.level || 1) * 13) < .0035 && !E.isPool(gx, gz) && !E.isExitCell?.(gx, gz);
    function nearestThin(p, R = 70) {
      const cx = Math.floor(p.x / E.CELL), cz = Math.floor(p.z / E.CELL); let best = null, bd = 1e9;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dz * dz > R * R) continue; const gx = cx + dx, gz = cz + dz; if (!isThin(gx, gz)) continue; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = V3((gx + .5) * E.CELL, 0, (gz + .5) * E.CELL); } }
      return best;
    }
    const spots = new Map(), ringMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false }), moteMat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: .7 });
    api.structures.register('li.thin', {
      chunk(ctx) {
        for (let lz = 0; lz < E.CN; lz++) for (let lx = 0; lx < E.CN; lx++) {
          const gx = ctx.cx * E.CN + lx, gz = ctx.cz * E.CN + lz; if (!isThin(gx, gz) || !ctx.free(gx, gz)) continue; ctx.claim(gx, gz);
          const x = (gx + .5) * E.CELL, z = (gz + .5) * E.CELL, g = new THREE.Group();
          const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1.15, 40).rotateX(-Math.PI / 2), ringMat); ring.position.set(x, .012, z); ring.userData.noAO = true; g.add(ring);
          const motes = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.015, .015, .015), moteMat); m.userData = { noAO: true, a: Math.random() * 6.28, r: .2 + Math.random() * .9, h: .3 + Math.random() * 2, s: .2 + Math.random() * .5 }; m.position.set(x, 1, z); g.add(m); motes.push(m); }
          ctx.add(g); spots.set(gx + ',' + gz, { x, z, motes, g, ch: ctx.cx + ',' + ctx.cz });
        }
      },
    });
    api.on('chunk:unload', ch => { for (const [k, s] of spots) if (s.ch === ch.key) spots.delete(k); });
    api.on('world:clear', () => spots.clear());
    api.on('update', dt => {
      const t = E.game.playT || 0, fp = E.feetPos();
      for (const s of spots.values()) {
        const d = Math.hypot(fp.x - s.x, fp.z - s.z); if (d > 30) continue;
        for (const m of s.motes) { const u = m.userData; m.position.set(s.x + Math.cos(u.a + t * u.s) * u.r, u.h + Math.sin(t * u.s * 2 + u.a) * .15, s.z + Math.sin(u.a + t * u.s) * u.r); }
        if (d < 2.5 && !stabNear(fp)) { E.player.st.sanity = Math.max(0, E.player.st.sanity - dt * .25); if (!api.data.foundThin) { api.data.foundThin = true; api.quest.count('li.thin'); api.say('Воздух здесь звенит. Как будто стена мира тоньше бумаги.', 4); } }
      }
    });
    const dirWord = (v) => { const f = E.camera.getWorldDirection(V3()).setY(0).normalize(), a = Math.atan2(v.x * f.z - v.z * f.x, v.x * f.x + v.z * f.z), i = Math.round(a / (Math.PI / 4)); return ['↑ прямо', '↖ влево-вперёд', '← влево', '↙ влево-назад', '↓ позади', '↘ вправо-назад', '→ вправо', '↗ вправо-вперёд'][((-i % 8) + 8) % 8]; };
    function compassUse() {
      const fp = E.feetPos(), t = nearestThin(fp); api.audio.ring?.(fp);
      if (!t) { api.say('Стрелка лениво вращается. Тонких мест поблизости нет — уйди дальше от начала уровня.', 4); return; }
      const v = t.clone().sub(fp).setY(0), d = v.length();
      api.say(d < 2.5 ? 'Стрелка смотрит вниз. Ты стоишь на тонком месте.' : `Стрелка дрожит: тонкое место ${dirWord(v)}, ~${Math.round(d)} м.`, 5);
      api.quest.count('li.compass');
    }
    // ---------------- stabilizer (рассудок)
    const stabNear = p => { for (const m of E.Machines.list) if (m.def.id === 'stabilizer' && !m.state.off && m.pos.distanceTo(p) < 7 && api.power.at(m.pos) >= 1) return true; return false; };
    api.machines.register('stabilizer', {
      name: 'Стабилизатор', state: { off: false },
      build: { cost: { alloy: 1, lens: 1, circuit: 1, staticjar: 1 }, snap: .25, boxes: [B(-.25, 0, -.25, .25, .2, .25, 'metal'), B(-.06, .2, -.06, .06, 1.3, .06, 'metal'), B(-.2, 1.3, -.2, .2, 1.4, .2, 'glass')], visual: (g, gh) => P.led(g, gh, 0, .15, .26) },
      tick(m, dt) { const on = !m.state.off && api.power.at(m.pos) >= 1; P.setLed(m, on ? 0x7ab8ff : 0x220000); if (on && E.feetPos().distanceTo(m.pos) < 7) { E.player.st.sanity = Math.min(100, E.player.st.sanity + dt * .18); E.dir.attention = Math.max(0, E.dir.attention - dt * .002); m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = 4; api.audio.humBurst(m.pos); } } },
      prompt: m => `E — стабилизатор: ${m.state.off ? 'включить' : 'выключить'}` + (api.power.at(m.pos) >= 1 ? ' · поле 7 м держит рассудок' : ' · нужно питание 1'),
      interact(m) { m.state.off = !m.state.off; api.audio.click(); if (!m.state.off) api.quest.count('li.stab'); },
    });
    // ---------------- static bank (источник 2)
    api.machines.register('staticbank', {
      name: 'Банка статики (батарея)', power: 2, range: 10, state: { charge: 0 },
      build: { cost: { steel: 2, alloy: 1, wire: 2 }, snap: .25, boxes: [B(-.35, 0, -.25, .35, .9, .25, 'metal'), B(-.3, .9, -.2, .3, .95, .2, 'glass')], visual: (g, gh) => P.led(g, gh, 0, .7, .26) },
      producing: m => m.state.charge > 0,
      tick(m, dt) { if (m.state.charge > 0) { m.state.charge = Math.max(0, m.state.charge - dt); m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = 1.5; api.audio.crackle(m.pos, .3); } } P.setLed(m, m.state.charge > 0 ? 0x7ab8ff : 0x220000); },
      prompt: m => `E — батарея статики: заряд ${Math.round(m.state.charge)} с` + (api.inv.count('staticjar') ? ' · вставить банку (+240 с)' : ' · нужна банка статики'),
      interact(m) { if (m.state.charge < 900 && api.inv.take('staticjar', 1)) { m.state.charge += 240; give('jar', 1); api.audio.powerUp(); api.quest.count('li.bank'); } else api.audio.click(); },
    });
    // ---------------- Resonance gate
    const GATE_POWER = 4;
    api.machines.register('gate', {
      name: 'Резонансные врата', state: { tune: 0, t: 0, on: false },
      build: { cost: { alloy: 4, motor: 2, lens: 2, cblock: 4, echo: 3, residue: 3 }, snap: .25,
        boxes: [B(-1.3, 0, -.3, -1, 2.8, .3, 'metal'), B(1, 0, -.3, 1.3, 2.8, .3, 'metal'), B(-1.3, 2.8, -.3, 1.3, 3.05, .3, 'metal'), B(-1.4, 0, -.45, 1.4, .12, .45, 'concrete')],
        visual(g, ghost) { if (ghost) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.7), new THREE.MeshBasicMaterial({ color: 0x0a0a12, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.position.set(0, 1.42, 0); m.userData.noAO = true; g.add(m); g.userData.veil = m; } },
      tick(m, dt) {
        const s = m.state, veil = m.piece.obj.userData.veil;
        if (veil) veil.material.opacity = s.on ? .4 + .5 * Math.min(1, s.t / 45) + Math.sin(E.game.playT * 7) * .05 : s.tune / 3 * .25;
        if (!s.on) return;
        const fp = E.feetPos();
        if (fp.distanceTo(m.pos) > 14 || api.power.at(m.pos) < GATE_POWER) { s.on = false; s.t = 0; api.audio.powerDown(); api.say('Резонанс сорвался. Врата снова просто железо.', 4); return; }
        s.t += dt; E.dir.attention = 1; E.player.st.sanity = Math.max(5, E.player.st.sanity - dt * .35);
        m.ev = (m.ev || 0) - dt; if (m.ev <= 0) { m.ev = 7 + Math.random() * 5; try { E.runEvent(pick(Object.keys(E.EVENTS))); } catch (e) {} }
        m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = Math.max(.3, 2 - s.t / 30); api.audio.humBurst(m.pos); }
        if (s.t > 25 && Math.random() < dt * .5) E.addPanic?.(.08);
        if (s.t >= 45 && fp.distanceTo(m.pos) < 3) { s.on = false; api.quest.count('li.gate'); api.escape('Врата вздыхают, и гул обрывается на полуслове — впервые за всё время. Ты делаешь шаг сквозь мутную плёнку и чувствуешь холод: настоящий, уличный.'); }
      },
      prompt(m) {
        const s = m.state, thin = nearestThin(m.pos, 2), pw = api.power.at(m.pos);
        if (!thin || Math.hypot(thin.x - m.pos.x, thin.z - m.pos.z) > 3) return 'Резонансные врата · стоят не на тонком месте (используй компас)';
        if (s.on) return s.t >= 45 ? 'Врата открыты — подойди вплотную' : `Резонанс ${Math.floor(s.t / 45 * 100)}% · не отходи дальше 14 м`;
        if (s.tune < 3) return `E — настроить врата: банки статики ${s.tune}/3`;
        if (pw < GATE_POWER) return `Врата настроены · нужно питание ${GATE_POWER} (сейчас ${pw.toFixed(1)})`;
        return { text: 'Удерживай E — запустить резонанс', hold: 5, holdKey: 'gate', onHoldTick: () => { if (Math.random() < .1) api.audio.crackle(m.pos, .4); }, run() { s.on = true; s.t = 0; api.audio.powerUp(); api.say('Пол вибрирует. Свет вокруг начинает дышать. Продержись.', 5); api.quest.count('li.gateOn'); } };
      },
      interact(m) { const s = m.state; if (s.tune < 3 && api.inv.take('staticjar', 1)) { s.tune++; give('jar', 1); api.audio.humBurst(m.pos); } else api.audio.click(); },
    });
    // ---------------- notes & guide
    api.notes.register('g_li_anomaly', { kind: 'guide', order: 33, t: 'Руководство: аномалии', b: 'Аномальные материалы собираются в <b>пустые банки</b> (стекло + металлолом на верстаке):<br>• <b>Статика</b> — у <b>мерцающей</b> лампы, удерживая E. Лампа «выдыхается» на несколько минут.<br>• <b>Осадок</b> — со дна бассейнов, в затопленных зонах, в пустоте и трубах.<br>• <b>Застывшее эхо</b> само остаётся в воздухе после странных событий — оглянись.<br><br><b>Компас</b> (сборщик) показывает <b>тонкое место</b>. Там можно построить <b>Резонансные врата</b>: настрой их тремя банками статики, дай питание 4 и продержись 45 секунд рядом.<br><b>Стабилизатор</b> держит рассудок, <b>батарея статики</b> даёт питание 2.' });
    [['li_a1', 'Журнал «К.» (последний)', 'Я нашёл место, где стрелка смотрит вниз. Воздух там звенит. Если поставить раму и накачать её током — плёнка становится тоньше. Я почти успел. Если читаешь это — дострой.'],
     ['li_a2', 'Бланк M.E.G. «Резонанс»', '«Протокол 7: запуск резонансных конструкций без санкции запрещён. Объект перестаёт быть объектом через 45 ± 5 секунд. Наблюдатель — тоже». Внизу кто-то дописал: «и уходит домой?»'],
     ['li_a3', 'Наклейка на банке', '«СТАТИКА. Не открывать в темноте. Не слушать. Не отвечать, если позовёт по имени».']].forEach(([id, t, b], i) => api.notes.register(id, { kind: 'lore', order: 70 + i, t, b }));
    // ---------------- quests · глава 6
    api.quests.chapter('ch6', { title: 'Глава 6 · Наружу', order: 6, desc: 'Настоящий выход не находят. Его строят.' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    const has = id => () => [...E.pieces].some(p => p.def.id === id);
    const Q = (id, order, title, desc, check, reward, after) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch6' });
    Q('q_li_jar', 50, 'Тара', 'сделай пустую банку', () => api.inv.count('jar') > 0 || E.Quests.get('li.static') > 0, { glass: 1 }, ['q_li_crush']);
    Q('q_li_static', 51, 'Пойманный ток', 'собери статику у мерцающей лампы', cnt('li.static', 1), { jar: 1 }, ['q_li_jar']);
    Q('q_li_res', 52, 'Муть', 'зачерпни осадок (бассейны, затопленные зоны)', cnt('li.residue', 1), { jar: 1 }, ['q_li_jar']);
    Q('q_li_echo', 53, 'Эхо', 'подбери застывшее эхо', () => api.inv.count('echo') > 0 || has('gate')(), null, ['q_li_static']);
    Q('q_li_stab', 54, 'Ясная голова', 'построй и включи стабилизатор', has('stabilizer'), { pills: 1 }, ['q_li_static', 'q_li_alloy']);
    Q('q_li_bank', 55, 'Батарея', 'зарядите батарею статики', cnt('li.bank', 1), { staticjar: 1 }, ['q_li_static', 'q_li_alloy']);
    Q('q_li_compass', 56, 'Стрелка', 'сделай компас и найди тонкое место', cnt('li.thin', 1), { residue: 1 }, ['q_li_alloy', 'q_li_static']);
    Q('q_li_gate', 57, 'Врата', 'построй Резонансные врата на тонком месте', has('gate'), null, ['q_li_compass']);
    Q('q_li_escape', 58, 'Наружу', 'настрой врата, дай питание 4 и продержись 45 секунд', cnt('li.gate', 1), null, ['q_li_gate']);
    api.commands.register('thin', { help: 'ближайшее тонкое место', run: () => { const t = nearestThin(E.feetPos()); return t ? `${t.x.toFixed(1)} ${t.z.toFixed(1)}` : 'нет'; } });
  },
});
