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
    // ---------------- surfaces: обои / панели / штукатурка / ковролин / линолеум / потолочная плитка
    // Что разбирается, определяется по ВИДИМОМУ материалу в точке (E.visualHit), а не по зоне:
    // плинтус, рама светильника, бетон, колонна без обоев — не предлагаются. Размер дыры подбирается
    // под поверхность (пробы лучами): не вылезает за угол, на плинтус, в дверной проём и на соседний материал.
    const SURF = {
      wall: { t: 3, out: { paper: [1, 2], cloth: [0, 1] }, text: 'содрать обои', soft: true, patch: 'paper' },
      wallD: { t: 3, out: { paper: [1, 1], cloth: [0, 1] }, text: 'содрать сырые обои', soft: true, patch: 'paper' },
      hotelW: { t: 3, out: { paper: [1, 2], cloth: [0, 1] }, text: 'содрать обои', soft: true, patch: 'paper', yMin: 1.12 },
      hotelWood: { t: 4, tool: 'crowbar', out: { plank: [1, 1] }, text: 'отодрать деревянную панель', patch: 'wood', yMax: 1.04, base: 'hotelW' },
      funW: { t: 3, out: { paper: [2, 2] }, text: 'содрать весёлые обои', soft: true, patch: 'paper' },
      woodpanel: { t: 4, tool: 'crowbar', out: { plank: [1, 1] }, text: 'отодрать панель', patch: 'wood' },
      whitewall: { t: 5, need: 'crowbar', out: { gypsum: [1, 2] }, text: 'отбить штукатурку', patch: 'plaster' },
      floor: { t: 4, need: 'knife', out: { felt: [1, 1] }, text: 'вырезать кусок ковролина', soft: true, patch: 'carpet' },
      floorD: { t: 4, need: 'knife', out: { felt: [1, 1] }, text: 'вырезать мокрый ковролин', soft: true, patch: 'carpet' },
      hotelC: { t: 4, need: 'knife', out: { felt: [1, 2] }, text: 'вырезать ковёр', soft: true, patch: 'carpet' },
      lino: { t: 3, need: 'knife', out: { plastic: [1, 1] }, text: 'срезать линолеум', soft: true, patch: 'lino' },
      ceil: { t: 3, out: { gypsum: [1, 1] }, text: 'снять потолочную плитку', patch: 'ceil' },
      ceilD: { t: 3, out: { gypsum: [1, 1], paper: [0, 1] }, text: 'снять размокшую плитку', patch: 'ceil' },
    };
    const surfKey = (vk, y) => vk === 'hotelW' && y < 1.08 ? 'hotelWood' : vk;
    // ---- процедурные текстуры дыр (рваный край, прозрачность снаружи)
    const PT = {}, VARS = 3;
    const ctex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); draw(g, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const rngOf = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // замкнутый контур по периметру с «рваным» отступом: inset — базовый отступ, amp — сила рваности
    function tornPath(g, S, r, inset, amp, freq) {
      const pts = [], N = 120, ph = [r() * 6, r() * 6, r() * 6];
      for (let i = 0; i < N; i++) {
        const t = i / N, side = Math.floor(t * 4), f = t * 4 - side;
        const n = Math.sin(t * freq * 6.283 + ph[0]) * .5 + Math.sin(t * freq * 2.7 * 6.283 + ph[1]) * .3 + (r() - .5) * .9;
        const d = inset + Math.max(0, n) * amp + r() * amp * .25;
        let x, y; if (side === 0) { x = f * S; y = d; } else if (side === 1) { x = S - d; y = f * S; } else if (side === 2) { x = S - f * S; y = S - d; } else { x = d; y = S - f * S; }
        pts.push([clamp(x, d, S - d), clamp(y, d, S - d)]);
      }
      return pathOf(g, pts);
    }
    const pathOf = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); return pts; };
    const speck = (g, S, r, n, cols, sz = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(r() * S, r() * S, sz * r() + .6, sz * r() + .6); } };
    const DRAW = {
      // штукатурка/гипсокартон под обоями: следы клея, полосы от шпателя, клочки бумаги и светлая изнанка по краю
      paper(g, S, r) {
        const pts = tornPath(g, S, r, 10, 26, 3 + r() * 3); g.save(); g.clip();
        g.fillStyle = '#a99e84'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 7; i++) { const gr = g.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 40 + r() * 70); gr.addColorStop(0, 'rgba(150,120,60,.28)'); gr.addColorStop(1, 'rgba(150,120,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
        g.strokeStyle = 'rgba(80,70,50,.18)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { const y = r() * S; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * .3, y + (r() - .5) * 20, S * .6, y + (r() - .5) * 20, S, y + (r() - .5) * 10); g.stroke(); }
        g.fillStyle = 'rgba(70,60,40,.25)'; g.fillRect(S * (.3 + r() * .4), 0, 2, S); // стык листов
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(222,212,178,.9)'; g.beginPath(); const x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) g.lineTo(x + (r() - .5) * 26, y + (r() - .5) * 22); g.closePath(); g.fill(); }
        speck(g, S, r, 900, ['rgba(60,50,35,.25)', 'rgba(230,220,190,.18)']);
        g.restore();
        pathOf(g, pts); // светлая изнанка бумаги по рваному краю
        g.lineWidth = 5; g.strokeStyle = 'rgba(236,228,204,.95)'; g.stroke(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(90,75,40,.5)'; g.stroke();
      },
      // за деревянной панелью: тёмная полость, стойки каркаса, гвозди
      wood(g, S, r) {
        const pts = tornPath(g, S, r, 6, 6, 9); g.save(); g.clip();
        const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#0d0906'); gr.addColorStop(1, '#1c140c'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
        for (const x of [S * (.15 + r() * .15), S * (.65 + r() * .15)]) { g.fillStyle = '#5b4128'; g.fillRect(x, 0, 26, S); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 22, 0, 4, S); g.fillStyle = '#9a9a92'; for (let y = 20; y < S; y += 60 + r() * 30) g.fillRect(x + 10, y, 4, 4); }
        g.fillStyle = '#3c2a18'; g.fillRect(0, S * .5, S, 16);
        speck(g, S, r, 500, ['rgba(120,90,50,.25)', 'rgba(0,0,0,.3)']);
        g.restore(); pathOf(g, pts); g.lineWidth = 3; g.strokeStyle = 'rgba(150,105,60,.9)'; g.stroke();
      },
      // отбитая штукатурка: кирпич, сколы с толщиной слоя
      plaster(g, S, r) {
        const pts = tornPath(g, S, r, 14, 34, 4 + r() * 3); g.save(); g.clip();
        g.fillStyle = '#7d4a36'; g.fillRect(0, 0, S, S);
        for (let y = 0, row = 0; y < S; y += 30, row++) for (let x = (row & 1) * -32; x < S; x += 64) { g.fillStyle = `rgb(${120 + r() * 40 | 0},${62 + r() * 20 | 0},${44 + r() * 14 | 0})`; g.fillRect(x + 2, y + 2, 60, 26); }
        speck(g, S, r, 1200, ['rgba(40,20,10,.3)', 'rgba(200,170,150,.2)']);
        g.restore(); pathOf(g, pts); g.lineWidth = 7; g.strokeStyle = 'rgba(205,200,188,.95)'; g.stroke(); g.lineWidth = 2; g.strokeStyle = 'rgba(60,55,50,.6)'; g.stroke();
      },
      // вырезанный ковролин: бетонная стяжка, дуги клея от шпателя, лохматый край
      carpet(g, S, r) {
        const pts = tornPath(g, S, r, 8, 4, 12); g.save(); g.clip();
        g.fillStyle = '#7a766c'; g.fillRect(0, 0, S, S); speck(g, S, r, 2200, ['rgba(40,40,36,.35)', 'rgba(170,165,150,.3)'], 2.4);
        g.strokeStyle = 'rgba(150,125,60,.35)'; g.lineWidth = 3; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(r() * S, r() * S, 20 + r() * 30, r() * 6, r() * 6 + 2); g.stroke(); }
        g.restore(); pathOf(g, pts); g.lineWidth = 3; g.strokeStyle = 'rgba(40,34,22,.85)'; g.stroke();
        g.strokeStyle = 'rgba(70,58,34,.8)'; g.lineWidth = 1; for (const [x, y] of pts) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 8, y + (r() - .5) * 8); g.stroke(); }
      },
      // срезанный линолеум: стяжка с точками клея по сетке
      lino(g, S, r) {
        const pts = tornPath(g, S, r, 6, 3, 14); g.save(); g.clip();
        g.fillStyle = '#85827a'; g.fillRect(0, 0, S, S); speck(g, S, r, 1600, ['rgba(40,40,36,.3)', 'rgba(180,175,160,.3)']);
        g.fillStyle = 'rgba(120,100,50,.35)'; for (let y = 10; y < S; y += 22) for (let x = 10; x < S; x += 22) { g.beginPath(); g.arc(x + (r() - .5) * 4, y + (r() - .5) * 4, 4 + r() * 2, 0, 7); g.fill(); }
        g.restore(); pathOf(g, pts); g.lineWidth = 2; g.strokeStyle = 'rgba(30,30,28,.8)'; g.stroke();
      },
      // снятая плитка: чернота над потолком, край соседней плитки, тень воздуховода и кабель
      ceil(g, S, r) {
        g.fillStyle = '#060504'; g.fillRect(0, 0, S, S);
        const gr = g.createRadialGradient(S * .5, S * .5, 10, S * .5, S * .5, S * .7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,36,30,.5)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
        if (r() < .7) { g.fillStyle = 'rgba(38,36,32,.9)'; const y = S * (.2 + r() * .5); g.fillRect(0, y, S, 46); g.fillStyle = 'rgba(70,66,58,.6)'; g.fillRect(0, y, S, 3); }
        g.strokeStyle = 'rgba(28,26,22,1)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, S * r()); g.bezierCurveTo(S * .3, S * r(), S * .6, S * r(), S, S * r()); g.stroke();
        g.fillStyle = 'rgba(120,115,100,.55)'; g.fillRect(0, 0, S, 5); g.fillRect(0, 0, 5, S); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(S - 6, 0, 6, S); g.fillRect(0, S - 6, S, 6);
      },
    };
    const patchMat = (type, v) => {
      const k = type + v; if (PT[k]) return PT[k];
      const tex = ctex((g, S) => DRAW[type](g, S, rngOf(1000 + v * 7919 + type.length * 31)));
      const m = E.withBake(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: .5, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      return PT[k] = m;
    };
    // ---- геометрия плоскости: ось нормали и касательные (мир здесь «кубический»: все поверхности по осям)
    const AX = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
    const axOf = n => { const a = Math.abs(n.x), b = Math.abs(n.y), c = Math.abs(n.z); return a >= b && a >= c ? (n.x > 0 ? 'px' : 'nx') : b >= c ? (n.y > 0 ? 'py' : 'ny') : (n.z > 0 ? 'pz' : 'nz'); };
    const basis = ax => { const n = V3(...AX[ax]); if (ax[1] === 'y') return { n, u: V3(1, 0, 0), v: V3(0, 0, 1) }; return { n, u: V3(-n.z, 0, n.x), v: V3(0, 1, 0) }; };
    const planeOf = ax => ax[1] === 'y' ? (ax[0] === 'p' ? 'floor' : 'ceil') : 'wall';
    const R2 = v => Math.round(v * 100) / 100;
    // ---- загруженные дыры: меш + прямоугольник в координатах плоскости
    const patches = new Map(); // key -> { mesh, ax, d, u0,u1,v0,v1 (мировые проекции на u,v), cx, cz }
    function insidePatch(ax, p, pad = .01) {
      const { n, u, v } = basis(ax), d = p.dot(n), pu = p.dot(u), pv = p.dot(v);
      for (const r of patches.values()) if (r.ax === ax && Math.abs(r.d - d) < .04 && pu > r.u0 - pad && pu < r.u1 + pad && pv > r.v0 - pad && pv < r.v1 + pad) return true;
      return false;
    }
    function parseKey(key) {
      if (key.startsWith('s2:')) { const a = key.slice(3).split(','); if (a.length < 10) return null; const [k, x, y, z, ax, u0, u1, v0, v1, vr] = a; const s = SURF[k]; if (!s || !AX[ax]) return null; return { k, p: V3(+x, +y, +z), ax, u0: +u0, u1: +u1, v0: +v0, v1: +v1, vr: +vr || 0 }; }
      if (key.startsWith('s:')) { // старый формат: точка + нормаль, без прямоугольника
        const a = key.slice(2).split(',').map(Number); if (a.length < 6 || a.some(isNaN)) return null;
        const ax = axOf(V3(a[3], a[4], a[5])), pl = planeOf(ax);
        return { k: pl === 'wall' ? 'wall' : pl === 'floor' ? 'floor' : 'ceil', p: V3(a[0], a[1], a[2]), ax, u0: -.27, u1: .27, v0: pl === 'wall' ? -.35 : -.3, v1: pl === 'wall' ? .35 : .3, vr: Math.abs(a[0] * 7 + a[2] * 13 | 0) % VARS };
      }
      return null;
    }
    function addPatch(key) {
      if (patches.has(key)) return; const P = parseKey(key); if (!P) return;
      const s = SURF[P.k], { n, u, v } = basis(P.ax), c = P.p.clone().addScaledVector(n, .004);
      const corner = (a, b) => c.clone().addScaledVector(u, a).addScaledVector(v, b);
      const q = [corner(P.u0, P.v0), corner(P.u1, P.v0), corner(P.u1, P.v1), corner(P.u0, P.v1)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(q.flatMap(p => [p.x, p.y, p.z]), 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([...AX[P.ax], ...AX[P.ax], ...AX[P.ax], ...AX[P.ax]], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      // порядок обхода — лицом по нормали
      const fwd = V3().subVectors(q[1], q[0]).cross(V3().subVectors(q[2], q[0])).dot(n) > 0; g.setIndex(fwd ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, patchMat(s.patch, P.vr % VARS)); m.userData.noAO = true; m.receiveShadow = true; m.renderOrder = 1;
      E.scene.add(m); E.bakeVertsWithProbe(g, m);
      const pu = P.p.dot(u), pv = P.p.dot(v);
      patches.set(key, { mesh: m, ax: P.ax, d: P.p.dot(n), u0: pu + P.u0, u1: pu + P.u1, v0: pv + P.v0, v1: pv + P.v1, cx: Math.floor(P.p.x / E.CS), cz: Math.floor(P.p.z / E.CS), p: P.p });
    }
    const dropPatch = (k, r) => { E.scene.remove(r.mesh); r.mesh.geometry.dispose(); patches.delete(k); };
    const clearPatches = () => { for (const [k, r] of patches) dropPatch(k, r); };
    const loadPatches = (ch) => { for (const k of E.salvaged) if (k.startsWith('s:') || k.startsWith('s2:')) { const P = parseKey(k); if (P && (!ch || (Math.floor(P.p.x / E.CS) === ch.cx && Math.floor(P.p.z / E.CS) === ch.cz))) addPatch(k); } };
    api.on('chunk:load', ch => loadPatches(ch));
    api.on('chunk:unload', ch => { for (const [k, r] of patches) if (r.cx === ch.cx && r.cz === ch.cz) dropPatch(k, r); });
    api.on('world:clear', clearPatches);
    api.on('game:load', () => { clearPatches(); loadPatches(null); });
    api.on('level:restore', () => { clearPatches(); loadPatches(null); });
    api.on('bake:rebake', e => { for (const r of patches.values()) if (Math.abs(r.p.x - e.x) < e.r + 1 && Math.abs(r.p.z - e.z) < e.r + 1) E.bakeVertsWithProbe(r.mesh.geometry, r.mesh); });
    // ---- подбор прямоугольника дыры под поверхность
    const _o = V3(), _p = V3();
    function probeOK(k, s, ax, c, a, b) {
      const { n, u, v } = basis(ax);
      _p.copy(c).addScaledVector(u, a).addScaledVector(v, b);
      if (s.yMin && _p.y < s.yMin) return false; if (s.yMax && _p.y > s.yMax) return false;
      if (ax[1] !== 'y' && (_p.y < .1)) return false;
      if (insidePatch(ax, _p)) return false;
      _o.copy(_p).addScaledVector(n, .06);
      const h = E.visualRay(_o, n.clone().negate(), 0, .12);
      return !!h && surfKey(h.kind, _p.y) === k && Math.abs(h.dist - .06) < .015;
    }
    function fitRect(k, s, ax, c) {
      const pl = planeOf(ax);
      if (pl === 'ceil') { // целая плитка 0.6×0.6 по сетке потолка
        const i = .02, h = .3 - i, ok = [[0, 0], [-h, -h], [h, -h], [h, h], [-h, h], [0, -h], [0, h], [-h, 0], [h, 0]].every(([a, b]) => probeOK(k, s, ax, c, a, b));
        return ok ? { u0: -h, u1: h, v0: -h, v1: h } : null;
      }
      const H = pl === 'wall' ? [.3, .37] : [.3, .36], ST = .05, ext = [0, 0, 0, 0];
      if (!probeOK(k, s, ax, c, 0, 0)) return null;
      // вдоль осей от центра до первой «чужой» точки
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([du, dv], i) => { const lim = du ? H[0] : H[1]; let e = 0; for (let t = ST; t <= lim + 1e-6; t += ST) { if (!probeOK(k, s, ax, c, du * t, dv * t)) break; e = t; } ext[i] = e; });
      // края прямоугольника целиком: если где-то на ребре другой материал — подрезаем ребро
      for (let it = 0; it < 8; it++) {
        const [up, um, vp, vm] = ext; let bad = -1;
        const edges = [[up, null], [-um, null], [null, vp], [null, -vm]];
        for (let e = 0; e < 4 && bad < 0; e++) for (let j = 0; j <= 4; j++) {
          const t = j / 4, a = edges[e][0] ?? lerp(-um, up, t), b = edges[e][1] ?? lerp(-vm, vp, t);
          if (!probeOK(k, s, ax, c, a * .98, b * .98)) { bad = e; break; }
        }
        if (bad < 0) break; ext[bad] = Math.max(0, ext[bad] - ST);
      }
      const w = ext[0] + ext[1], hh = ext[2] + ext[3];
      if (w < .2 || hh < .2) return null;
      return { u0: -ext[1], u1: ext[0], v0: -ext[3], v1: ext[2] };
    }
    // кандидат под прицелом (кэш: пробы недешёвые, а тест зовётся каждый кадр)
    const candCache = new Map();
    function candidate(h) {
      const vh = E.visualHit(h); if (!vh) return null;
      const k = surfKey(vh.kind, vh.point.y), s = SURF[k]; if (!s) return null;
      const ax = axOf(vh.normal), pl = planeOf(ax); if (pl !== planeOf(axOf(h.normal))) return null;
      if ((pl === 'wall') !== (s.patch !== 'carpet' && s.patch !== 'lino' && s.patch !== 'ceil')) return null; // обои на полу не бывают
      if (pl === 'ceil' && s.patch !== 'ceil') return null; if (pl === 'floor' && s.patch !== 'carpet' && s.patch !== 'lino') return null;
      const c = vh.point.clone();
      if (pl === 'ceil') { c.x = Math.floor(c.x / .6) * .6 + .3; c.z = Math.floor(c.z / .6) * .6 + .3; }
      else if (insidePatch(ax, c, .02)) return null;
      const ck = k + ax + (pl === 'ceil' ? c.x.toFixed(2) + ',' + c.z.toFixed(2) : Math.round(c.x * 8) + ',' + Math.round(c.y * 8) + ',' + Math.round(c.z * 8)) + ':' + patches.size;
      if (candCache.has(ck)) return candCache.get(ck);
      if (pl !== 'ceil') { const { u, v } = basis(ax); /* привязка к сетке 1/8 м — стабильный holdKey */ const pu = Math.round(c.dot(u) * 8) / 8 - c.dot(u), pv = Math.round(c.dot(v) * 8) / 8 - c.dot(v); c.addScaledVector(u, pu).addScaledVector(v, pv); }
      const rect = fitRect(k, s, ax, c), res = rect ? { k, s, ax, c, rect, ck } : { k, s, fail: true, ck };
      if (candCache.size > 200) candCache.clear(); candCache.set(ck, res); return res;
    }
    api.interactions.register('li.salvage.surf', {
      priority: 1,
      test(h) {
        if (!cfg.surfaces || h.dist > 2.2) return null;
        const ch = chunkOfPt(h.point.x, h.point.z); if (!ch || h.collider.parent()?.handle !== ch.body?.handle) return null;
        if (api.furn.at(h.collider) || E.WorldObj.byCollider.get(h.collider.handle)) return null;
        for (const dp of [E.WORLD.exitDoor, E.WORLD.upDoor]) if (dp && h.point.distanceTo(dp) < 2.5) return null;
        const cd = candidate(h); if (!cd) return null;
        const s = cd.s; if (s.need && !api.inv.count(s.need)) return null; // без инструмента — даже не предлагаем, чтобы не мешать
        if (cd.fail) return null;
        const area = (cd.rect.u1 - cd.rect.u0) * (cd.rect.v1 - cd.rect.v0), pos = cd.c.clone();
        const key = `s2:${cd.k},${R2(cd.c.x)},${R2(cd.c.y)},${R2(cd.c.z)},${cd.ax},${R2(cd.rect.u0)},${R2(cd.rect.u1)},${R2(cd.rect.v0)},${R2(cd.rect.v1)},${Math.random() * VARS | 0}`;
        return { text: `Удерживай E — ${s.text}` + (s.tool && !api.inv.count(s.tool) ? ` (${toolName(s.tool)} ускорит)` : ''), hold: holdTime(s) * clamp(area / .4, .5, 1), holdKey: 'surf:' + cd.ck, onHoldTick: holdFx(pos, s.soft ? 'soft' : 'hard'),
          run() {
            if (insidePatch(cd.ax, cd.c, 0)) return;
            E.salvaged.add(key); addPatch(key); candCache.clear();
            const got = roll(s.out); if (area < .2) for (const id in got) got[id] = Math.max(1, got[id] - 1);
            for (const [id, n] of Object.entries(got)) give(id, n);
            const pl = planeOf(cd.ax);
            if (pl === 'ceil') { api.audio.thud(pos); E.player.noise += .15; } else if (s.soft) api.audio.cloth(.8); else { api.audio.crack(pos); E.player.noise += .1; }
            api.quest.count('li.surf'); api.quest.count('li.surf:' + pl);
            if (E.player.st.sanity > 20 && Math.random() < .08) { api.say(pick2(s.patch === 'paper' ? ['Под обоями — ещё один слой таких же обоев.', 'На штукатурке под обоями кто-то нацарапал: «НЕ СДИРАЙ».', 'Под обоями — карандашная разметка. Чья-то рука чертила здесь коридоры.'] : s.patch === 'ceil' ? ['За плиткой — темнота. Ты слышишь, как там что-то ровно дышит.', 'Над плиткой — ещё один потолок. И ещё один.'] : s.patch === 'wood' ? ['За панелью — пустота и тёплый воздух. Как из чьего-то рта.'] : ['Под ковролином — ещё ковролин. Сухой.', 'Под ковролином — стяжка с отпечатками босых ног.']), 4); E.player.st.sanity -= 2; }
            api.notes.unlock('g_li_salvage');
          } };
      },
    });
    const chunkOfPt = (x, z) => E.chunks.get(Math.floor(x / E.CS) + ',' + Math.floor(z / E.CS));
    const lerp = (a, b, t) => a + (b - a) * t;
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
