'use strict';

/**
 * Экран "Заказы" (админ) — перенесён из admin/orders.html (SPA админки,
 * 02.08.2026). Локальная теневая копия escapeHtmlClient (существовала в
 * оригинале, дублировала общую из common.js без экранирования кавычек) —
 * убрана, используется общая.
 *
 * Множественный выбор + массовые действия (Э3 рефакторинга коллективок,
 * 24.08.2026, REFACTOR-COLLECTIVES.md §3) — режим "Выбрать" + чекбоксы +
 * нижняя панель. "В коллективку"/"Создать коллективку из выбранных" строят
 * текст подтверждения ЛОКАЛЬНО (`o.collectiveId` уже в `getOrdersList`,
 * `getCollectivesList` — свежий список коллективок с `orderCount`), группируя
 * по исходной коллективке (decision (а), VASY 24.08.2026) — БЕЗ похода на
 * сервер за превью: `assignOrdersToCollective` вызывается СРАЗУ после
 * подтверждения. "Удалить" — безопасный вариант, `getBulkOrderDeletionPreview`
 * СНАЧАЛА (чистые/с оплатами разделены сервером), исполнение только чистых.
 */
window.Screens = window.Screens || {};

// Состояние списка (18.08.2026, репорт VASY — "после редактирования
// заказа приходится заново писать позицию в строке поиска и проматывать
// всё") — вне render(), тот же приём, что NEW_ORDER_DRAFT_KEY в
// order-new.js: переживает пересоздание DOM этого экрана при возврате из
// редактирования В РАМКАХ той же SPA-сессии (не localStorage — полная
// перезагрузка страницы это состояние сбросит, тут это не требовалось,
// только "туда-обратно" внутри одного захода в приложение). Режим "Выбрать"
// НЕ входит сюда намеренно — сбрасывается при каждом новом заходе на экран
// (см. render() ниже), выбор заказов не должен переживать уход и возврат.
const ordersListState = { query: '', sortFieldValue: 'dateOrderSort', sortDirection: 'desc', displayCount: 50, scrollY: 0, managerFilter: '' };

