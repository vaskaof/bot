'use strict';

/**
 * Экран "Заказы" (админ) — перенесён из admin/orders.html (SPA админки,
 * 02.08.2026). Локальная теневая копия escapeHtmlClient (существовала в
 * оригинале, дублировала общую из common.js без экранирования кавычек) —
 * убрана, используется общая.
 */
window.Screens = window.Screens || {};

// Состояние списка (18.08.2026, репорт VASY — "после редактирования
// заказа приходится заново писать позицию в строке поиска и проматывать
// всё") — вне render(), тот же приём, что NEW_ORDER_DRAFT_KEY в
// order-new.js: переживает пересоздание DOM этого экрана при возврате из
// редактирования В РАМКАХ той же SPA-сессии (не localStorage — полная
// перезагрузка страницы это состояние сбросит, тут это не требовалось,
// только "туда-обратно" внутри одного захода в приложение).
const ordersListState = { query: '', sortFieldValue: 'dateOrderSort', sortDirection: 'desc', displayCount: 50, scrollY: 0 };

window.Screens.orders = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Заказы</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="new-order-btn" title="Новый заказ" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
      <button id="collectives-btn" title="Коллективки" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="package-2" class="w-6 h-6"></i>
      </button>
      <button id="deleted-orders-btn" title="Удалённые" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="trash-2" class="w-5 h-5"></i>
      </button>
      <button id="refresh-orders" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('new-order-btn').addEventListener('click', () => navigateTo('orders/new'));
    document.getElementById('collectives-btn').addEventListener('click', () => navigateTo('collectives'));
    // Экран "Удалённые" (16.08.2026) — тот же паттерн входа, что "Коллективки":
    // отдельный экран, БЕЗ добавления пункта в нижнюю навигацию (см. известный
    // долг frontend-nav.md — не плодить копии <nav> без отдельного обсуждения).
    document.getElementById('deleted-orders-btn').addEventListener('click', () => navigateTo('orders/deleted'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
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
          <button id="sort-direction" title="Сменить направление сортировки" class="p-1.5 text-indigo-600">
            <i data-lucide="arrow-down-wide-narrow" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="orders-count"></div>

        <div id="orders-list"></div>

        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Заказы не найдены</div>

        <button id="load-more-btn" class="hidden w-full bg-white border border-gray-100 rounded-2xl py-3 text-sm font-medium text-indigo-600 shadow-sm">
          Показать ещё
        </button>
      </main>
    `;

    const PAGE_SIZE = 50;
    let allOrders = [];
    // Восстановлены из ordersListState (не всегда PAGE_SIZE/'desc') — см.
    // комментарий у ordersListState выше.
    let displayCount = ordersListState.displayCount;
    let sortDirection = ordersListState.sortDirection;

    const listContainer = document.getElementById('orders-list');
    const emptyMessage = document.getElementById('empty-message');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const searchInput = document.getElementById('order-search');
    const sortField = document.getElementById('sort-field');
    const sortDirBtn = document.getElementById('sort-direction');
    const refreshBtn = document.getElementById('refresh-orders');
    const countLabel = document.getElementById('orders-count');

    searchInput.value = ordersListState.query;
    sortField.value = ordersListState.sortFieldValue;
    if (sortDirection === 'asc') {
      sortDirBtn.innerHTML = '<i data-lucide="arrow-up-narrow-wide" class="w-4 h-4"></i>';
    }

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
      sortDirBtn.innerHTML = `<i data-lucide="${sortDirection === 'desc' ? 'arrow-down-wide-narrow' : 'arrow-up-narrow-wide'}" class="w-4 h-4"></i>`;
      if (window.lucide) window.lucide.createIcons();
      render();
    });

    loadMoreBtn.addEventListener('click', () => { displayCount += PAGE_SIZE; render(); });

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
    });

    function render() {
      const query = searchInput.value.trim().toLowerCase();

      let filtered = allOrders;
      if (query !== '') {
        filtered = allOrders.filter(o => {
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
    }

    function buildCard(o) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => {
        navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`);
      });
      card.innerHTML = `
        <div class="flex items-start gap-3">
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
      return card;
    }
  }
};
