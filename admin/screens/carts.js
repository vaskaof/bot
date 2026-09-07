'use strict';

/**
 * Экран "Корзины" — список (Фаза F, IMPLEMENTATION-PLAN-CART-UX.md §7,
 * 07.09.2026). Зеркало `lots.js` — тот же паттерн: не в нижней навигации
 * (открывается иконкой из orders.js, рядом с уже существующим входом в
 * «Лоты»), сама навигация остаётся видимой (showNav:true, navKey:null — см.
 * router.js). Метод `getCartsList` уже существовал backend-only с фазы 2
 * (REFACTOR-CART.md) — до этого экрана ни одна строка фронтенда его не
 * вызывала (grep подтверждён в плане §7).
 */
window.Screens = window.Screens || {};
window.Screens.carts = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Корзины</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-3 flex items-center gap-1">
          <button type="button" id="add-cart-btn" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="shopping-cart" class="w-5 h-5"></i>
            <span class="text-[11px] font-medium leading-none">+ Корзина</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="cart-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/карго..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="cart-count"></div>
        <div id="cart-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Корзин не найдено</div>
      </main>
    `;

    document.getElementById('add-cart-btn').addEventListener('click', () => navigateTo('carts/new'));

    let allCarts = [];
    const listEl = document.getElementById('cart-list');
    const emptyMessage = document.getElementById('empty-message');
    const countEl = document.getElementById('cart-count');
    const searchInput = document.getElementById('cart-list-search');

    function buildCard(cart) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => navigateTo(`carts/${encodeURIComponent(cart.cartId)}`));
      const parts = [];
      if (cart.orderCount > 0) parts.push(`${cart.orderCount} ${cart.orderCount === 1 ? 'заказ' : 'заказов'}`);
      if (cart.lotCount > 0) parts.push(`${cart.lotCount} ${cart.lotCount === 1 ? 'лот' : 'лотов'}`);
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px]">Корзина #${escapeHtmlClient(cart.cartId)}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(cart.currency)}${cart.cargo ? ' · ' + escapeHtmlClient(cart.cargo) : ''}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0">${cart.purchaseDate ? escapeHtmlClient(cart.purchaseDate) : ''}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          ${parts.map((p) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">${escapeHtmlClient(p)}</span>`).join('')}
        </div>
      `;
      return card;
    }

    function renderList() {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = query === '' ? allCarts : allCarts.filter((c) =>
        c.cartId.toLowerCase().includes(query) || (c.cargo || '').toLowerCase().includes(query));

      listEl.innerHTML = '';
      filtered.forEach((c) => listEl.appendChild(buildCard(c)));
      emptyMessage.classList.toggle('hidden', filtered.length > 0);
      countEl.textContent = `Всего: ${filtered.length}`;
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.addEventListener('input', renderList);

    async function load() {
      try {
        allCarts = await callServer('getCartsList');
        renderList();
      } catch (error) {
        showSaveToast(false, `Не удалось загрузить корзины: ${error.message}`);
      }
    }
    load();

    if (window.lucide) window.lucide.createIcons();
  }
};
