// =====================================================================
//  AMBIENT — почти полная тишина. Здание «живёт» редкими далёкими звуками:
//  хлопнувшая дверь, удар в вентиляции, звон трубы, щелчок стартера лампы,
//  лифт, бормотание телевизора за стеной, обрывок музыки из ниоткуда.
//  Тишина — основной фон; звук — событие. Чем ниже рассудок, тем звуки чаще
//  и тем меньше они похожи на звуки здания.
// =====================================================================
const AMB_SFX = {
  // далёкая дверь: глухой удар + щелчок замка
  farDoor(pos) { const t = this.now(), d = this.out(pos, .5, 1.3); this.noiseHit(d, t, .55, [this.lp(220)], .8, .008); this.tone(d, t, 72, 38, .45, .55); this.noiseHit(d, t + .1, .05, [this.bp(1900, 3)], .1); },
  // воздуховод: металлический «бум» от перепада давления
  ventThump(pos) { const t = this.now(), d = this.out(pos, .6, .7); this.noiseHit(d, t, .28, [this.lp(420)], .45, .004); this.tone(d, t, 170, 120, .55, .2, 'triangle'); this.tone(d, t + .01, 611, 604, 1.4, .025); this.tone(d, t + .01, 977, 970, .9, .012); },
  // гидроудар в трубе: звонкие удары с затуханием
  pipePing(pos) { const t = this.now(), d = this.out(pos, .75, .8), f = 650 + Math.random() * 700; let tt = t; for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) { const g = .05 / (1 + i * .7); this.tone(d, tt, f, f * .985, 1.3, g); this.tone(d, tt, f * 2.76, f * 2.7, .5, g * .3); tt += .07 + Math.random() * .45; } },
  // стартер люминесцентной лампы: тик-тик… и короткое жужжание
  ballast(pos) { const t = this.now(), d = this.out(pos, .2); const n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) { this.noiseHit(d, t + i * (.11 + Math.random() * .06), .018, [this.hp(2600)], .18); } this.tone(d, t + n * .14, 120, 119, .35, .025, 'sawtooth'); },
  // гонг лифта где-то на другом этаже (которого нет)
  elevator(pos) { const t = this.now(), d = this.out(pos, .85, 1.5); this.tone(d, t, 880, 878, 1.9, .045); this.tone(d, t, 1760, 1755, .8, .008); this.tone(d, t + .5, 698.5, 697, 2.4, .045); this.tone(d, t + .5, 1397, 1393, .9, .008); },
  // одиночный звонок телефона, оборванный на середине
  phoneOnce(pos) { const t = this.now(), d = this.out(pos, .35, .9); for (let k = 0; k < 14; k++) { this.tone(d, t + k * .045, 440, 440, .04, .04, 'square'); this.tone(d, t + k * .045, 480, 480, .04, .03, 'square'); } },
  // бормотание телевизора/радио за стеной: «слоги» через фильтр + обрывок мелодии
  murmur(pos, dur = 3.2) {
    const ctx = this.ctx, t = this.now(), d = this.out(pos, .4, .5), lp = this.lp(650), f = this.bp(900, 1.6); lp.connect(f).connect(d);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(lp);
    let tt = t, base = 105 + Math.random() * 60;
    while (tt < t + dur) { const syl = .08 + Math.random() * .2; o.frequency.setValueAtTime(base * (.85 + Math.random() * .4), tt); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.05 + Math.random() * .03, tt + syl * .3); g.gain.linearRampToValueAtTime(0, tt + syl); tt += syl + (Math.random() < .2 ? .25 : .03); }
    o.start(t); o.stop(t + dur + .2);
    this.noiseHit(d, t, dur, [this.bp(2400, .8)], .006, .3);
  },
  // кашель вдалеке. Ты здесь не один.
  cough(pos) { const t = this.now(), d = this.out(pos, .7, 1.1); for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) { const tt = t + i * (.32 + Math.random() * .1); this.noiseHit(d, tt, .22, [this.bp(700 + Math.random() * 300, 1.4), this.lp(1800)], .22 / (1 + i * .5), .012); this.tone(d, tt, 190, 140, .14, .04, 'sawtooth'); } },
  // обрывок музыки из торгового центра (muzak): мягкие аккорды с «плывущей» плёнкой
  muzak(pos) {
    const ctx = this.ctx, t = this.now(), d = this.out(pos, .9, 1.6), lp = this.lp(1300); lp.connect(d);
    const prog = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 349.2]];
    const wob = ctx.createOscillator(); wob.frequency.value = .7; const wg = ctx.createGain(); wg.gain.value = 9; wob.connect(wg); wob.start(t); wob.stop(t + 6.5);
    prog.forEach((ch, i) => ch.forEach((fq, j) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; wg.connect(o.detune); const g = ctx.createGain(); const s = t + i * 1.4 + j * .05; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.018, s + .04); g.gain.exponentialRampToValueAtTime(.0005, s + 1.6); o.connect(g).connect(lp); o.start(s); o.stop(s + 1.7); }));
  },
  // здание «оседает»: одиночный сухой щелчок
  settle(pos) { const t = this.now(), d = this.out(pos, .5, .4); this.noiseHit(d, t, .03, [this.bp(2600, 4)], .25); this.tone(d, t, 230, 170, .07, .05); },
  // ветер в вентиляции (ветра здесь нет)
  ventWind(pos) { const ctx = this.ctx, t = this.now(), d = this.out(pos, .5, .6); const s = ctx.createBufferSource(); s.buffer = this.pink; const f = this.bp(380, 3); f.frequency.setValueAtTime(320, t); f.frequency.linearRampToValueAtTime(720, t + 2); f.frequency.linearRampToValueAtTime(300, t + 4); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 4.2); s.connect(f).connect(g).connect(d); s.start(t); s.stop(t + 4.4); },
  // что-то тяжёлое упало далеко
  heavyFall(pos) { const t = this.now(), d = this.out(pos, .5, 1.4); this.tone(d, t, 58, 28, .8, .45); this.noiseHit(d, t, .7, [this.lp(260)], .7, .006); for (let i = 0; i < 4; i++) this.noiseHit(d, t + .15 + i * .09 + Math.random() * .05, .05, [this.lp(900)], .12 / (i + 1)); },
  // тихий «вдох» зданием: гул на секунду набирает силу и обрывается
  humSwell() { const t = this.now(); for (const o of this.humOsc) { o.detune.cancelScheduledValues(t); o.detune.setValueAtTime(o.detune.value, t); o.detune.linearRampToValueAtTime(-35, t + 2.5); o.detune.linearRampToValueAtTime(0, t + 5); } },
  // шорох лапок по стене (паук) — очень тихо, вблизи
  skitter(pos, k = 1) { const t = this.now(), d = this.out(pos, .05); const n = 5 + (Math.random() * 6 | 0); for (let i = 0; i < n; i++) this.noiseHit(d, t + i * (.025 + Math.random() * .03), .012, [this.hp(3500), this.bp(5200 + Math.random() * 2500, 3)], .05 * k); },
  // нарастающий «вдох» тени перед касанием
  rush(k = 1) { const ctx = this.ctx, t = this.now(), d = this.out(null, .6); const s = ctx.createBufferSource(); s.buffer = this.brown; const f = this.lp(200); f.frequency.setValueAtTime(150, t); f.frequency.exponentialRampToValueAtTime(2400, t + 1.1); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9 * k, t + 1.05); g.gain.linearRampToValueAtTime(0, t + 1.3); s.connect(f).connect(g).connect(d); s.start(t); s.stop(t + 1.4); this.tone(d, t, 40, 90, 1.2, .3 * k); },
  // низкий «выдох» при растворении тени
  dissolve(pos) { const t = this.now(), d = this.out(pos, .7, .5); this.noiseHit(d, t, 1.2, [this.bp(500, .8), this.lp(900)], .1, .3); this.tone(d, t, 90, 45, 1.1, .05); },
  // синхронное тройное мигание всех ламп — сигнал «Отбоя»
  curfewWarn() { const t = this.now(), d = this.out(null, .9, .8); for (let i = 0; i < 3; i++) { this.tone(d, t + i * .6, 60, 58, .35, .14, 'sawtooth'); this.noiseHit(d, t + i * .6, .04, [this.hp(1800)], .2); } },
};
for (const [k, f] of Object.entries(AMB_SFX)) AudioEngine.prototype[k] = function (...a) { if (this.ready) return f.apply(this, a); };

