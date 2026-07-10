/* Админ панел — уредување материјали, категории, параметри, дограма, понуди и подесувања.
   Промените се зачувуваат веднаш на серверот (PUT на целата колекција). */
(function () {
  let token = localStorage.getItem('mdaToken') || '';
  let cfg = null;

  const $ = (s) => document.querySelector(s);
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
    const body = $('#quoteTable tbody');
    let quotes;
    try { quotes = await api('/api/admin/quotes'); }
    catch (e) {
      if (e.message !== '401') body.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px;">Грешка: ${esc(e.message)}</td></tr>`;
      return;
    }
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
        try { await api('/api/admin/quotes/' + id, 'DELETE'); } catch (e) { if (e.message !== '401') flash('Грешка: ' + e.message); return; }
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
  const calc = { inputs: {}, windows: [], discountEur: 0, client: '', date: '', covered: 0, open: null, outerH: 4.6 };

  const rate = () => cfg.settings.eurRate || 62;
  const eur0 = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' €';
  const eur2 = (v) => new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const mkd0 = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ден';
  const q = (v) => new Intl.NumberFormat('mk-MK', { maximumFractionDigits: 2 }).format(v);
  const today = () => new Date().toLocaleDateString('mk-MK');

  function calcDefaults() {
    calc.inputs = {};
    cfg.inputs.forEach((i) => { if (i.type !== 'derived') calc.inputs[i.key] = i.def; });
    calc.windows = JSON.parse(JSON.stringify(cfg.windowsDefaults || []));
    calc.discountEur = 0;
    calc.covered = 0;
    calc.open = null; // null => користи AREA_TERRACE
    calc.outerH = 4.6;
  }

  // Вкупна површина со симсови = куќа + симсови + тераси (како во Excel: 166+11+12.41 = 189.41)
  const openTer = () => (calc.open == null ? (calc.inputs.AREA_TERRACE || 0) : calc.open);
  const areaWithSims = () => (calc.inputs.AREA_HOUSE || 0) + (calc.inputs.SIMS || 0) + (calc.covered || 0) + openTer();

  function recalcAdmin() {
    calcRes = MDAEngine.compute(cfg, { inputs: calc.inputs, windows: calc.windows, discountEur: calc.discountEur });
    const r = calcRes, aws = areaWithSims();
    $('#cTotalEur').textContent = eur2(r.totalEur);
    $('#cTotalMkd').textContent = mkd0(r.totalMkd);
    $('#cTax').textContent = eur2(r.taxEur);
    $('#cPerM2').textContent = eur2(r.perM2);
    $('#cArea').textContent = q(r.area) + ' m²';
    $('#cGrey').textContent = eur2(r.greyEur);
    $('#cGreyM2').textContent = eur2(aws ? r.greyEur / aws : 0);
    $('#cFinal').textContent = eur2(r.finalEur);
    $('#cPerM2Sims').textContent = eur2(aws ? r.finalEur / aws : 0);

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

  function renderCalcInputs() {
    const host = $('#cInputs');
    host.innerHTML = cfg.inputGroups.map((g) => {
      const fields = cfg.inputs.filter((i) => i.group === g && i.type !== 'derived');
      if (!fields.length) return '';
      return `<div class="ci-group"><h4>${esc(g)}</h4><div class="ci-grid">` + fields.map((inp) => {
        if (inp.type === 'boolean') {
          return `<label class="toggle${calc.inputs[inp.key] ? ' on' : ''}" data-key="${inp.key}">
            <span class="t-label">${esc(inp.label)}</span><span class="knob"></span></label>`;
        }
        return `<div class="field"><label>${esc(inp.label)}${inp.unit ? `<span class="unit">${esc(inp.unit)}</span>` : ''}</label>
          <input type="number" step="any" data-key="${inp.key}" value="${calc.inputs[inp.key]}"></div>`;
      }).join('') + '</div></div>';
    }).join('');
    host.querySelectorAll('input[data-key]').forEach((el) => {
      el.oninput = () => { calc.inputs[el.dataset.key] = parseFloat(el.value) || 0; recalcAdmin(); };
    });
    host.querySelectorAll('.toggle[data-key]').forEach((el) => {
      el.onclick = () => {
        const k = el.dataset.key;
        calc.inputs[k] = calc.inputs[k] ? 0 : 1;
        el.classList.toggle('on', !!calc.inputs[k]);
        recalcAdmin();
      };
    });
  }

  function renderCalcWindows() {
    const body = $('#cWinTable tbody');
    body.innerHTML = '';
    calc.windows.forEach((w, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono muted">${i + 1}</td>
        <td><input type="text" value="${esc(w.name)}"></td>
        <td class="num"><input type="number" step="any" style="width:70px;text-align:right;" value="${w.qty}"></td>
        <td class="num"><input type="number" step="any" style="width:84px;text-align:right;" value="${w.priceEur}"></td>
        <td><button class="icon-btn del" title="Избриши">🗑</button></td>`;
      const [n, qi, p] = tr.querySelectorAll('input');
      n.oninput = (e) => { w.name = e.target.value; };
      qi.oninput = (e) => { w.qty = parseFloat(e.target.value) || 0; recalcAdmin(); };
      p.oninput = (e) => { w.priceEur = parseFloat(e.target.value) || 0; recalcAdmin(); };
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
  }

  $('#cReset').onclick = () => { calcDefaults(); calc.date = today(); syncCalcFields(); renderCalcInputs(); renderCalcWindows(); recalcAdmin(); };
  $('#cAddWin').onclick = () => { calc.windows.push({ name: '', qty: 1, priceEur: 0 }); renderCalcWindows(); recalcAdmin(); };
  $('#cClient').oninput = (e) => { calc.client = e.target.value; };
  $('#cDate').oninput = (e) => { calc.date = e.target.value; };
  $('#cDiscount').oninput = (e) => { calc.discountEur = parseFloat(e.target.value) || 0; recalcAdmin(); };
  $('#cCovered').oninput = (e) => { calc.covered = parseFloat(e.target.value) || 0; recalcAdmin(); };
  $('#cOpen').oninput = (e) => { calc.open = e.target.value === '' ? null : parseFloat(e.target.value) || 0; recalcAdmin(); };
  $('#cOuterH').oninput = (e) => { calc.outerH = parseFloat(e.target.value) || 0; };

  $('#cSaveQuote').onclick = async () => {
    const r = await fetch('/api/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: calc.client.trim() || 'Без име', inputs: calc.inputs, windows: calc.windows, discountEur: calc.discountEur, totalEur: calcRes.totalEur }),
    }).then((x) => x.json());
    $('#cNote').innerHTML = 'Зачувано ✓ <a href="index.html?quote=' + r.id + '" target="_blank">линк</a>';
  };

  /* ── Генератор на ПОНУДА (клуч на рака / сива фаза) ── */
  // Пресметана количина за spec со `codes` (собира qty од моторот)
  function qtyOfCodes(codes) {
    return codes.reduce((s, code) => {
      const row = calcRes.rows.find((r) => r.code === code);
      return s + (row ? row.qty : 0);
    }, 0);
  }

  function offerSection(s) {
    let h = `<div class="of-sec"><h3>${esc(s.title)}</h3>`;
    if (s.items.length) {
      h += '<ul>' + s.items.map((i) =>
        `<li>${esc(i.text)}${i.value ? ` — <b>${esc(i.value)}</b>` : ''}</li>`).join('') + '</ul>';
    }
    s.specs.forEach((sp) => {
      const val = sp.codes ? `${q(Math.round(qtyOfCodes(sp.codes)))} ${esc(sp.unit || '')}` : esc(sp.value);
      h += `<div class="of-spec"><span>${esc(sp.label)}</span><b>${val}</b></div>`;
    });
    s.notes.forEach((n) => { h += `<p class="of-note">${esc(n)}</p>`; });
    return h + '</div>';
  }

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
    const baseEur = isGrey ? r.greyEur : r.totalEur;
    const discount = isGrey ? 0 : r.discountEur;
    const finalEur = baseEur - discount;
    const finalMkd = finalEur * rate();
    const aws = areaWithSims();
    const perM2 = aws ? finalEur / aws : 0;
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
      ${t.sections.map(offerSection).join('')}

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
