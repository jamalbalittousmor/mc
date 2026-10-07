// =====================================================================
//  Liminal Industry · «Рассудок»
//  Рассудок перестаёт быть просто полоской: у него четыре стадии, и каждая
//  меняет то, как ты играешь. Чем ниже рассудок — тем тяжелее бежать, тем
//  сильнее дрожит луч фонаря и тем активнее Обитатели (мод li_dwellers).
//  Но низкий рассудок и открывает: в Смятении на стенах проступают знаки
//  «Изнанки», ведущие к тайникам, которых в ясном уме не видно.
//  Инструменты: дыхание (удерживай Q), фотография, музыкальная шкатулка,
//  миндальный чай и суп на горелке, коптилка — свой свет без батареек.
//  Сервис для других модов: api.require('mind') → { stage(), stageId(), T(), STAGES, onStage(fn), calmNear(p) }.
// =====================================================================
Backrooms.mod({
  id: 'li.mind', name: 'Liminal Industry · Рассудок', version: '1.0.0',
  requires: ['core.industry@>=1.0'],
  description: 'Стадии рассудка с последствиями, дыхание (Q), шкатулка, горелка, чай, коптилка, фотографии и тайники «Изнанки».',
  init(api) {
    const { V3, rand, pick, clamp, damp, smooth, vnoise } = api.util, E = api.engine, THREE = api.THREE, A = api.audio;
    const P = () => E.player, ST = () => E.player.st, now = () => E.game.totalT || 0;
    const playing = () => E.game.state === 'play' && !P().sleeping && !P().dead;
    // ================================================================ стадии
    const STAGES = [
      { id: 'clear', min: 70, name: 'Ясность', col: '#bfe0a0', regen: 1, drain: 1, speed: 1, tremble: 0 },
      { id: 'anx', min: 45, name: 'Тревога', col: '#e8d08a', regen: .85, drain: 1.1, speed: 1, tremble: .035 },
      { id: 'conf', min: 25, name: 'Смятение', col: '#e8a070', regen: .7, drain: 1.25, speed: .96, tremble: .09 },
      { id: 'delir', min: 0, name: 'Бред', col: '#ef6a5a', regen: .55, drain: 1.4, speed: .9, tremble: .18 },
    ];
    const DOWN_TEXT = [null,
      ['Внутри что-то сжалось. Тревога.', 'Сердце стучит чаще, чем нужно. Тревога.'],
      ['Мысли расползаются. Смятение: мир начинает врать.', 'Смятение. Краем глаза — то, чего нет. Или есть.'],
      ['Бред. Сердце не выдержит долго. Нужен свет, тепло, дыхание — что угодно.', 'Бред. Ты уже не уверен, что из этого настоящее.'],
    ];
    const UP_TEXT = ['Ясность. Будто открыли окно.', 'Тревога отпускает. Немного.', 'Ты снова понимаешь, где стены.'];
    let stage = 0; const stageCbs = [];
    const stageOf = (s, cur) => { // гистерезис 3 пункта, чтобы стадия не «дребезжала» на границе
      let i = STAGES.findIndex(x => s >= x.min); if (i < 0) i = STAGES.length - 1;
      if (i > cur && s > STAGES[cur].min - 3) return cur; if (i < cur && s < STAGES[i].min + 3) return cur; return i;
    };
    const MIND = api.provide('mind', {
      STAGES, stage: () => stage, stageId: () => STAGES[stage].id, T: () => clamp(1 - ST().sanity / 100, 0, 1),
      onStage: fn => stageCbs.push(fn),
      // «успокаивающие» источники рядом: шкатулка, телевизор и т.п. регистрируют себя сюда
      calmSources: new Set(), calmNear(p, r = 8) { for (const s of this.calmSources) if (s.on && s.pos.distanceTo(p) < (s.r || r)) return s; return null; },
    });
    // ---- HUD: подпись стадии под шкалой рассудка
    let stageEl = null;
    const ensureHud = () => {
      if (stageEl && stageEl.isConnected) return stageEl;
      const row = document.getElementById('r_sanity'); if (!row) return null;
      stageEl = document.createElement('div'); stageEl.id = 'mindstage';
      stageEl.style.cssText = 'font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;margin:.15rem 0 0 6.2rem;transition:color 1s,opacity .4s;opacity:.85';
      row.insertAdjacentElement('afterend', stageEl); return stageEl;
    };
    const renderStage = () => {
      const el = ensureHud(); if (!el) return; const s = STAGES[stage];
      const cd = breath.cdUntil > now() ? ` · дыхание ${Math.ceil(breath.cdUntil - now())} с` : ' · Q — отдышаться';
      el.innerHTML = `<span style="color:${s.col}">◆ ${s.name}</span><span style="color:var(--dim);text-transform:none;letter-spacing:0">${stage > 0 ? cd : ''}</span>`;
      el.style.animation = stage === 3 ? 'pulse 1.2s infinite' : '';
    };
    // ================================================================ дыхание (Q)
    const breath = { on: false, t: 0, cdUntil: 0, nextPuff: 0, el: null, told: false };
    const BREATH_SEC = 4.5, BREATH_CD = 75;
    const breathBar = () => {
      if (breath.el && breath.el.isConnected) return breath.el;
      const el = breath.el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:calc(50% + 3.2rem);transform:translateX(-50%);font-size:.85rem;color:#cfe3ff;text-align:center;pointer-events:none;display:none;text-shadow:0 1px 3px #000';
      el.innerHTML = '<div class="t">вдох…</div><div style="width:10rem;height:.3rem;margin:.3rem auto 0;background:rgba(0,0,0,.5);border:1px solid rgba(160,200,255,.5)"><i style="display:block;height:100%;width:0;background:#a8c8f0"></i></div>';
      document.getElementById('hud')?.appendChild(el); return el;
    };
    const canBreathe = () => playing() && !P().swim && P().grounded !== false && Math.hypot(P().vel.x, P().vel.z) < 1.3;
    const stopBreath = (why) => { if (!breath.on) return; breath.on = false; breathBar().style.display = 'none'; if (why) api.say(why, 2.5); };
    function updateBreath(dt) {
      const held = !!E.keys.KeyQ;
      if (!breath.on) {
        if (held && playing()) {
          if (breath.cdUntil > now()) { if (!breath.warned) { breath.warned = true; api.say(`Дыхание ещё не выровнялось (${Math.ceil(breath.cdUntil - now())} с).`, 2); } return; }
          if (!canBreathe()) { if (!breath.warned) { breath.warned = true; api.say('Нужно остановиться, чтобы отдышаться.', 2); } return; }
          breath.on = true; breath.t = 0; breath.nextPuff = 0; breathBar().style.display = 'block';
        } else breath.warned = false;
        return;
      }
      if (!held) { stopBreath('Сбился. Нужно дышать до конца.'); return; }
      if (!canBreathe()) { stopBreath('Нельзя дышать на ходу.'); return; }
      breath.t += dt; const k = breath.t / BREATH_SEC;
      const bar = breathBar(); bar.querySelector('i').style.width = Math.min(100, k * 100) + '%';
      bar.querySelector('.t').textContent = (breath.t % 3) < 1.5 ? 'вдох…' : 'выдох…';
      if ((breath.nextPuff -= dt) <= 0) { breath.nextPuff = 1.5; A.cloth?.(.35); }
      if (breath.t >= BREATH_SEC) {
        stopBreath(); const st = ST(), lit = P().lightLevel > E.BAL.dimLevel || P().inShelter, gain = (lit ? 11 : 6) * (stage >= 2 ? 1.2 : 1);
        st.sanity = Math.min(100, st.sanity + gain); st.panic = Math.max(0, st.panic - .35);
        breath.cdUntil = now() + BREATH_CD; api.quest.count('mind:breathe');
        api.say(lit ? 'Вдох — четыре, задержка — четыре, выдох — четыре. Отпустило.' : 'Дыхание выровнялось. В темноте — не до конца.', 3.5);
      }
    }
    // визуальные слои поверх базовых эффектов безумия
    api.on('sanityfx:frame', () => {
      const S = E.SFX;
      if (breath.on) { const k = Math.min(1, breath.t / BREATH_SEC); S.tunnel = Math.max(S.tunnel, .25 + .2 * Math.sin(breath.t * 2.1)); S.muffle = Math.max(S.muffle, .55 * k); }
      if (stage === 3) S.tunnel = Math.max(S.tunnel, .3 + .08 * Math.sin(E.clock.elapsedTime * 7.5)); // пульс в такт сердцу
    });
    // ================================================================ эффекты стадий
    let heartT = 0, trembleT = 0;
    function applyStage(dt) {
      const s = STAGES[stage], st = ST();
      E.MOVE.staminaRegen = s.regen; E.MOVE.staminaDrain = s.drain;
      // дрожь рук: луч фонаря «гуляет» вокруг базовой точки
      trembleT += dt; const a = s.tremble * (1 + st.panic), aim = E.FLASH_AIM, tg = E.flash.target.position;
      tg.set(aim.x + (vnoise(trembleT * 3.1, 1, 7) - .5) * a * 6, aim.y + (vnoise(trembleT * 2.7, 4, 9) - .5) * a * 6, aim.z);
      // Бред: сердце. Ниже 12 — медленно уходит здоровье
      if (stage === 3) {
        heartT -= dt; if (heartT <= 0) { heartT = clamp(1.4 - (25 - st.sanity) / 30, .6, 1.4); A.heartbeat(.35 + (25 - st.sanity) / 50); }
        if (st.sanity < 12) { st.health = Math.max(1, st.health - dt * .08); if (!applyStage.toldHeart) { applyStage.toldHeart = true; api.say('В груди колет. Если так продолжится — сердце сдастся раньше головы.', 5); } }
      } else applyStage.toldHeart = false;
    }
    api.filter('player:speed', v => v * STAGES[stage].speed);
    function updateStage() {
      const ns = stageOf(ST().sanity, stage); if (ns === stage) return;
      const down = ns > stage; stage = ns;
      if (down) { api.say(pick(DOWN_TEXT[stage]), 4); A.heartbeat(.7); api.notes.unlock('g_mind'); if (stage >= 2) api.quest.count('mind:conf'); }
      else { api.say(UP_TEXT[stage] || UP_TEXT[0], 3); if (stage === 0 && api.data.wasDelir) { api.quest.count('mind:recover'); api.data.wasDelir = false; } }
      if (stage === 3) api.data.wasDelir = true;
      for (const fn of stageCbs) try { fn(stage, down); } catch (e) { console.error(e); }
      renderStage();
    }
    // ================================================================ предметы
    api.items.register('photo', { name: 'Старая фотография', icon: '🖼️', stack: 1, loot: .012, lootZones: { lobby: 2, office: 1.6, hotel: 2.4, school: 2 },
      desc: 'Чья-то семья на фоне дачи. Не твоя — но смотреть помогает. ПКМ — рассмотреть (раз в 5 минут).', mesh: ['box', [.1, .005, .07], 0xd8d0b8],
      onUse(a) {
        const left = (api.data.photoT || 0) - now();
        if (left > 0) { api.say(`Ты смотрел на неё совсем недавно. Лица ещё стоят перед глазами (${Math.ceil(left / 60)} мин).`, 3); return false; }
        api.data.photoT = now() + 300; const st = ST();
        if (stage === 3) { st.sanity = Math.min(100, st.sanity + 3); api.say(pick(['На фотографии люди. Но у них нет лиц. Или ты не можешь на них сосредоточиться.', 'Ты смотришь и не узнаёшь — ни их, ни себя в отражении глянца.']), 4); }
        else { st.sanity = Math.min(100, st.sanity + 10); st.panic = Math.max(0, st.panic - .2); api.say(pick(['Шашлык, смех, кто-то щурится от солнца. Солнце. Ты помнишь, каким оно бывает.', 'Девочка с бантами держит котёнка. На обороте: «Лето. Все вместе».', 'Чья-то бабушка в огороде. Ты почти чувствуешь запах укропа.']), 4.5); }
        A.cloth?.(.6); api.quest.count('mind:photo'); return false;
      } });
    api.items.register('tea', { name: 'Миндальный чай', icon: '🍵', stack: 4, desc: 'Горячий, сладкий, пахнет детством. +16 рассудка, +бодрость, снимает панику.', use: { sanity: 16, energy: 8, thirst: 14, panic: -.3 }, useText: 'Тепло растекается от горла к пальцам. Руки перестают дрожать.', mesh: ['cyl', [.04, .08], 0xc8b080] });
    api.items.register('soup', { name: 'Горячий суп', icon: '🥣', stack: 4, desc: 'Консервы, разогретые с водой. Сытно и по-домашнему. +35 сытости, +8 рассудка.', use: { hunger: 35, thirst: 8, sanity: 8 }, sound: 'eat', useText: 'Горячее. Настоящее. Можно жить дальше.', mesh: ['cyl', [.06, .06], 0x9a6a3a] });
    api.items.register('wick', { name: 'Коптилка', icon: '🕯️', stack: 3, desc: 'Банка с топливом и тряпичным фитилём. Пока выбрана в руке — даёт тёплый свет без батареек (~8 минут). Рассудок в её свете тает медленнее, чем от фонаря.', mesh: ['cyl', [.04, .07], 0x6a5a3a],
      onUse() { wick.lit = !wick.lit; A.click(); api.say(wick.lit ? 'Фитиль занялся. Пахнет копотью — и домом.' : 'Ты прикрыл огонёк ладонью.', 2.5); return false; } });
    // ================================================================ коптилка: свет в руке
    const wick = { lit: false, burn: api.data.wickBurn ?? 480, v: 0 };
    function updateWick(dt) {
      const sel = E.inv.active(), held = sel && sel.id === 'wick' && !P().swim && !P().sleeping;
      const on = held && wick.lit;
      if (on) {
        wick.burn -= dt; api.data.wickBurn = wick.burn;
        if (wick.burn <= 0) { E.inv.take('wick', 1); wick.burn = api.data.wickBurn = 480; api.say(E.inv.count('wick') ? 'Коптилка догорела. Берёшь следующую.' : 'Коптилка догорела.', 3); if (!E.inv.count('wick')) wick.lit = false; }
      }
      const t = E.clock.elapsedTime, fl = .82 + .18 * vnoise(t * 7, 2, 3) + .06 * Math.sin(t * 23);
      wick.v = damp(wick.v, on ? 1 : 0, 6, dt);
      E.handLight.intensity = wick.v * 2.4 * fl; P().extraLight = wick.v * .2 * fl;
    }
    api.on('world:clear', () => { wick.lit = false; E.handLight.intensity = 0; P().extraLight = 0; });
    // ================================================================ постройки: горелка и шкатулка
    const B = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
    api.build.register('burner', { name: 'Горелка', cat: 'Быт', cost: { scrap: 3, wire: 1 }, snap: .1, station: 'burner',
      desc: 'Станция: миндальный чай, горячий суп. Подойди и нажми E.',
      boxes: [B(-.22, 0, -.18, .22, .12, .18, 'metal'), B(-.04, .12, -.04, .04, .2, .04, 'metal'), B(-.16, .2, -.16, .16, .22, .16, 'metal')],
      visual(g, ghost) { if (ghost) return; const f = new THREE.Mesh(new THREE.ConeGeometry(.05, .12, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, .7, 2.2), transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); f.position.y = .29; f.userData.noAO = true; f.userData.flame = true; g.add(f); } });
    api.recipes.register('tea', { out: { tea: 1 }, in: { almond: 1, water: 1 }, station: 'burner' });
    api.recipes.register('soup', { out: { soup: 1 }, in: { can: 1, water: 1 }, station: 'burner' });
    api.recipes.register('wick', { out: { wick: 1 }, in: { fuel: 1, cloth: 1, scrap: 1 }, station: 'workbench' });
    api.recipes.register('chalk2', { out: { chalk: 2 }, in: { panel: 1 }, station: 'workbench', name: 'Мел из гипса' });
    api.machines.register('musicbox', {
      name: 'Музыкальная шкатулка',
      build: { cat: 'Быт', cost: { scrap: 2, plank: 1, wire: 1 }, snap: .05, desc: 'Заведи (E) — полторы минуты мелодии. Рядом рассудок восстанавливается, а Обитатели держатся поодаль. Но музыку слышно далеко.',
        boxes: [B(-.16, 0, -.11, .16, .14, .11, 'wood'), B(-.16, .14, .07, .16, .3, .11, 'wood'), B(-.02, .14, -.02, .02, .2, .02, 'metal')] },
      state: { t: 0 },
      init(m) { m.calm = { pos: m.pos, on: false, r: 8, kind: 'musicbox' }; MIND.calmSources.add(m.calm); },
      remove(m) { MIND.calmSources.delete(m.calm); },
      tick(m, dt) {
        const s = m.state; m.calm.on = s.t > 0; if (s.t <= 0) return;
        s.t = Math.max(0, s.t - dt); m.snd = (m.snd || 0) - dt;
        if (m.snd <= 0) { m.snd = 4.2; A.musicBox(m.pos.clone().setY(.4)); }
        const d = E.feetPos().distanceTo(m.pos);
        if (d < 7 && !P().sleeping) { const st = ST(); st.sanity = Math.min(100, st.sanity + dt * .3 * (1 - d / 9)); st.panic = Math.max(0, st.panic - dt * .05); }
        E.dir.attention = clamp(E.dir.attention + dt * .0015, 0, 1);
        if (s.t <= 0) api.say('Шкатулка доиграла. Тишина стала громче.', 3);
      },
      prompt: m => m.state.t > 0 ? `E — шкатулка играет (${Math.ceil(m.state.t)} с) · подзавести` : 'E — завести шкатулку',
      interact(m) { const first = m.state.t <= 0; m.state.t = Math.min(180, m.state.t + 90); A.click(); if (first) { m.snd = .4; api.quest.count('mind:music'); } },
    });
    // анимация огонька горелки
    api.on('update', dt => { const t = E.clock.elapsedTime; for (const pc of E.pieces) if (pc.def.id === 'burner') pc.obj?.traverse?.(o => { if (o.userData.flame) o.scale.set(1, .85 + .3 * vnoise(t * 9, pc.pos.x, 1), 1); }); });
    // ================================================================ «Изнанка»: знаки и тайники
    // В Смятении и Бреду на полу проступают светящиеся знаки. Они ведут к тайнику — настоящему.
    // Видны только при низком рассудке; если прийти в себя, след теряется.
    const SIGIL_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = 'rgba(200,225,255,.95)'; g.lineWidth = 6; g.lineCap = 'round'; g.shadowColor = 'rgba(150,200,255,1)'; g.shadowBlur = 12;
      g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(64, 14); g.lineTo(64, 114); g.moveTo(38, 44); g.lineTo(64, 18); g.lineTo(90, 44); g.stroke(); g.beginPath(); g.arc(64, 74, 9, 0, Math.PI * 2); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const sigilMat = new THREE.MeshBasicMaterial({ map: SIGIL_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.3, 1.5, 2), polygonOffset: true, polygonOffsetFactor: -3 });
    const sigilGeo = new THREE.PlaneGeometry(.9, .9).rotateX(-Math.PI / 2);
    const trail = { on: false, target: null, cur: null, mesh: null, a: 0, hops: 0, next: rand(60, 120) };
    const freeAt = (x, z) => E.chunks.has(Math.floor(x / E.CS) + ',' + Math.floor(z / E.CS)) && !E.isPoolAt(x, z) && Math.abs(E.floorY(x, z)) < .05
      && !E.world.intersectionWithShape({ x, y: 1, z }, { x: 0, y: 0, z: 0, w: 1 }, new api.RAPIER.Cylinder(.8, .3), undefined, undefined, P().col);
    function nextHop(from, to) {
      const dir = V3(to.x - from.x, 0, to.z - from.z), dist = dir.length(); dir.normalize();
      if (dist < 8 && E.losClear(from.x, from.z, to.x, to.z)) return to.clone();
      for (let k = 0; k < 36; k++) {
        const a = rand(-1.3, 1.3) * (k < 18 ? .6 : 1), d = rand(5, 9), v = dir.clone().applyAxisAngle(V3(0, 1, 0), a), x = from.x + v.x * d, z = from.z + v.z * d;
        if (freeAt(x, z) && E.losClear(from.x, from.z, x, z)) return V3(x, 0, z);
      }
      return null;
    }
    function showSigil(p) {
      if (!trail.mesh) { trail.mesh = new THREE.Mesh(sigilGeo, sigilMat); trail.mesh.userData.noAO = true; trail.mesh.renderOrder = 2; E.scene.add(trail.mesh); }
      trail.cur = p; trail.mesh.position.set(p.x, E.floorY(p.x, p.z) + .015, p.z); trail.mesh.rotation.y = Math.atan2(trail.target.x - p.x, trail.target.z - p.z) + Math.PI; trail.a = 0;
      A.whisper?.(p.clone().setY(.4));
    }
    function startTrail() {
      const fp = E.feetPos();
      for (let k = 0; k < 10; k++) { const t = E.findFreeSpot(fp.x, fp.z, 8); if (t && t.distanceTo(fp) > 18 && t.distanceTo(fp) < 40) { trail.target = t; break; } }
      if (!trail.target) return false;
      const first = nextHop(fp, trail.target); if (!first) { trail.target = null; return false; }
      trail.on = true; trail.hops = 0; showSigil(first);
      if (!api.data.sigilSeen) { api.data.sigilSeen = true; api.notes.unlock('g_inside'); api.say('На полу — светящийся знак. Его не было. Его не может быть. Стрелка указывает дальше.', 5); }
      else api.say(pick(['Ещё один знак. Изнанка зовёт.', 'Знак на полу светится холодным. Ведёт куда-то.']), 3);
      return true;
    }
    function endTrail(msg) { trail.on = false; trail.target = null; trail.cur = null; if (trail.mesh) { E.scene.remove(trail.mesh); trail.mesh = null; } if (msg) api.say(msg, 3.5); }
    const STASH = [['battery', 3], ['almond', 3], ['pills', 2], ['photo', 1.2], ['circuit', 1], ['bulb', 1.5], ['fuel', 1.5], ['tea', 1.2], ['bandage', 1.5], ['wick', 1]];
    function openStash(p) {
      const n = 2 + (Math.random() < .5 ? 1 : 0) + (stage === 3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const opts = STASH.filter(([id]) => E.ITEMS[id]); let tot = opts.reduce((a, x) => a + x[1], 0), r = Math.random() * tot, id = opts[0][0];
        for (const [k, w] of opts) { r -= w; if (r <= 0) { id = k; break; } }
        E.spawnItem(id, V3(p.x + rand(-.4, .4), E.floorY(p.x, p.z) + .3 + i * .12, p.z + rand(-.4, .4)));
      }
      api.quest.count('mind:stash'); A.dissolve?.(p.clone().setY(.5));
      api.say(pick(['Знак погас — а под ним вещи. Настоящие. Тёплые, будто их только что оставили.', 'Тайник Изнанки. Кто-то положил это здесь для тебя. Или вместо тебя.']), 4.5);
    }
    function updateTrail(dt) {
      if (!trail.on) {
        if (!playing() || stage < 2) return;
        if ((trail.next -= dt) <= 0) { trail.next = rand(80, 150); if (Math.random() < .6) startTrail(); }
        return;
      }
      if (ST().sanity > 55) { endTrail('Знаки поблекли. Ты слишком ясно видишь, чтобы их различать.'); return; }
      const t = E.clock.elapsedTime; trail.a = damp(trail.a, 1, 1.5, dt);
      sigilMat.opacity = trail.a * (.55 + .25 * Math.sin(t * 2.2) + (stage === 3 ? .15 : 0));
      const fp = E.feetPos(), d = Math.hypot(fp.x - trail.cur.x, fp.z - trail.cur.z);
      if (d < 1.8) {
        if (trail.cur.distanceTo(trail.target) < .5) { const p = trail.target; endTrail(); openStash(p); return; }
        const nx = nextHop(trail.cur, trail.target); trail.hops++;
        if (!nx || trail.hops > 12) { const p = trail.cur.clone(); endTrail(); openStash(p); return; }
        showSigil(nx);
      }
    }
    api.on('world:clear', () => { endTrail(); MIND.calmSources.clear(); });
    // ================================================================ главный цикл
    api.on('update', dt => {
      updateStage(); applyStage(dt); updateBreath(dt); updateWick(dt); updateTrail(dt);
      if ((renderStage.t = (renderStage.t || 0) - dt) <= 0) { renderStage.t = .5; renderStage(); }
      if (!breath.told && playing() && ST().sanity < 60) { breath.told = true; api.notes.unlock('g_breath'); api.say('Сердце частит. Остановись и удерживай Q — отдышаться.', 5); }
    });
    api.on('game:load', () => { stage = stageOf(ST().sanity, 0); wick.burn = api.data.wickBurn ?? 480; renderStage(); });
    api.on('world:new', () => { stage = 0; renderStage(); });
    // ================================================================ записи, задания
    const N = (id, kind, order, t, b) => api.notes.register(id, { kind, order, t, b });
    N('g_mind', 'guide', 50, 'Руководство: стадии рассудка', 'Ясность (70+) — всё как есть. Тревога (45–70): дыхание восстанавливается медленнее, руки дрожат — луч фонаря гуляет. Смятение (25–45): тяжелее бежать, мир врёт, Обитатели смелеют — но на полу проступают знаки Изнанки, ведущие к тайникам. Бред (<25): сердце колотится, ниже 12 медленно уходит здоровье, а в нуле — срыв. Лечат: убежище, свет, сон, дыхание (Q), миндальный чай, фотографии, музыкальная шкатулка.');
    N('g_breath', 'guide', 51, 'Руководство: дыхание', 'Остановись и удерживай Q 4–5 секунд: вдох, задержка, выдох. Даёт +6 рассудка в темноте и +11 на свету или в убежище, снимает панику. После — 75 секунд передышки. Пока дышишь, ты почти ничего не слышишь и не видишь по краям. Выбирай момент.');
    N('g_inside', 'guide', 52, 'Руководство: Изнанка', 'В Смятении и Бреду на полу иногда проступают светящиеся знаки. Подойди к знаку — появится следующий. Последний отмечает тайник с настоящими вещами. Если рассудок поднимется выше 55, знаки исчезнут. Цена тайника — твоя голова.');
    N('m_tea', 'lore', 90, 'Рецепт на обороте этикетки', 'Миндальную воду не пить холодной. Нагреть на горелке, не кипятить. Пить медленно, держа кружку двумя руками. Руки должны помнить тепло. — Т.Г.');
    N('m_breath', 'lore', 91, 'Памятка, приколотая к стене', '«ДЫШИ КВАДРАТОМ: вдох на четыре счёта, задержка на четыре, выдох на четыре, пауза на четыре. Повторить. Стены не двигаются. Стены не двигаются. Стены не двигаются». Последние строки написаны разными почерками.');
    N('m_signs', 'lore', 92, 'Тетрадный лист, исчерканный знаками', 'Когда совсем плохо, на полу видно стрелки. Круг и стрела вверх. Я пошёл за ними — там были батарейки и бутылка миндальной воды. Кто их кладёт? Почему только тем, кто сходит с ума? Пишу это, пока голова ясная, потому что потом я в это не поверю.');
    api.quests.chapter('ch_mind', { title: 'Глава · Рассудок', order: 4, desc: 'Научиться держать себя в руках.' });
    const Q = (id, order, title, desc, check, reward, after = []) => api.quests.register(id, { order, title, desc, check, reward, after, chapter: 'ch_mind' });
    const cnt = (k, n) => (a, q) => ({ n: Math.min(n, q.get(k)), of: n });
    Q('q_mind_breathe', 30, 'Дыши', 'отдышись: остановись и удерживай Q', cnt('mind:breathe', 1), { almond: 1 }, ['q_look']);
    Q('q_mind_burner', 31, 'Тёплое', 'построй горелку и завари миндальный чай', cnt('craft:burner', 1), { can: 1 }, ['q_bench']);
    Q('q_mind_music', 32, 'Мелодия', 'построй музыкальную шкатулку и заведи её', cnt('mind:music', 1), { photo: 1 }, ['q_mind_burner']);
    Q('q_mind_stash', 33, 'Изнанка', 'найди тайник по светящимся знакам (видны в Смятении)', cnt('mind:stash', 1), { battery: 1 }, ['q_mind_breathe']);
    Q('q_mind_recover', 34, 'Обратно', 'вернись из Бреда в Ясность', cnt('mind:recover', 1), { tea: 2 }, ['q_mind_breathe']);
    api.commands.register('stage', { help: 'стадия рассудка', run: () => STAGES[stage].name });
    api.commands.register('sigil', { help: 'запустить след Изнанки', run: () => String(startTrail()) });
  },
});
