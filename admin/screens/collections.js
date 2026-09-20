'use strict';

/**
 * Экран "Коллекции" (§4 IMPLEMENTATION-PLAN-PROCESS-AND-WISHLIST.md, дизайн
 * закрыт Раундом 10, 20.09.2026) — CRUD именованных наборов позиций
 * каталога, курация первым раундом ТОЛЬКО вручную (§4.5 плана, решено
 * VASY) — подсказка по `series` (§4.2) только предлагает список кандидатов,
 * ничего не пишет сама, тот же принцип, что уже применён к тегам/короткому
 * имени каталога ([[feedback_ai_catalog_data_suggestion_only]]).
 *
 * Не в нижней навигации (`showNav:false`, маршрут `catalog/collections`) —
 * тот же паттерн, что "Спрос клиентов" (`wishlist-demand.js`), вход одной
 * иконкой с экрана "Каталог".
 */
window.Screens = window.Screens || {};
window.Screens.catalogCollections = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Коллекции</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-collections-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="add-collection-btn" title="Новая коллекция" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="collections-list"></div>
        <div id="collections-empty-message" class="hidden text-center text-sm text-gray-400 py-10">
          Коллекций пока нет — соберите первую из позиций каталога.
        </div>
      </main>

      <!-- Создание/редактирование коллекции -->
      <div id="collection-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="collection-modal-title" class="text-base font-semibold text-gray-900">Новая коллекция</h2>
            <button id="collection-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Название *</label>
              <input type="text" id="collection-name-input" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Monster High G3 — основная четвёрка">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="collection-description-input" maxlength="300" rows="2"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на обложку</label>
              <input type="text" id="collection-cover-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" id="collection-active-input" checked class="w-4 h-4 rounded border-gray-300 text-indigo-600">
              Видна клиентам
            </label>
          </div>
          <div id="collection-modal-error" class="px-4 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="collection-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="collection-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>

      <!-- Управление позициями набора -->
      <div id="items-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 id="items-modal-title" class="text-base font-semibold text-gray-900">Позиции набора</h2>
            <button id="items-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 pb-2 overflow-y-auto custom-scrollbar flex-1 space-y-4">
            <div>
              <div class="text-[11px] font-medium text-gray-400 mb-1.5">В наборе (<span id="current-items-count">0</span>)</div>
              <div id="current-items-list" class="space-y-1"></div>
            </div>

            <div>
              <label class="text-xs font-medium text-gray-500">Добавить по поиску</label>
              <div class="relative mt-1">
                <input type="text" id="item-search-input"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Поиск по каталогу" autocomplete="off">
                <ul id="item-search-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>

            <!-- Подсказка по series (§4.2 плана) — ничего не пишет сама, только предлагает. -->
            <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
              <div class="text-[11px] font-medium text-indigo-700 mb-1.5">Подсказка по серии каталога</div>
              <div class="flex gap-2">
                <select id="series-select" class="flex-1 px-2 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white outline-none">
                  <option value="">Выберите серию…</option>
                </select>
                <button type="button" id="series-suggest-btn" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium">Показать</button>
              </div>
              <div id="series-suggest-results" class="mt-2 space-y-1"></div>
              <button type="button" id="series-suggest-add-btn" class="hidden mt-2 w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium">
                Добавить отмеченные (<span id="series-suggest-count">0</span>)
              </button>
            </div>
          </div>
          <div id="items-modal-error" class="px-4 pb-2 text-xs text-red-500 hidden shrink-0"></div>
        </div>
      </div>
    `;

    let collections = [];
    let currentItemsCollectionId = null;
    let seriesSelected = new Map(); // skuOriginal -> {skuOriginal, productDisplay, imageUrl}

    async function loadCollections() {
      document.getElementById('collections-list').innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        collections = await callServer('listCatalogCollections');
        renderCollectionsList();
      } catch (error) {
        document.getElementById('collections-list').innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderCollectionsList() {
      const list = document.getElementById('collections-list');
      const empty = document.getElementById('collections-empty-message');
      empty.classList.toggle('hidden', collections.length > 0);
      list.innerHTML = '';
      collections.forEach((c) => list.appendChild(buildCollectionCard(c)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildCollectionCard(c) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';
      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${c.coverImageUrl ? `<img src="${escapeHtmlClient(c.coverImageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(c.name)}</div>
            ${c.description ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(c.description)}</div>` : ''}
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-[11px] px-2 py-0.5 rounded-full ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}">${c.isActive ? 'Видна клиентам' : 'Скрыта'}</span>
              <span class="text-[11px] text-gray-400">Позиций: ${c.itemCount}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button type="button" class="manage-items-btn flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium">Позиции</button>
          <button type="button" class="edit-collection-btn p-2 text-gray-400 hover:text-indigo-600" title="Редактировать"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          <button type="button" class="delete-collection-btn p-2 text-gray-400 hover:text-red-500" title="Удалить"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      `;
      card.querySelector('.manage-items-btn').addEventListener('click', () => openItemsModal(c));
      card.querySelector('.edit-collection-btn').addEventListener('click', () => openCollectionModal(c));
      card.querySelector('.delete-collection-btn').addEventListener('click', async () => {
        if (!(await showConfirmModal(`Удалить коллекцию «${c.name}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
        try {
          await callServer('deleteCatalogCollection', c.id);
          loadCollections();
        } catch (error) {
          showSaveToast(false, `Не удалось удалить: ${error.message}`);
        }
      });
      return card;
    }

    // --- Создание/редактирование коллекции ---
    const collectionModal = document.getElementById('collection-modal');
    const collectionNameInput = document.getElementById('collection-name-input');
    const collectionDescriptionInput = document.getElementById('collection-description-input');
    const collectionCoverInput = document.getElementById('collection-cover-input');
    const collectionActiveInput = document.getElementById('collection-active-input');
    const collectionModalError = document.getElementById('collection-modal-error');
    const collectionModalSave = document.getElementById('collection-modal-save');
    let editingCollectionId = null;

    function openCollectionModal(c) {
      editingCollectionId = c ? c.id : null;
      document.getElementById('collection-modal-title').textContent = c ? 'Редактировать коллекцию' : 'Новая коллекция';
      collectionNameInput.value = c ? c.name : '';
      collectionDescriptionInput.value = c ? c.description : '';
      collectionCoverInput.value = c ? c.coverImageUrl : '';
      collectionActiveInput.checked = c ? c.isActive : true;
      collectionModalError.classList.add('hidden');
      collectionModal.classList.remove('hidden');
      collectionModal.classList.add('flex');
    }
    function closeCollectionModal() {
      collectionModal.classList.add('hidden');
      collectionModal.classList.remove('flex');
    }
    document.getElementById('add-collection-btn').addEventListener('click', () => openCollectionModal(null));
    document.getElementById('collection-modal-close').addEventListener('click', closeCollectionModal);
    document.getElementById('collection-modal-cancel').addEventListener('click', closeCollectionModal);
    document.getElementById('refresh-collections-btn').addEventListener('click', () => {
      const icon = document.querySelector('#refresh-collections-btn svg');
      if (icon) icon.classList.add('animate-spin');
      loadCollections().finally(() => {
        const liveIcon = document.querySelector('#refresh-collections-btn svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    collectionModalSave.addEventListener('click', async () => {
      const name = collectionNameInput.value.trim();
      if (name === '') {
        collectionModalError.textContent = 'Название обязательно.';
        collectionModalError.classList.remove('hidden');
        return;
      }
      const collectionData = {
        name,
        description: collectionDescriptionInput.value.trim(),
        coverImageUrl: collectionCoverInput.value.trim(),
        isActive: collectionActiveInput.checked
      };
      collectionModalSave.disabled = true;
      try {
        if (editingCollectionId) await callServer('updateCatalogCollection', editingCollectionId, collectionData);
        else await callServer('createCatalogCollection', collectionData);
        closeCollectionModal();
        showSaveToast(true, 'Сохранено');
        loadCollections();
      } catch (error) {
        collectionModalError.textContent = error.message;
        collectionModalError.classList.remove('hidden');
      } finally {
        collectionModalSave.disabled = false;
      }
    });

    // --- Управление позициями ---
    const itemsModal = document.getElementById('items-modal');
    const currentItemsList = document.getElementById('current-items-list');
    const currentItemsCount = document.getElementById('current-items-count');
    const itemSearchInput = document.getElementById('item-search-input');
    const itemSearchDropdown = document.getElementById('item-search-dropdown');
    const itemsModalError = document.getElementById('items-modal-error');
    const seriesSelect = document.getElementById('series-select');
    const seriesSuggestBtn = document.getElementById('series-suggest-btn');
    const seriesSuggestResults = document.getElementById('series-suggest-results');
    const seriesSuggestAddBtn = document.getElementById('series-suggest-add-btn');
    const seriesSuggestCount = document.getElementById('series-suggest-count');

    function currentCollection() {
      return collections.find((c) => c.id === currentItemsCollectionId) || null;
    }

    function renderCurrentItems() {
      const c = currentCollection();
      const items = c ? c.items : [];
      currentItemsCount.textContent = items.length;
      currentItemsList.innerHTML = '';
      items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 p-2 rounded-lg border border-gray-100';
        row.innerHTML = `
          ${it.imageUrl ? `<img src="${escapeHtmlClient(it.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <span class="flex-1 min-w-0 text-sm text-gray-800 truncate">${escapeHtmlClient(it.productDisplay)}</span>
          <button type="button" class="remove-item-btn p-1 text-gray-400 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
        `;
        row.querySelector('.remove-item-btn').addEventListener('click', async () => {
          try {
            await callServer('removeCatalogCollectionItem', it.id);
            await refreshCurrentCollectionFromServer();
          } catch (error) {
            itemsModalError.textContent = error.message;
            itemsModalError.classList.remove('hidden');
          }
        });
        currentItemsList.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    async function refreshCurrentCollectionFromServer() {
      collections = await callServer('listCatalogCollections');
      renderCurrentItems();
      renderCollectionsList();
    }

    async function openItemsModal(c) {
      currentItemsCollectionId = c.id;
      document.getElementById('items-modal-title').textContent = `Позиции — ${c.name}`;
      itemSearchInput.value = '';
      itemSearchDropdown.classList.remove('active');
      itemsModalError.classList.add('hidden');
      seriesSuggestResults.innerHTML = '';
      seriesSuggestAddBtn.classList.add('hidden');
      seriesSelected = new Map();
      renderCurrentItems();
      itemsModal.classList.remove('hidden');
      itemsModal.classList.add('flex');
      try {
        const series = await callServer('getCatalogCollectionSeriesOptions');
        seriesSelect.innerHTML = '<option value="">Выберите серию…</option>' + series.map((s) => `<option value="${escapeHtmlClient(s)}">${escapeHtmlClient(s)}</option>`).join('');
      } catch (_error) {
        // необязательная подсказка — тихий пропуск, не блокирует остальную модалку
      }
    }
    document.getElementById('items-modal-close').addEventListener('click', () => {
      itemsModal.classList.add('hidden');
      itemsModal.classList.remove('flex');
    });

    const handleItemSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { itemSearchDropdown.classList.remove('active'); return; }
      const c = currentCollection();
      const alreadyIn = new Set((c ? c.items : []).map((it) => it.skuOriginal.toLowerCase()));
      const results = (await callServer('searchSku', query)).filter((item) => !alreadyIn.has(item.value.toLowerCase()));

      itemSearchDropdown.innerHTML = '';
      if (results.length === 0) {
        itemSearchDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach((item) => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.label)}</div>`;
          li.addEventListener('mousedown', async () => {
            itemSearchDropdown.classList.remove('active');
            itemSearchInput.value = '';
            try {
              await callServer('addCatalogCollectionItems', currentItemsCollectionId, [item.value]);
              await refreshCurrentCollectionFromServer();
            } catch (error) {
              itemsModalError.textContent = error.message;
              itemsModalError.classList.remove('hidden');
            }
          });
          itemSearchDropdown.appendChild(li);
        });
      }
      itemSearchDropdown.classList.add('active');
    }, 300);
    itemSearchInput.addEventListener('input', handleItemSearch);
    itemSearchInput.addEventListener('blur', () => setTimeout(() => itemSearchDropdown.classList.remove('active'), 150));

    // --- Подсказка по series (§4.2 плана) ---
    seriesSuggestBtn.addEventListener('click', async () => {
      const series = seriesSelect.value;
      if (series === '') return;
      seriesSelected = new Map();
      seriesSuggestResults.innerHTML = '<div class="text-xs text-gray-400 p-1">Загрузка...</div>';
      try {
        const suggestions = await callServer('suggestCatalogCollectionItemsBySeries', currentItemsCollectionId, series);
        seriesSuggestResults.innerHTML = '';
        if (suggestions.length === 0) {
          seriesSuggestResults.innerHTML = '<div class="text-xs text-gray-400 p-1">Все позиции этой серии уже в наборе.</div>';
        }
        suggestions.forEach((s) => {
          const row = document.createElement('label');
          row.className = 'flex items-center gap-2 p-1.5 rounded-lg bg-white cursor-pointer';
          row.innerHTML = `<input type="checkbox" class="series-suggest-check"><span class="text-xs text-gray-800 flex-1 min-w-0 truncate">${escapeHtmlClient(s.productDisplay)}</span>`;
          row.querySelector('.series-suggest-check').addEventListener('change', (ev) => {
            if (ev.target.checked) seriesSelected.set(s.skuOriginal, s);
            else seriesSelected.delete(s.skuOriginal);
            seriesSuggestCount.textContent = seriesSelected.size;
            seriesSuggestAddBtn.classList.toggle('hidden', seriesSelected.size === 0);
          });
          seriesSuggestResults.appendChild(row);
        });
      } catch (error) {
        seriesSuggestResults.innerHTML = `<div class="text-xs text-red-500 p-1">${escapeHtmlClient(error.message)}</div>`;
      }
    });
    seriesSuggestAddBtn.addEventListener('click', async () => {
      if (seriesSelected.size === 0) return;
      seriesSuggestAddBtn.disabled = true;
      try {
        await callServer('addCatalogCollectionItems', currentItemsCollectionId, Array.from(seriesSelected.keys()));
        seriesSelected = new Map();
        seriesSuggestResults.innerHTML = '';
        seriesSuggestAddBtn.classList.add('hidden');
        await refreshCurrentCollectionFromServer();
      } catch (error) {
        itemsModalError.textContent = error.message;
        itemsModalError.classList.remove('hidden');
      } finally {
        seriesSuggestAddBtn.disabled = false;
      }
    });

    loadCollections();
  }
};
