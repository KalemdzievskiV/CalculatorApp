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
  // Вградени текстури (Poly Haven, CC0) — public/tex/<име>_color.webp и _normal.webp
  const TEX_BASE = new URL('../tex/', document.currentScript.src).href;
  const SKY = { top: 0x7fa9d6, horizon: 0xdde7ee };
  const COL = {
    wall: 0xf4f1ec, wallIn: 0xe9e4dc, slab: 0xc9c2b6, roof: 0x4b4f55, glass: 0x9cc3da, ground: 0xe8e4dc,
    laminat: 0xc9a47a, plochki: 0xdadfe2, garaza: 0xb9bcc1, deck: 0xb08657, stair: 0xd9cfbf, post: 0x8a8378,
  };

  // ── 3D материјали: библиотека + кој дел од куќата кој материјал го користи ──
  // Се уредуваат во админ → „3D материјали“. tex: '' (само боја), име од public/tex, или 'u:<id>' (качена).
  // size = колку cm површина покрива една слика; bright ја множи бојата (>1 посветлува); bump = јачина на релјефот.
  const M = (id, name, tex, size, color, o = {}) => Object.assign({ id, name, tex, normal: !!tex, size, color, bright: 1, rough: 0.9, metal: 0, bump: 1 }, o);
  const DEFAULTS = {
    library: [
      M('plaster_white', 'Малтер бел (фасада)', 'painted_plaster_wall', 200, '#ffffff', { bright: 1.5, bump: 0.5 }),
      M('plaster_in', 'Малтер внатрешен', 'painted_plaster_wall', 200, '#f2ece2', { bright: 1.2, bump: 0.4 }),
      M('plaster_dark', 'Малтер темен (сокла)', 'painted_plaster_wall', 200, '#5f6369', { bump: 0.6 }),
      M('roof_metal', 'Лим брановиден', 'corrugated_iron_02', 270, '#ffffff', { rough: 0.5, metal: 0.35 }),
      M('metal_dark', 'Метал антрацит', '', 200, '#3c4046', { rough: 0.5, metal: 0.35 }),
      M('gutter', 'Олук', '', 200, '#4e5258', { rough: 0.45, metal: 0.4 }),
      M('concrete_light', 'Бетон светол', 'concrete_floor_02', 200, '#d6d2ca'),
      M('concrete_base', 'Бетон (плоча)', 'concrete_floor_02', 200, '#b8b2a8', { rough: 0.95 }),
      M('concrete_garage', 'Бетон (гаража)', 'concrete_floor_02', 200, '#ffffff'),
      M('laminat', 'Ламинат', 'plank_flooring_02', 198, '#d4c8b8'),
      M('stair_wood', 'Дрво светло (скали)', 'plank_flooring_02', 198, '#e2d2bc'),
      M('tiles', 'Плочки сиви', 'large_grey_tiles', 300, '#ffffff', { bright: 1.15 }),
      M('deck', 'Дрвена тераса', 'wood_floor_deck', 180, '#d2bca4'),
      M('pvc_anthracite', 'ПВЦ антрацит', '', 200, '#3a3e44', { rough: 0.6 }),
      M('door_out', 'Блиндирана врата темна', '', 200, '#34383e', { rough: 0.45, metal: 0.2 }),
      M('door_in', 'Внатрешна врата бела', '', 200, '#f2efe9', { rough: 0.6 }),
      M('pavers', 'Бехатон', 'concrete_pavers_02', 200, '#ece6dc', { bright: 1.2, rough: 0.95 }),
      M('grass', 'Трева', 'leafy_grass', 200, '#8cc466', { rough: 1 }),
    ],
    slots: {
      wallOut: 'plaster_white', wallOutIn: 'plaster_in', wallIn: 'plaster_in', plinth: 'plaster_dark', roof: 'roof_metal', fascia: 'metal_dark', gutter: 'gutter',
      slab: 'concrete_light', baseSlab: 'concrete_base', laminat: 'laminat', plochki: 'tiles', garaza: 'concrete_garage',
      deck: 'deck', stair: 'stair_wood', frame: 'pvc_anthracite', doorOut: 'door_out', doorIn: 'door_in', pavers: 'pavers', grass: 'grass',
    },
    rules: [],
  };
  const SLOTS = [
    ['wallOut', 'Надворешни ѕидови — надвор (фасада)'], ['wallOutIn', 'Надворешни ѕидови — внатре'], ['plinth', 'Сокла'], ['wallIn', 'Внатрешни (преградни) ѕидови'],
    ['roof', 'Кров'], ['fascia', 'Опшивка на кров'], ['gutter', 'Олуци'],
    ['laminat', 'Под — ламинат'], ['plochki', 'Под — плочки'], ['garaza', 'Под — гаража'],
    ['slab', 'Меѓукатна плоча'], ['baseSlab', 'Бетонска плоча'], ['stair', 'Скали'], ['deck', 'Тераса'],
    ['frame', 'ПВЦ дограма'], ['doorOut', 'Влезна врата'], ['doorIn', 'Внатрешни врати'],
    ['pavers', 'Плочки околу куќата'], ['grass', 'Трева'],
  ];
  // URL на сликата (color / normal) за материјал
  const texUrl = (d, kind) => (d.tex.startsWith('u:') ? `/utex/${d.tex.slice(2)}_${kind}.webp${d.v ? '?v=' + d.v : ''}` : `${TEX_BASE}${d.tex}_${kind}.webp`);

  let ground, matKey = '', previewR = null;
  let T = null, loading = null, holder, renderer, scene, camera, group, sun, model, needFit = true, ro;
  // mode: 'out' = однадвор (со кров), 'in' = одвнатре (без кров, до катот level, со натписи)
  const show = { mode: 'out', level: 0, furniture: true, garden: true };
  let labels = [];
  try { const s = JSON.parse(localStorage.getItem('mda3dShow') || '{}'); if (typeof s.furniture === 'boolean') show.furniture = s.furniture; if (typeof s.garden === 'boolean') show.garden = s.garden; } catch (e) { /* без меморија */ }
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
    ground = new T.Mesh(gg);
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
  function tex(url, kind, size, onLoad = requestDraw) {
    const key = url + '|' + size;
    if (!texCache[key]) {
      const t = new T.TextureLoader().load(url, onLoad, undefined, (e) => console.warn('Текстура не се вчита:', url, e));
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(1 / size, 1 / size);
      if (kind === 'color') t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = Math.min(8, (renderer || previewR).capabilities.getMaxAnisotropy());
      texCache[key] = t;
    }
    return texCache[key];
  }
  // Материјал од опис во библиотеката
  function defMat(d, extra, onLoad) {
    const o = { roughness: +d.rough, metalness: +d.metal };
    if (d.tex) {
      o.map = tex(texUrl(d, 'color'), 'color', +d.size || 200, onLoad);
      if (d.normal) {
        o.normalMap = tex(texUrl(d, 'normal'), 'normal', +d.size || 200, onLoad);
        o.normalScale = new T.Vector2(+d.bump, +d.bump);
      }
    }
    return mat(new T.Color(d.color || '#ffffff').multiplyScalar(+d.bright || 1), Object.assign(o, extra));
  }
  function scaleUV(g, su, sv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }

  function attach(el) {
    holder = el;
    if (!holder.querySelector('.p3-opts')) {
      holder.insertAdjacentHTML('beforeend', `<div class="p3-labels"></div><div class="p3-opts">
        <div class="seg pl-seg"><button type="button" class="seg-btn on" data-mode="out">Однадвор</button><button type="button" class="seg-btn" data-mode="in">Одвнатре</button></div>
        <div class="seg pl-seg p3-level"><button type="button" class="seg-btn on" data-level="0">Прв кат</button><button type="button" class="seg-btn" data-level="1">Втор кат</button></div>
        <label><input type="checkbox" data-o="furniture"${show.furniture ? ' checked' : ''}> Мебел</label>
        <label><input type="checkbox" data-o="garden"${show.garden ? ' checked' : ''}> Двор</label>
        <button type="button" class="btn ghost small" data-o="fit">⤢ Центрирај</button></div>
        <div class="p3-msg"></div>`);
      holder.querySelectorAll('input[data-o]').forEach((c) => {
        c.onchange = () => {
          show[c.dataset.o] = c.checked;
          try { localStorage.setItem('mda3dShow', JSON.stringify({ furniture: show.furniture, garden: show.garden })); } catch (e) { /* без меморија */ }
          build();
        };
      });
      holder.querySelectorAll('[data-mode]').forEach((b) => {
        b.onclick = () => {
          if (show.mode === b.dataset.mode) return;
          show.mode = b.dataset.mode;
          // Одвнатре: поглед повеќе одозгора, на највисокиот кат
          if (show.mode === 'in') { cam.phi = Math.min(cam.phi, 0.62); show.level = model ? model.floors.length - 1 : 0; } else cam.phi = Math.max(cam.phi, 0.95);
          build();
        };
      });
      holder.querySelectorAll('[data-level]').forEach((b) => { b.onclick = () => { show.level = +b.dataset.level; build(); }; });
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
    placeLabels();
  }

  // Натписи на просториите (HTML над платното), само во погледот одвнатре
  function placeLabels() {
    const box = holder && holder.querySelector('.p3-labels');
    if (!box) return;
    const list = show.mode === 'in' ? labels : [];
    if (box.childElementCount !== list.length || box.dataset.key !== list.map((l) => l.text).join('|')) {
      box.innerHTML = list.map((l) => `<span class="p3-label">${String(l.text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span>`).join('');
      box.dataset.key = list.map((l) => l.text).join('|');
    }
    const w = holder.clientWidth, h = holder.clientHeight, v = new T.Vector3();
    list.forEach((l, i) => {
      const el = box.children[i];
      v.set(l.x, l.y, l.z).project(camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    });
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
    return mesh(boxGeo(x0, x1, y0, y1, z0, z1), material);
  }
  function boxGeo(x0, x1, y0, y1, z0, z1) {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const g = new T.BoxGeometry(sx, sy, sz);
    // UV во cm по ѕид на кутијата (редослед: +x, −x, +y, −y, +z, −z; по 4 темиња)
    const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let i = 0; i < uv.count; i++) { const [a, b] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * a, uv.getY(i) * b); }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }

  // Ѕид: профил во рамнина на ѕидот (u по должина, v нагоре), исечени врати и прозори,
  // горниот раб следи функција (кај највисокиот кат — кровот, за затворање на забатите)
  function wall(w, base, H, topAt, material, opts = {}) {
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
    // Надворешна страна: +1 ако n гледа нанадвор, −1 ако навнатре, 0 кај внатрешни ѕидови
    let s = 0;
    if (w.kind === 'out') {
      const px = (w.x1 + w.x2) / 2 + nx * Tk, py = (w.y1 + w.y2) / 2 + ny * Tk;
      s = (opts.loops || []).some((lp) => inPoly(lp, px, py)) ? -1 : 1;
    }
    // Надворешен ѕид: двете големи страни добиваат посебен материјал (фасада надвор, малтер внатре).
    // Капаците на ExtrudeGeometry се една група: прво страната z=0, па z=Tk — се делат на две.
    let faceMat = material;
    if (s && opts.inMat && g.groups.length === 2) {
      const pos = g.attributes.position, [caps, sides] = g.groups;
      let k = caps.start;
      while (k < caps.start + caps.count && pos.getZ(k) < Tk / 2) k += 3;
      g.clearGroups();
      g.addGroup(caps.start, k - caps.start, 0);                 // страна −n
      g.addGroup(k, caps.start + caps.count - k, 2);             // страна +n
      g.addGroup(sides.start, sides.count, 1);                   // рабови и шпалетни
      faceMat = s > 0 ? [opts.inMat, material, material] : [material, material, opts.inMat];
    }
    const m4 = new T.Matrix4().makeBasis(new T.Vector3(ux, 0, uy), new T.Vector3(0, 1, 0), new T.Vector3(nx, 0, ny));
    m4.setPosition(w.x1 - nx * Tk / 2, base, w.y1 - ny * Tk / 2);
    g.applyMatrix4(m4);
    mesh(g, faceMat);

    // Детали во рамнина на ѕидот: u по должина, v нагоре од base, n од средината на ѕидот
    const L4 = new T.Matrix4().makeBasis(new T.Vector3(ux, 0, uy), new T.Vector3(0, 1, 0), new T.Vector3(nx, 0, ny));
    L4.setPosition(w.x1, base, w.y1);
    const lb = (u0, u1, v0, v1, n0, n1, m, shadow = true) => mesh(boxGeo(u0, u1, v0, v1, n0, n1).applyMatrix4(L4), m, shadow);
    const P = 7, D = Math.min(8, Tk - 2);  // профил на рамка (cm) и длабочина
    for (const o of ops) {
      const a = o.t - o.w / 2, b = o.t + o.w / 2, door = !o.glass;
      const fm = door && !s ? doorFrameInMat : frameMat;
      lb(a, a + P, o.bottom, o.top, -D / 2, D / 2, fm);
      lb(b - P, b, o.bottom, o.top, -D / 2, D / 2, fm);
      lb(a + P, b - P, o.top - P, o.top, -D / 2, D / 2, fm);
      if (!door) {
        lb(a + P, b - P, o.bottom, o.bottom + P, -D / 2, D / 2, fm);
        lb(a + P, b - P, o.bottom + P, o.top - P, -1, 1, glassMat, false);
        if (o.w > 130) lb(o.t - 3, o.t + 3, o.bottom + P, o.top - P, -D / 2 + 1, D / 2 - 1, fm);  // средна вертикала
        // Надворешна алуминиумска клупчица
        if (o.bottom > 0 && s) {
          const n0 = s * (Tk / 2 - 10), n1 = s * (Tk / 2 + 5);
          lb(a - 4, b + 4, o.bottom - 4, o.bottom, Math.min(n0, n1), Math.max(n0, n1), sillMat);
        }
      } else {
        lb(a + P, b - P, 0, o.top - P, -2, 2, s ? doorOutMat : doorInMat);
        const hu = b - P - 12;
        lb(hu - 7, hu + 7, 100, 104, -7, 7, handleMat);
      }
    }

    // Темна сокла по дното на надворешните ѕидови на приземјето (прекината кај вратите)
    if (opts.ground && s) {
      const n0 = s > 0 ? Tk / 2 - 0.5 : -Tk / 2 - 1.5, n1 = s > 0 ? Tk / 2 + 1.5 : -Tk / 2 + 0.5, PH = 30;
      let u = -e - 1.5;
      for (const o of ops) if (o.bottom <= 0) {
        const a = o.t - o.w / 2, b = o.t + o.w / 2;
        if (a > u) lb(u, a, -20, PH, n0, n1, plinthMat);
        lb(a, b, -20, 0, n0, n1, plinthMat);
        u = b;
      }
      lb(u, L + e + 1.5, -20, PH, n0, n1, plinthMat);
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

  // Горен раб на ѕид од првиот кат под еднокосниот кров: под кровот ја следи косината, другаде H.
  // Каде ѕидот излегува од контурата на кровот има скок (вертикален раб).
  function lowTop(parts, H) {
    return (w, ux, uy, u0, u1) => {
      const at = (u) => [w.x1 + ux * u, w.y1 + uy * u];
      const val = (u) => {
        const [x, y] = at(u), p = parts.find((q) => inPoly(q.outline, x, y));
        return p ? H + roofZ(p.planes, x, y) : H;
      };
      const us = [u0, u1];
      for (const p of parts) {
        const O = p.outline;
        for (let i = 0; i < O.length; i++) {
          const [ax, ay] = O[i], [bx, by] = O[(i + 1) % O.length], ex = bx - ax, ey = by - ay;
          const den = ux * ey - uy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const u = ((ax - w.x1) * ey - (ay - w.y1) * ex) / den, k = ((ax - w.x1) * uy - (ay - w.y1) * ux) / den;
          if (u > u0 + 0.5 && u < u1 - 0.5 && k >= 0 && k <= 1) us.push(u);
        }
      }
      us.sort((a, b) => b - a);   // од крајот кон почетокот
      const out = [];
      const add = (u, z) => { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - u) > 0.01 || Math.abs(l[1] - z) > 0.01) out.push([u, z]); };
      us.forEach((u, i) => {
        if (i > 0) add(u, val(u + 0.5));
        if (i < us.length - 1) add(u, val(u - 0.5));
      });
      return out;
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
      gutters(part, Htop);
    }
  }

  // Олук по секој долен (хоризонтален) раб на кровот: кровот од тој раб се крева навнатре
  function gutters(part, Htop) {
    const O = part.outline, R = 7;
    for (let i = 0; i < O.length; i++) {
      const [ax, ay] = O[i], [bx, by] = O[(i + 1) % O.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 30) continue;
      const za = roofZ(part.planes, ax, ay), zb = roofZ(part.planes, bx, by);
      if (Math.abs(za - zb) > 0.5) continue;
      const dx = (bx - ax) / len, dy = (by - ay) / len, mx = (ax + bx) / 2, my = (ay + by) / 2;
      let nx = -dy, ny = dx;  // нормала навнатре
      if (!inPoly(O, mx + nx * 20, my + ny * 20)) { nx = -nx; ny = -ny; }
      if (roofZ(part.planes, mx + nx * 20, my + ny * 20) < za + 1) continue;
      const g = new T.CylinderGeometry(R, R, len, 12);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.atan2(-dy, dx));
      g.translate(mx - nx * (R + 1), Htop + za - 2, my - ny * (R + 1));
      mesh(g, gutterMat);
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

  let wallMat, wallOutInMat, wallInMat, slabMat, baseSlabMat, roofMat, fasciaMat, glassMat, deckMat, stairMat, postMat, floorMats, paverMat;
  let frameMat, doorFrameInMat, doorOutMat, doorInMat, handleMat, sillMat, plinthMat, gutterMat;
  // Ги гради материјалите од поставките (model.mat3d или стандардните); повторно само кога се менуваат
  function materials() {
    const cfg = (model && model.mat3d) || DEFAULTS;
    const key = JSON.stringify(cfg);
    if (key === matKey && wallMat) return;
    matKey = key;
    const lib = {};
    for (const d of DEFAULTS.library) lib[d.id] = d;
    for (const d of cfg.library || []) lib[d.id] = d;
    const at = (slot, extra) => defMat(lib[(cfg.slots || {})[slot]] || lib[DEFAULTS.slots[slot]], extra);
    wallMat = at('wallOut'); wallOutInMat = at('wallOutIn'); wallInMat = at('wallIn'); plinthMat = at('plinth');
    roofMat = at('roof'); fasciaMat = at('fascia'); gutterMat = at('gutter');
    slabMat = at('slab'); baseSlabMat = at('baseSlab');
    floorMats = { laminat: at('laminat'), plochki: at('plochki'), garaza: at('garaza') };
    deckMat = at('deck'); stairMat = at('stair');
    frameMat = at('frame'); doorOutMat = at('doorOut'); doorInMat = at('doorIn');
    paverMat = at('pavers');
    if (ground) ground.material = at('grass', { side: T.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // Ситни делови — не се уредуваат
    glassMat = mat(COL.glass, { transparent: true, opacity: 0.35, roughness: 0.05 });
    postMat = mat(COL.post);
    doorFrameInMat = mat(0xeeebe5, { roughness: 0.7 });
    handleMat = mat(0xc9ccd0, { roughness: 0.3, metalness: 0.8 });
    sillMat = mat(0xb4b8bc, { roughness: 0.4, metalness: 0.5 });
  }

  function build() {
    if (!T || !scene || !model) return;
    try { materials(); buildScene(); } catch (e) {
      console.error('3D грешка', e);
      say('3D моделот не може да се изгради: ' + e.message);
    }
  }

  function buildScene() {
    if (group) { scene.remove(group); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    group = new T.Group();
    scene.add(group);
    const fl = model.floors, r = model.roof, inside = show.mode === 'in';
    const level = Math.min(show.level, fl.length - 1);
    // Одвнатре: катовите до избраниот, без кров
    const shown = inside ? fl.slice(0, level + 1) : fl;
    const roofOn = !inside;
    labels = [];
    if (holder) {
      const lv = holder.querySelector('.p3-level');
      lv.style.display = inside && fl.length === 2 ? '' : 'none';
      lv.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', +b.dataset.level === level));
      holder.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === show.mode));
    }
    // Бетонска плоча: горе малку под подот на куќата (без треперење), дебелина 20 cm над тревата
    for (const lp of model.slab || []) slab(lp, -2, 20, baseSlabMat);
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
      const isTop = r && i === r.top && roofOn;
      const lowR = i === 0 && model.lowRoof && roofOn ? lowTop(model.lowRoof.parts, f.h) : null;
      for (const w of f.walls) wall(w, f.base, f.h, isTop && w.kind === 'out' ? roofTop(r.parts, f.h) : lowR && w.kind === 'out' ? lowR : null, w.kind === 'out' ? wallMat : wallInMat, { loops: f.loops, ground: i === 0, inMat: wallOutInMat });
      for (const x of f.stairs) stairs(x, f.base, f.h);
      for (const t of f.terraces) terrace(t, f.base, f.h);
      // Мебел по просториите; натписите се за најгорниот прикажан кат
      if (window.MDA3DProps) {
        const lb = window.MDA3DProps.furnish(T, f, (o) => group.add(o), show.furniture);
        if (i === shown.length - 1) labels = lb;
      }
    });
    // Плоча над првиот кат (под вториот кат, и рамен покрив над делот без втор кат)
    if (fl.length === 2 && shown.length === 2) {
      const f0 = fl[0];
      for (const lp of f0.loops) slab(lp, f0.base + f0.h - 0.5, 20, slabMat);
    }
    if (r && roofOn) roof(r, fl[r.top].base + fl[r.top].h);
    // Еднокосен кров над деловите од првиот кат без ништо над нив
    if (model.lowRoof && roofOn) roof(model.lowRoof, fl[0].base + fl[0].h);

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
    // Двор: ограда, патека до влезот, дрвја, базен, огниште (околу целата куќа со кровот)
    let Rs = R;
    if (!empty && show.garden && window.MDA3DProps) {
      const P = window.MDA3DProps.garden(T, { house: houseRect(), door: frontDoor(), paverMat }, (o) => group.add(o));
      Rs = Math.max(R, (P.x1 - P.x0) / 2, (P.y1 - P.y0) / 2) * 1.05;
    }
    // Тревата се топи во хоризонтот подалеку од куќата
    scene.fog.near = Math.max(Rs * 4, R * 6, 6000);
    scene.fog.far = scene.fog.near * 5;
    // Сонце од предна десна страна во однос на почетната камера — видливите ѕидови се осветлени
    sun.position.set(c.x + Rs * 1.3, c.y + Rs * 1.6, c.z + Rs * 0.5);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = -Rs * 1.5; sc.right = Rs * 1.5; sc.top = Rs * 1.5; sc.bottom = -Rs * 1.5; sc.near = 10; sc.far = Rs * 6;
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

  // Опфат на куќата во план (ѕидови, тераси, плоча, кров со препуст), за дворот
  function houseRect() {
    const xs = [], ys = [];
    const pt = (x, y) => { xs.push(x); ys.push(y); };
    for (const f of model.floors) {
      for (const w of f.walls) { pt(w.x1, w.y1); pt(w.x2, w.y2); }
      for (const t of f.terraces) { pt(t.x, t.y); pt(t.x + t.w, t.y + t.h); }
    }
    for (const lp of model.slab || []) lp.forEach(([x, y]) => pt(x, y));
    for (const R of [model.roof, model.lowRoof]) if (R) for (const p of R.parts) p.outline.forEach(([x, y]) => pt(x, y));
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  // Влезна врата: прва врата (не стаклена) на надворешен ѕид од приземјето, со нормала нанадвор
  function frontDoor() {
    const f = model.floors[0];
    for (const w of f.walls) {
      if (w.kind !== 'out') continue;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const o = w.ops.find((x) => !x.glass);
      if (!o || L < 1) continue;
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, x = w.x1 + ux * o.t, y = w.y1 + uy * o.t;
      let nx = -uy, ny = ux;
      if (f.loops.some((lp) => inPoly(lp, x + nx * 30, y + ny * 30))) { nx = -nx; ny = -ny; }
      return { x, y, nx, ny };
    }
    return null;
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

  // ── Преглед на еден материјал (админ → 3D материјали): плоча 3×3 m, коцка 1 m и топка ──
  let pv = null;
  async function preview(el, d) {
    try { await load(); } catch (e) { el.textContent = '3D прегледот не може да се вчита.'; return; }
    if (!pv) {
      try { previewR = new T.WebGLRenderer({ antialias: true }); } catch (e) { el.textContent = 'WebGL не е достапен.'; return; }
      previewR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      previewR.toneMapping = T.AgXToneMapping;
      previewR.toneMappingExposure = 1.2;
      const sc = new T.Scene();
      sc.background = new T.Color(SKY.horizon);
      const pm = new T.PMREMGenerator(previewR);
      sc.environment = pm.fromScene(roomEnvironment(), 0.04).texture;
      pm.dispose();
      sc.add(new T.HemisphereLight(0xffffff, 0xa9ae96, 0.6));
      const sunL = new T.DirectionalLight(0xffffff, 2.2);
      sunL.position.set(300, 500, 200);
      sc.add(sunL);
      const cam3 = new T.PerspectiveCamera(35, 1, 10, 10000);
      cam3.position.set(330, 300, 380);
      cam3.lookAt(0, 20, 0);
      const plate = new T.Mesh(new T.BoxGeometry(300, 10, 300));
      plate.position.y = -5;
      const cube = new T.Mesh(new T.BoxGeometry(100, 100, 100));
      cube.position.set(-55, 50, -40);
      const ball = new T.Mesh(new T.SphereGeometry(45, 48, 32));
      ball.position.set(75, 45, 60);
      // UV во cm, како во моделот (текстурата се повторува по вистинска големина)
      scaleUV(plate.geometry, 300, 300); scaleUV(cube.geometry, 100, 100); scaleUV(ball.geometry, 280, 140);
      sc.add(plate, cube, ball);
      pv = { sc, cam: cam3, meshes: [plate, cube, ball], draw: () => previewR.render(sc, cam3) };
    }
    if (previewR.domElement.parentNode !== el) { el.innerHTML = ''; el.appendChild(previewR.domElement); }
    const w = el.clientWidth || 260, h = el.clientHeight || 190;
    previewR.setSize(w, h, false);
    previewR.domElement.style.width = '100%'; previewR.domElement.style.height = '100%';
    pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
    const m = defMat(d, {}, () => pv.draw());
    for (const x of pv.meshes) x.material = m;
    pv.draw();
  }

  window.MDA3D = {
    DEFAULTS, SLOTS, texUrl, preview,
    show: showModel,
    update(m) { model = m; build(); },
    hide() { if (holder) holder.classList.remove('on'); if (ro && holder) ro.unobserve(holder); needFit = true; },
  };
})();
