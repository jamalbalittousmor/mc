// =====================================================================
//  AUDIO — everything is synthesized
// =====================================================================
class AudioEngine {
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = S.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    this.muffle = this.lp(20000, .5); this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(3.8, 2.4);
    this.wet = ctx.createGain(); this.wet.gain.value = .4; this.reverb.connect(this.wet).connect(this.master);
    this.farVerb = ctx.createConvolver(); this.farVerb.buffer = this.impulse(6, 1.6);
    const fw = ctx.createGain(); fw.gain.value = .9; this.farVerb.connect(fw).connect(this.master);
    this.stepBus = ctx.createGain(); this.stepBus.gain.value = S.steps; this.stepBus.connect(this.master);
    this.white = this.noiseBuf('white', 4); this.brown = this.noiseBuf('brown', 6); this.pink = this.noiseBuf('pink', 5);
    // --- room tone
    this.roomG = this.loop(this.brown, [this.lp(260)], 0);
    this.air = this.loop(this.pink, [this.bp(1800, .6)], 0);
    // --- fluorescent hum
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 1400; humF.Q.value = 2;
    this.humG.connect(this.master); humF.connect(this.humG);
    const hs = ctx.createGain(); hs.gain.value = .25; this.humG.connect(hs).connect(this.reverb);
    this.humOsc = [];
    for (const [f, type, g] of [[120, 'sawtooth', .16], [60, 'sine', .35], [180, 'sine', .08], [240, 'triangle', .05], [120.6, 'sawtooth', .08]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.base = f; o.connect(gg).connect(humF); o.start(); this.humOsc.push(o);
    }
    const buzz = this.loop(this.white, [this.bp(4800, 4)], .012, this.humG);
    const am = ctx.createOscillator(); am.frequency.value = 120; const amg = ctx.createGain(); amg.gain.value = .01; am.connect(amg).connect(buzz.gain); am.start();
    // --- anxiety drone + tinnitus + heartbeat
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0; this.droneG.connect(this.master);
    const dl = this.lp(180); dl.connect(this.droneG);
    for (const f of [41.2, 41.9, 61.7, 82.6]) { const o = ctx.createOscillator(); o.type = f > 60 ? 'triangle' : 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = f > 60 ? .12 : .4; o.connect(g).connect(dl); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07; const lfg = ctx.createGain(); lfg.gain.value = 60; lfo.connect(lfg).connect(dl.frequency); lfo.start();
    this.tinG = ctx.createGain(); this.tinG.gain.value = 0; this.tinG.connect(this.master);
    const tin = ctx.createOscillator(); tin.frequency.value = 7800; tin.connect(this.tinG); tin.start();
    // --- water ambience
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0; this.waterG.connect(this.master);
    const ws = ctx.createGain(); ws.gain.value = .6; this.waterG.connect(ws).connect(this.reverb);
    const wb = this.bp(520, 1.2); wb.connect(this.waterG);
    const wsrc = ctx.createBufferSource(); wsrc.buffer = this.pink; wsrc.loop = true; wsrc.connect(wb); wsrc.start();
    const wl = ctx.createOscillator(); wl.frequency.value = .23; const wlg = ctx.createGain(); wlg.gain.value = 260; wl.connect(wlg).connect(wb.frequency); wl.start();
    this.ready = true;
  }
  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1); } }
    return b;
  }
  noiseBuf(kind, sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec | 0, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926; }
    }
    return b;
  }
  lp(f, q = .7) { const n = this.ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q; return n; }
  hp(f, q = .7) { const n = this.ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; n.Q.value = q; return n; }
  bp(f, q = 1) { const n = this.ctx.createBiquadFilter(); n.type = 'bandpass'; n.frequency.value = f; n.Q.value = q; return n; }
  loop(buf, chain, gain, dest = this.master) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); let n = s;
    for (const c of chain) { n.connect(c); n = c; }
    const g = this.ctx.createGain(); g.gain.value = gain; n.connect(g).connect(dest); s.start(0, Math.random() * 2); return g;
  }
  // a destination node at a world position (null = non-spatial)
  out(pos, wet = .3, far = 0, dest = null) {
    const ctx = this.ctx, g = ctx.createGain();
    let head = g;
    if (pos) { const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 200; p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; g.connect(p); head = p; }
    head.connect(dest || this.master);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; head.connect(w).connect(this.reverb); }
    if (far) { const w = ctx.createGain(); w.gain.value = far; g.connect(w).connect(this.farVerb); }
    return g;
  }
  noiseHit(dest, t, dur, filt, gain, attack = .004) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.white; const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let n = s; for (const f of filt) { n.connect(f); n = f; } n.connect(g).connect(dest);
    s.start(t, Math.random() * 3); s.stop(t + dur + .05); return s;
  }
  tone(dest, t, f0, f1, dur, gain, type = 'sine') {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .05);
  }
  now() { return this.ctx.currentTime; }
  // ---------- one-shots
  footstep(surface, loud = 1, pos = null, far = 0) {
    if (!this.ready) return; const t = this.now() + .001, own = !pos;
    const d = this.out(pos, own ? (surface === 'tile' ? .12 : .03) : (surface === 'tile' ? .4 : .18), far, own ? this.stepBus : null);
    const v = own ? .55 : 1, r = Math.random();
    if (surface === 'carpet') {
      this.noiseHit(d, t, .09 + r * .04, [this.lp(300 + r * 160)], .22 * loud * v, .012);
      this.tone(d, t, 62 + r * 10, 38, .07, .07 * loud * v);
      if (Math.random() < .5) this.noiseHit(d, t + .04, .05, [this.bp(1100 + r * 500, 2)], .012 * loud * v, .015);
    } else if (surface === 'tile') {
      this.noiseHit(d, t, .05, [this.hp(700), this.bp(1700 + r * 700, 1.2)], .1 * loud * v, .004);
      this.tone(d, t, 115 + r * 20, 70, .05, .06 * loud * v);
    } else if (surface === 'splash') {
      this.noiseHit(d, t, .08, [this.lp(450)], .14 * loud * v, .01);
      this.noiseHit(d, t + .01, .18, [this.bp(1300 + r * 500, 1.3)], .07 * loud * v, .03);
    } else {
      this.noiseHit(d, t, .3, [this.bp(600, 1.2)], .16 * loud * v, .04);
      this.noiseHit(d, t + .05, .22, [this.bp(1300, 1.6)], .05 * loud * v, .04);
    }
  }
  motor(pos, k = 1) { const t = this.now(), d = this.out(pos, .2); this.tone(d, t, 48, 44, .5, .09 * k, 'sawtooth'); this.noiseHit(d, t, .4, [this.lp(220)], .12 * k, .05); }
  beep(pos) { const t = this.now(), d = this.out(pos, .2); this.tone(d, t, 880, 880, .09, .04, 'square'); this.tone(d, t + .12, 1320, 1320, .09, .035, 'square'); }
  knock(pos) { const t = this.now(), d = this.out(pos, .2, .9); const n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) { const tt = t + i * (.32 + Math.random() * .08); this.tone(d, tt, 95, 50, .14, .9); this.noiseHit(d, tt, .1, [this.lp(700)], .6); } }
  slam(pos) { const t = this.now(), d = this.out(pos, .3, 1.2); this.noiseHit(d, t, .9, [this.lp(380)], 1.6); this.tone(d, t, 55, 30, .7, 1.2); for (let i = 0; i < 6; i++) this.noiseHit(d, t + .08 + i * .045, .04, [this.bp(2200, 4)], .25 * (1 - i / 6)); }
  scrape(pos) { const ctx = this.ctx, t = this.now(), d = this.out(pos, .2, 1.0); const s = ctx.createBufferSource(); s.buffer = this.white; const f = this.bp(500, 9); f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(1350, t + 2.6); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .5); g.gain.linearRampToValueAtTime(.35, t + 2); g.gain.linearRampToValueAtTime(0, t + 2.8); s.connect(f).connect(g).connect(d); s.start(t); s.stop(t + 3); }
  drip(pos) { const t = this.now(), d = this.out(pos, .8); const f = 900 + Math.random() * 900; this.tone(d, t, f, f * .45, .07, .25); }
  distantSteps(pos, dir) {
    const p = pos.clone(), n = 5 + (Math.random() * 6 | 0);
    for (let i = 0; i < n; i++) setTimeout(() => { p.addScaledVector(dir, .7); this.footstep('carpet', .9, p, 1.0); }, i * 560 + Math.random() * 40);
  }
  pop(pos) { const t = this.now(), d = this.out(pos, .4); this.noiseHit(d, t, .05, [this.hp(2500)], .7); this.tone(d, t, 3200, 1800, .25, .08, 'triangle'); this.noiseHit(d, t + .02, .4, [this.bp(5000, 2)], .08); }
  crackle(pos, dur = 1.5) { const t = this.now(), d = this.out(pos, .3); for (let i = 0; i < dur * 14; i++) if (Math.random() < .6) this.noiseHit(d, t + Math.random() * dur, .015 + Math.random() * .03, [this.bp(3000 + Math.random() * 3000, 2)], .15 + Math.random() * .2); }
  click() { if (!this.ready) return; const t = this.now(), d = this.out(null, 0); this.noiseHit(d, t, .02, [this.hp(3000)], .25); this.tone(d, t, 1800, 900, .03, .05, 'square'); }
  pickup() { if (!this.ready) return; const t = this.now(), d = this.out(null, .15); this.tone(d, t, 520, 500, .12, .12, 'triangle'); this.tone(d, t + .07, 780, 760, .2, .1, 'triangle'); this.noiseHit(d, t, .08, [this.bp(1200, 1)], .1); }
  gulp() { const t = this.now(), d = this.out(null, .1); for (let i = 0; i < 4; i++) this.tone(d, t + i * .28, 260 + Math.random() * 60, 120, .14, .25); }
  thud(pos) { const t = this.now(), d = this.out(pos, .3); this.tone(d, t, 110, 45, .25, .7); this.noiseHit(d, t, .18, [this.lp(900)], .5); }
  crack(pos) { const t = this.now(), d = this.out(pos, .3); for (let i = 0; i < 5; i++) this.noiseHit(d, t + i * .03, .06, [this.bp(900 + i * 300, 2)], .4); }
  heartbeat(k) { const t = this.now(), d = this.out(null, 0); this.tone(d, t, 58, 38, .16, .5 * k); this.tone(d, t + .21, 52, 34, .2, .38 * k); }
  powerDown() { const t = this.now(); for (const o of this.humOsc) { const f = o.frequency.value; o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .25, t + 1.6); } this.thud(null); this.tone(this.out(null, .9), t + .05, 70, 25, 1.4, .6, 'sine'); }
  powerUp() { const t = this.now(); for (const o of this.humOsc) { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(o.base, t + .9); } const d = this.out(null, .6); for (let i = 0; i < 10; i++) this.noiseHit(d, t + Math.random() * .9, .02, [this.hp(1500)], .2); this.tone(d, t + .9, 50, 60, .5, .3); }
  humDetune(cents, sec) { const t = this.now(); for (const o of this.humOsc) { o.detune.cancelScheduledValues(t); o.detune.setValueAtTime(o.detune.value, t); o.detune.linearRampToValueAtTime(cents, t + sec * .4); o.detune.linearRampToValueAtTime(0, t + sec); } }
  update(dt, st) {
    if (!this.ready) return; const t = this.now(), k = .25;
    this.humG.gain.setTargetAtTime(clamp(st.hum, 0, 1) * .085, t, k);
    this.droneG.gain.setTargetAtTime(smooth(.45, 1, st.anx) * .12, t, .8);
    this.tinG.gain.setTargetAtTime(smooth(.75, 1, st.anx) * .003 + (st.tinnitus || 0) * .004, t, 1.2);
    this.waterG.gain.setTargetAtTime(st.water * .12, t, .5);
    this.wet.gain.setTargetAtTime(st.reverb * .55 + .1, t, 1);
    // комнатный тон: почти тишина (чуть слышное «давление» помещения), чтобы редкие звуки были событием
    this.roomG.gain.setTargetAtTime(st.under ? .6 : S.ambience * .07 * (st.silence ? .1 : 1), t, st.silence ? 1.5 : .3);
    this.air.gain.setTargetAtTime(S.ambience * .003 * (st.silence ? 0 : 1), t, .5);
    this.muffle.frequency.setTargetAtTime(st.under ? 550 : 350 + 19650 * Math.pow(1 - (st.muffle || 0), 3), t, .08);
    this.stepBus.gain.setTargetAtTime(S.steps, t, .2);
    this.master.gain.setTargetAtTime(st.paused ? S.volume * .25 : st.sleep ? S.volume * .3 : S.volume, t, .3);
    const L = this.ctx.listener, p = st.pos, f = st.fwd;
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }
  // ---------- v2 one-shots
  cloth(k = 1) { const t = this.now(), d = this.out(null, .05); this.noiseHit(d, t, .18, [this.bp(2400, .8)], .05 * k, .05); }
  pant() { const t = this.now(), d = this.out(null, .1); for (let i = 0; i < 4; i++) { this.noiseHit(d, t + i * .55, .32, [this.bp(900, .7)], .09, .12); this.noiseHit(d, t + i * .55 + .3, .22, [this.bp(1400, .9)], .05, .08); } }
  breath(pos) { const t = this.now(), d = this.out(pos, .25); this.noiseHit(d, t, 1.1, [this.bp(600, 1.2)], .07, .5); this.noiseHit(d, t + 1.3, .9, [this.bp(800, 1.2)], .05, .3); }
  eat() { const t = this.now(), d = this.out(null, .05); for (let i = 0; i < 5; i++) this.noiseHit(d, t + i * .22 + Math.random() * .05, .08, [this.bp(1800 + Math.random() * 900, 2)], .12); }
  pills() { const t = this.now(), d = this.out(null, .1); for (let i = 0; i < 6; i++) this.tone(d, t + i * .05 + Math.random() * .03, 3200 + Math.random() * 1500, 2600, .03, .04, 'triangle'); this.gulp(); }
  chalk(pos) { const t = this.now(), d = this.out(pos, .15); for (let i = 0; i < 3; i++) this.noiseHit(d, t + i * .16, .14, [this.hp(2200), this.bp(4200 + Math.random() * 1500, 3)], .1, .03); }
  creak(pos) { const ctx = this.ctx, t = this.now(), d = this.out(pos, .35, .3); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(95 + Math.random() * 40, t + .7); const f = this.bp(900, 6); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .1); g.gain.linearRampToValueAtTime(0, t + .8); const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = .03; lfo.connect(lg).connect(g.gain); o.connect(f).connect(g).connect(d); o.start(t); lfo.start(t); o.stop(t + .9); lfo.stop(t + .9); }
  whisper(pos) { const t = this.now(), d = this.out(pos, .6, .5); const n = 6 + (Math.random() * 6 | 0); let tt = t; for (let i = 0; i < n; i++) { const dur = .06 + Math.random() * .16; this.noiseHit(d, tt, dur, [this.hp(1500), this.bp(2500 + Math.random() * 3000, 4)], .045 + Math.random() * .03, dur * .4); tt += dur + Math.random() * .09; } }
  phantomSteps(pos, dir, n = 4, surface = 'carpet', gap = 520) { const p = pos.clone(); for (let i = 0; i < n; i++) setTimeout(() => { p.addScaledVector(dir, .7); this.footstep(surface, .55, p, .4); }, i * gap + Math.random() * 30); }
  voice(pos) { const ctx = this.ctx, t = this.now(), d = this.out(pos, .8, .8); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(92, t + 1.4); const f = this.bp(700, 3); f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + .6); f.frequency.linearRampToValueAtTime(400, t + 1.4); const lp = this.lp(500); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .3); g.gain.linearRampToValueAtTime(0, t + 1.5); o.connect(f).connect(lp).connect(g).connect(d); o.start(t); o.stop(t + 1.6); }
  humBurst(pos) { const t = this.now(), d = this.out(pos, .3); this.tone(d, t, 120, 118, 1.6, .05, 'sawtooth'); this.tone(d, t, 60, 60, 1.6, .08); }
  ring(pos) { const t = this.now(), d = this.out(pos, .25, .6); for (let i = 0; i < 2; i++) { const tt = t + i * .42; for (let k = 0; k < 8; k++) { this.tone(d, tt + k * .045, 440, 440, .04, .05, 'square'); this.tone(d, tt + k * .045, 480, 480, .04, .04, 'square'); } } }
  latch(pos) { const t = this.now(), d = this.out(pos, .15); this.noiseHit(d, t, .05, [this.bp(2200, 2)], .3); this.tone(d, t, 300, 120, .06, .12, 'square'); }
  splash(pos) { const t = this.now(), d = this.out(pos, .2); this.noiseHit(d, t, .5, [this.lp(1600)], .25, .02); }}
const audio = new AudioEngine();
for (const m of ['footstep', 'knock', 'slam', 'scrape', 'drip', 'distantSteps', 'pop', 'crackle', 'click', 'pickup', 'gulp', 'thud', 'crack', 'heartbeat', 'powerDown', 'powerUp', 'humDetune', 'cloth', 'pant', 'breath', 'eat', 'pills', 'chalk', 'creak', 'whisper', 'phantomSteps', 'voice', 'humBurst', 'motor', 'beep', 'ring', 'latch', 'splash']) {
  const f = AudioEngine.prototype[m]; AudioEngine.prototype[m] = function (...a) { if (this.ready) return f.apply(this, a); };
}

