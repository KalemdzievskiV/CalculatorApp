/*
 * MDA план — генерички мебел и двор за 3D моделот (low-poly, без надворешни модели).
 *
 *   MDA3DProps.furnish(T, floor, add)  → мебел во секоја просторија според типот; враќа натписи
 *   MDA3DProps.garden(T, info, add)    → парцела: ограда, патека до влезот, дрвја, базен, огниште
 *
 * Мерките се во cm. План x → X, план y → Z, висина → Y (исто како planner3d.js).
 * Секој предмет се гради во свои координати: ширина по x, длабочина по z, задната страна
 * (кон ѕидот) е на −z, предната на +z, дното на y = 0.
 */
(function () {
  let T = null;

  // ── Материјали (се делат меѓу сите предмети) ──
  const C = {
    oak: 0xb98e62, oakDark: 0x8a6440, white: 0xf3f1ec, offWhite: 0xe6e1d8, fabric: 0x8e9196, fabric2: 0xb9ab97,
    cushion: 0xa3a6aa, dark: 0x3a3d42, black: 0x202225, steel: 0xc3c7cb, bed: 0xf7f5f0, duvet: 0xc6d1da, pillow: 0xffffff,
    ceramic: 0xfbfbfa, terracotta: 0xb8704f, leaf: 0x6f9e4c, leaf2: 0x5c8c3f, leaf3: 0x87ad5a, blossom: 0xe6a6b3,
    trunk: 0x76563a, stone: 0xdcd6cb, gravel: 0xbfb8ac, car: 0x5b6770, rug: 0xd8cab4, fence: 0x9a7650,
  };
  const matCache = {};
  function mat(color, o = {}) {
    const key = color + '|' + JSON.stringify(o);
    if (!matCache[key]) matCache[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0 }, o));
    return matCache[key];
  }
  const M = {
    get glass() { return mat(0xcfe6f0, { transparent: true, opacity: 0.32, roughness: 0.05 }); },
    get water() { return mat(0x3fb0d4, { transparent: true, opacity: 0.88, roughness: 0.08, metalness: 0.1, emissive: 0x0d4d66, emissiveIntensity: 0.25 }); },
    get fire() { return mat(0xff8a2a, { emissive: 0xff6a00, emissiveIntensity: 1.2, roughness: 1 }); },
    get shade() { return mat(0xf4ead8, { emissive: 0xffe2b0, emissiveIntensity: 0.35 }); },
    get chrome() { return mat(C.steel, { roughness: 0.25, metalness: 0.8 }); },
    get mirror() { return mat(0xdfe6ea, { roughness: 0.05, metalness: 0.9 }); },
  };
  const flat = (color) => mat(color, { flatShading: true, roughness: 0.95 });

  // ── Помошни за делови ──
  function part(g, geo, m, x, y, z, shadow = true) {
    const me = new T.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = shadow; me.receiveShadow = true;
    g.add(me);
    return me;
  }
  // Кутија: (x, z) е центарот, y е дното
  const bx = (g, w, h, d, x, y, z, m, sh) => part(g, new T.BoxGeometry(w, h, d), m, x, y + h / 2, z, sh);
  const cy = (g, r1, r2, h, x, y, z, m, seg = 16) => part(g, new T.CylinderGeometry(r1, r2, h, seg), m, x, y + h / 2, z);
  const legs = (g, w, d, h, inset, m, s = 4) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(g, s, h, s, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), m);
  };

  // ══ Мебел ══
  const ITEMS = {
    bed({ w, d }) {
      const g = new T.Group();
      bx(g, w, 28, d, 0, 0, 0, mat(C.oak));
      bx(g, w - 6, 22, d - 10, 0, 28, 3, mat(C.bed));
      bx(g, w - 2, 7, d * 0.6, 0, 46, d / 2 - d * 0.3 - 2, mat(C.duvet));
      const n = w >= 140 ? 2 : 1, pw = (w - 24) / n - 8;
      for (let i = 0; i < n; i++) bx(g, pw, 12, 38, -w / 2 + 12 + (pw + 8) * i + pw / 2 + 4, 50, -d / 2 + 30, mat(C.pillow));
      bx(g, w + 6, 105, 8, 0, 0, -d / 2 + 2, mat(C.fabric2));
      return g;
    },
    nightstand() {
      const g = new T.Group();
      bx(g, 45, 48, 40, 0, 0, 0, mat(C.oak));
      cy(g, 7, 7, 4, 0, 48, -4, mat(C.dark));
      cy(g, 1.2, 1.2, 22, 0, 52, -4, mat(C.dark), 6);
      cy(g, 9, 13, 17, 0, 70, -4, M.shade);
      return g;
    },
    wardrobe({ w, d }) {
      const g = new T.Group();
      bx(g, w, 220, d, 0, 0, 0, mat(C.offWhite));
      const n = Math.max(2, Math.round(w / 55));
      for (let i = 1; i < n; i++) bx(g, 0.8, 210, 1, -w / 2 + (w / n) * i, 5, d / 2 + 0.3, mat(C.grey || 0xb8b3aa), false);
      for (let i = 0; i < n; i++) bx(g, 1.5, 30, 2, -w / 2 + (w / n) * (i + 0.5) + (i % 2 ? -w / n / 2 + 6 : w / n / 2 - 6), 95, d / 2 + 1, M.chrome, false);
      return g;
    },
    sofa({ w, d }) {
      const g = new T.Group(), f = mat(C.fabric);
      bx(g, w, 40, d, 0, 0, 0, f);
      bx(g, w, 42, 20, 0, 40, -d / 2 + 10, f);
      bx(g, 18, 22, d, -w / 2 + 9, 40, 0, f);
      bx(g, 18, 22, d, w / 2 - 9, 40, 0, f);
      const n = w >= 200 ? 3 : 2, cw = (w - 36) / n;
      for (let i = 0; i < n; i++) bx(g, cw - 3, 11, d - 26, -w / 2 + 18 + cw * (i + 0.5), 40, 6, mat(C.cushion));
      bx(g, 40, 34, 12, -w / 2 + 40, 51, -d / 2 + 26, mat(C.fabric2)).rotation.y = 0.15;
      return g;
    },
    coffeeTable({ w, d }) {
      const g = new T.Group();
      bx(g, w, 4, d, 0, 36, 0, mat(C.oak));
      legs(g, w, d, 36, 5, mat(C.dark));
      return g;
    },
    tvUnit({ w, d }) {
      const g = new T.Group();
      bx(g, w, 45, d, 0, 0, 0, mat(C.white));
      bx(g, w, 2, d, 0, 45, 0, mat(C.oak));
      const tw = Math.min(140, w * 0.75);
      bx(g, 30, 2, 16, 0, 47, -d / 2 + 14, mat(C.dark));
      bx(g, 4, 10, 4, 0, 49, -d / 2 + 14, mat(C.dark));
      bx(g, tw, tw * 0.57, 4, 0, 59, -d / 2 + 14, mat(C.black, { roughness: 0.3 }));
      return g;
    },
    chair() {
      const g = new T.Group();
      bx(g, 44, 5, 44, 0, 44, 0, mat(C.fabric2));
      legs(g, 44, 44, 44, 3, mat(C.oakDark), 3);
      bx(g, 44, 42, 4, 0, 49, -20, mat(C.fabric2));
      return g;
    },
    dining({ w, d }) {
      // w × d е самата маса; столиците се надвор по z (вкупна длабочина d + 110)
      const g = new T.Group();
      bx(g, w, 4, d, 0, 72, 0, mat(C.oak));
      legs(g, w, d, 72, 6, mat(C.oakDark), 6);
      const n = Math.max(1, Math.floor(w / 60)), step = w / n;
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
        const c = ITEMS.chair();
        c.position.set(-w / 2 + step * (i + 0.5), 0, s * (d / 2 + 18));
        c.rotation.y = s > 0 ? Math.PI : 0;
        g.add(c);
      }
      return g;
    },
    kitchen({ w, d, fridge, uppers }) {
      // fridge: -1 = лево, 1 = десно, 0 = без; горни плакари само ако нема прозор над редот
      const g = new T.Group(), fw = fridge ? 66 : 0;
      const c0 = fridge < 0 ? -w / 2 + fw : -w / 2, c1 = fridge > 0 ? w / 2 - fw : w / 2, cw = c1 - c0, cx = (c0 + c1) / 2;
      if (fridge) bx(g, fw - 2, 200, d, fridge < 0 ? -w / 2 + fw / 2 : w / 2 - fw / 2, 0, 0, mat(C.white, { roughness: 0.4 }));
      bx(g, cw, 86, d - 4, cx, 0, -2, mat(C.white));
      bx(g, cw, 4, d, cx, 86, 0, mat(C.dark, { roughness: 0.35 }));
      for (let x = c0 + 60; x < c1 - 5; x += 60) bx(g, 0.8, 80, 1, x, 4, d / 2 - 3.7, mat(0xc9c4ba), false);
      const sinkX = cx - cw / 4, hobX = cx + cw / 4;
      if (cw >= 120) {
        bx(g, 50, 1, 40, sinkX, 90, 0, M.chrome, false);
        cy(g, 1.4, 1.4, 25, sinkX, 90, -d / 2 + 8, M.chrome, 8);
        bx(g, 58, 1, 50, hobX, 90, 0, mat(C.black, { roughness: 0.2 }), false);
      }
      if (uppers) {
        bx(g, cw, 70, 34, cx, 150, -d / 2 + 17, mat(C.white));
        if (cw >= 120) bx(g, 60, 10, 45, hobX, 140, -d / 2 + 22, M.chrome);
      }
      return g;
    },
    toilet() {
      const g = new T.Group(), m = mat(C.ceramic, { roughness: 0.3 });
      bx(g, 36, 38, 17, 0, 40, -24, m);
      const bowl = cy(g, 17, 14, 40, 0, 0, 4, m, 20);
      bowl.scale.z = 1.35;
      cy(g, 18, 18, 3, 0, 40, 4, mat(C.white, { roughness: 0.4 }), 20).scale.z = 1.35;
      return g;
    },
    vanity({ w, d }) {
      const g = new T.Group();
      bx(g, w, 48, d - 4, 0, 32, -2, mat(C.oak));
      bx(g, w, 6, d, 0, 80, 0, mat(C.ceramic, { roughness: 0.3 }));
      cy(g, 1.5, 1.5, 20, 0, 86, -d / 2 + 7, M.chrome, 8);
      bx(g, w * 0.85, 70, 2, 0, 105, -d / 2 + 1, M.mirror);
      return g;
    },
    shower({ w, d }) {
      const g = new T.Group();
      bx(g, w, 6, d, 0, 0, 0, mat(C.ceramic, { roughness: 0.3 }));
      bx(g, w, 194, 1, 0, 6, d / 2 - 1, M.glass, false);
      bx(g, 1, 194, d, w / 2 - 1, 6, 0, M.glass, false);
      cy(g, 1.2, 1.2, 70, -w / 2 + 6, 120, -d / 2 + 6, M.chrome, 8);
      cy(g, 9, 9, 2, -w / 2 + 14, 196, -d / 2 + 14, M.chrome, 12);
      return g;
    },
    bathtub({ w, d }) {
      const g = new T.Group(), m = mat(C.ceramic, { roughness: 0.3 });
      bx(g, w, 56, d, 0, 0, 0, m);
      bx(g, w - 16, 1, d - 16, 0, 56, 0, mat(0xd7ebf1, { roughness: 0.2 }), false);
      cy(g, 1.4, 1.4, 18, -w / 2 + 10, 56, 0, M.chrome, 8);
      return g;
    },
    washer() {
      const g = new T.Group();
      bx(g, 60, 85, 58, 0, 0, 0, mat(C.white, { roughness: 0.4 }));
      const ring = part(g, new T.CylinderGeometry(17, 17, 2, 24), mat(C.dark, { roughness: 0.2 }), 0, 45, 29.5);
      ring.rotation.x = Math.PI / 2;
      return g;
    },
    shelf({ w, d }) {
      const g = new T.Group(), m = mat(C.oak);
      bx(g, 2, 200, d, -w / 2 + 1, 0, 0, m); bx(g, 2, 200, d, w / 2 - 1, 0, 0, m);
      const box = [0xc9b79c, 0x9fb3c2, 0xd8d2c6, 0xb58f7a];
      for (let k = 0; k < 5; k++) {
        bx(g, w, 2, d, 0, 8 + k * 46, 0, m);
        if (k < 4) bx(g, w * 0.35, 28, d * 0.8, -w / 4 + (k % 2) * w / 2.5, 10 + k * 46, 0, mat(box[k]));
      }
      return g;
    },
    shoeCabinet({ w, d }) {
      const g = new T.Group();
      bx(g, w, 88, d, 0, 0, 0, mat(C.white));
      bx(g, w, 3, d, 0, 88, 0, mat(C.oak));
      return g;
    },
    boiler() {
      const g = new T.Group();
      cy(g, 25, 25, 120, 0, 40, 0, mat(C.white, { roughness: 0.4 }), 20);
      return g;
    },
    car() {
      // Должината е по z (предниот дел кон +z)
      const g = new T.Group(), body = mat(C.car, { roughness: 0.35, metalness: 0.4 });
      bx(g, 176, 58, 440, 0, 22, 0, body);
      bx(g, 150, 46, 230, 0, 80, -25, mat(0x2c3a44, { roughness: 0.1, metalness: 0.3 }));
      bx(g, 146, 5, 214, 0, 126, -25, body);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wh = part(g, new T.CylinderGeometry(32, 32, 22, 18), mat(C.black), sx * 80, 32, sz * 140);
        wh.rotation.z = Math.PI / 2;
      }
      for (const sx of [-1, 1]) bx(g, 26, 10, 3, sx * 60, 55, 220, mat(0xfff6dc, { emissive: 0xfff0c0, emissiveIntensity: 0.4 }), false);
      return g;
    },
    plant({ s = 1 } = {}) {
      const g = new T.Group();
      cy(g, 17 * s, 13 * s, 36 * s, 0, 0, 0, mat(C.terracotta), 14);
      const f = part(g, new T.IcosahedronGeometry(30 * s, 0), flat(C.leaf), 0, 70 * s, 0);
      f.scale.y = 1.25;
      return g;
    },
    rug({ w, d }) {
      const g = new T.Group();
      bx(g, w, 0.8, d, 0, 0.4, 0, mat(C.rug, { roughness: 1 }), false);
      return g;
    },
  };

  // ══ Распоред во просторија ══
  const insidePoly = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  function segDist(ax, ay, bx, by, x, y) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    return Math.hypot(ax + dx * t - x, ay + dy * t - y);
  }

  // Најголем правоаголник (по оските) во просторијата, подалеку од ѕидовите
  function roomRect(pts, walls) {
    const S = 10;
    const edges = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const w = walls.find((x) => segDist(x.x1, x.y1, x.x2, x.y2, mx, my) < 2);
      return { a, b, half: (w ? w.T : 12) / 2 + 3 };
    });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const X0 = Math.min(...xs), Y0 = Math.min(...ys);
    const nx = Math.ceil((Math.max(...xs) - X0) / S), ny = Math.ceil((Math.max(...ys) - Y0) / S);
    if (nx < 3 || ny < 3 || nx * ny > 250000) return null;
    const hgt = new Array(nx).fill(0);
    let best = null, bestA = 0;
    for (let j = 0; j < ny; j++) {
      const y = Y0 + (j + 0.5) * S;
      for (let i = 0; i < nx; i++) {
        const x = X0 + (i + 0.5) * S;
        const ok = insidePoly(pts, x, y) && edges.every((e) => segDist(e.a[0], e.a[1], e.b[0], e.b[1], x, y) >= e.half);
        hgt[i] = ok ? hgt[i] + 1 : 0;
      }
      // Најголем правоаголник во хистограмот (стек)
      const stack = [];
      for (let i = 0; i <= nx; i++) {
        const h = i < nx ? hgt[i] : 0;
        let start = i;
        while (stack.length && stack[stack.length - 1][1] >= h) {
          const [si, sh] = stack.pop();
          const a = sh * (i - si);
          if (a > bestA) { bestA = a; best = { i0: si, i1: i - 1, j0: j - sh + 1, j1: j }; }
          start = si;
        }
        stack.push([start, h]);
      }
    }
    if (!best) return null;
    return { x0: X0 + (best.i0 + 0.5) * S, x1: X0 + (best.i1 + 0.5) * S, y0: Y0 + (best.j0 + 0.5) * S, y1: Y0 + (best.j1 + 0.5) * S };
  }

  // Зони што мебелот не смее да ги затвори: врати (со отворање на двете страни) и прозори (за високи предмети)
  function blockers(walls) {
    const out = [];
    for (const w of walls) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (L < 1) continue;
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, nx = -uy, ny = ux;
      for (const o of w.ops) {
        const cx = w.x1 + ux * o.t, cy2 = w.y1 + uy * o.t;
        const door = !o.glass, low = o.bottom <= 0;
        const hw = o.w / 2 + (door ? 10 : 5), dep = door ? o.w + 10 : low ? 90 : 40;
        const q = [[-hw, -dep], [hw, -dep], [hw, dep], [-hw, dep]].map(([u, n]) => [cx + ux * u + nx * n, cy2 + uy * u + ny * n]);
        out.push({ q, sill: door || low ? 0 : o.bottom });
      }
    }
    return out;
  }
  // Пресек на четириаголник и правоаголник по оските (теорема за раздвојна оска)
  function quadHitsRect(q, r) {
    const rq = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
    const axes = [[1, 0], [0, 1]];
    for (let i = 0; i < 2; i++) { const [a, b] = q[i], [c, d] = q[i + 1]; axes.push([-(d - b), c - a]); }
    for (const [ax, ay] of axes) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of q) { const p = x * ax + y * ay; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
      for (const [x, y] of rq) { const p = x * ax + y * ay; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
      if (a1 <= b0 + 0.01 || b1 <= a0 + 0.01) return false;
    }
    return true;
  }
  const hit = (a, b, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
  const inRect = (a, R) => a.x0 >= R.x0 - 0.5 && a.x1 <= R.x1 + 0.5 && a.y0 >= R.y0 - 0.5 && a.y1 <= R.y1 + 0.5;

  // Ротација по страна: top = ѕидот на y0 (предниот дел кон +y), bottom = y1, left = x0, right = x1
  const ROT = { top: 0, bottom: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  const FACE = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] };

  function Room(R, blk) {
    const placed = [];
    const W = R.x1 - R.x0, H = R.y1 - R.y0;
    const sideLen = (s) => (s === 'top' || s === 'bottom' ? W : H);
    const free = (fp, clear, h, margin = 0) => {
      if (!inRect(fp, R)) return false;
      for (const p of placed) if (hit(fp, p.fp, margin) || (clear && hit(clear, p.fp)) || (p.clear && hit(fp, p.clear))) return false;
      for (const b of blk) if ((b.sill === 0 || h > b.sill - 5) && quadHitsRect(b.q, fp)) return false;
      return true;
    };
    const rectAt = (side, c, w, d) => {
      if (side === 'top') return { x0: c - w / 2, x1: c + w / 2, y0: R.y0, y1: R.y0 + d };
      if (side === 'bottom') return { x0: c - w / 2, x1: c + w / 2, y0: R.y1 - d, y1: R.y1 };
      if (side === 'left') return { x0: R.x0, x1: R.x0 + d, y0: c - w / 2, y1: c + w / 2 };
      return { x0: R.x1 - d, x1: R.x1, y0: c - w / 2, y1: c + w / 2 };
    };
    const clearOf = (fp, side, front) => {
      if (!front) return null;
      const [fx, fy] = FACE[side];
      return { x0: fx < 0 ? fp.x0 - front : fx > 0 ? fp.x1 : fp.x0, x1: fx > 0 ? fp.x1 + front : fx < 0 ? fp.x0 : fp.x1,
        y0: fy < 0 ? fp.y0 - front : fy > 0 ? fp.y1 : fp.y0, y1: fy > 0 ? fp.y1 + front : fy < 0 ? fp.y0 : fp.y1 };
    };
    // Предмет наслонет на ѕид: се лизга по страната (од средината или од аглите)
    function wall(spec, sides, corner) {
      const order = (sides || ['top', 'bottom', 'left', 'right']).slice();
      for (const side of order) {
        const len = sideLen(side), lo = side === 'top' || side === 'bottom' ? R.x0 : R.y0;
        if (spec.w > len || spec.d + (spec.front || 0) * 0.6 > (side === 'top' || side === 'bottom' ? H : W)) continue;
        const cs = [];
        const a = lo + spec.w / 2, b = lo + len - spec.w / 2;
        if (corner) for (let k = 0; a + k <= b; k += 10) { cs.push(a + k); if (b - k > a + k) cs.push(b - k); }
        else { const m = (a + b) / 2; cs.push(m); for (let k = 10; m - k >= a || m + k <= b; k += 10) { if (m - k >= a) cs.push(m - k); if (m + k <= b) cs.push(m + k); } }
        for (const c of cs) {
          const fp = rectAt(side, c, spec.w, spec.d), clear = clearOf(fp, side, spec.front);
          if (clear && !hit(clear, R, -1)) continue;
          if (!free(fp, clear, spec.h || 100)) continue;
          const p = { side, c, fp, clear: clear && clipTo(clear, R), rot: ROT[side], cx: (fp.x0 + fp.x1) / 2, cy: (fp.y0 + fp.y1) / 2, spec };
          placed.push(p);
          return p;
        }
      }
      return null;
    }
    // Слободно поставување (маса, автомобил): најблиску до целната точка
    function center(spec, target, rots = [0, Math.PI / 2], margin = 30) {
      let best = null;
      for (const rot of rots) {
        const along = Math.abs(Math.sin(rot)) > 0.5, w = along ? spec.d : spec.w, d = along ? spec.w : spec.d;
        for (let x = R.x0 + w / 2; x <= R.x1 - w / 2 + 0.1; x += 10) for (let y = R.y0 + d / 2; y <= R.y1 - d / 2 + 0.1; y += 10) {
          const fp = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 };
          if (!free(fp, null, spec.h || 80, margin)) continue;
          const sc = Math.hypot(x - target[0], y - target[1]);
          if (!best || sc < best.sc) best = { sc, fp, rot, cx: x, cy: y, spec };
        }
      }
      if (best) placed.push(best);
      return best;
    }
    const clipTo = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) });
    const sidesByLen = (desc = true) => ['top', 'bottom', 'left', 'right'].sort((a, b) => (desc ? sideLen(b) - sideLen(a) : sideLen(a) - sideLen(b)));
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    return { R, W, H, placed, wall, center, free, sidesByLen, opposite, rectAt, add: (p) => placed.push(p) };
  }

  // Рецепти по тип на просторија → листа { make, opts, cx, cy, rot }
  function furnishRoom(type, R, blk, area) {
    const r = Room(R, blk), out = [];
    const put = (p, make, opts) => { if (p) out.push({ make, opts, cx: p.cx, cy: p.cy, rot: p.rot }); return p; };
    const fitW = (opts, max) => opts.find((w) => w <= max);
    const long = Math.max(r.W, r.H), small = area < 9;

    if (type === 'dnevna') {
      let kitchen = null;
      for (const L of [360, 300, 240, 180]) {
        if (L > long - 20) continue;
        kitchen = r.wall({ w: L, d: 62, h: 95, front: 100 }, r.sidesByLen(), true);
        if (kitchen) break;
      }
      if (kitchen) {
        const s = kitchen.spec, fp = kitchen.fp, along = kitchen.side === 'top' || kitchen.side === 'bottom';
        // Фрижидерот на крајот кон аголот (каде нема прозор); горни плакари само без прозор над редот
        const hasWin = (lo, hi) => blk.some((b) => b.sill > 0 && quadHitsRect(b.q, along ? { x0: lo, x1: hi, y0: fp.y0, y1: fp.y1 } : { x0: fp.x0, x1: fp.x1, y0: lo, y1: hi }));
        const a0 = along ? fp.x0 : fp.y0, a1 = along ? fp.x1 : fp.y1;
        // Локалното „лево“ (−x) на предметот, изразено во план, зависи од страната
        const leftIsLow = kitchen.side === 'top' || kitchen.side === 'right';
        const sideFree = (low) => !hasWin(low ? a0 : a1 - 66, low ? a0 + 66 : a1);
        const preferLow = Math.abs(a0 - (along ? R.x0 : R.y0)) < Math.abs(a1 - (along ? R.x1 : R.y1));
        let fridgeLow = preferLow && sideFree(true) ? true : !preferLow && sideFree(false) ? false : sideFree(true) ? true : sideFree(false) ? false : null;
        const fridge = fridgeLow == null || s.w < 240 ? 0 : (fridgeLow === leftIsLow ? -1 : 1);
        put(kitchen, 'kitchen', { w: s.w, d: s.d, fridge, uppers: !hasWin(a0, a1) });
      }
      const sofaW = fitW([240, 220, 200, 180, 160], long * 0.6);
      const sofa = sofaW && r.wall({ w: sofaW, d: 92, h: 85, front: 150 }, r.sidesByLen().filter((s) => !kitchen || s !== kitchen.side));
      if (sofa) {
        put(sofa, 'sofa', { w: sofaW, d: 92 });
        const [fx, fy] = FACE[sofa.side], tx = sofa.cx + fx * (46 + 40 + 28), ty = sofa.cy + fy * (46 + 40 + 28);
        const ct = { w: 100, d: 56 }, along = sofa.side === 'top' || sofa.side === 'bottom';
        const fp = along ? { x0: tx - 50, x1: tx + 50, y0: ty - 28, y1: ty + 28 } : { x0: tx - 28, x1: tx + 28, y0: ty - 50, y1: ty + 50 };
        if (r.free(fp, null, 40)) {
          out.push({ make: 'rug', opts: along ? { w: Math.min(220, sofaW), d: 150 } : { w: Math.min(220, sofaW), d: 150 }, cx: tx, cy: ty, rot: sofa.rot });
          r.add({ fp, cx: tx, cy: ty });
          out.push({ make: 'coffeeTable', opts: ct, cx: tx, cy: ty, rot: sofa.rot });
        }
        // ТВ на спротивниот ѕид, во линија со софата
        const opp = r.opposite[sofa.side], tvW = 180, tvD = 42;
        const dist = along ? r.H : r.W;
        if (dist >= 300) {
          const fpTv = r.rectAt(opp, along ? sofa.cx : sofa.cy, tvW, tvD);
          if (r.free(fpTv, null, 60)) { r.add({ fp: fpTv }); out.push({ make: 'tvUnit', opts: { w: tvW, d: tvD }, cx: (fpTv.x0 + fpTv.x1) / 2, cy: (fpTv.y0 + fpTv.y1) / 2, rot: ROT[opp] }); }
        }
      }
      // Трпезарија: поблиску до кујната
      const target = kitchen ? [kitchen.cx, kitchen.cy] : [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2];
      const tw = area > 22 ? 160 : 120, td = area > 22 ? 90 : 80;
      put(r.center({ w: tw, d: td + 110, h: 80 }, target, [0, Math.PI / 2], 25), 'dining', { w: tw, d: td });
      for (const corner of [[R.x0 + 22, R.y0 + 22], [R.x1 - 22, R.y1 - 22], [R.x1 - 22, R.y0 + 22], [R.x0 + 22, R.y1 - 22]]) {
        const fp = { x0: corner[0] - 22, x1: corner[0] + 22, y0: corner[1] - 22, y1: corner[1] + 22 };
        if (r.free(fp, null, 100, 10)) { r.add({ fp }); out.push({ make: 'plant', opts: { s: 1.15 }, cx: corner[0], cy: corner[1], rot: 0 }); break; }
      }
    }

    if (type === 'spalna') {
      const double = !small && Math.min(r.W, r.H) >= 300;
      const bw = double ? 160 : 90, bd = 205;
      // Кревет со ноќни ормариња (ако има место) — глава кон ѕид
      let bed = r.wall({ w: bw + 100, d: bd, h: 60, front: 60 }, r.sidesByLen());
      const withNs = !!bed;
      if (!bed) bed = r.wall({ w: bw, d: bd, h: 60, front: 50 }, r.sidesByLen());
      if (bed) {
        const along = bed.side === 'top' || bed.side === 'bottom', [fx, fy] = FACE[bed.side];
        out.push({ make: 'bed', opts: { w: bw, d: bd }, cx: bed.cx, cy: bed.cy, rot: bed.rot });
        if (withNs) for (const s of [-1, 1]) {
          const off = s * (bw / 2 + 26), x = bed.cx + (along ? off : 0), y = bed.cy + (along ? 0 : off);
          out.push({ make: 'nightstand', opts: {}, cx: x - fx * (bd / 2 - 20), cy: y - fy * (bd / 2 - 20), rot: bed.rot });
        }
      }
      for (const ww of [240, 200, 160, 120, 100]) {
        const p = r.wall({ w: ww, d: 60, h: 220, front: 70 }, r.sidesByLen(), true);
        if (p) { put(p, 'wardrobe', { w: ww, d: 60 }); break; }
      }
      if (!small) {
        for (const corner of [[R.x0 + 22, R.y1 - 22], [R.x1 - 22, R.y1 - 22], [R.x1 - 22, R.y0 + 22], [R.x0 + 22, R.y0 + 22]]) {
          const fp = { x0: corner[0] - 20, x1: corner[0] + 20, y0: corner[1] - 20, y1: corner[1] + 20 };
          if (r.free(fp, null, 100, 10)) { r.add({ fp }); out.push({ make: 'plant', opts: { s: 0.9 }, cx: corner[0], cy: corner[1], rot: 0 }); break; }
        }
      }
    }

    if (type === 'banja') {
      const tub = area >= 5 && long >= 175 && r.wall({ w: 170, d: 75, h: 60, front: 60 }, r.sidesByLen(), true);
      if (tub) put(tub, 'bathtub', { w: 170, d: 75 });
      else put(r.wall({ w: 90, d: 90, h: 200, front: 55 }, r.sidesByLen(false), true), 'shower', { w: 90, d: 90 });
      put(r.wall({ w: 80, d: 50, h: 85, front: 60 }, null), 'vanity', { w: 80, d: 50 }) || put(r.wall({ w: 60, d: 45, h: 85, front: 50 }, null), 'vanity', { w: 60, d: 45 });
      put(r.wall({ w: 42, d: 66, h: 80, front: 55 }, null, true), 'toilet', {});
      if (area >= 5) put(r.wall({ w: 60, d: 58, h: 85, front: 55 }, null, true), 'washer', {});
    }

    if (type === 'hodnik' && Math.min(r.W, r.H) >= 120) {
      put(r.wall({ w: 100, d: 35, h: 90, front: 80 }, r.sidesByLen(), true), 'shoeCabinet', { w: 100, d: 35 });
    }

    if (type === 'ostava') {
      for (let k = 0; k < 2; k++) put(r.wall({ w: 100, d: 40, h: 200, front: 60 }, r.sidesByLen(), true), 'shelf', { w: 100, d: 40 });
      put(r.wall({ w: 52, d: 52, h: 160, front: 40 }, null, true), 'boiler', {});
    }

    if (type === 'garaza') {
      const vertical = r.H >= r.W;
      const car = r.center({ w: 190, d: 460, h: 150 }, [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2], vertical ? [0] : [Math.PI / 2], 0);
      if (car) out.push({ make: 'car', opts: {}, cx: car.cx, cy: car.cy, rot: car.rot });
      put(r.wall({ w: 120, d: 40, h: 200, front: 40 }, r.sidesByLen(), true), 'shelf', { w: 120, d: 40 });
    }
    return out;
  }

  // Мебел за еден кат. floor: { base, walls, rooms: [{ pts, type, label }] } → натписи за просториите
  function furnish(three, floor, add, withFurniture = true) {
    T = three;
    const blk = blockers(floor.walls), labels = [];
    for (const rm of floor.rooms) {
      const R = roomRect(rm.pts, floor.walls);
      if (rm.label) {
        const c = R ? [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2] : rm.pts[0];
        labels.push({ text: rm.label, x: c[0], y: floor.base + 110, z: c[1] });
      }
      if (!withFurniture || !R || R.x1 - R.x0 < 60 || R.y1 - R.y0 < 60) continue;
      let area = 0;
      for (let i = 0; i < rm.pts.length; i++) { const [x1, y1] = rm.pts[i], [x2, y2] = rm.pts[(i + 1) % rm.pts.length]; area += x1 * y2 - x2 * y1; }
      for (const it of furnishRoom(rm.type, R, blk, Math.abs(area) / 2e4)) {
        const obj = ITEMS[it.make](it.opts || {});
        obj.position.set(it.cx, floor.base + 1, it.cy);
        obj.rotation.y = it.rot || 0;
        add(obj);
      }
    }
    return labels;
  }

  // ══ Двор ══
  // Псевдослучајни броеви со семе — дрвјата не скокаат при секое освежување
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const G = -20;  // ниво на тревата/плочките околу куќата

  function tree(rand, pink) {
    const g = new T.Group(), s = 0.85 + rand() * 0.45;
    cy(g, 9 * s, 14 * s, 230 * s, 0, 0, 0, flat(C.trunk), 7);
    const col = pink ? C.blossom : [C.leaf, C.leaf2, C.leaf3][Math.floor(rand() * 3)];
    const n = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(), r = i ? 55 * s : 0;
      part(g, new T.IcosahedronGeometry((i ? 80 : 105) * s, 1), flat(col), Math.cos(a) * r, (i ? 255 : 300) * s, Math.sin(a) * r);
    }
    g.rotation.y = rand() * 6.28;
    return g;
  }
  function shrub(rand) {
    const g = new T.Group(), s = 0.7 + rand() * 0.6;
    part(g, new T.IcosahedronGeometry(42 * s, 1), flat(rand() > 0.5 ? C.leaf2 : C.leaf3), 0, 28 * s, 0).scale.y = 0.75;
    return g;
  }
  function lounger() {
    const g = new T.Group();
    bx(g, 70, 30, 150, 0, 0, 20, mat(C.white));
    bx(g, 64, 8, 140, 0, 30, 20, mat(C.fabric2));
    const back = bx(g, 64, 8, 70, 0, 40, -80, mat(C.fabric2));
    back.rotation.x = -0.6; back.position.y += 18;
    return g;
  }
  function loungeChair() {
    const g = new T.Group(), m = mat(C.oakDark);
    bx(g, 72, 30, 72, 0, 0, 0, m);
    bx(g, 66, 12, 62, 0, 30, 4, mat(C.cushion));
    bx(g, 72, 45, 10, 0, 30, -31, m);
    bx(g, 10, 22, 72, -31, 30, 0, m); bx(g, 10, 22, 72, 31, 30, 0, m);
    return g;
  }
  function pool(w, d) {
    const g = new T.Group(), stone = mat(C.stone, { roughness: 0.95 }), E = 45;
    bx(g, w + 2 * E, 12, E, 0, 0, -d / 2 - E / 2, stone);
    bx(g, w + 2 * E, 12, E, 0, 0, d / 2 + E / 2, stone);
    bx(g, E, 12, d, -w / 2 - E / 2, 0, 0, stone);
    bx(g, E, 12, d, w / 2 + E / 2, 0, 0, stone);
    bx(g, w, 2, d, 0, 0, 0, mat(0x7fd3e6, { roughness: 0.6 }), false);
    bx(g, w, 1, d, 0, 7, 0, M.water, false);
    // Скалило во аголот
    bx(g, 120, 6, 40, -w / 2 + 60, 0, -d / 2 + 20, mat(0xe7f5f8), false);
    return g;
  }
  function firePit() {
    const g = new T.Group();
    cy(g, 250, 250, 2, 0, 0, 0, mat(C.gravel, { roughness: 1 }), 40).receiveShadow = true;
    const ring = part(g, new T.TorusGeometry(62, 15, 8, 18), flat(0x8f8a82), 0, 14, 0);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const l = bx(g, 70, 10, 10, 0, 8, 0, flat(C.trunk)); l.rotation.y = i * 1.05; }
    part(g, new T.ConeGeometry(26, 55, 6), M.fire, 0, 40, 0, false);
    const pl = new T.PointLight(0xff8a3a, 1.2, 600, 2);
    pl.position.set(0, 60, 0);
    g.add(pl);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, c = loungeChair();
      c.position.set(Math.sin(a) * 175, 0, Math.cos(a) * 175);
      c.rotation.y = a + Math.PI;
      g.add(c);
    }
    for (const a of [0, Math.PI]) cy(g, 20, 23, 42, Math.sin(a) * 180, 0, Math.cos(a) * 180, flat(C.trunk), 8);
    return g;
  }
  function fenceRun(g, ax, az, bx2, bz, gaps) {
    const L = Math.hypot(bx2 - ax, bz - az), ux = (bx2 - ax) / L, uz = (bz - az) / L, wood = flat(C.fence);
    const inGap = (t) => gaps.some(([a, b]) => t > a && t < b);
    const n = Math.max(1, Math.round(L / 240));
    for (let i = 0; i <= n; i++) {
      const t = (L * i) / n;
      if (inGap(t)) continue;
      bx(g, 12, 120, 12, ax + ux * t, G, az + uz * t, wood);
    }
    // Шини меѓу столбовите, прекинати кај капијата
    const cuts = [0, ...gaps.flat(), L].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const t0 = cuts[i], t1 = cuts[i + 1], len = t1 - t0;
      if (len < 20) continue;
      const mx = ax + ux * (t0 + len / 2), mz = az + uz * (t0 + len / 2);
      for (const y of [45, 95]) {
        const r = bx(g, len, 9, 5, mx, G + y, mz, wood);
        r.rotation.y = -Math.atan2(uz, ux);
      }
    }
  }

  // info: { house: {x0,x1,y0,y1} (план, cm), door: {x,y,nx,ny} | null, floors }
  function garden(three, info, add) {
    T = three;
    const H = info.house, door = info.door;
    const rand = rng(Math.round((H.x1 - H.x0) * 7 + (H.y1 - H.y0) * 13));
    // Предна страна: кон која гледа влезната врата (стандардно +y, кон почетната камера)
    const front = door ? (Math.abs(door.nx) > Math.abs(door.ny) ? (door.nx > 0 ? 'E' : 'W') : (door.ny > 0 ? 'S' : 'N')) : 'S';
    const mg = { N: 800, S: 800, E: 650, W: 650 };
    mg[front] = 1000;
    mg[{ N: 'S', S: 'N', E: 'W', W: 'E' }[front]] = 1000;
    const P = { x0: H.x0 - mg.W, x1: H.x1 + mg.E, y0: H.y0 - mg.N, y1: H.y1 + mg.S };
    const g = new T.Group();
    const used = [{ x0: H.x0 - 150, x1: H.x1 + 150, y0: H.y0 - 150, y1: H.y1 + 150 }];
    const free = (r, m = 0) => r.x0 >= P.x0 + 60 && r.x1 <= P.x1 - 60 && r.y0 >= P.y0 + 60 && r.y1 <= P.y1 - 60 && !used.some((u) => hit(r, u, m));

    // Патека од влезот до оградата + капија
    const gaps = { N: [], S: [], E: [], W: [] };
    if (door) {
      const PW = 130, x0 = door.x, y0 = door.y;
      const end = front === 'S' ? P.y1 : front === 'N' ? P.y0 : front === 'E' ? P.x1 : P.x0;
      const vert = front === 'S' || front === 'N';
      const a = vert ? Math.min(y0, end) : Math.min(x0, end), b = vert ? Math.max(y0, end) : Math.max(x0, end);
      const r = vert ? { x0: x0 - PW / 2, x1: x0 + PW / 2, y0: a, y1: b } : { x0: a, x1: b, y0: y0 - PW / 2, y1: y0 + PW / 2 };
      const geo = new T.BoxGeometry(r.x1 - r.x0, 2, r.y1 - r.y0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.x1 - r.x0), uv.getY(i) * (r.y1 - r.y0));
      part(g, geo, info.paverMat || mat(C.stone), (r.x0 + r.x1) / 2, G - 0.6, (r.y0 + r.y1) / 2, false);
      used.push({ x0: r.x0 - 60, x1: r.x1 + 60, y0: r.y0 - 60, y1: r.y1 + 60 });
      const cpos = vert ? x0 - P.x0 : y0 - P.y0;
      gaps[front] = [[cpos - PW / 2 - 10, cpos + PW / 2 + 10]];
      // Грмушки покрај капијата
      for (const s of [-1, 1]) {
        const sh = shrub(rand);
        sh.position.set(vert ? x0 + s * (PW / 2 + 70) : (front === 'E' ? P.x1 - 90 : P.x0 + 90), G, vert ? (front === 'S' ? P.y1 - 90 : P.y0 + 90) : y0 + s * (PW / 2 + 70));
        g.add(sh);
      }
    }

    // Ограда
    fenceRun(g, P.x0, P.y0, P.x1, P.y0, gaps.N);
    fenceRun(g, P.x1, P.y0, P.x1, P.y1, gaps.E);
    fenceRun(g, P.x0, P.y1, P.x1, P.y1, gaps.S);
    fenceRun(g, P.x0, P.y0, P.x0, P.y1, gaps.W);

    // Базен во задниот двор (спротивно од влезот)
    const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[front];
    const bVert = back === 'N' || back === 'S';
    const zone = back === 'N' ? { x0: P.x0, x1: P.x1, y0: P.y0, y1: H.y0 } : back === 'S' ? { x0: P.x0, x1: P.x1, y0: H.y1, y1: P.y1 }
      : back === 'W' ? { x0: P.x0, x1: H.x0, y0: P.y0, y1: P.y1 } : { x0: H.x1, x1: P.x1, y0: P.y0, y1: P.y1 };
    for (const [pw, pd] of [[800, 350], [600, 300], [450, 250]]) {
      const w = bVert ? pw : pd, d = bVert ? pd : pw;
      const cx = (zone.x0 + zone.x1) / 2 + (bVert ? (H.x1 - H.x0) * 0.12 : 0), cz = (zone.y0 + zone.y1) / 2 + (bVert ? 0 : (H.y1 - H.y0) * 0.12);
      const r = { x0: cx - w / 2 - 45, x1: cx + w / 2 + 45, y0: cz - d / 2 - 45, y1: cz + d / 2 + 45 };
      if (!free(r, 40)) continue;
      const pl = pool(pw, pd);
      pl.position.set(cx, G, cz);
      if (!bVert) pl.rotation.y = Math.PI / 2;
      g.add(pl);
      used.push({ x0: r.x0 - 40, x1: r.x1 + 40, y0: r.y0 - 40, y1: r.y1 + 40 });
      // Две лежалки покрај базенот (од страната на куќата)
      for (const s of [-1, 1]) {
        const l = lounger(), toHouse = back === 'N' ? 1 : back === 'S' ? -1 : back === 'W' ? 1 : -1;
        const along = bVert ? cx + s * 90 : cz + s * 90;
        const off = (bVert ? d : w) / 2 + 45 + 110;
        const lx = bVert ? along : cx + toHouse * off, lz = bVert ? cz + toHouse * off : along;
        const lr = { x0: lx - 50, x1: lx + 50, y0: lz - 50, y1: lz + 50 };
        if (!free(lr)) continue;
        l.position.set(lx, G, lz);
        l.rotation.y = bVert ? (toHouse > 0 ? 0 : Math.PI) : (toHouse > 0 ? Math.PI / 2 : -Math.PI / 2);
        g.add(l);
        used.push(lr);
      }
      break;
    }

    // Огниште во страничниот двор (поширокиот)
    const sides = front === 'S' || front === 'N'
      ? [{ x0: P.x0, x1: H.x0, y0: H.y0, y1: H.y1 }, { x0: H.x1, x1: P.x1, y0: H.y0, y1: H.y1 }]
      : [{ x0: H.x0, x1: H.x1, y0: P.y0, y1: H.y0 }, { x0: H.x0, x1: H.x1, y0: H.y1, y1: P.y1 }];
    let fireDone = false;
    for (const z of [...sides, zone]) {
      if (fireDone) break;
      const cx = (z.x0 + z.x1) / 2, cz = (z.y0 + z.y1) / 2, rr = 260;
      for (const [dx, dz] of [[0, 0], [120, 0], [-120, 0], [0, 120], [0, -120]]) {
        const r = { x0: cx + dx - rr, x1: cx + dx + rr, y0: cz + dz - rr, y1: cz + dz + rr };
        if (!free(r, 20)) continue;
        const fp = firePit();
        fp.position.set(cx + dx, G, cz + dz);
        g.add(fp);
        used.push(r);
        fireDone = true;
        break;
      }
    }

    // Дрвја покрај оградата и неколку грмушки во тревата
    const spots = [];
    const ring = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; spots.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } };
    const I = 170;
    ring(P.x0 + I, P.y0 + I, P.x1 - I, P.y0 + I, Math.max(2, Math.round((P.x1 - P.x0) / 700)));
    ring(P.x0 + I, P.y1 - I, P.x1 - I, P.y1 - I, Math.max(2, Math.round((P.x1 - P.x0) / 700)));
    ring(P.x0 + I, P.y0 + I + 300, P.x0 + I, P.y1 - I - 300, Math.max(1, Math.round((P.y1 - P.y0) / 800)));
    ring(P.x1 - I, P.y0 + I + 300, P.x1 - I, P.y1 - I - 300, Math.max(1, Math.round((P.y1 - P.y0) / 800)));
    let k = 0;
    for (const [sx, sz] of spots) {
      const x = sx + (rand() - 0.5) * 160, z = sz + (rand() - 0.5) * 160;
      const r = { x0: x - 110, x1: x + 110, y0: z - 110, y1: z + 110 };
      if (!free(r)) continue;
      const t = tree(rand, k++ % 3 === 2);
      t.position.set(x, G, z);
      g.add(t);
      used.push(r);
    }
    for (let i = 0; i < 14; i++) {
      const x = P.x0 + 120 + rand() * (P.x1 - P.x0 - 240), z = P.y0 + 120 + rand() * (P.y1 - P.y0 - 240);
      const r = { x0: x - 50, x1: x + 50, y0: z - 50, y1: z + 50 };
      if (!free(r)) continue;
      const s = shrub(rand);
      s.position.set(x, G, z);
      g.add(s);
      used.push(r);
    }
    add(g);
    return P;
  }

  window.MDA3DProps = { furnish, garden, _roomRect: roomRect, _furnishRoom: furnishRoom };
})();
