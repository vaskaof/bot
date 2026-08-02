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
      <button id="find-duplicates-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="copy-check" class="w-6 h-6"></i>
      </button>
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

      <div id="duplicates-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Аудит каталога</h2>
            <button id="duplicates-close" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="duplicates-body" class="p-4 space-y-4"></div>
        </div>
      </div>
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

    // Аудит существующего каталога — кластеры вероятных дублей + позиции без
    // ссылки (инструмент "Найти вероятные дубли", 03.08.2026). Сам ничего не
    // меняет — "Объединить" открывает уже существующую SKU-модалку в режиме
    // редактирования с подставленным именем цели, дальше срабатывает обычный
    // merge-флоу (точный конфликт → keepExisting/keepNew).
    const duplicatesModal = document.getElementById('duplicates-modal');
    const duplicatesBody = document.getElementById('duplicates-body');

    function closeDuplicatesModal() {
      duplicatesModal.classList.add('hidden');
      duplicatesModal.classList.remove('flex');
    }
    document.getElementById('duplicates-close').addEventListener('click', closeDuplicatesModal);

    document.getElementById('find-duplicates-btn').addEventListener('click', async () => {
      duplicatesBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Проверяю каталог...</div>';
      duplicatesModal.classList.remove('hidden');
      duplicatesModal.classList.add('flex');

      try {
        const result = await callServer('findDuplicateCatalogClusters');
        renderDuplicatesReport(result);
      } catch (error) {
        duplicatesBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    });

    function renderDuplicatesReport(result) {
      if (result.clusters.length === 0 && result.missingLink.length === 0) {
        duplicatesBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Вероятных дублей и позиций без ссылки не найдено.</div>';
        return;
      }

      duplicatesBody.innerHTML = '';

      if (result.clusters.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `<div class="text-xs font-semibold text-gray-500 mb-2">Вероятные дубли (${result.clusters.length})</div>`;
        result.clusters.forEach(cluster => {
          const block = document.createElement('div');
          block.className = 'border border-amber-200 bg-amber-50 rounded-xl p-3 mb-2 space-y-1.5';
          cluster.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 text-xs';
            row.innerHTML = `
              <span class="text-gray-700">${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span></span>
              ${idx > 0 ? `<button type="button" class="merge-with-first-btn shrink-0 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-idx="${idx}">Объединить</button>` : ''}
            `;
            block.appendChild(row);
          });
          block.querySelectorAll('.merge-with-first-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const idx = parseInt(btn.dataset.idx, 10);
              const target = cluster[0].original;
              const source = cluster[idx].original;
              closeDuplicatesModal();
              await skuModal.open('edit', source);
              document.getElementById('sku-original-input').value = target;
            });
          });
          section.appendChild(block);
        });
        duplicatesBody.appendChild(section);
      }

      if (result.missingLink.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Без ссылки (${result.missingLink.length})</div>
          <div class="space-y-1">
            ${result.missingLink.map(item => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }
    }
  }
};
