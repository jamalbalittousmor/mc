// =====================================================================
//  BUILT-IN MOD: «Liminal Industry — основа»
//  Written against the public mod API (same as external mods):
//  salvage, crafting, power, machines, industrial zone & structures, quests.
// =====================================================================
Backrooms.mod({
  id: 'core.industry', name: 'Liminal Industry — основа', version: '4.0', builtin: true, priority: 10,
  description: 'Разбор ламп, крафт, электричество, машины, технический сектор, цепочка заданий.',
  init(api) {
    const { V3, rand, clamp } = api.util, E = api.engine;
    const led = (g, ghost, THREE, x, y, z) => { if (ghost) return; const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .02), new THREE.MeshBasicMaterial({ color: 0x220000 })); m.position.set(x, y, z); m.userData.noAO = true; g.add(m); g.userData.led = m; };
    const setLed = (m, c) => m.piece.obj.userData.led?.material.color.set(c);
    // ---------------- items
    api.items.register('scrap', { name: 'Металлолом', icon: '🔩', stack: 20, desc: 'Обрезки металла, винты, кронштейны. Основа любой техники.', mesh: ['box', [.14, .04, .1], 0x7a7670], loot: .08, lootZones: { industrial: 3, office: 1.4 } });
    api.items.register('fuel', { name: 'Канистра топлива', icon: '⛽', stack: 4, desc: 'Около литра бензина. Генератор проработает ~6 минут.', mesh: ['box', [.16, .2, .08], 0xa83a24], loot: .02, lootZones: { industrial: 5, dark: 1.6 } });
    api.items.register('bandage', { name: 'Бинт', icon: '🩹', stack: 6, desc: 'Самодельная повязка. +30 здоровья.', use: { health: 30, sanity: 3 }, useText: 'Повязка затянута. Боль понемногу отступает.', sound: 'cloth', mesh: ['box', [.08, .03, .08], 0xe8e2d6] });
    api.items.register('filter', { name: 'Фильтр', icon: '🧻', stack: 6, desc: 'Ткань и металл. Нужен для дистиллятора.', mesh: ['cyl', [.05, .08], 0xd8d0b8] });
    api.items.register('circuit', { name: 'Плата', icon: '📟', stack: 6, desc: 'Спаянная из проводов и лампочки схема управления.', mesh: ['box', [.12, .012, .08], 0x2f6a3a], loot: .006, lootZones: { industrial: 4, office: 2 } });
    api.items.register('backpack', { name: 'Самодельный рюкзак', icon: '🎒', stack: 1, desc: 'Сшит из ткани, лямки — из провода. Надень (ПКМ), чтобы получить ещё 10 ячеек.', mesh: ['box', [.3, .36, .14], 0x5a4a32],
      onUse(a) { if (E.inv.bag) { api.say('Второй рюкзак уже не надеть.', 2.5); return false; } E.inv.setBag(1); api.audio.cloth(1); api.say('Рюкзак сел на плечи. Места стало больше.', 3); return true; } });
    // ---------------- recipes
    const RC = (id, out, inn, station) => api.recipes.register(id, { out, in: inn, station });
    RC('bandage', { bandage: 1 }, { cloth: 1 });
    RC('filter', { filter: 1 }, { cloth: 1, scrap: 1 });
    RC('backpack', { backpack: 1 }, { cloth: 4, wire: 2 });
    RC('wire', { wire: 1 }, { scrap: 2 }, 'workbench');
    RC('panel', { panel: 2 }, { scrap: 3 }, 'workbench');
    RC('plank', { plank: 1 }, { scrap: 2 }, 'workbench');
    RC('circuit', { circuit: 1 }, { wire: 2, bulb: 1 }, 'workbench');
    RC('battery', { battery: 1 }, { scrap: 1, wire: 1, almond: 1 }, 'workbench');
    // ---------------- build pieces / machines
    const B = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
    api.build.register('workbench', { name: 'Верстак', cost: { plank: 3, scrap: 2 }, snap: .25, station: 'workbench',
      boxes: [B(-.7, .82, -.35, .7, .9, .35, 'wood'), B(-.66, 0, -.31, -.58, .82, -.23, 'metal'), B(.58, 0, -.31, .66, .82, -.23, 'metal'), B(-.66, 0, .23, -.58, .82, .31, 'metal'), B(.58, 0, .23, .66, .82, .31, 'metal'), B(-.62, .25, -.3, .62, .29, .3, 'wood')] });
    api.machines.register('generator', {
      name: 'Генератор', power: 1, range: 14, state: { fuel: 0, on: false },
      build: { cost: { scrap: 4, circuit: 1, wire: 2 }, snap: .25, boxes: [B(-.5, 0, -.32, .5, .62, .32, 'metal'), B(-.42, .62, -.2, .1, .78, .2, 'metal'), B(.2, .62, -.06, .32, .9, .06, 'metal')], visual: (g, gh, T) => led(g, gh, T, .3, .45, .33) },
      producing: m => m.state.on && m.state.fuel > 0,
      tick(m, dt) {
        const run = m.state.on && m.state.fuel > 0;
        if (run) { m.state.fuel = Math.max(0, m.state.fuel - dt); m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = .5; api.audio.motor(m.pos, .9); } E.dir.attention = clamp(E.dir.attention + dt * .0015, 0, 1); if (m.state.fuel <= 0) { api.say('Генератор чихнул и заглох.', 3); api.audio.powerDown(); } }
        setLed(m, run ? 0x40ff60 : m.state.on ? 0xff4020 : 0x220000);
      },
      prompt: m => `E — генератор: ${api.inv.count('fuel') && m.state.fuel < 600 ? 'заправить' : m.state.on ? 'выключить' : 'включить'} · топливо ${Math.round(m.state.fuel)} с`,
      interact(m) {
        if (api.inv.count('fuel') && m.state.fuel < 600) { api.inv.take('fuel', 1); m.state.fuel += 360; api.audio.gulp(); api.say('Топливо залито.', 2); return; }
        if (m.state.fuel <= 0) { api.say('Нет топлива. Нужна канистра.', 2); api.audio.click(); return; }
        m.state.on = !m.state.on; api.audio[m.state.on ? 'powerUp' : 'click'](); if (m.state.on) api.quest.count('generator');
      },
    });
    const powered = m => api.power.at(m.pos) > 0;
    const nearWater = p => { const gx = Math.floor(p.x / E.CELL), gz = Math.floor(p.z / E.CELL); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (E.isPool(gx + dx, gz + dz)) return true; return !!E.zoneAt(p.x, p.z).flood; };
    api.machines.register('distiller', {
      name: 'Дистиллятор', state: { water: 0, t: 0 },
      build: { cost: { scrap: 3, filter: 1, wire: 1 }, snap: .25, boxes: [B(-.3, 0, -.3, .3, .9, .3, 'metal'), B(-.12, .9, -.12, .12, 1.25, .12, 'metal')], visual: (g, gh, T) => led(g, gh, T, 0, .7, .31) },
      tick(m, dt) {
        const ok = powered(m) && nearWater(m.pos);
        if (ok && m.state.water < 5) { m.state.t += dt; if (m.state.t >= 40) { m.state.t = 0; m.state.water++; api.audio.drip(m.pos); } }
        setLed(m, !powered(m) ? 0x220000 : ok ? 0x40a0ff : 0xffa020);
      },
      prompt: m => `E — дистиллятор: воды ${m.state.water}/5` + (!powered(m) ? ' · нет питания' : !nearWater(m.pos) ? ' · нужен бассейн или затопленный пол рядом' : ` · ${Math.round(40 - m.state.t)} с`),
      interact(m) { if (!m.state.water) { api.audio.click(); return; } const n = m.state.water; m.state.water = 0; const left = api.inv.add('water', n); if (left) m.state.water = left; api.audio.pickup(); api.quest.count('distill', n - left); },
    });
    api.machines.register('charger', {
      name: 'Зарядная станция',
      build: { cost: { scrap: 2, circuit: 1, wire: 1 }, snap: .25, boxes: [B(-.25, 0, -.15, .25, 1.1, .15, 'metal')], visual: (g, gh, T) => led(g, gh, T, 0, .9, .16) },
      tick(m) { setLed(m, powered(m) ? 0x40ff60 : 0x220000); },
      prompt: m => powered(m) ? `E — зарядить фонарик (${Math.round(E.player.flash.battery * 100)}%)` : 'Зарядная станция · нет питания (нужен генератор рядом)',
      interact(m) { if (!powered(m)) { api.audio.click(); return; } E.player.flash.battery = 1; api.audio.beep(m.pos); api.say('Фонарик заряжен.', 2); api.quest.count('charge'); },
    });
    api.machines.register('elamp', {
      name: 'Прожектор',
      build: { cost: { scrap: 1, wire: 1, bulb: 1 }, snap: .05, lamp: true, boxes: [B(-.2, 0, -.2, .2, .05, .2, 'metal'), B(-.03, .05, -.03, .03, 1.45, .03, 'metal')] },
      init(m) { if (m.piece.light) { m.piece.light.boost = 2.2; m.piece.light.color = 0xeaf2ff; } },
      tick(m) { if (m.piece.light) m.piece.light.on = m.state.off ? false : powered(m); },
      prompt: m => `E — прожектор: ${m.state.off ? 'включить' : 'выключить'}${powered(m) ? '' : ' · нет питания'}`,
      interact(m) { m.state.off = !m.state.off; api.audio.click(); },
    });
    // ---------------- salvage ceiling fixtures (makes the place darker!)
    api.interactions.register('salvage', {
      priority: 5,
      test(h) {
        if (h.normal.y > -.7) return null;
        const gx = Math.floor(h.point.x / E.CELL), gz = Math.floor(h.point.z / E.CELL), f = E.fixtureAt(gx, gz);
        if (!f || E.salvaged.has(f.key) || Math.hypot(h.point.x - f.x, h.point.z - f.z) > .9) return null;
        return { text: f.broken ? 'E — выдрать разбитый светильник (провод, металл)' : 'E — выкрутить лампу (здесь станет темнее)', run() {
          E.salvaged.add(f.key);
          if (!f.broken) { if (!f.flicker) E.setFixtureOff(f, true, true); else E.deadFixtures.add(f.key); api.inv.add('bulb', 1); api.audio.pop(V3(f.x, f.y, f.z)); }
          api.inv.add('wire', 1); api.inv.add('scrap', 1 + (Math.random() < .4 ? 1 : 0)); api.audio.crack(V3(f.x, f.y, f.z));
          E.dir.attention = clamp(E.dir.attention + .08, 0, 1); E.player.noise += .2; api.quest.count('salvage');
          api.say(f.broken ? 'Ты выдрал остатки светильника.' : 'Лампа у тебя. Вокруг стало темнее.', 3);
        } };
      },
    });
    // ---------------- industrial zone + structures
    api.zones.register('industrial', { name: 'Технический сектор', roomTone: .6, H: 3.6, wallK: 'concrete', floorK: 'concrete', ceilK: 'ceilC', noBase: true, fix: 'tube', haze: 0x50585c, roomTypes: [['storage', 5], ['empty', 3]], wallP: .26, doorP: .55, halfP: .14, lowP: 0, pillarP: .45, pillarS: .55, lightP: .5, brokenP: .25, flickerP: .1, color: 0xeef4ff, mat: 'yellow', tint: 0xc8c4b0, carpet: 0x77736a, fog: [0x09090a, .045], reverb: .7, weight: .06 });
    const shelf = (ctx, c, api) => {
      const r = c.rng, alongX = r() < .5, len = 1.6, d = .45, h = 1.9, x = c.mx + (alongX ? 0 : (r() < .5 ? -1 : 1) * 1.2), z = c.mz + (alongX ? (r() < .5 ? -1 : 1) * 1.2 : 0);
      const hx = alongX ? len / 2 : d / 2, hz = alongX ? d / 2 : len / 2, M = ctx.gb('metal');
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box(x + sx * hx - .025, 0, z + sz * hz - .025, x + sx * hx + .025, h, z + sz * hz + .025);
      for (const y of [.12, .75, 1.38]) { M.box(x - hx, y, z - hz, x + hx, y + .04, z + hz); }
      ctx.colBox(x - hx, 0, z - hz, x + hx, h, z + hz);
      let i = 0; for (const y of [.16, .79, 1.42]) if (r() < .55) ctx.spawn(lootPick(ctx.zone, r()), V3(x + (r() - .5) * hx, y + .1, z + (r() - .5) * hz), c.key(i++));
    };
    // захламление — только там, где оно уместно (склад/техзона/офис), в «Лобби» и коридорах — пусто
    api.structures.register('shelves', { zones: ['office', 'industrial', 'dark', 'electrical', 'garage'], chance: z => z.key === 'industrial' ? .1 : .012, salt: 7301, cell: (ctx, c, a) => ctx.furn('shelf', 'стеллаж', `sh:${c.gx},${c.gz},${ctx.vr}`, () => shelf(ctx, c, a)) });
    api.structures.register('genroom', { chance: z => z.key === 'industrial' ? .02 : z.key === 'pools' || z.key === 'lobby' ? 0 : .003, salt: 7302, cell(ctx, c) {
      const r = c.rng, M = ctx.gb('metal'), x = c.mx, z = c.mz;
      M.box(x - .6, 0, z - .35, x + .6, .7, z + .35); M.box(x - .5, .7, z - .25, x + .1, .85, z + .25); ctx.colBox(x - .6, 0, z - .35, x + .6, .85, z + .35);
      ctx.spawn('fuel', V3(x + .9, .2, z + .3), c.key(0)); if (r() < .6) ctx.spawn('fuel', V3(x + .9, .2, z - .3), c.key(1));
      ctx.spawn('scrap', V3(x - .9, .1, z), c.key(2)); if (r() < .5) ctx.spawn('circuit', V3(x, .95, z), c.key(3));
    } });
    api.structures.register('crates', { zones: ['industrial', 'dark', 'garage', 'void', 'office'], chance: z => z.key === 'industrial' ? .03 : .006, salt: 7303, cell(ctx, c) {
      const r = c.rng;
      for (let i = 0; i < 2 + (r() * 3 | 0); i++) { const s = .35 + r() * .1, px = c.mx + (r() - .5) * 2, pz = c.mz + (r() - .5) * 2, y = 0; ctx.furn('crate', 'ящик', `cr:${c.gx},${c.gz},${i},${ctx.vr}`, () => { ctx.gb('crate').boxUnit(px - s, y, pz - s, px + s, y + s * 2, pz + s); ctx.colBox(px - s, y, pz - s, px + s, y + s * 2, pz + s); }); if (r() < .5) ctx.spawn(r() < .5 ? 'plank' : r() < .5 ? 'cloth' : 'scrap', V3(px, s * 2 + .15, pz), c.key(i)); }
    } });
    // ---------------- quest chain
    let picked = 0; api.on('item:pickup', () => api.quest.count('pickup'));
    api.quests.chapter('ch1', { title: 'Глава 1 · Выжить', order: 1, desc: 'Осмотреться, найти свет, устроить свой угол.' });
    api.quests.chapter('ch2', { title: 'Глава 2 · Мастерская', order: 2, desc: 'Верстак, крафт и первое электричество.' });
    const CH = { q_look: 'ch1', q_salvage: 'ch1', q_shelter: 'ch1', q_notes: 'ch1', q_exit: 'ch1', q_bench: 'ch2', q_craft: 'ch2', q_power: 'ch2', q_water: 'ch2' };
    const Q = (id, order, title, desc, check, reward, after = []) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: CH[id] });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    Q('q_look', 1, 'Осмотреться', 'подбери 3 любых предмета', cnt('pickup', 3), { almond: 1 });
    Q('q_salvage', 2, 'Добыча', 'выкрути лампу из потолка (E, смотри вверх на светильник)', cnt('salvage', 1), { scrap: 2 }, ['q_look']);
    Q('q_shelter', 3, 'Свой угол', 'построй убежище: 3 стены рядом и свет (B)', () => E.player.inShelter, { cloth: 1, bulb: 1 }, ['q_salvage']);
    Q('q_bench', 4, 'Мастерская', 'построй верстак (B)', () => [...E.pieces].some(p => p.def.id === 'workbench'), { wire: 1, scrap: 2 }, ['q_shelter']);
    Q('q_craft', 5, 'Ремесло', 'скрафти что-нибудь у верстака (Tab → крафт)', cnt('craft:workbench', 1), { scrap: 3 }, ['q_bench']);
    Q('q_notes', 6, 'Чужие следы', 'найди 3 записки «К.»', () => ({ n: Math.min(3, E.game.notes.length), of: 3 }), { pills: 1 }, ['q_look']);
    Q('q_power', 7, 'Электричество', 'построй генератор и запусти его (нужно топливо)', cnt('generator', 1), { fuel: 1 }, ['q_craft']);
    Q('q_water', 8, 'Чистая вода', 'поставь дистиллятор у воды рядом с генератором и получи воду', cnt('distill', 1), { almond: 2 }, ['q_power']);
    Q('q_exit', 9, 'Наружу?', 'дойди до двери «ВЫХОД»', cnt('exit', 1), null, ['q_notes']);
    api.on('level:exit', () => api.quest.count('exit'));
    api.commands.register('power', { help: 'мощность в точке игрока', run: () => String(api.power.at(E.feetPos())) });
  },
});

