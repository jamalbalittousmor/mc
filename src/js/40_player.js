// =====================================================================
//  PLAYER — responsive controller, swimming, mantling
// =====================================================================
const EYE = 1.62, CAP_HH = .55, CAP_R = .3, CENTER = CAP_HH + CAP_R;
const player = {
  body: world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(2, CENTER + .05, 2)),
  vel: V3(), vy: 0, yaw: Math.PI * .75, pitch: 0, grounded: false, crouch: 0, coyote: 0, jumpBuf: 0, groundT: 0, fallV: 0, jumped: false,
  swim: false, under: false, bob: 0, stepIdx: 0, camY: EYE, mantle: null, landKick: 0, shake: 0,
  flash: { on: false, battery: 1 },
  st: { health: 100, hunger: 85, thirst: 80, energy: 90, sanity: 85, panic: 0, oxygen: 1, stamina: 1 },
  prev: V3(2, 0, 2), staminaLock: false, lightLevel: 0, lean: 0, inShelter: false, noise: 0, dead: false, sleeping: false, stillT: 0,
};
player.col = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HH, CAP_R).setFriction(0), player.body);
const cc = world.createCharacterController(.02);
cc.enableAutostep(.42, .1, false); cc.enableSnapToGround(.35); cc.setApplyImpulsesToDynamicBodies(true); cc.setSlideEnabled(true); cc.setMaxSlopeClimbAngle(50 * Math.PI / 180); cc.setCharacterMass(70);
const keys = {}; let jumpPressed = false;
const flash = new THREE.SpotLight(0xfff4e0, 0, 30, .55, .6, 1.3);
flash.map = TEX.cookie; flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -.0006; flash.shadow.normalBias = .03; flash.shadow.camera.near = .15; flash.shadow.camera.far = 16;
flash.position.set(.22, -.18, .05); camera.add(flash); camera.add(flash.target); flash.target.position.set(.05, -.1, -6);
const FLASH_INT = 80;
function feetPos() { const t = player.body.translation(); return V3(t.x, t.y - CENTER, t.z); }
function teleport(x, y, z) { player.body.setTranslation({ x, y: y + CENTER + .02, z }, true); player.body.setNextKinematicTranslation({ x, y: y + CENTER + .02, z }); player.vel.set(0, 0, 0); player.vy = 0; player.camY = y + EYE; player.mantle = null; }
const surfaceAt = (x, z) => { if (player.swim) return 'water'; const zn = zoneAt(x, z); return zn.flood ? 'splash' : zn.mat === 'tile' || (zn.floorK && zn.floorK !== 'hotelC') ? 'tile' : 'carpet'; };
function tryMantle(tr, fwd) {
  const feet = tr.y - CENTER, ox = tr.x + fwd.x * .62, oz = tr.z + fwd.z * .62, top = feet + 2.3;
  const hit = world.castRay(new RAPIER.Ray({ x: ox, y: top, z: oz }, { x: 0, y: -1, z: 0 }), 2.3, true, undefined, undefined, player.col);
  if (!hit) return false;
  const ty = top - hit.timeOfImpact, rise = ty - feet;
  if (rise < .5 || rise > 2.05) return false;
  const tx = tr.x + fwd.x * .75, tz = tr.z + fwd.z * .75;
  const blocked = world.intersectionWithShape({ x: tx, y: ty + CENTER + .05, z: tz }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(CAP_HH, CAP_R - .02), undefined, undefined, player.col);
  if (blocked) return false;
  player.mantle = { t: 0, dur: .32 + rise * .12, from: V3(tr.x, tr.y, tr.z), to: V3(tx, ty + CENTER + .03, tz) };
  audio.cloth(); if (player.swim) audio.footstep('water', 1.1); return true;
}
// movement tuning (ускорение/трение в духе Source; доступно модам через api.engine.MOVE)
const MOVE = { walk: 4.3, sprint: 7.0, crouch: 2.2, accel: 11, airAccel: 2.5, friction: 7, stopSpeed: 2, jump: 6.3, gravity: 21, fallMul: 1.35, stick: 2.5, coyote: .12, buffer: .14 };
const _wish = new THREE.Vector3(), _fwd = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function accelerate(p, dx, dz, wishSpeed, accel, dt) {
  const cur = p.vel.x * dx + p.vel.z * dz, add = wishSpeed - cur; if (add <= 0) return;
  const a = Math.min(accel * dt * Math.max(wishSpeed, 1.5), add); p.vel.x += dx * a; p.vel.z += dz * a;
}
// мелкие предметы на полу не тормозят персонажа: контроллер их игнорирует, а мы их отталкиваем сами
const ccFilter = col => !itemByCollider.has(col.handle);
function kickItems(p, tr) {
  for (const it of worldItems) {
    const t = it.body.translation(), dx = t.x - tr.x, dz = t.z - tr.z, d2 = dx * dx + dz * dz;
    if (d2 > .5 || t.y > tr.y + .2 || t.y < tr.y - CENTER - .3) continue;
    const d = Math.sqrt(d2) + 1e-3, sp = Math.hypot(p.vel.x, p.vel.z), m = it.body.mass();
    if (sp < .5) continue;
    it.body.applyImpulse({ x: (dx / d * .6 + p.vel.x * .25) * m * .5, y: .4 * m, z: (dz / d * .6 + p.vel.z * .25) * m * .5 }, true);
  }
}
function updatePlayer(dt) {
  const p = player, st = p.st, tr = p.body.translation(), feet = tr.y - CENTER;
  if (p.dead || p.sleeping) { p.vel.set(0, 0, 0); return; }
  if (p.mantle) {
    const m = p.mantle; m.t += dt; const k = Math.min(1, m.t / m.dur), e = k * k * (3 - 2 * k);
    const pos = V3().lerpVectors(m.from, m.to, e); pos.y = lerp(m.from.y, m.to.y, Math.min(1, e * 1.6));
    p.body.setNextKinematicTranslation(pos); if (k >= 1) { p.mantle = null; p.vy = 0; p.vel.multiplyScalar(.4); p.groundT = 0; } return;
  }
  const fwdIn = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), strIn = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  _wish.set(strIn, 0, -fwdIn); const moving = _wish.lengthSq() > 0; if (moving) _wish.normalize().applyAxisAngle(_up, p.yaw);
  _fwd.set(0, 0, -1).applyAxisAngle(_up, p.yaw);
  const inPool = isPoolAt(tr.x, tr.z), sub = inPool ? clamp((WATER_Y - feet) / 1.3, 0, 1) : 0;
  p.swim = sub > .55;
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && moving && fwdIn > 0 && !p.staminaLock && p.crouch < .5;
  const tired = st.energy < 20 ? .6 : 1, panicK = 1 + st.panic * .8;
  if (wantSprint && Math.hypot(p.vel.x, p.vel.z) > 3) { st.stamina -= dt * .11 * panicK / tired; if (st.stamina <= 0) { st.stamina = 0; p.staminaLock = true; audio.pant(); } }
  else { st.stamina = Math.min(1, st.stamina + dt * (moving ? .13 : .24) * tired / (1 + st.panic)); if (st.stamina > .35) p.staminaLock = false; }
  p.crouch = damp(p.crouch, keys.KeyC && !p.swim ? 1 : 0, 14, dt);
  if (jumpPressed) p.jumpBuf = MOVE.buffer; else p.jumpBuf = Math.max(0, p.jumpBuf - dt); jumpPressed = false;
  if (p.swim) {
    const look = V3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ')), right = V3(1, 0, 0).applyAxisAngle(_up, p.yaw);
    const wish = V3().addScaledVector(look, fwdIn).addScaledVector(right, strIn), spd = wantSprint ? 3.6 : 2.5;
    if (wish.lengthSq()) wish.normalize().multiplyScalar(spd);
    const floatFeet = WATER_Y - 1.42; let vyT = wish.y;
    if (keys.Space) vyT = 2.6; else if (keys.KeyC) vyT = -2.4; else if (Math.abs(wish.y) < .3) vyT = clamp((floatFeet - feet) * 2.2, -1.5, 1.5);
    p.vel.x = moveTo(p.vel.x, wish.x, 8 * dt); p.vel.z = moveTo(p.vel.z, wish.z, 8 * dt); p.vy = moveTo(p.vy, vyT, 8 * dt);
    if (wantSprint) st.stamina -= dt * .05;
    if ((keys.Space || p.jumpBuf > 0) && fwdIn > 0 && feet > WATER_Y - 1.75 && tryMantle(tr, _fwd)) return;
  } else {
    let speed = p.crouch > .5 ? MOVE.crouch : wantSprint ? MOVE.sprint : MOVE.walk;
    if (zoneAt(tr.x, tr.z).flood) speed *= .9;
    if (st.energy < 15) speed *= .85;
    if (inPool && sub > .1) speed *= .7;
    speed = Mods.filter('player:speed', speed, { sprint: wantSprint });
    if (p.grounded) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      // трение только против «лишней» скорости: при удержании направления бег не проседает
      if (sp > 1e-3) { const over = moving && (p.vel.x * _wish.x + p.vel.z * _wish.z) > sp * .7 ? Math.max(0, sp - speed) : sp, drop = Math.min(over, Math.max(sp, MOVE.stopSpeed) * MOVE.friction * dt), k = (sp - drop) / sp; p.vel.x *= k; p.vel.z *= k; }
      if (moving) {
        // поворот скорости к желаемому направлению без потери модуля (нет «прилипания» при смене направления)
        const cur = p.vel.x * _wish.x + p.vel.z * _wish.z; if (cur > 0) { const lx = p.vel.x - _wish.x * cur, lz = p.vel.z - _wish.z * cur, kk = Math.exp(-10 * dt); p.vel.x = _wish.x * cur + lx * kk; p.vel.z = _wish.z * cur + lz * kk; }
        accelerate(p, _wish.x, _wish.z, speed, MOVE.accel, dt);
      }
      p.vy = -MOVE.stick;
    } else {
      if (moving) accelerate(p, _wish.x, _wish.z, Math.min(speed, 1.2), MOVE.airAccel * 4, dt);
      p.vy -= MOVE.gravity * (p.vy < 0 ? MOVE.fallMul : 1) * dt; if (inPool) p.vy = Math.max(p.vy, -6); p.vy = Math.max(p.vy, -30);
    }
    const canJump = p.groundT < MOVE.coyote && p.crouch < .5 && !p.jumped;
    if (p.jumpBuf > 0 || (keys.Space && !p.grounded && p.vy < 2)) {
      if (fwdIn > 0 && tryMantle(tr, _fwd)) { p.jumpBuf = 0; return; }
      if (p.jumpBuf > 0 && canJump) { p.vy = MOVE.jump; p.jumpBuf = 0; p.jumped = true; p.grounded = false; p.groundT = 1; p.noise += .15; audio.cloth(.5); }
    }
  }
  const desired = { x: p.vel.x * dt, y: p.vy * dt, z: p.vel.z * dt };
  cc.computeColliderMovement(p.col, desired, undefined, undefined, ccFilter);
  const m = cc.computedMovement();
  p.body.setNextKinematicTranslation({ x: tr.x + m.x, y: tr.y + m.y, z: tr.z + m.z });
  // столкновения со стенами: убираем из скорости только составляющую «в стену» (скольжение вдоль стены сохраняется)
  for (let i = 0, n = cc.numComputedCollisions(); i < n; i++) {
    const c = cc.computedCollision(i); if (!c) continue; let nx = c.normal2.x, ny = c.normal2.y, nz = c.normal2.z;
    if (Math.abs(ny) > .6) continue; // пол/потолок/ступенька
    if (nx * desired.x + nz * desired.z > 0) { nx = -nx; nz = -nz; }
    const hl = Math.hypot(nx, nz); if (hl < 1e-4) continue; nx /= hl; nz /= hl;
    const d = p.vel.x * nx + p.vel.z * nz; if (d < 0) { p.vel.x -= nx * d; p.vel.z -= nz * d; }
  }
  // земля: с гистерезисом (без дрожания трения на стыках и ступенях)
  const wasGrounded = p.grounded, hit = cc.computedGrounded() && !p.swim && p.vy <= 0;
  if (hit) { p.groundT = 0; p.jumped = false; } else p.groundT = (p.groundT || 0) + dt;
  p.grounded = !p.swim && p.vy <= 0 && (hit || p.groundT < .1);
  if (p.grounded && !wasGrounded && p.fallV < -5) { p.landKick = Math.min(.1, -p.fallV * .01); audio.footstep(surfaceAt(tr.x, tr.z), Math.min(1.2, -p.fallV / 8)); p.noise += .1; if (p.fallV < -14) { st.health = Math.max(1, st.health + (p.fallV + 14) * 2.5); say('Больно приземлился.', 2); } }
  p.fallV = p.grounded ? 0 : Math.min(p.fallV || 0, p.vy);
  if (desired.y > 0 && m.y < desired.y * .3 && !p.swim) p.vy = 0; // удар головой
  kickItems(p, tr);
  // шаги по длине шага
  const hs = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
  if (p.grounded || p.swim) p.bob += hs * dt * Math.PI / (p.swim ? 2.4 : 1.2 + hs * .085);
  const step = Math.floor(p.bob / Math.PI);
  if (step !== p.stepIdx) {
    p.stepIdx = step;
    if (hs > .6) {
      const loud = (wantSprint ? 1.15 : p.crouch > .5 ? .3 : .75) * rand(.85, 1.1);
      audio.footstep(surfaceAt(tr.x, tr.z), loud); p.noise += wantSprint ? .05 : p.crouch > .5 ? 0 : .015;
      bus.emit('player:step', { loud, pos: feetPos() });
    }
  }
  p.hs = hs; p.stillT = hs < .3 ? p.stillT + dt : 0;
}
function updateCamera(dt, t) {
  const p = player, tr = p.body.translation(), st = p.st;
  p.bobAmt = damp(p.bobAmt || 0, S.headbob && !p.swim && p.grounded ? clamp((p.hs || 0) / 6.5, 0, 1) * .8 : 0, 6, dt); const bobAmt = p.bobAmt;
  const targetY = tr.y - CENTER + EYE - p.crouch * .62 + (p.swim ? -.05 + Math.sin(t * 1.6) * .03 : 0);
  p.camY = Math.abs(targetY - p.camY) > 1.2 || p.mantle ? targetY : targetY > p.camY ? damp(p.camY, targetY, 14, dt) : damp(p.camY, targetY, 30, dt);
  p.landKick = damp(p.landKick, 0, 8, dt);
  p.shake = st.panic * .004 + (st.energy < 15 ? .002 : 0);
  const sh = (s) => (vnoise(t * 7, s, 71) - .5) * p.shake * 2;
  const breathe = Math.sin(t * (1.2 + st.panic * 1.5)) * (.004 + st.panic * .01);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); p.lean = damp(p.lean, S.headbob && !p.swim ? -strafe * .012 : 0, 6, dt);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), sway = Math.sin(p.bob) * .016 * bobAmt;
  camera.position.set(tr.x + rx * sway, p.camY - Math.cos(p.bob * 2) * .016 * bobAmt + breathe - p.landKick, tr.z + rz * sway);
  camera.rotation.set(p.pitch + sh(1) - p.landKick * .25, p.yaw + sh(2), p.lean + Math.sin(p.bob) * .0025 * bobAmt + sh(3), 'YXZ');
  const sprintK = smooth(4.6, 6.8, Math.hypot(p.vel.x, p.vel.z));
  const targetH = S.fov + sprintK * 5 + SFX.fov + Math.sin(t * .9) * st.panic * 2;
  camera.userData.hfov = damp(camera.userData.hfov ?? S.fov, targetH, 6, dt);
  camera.fov = hfovToV(camera.userData.hfov, camera.aspect); camera.updateProjectionMatrix();
  p.under = isPoolAt(camera.position.x, camera.position.z) && camera.position.y < WATER_Y;
  const f = p.flash;
  if (f.on && !p.sleeping) { f.battery = Math.max(0, f.battery - dt / (BAL.flashMinutes * 60)); if (f.battery <= 0) { f.on = false; say('Фонарик сел.'); } }
  if (SFX.flashStutter > 0) SFX.flashStutter -= dt;
  const fi = (SFX.flashStutter > 0 ? (vnoise(t * 22, 3, 5) > .45 ? 1 : .08) : 1) * (f.on && !p.sleeping ? FLASH_INT * (f.battery < .15 ? (vnoise(t * 9, 0, 33) > .35 ? .55 : .1) : .45 + .55 * Math.min(1, f.battery * 3)) : 0);
  flash.intensity = damp(flash.intensity, fi, 25, dt);
  flash.castShadow = S.shadows;
}

