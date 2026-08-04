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
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Каталог</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-catalog-btn" title="Обновить каталог" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="find-duplicates-btn" title="Аудит каталога: дубли, позиции без ссылки/фото" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="copy-check" class="w-6 h-6"></i>
      </button>
      <button id="wishlist-demand-btn" title="Спрос клиентов" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="heart" class="w-6 h-6"></i>
      </button>
      <button id="add-sku-btn" title="Добавить позицию в каталог" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
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
            <button id="duplicates-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="duplicates-body" class="p-4 space-y-4"></div>
        </div>
      </div>

      <div id="merge-compare-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Слияние позиций</h2>
            <button id="merge-compare-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="merge-compare-body" class="p-4"></div>
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

    // forceRefresh — сбрасывает 15-минутный кэш каталога на бэкенде
    // (WebAppApi.refreshCatalogList), не просто перечитывает тот же кэш —
    // кнопка "Обновить" по фидбеку VASY 03.08.2026.
    async function loadCatalog(forceRefresh) {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка каталога...</div>';
      try {
        allSku = await callServer(forceRefresh ? 'refreshCatalogList' : 'getCatalogList');
        render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    document.getElementById('refresh-catalog-btn').addEventListener('click', () => {
      const btn = document.getElementById('refresh-catalog-btn');
      const icon = btn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      loadCatalog(true).finally(() => {
        const liveIcon = btn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

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
        <div class="flex items-start gap-3">
          ${s.imageUrl ? `<img src="${escapeHtmlClient(s.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(s.shortName || s.original)}</div>
            ${s.shortName && s.shortName !== s.original ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(s.original)}</div>` : ''}
            ${tags.length > 0 ? `<div class="flex flex-wrap gap-1.5 mt-2">${tags.map(t => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      `;
      return card;
    }

    document.getElementById('add-sku-btn').addEventListener('click', () => skuModal.open('create'));

    // Аудит существующего каталога — кластеры вероятных дублей + позиции без
    // ссылки/фото (инструмент "Найти вероятные дубли", 03.08.2026).
    //
    // РЕДИЗАЙН 04.08.2026 (репорт VASY: при слиянии обе позиции оставались в
    // каталоге вместо одной) — раньше "Объединить" открывало общую SKU-модалку
    // в режиме редактирования, молча подменяло поле "Выпуск" на имя цели и
    // полагалось на то, что менеджер нажмёт "Сохранить" и правильно выберет
    // между keepNew/keepExisting в возникшем конфликте. Прямые вызовы
    // updateSku(oldOriginal, skuData, mergeChoice) подтверждены тестами как
    // корректные — проблема была именно в этой хрупкой цепочке. Теперь
    // "Объединить" сразу показывает обе позиции целиком (фото/теги/описание/
    // ссылки) и вызывает updateSku НАПРЯМУЮ с explicit mergeChoice, без
    // промежуточной формы редактирования.
    const duplicatesModal = document.getElementById('duplicates-modal');
    const duplicatesBody = document.getElementById('duplicates-body');
    const mergeCompareModal = document.getElementById('merge-compare-modal');
    const mergeCompareBody = document.getElementById('merge-compare-body');

    function closeMergeCompareModal() {
      mergeCompareModal.classList.add('hidden');
      mergeCompareModal.classList.remove('flex');
    }
    document.getElementById('merge-compare-close').addEventListener('click', closeMergeCompareModal);

    function buildMergeCandidateHtml(details, links) {
      const tags = [details.brand, details.character, details.series].filter(t => t !== '');
      return `
        <div class="border border-gray-200 rounded-xl p-3 space-y-1.5 min-w-0">
          ${details.imageUrl ? `<img src="${escapeHtmlClient(details.imageUrl)}" alt="" class="w-16 h-16 rounded-lg object-cover bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="font-semibold text-gray-900 text-sm truncate">${escapeHtmlClient(details.shortName || details.original)}</div>
          <div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(details.original)}</div>
          ${tags.length > 0 ? `<div class="flex flex-wrap gap-1">${tags.map(t => `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(t)}</span>`).join('')}</div>` : ''}
          ${details.description ? `<div class="text-[11px] text-gray-500">${escapeHtmlClient(details.description)}</div>` : ''}
          ${links.length > 0
            ? `<div class="space-y-0.5">${links.map(l => `<a href="${escapeHtmlClient(l.url)}" target="_blank" rel="noopener" class="block text-[11px] text-indigo-500 truncate">${escapeHtmlClient(l.url)}</a>`).join('')}</div>`
            : '<div class="text-[11px] text-gray-300">Ссылок нет</div>'}
        </div>
      `;
    }

    async function performMerge(targetDetails, sourceDetails, mergeChoice) {
      const errorEl = document.getElementById('merge-compare-error');
      errorEl.classList.add('hidden');
      const skuData = {
        original: targetDetails.original,
        shortName: sourceDetails.shortName,
        brand: sourceDetails.brand,
        character: sourceDetails.character,
        series: sourceDetails.series,
        imageUrl: sourceDetails.imageUrl,
        description: sourceDetails.description
      };
      try {
        await callServer('updateSku', sourceDetails.original, skuData, mergeChoice);
        closeMergeCompareModal();
        showSaveToast(true, 'Позиции объединены');
        loadCatalog();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
      }
    }

    function renderMergeCompare(targetDetails, sourceDetails, targetLinks, sourceLinks) {
      mergeCompareBody.innerHTML = `
        <p class="text-xs text-gray-500 mb-3">Выберите, какую позицию оставить — вторая будет удалена, её заказы переключатся на выбранную.</p>
        <div class="grid grid-cols-2 gap-3 mb-3">
          ${buildMergeCandidateHtml(targetDetails, targetLinks)}
          ${buildMergeCandidateHtml(sourceDetails, sourceLinks)}
        </div>
        <div id="merge-compare-error" class="text-xs text-red-500 hidden mb-2"></div>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="merge-keep-target-btn" class="py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium hover:border-indigo-400">
            Оставить: ${escapeHtmlClient(targetDetails.shortName || targetDetails.original)}
          </button>
          <button type="button" id="merge-keep-source-btn" class="py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium hover:border-indigo-400">
            Оставить: ${escapeHtmlClient(sourceDetails.shortName || sourceDetails.original)}
          </button>
        </div>
      `;
      document.getElementById('merge-keep-target-btn').addEventListener('click', () => performMerge(targetDetails, sourceDetails, 'keepExisting'));
      document.getElementById('merge-keep-source-btn').addEventListener('click', () => performMerge(targetDetails, sourceDetails, 'keepNew'));
      if (window.lucide) window.lucide.createIcons();
    }

    async function openMergeCompare(targetOriginal, sourceOriginal) {
      mergeCompareBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Загрузка данных...</div>';
      mergeCompareModal.classList.remove('hidden');
      mergeCompareModal.classList.add('flex');

      try {
        const [targetDetails, sourceDetails, targetLinks, sourceLinks] = await Promise.all([
          callServer('getSkuDetails', targetOriginal),
          callServer('getSkuDetails', sourceOriginal),
          callServer('getCatalogLinksForSku', targetOriginal),
          callServer('getCatalogLinksForSku', sourceOriginal)
        ]);
        renderMergeCompare(targetDetails, sourceDetails, targetLinks, sourceLinks);
      } catch (error) {
        mergeCompareBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

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
        // Фаза 6.4 (04.08.2026) — аудит Заказы↔Каталог в той же модалке,
        // единая точка входа для менеджера. Два независимых запроса
        // параллельно — findDuplicateCatalogClusters уже проверенная и
        // задеплоенная логика, не трогаем её структуру ради нового отчёта.
        const [duplicatesResult, ordersAudit] = await Promise.all([
          callServer('findDuplicateCatalogClusters'),
          callServer('getCatalogOrdersAudit')
        ]);
        renderDuplicatesReport({ ...duplicatesResult, ...ordersAudit });
      } catch (error) {
        duplicatesBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    });

    function renderDuplicatesReport(result) {
      if (result.clusters.length === 0 && result.missingLink.length === 0 && result.missingImage.length === 0
        && result.orphanedOrders.length === 0 && result.unusedSkus.length === 0) {
        duplicatesBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Вероятных дублей, позиций без ссылки/фото и рассинхронизации с заказами не найдено.</div>';
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
              <span class="flex items-center gap-2 min-w-0">
                ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
                <span class="text-gray-700 truncate">${escapeHtmlClient(item.shortName || item.original)}
                  <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span></span>
              </span>
              ${idx > 0 ? `<button type="button" class="merge-with-first-btn shrink-0 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-idx="${idx}">Объединить</button>` : ''}
            `;
            block.appendChild(row);
          });
          block.querySelectorAll('.merge-with-first-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.idx, 10);
              closeDuplicatesModal();
              openMergeCompare(cluster[0].original, cluster[idx].original);
            });
          });
          section.appendChild(block);
        });
        duplicatesBody.appendChild(section);
      }

      // Фаза 6.4 (04.08.2026) — аудит Заказы↔Каталог, обе стороны. Чисто
      // информационно, ничего не блокирует и не трогает автоматически.
      // Сознательно СРАЗУ после "Вероятные дубли" (03.08.2026, репорт VASY:
      // раньше стояли в самом низу, за длинным списком "Без ссылки" —
      // терялись из виду) — эти два списка обычно короче и требуют внимания
      // не меньше, чем дубли.
      if (result.orphanedOrders.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Заказы без соответствия в каталоге (${result.orphanedOrders.length})</div>
          <div class="space-y-1">
            ${result.orphanedOrders.map(o => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(o.productOriginal)}
                <span class="text-gray-400">— ${escapeHtmlClient(o.orderId)}${o.dateOrderDisplay ? ` · ${escapeHtmlClient(o.dateOrderDisplay)}` : ''}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }

      if (result.unusedSkus.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Позиции без единого заказа (${result.unusedSkus.length})</div>
          <div class="space-y-1">
            ${result.unusedSkus.map(item => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span>
              </div>
            `).join('')}
          </div>
        `;
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

      if (result.missingImage.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Без фото (${result.missingImage.length})</div>
          <div class="space-y-1">
            ${result.missingImage.map(item => `
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
