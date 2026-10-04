'use strict';

/**
 * Экран «Покупки» (волна 5 аудита менеджера, 03.10.2026) — один список
 * вместо двух иконок «Лоты» и «Корзины» на экране «Заказы». Одна карточка =
 * одна покупка (корзина или старый отдельный лот): товары с миниатюрами,
 * клиенты, статусы — видно, что куплено и каким лотом, не открывая карточку.
 * Фильтр «Только лоты» — просьба менеджеров (VASY 03.10). Старые экраны
 * lots/carts и карточки lots/<id>, carts/<id> остаются — карточка покупки
 * ведёт на них.
 */
window.Screens = window.Screens || {};
window.Screens.purchases = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Покупки${helpIcon('Покупки', '<p>Каждая карточка — одна покупка: корзина (выкуп с одного аккаунта) или отдельный лот, созданный до появления корзин.</p><p>Лот — несколько товаров одной общей покупкой, стоимость и вес делятся между позициями. «Только лоты» оставляет покупки, в которых есть лот.</p><p>Заказы, созданные до корзин (август), здесь не показаны — они в «Заказах».</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button type="button" id="purchases-new-btn" title="Новая корзина" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('purchases-new-btn').addEventListener('click', () => navigateTo('carts/new'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl md:max-w-6xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="purchases-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Товар, клиент, канал, ID..." autocomplete="off">
        </div>
        <div class="flex items-center gap-1.5 mb-3" id="purchases-filter">
          <button type="button" data-filter="all" class="purchases-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">Все</button>
          <button type="button" data-filter="lots" class="purchases-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border inline-flex items-center gap-1"><i data-lucide="boxes" class="w-3.5 h-3.5"></i>Только лоты</button>
        </div>
        <div class="text-[11px] text-gray-400 px-1 mb-2" id="purchases-count"></div>
        <div id="purchases-list" class="wide-grid"><div class="p-6 text-center text-sm text-gray-400">Загрузка…</div></div>
        <div id="purchases-empty" class="hidden text-center text-sm text-gray-400 py-10">Покупок не найдено</div>
      </main>
    `;

    const STATE_KEY = 'knopka_purchases_state';
    let state = { filter: 'all', query: '' };
    try { state = { ...state, ...JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}') }; } catch (e) { /* без сохранённого фильтра */ }
    function saveState() { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* необязательно */ } }

    const listEl = document.getElementById('purchases-list');
    const emptyEl = document.getElementById('purchases-empty');
    const countEl = document.getElementById('purchases-count');
    const searchInput = document.getElementById('purchases-search');
    searchInput.value = state.query;
    let all = [];
    const MAX_ITEMS = 4;

    function renderFilterButtons() {
      document.querySelectorAll('.purchases-filter-btn').forEach((btn) => {
        const active = btn.dataset.filter === state.filter;
        btn.className = `purchases-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border inline-flex items-center gap-1 ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`;
      });
    }

    function haystack(p) {
      return [p.id, p.purchaseChannel, p.purchaseAccount, p.cargo, ...p.lotIds,
        ...p.items.map((i) => `${i.productDisplay} ${i.clientDisplay} ${i.remark} ${i.orderId}`)].join(' ').toLowerCase();
    }

    function itemHtml(i) {
      return `
        <div class="flex items-center gap-2 py-1">
          ${i.imageUrl
            ? `<img src="${escapeHtmlClient(i.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.visibility='hidden'">`
            : '<div class="w-8 h-8 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center"><i data-lucide="package" class="w-4 h-4 text-gray-300"></i></div>'}
          <div class="min-w-0 flex-1">
            <div class="text-[13px] text-gray-900 truncate">${escapeHtmlClient(i.productDisplay)}${i.remark ? ` <span class="text-gray-400">· ${escapeHtmlClient(i.remark)}</span>` : ''}</div>
            <div class="text-[11px] text-gray-500 truncate">${escapeHtmlClient(i.clientDisplay || 'Личный')}${i.statusDelivery ? ` · ${escapeHtmlClient(i.statusDelivery)}` : ''}</div>
          </div>
          ${i.lotId || i.isLotPlaceholder ? '<i data-lucide="boxes" class="w-3.5 h-3.5 text-teal-500 shrink-0" title="Лот"></i>' : ''}
        </div>`;
    }

    function buildCard(p) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', (e) => {
        const lotChip = e.target.closest('[data-lot-id]');
        if (lotChip) { e.stopPropagation(); navigateTo(`lots/${encodeURIComponent(lotChip.dataset.lotId)}`); return; }
        navigateTo(p.kind === 'cart' ? `carts/${encodeURIComponent(p.id)}` : `lots/${encodeURIComponent(p.id)}`);
      });
      const clients = [...new Set(p.items.map((i) => i.clientDisplay || 'Личный'))];
      const meta = [p.purchaseChannel, p.purchaseAccount, p.cargo].filter(Boolean).join(' · ');
      const shown = p.items.slice(0, MAX_ITEMS);
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px]">${p.kind === 'cart' ? `Корзина #${escapeHtmlClient(p.id)}` : `Лот #${escapeHtmlClient(p.id)}`}</div>
            <div class="text-[12px] text-gray-400 mt-0.5 truncate">${escapeHtmlClient(meta || p.currency || '')}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(p.purchaseDate || '')}</div>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${p.items.length} ${p.items.length === 1 ? 'заказ' : 'заказов'}</span>
          ${p.lotIds.map((id) => `<button type="button" data-lot-id="${escapeHtmlClient(id)}" class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">лот #${escapeHtmlClient(id)} →</button>`).join('')}
          ${clients.slice(0, 3).map((c) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 truncate max-w-[10rem]">${escapeHtmlClient(c)}</span>`).join('')}
          ${clients.length > 3 ? `<span class="text-[11px] text-gray-400">+${clients.length - 3}</span>` : ''}
        </div>
        <div class="mt-2 pt-2 border-t border-gray-100">
          ${shown.map(itemHtml).join('')}
          ${p.items.length > MAX_ITEMS ? `<div class="text-[11px] text-gray-400 pt-1">и ещё ${p.items.length - MAX_ITEMS}…</div>` : ''}
        </div>
      `;
      return card;
    }

    function renderList() {
      const q = state.query.trim().toLowerCase();
      const filtered = all.filter((p) => (state.filter !== 'lots' || p.hasLot) && (q === '' || haystack(p).includes(q)));
      listEl.innerHTML = '';
      filtered.forEach((p) => listEl.appendChild(buildCard(p)));
      emptyEl.classList.toggle('hidden', filtered.length > 0);
      countEl.textContent = `Покупок: ${filtered.length}`;
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('purchases-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('.purchases-filter-btn');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      saveState();
      renderFilterButtons();
      renderList();
    });
    searchInput.addEventListener('input', debounce(() => { state.query = searchInput.value; saveState(); renderList(); }, 200));

    renderFilterButtons();
    callServer('getPurchasesList').then((list) => {
      all = list || [];
      renderList();
    }).catch((error) => {
      listEl.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Не удалось загрузить покупки: ${escapeHtmlClient(error.message)}</div>`;
    });
    if (window.lucide) window.lucide.createIcons();
  }
};
