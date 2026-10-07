// =====================================================================
//  НАБЛЮДАТЕЛЬ — силуэт вдалеке. Не нападает и не выпрыгивает:
//  стоит там, куда ты не смотрел; исчезает, если смотреть на него.
//  В темноте и при низком рассудке подходит ближе, пока ты не видишь.
// =====================================================================
const Watcher = {
  on: false, pos: V3(), life: 0, seenT: 0, steps: 0, next: 0, group: null, mat: null,
  init() {
    const m = this.mat = new THREE.MeshBasicMaterial({ color: 0x060504, fog: true });
    const g = this.group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.17, .13, .95, 8), m); torso.position.y = 1.42;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), m); head.position.y = 2.06; head.scale.set(.9, 1.15, .95);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .14, 6), m); neck.position.y = 1.93;
    const legs = [-.08, .08].map(x => { const l = new THREE.Mesh(new THREE.CylinderGeometry(.06, .045, .98, 6), m); l.position.set(x, .49, 0); return l; });
    const arms = [-.22, .22].map(x => { const a = new THREE.Mesh(new THREE.CylinderGeometry(.04, .03, 1.05, 6), m); a.position.set(x, 1.33, 0); a.rotation.z = x > 0 ? .05 : -.05; return a; });
    g.add(torso, head, neck, ...legs, ...arms); g.visible = false; g.traverse(o => { o.userData.noAO = true; }); scene.add(g);
    this.reset();
  },
  reset() { this.hide(true); this.next = BAL.watcherMinT * rand(.8, 1.3); this.steps = 0; },
  canSee(p) { const cp = camera.position; return losClear(cp.x, cp.z, p.x, p.z); },
  findSpot(minD, maxD, wantHidden = true) {
    const cp = camera.position;
    for (let k = 0; k < 40; k++) {
      const a = rand(0, Math.PI * 2), d = rand(minD, maxD), x = cp.x + Math.cos(a) * d, z = cp.z + Math.sin(a) * d;
      if (!chunks.has(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || isPoolAt(x, z) || Math.abs(floorY(x, z)) > .05) continue;
      const p = V3(x, 0, z);
      if (!losClear(cp.x, cp.z, x, z)) continue;
      if (wantHidden && inView(V3(x, 1.4, z), .35)) continue;
      // не в стене/колонне
      if (world.intersectionWithShape({ x, y: 1, z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cylinder(.8, .25), undefined, undefined, player.col)) continue;
      return p;
    }
    return null;
  },
  spawn(minD = 13, maxD = 26) {
    if (this.on || !this.group) return false;
    const p = this.findSpot(minD, maxD); if (!p) return false;
    this.pos.copy(p); this.on = true; this.life = rand(18, 30); this.seenT = 0; this.group.visible = true; this.group.position.copy(p);
    bus.emit('watcher:spawn', p); return true;
  },
  hide(silent = false) {
    if (this.group) this.group.visible = false;
    if (this.on && !silent) { const n = nearFixtures(30).filter(o => o.f && Math.hypot(o.f.x - this.pos.x, o.f.z - this.pos.z) < 6); for (const o of n.slice(0, 3)) flickerFixture(o.f, rand(.4, 1)); }
    this.on = false;
  },
  update(dt) {
    if (!this.group || player.dead || player.sleeping) return;
    const st = player.st, dark = player.lightLevel < BAL.dimLevel;
    if (!this.on) {
      this.next -= dt * (dark ? 1.6 : 1) * (st.sanity < 50 ? 1.5 : 1) * (1 + (WORLD.level - 1) * .25);
      if (this.next <= 0 && game.playT > BAL.watcherMinT * .6) {
        this.next = rand(90, 200) / (1 + (WORLD.level - 1) * .2);
        if (!this.spawn()) this.next = 8;
      }
      return;
    }
    const cp = camera.position, d = Math.hypot(this.pos.x - cp.x, this.pos.z - cp.z);
    this.group.rotation.y = Math.atan2(cp.x - this.pos.x, cp.z - this.pos.z);
    const visible = inView(V3(this.pos.x, 1.5, this.pos.z), .8) && this.canSee(this.pos);
    this.life -= dt;
    if (visible) {
      this.seenT += dt;
      if (this.seenT > .05 && !this.noticed) { this.noticed = true; addPanic(.1); audio.humBurst(this.pos); humEvent(.8, 2.5); }
      if (this.seenT > rand(.9, 1.8) || d < 8) {
        audio.thud(this.pos); this.hide(); this.noticed = false; addPanic(.12); st.sanity = clamp(st.sanity - 4, 0, 100);
        later(1.2, () => say(pick(['Там кто-то стоял. Теперь — нет.', 'Силуэт. Без лица. Он просто… смотрел.', 'Ты моргнул — и в коридоре пусто.']), 4));
        bus.emit('watcher:seen', { dist: d }); return;
      }
    } else if (dark && st.sanity < 45 && this.seenT === 0 && Math.random() < dt * .25) {
      // подходит ближе, пока на него не смотрят
      const p = this.findSpot(Math.max(2.5, d * .55), Math.max(3, d * .7));
      if (p) { this.pos.copy(p); this.group.position.copy(p); this.steps++; audio.phantomSteps?.(p, V3(cp.x - p.x, 0, cp.z - p.z).normalize(), 2, 'carpet', 520); }
      if (Math.hypot(this.pos.x - cp.x, this.pos.z - cp.z) < 3.2) this.contact();
    }
    if (this.life <= 0) this.hide(true);
  },
  contact() {
    const st = player.st; this.hide(); this.noticed = false;
    audio.breath(camera.position.clone().add(camFwd().multiplyScalar(-.6))); audio.powerDown?.();
    dir.blackout = Math.max(dir.blackout, 4); addPanic(.45); st.sanity = clamp(st.sanity - 18, 0, 100);
    say('Холод по шее. Оно было прямо за тобой.', 5); bus.emit('watcher:contact');
  },
};
