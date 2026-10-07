// =====================================================================
//  WORLD OBJECTS — интерактивное окружение: двери, выключатели,
//  фонтанчики, телефоны, ящики/шкафы. Состояние сохраняется по ключу.
// =====================================================================
const WorldObj = {
  byCollider: new Map(), state: new Map(), list: new Set(), doors: new Set(), switches: new Set(), phones: new Set(),
  st(key, init) { let s = this.state.get(key); if (!s) { s = init(); this.state.set(key, s); } return s; },
  register(chunk, collider, def, key) {
    const o = { chunk, collider, def, key, data: {} };
    if (collider) this.byCollider.set(collider.handle, o);
    this.list.add(o); return o;
  },
  remove(o) {
    if (!o) return; this.list.delete(o); this.doors.delete(o); this.switches.delete(o); this.phones.delete(o);
    if (o.collider) this.byCollider.delete(o.collider.handle);
    try { o.onRemove?.(); } catch (e) { console.error(e); }
  },
  clear() { for (const o of [...this.list]) this.remove(o); this.state.clear(); },
  target(h) {
    const o = this.byCollider.get(h.collider.handle); if (!o || !o.def) return null;
    const text = typeof o.def.prompt === 'function' ? o.def.prompt(o, h) : o.def.prompt; if (!text) return null;
    return { kind: 'wobj', o, text, run: () => o.def.use?.(o, h) };
  },
  update(dt) {
    for (const o of this.doors) o.tick(dt);
    for (const o of this.phones) if (o.ringT > 0) { o.ringT -= dt; o.ringPh -= dt; if (o.ringPh <= 0) { o.ringPh = 3; audio.ring(o.pos); } if (o.ringT <= 0) bus.emit('phone:missed', o); }
  },
  // --------------------------------------------------------------- двери
  door(chunk, { gx, gz, dir, alongZ, fixed, c, dw, tiled }) {
    const key = `door:${gx},${gz},${dir}`, len = dw * 2 - .04, H = 2.2;
    const s = this.st(key, () => ({ open: hash3(gx, gz, 5151) < .3 ? (hash3(gx, gz, 5152) < .5 ? 1 : -1) * .35 : 0, locked: false }));
    const hx = alongZ ? fixed : c - dw + .02, hz = alongZ ? c - dw + .02 : fixed;
    const g = new GB(1), hw = .025;
    if (alongZ) g.box(-hw, 0, 0, hw, H, len); else g.box(0, 0, -hw, len, H, hw);
    const hb = new GB(1), hp = len - .12;
    if (alongZ) { hb.box(-hw - .05, .98, hp - .04, -hw, 1.02, hp); hb.box(hw, .98, hp - .04, hw + .05, 1.02, hp); }
    else { hb.box(hp - .04, .98, -hw - .05, hp, 1.02, -hw); hb.box(hp - .04, .98, hw, hp, 1.02, hw + .05); }
    const pivot = new THREE.Group(); pivot.position.set(hx, 0, hz);
    const leaf = new THREE.Mesh(g.geo(), zmat(tiled ? 'metal' : 'door')), handle = new THREE.Mesh(hb.geo(), zmat('brass'));
    leaf.castShadow = leaf.receiveShadow = true; pivot.add(leaf, handle); chunk.group.add(pivot);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hx, 0, hz));
    const col = world.createCollider((alongZ ? RAPIER.ColliderDesc.cuboid(hw, H / 2, len / 2).setTranslation(0, H / 2, len / 2) : RAPIER.ColliderDesc.cuboid(len / 2, H / 2, hw).setTranslation(len / 2, H / 2, 0)).setFriction(.3), body);
    const q = new THREE.Quaternion(), pos = V3(alongZ ? fixed : c, 1.1, alongZ ? c : fixed);
    const o = this.register(chunk, col, {
      prompt: o => s.locked ? 'Заперто' : Math.abs(s.open) > .1 ? 'E — закрыть дверь' : 'E — открыть дверь',
      use: o => {
        if (s.locked) { audio.knock(pos); say('Заперто. С той стороны — тишина.', 2.5); return; }
        if (Math.abs(s.open) > .1) s.open = 0;
        else { const cp = camera.position, side = alongZ ? (cp.x < fixed ? 1 : -1) : (cp.z > fixed ? 1 : -1); s.open = side * 1.45; }
        audio.creak(pos); player.noise += .05; bus.emit('door:toggle', o);
      },
    }, key);
    o.pos = pos; o.s = s; o.ang = s.open; o.body = body; o.pivot = pivot; o.alongZ = alongZ; o.fixed = fixed;
    o.slam = () => { if (Math.abs(s.open) < .1) return false; s.open = 0; o.fast = true; return true; };
    const apply = () => { q.setFromAxisAngle(yAxisW, o.ang); pivot.quaternion.copy(q); body.setNextKinematicRotation(q); };
    q.setFromAxisAngle(yAxisW, o.ang); pivot.quaternion.copy(q); body.setRotation(q, true);
    o.tick = dt => {
      if (Math.abs(o.ang - s.open) < 1e-3) return;
      const was = o.ang; o.ang = moveTo(o.ang, s.open, dt * (o.fast ? 9 : 2.6)); apply();
      if (o.fast && Math.abs(o.ang - s.open) < 1e-3) { o.fast = false; audio.slam(pos); player.noise += .1; }
      if (Math.abs(o.ang) < 1e-3 && Math.abs(was) > 1e-3 && !o.fast) audio.latch(pos);
    };
    o.onRemove = () => { world.removeRigidBody(body); leaf.geometry.dispose(); handle.geometry.dispose(); };
    // свет «на глаз» с ближайших ламп
    bakeVertsWithProbe(leaf.geometry, leaf); bakeVertsWithProbe(handle.geometry, handle);
    this.doors.add(o); return o;
  },
  // --------------------------------------------------------- выключатель
  lightSwitch(chunk, slot, gx, gz, room) {
    const key = `sw:${gx},${gz}`, fx = roomCells(gx, gz).map(([x, z]) => fixtureAt(x, z)).filter(f => f && !f.broken && !f.flicker);
    if (!fx.length) return null;
    const s = this.st(key, () => ({ off: hash3(gx, gz, 4242) < .35 }));
    if (s.off) for (const f of fx) switchOff.add(f.key);
    const along = slot.alongZ, x = slot.x + slot.nx * .02 + (along ? 0 : .9), z = slot.z + slot.nz * .02 + (along ? .9 : 0), g = chunk.gb, d = .02;
    const bx0 = x - (along ? d : .05), bx1 = x + (along ? d : .05), bz0 = z - (along ? .05 : d), bz1 = z + (along ? .05 : d);
    g('plastic').box(bx0, 1.15, bz0, bx1, 1.3, bz1);
    g('darkp').box(x - (along ? d + .012 : .015), 1.2, z - (along ? .015 : d + .012), x + (along ? d + .012 : .015), 1.25, z + (along ? .015 : d + .012));
    const col = chunk.colBox(bx0 - .03, 1.1, bz0 - .03, bx1 + .03, 1.35, bz1 + .03);
    const o = this.register(chunk, col, {
      prompt: () => s.off ? 'E — включить свет' : 'E — выключить свет',
      use: () => WorldObj.flip(o, !s.off),
    }, key);
    o.s = s; o.fx = fx; o.pos = V3(x, 1.2, z); this.switches.add(o); return o;
  },
  flip(o, off, silent = false) {
    const s = o.s; if (s.off === off) return; s.off = off;
    for (const f of o.fx) { const was = fixtureLit(f); off ? switchOff.add(f.key) : switchOff.delete(f.key); const now = fixtureLit(f); if (was !== now) bus.emit('fixture:changed', f); }
    if (o.fx.length) { let ax = 0, az = 0; for (const f of o.fx) { ax += f.x; az += f.z; } queueRebake(ax / o.fx.length, az / o.fx.length, 14); }
    if (!silent) audio.click(); if (!off) audio.humBurst(o.pos);
    bus.emit('switch:toggle', { off, pos: o.pos });
  },
  // ----------------------------------------------------- питьевой фонтан
  fountain(chunk, slot, gx, gz) {
    const key = `ft:${gx},${gz}`, s = this.st(key, () => ({ n: 3 + (hash3(gx, gz, 77) * 3 | 0) }));
    const along = slot.alongZ, x = slot.x + slot.nx * .2, z = slot.z + slot.nz * .2, g = chunk.gb;
    const w = .2, d = .18, x0 = x - (along ? d : w), x1 = x + (along ? d : w), z0 = z - (along ? w : d), z1 = z + (along ? w : d);
    g('metal').box(x0, .78, z0, x1, .95, z1); g('metal').box(x - .05, .3, z - .05, x + .05, .78, z + .05);
    g('darkp').face('py', x0 + .04, .951, z0 + .04, x1 - .04, .951, z1 - .04);
    const col = chunk.colBox(x0, .3, z0, x1, 1, z1);
    const o = this.register(chunk, col, {
      prompt: () => s.n > 0 ? `E — попить из фонтанчика (${s.n})` : 'Фонтанчик пересох',
      use: () => {
        if (s.n <= 0) { audio.click(); say('Только сипение в трубах.', 2); return; }
        s.n--; const st = player.st; st.thirst = clamp(st.thirst + 24, 0, 100); st.sanity = clamp(st.sanity + 2, 0, 100);
        audio.gulp(); say(s.n ? 'Вода холодная, с привкусом железа.' : 'Последние капли.', 2); bus.emit('fountain:drink', o);
      },
    }, key);
    o.s = s; return o;
  },
  // ------------------------------------------------------------- телефон
  phone(chunk, slot, gx, gz) {
    const key = `ph:${gx},${gz}`, s = this.st(key, () => ({ calls: 0 }));
    const along = slot.alongZ, x = slot.x + slot.nx * .06, z = slot.z + slot.nz * .06, g = chunk.gb;
    const w = .11, d = .05, x0 = x - (along ? d : w), x1 = x + (along ? d : w), z0 = z - (along ? w : d), z1 = z + (along ? w : d);
    g('plastic').box(x0, 1.25, z0, x1, 1.55, z1); g('darkp').box(x0 + slot.nx * .04, 1.5, z0 + slot.nz * .04, x1 + slot.nx * .04, 1.58, z1 + slot.nz * .04);
    const col = chunk.colBox(x0 - .03, 1.2, z0 - .03, x1 + .03, 1.6, z1 + .03);
    const o = this.register(chunk, col, {
      prompt: o => o.ringT > 0 ? 'E — ответить на звонок' : 'E — снять трубку',
      use: o => WorldObj.answer(o),
    }, key);
    o.s = s; o.pos = V3(x, 1.4, z); o.ringT = 0; o.ringPh = 0; this.phones.add(o); return o;
  },
  ring(o, sec = 14) { o.ringT = sec; o.ringPh = 0; },
  answer(o) {
    const ringing = o.ringT > 0; o.ringT = 0; audio.click();
    if (!ringing) { audio.humBurst(o.pos); say('В трубке — ровный гудок. Он не прерывается, даже когда ты кладёшь трубку.', 3.5); return; }
    o.s.calls++; const st = player.st, lie = st.sanity < 35 && Math.random() < .5;
    const dx = WORLD.exitX - o.pos.x, dz = WORLD.exitZ - o.pos.z, sign = lie ? -1 : 1;
    const dirName = (x, z) => { const a = Math.atan2(x, -z) * 180 / Math.PI, i = Math.round(((a + 360) % 360) / 45) % 8; return ['на север', 'на северо-восток', 'на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад'][i]; };
    const lines = [
      () => `«…иди ${dirName(dx * sign, dz * sign)}. Не сворачивай туда, где темно…» — щелчок, тишина.`,
      () => `Твой собственный голос: «Я уже был здесь. Дверь — ${dirName(dx * sign, dz * sign)}». Гудки.`,
      () => `Кто-то долго дышит в трубку. Потом шёпотом: «${Math.round(Math.hypot(dx, dz) / 10) * 10} шагов… может, больше».`,
    ];
    audio.voice(o.pos); setTimeout(() => audio.whisper(o.pos), 600);
    openDialog('Телефон', `<p>${esc(pick(lines)())}</p>`, [['ПОЛОЖИТЬ ТРУБКУ', () => {}]]);
    st.sanity = clamp(st.sanity - 4, 0, 100); bus.emit('phone:answer', { lie });
  },
  // --------------------------------------------------- ящики / шкафы
  container(chunk, collider, key, label, kind) {
    const s = this.st('ct:' + key, () => ({ done: false }));
    const o = this.register(chunk, collider, {
      prompt: () => s.done ? `${label[0].toUpperCase() + label.slice(1)}: пусто` : `E — обыскать ${label}`,
      use: () => {
        if (s.done) return; s.done = true; audio.scrape?.(o.pos || camera.position); audio.cloth(.6); player.noise += .04;
        const zone = chunk.zone, rr = Math.random(), n = rr < .3 ? 0 : rr < .85 ? 1 : 2, got = [];
        for (let i = 0; i < n; i++) {
          let id = lootPick(zone, Math.random());
          if (kind === 'desk' && Math.random() < .3) id = pick(['battery', 'pills', 'chalk', 'bar']);
          if (kind === 'locker' && Math.random() < .3) id = pick(['cloth', 'wire', 'bulb', 'panel']);
          id = Mods.filter('container:loot', id, { kind, zone }) || id;
          if (!ITEMS[id]) continue;
          if (inv.add(id, 1)) spawnItem(id, camera.position.clone().add(camera.getWorldDirection(V3()).multiplyScalar(.6)));
          got.push(ITEMS[id].name); pickupToast(id, 1);
        }
        if (Math.random() < (kind === 'desk' || kind === 'cabinet' ? .09 : .05)) { setTimeout(() => giveNote(), 300); got.push('записка'); }
        if (!got.length) say(pick(['Пусто. Только пыль и скрепки.', 'Ничего. Чьи-то старые квитанции.', 'Пусто. Кто-то был здесь раньше тебя.']), 2.5);
        bus.emit('container:search', { kind, items: got });
      },
    }, 'ct:' + key);
    return o;
  },
  // ------------------------------------------------- мебель (статика)
  chair(ctx, x, z, s, back = 1, rotated = false) {
    const g = ctx.gb, sy = .45, l = .025;
    g('plastic').box(x - s, sy - .04, z - s, x + s, sy, z + s);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g('metal').box(x + dx * (s - .03) - l, 0, z + dz * (s - .03) - l, x + dx * (s - .03) + l, sy - .04, z + dz * (s - .03) + l);
    if (rotated) g('plastic').box(x + back * s - .03, sy, z - s, x + back * s + .01, sy + .45, z + s);
    else g('plastic').box(x - s, sy, z + back * s - .03, x + s, sy + .45, z + back * s + .01);
    ctx.colBox(x - s, 0, z - s, x + s, sy, z + s);
  },
  sofa(ctx, slot) {
    const g = ctx.gb, along = slot.alongZ, L = .95, D = .42, x = slot.x + slot.nx * (D + .02), z = slot.z + slot.nz * (D + .02);
    const x0 = x - (along ? D : L), x1 = x + (along ? D : L), z0 = z - (along ? L : D), z1 = z + (along ? L : D);
    g('sofa').box(x0, 0, z0, x1, .42, z1);
    // спинка у стены
    const bx0 = slot.nx > 0 ? x0 : slot.nx < 0 ? x1 - .18 : x0, bx1 = slot.nx > 0 ? x0 + .18 : slot.nx < 0 ? x1 : x1;
    const bz0 = slot.nz > 0 ? z0 : slot.nz < 0 ? z1 - .18 : z0, bz1 = slot.nz > 0 ? z0 + .18 : slot.nz < 0 ? z1 : z1;
    g('sofa').box(bx0, .42, bz0, bx1, .85, bz1);
    ctx.colBox(x0, 0, z0, x1, .42, z1); ctx.colBox(bx0, .42, bz0, bx1, .85, bz1);
  },
  serialize() { return [...this.state]; },
  restore(arr) { this.state.clear(); for (const [k, v] of arr || []) this.state.set(k, v); },
};
const yAxisW = new THREE.Vector3(0, 1, 0);
