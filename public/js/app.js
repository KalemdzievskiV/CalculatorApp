/* MDA лендинг + калкулатор визард во 4 чекори.
   Изборите од визардот се мапираат на влезните параметри на вистинскиот
   пресметковен мотор (MDAEngine) — истите материјали и формули како во админот. */
(async function () {
  const cfg = await fetch('/api/config').then((r) => r.json());
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Референтна куќа од Excel пресметката — за изведување мерки од квадратура
  const REF = { AREA: 166, WALL_OUT: 75, WALL_IN: 59, ROOF: 152, SIMS: 11, WC_PERIM_PER_WC: 7.25 };

  // ── Состојба на визардот ──
  const state = {
    step: 1,
    house: 150, terrace: 12,
    sys: 'kamena',        // kamena | sip
    roof: 'lim',          // lim | pur
    fac: 'abrib',         // abrib | lim | patos | none
    interior: 'gypsum',   // gypsum | none
    ceil: true,
    elec: 'none',         // none | basic | full
    wc: 2, doors: 6,
    floor: 'laminate',    // laminate | tiles | none
    windows: null,        // null = автоматски скалиран сет; низа = рачно уредено
    overrides: {},        // рачно прегазени прецизни мерки
    discountEur: 0,
    client: '',
  };

  const OPTS = {
    sys: [
      { id: 'kamena', name: 'Дрво + камена волна', sub: 'ISO класик' },
      { id: 'sip', name: 'СИП панел', sub: 'брза монтажа' },
    ],
    roof: [
      { id: 'lim', name: 'Лим', sub: 'метал покрив' },
      { id: 'pur', name: 'ПУР панел', sub: 'изолиран кров' },
    ],
    fac: [
      { id: 'abrib', name: 'Абриб', sub: 'малтер' },
      { id: 'lim', name: 'Лим', sub: 'фасаден' },
      { id: 'patos', name: 'Патос', sub: 'дрво' },
      { id: 'none', name: 'Без', sub: 'сива' },
    ],
    interior: [
      { id: 'gypsum', name: 'Гипс + боја', sub: 'глет и фарбање' },
      { id: 'none', name: 'Сива фаза', sub: 'без внатрешно' },
    ],
    elec: [
      { id: 'none', name: 'Без', sub: '—' },
      { id: 'basic', name: 'Основна', sub: 'инсталација' },
      { id: 'full', name: 'Целосна', sub: 'штекери/светла' },
    ],
    floor: [
      { id: 'laminate', name: 'Ламинат', sub: '+ плочки бања' },
      { id: 'tiles', name: 'Плочки', sub: 'насекаде' },
      { id: 'none', name: 'Сива', sub: 'без под' },
    ],
  };

  const STEP_LABELS = ['Површина и систем', 'Клучни ставки', 'Инсталации и финиш', 'Резиме'];

  const MODELS = [
    { id: 'tiny', name: 'TINY ONE', area: 30, terrace: 8, wc: 1, doors: 2, tag: 'ВИКЕНДИЦА', desc: 'Компактен дом за пар или соло живот.' },
    { id: 'bungalow', name: 'BUNGALOW', area: 55, terrace: 10, wc: 1, doors: 4, tag: 'СЕМЕЕН СТАРТ', desc: 'Отворен простор со две спални соби.' },
    { id: 'family', name: 'FAMILY', area: 90, terrace: 12, wc: 2, doors: 6, tag: 'НАЈПОПУЛАРЕН', desc: 'Простран дом за целото семејство.' },
    { id: 'villa', name: 'VILLA', area: 140, terrace: 20, wc: 3, doors: 8, tag: 'ПРЕМИУМ', desc: 'Луксузен модуларен дом со тераса.' },
  ];

  // ── Форматирање ──
  const fmtEur = (v) => '€' + new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(v));
  const fmtEur2 = (v) => new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const fmtMkd = (v) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(v));
  const fmtQty = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(v);
  const r1 = (v) => Math.round(v * 10) / 10;

  // ── Изведени мерки од квадратурата (пропорционално на реф. куќата) ──
  function derive(house, wc) {
    const k = Math.sqrt(house / REF.AREA);
    return {
      FLOOR_H: 2.85,
      WALL_OUT: r1(REF.WALL_OUT * k),
      WALL_IN: r1(REF.WALL_IN * k),
      ROOF: r1(REF.ROOF * (house / REF.AREA)),
      SIMS: r1(REF.SIMS * (house / REF.AREA)),
      WC_PERIM: r1(REF.WC_PERIM_PER_WC * wc),
    };
  }
  const ADV_FIELDS = [
    { key: 'WALL_OUT', label: 'НАДВ. ЅИДОВИ (m)' },
    { key: 'WALL_IN', label: 'ВНАТР. ЅИДОВИ (m)' },
    { key: 'ROOF', label: 'КРОВ (m²)' },
    { key: 'SIMS', label: 'СИМС (m²)' },
    { key: 'FLOOR_H', label: 'ВИСИНА КАТ (m)' },
    { key: 'WC_PERIM', label: 'ПЕРИМЕТАР WC (m)' },
  ];
  const measure = (k, s = state) => (s.overrides[k] != null ? s.overrides[k] : derive(s.house, s.wc)[k]);

  // ── Мапирање: визард → влезни параметри на моторот ──
  function buildInputs(s) {
    const M = (k) => measure(k, s);
    return {
      AREA_HOUSE: s.house, AREA_TERRACE: s.terrace,
      FLOOR_H: M('FLOOR_H'), WALL_OUT: M('WALL_OUT'), WALL_IN: M('WALL_IN'),
      ROOF: M('ROOF'), SIMS: M('SIMS'),
      KAMENA: s.sys === 'kamena' ? 1 : 0, SIP: s.sys === 'sip' ? 1 : 0,
      MONTAZA: 1, KOSHULKA: 0,
      ABRIB: s.fac === 'abrib' ? 1 : 0,
      FAS_LIM: s.fac === 'lim' ? r1(M('WALL_OUT') * M('FLOOR_H')) : 0,
      FAS_LIM_LENTI: s.fac === 'lim' ? r1(M('WALL_OUT')) : 0,
      FAS_PATOS: s.fac === 'patos' ? r1(M('WALL_OUT') * M('FLOOR_H')) : 0,
      OKAPNICI: s.fac === 'patos' ? r1(M('WALL_OUT')) : 0,
      GIPS: s.interior === 'gypsum' ? 1 : 0,
      CEILING: s.interior === 'gypsum' && s.ceil ? 1 : 0,
      WC: s.wc, WC_PERIM: M('WC_PERIM'),
      LAMINAT: s.floor === 'laminate' ? 1 : 0,
      PLOCHKI: s.floor === 'tiles' ? 1 : 0,
      TILE_EXTRA: 0,
      ELEKTRIKA: s.elec !== 'none' ? 1 : 0,
      SHUKO: s.elec === 'full' ? Math.round(s.house / 5) : 0,
      SVETLA: s.elec === 'full' ? Math.round(s.house / 8) : 0,
      ORMAR: s.elec === 'full' ? 1 : 0,
      ROOF_LIM: s.roof === 'lim' ? 1 : 0, ROOF_PUR: s.roof === 'pur' ? 1 : 0,
      DOORS_IN: s.doors, DOORS_BLIND: 0,
    };
  }
  function autoWindows(s) {
    const k = s.house / REF.AREA;
    return (cfg.windowsDefaults || []).map((w) => ({ name: w.name, qty: +(w.qty * k).toFixed(2), priceEur: w.priceEur }));
  }
  const effWindows = (s = state) => (s.windows ? s.windows : autoWindows(s));

  // ── Пресметка ──
  let last = null;
  function recalc() {
    last = MDAEngine.compute(cfg, { inputs: buildInputs(state), windows: effWindows(), discountEur: state.discountEur });
    renderSummary();
    renderRecap();
    $('#calcErrors').innerHTML = last.errors.length
      ? `<div class="error-note">Грешки во формулите: ${last.errors.map(esc).join('; ')}</div>` : '';
  }

  // ── Анимиран вкупен износ ──
  let animRaf = null, animShown = 0;
  function animateTotal(target) {
    if (animRaf) cancelAnimationFrame(animRaf);
    const from = animShown, start = performance.now(), dur = 600;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      animShown = from + (target - from) * e;
      $('#sumTotal').textContent = fmtEur(animShown);
      $('#sumMkd').textContent = '≈ ' + fmtMkd(animShown * (cfg.settings.eurRate || 62)) + ' ден · со ДДВ';
      if (t < 1) animRaf = requestAnimationFrame(step);
    };
    animRaf = requestAnimationFrame(step);
  }

  function renderSummary() {
    animateTotal(last.finalEur);
    $('#sumPerM2').textContent = fmtEur(last.finalPerM2);
    $('#sumGrey').textContent = fmtEur(last.greyEur);
    $('#sumLines').innerHTML = `
      <div class="row"><span>Конструкција и обвивка (сива фаза)</span><span>${fmtEur(last.greyEur)}</span></div>
      <div class="row"><span>Финишинг и инсталации</span><span>${fmtEur(last.totalEur - last.greyEur)}</span></div>
      ${state.discountEur ? `<div class="row"><span>Попуст</span><span style="color:var(--accent);">−${fmtEur(state.discountEur)}</span></div>` : ''}
      <div class="row"><span>ДДВ (издвоен, ${cfg.settings.vatPct}%)</span><span>${fmtEur(last.taxEur)}</span></div>
      <div class="row"><span>Вкупна површина</span><span>${fmtQty(last.area)} m²</span></div>`;
  }

  function renderRecap() {
    const sysName = OPTS.sys.find((o) => o.id === state.sys).name;
    const config = [
      ['Систем · ' + sysName, state.house + ' m² куќа + ' + state.terrace + ' m² тераса'],
      ['Покрив · ' + OPTS.roof.find((o) => o.id === state.roof).name, ''],
      ['Фасада · ' + OPTS.fac.find((o) => o.id === state.fac).name, ''],
      ['Внатрешно · ' + OPTS.interior.find((o) => o.id === state.interior).name + (state.interior === 'gypsum' && state.ceil ? ' · спуштен плафон' : ''), ''],
      ['Електрика · ' + OPTS.elec.find((o) => o.id === state.elec).name + ' · Бањи × ' + state.wc + ' · Врати × ' + state.doors, ''],
      ['Подови · ' + OPTS.floor.find((o) => o.id === state.floor).name, ''],
    ];
    let html = config.map((c) => `<div class="recap-line"><span>${esc(c[0])}</span><span style="color:#b9b3aa;font-weight:400;font-size:12.5px;">${esc(c[1])}</span></div>`).join('');
    html += last.byCat.filter((c) => c.eur > 0.5).map((c) =>
      `<div class="recap-line"><span>${esc(c.name)}</span><span>${fmtEur(c.eur)}</span></div>`).join('');
    $('#recapLines').innerHTML = html;
    $('#recapGrey').textContent = fmtEur(last.greyEur);
    $('#recapTotal').textContent = fmtEur(last.finalEur);
    renderDetailTable();
  }

  function renderDetailTable() {
    const body = $('#detailTable tbody');
    let html = '';
    for (const c of cfg.categories) {
      const rows = last.rows.filter((r) => r.cat === c.id && r.totalMkd > 0.005);
      if (!rows.length) continue;
      const catEur = rows.reduce((s, r) => s + r.eur, 0);
      html += `<tr class="cat-row"><td colspan="6">${esc(c.name)}</td><td class="num">${fmtEur(catEur)}</td></tr>`;
      for (const r of rows) {
        html += `<tr><td class="mono muted">${r.code || '—'}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.unit)}</td>
          <td class="num">${fmtQty(r.qty)}</td><td class="num">${fmtQty(r.price)}</td>
          <td class="num">${fmtMkd(r.totalMkd)}</td><td class="num">${fmtEur2(r.eur)}</td></tr>`;
      }
    }
    body.innerHTML = html;
  }

  // ── Чекори ──
  function setStep(n) {
    state.step = Math.max(1, Math.min(4, n));
    for (let i = 1; i <= 4; i++) $('#step' + i).style.display = state.step === i ? '' : 'none';
    $('#backBtn').style.visibility = state.step > 1 ? 'visible' : 'hidden';
    $('#nextBtn').style.display = state.step < 4 ? '' : 'none';
    $('#nextBtn').textContent = state.step === 3 ? 'Прикажи резиме →' : 'Следно →';
    renderPills();
  }
  function renderPills() {
    $('#progressPills').innerHTML = STEP_LABELS.map((label, i) => {
      const n = i + 1;
      return `<button class="${state.step === n ? 'active' : state.step > n ? 'done' : ''}" data-n="${n}"><span class="n">${n}</span><span>${esc(label)}</span></button>`;
    }).join('');
    $('#progressPills').querySelectorAll('button').forEach((b) => { b.onclick = () => setStep(+b.dataset.n); });
  }
  $('#nextBtn').onclick = () => setStep(state.step + 1);
  $('#backBtn').onclick = () => setStep(state.step - 1);

  // ── Опции (копчиња) ──
  function renderOpts(hostId, group, key, cols) {
    const host = $('#' + hostId);
    host.innerHTML = OPTS[group].map((o) =>
      `<button class="opt-btn ${state[key] === o.id ? 'active' : ''}" data-id="${o.id}">
        <span class="t">${esc(o.name)}</span><span class="s">${esc(o.sub)}</span></button>`).join('');
    host.querySelectorAll('.opt-btn').forEach((b) => {
      b.onclick = () => { state[key] = b.dataset.id; renderOpts(hostId, group, key); recalc(); };
    });
  }
  function renderCeil() {
    $('#ceilOpt').innerHTML = `<button class="opt-btn ${state.ceil ? 'active' : ''}" id="ceilBtn">
      <span class="t">${state.ceil ? 'Вклучен' : 'Исклучен'}</span><span class="s">гипс плафон низ целата куќа</span></button>`;
    $('#ceilBtn').onclick = () => { state.ceil = !state.ceil; renderCeil(); recalc(); };
  }
  function renderAllOpts() {
    renderOpts('sysOpts', 'sys', 'sys');
    renderOpts('roofOpts', 'roof', 'roof');
    renderOpts('facOpts', 'fac', 'fac');
    renderOpts('intOpts', 'interior', 'interior');
    renderOpts('elecOpts', 'elec', 'elec');
    renderOpts('floorOpts', 'floor', 'floor');
    renderCeil();
  }

  // ── Лизгачи и степери ──
  function syncSliders() {
    $('#houseRange').value = state.house;
    $('#terraceRange').value = state.terrace;
    $('#houseVal').textContent = state.house;
    $('#terraceVal').textContent = state.terrace;
    $('#wcVal').textContent = state.wc;
    $('#doorVal').textContent = state.doors;
  }
  $('#houseRange').oninput = (e) => { state.house = +e.target.value; $('#houseVal').textContent = state.house; renderAdv(); renderWinNote(); recalc(); };
  $('#terraceRange').oninput = (e) => { state.terrace = +e.target.value; $('#terraceVal').textContent = state.terrace; recalc(); };
  const bump = (key, d, min, max, valId) => {
    state[key] = Math.max(min, Math.min(max, state[key] + d));
    $(valId).textContent = state[key];
    if (key === 'wc') renderAdv();
    recalc();
  };
  $('#wcInc').onclick = () => bump('wc', 1, 0, 8, '#wcVal');
  $('#wcDec').onclick = () => bump('wc', -1, 0, 8, '#wcVal');
  $('#doorInc').onclick = () => bump('doors', 1, 0, 16, '#doorVal');
  $('#doorDec').onclick = () => bump('doors', -1, 0, 16, '#doorVal');

  // ── Прецизни мерки (напредно) ──
  function renderAdv() {
    const d = derive(state.house, state.wc);
    $('#advGrid').innerHTML = ADV_FIELDS.map((f) => {
      const over = state.overrides[f.key] != null;
      return `<div><label>${esc(f.label)}${over ? ' ·<span style="color:var(--accent-soft);"> рачно</span>' : ''}</label>
        <input type="number" step="any" data-key="${f.key}" class="${over ? 'overridden' : ''}" value="${over ? state.overrides[f.key] : d[f.key]}"></div>`;
    }).join('') + `<div style="align-self:end;"><button class="btn ghost small" id="advReset" style="border-color:#4a453e;color:#fff;">↺ Автоматски</button></div>`;
    $('#advGrid').querySelectorAll('input').forEach((inp) => {
      inp.onchange = (e) => {
        state.overrides[inp.dataset.key] = parseFloat(e.target.value) || 0;
        renderAdv();
        recalc();
      };
    });
    $('#advReset').onclick = () => { state.overrides = {}; renderAdv(); recalc(); };
  }

  // ── Дограма ──
  function renderWinNote() {
    const k = state.house / REF.AREA;
    $('#winFactorNote').textContent = state.windows ? 'рачно уредена листа' : 'фактор × ' + k.toFixed(2);
  }
  $('#editWinBtn').onclick = () => {
    const ed = $('#winEditor');
    const open = ed.style.display === 'none';
    ed.style.display = open ? '' : 'none';
    $('#editWinBtn').textContent = open ? 'Затвори листа ▴' : 'Уреди листа ▾';
    if (open) renderWinTable();
  };
  function renderWinTable() {
    if (!state.windows) state.windows = autoWindows(state);
    renderWinNote();
    const body = $('#winTable tbody');
    body.innerHTML = '';
    state.windows.forEach((w, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono muted">${i + 1}</td>
        <td><input type="text" value="${esc(w.name)}"></td>
        <td class="num"><input type="number" min="0" step="any" style="width:70px;text-align:right;" value="${w.qty}"></td>
        <td class="num"><input type="number" min="0" step="any" style="width:84px;text-align:right;" value="${w.priceEur}"></td>
        <td><button class="x-close">×</button></td>`;
      const [nameI, qtyI, priceI] = tr.querySelectorAll('input');
      nameI.oninput = (e) => { w.name = e.target.value; };
      qtyI.oninput = (e) => { w.qty = parseFloat(e.target.value) || 0; recalc(); };
      priceI.oninput = (e) => { w.priceEur = parseFloat(e.target.value) || 0; recalc(); };
      tr.querySelector('.x-close').onclick = () => { state.windows.splice(i, 1); renderWinTable(); recalc(); };
      body.appendChild(tr);
    });
  }
  $('#addWin').onclick = () => {
    if (!state.windows) state.windows = autoWindows(state);
    state.windows.push({ name: '', qty: 1, priceEur: 0 });
    renderWinTable();
    recalc();
  };
  $('#resetWin').onclick = () => { state.windows = null; renderWinNote(); renderWinTable(); recalc(); };

  // ── Модели ──
  function modelPrice(mo) {
    const s = Object.assign({}, state, {
      house: mo.area, terrace: mo.terrace, wc: mo.wc, doors: mo.doors,
      sys: 'kamena', roof: 'lim', fac: 'abrib', interior: 'gypsum', ceil: true,
      elec: 'none', floor: 'laminate', windows: null, overrides: {}, discountEur: 0,
    });
    return MDAEngine.compute(cfg, { inputs: buildInputs(s), windows: autoWindows(s) }).totalEur;
  }
  function renderModels() {
    $('#modelsGrid').innerHTML = MODELS.map((mo, i) => `
      <div class="model-card" data-reveal="${i * 90}" data-id="${mo.id}">
        <div class="photo"><div class="img-ph">// ${mo.name.toLowerCase()}</div><span class="m-tag">${esc(mo.tag)}</span></div>
        <div class="body">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3>${esc(mo.name)}</h3><span class="area">${mo.area} m²</span>
          </div>
          <p class="desc">${esc(mo.desc)}</p>
          <div class="price-row"><span style="font-size:11px;color:var(--ink-soft);">од</span>
            <span class="from-price">${fmtEur(modelPrice(mo))}</span></div>
        </div>
      </div>`).join('');
    $('#modelsGrid').querySelectorAll('.model-card').forEach((card) => {
      card.onclick = () => {
        const mo = MODELS.find((x) => x.id === card.dataset.id);
        Object.assign(state, { house: mo.area, terrace: mo.terrace, wc: mo.wc, doors: mo.doors, windows: null, overrides: {} });
        syncSliders();
        renderAdv();
        renderWinNote();
        setStep(1);
        recalc();
        document.getElementById('calc').scrollIntoView({ behavior: 'smooth' });
      };
    });
  }

  // ── Попуст / клиент ──
  $('#discount').oninput = (e) => { state.discountEur = parseFloat(e.target.value) || 0; recalc(); };
  $('#clientName').oninput = (e) => { state.client = e.target.value; };
  $('#sumCta').onclick = () => { setStep(4); document.getElementById('calc').scrollIntoView({ behavior: 'smooth' }); };

  // ── Зачувување понуда ──
  $('#saveBtn').onclick = async () => {
    const r = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: state.client.trim() || 'Без име',
        inputs: buildInputs(state),
        windows: effWindows(),
        discountEur: state.discountEur,
        totalEur: last.totalEur,
      }),
    }).then((x) => x.json());
    $('#saveNote').innerHTML = `Зачувано ✓ — <a href="?quote=${r.id}#calc" style="color:var(--accent-soft);">линк до понудата</a>`;
  };

  // ── Печатена понуда ──
  $('#printBtn').onclick = () => {
    const d = new Date().toLocaleDateString('mk-MK');
    let rowsHtml = '';
    for (const c of last.byCat) {
      if (c.eur <= 0.5) continue;
      rowsHtml += `<tr><td style="padding:6px 10px;border-bottom:1px solid #e7e1d6;">${esc(c.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e7e1d6;text-align:right;font-family:var(--mono);">${fmtEur2(c.eur)}</td></tr>`;
    }
    $('#offerPrint').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #db4b3b;padding-bottom:14px;">
        <div><h1>${esc(cfg.settings.companyName)}</h1><div class="mono" style="font-size:12px;color:#676b70;">ПОНУДА / ПРЕСМЕТКА</div></div>
        <div class="mono" style="font-size:12px;text-align:right;">Датум: ${d}<br>Тел: ${esc(cfg.settings.phone || '')}</div>
      </div>
      <table style="width:100%;font-size:13.5px;margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#676b70;">Понуда за:</td><td style="font-weight:600;">${esc(state.client.trim() || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#676b70;">Површина куќа / тераса:</td><td>${state.house} m² / ${state.terrace} m²</td></tr>
        <tr><td style="padding:4px 0;color:#676b70;">Вкупна површина:</td><td>${fmtQty(last.area)} m²</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #322f2b;">Позиција</th>
            <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #322f2b;">Износ</th></tr>
        ${rowsHtml}
        <tr><td style="padding:8px 10px;font-weight:600;">ВКУПНО СО ДДВ</td><td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono);">${fmtEur2(last.totalEur)}</td></tr>
        <tr><td style="padding:2px 10px;color:#676b70;">од тоа ДДВ ${cfg.settings.vatPct}%</td><td style="padding:2px 10px;text-align:right;font-family:var(--mono);color:#676b70;">${fmtEur2(last.taxEur)}</td></tr>
        ${last.discountEur ? `<tr><td style="padding:2px 10px;">Попуст</td><td style="padding:2px 10px;text-align:right;font-family:var(--mono);">−${fmtEur2(last.discountEur)}</td></tr>
        <tr><td style="padding:8px 10px;font-weight:600;color:#db4b3b;">ЦЕНА СО ПОПУСТ</td><td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono);color:#db4b3b;">${fmtEur2(last.finalEur)}</td></tr>` : ''}
        <tr><td style="padding:2px 10px;color:#676b70;">Цена по m²</td><td style="padding:2px 10px;text-align:right;font-family:var(--mono);color:#676b70;">${fmtEur2(last.finalPerM2)}</td></tr>
      </table>
      <p class="mono" style="font-size:10.5px;color:#9a9ea3;margin-top:26px;">Понудата е информативна и важи 30 дена. Modular Design Architects.</p>`;
    window.print();
  };

  // ── Вчитување зачувана понуда: обратно мапирање кон визардот ──
  async function loadQuote(id) {
    const q = await fetch('/api/quotes/' + id).then((r) => (r.ok ? r.json() : null));
    if (!q) return;
    const inp = q.inputs || {};
    state.house = inp.AREA_HOUSE ?? state.house;
    state.terrace = inp.AREA_TERRACE ?? state.terrace;
    state.sys = inp.SIP ? 'sip' : 'kamena';
    state.roof = inp.ROOF_PUR ? 'pur' : 'lim';
    state.fac = inp.ABRIB ? 'abrib' : inp.FAS_LIM ? 'lim' : inp.FAS_PATOS ? 'patos' : 'none';
    state.interior = inp.GIPS ? 'gypsum' : 'none';
    state.ceil = !!inp.CEILING;
    state.elec = !inp.ELEKTRIKA ? 'none' : inp.SHUKO > 0 ? 'full' : 'basic';
    state.wc = inp.WC ?? state.wc;
    state.doors = inp.DOORS_IN ?? state.doors;
    state.floor = inp.LAMINAT ? 'laminate' : inp.PLOCHKI ? 'tiles' : 'none';
    state.windows = q.windows && q.windows.length ? q.windows : null;
    state.discountEur = q.discountEur || 0;
    state.client = q.client === 'Без име' ? '' : q.client || '';
    // Мерките од понудата стануваат рачни ако се разликуваат од изведените
    const d = derive(state.house, state.wc);
    for (const f of ADV_FIELDS) {
      if (inp[f.key] != null && Math.abs(inp[f.key] - d[f.key]) > 0.05) state.overrides[f.key] = inp[f.key];
    }
    $('#clientName').value = state.client;
    $('#discount').value = state.discountEur;
    setStep(4);
    setTimeout(() => document.getElementById('calc').scrollIntoView(), 60);
  }

  // ── Reveal анимации и бројачи ──
  function initReveal() {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.style.transitionDelay = ((+el.dataset.reveal || 0) / 1000) + 's';
        el.classList.add('revealed');
        el.querySelectorAll('[data-count]').forEach(countUp);
        if (el.matches('[data-count]')) countUp(el);
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
  }
  function countUp(el) {
    if (el.__counted) return;
    el.__counted = 1;
    const target = +el.dataset.count, suffix = el.dataset.suffix || '', start = performance.now(), dur = 1200;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * e) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Телефон од подесувањата ──
  if (cfg.settings.phone) {
    for (const id of ['phoneCta', 'phoneFoot']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.href = 'tel:' + cfg.settings.phone.replace(/\s/g, '');
      (el.querySelector('span') || el).textContent = cfg.settings.phone;
    }
  }
  $('#vatNote').textContent = cfg.settings.vatPct;

  // ── Стартување ──
  renderModels();
  renderAllOpts();
  renderAdv();
  renderWinNote();
  syncSliders();
  setStep(1);
  recalc();
  initReveal();

  const quoteId = new URLSearchParams(location.search).get('quote');
  if (quoteId) {
    try {
      await loadQuote(quoteId);
      renderAllOpts();
      renderAdv();
      renderWinNote();
      syncSliders();
      recalc();
    } catch (e) { /* игнорирај */ }
  }
})();
