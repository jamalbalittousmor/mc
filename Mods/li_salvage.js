// =====================================================================
//  Liminal Industry · «Разборка»
//  Мебель, обои, ковролин и потолочная плитка разбираются на материалы
//  (удерживай E). Инструменты ускоряют работу и открывают сложные цели.
// =====================================================================
Backrooms.mod({
  id: 'li.salvage', name: 'Liminal Industry · Разборка', version: '1.0.0',
  requires: ['core.industry@>=1.0'],
  description: 'Удержанием E разбирай мебель, сдирай обои и ковролин, снимай потолочную плитку. Лом, нож и отвёртка. Глава 3 заданий.',
  init(api) {
    const { V3, clamp, rand } = api.util, E = api.engine, THREE = api.THREE;
    const cfg = api.settings({ surfaces: true, speed: 1 }, { schema: {
      surfaces: { label: 'Разбор стен, пола и потолка', help: 'Показывать подсказку «содрать обои» и т.п.' },
      speed: { label: 'Скорость разборки', min: .5, max: 3, step: .25 },
    } });
    // ---------------- materials
    const I = (id, d) => api.items.register(id, d);
    I('paper', { name: 'Бумага', icon: '📄', stack: 20, desc: 'Обрывки обоев и бумаг. Растопка для печи.', mesh: ['box', [.14, .01, .1], 0xe8dcb0], loot: .02, lootZones: { office: 3, school: 3 } });
    I('felt', { name: 'Войлок', icon: '🧶', stack: 12, desc: 'Пласт старого ковролина. Пахнет сыростью. Ткацкий станок превращает его в ткань.', mesh: ['box', [.16, .02, .12], 0xb9a65a] });
    I('foam', { name: 'Поролон', icon: '🧽', stack: 12, desc: 'Жёлтый поролон из обивки. Утеплитель, наполнитель.', mesh: ['box', [.12, .06, .1], 0xe6d27a] });
    I('gypsum', { name: 'Гипс', icon: '🧱', stack: 12, desc: 'Куски потолочной плитки и штукатурки. Дробилка сделает из них порошок.', mesh: ['box', [.14, .03, .14], 0xdedad0] });
    I('plastic', { name: 'Пластик', icon: '🥤', stack: 12, desc: 'Корпуса, панели, кадки. Нужен для плат и электроники.', mesh: ['box', [.12, .04, .1], 0x5a7a9a], loot: .01, lootZones: { mall: 3 } });
    I('glass', { name: 'Стекло', icon: '🔷', stack: 10, desc: 'Осколки. Осторожно. Дробилка измельчит их в песок для линз.', mesh: ['box', [.1, .01, .1], 0xa8d0d8] });
    I('rubber', { name: 'Резина', icon: '⚫', stack: 10, desc: 'Куски шин и уплотнителей. Изоляция, ремни для машин.', mesh: ['cyl', [.06, .04], 0x222222] });
    I('soil', { name: 'Грунт', icon: '🟫', stack: 10, desc: 'Земля из кадки. В ней что-то может вырасти. Или обжечь в печи как глину.', mesh: ['box', [.12, .06, .12], 0x4a3624] });
    // ---------------- tools (не тратятся)
    I('knife', { name: 'Нож', icon: '🔪', stack: 1, desc: 'Самодельный нож. Режет ковролин и обивку вдвое быстрее. Нужен, чтобы срезать ковролин.', mesh: ['box', [.2, .01, .03], 0xb0b0b0] });
    I('screwdriver', { name: 'Отвёртка', icon: '🪛', stack: 1, desc: 'Шкафы, щиты и металлические ящики разбираются вдвое быстрее. Электрощиты — только с ней.', mesh: ['box', [.16, .02, .02], 0xd0a020] });
    I('crowbar', { name: 'Лом', icon: '⛏️', stack: 1, desc: 'Гвоздодёр. Всё деревянное и тяжёлое — вдвое быстрее. Машины и штукатурку без него не вскрыть.', mesh: ['box', [.5, .03, .03], 0x8a2a20] });
    const RC = (id, out, inn, station) => api.recipes.register(id, { out, in: inn, station });
    RC('knife', { knife: 1 }, { scrap: 2, cloth: 1 });
    RC('screwdriver', { screwdriver: 1 }, { scrap: 2, plastic: 1 }, 'workbench');
    RC('crowbar', { crowbar: 1 }, { scrap: 5 }, 'workbench');
    RC('cloth_paper', { cloth: 1 }, { paper: 4 });
    RC('panel_gyp', { panel: 1 }, { gypsum: 3, paper: 1 }, 'workbench');
    // ---------------- yields: t — секунды удержания, tool — что ускоряет, need — без чего нельзя
    const Y = {
      desk: { t: 4, tool: 'crowbar', out: { plank: [1, 2], scrap: [0, 1], paper: [0, 1] } },
      chair: { t: 2.5, tool: 'crowbar', out: { scrap: [1, 1], foam: [0, 1], plank: [0, 1] } },
      sofa: { t: 5, tool: 'knife', out: { cloth: [1, 2], foam: [1, 3], plank: [1, 1] } },
      bed: { t: 5, tool: 'knife', out: { cloth: [2, 2], foam: [1, 2], scrap: [1, 1] } },
      locker: { t: 4, tool: 'screwdriver', out: { scrap: [2, 3] } },
      cabinet: { t: 4, tool: 'screwdriver', out: { scrap: [1, 2], plank: [0, 1], paper: [0, 2] } },
      nightstand: { t: 3, tool: 'crowbar', out: { plank: [1, 2] } },
      boxes: { t: 2, tool: 'knife', out: { paper: [2, 3], cloth: [0, 1] } },
      car: { t: 10, need: 'crowbar', tool: 'crowbar', out: { scrap: [3, 5], glass: [1, 2], rubber: [2, 3], wire: [1, 2], fuel: [0, 1] } },
      bench: { t: 3.5, tool: 'crowbar', out: { plank: [2, 2], scrap: [0, 1] } },
      planter: { t: 3, tool: 'crowbar', out: { soil: [1, 2], plastic: [1, 1] }, extra: () => Math.random() < .5 ? ['seed_almond', 1] : null },
      epanel: { t: 6, need: 'screwdriver', tool: 'screwdriver', out: { wire: [2, 3], scrap: [1, 1], plastic: [0, 1] }, extra: () => Math.random() < .35 ? ['circuit', 1] : null },
      stairs: { t: 6, tool: 'crowbar', out: { scrap: [2, 3], plank: [1, 1] } },
      sign: { t: 1.5, out: { plastic: [1, 1] } },
      shelf: { t: 4, tool: 'screwdriver', out: { scrap: [2, 3] } },
      crate: { t: 3, tool: 'crowbar', out: { plank: [2, 3] } },
    };
    api.provide('li.salvage.yields', Y);
    const give = (id, n) => { if (!E.ITEMS[id] || n <= 0) return; const left = api.inv.add(id, n); for (let i = 0; i < left; i++) E.spawnItem(id, E.feetPos().add(V3(0, 1, 0))); E.pickupToast?.(id, n - left); };
    const roll = out => { const got = {}; for (const [id, [a, b]] of Object.entries(out)) { const n = a + Math.floor(Math.random() * (b - a + 1)); if (n > 0) got[id] = (got[id] || 0) + n; } return got; };
    const holdTime = (y) => (y.t || 3) / (y.tool && api.inv.count(y.tool) ? 2 : 1) / (cfg.speed || 1);
    const toolName = id => E.ITEMS[id]?.name.toLowerCase() || id;
    let sndT = 0;
    const holdFx = (pos, kind) => dt => { if ((sndT -= dt) > 0) return; sndT = .45 + Math.random() * .3; (kind === 'soft' ? api.audio.cloth(.5) : Math.random() < .5 ? api.audio.crack(pos) : api.audio.scrape(pos)); E.player.noise += .03; };
    // ---------------- furniture
    api.interactions.register('li.salvage.furn', {
      priority: 4,
      test(h) {
        const rec = api.furn.at(h.collider); if (!rec || rec.gone) return null;
        const wo = E.WorldObj.byCollider.get(h.collider.handle);
        if (wo && wo.key && E.WorldObj.state.get(wo.key) && !E.WorldObj.state.get(wo.key).done) return null; // сначала обыскать
        const y = Y[rec.kind] || { t: 3, out: { scrap: [1, 1] } };
        if (y.need && !api.inv.count(y.need)) return { text: `Разобрать ${rec.name} можно только с инструментом: ${toolName(y.need)}`, run() { api.audio.click(); } };
        const pos = V3(rec.x, rec.y, rec.z);
        return { text: `Удерживай E — разобрать ${rec.name}` + (y.tool && !api.inv.count(y.tool) && !y.need ? ` (${toolName(y.tool)} ускорит)` : ''), hold: holdTime(y), holdKey: 'furn:' + rec.key,
          onHoldTick: holdFx(pos, rec.kind === 'sofa' || rec.kind === 'bed' || rec.kind === 'boxes' ? 'soft' : 'hard'),
          run() {
            if (rec.gone) return;
            api.furn.remove(rec); api.audio.thud(pos); api.audio.crack(pos);
            const got = roll(y.out), ex = y.extra?.(); if (ex) got[ex[0]] = (got[ex[0]] || 0) + ex[1];
            for (const [id, n] of Object.entries(got)) give(id, n);
            E.player.noise += .35; E.dir.attention = clamp(E.dir.attention + .05, 0, 1);
            api.quest.count('li.furn'); api.quest.count('li.furn:' + rec.kind); api.data.count = (api.data.count || 0) + 1;
            api.notes.unlock('g_li_salvage');
            api.say(`Ты разобрал ${rec.name}: ` + (Object.entries(got).map(([k, n]) => `${E.ITEMS[k]?.name || k} ×${n}`).join(', ') || 'ничего полезного'), 3.5);
            api.emit('li:salvaged', { kind: rec.kind, got });
          } };
      },
    });
    // ---------------- surfaces: wallpaper / carpet / ceiling tiles
    const SURF = {
      wall: { t: 3, out: { paper: [1, 2], cloth: [0, 1] }, text: 'содрать обои', soft: true },
      wallD: { t: 3, out: { paper: [1, 1], cloth: [0, 1] }, text: 'содрать сырые обои', soft: true },
      hotelW: { t: 3, out: { paper: [1, 2], cloth: [0, 1] }, text: 'содрать обои', soft: true },
      funW: { t: 3, out: { paper: [2, 2] }, text: 'содрать весёлые обои', soft: true },
      woodpanel: { t: 4, tool: 'crowbar', out: { plank: [1, 1] }, text: 'отодрать панель' },
      whitewall: { t: 5, need: 'crowbar', out: { gypsum: [1, 2] }, text: 'отбить штукатурку' },
      floor: { t: 4, need: 'knife', out: { felt: [1, 1] }, text: 'вырезать кусок ковролина', soft: true },
      floorD: { t: 4, need: 'knife', out: { felt: [1, 1] }, text: 'вырезать мокрый ковролин', soft: true },
      hotelC: { t: 4, need: 'knife', out: { felt: [1, 2] }, text: 'вырезать ковёр', soft: true },
      lino: { t: 3, need: 'knife', out: { plastic: [1, 1] }, text: 'срезать линолеум', soft: true },
      ceil: { t: 3, out: { gypsum: [1, 1] }, text: 'снять потолочную плитку' },
      ceilD: { t: 3, out: { gypsum: [1, 1], paper: [0, 1] }, text: 'снять размокшую плитку' },
    };
    const patchMat = { wall: new THREE.MeshBasicMaterial({ color: 0x2a2416 }), floor: new THREE.MeshBasicMaterial({ color: 0x1c1a14 }), ceil: new THREE.MeshBasicMaterial({ color: 0x050403 }) };
    const patches = new Map();
    const R1 = v => Math.round(v * 10) / 10;
    function addPatch(key) {
      if (patches.has(key)) return; const p = key.slice(2).split(',').map(Number); if (p.length < 6 || p.some(isNaN)) return;
      const [x, y, z, nx, ny, nz] = p, kind = Math.abs(ny) < .5 ? 'wall' : ny > 0 ? 'floor' : 'ceil';
      const m = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'ceil' ? .6 : .55, kind === 'ceil' ? .6 : .7), patchMat[kind]);
      const n = V3(nx, ny, nz).normalize(); m.position.set(x, y, z).addScaledVector(n, .012); m.lookAt(m.position.clone().add(n)); m.userData.noAO = true; m.renderOrder = 2;
      E.scene.add(m); patches.set(key, m);
    }
    const chunkOfPt = (x, z) => E.chunks.get(Math.floor(x / E.CS) + ',' + Math.floor(z / E.CS));
    api.on('chunk:load', ch => { for (const k of E.salvaged) if (k.startsWith('s:')) { const p = k.slice(2).split(','); if (Math.floor(+p[0] / E.CS) === ch.cx && Math.floor(+p[2] / E.CS) === ch.cz) addPatch(k); } });
    api.on('chunk:unload', ch => { for (const [k, m] of patches) if (Math.floor(m.position.x / E.CS) === ch.cx && Math.floor(m.position.z / E.CS) === ch.cz) { E.scene.remove(m); m.geometry.dispose(); patches.delete(k); } });
    api.on('world:clear', () => { for (const m of patches.values()) { E.scene.remove(m); m.geometry.dispose(); } patches.clear(); });
    api.on('game:load', () => { for (const m of patches.values()) { E.scene.remove(m); m.geometry.dispose(); } patches.clear(); for (const k of E.salvaged) if (k.startsWith('s:')) addPatch(k); });
    const nearPatch = (p, r) => { for (const m of patches.values()) if (m.position.distanceTo(p) < r) return true; return false; };
    api.interactions.register('li.salvage.surf', {
      priority: 1,
      test(h) {
        if (!cfg.surfaces || h.dist > 2) return null;
        const ch = chunkOfPt(h.point.x, h.point.z); if (!ch || h.collider.parent()?.handle !== ch.body?.handle) return null;
        if (api.furn.at(h.collider) || E.WorldObj.byCollider.get(h.collider.handle)) return null;
        if (E.WORLD.exitDoor && h.point.distanceTo(E.WORLD.exitDoor) < 2.5) return null;
        const z = E.zoneAt(h.point.x, h.point.z), dirty = (z.dirt || 0) > .4, ny = h.normal.y;
        let k;
        if (Math.abs(ny) < .3) { if (h.point.y < .15 || h.point.y > (z.H || 2.9) - .1) return null; k = z.wallK || (dirty ? 'wallD' : 'wall'); }
        else if (ny > .7) { if (h.point.y > .2) return null; k = z.floorK || (z.mat === 'tile' ? 'tile' : dirty ? 'floorD' : 'floor'); }
        else if (ny < -.7) { const f = E.fixtureAt(Math.floor(h.point.x / E.CELL), Math.floor(h.point.z / E.CELL)); if (f && Math.hypot(h.point.x - f.x, h.point.z - f.z) < 1.1) return null; k = z.ceilK || (dirty ? 'ceilD' : 'ceil'); }
        const s = SURF[k]; if (!s) return null;
        if (nearPatch(h.point, Math.abs(ny) < .3 ? .55 : .6)) return null;
        if (s.need && !api.inv.count(s.need)) return null; // без инструмента — даже не предлагаем, чтобы не мешать
        const key = `s:${R1(h.point.x)},${R1(h.point.y)},${R1(h.point.z)},${R1(h.normal.x)},${R1(h.normal.y)},${R1(h.normal.z)}`, pos = h.point.clone();
        return { text: `Удерживай E — ${s.text}`, hold: holdTime(s), holdKey: 'surf:' + k + ':' + Math.round(h.point.x * 2) + ',' + Math.round(h.point.y * 2) + ',' + Math.round(h.point.z * 2), onHoldTick: holdFx(pos, s.soft ? 'soft' : 'hard'),
          run() {
            E.salvaged.add(key); addPatch(key);
            const got = roll(s.out); for (const [id, n] of Object.entries(got)) give(id, n);
            if (ny < -.7) { api.audio.thud(pos); E.player.noise += .15; } else api.audio.cloth(.8);
            api.quest.count('li.surf'); api.quest.count('li.surf:' + (Math.abs(ny) < .3 ? 'wall' : ny > 0 ? 'floor' : 'ceil'));
            if (E.player.st.sanity > 20 && Math.random() < .08) { api.say(pick2(['Под обоями — ещё один слой таких же обоев.', 'За плиткой — темнота. Ты слышишь, как там что-то ровно дышит.', 'Под ковролином — ещё ковролин. Сухой.']), 4); E.player.st.sanity -= 2; }
            api.notes.unlock('g_li_salvage');
          } };
      },
    });
    const pick2 = a => a[Math.random() * a.length | 0];
    // ---------------- guide + lore
    api.notes.register('g_li_salvage', { kind: 'guide', order: 30, t: 'Руководство: разборка', b: 'Почти всё вокруг можно разобрать: наведись на мебель и <b>удерживай E</b>. Сначала обыщи шкаф или стол — потом разбирай.<br><br>• <b>Обои</b> → бумага и немного ткани.<br>• <b>Потолочная плитка</b> (смотри вверх, не на светильник) → гипс.<br>• <b>Ковролин</b> → войлок (нужен нож).<br>• <b>Машины</b> и <b>штукатурка</b> — только с ломом, <b>электрощиты</b> — с отвёрткой.<br><br>Инструменты лежат в рюкзаке и не тратятся: нож (ткань + металлолом), отвёртка и лом — на верстаке. Подходящий инструмент ускоряет работу вдвое.<br><br>Шум разборки привлекает внимание. Не разбирай всё подряд у себя в убежище.' });
    api.notes.register('li_l1', { kind: 'lore', order: 60, t: 'Обрывок обоев', b: 'На обороте куска обоев шариковой ручкой: «Если снять плитку на потолке, там не перекрытие, а ещё один потолок. Я снял шесть. Седьмой был тёплый».' });
    api.notes.register('li_l2', { kind: 'lore', order: 61, t: 'Квитанция M.E.G.', b: '«Принято у Ламповщиков: металлолом 40 кг, провод 12 м, войлок 3 рулона. Войлок сушить отдельно — плесень разговаривает»' });
    // ---------------- quests · глава 3
    api.quests.chapter('ch3', { title: 'Глава 3 · Разборка', order: 3, desc: 'Мир вокруг — склад материалов. Нужно только взять.' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    const Q = (id, order, title, desc, check, reward, after) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch3' });
    Q('q_li_furn', 20, 'Ломать — не строить', 'разбери 3 предмета мебели (удерживай E)', cnt('li.furn', 3), { scrap: 2 }, ['q_bench']);
    Q('q_li_knife', 21, 'Режущий край', 'сделай нож (ткань + металлолом)', () => api.inv.count('knife') > 0, { cloth: 1 }, ['q_li_furn']);
    Q('q_li_carpet', 22, 'Ковровое покрытие', 'вырежи 2 куска ковролина', cnt('li.surf:floor', 2), { felt: 1 }, ['q_li_knife']);
    Q('q_li_ceil', 23, 'Что над потолком', 'сними 3 потолочные плитки', cnt('li.surf:ceil', 3), { gypsum: 1 }, ['q_li_furn']);
    Q('q_li_tools', 24, 'Полный набор', 'сделай отвёртку и лом', () => ({ n: (api.inv.count('screwdriver') ? 1 : 0) + (api.inv.count('crowbar') ? 1 : 0), of: 2 }), { scrap: 3 }, ['q_li_furn']);
    Q('q_li_heavy', 25, 'Тяжёлая техника', 'разбери машину или электрощит', () => (Quests_get('li.furn:car') + Quests_get('li.furn:epanel')) > 0, { wire: 2 }, ['q_li_tools']);
    const Quests_get = k => E.Quests.get(k);
    api.commands.register('salvage', { help: 'сколько предметов разобрано', run: () => String(api.data.count || 0) });
  },
});
