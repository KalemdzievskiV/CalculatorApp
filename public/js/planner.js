/*
 * MDA план — цртач на основа на куќа: ѕидови (надворешни/внатрешни), врати, прозори,
 * простории (клик во затворен простор + тип) и тераси. Сите мерки се во cm.
 *
 *   MDAPlanner.open(plan, { floors: 1|2, labels: {KEY: 'Име'}, eurM2 }, (patch, plan, extra) => { … })
 *
 * patch се вредностите за калкулаторот (WALL_OUT, AREA_HOUSE, WC …), plan е цртежот
 * (се чува со понудата за подоцна да се уредува), extra ги носи редовите за дограмата
 * и поделбата на терасите на покриени / откриени.
 */
(function () {
  const GRID = 10;                      // cm — чекор на мрежата
  const SNAP_PX = 12;                   // привлекување кон постоечка точка/ѕид (во пиксели)
  const THICK = { out: 25, in: 12 };    // cm — дебелина само за приказ
  const DOOR_W = { out: 100, in: 90 };  // cm — стандардна ширина на врата
  // sill = парапет: висина на долниот раб на прозорот од подот (cm)
  const WIN = {
    win:  { label: 'Прозор', w: 120, h: 140, sill: 90 },
    fix:  { label: 'Фикс прозор', w: 100, h: 140, sill: 90 },
    balk: { label: 'Балконска врата', w: 90, h: 215, sill: 0 },
    lizg: { label: 'Лизгачка врата', w: 240, h: 215, sill: 0 },
  };
  // Постарите планови немаат парапет → стандардниот за видот
  const sillOf = (o) => (o.sill != null ? o.sill : WIN[o.kind].sill);
  // Типови простории; floor = стандарден под, fixed = подот не се бира
  const ROOMS = {
    dnevna: { label: 'Дневна / кујна', fill: 'rgba(214,170,110,.24)', stroke: '#b4874c', floor: 'laminat' },
    spalna: { label: 'Спална', fill: 'rgba(150,128,190,.20)', stroke: '#7f6aa8', floor: 'laminat' },
    banja:  { label: 'Бања / WC', fill: 'rgba(70,150,195,.24)', stroke: '#3a88b3', floor: 'plochki', fixed: true },
    hodnik: { label: 'Ходник', fill: 'rgba(170,165,150,.22)', stroke: '#8d867c', floor: 'laminat' },
    ostava: { label: 'Остава / техничка', fill: 'rgba(120,150,110,.20)', stroke: '#6a8a5c', floor: 'plochki' },
    garaza: { label: 'Гаража', fill: 'rgba(110,115,125,.20)', stroke: '#62666f', floor: 'plochki', fixed: true },
  };
  const FLOORS = { laminat: 'Ламинат', plochki: 'Плочки' };
  const ROOF_TYPES = { flat: 'Рамен', mono: 'Еднокосен', gable: 'Двокосен', hip: 'Четирикосен' };
  // lowPitch / lowRot: еднокосен кров над деловите од првиот кат без ништо над нив (пр. гаража)
  const ROOF_DEF = { type: 'gable', pitch: 15, overhang: 30, rot: null, lowPitch: 10, lowRot: 0 };
  const STEP = 18;                      // cm — приближна висина на скалило
  const RECTS = { terrace: 'terraces', stair: 'stairs' };  // правоаголни објекти (влечење, поместување, големина)
  const TOOLS = [
    ['select', 'Избери'],
    ['box', 'Избери област'],
    ['Конструкција'],
    ['out', 'Надворешен ѕид'],
    ['in', 'Внатрешен ѕид'],
    ['rect', 'Правоаголник'],
    ['door', 'Врата'],
    ['win', 'Прозор'],
    ['stair', 'Скали'],
    ['Простории'],
    ...Object.entries(ROOMS).map(([k, R]) => ['room:' + k, R.label]),
    ['Надвор'],
    ['terrace', 'Тераса'],
  ];
  const HINTS = {
    select: 'Клик на елемент за избор. Влечи ѕид, агол (точка), врата, прозор или тераса за да ги поместиш. Клик на мерка на ѕид ја менува должината. Delete брише, Ctrl+Z враќа, Ctrl+C / Ctrl+V копира. Влечи празен простор за поместување на погледот, тркалце за зум.',
    box: 'Влечи правоаголник околу делот од планот што го сакаш. Потоа: влечи го за да го поместиш, копирај (Ctrl+C) и залепи (Ctrl+V), пресликај или сврти го десно.',
    rect: 'Влечи правоаголник = 4 ѕида. Внатре во куќата прави внатрешни ѕидови (просторија), надвор прави надворешни (нова куќа или доградба до постоечката). Ѕидовите што веќе постојат не се дуплираат.',
    paste: 'Помести го курсорот и кликни каде да се залепи. Esc откажува.',
    out: 'Клик за почеток, клик за секој агол. Внеси должина во cm и Enter за точна мерка. Клик на почетната точка ја затвора куќата. Двоен клик или Esc — крај. Shift — слободен агол.',
    in: 'Клик за почеток, клик за секој агол — точките се лепат на постоечките ѕидови. Внеси должина во cm и Enter. Двоен клик или Esc — крај.',
    door: 'Клик на ѕид за да поставиш врата. На внатрешен ѕид = внатрешна врата, на надворешен = влезна (блиндор).',
    win: 'Клик на надворешен ѕид за прозор. Видот, големината, парапетот (висина од подот) и цената се менуваат десно — следниот прозор ги зема истите мерки.',
    room: 'Клик во простор затворен со ѕидови за да му доделиш тип. Клик на постоечка просторија го менува типот.',
    terrace: 'Влечи правоаголник за тераса. Покриена / откриена се избира десно.',
    stair: 'Влечи правоаголник за скалите — стрелката покажува нагоре. Насоката се врти десно.',
    slab: 'Клик за секој агол на бетонската плоча, внеси должина во cm и Enter за точна мерка. Клик на почетната точка ја затвора плочата. Бањите од првиот кат се прикажани за водоводот.',
    '3d': 'Влечи за вртење, десен клик (или Shift) за поместување, тркалце за зум. Висините и кровот се менуваат десно.',
  };

  let root, svg, panel, st;
  const $ = (s) => root.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const snapG = (v) => Math.round(v / GRID) * GRID;
  const r2 = (v) => Math.round(v * 100) / 100;
  const fmt = (v, d = 2) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: d }).format(v);
  // Бетонската плоча е посебен таб: контура (надворешни ѕидови) под куќата, без простории и отвори
  const SLAB = 'slab';
  const isSlab = () => st.floor === SLAB;
  const F = () => (isSlab() ? st.plan.slab : st.plan.floors[st.floor]);
  const emptyFloor = (h) => ({ h: h || 285, walls: [], doors: [], windows: [], rooms: [], terraces: [], stairs: [] });
  const roomTool = (t) => t && t.startsWith('room:') ? t.slice(5) : null;
  const floorName = (i) => (i === SLAB ? 'Бетонска плоча' : (i ? 'Втор' : 'Прв') + ' кат');
  const SLAB_KEY = 'BETONSKA_PLOCHA';
  const SLAB_EDGE = 10;                 // cm — дебелина на ивицата на плочата (само за приказ)

  // ── Геометрија ──
  const wlen = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const wdir = (w) => { const l = wlen(w) || 1; return { ux: (w.x2 - w.x1) / l, uy: (w.y2 - w.y1) / l }; };
  const toS = (x, y) => [x * st.view.s + st.view.tx, y * st.view.s + st.view.ty];
  const toW = (px, py) => ({ x: (px - st.view.tx) / st.view.s, y: (py - st.view.ty) / st.view.s });
  const same = (ax, ay, bx, by) => Math.abs(ax - bx) < 0.5 && Math.abs(ay - by) < 0.5;
  const wallById = (f, id) => f.walls.find((w) => w.id === id);
  const openingsOf = (f, type) => type === 'door' ? f.doors : f.windows;

  // Проекција на точка (cm) врз ѕид: t е растојание од почетокот во cm
  function project(w, x, y) {
    const { ux, uy } = wdir(w), L = wlen(w);
    const t = Math.max(0, Math.min(L, (x - w.x1) * ux + (y - w.y1) * uy));
    return { t, x: w.x1 + ux * t, y: w.y1 + uy * t };
  }

  // На плочата точките се лепат и на аглите на надворешните ѕидови од првиот кат
  const snapWalls = () => (isSlab() ? F().walls.concat(st.plan.floors[0].walls.filter((w) => w.kind === 'out')) : F().walls);
  function nearPoint(px, py, skip) {
    let best = null, bd = SNAP_PX;
    for (const w of snapWalls()) {
      if (skip && skip.has(w)) continue;
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        const [sx, sy] = toS(x, y);
        const d = Math.hypot(sx - px, sy - py);
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    return best;
  }

  function nearWall(px, py, maxPx = SNAP_PX, kind) {
    const m = toW(px, py);
    let best = null;
    for (const w of F().walls) {
      if (kind && w.kind !== kind) continue;
      const p = project(w, m.x, m.y);
      const [sx, sy] = toS(p.x, p.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < maxPx && (!best || d < best.d)) best = { w, d, ...p };
    }
    return best;
  }

  // Точка при цртање ѕид: постоечка точка → ѕид → агол од 45° + мрежа
  // Колку далеку (px) се лепи на ѕид: секаде врз нацртаната дебелина на ѕидот + малку
  const wallSnapPx = () => Math.max(SNAP_PX, THICK.out * st.view.s / 2 + 8);
  // Точка при цртање: агол на ѕид → прав (0/45/90°) правец што удира во ѕид → проекција на ѕид → мрежа.
  // snap кажува на што се залепила (за ознаката на курсорот).
  function drawPoint(px, py, from, free) {
    const p = nearPoint(px, py);
    if (p) return Object.assign(p, { snap: 'point' });
    const m = toW(px, py), lim = wallSnapPx();
    // Од почетната точка по прав правец до оската на ѕидот → внатрешниот ѕид останува исправен
    if (from && !free) {
      const a = Math.round(Math.atan2(m.y - from.y, m.x - from.x) / (Math.PI / 4)) * (Math.PI / 4);
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = null;
      for (const w of snapWalls()) {
        const ex = w.x2 - w.x1, ey = w.y2 - w.y1, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((w.x1 - from.x) * ey - (w.y1 - from.y) * ex) / den, k = ((w.x1 - from.x) * dy - (w.y1 - from.y) * dx) / den;
        if (t < 5 || k < 0 || k > 1) continue;
        const q = { x: from.x + dx * t, y: from.y + dy * t };
        const [sx, sy] = toS(q.x, q.y), d = Math.hypot(sx - px, sy - py);
        if (d < lim && (!best || d < best.d)) best = { d, x: Math.round(q.x), y: Math.round(q.y) };
      }
      if (best) return { x: best.x, y: best.y, snap: 'wall' };
    }
    const nw = nearWall(px, py, lim);
    if (nw) return { x: Math.round(nw.x), y: Math.round(nw.y), snap: 'wall' };
    if (!from) return { x: snapG(m.x), y: snapG(m.y) };
    let dx = m.x - from.x, dy = m.y - from.y;
    if (free) { dx = snapG(dx); dy = snapG(dy); } else {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = snapG(Math.hypot(dx, dy));
      dx = Math.cos(a) * len; dy = Math.sin(a) * len;
    }
    return { x: Math.round(from.x + dx), y: Math.round(from.y + dy) };
  }

  const polyArea = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  };
  const polyPerim = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  // Точка сигурно внатре во полигонот (за натпис и за „семето" на просторијата)
  function labelPoint(pts) {
    const A = polyArea(pts);
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], k = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * k; cy += (y1 + y2) * k;
    }
    cx /= 6 * A; cy /= 6 * A;
    if (inPoly(pts, cx, cy)) return { x: cx, y: cy };
    // Хоризонтална линија низ средината → средина на најширокиот внатрешен дел
    const ys = pts.map((p) => p[1]), y = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.37;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    let best = { x: cx, y: cy }, bw = -1;
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = { x: (xs[i] + xs[i + 1]) / 2, y }; }
    return best;
  }

  // Затворени контури од надворешните ѕидови или null ако не се затворени
  function outerLoops(f) {
    const ws = f.walls.filter((w) => w.kind === 'out');
    if (!ws.length) return null;
    const k = (x, y) => Math.round(x) + ',' + Math.round(y);
    const adj = {};
    for (const w of ws) {
      (adj[k(w.x1, w.y1)] = adj[k(w.x1, w.y1)] || []).push(w);
      (adj[k(w.x2, w.y2)] = adj[k(w.x2, w.y2)] || []).push(w);
    }
    if (Object.values(adj).some((a) => a.length !== 2)) return null;
    const seen = new Set(), loops = [];
    for (const w0 of ws) {
      if (seen.has(w0)) continue;
      const pts = [];
      let w = w0, x = w0.x1, y = w0.y1;
      while (w && !seen.has(w)) {
        seen.add(w);
        pts.push([x, y]);
        const fromStart = k(w.x1, w.y1) === k(x, y);
        x = fromStart ? w.x2 : w.x1; y = fromStart ? w.y2 : w.y1;
        w = adj[k(x, y)].find((o) => o !== w);
      }
      loops.push(pts);
    }
    return loops;
  }
  // Површина затворена од надворешните ѕидови (m²) или null ако не се затворени
  function outerArea(f) {
    const L = outerLoops(f);
    return L ? L.reduce((s, p) => s + Math.abs(polyArea(p)), 0) / 1e4 : null;
  }

  // Контура поместена нанадвор за d (cm), со остри агли
  function offsetPoly(pts, d) {
    if (polyArea(pts) < 0) pts = pts.slice().reverse();
    const n0 = pts.length;
    const P = pts.filter((p, i) => {
      const a = pts[(i - 1 + n0) % n0], b = pts[(i + 1) % n0];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
    });
    if (!d) return P;
    const nrm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
    return P.map((p, i) => {
      const n1 = nrm(P[(i - 1 + P.length) % P.length], p), n2 = nrm(p, P[(i + 1) % P.length]);
      const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
    });
  }

  // Кровни рамнини z = a·x + b·y + c (висина над стреата); кровот е најниската од нив
  function roofPlanes(type, t, x0, y0, x1, y1, rot) {
    const P = (a, b, c) => ({ a, b, c });
    if (type === 'flat') return [P(0, 0, 0)];
    if (type === 'mono') return [[P(0, -t, t * y1), P(t, 0, -t * x0), P(0, t, -t * y0), P(-t, 0, t * x1)][rot % 4]];
    const ns = [P(0, t, -t * y0), P(0, -t, t * y1)], ew = [P(t, 0, -t * x0), P(-t, 0, t * x1)];
    if (type === 'hip') return ns.concat(ew);
    return rot % 2 ? ew : ns;
  }
  const planeZ = (pl, x, y) => pl.a * x + pl.b * y + pl.c;
  const roofZ = (planes, x, y) => Math.min(...planes.map((pl) => planeZ(pl, x, y)));
  // Дел од полигонот каде рамнината P е пониска (или еднаква) од Q
  function clipHalf(poly, P, Q) {
    const f = ([x, y]) => (P.a - Q.a) * x + (P.b - Q.b) * y + (P.c - Q.c);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length], fa = f(A), fb = f(B);
      if (fa <= 0) out.push(A);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const k = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]); }
    }
    return out;
  }

  // Делови од првиот кат без ништо над нив (пр. гаража) → еднокосен кров наслонет на вториот кат.
  // Регионите се добиваат од надворешните ѕидови на двата ката заедно (лица од рамнинскиот граф):
  // лице во првиот кат, а надвор од вториот. Високата страна е кон ѕидот на вториот кат;
  // таму нема препуст (кровот не влегува во катот).
  function lowerRoofs() {
    const fl = st.plan.floors, R = st.plan.roof;
    if (fl.length < 2) return [];
    const L0 = outerLoops(fl[0]), L1 = outerLoops(fl[1]);
    if (!L0 || !L1) return [];
    const up = fl[1].walls.filter((w) => w.kind === 'out');
    const regs = faces({ walls: fl[0].walls.filter((w) => w.kind === 'out').concat(up) }).filter((fc) => {
      const p = labelPoint(fc.pts);
      return fc.area > 1 && L0.some((lp) => inPoly(lp, p.x, p.y)) && !L1.some((lp) => inPoly(lp, p.x, p.y));
    });
    const flat = R.type === 'flat', t = flat ? 0 : Math.tan((R.lowPitch ?? 10) * Math.PI / 180);
    const onUp = (x, y) => up.some((w) => { const pr = project(w, x, y); return Math.hypot(pr.x - x, pr.y - y) < 1.5; });
    return regs.map((fc) => {
      const pts = fc.pts;
      // Рабови што лежат на ѕид од вториот кат, со нормала нанадвор од регионот
      const shared = [];
      let sx = 0, sy = 0;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (len < 1 || !onUp(A[0], A[1]) || !onUp(B[0], B[1]) || !onUp((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) continue;
        let nx = (B[1] - A[1]) / len, ny = -(B[0] - A[0]) / len;
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        if (inPoly(pts, mx + nx * 5, my + ny * 5)) { nx = -nx; ny = -ny; }
        shared.push({ A, nx, ny });
        sx += nx * len; sy += ny * len;
      }
      // Препуст наоколу, освен кон вториот кат (сечење по правата на заедничкиот раб, ако регионот е цел од едната страна)
      let outline = offsetPoly(pts, R.overhang);
      for (const e of shared) {
        const inner = pts.every(([x, y]) => (x - e.A[0]) * e.nx + (y - e.A[1]) * e.ny <= 1);
        if (inner) outline = clipHalf(outline, { a: e.nx, b: e.ny, c: -(e.nx * e.A[0] + e.ny * e.A[1]) }, { a: 0, b: 0, c: 0 });
      }
      const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      // Висока страна (рот): 0 = горе (y0), 1 = десно (x1), 2 = долу (y1), 3 = лево (x0)
      const auto = !shared.length ? 0 : Math.abs(sx) >= Math.abs(sy) ? (sx > 0 ? 1 : 3) : (sy < 0 ? 0 : 2);
      const rot = (auto + (R.lowRot || 0)) % 4;
      const planes = roofPlanes(flat ? 'flat' : 'mono', t, x0, y0, x1, y1, rot);
      const rise = Math.max(0, ...outline.map(([x, y]) => roofZ(planes, x, y)));
      return { outline, planes, pieces: [outline], rot, rise, plan: Math.abs(polyArea(outline)) / 1e4, foot: Math.abs(polyArea(pts)) / 1e4 };
    });
  }

  // Кров над највисокиот кат: површина (коса), симс (препуст) и висина до слеме.
  // Делот од првиот кат што не е покриен со вториот добива свој еднокосен кров (lowerRoofs);
  // ако остане непокриен дел (пр. вториот кат е цел внатре во првиот), тој се смета како рамен.
  function roofGeom() {
    const R = st.plan.roof, fl = st.plan.floors, top = fl.length - 1;
    const loops = outerLoops(fl[top]);
    if (!loops) return null;
    const ang = R.type === 'flat' ? 0 : R.pitch * Math.PI / 180, t = Math.tan(ang);
    const parts = loops.map((loop) => {
      const outline = offsetPoly(loop, R.overhang);
      const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const rot = R.rot == null ? (x1 - x0 >= y1 - y0 ? 0 : 1) : R.rot;
      const planes = roofPlanes(R.type, t, x0, y0, x1, y1, rot);
      const pieces = planes.map((pl, i) => planes.reduce((poly, q, j) => (j === i || poly.length < 3 ? poly : clipHalf(poly, pl, q)), outline))
        .filter((pts) => pts.length >= 3 && Math.abs(polyArea(pts)) > 1);
      const rise = Math.max(0, ...pieces.flat().map(([x, y]) => roofZ(planes, x, y)));
      return { outline, planes, pieces, rot, rise, plan: Math.abs(polyArea(outline)) / 1e4, foot: Math.abs(polyArea(loop)) / 1e4 };
    });
    const plan = parts.reduce((s, p) => s + p.plan, 0), foot = parts.reduce((s, p) => s + p.foot, 0);
    const low = lowerRoofs(), lowAng = R.type === 'flat' ? 0 : (R.lowPitch ?? 10) * Math.PI / 180;
    const lowPlan = low.reduce((s, p) => s + p.plan, 0), lowFoot = low.reduce((s, p) => s + p.foot, 0);
    const lowArea = lowPlan / Math.cos(lowAng);
    const a1 = top ? outerArea(fl[0]) : null, exposed = a1 ? Math.max(0, a1 - foot - lowFoot) : 0;
    const lowRise = Math.max(0, ...low.map((p) => p.rise));
    return { parts, top, low, lowArea, lowRise, area: plan / Math.cos(ang) + lowArea + exposed, exposed: exposed > 0.05 ? exposed : 0,
      sims: plan - foot + lowPlan - lowFoot, rise: Math.max(...parts.map((p) => p.rise)) };
  }

  // Скали: должина на кракот (косо, од под до под) и број на скалила
  const stairRun = (s) => s.dir % 2 ? s.h : s.w;
  const stairLen = (s, f) => Math.hypot(stairRun(s), f.h) / 100;
  const stairSteps = (f) => Math.max(3, Math.round(f.h / STEP));

  // ── Простори затворени со ѕидови ──
  // Ѕидовите се сечат во секое вкрстување и Т-спој, висечките делови се отфрлаат,
  // па секое затворено лице од рамнинскиот граф е еден простор.
  function faces(f) {
    const segs = f.walls.map((w) => [w.x1, w.y1, w.x2, w.y2]).filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= 1);
    const V = new Map(), E = new Set();
    const vkey = (x, y) => Math.round(x) + ',' + Math.round(y);
    const vert = (x, y) => {
      const k = vkey(x, y);
      if (!V.has(k)) V.set(k, { k, x: Math.round(x), y: Math.round(y), nb: new Set() });
      return V.get(k);
    };
    const cross = (ax, ay, bx, by) => ax * by - ay * bx;
    segs.forEach((a, i) => {
      const [x1, y1, x2, y2] = a, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), tol = 1 / L;
      const ts = [0, 1];
      segs.forEach((b, j) => {
        if (i === j) return;
        const [x3, y3, x4, y4] = b, ex = x4 - x3, ey = y4 - y3, den = cross(dx, dy, ex, ey);
        if (Math.abs(den) < 1e-9) {
          // Паралелни: краевите на другиот што лежат на овој
          for (const [px, py] of [[x3, y3], [x4, y4]]) {
            const t = ((px - x1) * dx + (py - y1) * dy) / (L * L);
            const dist = Math.abs(cross(px - x1, py - y1, dx, dy)) / L;
            if (dist < 1 && t > tol && t < 1 - tol) ts.push(t);
          }
          return;
        }
        const t = cross(x3 - x1, y3 - y1, ex, ey) / den, u = cross(x3 - x1, y3 - y1, dx, dy) / den;
        const tolB = 1 / Math.hypot(ex, ey);
        if (t > tol && t < 1 - tol && u > -tolB && u < 1 + tolB) ts.push(t);
      });
      ts.sort((p, q) => p - q);
      for (let n = 0; n + 1 < ts.length; n++) {
        const A = vert(x1 + dx * ts[n], y1 + dy * ts[n]), B = vert(x1 + dx * ts[n + 1], y1 + dy * ts[n + 1]);
        if (A === B) continue;
        A.nb.add(B.k); B.nb.add(A.k);
      }
    });
    // Висечки ѕидови (крај што не е поврзан) не затвораат простор
    let pruned = true;
    while (pruned) {
      pruned = false;
      for (const v of V.values()) if (v.nb.size === 1) {
        const [o] = v.nb; V.get(o).nb.delete(v.k); v.nb.clear(); pruned = true;
      }
    }
    const out = {};
    for (const v of V.values()) {
      out[v.k] = [...v.nb].map((k) => V.get(k)).sort((a, b) => Math.atan2(a.y - v.y, a.x - v.x) - Math.atan2(b.y - v.y, b.x - v.x));
      for (const n of v.nb) E.add(v.k + '>' + n);
    }
    const res = [], seen = new Set();
    for (const e of E) {
      if (seen.has(e)) continue;
      const pts = [];
      let [u, v] = e.split('>'), guard = 0;
      while (!seen.has(u + '>' + v) && guard++ < 10000) {
        seen.add(u + '>' + v);
        const U = V.get(u);
        pts.push([U.x, U.y]);
        const L = out[v], i = L.findIndex((x) => x.k === u);
        const nx = L[(i - 1 + L.length) % L.length];
        u = v; v = nx.k;
      }
      const a = polyArea(pts);
      if (a > 1000) res.push({ pts, area: a / 1e4, perim: polyPerim(pts) / 100 });  // > 0,1 m²
    }
    return res;
  }

  // Секоја просторија се врзува за просторот во кој лежи нејзината точка.
  // Точката се преместува во внатрешноста за да ги следи ѕидовите при уредување.
  function layout(f) {
    const fs = faces(f), used = new Set();
    for (const fc of fs) {
      const r = f.rooms.find((r) => !used.has(r) && inPoly(fc.pts, r.x, r.y));
      if (!r) continue;
      used.add(r); fc.room = r;
      const p = labelPoint(fc.pts);
      r.x = Math.round(p.x * 10) / 10; r.y = Math.round(p.y * 10) / 10;
    }
    return { faces: fs, orphans: f.rooms.filter((r) => !used.has(r)) };
  }
  const faceAt = (L, x, y) => L.faces.filter((fc) => inPoly(fc.pts, x, y)).sort((a, b) => a.area - b.area)[0] || null;

  const winPrice = (o) => o.manual ? o.price : Math.round(o.w * o.h / 1e4 * st.opts.eurM2);

  function summary(f) {
    const len = (kind) => f.walls.filter((w) => w.kind === kind).reduce((s, w) => s + wlen(w), 0) / 100;
    const doors = (kind) => f.doors.filter((d) => { const w = wallById(f, d.wall); return w && w.kind === kind; }).length;
    const L = layout(f), rooms = L.faces.filter((fc) => fc.room);
    const of = (t) => rooms.filter((fc) => fc.room.type === t);
    const fin = (fl) => rooms.filter((fc) => !ROOMS[fc.room.type].fixed && fc.room.floor === fl).reduce((s, fc) => s + fc.area, 0);
    const ter = (cov) => f.terraces.filter((t) => !!t.covered === cov).reduce((s, t) => s + t.w * t.h, 0) / 1e4;
    const wins = f.windows.filter((o) => wallById(f, o.wall));
    return {
      out: len('out'), in: len('in'), area: outerArea(f),
      doorsIn: doors('in'), doorsOut: doors('out'),
      rooms: rooms.length, roomArea: rooms.reduce((s, fc) => s + fc.area, 0), free: L.faces.length - rooms.length, orphans: L.orphans.length,
      wc: of('banja').length, wcPerim: of('banja').reduce((s, fc) => s + fc.perim, 0),
      garage: of('garaza').reduce((s, fc) => s + fc.area, 0),
      laminat: fin('laminat'), plochki: fin('plochki'),
      covered: ter(true), open: ter(false),
      wins: wins.length, winEur: wins.reduce((s, o) => s + winPrice(o), 0),
      stairs: f.stairs.length, stairM: f.stairs.reduce((s, x) => s + stairLen(x, f), 0),
    };
  }

  // Вредности за калкулаторот — само за она што е нацртано
  function buildPatch() {
    const n = st.plan.floors.length;
    const S = st.plan.floors.map(summary);
    const keys = n === 2
      ? [['AREA_F1', 'WALL_OUT', 'WALL_IN', 'TERRACE_F1'], ['AREA_F2', 'WALL_OUT2', 'WALL_IN2', 'TERRACE_F2']]
      : [['AREA_HOUSE', 'WALL_OUT', 'WALL_IN', 'AREA_TERRACE']];
    const p = {};
    const sum = (k) => S.reduce((t, s) => t + s[k], 0);
    if (sum('out') || sum('in')) {
      p.TWO_FLOORS = n === 2 ? 1 : 0;
      p.FLOOR_H = r2(st.plan.floors[0].h / 100);
      if (n === 2) p.FLOOR_H2 = r2(st.plan.floors[1].h / 100);
    }
    const hasTer = sum('covered') + sum('open') > 0;
    S.forEach((s, i) => {
      const [a, o, w, t] = keys[i];
      if (s.out) p[o] = r2(s.out);
      if (s.in) p[w] = r2(s.in);
      if (s.area) p[a] = r2(s.area);
      if (hasTer) p[t] = r2(s.covered + s.open);
    });
    if (sum('doorsIn') || sum('doorsOut')) { p.DOORS_IN = sum('doorsIn'); p.DOORS_BLIND = sum('doorsOut'); }
    if (sum('wc')) { p.WC = sum('wc'); p.WC_PERIM = r2(sum('wcPerim')); }
    if (sum('garage')) p.GARAZA_PLOCHKI = r2(sum('garage'));
    if (sum('stairs')) { p.SKALI = 1; p.SKALI_M = r2(sum('stairM')); }
    const RG = roofGeom();
    if (RG) { p.ROOF = r2(RG.area); p.SIMS = r2(RG.sims); }
    // Бетонска плоча — само ако параметарот постои во калкулаторот
    const slabA = outerArea(st.plan.slab);
    if (slabA && SLAB_KEY in st.opts.labels) p[SLAB_KEY] = r2(slabA);
    // Калкулаторот има еден под за целата куќа → преовладува поголемата површина
    const lam = sum('laminat'), pl = sum('plochki');
    if (lam || pl) { p.LAMINAT = lam >= pl ? 1 : 0; p.PLOCHKI = lam >= pl ? 0 : 1; }
    return p;
  }

  // Дограма за калкулаторот: исти прозори (вид, мерка, цена) во еден ред
  function windowRows() {
    const rows = new Map();
    for (const f of st.plan.floors) for (const o of f.windows) {
      if (!wallById(f, o.wall)) continue;
      const price = winPrice(o), name = `${WIN[o.kind].label} ${Math.round(o.w)}×${Math.round(o.h)}`, k = name + '|' + price;
      if (rows.has(k)) rows.get(k).qty++;
      else rows.set(k, { name, qty: 1, priceEur: price, plan: true });
    }
    return [...rows.values()];
  }

  // ── Историја (Ctrl+Z) ──
  function snapshot() {
    st.hist.push(JSON.stringify(st.plan));
    if (st.hist.length > 60) st.hist.shift();
    st.dirty = true;
  }
  function undo() {
    if (!st.hist.length) return;
    st.plan = JSON.parse(st.hist.pop());
    if (!isSlab() && st.floor >= st.plan.floors.length) st.floor = 0;
    st.sel = null; st.draw = null; st.multi = null; st.paste = null;
    renderFloors();
    refresh();
  }

  // ── Измени ──
  function addWall(kind, a, b) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 5) return null;
    const f = F();
    // Надворешен ѕид што завршува на средина на друг надворешен → тој се дели (за затворена површина)
    if (kind === 'out') for (const p of [a, b]) splitAt(f, p);
    const w = { id: uid(), kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    f.walls.push(w);
    return w;
  }
  function splitAt(f, p) {
    for (const w of f.walls) {
      if (w.kind !== 'out' || same(w.x1, w.y1, p.x, p.y) || same(w.x2, w.y2, p.x, p.y)) continue;
      const pr = project(w, p.x, p.y);
      if (Math.hypot(pr.x - p.x, pr.y - p.y) > 1 || pr.t < 1 || pr.t > wlen(w) - 1) continue;
      const nw = { id: uid(), kind: w.kind, x1: p.x, y1: p.y, x2: w.x2, y2: w.y2 };
      // Вратите и прозорите остануваат на делот каде се наоѓаат
      for (const d of [...f.doors, ...f.windows]) if (d.wall === w.id && d.t > pr.t) { d.wall = nw.id; d.t -= pr.t; }
      w.x2 = p.x; w.y2 = p.y;
      f.walls.push(nw);
      return;
    }
  }
  function delSel() {
    if (!st.sel) return;
    snapshot();
    const f = F(), { type, id } = st.sel;
    if (type === 'wall') {
      f.walls = f.walls.filter((w) => w.id !== id);
      f.doors = f.doors.filter((d) => d.wall !== id);
      f.windows = f.windows.filter((d) => d.wall !== id);
    }
    if (type === 'door') f.doors = f.doors.filter((d) => d.id !== id);
    if (type === 'win') f.windows = f.windows.filter((d) => d.id !== id);
    if (type === 'room') f.rooms = f.rooms.filter((r) => r.id !== id);
    if (RECTS[type]) f[RECTS[type]] = f[RECTS[type]].filter((t) => t.id !== id);
    st.sel = null;
    refresh();
  }
  // Сите краеви на ѕидови што лежат во точката (x, y) — се движат заедно
  function endsAt(x, y) {
    const out = [];
    for (const w of F().walls) {
      if (same(w.x1, w.y1, x, y)) out.push([w, 1]);
      if (same(w.x2, w.y2, x, y)) out.push([w, 2]);
    }
    return out;
  }
  function moveEnds(ends, x, y) { for (const [w, e] of ends) { w['x' + e] = x; w['y' + e] = y; } }
  function clampOpenings() {
    const f = F();
    for (const d of [...f.doors, ...f.windows]) {
      const w = wallById(f, d.wall);
      if (!w) continue;
      const L = wlen(w);
      d.w = Math.min(d.w, Math.max(30, L));
      d.t = Math.max(d.w / 2, Math.min(L - d.w / 2, d.t));
    }
  }

  // ── Правоаголник од 4 ѕида ──
  // Дел од ѕид што лежи на постоечки ѕид не се додава. Надворешен правоаголник залепен до
  // куќата е доградба: заедничкиот дел од стариот надворешен ѕид станува внатрешен.
  function splitAny(f, p) {
    for (const w of f.walls) {
      if (same(w.x1, w.y1, p.x, p.y) || same(w.x2, w.y2, p.x, p.y)) continue;
      const pr = project(w, p.x, p.y);
      if (Math.hypot(pr.x - p.x, pr.y - p.y) > 1 || pr.t < 1 || pr.t > wlen(w) - 1) continue;
      const nw = { id: uid(), kind: w.kind, x1: p.x, y1: p.y, x2: w.x2, y2: w.y2 };
      for (const d of [...f.doors, ...f.windows]) if (d.wall === w.id && d.t > pr.t) { d.wall = nw.id; d.t -= pr.t; }
      w.x2 = p.x; w.y2 = p.y;
      f.walls.push(nw);
      return;
    }
  }
  function addEdge(kind, A, B) {
    const f = F(), L = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
    const P = (t) => ({ x: Math.round(A.x + ux * t), y: Math.round(A.y + uy * t) });
    const along = (x, y) => (x - A.x) * ux + (y - A.y) * uy, off = (x, y) => Math.abs((x - A.x) * uy - (y - A.y) * ux);
    const iv = [];
    for (const w of f.walls) {
      if (off(w.x1, w.y1) > 1 || off(w.x2, w.y2) > 1) continue;
      const t1 = along(w.x1, w.y1), t2 = along(w.x2, w.y2), s = Math.max(0, Math.min(t1, t2)), e = Math.min(L, Math.max(t1, t2));
      if (e - s > 1) iv.push([s, e, w]);
    }
    if (kind === 'out' && !isSlab()) {
      for (const [s, e, w] of iv) if (w.kind === 'out') { splitAny(f, P(s)); splitAny(f, P(e)); }
      for (const w of f.walls) {
        if (w.kind !== 'out' || off(w.x1, w.y1) > 1 || off(w.x2, w.y2) > 1) continue;
        const a = along(w.x1, w.y1), b = along(w.x2, w.y2);
        if (Math.min(a, b) >= -0.5 && Math.max(a, b) <= L + 0.5) w.kind = 'in';
      }
    }
    iv.sort((p, q) => p[0] - q[0]);
    let cur = 0;
    for (const [s, e] of iv) { if (s - cur >= 5) addWall(kind, P(cur), P(s)); cur = Math.max(cur, e); }
    if (L - cur >= 5) addWall(kind, P(cur), P(L));
  }
  function addRect(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (x1 - x0 < 20 || y1 - y0 < 20) return;
    const f = F();
    const kind = isSlab() ? 'out' : (outerLoops(f) || []).some((lp) => inPoly(lp, (x0 + x1) / 2, (y0 + y1) / 2)) ? 'in' : 'out';
    snapshot();
    const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 4];
      addEdge(kind, { x: ax, y: ay }, { x: bx, y: by });
    }
    refresh();
  }

  // ── Избор на повеќе елементи: поместување, копирање, пресликување, вртење ──
  const MT = { wall: 'walls', door: 'doors', win: 'windows', room: 'rooms', terrace: 'terraces', stair: 'stairs' };
  const MKEYS = Object.values(MT);
  const emptyMulti = () => Object.fromEntries(MKEYS.map((k) => [k, []]));
  const multiCount = (m) => (m ? MKEYS.reduce((s, k) => s + m[k].length, 0) : 0);
  const inMulti = (type, id) => !!(st.multi && MT[type] && st.multi[MT[type]].includes(id));
  // Елементите во правоаголникот r (cm): ѕидови со двата краја внатре, нивните отвори, простории (точката), тераси/скали цели
  function collect(f, r) {
    const inR = (x, y) => x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && y >= r.y0 - 0.5 && y <= r.y1 + 0.5;
    const m = emptyMulti();
    m.walls = f.walls.filter((w) => inR(w.x1, w.y1) && inR(w.x2, w.y2)).map((w) => w.id);
    m.doors = f.doors.filter((d) => m.walls.includes(d.wall)).map((d) => d.id);
    m.windows = f.windows.filter((d) => m.walls.includes(d.wall)).map((d) => d.id);
    m.rooms = f.rooms.filter((x) => inR(x.x, x.y)).map((x) => x.id);
    m.terraces = f.terraces.filter((z) => inR(z.x, z.y) && inR(z.x + z.w, z.y + z.h)).map((z) => z.id);
    m.stairs = f.stairs.filter((z) => inR(z.x, z.y) && inR(z.x + z.w, z.y + z.h)).map((z) => z.id);
    return multiCount(m) ? m : null;
  }
  // Еден избран елемент → множество (за копирање)
  function selAsMulti() {
    if (st.multi) return st.multi;
    if (!st.sel || !MT[st.sel.type]) return null;
    const m = emptyMulti(), f = F();
    m[MT[st.sel.type]].push(st.sel.id);
    if (st.sel.type === 'wall') { m.doors = f.doors.filter((d) => d.wall === st.sel.id).map((d) => d.id); m.windows = f.windows.filter((d) => d.wall === st.sel.id).map((d) => d.id); }
    return m;
  }
  const pick = (f, m) => ({
    walls: f.walls.filter((x) => m.walls.includes(x.id)), doors: f.doors.filter((x) => m.doors.includes(x.id)),
    windows: f.windows.filter((x) => m.windows.includes(x.id)), rooms: f.rooms.filter((x) => m.rooms.includes(x.id)),
    terraces: f.terraces.filter((x) => m.terraces.includes(x.id)), stairs: f.stairs.filter((x) => m.stairs.includes(x.id)),
  });
  function bboxOf(it) {
    const xs = [], ys = [];
    for (const w of it.walls) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
    for (const z of [...it.terraces, ...it.stairs]) { xs.push(z.x, z.x + z.w); ys.push(z.y, z.y + z.h); }
    for (const r of it.rooms) { xs.push(r.x); ys.push(r.y); }
    if (!xs.length) return null;
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  // Трансформација на елементите: kind 'mx' (лево-десно), 'my' (горе-долу), 'rot' (90° во насока на стрелките)
  function transformItems(it, M, kind) {
    const rnd = (v) => Math.round(v * 10) / 10;
    for (const w of it.walls) { [w.x1, w.y1] = M(w.x1, w.y1).map(rnd); [w.x2, w.y2] = M(w.x2, w.y2).map(rnd); }
    // Пресликување ја менува страната на која се отвора крилото
    if (kind !== 'rot') for (const d of [...it.doors, ...it.windows]) d.flip = !d.flip;
    for (const r of it.rooms) [r.x, r.y] = M(r.x, r.y);
    for (const z of [...it.terraces, ...it.stairs]) {
      const [ax, ay] = M(z.x, z.y), [bx, by] = M(z.x + z.w, z.y + z.h);
      Object.assign(z, { x: rnd(Math.min(ax, bx)), y: rnd(Math.min(ay, by)), w: rnd(Math.abs(bx - ax)), h: rnd(Math.abs(by - ay)) });
    }
    for (const s of it.stairs) s.dir = kind === 'mx' ? [2, 1, 0, 3][s.dir] : kind === 'my' ? [0, 3, 2, 1][s.dir] : (s.dir + 1) % 4;
  }
  const mirrorFn = (kind, b) => {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (kind === 'mx') return (x, y) => [2 * cx - x, y];
    if (kind === 'my') return (x, y) => [x, 2 * cy - y];
    // Вртење околу центарот залепен на мрежата → аглите остануваат на мрежата
    const gx = snapG(cx), gy = snapG(cy);
    return (x, y) => [gx - (y - gy), gy + (x - gx)];
  };
  function transformMulti(kind) {
    const m = selAsMulti();
    if (!m) return;
    const it = pick(F(), m), b = bboxOf(it);
    if (!b) return;
    snapshot();
    transformItems(it, mirrorFn(kind, b), kind);
    clampOpenings();
    refresh();
  }
  // Цел план (сите катови и плочата) — пресликување околу заедничкиот центар
  function mirrorPlan(kind) {
    const all = [...st.plan.floors, st.plan.slab].map((f) => ({ walls: f.walls, doors: f.doors, windows: f.windows, rooms: f.rooms, terraces: f.terraces, stairs: f.stairs }));
    const boxes = all.map(bboxOf).filter(Boolean);
    if (!boxes.length) return;
    const b = { x0: Math.min(...boxes.map((x) => x.x0)), x1: Math.max(...boxes.map((x) => x.x1)), y0: Math.min(...boxes.map((x) => x.y0)), y1: Math.max(...boxes.map((x) => x.y1)) };
    snapshot();
    const M = mirrorFn(kind, b);
    all.forEach((it) => transformItems(it, M, kind));
    const R = st.plan.roof;
    if (R.type === 'mono' && R.rot != null) R.rot = kind === 'mx' ? [0, 3, 2, 1][R.rot] : [2, 1, 0, 3][R.rot];
    R.lowRot = (4 - (R.lowRot || 0)) % 4;
    st.sel = null; st.multi = null;
    refresh();
  }
  // Меѓуспомник (останува и меѓу отворања на планот → копирање меѓу катови и понуди)
  let clip = null;
  function copySel() {
    const m = selAsMulti();
    if (!m) return false;
    const it = JSON.parse(JSON.stringify(pick(F(), m))), b = bboxOf(it);
    if (!b) return false;
    clip = { it, b };
    flashHint('Копирано: ' + describe(m) + ' — Ctrl+V за залепување');
    return true;
  }
  function startPaste() {
    if (!clip) return;
    st.sel = null; st.multi = null; st.draw = null;
    st.paste = { dx: 0, dy: 0 };
    $('#plHint').textContent = HINTS.paste;
    refresh();
  }
  function commitPaste() {
    const f = F(), { dx, dy } = st.paste, src = JSON.parse(JSON.stringify(clip.it)), map = {}, m = emptyMulti();
    snapshot();
    for (const w of src.walls) { map[w.id] = uid(); f.walls.push({ ...w, id: map[w.id], x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }); m.walls.push(map[w.id]); }
    for (const [k, list] of [['doors', src.doors], ['windows', src.windows]]) for (const d of list) {
      if (!map[d.wall]) continue;
      const n = { ...d, id: uid(), wall: map[d.wall] };
      f[k].push(n); m[k].push(n.id);
    }
    for (const r of src.rooms) { const n = { ...r, id: uid(), x: r.x + dx, y: r.y + dy }; f.rooms.push(n); m.rooms.push(n.id); }
    for (const k of ['terraces', 'stairs']) for (const z of src[k]) { const n = { ...z, id: uid(), x: z.x + dx, y: z.y + dy }; f[k].push(n); m[k].push(n.id); }
    st.paste = null;
    st.multi = m;
    setTool('box');
  }
  function deleteMulti() {
    const f = F(), m = st.multi;
    snapshot();
    f.walls = f.walls.filter((w) => !m.walls.includes(w.id));
    f.doors = f.doors.filter((d) => !m.doors.includes(d.id) && f.walls.some((w) => w.id === d.wall));
    f.windows = f.windows.filter((d) => !m.windows.includes(d.id) && f.walls.some((w) => w.id === d.wall));
    for (const k of ['rooms', 'terraces', 'stairs']) f[k] = f[k].filter((x) => !m[k].includes(x.id));
    st.multi = null;
    refresh();
  }
  function describe(m) {
    const parts = [[m.walls.length, 'ѕид', 'ѕида'], [m.doors.length + m.windows.length, 'отвор', 'отвори'], [m.rooms.length, 'просторија', 'простории'],
      [m.terraces.length, 'тераса', 'тераси'], [m.stairs.length, 'скали', 'скали']];
    return parts.filter(([n]) => n).map(([n, one, many]) => n + ' ' + (n === 1 ? one : many)).join(', ') || 'ништо';
  }
  function flashHint(t) {
    const el = $('#plHint');
    el.textContent = t;
    clearTimeout(flashHint.tm);
    flashHint.tm = setTimeout(() => { el.textContent = HINTS[st.paste ? 'paste' : st.view3d ? '3d' : roomTool(st.tool) ? 'room' : st.tool] || ''; }, 2600);
  }
  // Влечење на избраното: ѕидовите што се допираат се растегнуваат заедно
  function startGroupDrag(m0) {
    const it = pick(F(), st.multi), pts = new Map();
    for (const w of it.walls) for (const e of [1, 2]) {
      const k = w['x' + e] + ',' + w['y' + e];
      if (!pts.has(k)) pts.set(k, { x: w['x' + e], y: w['y' + e], ends: endsAt(w['x' + e], w['y' + e]) });
    }
    snapshot();
    st.drag = { type: 'group', m0, pts: [...pts.values()], z: [...it.terraces, ...it.stairs].map((z) => ({ z, x: z.x, y: z.y })), r: it.rooms.map((r) => ({ r, x: r.x, y: r.y })), moved: false };
  }

  // ── Мерка на ѕид: клик → поле за нова должина ──
  function openDimEdit(id) {
    const f = F(), w = wallById(f, id), el = svg.querySelector(`[data-dim="${id}"]`);
    if (!w || !el) return;
    closeDimEdit();
    const box = root.querySelector('.pl-canvas'), r = el.getBoundingClientRect(), cr = box.getBoundingClientRect();
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '5'; inp.step = '1'; inp.className = 'pl-dimedit';
    inp.value = Math.round(wlen(w));
    inp.style.left = (r.left - cr.left + r.width / 2) + 'px';
    inp.style.top = (r.top - cr.top + r.height / 2) + 'px';
    box.appendChild(inp);
    inp.focus(); inp.select();
    let done = false;
    const apply = () => {
      if (done) return; done = true;
      const v = parseFloat(inp.value);
      inp.remove();
      if (!(v >= 5) || Math.abs(v - wlen(w)) < 0.5) return;
      // Почетокот стои, крајот (и поврзаните ѕидови) се поместува по правецот
      snapshot();
      const { ux, uy } = wdir(w);
      moveEnds(endsAt(w.x2, w.y2), Math.round(w.x1 + ux * v), Math.round(w.y1 + uy * v));
      clampOpenings();
      refresh();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { e.preventDefault(); done = true; inp.remove(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', apply);
  }
  function closeDimEdit() { const old = root && root.querySelector('.pl-dimedit'); if (old) old.blur(); }

  // ── Цртање (SVG) ──
  function render() {
    const f = F(), s = st.view.s, L = layout(f);
    st.layout = L;
    let h = '';
    const g1 = GRID * s, g2 = 100 * s;
    h += `<defs>
      <pattern id="plG1" width="${g1}" height="${g1}" patternUnits="userSpaceOnUse" x="${st.view.tx}" y="${st.view.ty}">
        <path d="M ${g1} 0 L 0 0 0 ${g1}" fill="none" stroke="#efeae1" stroke-width="1"/></pattern>
      <pattern id="plG2" width="${g2}" height="${g2}" patternUnits="userSpaceOnUse" x="${st.view.tx}" y="${st.view.ty}">
        <path d="M ${g2} 0 L 0 0 0 ${g2}" fill="none" stroke="#ddd5c8" stroke-width="1"/></pattern>
      <pattern id="plHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="rgba(150,175,120,.10)"/><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(110,140,85,.45)" stroke-width="1.2"/></pattern>
      <pattern id="plConc" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="rgba(150,145,138,.22)"/><circle cx="3" cy="4" r="1" fill="rgba(110,105,98,.35)"/><circle cx="10" cy="10" r=".8" fill="rgba(110,105,98,.3)"/></pattern></defs>`;
    if (g1 >= 5) h += '<rect width="100%" height="100%" fill="url(#plG1)"/>';
    h += '<rect width="100%" height="100%" fill="url(#plG2)"/>';

    // Плоча: надворешните ѕидови и бањите од првиот кат (за порамнување и за водоводот)
    if (isSlab()) {
      for (const P of outerLoops(f) || []) h += `<polygon points="${P.map(([x, y]) => toS(x, y).join(',')).join(' ')}" fill="url(#plConc)"/>`;
      h += slabGhost();
    }
    // Другиот кат — блед, за порамнување
    else if (st.plan.floors.length === 2) {
      const o = st.plan.floors[1 - st.floor];
      for (const w of o.walls) {
        const [x1, y1] = toS(w.x1, w.y1), [x2, y2] = toS(w.x2, w.y2);
        h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d9d2c6" stroke-width="${Math.max(2, THICK[w.kind] * s)}" stroke-linecap="square" stroke-dasharray="6 6"/>`;
      }
    }

    // Тераси
    for (const t of f.terraces) {
      const [x, y] = toS(t.x, t.y), sel = isSel('terrace', t.id), tw = t.w * s, th = t.h * s;
      h += `<g data-hit="terrace:${t.id}"><rect x="${x}" y="${y}" width="${tw}" height="${th}" fill="${t.covered ? 'rgba(150,175,120,.24)' : 'url(#plHatch)'}" stroke="${sel ? 'var(--accent)' : '#6e8c55'}" stroke-width="${sel ? 2 : 1.2}" stroke-dasharray="${t.covered ? '' : '6 4'}"/>`;
      if (tw > 60 && th > 30) h += `<text x="${x + tw / 2}" y="${y + th / 2}" class="pl-zlabel" text-anchor="middle">Тераса · ${t.covered ? 'покриена' : 'откриена'}<tspan x="${x + tw / 2}" dy="14">${fmt(t.w * t.h / 1e4)} m²</tspan></text>`;
      h += '</g>';
      if (sel && st.tool === 'select') h += `<rect data-hit="rh:${t.id}" x="${x + tw - 6}" y="${y + th - 6}" width="12" height="12" class="pl-handle" style="cursor:nwse-resize"/>`;
    }

    // Простории (и празни затворени простори при алатка за простории)
    const rt = roomTool(st.tool);
    for (const fc of L.faces) {
      const pts = fc.pts.map(([x, y]) => toS(x, y).join(',')).join(' ');
      const hover = st.hover && st.hover === fc;
      if (fc.room) {
        const R = ROOMS[fc.room.type], sel = isSel('room', fc.room.id);
        const fill = hover && rt ? ROOMS[rt].fill : R.fill;
        h += `<polygon data-hit="room:${fc.room.id}" points="${pts}" fill="${fill}" stroke="${sel ? 'var(--accent)' : 'none'}" stroke-width="2"/>`;
      } else if (rt) {
        h += `<polygon points="${pts}" fill="${hover ? ROOMS[rt].fill : 'rgba(219,75,59,.04)'}" stroke="${hover ? ROOMS[rt].stroke : 'rgba(219,75,59,.35)'}" stroke-width="1" stroke-dasharray="5 4"/>`;
      }
    }

    // Ѕидови (на плочата: ивица)
    const thick = (w) => (isSlab() ? SLAB_EDGE : THICK[w.kind]);
    for (const w of f.walls) {
      const [x1, y1] = toS(w.x1, w.y1), [x2, y2] = toS(w.x2, w.y2), sel = isSel('wall', w.id);
      const col = sel ? 'var(--accent)' : isSlab() ? '#6f6a63' : w.kind === 'out' ? '#3b3732' : '#8d867c';
      h += `<g data-hit="wall:${w.id}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${Math.max(3, thick(w) * s)}" stroke-linecap="square"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(14, thick(w) * s + 8)}"/></g>`;
    }
    // Врати и прозори
    for (const d of f.doors) { const w = wallById(f, d.wall); if (w) h += doorSvg(w, d, isSel('door', d.id)); }
    for (const o of f.windows) { const w = wallById(f, o.wall); if (w) h += winSvg(w, o, isSel('win', o.id)); }

    // Скали: газишта, стрелка нагоре
    for (const x of f.stairs) h += stairSvg(x, f, isSel('stair', x.id));

    // Еднокосен кров над деловите од првиот кат без ништо над нив
    if (st.floor === 0 && st.plan.floors.length === 2) {
      const RG = roofGeom();
      if (RG) for (const part of RG.low) h += `<polygon points="${part.outline.map(([x, y]) => toS(x, y).join(',')).join(' ')}" class="pl-roofln out"/>`;
    }
    // Кров (само на највисокиот кат): препуст и линии на слеме / гребени
    if (st.floor === st.plan.floors.length - 1) {
      const RG = roofGeom();
      if (RG) for (const part of RG.parts) {
        const pts = (P) => P.map(([x, y]) => toS(x, y).join(',')).join(' ');
        for (const pc of part.pieces) h += `<polygon points="${pts(pc)}" class="pl-roofln"/>`;
        h += `<polygon points="${pts(part.outline)}" class="pl-roofln out"/>`;
      }
    }

    // Натписи на просториите — над ѕидовите за да се читаат
    for (const fc of L.faces) {
      if (!fc.room) continue;
      const [x, y] = toS(fc.room.x, fc.room.y), R = ROOMS[fc.room.type];
      const fl = R.fixed ? '' : ' · ' + FLOORS[fc.room.floor].toLowerCase();
      h += `<text x="${x}" y="${y - 6}" class="pl-rlabel" text-anchor="middle">${esc(R.label)}<tspan x="${x}" dy="15" class="pl-rarea">${fmt(fc.area)} m²${fl}</tspan></text>`;
    }

    // Мерки на ѕидовите (cm)
    const dimEdit = (st.tool === 'select' || st.tool === 'box') && !st.draw && !st.paste;
    for (const w of f.walls) h += dimLabel(w.x1, w.y1, w.x2, w.y2, thick(w), isSel('wall', w.id), dimEdit ? w.id : null);
    // Внатрешни (светли) мерки на просториите — се вклучуваат/исклучуваат од лентата со алатки
    if (st.innerDims && !isSlab()) h += innerDimsSvg(f, L);

    // Рачки за аглите на избраниот ѕид
    if (st.tool === 'select' && st.sel && st.sel.type === 'wall') {
      const w = wallById(f, st.sel.id);
      if (w) for (const e of [1, 2]) {
        const [x, y] = toS(w['x' + e], w['y' + e]);
        h += `<circle data-hit="wh:${w.id}:${e}" cx="${x}" cy="${y}" r="7" class="pl-handle" style="cursor:move"/>`;
      }
    }

    // Преглед при цртање ѕид
    if (st.draw && st.draw.cur) {
      const a = st.draw.from, b = st.draw.cur;
      const [x1, y1] = toS(a.x, a.y), [x2, y2] = toS(b.x, b.y);
      const T = isSlab() ? SLAB_EDGE : THICK[st.draw.kind];
      h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-opacity=".55" stroke-width="${Math.max(3, T * s)}" stroke-linecap="square"/>`;
      h += dimLabel(a.x, a.y, b.x, b.y, T, true);
      h += `<circle cx="${x1}" cy="${y1}" r="4" fill="var(--accent)"/>`;
    }
    // Правоаголник од ѕидови: преглед со мерки
    if (st.drag && st.drag.type === 'wallrect' && st.drag.b) {
      const a = st.drag.a, b = st.drag.b, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const [sx, sy] = toS(x0, y0), kindIn = !isSlab() && (outerLoops(f) || []).some((lp) => inPoly(lp, (x0 + x1) / 2, (y0 + y1) / 2));
      const T = isSlab() ? SLAB_EDGE : THICK[kindIn ? 'in' : 'out'];
      h += `<rect x="${sx}" y="${sy}" width="${(x1 - x0) * s}" height="${(y1 - y0) * s}" fill="rgba(219,75,59,.05)" stroke="var(--accent)" stroke-opacity=".6" stroke-width="${Math.max(3, T * s)}"/>`;
      h += dimLabel(x0, y0, x1, y0, T, true) + dimLabel(x1, y0, x1, y1, T, true);
      h += `<text x="${sx + (x1 - x0) * s / 2}" y="${sy + (y1 - y0) * s / 2}" class="pl-zlabel" text-anchor="middle">${isSlab() ? 'Ивица на плоча' : kindIn ? 'Внатрешни ѕидови' : 'Надворешни ѕидови'} · ${fmt((x1 - x0) * (y1 - y0) / 1e4)} m²</text>`;
    }
    // Избор со правоаголник
    if (st.drag && st.drag.type === 'box') {
      const a = st.drag.a, b = st.drag.b, [sx, sy] = toS(Math.min(a.x, b.x), Math.min(a.y, b.y));
      h += `<rect x="${sx}" y="${sy}" width="${Math.abs(b.x - a.x) * s}" height="${Math.abs(b.y - a.y) * s}" class="pl-boxsel"/>`;
    }
    // Рамка околу избраното
    if (st.multi) {
      const bb = bboxOf(pick(f, st.multi));
      if (bb) { const [sx, sy] = toS(bb.x0, bb.y0); h += `<rect x="${sx - 10}" y="${sy - 10}" width="${(bb.x1 - bb.x0) * s + 20}" height="${(bb.y1 - bb.y0) * s + 20}" class="pl-multibox"/>`; }
    }
    // Залепување: сенка што го следи курсорот
    if (st.paste && clip) {
      const { dx, dy } = st.paste, it = clip.it;
      for (const w of it.walls) {
        const [x1, y1] = toS(w.x1 + dx, w.y1 + dy), [x2, y2] = toS(w.x2 + dx, w.y2 + dy);
        h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-opacity=".5" stroke-width="${Math.max(3, THICK[w.kind] * s)}" stroke-linecap="square"/>`;
      }
      for (const z of [...it.terraces, ...it.stairs]) { const [x, y] = toS(z.x + dx, z.y + dy); h += `<rect x="${x}" y="${y}" width="${z.w * s}" height="${z.h * s}" fill="rgba(219,75,59,.08)" stroke="var(--accent)" stroke-dasharray="4 3"/>`; }
    }
    if (st.cursor && (st.tool === 'out' || st.tool === 'in' || st.tool === 'rect')) {
      const [cx, cy] = toS(st.cursor.x, st.cursor.y), sn = st.cursor.snap;
      // Залепено: квадрат на агол, ромб на ѕид; инаку круг
      if (sn === 'point') h += `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" class="pl-snap"/>`;
      else if (sn === 'wall') h += `<path d="M ${cx} ${cy - 7} L ${cx + 7} ${cy} L ${cx} ${cy + 7} L ${cx - 7} ${cy} Z" class="pl-snap"/>`;
      else h += `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    }
    // Преглед на врата / прозор
    if (st.ghost) h += st.tool === 'door' ? doorSvg(st.ghost.w, st.ghost.d, true, true) : winSvg(st.ghost.w, st.ghost.d, true, true);
    // Преглед на нова тераса / скали
    if (st.drag && st.drag.type === 'newrect' && st.drag.z) {
      const z = st.drag.z, [x, y] = toS(z.x, z.y);
      h += `<rect x="${x}" y="${y}" width="${z.w * s}" height="${z.h * s}" fill="${st.drag.kind === 'stair' ? 'rgba(235,228,214,.8)' : 'url(#plHatch)'}" stroke="var(--accent)" stroke-dasharray="4 3"/>
        <text x="${x + z.w * s / 2}" y="${y + z.h * s / 2}" class="pl-zlabel" text-anchor="middle">${Math.round(z.w)} × ${Math.round(z.h)} cm</text>`;
    }
    svg.innerHTML = h;
    $('#plTyped').textContent = st.draw && st.typed ? 'Должина: ' + st.typed + ' cm — Enter' : '';
  }

  // Бањите на првиот кат — пресметани од неговите ѕидови и простории
  const slabToilets = () => layout(st.plan.floors[0]).faces.filter((fc) => fc.room && fc.room.type === 'banja');
  function slabGhost() {
    let h = '';
    for (const w of st.plan.floors[0].walls) {
      if (w.kind !== 'out') continue;
      const [x1, y1] = toS(w.x1, w.y1), [x2, y2] = toS(w.x2, w.y2);
      h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c9c1b3" stroke-width="${Math.max(2, THICK.out * st.view.s)}" stroke-linecap="square" stroke-dasharray="6 6"/>`;
    }
    const R = ROOMS.banja;
    for (const fc of slabToilets()) {
      h += `<polygon points="${fc.pts.map(([x, y]) => toS(x, y).join(',')).join(' ')}" fill="${R.fill}" stroke="${R.stroke}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
      const [x, y] = toS(fc.room.x, fc.room.y);
      h += `<text x="${x}" y="${y - 6}" class="pl-rlabel" text-anchor="middle">${esc(R.label)}<tspan x="${x}" dy="15" class="pl-rarea">${fmt(fc.area)} m² · прв кат</tspan></text>`;
    }
    return h;
  }

  function stairSvg(x, f, sel) {
    const s = st.view.s, [sx, sy] = toS(x.x, x.y), w = x.w * s, h = x.h * s, n = stairSteps(f);
    const col = sel ? 'var(--accent)' : '#5d574f';
    let g = `<g data-hit="stair:${x.id}"><rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="rgba(235,228,214,.9)" stroke="${col}" stroke-width="${sel ? 2 : 1.2}"/>`;
    const along = x.dir % 2 === 0, run = along ? w : h;
    for (let i = 1; i < n; i++) {
      const k = run * i / n;
      g += along ? `<line x1="${sx + k}" y1="${sy}" x2="${sx + k}" y2="${sy + h}" stroke="#a39b8f" stroke-width="1"/>`
        : `<line x1="${sx}" y1="${sy + k}" x2="${sx + w}" y2="${sy + k}" stroke="#a39b8f" stroke-width="1"/>`;
    }
    // Стрелка од почетокот кон врвот на кракот
    const cx = sx + w / 2, cy = sy + h / 2, m = 0.42;
    const [ax, ay, bx, by] = [[cx - w * m, cy, cx + w * m, cy], [cx, cy - h * m, cx, cy + h * m], [cx + w * m, cy, cx - w * m, cy], [cx, cy + h * m, cx, cy - h * m]][x.dir];
    const ang = Math.atan2(by - ay, bx - ax), hd = 8;
    g += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="1.5"/>
      <path d="M ${bx} ${by} L ${bx - hd * Math.cos(ang - 0.45)} ${by - hd * Math.sin(ang - 0.45)} L ${bx - hd * Math.cos(ang + 0.45)} ${by - hd * Math.sin(ang + 0.45)} Z" fill="${col}"/>
      <circle cx="${ax}" cy="${ay}" r="3" fill="${col}"/></g>`;
    if (sel && st.tool === 'select') g += `<rect data-hit="rh:${x.id}" x="${sx + w - 6}" y="${sy + h - 6}" width="12" height="12" class="pl-handle" style="cursor:nwse-resize"/>`;
    return g;
  }

  // Точки на отвор (врата/прозор) во ѕид: почеток, крај, нормала
  function openingGeom(w, d) {
    const { ux, uy } = wdir(w);
    const cx = w.x1 + ux * d.t, cy = w.y1 + uy * d.t;
    return { ux, uy, cx, cy, a: [cx - ux * d.w / 2, cy - uy * d.w / 2], b: [cx + ux * d.w / 2, cy + uy * d.w / 2] };
  }

  function doorSvg(w, d, sel, ghost) {
    const s = st.view.s, { ux, uy, a, b } = openingGeom(w, d);
    const nx = d.flip ? uy : -uy, ny = d.flip ? -ux : ux;
    const p1 = toS(...a), p2 = toS(...b);
    const leaf = toS(a[0] + nx * d.w, a[1] + ny * d.w);
    const r = d.w * s, col = sel ? 'var(--accent)' : '#3b3732';
    return `<g ${ghost ? 'opacity=".6"' : `data-hit="door:${d.id}"`}>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#fff" stroke-width="${Math.max(4, THICK[w.kind] * s + 2)}"/>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${leaf[0]}" y2="${leaf[1]}" stroke="${col}" stroke-width="2"/>
      <path d="M ${p2[0]} ${p2[1]} A ${r} ${r} 0 0 ${d.flip ? 0 : 1} ${leaf[0]} ${leaf[1]}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="4 3"/>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="transparent" stroke-width="16"/>
    </g>`;
  }

  // Прозор: празнина во ѕидот, рамка и стакло (една линија = фикс, две = отворање)
  function winSvg(w, o, sel, ghost) {
    const s = st.view.s, { ux, uy, a, b } = openingGeom(w, o);
    const T = Math.max(4, THICK[w.kind] * s), col = sel ? 'var(--accent)' : '#3b3732', nx = -uy, ny = ux;
    const off = (p, k) => toS(p[0] + nx * k / s, p[1] + ny * k / s);
    const line = (k, from = a, to = b, extra = '') => { const p = off(from, k), q = off(to, k); return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${col}" stroke-width="1.3" ${extra}/>`; };
    const p1 = toS(...a), p2 = toS(...b);
    let g = `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#fff" stroke-width="${T + 2}"/>`;
    g += `<polygon points="${[off(a, -T / 2), off(b, -T / 2), off(b, T / 2), off(a, T / 2)].map((p) => p.join(',')).join(' ')}" fill="${sel ? 'rgba(219,75,59,.08)' : 'rgba(120,170,200,.15)'}" stroke="${col}" stroke-width="1.3"/>`;
    if (o.kind === 'fix') g += line(0);
    else if (o.kind === 'lizg') {
      const m = [(a[0] + b[0]) / 2 + ux * o.w * 0.08, (a[1] + b[1]) / 2 + uy * o.w * 0.08], m2 = [(a[0] + b[0]) / 2 - ux * o.w * 0.08, (a[1] + b[1]) / 2 - uy * o.w * 0.08];
      g += line(-T / 6, a, m) + line(T / 6, m2, b);
    } else g += line(-T / 6) + line(T / 6);
    if (o.kind === 'balk') {
      // Крилото се отвора како кај вратата (⇄ Сврти ја менува страната)
      const fx = o.flip ? -nx : nx, fy = o.flip ? -ny : ny;
      const leaf = toS(a[0] + fx * o.w, a[1] + fy * o.w), r = o.w * s;
      g += `<path d="M ${p2[0]} ${p2[1]} A ${r} ${r} 0 0 ${o.flip ? 0 : 1} ${leaf[0]} ${leaf[1]}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
    g += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="transparent" stroke-width="16"/>`;
    return `<g ${ghost ? 'opacity=".6"' : `data-hit="win:${o.id}"`}>${g}</g>`;
  }

  function dimLabel(ax, ay, bx, by, thick, strong, editId) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1) return '';
    const s = st.view.s;
    const [x1, y1] = toS(ax, ay), [x2, y2] = toS(bx, by);
    if (Math.hypot(x2 - x1, y2 - y1) < 30 && !strong) return '';
    let ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const off = thick * s / 2 + 11;
    // Нормала кон „горе" за да не се преклопува со ѕидот
    const nx = -(y2 - y1) / Math.hypot(x2 - x1, y2 - y1), ny = (x2 - x1) / Math.hypot(x2 - x1, y2 - y1);
    const mx = (x1 + x2) / 2 - nx * off, my = (y1 + y2) / 2 - ny * off;
    if (ang > 90 || ang < -90) ang += 180;
    const ed = editId ? ` data-dim="${editId}"` : '';
    return `<text x="${mx}" y="${my}" class="pl-dim${strong ? ' strong' : ''}${editId ? ' ed' : ''}"${ed} text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mx} ${my})">${editId ? '<title>Клик за нова должина</title>' : ''}${Math.round(L)}</text>`;
  }

  const isSel = (type, id) => (st.sel && st.sel.type === type && st.sel.id === id) || inMulti(type, id);

  // Внатрешни (светли) мерки на затворен простор: секој раб се поместува навнатре за половина
  // дебелина на својот ѕид, соседните прави се сечат → внатрешен полигон; мерка по секој раб.
  function innerDims(f, pts) {
    const thickAt = (x, y) => {
      for (const w of f.walls) { const pr = project(w, x, y); if (Math.hypot(pr.x - x, pr.y - y) < 1) return THICK[w.kind]; }
      return THICK.in;
    };
    // Без колинеарни темиња (каде друг ѕид се спојува од надвор)
    let P = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-3 * Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    const n = P.length;
    if (n < 3) return [];
    const lines = P.map((A, i) => {
      const B = P[(i + 1) % n], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      let nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      if (!inPoly(P, mx + nx * 2, my + ny * 2)) { nx = -nx; ny = -ny; }
      const d = thickAt(mx, my) / 2;
      return { nx, ny, c: nx * A[0] + ny * A[1] + d, dx: B[0] - A[0], dy: B[1] - A[1] };
    });
    const V = lines.map((l, i) => {
      const k = lines[(i - 1 + n) % n], den = k.nx * l.ny - k.ny * l.nx;
      return [(k.c * l.ny - l.c * k.ny) / den, (k.nx * l.c - l.nx * k.c) / den];
    });
    return V.map((A, i) => {
      const B = V[(i + 1) % n], l = lines[i];
      return { A, B, len: Math.hypot(B[0] - A[0], B[1] - A[1]), nx: l.nx, ny: l.ny };
    }).filter((e) => e.len >= 10);
  }
  function innerDimsSvg(f, L) {
    let h = '';
    for (const fc of L.faces) for (const e of innerDims(f, fc.pts)) {
      const [x1, y1] = toS(e.A[0], e.A[1]), [x2, y2] = toS(e.B[0], e.B[1]);
      if (Math.hypot(x2 - x1, y2 - y1) < 46) continue;
      // Натписот малку навнатре од ѕидот, паралелно со него
      const mx = (x1 + x2) / 2 + e.nx * 10, my = (y1 + y2) / 2 + e.ny * 10;
      let ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      if (ang > 90 || ang < -90) ang += 180;
      h += `<line x1="${x1 + e.nx * 3}" y1="${y1 + e.ny * 3}" x2="${x2 + e.nx * 3}" y2="${y2 + e.ny * 3}" class="pl-idim-ln"/>`;
      h += `<text x="${mx}" y="${my}" class="pl-dim pl-idim" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mx} ${my})">${Math.round(e.len)}</text>`;
    }
    return h;
  }

  // ── Страничен панел: избран елемент + збир + што ќе се пополни ──
  function renderPanel() {
    if (isSlab()) return renderSlabPanel();
    const f = F();
    let h = '';
    const sel = st.sel;
    const num = (id, label, v, min, step) => `<div class="field"><label>${label} <span class="unit">cm</span></label><input type="number" min="${min}" step="${step}" id="${id}" value="${Math.round(v)}"></div>`;
    if (st.multi) {
      h += `<div class="pl-box"><h5>Избрано</h5><p class="hint" style="margin:0;">${describe(st.multi)}. Влечи го избраното за поместување.</p>
        <div class="pl-2"><button class="btn ghost small" id="plMX" title="Пресликај лево–десно">⇋ Пресликај</button><button class="btn ghost small" id="plMY" title="Пресликај горе–долу">⇵ Пресликај</button></div>
        <div class="pl-2"><button class="btn ghost small" id="plRot">⟳ Сврти 90°</button><button class="btn ghost small" id="plCopySel" title="Ctrl+C">⧉ Копирај</button></div>
        <button class="btn danger small" id="plDelMulti">Избриши избраното</button></div>`;
    }
    if (clip && !st.paste && !isSlab()) h += `<div class="pl-box"><h5>Меѓуспомник</h5><p class="hint" style="margin:0;">${describe(Object.fromEntries(MKEYS.map((k) => [k, clip.it[k]])))}</p>
      <button class="btn ghost small" id="plPaste" title="Ctrl+V">📋 Залепи</button></div>`;
    if (sel && sel.type === 'wall') {
      const w = wallById(f, sel.id);
      if (w) h += `<div class="pl-box"><h5>Ѕид</h5>
        <div class="seg pl-seg"><button type="button" class="seg-btn${w.kind === 'out' ? ' on' : ''}" data-kind="out">Надворешен</button><button type="button" class="seg-btn${w.kind === 'in' ? ' on' : ''}" data-kind="in">Внатрешен</button></div>
        ${num('plLen', 'Должина', wlen(w), 5, 1)}
        <button class="btn danger small" id="plDel">Избриши ѕид</button></div>`;
    } else if (sel && sel.type === 'door') {
      const d = f.doors.find((x) => x.id === sel.id);
      if (d) h += `<div class="pl-box"><h5>Врата</h5>
        ${num('plOpW', 'Ширина', d.w, 30, 5)}
        <div style="display:flex;gap:8px;"><button class="btn ghost small" id="plFlip">⇄ Сврти</button><button class="btn danger small" id="plDel">Избриши</button></div></div>`;
    } else if (sel && sel.type === 'win') {
      const o = f.windows.find((x) => x.id === sel.id);
      if (o) h += `<div class="pl-box"><h5>Прозор</h5>
        <div class="field"><label>Вид</label><select id="plWKind">${Object.entries(WIN).map(([k, W]) => `<option value="${k}"${o.kind === k ? ' selected' : ''}>${W.label}</option>`).join('')}</select></div>
        <div class="pl-2">${num('plOpW', 'Ширина', o.w, 30, 5)}${num('plWH', 'Висина', o.h, 20, 5)}</div>
        <div class="pl-2">${num('plWS', 'Парапет', sillOf(o), 0, 5)}<div class="field"><label>Горен раб <span class="unit">cm</span></label><input type="text" readonly tabindex="-1" value="${Math.round(sillOf(o) + o.h)}"></div></div>
        ${sillOf(o) + o.h > f.h - 10 ? `<p class="hint pl-warn">Парапет + висина (${Math.round(sillOf(o) + o.h)} cm) е повеќе од висината на катот (${Math.round(f.h)} cm) — во 3D прозорот се скратува.</p>` : ''}
        <div class="field"><label>Цена <span class="unit">€ / ком</span></label><input type="number" min="0" step="1" id="plWPrice" value="${winPrice(o)}">
          <div class="hint">${o.manual ? 'Рачно внесена · <a href="#" id="plWAuto">пресметај по m²</a>' : `${fmt(o.w * o.h / 1e4)} m² × ${fmt(st.opts.eurM2, 0)} €/m²`}</div></div>
        <div style="display:flex;gap:8px;">${o.kind === 'balk' ? '<button class="btn ghost small" id="plFlip">⇄ Сврти</button>' : ''}<button class="btn danger small" id="plDel">Избриши прозор</button></div></div>`;
    } else if (sel && sel.type === 'room') {
      const fc = st.layout && st.layout.faces.find((x) => x.room && x.room.id === sel.id);
      const r = f.rooms.find((x) => x.id === sel.id);
      if (r) h += `<div class="pl-box"><h5>Просторија</h5>
        <div class="field"><label>Тип</label><select id="plRType">${Object.entries(ROOMS).map(([k, R]) => `<option value="${k}"${r.type === k ? ' selected' : ''}>${R.label}</option>`).join('')}</select></div>
        ${ROOMS[r.type].fixed ? '' : `<div class="field"><label>Под</label><div class="seg pl-seg">${Object.entries(FLOORS).map(([k, l]) => `<button type="button" class="seg-btn${r.floor === k ? ' on' : ''}" data-floor-fin="${k}">${l}</button>`).join('')}</div></div>`}
        ${fc ? `<div class="pl-row"><span>Површина</span><b>${fmt(fc.area)} m²</b></div><div class="pl-row"><span>Периметар</span><b>${fmt(fc.perim)} m</b></div>` : ''}
        <button class="btn danger small" id="plDel">Отстрани тип</button></div>`;
    } else if (sel && sel.type === 'terrace') {
      const t = f.terraces.find((x) => x.id === sel.id);
      if (t) h += `<div class="pl-box"><h5>Тераса</h5>
        <div class="seg pl-seg"><button type="button" class="seg-btn${t.covered ? ' on' : ''}" data-cov="1">Покриена</button><button type="button" class="seg-btn${t.covered ? '' : ' on'}" data-cov="0">Откриена</button></div>
        <div class="pl-2">${num('plTW', 'Ширина', t.w, 20, 10)}${num('plTH', 'Должина', t.h, 20, 10)}</div>
        <div class="pl-row"><span>Површина</span><b>${fmt(t.w * t.h / 1e4)} m²</b></div>
        <button class="btn danger small" id="plDel">Избриши тераса</button></div>`;
    } else if (sel && sel.type === 'stair') {
      const x = f.stairs.find((o) => o.id === sel.id);
      if (x) h += `<div class="pl-box"><h5>Скали</h5>
        <div class="pl-2">${num('plTW', 'Ширина', x.w, 20, 10)}${num('plTH', 'Должина', x.h, 20, 10)}</div>
        <div class="pl-row"><span>Скалила</span><b>${stairSteps(f)} × ${fmt(f.h / stairSteps(f), 1)} cm</b></div>
        <div class="pl-row"><span>Должина на кракот</span><b>${fmt(stairLen(x, f))} m</b></div>
        <div style="display:flex;gap:8px;"><button class="btn ghost small" id="plSDir">⟳ Насока</button><button class="btn danger small" id="plDel">Избриши</button></div></div>`;
    }

    // Висини на катовите и кров — кога ништо не е избрано
    if (!sel && !st.multi) {
      const R = st.plan.roof, RG = roofGeom();
      const hIn = (i) => `<div class="field"><label>${st.plan.floors.length === 2 ? floorName(i) : 'Висина на кат'} <span class="unit">m</span></label><input type="number" min="2" max="6" step="0.05" data-fh="${i}" value="${r2(st.plan.floors[i].h / 100)}"></div>`;
      const rotLbl = R.type === 'mono' ? '⟳ Сврти наклон' : R.type === 'gable' ? '⟳ Сврти слеме' : '';
      h += `<div class="pl-box"><h5>Висина и кров</h5>
        <div class="pl-2">${st.plan.floors.map((_, i) => hIn(i)).join('')}</div>
        <div class="field"><label>Кров</label><select id="plRoofT">${Object.entries(ROOF_TYPES).map(([k, l]) => `<option value="${k}"${R.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="pl-2">${R.type === 'flat' ? '' : `<div class="field"><label>Наклон <span class="unit">°</span></label><input type="number" min="3" max="60" step="1" id="plRoofP" value="${R.pitch}"></div>`}
          <div class="field"><label>Препуст <span class="unit">cm</span></label><input type="number" min="0" max="200" step="5" id="plRoofO" value="${R.overhang}"></div></div>
        ${rotLbl ? `<button class="btn ghost small" id="plRoofR">${rotLbl}</button>` : ''}
        ${RG && RG.low.length ? `<div class="pl-sub">Кров над прв кат <span class="pl-muted">(делот без втор кат над него)</span></div>
          ${R.type === 'flat' ? '' : `<div class="pl-2"><div class="field"><label>Наклон <span class="unit">°</span></label><input type="number" min="3" max="45" step="1" id="plLowP" value="${R.lowPitch ?? 10}"></div>
            <div class="field"><label>&nbsp;</label><button class="btn ghost small" id="plLowR">⟳ Сврти наклон</button></div></div>`}
          ${RG.lowRise > st.plan.floors[1].h - 20 ? `<p class="hint pl-warn">Кровот над првиот кат се крева ${fmt(RG.lowRise / 100)} m — повеќе од висината на вториот кат. Намали го наклонот.</p>` : ''}` : ''}
        ${RG ? `<div class="pl-row"><span>Кров${R.type === 'flat' ? '' : ' (косо)'}</span><b>${fmt(RG.area)} m²</b></div>
          ${RG.low.length ? `<div class="pl-row"><span class="pl-muted">од тоа еднокосен над прв кат</span><b>${fmt(RG.lowArea)} m²</b></div>` : ''}
          ${RG.exposed ? `<div class="pl-row"><span class="pl-muted">од тоа рамен над прв кат</span><b>${fmt(RG.exposed)} m²</b></div>` : ''}
          <div class="pl-row"><span>Симс (препуст)</span><b>${fmt(RG.sims)} m²</b></div>
          <div class="pl-row"><span>Висина до слеме</span><b>${fmt((st.plan.floors.reduce((a, x) => a + x.h, 0) + RG.rise) / 100)} m</b></div>`
        : '<p class="hint">Кровот се пресметува кога надворешните ѕидови се затворени.</p>'}</div>`;
    }

    if (!sel && !st.multi && st.plan.floors.some((x) => x.walls.length)) {
      h += `<div class="pl-box"><h5>Цел план</h5><p class="hint" style="margin:0;">Пресликај ги сите катови и плочата (пр. истиот модел во огледална верзија).</p>
        <div class="pl-2"><button class="btn ghost small" id="plPlanMX">⇋ Лево–десно</button><button class="btn ghost small" id="plPlanMY">⇵ Горе–долу</button></div></div>`;
    }
    if (st.floor === 1 && !f.walls.length && st.plan.floors[0].walls.some((w) => w.kind === 'out')) {
      h += `<div class="pl-box"><h5>Празен кат</h5><p class="hint">Почни од основата на првиот кат и смени ја по потреба.</p>
        <button class="btn ghost small" id="plCopy">Копирај надворешни ѕидови од прв кат</button></div>`;
    }

    const S = summary(f);
    const row = (l, v) => `<div class="pl-row"><span>${l}</span><b>${v}</b></div>`;
    h += `<div class="pl-box"><h5>${st.plan.floors.length === 2 ? floorName(st.floor) : 'План'}</h5>
      ${row('Надворешни ѕидови', fmt(S.out) + ' m')}
      ${row('Внатрешни ѕидови', fmt(S.in) + ' m')}
      ${row('Површина (по оска на ѕид)', S.area != null ? fmt(S.area) + ' m²' : S.out ? '<span class="pl-warn">не е затворена</span>' : '—')}
      ${row('Простории', S.rooms + (S.free ? ` <span class="pl-muted">+ ${S.free} без тип</span>` : ''))}
      ${S.orphans ? row('<span class="pl-warn">Надвор од затворен простор</span>', S.orphans) : ''}
      ${row('Бањи / WC', S.wc + (S.wc ? ' · ' + fmt(S.wcPerim) + ' m' : ''))}
      ${row('Ламинат / плочки', fmt(S.laminat) + ' / ' + fmt(S.plochki) + ' m²')}
      ${S.garage ? row('Гаража', fmt(S.garage) + ' m²') : ''}
      ${row('Врати внатрешни / влезни', S.doorsIn + ' / ' + S.doorsOut)}
      ${row('Прозори', S.wins + (S.wins ? ' · ' + fmt(S.winEur, 0) + ' €' : ''))}
      ${row('Тераси покриени / откриени', fmt(S.covered) + ' / ' + fmt(S.open) + ' m²')}
      ${S.stairs ? row('Скали', S.stairs + ' · ' + fmt(S.stairM) + ' m') : ''}</div>`;

    const patch = buildPatch(), keys = Object.keys(patch), wr = windowRows();
    const yn = ['LAMINAT', 'PLOCHKI', 'TWO_FLOORS', 'SKALI'];
    h += `<div class="pl-box"><h5>Ќе се пополни во калкулаторот</h5>${keys.length || wr.length
      ? keys.map((k) => row(esc(st.opts.labels[k] || k), yn.includes(k) ? (patch[k] ? 'да' : 'не') : fmt(patch[k]))).join('')
        + (wr.length ? row('Дограма (ги заменува стандардните редови)', wr.reduce((s, r) => s + r.qty, 0) + ' ком') : '')
      : '<p class="hint">Нацртај ѕидови, врати, прозори, простории или тераси.</p>'}</div>`;
    panel.innerHTML = h;
    wirePanel();
  }

  // Панел за бетонската плоча: ивица (должина), површина, бањи од прв кат, копирање на контурата
  function renderSlabPanel() {
    const f = F(), sel = st.sel, row = (l, v) => `<div class="pl-row"><span>${l}</span><b>${v}</b></div>`;
    let h = '';
    const w = sel && sel.type === 'wall' && wallById(f, sel.id);
    if (w) h += `<div class="pl-box"><h5>Ивица на плоча</h5>
      <div class="field"><label>Должина <span class="unit">cm</span></label><input type="number" min="5" step="1" id="plLen" value="${Math.round(wlen(w))}"></div>
      <button class="btn danger small" id="plDel">Избриши ивица</button></div>`;
    const base = st.plan.floors[0].walls.some((x) => x.kind === 'out');
    if (!f.walls.length) {
      h += `<div class="pl-box"><h5>Нова плоча</h5><p class="hint">Нацртај ја контурата на плочата или почни од надворешните ѕидови на првиот кат.</p>
        ${base ? '<button class="btn ghost small" id="plCopy">Копирај контура од прв кат</button>' : ''}</div>`;
    }
    const A = outerArea(f), len = f.walls.reduce((a, x) => a + wlen(x), 0) / 100, wc = slabToilets();
    h += `<div class="pl-box"><h5>Бетонска плоча</h5>
      ${row('Површина', A != null ? fmt(A) + ' m²' : f.walls.length ? '<span class="pl-warn">не е затворена</span>' : '—')}
      ${row('Обем', fmt(len) + ' m')}
      ${row('Бањи / WC од прв кат', wc.length + (wc.length ? ' · ' + fmt(wc.reduce((a, fc) => a + fc.area, 0)) + ' m²' : ''))}
      ${SLAB_KEY in st.opts.labels ? '' : `<p class="hint pl-warn">Параметарот ${SLAB_KEY} не постои во калкулаторот — површината нема да се пополни.</p>`}</div>`;
    const patch = buildPatch();
    h += `<div class="pl-box"><h5>Ќе се пополни во калкулаторот</h5>${SLAB_KEY in patch
      ? row(esc(st.opts.labels[SLAB_KEY] || SLAB_KEY), fmt(patch[SLAB_KEY]))
      : '<p class="hint">Затвори ја контурата на плочата.</p>'}</div>`;
    panel.innerHTML = h;
    wirePanel();
  }

  function wirePanel() {
    const f = F(), sel = st.sel;
    const on = (id, ev, fn) => { const el = panel.querySelector(id); if (el) el['on' + ev] = fn; };
    const item = () => sel && (sel.type === 'wall' ? wallById(f, sel.id)
      : sel.type === 'room' ? f.rooms.find((x) => x.id === sel.id)
      : RECTS[sel.type] ? f[RECTS[sel.type]].find((x) => x.id === sel.id)
      : openingsOf(f, sel.type).find((x) => x.id === sel.id));
    // Промена на вредност: снимка за Ctrl+Z, измена, освежување
    const edit = (fn) => { const it = item(); if (!it) return; snapshot(); fn(it); clampOpenings(); refresh(); };
    const numIn = (id, min, fn) => on(id, 'change', (e) => { const v = parseFloat(e.target.value); if (v >= min) edit((it) => fn(it, v)); });

    on('#plDel', 'click', delSel);
    on('#plMX', 'click', () => transformMulti('mx'));
    on('#plMY', 'click', () => transformMulti('my'));
    on('#plRot', 'click', () => transformMulti('rot'));
    on('#plCopySel', 'click', () => { copySel(); renderPanel(); });
    on('#plDelMulti', 'click', deleteMulti);
    on('#plPaste', 'click', startPaste);
    on('#plPlanMX', 'click', () => mirrorPlan('mx'));
    on('#plPlanMY', 'click', () => mirrorPlan('my'));
    panel.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { if (item().kind !== b.dataset.kind) edit((w) => { w.kind = b.dataset.kind; }); }; });
    numIn('#plLen', 5, (w, L) => {
      // Почетокот стои, крајот (и поврзаните ѕидови) се поместува по правецот
      const { ux, uy } = wdir(w);
      moveEnds(endsAt(w.x2, w.y2), Math.round(w.x1 + ux * L), Math.round(w.y1 + uy * L));
    });
    numIn('#plOpW', 30, (o, v) => { o.w = v; if (sel.type === 'win') rememberWin(o); });
    numIn('#plWH', 20, (o, v) => { o.h = v; rememberWin(o); });
    numIn('#plWS', 0, (o, v) => { o.sill = v; rememberWin(o); });
    on('#plWKind', 'change', (e) => edit((o) => { o.kind = e.target.value; o.w = WIN[o.kind].w; o.h = WIN[o.kind].h; o.sill = WIN[o.kind].sill; rememberWin(o); }));
    on('#plWPrice', 'change', (e) => { const v = parseFloat(e.target.value); if (v >= 0) edit((o) => { o.price = Math.round(v); o.manual = true; }); });
    on('#plWAuto', 'click', (e) => { e.preventDefault(); edit((o) => { o.manual = false; delete o.price; }); });
    on('#plFlip', 'click', () => edit((d) => { d.flip = !d.flip; }));
    on('#plRType', 'change', (e) => edit((r) => { r.type = e.target.value; r.floor = ROOMS[r.type].floor; }));
    panel.querySelectorAll('[data-floor-fin]').forEach((b) => { b.onclick = () => edit((r) => { r.floor = b.dataset.floorFin; }); });
    panel.querySelectorAll('[data-cov]').forEach((b) => { b.onclick = () => edit((t) => { t.covered = b.dataset.cov === '1'; }); });
    numIn('#plTW', 20, (t, v) => { t.w = v; });
    numIn('#plTH', 20, (t, v) => { t.h = v; });
    on('#plSDir', 'click', () => edit((x) => { x.dir = (x.dir + 1) % 4; }));
    // Висини и кров (не зависат од избран елемент)
    const plan = (fn) => { snapshot(); fn(st.plan); refresh(); };
    panel.querySelectorAll('[data-fh]').forEach((el) => {
      el.onchange = () => { const v = parseFloat(el.value); if (v >= 2 && v <= 6) plan((p) => { p.floors[+el.dataset.fh].h = Math.round(v * 100); }); };
    });
    on('#plRoofT', 'change', (e) => plan((p) => { p.roof.type = e.target.value; p.roof.rot = null; }));
    on('#plRoofP', 'change', (e) => { const v = parseFloat(e.target.value); if (v >= 3 && v <= 60) plan((p) => { p.roof.pitch = v; }); });
    on('#plRoofO', 'change', (e) => { const v = parseFloat(e.target.value); if (v >= 0 && v <= 200) plan((p) => { p.roof.overhang = v; }); });
    on('#plRoofR', 'click', () => {
      const RG = roofGeom(), cur = RG ? RG.parts[0].rot : st.plan.roof.rot || 0;
      plan((p) => { p.roof.rot = (cur + 1) % (p.roof.type === 'mono' ? 4 : 2); });
    });
    on('#plLowP', 'change', (e) => { const v = parseFloat(e.target.value); if (v >= 3 && v <= 45) plan((p) => { p.roof.lowPitch = v; }); });
    on('#plLowR', 'click', () => plan((p) => { p.roof.lowRot = ((p.roof.lowRot || 0) + 1) % 4; }));
    on('#plCopy', 'click', () => {
      snapshot();
      for (const w of st.plan.floors[0].walls) if (w.kind === 'out') F().walls.push({ ...w, id: uid() });
      refresh();
    });
  }

  function rememberWin(o) { st.lastWin = { kind: o.kind, w: o.w, h: o.h, sill: sillOf(o) }; }

  function refresh() {
    render(); renderPanel();
    if (st.view3d && window.MDA3D) window.MDA3D.update(model3d());
  }

  // 2D план ↔ 3D модел (three.js се вчитува при прво отворање)
  function setView(on) {
    st.view3d = on;
    root.classList.toggle('pl-3d', on);
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', (b.dataset.view === '3d') === on));
    if (on) {
      st.sel = null; st.draw = null;
      $('#plHint').textContent = HINTS['3d'];
      renderPanel();
      window.MDA3D.show($('#pl3d'), model3d());
    } else {
      window.MDA3D.hide();
      setTool(st.tool);
    }
  }

  // Модел за 3D: катови (ѕидови со отвори, подови, тераси, скали) и кров. Сè во cm.
  function model3d() {
    let base = 0;
    const RG = roofGeom();
    const floors = st.plan.floors.map((f) => {
      const L = layout(f), H = f.h;
      const ops = (w) => [
        ...f.doors.filter((d) => d.wall === w.id).map((d) => ({ t: d.t, w: d.w, bottom: 0, top: Math.min(210, H - 10) })),
        ...f.windows.filter((o) => o.wall === w.id).map((o) => {
          // Парапетот од 2D планот; горниот раб останува барем 10 cm под таванот
          const bottom = Math.max(0, Math.min(sillOf(o), H - 40));
          return { t: o.t, w: o.w, bottom, top: Math.min(bottom + o.h, H - 10), glass: true };
        }),
      ];
      // Натписи: „Спална“, „Спална 2“ … кога ист тип се повторува на катот
      const seen = {};
      const label = (type) => { seen[type] = (seen[type] || 0) + 1; return ROOMS[type].label + (seen[type] > 1 ? ' ' + seen[type] : ''); };
      const fl = {
        base, h: H, loops: outerLoops(f) || [],
        walls: f.walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, kind: w.kind, T: THICK[w.kind], ops: ops(w) })),
        rooms: L.faces.filter((fc) => fc.room).map((fc) => ({ pts: fc.pts, type: fc.room.type, label: label(fc.room.type), floor: ROOMS[fc.room.type].fixed ? (fc.room.type === 'garaza' ? 'garaza' : 'plochki') : fc.room.floor })),
        terraces: f.terraces.map((t) => ({ ...t })),
        stairs: f.stairs.map((x) => ({ ...x, steps: stairSteps(f) })),
      };
      base += H;
      return fl;
    });
    return {
      floors,
      // Бетонска плоча под куќата (контура од табот „Бетонска плоча“)
      slab: outerLoops(st.plan.slab) || [],
      // Материјали од админ → „3D материјали“ (веќе со применети правила за оваа понуда)
      mat3d: st.opts.mat3d || null,
      roof: RG && { top: RG.top, flat: st.plan.roof.type === 'flat', parts: RG.parts.map((p) => ({ outline: p.outline, planes: p.planes, pieces: p.pieces })) },
      lowRoof: RG && RG.low.length ? { flat: st.plan.roof.type === 'flat', parts: RG.low.map((p) => ({ outline: p.outline, planes: p.planes, pieces: p.pieces })) } : null,
    };
  }

  // На плочата: само избор и цртање ивица
  function syncToolbar() {
    const slab = isSlab();
    root.querySelectorAll('.pl-tool[data-tool], .pl-group').forEach((el) => {
      el.style.display = slab && !['select', 'box', 'out', 'rect'].includes(el.dataset.tool) ? 'none' : '';
    });
    const out = root.querySelector('.pl-tool[data-tool="out"] .pl-tl');
    if (out) out.textContent = slab ? 'Ивица на плоча' : 'Надворешен ѕид';
  }

  function setTool(t) {
    if (isSlab() && !['select', 'box', 'out', 'rect'].includes(t)) t = 'out';
    syncToolbar();
    st.tool = t; st.draw = null; st.typed = ''; st.ghost = null; st.hover = null; st.paste = null;
    if (t !== 'select' && t !== 'box') st.multi = null;
    if (t !== 'select' && !roomTool(t)) st.sel = null;
    root.querySelectorAll('.pl-tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('#plHint').textContent = HINTS[st.view3d ? '3d' : roomTool(t) ? 'room' : isSlab() && t === 'out' ? 'slab' : t];
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    refresh();
  }

  function endChain() { st.draw = null; st.typed = ''; render(); }

  // ── Поглед ──
  function fit() {
    const f = F(), W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    const xs = [], ys = [];
    for (const fl of [...st.plan.floors, st.plan.slab]) for (const w of fl.walls) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
    for (const z of [...f.terraces, ...f.stairs]) { xs.push(z.x, z.x + z.w); ys.push(z.y, z.y + z.h); }
    if (!xs.length) { st.view = { s: 0.5, tx: 60, ty: 60 }; return; }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.max(0.08, Math.min(3, Math.min((W - 120) / Math.max(100, maxX - minX), (H - 120) / Math.max(100, maxY - minY))));
    st.view = { s, tx: W / 2 - (minX + maxX) / 2 * s, ty: H / 2 - (minY + maxY) / 2 * s };
  }

  // ── Настани ──
  function ptr(e) { const r = svg.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }

  // Врата/прозор под курсорот: прозорите одат само на надворешни ѕидови
  function ghostAt(px, py) {
    const isWin = st.tool === 'win', nw = nearWall(px, py, 18, isWin ? 'out' : null);
    if (!nw) return null;
    const lw = st.lastWin || { kind: 'win', ...WIN.win };
    const w = Math.min(isWin ? lw.w : DOOR_W[nw.w.kind], wlen(nw.w));
    return { w: nw.w, d: { t: Math.max(w / 2, Math.min(wlen(nw.w) - w / 2, nw.t)), w, h: lw.h, kind: lw.kind, sill: lw.sill != null ? lw.sill : WIN[lw.kind].sill } };
  }

  function onDown(e) {
    if (e.button === 2) return;
    const { px, py } = ptr(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || st.space) { st.drag = { type: 'pan', px, py, tx: st.view.tx, ty: st.view.ty }; return; }
    const f = F(), t = st.tool, m = toW(px, py);

    // Залепување: клик го остава копираното
    if (st.paste) { commitPaste(); return; }
    // Клик на мерка на ѕид → внес на должина (по настанот, за полето да го задржи фокусот)
    const dimEl = e.target.closest('[data-dim]');
    if (dimEl && (t === 'select' || t === 'box')) { e.preventDefault(); const id = dimEl.dataset.dim; setTimeout(() => openDimEdit(id), 0); return; }
    if (t === 'rect') { st.drag = { type: 'wallrect', a: drawPoint(px, py), b: null }; return; }
    if (t === 'box') {
      const hb = e.target.closest('[data-hit]');
      if (st.multi && hb) { const [k0, id0] = hb.dataset.hit.split(':'); if (inMulti(k0, id0)) { startGroupDrag(m); return; } }
      st.multi = null; st.sel = null;
      st.drag = { type: 'box', a: m, b: m };
      refresh();
      return;
    }

    if (t === 'out' || t === 'in') {
      const p = drawPoint(px, py, st.draw && st.draw.from, e.shiftKey);
      if (!st.draw) { st.draw = { kind: t, from: p, start: p, cur: p }; render(); return; }
      snapshot();
      const w = addWall(t, st.draw.from, p);
      if (!w) { st.hist.pop(); return; }
      // Затворен круг → крај
      if (same(p.x, p.y, st.draw.start.x, st.draw.start.y)) st.draw = null;
      else st.draw = { ...st.draw, from: p, cur: p };
      st.typed = '';
      refresh();
      return;
    }

    if (t === 'door' || t === 'win') {
      const g = ghostAt(px, py);
      if (!g) return;
      snapshot();
      const o = { id: uid(), wall: g.w.id, t: g.d.t, w: g.d.w };
      if (t === 'win') { Object.assign(o, { h: g.d.h, kind: g.d.kind, sill: g.d.sill }); f.windows.push(o); } else f.doors.push(o);
      clampOpenings();
      st.ghost = null;
      refresh();
      return;
    }

    const rt = roomTool(t);
    if (rt) {
      const fc = faceAt(st.layout || layout(f), m.x, m.y);
      if (!fc) return;
      snapshot();
      if (fc.room) { fc.room.type = rt; fc.room.floor = ROOMS[rt].floor; st.sel = { type: 'room', id: fc.room.id }; }
      else {
        const p = labelPoint(fc.pts), r = { id: uid(), x: p.x, y: p.y, type: rt, floor: ROOMS[rt].floor };
        f.rooms.push(r);
        st.sel = { type: 'room', id: r.id };
      }
      refresh();
      return;
    }

    if (RECTS[t]) {
      st.drag = { type: 'newrect', kind: t, x0: snapG(m.x), y0: snapG(m.y), z: null };
      return;
    }

    // Избор; влечење на дел од избраната област ја поместува целата
    const hit = e.target.closest('[data-hit]');
    if (st.multi && hit) { const [k0, id0] = hit.dataset.hit.split(':'); if (inMulti(k0, id0)) { startGroupDrag(m); return; } }
    st.multi = null;
    if (!hit) { st.sel = null; st.drag = { type: 'pan', px, py, tx: st.view.tx, ty: st.view.ty }; refresh(); return; }
    const [kind, id, end] = hit.dataset.hit.split(':');
    if (kind === 'wh') {
      const w = wallById(f, id);
      snapshot();
      st.drag = { type: 'end', ends: endsAt(w['x' + end], w['y' + end]), moved: false };
      return;
    }
    if (kind === 'rh') { snapshot(); st.drag = { type: 'rsize', z: [...f.terraces, ...f.stairs].find((z) => z.id === id) }; return; }
    st.sel = { type: kind, id };
    if (kind === 'wall') {
      const w = wallById(f, id);
      snapshot();
      st.drag = { type: 'wall', m0: m, a: endsAt(w.x1, w.y1), b: endsAt(w.x2, w.y2), o: { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }, moved: false };
    } else if (kind === 'door' || kind === 'win') {
      snapshot();
      st.drag = { type: 'open', d: openingsOf(f, kind).find((d) => d.id === id), moved: false };
    } else if (RECTS[kind]) {
      const z = f[RECTS[kind]].find((x) => x.id === id);
      snapshot();
      st.drag = { type: 'rect', z, m0: m, o: { x: z.x, y: z.y }, moved: false };
    } else if (kind === 'room') {
      // Просториите ги следат ѕидовите — влечење по нив го поместува погледот
      st.drag = { type: 'pan', px, py, tx: st.view.tx, ty: st.view.ty };
    }
    refresh();
  }

  function onMove(e) {
    const { px, py } = ptr(e), d = st.drag, f = F();
    if (d && d.type === 'pan') { st.view.tx = d.tx + px - d.px; st.view.ty = d.ty + py - d.py; render(); return; }
    if (st.paste && clip) {
      const m = toW(px, py), b = clip.b;
      st.paste.dx = snapG(m.x - (b.x0 + b.x1) / 2); st.paste.dy = snapG(m.y - (b.y0 + b.y1) / 2);
      render();
      return;
    }
    if (st.tool === 'rect') {
      st.cursor = drawPoint(px, py);
      if (d && d.type === 'wallrect') d.b = st.cursor;
      render();
      return;
    }
    if (st.tool === 'out' || st.tool === 'in') {
      st.cursor = drawPoint(px, py, st.draw && st.draw.from, e.shiftKey);
      if (st.draw) { st.draw.cur = st.cursor; st.typed = ''; }
      render();
      return;
    }
    if (st.tool === 'door' || st.tool === 'win') { st.ghost = ghostAt(px, py); render(); return; }
    const m = toW(px, py);
    if (roomTool(st.tool)) {
      const fc = st.layout && faceAt(st.layout, m.x, m.y);
      if (fc !== st.hover) { st.hover = fc; render(); }
      return;
    }
    if (!d) return;
    if (d.type === 'newrect') {
      const x1 = snapG(m.x), y1 = snapG(m.y);
      d.z = { x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), w: Math.abs(x1 - d.x0), h: Math.abs(y1 - d.y0) };
    } else if (d.type === 'end') {
      const skip = new Set(d.ends.map(([w]) => w));
      const p = nearPoint(px, py, skip) || { x: snapG(m.x), y: snapG(m.y) };
      moveEnds(d.ends, p.x, p.y); clampOpenings(); d.moved = true;
    } else if (d.type === 'wall') {
      const dx = snapG(m.x - d.m0.x), dy = snapG(m.y - d.m0.y);
      moveEnds(d.a, d.o.x1 + dx, d.o.y1 + dy); moveEnds(d.b, d.o.x2 + dx, d.o.y2 + dy); clampOpenings(); d.moved = true;
    } else if (d.type === 'open') {
      const w = wallById(f, d.d.wall);
      if (w) { d.d.t = project(w, m.x, m.y).t; clampOpenings(); d.moved = true; }
    } else if (d.type === 'rect') {
      d.z.x = d.o.x + snapG(m.x - d.m0.x); d.z.y = d.o.y + snapG(m.y - d.m0.y); d.moved = true;
    } else if (d.type === 'rsize') {
      d.z.w = Math.max(20, snapG(m.x - d.z.x)); d.z.h = Math.max(20, snapG(m.y - d.z.y));
    } else if (d.type === 'box') {
      d.b = m;
    } else if (d.type === 'group') {
      const dx = snapG(m.x - d.m0.x), dy = snapG(m.y - d.m0.y);
      for (const p of d.pts) moveEnds(p.ends, p.x + dx, p.y + dy);
      for (const o of d.z) { o.z.x = o.x + dx; o.z.y = o.y + dy; }
      for (const o of d.r) { o.r.x = o.x + dx; o.r.y = o.y + dy; }
      clampOpenings(); d.moved = true;
    }
    render();
  }

  function onUp() {
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    if (d.type === 'wallrect') { if (d.b) addRect(d.a, d.b); else render(); return; }
    if (d.type === 'box') {
      const r = { x0: Math.min(d.a.x, d.b.x), x1: Math.max(d.a.x, d.b.x), y0: Math.min(d.a.y, d.b.y), y1: Math.max(d.a.y, d.b.y) };
      st.multi = r.x1 - r.x0 > 5 || r.y1 - r.y0 > 5 ? collect(F(), r) : null;
      refresh();
      return;
    }
    if (d.type === 'newrect') {
      if (d.z && d.z.w >= 20 && d.z.h >= 20) {
        snapshot();
        const z = { id: uid(), ...d.z };
        if (d.kind === 'stair') z.dir = z.w >= z.h ? 0 : 1; else z.covered = false;
        F()[RECTS[d.kind]].push(z);
        setTool('select');
        st.sel = { type: d.kind, id: z.id };
      }
      refresh();
      return;
    }
    // Клик без поместување не треба да остави чекор во историјата
    if (['wall', 'open', 'rect', 'end', 'group'].includes(d.type) && !d.moved) st.hist.pop();
    if (d.type !== 'pan') refresh();
  }

  function onWheel(e) {
    e.preventDefault();
    const { px, py } = ptr(e), m = toW(px, py);
    const s = Math.max(0.05, Math.min(5, st.view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    st.view = { s, tx: px - m.x * s, ty: py - m.y * s };
    render();
  }

  function onKey(e) {
    if (!root.classList.contains('open')) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === ' ' && !typing) { st.space = e.type === 'keydown'; e.preventDefault(); return; }
    if (e.type !== 'keydown') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && !typing && !st.view3d && e.key.toLowerCase() === 'c') { if (copySel()) { e.preventDefault(); renderPanel(); } return; }
    if ((e.ctrlKey || e.metaKey) && !typing && !st.view3d && e.key.toLowerCase() === 'v') { if (clip && !isSlab()) { e.preventDefault(); startPaste(); } return; }
    if (typing) return;
    if (e.key === 'Escape') { e.preventDefault(); if (st.paste) { st.paste = null; setTool(st.tool); } else if (st.draw) endChain(); else { st.sel = null; st.multi = null; refresh(); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (st.sel || st.multi) && !st.draw) { e.preventDefault(); if (st.multi) deleteMulti(); else delSel(); return; }
    // Внес на точна должина при цртање
    if (st.draw) {
      if (/^[0-9]$/.test(e.key) || (e.key === '.' && !st.typed.includes('.'))) { st.typed += e.key; render(); e.preventDefault(); return; }
      if (e.key === 'Backspace') { st.typed = st.typed.slice(0, -1); render(); e.preventDefault(); return; }
      if (e.key === 'Enter' && st.typed) {
        e.preventDefault();
        const L = parseFloat(st.typed), a = st.draw.from, c = st.draw.cur || a;
        let dx = c.x - a.x, dy = c.y - a.y;
        if (!dx && !dy) dx = 1;
        const l = Math.hypot(dx, dy);
        const b = { x: Math.round(a.x + dx / l * L), y: Math.round(a.y + dy / l * L) };
        snapshot();
        if (!addWall(st.draw.kind, a, b)) { st.hist.pop(); return; }
        st.draw = { ...st.draw, from: b, cur: b };
        st.typed = '';
        refresh();
      }
    }
  }

  // ── Прозорец ──
  function build() {
    root = document.createElement('div');
    root.className = 'modal-back pl-back';
    root.id = 'planModal';
    const tools = TOOLS.map(([k, l]) => {
      if (!l) return `<div class="pl-group">${k}</div>`;
      const R = ROOMS[roomTool(k)];
      const sw = R ? ` style="background:${R.fill};border:1px solid ${R.stroke}"` : '';
      return `<button type="button" class="pl-tool pl-t-${R ? 'room' : k}" data-tool="${k}"><i${sw}></i><span class="pl-tl">${l}</span></button>`;
    }).join('');
    root.innerHTML = `<div class="modal pl-modal">
      <div class="modal-head"><h3>План на куќа</h3><div class="pl-floors" id="plFloors"></div>
        <div class="seg pl-seg pl-view"><button type="button" class="seg-btn on" data-view="2d">2D план</button><button type="button" class="seg-btn" data-view="3d">3D модел</button></div>
        <button class="x-close" id="plClose">×</button></div>
      <div class="pl-main">
        <div class="pl-tools">${tools}
          <span class="pl-sep"></span>
          <button type="button" class="pl-tool" id="plUndo" title="Ctrl+Z">↶ Врати</button>
          <button type="button" class="pl-tool" id="plFit">⤢ Целиот план</button>
          <button type="button" class="pl-tool" id="plIDim" title="Светли мерки во просториите (од ѕид до ѕид)">📏 Внатрешни мерки</button>
        </div>
        <div class="pl-canvas"><svg id="plSvg"></svg><div class="pl-typed" id="plTyped"></div></div>
        <div class="pl-3dview" id="pl3d"></div>
        <div class="pl-side" id="plSide"></div>
      </div>
      <div class="modal-foot"><span class="hint pl-hint" id="plHint"></span>
        <button class="btn ghost" id="plCancel">Откажи</button>
        <button class="btn accent" id="plApply">Пополни ги полињата</button></div>
    </div>`;
    document.body.appendChild(root);
    svg = $('#plSvg');
    panel = $('#plSide');
    root.querySelectorAll('.pl-tool[data-tool]').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });
    $('#plUndo').onclick = undo;
    root.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => setView(b.dataset.view === '3d'); });
    $('#plFit').onclick = () => { fit(); render(); };
    $('#plIDim').onclick = () => {
      st.innerDims = !st.innerDims;
      try { localStorage.setItem('mdaInnerDims', st.innerDims ? '1' : '0'); } catch (e) { /* без меморија */ }
      $('#plIDim').classList.toggle('on', st.innerDims);
      render();
    };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointerleave', () => { st.cursor = null; st.ghost = null; st.hover = null; if (!st.drag) render(); });
    svg.addEventListener('dblclick', () => { if (st.draw) endChain(); });
    svg.addEventListener('contextmenu', (e) => { e.preventDefault(); if (st.draw) endChain(); });
    svg.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    window.addEventListener('resize', () => { if (root.classList.contains('open')) render(); });
    const close = () => {
      if (st.dirty && !confirm('Да се отфрлат измените на планот?')) return;
      if (st.view3d) setView(false);
      root.classList.remove('open');
    };
    $('#plClose').onclick = close;
    $('#plCancel').onclick = close;
    $('#plApply').onclick = () => {
      st.dirty = false;
      root.classList.remove('open');
      if (st.view3d) setView(false);
      const S = st.plan.floors.map(summary), RG = roofGeom();
      st.onApply(buildPatch(), JSON.parse(JSON.stringify(st.plan)), {
        windows: windowRows(),
        terraces: S.some((s) => s.covered || s.open) ? S.map((s) => ({ covered: r2(s.covered), open: r2(s.open) })) : null,
        // Надворешна висина од плоча до слеме (за понудата)
        outerH: RG ? r2((st.plan.floors.reduce((a, f) => a + f.h, 0) + RG.rise) / 100) : null,
      });
    };
  }

  // Табови за катовите: втор кат се додава / отстранува од тука
  function renderFloors() {
    const box = $('#plFloors'), n = st.plan.floors.length;
    box.innerHTML = `<div class="pl-tabs">${st.plan.floors.map((_, i) => `<button type="button" class="pl-tab${st.floor === i ? ' on' : ''}" data-floor="${i}">${floorName(i)}${i ? '<span class="pl-tab-x" data-rm title="Отстрани го вториот кат">×</span>' : ''}</button>`).join('')}
      ${n < 2 ? '<button type="button" class="pl-tab pl-tab-add" data-add>+ Втор кат</button>' : ''}
      <button type="button" class="pl-tab pl-tab-slab${isSlab() ? ' on' : ''}" data-slab>Бетонска плоча</button></div>`;
    box.querySelectorAll('[data-floor]').forEach((b) => {
      b.onclick = (e) => {
        if (e.target.closest('[data-rm]')) {
          const f2 = st.plan.floors[1], has = f2.walls.length || f2.terraces.length || f2.stairs.length;
          if (has && !confirm('Да се отстрани вториот кат со сè што е нацртано на него?')) return;
          snapshot();
          st.plan.floors.splice(1);
          st.floor = 0;
        } else st.floor = Number(b.dataset.floor);
        st.sel = null; st.draw = null; st.multi = null;
        renderFloors(); fit();
        if (st.view3d) refresh(); else setTool(st.tool);
      };
    });
    box.querySelector('[data-slab]').onclick = () => {
      st.floor = SLAB; st.sel = null; st.draw = null; st.multi = null;
      renderFloors(); fit();
      // Празна плоча → веднаш цртање на ивицата
      if (st.view3d) refresh(); else setTool(st.plan.slab.walls.length ? 'select' : 'out');
    };
    const add = box.querySelector('[data-add]');
    if (add) add.onclick = () => {
      snapshot();
      st.plan.floors.push(emptyFloor(st.plan.floors[0].h));
      st.floor = 1; st.sel = null; st.draw = null; st.multi = null;
      renderFloors(); fit();
      if (st.view3d) refresh(); else setTool('out');
    };
  }

  // Стар формат (v1): зони за под / WC → простории на истото место
  function upgrade(f, h) {
    const n = Object.assign(emptyFloor(h), f);
    for (const z of f.zones || []) {
      const type = z.type === 'wc' ? 'banja' : 'dnevna';
      n.rooms.push({ id: z.id, x: z.x + z.w / 2, y: z.y + z.h / 2, type, floor: z.type === 'plochki' ? 'plochki' : ROOMS[type].floor });
    }
    delete n.zones;
    return n;
  }

  function open(plan, opts, onApply) {
    if (!root) build();
    const p = plan && Array.isArray(plan.floors) ? JSON.parse(JSON.stringify(plan)) : { floors: [] };
    p.v = 3;
    // Висините што недостасуваат се земаат од калкулаторот
    const hs = (opts.heights || []).map((v) => Math.round((v || 0) * 100)).map((v, i, a) => v >= 200 ? v : a[0] >= 200 ? a[0] : 285);
    const hDef = (i) => hs[i] || hs[0] || 285;
    p.floors = p.floors.slice(0, 2).map((f, i) => upgrade(f, hDef(i)));
    if (!p.floors.length) p.floors.push(emptyFloor(hDef(0)));
    // Калкулаторот бара два ката → табот за втор кат е веќе отворен
    if (opts.floors === 2 && p.floors.length < 2) p.floors.push(emptyFloor(hDef(1)));
    p.roof = Object.assign({}, ROOF_DEF, p.roof);
    p.slab = Object.assign(emptyFloor(), p.slab, { doors: [], windows: [], rooms: [], terraces: [], stairs: [] });
    st = { plan: p, floor: 0, tool: 'out', view3d: false, view: { s: 0.5, tx: 60, ty: 60 }, sel: null, multi: null, paste: null, draw: null, drag: null, typed: '', hist: [], dirty: false,
      opts: Object.assign({ floors: 1, labels: {}, eurM2: 150 }, opts), onApply };
    // Внатрешните мерки се стандардно вклучени; изборот се памети во прелистувачот
    try { st.innerDims = localStorage.getItem('mdaInnerDims') !== '0'; } catch (e) { st.innerDims = true; }
    $('#plIDim').classList.toggle('on', st.innerDims);
    root.classList.add('open');
    root.classList.remove('pl-3d');
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === '2d'));
    renderFloors();
    // Кога има план → почни со избор; празен → со надворешен ѕид
    const hasWalls = p.floors.some((f) => f.walls.length);
    requestAnimationFrame(() => { fit(); setTool(hasWalls ? 'select' : 'out'); });
  }

  window.MDAPlanner = { open, _faces: faces, _summary: summary, _outerArea: outerArea, _labelPoint: labelPoint, _offsetPoly: offsetPoly, _roofPlanes: roofPlanes, _clipHalf: clipHalf };
})();
