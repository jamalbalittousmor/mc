// =====================================================================
//  Liminal Industry · «Уровни»
//  Level Fun =) (с третьего уровня) и «Огни выключены» (с четвёртого).
// =====================================================================
Backrooms.mod({
  id: 'li.levels', name: 'Liminal Industry · Новые уровни', version: '1.0.0',
  requires: ['core.industry@>=1.0'],
  description: 'Зоны «Level Fun =)» (с 3-го уровня: шарики, торт, весёлые обои) и «Огни выключены» (с 4-го уровня: почти полная темнота).',
  init(api) {
    const { V3, clamp } = api.util, E = api.engine, THREE = api.THREE;
    // ---------------- Level Fun
    api.zones.register('fun', {
      name: 'Уровень Fun =)', layout: 'rooms', roomMax: 8, gapP: .3, openP: .5, extraP: .3, halfP: .1, H: 2.9, pillarP: 0, pillarS: .4,
      lightP: .95, lightGrid: 1, brokenP: .02, flickerP: .02, doorObjP: .1, switchP: .2, fountainP: 0, dirt: .02, color: 0xfff0e0, mat: 'yellow',
      wallK: 'funW', floorK: 'floor', carpet: 0xd8a8a0, ceilK: 'ceil', fix: 'panel', fog: [0x150c0c, .03], haze: 0x9a6a6a, reverb: .25,
      roomTypes: [['lounge', 3], ['empty', 6]], weight: .04, minLevel: 3, levelGrow: .15,
    });
    api.items.register('cake', { name: 'Кусок торта', icon: '🍰', stack: 4, desc: 'Ванильный, с розовым кремом. Свежий. Слишком свежий.', use: { hunger: 32, sanity: -10 }, sound: 'eat', useText: 'Вкусно. Где-то за стеной кто-то радостно хлопает в ладоши.', mesh: ['box', [.1, .07, .08], 0xf2c8d0], loot: .002, lootZones: { fun: 40 } });
    const BAL_COL = [0xe84a5a, 0xf2c040, 0x4a9ae8, 0x7ad860, 0xe87ad0], bmat = {}, bgeo = new THREE.SphereGeometry(.17, 12, 10).scale(1, 1.2, 1), sgeo = new THREE.CylinderGeometry(.002, .002, 1, 3).translate(0, .5, 0);
    const mat = c => bmat[c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .35, emissive: new THREE.Color(c).multiplyScalar(.35) });
    const balloons = [];
    api.structures.register('li.party', {
      zones: ['fun'], chance: .05, salt: 9501,
      cell(ctx, c) {
        const r = c.rng, x = c.mx, z = c.mz, n = 3 + (r() * 4 | 0);
        for (let i = 0; i < n; i++) {
          const g = new THREE.Group(), b = new THREE.Mesh(bgeo, mat(BAL_COL[r() * BAL_COL.length | 0])), h = ctx.H - .25 - r() * .3, s = new THREE.Mesh(sgeo, mat(0xdddddd));
          b.userData.noAO = s.userData.noAO = true; s.scale.y = h - .3; b.position.y = h; g.add(b, s); g.position.set(x + (r() - .5) * 2.4, 0, z + (r() - .5) * 2.4); g.userData.ph = r() * 6.28; ctx.add(g); balloons.push(g);
        }
        if (r() < .6) ctx.furn('desk', 'праздничный стол', `party:${c.gx},${c.gz},${ctx.vr}`, () => { const W = ctx.gb('wood'); W.box(x - .6, .72, z - .4, x + .6, .76, z + .4); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.box(x + sx * .55 - .03, 0, z + sz * .35 - .03, x + sx * .55 + .03, .72, z + sz * .35 + .03); ctx.colBox(x - .6, 0, z - .4, x + .6, .76, z + .4); });
        if (r() < .7) ctx.spawn('cake', V3(x + (r() - .5) * .6, .85, z), c.key(0));
      },
    });
    api.on('chunk:unload', ch => { for (let i = balloons.length - 1; i >= 0; i--) if (!balloons[i].parent || balloons[i].parent === ch.group) balloons.splice(i, 1); });
    api.on('world:clear', () => { balloons.length = 0; });
    api.on('update', dt => { const t = E.game.playT || 0; for (const g of balloons) { g.rotation.y = Math.sin(t * .3 + g.userData.ph) * .15; g.children[0].position.x = Math.sin(t * .5 + g.userData.ph) * .04; } });
    let funT = 0;
    api.on('update', dt => {
      if ((funT -= dt) > 0 || E.game.state !== 'play') return; funT = 1;
      const z = E.zoneAt(E.feetPos().x, E.feetPos().z); if (z.key !== 'fun') return;
      if (!api.data.funSeen) { api.data.funSeen = true; api.notes.unlock('li_fun1'); api.say('Пахнет ванилью и воздушными шариками. Где-то далеко играет музыка.', 5); }
      if (Math.random() < .04) { api.audio.voice?.(E.feetPos().add(V3((Math.random() - .5) * 20, 1.5, (Math.random() - .5) * 20))); }
      if (Math.random() < .02) api.say(['«Давай повеселимся =)»', 'Где-то хлопает шарик. Потом второй. Ближе.', 'Кто-то поёт «С днём рождения». Голос — твой.'][Math.random() * 3 | 0], 4);
    });
    api.notes.register('li_fun1', { kind: 'lore', order: 90, t: 'Открытка', b: 'Розовая открытка, внутри фломастером: «ДАВАЙ ПОВЕСЕЛИМСЯ =)». Ниже — мелко, другим почерком: «не ешь торт. не смотри на тех, кто улыбается. не беги — они любят, когда бегут».' });
    // ---------------- Lights Out
    api.zones.register('lightsout', {
      name: 'Уровень 6 · «Огни выключены»', layout: 'maze', loopP: .25, doorP: .15, H: 2.7, pillarP: 0, pillarS: .4,
      lightP: .08, lightGrid: 1, brokenP: .6, flickerP: .3, doorObjP: .1, switchP: 0, fountainP: 0, dirt: .5, color: 0xffd8a0, mat: 'yellow',
      ceilK: 'ceilD', fix: 'bulb', fog: [0x020201, .085], haze: 0x14100a, reverb: .5, weight: .03, minLevel: 4, levelGrow: .25,
    });
    let loT = 0;
    api.on('update', dt => {
      if ((loT -= dt) > 0 || E.game.state !== 'play') return; loT = 1;
      const z = E.zoneAt(E.feetPos().x, E.feetPos().z); if (z.key !== 'lightsout') return;
      if (!api.data.loSeen) { api.data.loSeen = true; api.notes.unlock('li_lo1'); api.say('Здесь нет гула. Совсем. Только темнота и твоё дыхание.', 5); }
      if (!E.player.flash.on && Math.random() < .05) { api.audio.phantomSteps?.(E.feetPos(), E.camera.getWorldDirection(V3()).negate(), 3); E.addPanic?.(.03); }
    });
    api.notes.register('li_lo1', { kind: 'lore', order: 91, t: 'Надпись мелом', b: 'На стене, на уровне колена: «ФОНАРЬ НЕ ВЫКЛЮЧАТЬ. ЕСЛИ ВЫКЛЮЧИЛСЯ — НЕ ДВИГАТЬСЯ. ОНИ ИДУТ НА ЗВУК, А НЕ НА СВЕТ»' });
  },
});
