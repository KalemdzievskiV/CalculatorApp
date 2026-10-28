/* Админ панел — уредување материјали, категории, параметри, дограма, понуди и подесувања.
   Промените се зачувуваат веднаш на серверот (PUT на целата колекција). */
(function () {
  let token = localStorage.getItem('mdaToken') || '';
  let cfg = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(v);

  // Мобилно мени за админ навигацијата
  const adminBurger = $('#adminBurger'), adminLinks = $('#adminLinks');
  if (adminBurger && adminLinks) {
    adminBurger.onclick = () => adminLinks.classList.toggle('open');
    adminLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => adminLinks.classList.remove('open')));
  }

  // Фрла грешка при неуспешен одговор (за да не се третира {error:…} како валиден резултат)
  async function api(path, method, body) {
    const r = await fetch(path, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { logout(); throw new Error('401'); }
    let data = null;
    try { data = await r.json(); } catch (e) { /* нема тело */ }
    if (!r.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + r.status));
      err.status = r.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  function flash(msg) {
    const f = $('#flash');
    f.textContent = msg || 'Зачувано ✓';
    f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 1400);
  }
  async function save(collection) {
    try {
      await api('/api/admin/' + collection, 'PUT', cfg[collection === 'windowsDefaults' ? 'windowsDefaults' : collection]);
      flash();
    } catch (e) {
      if (e.message !== '401') flash('Грешка при зачувување: ' + e.message);
    }
  }

  // ── Најава ──
  async function tryLogin(pw) {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (!r.ok) return false;
    token = (await r.json()).token;
    localStorage.setItem('mdaToken', token);
    return true;
  }
  function logout() {
    token = '';
    localStorage.removeItem('mdaToken');
    $('#adminApp').style.display = 'none';
    $('#loginScreen').style.display = 'grid';
  }
  $('#loginBtn').onclick = async () => {
    const ok = await tryLogin($('#pw').value);
    if (ok) boot();
    else { $('#loginErr').style.display = 'block'; $('#loginErr').textContent = 'Погрешна лозинка.'; }
  };
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#logoutBtn').onclick = (e) => { e.preventDefault(); logout(); };

  // ── Табови ──
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      $('#tab-' + b.dataset.tab).classList.add('active');
      if (b.dataset.tab === 'quotes') renderQuotes();
      if (b.dataset.tab === 'inquiries') renderInquiries();
      if (b.dataset.tab === 'calc') renderCalc();
      if (b.dataset.tab === 'explain') renderExplain();
      if (b.dataset.tab === 'analytics') renderAnalytics();
      if (b.dataset.tab === 'offer') renderOfferTpl();
      if (b.dataset.tab === 'mat3d') renderMat3d();
    };
  });

  // ══ МАТЕРИЈАЛИ ══
  function renderMaterials() {
    const q = ($('#matSearch').value || '').toLowerCase();
    const cat = $('#matCatFilter').value;
    const body = $('#matTable tbody');
    let html = '';
    cfg.materials.forEach((m, i) => {
      if (cat && m.cat !== cat) return;
      if (q && !(m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))) return;
      const catName = (cfg.categories.find((c) => c.id === m.cat) || {}).name || m.cat;
      html += `<tr data-i="${i}">
        <td class="mono muted">${esc(m.code)}</td>
        <td>${esc(m.name)}</td>
        <td class="muted" style="font-size:11.5px;">${esc(catName)}</td>
        <td class="muted">${esc(m.unit)}</td>
        <td class="num">${m.priceFormula ? '<span class="tag">формула</span>' : fmt(m.price)}</td>
        <td class="mono" style="font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.formula || ('фикс. ' + (m.defQty || 0)))}</td>
        <td>${m.active === false ? '<span class="tag off">исклучен</span>' : '<span class="tag ok">активен</span>'}</td>
        <td><button class="icon-btn" title="Уреди">✎</button></td>
      </tr>`;
    });
    body.innerHTML = html;
    body.querySelectorAll('tr').forEach((tr) => {
      tr.querySelector('.icon-btn').onclick = () => openMatModal(Number(tr.dataset.i));
    });
  }
  $('#matSearch').oninput = renderMaterials;
  $('#matCatFilter').onchange = renderMaterials;
  $('#addMat').onclick = () => openMatModal(-1);

  // Модал за материјал
  let editIdx = -1;
  function openMatModal(i) {
    editIdx = i;
    const m = i >= 0 ? cfg.materials[i] : { code: '', name: '', cat: cfg.categories[0].id, unit: 'кол', price: 0, formula: '', defQty: 0, grey: 0, active: true };
    $('#matModalTitle').textContent = i >= 0 ? 'Уреди материјал — ' + m.code : 'Нов материјал';
    $('#mCode').value = m.code;
    $('#mCode').disabled = i >= 0;
    $('#mName').value = m.name;
    $('#mCat').innerHTML = cfg.categories.map((c) => `<option value="${c.id}" ${c.id === m.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#mUnit').value = m.unit;
    $('#mPrice').value = m.price;
    $('#mFormula').value = m.formula || '';
    $('#mDefQty').value = m.defQty || 0;
    $('#mGrey').value = m.grey || 0;
    $('#mPriceFormula').value = m.priceFormula || '';
    $('#mActive').classList.toggle('on', m.active !== false);
    $('#mDelete').style.display = i >= 0 ? '' : 'none';
    validateFormula();
    $('#matModal').classList.add('open');
  }
  $('#mActive').onclick = () => $('#mActive').classList.toggle('on');
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => b.closest('.modal-back').classList.remove('open'); });

  // Клучеви што смеат да се користат во формули („избор" е само текст за понудата)
  const formulaKeys = () => cfg.inputs.filter((i) => i.type !== 'select').map((i) => i.key);
  function knownVarsAndCodes() {
    // PRICE е достапна само во priceFormula (основната цена на самата ставка)
    const vars = formulaKeys().concat(['WINDOWS_QTY', 'PRICE']);
    const codes = cfg.materials.map((x) => x.code);
    return { vars, codes };
  }
  function validateFormula() {
    const out = $('#mFormulaCheck');
    const test = $('#mTest');
    const f = $('#mFormula').value.trim();
    const pf = $('#mPriceFormula').value.trim();
    const { vars, codes } = knownVarsAndCodes();
    let err = f ? MDAEngine.validate(f, vars, codes.concat([$('#mCode').value.trim()])) : null;
    if (!err && pf) err = MDAEngine.validate(pf, vars, codes.concat([$('#mCode').value.trim()]));
    if (err) {
      out.innerHTML = '<span style="color:#a13527;">✗ ' + esc(err) + '</span>';
      test.textContent = '';
      return false;
    }
    out.innerHTML = '<span style="color:#2e7d32;">✓ Формулата е валидна</span>';
    // Пробна пресметка со стандардните параметри и тековните измени
    try {
      const draft = JSON.parse(JSON.stringify(cfg));
      const cand = collectModal();
      if (editIdx >= 0) draft.materials[editIdx] = cand;
      else draft.materials.push(cand);
      const res = MDAEngine.compute(draft, { windows: draft.windowsDefaults });
      const row = res.rows.find((r) => r.code === cand.code);
      if (row) test.innerHTML = `Тест со стандардни параметри: количина <b>${fmt(row.qty)}</b> ${esc(row.unit)} × ${fmt(row.price)} ден = <b>${fmt(row.eur)} €</b>`;
    } catch (e) { /* тивко */ }
    return true;
  }
  $('#mFormula').oninput = validateFormula;
  $('#mPriceFormula').oninput = validateFormula;

  function collectModal() {
    const it = {
      code: $('#mCode').value.trim(),
      cat: $('#mCat').value,
      name: $('#mName').value.trim(),
      unit: $('#mUnit').value.trim() || 'кол',
      price: parseFloat($('#mPrice').value) || 0,
      active: $('#mActive').classList.contains('on'),
      grey: parseFloat($('#mGrey').value) || 0,
    };
    const f = $('#mFormula').value.trim();
    if (f) it.formula = f;
    else it.defQty = parseFloat($('#mDefQty').value) || 0;
    const pf = $('#mPriceFormula').value.trim();
    if (pf) it.priceFormula = pf;
    return it;
  }
  // Копче Зачувај и горе во заглавјето — исто дејство како долното
  $('#mSaveTop').onclick = () => $('#mSave').click();
  $('#mSave').onclick = async () => {
    const it = collectModal();
    if (!it.code || !it.name) return flash('Кодот и името се задолжителни');
    if (!validateFormula()) return flash('Поправете ја формулата');
    if (editIdx >= 0) cfg.materials[editIdx] = it;
    else {
      if (cfg.materials.some((m) => m.code === it.code)) return flash('Кодот веќе постои');
      cfg.materials.push(it);
    }
    await save('materials');
    $('#matModal').classList.remove('open');
    renderMaterials();
  };
  $('#mDelete').onclick = async () => {
    if (editIdx < 0) return;
    const code = cfg.materials[editIdx].code;
    const used = cfg.materials.filter((m, i) => i !== editIdx && ((m.formula || '') + (m.priceFormula || '')).includes('"' + code + '"'));
    if (used.length && !confirm(`Внимание: ${used.map((u) => u.code).join(', ')} користат qty("${code}") во формула. Сепак избриши?`)) return;
    if (!confirm('Избриши го материјалот ' + code + '?')) return;
    cfg.materials.splice(editIdx, 1);
    await save('materials');
    $('#matModal').classList.remove('open');
    renderMaterials();
  };

  // ══ КАТЕГОРИИ ══
  function renderCategories() {
    const body = $('#catTable tbody');
    body.innerHTML = cfg.categories.map((c, i) => {
      const count = cfg.materials.filter((m) => m.cat === c.id).length;
      return `<tr data-i="${i}">
        <td><button class="icon-btn up" title="Горе">↑</button><button class="icon-btn down" title="Долу">↓</button></td>
        <td class="mono muted">${esc(c.id)}</td>
        <td><input type="text" value="${esc(c.name)}" style="width:100%;border:1px solid transparent;background:transparent;font-family:var(--sans);font-size:13px;padding:4px;" onfocus="this.style.borderColor='#e7e1d6';this.style.background='#fff'"></td>
        <td class="num">${count}</td>
        <td>${count === 0 ? '<button class="icon-btn del" title="Избриши">🗑</button>' : ''}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      tr.querySelector('input').onchange = async (e) => { cfg.categories[i].name = e.target.value; await save('categories'); };
      tr.querySelector('.up').onclick = async () => { if (i > 0) { [cfg.categories[i - 1], cfg.categories[i]] = [cfg.categories[i], cfg.categories[i - 1]]; await save('categories'); renderCategories(); } };
      tr.querySelector('.down').onclick = async () => { if (i < cfg.categories.length - 1) { [cfg.categories[i + 1], cfg.categories[i]] = [cfg.categories[i], cfg.categories[i + 1]]; await save('categories'); renderCategories(); } };
      const del = tr.querySelector('.del');
      if (del) del.onclick = async () => { if (confirm('Избриши категорија?')) { cfg.categories.splice(i, 1); await save('categories'); renderCategories(); fillCatFilter(); } };
    });
    filterCategories();
  }

  // Ги крие редовите што не одговараат (без повторно исцртување — индексите остануваат точни)
  function filterRows(body, match, countEl) {
    const rows = [...body.querySelectorAll('tr[data-i]')];
    let shown = 0;
    rows.forEach((tr) => { const ok = match(Number(tr.dataset.i)); tr.classList.toggle('no-match', !ok); if (ok) shown++; });
    countEl.textContent = shown === rows.length ? rows.length + ' вкупно' : shown + ' од ' + rows.length;
  }

  function filterCategories() {
    const q = $('#catSearch').value.trim().toLowerCase();
    const f = $('#catFilter').value;
    filterRows($('#catTable tbody'), (i) => {
      const c = cfg.categories[i];
      const count = cfg.materials.filter((m) => m.cat === c.id).length;
      if (f === 'used' && !count) return false;
      if (f === 'empty' && count) return false;
      return !q || (c.name + ' ' + c.id).toLowerCase().includes(q);
    }, $('#catCount'));
  }
  $('#catSearch').oninput = filterCategories;
  $('#catFilter').onchange = filterCategories;
  $('#addCat').onclick = async () => {
    const name = prompt('Име на новата категорија:');
    if (!name) return;
    const id = name.toUpperCase().replace(/[^A-ZА-Ш0-9]+/gi, '_').slice(0, 24) + '_' + Date.now().toString(36).slice(-3);
    cfg.categories.push({ id, name });
    await save('categories');
    renderCategories();
    fillCatFilter();
  };
  function fillCatFilter() {
    $('#matCatFilter').innerHTML = '<option value="">Сите категории</option>' + cfg.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  // ══ ПАРАМЕТРИ ══
  // Паѓачко мени за параметар од тип „избор" (празна вредност = ништо не е избрано)
  function selectHtml(inp, value, attrs = '') {
    const opts = inp.options || [];
    const cur = value == null ? '' : String(value);
    // Зачувана вредност што повеќе ја нема во опциите се прикажува за да не се изгуби тивко
    const extra = cur && !opts.includes(cur) ? [cur] : [];
    return `<select data-key="${inp.key}" ${attrs}><option value="">— не е избрано —</option>${
      opts.concat(extra).map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }

  function renderInputs() {
    const body = $('#inputTable tbody');
    body.innerHTML = cfg.inputs.map((inp, i) => `<tr data-i="${i}">
      <td class="mono">${esc(inp.key)}</td>
      <td>${esc(inp.label)}</td>
      <td class="muted" style="font-size:11.5px;">${esc(inp.group || '')}</td>
      <td><span class="tag">${inp.type === 'select' ? 'избор' : inp.type === 'boolean' ? 'да/не' : inp.type === 'derived' ? 'изведен' : inp.role === 'factor' ? 'коефициент' : inp.role === 'price' ? 'цена' : 'број'}</span>${
        inp.exclusive ? `<span class="tag" title="Само еден од групата може да е вклучен">⇄ ${esc(inp.exclusive)}</span>` : ''}${
        inp.gate ? `<span class="tag" title="Важи само ако ${esc(inp.gate)} е вклучен">⛓ ${esc(inp.gate)}</span>` : ''}${
        inp.target === 'windows' ? '<span class="tag" title="Се множи во цената на дограмата">дограма</span>' : ''}</td>
      <td class="num">${inp.type === 'select' ? selectHtml(inp, inp.def, 'style="width:140px;font-size:12.5px;padding:4px 6px;"') : inp.type === 'derived' ? '<span class="mono" style="font-size:11px;">' + esc(inp.formula) + '</span>' : `<input type="number" step="any" value="${inp.def}" style="width:90px;text-align:right;font-family:var(--mono);font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;">`}</td>
      <td class="muted">${esc(inp.unit || '')}</td>
      <td style="white-space:nowrap;"><button class="icon-btn edit" title="Уреди">✎</button>${inp.type !== 'derived' ? '<button class="icon-btn del" title="Избриши">🗑</button>' : ''}</td>
    </tr>`).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      const numInput = tr.querySelector('input[type=number]');
      if (numInput) numInput.onchange = async (e) => { cfg.inputs[i].def = parseFloat(e.target.value) || 0; await save('inputs'); };
      const defSel = tr.querySelector('select');
      if (defSel) defSel.onchange = async (e) => { cfg.inputs[i].def = e.target.value; await save('inputs'); };
      tr.querySelector('.edit').onclick = () => openInpModal(i);
      const del = tr.querySelector('.del');
      if (del) del.onclick = async () => {
        const key = cfg.inputs[i].key;
        const used = cfg.materials.filter((m) => new RegExp('\\b' + key + '\\b').test((m.formula || '') + (m.priceFormula || '')));
        if (used.length) return alert('Параметарот се користи во: ' + used.map((u) => u.code).join(', '));
        if (!confirm('Избриши параметар ' + key + '?')) return;
        cfg.inputs.splice(i, 1);
        await save('inputs');
        renderInputs();
      };
    });
    fillInpGroupFilter();
    filterInputs();
  }

  function fillInpGroupFilter() {
    const sel = $('#inpGroupFilter'), cur = sel.value;
    sel.innerHTML = '<option value="">Сите групи</option>' + cfg.inputGroups.map((g) => `<option>${esc(g)}</option>`).join('');
    if (cfg.inputGroups.includes(cur)) sel.value = cur;
  }

  const inpKind = (inp) => (inp.type === 'boolean' || inp.type === 'derived' || inp.type === 'select' ? inp.type : inp.role === 'price' || inp.role === 'factor' ? inp.role : 'number');
  function filterInputs() {
    const q = $('#inpSearch').value.trim().toLowerCase();
    const g = $('#inpGroupFilter').value, t = $('#inpTypeFilter').value, use = $('#inpUseFilter').value;
    // Сите формули (материјали + изведени параметри) за проверка дали клучот се користи
    const formulas = cfg.materials.map((m) => (m.formula || '') + ' ' + (m.priceFormula || ''))
      .concat(cfg.inputs.map((i) => i.formula || '')).join(' ');
    filterRows($('#inputTable tbody'), (i) => {
      const inp = cfg.inputs[i];
      if (g && inp.group !== g) return false;
      if (t && inpKind(inp) !== t) return false;
      if (use) {
        // Прекинувач е „користен" и ако е услов за друго поле
        // Моторот директно ги користи: коефициентите за дограма и површините по кат (збир кај два ката)
        const used = new RegExp('\\b' + inp.key + '\\b').test(formulas) || cfg.inputs.some((x) => x.gate === inp.key)
          || !!inp.target || ['AREA_F1', 'AREA_F2', 'TERRACE_F1', 'TERRACE_F2'].includes(inp.key);
        if ((use === 'used') !== used) return false;
      }
      return !q || (inp.key + ' ' + inp.label + ' ' + (inp.unit || '')).toLowerCase().includes(q);
    }, $('#inpCount'));
  }
  ['#inpSearch'].forEach((id) => { $(id).oninput = filterInputs; });
  ['#inpGroupFilter', '#inpTypeFilter', '#inpUseFilter'].forEach((id) => { $(id).onchange = filterInputs; });
  // ── Нов параметар (модал) ──
  // Кирилица → латиница за клучот (пр. „Меѓукатна" → MEGUKATNA)
  const TRANSLIT = { а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', ѓ: 'G', е: 'E', ж: 'ZH', з: 'Z', ѕ: 'DZ', и: 'I', ј: 'J', к: 'K', л: 'L', љ: 'LJ', м: 'M', н: 'N', њ: 'NJ', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', ќ: 'K', у: 'U', ф: 'F', х: 'H', ц: 'C', ч: 'CH', џ: 'DZ', ш: 'SH' };
  const keyFrom = (label) => [...label.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  const cleanKey = (k) => k.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const NEW = '__new__';

  // editIdx: null = нов параметар, број = уредување на cfg.inputs[editIdx]
  const pm = { type: 'number', keyTouched: false, editIdx: null };
  const pmEditing = () => pm.editIdx != null;
  const NUM_KINDS = ['number', 'price', 'factor'];
  const pmType = () => (pm.type === 'boolean' ? 'boolean' : 'number');

  function pmFill() {
    $('#pGroup').innerHTML = cfg.inputGroups.map((g) => `<option>${esc(g)}</option>`).join('') + `<option value="${NEW}">+ Нова група…</option>`;
    const excs = [...new Set(cfg.inputs.map((i) => i.exclusive).filter(Boolean))];
    $('#pExc').innerHTML = '<option value="">Без — независен прекинувач</option>' + excs.map((e) => `<option>${esc(e)}</option>`).join('') + `<option value="${NEW}">+ Нова ексклузивна група…</option>`;
    const self = pmEditing() ? cfg.inputs[pm.editIdx].key : null;
    $('#pGate').innerHTML = '<option value="">Секогаш</option>' + cfg.inputs.filter((i) => i.type === 'boolean' && i.key !== self)
      .map((i) => `<option value="${i.key}">${esc(i.label)} (${i.key})</option>`).join('');
  }

  // Прикажува само полињата што важат за избраниот тип + преглед и проверка на клучот
  function pmSync() {
    $('#pError').style.display = 'none';
    const isBool = pm.type === 'boolean', isDer = pm.type === 'derived', isSel = pm.type === 'select';
    $$('#inpModal .pm-num').forEach((el) => { el.style.display = isBool || isSel ? 'none' : ''; });
    $$('#inpModal .pm-select').forEach((el) => { el.style.display = isSel ? '' : 'none'; });
    $$('#inpModal .pm-bool').forEach((el) => { el.style.display = isBool ? '' : 'none'; });
    $$('#inpModal .pm-derived').forEach((el) => { el.style.display = isDer ? '' : 'none'; });
    $('#inpModal .pm-type').style.display = isDer ? 'none' : '';
    // Изведен: нема стандардна вредност ниту услов
    $$('#inpModal .pm-gate').forEach((el) => { if (isDer) el.style.display = 'none'; });
    $('#pDef').closest('.field').style.display = isBool || isDer || isSel ? 'none' : '';
    if (isDer) {
      const f = $('#pFormula').value.trim();
      const vars = formulaKeys().concat('WINDOWS_QTY');
      const e = f ? MDAEngine.validate(f, vars, null) : 'Внесете формула.';
      $('#pFormulaCheck').textContent = e ? '✗ ' + e : '✓ Формулата е валидна';
      $('#pFormulaCheck').style.color = e ? 'var(--accent)' : 'var(--ok, #3b7d3b)';
    }
    $('#pGroupNew').style.display = $('#pGroup').value === NEW ? '' : 'none';
    $('#pExcNew').style.display = $('#pExc').value === NEW ? '' : 'none';
    $('#pReveal').style.display = $('#pGate').value ? '' : 'none';
    if (pm.type === 'price') $('#pUnit').placeholder = 'ден';
    else $('#pUnit').placeholder = pm.type === 'factor' ? '×' : 'm², ком…';

    const key = cleanKey($('#pKey').value);
    const taken = !pmEditing() && key && cfg.inputs.some((x) => x.key === key);
    $('#pKey').classList.toggle('bad', !!taken);
    $('#pKeyHint').textContent = taken ? 'Овој клуч веќе постои — изберете друг.'
      : pmEditing() ? 'Клучот не може да се менува — се користи во формулите и во зачуваните понуди.' : '';
    $('#pKeyHint').style.color = taken ? 'var(--accent)' : '';

    const label = $('#pLabel').value.trim() || (pmEditing() ? 'Параметарот' : 'Новиот параметар');
    const gate = $('#pGate').value;
    const gateInp = gate && cfg.inputs.find((i) => i.key === gate);
    const k = key ? `<code>${esc(key)}</code>` : 'клучот';
    let txt = {
      number: `<b>${esc(label)}</b> ќе биде броен влез. Во формулите го користите како ${k}, пр. <code>${esc(key || 'KLUC')} * 2</code>.`,
      boolean: `<b>${esc(label)}</b> ќе биде прекинувач (1 = вклучен, 0 = исклучен). Во формулите: <code>… * ${esc(key || 'KLUC')}</code> — ставката се наплаќа само кога е вклучен.`,
      price: `<b>${esc(label)}</b> ќе биде цена во денари по проект. Ставете ја во „Формула за цена" на материјал: ${k}.`,
      factor: `<b>${esc(label)}</b> ќе биде коефициент (стандардно 1). Пр. во „Формула за цена": <code>PRICE * ${esc(key || 'KLUC')}</code>.`,
      select: `<b>${esc(label)}</b> ќе биде паѓачко мени со опциите погоре. Изборот се чува со понудата, но <b>не влегува во пресметката</b> и не може да се користи во формули.`,
      derived: `<b>${esc(label)}</b> се пресметува автоматски од формулата. Во другите формули го користите како ${k}.`,
    }[pm.type];
    if (gateInp) txt += ` Важи само кога е вклучено „${esc(gateInp.label)}"${$('#pReveal').classList.contains('on') ? ', а дотогаш полето е скриено' : ''}.`;
    $('#pPreview').innerHTML = txt;
  }

  function openInpModal(idx) {
    const inp = typeof idx === 'number' ? cfg.inputs[idx] : null;
    Object.assign(pm, { type: inp ? inpKind(inp) : 'number', keyTouched: !!inp, editIdx: inp ? idx : null });
    pmFill();
    $$('#pType .seg-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.t === pm.type);
      // При уредување: да/не останува да/не, број/цена/коефициент меѓусебно (прекинувачите се услови и ексклузивни групи)
      // „Избор" чува текст, па не може да се претвори во број и обратно
      const group = (t) => (t === 'boolean' || t === 'select' ? t : 'num');
      b.disabled = !!inp && group(pm.type) !== group(b.dataset.t);
    });
    ['#pLabel', '#pKey', '#pUnit', '#pGroupNew', '#pExcNew', '#pFormula', '#pOptions'].forEach((id) => { $(id).value = ''; });
    $('#pDef').value = 0;
    $('#pReveal').classList.remove('on');
    $('#pDefOn').classList.remove('on');
    $('#pKey').disabled = !!inp;
    $('#inpModalTitle').textContent = inp ? 'Уреди параметар — ' + inp.key : 'Нов параметар';
    $('#pSave').textContent = inp ? 'Зачувај' : 'Додади параметар';
    if (inp) {
      $('#pLabel').value = inp.label || '';
      $('#pKey').value = inp.key;
      $('#pGroup').value = cfg.inputGroups.includes(inp.group) ? inp.group : cfg.inputGroups[0];
      $('#pUnit').value = inp.unit || '';
      $('#pDef').value = inp.def ?? 0;
      $('#pFormula').value = inp.formula || '';
      $('#pOptions').value = (inp.options || []).join('\n');
      $('#pDefOn').classList.toggle('on', !!inp.def);
      $('#pExc').value = inp.exclusive || '';
      $('#pGate').value = inp.gate || '';
      $('#pReveal').classList.toggle('on', !!inp.reveal);
    }
    $('#pError').style.display = 'none';
    pmSync();
    $('#inpModal').classList.add('open');
    $('#pLabel').focus();
  }

  $('#addInput').onclick = () => openInpModal();
  $('#pFormula').oninput = pmSync;
  $('#pDefOn').onclick = () => { $('#pDefOn').classList.toggle('on'); };
  $$('#pType .seg-btn').forEach((b) => {
    b.onclick = () => {
      if (b.disabled) return;
      pm.type = b.dataset.t;
      $$('#pType .seg-btn').forEach((x) => x.classList.toggle('on', x === b));
      const d = $('#pDef');
      if (pm.type === 'factor' && (d.value === '' || +d.value === 0)) d.value = 1;
      else if (pm.type !== 'factor' && +d.value === 1) d.value = 0;
      pmSync();
    };
  });
  $('#pLabel').oninput = () => { if (!pm.keyTouched) $('#pKey').value = keyFrom($('#pLabel').value); pmSync(); };
  $('#pKey').oninput = () => { pm.keyTouched = $('#pKey').value !== ''; $('#pKey').value = cleanKey($('#pKey').value); pmSync(); };
  ['#pGroup', '#pExc', '#pGate'].forEach((id) => { $(id).onchange = pmSync; });
  $('#pReveal').onclick = () => { $('#pReveal').classList.toggle('on'); pmSync(); };

  $('#pSave').onclick = async () => {
    const err = (m) => { $('#pError').textContent = m; $('#pError').style.display = ''; };
    const key = cleanKey($('#pKey').value);
    const label = $('#pLabel').value.trim();
    if (!label) return err('Внесете име на параметарот.');
    if (!key) return err('Внесете клуч (латиница, бројки и _).');
    if (/^[0-9]/.test(key)) return err('Клучот не смее да почнува со бројка.');
    if (!pmEditing() && cfg.inputs.some((x) => x.key === key)) return err('Клучот ' + key + ' веќе постои.');
    let group = $('#pGroup').value;
    if (group === NEW) group = $('#pGroupNew').value.trim();
    if (!group) return err('Внесете име на новата група.');

    const inp = { key, label, group, type: pm.type === 'derived' || pm.type === 'select' ? pm.type : pmType(), def: 0, unit: '' };
    if (pm.type === 'select') {
      const options = [...new Set($('#pOptions').value.split('\n').map((o) => o.trim()).filter(Boolean))];
      if (!options.length) return err('Внесете барем една опција.');
      inp.options = options;
      // Стандардниот избор останува ако опцијата сѐ уште постои
      const prev = pmEditing() ? cfg.inputs[pm.editIdx].def : '';
      inp.def = options.includes(prev) ? prev : '';
      delete inp.unit;
    } else if (pm.type === 'derived') {
      inp.formula = $('#pFormula').value.trim();
      const e = inp.formula ? MDAEngine.validate(inp.formula, formulaKeys().concat('WINDOWS_QTY'), null) : 'Внесете формула.';
      if (e) return err('Формула: ' + e);
      inp.unit = $('#pUnit').value.trim();
      delete inp.def;
    } else if (pm.type === 'boolean') {
      inp.def = $('#pDefOn').classList.contains('on') ? 1 : 0;
      let exc = $('#pExc').value;
      if (exc === NEW) exc = $('#pExcNew').value.trim();
      if ($('#pExc').value === NEW && !exc) return err('Внесете име на ексклузивната група.');
      if (exc) inp.exclusive = exc;
    } else {
      inp.unit = $('#pUnit').value.trim();
      inp.def = parseFloat($('#pDef').value) || 0;
      if (pm.type === 'price' || pm.type === 'factor') inp.role = pm.type;
      if (pm.type === 'factor' && !inp.def) inp.def = 1;
      const gate = $('#pGate').value;
      if (gate) {
        inp.gate = gate;
        if ($('#pReveal').classList.contains('on')) inp.reveal = true;
      }
    }

    if (!cfg.inputGroups.includes(group)) { cfg.inputGroups.push(group); await save('inputGroups'); }
    if (pmEditing()) {
      // Ги задржува другите својства (пр. target), а ги брише исчистените опции
      const cur = cfg.inputs[pm.editIdx];
      for (const k of ['exclusive', 'gate', 'reveal', 'role', 'unit', 'options']) delete cur[k];
      if (inp.type === 'boolean') delete inp.unit;
      Object.assign(cur, inp);
    } else {
      cfg.inputs.push(inp);
    }
    await save('inputs');
    $('#inpModal').classList.remove('open');
    renderInputs();
  };

  // ══ ДОГРАМА ══
  function renderWinDefs() {
    const body = $('#winDefTable tbody');
    body.innerHTML = cfg.windowsDefaults.map((w, i) => `<tr data-i="${i}">
      <td class="mono muted">${i + 1}</td>
      <td><input type="text" value="${esc(w.name)}" style="width:100%;font-family:var(--sans);font-size:13px;padding:5px 7px;border:1px solid var(--line);border-radius:2px;"></td>
      <td class="num"><input type="number" value="${w.qty}" style="width:70px;text-align:right;font-family:var(--mono);padding:5px;border:1px solid var(--line);border-radius:2px;"></td>
      <td class="num"><input type="number" step="any" value="${w.priceEur}" style="width:90px;text-align:right;font-family:var(--mono);padding:5px;border:1px solid var(--line);border-radius:2px;"></td>
      <td><button class="icon-btn del">🗑</button></td>
    </tr>`).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      const [name, qty, price] = tr.querySelectorAll('input');
      name.onchange = async (e) => { cfg.windowsDefaults[i].name = e.target.value; await save('windowsDefaults'); };
      qty.onchange = async (e) => { cfg.windowsDefaults[i].qty = parseFloat(e.target.value) || 0; await save('windowsDefaults'); };
      price.onchange = async (e) => { cfg.windowsDefaults[i].priceEur = parseFloat(e.target.value) || 0; await save('windowsDefaults'); };
      tr.querySelector('.del').onclick = async () => { cfg.windowsDefaults.splice(i, 1); await save('windowsDefaults'); renderWinDefs(); };
    });
  }
  $('#addWinDef').onclick = async () => {
    cfg.windowsDefaults.push({ name: 'нов прозор', qty: 1, priceEur: 0 });
    await save('windowsDefaults');
    renderWinDefs();
  };

  // ══ ПОНУДИ ══
  async function renderQuotes() {
    const body = $('#quoteTable tbody');
    let quotes;
    try { quotes = await api('/api/admin/quotes'); }
    catch (e) {
      if (e.message !== '401') body.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px;">Грешка: ${esc(e.message)}</td></tr>`;
      return;
    }
    quoteCache = {};
    quotes.forEach((q) => { quoteCache[q.id] = q; });
    const area = (qt) => {
      const i = qt.inputs || {};
      const a = (Number(i.AREA_HOUSE) || 0) + (Number(i.AREA_TERRACE) || 0);
      return a ? q(a) + ' m²' : '—';
    };
    const sys = (qt) => {
      const i = qt.inputs || {};
      return i.SIP ? 'СИП' : i.KAMENA ? 'Камена' : '—';
    };
    body.innerHTML = quotes.length ? quotes.map((qt) => `<tr class="q-row" data-id="${qt.id}" style="cursor:pointer;">
      <td class="mono muted">${new Date(qt.createdAt).toLocaleString('mk-MK')}</td>
      <td>${esc(qt.client)}</td>
      <td class="num">${area(qt)}</td>
      <td class="num">${sys(qt)}</td>
      <td class="num">${fmt(qt.totalEur)} €</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn open" title="Отвори во калкулатор">↗</button>
        <button class="icon-btn del" title="Избриши">🗑</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">Нема зачувани понуди.</td></tr>';
    const openQuote = (id) => { const qt = quoteCache[id]; if (qt) loadQuoteIntoCalc(qt); };
    body.querySelectorAll('.q-row').forEach((tr) => {
      tr.querySelector('.open').onclick = (e) => { e.stopPropagation(); openQuote(tr.dataset.id); };
      tr.onclick = () => openQuote(tr.dataset.id);
    });
    body.querySelectorAll('.del').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const id = b.closest('tr').dataset.id;
        if (!confirm('Избриши понуда?')) return;
        try { await api('/api/admin/quotes/' + id, 'DELETE'); } catch (err) { if (err.message !== '401') flash('Грешка: ' + err.message); return; }
        renderQuotes();
      };
    });
  }

  // ══ БАРАЊА (Куќа по мој план) ══
  async function renderInquiries() {
    const body = $('#inquiryTable tbody');
    let list;
    try { list = await api('/api/admin/inquiries'); }
    catch (e) {
      if (e.message !== '401') body.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">Грешка: ${esc(e.message)}</td></tr>`;
      return;
    }
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">Нема пристигнати барања.</td></tr>';
      return;
    }
    body.innerHTML = list.map((q) => {
      const name = [q.firstName, q.lastName].filter(Boolean).join(' ') || '—';
      const contact = [q.phone, q.email].filter(Boolean).join(' · ');
      const detail = [
        q.has && q.has.length ? 'Поседува: ' + q.has.join(', ') : '',
        q.financing ? 'Финансирање: ' + q.financing : '',
        q.message ? 'Порака: ' + q.message : '',
      ].filter(Boolean).map(esc).join('<br>');
      return `<tr data-id="${q.id}">
          <td class="mono muted" style="white-space:nowrap;">${new Date(q.createdAt).toLocaleString('mk-MK')}</td>
          <td>${esc(name)}</td>
          <td style="font-size:12px;">${esc(contact)}</td>
          <td>${esc(q.location || '—')}</td>
          <td>${esc(q.area || '—')}</td>
          <td>${esc(q.budget || '—')}</td>
          <td style="white-space:nowrap;">
            ${detail ? '<button class="icon-btn view" title="Детали">▾</button>' : ''}
            <button class="icon-btn del" title="Избриши">🗑</button>
          </td>
        </tr>${detail ? `<tr class="inq-detail" data-for="${q.id}" style="display:none;"><td colspan="7" style="background:var(--panel);font-size:12.5px;line-height:1.6;color:var(--ink-soft);">${detail}</td></tr>` : ''}`;
    }).join('');
    body.querySelectorAll('.view').forEach((b) => {
      b.onclick = () => {
        const id = b.closest('tr').dataset.id;
        const d = body.querySelector('.inq-detail[data-for="' + id + '"]');
        if (d) d.style.display = d.style.display === 'none' ? '' : 'none';
      };
    });
    body.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('tr').dataset.id;
        if (!confirm('Избриши барање?')) return;
        try { await api('/api/admin/inquiries/' + id, 'DELETE'); } catch (e) { if (e.message !== '401') flash('Грешка: ' + e.message); return; }
        renderInquiries();
      };
    });
  }

  // ══ АНАЛИТИКА ══
  let anData = null; // { daily: {…} }
  let anDays = 30;
  const AN_PV = '#db4b3b';   // прегледи (валидиран пар)
  const AN_VS = '#0e9aa8';   // посети
  const EV_LABEL = { calc_open: 'Отворен калкулатор', calc_summary: 'Стигнати до резиме', quote_request: 'Побарана понуда', inquiry: 'Испратено барање', model_open: 'Отворен модел', phone_click: 'Клик на телефон' };
  const int0 = (v) => new Intl.NumberFormat('mk-MK').format(Math.round(v));

  function lastNDates(n) {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); }
    return out;
  }
  function sumRange(daily, dates) {
    const acc = { pageviews: 0, visits: 0, pages: {}, devices: {}, browsers: {}, referrers: {}, events: {} };
    const add = (dst, src) => { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; };
    dates.forEach((dt) => {
      const d = daily[dt]; if (!d) return;
      acc.pageviews += d.pageviews || 0; acc.visits += d.visits || 0;
      add(acc.pages, d.pages || {}); add(acc.devices, d.devices || {});
      add(acc.browsers, d.browsers || {}); add(acc.referrers, d.referrers || {}); add(acc.events, d.events || {});
    });
    return acc;
  }
  function topList(obj, n) {
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n || 6);
  }
  function delta(cur, prev) {
    if (!prev) return cur ? { cls: 'up', txt: '▲ ново' } : { cls: 'flat', txt: '—' };
    const p = Math.round(((cur - prev) / prev) * 100);
    if (p > 0) return { cls: 'up', txt: '▲ ' + p + '%' };
    if (p < 0) return { cls: 'down', txt: '▼ ' + Math.abs(p) + '%' };
    return { cls: 'flat', txt: '0%' };
  }

  // SVG линиско-површински график: прегледи (површина+линија) + посети (линија)
  function timeChart(dates, daily) {
    const W = 720, H = 220, padL = 34, padR = 12, padT = 14, padB = 26;
    const pv = dates.map((d) => (daily[d] && daily[d].pageviews) || 0);
    const vs = dates.map((d) => (daily[d] && daily[d].visits) || 0);
    const max = Math.max(1, ...pv, ...vs);
    const nMax = Math.ceil(max / 4) * 4 || 4;
    const x = (i) => padL + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * (W - padL - padR));
    const y = (v) => padT + (1 - v / nMax) * (H - padT - padB);
    const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const area = `${path(pv)} L${x(pv.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
    // y-мрежа (4 линии)
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const yy = padT + (g / 4) * (H - padT - padB); const val = Math.round(nMax * (1 - g / 4));
      grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#e7e1d6" stroke-width="1"/>`;
      grid += `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono" font-size="9" fill="#9a9ea3">${val}</text>`;
    }
    // x-ознаки (макс ~6)
    let xlab = '';
    const step = Math.max(1, Math.ceil(dates.length / 6));
    dates.forEach((d, i) => { if (i % step === 0 || i === dates.length - 1) xlab += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9" fill="#9a9ea3">${d.slice(5)}</text>`; });
    const dotsV = vs.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="0" fill="${AN_VS}"/>`).join('');
    return { svg: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
        ${grid}
        <path d="${area}" fill="${AN_PV}" fill-opacity="0.12"/>
        <path d="${path(pv)}" fill="none" stroke="${AN_PV}" stroke-width="2" stroke-linejoin="round"/>
        <path d="${path(vs)}" fill="none" stroke="${AN_VS}" stroke-width="2" stroke-linejoin="round"/>
        ${dotsV}${xlab}
        <line id="anCross" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="#322f2b" stroke-width="1" opacity="0"/>
      </svg>`, geo: { W, H, padL, padR, x, y, pv, vs } };
  }

  function barList(items, total, empty) {
    if (!items.length) return `<div class="an-empty">${esc(empty || 'Нема податоци')}</div>`;
    const max = Math.max(...items.map((i) => i[1]), 1);
    return items.map(([k, v]) => `<div class="an-bar-row">
      <span class="lbl" title="${esc(k)}">${esc(k)}</span>
      <span class="track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span>
      <span class="val">${int0(v)}</span></div>`).join('');
  }

  async function renderAnalytics() {
    const host = $('#anBody');
    if (!anData) {
      host.innerHTML = '<div class="an-empty">Се вчитува…</div>';
      try { anData = await api('/api/admin/analytics'); }
      catch (e) { if (e.message !== '401') host.innerHTML = `<div class="error-note">Грешка: ${esc(e.message)}</div>`; return; }
    }
    const daily = anData.daily || {};
    const dates = lastNDates(anDays);
    const prevDates = lastNDates(anDays * 2).slice(0, anDays);
    const cur = sumRange(daily, dates);
    const prev = sumRange(daily, prevDates);
    const kpi = (k, val, prevVal) => { const d = delta(val, prevVal); return `<div class="an-kpi"><div class="k">${k}</div><div class="v">${int0(val)}</div><div class="d ${d.cls}">${d.txt}</div></div>`; };

    const chart = timeChart(dates, daily);
    const dev = cur.devices; const devTotal = (dev['Мобилен'] || 0) + (dev['Десктоп'] || 0);
    const mob = dev['Мобилен'] || 0, desk = dev['Десктоп'] || 0;
    const funnelSteps = ['calc_open', 'calc_summary', 'quote_request', 'inquiry'];
    const fmax = Math.max(cur.events.calc_open || 0, 1);

    host.innerHTML = `
      <div class="an-kpis">
        ${kpi('Прегледи', cur.pageviews, prev.pageviews)}
        ${kpi('Посети', cur.visits, prev.visits)}
        ${kpi('Побарана понуда', cur.events.quote_request || 0, prev.events.quote_request || 0)}
        ${kpi('Испратени барања', cur.events.inquiry || 0, prev.events.inquiry || 0)}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-head">
          <h3>Сообраќај</h3>
          <div class="an-legend"><span><i style="background:${AN_PV}"></i>Прегледи</span><span><i style="background:${AN_VS}"></i>Посети</span></div>
        </div>
        <div class="card-body"><div class="an-chart" id="anChart">${chart.svg}<div class="an-tip" id="anTip"></div></div></div>
      </div>

      <div class="an-grid2">
        <div class="card"><div class="card-head"><h3>Најпосетени страници</h3></div>
          <div class="card-body">${barList(topList(cur.pages), cur.pageviews, 'Нема прегледи')}</div></div>
        <div class="card"><div class="card-head"><h3>Извори на сообраќај</h3></div>
          <div class="card-body">${barList(topList(cur.referrers), cur.pageviews, 'Нема податоци')}</div></div>
      </div>

      <div class="an-grid2" style="margin-top:16px;">
        <div class="card"><div class="card-head"><h3>Уреди</h3></div>
          <div class="card-body">
            ${devTotal ? `<div class="an-split">
              <span style="background:${AN_PV};width:${(mob / devTotal * 100).toFixed(1)}%">${mob ? Math.round(mob / devTotal * 100) + '%' : ''}</span>
              <span style="background:#9a9ea3;width:${(desk / devTotal * 100).toFixed(1)}%">${desk ? Math.round(desk / devTotal * 100) + '%' : ''}</span>
            </div>
            <div class="an-split-legend"><span>📱 Мобилен · ${int0(mob)}</span><span>🖥 Десктоп · ${int0(desk)}</span></div>` : '<div class="an-empty">Нема податоци</div>'}
            <div style="margin-top:16px;">${barList(topList(cur.browsers, 5), 0, 'Нема податоци')}</div>
          </div></div>
        <div class="card"><div class="card-head"><h3>Инка (конверзија)</h3></div>
          <div class="card-body">${funnelSteps.map((s) => {
            const v = cur.events[s] || 0; const conv = fmax ? Math.round(v / fmax * 100) : 0;
            return `<div class="an-funnel-row"><span class="lbl">${esc(EV_LABEL[s])}</span>
              <span class="track"><i style="width:${Math.max(conv, v ? 6 : 0)}%">${int0(v)}</i></span>
              <span class="conv">${conv}%</span></div>`;
          }).join('')}
          <p class="hint" style="margin-top:8px;">Процентот е во однос на „Отворен калкулатор".</p></div></div>
      </div>`;

    // Ховер на графикот
    const chartEl = $('#anChart'), tip = $('#anTip'), cross = document.getElementById('anCross');
    const svg = chartEl.querySelector('svg'), g = chart.geo;
    chartEl.onmousemove = (e) => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * g.W;
      let idx = Math.round((sx - g.padL) / ((g.W - g.padL - g.padR) / Math.max(1, dates.length - 1)));
      idx = Math.max(0, Math.min(dates.length - 1, idx));
      const px = g.x(idx) / g.W * r.width;
      cross.setAttribute('x1', g.x(idx)); cross.setAttribute('x2', g.x(idx)); cross.setAttribute('opacity', '0.35');
      tip.style.opacity = '1'; tip.style.left = px + 'px'; tip.style.top = (e.clientY - r.top - 12) + 'px';
      tip.innerHTML = `<b>${dates[idx]}</b><br>Прегледи: ${int0(g.pv[idx])}<br>Посети: ${int0(g.vs[idx])}`;
    };
    chartEl.onmouseleave = () => { tip.style.opacity = '0'; cross.setAttribute('opacity', '0'); };
  }
  $('#anRange').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      $('#anRange').querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      anDays = +b.dataset.days;
      renderAnalytics();
    };
  });

  // ══ ПОДЕСУВАЊА ══
  function renderSettings() {
    $('#setCompany').value = cfg.settings.companyName || '';
    $('#setPhone').value = cfg.settings.phone || '';
    $('#setVat').value = cfg.settings.vatPct;
    $('#setRate').value = cfg.settings.eurRate;
    $('#setWinM2').value = cfg.settings.windowEurM2 || 150;
  }
  $('#saveSettings').onclick = async () => {
    const body = {
      companyName: $('#setCompany').value,
      phone: $('#setPhone').value,
      vatPct: parseFloat($('#setVat').value) || 18,
      eurRate: parseFloat($('#setRate').value) || 62,
      windowEurM2: parseFloat($('#setWinM2').value) || 150,
    };
    const pw = $('#setPw').value.trim();
    if (pw) body.adminPassword = pw;
    try { await api('/api/admin/settings', 'PUT', body); }
    catch (e) { if (e.message !== '401') flash('Грешка при зачувување: ' + e.message); return; }
    Object.assign(cfg.settings, body);
    $('#setPw').value = '';
    flash();
  };

  // ══ РЕЗЕРВНА КОПИЈА / ПРЕНОС ══
  $('#exportBtn').onclick = async () => {
    const r = await fetch('/api/admin/export', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { $('#backupNote').textContent = 'Грешка при извоз.'; return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mda-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    $('#backupNote').textContent = 'Симната резервна копија ✓';
  };
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const note = $('#backupNote');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      note.style.color = 'var(--accent)';
      note.textContent = 'Датотеката не е валиден JSON.';
      e.target.value = '';
      return;
    }
    try {
      if (!confirm('Ова ќе ја замени ЦЕЛАТА тековна база со податоците од датотеката. Продолжи?')) { e.target.value = ''; return; }
      const res = await api('/api/admin/import', 'POST', data);
      note.style.color = '#2e7d32';
      note.textContent = 'Внесени ' + res.materials + ' материјали ✓ — се вчитува повторно…';
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      if (err.message === '401') return;
      note.style.color = 'var(--accent)';
      note.textContent = 'Внесот не успеа: ' + err.message;
    }
    e.target.value = '';
  };

  /* ══════════ ПОЛН КАЛКУЛАТОР (интерен) ══════════ */
  let offerTpl = null;
  let offerErr = '';
  let calcRes = null;
  let quoteCache = {};
  const calc = { inputs: {}, windows: [], discountEur: 0, client: '', date: '', covered: 0, open: null, outerH: 4.6 };

  const rate = () => cfg.settings.eurRate || 62;
  const eur0 = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' €';
  const eur2 = (v) => new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const mkd0 = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ден';
  const q = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(v);
  const today = () => new Date().toLocaleDateString('mk-MK');
  const r2 = (v) => Math.round(v * 100) / 100;

  // Стандардната дограма е означена (def) за да ја замени дограмата од планот
  const defaultWindows = () => (cfg.windowsDefaults || []).map((w) => Object.assign({}, w, { def: true }));

  function calcDefaults() {
    calc.inputs = {};
    cfg.inputs.forEach((i) => { if (i.type !== 'derived') calc.inputs[i.key] = i.def; });
    calc.windows = defaultWindows();
    calc.discountEur = 0;
    calc.terraceType = 'open';
    calc.terraceType2 = 'covered';
    calc.plan = null;
    calc.loaded = null;
    resetOfferSel();
    syncTerrace();
    calc.outerH = 4.6;
  }

  // Избор на елементи во печатената понуда (по варијанта): исклучени, додадени, избришани и редослед.
  // Без понуда → сè стандардно; со понуда → се презема зачуваното.
  const OFFER_SEL_KEYS = ['offerExclude', 'offerExtra', 'offerDeleted', 'offerOrder'];
  function resetOfferSel(qt) {
    OFFER_SEL_KEYS.forEach((k) => {
      calc[k] = { turnkey: {}, grey: {} };
      const src = qt && qt[k];
      if (src) ['turnkey', 'grey'].forEach((v) => Object.assign(calc[k][v], JSON.parse(JSON.stringify(src[v] || {}))));
    });
  }

  // Куќа на два ката: површината на куќа и тераса е збир од двата ката (исто како во моторот)
  const twoFloors = () => !!calc.inputs.TWO_FLOORS;
  function sumFloors() {
    if (!twoFloors()) return;
    const i = calc.inputs;
    i.AREA_HOUSE = (i.AREA_F1 || 0) + (i.AREA_F2 || 0);
    i.AREA_TERRACE = (i.TERRACE_F1 || 0) + (i.TERRACE_F2 || 0);
    const tot = $('#ciHouseTotal');
    if (tot) tot.value = q(i.AREA_HOUSE);
  }

  // Кај два ката меѓукатната конструкција е вклучена и има површина колку вториот кат
  function syncMegukatna() {
    if (!twoFloors()) return;
    calc.inputs.MEGUKATNA = 1;
    calc.inputs.MEGUKATNA_M2 = calc.inputs.AREA_F2 || 0;
    const el = $('#cInputs input[data-key="MEGUKATNA_M2"]');
    if (el) el.value = calc.inputs.MEGUKATNA_M2;
  }

  // Вклучување/исклучување на втор кат: првиот кат ги презема/враќа досегашните вредности
  function setTwoFloors(on) {
    const i = calc.inputs;
    if (on) {
      if (!(i.AREA_F1 > 0) && !(i.AREA_F2 > 0)) i.AREA_F1 = i.AREA_HOUSE || 0;
      if (!(i.TERRACE_F1 > 0) && !(i.TERRACE_F2 > 0)) i.TERRACE_F1 = i.AREA_TERRACE || 0;
      // Втор кат уште непополнет → иста висина како првиот
      if (!(i.WALL_OUT2 > 0) && !(i.WALL_IN2 > 0)) i.FLOOR_H2 = i.FLOOR_H || 0;
      i.TWO_FLOORS = 1;
      sumFloors();
      syncMegukatna();
    } else {
      i.TWO_FLOORS = 0;
      i.MEGUKATNA = 0;
      i.MEGUKATNA_M2 = 0;
      i.AREA_HOUSE = i.AREA_F1 || 0;
      i.AREA_TERRACE = i.TERRACE_F1 || 0;
    }
    syncTerrace();
  }

  // Терасите одат во избраното поле (покриени / откриени); кај два ката секој кат посебно
  function syncTerrace() {
    const i = calc.inputs;
    const ters = twoFloors()
      ? [[i.TERRACE_F1, calc.terraceType], [i.TERRACE_F2, calc.terraceType2]]
      : [[i.AREA_TERRACE, calc.terraceType]];
    calc.covered = ters.reduce((s, [a, t]) => s + (t === 'covered' ? a || 0 : 0), 0);
    calc.open = ters.reduce((s, [a, t]) => s + (t === 'open' ? a || 0 : 0), 0);
    const c = $('#cCovered'), o = $('#cOpen');
    if (c) c.value = calc.covered;
    if (o) o.value = calc.open;
  }

  // Откриени тераси; површината со симсови е формулата AREA_SIMS (табот ПРЕСМЕТКА)
  const openTer = () => calc.open || 0;

  // Пресметка за тековниот калкулатор; терасите (покриени/откриени) влегуваат во површината со симсови
  const computeCalc = (db = cfg) => MDAEngine.compute(db, { inputs: calc.inputs, windows: calc.windows, discountEur: calc.discountEur, covered: calc.covered || 0, open: openTer() });

  function recalcAdmin() {
    calcRes = computeCalc();
    const r = calcRes;
    $('#cTotalEur').textContent = eur2(r.totalEur);
    $('#cTotalMkd').textContent = mkd0(r.totalEur * rate());
    $('#cTax').textContent = eur2(r.taxEur);
    $('#cPerM2').textContent = eur2(r.perM2);
    $('#cArea').textContent = q(r.area) + ' m²';
    $('#cGrey').textContent = eur2(r.greyEur);
    $('#cGreyM2').textContent = eur2(r.greyPerM2);
    $('#cFinal').textContent = eur2(r.finalEur);
    $('#cPerM2Sims').textContent = eur2(r.finalPerM2Sims);

    $('#cRecap').innerHTML = r.byCat.filter((c) => c.eur > 0.005)
      .map((c) => `<div class="c-cat"><span>${esc(c.name)}</span><b>${eur0(c.eur)}</b></div>`).join('');

    const rows = r.rows.filter((x) => x.totalMkd > 0.005);
    $('#cRowCount').textContent = rows.length + ' ставки';
    $('#cSpecTable tbody').innerHTML = cfg.categories.map((cat) => {
      const rs = rows.filter((x) => x.cat === cat.id);
      if (!rs.length) return '';
      const sum = rs.reduce((s, x) => s + x.eur, 0);
      return `<tr class="cat-row"><td colspan="6">${esc(cat.name)}</td><td class="num">${eur0(sum)}</td></tr>` +
        rs.map((x) => `<tr><td class="mono muted">${x.code || '—'}</td><td>${esc(x.name)}</td><td class="muted">${esc(x.unit)}</td>
          <td class="num">${q(x.qty)}</td><td class="num">${q(x.price)}</td><td class="num">${mkd0(x.totalMkd)}</td><td class="num">${eur2(x.eur)}</td></tr>`).join('');
    }).join('');

    $('#cErrors').innerHTML = r.errors.length
      ? `<div class="error-note">Грешки во формулите: ${r.errors.map(esc).join('; ')}</div>` : '';
  }

  // Основни мерки што мора да се пополнат — 0 се означува со црвено (терасата и симсот смеат да бидат 0)
  const ZERO_OK = ['AREA_TERRACE', 'SIMS', 'TERRACE_F1', 'TERRACE_F2'];
  const warnZero = (key) => cfg.inputs.some((i) => i.key === key && i.group === 'ОСНОВНИ МЕРКИ') && !ZERO_OK.includes(key);
  const markZero = (el) => el.classList.toggle('is-zero', warnZero(el.dataset.key) && !(parseFloat(el.value) > 0));

  // Полето е активно ако нема услов, или ако придружниот прекинувач е вклучен.
  const gateOpen = (inp) => !inp.gate || !!calc.inputs[inp.gate];

  const inpOf = (key) => cfg.inputs.find((i) => i.key === key);
  const unitHtml = (u) => (u ? `<span class="unit">${esc(u)}</span>` : '');

  function numFieldHtml(inp, label, cls = '') {
    return `<div class="field${cls ? ' ' + cls : ''}" data-field="${inp.key}">
      <label>${esc(label || inp.label)}${unitHtml(inp.unit)}</label>
      <input type="number" step="any" min="0" data-key="${inp.key}" value="${calc.inputs[inp.key] ?? 0}"></div>`;
  }

  // Тераса: избор покриена/откриена + површина. typeProp е полето во calc што го чува изборот.
  function terraceHtml(key, typeProp, label) {
    const inp = inpOf(key);
    return `<div class="field ci-terrace">
      <label>${esc(label || inp.label)}${unitHtml(inp.unit)}</label>
      <div class="ter-row"><div class="seg">${[['covered', 'Покриена тераса'], ['open', 'Откриена тераса']].map(([t, l]) =>
        `<button type="button" class="seg-btn${calc[typeProp] === t ? ' on' : ''}" data-ter="${t}" data-ter-prop="${typeProp}">${l}</button>`).join('')}</div>
      <input type="number" step="any" min="0" data-key="${key}" value="${calc.inputs[key] ?? 0}"></div>
    </div>`;
  }

  // ОСНОВНИ МЕРКИ — еден или два ката. Кај два ката: заеднички мерки + посебен блок за секој кат.
  // extra: HTML за дополнителните параметри додадени во оваа група (се прикажуваат на крајот)
  function basicGroupHtml(g, extra = '') {
    const has = (k) => !!inpOf(k);
    const toggle = has('TWO_FLOORS') ? `<label class="toggle${twoFloors() ? ' on' : ''}" data-key="TWO_FLOORS">
      <span class="t-label">${esc(inpOf('TWO_FLOORS').label)}</span><span class="knob"></span></label>` : '';
    const f = (k, label, cls) => (has(k) ? numFieldHtml(inpOf(k), label, cls) : '');
    const head = `<div class="ci-group"><h4>${esc(g)}</h4>`;

    if (!twoFloors()) {
      return head + `<div class="ci-grid">${toggle}${f('AREA_HOUSE')}${terraceHtml('AREA_TERRACE', 'terraceType')}${f('FLOOR_H')}
        ${f('WALL_OUT', null, 'ci-break')}${f('WALL_IN')}${f('ROOF')}${f('SIMS')}</div>${extra}</div>`;
    }

    const floor = (n, area, ter, typeProp, h, wo, wi) => `<h5 class="ci-floor">${n} кат</h5><div class="ci-grid">
      ${f(area, 'Површина на кат')}${terraceHtml(ter, typeProp, 'Површина на тераса')}${f(h, 'Висина на кат')}
      ${f(wo, 'Надворешни ѕидови должина', 'ci-break')}${f(wi, 'Внатрешни ѕидови должина')}</div>`;
    const house = inpOf('AREA_HOUSE');
    return head + `<div class="ci-grid">${toggle}
        <div class="field"><label>${esc(house.label)} (вкупно)${unitHtml(house.unit)}</label>
          <input type="text" id="ciHouseTotal" value="${q(calc.inputs.AREA_HOUSE || 0)}" readonly tabindex="-1"></div>
        ${f('ROOF')}${f('SIMS')}</div>
      ${floor('Прв', 'AREA_F1', 'TERRACE_F1', 'terraceType', 'FLOOR_H', 'WALL_OUT', 'WALL_IN')}
      ${floor('Втор', 'AREA_F2', 'TERRACE_F2', 'terraceType2', 'FLOOR_H2', 'WALL_OUT2', 'WALL_IN2')}${extra}</div>`;
  }

  // Клучеви што ги прикажува basicGroupHtml и не смеат да се исцртаат генерички
  const TERRACE_KEYS = ['AREA_TERRACE', 'TERRACE_F1', 'TERRACE_F2'];
  const FLOOR_KEYS = ['AREA_F1', 'AREA_F2', ...TERRACE_KEYS];
  // Сите полиња што basicGroupHtml ги исцртува со посебен распоред
  const BASIC_KEYS = ['TWO_FLOORS', 'AREA_HOUSE', 'FLOOR_H', 'WALL_OUT', 'WALL_IN', 'ROOF', 'SIMS', 'FLOOR_H2', 'WALL_OUT2', 'WALL_IN2', ...FLOOR_KEYS];

  function renderCalcInputs() {
    const host = $('#cInputs');
    host.innerHTML = cfg.inputGroups.map((g) => {
      const fields = cfg.inputs.filter((i) => i.group === g && i.type !== 'derived');
      if (!fields.length) return '';
      if (g === 'ОСНОВНИ МЕРКИ') {
        // Новите параметри во оваа група (пр. паѓачко мени) не смеат да исчезнат од калкулаторот
        const extra = fields.filter((i) => !BASIC_KEYS.includes(i.key));
        return basicGroupHtml(g, extra.length ? `<div class="ci-grid" style="margin-top: 14px;">${fieldsHtml(extra)}</div>` : '');
      }
      return `<div class="ci-group"><h4>${esc(g)}</h4><div class="ci-grid">${fieldsHtml(fields)}</div></div>`;
    }).join('');
    bindCalcInputs(host);
  }

  // Генерички полиња за една група: ексклузивни избирачи, прекинувачи, паѓачки менија и бројки
  function fieldsHtml(fields) {
    const done = new Set();
    return fields.map((inp) => {
      if (done.has(inp.key)) return '';

      // Ексклузивна група → еден избирач наместо повеќе независни прекинувачи,
      // за да не може двата система да бидат вклучени истовремено.
      if (inp.type === 'boolean' && inp.exclusive) {
        const opts = fields.filter((f) => f.exclusive === inp.exclusive);
        opts.forEach((o) => done.add(o.key));
        return `<div class="field ci-exc" data-exc="${esc(inp.exclusive)}">
          <label>${esc(inp.exclusive)}</label>
          <div class="seg">${opts.map((o) => `<button type="button" class="seg-btn${calc.inputs[o.key] ? ' on' : ''}" data-key="${o.key}">${esc(o.label)}</button>`).join('')}
            <button type="button" class="seg-btn seg-none${opts.some((o) => calc.inputs[o.key]) ? '' : ' on'}" data-key="">нема</button></div>
        </div>`;
      }

      if (inp.type === 'select') {
        return `<div class="field" data-field="${inp.key}"><label>${esc(inp.label)}</label>${selectHtml(inp, calc.inputs[inp.key])}</div>`;
      }

      if (inp.type === 'boolean') {
        return `<label class="toggle${calc.inputs[inp.key] ? ' on' : ''}" data-key="${inp.key}">
          <span class="t-label">${esc(inp.label)}</span><span class="knob"></span></label>`;
      }

      const open = gateOpen(inp);
      const unit = inp.role === 'factor' ? '×' : (inp.unit || '');
      return `<div class="field${inp.gate ? ' ci-gated' : ''}${inp.reveal ? ' ci-reveal' : ''}${open ? '' : ' off'}" data-field="${inp.key}" data-gated-by="${esc(inp.gate || '')}">
        <label>${esc(inp.label)}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</label>
        <input type="number" step="any" min="0" data-key="${inp.key}" value="${calc.inputs[inp.key]}"${open ? '' : ' disabled'}></div>`;
    }).join('');
  }

  function bindCalcInputs(host) {

    // Ги вклучува/исклучува условените полиња без повторно исцртување (курсорот останува во полето)
    const refreshGates = () => {
      host.querySelectorAll('.ci-gated').forEach((el) => {
        const open = !!calc.inputs[el.dataset.gatedBy];
        el.classList.toggle('off', !open);
        el.querySelector('input').disabled = !open;
      });
    };

    host.querySelectorAll('input[data-key]').forEach((el) => {
      markZero(el);
      el.oninput = () => {
        calc.inputs[el.dataset.key] = nonNeg(el);
        markZero(el);
        if (FLOOR_KEYS.includes(el.dataset.key)) sumFloors();
        if (el.dataset.key === 'AREA_F2') syncMegukatna();
        if (TERRACE_KEYS.includes(el.dataset.key)) syncTerrace();
        recalcAdmin();
      };
    });
    // „Избор" само се запишува за понудата — не ја менува цената
    host.querySelectorAll('select[data-key]').forEach((el) => {
      el.onchange = () => { calc.inputs[el.dataset.key] = el.value; };
    });
    host.querySelectorAll('.seg-btn[data-ter]').forEach((b) => {
      b.onclick = () => {
        calc[b.dataset.terProp] = b.dataset.ter;
        b.parentElement.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x === b));
        syncTerrace();
        recalcAdmin();
      };
    });
    host.querySelectorAll('.toggle[data-key]').forEach((el) => {
      el.onclick = () => {
        const k = el.dataset.key;
        if (k === 'TWO_FLOORS') { setTwoFloors(!twoFloors()); renderCalcInputs(); recalcAdmin(); return; }
        calc.inputs[k] = calc.inputs[k] ? 0 : 1;
        el.classList.toggle('on', !!calc.inputs[k]);
        refreshGates();
        recalcAdmin();
      };
    });
    host.querySelectorAll('.ci-exc').forEach((box) => {
      const btns = box.querySelectorAll('.seg-btn');
      btns.forEach((b) => {
        b.onclick = () => {
          btns.forEach((x) => { if (x.dataset.key) calc.inputs[x.dataset.key] = 0; x.classList.remove('on'); });
          if (b.dataset.key) calc.inputs[b.dataset.key] = 1;
          b.classList.add('on');
          refreshGates();
          recalcAdmin();
        };
      });
    });
  }

  // Чита број од поле во калкулаторот; негативна вредност ја враќа на 0 (и во самото поле)
  function nonNeg(el) {
    const v = parseFloat(el.value) || 0;
    if (v < 0) { el.value = 0; return 0; }
    return v;
  }

  function renderCalcWindows() {
    const body = $('#cWinTable tbody');
    body.innerHTML = '';
    calc.windows.forEach((w, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono muted">${i + 1}</td>
        <td><input type="text" value="${esc(w.name)}"></td>
        <td class="num"><input type="number" step="any" min="0" style="width:70px;text-align:right;" value="${w.qty}"></td>
        <td class="num"><input type="number" step="any" min="0" style="width:84px;text-align:right;" value="${w.priceEur}"></td>
        <td><button class="icon-btn del" title="Избриши">🗑</button></td>`;
      const [n, qi, p] = tr.querySelectorAll('input');
      n.oninput = (e) => { w.name = e.target.value; };
      qi.oninput = (e) => { w.qty = nonNeg(e.target); recalcAdmin(); };
      p.oninput = (e) => { w.priceEur = nonNeg(e.target); recalcAdmin(); };
      tr.querySelector('.del').onclick = () => { calc.windows.splice(i, 1); renderCalcWindows(); recalcAdmin(); };
      body.appendChild(tr);
    });
  }

  function syncCalcFields() {
    $('#cClient').value = calc.client;
    $('#cDate').value = calc.date || today();
    $('#cDiscount').value = calc.discountEur;
    $('#cCovered').value = calc.covered;
    $('#cOpen').value = openTer();
    $('#cOuterH').value = calc.outerH;
  }

  // Вчитува и ВАЛИДИРА го шаблонот; враќа null ако серверот не го дава (стар процес → 404)
  async function loadOfferTpl() {
    try {
      const t = await api('/api/admin/offer');
      const ok = t && t.turnkey && t.grey && Array.isArray(t.payment)
        && Array.isArray(t.turnkey.sections) && Array.isArray(t.grey.sections);
      if (!ok) throw new Error('неочекуван формат на шаблонот');
      return t;
    } catch (e) {
      if (e.message === '401') return null;
      offerErr = e.status === 404
        ? 'Серверот нема /api/admin/offer — рестартирајте го серверот (node server.js).'
        : 'Шаблонот за понуда не се вчита: ' + e.message;
      return null;
    }
  }

  async function renderCalc() {
    if (!offerTpl) offerTpl = await loadOfferTpl();
    if (!Object.keys(calc.inputs).length) { calcDefaults(); calc.date = today(); }
    syncCalcFields();
    renderCalcInputs();
    renderCalcWindows();
    recalcAdmin();
    planBtn();
  }

  // Вчитува зачувана понуда во калкулаторот (полн приказ + печатење)
  function loadQuoteIntoCalc(qt) {
    calc.inputs = {};
    cfg.inputs.forEach((i) => { if (i.type !== 'derived') calc.inputs[i.key] = i.def; });
    Object.assign(calc.inputs, qt.inputs || {});
    // Понуда зачувана без прозори останува без прозори — инаку вчитаната цена не би се совпаднала со зачуваната
    calc.windows = Array.isArray(qt.windows)
      ? JSON.parse(JSON.stringify(qt.windows))
      : defaultWindows();
    calc.discountEur = qt.discountEur || 0;
    calc.client = qt.client === 'Без име' ? '' : (qt.client || '');
    calc.date = qt.createdAt ? new Date(qt.createdAt).toLocaleDateString('mk-MK') : today();
    calc.terraceType = 'open';
    calc.terraceType2 = 'covered';
    calc.plan = qt.plan || null;
    resetOfferSel(qt);
    sumFloors();
    syncTerrace();
    calc.outerH = 4.6;
    calc.loadedId = qt.id;
    calc.loaded = { client: qt.client, createdAt: qt.createdAt, totalEur: Number(qt.totalEur) || 0 };
    document.querySelector('.tabs button[data-tab="calc"]').click();
    syncCalcFields();
    renderCalcInputs();
    renderCalcWindows();
    recalcAdmin();
    $('#cNote').style.color = 'var(--ink-soft)';
    planBtn();
    $('#cNote').textContent = 'Вчитана зачувана понуда од ' + calc.date + (calc.client ? ' · ' + calc.client : '');
  }

  // План на куќа: цртежот ги пополнува мерките (ѕидови, површина, врати, WC, под)
  const planBtn = () => { $('#cPlan').textContent = calc.plan && calc.plan.floors.some((f) => f.walls.length) ? '✏ Уреди план' : '✏ Нацртај план'; };
  $('#cPlan').onclick = () => {
    const labels = {};
    cfg.inputs.forEach((i) => { labels[i.key] = i.label; });
    const heights = [calc.inputs.FLOOR_H, calc.inputs.FLOOR_H2];
    MDAPlanner.open(calc.plan, { floors: twoFloors() ? 2 : 1, labels, heights, eurM2: cfg.settings.windowEurM2 || 150, mat3d: resolveMat3d(calc.inputs) }, (patch, plan, extra) => {
      calc.plan = plan;
      const done = [];
      // Бројот на катови го одредува планот — прво тоа, бидејќи ги префрла површините
      if ('TWO_FLOORS' in patch && !!patch.TWO_FLOORS !== twoFloors()) { setTwoFloors(!!patch.TWO_FLOORS); done.push(labels.TWO_FLOORS || 'TWO_FLOORS'); }
      for (const [k, v] of Object.entries(patch)) if (k !== 'TWO_FLOORS' && inpOf(k)) { calc.inputs[k] = v; done.push(labels[k] || k); }
      // Тераси: видот по кат е поголемиот дел, а покриени/откриени m² се точно од планот
      const ter = extra && extra.terraces;
      if (ter) ter.forEach((t, i) => { if (t.covered || t.open) calc[i ? 'terraceType2' : 'terraceType'] = t.covered >= t.open ? 'covered' : 'open'; });
      sumFloors();
      syncMegukatna();
      syncTerrace();
      if (ter) {
        calc.covered = r2(ter.reduce((s, t) => s + t.covered, 0));
        calc.open = r2(ter.reduce((s, t) => s + t.open, 0));
        syncCalcFields();
      }
      // Дограма: редовите од планот ги заменуваат претходните од планот и стандардните
      if (extra && extra.windows.length) {
        calc.windows = calc.windows.filter((w) => !w.plan && !w.def).concat(extra.windows);
        done.push('дограма');
      } else if (calc.windows.some((w) => w.plan)) {
        // Сите прозори се избришани од планот → назад кон стандардната дограма
        calc.windows = calc.windows.filter((w) => !w.plan);
        if (!calc.windows.length) calc.windows = defaultWindows();
      }
      renderCalcWindows();
      if (extra && extra.outerH) { calc.outerH = extra.outerH; $('#cOuterH').value = calc.outerH; }
      renderCalcInputs();
      recalcAdmin();
      planBtn();
      $('#cNote').style.color = 'var(--ink-soft)';
      $('#cNote').textContent = done.length ? 'Од планот: ' + done.join(', ') : 'Планот е зачуван (нема мерки за пополнување).';
    });
  };

  $('#cReset').onclick = () => { calcDefaults(); calc.date = today(); syncCalcFields(); renderCalcInputs(); renderCalcWindows(); recalcAdmin(); planBtn(); };
  $('#cAddWin').onclick = () => { calc.windows.push({ name: '', qty: 1, priceEur: 0 }); renderCalcWindows(); recalcAdmin(); };
  $('#cClient').oninput = (e) => { calc.client = e.target.value; };
  $('#cDate').oninput = (e) => { calc.date = e.target.value; };
  $('#cDiscount').oninput = (e) => { calc.discountEur = nonNeg(e.target); recalcAdmin(); };
  $('#cCovered').oninput = (e) => { calc.covered = nonNeg(e.target); recalcAdmin(); };
  $('#cOpen').oninput = (e) => { calc.open = nonNeg(e.target); recalcAdmin(); };
  $('#cOuterH').oninput = (e) => { calc.outerH = nonNeg(e.target); };

  $('#cSaveQuote').onclick = async () => {
    const r = await fetch('/api/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: calc.client.trim() || 'Без име', inputs: calc.inputs, windows: calc.windows, discountEur: calc.discountEur, totalEur: calcRes.totalEur, plan: calc.plan, offerExclude: calc.offerExclude, offerExtra: calc.offerExtra, offerDeleted: calc.offerDeleted, offerOrder: calc.offerOrder }),
    }).then((x) => x.json());
    calc.loaded = { client: calc.client.trim() || 'Без име', createdAt: new Date().toISOString(), totalEur: calcRes.totalEur };
    $('#cNote').innerHTML = 'Зачувано ✓ <a href="index.html?quote=' + r.id + '" target="_blank">линк</a>';
  };

  /* ── ПРЕСМЕТКА: формули за крајната цена и сивата фаза (уредливи) + објаснување ── */
  const STEPS = MDAEngine.RESULT_STEPS;
  let xDraft = null; // формули што се уредуваат (клуч → формула); null = нема незачувани измени

  // Опис на променливите што смеат да се користат во формулите
  const X_VARS = {
    SUM_MKD: 'збир од сите ставки (количина × цена) + прозори, во денари',
    SUM_EUR: 'истиот збир во евра (SUM_MKD ÷ RATE)',
    GREY_SUM: 'збир од ЕУР на ставка × „Фактор сива фаза“',
    WINDOWS_EUR: 'прозори и врати од дограмата, во евра',
    RATE: 'курс ЕУР (Подесувања)',
    VAT_PCT: 'ДДВ % (Подесувања)',
    DISCOUNT: 'попуст внесен во калкулаторот, ЕУР',
    AREA: 'вкупна површина (параметар AREA)',
    AREA_HOUSE: 'површина на куќа',
    AREA_TERRACE: 'површина на тераса',
    SIMS: 'симс околу објект',
    TERRACE_COVERED: 'покриени тераси (калкулатор)',
    TERRACE_OPEN: 'откриени тераси (калкулатор)',
  };

  const draftCfg = () => Object.assign({}, cfg, { settings: Object.assign({}, cfg.settings, { resultFormulas: xFormulas() }) });
  const xFormulas = () => xDraft || Object.assign({}, cfg.settings.resultFormulas || {});
  const stepFormula = (s) => { const f = xFormulas()[s.key]; return f != null && String(f).trim() !== '' ? String(f) : s.def; };

  // Проверка на формулата: смее да ги користи основните променливи и претходните чекори
  function stepErrors(r) {
    const base = Object.keys(r.resultVars).filter((k) => !STEPS.some((s) => s.key === k));
    const errs = {};
    STEPS.forEach((s, i) => {
      const known = base.concat(STEPS.slice(0, i).map((x) => x.key));
      const e = MDAEngine.validate(stepFormula(s), known, cfg.materials.map((m) => m.code));
      // Повикување на подолен чекор (или самиот себе) — појасна порака од „непозната променлива“
      if (e) errs[s.key] = e.replace(/Непозната променлива: (\w+)/g, (m, k) =>
        STEPS.slice(i).some((x) => x.key === k) ? k + ' е на или под овој ред — може да се користат само горните чекори' : m);
    });
    return errs;
  }

  function renderExplain() {
    const box = $('#xBody');
    if (!Object.keys(calc.inputs).length) { calcDefaults(); calc.date = today(); }
    const fmtStep = (s, val) => (s.unit === 'm²' ? q(val) + ' m²' : eur2(val));

    box.innerHTML = `
      <div class="card" style="margin-bottom: 16px; overflow-x: auto;">
        <div class="card-head"><h3>Формули за крајната цена</h3>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn ghost small" id="xResetAll">↺ Сите стандардни</button>
            <button class="btn ghost small" id="xCancel">Откажи</button>
            <button class="btn accent small" id="xSave">Зачувај формули</button>
          </div>
        </div>
        <div class="card-body" style="padding-bottom: 0;">
          <p class="hint" style="margin: 0;">Секој ред е формула што се пресметува по ред — подолните редови можат да ги користат горните (пр. <span class="mono">TOTAL_EUR</span>). Измените важат за <b>сите</b> пресметки: јавниот калкулатор, админ калкулаторот и печатените понуди. Вредностите десно се за понудата што е моментално во калкулаторот${calc.client ? ' (' + esc(calc.client) + ')' : ''}.</p>
          <div id="xState" class="hint" style="margin-top: 8px;"></div>
        </div>
        <table class="data" id="xSteps"><thead><tr><th>Чекор</th><th style="width: 55%;">Формула</th><th class="num">Вредност</th><th></th></tr></thead><tbody>
          ${STEPS.map((s) => `<tr data-key="${s.key}">
            <td><b>${esc(s.label)}</b><div class="mono muted" style="font-size: 11px;">${s.key}</div></td>
            <td><input type="text" class="mono x-formula" data-key="${s.key}" value="${esc(stepFormula(s))}" spellcheck="false" style="width: 100%;">
              <div class="x-err" data-err="${s.key}"></div></td>
            <td class="num"><b data-val="${s.key}">—</b></td>
            <td><button class="icon-btn x-reset" data-key="${s.key}" title="Врати стандардна: ${esc(s.def)}">↺</button></td>
          </tr>`).join('')}
        </tbody></table>
        <div class="card-body">
          <div class="hint" style="margin-bottom: 8px;">Достапни променливи (клик за вметнување во избраната формула). Може и <span class="mono">total("КОД")</span> / <span class="mono">qty("КОД")</span> за една ставка (во денари), <span class="mono">min max round ceil floor abs</span>, како и сите параметри од „Параметри“.</div>
          <div id="xVars" class="x-vars"></div>
        </div>
      </div>
      <div id="xRest"></div>`;

    let lastInput = null;
    const refresh = () => {
      const r = MDAEngine.compute(draftCfg(), { inputs: calc.inputs, windows: calc.windows, discountEur: calc.discountEur, covered: calc.covered || 0, open: openTer() });
      const errs = stepErrors(r);
      STEPS.forEach((s) => {
        $(`[data-val="${s.key}"]`).textContent = errs[s.key] ? '—' : fmtStep(s, r.results[s.key]);
        $(`[data-err="${s.key}"]`).textContent = errs[s.key] || '';
        const inp = $(`.x-formula[data-key="${s.key}"]`);
        inp.classList.toggle('x-custom', stepFormula(s) !== s.def);
        inp.classList.toggle('x-bad', !!errs[s.key]);
      });
      const nErr = Object.keys(errs).length;
      const nCustom = STEPS.filter((s) => stepFormula(s) !== s.def).length;
      $('#xState').innerHTML = (xDraft ? '<b style="color: var(--accent);">Незачувани измени</b> · ' : '') +
        (nCustom ? nCustom + ' изменети формули (означени)' : 'Сите формули се стандардни') +
        (nErr ? ` · <span style="color: #a13527;">${nErr} со грешка — не може да се зачува</span>` : '');
      $('#xSave').disabled = !xDraft || nErr > 0;
      $('#xCancel').disabled = !xDraft;
      $('#xVars').innerHTML = Object.keys(X_VARS).concat(cfg.categories.map((c) => 'CAT_' + c.id))
        .filter((k) => k in r.resultVars)
        .map((k) => `<button class="x-var" data-ins="${esc(k)}" title="${esc(X_VARS[k] || 'категорија „' + ((cfg.categories.find((c) => 'CAT_' + c.id === k) || {}).name || '') + '“, ЕУР')}"><span class="mono">${esc(k)}</span> <span class="muted">${k === 'SUM_MKD' ? mkd0(r.resultVars[k]) : q(r.resultVars[k])}</span></button>`).join('');
      $('#xVars').querySelectorAll('.x-var').forEach((b) => {
        b.onclick = () => {
          const inp = lastInput || $('.x-formula');
          const at = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
          inp.value = inp.value.slice(0, at) + b.dataset.ins + inp.value.slice(inp.selectionEnd != null ? inp.selectionEnd : at);
          inp.focus();
          inp.setSelectionRange(at + b.dataset.ins.length, at + b.dataset.ins.length);
          inp.dispatchEvent(new Event('input'));
        };
      });
      renderExplainRest(r);
    };
    const setFormula = (key, val) => {
      xDraft = xFormulas();
      const s = STEPS.find((x) => x.key === key);
      if (!val.trim() || val.trim() === s.def) delete xDraft[key];
      else xDraft[key] = val;
      refresh();
    };

    box.querySelectorAll('.x-formula').forEach((inp) => {
      inp.onfocus = () => { lastInput = inp; };
      inp.oninput = () => setFormula(inp.dataset.key, inp.value);
    });
    box.querySelectorAll('.x-reset').forEach((b) => {
      b.onclick = () => {
        const s = STEPS.find((x) => x.key === b.dataset.key);
        $(`.x-formula[data-key="${s.key}"]`).value = s.def;
        setFormula(s.key, s.def);
      };
    });
    $('#xResetAll').onclick = () => {
      STEPS.forEach((s) => { $(`.x-formula[data-key="${s.key}"]`).value = s.def; });
      xDraft = {};
      refresh();
    };
    $('#xCancel').onclick = () => { xDraft = null; renderExplain(); };
    $('#xSave').onclick = async () => {
      const resultFormulas = {};
      STEPS.forEach((s) => { const f = stepFormula(s).trim(); if (f !== s.def) resultFormulas[s.key] = f; });
      try { await api('/api/admin/settings', 'PUT', { resultFormulas }); }
      catch (e) { if (e.message !== '401') flash('Грешка: ' + e.message); return; }
      cfg.settings.resultFormulas = resultFormulas;
      xDraft = null;
      flash('Формулите се зачувани ✓');
      recalcAdmin();
      refresh();
    };
    refresh();
  }

  // Објаснување под формулите (зачувана vs. сегашна, сива фаза по ставки, категории) — се освежува при секоја измена
  function renderExplainRest(r) {
    const line = (label, how, val, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="muted">${how}</td><td class="num"><b>${val}</b></td></tr>`;
    const card = (title, inner, hint = '') => `<div class="card" style="margin-bottom: 16px; overflow-x: auto;"><div class="card-head"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ''}</div>${inner}</div>`;
    let html = '';

    if (calc.loaded) {
      const diff = r.totalEur - calc.loaded.totalEur;
      const same = Math.abs(diff) < 0.01;
      html += card('Зачувана понуда наспроти сегашна пресметка', `<div class="card-body" style="display: grid; gap: 10px;">
        <table class="data"><tbody>
          ${line('Зачувано (во листата „Понуди“)', 'износ запишан во моментот на зачувување' + (calc.loaded.createdAt ? ' — ' + new Date(calc.loaded.createdAt).toLocaleString('mk-MK') : ''), eur2(calc.loaded.totalEur))}
          ${line('Сега (во калкулаторот)', 'истите влезни мерки × денешните цени и формули', eur2(r.totalEur))}
          ${line('Разлика', same ? 'се совпаѓа' : 'промена во ценовникот или формулите по зачувувањето', (diff > 0 ? '+' : '') + eur2(diff), same ? '' : 'x-diff')}
        </tbody></table>
        <div class="${same ? 'hint' : 'error-note'}">Понудата ги чува само <b>влезните мерки</b> (површини, ѕидови, прекинувачи, прозори, попуст) и <b>еден број</b> — вкупниот износ во тој момент. Цените и формулите не се чуваат во понудата. Кога понудата се отвора, калкулаторот повторно пресметува со <b>сегашниот</b> ценовник и формули, па ако нешто е сменето по зачувувањето, двата износа се разликуваат. Ако е потребна новата цена — зачувај ја понудата повторно.</div>
      </div>`);
    }

    const greyRows = r.rows.filter((x) => x.grey && x.totalMkd > 0.005);
    const catName = (id) => (cfg.categories.find((c) => c.id === id) || {}).name || id;
    html += card('Сива фаза — ставки (GREY_SUM)', `<div class="card-body" style="padding-bottom: 0;"><p class="hint" style="margin: 0;">Секој материјал има „Фактор сива фаза“ (табот Материјали). <span class="mono">GREY_SUM</span> е збир од <b>ЕУР на ставката × факторот</b>: 0 = не влегува, 1 = целосно, 2 = двојно. Прозорите и вратите од дограмата влегуваат со фактор 1. Збир: <b>${eur2(r.resultVars.GREY_SUM)}</b> од ${greyRows.length} ставки.</p></div>
      <table class="data"><thead><tr><th>Код</th><th>Материјал</th><th>Категорија</th><th class="num">ЕУР</th><th class="num">Фактор</th><th class="num">Во сива фаза</th></tr></thead><tbody>
        ${greyRows.map((x) => `<tr><td class="mono muted">${x.code || '—'}</td><td>${esc(x.name)}</td><td class="muted">${esc(catName(x.cat))}</td>
          <td class="num">${eur2(x.eur)}</td><td class="num">${x.grey === 1 ? '×1' : `<b class="x-flag">×${q(x.grey)}</b>`}</td><td class="num">${eur2(x.eur * x.grey)}</td></tr>`).join('')}
      </tbody></table>`);

    const cats = cfg.categories.map((c) => {
      const rs = r.rows.filter((x) => x.cat === c.id);
      return { id: c.id, name: c.name, eur: rs.reduce((s, x) => s + x.eur, 0), grey: rs.reduce((s, x) => s + x.eur * (x.grey || 0), 0) };
    }).filter((c) => c.eur > 0.005);
    html += card('Вкупно по категории (SUM_EUR)', `<table class="data"><thead><tr><th>Категорија</th><th>Променлива</th><th class="num">Вкупно ЕУР</th><th class="num">Од тоа сива фаза</th></tr></thead><tbody>
      ${cats.map((c) => `<tr><td>${esc(c.name)}</td><td class="mono muted">CAT_${esc(c.id)}</td><td class="num">${eur2(c.eur)}</td><td class="num">${eur2(c.grey)}</td></tr>`).join('')}
      <tr class="cat-row"><td>ВКУПНО</td><td></td><td class="num">${eur2(r.resultVars.SUM_EUR)}</td><td class="num">${eur2(r.resultVars.GREY_SUM)}</td></tr>
    </tbody></table>`, 'деталите по ставка се во „Калкулатор“ → Детална спецификација');

    $('#xRest').innerHTML = html;
  }

  /* ── Генератор на ПОНУДА (клуч на рака / сива фаза) ── */
  // Пресметана количина за spec со `codes` (собира qty од моторот)
  function qtyOfCodes(codes) {
    return codes.reduce((s, code) => {
      const row = calcRes.rows.find((r) => r.code === code);
      return s + (row ? row.qty : 0);
    }, 0);
  }

  // Елементи во понудата: секоја секција и ред има постојан id (s.id, x.id; стари шаблони: s2, s2i0, s2p1, s2n0),
  // додадените по понуда се `${s.id}c<id>`. Исклучените се во calc.offerExclude[варијанта],
  // додадените во calc.offerExtra[варијанта][s.id], избришаните и редоследот исто по варијанта.

  // Вредност на ред: параметар од калкулаторот, количина од материјали или впишан текст.
  // show=false → поврзаниот параметар нема вредност и редот не се печати.
  function offerRowVal(x) {
    if (x.param) {
      const inp = cfg.inputs.find((i) => i.key === x.param);
      if (!inp) return { show: true, text: '' };
      if (inp.type === 'select') {
        const v = calc.inputs[x.param];
        return v ? { show: true, text: String(v) } : { show: false, text: '' };
      }
      // Моторот веќе ги применил условите и изведените параметри
      const v = calcRes && calcRes.vars && x.param in calcRes.vars ? calcRes.vars[x.param] : Number(calc.inputs[x.param]) || 0;
      if (!v) return { show: false, text: '' };
      if (inp.type === 'boolean') return { show: true, text: '' };
      const unit = x.unit || (inp.role === 'factor' ? '' : inp.unit || '');
      return { show: true, text: q(v) + (unit ? ' ' + unit : '') };
    }
    if (x.codes && x.codes.length) return { show: true, text: `${q(Math.round(qtyOfCodes(x.codes)))} ${x.unit || ''}`.trim() };
    return { show: true, text: x.value || '' };
  }
  const emptySel = () => ({ turnkey: {}, grey: {} });
  const offerEx = (variant) => {
    if (!calc.offerExclude) calc.offerExclude = emptySel();
    return calc.offerExclude[variant] || (calc.offerExclude[variant] = {});
  };
  const offerExtra = (variant, sid) => {
    if (!calc.offerExtra) calc.offerExtra = emptySel();
    const v = calc.offerExtra[variant] || (calc.offerExtra[variant] = {});
    return v[sid] || (v[sid] = []);
  };
  const offerSub = (key, variant) => {
    if (!calc[key]) calc[key] = emptySel();
    return calc[key][variant] || (calc[key][variant] = {});
  };
  const offerDeleted = (variant) => offerSub('offerDeleted', variant);
  const offerOrder = (variant, sid) => offerSub('offerOrder', variant)[sid] || [];
  // Сите редови во секцијата од шаблонот + додадените (вклучително избришаните)
  const offerPartsRaw = (s, variant) => [
    ...(s.items || []).map((x) => ({ id: x.id, kind: 'item', x })),
    ...offerExtra(variant, s.id).map((x) => ({ id: `${s.id}c${x.id}`, kind: 'item', x, custom: true })),
    ...(s.specs || []).map((x) => ({ id: x.id, kind: 'spec', x })),
    ...(s.notes || []).map((x) => ({ id: x.id, kind: 'note', x })),
  ];
  // Видливите редови по зададениот редослед (новите/неподредените одат на крај по стандардниот ред)
  const offerParts = (s, variant) => {
    const del = offerDeleted(variant), order = offerOrder(variant, s.id);
    const rank = (p, i) => { const k = order.indexOf(p.id); return k >= 0 ? k : 10000 + i; };
    return offerPartsRaw(s, variant).map((p, i) => [p, rank(p, i)])
      .filter(([p]) => !del[p.id]).sort((a, b) => a[1] - b[1]).map(([p]) => p);
  };
  const tplSec = (sid) => offerTpl[osVariant].sections.find((s) => s.id === sid);

  function offerSection(s, variant) {
    const ex = offerEx(variant);
    if (ex[s.id]) return '';
    const parts = offerParts(s, variant).filter((p) => !ex[p.id] && (p.kind === 'note' || offerRowVal(p.x).show));
    if (!parts.length) return '';
    let h = `<div class="of-sec"><h3>${esc(s.title)}</h3>`;
    const items = parts.filter((p) => p.kind === 'item');
    if (items.length) {
      h += '<ul>' + items.map(({ x: i }) => {
        const v = offerRowVal(i).text;
        return `<li>${esc(i.text)}${v ? ` — <b>${esc(v)}</b>` : ''}</li>`;
      }).join('') + '</ul>';
    }
    parts.filter((p) => p.kind === 'spec').forEach(({ x: sp }) => {
      h += `<div class="of-spec"><span>${esc(sp.label)}</span><b>${esc(offerRowVal(sp).text)}</b></div>`;
    });
    parts.filter((p) => p.kind === 'note').forEach(({ x: n }) => { h += `<p class="of-note">${esc(n.text)}</p>`; });
    return h + '</div>';
  }

  // Модал за избор на елементи во понудата (секциите се затворени при отворање)
  let osVariant = 'turnkey';
  const osOpen = new Set();
  async function openOfferSel(variant) {
    if (!calcRes) { offerFail('Пресметката не е подготвена.'); return; }
    if (!offerTpl) { offerErr = ''; offerTpl = await loadOfferTpl(); }
    if (!offerTpl || !offerTpl[variant]) { offerFail(offerErr || 'Шаблонот за понуда не е вчитан.'); return; }
    osVariant = variant;
    osOpen.clear();
    $('#osTitle').textContent = 'Елементи во понудата — ' + (variant === 'grey' ? 'сива фаза' : 'клуч на рака');
    renderOfferSel();
    $('#offerSelModal').classList.add('open');
  }

  function renderOfferSel(focusSec) {
    const t = offerTpl[osVariant], ex = offerEx(osVariant);
    // Вредноста во загради; поврзан параметар без вредност е означен (не се печати)
    const valHtml = (x) => {
      const v = offerRowVal(x);
      if (!v.show) return ' <span class="muted" style="font-size:11px;">(празно — не се печати)</span>';
      return v.text ? ` — <b>${esc(v.text)}</b>` : '';
    };
    $('#osBody').innerHTML = t.sections.map((s) => {
      const parts = offerParts(s, osVariant);
      const label = (p) => p.kind === 'item' ? esc(p.x.text) + valHtml(p.x)
        : p.kind === 'spec' ? esc(p.x.label) + valHtml(p.x)
        : `<i class="muted">${esc(p.x.text)}</i>`;
      const nDel = offerPartsRaw(s, osVariant).filter((p) => !p.custom && offerDeleted(osVariant)[p.id]).length;
      // Стрелките се активни само ако има сосед од ист вид (ставка / количина / забелешка)
      const canMove = (i, dir) => { for (let k = i + dir; k >= 0 && k < parts.length; k += dir) if (parts[k].kind === parts[i].kind) return true; return false; };
      return `<div class="os-sec${osOpen.has(s.id) ? ' open' : ''}" data-sec="${esc(s.id)}">
        <div class="os-head"><span class="os-chev">▸</span><input type="checkbox" data-sec-cb="${esc(s.id)}"><span class="os-title">${esc(s.title)}</span><span class="muted os-n"></span></div>
        <div class="os-items">
          ${parts.map((p, i) => `<label class="${p.custom ? 'os-custom' : ''}"><input type="checkbox" data-id="${esc(p.id)}"> <span>${label(p)}</span>
            <span class="os-tools">
              <button class="icon-btn" data-move="-1" data-pid="${esc(p.id)}" title="Помести горе"${canMove(i, -1) ? '' : ' disabled'}>↑</button>
              <button class="icon-btn" data-move="1" data-pid="${esc(p.id)}" title="Помести долу"${canMove(i, 1) ? '' : ' disabled'}>↓</button>
              <button class="icon-btn" data-del="${esc(p.id)}" title="Избриши">✕</button>
            </span></label>`).join('')}
          <div class="os-add"><input type="text" placeholder="Нов елемент во „${esc(s.title)}“…" data-add="${esc(s.id)}"><button class="btn ghost small" data-addbtn="${esc(s.id)}">+ Додај</button></div>
          ${nDel ? `<button class="os-restore" data-restore="${esc(s.id)}">↺ Врати ${nDel} избришан${nDel === 1 ? '' : 'и'} стандарден${nDel === 1 ? '' : 'и'} елемент${nDel === 1 ? '' : 'и'}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    const body = $('#osBody');
    const secOf = (el) => el.closest('.os-sec').dataset.sec;
    body.querySelectorAll('.os-head').forEach((h) => {
      h.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        const sec = h.parentElement, sid = sec.dataset.sec;
        sec.classList.toggle('open');
        if (sec.classList.contains('open')) osOpen.add(sid); else osOpen.delete(sid);
      };
    });
    // Секција: вклучи/исклучи ја целата заедно со сите редови
    body.querySelectorAll('input[data-sec-cb]').forEach((cb) => {
      cb.onchange = () => {
        const sid = cb.dataset.secCb;
        delete ex[sid];
        offerParts(tplSec(sid), osVariant).forEach((p) => { if (cb.checked) delete ex[p.id]; else ex[p.id] = true; });
        if (!cb.checked) ex[sid] = true;
        syncOfferSel();
      };
    });
    body.querySelectorAll('input[data-id]').forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.id;
        if (cb.checked) { delete ex[id]; delete ex[secOf(cb)]; } else ex[id] = true;
        syncOfferSel();
      };
    });
    // Додавање нов елемент во секцијата (се печати како ред во листата)
    const add = (sid) => {
      const inp = [...body.querySelectorAll('input[data-add]')].find((x) => x.dataset.add === sid);
      const text = inp.value.trim();
      if (!text) { inp.focus(); return; }
      offerExtra(osVariant, sid).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: text.slice(0, 300) });
      delete ex[sid];
      osOpen.add(sid);
      renderOfferSel(sid);
    };
    body.querySelectorAll('[data-addbtn]').forEach((b) => { b.onclick = () => add(b.dataset.addbtn); });
    body.querySelectorAll('input[data-add]').forEach((inp) => {
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(inp.dataset.add); } };
    });
    // Бришење: додадениот елемент се отстранува целосно; стандардниот се крие (може да се врати)
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const sid = secOf(b), id = b.dataset.del;
        const prefix = sid + 'c';
        const custom = id.startsWith(prefix) && offerExtra(osVariant, sid).some((x) => prefix + x.id === id);
        if (custom) {
          const list = offerExtra(osVariant, sid);
          list.splice(list.findIndex((x) => prefix + x.id === id), 1);
          const ord = offerSub('offerOrder', osVariant);
          if (ord[sid]) ord[sid] = ord[sid].filter((x) => x !== id);
        } else {
          // Стандардниот останува во редоследот — при враќање се појавува на истото место
          offerDeleted(osVariant)[id] = true;
        }
        delete ex[id];
        renderOfferSel();
      };
    });
    body.querySelectorAll('[data-restore]').forEach((b) => {
      b.onclick = () => {
        const del = offerDeleted(osVariant);
        offerPartsRaw(tplSec(b.dataset.restore), osVariant).forEach((p) => { if (!p.custom) delete del[p.id]; });
        renderOfferSel();
      };
    });
    // Поместување горе/долу — се заменува со најблискиот ред од ист вид; редоследот се памети за секцијата
    body.querySelectorAll('[data-move]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const sid = secOf(b), dir = +b.dataset.move, s = tplSec(sid);
        const ids = offerParts(s, osVariant);
        const i = ids.findIndex((p) => p.id === b.dataset.pid);
        let k = i + dir;
        while (k >= 0 && k < ids.length && ids[k].kind !== ids[i].kind) k += dir;
        if (k < 0 || k >= ids.length) return;
        // Редоследот ги опфаќа и избришаните стандардни, за да се вратат на своето место
        const order = offerOrder(osVariant, sid);
        const full = offerPartsRaw(s, osVariant).map((p, j) => [p.id, order.indexOf(p.id) >= 0 ? order.indexOf(p.id) : 10000 + j])
          .sort((a, c) => a[1] - c[1]).map(([pid]) => pid);
        const a = full.indexOf(ids[i].id), c = full.indexOf(ids[k].id);
        [full[a], full[c]] = [full[c], full[a]];
        offerSub('offerOrder', osVariant)[sid] = full;
        renderOfferSel();
      };
    });
    syncOfferSel();
    if (focusSec != null) [...body.querySelectorAll('input[data-add]')].find((x) => x.dataset.add === focusSec).focus();
  }

  // Ги усогласува полињата со изборот (секцијата е делумно штиклирана ако дел од редовите се исклучени)
  function syncOfferSel() {
    const t = offerTpl[osVariant], ex = offerEx(osVariant);
    let on = 0, all = 0;
    const boxes = [...$$('#osBody .os-sec')];
    t.sections.forEach((s) => {
      const box = boxes.find((b) => b.dataset.sec === s.id);
      const parts = offerParts(s, osVariant);
      const secOff = !!ex[s.id];
      let n = 0;
      box.querySelectorAll('input[data-id]').forEach((cb) => {
        const inc = !secOff && !ex[cb.dataset.id];
        cb.checked = inc;
        if (inc) n++;
      });
      const head = box.querySelector('input[data-sec-cb]');
      head.checked = !secOff && n > 0;
      head.indeterminate = !secOff && n > 0 && n < parts.length;
      box.classList.toggle('off', secOff || !n);
      box.querySelector('.os-n').textContent = `${n}/${parts.length}`;
      on += n; all += parts.length;
    });
    $('#osCount').textContent = `Вклучени ${on} од ${all} реда. Кликни на секција за да ја отвориш. Отштиклираните не се печатат; секција без ниеден ред се прескокнува.`;
  }

  $('#cSelTurnkey').onclick = () => openOfferSel('turnkey');
  $('#cSelGrey').onclick = () => openOfferSel('grey');
  $('#osAll').onclick = () => { calc.offerExclude[osVariant] = {}; syncOfferSel(); };
  $('#osNone').onclick = () => { const ex = offerEx(osVariant); offerTpl[osVariant].sections.forEach((s) => { ex[s.id] = true; offerParts(s, osVariant).forEach((p) => { ex[p.id] = true; }); }); syncOfferSel(); };
  $('#osPrint').onclick = () => { $('#offerSelModal').classList.remove('open'); buildOffer(osVariant); };

  function offerFail(msg) {
    const n = $('#cNote');
    n.style.color = 'var(--accent)';
    n.textContent = msg;
    console.error('[понуда]', msg);
  }

  async function buildOffer(variant) {
    if (!calcRes) { offerFail('Пресметката не е подготвена.'); return; }
    if (!offerTpl) { offerErr = ''; offerTpl = await loadOfferTpl(); }
    if (!offerTpl || !offerTpl[variant]) { offerFail(offerErr || 'Шаблонот за понуда не е вчитан.'); return; }
    $('#cNote').textContent = '';
    try { renderOffer(variant); } catch (e) { offerFail('Грешка при генерирање: ' + e.message); }
  }

  function renderOffer(variant) {
    const t = offerTpl[variant];
    const r = calcRes;
    const isGrey = variant === 'grey';
    // Сива фаза ја користи greyEur; клуч на рака го користи вкупниот износ
    // (формулите се уредуваат во табот ПРЕСМЕТКА)
    const baseEur = isGrey ? r.greyEur : r.totalEur; // редовна цена (пред попуст)
    const discount = isGrey ? 0 : r.discountEur;
    const finalEur = isGrey ? r.greyEur : r.finalEur;
    const finalMkd = finalEur * rate();
    const aws = r.areaSims;
    const perM2 = isGrey ? r.greyPerM2 : r.finalPerM2Sims;
    const date = calc.date || today();
    const client = calc.client.trim() || '—';

    const head = (title) => `
      <div class="of-head">
        <div><h1 class="of-h1">${esc(title)}</h1><p class="of-sub">${esc(t.subtitle)}</p></div>
        <div class="of-meta">${esc(cfg.settings.companyName || 'MODULAR DESIGN ARCHITECTS')}<br>${esc(date)}</div>
      </div>
      <div class="of-kv"><span><b>КЛИЕНТ:</b> ${esc(client)}</span></div>`;

    const areas = `
      <div class="of-sec">
        <h3>Површини</h3>
        ${[['Површина на објект', calc.inputs.AREA_HOUSE],
           ['Површина на симсови вон објект', calc.inputs.SIMS],
           ['Површина на покриени тераси', calc.covered],
           ['Површина на откриени тераси', openTer()],
          ].map(([k, v]) => `<div class="of-kv"><span>${k}</span><span class="dots"></span><b>${q(v || 0)} m²</b></div>`).join('')}
        <div class="of-kv"><span><b>Вкупна површина на објект со симсови</b></span><span class="dots"></span><b>${q(aws)} m²</b></div>
        <div class="of-kv"><span>КАТНА ВИСИНА ЧИСТА ВО ОБЈЕКТ (м)</span><span class="dots"></span><b>${q(calc.inputs.FLOOR_H)}</b></div>
        <div class="of-kv"><span>КАТНА ВИСИНА НАДВОРЕШНА (од плоча до слеме)</span><span class="dots"></span><b>${q(calc.outerH)}</b></div>
      </div>`;

    const pay = offerTpl.payment.map((p) => `
      <tr><td class="num">${(p.pct * 100).toFixed(0)}%</td><td>${esc(p.desc)}</td>
      <td class="num">${mkd0(finalMkd * p.pct)}</td><td class="num">${eur2(finalEur * p.pct)}</td></tr>`).join('');

    $('#offerPrint').innerHTML = `
      ${head(t.title)}
      <p style="font-size:12.5px;line-height:1.5;">${esc(t.desc)}</p>
      ${areas}
      <div class="of-sec"><h3>Вклучени елементи во понудата</h3></div>
      ${t.sections.map((s) => offerSection(s, variant)).join('')}

      <div class="of-page">
        ${head(t.title)}
        ${areas}
        <div class="of-sec">
          <h3>Вредност на понудата</h3>
          <table class="of-table">
            <tr><th>РЕДОВНА ЦЕНА ЕУР</th><th>ЦЕНА НА М2 СО СИМСОВИ</th><th>РЕДОВНА ЦЕНА ДЕН</th></tr>
            <tr><td class="num">${eur2(baseEur)}</td><td class="num">${eur2(aws ? baseEur / aws : 0)}</td><td class="num">${mkd0(baseEur * rate())}</td></tr>
          </table>
          ${discount ? `<div class="of-kv" style="margin-top:6px;"><span>ПОПУСТ</span><span class="dots"></span><b>− ${eur2(discount)}</b></div>` : ''}
          <div class="of-total"><span>ВКУПНО СО ПОПУСТ (со вклучено ДДВ)</span><b>${eur2(finalEur)}</b></div>
          <div class="of-kv" style="margin-top:6px;"><span>Во денари</span><span class="dots"></span><b>${mkd0(finalMkd)}</b></div>
          <div class="of-kv"><span>ЦЕНА НА M2 СО СИМСОВИ</span><span class="dots"></span><b>${eur2(perM2)}</b></div>
        </div>

        <div class="of-sec">
          <h3>Начин на плаќање</h3>
          <table class="of-table">
            <tr><th>ПРОЦЕНТ</th><th>ОПИС</th><th>ВКУПНО (ДЕН)</th><th>ВКУПНО (ЕУР)</th></tr>
            ${pay}
            <tr><td></td><td><b>ВКУПНО</b></td><td class="num"><b>${mkd0(finalMkd)}</b></td><td class="num"><b>${eur2(finalEur)}</b></td></tr>
          </table>
        </div>

        <div class="of-sec">
          <h3>Забелешки</h3>
          <ul><li>${esc(t.note)}</li></ul>
          ${t.warning ? `<p class="of-note">${esc(t.warning)}</p>` : ''}
          <p style="font-size:12px;margin-top:8px;"><b>Понудата има важност ${offerTpl.validityDays} денови од денот на изработка.</b></p>
          <p class="of-note">${esc(date)}</p>
        </div>
      </div>`;
    window.print();
  }
  $('#cOfferTurnkey').onclick = () => buildOffer('turnkey');
  $('#cOfferGrey').onclick = () => buildOffer('grey');

  // ══ ШАБЛОН ПОНУДА ══
  // Уредување на секциите и редовите во понудата (по варијанта) + заглавие, плаќање и важност.
  // Редовите се чуваат во три низи по вид (items/specs/notes) — така и се печатат.
  let otVariant = 'turnkey';
  const otOpen = new Set();
  const OT_KINDS = [['items', 'Ставка'], ['specs', 'Спецификација'], ['notes', 'Забелешка']];
  const otNewId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Извор на вредноста за ред: '' нема, text, param, qty
  const otSrc = (x) => ('param' in x ? 'param' : 'codes' in x ? 'qty' : x.value != null ? 'text' : '');

  let otTimer = null;
  function otSave() {
    clearTimeout(otTimer);
    otTimer = setTimeout(async () => {
      try { await api('/api/admin/offer', 'PUT', offerTpl); flash(); }
      catch (e) { if (e.message !== '401') flash('Грешка при зачувување: ' + e.message); }
    }, 500);
  }

  async function renderOfferTpl() {
    if (!offerTpl) { offerErr = ''; offerTpl = await loadOfferTpl(); }
    if (!offerTpl) { $('#otSections').innerHTML = `<div class="error-note">${esc(offerErr || 'Шаблонот за понуда не е вчитан.')}</div>`; return; }
    const t = offerTpl[otVariant];
    $$('#otVariant .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === otVariant));
    $('#otVarName').textContent = otVariant === 'grey' ? 'сива фаза' : 'клуч на рака';
    $$('#tab-offer [data-head]').forEach((el) => { el.value = t[el.dataset.head] || ''; });
    renderOtSections();
    renderOtPay();
  }

  // Опции за параметрите, по групи (изведените се на крај во својата група)
  function otParamOptions(cur) {
    const groups = [...new Set(cfg.inputs.map((i) => i.group || ''))];
    let h = `<option value="">— изберете параметар —</option>`;
    groups.forEach((g) => {
      h += `<optgroup label="${esc(g || 'Без група')}">` + cfg.inputs.filter((i) => (i.group || '') === g).map((i) =>
        `<option value="${esc(i.key)}"${i.key === cur ? ' selected' : ''}>${esc(i.label)} (${esc(i.key)})${i.type === 'select' ? ' ▾' : ''}</option>`).join('') + '</optgroup>';
    });
    if (cur && !cfg.inputs.some((i) => i.key === cur)) h += `<option value="${esc(cur)}" selected>${esc(cur)} — не постои</option>`;
    return h;
  }

  function otRowHtml(kind, x, j, n) {
    const isNote = kind === 'notes';
    const text = kind === 'specs' ? x.label : x.text;
    const src = otSrc(x);
    let val = '<div class="ot-val-empty"></div>', warn = '';
    if (!isNote) {
      let input = '';
      if (src === 'text') input = `<input type="text" data-f="value" value="${esc(x.value)}" placeholder="пр. БЕЛА">`;
      if (src === 'param') {
        const inp = cfg.inputs.find((i) => i.key === x.param);
        const unitPh = inp && inp.type !== 'select' && inp.type !== 'boolean' ? (inp.unit || 'ед.') : '';
        input = `<select data-f="param">${otParamOptions(x.param)}</select>` +
          (unitPh ? `<input type="text" class="ot-unit" data-f="unit" value="${esc(x.unit || '')}" placeholder="${esc(unitPh)}" title="Единица (празно = од параметарот)">` : '');
        if (!x.param) warn = 'Изберете параметар.';
        else if (!inp) warn = `Параметарот ${x.param} не постои — се печати само текстот.`;
      }
      if (src === 'qty') {
        input = `<input type="text" class="mono" data-f="codes" value="${esc((x.codes || []).join(', '))}" placeholder="E01, E02" title="Шифри на материјали — количините се собираат">` +
          `<input type="text" class="ot-unit" data-f="unit" value="${esc(x.unit || '')}" placeholder="ПАРЧИЊА">`;
        const bad = (x.codes || []).filter((c) => !cfg.materials.some((m) => m.code === c));
        if (bad.length) warn = 'Непостоечки шифри: ' + bad.join(', ');
        else if (!(x.codes || []).length) warn = 'Внесете барем една шифра на материјал.';
      }
      val = `<div class="ot-val"><select data-f="src">
          <option value=""${src === '' ? ' selected' : ''}>Без вредност</option>
          <option value="text"${src === 'text' ? ' selected' : ''}>Текст</option>
          <option value="param"${src === 'param' ? ' selected' : ''}>Параметар</option>
          <option value="qty"${src === 'qty' ? ' selected' : ''}>Количина</option>
        </select><div class="ot-val-in">${input}</div></div>`;
    }
    return `<div class="ot-row" data-kind="${kind}" data-j="${j}">
      <select data-f="kind">${OT_KINDS.map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input type="text" data-f="text" value="${esc(text)}" placeholder="${isNote ? 'Текст на забелешката' : 'Опис'}">
      ${val}
      <span class="ot-tools">
        <button class="icon-btn" data-row-move="-1" title="Помести горе"${j === 0 ? ' disabled' : ''}>↑</button>
        <button class="icon-btn" data-row-move="1" title="Помести долу"${j === n - 1 ? ' disabled' : ''}>↓</button>
        <button class="icon-btn" data-row-del title="Избриши">🗑</button>
      </span>
      ${warn ? `<div class="ot-warn">${esc(warn)}</div>` : ''}
    </div>`;
  }

  function renderOtSections() {
    const t = offerTpl[otVariant];
    const rows = (s) => (s.items || []).length + (s.specs || []).length + (s.notes || []).length;
    $('#otCount').textContent = `${t.sections.length} секции · ${t.sections.reduce((a, s) => a + rows(s), 0)} реда`;
    $('#otSections').innerHTML = t.sections.map((s, si) => `
      <div class="ot-sec${otOpen.has(s.id) ? ' open' : ''}" data-si="${si}">
        <div class="ot-sec-head"><span class="os-chev">▸</span><span class="ot-title">${esc(s.title || '(без наслов)')}</span><span class="ot-n">${rows(s)}</span>
          <span class="ot-tools">
            <button class="icon-btn" data-sec-move="-1" title="Помести горе"${si === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn" data-sec-move="1" title="Помести долу"${si === t.sections.length - 1 ? ' disabled' : ''}>↓</button>
            <button class="icon-btn" data-sec-del title="Избриши секција">🗑</button>
          </span></div>
        <div class="ot-sec-body">
          <div class="field"><label>Наслов на секцијата</label><input type="text" data-sec-title value="${esc(s.title)}"></div>
          <div class="ot-rows">${OT_KINDS.map(([k, l]) => {
            const list = s[k] || [];
            return list.length ? `<div class="ot-kind-h">${l}${k === 'items' ? ' — точки во листа' : k === 'specs' ? ' — опис : вредност' : ' — ситен текст'}</div>` +
              list.map((x, j) => otRowHtml(k, x, j, list.length)).join('') : '';
          }).join('')}</div>
          <button class="btn ghost small" data-row-add="items">+ Ставка</button>
          <button class="btn ghost small" data-row-add="specs">+ Спецификација</button>
          <button class="btn ghost small" data-row-add="notes">+ Забелешка</button>
        </div>
      </div>`).join('') || '<p class="hint">Нема секции. Додадете со „+ Нова секција“.</p>';
  }

  // Еден слушач за целата листа — редовите се исцртуваат повторно само при структурни промени
  const otSecOf = (el) => offerTpl[otVariant].sections[+el.closest('.ot-sec').dataset.si];
  const otRowOf = (el) => {
    const r = el.closest('.ot-row'), s = otSecOf(el);
    return { s, kind: r.dataset.kind, j: +r.dataset.j, x: s[r.dataset.kind][+r.dataset.j] };
  };
  $('#otSections').addEventListener('click', (e) => {
    const t = offerTpl[otVariant];
    const b = e.target.closest('button');
    const head = e.target.closest('.ot-sec-head');
    if (!b && head) {
      const box = head.parentElement, s = otSecOf(head);
      box.classList.toggle('open');
      if (box.classList.contains('open')) otOpen.add(s.id); else otOpen.delete(s.id);
      return;
    }
    if (!b || b.disabled) return;
    if (b.dataset.secMove) {
      const si = +b.closest('.ot-sec').dataset.si, k = si + +b.dataset.secMove;
      [t.sections[si], t.sections[k]] = [t.sections[k], t.sections[si]];
    } else if (b.hasAttribute('data-sec-del')) {
      const s = otSecOf(b);
      if (!confirm(`Избриши ја секцијата „${s.title}“ од шаблонот?`)) return;
      t.sections.splice(t.sections.indexOf(s), 1);
    } else if (b.dataset.rowAdd) {
      const s = otSecOf(b), k = b.dataset.rowAdd;
      s[k] = s[k] || [];
      s[k].push(k === 'specs' ? { id: otNewId(), label: '', value: '' } : { id: otNewId(), text: '' });
      otOpen.add(s.id);
      otSave(); renderOtSections();
      const rows = $$(`#otSections .ot-sec[data-si="${t.sections.indexOf(s)}"] .ot-row[data-kind="${k}"] input[data-f="text"]`);
      rows[rows.length - 1].focus();
      return;
    } else if (b.dataset.rowMove) {
      const { s, kind, j } = otRowOf(b), k = j + +b.dataset.rowMove, list = s[kind];
      [list[j], list[k]] = [list[k], list[j]];
    } else if (b.hasAttribute('data-row-del')) {
      const { s, kind, j } = otRowOf(b);
      s[kind].splice(j, 1);
    } else return;
    otSave(); renderOtSections();
  });
  // Текст: зачувува без повторно исцртување (курсорот останува во полето)
  $('#otSections').addEventListener('input', (e) => {
    const el = e.target;
    if (el.hasAttribute('data-sec-title')) {
      const s = otSecOf(el);
      s.title = el.value;
      el.closest('.ot-sec').querySelector('.ot-title').textContent = s.title || '(без наслов)';
      return otSave();
    }
    const f = el.dataset.f;
    if (!['text', 'value', 'unit'].includes(f)) return;
    const { kind, x } = otRowOf(el);
    if (f === 'text') { if (kind === 'specs') x.label = el.value; else x.text = el.value; }
    else if (f === 'unit') { if (el.value.trim()) x.unit = el.value; else delete x.unit; }
    else x.value = el.value;
    otSave();
  });
  // Вид, извор, параметар, шифри: менуваат структура → повторно исцртување
  $('#otSections').addEventListener('change', (e) => {
    const el = e.target, f = el.dataset.f;
    if (!['kind', 'src', 'param', 'codes'].includes(f)) return;
    const { s, kind, j, x } = otRowOf(el);
    if (f === 'kind') {
      const text = kind === 'specs' ? x.label : x.text;
      s[kind].splice(j, 1);
      const nk = el.value;
      const nx = nk === 'notes' ? { id: x.id, text } : Object.assign({}, x, nk === 'specs' ? { label: text } : { text });
      if (nk === 'specs') delete nx.text; else delete nx.label;
      if (nk === 'notes') ['value', 'param', 'codes', 'unit'].forEach((k) => delete nx[k]);
      (s[nk] = s[nk] || []).push(nx);
    } else if (f === 'src') {
      ['value', 'param', 'codes', 'unit'].forEach((k) => delete x[k]);
      if (el.value === 'text') x.value = '';
      if (el.value === 'param') x.param = '';
      if (el.value === 'qty') x.codes = [];
    } else if (f === 'param') {
      x.param = el.value;
      delete x.unit;
    } else if (f === 'codes') {
      x.codes = [...new Set(el.value.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    }
    otSave(); renderOtSections();
  });

  $$('#otVariant .seg-btn').forEach((b) => { b.onclick = () => { otVariant = b.dataset.v; otOpen.clear(); renderOfferTpl(); }; });
  $('#otOpenAll').onclick = () => {
    const secs = offerTpl ? offerTpl[otVariant].sections : [];
    const all = secs.every((s) => otOpen.has(s.id));
    secs.forEach((s) => { if (all) otOpen.delete(s.id); else otOpen.add(s.id); });
    $('#otOpenAll').textContent = all ? 'Отвори ги сите' : 'Затвори ги сите';
    renderOtSections();
  };
  $('#otAddSec').onclick = () => {
    if (!offerTpl) return;
    const s = { id: otNewId(), title: 'Нова секција', items: [], specs: [], notes: [] };
    offerTpl[otVariant].sections.push(s);
    otOpen.add(s.id);
    otSave(); renderOtSections();
    const inp = $$('#otSections [data-sec-title]');
    inp[inp.length - 1].select();
  };
  $$('#tab-offer [data-head]').forEach((el) => {
    el.oninput = () => { offerTpl[otVariant][el.dataset.head] = el.value; otSave(); };
  });

  // Плаќање: процентите се внесуваат како 70, се чуваат како 0.7
  function renderOtPay() {
    const pay = offerTpl.payment;
    const sum = pay.reduce((a, p) => a + (Number(p.pct) || 0), 0);
    $('#otPay').innerHTML = pay.map((p, i) => `<div class="ot-pay-row" data-i="${i}">
        <input type="number" min="0" max="100" step="any" data-p="pct" value="${+(p.pct * 100).toFixed(2)}" title="Процент">
        <input type="text" data-p="desc" value="${esc(p.desc)}">
        <button class="icon-btn" data-p-del title="Избриши">🗑</button></div>`).join('') +
      `<div class="hint" id="otPaySum" style="color:${Math.abs(sum - 1) > 1e-6 ? 'var(--accent)' : ''}">Вкупно: ${+(sum * 100).toFixed(2)}%${Math.abs(sum - 1) > 1e-6 ? ' — збирот треба да е 100%' : ''}</div>`;
    $('#otValidity').value = offerTpl.validityDays ?? '';
  }
  $('#otPay').addEventListener('input', (e) => {
    const row = e.target.closest('.ot-pay-row'), p = offerTpl.payment[+row.dataset.i];
    if (e.target.dataset.p === 'pct') p.pct = (parseFloat(e.target.value) || 0) / 100;
    else p.desc = e.target.value;
    const sum = offerTpl.payment.reduce((a, x) => a + (Number(x.pct) || 0), 0), off = Math.abs(sum - 1) > 1e-6;
    $('#otPaySum').textContent = `Вкупно: ${+(sum * 100).toFixed(2)}%${off ? ' — збирот треба да е 100%' : ''}`;
    $('#otPaySum').style.color = off ? 'var(--accent)' : '';
    otSave();
  });
  $('#otPay').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p-del]');
    if (!b) return;
    offerTpl.payment.splice(+b.closest('.ot-pay-row').dataset.i, 1);
    otSave(); renderOtPay();
  });
  $('#otAddPay').onclick = () => { offerTpl.payment.push({ pct: 0, desc: '' }); otSave(); renderOtPay(); };
  $('#otValidity').oninput = () => { offerTpl.validityDays = parseInt($('#otValidity').value, 10) || 0; otSave(); };

  // ══ 3D МАТЕРИЈАЛИ ══
  // m3: { library: [материјал], slots: {дел: id}, rules: [{param, value, slot, mat}] } — види planner3d.js (DEFAULTS)
  let m3 = null, m3Sel = null, m3Timer = null;
  const m3Clone = (o) => JSON.parse(JSON.stringify(o));
  async function loadMat3d() {
    if (m3) return m3;
    let saved = null;
    try { saved = await api('/api/admin/mat3d'); } catch (e) { /* стандардни */ }
    m3 = saved && Array.isArray(saved.library) ? saved : m3Clone(MDA3D.DEFAULTS);
    m3.rules = m3.rules || [];
    // Нов дел додаден во кодот → го добива стандардниот материјал
    for (const [k, id] of Object.entries(MDA3D.DEFAULTS.slots)) if (!m3.slots[k]) m3.slots[k] = id;
    return m3;
  }
  // Поставки за 3D на конкретна понуда: правилата ги менуваат деловите според внесените параметри
  function resolveMat3d(inputs) {
    if (!m3) return null;
    const slots = Object.assign({}, m3.slots);
    for (const r of m3.rules) {
      if (!r.param || !r.slot || !r.mat) continue;
      const v = inputs[r.param];
      if (String(v ?? '') === String(r.value ?? '')) slots[r.slot] = r.mat;
    }
    return { library: m3.library, slots };
  }
  function m3Save() {
    clearTimeout(m3Timer);
    m3Timer = setTimeout(async () => {
      try { await api('/api/admin/mat3d', 'PUT', m3); flash(); }
      catch (e) { if (e.message !== '401') flash('Грешка при зачувување: ' + e.message); }
    }, 500);
  }
  const m3Mat = (id) => m3.library.find((x) => x.id === id);
  const m3Slots = () => MDA3D.SLOTS;
  const m3SlotName = (k) => (m3Slots().find(([s]) => s === k) || [k, k])[1];
  // Мостра: сликата помножена со бојата (како во 3D, без осветленост)
  const m3Swatch = (d) => d ? (d.tex ? `background-image:url('${MDA3D.texUrl(d, 'color')}');background-color:${d.color}` : `background-color:${d.color}`) : '';
  const m3NewId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  async function renderMat3d() {
    await loadMat3d();
    if (!m3Sel || !m3Mat(m3Sel)) m3Sel = m3.library[0] && m3.library[0].id;
    renderM3Lib(); renderM3Edit(); renderM3Slots(); renderM3Rules();
  }

  function renderM3Lib() {
    $('#m3Lib').innerHTML = m3.library.map((d) => `<button type="button" class="m3-tile${d.id === m3Sel ? ' on' : ''}" data-id="${esc(d.id)}">
      <span class="m3-sw" style="${m3Swatch(d)}"></span><b>${esc(d.name || '(без име)')}</b>
      <small>${d.tex ? (d.tex.startsWith('u:') ? 'качена слика' : 'вградена слика') : 'само боја'}${d.metal > 0.3 ? ' · метал' : ''}</small></button>`).join('');
    $$('#m3Lib .m3-tile').forEach((b) => { b.onclick = () => { m3Sel = b.dataset.id; renderM3Lib(); renderM3Edit(); }; });
  }

  // Вградени текстури (public/tex) + сите качени во библиотеката
  function m3TexOptions(cur) {
    const built = [...new Set(MDA3D.DEFAULTS.library.map((x) => x.tex).filter(Boolean))];
    const up = [...new Set(m3.library.map((x) => x.tex).filter((t) => t && t.startsWith('u:')))];
    const opt = (v, l) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    return opt('', 'Без текстура — само боја')
      + `<optgroup label="Вградени">${built.map((t) => opt(t, t.replace(/_/g, ' '))).join('')}</optgroup>`
      + (up.length ? `<optgroup label="Качени">${up.map((t) => opt(t, (m3.library.find((x) => x.tex === t) || {}).name + ' (' + t.slice(2) + ')')).join('')}</optgroup>` : '');
  }

  function renderM3Edit() {
    const d = m3Mat(m3Sel);
    const form = $('#tab-mat3d .m3-edit');
    if (!d) { $('#m3EditTitle').textContent = 'Нема материјали'; form.style.visibility = 'hidden'; return; }
    form.style.visibility = '';
    $('#m3EditTitle').textContent = d.name || 'Материјал';
    $('#m3Name').value = d.name || '';
    $('#m3Tex').innerHTML = m3TexOptions(d.tex);
    $('#m3Size').value = d.size;
    $('#m3Color').value = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#ffffff';
    [['#m3Bright', 'bright'], ['#m3Rough', 'rough'], ['#m3Metal', 'metal'], ['#m3Bump', 'bump']].forEach(([id, k]) => {
      $(id).value = d[k]; $(id).nextElementSibling.textContent = (+d[k]).toFixed(2);
    });
    $('#m3Bump').disabled = !d.tex || !d.normal;
    $('#m3Size').disabled = !d.tex;
    $('#m3UpN').disabled = !(d.tex && d.tex.startsWith('u:'));
    $('#m3UpNote').textContent = d.tex && d.tex.startsWith('u:') ? (d.normal ? 'со релјеф' : 'без релјеф') : '';
    const used = m3Slots().filter(([k]) => m3.slots[k] === d.id).map(([, l]) => l);
    const inRules = m3.rules.filter((r) => r.mat === d.id).length;
    $('#m3Used').textContent = (used.length ? 'Се користи за: ' + used.join(', ') : 'Не се користи за ниеден дел.') + (inRules ? ` · во ${inRules} правил${inRules === 1 ? 'о' : 'а'}` : '');
    m3Preview();
  }
  const m3Preview = () => { const d = m3Mat(m3Sel); if (d && $('#tab-mat3d').classList.contains('active')) MDA3D.preview($('#m3Prev'), d); };

  // Измена на избраниот материјал: зачувај, освежи мостра и преглед (без повторно цртање на формата)
  function m3Edit(fn, full) {
    const d = m3Mat(m3Sel); if (!d) return;
    fn(d);
    m3Save();
    renderM3Lib(); renderM3Slots();
    if (full) renderM3Edit(); else m3Preview();
  }
  $('#m3Name').oninput = (e) => m3Edit((d) => { d.name = e.target.value; $('#m3EditTitle').textContent = d.name || 'Материјал'; });
  $('#m3Tex').onchange = (e) => m3Edit((d) => {
    d.tex = e.target.value;
    const src = m3.library.find((x) => x !== d && x.tex === d.tex) || MDA3D.DEFAULTS.library.find((x) => x.tex === d.tex);
    // Ги презема големината и релјефот од материјал што веќе ја користи сликата
    d.normal = d.tex ? (src ? !!src.normal : false) : false;
    if (src) { d.size = src.size; if (src.v) d.v = src.v; }
  }, true);
  $('#m3Size').onchange = (e) => { const v = parseFloat(e.target.value); if (v >= 5) m3Edit((d) => { d.size = v; }); };
  $('#m3Color').oninput = (e) => m3Edit((d) => { d.color = e.target.value; });
  [['#m3Bright', 'bright'], ['#m3Rough', 'rough'], ['#m3Metal', 'metal'], ['#m3Bump', 'bump']].forEach(([id, k]) => {
    $(id).oninput = (e) => { e.target.nextElementSibling.textContent = (+e.target.value).toFixed(2); m3Edit((d) => { d[k] = +e.target.value; }); };
  });
  $('#m3Add').onclick = () => {
    const d = { id: m3NewId(), name: 'Нов материјал', tex: '', normal: false, size: 200, color: '#cccccc', bright: 1, rough: 0.9, metal: 0, bump: 1 };
    m3.library.push(d); m3Sel = d.id; m3Save(); renderMat3d();
    $('#m3Name').select();
  };
  $('#m3Dup').onclick = () => {
    const s = m3Mat(m3Sel); if (!s) return;
    const d = Object.assign(m3Clone(s), { id: m3NewId(), name: s.name + ' (копија)' });
    m3.library.splice(m3.library.indexOf(s) + 1, 0, d); m3Sel = d.id; m3Save(); renderMat3d();
  };
  $('#m3Del').onclick = async () => {
    const d = m3Mat(m3Sel); if (!d) return;
    const used = m3Slots().filter(([k]) => m3.slots[k] === d.id).map(([, l]) => l);
    if (used.length) return alert('Материјалот се користи за: ' + used.join(', ') + '. Прво избери друг материјал за тие делови.');
    if (m3.rules.some((r) => r.mat === d.id)) return alert('Материјалот се користи во правило. Прво избриши го или смени го правилото.');
    if (!confirm(`Избриши го материјалот „${d.name}“?`)) return;
    m3.library.splice(m3.library.indexOf(d), 1);
    // Качената слика се брише ако ниеден друг материјал не ја користи
    if (d.tex && d.tex.startsWith('u:') && !m3.library.some((x) => x.tex === d.tex)) {
      try { await api('/api/admin/tex/' + d.tex.slice(2), 'DELETE'); } catch (e) { /* останува на дискот */ }
    }
    m3Sel = null; m3Save(); renderMat3d();
  };

  // Качување: сликата се намалува на најмногу 1024 px и се претвора во WebP во прелистувачот
  async function m3Upload(file, kind) {
    const d = m3Mat(m3Sel); if (!d || !file) return;
    const note = $('#m3UpNote');
    note.textContent = 'Се качува…';
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.86));
      if (!blob || blob.type !== 'image/webp') throw new Error('прелистувачот не може да зачува WebP — пробајте со Chrome или Firefox');
      const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      // Нова слика → нов id (за да не се смени сликата кај другите материјали); релјеф → иста слика
      const id = kind === 'normal' ? d.tex.slice(2) : undefined;
      const res = await api('/api/admin/tex', 'POST', { id, kind, data: b64 });
      m3Edit((x) => {
        if (kind === 'color') { x.tex = 'u:' + res.id; x.normal = false; }
        else x.normal = true;
        x.v = Date.now();
        // Истата слика кај другите материјали ја добива новата верзија
        m3.library.forEach((o) => { if (o.tex === x.tex) { o.v = x.v; if (kind === 'normal') o.normal = true; } });
      }, true);
      flash('Сликата е качена ✓');
    } catch (e) {
      note.textContent = '';
      if (e.message !== '401') alert('Качувањето не успеа: ' + e.message);
    }
  }
  $('#m3UpC').onclick = () => $('#m3FileC').click();
  $('#m3UpN').onclick = () => $('#m3FileN').click();
  $('#m3FileC').onchange = (e) => { m3Upload(e.target.files[0], 'color'); e.target.value = ''; };
  $('#m3FileN').onchange = (e) => { m3Upload(e.target.files[0], 'normal'); e.target.value = ''; };

  const m3MatOptions = (cur) => m3.library.map((d) => `<option value="${esc(d.id)}"${d.id === cur ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  function renderM3Slots() {
    $('#m3Slots').innerHTML = m3Slots().map(([k, l]) => `<div class="m3-slot"><span class="m3-dot" style="${m3Swatch(m3Mat(m3.slots[k]))}"></span>
      <span>${esc(l)}</span><select data-slot="${k}">${m3MatOptions(m3.slots[k])}</select></div>`).join('');
    $$('#m3Slots select').forEach((el) => {
      el.onchange = () => { m3.slots[el.dataset.slot] = el.value; m3Save(); renderM3Slots(); renderM3Edit(); };
    });
  }
  $('#m3Reset').onclick = () => {
    if (!confirm('Сите делови да ги добијат стандардните материјали? Библиотеката и правилата остануваат.')) return;
    for (const d of MDA3D.DEFAULTS.library) if (!m3Mat(d.id)) m3.library.push(m3Clone(d));
    m3.slots = Object.assign({}, MDA3D.DEFAULTS.slots);
    m3Save(); renderMat3d();
  };

  // Правила: параметар = вредност → дел добива материјал
  function m3ValueField(r) {
    const inp = cfg.inputs.find((i) => i.key === r.param);
    const cur = String(r.value ?? '');
    if (inp && inp.type === 'select') return `<select data-r="value"><option value="">— изберете —</option>${(inp.options || []).map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (inp && inp.type === 'boolean') return `<select data-r="value"><option value="1"${cur === '1' ? ' selected' : ''}>Да</option><option value="0"${cur === '0' ? ' selected' : ''}>Не</option></select>`;
    return `<input type="text" data-r="value" value="${esc(cur)}" placeholder="вредност">`;
  }
  function renderM3Rules() {
    const params = cfg.inputs.filter((i) => i.type === 'select' || i.type === 'boolean');
    $('#m3Rules').innerHTML = m3.rules.map((r, i) => `<div class="m3-rule" data-i="${i}">
      <select data-r="param"><option value="">— параметар —</option>${params.map((p) => `<option value="${esc(p.key)}"${p.key === r.param ? ' selected' : ''}>${esc(p.label)}${p.type === 'select' ? ' ▾' : ''}</option>`).join('')}</select>
      ${m3ValueField(r)}
      <select data-r="slot">${m3Slots().map(([k, l]) => `<option value="${k}"${k === r.slot ? ' selected' : ''}>→ ${esc(l)}</option>`).join('')}</select>
      <select data-r="mat">${m3MatOptions(r.mat)}</select>
      <button class="icon-btn" data-r-del title="Избриши">🗑</button></div>`).join('')
      || '<p class="hint">Нема правила. Деловите секогаш ги имаат материјалите од лево.</p>';
  }
  $('#m3Rules').addEventListener('change', (e) => {
    const row = e.target.closest('.m3-rule'), f = e.target.dataset.r;
    if (!row || !f) return;
    const r = m3.rules[+row.dataset.i];
    r[f] = e.target.value;
    if (f === 'param') { const inp = cfg.inputs.find((i) => i.key === r.param); r.value = inp && inp.type === 'boolean' ? '1' : ''; }
    m3Save();
    if (f === 'param') renderM3Rules();
    if (f === 'mat') renderM3Edit();
  });
  $('#m3Rules').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r-del]');
    if (!b) return;
    m3.rules.splice(+b.closest('.m3-rule').dataset.i, 1);
    m3Save(); renderM3Rules(); renderM3Edit();
  });
  $('#m3AddRule').onclick = () => {
    m3.rules.push({ param: '', value: '', slot: 'roof', mat: m3Sel || m3.slots.roof });
    m3Save(); renderM3Rules();
  };

  // ── Стартување ──
  async function boot() {
    cfg = await fetch('/api/config').then((r) => r.json());
    $('#loginScreen').style.display = 'none';
    $('#adminApp').style.display = 'block';
    fillCatFilter();
    renderMaterials();
    renderCategories();
    renderInputs();
    renderWinDefs();
    renderSettings();
    loadMat3d();
    $('#varList').innerHTML = 'Достапни параметри: ' + cfg.inputs.map((i) => '<code>' + esc(i.key) + '</code>').join(' ');
  }

  // Ако има валиден токен од претходна сесија — директно влези
  if (token) {
    api('/api/admin/quotes').then(() => boot()).catch(() => {});
  }
})();
