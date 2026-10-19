/*
 * MDA план — едноставен цртач на основа на куќа: ѕидови (надворешни/внатрешни),
 * врати, зони за под (ламинат/плочки) и бањи. Сите мерки се во cm.
 *
 *   MDAPlanner.open(plan, { floors: 1|2, labels: {KEY: 'Име'} }, (patch, plan) => { … })
 *
 * patch се вредностите за калкулаторот (WALL_OUT, AREA_HOUSE, WC …), plan е цртежот
 * (се чува со понудата за подоцна да се уредува).
 */
(function () {
  const GRID = 10;                      // cm — чекор на мрежата
  const SNAP_PX = 12;                   // привлекување кон постоечка точка/ѕид (во пиксели)
  const THICK = { out: 25, in: 12 };    // cm — дебелина само за приказ
  const DOOR_W = { out: 100, in: 90 };  // cm — стандардна ширина на врата
  const ZONES = {
    laminat: { label: 'Ламинат', fill: 'rgba(196,154,98,.22)', stroke: '#b4874c' },
    plochki: { label: 'Плочки', fill: 'rgba(110,140,165,.20)', stroke: '#62839b' },
    wc:      { label: 'Бања / WC', fill: 'rgba(70,150,195,.22)', stroke: '#3a88b3' },
  };
  const TOOLS = [
    ['select', 'Избери', 'Избери, помести, уреди'],
    ['out', 'Надворешен ѕид', 'Клик за почеток и за секој агол'],
    ['in', 'Внатрешен ѕид', 'Клик за почеток и за секој агол'],
    ['door', 'Врата', 'Клик на ѕид'],
    ['laminat', 'Под — ламинат', 'Влечи правоаголник'],
    ['plochki', 'Под — плочки', 'Влечи правоаголник'],
    ['wc', 'Бања / WC', 'Влечи правоаголник'],
  ];
  const HINTS = {
    select: 'Клик на елемент за избор. Влечи ѕид, агол (точка), врата или зона за да ја поместиш. Delete брише, Ctrl+Z враќа. Влечи празен простор за поместување на погледот, тркалце за зум.',
    out: 'Клик за почеток, клик за секој агол. Внеси должина во cm и Enter за точна мерка. Клик на почетната точка ја затвора куќата. Двоен клик или Esc — крај. Shift — слободен агол.',
    in: 'Клик за почеток, клик за секој агол — точките се лепат на постоечките ѕидови. Внеси должина во cm и Enter. Двоен клик или Esc — крај.',
    door: 'Клик на ѕид за да поставиш врата. На внатрешен ѕид = внатрешна врата, на надворешен = влезна (блиндор).',
    laminat: 'Влечи правоаголник за површина со ламинат.',
    plochki: 'Влечи правоаголник за површина со плочки.',
    wc: 'Влечи правоаголник за бања / WC — се брои бројот и периметарот.',
  };

  let root, svg, panel, st;
  const $ = (s) => root.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const snapG = (v) => Math.round(v / GRID) * GRID;
  const r2 = (v) => Math.round(v * 100) / 100;
  const fmt = (v, d = 2) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: d }).format(v);
  const F = () => st.plan.floors[st.floor];
  const emptyFloor = () => ({ walls: [], doors: [], zones: [] });

  // ── Геометрија ──
  const wlen = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const wdir = (w) => { const l = wlen(w) || 1; return { ux: (w.x2 - w.x1) / l, uy: (w.y2 - w.y1) / l }; };
  const toS = (x, y) => [x * st.view.s + st.view.tx, y * st.view.s + st.view.ty];
  const toW = (px, py) => ({ x: (px - st.view.tx) / st.view.s, y: (py - st.view.ty) / st.view.s });
  const same = (ax, ay, bx, by) => Math.abs(ax - bx) < 0.5 && Math.abs(ay - by) < 0.5;
  const wallById = (f, id) => f.walls.find((w) => w.id === id);

  // Проекција на точка (cm) врз ѕид: t е растојание од почетокот во cm
  function project(w, x, y) {
    const { ux, uy } = wdir(w), L = wlen(w);
    const t = Math.max(0, Math.min(L, (x - w.x1) * ux + (y - w.y1) * uy));
    return { t, x: w.x1 + ux * t, y: w.y1 + uy * t };
  }

  function nearPoint(px, py, skip) {
    let best = null, bd = SNAP_PX;
    for (const w of F().walls) {
      if (skip && skip.has(w)) continue;
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        const [sx, sy] = toS(x, y);
        const d = Math.hypot(sx - px, sy - py);
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    return best;
  }

  function nearWall(px, py, maxPx = SNAP_PX) {
    const m = toW(px, py);
    let best = null;
    for (const w of F().walls) {
      const p = project(w, m.x, m.y);
      const [sx, sy] = toS(p.x, p.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < maxPx && (!best || d < best.d)) best = { w, d, ...p };
    }
    return best;
  }

  // Точка при цртање ѕид: постоечка точка → ѕид → агол од 45° + мрежа
  function drawPoint(px, py, from, free) {
    const p = nearPoint(px, py);
    if (p) return p;
    const nw = nearWall(px, py);
    if (nw) return { x: Math.round(nw.x), y: Math.round(nw.y) };
    const m = toW(px, py);
    if (!from) return { x: snapG(m.x), y: snapG(m.y) };
    let dx = m.x - from.x, dy = m.y - from.y;
    if (free) { dx = snapG(dx); dy = snapG(dy); } else {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = snapG(Math.hypot(dx, dy));
      dx = Math.cos(a) * len; dy = Math.sin(a) * len;
    }
    return { x: Math.round(from.x + dx), y: Math.round(from.y + dy) };
  }

  // Површина затворена од надворешните ѕидови (m²) или null ако не се затворени
  function outerArea(f) {
    const ws = f.walls.filter((w) => w.kind === 'out');
    if (!ws.length) return null;
    const k = (x, y) => Math.round(x) + ',' + Math.round(y);
    const adj = {};
    for (const w of ws) {
      (adj[k(w.x1, w.y1)] = adj[k(w.x1, w.y1)] || []).push(w);
      (adj[k(w.x2, w.y2)] = adj[k(w.x2, w.y2)] || []).push(w);
    }
    if (Object.values(adj).some((a) => a.length !== 2)) return null;
    const seen = new Set();
    let total = 0;
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
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
      }
      total += Math.abs(a) / 2;
    }
    return total / 1e4;
  }

  function summary(f) {
    const len = (kind) => f.walls.filter((w) => w.kind === kind).reduce((s, w) => s + wlen(w), 0) / 100;
    const doors = (kind) => f.doors.filter((d) => { const w = wallById(f, d.wall); return w && w.kind === kind; }).length;
    const zs = (t) => f.zones.filter((z) => z.type === t);
    const zArea = (t) => zs(t).reduce((s, z) => s + z.w * z.h, 0) / 1e4;
    return {
      out: len('out'), in: len('in'), area: outerArea(f),
      doorsIn: doors('in'), doorsOut: doors('out'),
      wc: zs('wc').length, wcPerim: zs('wc').reduce((s, z) => s + 2 * (z.w + z.h), 0) / 100,
      laminat: zArea('laminat'), plochki: zArea('plochki'),
    };
  }

  // Вредности за калкулаторот — само за она што е нацртано
  function buildPatch() {
    const n = st.opts.floors;
    const S = st.plan.floors.slice(0, n).map(summary);
    const keys = n === 2
      ? [['AREA_F1', 'WALL_OUT', 'WALL_IN'], ['AREA_F2', 'WALL_OUT2', 'WALL_IN2']]
      : [['AREA_HOUSE', 'WALL_OUT', 'WALL_IN']];
    const p = {};
    S.forEach((s, i) => {
      const [a, o, w] = keys[i];
      if (s.out) p[o] = r2(s.out);
      if (s.in) p[w] = r2(s.in);
      if (s.area) p[a] = r2(s.area);
    });
    const sum = (k) => S.reduce((t, s) => t + s[k], 0);
    if (sum('doorsIn') || sum('doorsOut')) { p.DOORS_IN = sum('doorsIn'); p.DOORS_BLIND = sum('doorsOut'); }
    if (sum('wc')) { p.WC = sum('wc'); p.WC_PERIM = r2(sum('wcPerim')); }
    const lam = sum('laminat'), pl = sum('plochki');
    if (lam || pl) { p.LAMINAT = lam >= pl ? 1 : 0; p.PLOCHKI = lam >= pl ? 0 : 1; }
    return p;
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
    st.sel = null; st.draw = null;
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
      // Вратите остануваат на делот каде се наоѓаат
      for (const d of f.doors) if (d.wall === w.id && d.t > pr.t) { d.wall = nw.id; d.t -= pr.t; }
      w.x2 = p.x; w.y2 = p.y;
      f.walls.push(nw);
      return;
    }
  }
  function delSel() {
    if (!st.sel) return;
    snapshot();
    const f = F(), { type, id } = st.sel;
    if (type === 'wall') { f.walls = f.walls.filter((w) => w.id !== id); f.doors = f.doors.filter((d) => d.wall !== id); }
    if (type === 'door') f.doors = f.doors.filter((d) => d.id !== id);
    if (type === 'zone') f.zones = f.zones.filter((z) => z.id !== id);
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
  function clampDoors() {
    const f = F();
    for (const d of f.doors) {
      const w = wallById(f, d.wall);
      if (!w) continue;
      const L = wlen(w);
      d.w = Math.min(d.w, Math.max(30, L));
      d.t = Math.max(d.w / 2, Math.min(L - d.w / 2, d.t));
    }
  }

  // ── Цртање (SVG) ──
  function render() {
    const f = F(), s = st.view.s;
    let h = '';
    const g1 = GRID * s, g2 = 100 * s;
    h += `<defs>
      <pattern id="plG1" width="${g1}" height="${g1}" patternUnits="userSpaceOnUse" x="${st.view.tx}" y="${st.view.ty}">
        <path d="M ${g1} 0 L 0 0 0 ${g1}" fill="none" stroke="#efeae1" stroke-width="1"/></pattern>
      <pattern id="plG2" width="${g2}" height="${g2}" patternUnits="userSpaceOnUse" x="${st.view.tx}" y="${st.view.ty}">
        <path d="M ${g2} 0 L 0 0 0 ${g2}" fill="none" stroke="#ddd5c8" stroke-width="1"/></pattern></defs>`;
    if (g1 >= 5) h += '<rect width="100%" height="100%" fill="url(#plG1)"/>';
    h += '<rect width="100%" height="100%" fill="url(#plG2)"/>';

    // Другиот кат — блед, за порамнување
    if (st.opts.floors === 2) {
      const o = st.plan.floors[1 - st.floor];
      for (const w of o.walls) {
        const [x1, y1] = toS(w.x1, w.y1), [x2, y2] = toS(w.x2, w.y2);
        h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d9d2c6" stroke-width="${Math.max(2, THICK[w.kind] * s)}" stroke-linecap="square" stroke-dasharray="6 6"/>`;
      }
    }

    // Зони (под, бања)
    for (const z of f.zones) {
      const Z = ZONES[z.type], [x, y] = toS(z.x, z.y), sel = isSel('zone', z.id);
      const zw = z.w * s, zh = z.h * s;
      h += `<g data-hit="zone:${z.id}"><rect x="${x}" y="${y}" width="${zw}" height="${zh}" fill="${Z.fill}" stroke="${sel ? 'var(--accent)' : Z.stroke}" stroke-width="${sel ? 2 : 1}" stroke-dasharray="${z.type === 'wc' ? '' : '5 4'}"/>`;
      if (zw > 50 && zh > 28) h += `<text x="${x + zw / 2}" y="${y + zh / 2}" class="pl-zlabel" text-anchor="middle">${esc(Z.label)}<tspan x="${x + zw / 2}" dy="14">${fmt(z.w * z.h / 1e4)} m² · ${Math.round(z.w)}×${Math.round(z.h)}</tspan></text>`;
      h += '</g>';
      if (sel && st.tool === 'select') h += `<rect data-hit="zh:${z.id}" x="${x + zw - 6}" y="${y + zh - 6}" width="12" height="12" class="pl-handle" style="cursor:nwse-resize"/>`;
    }

    // Ѕидови
    for (const w of f.walls) {
      const [x1, y1] = toS(w.x1, w.y1), [x2, y2] = toS(w.x2, w.y2), sel = isSel('wall', w.id);
      const col = sel ? 'var(--accent)' : w.kind === 'out' ? '#3b3732' : '#8d867c';
      h += `<g data-hit="wall:${w.id}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${Math.max(3, THICK[w.kind] * s)}" stroke-linecap="square"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${Math.max(14, THICK[w.kind] * s + 8)}"/></g>`;
    }
    // Врати (празнина во ѕидот + крило и лак)
    for (const d of f.doors) {
      const w = wallById(f, d.wall);
      if (!w) continue;
      h += doorSvg(w, d, isSel('door', d.id));
    }
    // Мерки на ѕидовите (cm)
    for (const w of f.walls) h += dimLabel(w.x1, w.y1, w.x2, w.y2, THICK[w.kind], isSel('wall', w.id));

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
      h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-opacity=".55" stroke-width="${Math.max(3, THICK[st.draw.kind] * s)}" stroke-linecap="square"/>`;
      h += dimLabel(a.x, a.y, b.x, b.y, THICK[st.draw.kind], true);
      h += `<circle cx="${x1}" cy="${y1}" r="4" fill="var(--accent)"/>`;
    }
    if (st.cursor && (st.tool === 'out' || st.tool === 'in')) {
      const [cx, cy] = toS(st.cursor.x, st.cursor.y);
      h += `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    }
    // Преглед на врата
    if (st.tool === 'door' && st.ghost) h += doorSvg(st.ghost.w, st.ghost.d, true, true);
    // Преглед на нова зона
    if (st.drag && st.drag.type === 'newzone' && st.drag.z) {
      const z = st.drag.z, [x, y] = toS(z.x, z.y);
      h += `<rect x="${x}" y="${y}" width="${z.w * s}" height="${z.h * s}" fill="${ZONES[st.tool].fill}" stroke="var(--accent)" stroke-dasharray="4 3"/>
        <text x="${x + z.w * s / 2}" y="${y + z.h * s / 2}" class="pl-zlabel" text-anchor="middle">${Math.round(z.w)} × ${Math.round(z.h)} cm</text>`;
    }
    svg.innerHTML = h;
    $('#plTyped').textContent = st.draw && st.typed ? 'Должина: ' + st.typed + ' cm — Enter' : '';
  }

  function doorSvg(w, d, sel, ghost) {
    const s = st.view.s, { ux, uy } = wdir(w);
    const nx = d.flip ? uy : -uy, ny = d.flip ? -ux : ux;
    const cx = w.x1 + ux * d.t, cy = w.y1 + uy * d.t;
    const p1 = toS(cx - ux * d.w / 2, cy - uy * d.w / 2), p2 = toS(cx + ux * d.w / 2, cy + uy * d.w / 2);
    const leaf = toS(cx - ux * d.w / 2 + nx * d.w, cy - uy * d.w / 2 + ny * d.w);
    const r = d.w * s, col = sel ? 'var(--accent)' : '#3b3732';
    return `<g ${ghost ? 'opacity=".6"' : `data-hit="door:${d.id}"`}>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#fff" stroke-width="${Math.max(4, THICK[w.kind] * s + 2)}"/>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${leaf[0]}" y2="${leaf[1]}" stroke="${col}" stroke-width="2"/>
      <path d="M ${p2[0]} ${p2[1]} A ${r} ${r} 0 0 ${d.flip ? 0 : 1} ${leaf[0]} ${leaf[1]}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="4 3"/>
      <line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="transparent" stroke-width="16"/>
    </g>`;
  }

  function dimLabel(ax, ay, bx, by, thick, strong) {
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
    return `<text x="${mx}" y="${my}" class="pl-dim${strong ? ' strong' : ''}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mx} ${my})">${Math.round(L)}</text>`;
  }

  const isSel = (type, id) => st.sel && st.sel.type === type && st.sel.id === id;

  // ── Страничен панел: избран елемент + збир + што ќе се пополни ──
  function renderPanel() {
    const f = F();
    let h = '';
    const sel = st.sel;
    if (sel && sel.type === 'wall') {
      const w = wallById(f, sel.id);
      if (w) h += `<div class="pl-box"><h5>Ѕид</h5>
        <div class="seg pl-seg"><button type="button" class="seg-btn${w.kind === 'out' ? ' on' : ''}" data-kind="out">Надворешен</button><button type="button" class="seg-btn${w.kind === 'in' ? ' on' : ''}" data-kind="in">Внатрешен</button></div>
        <div class="field"><label>Должина <span class="unit">cm</span></label><input type="number" min="5" step="1" id="plLen" value="${Math.round(wlen(w))}"></div>
        <button class="btn danger small" id="plDel">Избриши ѕид</button></div>`;
    } else if (sel && sel.type === 'door') {
      const d = f.doors.find((x) => x.id === sel.id);
      if (d) h += `<div class="pl-box"><h5>Врата</h5>
        <div class="field"><label>Ширина <span class="unit">cm</span></label><input type="number" min="30" step="5" id="plDoorW" value="${Math.round(d.w)}"></div>
        <div style="display:flex;gap:8px;"><button class="btn ghost small" id="plFlip">⇄ Сврти</button><button class="btn danger small" id="plDel">Избриши</button></div></div>`;
    } else if (sel && sel.type === 'zone') {
      const z = f.zones.find((x) => x.id === sel.id);
      if (z) h += `<div class="pl-box"><h5>Зона</h5>
        <div class="field"><label>Тип</label><select id="plZType">${Object.entries(ZONES).map(([k, Z]) => `<option value="${k}"${z.type === k ? ' selected' : ''}>${Z.label}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Ширина <span class="unit">cm</span></label><input type="number" min="20" step="10" id="plZW" value="${Math.round(z.w)}"></div>
          <div class="field"><label>Должина <span class="unit">cm</span></label><input type="number" min="20" step="10" id="plZH" value="${Math.round(z.h)}"></div></div>
        <button class="btn danger small" id="plDel">Избриши зона</button></div>`;
    }

    const S = summary(f);
    const row = (l, v) => `<div class="pl-row"><span>${l}</span><b>${v}</b></div>`;
    h += `<div class="pl-box"><h5>${st.opts.floors === 2 ? (st.floor ? 'Втор' : 'Прв') + ' кат' : 'План'}</h5>
      ${row('Надворешни ѕидови', fmt(S.out) + ' m')}
      ${row('Внатрешни ѕидови', fmt(S.in) + ' m')}
      ${row('Површина (по оска на ѕид)', S.area != null ? fmt(S.area) + ' m²' : S.out ? '<span class="pl-warn">не е затворена</span>' : '—')}
      ${row('Врати внатрешни / влезни', S.doorsIn + ' / ' + S.doorsOut)}
      ${row('Бањи / WC', S.wc + (S.wc ? ' · ' + fmt(S.wcPerim) + ' m' : ''))}
      ${row('Ламинат / плочки', fmt(S.laminat) + ' / ' + fmt(S.plochki) + ' m²')}</div>`;

    const patch = buildPatch(), keys = Object.keys(patch);
    h += `<div class="pl-box"><h5>Ќе се пополни во калкулаторот</h5>${keys.length
      ? keys.map((k) => row(esc(st.opts.labels[k] || k), k === 'LAMINAT' || k === 'PLOCHKI' ? (patch[k] ? 'да' : 'не') : fmt(patch[k]))).join('')
      : '<p class="hint">Нацртај ѕидови, врати или зони.</p>'}</div>`;
    panel.innerHTML = h;
    wirePanel();
  }

  function wirePanel() {
    const f = F(), sel = st.sel;
    const on = (id, ev, fn) => { const el = panel.querySelector(id); if (el) el['on' + ev] = fn; };
    on('#plDel', 'click', delSel);
    panel.querySelectorAll('[data-kind]').forEach((b) => {
      b.onclick = () => { const w = wallById(f, sel.id); if (!w || w.kind === b.dataset.kind) return; snapshot(); w.kind = b.dataset.kind; refresh(); };
    });
    on('#plLen', 'change', (e) => {
      const w = wallById(f, sel.id), L = parseFloat(e.target.value);
      if (!w || !(L >= 5)) return;
      snapshot();
      // Почетокот стои, крајот (и поврзаните ѕидови) се поместува по правецот
      const { ux, uy } = wdir(w), ends = endsAt(w.x2, w.y2);
      moveEnds(ends, Math.round(w.x1 + ux * L), Math.round(w.y1 + uy * L));
      clampDoors();
      refresh();
    });
    on('#plDoorW', 'change', (e) => {
      const d = f.doors.find((x) => x.id === sel.id), v = parseFloat(e.target.value);
      if (!d || !(v >= 30)) return;
      snapshot(); d.w = v; clampDoors(); refresh();
    });
    on('#plFlip', 'click', () => { const d = f.doors.find((x) => x.id === sel.id); if (!d) return; snapshot(); d.flip = !d.flip; refresh(); });
    on('#plZType', 'change', (e) => { const z = f.zones.find((x) => x.id === sel.id); if (!z) return; snapshot(); z.type = e.target.value; refresh(); });
    for (const [id, k] of [['#plZW', 'w'], ['#plZH', 'h']]) on(id, 'change', (e) => {
      const z = f.zones.find((x) => x.id === sel.id), v = parseFloat(e.target.value);
      if (!z || !(v >= 20)) return;
      snapshot(); z[k] = v; refresh();
    });
  }

  function refresh() { render(); renderPanel(); }

  function setTool(t) {
    st.tool = t; st.draw = null; st.typed = ''; st.ghost = null;
    if (t !== 'select') st.sel = null;
    root.querySelectorAll('.pl-tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('#plHint').textContent = HINTS[t];
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    refresh();
  }

  function endChain() { st.draw = null; st.typed = ''; render(); }

  // ── Поглед ──
  function fit() {
    const f = F(), W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    const xs = [], ys = [];
    for (const w of f.walls) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
    for (const z of f.zones) { xs.push(z.x, z.x + z.w); ys.push(z.y, z.y + z.h); }
    if (!xs.length) { st.view = { s: 0.5, tx: 60, ty: 60 }; return; }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.max(0.08, Math.min(3, Math.min((W - 120) / Math.max(100, maxX - minX), (H - 120) / Math.max(100, maxY - minY))));
    st.view = { s, tx: W / 2 - (minX + maxX) / 2 * s, ty: H / 2 - (minY + maxY) / 2 * s };
  }

  // ── Настани ──
  function ptr(e) { const r = svg.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }

  function onDown(e) {
    if (e.button === 2) return;
    const { px, py } = ptr(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || st.space) { st.drag = { type: 'pan', px, py, tx: st.view.tx, ty: st.view.ty }; return; }
    const f = F(), t = st.tool;

    if (t === 'out' || t === 'in') {
      const p = drawPoint(px, py, st.draw && st.draw.from, e.shiftKey);
      if (!st.draw) { st.draw = { kind: t, from: p, start: p, cur: p }; render(); return; }
      snapshot();
      const w = addWall(t, st.draw.from, p);
      if (!w) { st.hist.pop(); return; }
      // Затворен круг или споено со постоечка точка од друга низа → крај
      if (same(p.x, p.y, st.draw.start.x, st.draw.start.y)) st.draw = null;
      else st.draw = { ...st.draw, from: p, cur: p };
      st.typed = '';
      refresh();
      return;
    }

    if (t === 'door') {
      const nw = nearWall(px, py, 18);
      if (!nw) return;
      snapshot();
      const d = { id: uid(), wall: nw.w.id, t: nw.t, w: DOOR_W[nw.w.kind] };
      f.doors.push(d);
      clampDoors();
      st.ghost = null;
      refresh();
      return;
    }

    if (ZONES[t]) {
      const m = toW(px, py);
      st.drag = { type: 'newzone', x0: snapG(m.x), y0: snapG(m.y), z: null };
      return;
    }

    // Избор
    const hit = e.target.closest('[data-hit]');
    if (!hit) { st.sel = null; st.drag = { type: 'pan', px, py, tx: st.view.tx, ty: st.view.ty }; refresh(); return; }
    const [kind, id, end] = hit.dataset.hit.split(':');
    const m = toW(px, py);
    if (kind === 'wh') {
      const w = wallById(f, id);
      snapshot();
      st.drag = { type: 'end', ends: endsAt(w['x' + end], w['y' + end]), moved: false };
      return;
    }
    if (kind === 'zh') { snapshot(); st.drag = { type: 'zsize', z: f.zones.find((z) => z.id === id) }; return; }
    if (kind === 'wall') {
      st.sel = { type: 'wall', id };
      const w = wallById(f, id);
      snapshot();
      st.drag = { type: 'wall', m0: m, a: endsAt(w.x1, w.y1), b: endsAt(w.x2, w.y2), o: { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }, moved: false };
    } else if (kind === 'door') {
      st.sel = { type: 'door', id };
      snapshot();
      st.drag = { type: 'door', d: f.doors.find((d) => d.id === id), moved: false };
    } else if (kind === 'zone') {
      st.sel = { type: 'zone', id };
      const z = f.zones.find((x) => x.id === id);
      snapshot();
      st.drag = { type: 'zone', z, m0: m, o: { x: z.x, y: z.y }, moved: false };
    }
    refresh();
  }

  function onMove(e) {
    const { px, py } = ptr(e), d = st.drag, f = F();
    if (d && d.type === 'pan') { st.view.tx = d.tx + px - d.px; st.view.ty = d.ty + py - d.py; render(); return; }
    if (st.tool === 'out' || st.tool === 'in') {
      st.cursor = drawPoint(px, py, st.draw && st.draw.from, e.shiftKey);
      if (st.draw) { st.draw.cur = st.cursor; st.typed = ''; }
      render();
      return;
    }
    if (st.tool === 'door') {
      const nw = nearWall(px, py, 18);
      st.ghost = nw ? { w: nw.w, d: { t: Math.max(DOOR_W[nw.w.kind] / 2, Math.min(wlen(nw.w) - DOOR_W[nw.w.kind] / 2, nw.t)), w: Math.min(DOOR_W[nw.w.kind], wlen(nw.w)) } } : null;
      render();
      return;
    }
    if (!d) return;
    const m = toW(px, py);
    if (d.type === 'newzone') {
      const x1 = snapG(m.x), y1 = snapG(m.y);
      d.z = { x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), w: Math.abs(x1 - d.x0), h: Math.abs(y1 - d.y0) };
    } else if (d.type === 'end') {
      const skip = new Set(d.ends.map(([w]) => w));
      const p = nearPoint(px, py, skip) || { x: snapG(m.x), y: snapG(m.y) };
      moveEnds(d.ends, p.x, p.y); clampDoors(); d.moved = true;
    } else if (d.type === 'wall') {
      const dx = snapG(m.x - d.m0.x), dy = snapG(m.y - d.m0.y);
      moveEnds(d.a, d.o.x1 + dx, d.o.y1 + dy); moveEnds(d.b, d.o.x2 + dx, d.o.y2 + dy); clampDoors(); d.moved = true;
    } else if (d.type === 'door') {
      const w = wallById(f, d.d.wall);
      if (w) { d.d.t = project(w, m.x, m.y).t; clampDoors(); d.moved = true; }
    } else if (d.type === 'zone') {
      d.z.x = d.o.x + snapG(m.x - d.m0.x); d.z.y = d.o.y + snapG(m.y - d.m0.y); d.moved = true;
    } else if (d.type === 'zsize') {
      d.z.w = Math.max(20, snapG(m.x - d.z.x)); d.z.h = Math.max(20, snapG(m.y - d.z.y));
    }
    render();
  }

  function onUp() {
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    if (d.type === 'newzone') {
      if (d.z && d.z.w >= 20 && d.z.h >= 20) {
        snapshot();
        const z = { id: uid(), type: st.tool, ...d.z };
        F().zones.push(z);
      }
      refresh();
      return;
    }
    // Клик без поместување не треба да остави чекор во историјата
    if (['wall', 'door', 'zone', 'end'].includes(d.type) && !d.moved) st.hist.pop();
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
    if (typing) return;
    if (e.key === 'Escape') { e.preventDefault(); if (st.draw) endChain(); else { st.sel = null; refresh(); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { e.preventDefault(); delSel(); return; }
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
    root.innerHTML = `<div class="modal pl-modal">
      <div class="modal-head"><h3>План на куќа</h3><div class="pl-floors" id="plFloors"></div><button class="x-close" id="plClose">×</button></div>
      <div class="pl-main">
        <div class="pl-tools">${TOOLS.map(([k, l, t]) => `<button type="button" class="pl-tool pl-t-${k}" data-tool="${k}" title="${t}"><i></i>${l}</button>`).join('')}
          <span class="pl-sep"></span>
          <button type="button" class="pl-tool" id="plUndo" title="Ctrl+Z">↶ Врати</button>
          <button type="button" class="pl-tool" id="plFit">⤢ Целиот план</button>
        </div>
        <div class="pl-canvas"><svg id="plSvg"></svg><div class="pl-typed" id="plTyped"></div></div>
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
    $('#plFit').onclick = () => { fit(); render(); };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointerleave', () => { st.cursor = null; st.ghost = null; if (!st.drag) render(); });
    svg.addEventListener('dblclick', () => { if (st.draw) endChain(); });
    svg.addEventListener('contextmenu', (e) => { e.preventDefault(); if (st.draw) endChain(); });
    svg.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    window.addEventListener('resize', () => { if (root.classList.contains('open')) render(); });
    const close = () => {
      if (st.dirty && !confirm('Да се отфрлат измените на планот?')) return;
      root.classList.remove('open');
    };
    $('#plClose').onclick = close;
    $('#plCancel').onclick = close;
    $('#plApply').onclick = () => {
      st.dirty = false;
      root.classList.remove('open');
      st.onApply(buildPatch(), JSON.parse(JSON.stringify(st.plan)));
    };
  }

  function renderFloors() {
    const box = $('#plFloors');
    if (st.opts.floors !== 2) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="seg pl-seg">${['Прв кат', 'Втор кат'].map((l, i) => `<button type="button" class="seg-btn${st.floor === i ? ' on' : ''}" data-floor="${i}">${l}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-floor]').forEach((b) => {
      b.onclick = () => { st.floor = Number(b.dataset.floor); st.sel = null; st.draw = null; renderFloors(); fit(); refresh(); };
    });
  }

  function open(plan, opts, onApply) {
    if (!root) build();
    const p = plan && Array.isArray(plan.floors) ? JSON.parse(JSON.stringify(plan)) : { v: 1, floors: [] };
    while (p.floors.length < (opts.floors || 1)) p.floors.push(emptyFloor());
    st = { plan: p, floor: 0, tool: 'out', view: { s: 0.5, tx: 60, ty: 60 }, sel: null, draw: null, drag: null, typed: '', hist: [], dirty: false, opts: Object.assign({ floors: 1, labels: {} }, opts), onApply };
    root.classList.add('open');
    renderFloors();
    // Кога има план → почни со избор; празен → со надворешен ѕид
    const hasWalls = p.floors.some((f) => f.walls.length);
    requestAnimationFrame(() => { fit(); setTool(hasWalls ? 'select' : 'out'); });
  }

  window.MDAPlanner = { open, _summary: summary, _outerArea: outerArea };
})();
