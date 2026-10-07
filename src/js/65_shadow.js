// =====================================================================
//  ТЕНЬ — та же дымная фигура, что мелькает на краю зрения, только
//  настоящая. Встаёт вдалеке, секунду смотрит — и бежит к тебе сквозь
//  стены. Не скример: она видна издалека, её слышно, и от неё можно
//  защититься. Свет фонарика (≈0.5 с прямо на неё) или сильный свет /
//  убежище рассеивают её. Если догонит — обморок: очнёшься неподалёку,
//  без части сил и, возможно, без одной вещи.
//  Чаще всего — во время «Отбоя» в темноте и при низком рассудке.
// =====================================================================
const SHADOW_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SHADOW_FS = `
varying vec2 vUv; uniform float uTime, uA, uRun, uSeed, uBurn;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+1.0), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*nz(p); p *= 2.03; a *= 0.5; } return v; }
float cap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa-ba*h) - r; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
void main(){
  vec2 p = vec2((vUv.x - 0.5) * 1.2, vUv.y * 2.2);
  float t = uTime * 10.0, r = uRun, bob = abs(sin(t)) * 0.05 * r;
  p.y -= bob; p.x += sin(uTime * 1.3 + uSeed) * 0.015;
  float lean = 0.10 * r;
  float d = cap(p, vec2(0.0, 1.0), vec2(lean*0.4, 1.48), 0.155);                       // корпус
  d = smin(d, length((p - vec2(lean*0.55, 1.70)) * vec2(1.0, 0.85)) - 0.105, 0.07);     // голова
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? -1.0 : 1.0, ph = t + (s == 0 ? 0.0 : 3.14159);
    vec2 hip = vec2(sg*0.075, 0.98), foot = vec2(sg*0.09, 0.06 + max(0.0, sin(ph)) * 0.32 * r);
    vec2 knee = mix(hip, foot, 0.5) + vec2(sg*0.02, 0.06 * r * max(0.0, sin(ph)));
    d = smin(d, min(cap(p, hip, knee, 0.062), cap(p, knee, foot, 0.05)), 0.05);
    vec2 sh = vec2(sg*0.17, 1.44), hand = vec2(sg*(0.22 + 0.06*r), 0.98 + max(0.0, sin(ph + 3.14159)) * 0.30 * r);
    d = smin(d, cap(p, sh, hand, 0.042), 0.05);
  }
  float n = fbm(vec2(p.x * 4.5, p.y * 3.2 - uTime * 1.6) + uSeed);
  d += (n - 0.5) * (0.13 + uBurn * 0.5);
  // клочья дыма, срывающиеся со спины и макушки
  float wisp = fbm(vec2(p.x * 7.0 + uSeed, p.y * 5.0 - uTime * 2.6)) * smoothstep(0.35, 0.0, abs(p.x - lean)) * smoothstep(1.2, 2.1, p.y) * (0.6 + r * 0.6);
  float a = max(smoothstep(0.035, -0.045, d), smoothstep(0.62, 0.8, wisp) * 0.5);
  a *= uA * (1.0 - uBurn);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.003, 0.0025, 0.002), min(1.0, a * 1.05));
}`;
function shadowMesh() {
  const mat = new THREE.ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uRun: { value: 0 }, uSeed: { value: Math.random() * 10 }, uBurn: { value: 0 } } });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2).translate(0, 1.1, 0), mat);
  m.visible = false; m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 3; scene.add(m); return m;
}
const Shadow = {
  s: null, mesh: null, cross: null, crossM: null, cd: 240, lowCd: 0,
  init() { this.mesh = shadowMesh(); this.crossM = shadowMesh(); },
  reset() { this.s = null; this.cross = null; if (this.mesh) this.mesh.visible = false; if (this.crossM) this.crossM.visible = false; this.cd = rand(200, 320); },
  active() { return !!this.s; },
  // точка появления: вдали, в прямой видимости, лучше — впереди (её должно быть видно заранее)
  findSpawn(minD, maxD, front = true) {
    const cp = camera.position, f = camFwd();
    for (let k = 0; k < 30; k++) {
      const a = front && k < 20 ? rand(-1.1, 1.1) : rand(-Math.PI, Math.PI), dirv = f.clone().applyAxisAngle(yAxis, a), d = rand(minD, maxD);
      const x = cp.x + dirv.x * d, z = cp.z + dirv.z * d;
      if (!chunks.has(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || isPoolAt(x, z) || Math.abs(floorY(x, z)) > .05) continue;
      if (!losClear(cp.x, cp.z, x, z)) continue;
      const hit = world.castRay(new RAPIER.Ray({ x: cp.x, y: cp.y - .2, z: cp.z }, { x: dirv.x, y: 0, z: dirv.z }), d, true, undefined, undefined, player.col);
      if (hit && hit.timeOfImpact < d - .5) continue;
      const l = sampleLight(x, 1.2, z); if (l.r + l.g > .5) continue; // в ярком свету тени не стоят
      return V3(x, 0, z);
    }
    return null;
  },
  spawn(reason = 'dark') {
    if (this.s || player.sleeping || player.dead || player.swim || game.state !== 'play') return false;
    const p = this.findSpawn(13, 24); if (!p) return false;
    this.s = { pos: p, phase: 'stand', t: rand(.9, 1.6), speed: 2.2, expo: 0, reason, rush: false, burn: 0, stepT: 0, seen: false };
    this.mesh.visible = true; this.mesh.material.uniforms.uA.value = 0; this.mesh.material.uniforms.uBurn.value = 0;
    audio.whisper(p.clone().setY(1.6)); bus.emit('shadow:spawn', { reason });
    return true;
  },
  dissolve(why) {
    const s = this.s; if (!s || s.phase === 'burn') return; s.phase = 'burn'; s.t = .9;
    audio.dissolve(s.pos.clone().setY(1.2)); addPanic(-.05);
    say(why === 'flash' ? pick(['Луч фонарика разорвал её на клочья дыма.', 'Свет прошёл сквозь неё — и она рассыпалась.']) : why === 'light' ? pick(['Тень не вошла в свет.', 'На границе света она развеялась.']) : 'Тень растаяла.', 3.5);
    if (why === 'flash') { player.st.sanity = Math.min(100, player.st.sanity + 2); Quests.count('shadow:flash'); if (ITEMS.residue && Math.random() < .5) spawnItem('residue', s.pos.clone().setY(.4)); }
    bus.emit('shadow:dissolve', { why });
  },
  // обморок: темнота → очнулся неподалёку (15–40 м), минус силы и время
  faint() {
    const s = this.s; this.s = null; this.mesh.visible = false;
    if (player.dead) return;
    player.sleeping = true; keysClear(); cancelHold(); fade(1, .15); audio.rush(1); addPanic(.4);
    if (build.on) setBuildMode(false);
    const fp = feetPos();
    setTimeout(() => {
      let spot = null; for (let i = 0; i < 12 && !spot; i++) { const c = findFreeSpot(fp.x, fp.z, 9); if (c && c.distanceTo(fp) > 14) spot = c; }
      spot = spot || findFreeSpot(fp.x, fp.z, 5);
      let lost = '';
      const can = inv.slots.map((x, i) => x && i >= INV_HOTBAR ? i : -1).filter(i => i >= 0);
      if (can.length && Math.random() < .5) { const i = pick(can), id = inv.slots[i].id; lost = ITEMS[id].name; inv.takeSlot(i); spawnItem(id, fp.clone().add(V3(0, .4, 0))); }
      if (spot) teleport(spot.x, spot.y, spot.z);
      player.yaw = rand(0, Math.PI * 2); player.pitch = 0;
      const st = player.st; st.sanity = Math.max(5, st.sanity - 10); st.energy = clamp(st.energy - 8, 0, 100); st.thirst = clamp(st.thirst - 6, 0, 100); st.hunger = clamp(st.hunger - 4, 0, 100); st.panic = .3;
      game.hours += 1; dir.attention = Math.max(0, dir.attention - .2); this.cd = rand(240, 420);
      Quests.count('shadow:faint'); bus.emit('shadow:faint', { from: fp, to: spot });
      setTimeout(() => { player.sleeping = false; fade(0, 2.5); say('Ты очнулся на полу. Холодно. Неизвестно, сколько прошло времени.' + (lost ? ` Рюкзак легче: пропало — ${lost}. Наверное, осталось там, где тебя настигло.` : ''), 8); }, 1400);
    }, 1500);
  },
  update(dt) {
    const t = clock.elapsedTime;
    this.updateCross(dt, t);
    if (!this.s) { this.schedule(dt); return; }
    const s = this.s, m = this.mesh, u = m.material.uniforms, cp = camera.position, fp = feetPos();
    if (player.sleeping || player.dead) { this.s = null; m.visible = false; return; }
    u.uTime.value = t;
    const to = V3(fp.x - s.pos.x, 0, fp.z - s.pos.z), dist = to.length();
    m.position.set(s.pos.x, floorY(s.pos.x, s.pos.z), s.pos.z); m.rotation.y = Math.atan2(cp.x - s.pos.x, cp.z - s.pos.z);
    // свет: фонарик прямо на неё (≤14 м, видно) — рассеивает; сильный свет вокруг игрока — не подходит
    const head = s.pos.clone().setY(1.3), dv = head.clone().sub(cp), dl = dv.length(); dv.divideScalar(dl);
    const lookCos = dv.dot(camera.getWorldDirection(V3())), seen = lookCos > .55 && losClear(cp.x, cp.z, s.pos.x, s.pos.z);
    if (seen && !s.seen) { s.seen = true; if (s.phase === 'run') addPanic(.15); }
    const lit = player.flash.on && player.flash.battery > 0 && lookCos > .955 && dl < 14 && losClear(cp.x, cp.z, s.pos.x, s.pos.z);
    if (s.phase !== 'burn') {
      s.expo = lit ? s.expo + dt : Math.max(0, s.expo - dt * .5);
      if (lit) player.flash.battery = Math.max(0, player.flash.battery - dt * .06); // свет на тень «стоит» заряда
      u.uBurn.value = clamp(s.expo / .55, 0, 1) * .6;
      if (s.expo > .55) this.dissolve('flash');
      else if ((player.inShelter || player.lightLevel > .4) && dist < 6) this.dissolve('light');
    }
    if (s.phase === 'stand') {
      u.uA.value = damp(u.uA.value, .95, 3, dt); u.uRun.value = 0; s.t -= dt;
      if (s.t <= 0) { s.phase = 'run'; audio.phantomSteps(s.pos.clone().setY(.1), to.clone().normalize(), 3, 'carpet', 220); }
    } else if (s.phase === 'run') {
      u.uA.value = damp(u.uA.value, 1, 4, dt); u.uRun.value = damp(u.uRun.value, 1, 3, dt);
      s.speed = Math.min(9.5, s.speed + dt * 4.2); const step = Math.min(dist, s.speed * dt); s.pos.addScaledVector(to.normalize(), step);
      s.stepT -= dt; if (s.stepT <= 0) { s.stepT = .19; audio.footstep('carpet', .35, s.pos.clone().setY(.05), .3); }
      if (dist < 4.5 && !s.rush) { s.rush = true; audio.rush(.8); }
      if (dist < .75) this.faint();
    } else if (s.phase === 'burn') {
      s.t -= dt; u.uBurn.value = Math.min(1, u.uBurn.value + dt * 1.4); u.uA.value = damp(u.uA.value, 0, 2, dt);
      if (s.t <= 0) { this.s = null; m.visible = false; this.cd = rand(150, 300); }
    }
  },
  // когда появляться: во время Отбоя в темноте — часто; при низком рассудке в темноте — редко
  schedule(dt) {
    if (!game.started || game.state !== 'play' || player.sleeping || player.dead) return;
    const st = player.st, dark = player.lightLevel < .1 && !player.inShelter;
    this.cd -= dt * (dark ? 1 : .25);
    if (CURFEW.state === 'dark') { CURFEW.shadowCd -= dt; if (dark && CURFEW.shadowCd <= 0) { CURFEW.shadowCd = rand(25, 45) / (1 + (game.level - 1) * .15); if (this.spawn('curfew')) return; } }
    if (this.cd <= 0 && dark && st.sanity < 35 && clock.elapsedTime > 120) { this.cd = rand(240, 480); if (Math.random() < .55) this.spawn('sanity'); }
  },
  // безобидная тень, перебегающая коридор вдали (бывает и при ясном рассудке — очень редко)
  crossNow() {
    if (this.cross || this.s) return false;
    const cp = camera.position, f = camFwd(), d = rand(12, 20), c = cp.clone().addScaledVector(f, d);
    if (!losClear(cp.x, cp.z, c.x, c.z) || !chunks.has(Math.floor(c.x / CS) + ',' + Math.floor(c.z / CS))) return false;
    const side = V3(-f.z, 0, f.x).multiplyScalar(Math.random() < .5 ? 1 : -1), a = c.clone().addScaledVector(side, -2.4);
    this.cross = { p: a, v: side.multiplyScalar(6.5), t: .75 }; this.crossM.visible = true; this.crossM.material.uniforms.uA.value = .9; this.crossM.material.uniforms.uRun.value = 1;
    return true;
  },
  updateCross(dt, t) {
    const c = this.cross; if (!c) return; c.t -= dt; c.p.addScaledVector(c.v, dt);
    const m = this.crossM, cp = camera.position; m.position.set(c.p.x, floorY(c.p.x, c.p.z), c.p.z); m.rotation.y = Math.atan2(cp.x - c.p.x, cp.z - c.p.z);
    m.material.uniforms.uTime.value = t; m.material.uniforms.uA.value = c.t < .2 ? c.t * 4.5 : .9;
    if (c.t <= 0) { this.cross = null; m.visible = false; }
  },
};
Shadow.init();
