'use strict';

/**
 * Экран "Мои куклы" (переименован из "Мой вишлист" — §3 плана "Систематизация
 * процесса + Мои куклы", 20.09.2026) — перенесён из client/wishlist.html
 * (Phase 2 SPA, 02.08.2026). В оригинале часть состояния (selectedSkuValue,
 * editingWishlistId, reloadWishlist) и обвязка модалки жили на верхнем уровне
 * <script> страницы — это было безопасно, т.к. каждая навигация была полной
 * перезагрузкой страницы (свежий JS-контекст). В SPA все screens/*.js грузятся
 * ОДИН раз и живут в общем global scope весь сеанс — поэтому всё, что раньше
 * было "top-level для страницы", здесь обязано быть ВНУТРИ render(), иначе
 * состояние одного захода на экран утечёт в следующий. showSaveToast — общая
 * функция из router.js.
 *
 * Два таба — «Вишлист» (status="Хочу") и «Чеклист» (status IN ("Куплено",
 * "Есть") — куплено через нас ИЛИ отмечено клиентом как уже имеющееся не у
 * нас), тот же паттерн `currentTab`/`.tab-btn`, что admin/screens/home.js.
 * Фильтрация — чисто на фронтенде поверх уже полученного getClientWishlist,
 * contract не менялся.
 */
// "Поделиться картинкой" (§5 плана "Систематизация процесса + Мои куклы",
// 21.09.2026) — потолок ЗЕРКАЛИТ backend wishlistShareService.MAX_SHARE_ITEMS
// (не запрашивается с сервера — единственное значение всего контракта,
// проверяемое чисто клиентски перед отправкой, дублирование числа дешевле
// лишнего запроса; сервер всё равно перепроверяет сам, это не единственная
// линия защиты).
const MAX_SHARE_ITEMS = 420; // 42 куклы на картинку × 10 картинок альбомом (геймификация §10.4, 24.09.2026)

