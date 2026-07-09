/* Админ панел — уредување материјали, категории, параметри, дограма, понуди и подесувања.
   Промените се зачувуваат веднаш на серверот (PUT на целата колекција). */
(function () {
  let token = localStorage.getItem('mdaToken') || '';
  let cfg = null;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(v);

  async function api(path, method, body) {
    const r = await fetch(path, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { logout(); throw new Error('401'); }
    return r.json();
  }
  function flash(msg) {
    const f = $('#flash');
    f.textContent = msg || 'Зачувано ✓';
    f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 1400);
  }
  async function save(collection) {
    await api('/api/admin/' + collection, 'PUT', cfg[collection === 'windowsDefaults' ? 'windowsDefaults' : collection]);
    flash();
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
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => $('#matModal').classList.remove('open'); });

  function knownVarsAndCodes() {
    const vars = cfg.inputs.map((x) => x.key).concat(['WINDOWS_QTY']);
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
  }
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
  function renderInputs() {
    const body = $('#inputTable tbody');
    body.innerHTML = cfg.inputs.map((inp, i) => `<tr data-i="${i}">
      <td class="mono">${esc(inp.key)}</td>
      <td>${esc(inp.label)}</td>
      <td class="muted" style="font-size:11.5px;">${esc(inp.group || '')}</td>
      <td><span class="tag">${inp.type === 'boolean' ? 'да/не' : inp.type === 'derived' ? 'изведен' : 'број'}</span></td>
      <td class="num">${inp.type === 'derived' ? '<span class="mono" style="font-size:11px;">' + esc(inp.formula) + '</span>' : `<input type="number" step="any" value="${inp.def}" style="width:90px;text-align:right;font-family:var(--mono);font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;">`}</td>
      <td class="muted">${esc(inp.unit || '')}</td>
      <td>${inp.type !== 'derived' ? '<button class="icon-btn del" title="Избриши">🗑</button>' : ''}</td>
    </tr>`).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      const numInput = tr.querySelector('input[type=number]');
      if (numInput) numInput.onchange = async (e) => { cfg.inputs[i].def = parseFloat(e.target.value) || 0; await save('inputs'); };
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
  }
  $('#addInput').onclick = async () => {
    const key = (prompt('Клуч (латиница, без празни места, пр. GARAZA):') || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!key) return;
    if (cfg.inputs.some((x) => x.key === key)) return alert('Клучот постои');
    const label = prompt('Име (како ќе се прикаже во калкулаторот):') || key;
    const type = confirm('Да/не прекинувач? (Откажи = броен параметар)') ? 'boolean' : 'number';
    const group = prompt('Група:\n' + cfg.inputGroups.join(', '), cfg.inputGroups[0]) || cfg.inputGroups[0];
    if (!cfg.inputGroups.includes(group)) { cfg.inputGroups.push(group); await save('inputGroups'); }
    cfg.inputs.push({ key, label, group, type, def: 0, unit: '' });
    await save('inputs');
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
    const quotes = await api('/api/admin/quotes');
    const body = $('#quoteTable tbody');
    body.innerHTML = quotes.length ? quotes.map((q) => `<tr data-id="${q.id}">
      <td class="mono muted">${new Date(q.createdAt).toLocaleString('mk-MK')}</td>
      <td>${esc(q.client)}</td>
      <td class="num">${fmt(q.totalEur)} €</td>
      <td>
        <a class="icon-btn" href="index.html?quote=${q.id}" title="Отвори во калкулатор">↗</a>
        <button class="icon-btn del" title="Избриши">🗑</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="4" class="muted" style="text-align:center;padding:24px;">Нема зачувани понуди.</td></tr>';
    body.querySelectorAll('.del').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('tr').dataset.id;
        if (!confirm('Избриши понуда?')) return;
        await api('/api/admin/quotes/' + id, 'DELETE');
        renderQuotes();
      };
    });
  }

  // ══ ПОДЕСУВАЊА ══
  function renderSettings() {
    $('#setCompany').value = cfg.settings.companyName || '';
    $('#setPhone').value = cfg.settings.phone || '';
    $('#setVat').value = cfg.settings.vatPct;
    $('#setRate').value = cfg.settings.eurRate;
  }
  $('#saveSettings').onclick = async () => {
    const body = {
      companyName: $('#setCompany').value,
      phone: $('#setPhone').value,
      vatPct: parseFloat($('#setVat').value) || 18,
      eurRate: parseFloat($('#setRate').value) || 62,
    };
    const pw = $('#setPw').value.trim();
    if (pw) body.adminPassword = pw;
    await api('/api/admin/settings', 'PUT', body);
    Object.assign(cfg.settings, body);
    $('#setPw').value = '';
    flash();
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
    $('#varList').innerHTML = 'Достапни параметри: ' + cfg.inputs.map((i) => '<code>' + esc(i.key) + '</code>').join(' ');
  }

  // Ако има валиден токен од претходна сесија — директно влези
  if (token) {
    api('/api/admin/quotes').then(() => boot()).catch(() => {});
  }
})();
