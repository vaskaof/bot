'use strict';

/**
 * Экран "Каталог" — перенесён из admin/catalog.html (SPA админки, 02.08.2026).
 * SKU-модалка вынесена в общий _sku-modal.js (была дословной копией в
 * catalog.html/index.html/edit-order.html).
 */
window.Screens = window.Screens || {};
window.Screens.catalog = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Каталог</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="wishlist-demand-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="heart" class="w-6 h-6"></i>
      </button>
      <button id="add-sku-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('wishlist-demand-btn').addEventListener('click', () => navigateTo('wishlist-demand'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="catalog-search"
            class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400"
            placeholder="Поиск по каталогу..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="catalog-count"></div>

        <div id="catalog-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Позиции не найдены</div>
      </main>

      ${SkuModal.html()}
    `;

    let allSku = [];

    const listContainer = document.getElementById('catalog-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('catalog-search');
    const countLabel = document.getElementById('catalog-count');

    const skuModal = SkuModal.init({ onSaved: () => loadCatalog() });

    loadCatalog();

    async function loadCatalog() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка каталога...</div>';
      try {
        allSku = await callServer('getCatalogList');
        render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    const handleSearch = debounce(() => render(), 250);
    searchInput.addEventListener('input', handleSearch);

    function render() {
      const query = searchInput.value.trim().toLowerCase();

      let filtered = allSku;
      if (query !== '') {
        filtered = allSku.filter(s => {
          const haystack = `${s.original} ${s.shortName} ${s.brand} ${s.character} ${s.series}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      countLabel.textContent = `Найдено: ${filtered.length}`;
      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        filtered.forEach(s => listContainer.appendChild(buildCard(s)));
      }
    }

    function buildCard(s) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => skuModal.open('edit', s.original));

      const tags = [s.brand, s.character, s.series].filter(t => t !== '');

      card.innerHTML = `
        <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(s.shortName || s.original)}</div>
        ${s.shortName && s.shortName !== s.original ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(s.original)}</div>` : ''}
        ${tags.length > 0 ? `<div class="flex flex-wrap gap-1.5 mt-2">${tags.map(t => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(t)}</span>`).join('')}</div>` : ''}
      `;
      return card;
    }

    document.getElementById('add-sku-btn').addEventListener('click', () => skuModal.open('create'));
  }
};
