// =====================================================================
//  PROCEDURAL TEXTURES
// =====================================================================
function canvasTex(w, h, draw, srgb = true, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noisePixels(g, w, h, amt, mono = true) {
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const n = (Math.random() - .5) * amt; p[i] += n; p[i + 1] += mono ? n : (Math.random() - .5) * amt; p[i + 2] += mono ? n * .8 : (Math.random() - .5) * amt; }
  g.putImageData(d, 0, 0);
}
function blob(g, x, y, r, col, w, h) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } }
const TEX = {};
// Чистые текстуры — основа. «Грязные» варианты (D) используются только в зонах с высоким dirt.
const wallBase = (g, w, h, dirty) => {
  g.fillStyle = '#c9b366'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(120,98,36,.10)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,244,190,.07)'; g.fillRect(x + 11, 0, 10, h); }
  g.strokeStyle = 'rgba(112,92,34,.16)'; g.lineWidth = 1.4;
  for (let y = 0; y < h; y += 48) for (let x = 0; x < w; x += 32) { const ox = (y / 48) % 2 ? 16 : 0, cx = x + ox, cy = y + 24; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 5, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 5, cy); g.closePath(); g.stroke(); }
  const gr = g.createLinearGradient(0, h * .9, 0, h); gr.addColorStop(0, 'rgba(60,45,10,0)'); gr.addColorStop(1, `rgba(60,45,10,${dirty ? .45 : .12})`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (dirty) {
    const gt = g.createLinearGradient(0, 0, 0, h * .2); gt.addColorStop(0, 'rgba(70,55,20,.25)'); gt.addColorStop(1, 'rgba(70,55,20,0)'); g.fillStyle = gt; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const x = Math.random() * w, y = h * (.45 + Math.random() * .55); g.save(); g.scale(1, 2.2); blob(g, x, y / 2.2, 20 + Math.random() * 70, 'rgba(90,65,15,.22)', w, h / 2.2); g.restore(); }
  }
  noisePixels(g, w, h, dirty ? 16 : 7);
};
TEX.wall = canvasTex(512, 1024, (g, w, h) => wallBase(g, w, h, false));
TEX.wallD = canvasTex(512, 1024, (g, w, h) => wallBase(g, w, h, true));
const carpetBase = (g, w, h, dirty) => {
  g.fillStyle = '#8c7a45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(60,46,14,.18)' : 'rgba(210,190,120,.10)'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1); }
  if (dirty) for (let i = 0; i < 26; i++) blob(g, Math.random() * w, Math.random() * h, 30 + Math.random() * 110, `rgba(${50 + Math.random() * 20 | 0},40,12,${.12 + Math.random() * .2})`, w, h);
  else for (let i = 0; i < 6; i++) blob(g, Math.random() * w, Math.random() * h, 80 + Math.random() * 120, 'rgba(70,55,20,.05)', w, h);
  noisePixels(g, w, h, dirty ? 34 : 18);
};
TEX.carpet = canvasTex(512, 512, (g, w, h) => carpetBase(g, w, h, false));
TEX.carpetD = canvasTex(512, 512, (g, w, h) => carpetBase(g, w, h, true));
const ceilBase = (g, w, h, dirty) => {
  g.fillStyle = '#dcd6bb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) { g.fillStyle = 'rgba(90,80,50,.22)'; g.fillRect(Math.random() * w, Math.random() * h, 1.3, 1.3); }
  if (dirty) for (let i = 0; i < 3; i++) blob(g, Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 'rgba(140,105,40,.3)', w, h);
  g.fillStyle = '#a49c80'; for (let k = 0; k <= 2; k++) { g.fillRect(k * 256 - 3, 0, 6, h); g.fillRect(0, k * 256 - 3, w, 6); }
  noisePixels(g, w, h, dirty ? 10 : 5);
};
TEX.ceil = canvasTex(512, 512, (g, w, h) => ceilBase(g, w, h, false));
TEX.ceilD = canvasTex(512, 512, (g, w, h) => ceilBase(g, w, h, true));
TEX.tile = canvasTex(512, 512, (g, w, h) => {
  const n = 8, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 222 + Math.random() * 14 | 0; g.fillStyle = `rgb(${v - 4},${v + 4},${v + 6})`; g.fillRect(x * s, y * s, s, s); }
  g.fillStyle = '#8f9d9c'; for (let k = 0; k <= n; k++) { g.fillRect(k * s - 2, 0, 4, h); g.fillRect(0, k * s - 2, w, 4); }
  noisePixels(g, w, h, 5);
});
TEX.stain = canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 9; i++) { const r = 30 + Math.random() * 60; const x = 128 + (Math.random() - .5) * 90, y = 128 + (Math.random() - .5) * 90; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,28,6,.5)'); gr.addColorStop(.7, 'rgba(40,28,6,.25)'); gr.addColorStop(1, 'rgba(40,28,6,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
}, true, false);
TEX.cookie = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.22, '#efeadb'); gr.addColorStop(.36, '#a9a597'); gr.addColorStop(.55, '#5e5b52'); gr.addColorStop(.8, '#1e1d1a'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); noisePixels(g, w, h, 18);
}, true, false);
TEX.chalkX = canvasTex(128, 128, (g) => { g.strokeStyle = 'rgba(245,245,240,.85)'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(25, 28); g.lineTo(100, 104); g.moveTo(102, 24); g.lineTo(28, 100); g.stroke(); }, true, false);
TEX.chalkArrow = canvasTex(128, 128, (g) => { g.strokeStyle = 'rgba(245,245,240,.85)'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(64, 112); g.lineTo(64, 18); g.moveTo(30, 52); g.lineTo(64, 18); g.lineTo(98, 52); g.stroke(); }, true, false);
TEX.crate = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8a6a3c'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 42) { g.fillStyle = 'rgba(40,25,8,.6)'; g.fillRect(0, y, w, 3); } g.strokeStyle = 'rgba(40,25,8,.7)'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14); noisePixels(g, w, h, 30); }, true, false);

// environment map for glossy tiles / water
function makeEnv() {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(30, 8, 30), new THREE.MeshBasicMaterial({ color: 0x1a201f, side: THREE.BackSide })));
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.2, 5) });
  for (let x = -12; x <= 12; x += 4) for (let z = -12; z <= 12; z += 4) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .6), lm); m.position.set(x, 3.9, z); m.rotation.x = Math.PI / 2; es.add(m); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x2a3534 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -3.9; es.add(floor);
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(es, 0.02).texture; pm.dispose(); return t;
}
const ENV = makeEnv();

