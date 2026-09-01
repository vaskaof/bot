'use strict';

/**
 * Экран "Лоты" — список + две точки входа в создание (delegated-spinning-
 * rabbit.md, 02.09.2026). Тот же паттерн, что `collectives.js`: не в
 * нижней навигации (открывается иконкой из orders.js), но сама навигация
 * остаётся видимой (showNav:true, navKey:null — см. router.js).
 *
 * Лот и Корзина — ОДНА и та же сущность/форма (`lot-new.js`), разница
 * только в точке входа (`entryPoint`, чисто подпись карточки) — см. JSDoc
 * `lotsService.createLot` на бэкенде. Здесь — просто две кнопки, ведущие на
 * тот же маршрут с разным query-параметром.
 */
window.Screens = window.Screens || {};
window.Screens.lots = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Лоты${helpIcon('Что такое лот', '<p>Лот — это одна общая закупка (у продавца ассорти, или корзина с площадки), которую нужно разнести на несколько заказов клиентов сразу.</p><p>Стоимость и вес/логистика делятся между позициями коэффициентами — вы задаёте только общую сумму и доли, суммы по каждому заказу считаются автоматически.</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-3 flex items-center gap-1">
          <button type="button" id="add-lot-btn" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="package-plus" class="w-5 h-5"></i>
            <span class="text-[11px] font-medium leading-none">+ Лот</span>
          </button>
          <button type="button" id="add-cart-btn" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="shopping-cart" class="w-5 h-5"></i>
            <span class="text-[11px] font-medium leading-none">+ Корзина</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="lot-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/карго..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="lot-count"></div>
        <div id="lot-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Лотов не найдено</div>
      </main>
    `;

    document.getElementById('add-lot-btn').addEventListener('click', () => navigateTo('lots/new', { entryPoint: 'lot' }));
    document.getElementById('add-cart-btn').addEventListener('click', () => navigateTo('lots/new', { entryPoint: 'cart' }));

    let allLots = [];
    const listEl = document.getElementById('lot-list');
    const emptyMessage = document.getElementById('empty-message');
    const countEl = document.getElementById('lot-count');
    const searchInput = document.getElementById('lot-list-search');

    function buildCard(lot) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => navigateTo(`lots/${encodeURIComponent(lot.lotId)}`));
      const entryLabel = lot.entryPoint === 'cart' ? 'Корзина' : 'Лот';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px]">${entryLabel} #${escapeHtmlClient(lot.lotId)}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(lot.totalAmountInCurrency)} ${escapeHtmlClient(lot.currency)}${lot.cargo ? ' · ' + escapeHtmlClient(lot.cargo) : ''}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0">${lot.purchaseDate ? escapeHtmlClient(lot.purchaseDate) : ''}</div>
        </div>
        <div class="mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">${lot.orderCount} ${lot.orderCount === 1 ? 'заказ' : 'заказов'}</span>
        </div>
      `;
      return card;
    }

    function renderList() {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = query === '' ? allLots : allLots.filter((l) =>
        l.lotId.toLowerCase().includes(query) || (l.cargo || '').toLowerCase().includes(query));

      listEl.innerHTML = '';
      filtered.forEach((l) => listEl.appendChild(buildCard(l)));
      emptyMessage.classList.toggle('hidden', filtered.length > 0);
      countEl.textContent = `Всего: ${filtered.length}`;
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.addEventListener('input', renderList);

    async function load() {
      try {
        allLots = await callServer('getLotsList');
        renderList();
      } catch (error) {
        showSaveToast(false, `Не удалось загрузить лоты: ${error.message}`);
      }
    }
    load();

    if (window.lucide) window.lucide.createIcons();
  }
};