window.Screens.orders = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Заказы</h1>
    `;
    // Шапка-действия (18.08.2026 было: 4 голые иконки, title= — не работает на
    // тап в Telegram Mini App, см. project_bot_knopka_audit_backlog_remaining.
    // 20.08.2026: перенесены из header-actions (общий shared-компонент
    // app.html, фиксированная h-14 на ВСЕХ admin-экранах — трогать его высоту
    // ради подписей одного экрана было бы риском для остальных) в свой ряд
    // внутри root, тот же стиль icon+подпись, что уже используют bottom-nav/
    // more.js (text-[10px] font-medium leading-none). header-actions теперь
    // пуст на этом экране.
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-3 flex items-center justify-between gap-1">
          <button type="button" id="new-order-btn" title="Новый заказ" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="plus" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Новый</span>
          </button>
          <!-- Рефакторинг «Корзина», фаза 3 (REFACTOR-CART.md §4, 03.09.2026) —
               отдельная кнопка рядом с "Новый" (решение VASY, переходный
               период — старые order-new.js/lot-new.js не убираются, см.
               cart-new.js JSDoc). -->
          <button type="button" id="new-cart-btn" title="Новая корзина" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="shopping-cart" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Корзина</span>
          </button>
          <button type="button" id="collectives-btn" title="Коллективки" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="package-2" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Коллективки</span>
          </button>
          <!-- Фича «Лот»/«Корзина» (delegated-spinning-rabbit.md, 02.09.2026) —
               тот же паттерн, что "Коллективки": ведёт на список, создание —
               внутри lots.js (две кнопки "+ Лот"/"+ Корзина" на самом списке,
               не здесь — иначе этот ряд разрастается до 7 кнопок). -->
          <button type="button" id="lots-btn" title="Лоты" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="boxes" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Лоты</span>
          </button>
          <button type="button" id="deleted-orders-btn" title="Удалённые" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Удалённые</span>
          </button>
          <button type="button" id="select-mode-btn" title="Выбрать несколько" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="list-checks" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Выбрать</span>
          </button>
          <button type="button" id="refresh-orders" title="Обновить список" class="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="refresh-cw" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Обновить</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="order-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по заказам..." autocomplete="off">
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <select id="sort-field" class="flex-1 bg-transparent border-none outline-none text-[14px] cursor-pointer">
            <option value="dateOrderSort">Дата выкупа</option>
            <option value="productDisplay">Выпуск</option>
            <option value="statusOrder">Статус заказа</option>
            <option value="statusDelivery">Статус доставки</option>
            <option value="purchaseChannel">Канал выкупа</option>
            <option value="clientDisplay">Клиент</option>
          </select>
          <button id="sort-direction" title="Сменить направление сортировки" class="p-1.5 text-indigo-600 flex items-center gap-1 shrink-0">
            <i data-lucide="arrow-down-wide-narrow" class="w-4 h-4"></i>
            <span class="text-[11px] font-medium">По убыванию</span>
          </button>
        </div>

        <!-- Фаза 2 (roles/RBAC, M2.6) — только для admin, менеджер видит
             только свои заказы жёстко, без выбора (см. render()). -->
        <select id="manager-filter-select" class="hidden w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 text-[14px] outline-none focus:border-indigo-400">
          <option value="">Все менеджеры</option>
        </select>
        <div id="mine-only-badge" class="hidden text-[11px] text-gray-400 px-1 mb-2">Показаны только ваши заказы</div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="orders-count"></div>

        <div id="orders-list"></div>

        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Заказы не найдены</div>

        <button id="load-more-btn" class="hidden w-full bg-white border border-gray-100 rounded-2xl py-3 text-sm font-medium text-indigo-600 shadow-sm">
          Показать ещё
        </button>
      </main>

      <!-- Нижняя панель массовых действий (Э3) — видна только в режиме "Выбрать" -->
      <div id="bulk-actions-bar" class="hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-40 px-4 py-3">
        <div class="max-w-2xl mx-auto">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-700">Выбрано: <span id="bulk-selected-count">0</span></span>
            <button type="button" id="bulk-cancel-btn" class="text-xs text-gray-400 font-medium">Отменить</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="bulk-assign-btn" class="py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">В коллективку</button>
            <button type="button" id="bulk-create-collective-btn" class="py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Создать коллективку</button>
            <!-- Э5, REFACTOR-COLLECTIVES.md §3 -->
            <button type="button" id="bulk-status-btn" class="py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Сменить статус</button>
            <button type="button" id="bulk-delete-btn" class="py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Удалить</button>
          </div>
        </div>
      </div>

      ${CollectivePickerModal.html()}
      ${DeliveryStatusModal.html()}

      <!-- Массовое удаление — превью "чистые/с оплатами" (Э3, §3 п.7) -->
      <div id="bulk-delete-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Массовое удаление</h2>
            <button type="button" id="bulk-delete-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-3" id="bulk-delete-body"></div>
          <div class="p-4 border-t border-gray-100 shrink-0">
            <button type="button" id="bulk-delete-confirm-btn" class="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Удалить</button>
          </div>
        </div>
      </div>
    `;

    const PAGE_SIZE = 50;
    let allOrders = [];
    // Восстановлены из ordersListState (не всегда PAGE_SIZE/'desc') — см.
    // комментарий у ordersListState выше.
    let displayCount = ordersListState.displayCount;
    let sortDirection = ordersListState.sortDirection;
    let managerFilter = ordersListState.managerFilter; // Фаза 2 (roles/RBAC, M2.6) — admin-выбор, менеджеру не используется (жёсткий фильтр ниже)

    // Режим "Выбрать" (Э3) — module-scope этого render(), НЕ ordersListState
    // (см. её комментарий выше).
    let selectMode = false;
    const selectedIds = new Set();

    const listContainer = document.getElementById('orders-list');
    const emptyMessage = document.getElementById('empty-message');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const searchInput = document.getElementById('order-search');
    const sortField = document.getElementById('sort-field');
    const sortDirBtn = document.getElementById('sort-direction');
    const managerFilterSelect = document.getElementById('manager-filter-select');
    const mineOnlyBadge = document.getElementById('mine-only-badge');
    const refreshBtn = document.getElementById('refresh-orders');
    const countLabel = document.getElementById('orders-count');
    const selectModeBtn = document.getElementById('select-mode-btn');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const bulkSelectedCount = document.getElementById('bulk-selected-count');
    const bulkAssignBtn = document.getElementById('bulk-assign-btn');
    const bulkCreateBtn = document.getElementById('bulk-create-collective-btn');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    const bulkStatusBtn = document.getElementById('bulk-status-btn');

    document.getElementById('new-order-btn').addEventListener('click', () => navigateTo('orders/new'));
    document.getElementById('new-cart-btn').addEventListener('click', () => navigateTo('carts/new'));
    document.getElementById('collectives-btn').addEventListener('click', () => navigateTo('collectives'));
    document.getElementById('lots-btn').addEventListener('click', () => navigateTo('lots'));
    // Экран "Удалённые" (16.08.2026) — тот же паттерн входа, что "Коллективки":
    // отдельный экран, БЕЗ добавления пункта в нижнюю навигацию (см. известный
    // долг frontend-nav.md — не плодить копии <nav> без отдельного обсуждения).
    document.getElementById('deleted-orders-btn').addEventListener('click', () => navigateTo('orders/deleted'));

    // Подпись рядом с иконкой (20.08.2026, п.3 бэклога) — общая для
    // начального состояния и для клика ниже, чтобы текст/иконка не
    // разъезжались между собой.
    function renderSortDirButton() {
      const isDesc = sortDirection === 'desc';
      sortDirBtn.innerHTML = `
        <i data-lucide="${isDesc ? 'arrow-down-wide-narrow' : 'arrow-up-narrow-wide'}" class="w-4 h-4"></i>
        <span class="text-[11px] font-medium">${isDesc ? 'По убыванию' : 'По возрастанию'}</span>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.value = ordersListState.query;
    sortField.value = ordersListState.sortFieldValue;
    renderSortDirButton();

    // Фаза 2 (roles/RBAC, M2.6, 04.09.2026) — "мои заказы". Менеджер: жёсткий
    // фильтр по своему telegramId, без переключателя. Админ: дропдаун по
    // конкретному сотруднику, дефолт "Все", восстанавливается из ordersListState.
    if (window.CURRENT_ACCESS_ROLE === 'manager') {
      mineOnlyBadge.classList.remove('hidden');
    } else if (window.CURRENT_ACCESS_ROLE === 'admin') {
      callServer('getStaffList').then((staffList) => {
        managerFilterSelect.innerHTML = '<option value="">Все менеджеры</option>' +
          staffList.map(s => `<option value="${escapeHtmlClient(s.telegramId)}">${escapeHtmlClient(s.name || s.telegramId)}</option>`).join('');
        managerFilterSelect.value = managerFilter;
        managerFilterSelect.classList.remove('hidden');
      }).catch(() => {}); // необязательный фильтр — сбой не блокирует список
    }
    managerFilterSelect.addEventListener('change', () => { managerFilter = managerFilterSelect.value; render(); });

    loadOrders();

    async function loadOrders() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка заказов...</div>';
      try {
        allOrders = await callServer('getOrdersList');
        render();
        // Восстановление прокрутки — ПОСЛЕ первого реального render(), не
        // сразу после вызова loadOrders() (запрос асинхронный, к моменту
        // ответа сервера ранние rAF уже давно отработали бы вхолостую —
        // страница ещё не той высоты). Только когда есть что восстанавливать
        // (реальный повторный заход, не первый заход на экран за сессию).
        if (ordersListState.scrollY > 0) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.scrollTo(0, ordersListState.scrollY);
          }));
        }
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    refreshBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');

      try {
        allOrders = await callServer('refreshOrdersList');
        displayCount = PAGE_SIZE;
        render();
      } catch (error) {
        showSaveToast(false, 'Не удалось обновить список: ' + error.message);
      } finally {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      }
    });

    const handleSearch = debounce(() => { displayCount = PAGE_SIZE; render(); }, 250);
    searchInput.addEventListener('input', handleSearch);

    sortField.addEventListener('change', () => { displayCount = PAGE_SIZE; render(); });
    sortDirBtn.addEventListener('click', () => {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
      renderSortDirButton();
      render();
    });

    loadMoreBtn.addEventListener('click', () => { displayCount += PAGE_SIZE; render(); });

    // --- Режим "Выбрать" (Э3) ---

    function setSelectMode(on) {
      selectMode = on;
      if (!on) selectedIds.clear();
      selectModeBtn.classList.toggle('bg-indigo-50', on);
      bulkBar.classList.toggle('hidden', !on);
      render();
    }

    selectModeBtn.addEventListener('click', () => setSelectMode(!selectMode));
    document.getElementById('bulk-cancel-btn').addEventListener('click', () => setSelectMode(false));

    function updateBulkBar() {
      bulkSelectedCount.textContent = selectedIds.size;
      const disabled = selectedIds.size === 0;
      bulkAssignBtn.disabled = disabled;
      bulkCreateBtn.disabled = disabled;
      bulkDeleteBtn.disabled = disabled;
      bulkStatusBtn.disabled = disabled;
    }

    function toggleSelected(orderId) {
      if (selectedIds.has(orderId)) selectedIds.delete(orderId);
      else selectedIds.add(orderId);
      updateBulkBar();
    }

    function selectedOrders() {
      return allOrders.filter((o) => selectedIds.has(o.orderId));
    }

    // Снимок состояния в момент ухода с экрана (роутер шлёт abort на
    // signal перед монтированием следующего экрана, см. router.js) —
    // проще и надёжнее, чем разбрасывать запись в ordersListState по
    // каждому обработчику отдельно: одна точка на все пути ухода
    // (клик по карточке, "Назад", переход на другой пункт меню).
    signal.addEventListener('abort', () => {
      ordersListState.query = searchInput.value;
      ordersListState.sortFieldValue = sortField.value;
      ordersListState.sortDirection = sortDirection;
      ordersListState.displayCount = displayCount;
      ordersListState.scrollY = window.scrollY;
      ordersListState.managerFilter = managerFilter;
    });

    function render() {
      const query = searchInput.value.trim().toLowerCase();

      let filtered = allOrders;
      // Фаза 2 (roles/RBAC, M2.6) — "мои заказы". Менеджер: всегда жёстко
      // по своему telegramId (нет UI-переключателя). Админ: по выбору в
      // manager-filter-select, пусто = все.
      const effectiveManagerId = window.CURRENT_ACCESS_ROLE === 'manager' ? window.CURRENT_STAFF_TELEGRAM_ID : managerFilter;
      if (effectiveManagerId) {
        filtered = filtered.filter(o => o.managerId === effectiveManagerId);
      }
      if (query !== '') {
        filtered = filtered.filter(o => {
          const haystack = `${o.productDisplay} ${o.productOriginal} ${o.searchTags} ${o.statusOrder} ${o.statusDelivery} ${o.purchaseChannel} ${o.clientDisplay} ${o.orderId}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      const field = sortField.value;
      const sorted = filtered.slice().sort((a, b) => {
        let result;
        if (field === 'dateOrderSort') {
          result = a.dateOrderSort - b.dateOrderSort;
        } else {
          result = (a[field] || '').localeCompare(b[field] || '', 'ru');
        }
        return sortDirection === 'desc' ? -result : result;
      });

      countLabel.textContent = `Найдено: ${sorted.length}`;

      const toShow = sorted.slice(0, displayCount);
      listContainer.innerHTML = '';

      if (toShow.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        toShow.forEach(o => listContainer.appendChild(buildCard(o)));
      }

      loadMoreBtn.classList.toggle('hidden', displayCount >= sorted.length);
      updateBulkBar();
    }

    // Обе привязки коллективки (Э4, §3, 24.08.2026) — раньше карточка вообще
    // не показывала коллективку, только внутренне использовала o.collectiveId
    // для текста подтверждения массовых действий (см. JSDoc файла). Теперь
    // короткий значок на плечо, только когда заказ реально привязан.
    function collectiveLinksChips(links) {
      if (!links || links.length === 0) return '';
      return links.map((l) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">${escapeHtmlClient(l.stage)}: ${escapeHtmlClient(l.name || l.collectiveId)}</span>`).join('');
    }

    // Фича «Лот»/«Корзина» (delegated-spinning-rabbit.md, 02.09.2026) — чисто
    // визуальный бейдж (см. JSDoc collectivesService.getOrdersByCollectiveId
    // на бэкенде: НЕ влияет ни на что расчётное), клик уводит на карточку
    // лота, `data-lot-id` — чтобы отличить от клика по остальной карточке
    // (которая ведёт на редактирование заказа, см. buildCard ниже).
    function lotChip(lotId) {
      if (!lotId) return '';
      return `<span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 cursor-pointer" data-lot-id="${escapeHtmlClient(lotId)}">Лот #${escapeHtmlClient(lotId)}</span>`;
    }

    function buildCard(o) {
      const card = document.createElement('div');
      const isSelected = selectedIds.has(o.orderId);
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-100'}`;
      card.addEventListener('click', (e) => {
        const lotChipEl = e.target.closest('[data-lot-id]');
        if (lotChipEl) { e.stopPropagation(); navigateTo(`lots/${encodeURIComponent(lotChipEl.dataset.lotId)}`); return; }
        if (selectMode) { toggleSelected(o.orderId); render(); return; }
        navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`);
      });
      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${selectMode ? `
            <div class="shrink-0 pt-0.5">
              <input type="checkbox" class="order-select-checkbox w-5 h-5 rounded border-gray-300 text-indigo-600" ${isSelected ? 'checked' : ''}>
            </div>
          ` : ''}
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(o.productDisplay)}</div>
                ${o.productOriginal && o.productOriginal !== o.productDisplay ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(o.productOriginal)}</div>` : ''}
                <div class="text-[11px] text-gray-300 mt-0.5">№ ${escapeHtmlClient(o.orderId)}</div>
              </div>
              <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(o.dateOrderDisplay)}</div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${o.statusOrder ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">${escapeHtmlClient(o.statusOrder)}</span>` : ''}
              ${o.statusDelivery ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">${escapeHtmlClient(o.statusDelivery)}</span>` : ''}
              ${o.purchaseChannel ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">${escapeHtmlClient(o.purchaseChannel)}</span>` : ''}
              ${o.inCatalog
                ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">в каталоге</span>`
                : `<span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">не в каталоге</span>`}
              ${collectiveLinksChips(o.collectiveLinks)}
              ${lotChip(o.lotId)}
            </div>
            <div class="mt-2">${buildDeliveryLadder(o.deliveryLadder, o.statusDelivery, { compact: true })}</div>
            <div class="text-[13px] text-gray-500 mt-2">${escapeHtmlClient(o.clientDisplay || 'Клиент не привязан')}</div>
            ${o.remark ? `
            <div class="mt-2 pt-2 border-t border-gray-50">
              <div class="order-remark-text text-[12px] text-gray-500 line-clamp-2 whitespace-pre-wrap">${escapeHtmlClient(o.remark)}</div>
              <button type="button" class="order-remark-toggle text-[11px] text-indigo-600 font-medium mt-0.5">Показать полностью</button>
            </div>
            ` : ''}
          </div>
        </div>
      `;
      // Примечание в карточке (18.08.2026, репорт VASY — "LOT не даёт понять
      // из списка, что это за заказ") — по умолчанию обрезано (line-clamp-2),
      // разворачивается по клику на "Показать полностью". stopPropagation —
      // сама карточка кликабельна целиком (открывает редактирование), клик
      // по кнопке-раскрытию не должен туда попадать.
      const remarkToggle = card.querySelector('.order-remark-toggle');
      if (remarkToggle) {
        remarkToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const textEl = card.querySelector('.order-remark-text');
          const expanded = textEl.classList.toggle('line-clamp-2') === false;
          remarkToggle.textContent = expanded ? 'Свернуть' : 'Показать полностью';
        });
      }
      const checkbox = card.querySelector('.order-select-checkbox');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => { e.stopPropagation(); toggleSelected(o.orderId); render(); });
      }
      return card;
    }

    // --- "В коллективку" / "Создать коллективку из выбранных" (Э3, п.5 —
    // текст подтверждения группирует по исходной коллективке, decision (а)) ---

    /**
     * @param {Object[]} orders Выбранные заказы (с полем collectiveId)
     * @param {string|null} targetCollectiveId null — целевая коллективка ещё не создана ("Создать из выбранных")
     * @param {Map<string,Object>} collectivesById Свежий getCollectivesList, индексированный по collectiveId
     * @returns {string|null} null — нечего делать (все выбранные уже в целевой)
     */
    function buildAssignConfirmText(orders, targetCollectiveId, collectivesById) {
      const bySource = new Map(); // collectiveId -> orders[]
      let brandNewCount = 0;

      for (const o of orders) {
        if (!o.collectiveId) { brandNewCount++; continue; }
        if (o.collectiveId === targetCollectiveId) continue; // уже там — нечего переносить
        const list = bySource.get(o.collectiveId) || [];
        list.push(o);
        bySource.set(o.collectiveId, list);
      }

      const parts = [];
      if (brandNewCount > 0) parts.push(`${brandNewCount} новых`);
      for (const [srcId, list] of bySource) {
        const src = collectivesById.get(srcId);
        const name = src ? (src.name || `ID ${srcId}`) : `ID ${srcId}`;
        const remaining = src ? Math.max(0, src.orderCount - list.length) : '?';
        parts.push(`${list.length} переедут из «${name}» (её сверка будет пересчитана на оставшиеся ${remaining})`);
      }
      if (parts.length === 0) return null;
      return `${parts.join(', ')}.`;
    }

    async function doAssign(orderIds, collectiveId) {
      const result = await callServer('assignOrdersToCollective', orderIds, collectiveId);
      const okCount = result.moved.length + result.added.length;
      if (result.failed.length > 0) {
        showSaveToast(false, `Готово частично: ${okCount} из ${orderIds.length}, ${result.failed.length} не удалось.`);
      } else {
        showSaveToast(true, `Готово: ${okCount} заказ(ов) в коллективке.`);
      }
      setSelectMode(false);
      allOrders = await callServer('getOrdersList');
      render();
    }

    const collectivePicker = CollectivePickerModal.init({
      onPicked: async (collective) => {
        const orders = selectedOrders();
        if (orders.length === 0) return;
        const collectivesById = new Map((await callServer('getCollectivesList')).map((c) => [c.collectiveId, c]));
        const text = buildAssignConfirmText(orders, collective.collectiveId, collectivesById);
        if (text === null) {
          showSaveToast(false, `Все выбранные заказы уже в «${collective.name || collective.collectiveId}».`);
          return;
        }
        const confirmed = await showConfirmModal(`${text}\n\nПродолжить?`, { confirmLabel: 'В коллективку' });
        if (!confirmed) return;
        try {
          await doAssign([...selectedIds], collective.collectiveId);
        } catch (error) {
          showSaveToast(false, 'Не удалось выполнить: ' + error.message);
        }
      }
    });

    bulkAssignBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      collectivePicker.open();
    });

    bulkCreateBtn.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      const name = await showPromptModal('Название новой коллективки');
      if (!name || !name.trim()) return;

      const orders = selectedOrders();
      const collectivesById = new Map((await callServer('getCollectivesList')).map((c) => [c.collectiveId, c]));
      const text = buildAssignConfirmText(orders, null, collectivesById);
      const confirmed = await showConfirmModal(
        `Создать «${name.trim()}» из ${orders.length} заказ(ов): ${text || 'все новые.'}\n\nПродолжить?`,
        { confirmLabel: 'Создать' }
      );
      if (!confirmed) return;

      try {
        const created = await callServer('createCollective', { name: name.trim() });
        await doAssign([...selectedIds], created.collectiveId);
      } catch (error) {
        showSaveToast(false, 'Не удалось создать коллективку: ' + error.message);
      }
    });

    // --- "Удалить" (безопасный вариант, Э3 §3 п.7) ---

    const bulkDeleteModal = document.getElementById('bulk-delete-modal');
    const bulkDeleteBody = document.getElementById('bulk-delete-body');
    const bulkDeleteConfirmBtn = document.getElementById('bulk-delete-confirm-btn');
    let bulkDeleteCleanIds = [];

    function closeBulkDeleteModal() {
      bulkDeleteModal.classList.add('hidden');
      bulkDeleteModal.classList.remove('flex');
    }
    document.getElementById('bulk-delete-close').addEventListener('click', closeBulkDeleteModal);
    bulkDeleteModal.addEventListener('click', (e) => { if (e.target === bulkDeleteModal) closeBulkDeleteModal(); });

    bulkDeleteBtn.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      let preview;
      try {
        preview = await callServer('getBulkOrderDeletionPreview', [...selectedIds]);
      } catch (error) {
        showSaveToast(false, 'Не удалось подготовить удаление: ' + error.message);
        return;
      }

      bulkDeleteCleanIds = preview.clean.map((o) => o.orderId);
      const parts = [];
      if (preview.clean.length > 0) {
        parts.push(`<div><div class="text-sm text-gray-700 mb-1">Будут удалены сразу (без активных платежей): <b>${preview.clean.length}</b></div>
          <div class="text-[12px] text-gray-400">${preview.clean.map((o) => escapeHtmlClient(o.productDisplay)).join(', ')}</div></div>`);
      }
      if (preview.withPayments.length > 0) {
        parts.push(`<div>
          <div class="text-sm text-amber-700 mb-1">С активными платежами — удалите по одному:</div>
          <div class="space-y-1">
            ${preview.withPayments.map((o) => `
              <div class="flex items-center justify-between gap-2 p-2 border border-amber-100 bg-amber-50 rounded-lg">
                <span class="text-[13px] text-gray-700 truncate">${escapeHtmlClient(o.productDisplay)} · № ${escapeHtmlClient(o.orderId)}${o.error ? '' : ` · платежей: ${o.paymentsCount}`}</span>
                <button type="button" class="bulk-delete-open-order-btn shrink-0 text-indigo-600 text-[12px] font-medium" data-order-id="${escapeHtmlClient(o.orderId)}">Открыть</button>
              </div>
            `).join('')}
          </div>
        </div>`);
      }
      bulkDeleteBody.innerHTML = parts.join('') || '<div class="text-sm text-gray-400">Нечего удалять.</div>';
      bulkDeleteBody.querySelectorAll('.bulk-delete-open-order-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeBulkDeleteModal();
          navigateTo(`orders/${encodeURIComponent(btn.dataset.orderId)}/edit`);
        });
      });

      bulkDeleteConfirmBtn.disabled = bulkDeleteCleanIds.length === 0;
      bulkDeleteConfirmBtn.textContent = bulkDeleteCleanIds.length > 0 ? `Удалить ${bulkDeleteCleanIds.length}` : 'Удалить';
      bulkDeleteModal.classList.remove('hidden');
      bulkDeleteModal.classList.add('flex');
    });

    bulkDeleteConfirmBtn.addEventListener('click', async () => {
      if (bulkDeleteCleanIds.length === 0 || bulkDeleteConfirmBtn.disabled) return;
      const confirmed = await showConfirmModal(`Удалить ${bulkDeleteCleanIds.length} заказ(ов)? Действие необратимо без явного восстановления.`, { confirmLabel: 'Удалить', danger: true });
      if (!confirmed) return;

      bulkDeleteConfirmBtn.disabled = true;
      try {
        const result = await callServer('bulkDeleteOrders', bulkDeleteCleanIds);
        if (result.failed.length > 0) {
          showSaveToast(false, `Удалено ${result.deleted.length} из ${bulkDeleteCleanIds.length}, ${result.failed.length} не удалось (см. по одному).`);
        } else {
          showSaveToast(true, `Удалено: ${result.deleted.length}.`);
        }
        closeBulkDeleteModal();
        setSelectMode(false);
        allOrders = await callServer('getOrdersList');
        render();
      } catch (error) {
        showSaveToast(false, 'Не удалось удалить: ' + error.message);
      } finally {
        bulkDeleteConfirmBtn.disabled = false;
      }
    });

    // --- "Сменить статус доставки" (Э5, REFACTOR-COLLECTIVES.md §3 "Э5") ---

    const deliveryStatusModal = DeliveryStatusModal.init({
      getStatusDictionary: async () => (await callServer('getDictionaries')).statusDelivery,
      onApplied: async ({ closedCount, forcedCount, failedCount }) => {
        const total = closedCount + forcedCount;
        if (failedCount > 0) {
          showSaveToast(false, `Статус изменён у ${total}, не удалось у ${failedCount} (см. лог).`);
        } else if (total > 0) {
          showSaveToast(true, `Статус изменён у ${total} заказ(ов).`);
        }
        setSelectMode(false);
        allOrders = await callServer('getOrdersList');
        render();
      }
    });

    bulkStatusBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      deliveryStatusModal.open([...selectedIds]);
    });
  }
};
