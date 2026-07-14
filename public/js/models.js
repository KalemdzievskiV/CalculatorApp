/* Страница со модели — рендерира од window.MDA_MODELS (генерирано од Wix CSV извозот). */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const models = (window.MDA_MODELS || []).slice();
  let state = { type: '', sort: 'area-asc' };

  const grid = $('#modelsPageGrid');
  const countEl = $('#modelsCount');

  // Спецификации како ситни чипови
  function specChips(m) {
    const chips = [];
    if (m.beds) chips.push(m.beds + ' спални');
    if (m.baths) chips.push(m.baths + ' бањи');
    if (m.floors) chips.push(m.floors + (m.floors === '1' ? ' кат' : ' ката'));
    if (m.year) chips.push(m.year);
    return chips.map((c) => `<span class="spec-chip">${esc(c)}</span>`).join('');
  }
  // Најниска цена за приказ на картичка (сива фаза е обично најевтина)
  function fromPrice(m) {
    const p = m.priceGray || m.priceSip || m.priceStone || '';
    return p;
  }

  function renderGrid() {
    let list = models.filter((m) => !state.type || m.type === state.type);
    const s = state.sort;
    list.sort((a, b) => {
      if (s === 'area-asc') return a.area - b.area;
      if (s === 'area-desc') return b.area - a.area;
      if (s === 'name') return a.name.localeCompare(b.name, 'mk');
      if (s === 'year-desc') return (b.year || '').localeCompare(a.year || '');
      return 0;
    });
    countEl.textContent = list.length + ' модели';
    grid.innerHTML = list.map((m, i) => `
      <article class="mp-card" data-name="${esc(m.name)}">
        <div class="mp-photo">
          ${m.image ? `<img loading="lazy" src="${esc(m.image)}" alt="${esc(m.name)}" onerror="this.style.display='none';this.parentNode.classList.add('noimg')">` : ''}
          ${m.promo ? '<span class="mp-promo">PROMO</span>' : ''}
          <span class="mp-area">${esc(m.areaLabel || (m.area + ' m²'))}</span>
        </div>
        <div class="mp-body">
          <h3>${esc(m.name)}</h3>
          <div class="mp-specs">${specChips(m)}</div>
          <div class="mp-pricerow">
            <span class="mp-from">од</span>
            <span class="mp-price">${esc(fromPrice(m) || '—')}</span>
          </div>
        </div>
      </article>`).join('');
    grid.querySelectorAll('.mp-card').forEach((card) => {
      card.onclick = () => openModal(models.find((x) => x.name === card.dataset.name));
    });
  }

  // ── Модал со детали ──
  const modal = $('#modelModal');
  const modalBody = $('#modelModalBody');
  function priceLine(label, val, hint) {
    if (!val) return '';
    return `<div class="mp-detail-price"><div><div class="pl-label">${esc(label)}</div>${hint ? `<div class="pl-hint">${esc(hint)}</div>` : ''}</div><div class="pl-val">${esc(val)}</div></div>`;
  }
  function openModal(m) {
    if (!m) return;
    if (window.mdaTrack) window.mdaTrack('model_open');
    const imgs = [m.imageFull, ...(m.gallery || [])].filter(Boolean);
    const uniq = [...new Set(imgs)];
    modalBody.innerHTML = `
      <div class="mp-gallery">
        <div class="mp-gallery-main"><img id="mpMainImg" src="${esc(uniq[0] || '')}" alt="${esc(m.name)}"></div>
        ${uniq.length > 1 ? `<div class="mp-thumbs">${uniq.map((u, i) => `<img class="mp-thumb${i === 0 ? ' active' : ''}" data-src="${esc(u)}" src="${esc(u)}" alt="">`).join('')}</div>` : ''}
      </div>
      <div class="mp-detail">
        <div class="sec-kick">${esc(m.type || 'МОДЕЛ')}${m.year ? ' · ' + esc(m.year) : ''}</div>
        <h2 class="mp-detail-title">${esc(m.name)}</h2>
        <div class="mp-specs big">${specChips(m)}<span class="spec-chip">${esc(m.areaLabel || m.area + ' m²')}</span></div>

        <div class="mp-prices">
          <div class="mp-prices-head mono">${m.promo ? 'PROMO ЦЕНИ · по m²' : 'ЦЕНИ · по m²'}</div>
          ${priceLine('Камена волна', m.priceStone, 'полн систем')}
          ${priceLine('СИП панел', m.priceSip, 'брза монтажа')}
          ${priceLine('Сива фаза', m.priceGray, 'без финиш')}
          ${priceLine('Затворена гаража', m.garage, '')}
          ${priceLine('Пергола и под', m.pergola, '')}
        </div>

        <div class="mp-times mono">
          ${m.days ? `<span>🏭 Изработка: ${esc(m.days)}</span>` : ''}
          ${m.fabric ? `<span>🔧 Монтажа: ${esc(m.fabric)}</span>` : ''}
        </div>

        <div class="mp-detail-cta">
          <a class="btn accent" href="index.html#calc">Пресметај сличен →</a>
          <a class="btn ghost" href="index.html#customplan">Побарај понуда</a>
        </div>
        <p class="mp-disclaimer">Цената не вклучува изработка на постамент, кошулка и транспорт од фабрика (Скопје) до локацијата. Финалната понуда се потврдува по увид на проект.</p>
      </div>`;
    // thumbnail switching
    modalBody.querySelectorAll('.mp-thumb').forEach((t) => {
      t.onclick = () => {
        modalBody.querySelector('#mpMainImg').src = t.dataset.src;
        modalBody.querySelectorAll('.mp-thumb').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      };
    });
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  $('#modelModalClose').onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ── Филтри по тип ──
  function initFilters() {
    const types = [...new Set(models.map((m) => m.type).filter(Boolean))];
    const host = $('#typeFilters');
    const mk = (val, label) => `<button class="fchip${state.type === val ? ' active' : ''}" data-type="${esc(val)}">${esc(label)}</button>`;
    host.innerHTML = mk('', 'Сите') + types.map((t) => mk(t, t)).join('');
    host.querySelectorAll('.fchip').forEach((b) => {
      b.onclick = () => {
        state.type = b.dataset.type;
        host.querySelectorAll('.fchip').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderGrid();
      };
    });
  }
  $('#sortSel').onchange = (e) => { state.sort = e.target.value; renderGrid(); };

  // ── Мобилно мени (како на лендингот) ──
  const burger = $('#navBurger'), links = $('#navLinks');
  if (burger && links) burger.onclick = () => links.classList.toggle('open');
  // навигацијата тука е секогаш цврста (нема херо позади неа)
  const nav = $('#siteNav');
  if (nav) nav.classList.add('solid-nav');

  initFilters();
  renderGrid();

  // Длабоко поврзување: models.html?model=ИМЕ отвора директно детали
  const wanted = new URLSearchParams(location.search).get('model');
  if (wanted) {
    const m = models.find((x) => x.name === wanted);
    if (m) openModal(m);
  }
})();
