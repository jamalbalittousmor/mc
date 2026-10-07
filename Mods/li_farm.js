// =====================================================================
//  Liminal Industry · «Гидропоника»
//  Грибы растут в темноте, миндаль — под током и лампой. Пресс,
//  плитка, новая еда. Глава 5.
// =====================================================================
Backrooms.mod({
  id: 'li.farm', name: 'Liminal Industry · Гидропоника', version: '1.0.0',
  requires: ['li.industry@>=1.0'],
  description: 'Грядки для грибов и миндаля, пресс для миндальной воды, электроплитка и новая еда. Глава 5.',
  init(api) {
    const { V3, clamp } = api.util, E = api.engine, THREE = api.THREE;
    const P = api.require('li.proc');
    const B = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
    const I = (id, d) => api.items.register(id, d);
    I('spores', { name: 'Споры', icon: '🍄', stack: 10, desc: 'Серая пыль из-под мокрого ковролина. Посади в грядку — вырастут грибы. Любят темноту.', mesh: ['box', [.06, .04, .06], 0x8a8276], loot: .012, lootZones: { flooded: 4, pools: 2, dark: 3, pipes: 3 } });
    I('seed_almond', { name: 'Семена миндаля', icon: '🌰', stack: 10, desc: 'Твёрдые светлые зёрна. Растут только под током и светом.', mesh: ['box', [.05, .03, .05], 0xd8c098], loot: .008, lootZones: { office: 2, mall: 4, hotel: 2 } });
    I('mushroom', { name: 'Бледные грибы', icon: '🍄', stack: 10, desc: 'Сырыми — едва съедобны и путают мысли. Лучше сварить.', use: { hunger: 14, sanity: -3 }, sound: 'eat', useText: 'Вкус как у мокрой бумаги. В голове шумит.', mesh: ['cyl', [.04, .05], 0xd6d0c0] });
    I('almondnut', { name: 'Миндаль', icon: '🥜', stack: 20, desc: 'Свежие орехи. Можно есть, но лучше выжать в прессе.', use: { hunger: 6, sanity: 1 }, sound: 'eat', mesh: ['box', [.05, .03, .04], 0xc8a070] });
    I('mstew', { name: 'Грибная похлёбка', icon: '🥣', stack: 4, desc: 'Горячая. Пахнет почти по-домашнему.', use: { hunger: 42, thirst: 10, sanity: 6 }, sound: 'eat', useText: 'Тепло расходится по телу.', mesh: ['cyl', [.07, .06], 0x8a6a3a] });
    I('roast', { name: 'Жареный миндаль', icon: '🥜', stack: 8, desc: 'Хрустит. Успокаивает лучше таблеток.', use: { hunger: 18, sanity: 8 }, sound: 'eat', mesh: ['box', [.08, .04, .06], 0x8a5a30] });
    // ---------------- hydroponic bed
    const CROPS = {
      mushroom: { seed: 'spores', name: 'грибы', time: 150, needPower: 0, out: () => ({ mushroom: 2 + (Math.random() * 2 | 0), spores: Math.random() < .6 ? 1 : 0 }), color: 0xd6d0c0 },
      almond: { seed: 'seed_almond', name: 'миндаль', time: 240, needPower: 1, out: () => ({ almondnut: 3 + (Math.random() * 2 | 0), seed_almond: Math.random() < .7 ? 1 : 0 }), color: 0x6a8a3a },
    };
    const plantMat = {}; const mat = c => plantMat[c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .8, emissive: new THREE.Color(c).multiplyScalar(.25) });
    const plantGeo = new THREE.CylinderGeometry(.035, .05, 1, 6).translate(0, .5, 0);
    function visual(m) {
      const g = m.piece.obj; if (!g.userData.plants) { g.userData.plants = []; for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(plantGeo, mat(0xffffff)); p.position.set(-.45 + (i % 3) * .45, .62, i < 3 ? -.15 : .15); p.userData.noAO = true; g.add(p); g.userData.plants.push(p); } }
      const c = CROPS[m.state.crop], k = c ? clamp(m.state.t / c.time, .05, 1) : 0;
      for (const p of g.userData.plants) { p.visible = !!c; if (!c) continue; p.material = mat(m.state.t >= c.time ? (m.state.crop === 'almond' ? 0xc8a070 : 0xeae4d4) : c.color); p.scale.set(m.state.crop === 'mushroom' ? 1 + k : 1, (m.state.crop === 'mushroom' ? .12 : .4) * k + .02, m.state.crop === 'mushroom' ? 1 + k : 1); }
    }
    const pw = m => api.power.at(m.pos);
    api.machines.register('hydro', {
      name: 'Гидропонная грядка', state: { crop: null, t: 0, water: 0 },
      build: { cost: { plank: 2, plastic: 2, soil: 2 }, snap: .25, boxes: [B(-.7, 0, -.3, .7, .55, .3, 'plastic'), B(-.65, .55, -.25, .65, .6, .25, 'darkp')] },
      init(m) { visual(m); },
      tick(m, dt) {
        const s = m.state, c = CROPS[s.crop];
        if (c && s.t < c.time && s.water > 0 && pw(m) >= c.needPower) { const k = s.crop === 'mushroom' && pw(m) < 1 ? 1.4 : 1; s.t += dt * k; s.water = Math.max(0, s.water - dt); if (s.t >= c.time) api.audio.drip(m.pos); }
        if ((m.vt = (m.vt || 0) - dt) <= 0) { m.vt = 1; visual(m); }
      },
      prompt(m) {
        const s = m.state, c = CROPS[s.crop];
        if (!c) { const seeds = Object.entries(CROPS).filter(([k, d]) => api.inv.count(d.seed)).map(([k, d]) => d.name); return 'E — грядка: ' + (seeds.length ? 'посадить ' + seeds.join(' / ') : 'нужны споры или семена миндаля'); }
        if (s.t >= c.time) return `E — собрать ${c.name}`;
        const why = s.water <= 0 ? ' · сухо (E — полить водой)' : pw(m) < c.needPower ? ' · миндалю нужен ток (1) и свет' : '';
        return `Грядка: ${c.name} ${Math.floor(s.t / c.time * 100)}% · вода ${Math.round(s.water)} с${why}` + (s.water < 60 && (api.inv.count('water') || api.inv.count('almond')) ? ' · E — полить' : '');
      },
      interact(m) {
        const s = m.state, c = CROPS[s.crop];
        if (!c) {
          const want = api.inv.count('seed_almond') && pw(m) >= 1 ? 'almond' : api.inv.count('spores') ? 'mushroom' : api.inv.count('seed_almond') ? 'almond' : null;
          if (!want) { api.audio.click(); return; }
          api.inv.take(CROPS[want].seed, 1); s.crop = want; s.t = 0; api.audio.cloth(.4); api.quest.count('li.plant'); api.notes.unlock('g_li_farm');
          if (s.water <= 0) api.say('Посажено. Теперь полей (нужна бутылка воды).', 3); visual(m); return;
        }
        if (s.t >= c.time) { const got = c.out(); for (const [k, n] of Object.entries(got)) if (n) P.give(k, n); s.crop = null; s.t = 0; api.audio.pickup(); api.quest.count('li.harvest:' + (c === CROPS.mushroom ? 'mushroom' : 'almond')); api.say('Урожай: ' + P.list(got), 3); visual(m); return; }
        if (s.water < 240 && api.inv.take('water', 1)) { s.water += 180; api.audio.splash?.(m.pos); return; }
        api.audio.click();
      },
    });
    // ---------------- almond press (без тока, удержание)
    api.machines.register('press', {
      name: 'Пресс', state: {},
      build: { cost: { steel: 2, plank: 2 }, snap: .25, boxes: [B(-.3, 0, -.3, .3, .5, .3, 'wood'), B(-.25, .5, -.04, -.2, 1.3, .04, 'metal'), B(.2, .5, -.04, .25, 1.3, .04, 'metal'), B(-.25, 1.2, -.06, .25, 1.3, .06, 'metal'), B(-.03, .9, -.03, .03, 1.2, .03, 'metal')] },
      prompt(m) {
        if (api.inv.count('almondnut') < 3 || !api.inv.count('water')) return 'Пресс · нужно 3 миндаля и бутылка воды';
        return { text: 'Удерживай E — выжать миндальную воду', hold: 3, holdKey: 'press' + m.pos.x.toFixed(2), onHoldTick: () => { if (Math.random() < .04) api.audio.creak(m.pos); }, run() { if (api.inv.count('almondnut') < 3 || !api.inv.take('water', 1)) return; api.inv.take('almondnut', 3); P.give('almond', 2); api.audio.gulp(); api.quest.count('li.press'); api.say('Две бутылки миндальной воды.', 2.5); } };
      },
    });
    // ---------------- electric stove
    P.proc('stove', { name: 'Электроплитка', needPower: 1, desc: 'Спираль от обогревателя под кастрюлей.',
      build: { cost: { steel: 1, wire: 2, scrap: 2 }, snap: .25, boxes: [B(-.3, 0, -.3, .3, .8, .3, 'metal'), B(-.2, .8, -.2, .2, .82, .2, 'rust')], visual: (g, gh) => P.led(g, gh, 0, .6, .31) },
      sound: m => api.audio.crackle(m.pos, .5), sndT: 2,
      recipes: [['mstew', 'Грибная похлёбка', { mushroom: 2, water: 1 }, { mstew: 1 }, 20], ['roast', 'Жареный миндаль', { almondnut: 3 }, { roast: 1 }, 15]] });
    // споры иногда прячутся в мокрой мебели
    api.on('li:salvaged', e => { const z = E.zoneAt(E.feetPos().x, E.feetPos().z); if ((z.dirt || 0) > .4 && Math.random() < .25) { P.give('spores', 1); api.say('В сырой обивке — серая пыль. Споры.', 2.5); } });
    api.notes.register('g_li_farm', { kind: 'guide', order: 32, t: 'Руководство: гидропоника', b: 'Постройте <b>грядку</b> (доски, пластик, грунт из кадок) и посадите:<br>• <b>Споры</b> — грибы. Растут где угодно, в темноте быстрее. Сырыми грибы бьют по рассудку — вари их на <b>электроплитке</b>.<br>• <b>Семена миндаля</b> — только при питании 1+ рядом.<br><br>Растения пьют воду: полей бутылкой (E). <b>Пресс</b> выжимает из 3 орехов и воды две бутылки миндальной воды.' });
    api.notes.register('li_f1', { kind: 'lore', order: 62, t: 'Записка на банке', b: '«Грибы из-под ковролина не трогать сырыми. Варить минут двадцать. Если гриб светится — выбросить и не смотреть, куда он укатится».' });
    // ---------------- quests · глава 5
    api.quests.chapter('ch5', { title: 'Глава 5 · Урожай', order: 5, desc: 'Еда, которая не кончается.' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    const Q = (id, order, title, desc, check, reward, after) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch5' });
    Q('q_li_plant', 40, 'Первые ростки', 'построй грядку и посади споры или миндаль', cnt('li.plant', 1), { water: 1 }, ['q_li_furnace']);
    Q('q_li_shroom', 41, 'Тихая грибница', 'собери урожай грибов', cnt('li.harvest:mushroom', 1), { spores: 2 }, ['q_li_plant']);
    Q('q_li_stew', 42, 'Горячее', 'свари грибную похлёбку на электроплитке', cnt('li.make:mstew', 1), { mushroom: 2 }, ['q_li_shroom']);
    Q('q_li_almond', 43, 'Миндальная роща', 'вырасти миндаль под током', cnt('li.harvest:almond', 1), { seed_almond: 2 }, ['q_li_plant']);
    Q('q_li_press', 44, 'Сладкая вода', 'выжми миндальную воду в прессе', cnt('li.press', 1), { almondnut: 3 }, ['q_li_almond']);
  },
});