window.Screens = window.Screens || {};
window.Screens.wishlist = {
  render(root, _context, params) {
    // Последняя открытая вкладка переживает уход в альбом коллекции и обратно.
    const TAB_STORAGE_KEY = 'hn_dolls_tab';
    let currentTab = 'wishlist'; // 'wishlist' | 'checklist' | 'collections'
    try {
      const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
      if (!(params && params.photoScanId) && ['wishlist', 'checklist', 'collections'].includes(saved)) currentTab = saved;
    } catch (_e) { /* sessionStorage недоступен — просто стартуем с Вишлиста */ }
    let selectionMode = false;
    let selectedForShare = new Set();

    function exitSelectionMode() {
      selectionMode = false;
      selectedForShare = new Set();
      renderHeaderActions();
      renderShareBar();
      renderList();
    }

    function enterSelectionMode() {
      selectionMode = true;
      selectedForShare = new Set();
      renderHeaderActions();
      renderShareBar();
      renderList();
    }

    function renderShareBar() {
      const bar = document.getElementById('share-bar');
      if (!selectionMode) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      const count = selectedForShare.size;
      document.getElementById('share-bar-count').textContent = count > 0 ? `Поделиться (${count})` : 'Поделиться';
      document.getElementById('share-bar-confirm-btn').disabled = count === 0;
    }

    /** Куклы текущего таба (Вишлист — «Хочу», Чеклист — полка) — для «Выбрать всё». */
    function currentTabItems() {
      return currentTab === 'checklist'
        ? allItems.filter(i => i.status === 'Куплено' || i.status === 'Есть')
        : allItems.filter(i => i.status === 'Хочу');
    }

    function renderHeaderActions() {
      if (selectionMode) {
        const tabItems = currentTabItems();
        const allSelected = tabItems.length > 0 && tabItems.every(i => selectedForShare.has(i.wishlistId));
        document.getElementById('header-actions').innerHTML = `
          <button id="share-select-all-btn" class="px-3 py-1.5 rounded-full text-sm font-medium text-indigo-600 hover:bg-white/50 transition-colors">${allSelected ? 'Снять всё' : 'Выбрать всё'}</button>
          <button id="share-cancel-btn" class="px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-white/50 transition-colors">Отмена</button>
        `;
        document.getElementById('share-cancel-btn').addEventListener('click', exitSelectionMode);
        // «Поделиться всей полкой/вишлистом» (§10.4 плана) — больше 42 кукол
        // сервер сам разобьёт на несколько картинок одним альбомом.
        document.getElementById('share-select-all-btn').addEventListener('click', () => {
          if (allSelected) {
            selectedForShare = new Set();
          } else {
            const ids = tabItems.map(i => i.wishlistId).slice(0, MAX_SHARE_ITEMS);
            selectedForShare = new Set(ids);
            if (tabItems.length > MAX_SHARE_ITEMS) showSaveToast(false, `Выбраны первые ${MAX_SHARE_ITEMS} — больше за раз нельзя`);
          }
          Hunt.haptic('selection');
          renderHeaderActions();
          renderShareBar();
          renderList();
        });
        return;
      }

      // «Коллекции» курируются только вручную администратором (§4.5 плана
      // "Систематизация процесса + Мои куклы", 20.09.2026) — на этой вкладке
      // клиент ничего не добавляет, кнопка "+" не нужна. "Поделиться" тоже
      // скрыта — делится содержимым текущего таба Вишлист/Чеклист, у
      // «Коллекций» своя, уже готовая витрина с прогресс-баром (§5.4 плана,
      // 21.09.2026: "делится содержимым именно текущего открытого таба").
      const isCollectionsTab = currentTab === 'collections';
      document.getElementById('header-actions').innerHTML = `
        <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="refresh-cw" class="w-5 h-5"></i>
        </button>
        ${isCollectionsTab ? '' : `
        <button id="share-btn" title="Поделиться" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="share-2" class="w-5 h-5"></i>
        </button>
        <button id="add-item-btn" title="${currentTab === 'checklist' ? 'Добавить в коллекцию' : 'Добавить в вишлист'}" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="plus" class="w-6 h-6"></i>
        </button>`}
      `;
      document.getElementById('refresh-btn').addEventListener('click', () => {
        const icon = document.querySelector('#refresh-btn svg');
        if (icon) icon.classList.add('animate-spin');
        const reload = isCollectionsTab ? loadCollections : loadWishlist;
        reload().finally(() => {
          const liveIcon = document.querySelector('#refresh-btn svg');
          if (liveIcon) liveIcon.classList.remove('animate-spin');
        });
      });
      if (!isCollectionsTab) {
        document.getElementById('share-btn').addEventListener('click', enterSelectionMode);
        document.getElementById('add-item-btn').addEventListener('click', () => {
          // §3.7 плана (20.09.2026) — Чеклист теперь тоже открывает выбор
          // способа (раньше сразу вёл в ручной ввод/поиск), т.к. фото-скан и
          // массовый выбор из каталога тоже доступны для Чеклиста, не только
          // для Вишлиста.
          openAddMethodModal({ addToChecklist: currentTab === 'checklist' });
        });
      }
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Мои куклы</h1>';
    renderHeaderActions();

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="tab-switcher" class="grid grid-cols-3 p-1 mb-1 rounded-2xl bg-gray-200/70">
          <button type="button" data-tab="wishlist" class="tab-btn h-9 rounded-xl text-[13.5px] font-semibold">
            Вишлист <span id="wishlist-count-badge" class="inline-block font-medium text-gray-400"></span>
          </button>
          <button type="button" data-tab="checklist" class="tab-btn h-9 rounded-xl text-[13.5px] font-semibold">
            Чеклист <span id="checklist-count-badge" class="inline-block font-medium text-gray-400"></span>
          </button>
          <button type="button" data-tab="collections" class="tab-btn h-9 rounded-xl text-[13.5px] font-semibold">
            Коллекции
          </button>
        </div>

        <div id="wishlist-tab">
          <div id="active-list"></div>
          <div id="wishlist-empty-message" class="hidden">
            ${buildEmptyState('heart', 'Список желаний пуст.', { label: 'Добавить куклу', btnId: 'empty-add-item-btn' })}
          </div>
        </div>

        <div id="checklist-tab" class="hidden">
          <!-- Автоимпорт-предложение (§3.7 плана, 20.09.2026) — показывается,
               только пока есть непредложенные позиции из уже полученных
               заказов, которых нет в Чеклисте. -->
          <div id="import-suggest-banner" class="hidden mb-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center gap-3">
            <span class="shrink-0 w-9 h-9 rounded-full bg-white text-indigo-600 flex items-center justify-center"><i data-lucide="sparkles" class="w-4 h-4"></i></span>
            <div class="flex-1 min-w-0 text-sm text-indigo-900">Нашли <span id="import-suggest-banner-count">0</span> кукол(ы) из ваших заказов — добавить в Чеклист?</div>
            <button type="button" id="import-suggest-banner-view-btn" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium">Посмотреть</button>
            <button type="button" id="import-suggest-banner-dismiss-btn" class="shrink-0 p-1 text-indigo-300 hover:text-indigo-600" title="Не сейчас"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>
          <div id="checklist-list"></div>
          <div id="checklist-empty-message" class="hidden text-center text-sm text-gray-400 py-10 px-4">
            Отметь кукол, которые у тебя уже есть — куплены у нас или получены другим способом.
          </div>
        </div>

        <!-- «Коллекции» (§4 плана "Систематизация процесса + Мои куклы",
             20.09.2026) — только чтение, курируются администратором. -->
        <div id="collections-tab" class="hidden">
          <div id="collections-list"></div>
          <div id="collections-empty-message" class="hidden text-center text-sm text-gray-400 py-10 px-4">
            Коллекций пока нет — загляните позже.
          </div>
        </div>
      </main>

      <!-- "Поделиться картинкой" (§5 плана "Систематизация процесса + Мои
           куклы", 21.09.2026) — панель выбора, поверх нижней навигации
           (z-50, тот же приём, что модалки z-[60] — bottom-nav её не
           перекрывает). Видна только пока selectionMode===true. -->
      <div id="share-bar" class="hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex gap-2">
        <button type="button" id="share-bar-confirm-btn" disabled
          class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
          <span id="share-bar-count">Поделиться</span>
        </button>
      </div>

      <!-- Единая точка входа "Добавить в вишлист" (репорт VASY 19.09.2026 —
           раньше фото и ручной ввод были ДВУМЯ независимыми кнопками
           в шапке, не единым флоу). Выбор способа — первый шаг, дальше
           оба уже существующих сценария (item-modal/photo-scan-modal)
           не тронуты. -->
      <div id="add-method-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="add-method-modal-title" class="text-base font-semibold text-gray-900">Добавить в вишлист</h2>
            <button id="add-method-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-2.5">
            <button type="button" id="add-method-photo-btn" class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left transition-colors">
              <span class="shrink-0 w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><i data-lucide="camera" class="w-5 h-5"></i></span>
              <span>
                <span class="block text-sm font-medium text-gray-900">Добавить по фото</span>
                <span class="block text-xs text-gray-400">ИИ распознает куклу на фото — можно сразу несколько</span>
              </span>
            </button>
            <!-- §3.7 плана (20.09.2026) — только на Чеклисте: массовое
                 добавление того, что у клиента уже есть, без ограничения
                 "одна позиция за заход". -->
            <button type="button" id="add-method-bulk-btn" class="hidden w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left transition-colors">
              <span class="shrink-0 w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><i data-lucide="list-checks" class="w-5 h-5"></i></span>
              <span>
                <span class="block text-sm font-medium text-gray-900">Выбрать несколько из каталога</span>
                <span class="block text-xs text-gray-400">Отметьте всё, что у вас уже есть</span>
              </span>
            </button>
            <button type="button" id="add-method-manual-btn" class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left transition-colors">
              <span class="shrink-0 w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><i data-lucide="pencil-line" class="w-5 h-5"></i></span>
              <span>
                <span class="block text-sm font-medium text-gray-900">Ввести вручную</span>
                <span class="block text-xs text-gray-400">Поиск по каталогу, ссылка или название</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Массовый выбор из каталога (§3.7 плана, 20.09.2026) — чеклист-only. -->
      <div id="bulk-add-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Выбрать несколько</h2>
            <button id="bulk-add-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 shrink-0">
            <input type="text" id="bulk-add-search"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
              placeholder="Поиск куклы в каталоге" autocomplete="off">
          </div>
          <div id="bulk-add-results" class="px-4 pb-2 overflow-y-auto custom-scrollbar flex-1 space-y-1"></div>
          <div id="bulk-add-selected-wrap" class="hidden px-4 pb-2">
            <div class="text-[11px] font-medium text-gray-400 mb-1">Отмечено</div>
            <div id="bulk-add-selected-list" class="space-y-1"></div>
          </div>
          <div id="bulk-add-error" class="px-4 pb-2 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 shrink-0">
            <button id="bulk-add-confirm-btn" disabled
              class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              Добавить отмеченные (<span id="bulk-add-count">0</span>)
            </button>
          </div>
        </div>
      </div>

      <!-- Автоимпорт-предложение из заказов (§3.7 плана, 20.09.2026). -->
      <div id="import-suggest-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Уже куплено у нас</h2>
            <button id="import-suggest-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 pt-3 text-xs text-gray-400 shrink-0">Уберите то, что заказывали не себе — остальное добавим в Чеклист.</div>
          <div id="import-suggest-list" class="px-4 pb-2 overflow-y-auto custom-scrollbar flex-1 space-y-1.5"></div>
          <div id="import-suggest-error" class="px-4 pb-2 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 shrink-0">
            <button id="import-suggest-confirm-btn"
              class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              Добавить отмеченные (<span id="import-suggest-count">0</span>)
            </button>
          </div>
        </div>
      </div>

      <div id="item-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="item-modal-title" class="text-base font-semibold text-gray-900">Добавить в вишлист</h2>
            <button id="item-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div id="search-mode-block" class="p-4 space-y-3">
            <div class="relative">
              <input type="text" id="item-search"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Поиск куклы в каталоге или вставьте ссылку" autocomplete="off">
              <ul id="item-search-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
            <div id="url-hint-block" class="hidden p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-sm text-indigo-800 flex items-center justify-between gap-2">
              <span>Похоже на ссылку на товар</span>
              <button type="button" id="url-hint-resolve-btn" class="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium">Распознать</button>
            </div>
            <div id="selected-sku-display" class="hidden p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-sm text-indigo-800"></div>
            <button type="button" id="switch-to-manual-btn" class="text-xs text-indigo-600 font-medium">Не нашли? Добавить вручную</button>
          </div>

          <div id="manual-mode-block" class="hidden p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на товар</label>
              <div class="flex gap-2 mt-1">
                <input type="text" id="manual-url-input"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Вставьте ссылку — можно распознать автоматически">
                <button type="button" id="resolve-link-btn" disabled
                  class="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                  Распознать
                </button>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Название *</label>
              <input type="text" id="manual-title-input" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Monster High Ghoulia Yelps">
              <!-- Сверка с каталогом при ручном вводе (план "Лоты/ИИ",
                   расширение 19.09.2026) — тот же принцип, что у фото-скана:
                   только явное предложение, ничего не выбирается само. -->
              <div id="manual-catalog-match" class="hidden mt-2 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
                <img id="manual-catalog-match-image" src="" alt="" class="w-9 h-9 rounded-lg object-cover shrink-0 bg-white hidden">
                <div class="flex-1 min-w-0">
                  <div class="text-[11px] text-indigo-700">Похоже, уже есть в каталоге:</div>
                  <div id="manual-catalog-match-name" class="text-sm font-medium text-indigo-900 truncate"></div>
                </div>
                <button type="button" id="manual-catalog-match-use-btn" class="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium">Это она</button>
                <button type="button" id="manual-catalog-match-dismiss-btn" class="shrink-0 p-1 text-indigo-400 hover:text-indigo-600" title="Не то">
                  <i data-lucide="x" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Короткое название RU</label>
              <input type="text" id="manual-short-name-input" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно — например: Гулия Йелпс">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="manual-description-input" maxlength="300" rows="2"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на изображение</label>
              <input type="text" id="manual-image-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <button type="button" id="switch-to-search-btn" class="text-xs text-indigo-600 font-medium">← Вернуться к поиску по каталогу</button>
          </div>

          <div id="item-error-text" class="px-4 text-xs text-red-500 hidden"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="item-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="item-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>

      <input type="file" id="photo-scan-input" accept="image/*" class="hidden">

      <!-- Вишлист по фото (план "Лоты/ИИ", Этап 6, 16.09.2026) — тот же
           принцип, что "Разобрать лот по ссылке" (Этап 3): ИИ только
           предлагает, "Добавить в вишлист" — единственное место записи. -->
      <div id="photo-scan-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="photo-scan-modal-title" class="text-base font-semibold text-gray-900">Похоже на фото</h2>
            <button id="photo-scan-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="photo-scan-loading" class="p-6 text-center text-sm text-gray-400">Распознаю фото...</div>
          <div id="photo-scan-empty" class="hidden p-6 text-center text-sm text-gray-500">Не получилось распознать товар на фото — попробуйте другое фото или добавьте вручную.</div>
          <div id="photo-scan-list" class="p-4 space-y-3"></div>
          <div id="photo-scan-error" class="px-4 text-xs text-red-500 hidden"></div>
          <div id="photo-scan-actions" class="hidden p-4 border-t border-gray-100 flex gap-2">
            <button id="photo-scan-discard-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Не добавлять</button>
            <button id="photo-scan-confirm-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить в вишлист</button>
          </div>
        </div>
      </div>
    `;

    let selectedSkuValue = null;
    let editingWishlistId = null;
    let addingToChecklist = false;
    let reloadWishlist = null;

    const activeList = document.getElementById('active-list');
    const checklistList = document.getElementById('checklist-list');
    const wishlistEmptyMessage = document.getElementById('wishlist-empty-message');
    const checklistEmptyMessage = document.getElementById('checklist-empty-message');

    let allItems = [];

    loadWishlist().then(() => {
      if (!(params && params.photoScanId)) runHuntState();
    });
    reloadWishlist = reloadAll;

    // --- "Поделиться картинкой" (§5 плана, 21.09.2026) ---
    const shareBarConfirmBtn = document.getElementById('share-bar-confirm-btn');
    shareBarConfirmBtn.addEventListener('click', async () => {
      if (selectedForShare.size === 0) return;
      shareBarConfirmBtn.disabled = true;
      try {
        await callServer('shareWishlistCollage', Array.from(selectedForShare));
        showSaveToast(true, 'Картинка придёт в чат с ботом через несколько секунд — перешлите её, кому захотите');
        exitSelectionMode();
      } catch (error) {
        showSaveToast(false, error.message);
        shareBarConfirmBtn.disabled = selectedForShare.size === 0;
      }
    });

    // --- Автоимпорт-предложение из заказов (§3.7 плана, 20.09.2026) ---
    // Best-effort, не блокирует основную загрузку экрана — тот же принцип,
    // что остальные необязательные фоновые запросы в проекте.
    let importSuggestions = [];
    let importSuggestSelected = new Map(); // skuOriginal||rawTitle -> позиция

    function importSuggestKey(p) {
      return p.skuOriginal ? 'sku:' + p.skuOriginal : 'title:' + p.rawTitle;
    }

    async function loadImportSuggestions() {
      try {
        importSuggestions = await callServer('getChecklistImportSuggestions');
      } catch (_error) {
        importSuggestions = []; // тихо — это необязательное предложение, не критичная загрузка
      }
      renderImportBanner();
    }
    loadImportSuggestions();

    const importSuggestBanner = document.getElementById('import-suggest-banner');
    function renderImportBanner() {
      const show = importSuggestions.length > 0;
      importSuggestBanner.classList.toggle('hidden', !show);
      if (show) document.getElementById('import-suggest-banner-count').textContent = importSuggestions.length;
    }
    document.getElementById('import-suggest-banner-dismiss-btn').addEventListener('click', () => {
      importSuggestBanner.classList.add('hidden');
    });

    const importSuggestModal = document.getElementById('import-suggest-modal');
    const importSuggestList = document.getElementById('import-suggest-list');
    const importSuggestConfirmBtn = document.getElementById('import-suggest-confirm-btn');
    const importSuggestCount = document.getElementById('import-suggest-count');
    const importSuggestError = document.getElementById('import-suggest-error');

    function renderImportSuggestList() {
      importSuggestCount.textContent = importSuggestSelected.size;
      importSuggestConfirmBtn.disabled = importSuggestSelected.size === 0;
      importSuggestList.innerHTML = '';
      importSuggestions.forEach((p) => {
        const key = importSuggestKey(p);
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 cursor-pointer';
        row.innerHTML = `
          <input type="checkbox" class="import-suggest-check" ${importSuggestSelected.has(key) ? 'checked' : ''}>
          ${p.imageUrl ? `<img src="${escapeHtmlClient(p.imageUrl)}" alt="" class="w-9 h-9 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <span class="text-sm text-gray-800 flex-1 min-w-0 truncate">${escapeHtmlClient(p.productDisplay)}</span>
        `;
        row.querySelector('.import-suggest-check').addEventListener('change', (ev) => {
          if (ev.target.checked) importSuggestSelected.set(key, p);
          else importSuggestSelected.delete(key);
          importSuggestCount.textContent = importSuggestSelected.size;
          importSuggestConfirmBtn.disabled = importSuggestSelected.size === 0;
        });
        importSuggestList.appendChild(row);
      });
    }

    function openImportSuggestModal() {
      // Всё отмечено по умолчанию — клиент убирает то, что не нужно (VASY,
      // 20.09.2026: "вдруг заказывали не себе"), не наоборот.
      importSuggestSelected = new Map(importSuggestions.map((p) => [importSuggestKey(p), p]));
      importSuggestError.classList.add('hidden');
      renderImportSuggestList();
      importSuggestModal.classList.remove('hidden');
      importSuggestModal.classList.add('flex');
    }
    function closeImportSuggestModal() {
      importSuggestModal.classList.add('hidden');
      importSuggestModal.classList.remove('flex');
    }
    document.getElementById('import-suggest-banner-view-btn').addEventListener('click', openImportSuggestModal);
    document.getElementById('import-suggest-modal-close').addEventListener('click', closeImportSuggestModal);

    importSuggestConfirmBtn.addEventListener('click', async () => {
      if (importSuggestSelected.size === 0) return;
      importSuggestError.classList.add('hidden');
      importSuggestConfirmBtn.disabled = true;
      try {
        const items = Array.from(importSuggestSelected.values()).map((p) => ({
          skuOriginal: p.skuOriginal, rawTitle: p.rawTitle, rawImageUrl: p.imageUrl
        }));
        const result = await callServer('addWishlistItemsBulk', items);
        closeImportSuggestModal();
        importSuggestions = []; // подтверждённые/отклонённые — не показываем баннер снова в этом заходе на экран
        renderImportBanner();
        showSaveToast(true, `Добавлено в коллекцию: ${result.added}`);
        loadWishlist();
      } catch (error) {
        importSuggestError.textContent = error.message;
        importSuggestError.classList.remove('hidden');
        importSuggestConfirmBtn.disabled = false;
      }
    });

    // --- Переключатель вкладок (тот же паттерн, что admin/screens/home.js) ---
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    function switchTab(tab) {
      if (tab === currentTab) return;
      // "Поделиться" всегда про содержимое ОДНОГО таба (§5.4 плана,
      // 21.09.2026) — смена таба посреди выбора сбрасывает его, не
      // переносит отметки на чужой список.
      if (selectionMode) exitSelectionMode();
      currentTab = tab;
      Hunt.haptic('selection');
      try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch (_e) { /* удобство, не критично */ }
      updateTabStyles();
      renderHeaderActions();
    }
    function updateTabStyles() {
      tabButtons.forEach(btn => {
        const active = btn.dataset.tab === currentTab;
        btn.className = `tab-btn h-9 rounded-xl text-[13.5px] font-semibold transition-colors ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;
      });
      document.getElementById('wishlist-tab').classList.toggle('hidden', currentTab !== 'wishlist');
      document.getElementById('checklist-tab').classList.toggle('hidden', currentTab !== 'checklist');
      document.getElementById('collections-tab').classList.toggle('hidden', currentTab !== 'collections');
    }
    updateTabStyles();

    // --- «Коллекции» (§4 плана, 20.09.2026) — только чтение, прогресс из
    // уже загруженного Чеклиста/Вишлиста клиента (getClientCollections). ---
    async function loadCollections() {
      const list = document.getElementById('collections-list');
      list.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const result = await callServer('getClientCollections');
        renderCollections(result);
      } catch (error) {
        list.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderCollections(result) {
      const list = document.getElementById('collections-list');
      const empty = document.getElementById('collections-empty-message');
      empty.classList.toggle('hidden', result.collections.length > 0);
      list.innerHTML = '';
      result.collections.forEach((c) => list.appendChild(buildCollectionCard(c, result.hasChecklistItems)));
    }

    function buildCollectionCard(c, hasChecklistItems) {
      const done = c.totalCount > 0 && c.ownedCount === c.totalCount;
      const left = c.totalCount - c.ownedCount;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `block w-full text-left rounded-2xl p-4 mb-3 shadow-sm ${done ? 'border-[1.5px] border-[#E8B130] bg-gradient-to-b from-[#FDF3D7] to-white' : 'bg-white border border-gray-100'}`;

      // Мягкая заглушка вместо "0%" (§3.7 плана, п.5) — пока у клиента вообще
      // нет ни одной позиции Чеклиста ни в одной коллекции, демотивирующий
      // ноль на КАЖДОЙ карточке не показывается, вместо него один и тот же
      // нейтральный призыв заполнить Чеклист.
      const showPlaceholder = !hasChecklistItems;
      const wantHint = !done && c.wantCount > 0 ? `<div class="text-[11px] text-gray-400 mt-1.5">Ещё ${c.wantCount} в вишлисте</div>` : '';
      const pill = done
        ? '<span class="text-[11px] font-bold rounded-full px-2 py-0.5 bg-[#E8B130] text-white">Собрана</span>'
        : (left === 1 && !showPlaceholder ? '<span class="text-[11px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Осталась 1</span>' : '');

      card.innerHTML = `
        <div class="flex items-center gap-3">
          ${c.coverImageUrl ? `<img src="${escapeHtmlClient(c.coverImageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="flex-1 min-w-0">
            <div class="font-bold text-gray-900 text-[15px] leading-tight">${escapeHtmlClient(c.name)}</div>
            ${c.description ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(c.description)}</div>` : ''}
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
        </div>
        ${showPlaceholder ? `
          <div class="mt-3 text-[12px] text-indigo-600 bg-indigo-50 rounded-xl p-2.5">Отметьте кукол, которые у вас уже есть, на вкладке «Чеклист» — и здесь появится прогресс.</div>
        ` : `
          <div class="mt-3">
            <div class="flex items-center justify-between text-[12px] text-gray-500 mb-1.5">
              <span>${c.ownedCount} из ${c.totalCount}</span>
              ${pill}
            </div>
            <div class="hn-bar${done ? ' gold' : ''}"><i style="width: ${c.progressPercent}%"></i></div>
            ${wantHint}
          </div>
        `}
      `;
      card.addEventListener('click', () => {
        Hunt.haptic('selection');
        navigateTo('collection/' + c.id);
      });
      return card;
    }
    loadCollections();

    async function loadWishlist() {
      activeList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      checklistList.innerHTML = '';
      try {
        allItems = await callServer('getClientWishlist');
        renderList();
      } catch (error) {
        activeList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    // Отложенные визуальные отклики после перерисовки (§1.2 плана геймификации).
    let pendingBump = null; // 'wishlist' | 'checklist' — «подпрыгнуть» счётчику таба
    let pendingPopId = null; // wishlistId плитки, которая «подпрыгнет» (S1)

    function renderList() {
      const wishlistItems = allItems.filter(i => i.status === 'Хочу');
      const checklistItems = allItems.filter(i => i.status === 'Куплено' || i.status === 'Есть');

      document.getElementById('wishlist-count-badge').textContent = wishlistItems.length > 0 ? `· ${wishlistItems.length}` : '';
      document.getElementById('checklist-count-badge').textContent = checklistItems.length > 0 ? `· ${checklistItems.length}` : '';

      wishlistEmptyMessage.classList.toggle('hidden', wishlistItems.length > 0);
      checklistEmptyMessage.classList.toggle('hidden', checklistItems.length > 0);

      // Граали — отдельной лентой над сеткой (§1.4 плана), в сетке не дублируются.
      const grails = wishlistItems.filter(i => i.isGrail);
      const hunting = wishlistItems.filter(i => !i.isGrail);
      activeList.innerHTML =
        (grails.length > 0 ? `<div class="hn-sec gold"><h2><i data-lucide="star"></i>Граали</h2><span>${grails.length} из ${Hunt.MAX_GRAILS}</span></div><div class="hn-strip">${grails.map(tileFor).join('')}</div>` : '') +
        (hunting.length > 0 ? `<div class="hn-sec"><h2>Охота</h2><span>${hunting.length}</span></div><div class="hn-grid">${hunting.map(tileFor).join('')}</div>` : '');

      checklistList.innerHTML = checklistItems.length > 0
        ? `<div class="hn-sec"><h2>Полка</h2><span>${checklistItems.length} ${Hunt.plural(checklistItems.length, 'кукла', 'куклы', 'кукол')}</span></div><div class="hn-grid">${checklistItems.map(tileFor).join('')}</div>`
        : '';

      if (window.lucide) window.lucide.createIcons();
      Hunt.wireImages(root);
      if (pendingBump) {
        const badge = document.getElementById(pendingBump + '-count-badge');
        if (badge) { badge.classList.remove('hn-bump'); void badge.offsetWidth; badge.classList.add('hn-bump'); }
        pendingBump = null;
      }
      pendingPopId = null;
    }

    function tileFor(item) {
      const isWant = item.status === 'Хочу';
      let chip = '';
      if (isWant && item.isGrail) chip = '<span class="hn-chip gold"><i data-lucide="star"></i></span>';
      else if (item.isUnknown) chip = '<span class="hn-chip gray">Не в каталоге</span>';
      const selected = selectionMode && selectedForShare.has(item.wishlistId);
      return Hunt.tileHtml({
        state: isWant ? 'want' : 'owned',
        title: item.productDisplay,
        imageUrl: item.imageUrl,
        isGrail: item.isGrail,
        chip,
        badge: selected ? '<span class="hn-badge sel"><i data-lucide="check"></i></span>' : '',
        selected,
        pop: pendingPopId === item.wishlistId,
        attrs: `data-wid="${escapeHtmlClient(item.wishlistId)}"`
      });
    }

    function onTileClick(e) {
      const tile = e.target.closest('[data-wid]');
      if (!tile) return;
      const item = allItems.find(i => i.wishlistId === tile.dataset.wid);
      if (!item) return;
      if (selectionMode) {
        // Режим выбора для "Поделиться" (§5 плана, 21.09.2026) — тап только
        // отмечает плитку, карточка не открывается.
        if (selectedForShare.has(item.wishlistId)) {
          selectedForShare.delete(item.wishlistId);
        } else {
          if (selectedForShare.size >= MAX_SHARE_ITEMS) {
            showSaveToast(false, `Можно выбрать не больше ${MAX_SHARE_ITEMS} позиций за раз`);
            return;
          }
          selectedForShare.add(item.wishlistId);
        }
        Hunt.haptic('selection');
        renderHeaderActions();
        renderShareBar();
        renderList();
        return;
      }
      openItemSheet(item);
    }
    activeList.addEventListener('click', onTileClick);
    checklistList.addEventListener('click', onTileClick);

    function reloadAll() {
      loadWishlist();
      loadCollections();
    }

    // Нижний лист позиции (§1.5 плана): на плитке кнопок нет, все действия здесь.
    function openItemSheet(item) {
      Hunt.haptic('selection');
      const isWant = item.status === 'Хочу';
      const tags = [
        item.isGrail ? '<span class="hn-tag gold"><i data-lucide="star"></i>Грааль</span>' : '',
        item.status === 'Куплено' ? '<span class="hn-tag win">Куплено у нас</span>' : '',
        item.isUnknown ? '<span class="hn-tag amber">Не в каталоге</span>' : ''
      ].join('');
      const meta = [];
      if (isWant && item.huntDays !== null && item.huntDays !== undefined) {
        meta.push(`<div><i data-lucide="hourglass"></i>В охоте ${item.huntDays === 0 ? 'с сегодня' : Hunt.days(item.huntDays) + ' · с ' + escapeHtmlClient(item.createdAtDisplay)}</div>`);
      }
      if (!isWant && item.huntDays) meta.push(`<div><i data-lucide="flag"></i>Охота длилась ${Hunt.days(item.huntDays)}</div>`);
      if (!item.imageUrl) meta.push(`<div><i data-lucide="image-off"></i>${item.isUnknown ? 'Фото появится, когда кукла попадёт в каталог' : 'Фото появится, как только его добавят в каталог'}</div>`);

      const actions = isWant ? `
        <button type="button" class="hn-btn primary" data-act="own"><i data-lucide="check"></i>У меня!</button>
        <button type="button" class="hn-btn soft" data-act="grail">${item.isGrail ? '<i data-lucide="star-off"></i>Убрать из Граалей' : '<i data-lucide="star"></i>Сделать Граалем'}</button>
        <div data-slot="err"></div>
        ${item.isUnknown ? '<button type="button" class="hn-btn plain" data-act="edit"><i data-lucide="pencil"></i>Редактировать</button>' : ''}
        <div data-slot="del"><button type="button" class="hn-btn danger" data-act="del">Удалить из вишлиста</button></div>
      ` : `
        <button type="button" class="hn-btn soft" data-act="back"><i data-lucide="undo-2"></i>Вернуть в вишлист</button>
        <div data-slot="err"></div>
        <div data-slot="del"><button type="button" class="hn-btn danger" data-act="del">Удалить</button></div>
      `;

      const html = `
        <div class="hn-sh-top">
          <div class="hn-tile ${isWant ? 'want' : 'owned'}${item.isGrail ? ' grail' : ''}" style="width:112px;flex:none"><div class="hn-ph">${Hunt.imgHtml(item.imageUrl, item.productDisplay)}</div></div>
          <div class="min-w-0">
            <div class="hn-sh-name">${escapeHtmlClient(item.productDisplay)}</div>
            ${item.isUnknown && item.rawTitle && item.rawTitle !== item.productDisplay ? `<div class="hn-sh-sub">${escapeHtmlClient(item.rawTitle)}</div>` : ''}
            ${tags ? `<div class="hn-tags">${tags}</div>` : ''}
          </div>
        </div>
        ${meta.length ? `<div class="hn-meta">${meta.join('')}</div>` : ''}
        ${item.rawDescription ? `<div class="hn-desc">${escapeHtmlClient(item.rawDescription)}</div>` : ''}
        ${item.sourceUrl ? `<div class="mt-2"><a class="hn-link" href="${escapeHtmlClient(item.sourceUrl)}" target="_blank" rel="noopener">Ссылка на товар</a></div>` : ''}
        <div class="hn-acts">${actions}</div>
      `;

      Hunt.sheet(html, (sheetEl) => {
        const errSlot = sheetEl.querySelector('[data-slot="err"]');
        const showErr = (message) => { errSlot.innerHTML = `<div class="hn-err">${escapeHtmlClient(message)}</div>`; };
        const on = (act, fn) => {
          const btn = sheetEl.querySelector(`[data-act="${act}"]`);
          if (btn) btn.addEventListener('click', () => fn(btn));
        };

        on('own', async (btn) => {
          btn.disabled = true;
          const tile = Array.from(activeList.querySelectorAll('[data-wid]')).find(el => el.dataset.wid === item.wishlistId);
          const tilePhoto = tile ? tile.querySelector('.hn-ph') : null;
          Hunt.closeSheet();
          const outcome = await Hunt.acquire(item.wishlistId);
          if (outcome === 'failed') return;
          if (outcome === 'celebrated') {
            await Hunt.fly(tilePhoto, document.querySelector('.tab-btn[data-tab="checklist"]'));
            pendingBump = 'checklist';
          } else if (outcome === 'plain') {
            showSaveToast(true, 'Кукла на полке');
            pendingBump = 'checklist';
          }
          reloadAll();
        });

        on('grail', async (btn) => {
          btn.disabled = true;
          try {
            await callServer('setWishlistItemGrail', item.wishlistId, !item.isGrail);
            Hunt.closeSheet();
            Hunt.haptic(item.isGrail ? 'selection' : 'light');
            if (!item.isGrail) pendingPopId = item.wishlistId;
            showSaveToast(true, item.isGrail ? 'Метка Грааля снята' : `${item.productDisplay} — теперь Грааль`);
            loadWishlist();
          } catch (error) {
            btn.disabled = false;
            showErr(error.message);
          }
        });

        on('edit', () => {
          Hunt.closeSheet();
          openModalForEdit(item);
        });

        on('back', async (btn) => {
          btn.disabled = true;
          try {
            await callServer('updateWishlistItemStatus', item.wishlistId, 'Хочу');
            Hunt.closeSheet();
            pendingBump = 'wishlist';
            showSaveToast(true, 'Кукла снова в вишлисте');
            reloadAll();
          } catch (error) {
            btn.disabled = false;
            showErr(`Не удалось изменить статус: ${error.message}`);
          }
        });

        on('del', () => {
          const slot = sheetEl.querySelector('[data-slot="del"]');
          slot.innerHTML = '<div class="hn-confirm"><button type="button" class="hn-btn soft" data-del="no">Отмена</button><button type="button" class="hn-btn red" data-del="yes">Удалить</button></div>';
          slot.querySelector('[data-del="no"]').addEventListener('click', () => Hunt.closeSheet());
          const yes = slot.querySelector('[data-del="yes"]');
          yes.addEventListener('click', async () => {
            yes.disabled = true;
            try {
              await callServer('deleteWishlistItem', item.wishlistId);
              Hunt.closeSheet();
              showSaveToast(true, 'Удалено');
              reloadAll();
            } catch (error) {
              yes.disabled = false;
              showErr(`Не удалось удалить: ${error.message}`);
            }
          });
        });
      });
    }

    // Праздники и анонс при открытии экрана (§2.3/§2.3а плана геймификации).
    // Best-effort: сбой не мешает работе со списком. Не больше одного окна за
    // заход — анонс важнее, отложенные праздники подождут следующего открытия.
    async function runHuntState() {
      let state;
      try {
        state = await callServer('getHuntState');
      } catch (_error) {
        return;
      }
      const shelfEmpty = !allItems.some(i => i.status === 'Куплено' || i.status === 'Есть');
      if (!state.introSeen) {
        const res = await Hunt.intro({ shelfEmpty });
        if (res === 'start' && shelfEmpty) {
          switchTab('checklist');
          openAddMethodModal({ addToChecklist: true });
        }
        return;
      }
      const list = state.celebrations || [];
      if (list.length === 0) return;
      Hunt.markSeen(list.map(c => c.wishlistId));
      if (list.length === 1) await Hunt.celebrate(list[0]);
      else await Hunt.summary(list);
      switchTab('checklist');
    }

    const addMethodModal = document.getElementById('add-method-modal');
    const addMethodBulkBtn = document.getElementById('add-method-bulk-btn');
    // Контекст текущего открытия add-method-modal — прочитан обработчиками
    // трёх кнопок способа внутри неё (фото/массово/вручную). Отдельная
    // переменная от addingToChecklist (та относится к item-modal, живёт
    // своим циклом открытие/закрытие) и от currentScanAddToChecklist (та
    // относится к фото-скану, взводится в момент клика "Добавить по фото",
    // не в момент открытия этой модалки).
    let addMethodAddToChecklist = false;
    function openAddMethodModal(options) {
      addMethodAddToChecklist = Boolean(options && options.addToChecklist);
      document.getElementById('add-method-modal-title').textContent = addMethodAddToChecklist ? 'Добавить в коллекцию' : 'Добавить в вишлист';
      addMethodBulkBtn.classList.toggle('hidden', !addMethodAddToChecklist);
      addMethodModal.classList.remove('hidden');
      addMethodModal.classList.add('flex');
    }
    function closeAddMethodModal() {
      addMethodModal.classList.add('hidden');
      addMethodModal.classList.remove('flex');
    }
    // add-item-btn слушатель — внутри renderHeaderActions() (контекстное
    // поведение по currentTab), не здесь.
    document.getElementById('empty-add-item-btn').addEventListener('click', () => openAddMethodModal({ addToChecklist: currentTab === 'checklist' }));
    document.getElementById('add-method-modal-close').addEventListener('click', closeAddMethodModal);
    document.getElementById('add-method-manual-btn').addEventListener('click', () => {
      closeAddMethodModal();
      openModalForCreate({ addToChecklist: addMethodAddToChecklist });
    });
    document.getElementById('add-method-photo-btn').addEventListener('click', () => {
      closeAddMethodModal();
      // currentScanAddToChecklist объявлена ниже по файлу (секция фото-
      // скана) — доступна здесь по замыканию, тот же приём, что уже
      // применён к photoScanInput строкой ниже.
      currentScanAddToChecklist = addMethodAddToChecklist;
      // Инпут фото объявлен ниже по файлу (const photoScanInput) — доступен
      // здесь по замыканию, срабатывает уже ПОСЛЕ полной инициализации экрана.
      photoScanInput.click();
    });
    addMethodBulkBtn.addEventListener('click', () => {
      closeAddMethodModal();
      openBulkAddModal();
    });

    // --- Массовый выбор из каталога (§3.7 плана, 20.09.2026) ---
    const bulkAddModal = document.getElementById('bulk-add-modal');
    const bulkAddSearch = document.getElementById('bulk-add-search');
    const bulkAddResults = document.getElementById('bulk-add-results');
    const bulkAddSelectedWrap = document.getElementById('bulk-add-selected-wrap');
    const bulkAddSelectedList = document.getElementById('bulk-add-selected-list');
    const bulkAddConfirmBtn = document.getElementById('bulk-add-confirm-btn');
    const bulkAddCount = document.getElementById('bulk-add-count');
    const bulkAddError = document.getElementById('bulk-add-error');
    // value(skuOriginal) -> label — Map, не Set, чтобы показать выбранное
    // списком под поиском (клиент видит итог, не только галочки в
    // прокручиваемом списке результатов).
    let bulkAddSelected = new Map();

    function openBulkAddModal() {
      bulkAddSelected = new Map();
      bulkAddSearch.value = '';
      bulkAddResults.innerHTML = '';
      bulkAddError.classList.add('hidden');
      renderBulkAddSelected();
      bulkAddModal.classList.remove('hidden');
      bulkAddModal.classList.add('flex');
    }
    function closeBulkAddModal() {
      bulkAddModal.classList.add('hidden');
      bulkAddModal.classList.remove('flex');
    }
    document.getElementById('bulk-add-modal-close').addEventListener('click', closeBulkAddModal);

    function renderBulkAddSelected() {
      bulkAddCount.textContent = bulkAddSelected.size;
      bulkAddConfirmBtn.disabled = bulkAddSelected.size === 0;
      bulkAddSelectedWrap.classList.toggle('hidden', bulkAddSelected.size === 0);
      bulkAddSelectedList.innerHTML = '';
      bulkAddSelected.forEach((label, sku) => {
        const chip = document.createElement('div');
        chip.className = 'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-sm text-indigo-900';
        chip.innerHTML = `<span class="truncate">${escapeHtmlClient(label)}</span>`;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'shrink-0 p-0.5 text-indigo-400 hover:text-indigo-600';
        removeBtn.innerHTML = '<i data-lucide="x" class="w-3.5 h-3.5"></i>';
        removeBtn.addEventListener('click', () => {
          bulkAddSelected.delete(sku);
          renderBulkAddSelected();
          renderBulkAddResultsCheckedState();
        });
        chip.appendChild(removeBtn);
        bulkAddSelectedList.appendChild(chip);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    // Уже отмеченные результаты остаются отмеченными, даже когда клиент
    // меняет текст поиска и список результатов перерисовывается — иначе
    // выбор "терялся бы из виду" (сам выбор не терялся, см. bulkAddSelected,
    // но чекбокс визуально выглядел бы снятым, что вводит в заблуждение).
    function renderBulkAddResultsCheckedState() {
      bulkAddResults.querySelectorAll('.bulk-add-check').forEach((cb) => {
        cb.checked = bulkAddSelected.has(cb.dataset.sku);
      });
    }

    const handleBulkAddSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { bulkAddResults.innerHTML = ''; return; }
      let results;
      try {
        results = await callServer('searchSkuForClient', query);
      } catch (error) {
        bulkAddResults.innerHTML = `<div class="p-3 text-sm text-red-500 text-center">${escapeHtmlClient(error.message)}</div>`;
        return;
      }
      if (results.length === 0) {
        bulkAddResults.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
        return;
      }
      bulkAddResults.innerHTML = '';
      results.forEach((item) => {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer';
        row.innerHTML = `
          <input type="checkbox" class="bulk-add-check" data-sku="${escapeHtmlClient(item.value)}" ${bulkAddSelected.has(item.value) ? 'checked' : ''}>
          <span class="text-sm text-gray-800 flex-1 min-w-0 truncate">${escapeHtmlClient(item.label)}</span>
        `;
        row.querySelector('.bulk-add-check').addEventListener('change', (ev) => {
          if (ev.target.checked) bulkAddSelected.set(item.value, item.label);
          else bulkAddSelected.delete(item.value);
          renderBulkAddSelected();
        });
        bulkAddResults.appendChild(row);
      });
    }, 300);
    bulkAddSearch.addEventListener('input', handleBulkAddSearch);

    bulkAddConfirmBtn.addEventListener('click', async () => {
      if (bulkAddSelected.size === 0) return;
      bulkAddError.classList.add('hidden');
      bulkAddConfirmBtn.disabled = true;
      try {
        const items = Array.from(bulkAddSelected.keys()).map((skuOriginal) => ({ skuOriginal }));
        const result = await callServer('addWishlistItemsBulk', items);
        closeBulkAddModal();
        showSaveToast(true, result.skipped > 0
          ? `Добавлено в коллекцию: ${result.added} (уже было: ${result.skipped})`
          : `Добавлено в коллекцию: ${result.added}`);
        loadWishlist();
      } catch (error) {
        bulkAddError.textContent = error.message;
        bulkAddError.classList.remove('hidden');
        bulkAddConfirmBtn.disabled = false;
      }
    });

    // --- Модалка добавления/редактирования ---
    const itemModal = document.getElementById('item-modal');
    const searchBlock = document.getElementById('search-mode-block');
    const manualBlock = document.getElementById('manual-mode-block');
    const itemSearch = document.getElementById('item-search');
    const itemSearchDropdown = document.getElementById('item-search-dropdown');
    const selectedSkuDisplay = document.getElementById('selected-sku-display');
    const errorText = document.getElementById('item-error-text');
    const resolveLinkBtn = document.getElementById('resolve-link-btn');
    const manualUrlInput = document.getElementById('manual-url-input');
    const manualTitleInput = document.getElementById('manual-title-input');
    const manualDescriptionInput = document.getElementById('manual-description-input');
    const manualImageInput = document.getElementById('manual-image-input');
    const urlHintBlock = document.getElementById('url-hint-block');
    const urlHintResolveBtn = document.getElementById('url-hint-resolve-btn');
    const manualCatalogMatch = document.getElementById('manual-catalog-match');
    const manualCatalogMatchImage = document.getElementById('manual-catalog-match-image');
    const manualCatalogMatchName = document.getElementById('manual-catalog-match-name');
    const manualCatalogMatchUseBtn = document.getElementById('manual-catalog-match-use-btn');
    const manualCatalogMatchDismissBtn = document.getElementById('manual-catalog-match-dismiss-btn');
    let manualCatalogMatchDismissedFor = null;

    function hideManualCatalogMatch() {
      manualCatalogMatch.classList.add('hidden');
    }

    function looksLikeUrl(value) {
      return /^https?:\/\//i.test(value.trim());
    }

    function resetModalState() {
      selectedSkuValue = null;
      editingWishlistId = null;
      addingToChecklist = false;
      itemSearch.value = '';
      selectedSkuDisplay.classList.add('hidden');
      itemSearchDropdown.classList.remove('active');
      urlHintBlock.classList.add('hidden');
      document.getElementById('manual-title-input').value = '';
      document.getElementById('manual-short-name-input').value = '';
      document.getElementById('manual-description-input').value = '';
      document.getElementById('manual-url-input').value = '';
      document.getElementById('manual-image-input').value = '';
      errorText.classList.add('hidden');
      searchBlock.classList.remove('hidden');
      manualBlock.classList.add('hidden');
      resolveLinkBtn.disabled = true;
      hideManualCatalogMatch();
      manualCatalogMatchDismissedFor = null;
    }

    function openModalForCreate(options) {
      resetModalState();
      addingToChecklist = Boolean(options && options.addToChecklist);
      document.getElementById('item-modal-title').textContent = addingToChecklist ? 'Добавить в коллекцию' : 'Добавить в вишлист';
      itemModal.classList.remove('hidden');
      itemModal.classList.add('flex');
    }

    // Редактирование доступно только для Unknown-позиций (решение C.5, C4).
    // Технически это delete старой + create новой — отдельного update-метода
    // в согласованном контракте API нет. Wishlist_ID при этом обновляется.
    function openModalForEdit(item) {
      resetModalState();
      editingWishlistId = item.wishlistId;
      document.getElementById('item-modal-title').textContent = 'Редактировать позицию';
      document.getElementById('manual-title-input').value = item.rawTitle;
      document.getElementById('manual-short-name-input').value = item.shortNameRu || '';
      document.getElementById('manual-description-input').value = item.rawDescription;
      document.getElementById('manual-url-input').value = item.sourceUrl;
      document.getElementById('manual-image-input').value = item.rawImageUrl;
      resolveLinkBtn.disabled = item.sourceUrl.trim() === '';
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
      itemModal.classList.remove('hidden');
      itemModal.classList.add('flex');
    }

    function closeItemModal() {
      itemModal.classList.add('hidden');
      itemModal.classList.remove('flex');
    }
    document.getElementById('item-modal-close').addEventListener('click', closeItemModal);
    document.getElementById('item-modal-cancel').addEventListener('click', closeItemModal);

    document.getElementById('switch-to-manual-btn').addEventListener('click', () => {
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
    });
    document.getElementById('switch-to-search-btn').addEventListener('click', () => {
      manualBlock.classList.add('hidden');
      searchBlock.classList.remove('hidden');
      hideManualCatalogMatch();
    });

    // Сверка ручного ввода с каталогом (план "Лоты/ИИ", расширение
    // 19.09.2026, репорт VASY) — тот же матчер и тот же принцип, что уже
    // работает для распознавания по фото (matchNamesToCatalog): только
    // 'match' (высокая уверенность), НИЧЕГО не выбирается само — только
    // явное предложение с кнопкой "Это она"/"Не то". На blur, не на каждую
    // букву — короткие промежуточные обрывки текста ("Draculaur") давали бы
    // мусорные непопадания и лишние запросы к серверу на каждый чих.
    manualTitleInput.addEventListener('blur', async () => {
      const title = manualTitleInput.value.trim();
      if (title.length < 4 || title === manualCatalogMatchDismissedFor) { return; }

      let match;
      try {
        match = await callServer('matchWishlistNameToCatalog', title);
      } catch (_error) {
        return; // сверка — удобство, не критичная функциональность, тихо пропускаем сбой
      }
      // Пока ждали ответ, поле могло измениться/скрыться (переключение на
      // поиск, закрытие модалки) — проверяем ещё раз, чтобы не показать
      // подсказку не по адресу.
      if (manualBlock.classList.contains('hidden') || manualTitleInput.value.trim() !== title) return;

      if (!match) { hideManualCatalogMatch(); return; }
      manualCatalogMatchImage.src = match.imageUrl || '';
      manualCatalogMatchImage.classList.toggle('hidden', !match.imageUrl);
      manualCatalogMatchName.textContent = match.shortName;
      manualCatalogMatch.classList.remove('hidden');
      manualCatalogMatch.dataset.skuOriginal = match.skuOriginal;
      manualCatalogMatch.dataset.label = match.shortName;
    });

    manualCatalogMatchUseBtn.addEventListener('click', () => {
      const skuOriginal = manualCatalogMatch.dataset.skuOriginal;
      const label = manualCatalogMatch.dataset.label;
      hideManualCatalogMatch();
      manualBlock.classList.add('hidden');
      searchBlock.classList.remove('hidden');
      selectedSkuValue = skuOriginal;
      itemSearch.value = label;
      selectedSkuDisplay.textContent = `Выбрано: ${label}`;
      selectedSkuDisplay.classList.remove('hidden');
    });

    manualCatalogMatchDismissBtn.addEventListener('click', () => {
      manualCatalogMatchDismissedFor = manualTitleInput.value.trim();
      hideManualCatalogMatch();
    });

    // Авто-распознавание товара по ссылке (Phase A: OG-теги/JSON-LD, без AI —
    // см. LinkResolverService.js). Перезаписывает поля формы результатом,
    // пользователь видит и может поправить перед Сохранить. Общая функция —
    // вызывается и с кнопки в ручном режиме, и с подсказки над поиском по каталогу.
    //
    // РАСШИРЕНО 19.09.2026 (репорт VASY) — resolveWishlistLink теперь сначала
    // проверяет каталог по ссылке (см. catalogService.resolveWishlistLinkForClient):
    // status:'matched' — ссылка уже привязана к позиции каталога, переходим
    // в состояние "выбрано из каталога" (та же ветка, что явный выбор из
    // поиска), поля формы не трогаем. status:'unmatched' — как раньше,
    // подставляем распознанный текст в ручные поля.
    async function performLinkResolve(url) {
      errorText.classList.add('hidden');
      resolveLinkBtn.disabled = true;
      const icon = resolveLinkBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');

      try {
        const result = await callServer('resolveWishlistLink', url);
        if (result.status === 'matched') {
          manualBlock.classList.add('hidden');
          searchBlock.classList.remove('hidden');
          hideManualCatalogMatch();
          selectedSkuValue = result.sku.original;
          const label = result.sku.shortName || result.sku.original;
          itemSearch.value = label;
          selectedSkuDisplay.textContent = `Выбрано: ${label}`;
          selectedSkuDisplay.classList.remove('hidden');
          return;
        }
        const { resolved } = result;
        manualTitleInput.value = resolved.title.slice(0, 150);
        manualDescriptionInput.value = resolved.description.slice(0, 300);
        if (resolved.imageUrl) manualImageInput.value = resolved.imageUrl;
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      } finally {
        resolveLinkBtn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');
      }
    }

    manualUrlInput.addEventListener('input', () => {
      resolveLinkBtn.disabled = manualUrlInput.value.trim() === '';
    });

    resolveLinkBtn.addEventListener('click', () => {
      const url = manualUrlInput.value.trim();
      if (url === '') return;
      performLinkResolve(url);
    });

    // Вставка ссылки прямо в строку поиска каталога — подсказка вместо
    // бессмысленного поиска по каталогу текстом ссылки.
    urlHintResolveBtn.addEventListener('click', () => {
      const url = itemSearch.value.trim();
      urlHintBlock.classList.add('hidden');
      itemSearch.value = '';
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
      manualUrlInput.value = url;
      resolveLinkBtn.disabled = false;
      performLinkResolve(url);
    });

    // Пункт "Добавить вручную" ВНУТРИ выпадашки поиска — репорт VASY (беты
    // день 1, п.3): при непустых результатах поиска dropdown (position:
    // absolute, см. app.html) перекрывает собой кнопку switch-to-manual-btn,
    // стоящую статично сразу под полем поиска — она физически не видна,
    // пока список открыт. Добавляем тот же переход последним пунктом внутри
    // самой выпадашки, всегда видимым без скролла мимо неё.
    function appendManualDropdownOption() {
      const li = document.createElement('li');
      li.className = 'p-3 cursor-pointer hover:bg-indigo-50 flex items-center gap-1.5 text-indigo-600 text-sm font-medium border-t border-gray-100 sticky bottom-0 bg-white';
      li.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4"></i><span>Не нашли? Добавить вручную</span>';
      li.addEventListener('click', () => {
        itemSearchDropdown.classList.remove('active');
        document.getElementById('switch-to-manual-btn').click();
      });
      itemSearchDropdown.appendChild(li);
    }

    // Автокомплит поиска по каталогу — тот же паттерн debounce/dropdown, что в edit-order.html
    const handleItemSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (looksLikeUrl(query)) { itemSearchDropdown.classList.remove('active'); return; }
      if (query.length < 2) { itemSearchDropdown.classList.remove('active'); return; }

      const results = await callServer('searchSkuForClient', query);
      itemSearchDropdown.innerHTML = '';
      if (results.length === 0) {
        itemSearchDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.label)}</div>`;
          li.addEventListener('click', () => {
            selectedSkuValue = item.value;
            selectedSkuDisplay.textContent = `Выбрано: ${item.label}`;
            selectedSkuDisplay.classList.remove('hidden');
            itemSearch.value = item.label;
            itemSearchDropdown.classList.remove('active');
          });
          itemSearchDropdown.appendChild(li);
        });
      }
      appendManualDropdownOption();
      if (window.lucide) window.lucide.createIcons();
      itemSearchDropdown.classList.add('active');
    }, 300);
    itemSearch.addEventListener('input', handleItemSearch);
    itemSearch.addEventListener('input', (e) => {
      urlHintBlock.classList.toggle('hidden', !looksLikeUrl(e.target.value));
    });

    document.addEventListener('click', (e) => {
      if (!itemSearch.contains(e.target) && !itemSearchDropdown.contains(e.target)) {
        itemSearchDropdown.classList.remove('active');
      }
    });

    const itemModalSaveBtn = document.getElementById('item-modal-save');
    itemModalSaveBtn.addEventListener('click', async () => {
      errorText.classList.add('hidden');
      const isManualMode = !manualBlock.classList.contains('hidden');

      const payload = {
        skuOriginal: isManualMode ? null : selectedSkuValue,
        rawTitle: document.getElementById('manual-title-input').value.trim(),
        shortNameRu: document.getElementById('manual-short-name-input').value.trim(),
        rawDescription: document.getElementById('manual-description-input').value.trim(),
        sourceUrl: document.getElementById('manual-url-input').value.trim(),
        rawImageUrl: document.getElementById('manual-image-input').value.trim()
      };
      // Только на создании — редактирование не должно тихо переносить позицию
      // между табами (см. wishlistService.addWishlistItem's JSDoc).
      if (!editingWishlistId && addingToChecklist) payload.addToChecklist = true;

      if (!isManualMode && !payload.skuOriginal) {
        errorText.textContent = 'Выберите позицию из списка или переключитесь на ручной ввод.';
        errorText.classList.remove('hidden');
        return;
      }
      if (isManualMode && payload.rawTitle === '') {
        errorText.textContent = 'Название обязательно для заполнения.';
        errorText.classList.remove('hidden');
        return;
      }

      // Блокировка кнопки на время запроса (найдено 04.08.2026, репорт VASY:
      // повторные клики на медленном ответе GAS создавали дублирующие записи
      // вишлиста) — тот же приём, что уже есть у кнопки добавления ссылки в
      // _sku-modal.js.
      itemModalSaveBtn.disabled = true;
      try {
        // Атомарный update вместо delete+add (20.08.2026, находка в бэклоге
        // аудита — старый delete+add путь мог тихо и НАВСЕГДА стоить клиенту
        // уже заработанную сову за "⭐ Добавь куклу в вишлист" при обычном
        // редактировании текста, см. wishlistService.updateWishlistItem).
        if (editingWishlistId) {
          await callServer('updateWishlistItem', editingWishlistId, payload);
        } else {
          await callServer('addWishlistItem', payload);
        }
        closeItemModal();
        showSaveToast(true, editingWishlistId ? 'Позиция обновлена' : (addingToChecklist ? 'Добавлено в коллекцию' : 'Добавлено в вишлист'));
        if (reloadWishlist) reloadWishlist();
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      } finally {
        itemModalSaveBtn.disabled = false;
      }
    });

    // --- Вишлист по фото (план "Лоты/ИИ", Этап 6, 16.09.2026) ---
    const photoScanInput = document.getElementById('photo-scan-input');
    const photoScanModal = document.getElementById('photo-scan-modal');
    const photoScanLoading = document.getElementById('photo-scan-loading');
    const photoScanEmpty = document.getElementById('photo-scan-empty');
    const photoScanList = document.getElementById('photo-scan-list');
    const photoScanError = document.getElementById('photo-scan-error');
    const photoScanActions = document.getElementById('photo-scan-actions');
    const photoScanDiscardBtn = document.getElementById('photo-scan-discard-btn');
    const photoScanConfirmBtn = document.getElementById('photo-scan-confirm-btn');

    let currentScanId = null;
    // §3.7 плана (20.09.2026) — взводится ПЕРЕД photoScanInput.click() из
    // add-method-photo-btn (см. выше), читается только на confirm — сам
    // scanWishlistPhoto (распознавание) от таба не зависит.
    let currentScanAddToChecklist = false;

    function closePhotoScanModal() {
      photoScanModal.classList.add('hidden');
      photoScanModal.classList.remove('flex');
      currentScanId = null;
      currentScanAddToChecklist = false;
      photoScanInput.value = '';
    }
    document.getElementById('photo-scan-modal-close').addEventListener('click', closePhotoScanModal);

    function openPhotoScanModalLoading() {
      document.getElementById('photo-scan-modal-title').textContent = currentScanAddToChecklist ? 'Похоже на фото — в коллекцию' : 'Похоже на фото';
      photoScanConfirmBtn.textContent = currentScanAddToChecklist ? 'Добавить в коллекцию' : 'Добавить в вишлист';
      photoScanLoading.classList.remove('hidden');
      photoScanEmpty.classList.add('hidden');
      photoScanList.innerHTML = '';
      photoScanError.classList.add('hidden');
      photoScanActions.classList.add('hidden');
      photoScanModal.classList.remove('hidden');
      photoScanModal.classList.add('flex');
    }

    // idx -> принятый skuOriginal (сверка вишлиста с каталогом, 16.09.2026,
    // дизайн одобрен VASY) — пусто, если совпадения не было или клиент его
    // отклонил ("Не то — ввести вручную"). Держим отдельно от DOM, т.к.
    // отклонённая позиция меняет разметку строки целиком (была карточка
    // совпадения — становится обычное текстовое поле).
    let scanRowSku = {};
    // idx -> true, если клиент явно нажал "Распознано неверно" (репорт
    // VASY 19.09.2026: обратная связь, что ИИ не всегда правильно
    // распознаёт куклу на фото) — логируется на confirmScan для анализа,
    // ГДЕ именно ИИ ошибается. Отдельно от простого редактирования текста —
    // тихая правка (опечатка/регистр) не должна тонуть сигнал "ИИ реально
    // ошиблась" в шуме.
    let scanRowMisrecognized = {};

    function renderScanRowBody(row, idx, pos, matched) {
      const confidencePct = pos.confidence !== null && pos.confidence !== undefined ? Math.round(pos.confidence * 100) : null;
      // §3.7 плана (20.09.2026) — дедуп при фото-скане: позиция уже есть в
      // Чеклисте клиента (wishlistPhotoService.attachCatalogMatches). Только
      // подсказка, чекбокс по умолчанию снят — клиент всё равно может
      // отметить и добавить второй раз осознанно.
      const alreadyInChecklist = Boolean(matched && pos.alreadyInChecklist);
      const nameFieldHtml = matched
        ? `
          <div class="flex items-center gap-2 p-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
            ${matched.imageUrl ? `<img src="${escapeHtmlClient(matched.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-white" onerror="this.style.display='none'">` : ''}
            <div class="flex-1 min-w-0">
              <div class="text-[10px] text-indigo-500 font-medium">Похоже на позицию каталога</div>
              <div class="text-sm font-medium text-indigo-900 truncate">${escapeHtmlClient(matched.shortName)}</div>
              ${alreadyInChecklist ? '<div class="text-[10px] text-emerald-600 font-medium mt-0.5">Уже добавлено в Чеклист</div>' : ''}
            </div>
          </div>
          <button type="button" class="photo-scan-reject-match text-[11px] text-indigo-600 font-medium mt-1" data-idx="${idx}">Это другой товар — ввести вручную</button>
          <input type="text" class="photo-scan-name hidden" data-idx="${idx}" value="${escapeHtmlClient(pos.name)}">
        `
        : `<input type="text" class="photo-scan-name w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" data-idx="${idx}" maxlength="150" value="${escapeHtmlClient(pos.name)}">`;

      const isFlagged = Boolean(scanRowMisrecognized[idx]);

      // Варианты по справочнику кукол (§11.12 IMPLEMENTATION-PLAN-
      // GAMIFICATION.md, Ж4): сначала «есть у нас», ниже — модели справочника,
      // которых в каталоге нет (выбор подставляет точное название). Только
      // предложения — выбирает клиент.
      const catalogAlternatives = [pos.catalogMatch, ...(pos.catalogOptions || [])]
        .filter(o => o && (!matched || o.skuOriginal !== matched.skuOriginal));
      const referenceAlternatives = pos.referenceOptions || [];
      const alternativesHtml = (catalogAlternatives.length > 0 || referenceAlternatives.length > 0) ? `
        <div class="mt-1.5 space-y-1">
          ${catalogAlternatives.length > 0 ? `<div class="text-[10px] text-gray-400">${matched ? 'Или другая из каталога:' : 'Может быть, из каталога:'}</div>` : ''}
          ${catalogAlternatives.map((o, j) => `
            <button type="button" class="photo-scan-opt-cat w-full flex items-center gap-2 p-1 rounded-lg border border-indigo-100 text-left" data-j="${j}">
              ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-7 h-7 rounded object-cover shrink-0 bg-white" onerror="this.style.display='none'">` : ''}
              <span class="text-xs text-indigo-900 truncate">${escapeHtmlClient(o.shortName)}${o.year ? ` · ${o.year}` : ''}</span>
            </button>`).join('')}
          ${referenceAlternatives.length > 0 ? '<div class="text-[10px] text-gray-400">Из справочника кукол:</div>' : ''}
          ${referenceAlternatives.map((o, j) => `
            <button type="button" class="photo-scan-opt-ref w-full flex items-center gap-2 p-1 rounded-lg border border-gray-200 text-left" data-j="${j}">
              ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-7 h-7 rounded object-cover shrink-0 bg-white" onerror="this.style.display='none'">` : ''}
              <span class="text-xs text-gray-700 truncate">${escapeHtmlClient(o.label)}</span>
            </button>`).join('')}
        </div>` : '';

      row.innerHTML = `
        <input type="checkbox" class="photo-scan-check mt-2.5" data-idx="${idx}" ${alreadyInChecklist ? '' : 'checked'}>
        <div class="flex-1 min-w-0">
          ${nameFieldHtml}
          ${alternativesHtml}
          <div class="flex items-center gap-2 mt-1">
            <label class="text-[11px] text-gray-400">Кол-во</label>
            <input type="number" min="1" max="20" class="photo-scan-qty w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400" data-idx="${idx}" value="${pos.quantity}">
            ${confidencePct !== null ? `<span class="text-[11px] text-gray-400">уверенность ${confidencePct}%</span>` : ''}
          </div>
          ${pos.note ? `<div class="text-[11px] text-amber-600 mt-1">${escapeHtmlClient(pos.note)}</div>` : ''}
          <button type="button" class="photo-scan-misrecognized-btn text-[11px] mt-1.5 font-medium ${isFlagged ? 'text-red-600' : 'text-gray-400'}" data-idx="${idx}">
            ${isFlagged ? '✓ Отмечено как неверно распознанное — снять пометку' : 'Распознано неверно?'}
          </button>
        </div>
      `;
      row.classList.toggle('border-red-200', isFlagged);
      row.classList.toggle('bg-red-50/30', isFlagged);

      row.querySelectorAll('.photo-scan-opt-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          const o = catalogAlternatives[Number(btn.dataset.j)];
          scanRowSku[idx] = o.skuOriginal;
          renderScanRowBody(row, idx, pos, o);
          if (window.lucide) window.lucide.createIcons();
        });
      });
      row.querySelectorAll('.photo-scan-opt-ref').forEach(btn => {
        btn.addEventListener('click', () => {
          const o = referenceAlternatives[Number(btn.dataset.j)];
          scanRowSku[idx] = '';
          pos.name = o.label.slice(0, 150);
          renderScanRowBody(row, idx, pos, null);
          if (window.lucide) window.lucide.createIcons();
        });
      });

      const rejectBtn = row.querySelector('.photo-scan-reject-match');
      if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
          scanRowSku[idx] = '';
          renderScanRowBody(row, idx, pos, null);
          if (window.lucide) window.lucide.createIcons();
        });
      }

      row.querySelector('.photo-scan-misrecognized-btn').addEventListener('click', () => {
        scanRowMisrecognized[idx] = !scanRowMisrecognized[idx];
        // ИИ ошиблась в самом названии — предложенное по нему совпадение с
        // каталогом почти наверняка тоже не то, снимаем его и открываем
        // поле для правки, чтобы не нужно было нажимать оба переключателя.
        if (scanRowMisrecognized[idx] && matched) {
          scanRowSku[idx] = '';
          matched = null;
        }
        renderScanRowBody(row, idx, pos, matched);
        const nameInput = row.querySelector('.photo-scan-name');
        if (scanRowMisrecognized[idx] && nameInput) nameInput.focus();
        if (window.lucide) window.lucide.createIcons();
      });
    }

    function renderPhotoScanPositions(positions) {
      photoScanLoading.classList.add('hidden');
      if (!positions || positions.length === 0) {
        photoScanEmpty.classList.remove('hidden');
        return;
      }
      photoScanList.innerHTML = '';
      scanRowSku = {};
      scanRowMisrecognized = {};
      positions.forEach((pos, idx) => {
        const matched = pos.catalogMatch || null;
        scanRowSku[idx] = matched ? matched.skuOriginal : '';
        const row = document.createElement('div');
        row.className = 'flex items-start gap-2 p-2 rounded-xl border border-gray-100';
        photoScanList.appendChild(row);
        renderScanRowBody(row, idx, pos, matched);
      });
      photoScanActions.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    function collectPhotoScanItems() {
      const items = [];
      photoScanList.querySelectorAll('.photo-scan-check').forEach((checkbox) => {
        const idx = checkbox.dataset.idx;
        const nameInput = photoScanList.querySelector(`.photo-scan-name[data-idx="${idx}"]`);
        const qtyInput = photoScanList.querySelector(`.photo-scan-qty[data-idx="${idx}"]`);
        items.push({
          checked: checkbox.checked,
          name: nameInput ? nameInput.value.trim() : '',
          quantity: qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1,
          skuOriginal: scanRowSku[idx] || '',
          misrecognized: Boolean(scanRowMisrecognized[idx])
        });
      });
      return items;
    }

    function showPhotoScanError(message) {
      photoScanLoading.classList.add('hidden');
      photoScanError.textContent = message;
      photoScanError.classList.remove('hidden');
    }

    function friendlyScanErrorMessage(error) {
      if (error.message === 'NEEDS_CONSENT') {
        return 'Нужно заново подтвердить политику конфиденциальности — перезайдите в приложение (появится окно подтверждения).';
      }
      if (error.message === 'RATE_LIMIT_DAILY') {
        return 'Лимит распознавания фото на сегодня исчерпан — попробуйте завтра.';
      }
      return error.message;
    }

    async function startPhotoScan(images) {
      openPhotoScanModalLoading();
      try {
        const result = await callServer('scanWishlistPhoto', images);
        currentScanId = result.scanId;
        renderPhotoScanPositions(result.positions);
      } catch (error) {
        showPhotoScanError(friendlyScanErrorMessage(error));
      }
    }

    // Сжатие фото на устройстве перед отправкой (canvas) — сырые фото с
    // камеры телефона легко несколько МБ, `callServer` шлёт JSON-текстом без
    // выделенной загрузки файлов, base64 добавляет ещё ~33% — без сжатия
    // отправка была бы медленной/ненадёжной на мобильной сети.
    function compressImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
          img.onload = () => {
            const maxDim = 1280;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = maxDim / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1] });
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    photoScanInput.addEventListener('change', async () => {
      const file = photoScanInput.files[0];
      if (!file) return;
      openPhotoScanModalLoading();
      try {
        const image = await compressImageFile(file);
        await startPhotoScan([image]);
      } catch (error) {
        showPhotoScanError(error.message);
      }
    });

    photoScanDiscardBtn.addEventListener('click', async () => {
      if (!currentScanId) { closePhotoScanModal(); return; }
      photoScanDiscardBtn.disabled = true;
      try {
        await callServer('discardWishlistPhotoScan', currentScanId);
      } catch (_error) {
        // не критично — скан просто останется 'pending', сверх дневного лимита не считается заново
      } finally {
        photoScanDiscardBtn.disabled = false;
        closePhotoScanModal();
      }
    });

    photoScanConfirmBtn.addEventListener('click', async () => {
      if (!currentScanId) return;
      const items = collectPhotoScanItems();
      if (!items.some((i) => i.checked && i.name !== '')) {
        showPhotoScanError('Отметьте хотя бы одну позицию.');
        return;
      }
      photoScanConfirmBtn.disabled = true;
      try {
        const result = await callServer('confirmWishlistPhotoScan', currentScanId, items, currentScanAddToChecklist);
        const wasAddingToChecklist = currentScanAddToChecklist;
        closePhotoScanModal();
        showSaveToast(true, wasAddingToChecklist ? `Добавлено в коллекцию: ${result.added}` : `Добавлено в вишлист: ${result.added}`);
        loadWishlist();
      } catch (error) {
        showPhotoScanError(error.message);
      } finally {
        photoScanConfirmBtn.disabled = false;
      }
    });

    // Диплинк из чата бота (`wishlist/photo-scan/<scanId>`, см. botHandler.js) —
    // черновик уже существует на сервере, здесь просто открываем экран
    // подтверждения по его id, не заводим новый скан.
    if (params && params.photoScanId) {
      (async () => {
        openPhotoScanModalLoading();
        try {
          const scan = await callServer('getWishlistPhotoScan', params.photoScanId);
          currentScanId = scan.scanId;
          if (scan.status !== 'pending') {
            showPhotoScanError('Этот скан уже обработан.');
          } else {
            renderPhotoScanPositions(scan.positions);
          }
        } catch (error) {
          showPhotoScanError(error.message);
        }
      })();
    }
  }
};
