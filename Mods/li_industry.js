// =====================================================================
//  Liminal Industry · «Цех»
//  Печь, дробилка, бетономешалка, плавильня, ткацкий станок, сборщик,
//  хранилище и перекладчик; динамо, врезка в сеть, реле. Главы 4.
//  Даёт другим модам сервис 'li.proc' — конструктор машин с очередью.
// =====================================================================
Backrooms.mod({
  id: 'li.industry', name: 'Liminal Industry · Цех', version: '1.0.0',
  requires: ['core.industry@>=1.0', 'li.salvage@>=1.0'],
  description: 'Переработка материалов: печь, дробилка, бетономешалка, плавильня, ткацкий станок, сборщик. Реле, динамо, врезка в сеть, хранилище и перекладчик. Глава 4.',
  init(api) {
    const { V3, clamp } = api.util, E = api.engine, THREE = api.THREE, esc = api.util.esc;
    const B = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
    const I = (id, d) => api.items.register(id, d);
    I('steel', { name: 'Сталь', icon: '🔗', stack: 20, desc: 'Переплавленный металлолом. Прочная основа машин.', mesh: ['box', [.16, .03, .06], 0x9aa0a8] });
    I('brick', { name: 'Кирпич', icon: '🧱', stack: 20, desc: 'Обожжённый в печи грунт. Для печей и стен.', mesh: ['box', [.12, .06, .06], 0xa0482c] });
    I('charcoal', { name: 'Уголь', icon: '🪨', stack: 20, desc: 'Пережжённые доски. Горит в печи вдвое дольше дерева.', mesh: ['box', [.08, .05, .06], 0x1a1816] });
    I('grit', { name: 'Гипсовый порошок', icon: '🥣', stack: 20, desc: 'Измельчённый гипс. С водой — бетонные блоки.', mesh: ['box', [.1, .05, .1], 0xc8c4b8] });
    I('sand', { name: 'Стеклянный песок', icon: '⏳', stack: 20, desc: 'Перемолотое стекло. В плавильне из него получаются линзы.', mesh: ['box', [.1, .04, .1], 0xd8d0a8] });
    I('cblock', { name: 'Бетонный блок', icon: '⬜', stack: 20, desc: 'Тяжёлый блок. Из них строятся прочные стены.', mesh: ['box', [.2, .1, .1], 0x8a8780] });
    I('alloy', { name: 'Сплав', icon: '🟧', stack: 10, desc: 'Сталь с медью из проводов. Не ржавеет и странно звенит.', mesh: ['box', [.14, .03, .06], 0xc08a40] });
    I('lens', { name: 'Линза', icon: '🔍', stack: 10, desc: 'Выпуклое стекло. Нужна приборам, которые «видят».', mesh: ['cyl', [.05, .015], 0xbfe6ff] });
    I('insul', { name: 'Утеплитель', icon: '🟨', stack: 10, desc: 'Плотная прослойка. Делает убежище тише.', mesh: ['box', [.18, .06, .12], 0xd8c060] });
    I('motor', { name: 'Электромотор', icon: '⚙️', stack: 5, desc: 'Самодельный мотор. Сердце сложных машин.', mesh: ['cyl', [.07, .12], 0x606870] });
    I('cell', { name: 'Аккумулятор', icon: '🔋', stack: 5, desc: 'Тяжёлая банка. Используй — фонарик заряжен и не садится 5 минут.', mesh: ['box', [.12, .14, .08], 0x2a4a2a],
      onUse(a) { E.player.flash.battery = 1; E.player.flash.on = true; api.data.cellT = 300; api.audio.powerUp(); api.say('Фонарик подключён к аккумулятору.', 3); return true; } });
    api.on('update', dt => { if (api.data.cellT > 0) { api.data.cellT -= dt; E.player.flash.battery = Math.max(E.player.flash.battery, .999); } });
    // ---------------- generic processor machine (exported as service)
    const FUEL = { paper: 15, felt: 30, plank: 60, charcoal: 150, fuel: 240 };
    const led = (g, ghost, x, y, z) => { if (ghost) return; const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .02), new THREE.MeshBasicMaterial({ color: 0x220000 })); m.position.set(x, y, z); m.userData.noAO = true; g.add(m); g.userData.led = m; };
    const setLed = (m, c) => m.piece.obj.userData.led?.material.color.set(c);
    const nm = id => E.ITEMS[id]?.name || id, ic = id => E.ITEMS[id]?.icon || '';
    const list = o => Object.entries(o).map(([k, n]) => `${ic(k)} ${nm(k)} ×${n}`).join(', ');
    const give = (id, n) => { const left = api.inv.add(id, n); for (let i = 0; i < left; i++) E.spawnItem(id, E.feetPos().add(V3(0, 1, 0))); return n - left; };
    let openM = null;
    function proc(id, d) {
      const R = new Map(d.recipes.map(([rid, name, inn, out, time]) => [rid, { rid, name, in: inn, out, time }]));
      const ok = m => (!d.needPower || api.power.at(m.pos) >= d.needPower) && (!d.fuel || m.state.fuel > 0) && (!d.cond || d.cond(m));
      const def = {
        name: d.name, state: { jobs: [], cur: null, left: 0, out: {}, fuel: 0 }, build: d.build, range: d.range, power: d.power, producing: d.producing,
        recipes: R,
        tick(m, dt) {
          const s = m.state; s.jobs ||= []; s.out ||= {};
          if (!s.cur && s.jobs.length) { s.cur = s.jobs.shift(); s.left = R.get(s.cur)?.time || 10; }
          const run = s.cur && ok(m);
          if (run) {
            s.left -= dt; if (d.fuel) s.fuel = Math.max(0, s.fuel - dt);
            m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = d.sndT || 1.2; d.sound ? d.sound(m) : api.audio.motor(m.pos, .5); }
            if (s.left <= 0) { const r = R.get(s.cur); if (r) for (const [k, n] of Object.entries(r.out)) s.out[k] = (s.out[k] || 0) + n; s.cur = null; api.audio.beep(m.pos); api.quest.count('li.make:' + r?.rid); api.quest.count('li.machine:' + id); if (openM === m) render(m); }
          }
          if (d.onTick) d.onTick(m, dt, run);
          setLed(m, run ? 0x40ff60 : s.cur ? 0xff4020 : Object.keys(s.out).length ? 0x40a0ff : 0x221100);
        },
        prompt(m) { const s = m.state; return `E — ${d.name}` + (s.cur ? ` · ${R.get(s.cur)?.name} ${Math.max(0, Math.ceil(s.left))} с` + (ok(m) ? '' : d.needPower && api.power.at(m.pos) < d.needPower ? ` · нужно питание ${d.needPower}` : d.fuel && s.fuel <= 0 ? ' · нет топлива' : ' · простой') : '') + (Object.keys(s.out || {}).length ? ' · готово!' : '') + (s.jobs?.length ? ` · в очереди ${s.jobs.length}` : ''); },
        interact(m) { openM = m; render(m); },
      };
      function render(m) {
        if (E.game.state !== 'dialog' && openM !== m) return;
        const s = m.state, pw = api.power.at(m.pos);
        let html = `<p class="d">${esc(d.desc || '')}</p>`;
        html += `<p>Состояние: <b>${s.cur ? `${esc(R.get(s.cur)?.name)} — ${Math.max(0, Math.ceil(s.left))} с` : 'ожидает'}</b>${d.needPower ? ` · питание ${pw.toFixed(1)} / ${d.needPower}` : ''}${d.fuel ? ` · топливо ${Math.round(s.fuel)} с` : ''}</p>`;
        if (s.jobs.length) html += `<p class="d">Очередь: ${s.jobs.map(j => esc(R.get(j)?.name || j)).join(', ')}</p>`;
        if (Object.keys(s.out).length) html += `<p style="color:#9fe8a0">Готово: ${list(s.out)}</p>`;
        html += '<div style="margin-top:.6em">' + [...R.values()].map(r => { const can = Object.entries(r.in).every(([k, n]) => api.inv.count(k) >= n); return `<div style="opacity:${can ? 1 : .55}">▸ <b>${esc(r.name)}</b>: ${list(r.in)} → ${list(r.out)} · ${r.time} с</div>`; }).join('') + '</div>';
        const btn = [];
        for (const r of R.values()) btn.push([`▶ ${r.name}`, () => {
          if (s.jobs.length >= 8) { api.say('Очередь заполнена.', 2); return; }
          if (!Object.entries(r.in).every(([k, n]) => api.inv.count(k) >= n)) { api.audio.click(); api.say('Не хватает материалов: ' + list(r.in), 2.5); return; }
          for (const [k, n] of Object.entries(r.in)) api.inv.take(k, n); s.jobs.push(r.rid); api.audio.click(); render(m);
        }]);
        if (d.fuel) btn.push(['🔥 Топливо', () => { const f = ['paper', 'felt', 'charcoal', 'plank', 'fuel'].find(k => api.inv.count(k)); if (!f) { api.say('Нечем топить: бумага, войлок, доски, уголь, канистра.', 3); return; } api.inv.take(f, 1); s.fuel += FUEL[f]; api.audio.crackle(m.pos, .8); render(m); }]);
        if (Object.keys(s.out).length) btn.push(['⬇ Забрать', () => { for (const [k, n] of Object.entries(s.out)) { const g = give(k, n); s.out[k] -= g; if (s.out[k] <= 0) delete s.out[k]; } api.audio.pickup(); render(m); }]);
        if (s.jobs.length) btn.push(['✖ Отменить очередь', () => { for (const j of s.jobs) for (const [k, n] of Object.entries(R.get(j)?.in || {})) give(k, n); s.jobs = []; render(m); }]);
        btn.push(['ЗАКРЫТЬ', () => { openM = null; E.closeDialog(); }]);
        E.openDialog(d.name.toUpperCase(), html, btn);
      }
      def.render = render;
      api.machines.register(id, def);
      return def;
    }
    api.provide('li.proc', { proc, FUEL, led, setLed, give, list });
    api.on('update', () => { if (openM && E.game.state !== 'dialog') openM = null; });
    // ---------------- machines
    proc('furnace', { name: 'Печь', fuel: true, desc: 'Кирпичная печь. Топится бумагой, войлоком, досками, углём или бензином.',
      build: { cost: { scrap: 4, gypsum: 3, plank: 1 }, snap: .25, boxes: [B(-.45, 0, -.4, .45, .9, .4, 'concrete'), B(-.18, .9, -.18, .18, 1.9, .18, 'rust')], visual: (g, gh) => led(g, gh, 0, .7, .41) },
      sound: m => api.audio.crackle(m.pos, 1), sndT: 1.6,
      onTick(m, dt, run) { if (run && E.feetPos().distanceTo(m.pos) < 2.5) { E.player.st.energy = Math.min(100, E.player.st.energy + dt * .02); } },
      recipes: [['steel', 'Сталь', { scrap: 3 }, { steel: 1 }, 20], ['brick', 'Кирпич', { soil: 1 }, { brick: 2 }, 25], ['charcoal', 'Уголь', { plank: 2 }, { charcoal: 1 }, 15], ['glassmelt', 'Стекло из песка', { sand: 1 }, { glass: 1 }, 15]] });
    proc('crusher', { name: 'Дробилка', needPower: 1, desc: 'Жернова на моторе от вентилятора. Нужно питание.',
      build: { cost: { steel: 3, wire: 2, scrap: 2 }, snap: .25, boxes: [B(-.4, 0, -.4, .4, .7, .4, 'metal'), B(-.3, .7, -.3, .3, 1.1, .3, 'rust')], visual: (g, gh) => led(g, gh, 0, .5, .41) },
      sound: m => { api.audio.motor(m.pos, .7); api.audio.crack(m.pos); },
      recipes: [['grit', 'Гипсовый порошок', { gypsum: 2 }, { grit: 2 }, 12], ['sand', 'Стеклянный песок', { glass: 2 }, { sand: 1 }, 10], ['gravel', 'Порошок из кирпича', { brick: 2 }, { grit: 1 }, 10]] });
    proc('mixer', { name: 'Бетономешалка', needPower: 1, desc: 'Бочка на оси. Порошок + вода = бетон.',
      build: { cost: { steel: 2, scrap: 3, wire: 1 }, snap: .25, boxes: [B(-.35, 0, -.35, .35, .3, .35, 'metal'), B(-.3, .3, -.3, .3, 1, .3, 'rust')], visual: (g, gh) => led(g, gh, 0, .2, .36) },
      sound: m => api.audio.scrape(m.pos), sndT: 1.8,
      recipes: [['cblock', 'Бетонные блоки', { grit: 2, water: 1 }, { cblock: 2 }, 20]] });
    proc('smelter', { name: 'Плавильня', needPower: 2, desc: 'Электродуговая плавильня. Ест много энергии (2+).',
      build: { cost: { brick: 6, steel: 3, wire: 4, circuit: 1 }, snap: .25, boxes: [B(-.5, 0, -.5, .5, 1.1, .5, 'concrete'), B(-.3, 1.1, -.3, .3, 1.4, .3, 'metal')], visual: (g, gh) => led(g, gh, 0, .9, .51) },
      sound: m => { api.audio.humBurst(m.pos); }, sndT: 2.2,
      recipes: [['alloy', 'Сплав', { steel: 2, wire: 1 }, { alloy: 1 }, 30], ['lens', 'Линза', { sand: 2 }, { lens: 1 }, 25], ['steel2', 'Сталь (быстро)', { scrap: 2 }, { steel: 1 }, 10]] });
    proc('loom', { name: 'Ткацкий станок', needPower: 1, desc: 'Чешет войлок и поролон в ткань и утеплитель.',
      build: { cost: { plank: 4, steel: 1, wire: 1 }, snap: .25, boxes: [B(-.6, 0, -.3, .6, .1, .3, 'wood'), B(-.6, 0, -.05, -.5, 1.2, .05, 'wood'), B(.5, 0, -.05, .6, 1.2, .05, 'wood'), B(-.6, 1.1, -.08, .6, 1.2, .08, 'wood'), B(-.5, .7, -.25, .5, .78, .25, 'wood')], visual: (g, gh) => led(g, gh, .55, .5, .06) },
      sound: m => api.audio.knock(m.pos), sndT: .9,
      recipes: [['cloth', 'Ткань', { felt: 1 }, { cloth: 2 }, 12], ['insul', 'Утеплитель', { foam: 2, felt: 1 }, { insul: 1 }, 15], ['filter2', 'Фильтр', { cloth: 1, foam: 1 }, { filter: 2 }, 10]] });
    proc('assembler', { name: 'Сборщик', needPower: 2, desc: 'Стол с манипулятором из лампы и паяльника. Электроника и моторы.',
      build: { cost: { steel: 4, circuit: 2, wire: 4 }, snap: .25, boxes: [B(-.6, .8, -.4, .6, .9, .4, 'metal'), B(-.55, 0, -.35, -.45, .8, .35, 'metal'), B(.45, 0, -.35, .55, .8, .35, 'metal'), B(.3, .9, .2, .38, 1.6, .28, 'metal'), B(-.2, 1.5, .2, .38, 1.58, .28, 'metal')], visual: (g, gh) => led(g, gh, -.4, .85, .41) },
      sound: m => api.audio.beep(m.pos), sndT: 1.5,
      recipes: [['circuit2', 'Плата', { wire: 2, plastic: 1 }, { circuit: 1 }, 15], ['motor', 'Электромотор', { steel: 2, wire: 3, rubber: 1 }, { motor: 1 }, 30], ['cell', 'Аккумулятор', { steel: 1, plastic: 1, battery: 2 }, { cell: 1 }, 20], ['bulb2', 'Лампочка', { glass: 1, wire: 1 }, { bulb: 1 }, 12]] });
    // ---------------- power: relay, dynamo, mains tap
    api.machines.register('relay', {
      name: 'Реле', relay: true, range: 10,
      build: { cost: { wire: 3, steel: 1 }, snap: .05, boxes: [B(-.15, 0, -.15, .15, .1, .15, 'metal'), B(-.03, .1, -.03, .03, 1.7, .03, 'metal'), B(-.12, 1.6, -.12, .12, 1.78, .12, 'metal')], visual: (g, gh) => led(g, gh, 0, 1.69, .13) },
      tick(m) { setLed(m, api.power.at(m.pos) > 0 ? 0x40a0ff : 0x220000); },
      prompt: m => `Реле · передаёт питание на 10 м · в сети ${api.power.at(m.pos).toFixed(1)}`,
    });
    api.machines.register('dynamo', {
      name: 'Динамо-машина', power: 1, range: 8, state: { t: 0 },
      build: { cost: { steel: 2, wire: 3, motor: 1 }, snap: .25, boxes: [B(-.3, 0, -.3, .3, .5, .3, 'metal'), B(-.05, .5, -.05, .05, .9, .05, 'metal'), B(-.05, .85, -.3, .05, .95, .05, 'metal')], visual: (g, gh) => led(g, gh, 0, .4, .31) },
      producing: m => m.state.t > 0,
      tick(m, dt) { if (m.state.t > 0) { m.state.t = Math.max(0, m.state.t - dt); m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = .7; api.audio.motor(m.pos, .4); } } setLed(m, m.state.t > 0 ? 0x40ff60 : 0x220000); },
      prompt: m => ({ text: `Удерживай E — крутить ручку (заряд ${Math.round(m.state.t)} с)`, hold: 3, holdKey: 'dyn' + m.pos.x.toFixed(2), onHoldTick: () => { m.snd = (m.snd || 0) - .016; if (m.snd < 0) { m.snd = .3; api.audio.creak(m.pos); } }, run() { m.state.t = Math.min(600, m.state.t + 60); E.player.st.energy = Math.max(0, E.player.st.energy - 3); api.quest.count('li.dynamo'); } }),
    });
    api.machines.register('mainstap', {
      name: 'Врезка в сеть', power: 1.5, range: 12, state: { on: true },
      build: { cost: { circuit: 2, wire: 4, steel: 1, rubber: 1 }, snap: .25, boxes: [B(-.25, 0, -.12, .25, 1.2, .12, 'metal'), B(-.03, 1.2, -.03, .03, 2.6, .03, 'pipe')], visual: (g, gh) => led(g, gh, 0, 1, .13) },
      producing: m => m.state.on && E.POWER.value > .8 && litNear(m.pos),
      tick(m, dt) { const p = def_tap.producing(m); setLed(m, p ? 0x40ff60 : m.state.on ? 0xffa020 : 0x220000); if (p) { m.snd = (m.snd || 0) - dt; if (m.snd <= 0) { m.snd = 3; api.audio.humBurst(m.pos); } E.dir.attention = clamp(E.dir.attention + dt * .002, 0, 1); } },
      prompt: m => `E — врезка в сеть: ${m.state.on ? 'отключить' : 'подключить'}` + (!litNear(m.pos) ? ' · рядом нет горящих светильников' : E.POWER.value <= .8 ? ' · в сети просадка' : ' · ток идёт (1.5)'),
      interact(m) { m.state.on = !m.state.on; api.audio[m.state.on ? 'powerUp' : 'click'](); if (m.state.on) api.quest.count('li.tap'); },
    });
    const def_tap = api.machines.get('mainstap');
    const litNear = p => { const gx = Math.floor(p.x / E.CELL), gz = Math.floor(p.z / E.CELL); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const f = E.fixtureAt(gx + dx, gz + dz); if (f && !f.broken && E.fixtureLit(f) && !E.salvaged.has(f.key)) return true; } return false; };
    // ---------------- storage & transfer
    const SKIP = new Set(['knife', 'screwdriver', 'crowbar', 'note']);
    api.machines.register('storage', {
      name: 'Хранилище', state: { items: {} },
      build: { cost: { plank: 3, steel: 2 }, snap: .25, boxes: [B(-.6, 0, -.35, .6, .08, .35, 'metal'), B(-.6, .08, -.35, .6, .9, -.3, 'metal'), B(-.6, .08, .3, .6, .9, .35, 'metal'), B(-.6, .08, -.35, -.55, .9, .35, 'metal'), B(.55, .08, -.35, .6, .9, .35, 'metal')] },
      prompt: m => { const n = Object.values(m.state.items || {}).reduce((a, b) => a + b, 0); return `E — хранилище (${n} шт.)`; },
      interact(m) { stRender(m); },
    });
    function stRender(m) {
      const it = m.state.items ||= {}, keys = Object.keys(it).filter(k => it[k] > 0);
      const html = keys.length ? keys.map(k => `<div>${ic(k)} ${esc(nm(k))} ×${it[k]}</div>`).join('') : '<p class="d">Пусто.</p>';
      const btn = [['⬆ Сложить материалы', () => { for (const s of [...api.inv.slots()]) { if (!s || SKIP.has(s.id) || E.ITEMS[s.id]?.use || E.ITEMS[s.id]?.onUse) continue; const n = api.inv.count(s.id); if (n && api.inv.take(s.id, n)) it[s.id] = (it[s.id] || 0) + n; } api.audio.cloth(.6); stRender(m); }]];
      for (const k of keys.slice(0, 14)) btn.push([`${ic(k)} ${nm(k)}`, () => { const n = Math.min(it[k], E.ITEMS[k]?.stack || 10), g = n - api.inv.add(k, n); it[k] -= g; if (it[k] <= 0) delete it[k]; api.audio.pickup(); stRender(m); }]);
      btn.push(['ЗАКРЫТЬ', () => E.closeDialog()]);
      E.openDialog('ХРАНИЛИЩЕ', html + '<p class="d">«Сложить» переносит всё, кроме еды, лекарств и инструментов. Кнопка предмета — забрать стопку.</p>', btn);
    }
    api.machines.register('sorter', {
      name: 'Перекладчик', state: {},
      build: { cost: { motor: 1, steel: 2, circuit: 1 }, snap: .25, boxes: [B(-.25, 0, -.25, .25, .6, .25, 'metal'), B(-.05, .6, -.05, .05, 1.2, .05, 'metal'), B(-.6, 1.15, -.04, .6, 1.22, .04, 'metal')], visual: (g, gh) => led(g, gh, 0, .4, .26) },
      tick(m, dt) {
        const pw = api.power.at(m.pos) >= 1; setLed(m, pw ? 0x40ff60 : 0x220000); if (!pw) return;
        if ((m.cd = (m.cd || 0) - dt) > 0) return; m.cd = 4;
        let store = null, best = 1e9; for (const o of E.Machines.list) if (o.def.id === 'storage') { const d = o.pos.distanceTo(m.pos); if (d < 4 && d < best) { best = d; store = o; } }
        if (!store) return; const it = store.state.items ||= {}; let moved = 0;
        for (const o of E.Machines.list) { if (o === store || o.pos.distanceTo(m.pos) > 4 || !o.state.out) continue; for (const [k, n] of Object.entries(o.state.out)) { it[k] = (it[k] || 0) + n; moved += n; delete o.state.out[k]; } }
        if (moved) { api.audio.scrape(m.pos); api.quest.count('li.sorted', moved); }
      },
      prompt: m => `Перекладчик · переносит готовое из машин (4 м) в ближайшее хранилище${api.power.at(m.pos) >= 1 ? '' : ' · нет питания'}`,
    });
    // ---------------- strong building pieces
    api.build.register('cwall', { name: 'Бетонная стена', wall: true, cost: { cblock: 3 }, snap: .5, boxes: [B(-1, 0, -.1, 1, 2.6, .1, 'concrete')] });
    api.build.register('brickwall', { name: 'Кирпичная стена', wall: true, cost: { brick: 6 }, snap: .5, boxes: [B(-1, 0, -.12, 1, 2.6, .12, 'concrete')] });
    api.build.register('insulpanel', { name: 'Утеплённая панель', wall: true, cost: { insul: 1, plank: 1 }, snap: .5, boxes: [B(-1, 0, -.06, 1, 2.6, .06, 'woodpanel')] });
    // убежище с утеплителем глушит шум
    let insT = 0, insul = false;
    api.on('update', dt => { if ((insT -= dt) <= 0) { insT = 1; insul = false; if (E.player.inShelter) for (const p of E.pieces) if (p.def.id === 'insulpanel' && p.pos.distanceTo(E.feetPos()) < 5) { insul = true; break; } } if (insul) E.player.noise *= Math.pow(.4, dt); });
    // ---------------- guide, notes
    api.notes.register('g_li_industry', { kind: 'guide', order: 31, t: 'Руководство: цех', b: 'Машины открывают окно по <b>E</b>: выбери рецепт — материалы уйдут в очередь, готовое забирай кнопкой.<br><br>• <b>Печь</b> (без тока): сталь, кирпич, уголь. Нужна растопка.<br>• <b>Дробилка</b>, <b>бетономешалка</b>, <b>ткацкий станок</b> — питание 1.<br>• <b>Плавильня</b> и <b>сборщик</b> — питание 2: два генератора, динамо или врезка в сеть.<br><br><b>Питание</b> складывается внутри одной сети. Генераторы и реле, стоящие в радиусе друг друга, образуют сеть. <b>Реле</b> переносит ток на 10 м.<br><b>Врезка в сеть</b> ворует ток у самих Закулисий (1.5), если рядом горит светильник — но гул от этого становится внимательнее.<br><b>Перекладчик</b> относит готовое из машин в <b>хранилище</b>.' });
    api.on('piece:create', p => { if (p.machine && ['furnace', 'crusher', 'smelter', 'mixer', 'loom', 'assembler'].includes(p.def.id) && E.game.playT > 1) api.notes.unlock('g_li_industry'); });
    // ---------------- quests · глава 4
    api.quests.chapter('ch4', { title: 'Глава 4 · Цех', order: 4, desc: 'Из мусора — материалы, из материалов — машины.' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    const has = id => () => [...E.pieces].some(p => p.def.id === id);
    const Q = (id, order, title, desc, check, reward, after) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch4' });
    Q('q_li_furnace', 30, 'Огонь', 'построй печь и выплавь сталь', cnt('li.make:steel', 1), { charcoal: 2 }, ['q_li_furn', 'q_power']);
    Q('q_li_brick', 31, 'Глина', 'обожги кирпич из грунта (разбери кадку)', cnt('li.make:brick', 1), { soil: 1 }, ['q_li_furnace']);
    Q('q_li_crush', 32, 'Жернова', 'построй дробилку и получи гипсовый порошок', cnt('li.make:grit', 1), { gypsum: 2 }, ['q_li_furnace']);
    Q('q_li_concrete', 33, 'Бетон', 'сделай бетонные блоки и поставь бетонную стену', () => has('cwall')(), { water: 2 }, ['q_li_crush']);
    Q('q_li_relay', 34, 'Проводка', 'построй реле', has('relay'), { wire: 2 }, ['q_li_crush']);
    Q('q_li_tap', 35, 'Чужой ток', 'подключи врезку в сеть рядом с горящим светильником', cnt('li.tap', 1), { circuit: 1 }, ['q_li_relay']);
    Q('q_li_loom', 36, 'Ткачество', 'сделай ткань на ткацком станке', cnt('li.make:cloth', 1), { felt: 2 }, ['q_li_crush']);
    Q('q_li_motor', 37, 'Сердце машины', 'собери электромотор на сборщике', cnt('li.make:motor', 1), { steel: 2 }, ['q_li_tap']);
    Q('q_li_alloy', 38, 'Звонкий металл', 'выплавь сплав и линзу в плавильне', () => ({ n: Math.min(1, E.Quests.get('li.make:alloy')) + Math.min(1, E.Quests.get('li.make:lens')), of: 2 }), { cell: 1 }, ['q_li_motor']);
    Q('q_li_auto', 39, 'Автоматизация', 'перекладчик отнёс в хранилище 10 предметов', cnt('li.sorted', 10), { motor: 1 }, ['q_li_motor']);
  },
});
