/*
 * MDA план — 3D модел на куќата од цртежот (three.js, се вчитува од CDN при прво отворање).
 *
 *   MDA3D.show(container, model)   — прикажи / освежи
 *   MDA3D.update(model)            — нов модел (камерата останува)
 *   MDA3D.hide()
 *
 * model доаѓа од MDAPlanner (сите мерки во cm): катови со ѕидови, отвори, простории,
 * тераси и скали, и кров како рамнини z = a·x + b·y + c над стреата.
 * Оски: x од планот → X, y од планот → Z, висина → Y.
 */
(function () {
  // Ако едниот CDN е блокиран, се пробува следниот
  const THREE_URLS = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
  ];
  // Текстури (Poly Haven, CC0) — public/tex; [датотека, вистинска големина во cm]
  const TEX_BASE = new URL('../tex/', document.currentScript.src).href;
  const TEX = {
    plaster: ['painted_plaster_wall', 200], roof: ['corrugated_iron_02', 270], deck: ['wood_floor_deck', 180],
    laminat: ['plank_flooring_02', 198], tiles: ['large_grey_tiles', 300], concrete: ['concrete_floor_02', 200],
    pavers: ['concrete_pavers_02', 200], grass: ['leafy_grass', 200],
  };
  const SKY = { top: 0x7fa9d6, horizon: 0xdde7ee };
  const COL = {
    wall: 0xf4f1ec, wallIn: 0xe9e4dc, slab: 0xc9c2b6, roof: 0x4b4f55, glass: 0x9cc3da, ground: 0xe8e4dc,
    laminat: 0xc9a47a, plochki: 0xdadfe2, garaza: 0xb9bcc1, deck: 0xb08657, stair: 0xd9cfbf, post: 0x8a8378,
  };

  let T = null, loading = null, holder, renderer, scene, camera, group, sun, model, needFit = true, ro;
  const show = { roof: true, upper: true };
  const cam = { theta: 0.75, phi: 1.0, dist: 3000, target: null };

  function load() {
    if (!loading) loading = (async () => {
      let err;
      for (const u of THREE_URLS) {
        try { T = await import(u); return; } catch (e) { err = e; console.warn('three.js не се вчита од', u, e); }
      }
      loading = null;
      throw err;
    })();
    return loading;
  }
  const say = (t) => { const m = holder && holder.querySelector('.p3-msg'); if (m) m.textContent = t || ''; };

  // ── Сцена ──
  function init() {
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    // Сенките се пресметуваат само кога моделот се менува (не при секое вртење на камерата)
    renderer.shadowMap.autoUpdate = false;
    // AgX: помеки, „фотографски" бои; околината дава рефлектирана светлина на сите површини
    renderer.toneMapping = T.AgXToneMapping;
    renderer.toneMappingExposure = 1.2;
    scene = new T.Scene();
    scene.background = new T.Color(SKY.horizon);
    scene.fog = new T.Fog(SKY.horizon, 1e4, 6e4);
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;
    pmrem.dispose();
    camera = new T.PerspectiveCamera(38, 1, 20, 200000);
    scene.add(new T.HemisphereLight(0xffffff, 0xa9ae96, 0.6));
    scene.add(skyDome());
    sun = new T.DirectionalLight(0xffffff, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    // Трева; малку назад по длабочина за да нема треперење со плочките околу куќата
    const gg = new T.PlaneGeometry(1e5, 1e5);
    scaleUV(gg, 1e5, 1e5);
    const ground = new T.Mesh(gg, tmat('grass', 0x8cc466, { side: T.FrontSide, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -21;
    ground.receiveShadow = true;
    scene.add(ground);
    cam.target = new T.Vector3();
    wireControls(renderer.domElement);
  }

  // Студио-соба со светли панели за околинска светлина (по three.js RoomEnvironment, без addons/import map)
  function roomEnvironment() {
    const env = new T.Scene();
    const geo = new T.BoxGeometry();
    const room = new T.Mesh(geo, new T.MeshStandardMaterial({ side: T.BackSide }));
    room.position.set(-0.757, 13.219, 0.717);
    room.scale.set(31.713, 28.305, 28.591);
    env.add(room);
    const panels = [
      [50, [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]],
      [50, [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]],
      [17, [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]],
      [43, [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]],
      [20, [3.235, 11.486, -12.541], [2.5, 2, 0.1]],
      [100, [0, 20, 0], [1, 0.1, 1]],
    ];
    for (const [k, p, s] of panels) {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial());
      m.material.color.setScalar(k);
      m.position.set(...p); m.scale.set(...s);
      env.add(m);
    }
    return env;
  }

  // Небо: голема сфера со преод од хоризонт кон сино горе (не зависи од магла и тонско мапирање)
  function skyDome() {
    const g = new T.SphereGeometry(9e4, 32, 16);
    const top = new T.Color(SKY.top), hor = new T.Color(SKY.horizon), c = new T.Color();
    const pos = g.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const k = Math.pow(Math.max(0, pos.getY(i) / 9e4), 0.6);
      c.copy(hor).lerp(top, k);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = -1;
    return m;
  }

  // Текстура од public/tex, со повторување; UV-координатите во моделот се во cm
  const texCache = {};
  function tex(name, kind, size) {
    const key = name + '_' + kind;
    if (!texCache[key]) {
      const t = new T.TextureLoader().load(TEX_BASE + key + '.webp', requestDraw, undefined, (e) => console.warn('Текстура не се вчита:', key, e));
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(1 / size, 1 / size);
      if (kind === 'color') t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texCache[key] = t;
    }
    return texCache[key];
  }
  function tmat(key, color, extra) {
    const [name, size] = TEX[key];
    return mat(color, Object.assign({ map: tex(name, 'color', size), normalMap: tex(name, 'normal', size) }, extra));
  }
  function scaleUV(g, su, sv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }

  function attach(el) {
    holder = el;
    if (!holder.querySelector('.p3-opts')) {
      holder.insertAdjacentHTML('beforeend', `<div class="p3-opts">
        <label><input type="checkbox" data-o="roof" checked> Кров</label>
        <label><input type="checkbox" data-o="upper" checked> Втор кат</label>
        <button type="button" class="btn ghost small" data-o="fit">⤢ Центрирај</button></div>
        <div class="p3-msg"></div>`);
      holder.querySelectorAll('input[data-o]').forEach((c) => { c.onchange = () => { show[c.dataset.o] = c.checked; build(); }; });
      holder.querySelector('button[data-o="fit"]').onclick = () => { needFit = true; build(); };
    }
    if (renderer && renderer.domElement.parentNode !== holder) holder.prepend(renderer.domElement);
    if (!ro) { ro = new ResizeObserver(resize); }
    ro.observe(holder);
  }

  function resize() {
    if (!renderer || !holder) return;
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  }

  function draw() {
    if (!renderer) return;
    const { theta, phi, dist, target } = cam;
    camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  // Повеќе настани во ист фрејм (влечење, тркалце) → едно цртање
  let drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }

  // Вртење (лев клик), поместување (десен клик / Shift), зум (тркалце)
  function wireControls(el) {
    let drag = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const k = cam.dist / el.clientHeight * 0.8;
        const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        cam.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else {
        cam.theta -= dx * 0.008;
        cam.phi = Math.max(0.08, Math.min(1.53, cam.phi - dy * 0.008));
      }
      requestDraw();
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.dist = Math.max(200, Math.min(50000, cam.dist * (e.deltaY < 0 ? 1 / 1.12 : 1.12)));
      requestDraw();
    }, { passive: false });
  }

  // ── Геометрија ──
  const mat = (color, extra) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0, side: T.DoubleSide }, extra));
  function mesh(geo, material, shadow = true) {
    const m = new T.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  }
  const v2 = (pts) => pts.map(([x, y]) => new T.Vector2(x, y));
  const inPoly = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const roofZ = (planes, x, y) => Math.min(...planes.map((p) => p.a * x + p.b * y + p.c));

  // Хоризонтална плоча од контура: горе на висина top, дебелина d (надолу)
  function slab(pts, top, d, material, holes = []) {
    const shape = new T.Shape(v2(pts));
    for (const h of holes) shape.holes.push(new T.Path(v2(h)));
    const g = new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, top, 0);
    return mesh(g, material);
  }

  function box(x0, x1, y0, y1, z0, z1, material) {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const g = new T.BoxGeometry(sx, sy, sz);
    // UV во cm по ѕид на кутијата (редослед: +x, −x, +y, −y, +z, −z; по 4 темиња)
    const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let i = 0; i < uv.count; i++) { const [a, b] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * a, uv.getY(i) * b); }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh(g, material);
  }

  // Ѕид: профил во рамнина на ѕидот (u по должина, v нагоре), исечени врати и прозори,
  // горниот раб следи функција (кај највисокиот кат — кровот, за затворање на забатите)
  function wall(w, base, H, topAt, material) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L < 1) return;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, nx = -uy, ny = ux, Tk = w.T;
    const e = w.kind === 'out' ? Tk / 2 : 0;
    const ops = w.ops.slice().sort((a, b) => a.t - b.t);
    const pts = [[-e, 0]];
    for (const o of ops) if (o.bottom <= 0) {
      const a = o.t - o.w / 2, b = o.t + o.w / 2;
      pts.push([a, 0], [a, o.top], [b, o.top], [b, 0]);
    }
    pts.push([L + e, 0]);
    const tops = topAt ? topAt(w, ux, uy, -e, L + e) : [[L + e, H], [-e, H]];
    pts.push(...tops);
    const shape = new T.Shape(v2(pts));
    for (const o of ops) if (o.bottom > 0) {
      const a = o.t - o.w / 2, b = o.t + o.w / 2;
      shape.holes.push(new T.Path(v2([[a, o.bottom], [b, o.bottom], [b, o.top], [a, o.top]])));
    }
    const g = new T.ExtrudeGeometry(shape, { depth: Tk, bevelEnabled: false });
    const m4 = new T.Matrix4().makeBasis(new T.Vector3(ux, 0, uy), new T.Vector3(0, 1, 0), new T.Vector3(nx, 0, ny));
    m4.setPosition(w.x1 - nx * Tk / 2, base, w.y1 - ny * Tk / 2);
    g.applyMatrix4(m4);
    mesh(g, material);
    // Стакло во прозорите
    for (const o of ops) if (o.glass) {
      const gl = new T.BoxGeometry(o.w, o.top - o.bottom, 2);
      gl.rotateY(Math.atan2(-uy, ux));
      gl.translate(w.x1 + ux * o.t, base + (o.bottom + o.top) / 2, w.y1 + uy * o.t);
      mesh(gl, glassMat, false);
    }
  }

  // Горен раб на надворешен ѕид под кров: H + кров, со точки каде рамнините се сечат
  function roofTop(parts, H) {
    return (w, ux, uy, u0, u1) => {
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      const part = parts.find((p) => inPoly(p.outline, mx, my));
      if (!part) return [[u1, H], [u0, H]];
      const at = (u) => [w.x1 + ux * u, w.y1 + uy * u];
      const us = [u0, u1];
      const P = part.planes;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const da = P[i].a - P[j].a, db = P[i].b - P[j].b, dc = P[i].c - P[j].c;
        const slope = da * ux + db * uy;
        if (Math.abs(slope) < 1e-9) continue;
        const u = -(da * w.x1 + db * w.y1 + dc) / slope;
        if (u > u0 && u < u1) us.push(u);
      }
      us.sort((a, b) => b - a);   // од крајот кон почетокот (профилот е затворен)
      return us.map((u) => { const [x, y] = at(u); return [u, H + roofZ(P, x, y)]; });
    };
  }

  // Кров: секој дел е рамна површина; плус челен лим по работ
  function roof(r, Htop) {
    const RT = 14;  // cm — дебелина на кровот за приказ
    for (const part of r.parts) {
      if (r.flat) { slab(part.outline, Htop + 22, 22, roofMat); continue; }
      for (const pc of part.pieces) {
        const faces = T.ShapeUtils.triangulateShape(v2(pc), []);
        const pos = [], uvs = [];
        for (const f of faces) {
          // Рамнината на овој триаголник; UV: u попречно, v по падот (ребрата на лимот одат надолу)
          const cx = (pc[f[0]][0] + pc[f[1]][0] + pc[f[2]][0]) / 3, cy = (pc[f[0]][1] + pc[f[1]][1] + pc[f[2]][1]) / 3;
          const p = part.planes.reduce((m, q) => (q.a * cx + q.b * cy + q.c < m.a * cx + m.b * cy + m.c ? q : m));
          const gl = Math.hypot(p.a, p.b), dx = gl > 1e-6 ? p.a / gl : 1, dy = gl > 1e-6 ? p.b / gl : 0, st = Math.sqrt(1 + gl * gl);
          for (const k of f) {
            const [x, y] = pc[k];
            pos.push(x, Htop + roofZ(part.planes, x, y) + RT, y);
            uvs.push(-dy * x + dx * y, (dx * x + dy * y) * st);
          }
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        g.computeVertexNormals();
        mesh(g, roofMat);
      }
      // Челен раб: вертикална лента по контурата
      const pos = [], O = part.outline;
      for (let i = 0; i < O.length; i++) {
        const [ax, ay] = O[i], [bx, by] = O[(i + 1) % O.length];
        const za = Htop + roofZ(part.planes, ax, ay), zb = Htop + roofZ(part.planes, bx, by);
        pos.push(ax, za, ay, bx, zb, by, bx, zb + RT, by, ax, za, ay, bx, zb + RT, by, ax, za + RT, ay);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      mesh(g, fasciaMat);
    }
  }

  function stairs(x, base, H) {
    const n = x.steps, d = (x.dir % 2 ? x.h : x.w) / n;
    for (let k = 0; k < n; k++) {
      const top = base + H * (k + 1) / n;
      if (x.dir === 0) box(x.x + k * d, x.x + (k + 1) * d, base, top, x.y, x.y + x.h, stairMat);
      if (x.dir === 2) box(x.x + x.w - (k + 1) * d, x.x + x.w - k * d, base, top, x.y, x.y + x.h, stairMat);
      if (x.dir === 1) box(x.x, x.x + x.w, base, top, x.y + k * d, x.y + (k + 1) * d, stairMat);
      if (x.dir === 3) box(x.x, x.x + x.w, base, top, x.y + x.h - (k + 1) * d, x.y + x.h - k * d, stairMat);
    }
  }

  function terrace(t, base, H) {
    const top = base;
    box(t.x, t.x + t.w, top - 18, top, t.y, t.y + t.h, deckMat);
    if (!t.covered) return;
    const p = 12, y1 = top + H;
    for (const [cx, cy] of [[t.x, t.y], [t.x + t.w - p, t.y], [t.x, t.y + t.h - p], [t.x + t.w - p, t.y + t.h - p]]) box(cx, cx + p, top, y1, cy, cy + p, postMat);
    box(t.x - 10, t.x + t.w + 10, y1, y1 + 16, t.y - 10, t.y + t.h + 10, roofMat);
  }

  let wallMat, wallInMat, slabMat, roofMat, fasciaMat, glassMat, deckMat, stairMat, postMat, floorMats, paverMat;
  function materials() {
    // Бојата се множи со текстурата; >1 ја посветлува (малтерот во текстурата е сив)
    wallMat = tmat('plaster', new T.Color().setScalar(1.5), { normalScale: new T.Vector2(0.5, 0.5) });
    wallInMat = tmat('plaster', new T.Color(0xf2ece2).multiplyScalar(1.2), { normalScale: new T.Vector2(0.4, 0.4) });
    slabMat = tmat('concrete', 0xd6d2ca);
    roofMat = tmat('roof', 0xffffff, { roughness: 0.5, metalness: 0.35 });
    fasciaMat = mat(0x3c4046, { roughness: 0.5, metalness: 0.35 });
    glassMat = mat(COL.glass, { transparent: true, opacity: 0.35, roughness: 0.05 });
    deckMat = tmat('deck', 0xd2bca4); stairMat = tmat('laminat', 0xe2d2bc); postMat = mat(COL.post);
    floorMats = { laminat: tmat('laminat', 0xd4c8b8), plochki: tmat('tiles', new T.Color().setScalar(1.15)), garaza: tmat('concrete', 0xffffff) };
    paverMat = tmat('pavers', new T.Color(0xece6dc).multiplyScalar(1.2), { roughness: 0.95 });
  }

  function build() {
    if (!T || !scene || !model) return;
    try { buildScene(); } catch (e) {
      console.error('3D грешка', e);
      say('3D моделот не може да се изгради: ' + e.message);
    }
  }

  function buildScene() {
    if (group) { scene.remove(group); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    group = new T.Group();
    scene.add(group);
    const fl = model.floors, r = model.roof;
    const shown = fl.filter((_, i) => i === 0 || show.upper);
    shown.forEach((f, i) => {
      // Плоча; над скалите од долниот кат има отвор
      const holes = i ? fl[i - 1].stairs.map((x) => [[x.x, x.y], [x.x + x.w, x.y], [x.x + x.w, x.y + x.h], [x.x, x.y + x.h]]) : [];
      for (const lp of f.loops) slab(lp, f.base, 20, slabMat, holes);
      for (const rm of f.rooms) {
        const g = new T.ShapeGeometry(new T.Shape(v2(rm.pts)));
        g.rotateX(Math.PI / 2);
        g.translate(0, f.base + 0.6, 0);
        mesh(g, floorMats[rm.floor] || floorMats.laminat, false);
      }
      const isTop = r && i === r.top && show.roof;
      for (const w of f.walls) wall(w, f.base, f.h, isTop && w.kind === 'out' ? roofTop(r.parts, f.h) : null, w.kind === 'out' ? wallMat : wallInMat);
      for (const x of f.stairs) stairs(x, f.base, f.h);
      for (const t of f.terraces) terrace(t, f.base, f.h);
    });
    // Рамен покрив над делот од првиот кат што го нема вториот (без кров и втор кат → отворено, за поглед внатре)
    if (fl.length === 2 && (show.upper || show.roof)) {
      const f0 = fl[0];
      for (const lp of f0.loops) slab(lp, f0.base + f0.h - 0.5, 20, show.upper ? slabMat : roofMat);
    }
    if (r && show.roof && (r.top === 0 || show.upper)) roof(r, fl[r.top].base + fl[r.top].h);

    // Сонце и сенки според големината на моделот
    const bb = new T.Box3().setFromObject(group);
    const empty = bb.isEmpty();
    say(empty ? 'Нема што да се прикаже — нацртај надворешни ѕидови во 2D планот.' : '');
    if (empty) { bb.set(new T.Vector3(0, 0, 0), new T.Vector3(1000, 300, 1000)); needFit = true; }
    const c = bb.getCenter(new T.Vector3()), size = bb.getSize(new T.Vector3()), R = Math.max(size.x, size.y, size.z, 500);
    // Плочки околу куќата (по bb, пред да се додадат — не влијаат на центрирањето)
    if (!empty) {
      const m = 120, x0 = bb.min.x - m, x1 = bb.max.x + m, z0 = bb.min.z - m, z1 = bb.max.z + m;
      const pg = new T.ShapeGeometry(new T.Shape(v2([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])));
      pg.rotateX(Math.PI / 2);
      pg.translate(0, -18, 0);
      mesh(pg, paverMat, false);
    }
    // Тревата се топи во хоризонтот подалеку од куќата
    scene.fog.near = Math.max(R * 6, 6000);
    scene.fog.far = scene.fog.near * 5;
    // Сонце од предна десна страна во однос на почетната камера — видливите ѕидови се осветлени
    sun.position.set(c.x + R * 1.3, c.y + R * 1.6, c.z + R * 0.5);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = -R * 1.5; sc.right = R * 1.5; sc.top = R * 1.5; sc.bottom = -R * 1.5; sc.near = 10; sc.far = R * 6;
    sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    if (needFit && !empty) {
      cam.target.copy(c);
      cam.dist = R * 2.1;
      cam.theta = 0.75; cam.phi = 1.0;
      needFit = false;
    }
    resize();
    draw();
  }

  async function showModel(el, m) {
    model = m;
    attach(el);
    holder.classList.add('on');
    const msg = holder.querySelector('.p3-msg');
    if (!renderer) {
      msg.textContent = 'Се вчитува 3D…';
      try { await load(); } catch (e) { msg.textContent = '3D приказот не може да се вчита (three.js од CDN) — проверете ја интернет врската или блокаторот на реклами.'; return; }
      try { init(); } catch (e) {
        console.error('WebGL', e);
        renderer = null;
        msg.textContent = 'Прелистувачот не дозволува WebGL (3D графика). Вклучете „хардверско забрзување" во подесувањата на прелистувачот и обидете се повторно.';
        return;
      }
      msg.textContent = '';
      materials();
      attach(el);
      needFit = true;
    }
    build();
  }

  window.MDA3D = {
    show: showModel,
    update(m) { model = m; build(); },
    hide() { if (holder) holder.classList.remove('on'); if (ro && holder) ro.unobserve(holder); needFit = true; },
  };
})();