// ---- планировщик фоновых звуков
const AMB = { next: 45, last: '', count: 0 };
// w — вес; zones — где чаще (множитель); dist — дальность; low — только при рассудке ниже; rare — помечено «редко»
const AMB_LIST = [
  { id: 'farDoor', w: 1, dist: [16, 34] },
  { id: 'ventThump', w: 1, dist: [6, 16], zones: { pipes: 2, electrical: 1.6, office: 1.3 } },
  { id: 'pipePing', w: .7, dist: [6, 18], zones: { pipes: 3, flooded: 2, pools: 1.5, garage: 1.4 } },
  { id: 'ballast', w: .8, near: true, needFixture: true },
  { id: 'settle', w: 1.1, dist: [3, 9] },
  { id: 'ventWind', w: .5, dist: [5, 12] },
  { id: 'heavyFall', w: .35, dist: [20, 40] },
  { id: 'elevator', w: .22, dist: [18, 36], zones: { mall: 4, hotel: 3, office: 1.5 } },
  { id: 'phoneOnce', w: .2, dist: [12, 26], zones: { office: 3, hotel: 1.5 } },
  { id: 'murmur', w: .25, dist: [7, 14], zones: { hotel: 3, office: 1.4 }, low: 75 },
  { id: 'cough', w: .14, dist: [18, 34], low: 70 },
  { id: 'muzak', w: .12, dist: [16, 30], zones: { mall: 5, fun: 6 } },
  { id: 'humSwell', w: .3, near: true, needFixture: true },
];
function ambientPos(e) {
  if (e.near) { const n = nearFixtures(7); if (e.needFixture && !n.length) return null; return n.length ? V3(n[0].f.x, n[0].f.y, n[0].f.z) : camera.position.clone(); }
  const p = sidePos(rand(...e.dist)); p.y = rand(.4, 2.6); return p;
}
function updateAmbient(dt) {
  if (!audio.ready || !game.started || player.sleeping || player.dead || game.state !== 'play') return;
  if (dir.silence > 0) return; // абсолютная тишина — значит абсолютная
  const st = player.st, low = 1 - st.sanity / 100;
  AMB.next -= dt * (1 + low * 1.4 + (CURFEW.state === 'dark' ? .8 : 0));
  if (AMB.next > 0) return;
  AMB.next = rand(32, 80);
  const zk = zoneAt(camera.position.x, camera.position.z).key;
  const list = AMB_LIST.filter(e => e.id !== AMB.last && (!e.low || st.sanity < e.low) && (!e.needFixture || POWER.value > .5))
    .map(e => [e, e.w * (e.zones?.[zk] || 1)]);
  let tot = list.reduce((a, x) => a + x[1], 0), r = Math.random() * tot;
  for (const [e, w] of list) {
    r -= w; if (r > 0) continue;
    const pos = ambientPos(e); if (!pos && e.near) return;
    audio[e.id](pos); AMB.last = e.id; AMB.count++;
    if (e.id === 'humSwell') humEvent(.35, 5);
    if (e.id === 'cough' && Math.random() < .5) later(rand(2, 4), () => say(pick(['Кашель. Далеко. Человеческий.', 'Кто-то кашлянул. Ты здесь не один.', 'Кашель — и сразу тишина, будто кто-то зажал себе рот.']), 4));
    if (e.id === 'muzak' && Math.random() < .5) later(3, () => say(pick(['Откуда-то доносится музыка. Как в лифте торгового центра.', 'Мелодия обрывается на середине такта.']), 4));
    if (e.id === 'elevator' && Math.random() < .4) later(2.5, () => say('Звонок лифта. Здесь нет лифтов.', 4));
    bus.emit('ambient:sound', { id: e.id, pos });
    return;
  }
}
