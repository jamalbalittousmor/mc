// =====================================================================
//  PHYSICS
// =====================================================================
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
world.timestep = 1 / 60;

// =====================================================================
//  GEOMETRY BUILDER — indexed, subdivided, world-space UVs, bake sample points
// =====================================================================
class GB {
  constructor(su, sv = su) { this.p = []; this.n = []; this.u = []; this.s = []; this.i = []; this.su = su; this.sv = sv; }
  face(dir, x0, y0, z0, x1, y1, z1, step = 1) {
    let v, n;
    switch (dir) {
      case 'px': v = [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]; n = [1, 0, 0]; break;
      case 'nx': v = [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]; n = [-1, 0, 0]; break;
      case 'py': v = [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]; n = [0, 1, 0]; break;
      case 'ny': v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]; n = [0, -1, 0]; break;
      case 'pz': v = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; n = [0, 0, 1]; break;
      case 'nz': v = [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]; n = [0, 0, -1]; break;
    }
    const ax = dir[1] === 'x' ? [2, 1] : dir[1] === 'y' ? [0, 2] : [0, 1], vert = dir[1] !== 'y';
    const A = v[0], B = v[1], D = v[3];
    const lu = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), lv = Math.hypot(D[0] - A[0], D[1] - A[1], D[2] - A[2]);
    if (lu < 1e-4 || lv < 1e-4) return;
    const nu = Math.max(1, Math.ceil(lu / step - .01)), nv = Math.max(1, Math.ceil(lv / step - .01));
    const cx = (A[0] + v[2][0]) / 2, cy = (A[1] + v[2][1]) / 2, cz = (A[2] + v[2][2]) / 2;
    const base = this.p.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv;
      const q = [A[0] + (B[0] - A[0]) * a + (D[0] - A[0]) * b, A[1] + (B[1] - A[1]) * a + (D[1] - A[1]) * b, A[2] + (B[2] - A[2]) * a + (D[2] - A[2]) * b];
      this.p.push(q[0], q[1], q[2]); this.n.push(n[0], n[1], n[2]);
      this.u.push(q[ax[0]] / this.su, q[ax[1]] / (vert ? this.sv : this.su));
      let ox = cx - q[0], oz = cz - q[2]; const ol = Math.hypot(ox, oz); if (ol > 1e-4) { const k = Math.min(.18, ol) / ol; ox *= k; oz *= k; }
      this.s.push(q[0] + n[0] * .12 + ox, q[1], q[2] + n[2] * .12 + oz);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      this.i.push(a, b, c, a, c, d);
    }
  }
  box(x0, y0, z0, x1, y1, z1, skip = '', step = 1) { for (const d of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) if (!skip.includes(d)) this.face(d, x0, y0, z0, x1, y1, z1, step); }
  geo() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(this.p.length), 3));
    g.setIndex(this.i); g.userData.samples = new Float32Array(this.s);
    g.computeBoundingSphere(); return g;
  }
}
const UVS = { wall: [1.6, 3.2], wallD: [1.6, 3.2], floor: [2.2], floorD: [2.2], ceil: [1.2], ceilD: [1.2], waterLite: [4], plastic: [1], darkp: [1], sofa: [1], door: [1], brass: [1], base: [1], tile: [1.2], ptile: [1.2], ceilT: [2], frame: [1], metal: [1], wood: [1], card: [1], drywall: [2], cloth: [1], water: [4], puddle: [4], stain: [1], hole: [1], exit: [1] };

