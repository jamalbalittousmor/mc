// Пример: структура генерации, взаимодействие, сохранение данных мода, зависимость, патч и фильтр.
Backrooms.mod({
  id: 'example.vending', name: 'Торговые автоматы', version: '1.1.0',
  requires: ['core.industry@>=1.0'], loadAfter: ['example.radio'],
  description: 'В офисах и лобби стоят старые автоматы. Удар металлоломом — и что-то выпадает.',
  init(api) {
    const { V3 } = api.util, E = api.engine;
    api.items.patch('almond', d => { d.desc += ' Иногда продаётся в автоматах.'; });         // изменить существующий предмет
    api.filter('loot:weights', (w, zone) => { if (zone.key === 'office') w.energy = (w.energy || 1) * 1.5; return w; }); // поменять таблицу лута
    const spots = new Map(); // ключ автомата -> позиция
    api.structures.register('vending', {
      zones: ['lobby', 'office'], chance: .01, salt: 9101,
      cell(ctx, c) {
        const x = c.mx + 1.2, z = c.mz, M = ctx.gb('metal');
        M.box(x - .4, 0, z - .35, x + .4, 1.8, z + .35); ctx.colBox(x - .4, 0, z - .35, x + .4, 1.8, z + .35);
        const glass = new api.THREE.Mesh(new api.THREE.PlaneGeometry(.5, .9), new api.THREE.MeshBasicMaterial({ color: 0x9ad0ff }));
        glass.position.set(x - .405, 1.05, z); glass.rotation.y = -Math.PI / 2; glass.userData.noAO = true; ctx.add(glass);
        spots.set(c.key(0), V3(x - .4, 1, z));
      },
    });
    api.on('chunk:unload', ch => { for (const [k, p] of spots) if (Math.floor(p.x / E.CS) === ch.cx && Math.floor(p.z / E.CS) === ch.cz) spots.delete(k); });
    api.interactions.register('vending', {
      test(h) {
        for (const [k, p] of spots) if (p.distanceTo(h.point) < 1) {
          if ((api.data.used || []).includes(k)) return { text: 'Автомат пуст', run() { api.audio.click(); } };
          return { text: api.inv.count('scrap') ? 'E — ударить автомат куском металла' : 'Автомат. Нужен металлолом, чтобы его «уговорить»', run() {
            if (!api.inv.take('scrap', 1)) { api.audio.click(); return; }
            (api.data.used ||= []).push(k); api.audio.slam(p); E.player.noise += .3;
            E.spawnItem(Math.random() < .5 ? 'almond' : 'energy', p.clone().add(V3(-.3, -.6, 0)), V3(-1.5, 0, 0));
          } };
        }
        return null;
      },
    });
  },
});
