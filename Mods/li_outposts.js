// =====================================================================
//  Liminal Industry · «Аванпосты M.E.G.»
//  Брошенные лагеря экспедиции: свет, припасы, радиостанция с бюллетенями.
// =====================================================================
Backrooms.mod({
  id: 'li.outposts', name: 'Liminal Industry · Аванпосты M.E.G.', version: '1.0.0',
  requires: ['core.industry@>=1.0'],
  description: 'Редкие брошенные лагеря M.E.G.: горящая лампа, ящики с припасами и радиостанция с бюллетенями (лор).',
  init(api) {
    const { V3 } = api.util, E = api.engine, THREE = api.THREE;
    const cfg = api.settings({ chance: 1 }, { schema: { chance: { label: 'Частота аванпостов', options: { 'Редко': .5, 'Обычно': 1, 'Часто': 2.5 } } } });
    const BUL = [
      ['meg1', 'Бюллетень M.E.G. №1', 'Всем отрядам. Уровень 0 стабилен. Запасы миндальной воды пополнять из автоматов в секторе «Офис». Не спать под мерцающими лампами.'],
      ['meg2', 'Бюллетень M.E.G. №2', 'Подтверждено: мебель восстанавливается, если сектор оставлен без наблюдения дольше суток. Разбирать можно. Металл настоящий, дерево — почти.'],
      ['meg3', 'Бюллетень M.E.G. №3', 'Потеряна связь с аванпостом «Ламповщик-4». Последняя передача: «ковролин тёплый, ковролин дышит». Сектор закрыт.'],
      ['meg4', 'Бюллетень M.E.G. №4', 'Инженерный отдел: врезка в местную сеть работает, но резко повышает активность сущностей. Использовать короткими сеансами.'],
      ['meg5', 'Бюллетень M.E.G. №5', 'Обнаружены «тонкие места». Компас инженера Левченко реагирует на них с 40 метров. Строительство конструкций на тонких местах — только по протоколу 7.'],
      ['meg6', 'Бюллетень M.E.G. №6', 'Это последняя передача. Мы уходим через раму. Если она ещё стоит — она работает. Не ждите нас. Не ждите никого.'],
    ];
    BUL.forEach(([id, t, b], i) => api.notes.register(id, { kind: 'lore', order: 80 + i, t, b, hidden: true }));
    const spots = new Map(), lamps = new Map();
    api.structures.register('li.outpost', {
      zones: ['lobby', 'office', 'garage', 'industrial', 'electrical', 'school', 'mall', 'dark', 'hall'], salt: 9601,
      chance: (z, gx, gz) => Math.hypot(gx, gz) < 6 ? 0 : (z.key === 'dark' ? .006 : .0025) * cfg.chance,
      cell(ctx, c) {
        const r = c.rng, x = c.mx, z = c.mz, M = ctx.gb('metal'), W = ctx.gb('wood');
        // стол с радиостанцией
        ctx.furn('desk', 'походный стол', `og:d:${c.gx},${c.gz},${ctx.vr}`, () => { W.box(x - .7, .7, z - .35, x + .7, .74, z + .35); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box(x + sx * .65 - .02, 0, z + sz * .3 - .02, x + sx * .65 + .02, .7, z + sz * .3 + .02); ctx.colBox(x - .7, 0, z - .35, x + .7, .74, z + .35); });
        const rx = x + .3, rz = z;
        ctx.gb('darkp').box(rx - .2, .74, rz - .12, rx + .2, .98, rz + .12); M.box(rx + .14, .98, rz - .01, rx + .16, 1.4, rz + .01);
        const col = ctx.colBox(rx - .2, .74, rz - .12, rx + .2, .98, rz + .12);
        spots.set(c.key(9), { p: V3(rx, .9, rz), col, ch: ctx.cx + ',' + ctx.cz });
        // ящики с припасами
        for (let i = 0; i < 2; i++) { const s = .3, px = x - 1.1 + i * .7, pz = z + .9; ctx.furn('crate', 'ящик M.E.G.', `og:c:${c.gx},${c.gz},${i},${ctx.vr}`, () => { ctx.gb('green').box(px - s, 0, pz - s, px + s, s * 1.6, pz + s); ctx.colBox(px - s, 0, pz - s, px + s, s * 1.6, pz + s); }); }
        const LOOT = ['bandage', 'fuel', 'battery', 'almond', 'water', 'pills', 'can', 'scrap', 'wire'];
        for (let i = 0; i < 2 + (r() * 3 | 0); i++) { const id = LOOT[r() * LOOT.length | 0]; if (E.ITEMS[id]) ctx.spawn(id, V3(x - 1.1 + (i % 2) * .7, .6, z + .9), c.key(i)); }
        if (r() < .5) ctx.spawn('note', V3(x - .3, .8, z), c.key(8));
        // спальник
        ctx.gb('bed').box(x - 1.2, 0, z - 1.3, x + .4, .1, z - .7);
        // лампа на стойке
        M.box(x + 1.05, 0, z - .05, x + 1.1, 1.5, z); const lamp = { x: x + 1.07, y: 1.55, z: z - .02, color: 0xffd9a0, mult: .5, on: r() < .7 };
        const old = lamps.get(c.key(7)); if (old) E.removeLamp(old.l);
        lamps.set(c.key(7), { l: E.addLamp(lamp), ch: ctx.cx + ',' + ctx.cz });
      },
    });
    api.on('chunk:unload', ch => {
      for (const [k, s] of spots) if (s.ch === ch.key) spots.delete(k);
      for (const [k, o] of lamps) if (o.ch === ch.key) { E.removeLamp(o.l); lamps.delete(k); }
    });
    api.on('world:clear', () => { for (const o of lamps.values()) E.removeLamp(o.l); lamps.clear(); spots.clear(); });
    api.interactions.register('li.radio', {
      priority: 3,
      test(h) {
        for (const [k, s] of spots) if (s.col.handle === h.collider.handle || s.p.distanceTo(h.point) < .35) {
          const next = BUL.find(([id]) => !api.notes.has(id));
          return { text: next ? 'E — включить радиостанцию M.E.G.' : 'Радиостанция: только шипение', run() {
            api.audio.crackle(s.p, 2); if (!next) { api.say('Шипение. На секунду — чей-то смех. Потом снова шипение.', 3); return; }
            setTimeout(() => { api.notes.give(next[0]); api.quest.count('li.meg'); }, 900);
          } };
        }
        return null;
      },
    });
    api.quests.register('q_li_meg', { order: 15, title: 'Чужой лагерь', desc: 'найди аванпост M.E.G. и включи радиостанцию', check: (a, q) => q.get('li.meg') > 0, reward: { bandage: 1, fuel: 1 }, after: ['q_look'], chapter: 'ch1' });
  },
});
