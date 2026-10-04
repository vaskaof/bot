'use strict';

/**
 * Экран "Напоминания" — переписан целиком (31.08.2026, задача «Напоминания
 * 2.0», Р4) вместе с backend-ядром (`reminderService.js`). Раньше — список
 * из до 5 отдельных карточек НА ЗАКАЗ (по одной на "условие"), разнесённых
 * по списку без учёта реального денежного приоритета; теперь — 1 заказ = 1
 * карточка со всеми незакрытыми пунктами внутри (`items`), сгруппированная
 * по severity ("Срочно"/"Ждёт денег"/"Скоро"), с табами "Клиентские"/
 * "Личные" (личные заказы менеджера не показывают денежные пункты — у них
 * физически нет плательщика, F-33/Н-5).
 */
window.Screens = window.Screens || {};

const SEVERITY_LABELS = { critical: 'Срочно', warning: 'Ждёт денег', info: 'Скоро' };
const SEVERITY_ORDER = ['critical', 'warning', 'info'];
const SEVERITY_DOT = { critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-sky-500' };
const CONFIG_SNOOZE_DAYS_LABEL = '3 дня';
// Позиции лестницы доставки — та же константа, что `orders/deliveryLadder.js`
// на бэкенде (12 ступеней, стабильно с 12.08.2026, §H client_display_overhaul).
const DELIVERY_LADDER_TOTAL = 12;

// Пункты, для которых карточка предлагает инлайн-заполнение прямо на месте
// (без ухода в форму заказа) — три поля, которые реально чаще всего пусты
// (подтверждено VASY). Каждый ключ — `item.stage` (русское имя стадии,
// см. `paymentsService.STAGE_*` на бэкенде) → какое поле `updateOrder`
// заполнить и как его подписать. "СДЭК"/"Доставка_РФ" пишут ОДНИМ числом в
// один из трёх компонентов, которые сервер суммирует
// (`computeDeliveryKzRfTotal`) — карточка сама показывает стадию ОДНИМ
// числом (`item.hint`), инлайн-правка того же уровня детализации: если
// нужна точная разбивка по трём компонентам — для этого есть полная форма
// заказа, кнопка "Открыть заказ" никуда не делась.
const INLINE_FILL_FIELDS = {
  'Вес': { serverField: 'weightSum', label: 'Цена веса, ₽' },
  'СДЭК': { serverField: 'sdekSum', label: 'Стоимость СДЭК, ₽' },
  'СДЭК_Индивидуальная': { serverField: 'sdekSum', label: 'Стоимость СДЭК, ₽' },
  'Доставка_РФ': { serverField: 'shippingRfSum', label: 'Стоимость доставки по РФ, ₽' }
};

// Волна 3 «Задачи» (29.09.2026) — колонки доски = укрупнённые стадии
// (`server/src/orders/orderStage.js`, общего JS-модуля нет — копия ключей
// и подписей). Пустые колонки не показываются.
// color — цвет верхней полоски колонки на широком экране (05.10.2026, как в
// демо кабинета).
const TASK_STAGES = [
  { key: 'e2', label: 'Просчёт', color: '#0ea5e9' },
  { key: 'e3', label: 'Выкуп', color: '#6366f1' },
  { key: 'e4', label: 'Логистика до КЗ', color: '#06b6d4' },
  { key: 'e5', label: 'Консолидация в КЗ', color: '#f97316' },
  { key: 'e6', label: 'Доставка в РФ', color: '#8b5cf6' },
  { key: 'e7', label: 'Выдача', color: '#10b981' },
  { key: '', label: 'Без статуса', color: '#9ca3af' }
];

// Состояние доски переживает уход в заказ и «Назад» (30.09.2026, репорт
// VASY: «Назад» из задачи уводил в начало доски, место приходилось искать
// заново) — вне render(), тот же приём, что ordersListState в orders.js.
// Живёт в рамках SPA-сессии, полную перезагрузку не переживает.
const tasksBoardState = {
  activeTab: 'client', activeStageKey: null, expandedGroups: new Set(), openQuiet: new Set(),
  clientFilter: '', channelFilter: '', managerFilter: '', scrollY: 0, scrollX: 0, openedOrderId: null
};

window.Screens.reminders = {
  render(root, _dictionaries, _params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Задачи</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-reminders" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    // Доска: телефон — колонки лентой со свайпом (по одной на экран, лента
    // идёт за пальцем и доводится до колонки), вкладки стадий сверху; широкий
    // экран (md+) — все колонки рядом, лента тянется мышью и ползунком снизу,
    // колонки прокручиваются сами (05.10.2026, отзыв VASY). Стили — app.html.
    root.innerHTML = `
      <main class="pt-16 pb-6 md:pb-0 px-4 max-w-2xl md:max-w-none mx-auto">
        <!-- Верх доски сжат (05.10.2026, VASY: «под задачи 60% экрана — мало»):
             вкладки, фильтры и «Срочно» — одной строкой; на телефоне фильтры
             под кнопкой, подсказка про индивидуальную отправку — одной строкой. -->
        <div>
          <details id="recommendations-block" class="hidden mb-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5"></details>

          <div class="flex flex-wrap items-center gap-2 mb-2">
            <div class="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-1 md:flex-none md:w-80" id="reminders-tabs">
              <button type="button" data-tab="client" class="reminders-tab flex-1 py-1 rounded-lg text-sm font-medium transition-colors">Клиентские</button>
              <button type="button" data-tab="own" class="reminders-tab flex-1 py-1 rounded-lg text-sm font-medium transition-colors">Личные</button>
            </div>
            <button type="button" id="tasks-filters-btn" class="md:hidden relative shrink-0 rounded-xl bg-white border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 inline-flex items-center gap-1" title="Фильтры">
              <i data-lucide="sliders-horizontal" class="w-4 h-4"></i><span id="tasks-filters-count"></span>
            </button>
            <div id="tasks-filters" class="hidden md:flex w-full md:w-auto md:flex-1 flex-wrap items-center gap-2 order-last md:order-none">
              <input type="text" id="reminders-client-filter" placeholder="Фильтр по клиенту..." class="flex-1 min-w-[150px] text-sm bg-white border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-400">
              <select id="reminders-channel-filter" class="text-sm bg-white border border-gray-200 rounded-xl px-2 py-1.5 outline-none focus:border-indigo-400">
                <option value="">Все каналы</option>
              </select>
              <!-- §1.1 (19.09.2026) — сервер УЖЕ ограничил видимый набор ролью,
                   дропдаун только сужает его на экране для admin/менеджера с
                   can_view_all_clients. -->
              <select id="reminders-manager-filter" class="hidden text-sm bg-white border border-gray-200 rounded-xl px-2 py-1.5 outline-none focus:border-indigo-400">
                <option value="">Все менеджеры</option>
              </select>
            </div>
            <div class="text-[11px] text-gray-400 shrink-0" id="reminders-count"></div>
          </div>
          <div id="stage-tabs" class="flex gap-1.5 overflow-x-auto pb-1.5 mb-1.5 md:hidden" style="scrollbar-width: none"></div>
        </div>
        <div id="reminders-list" class="tasks-board"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Задач нет 🎉</div>
      </main>
      ${DeliveryStatusModal.html()}
    `;

    const listContainer = document.getElementById('reminders-list');
    const emptyMessage = document.getElementById('empty-message');
    const countLabel = document.getElementById('reminders-count');
    const refreshBtn = document.getElementById('refresh-reminders');
    const recommendationsBlock = document.getElementById('recommendations-block');
    const clientFilterInput = document.getElementById('reminders-client-filter');
    const channelFilterSelect = document.getElementById('reminders-channel-filter');
    const managerFilterSelect = document.getElementById('reminders-manager-filter');
    const tabsContainer = document.getElementById('reminders-tabs');
    const stageTabsContainer = document.getElementById('stage-tabs');

    let allCards = [];
    let stageTotals = {};
    let activeTab = tasksBoardState.activeTab;
    let activeStageKey = tasksBoardState.activeStageKey; // вкладка стадии на телефоне; null — первая с задачами
    const expandedGroups = tasksBoardState.expandedGroups; // id коллективок, раскрытых на доске
    let restorePending = true; // вернуть место на доске после первой загрузки этого захода

    clientFilterInput.value = tasksBoardState.clientFilter;
    if (signal) {
      signal.addEventListener('abort', () => {
        tasksBoardState.activeTab = activeTab;
        tasksBoardState.activeStageKey = activeStageKey;
        tasksBoardState.clientFilter = clientFilterInput.value;
        tasksBoardState.channelFilter = channelFilterSelect.value;
        tasksBoardState.managerFilter = managerFilterSelect.value;
        tasksBoardState.scrollY = window.scrollY;
        tasksBoardState.scrollX = listContainer.scrollLeft;
      });
    }

    // «Перевести» по отставшим от коллективки — та же модалка массовой смены
    // статуса, что в «Заказах»/коллективке (гейт долга и данных внутри неё).
    const deliveryStatusModal = DeliveryStatusModal.init({
      getStatusDictionary: async () => (await callServer('getDictionaries')).statusDelivery,
      onApplied: async ({ closedCount, forcedCount, failedCount }) => {
        const total = closedCount + forcedCount;
        if (failedCount > 0) {
          showSaveToast(false, `Статус изменён у ${total}, не удалось у ${failedCount} (см. лог).`);
        } else if (total > 0) {
          showSaveToast(true, `Статус изменён у ${total} заказ(ов).`);
        }
        await loadReminders();
      }
    });

    // Решение VASY 29.09.2026: догоняющий перевод — БЕЗ уведомлений клиентам
    // (для августовских заказов «у посредника в РФ» пришло бы с опозданием на
    // месяц). Галочку менеджер может включить сам.
    function openCatchUp(orderIds, targetStatus, collectiveName) {
      deliveryStatusModal.open(orderIds, {
        presetStatus: targetStatus,
        presetNotify: false,
        autoNote: `Догнать коллективку «${collectiveName}»: ${orderIds.length} заказ(ов) → «${targetStatus}». Клиентам по умолчанию не сообщаем.`
      });
    }

    // §1.1 — тот же canSeeAll, что orders.js/clients.js.
    const canSeeAll = window.CURRENT_ACCESS_ROLE === 'admin' || window.CURRENT_CAN_VIEW_ALL_CLIENTS === true;
    if (canSeeAll) {
      callServer('getStaffFilterOptions').then((staffList) => {
        managerFilterSelect.innerHTML = '<option value="">Все менеджеры</option>' +
          staffList.map(s => `<option value="${escapeHtmlClient(s.telegramId)}">${escapeHtmlClient(s.name || s.telegramId)}</option>`).join('');
        managerFilterSelect.classList.remove('hidden');
        if (tasksBoardState.managerFilter && staffList.some(s => s.telegramId === tasksBoardState.managerFilter)) {
          managerFilterSelect.value = tasksBoardState.managerFilter;
          render();
        }
      }).catch(() => { /* фильтр необязателен */ });
    }

    function setActiveTab(tab) {
      activeTab = tab;
      tabsContainer.querySelectorAll('.reminders-tab').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('bg-white', isActive);
        btn.classList.toggle('shadow-sm', isActive);
        btn.classList.toggle('text-indigo-600', isActive);
        btn.classList.toggle('text-gray-500', !isActive);
      });
      render();
    }
    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) setActiveTab(btn.dataset.tab);
    });
    stageTabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-stage-key]');
      if (!btn) return;
      activeStageKey = btn.dataset.stageKey;
      paintStageTabs();
      jumpToStage(activeStageKey, true);
    });
    setActiveTab(activeTab);

    // Фильтры на телефоне — под кнопкой; на ней число включённых.
    const filtersBtn = document.getElementById('tasks-filters-btn');
    const filtersBox = document.getElementById('tasks-filters');
    function paintFiltersCount() {
      const n = [clientFilterInput.value.trim(), channelFilterSelect.value, managerFilterSelect.value].filter(Boolean).length;
      document.getElementById('tasks-filters-count').textContent = n ? String(n) : '';
      filtersBtn.classList.toggle('border-indigo-400', n > 0);
      filtersBtn.classList.toggle('text-indigo-600', n > 0);
    }
    filtersBtn.addEventListener('click', () => {
      filtersBox.classList.toggle('hidden');
      filtersBox.classList.toggle('flex');
      fitBoard();
    });
    if (clientFilterInput.value.trim()) { filtersBox.classList.remove('hidden'); filtersBox.classList.add('flex'); }
    clientFilterInput.addEventListener('input', () => { paintFiltersCount(); render(); });
    channelFilterSelect.addEventListener('change', () => { paintFiltersCount(); render(); });
    managerFilterSelect.addEventListener('change', () => { paintFiltersCount(); render(); });
    paintFiltersCount();

    loadReminders();
    loadRecommendations();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await Promise.all([loadReminders(), loadRecommendations()]);
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function loadReminders() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const board = await callServer('getTasksBoard');
        allCards = board.cards;
        stageTotals = board.stageTotals || {};
        populateChannelFilter();
        render();
        if (restorePending) {
          restorePending = false;
          restoreBoardPosition();
        }
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    // Вернуть место: к карточке, из которой открывали заказ (она по центру
    // и подсвечена), иначе — на прежнюю прокрутку. Карточка могла исчезнуть
    // (задача закрыта) — тогда тоже прежняя прокрутка.
    function restoreBoardPosition() {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const id = tasksBoardState.openedOrderId;
        tasksBoardState.openedOrderId = null;
        const cardEl = id ? [...listContainer.querySelectorAll('[data-order-card]')].find(el => el.dataset.orderCard === id && el.offsetParent !== null) : null;
        if (cardEl) {
          cardEl.scrollIntoView({ block: 'center', inline: 'center' });
          cardEl.classList.add('ring-2', 'ring-indigo-300');
          setTimeout(() => cardEl.classList.remove('ring-2', 'ring-indigo-300'), 1800);
        } else {
          listContainer.scrollLeft = tasksBoardState.scrollX;
          window.scrollTo(0, tasksBoardState.scrollY);
        }
      }));
    }

    // Порядок, в котором карточки видны на доске (колонки слева направо,
    // внутри — группы коллективок, потом справочные) — очередь для
    // «Следующая задача →» в карточке заказа.
    function boardQueue() {
      const cards = filteredCards();
      const ids = [];
      for (const stage of TASK_STAGES) {
        const stageCards = cards.filter(c => stageKeyOf(c) === stage.key);
        for (const entry of groupByCollective(stageCards.filter(c => !c.quiet))) entry.cards.forEach(c => ids.push(c.orderId));
        stageCards.filter(c => c.quiet).forEach(c => ids.push(c.orderId));
      }
      return ids;
    }

    function openOrderFromBoard(orderId) {
      tasksBoardState.openedOrderId = orderId;
      TasksQueue.save(boardQueue(), orderId);
      navigateTo(`orders/${encodeURIComponent(orderId)}/edit`);
    }

    function populateChannelFilter() {
      const current = channelFilterSelect.value || tasksBoardState.channelFilter;
      const channels = Array.from(new Set(allCards.map(c => c.purchaseChannel).filter(Boolean))).sort();
      channelFilterSelect.innerHTML = '<option value="">Все каналы</option>' +
        channels.map(ch => `<option value="${escapeHtmlClient(ch)}">${escapeHtmlClient(ch)}</option>`).join('');
      if (channels.includes(current)) channelFilterSelect.value = current;
      tasksBoardState.channelFilter = '';
    }

    async function loadRecommendations() {
      try {
        const recs = await callServer('getShippingRecommendations');
        if (recs.length === 0) {
          recommendationsBlock.classList.add('hidden');
          return;
        }
        recommendationsBlock.innerHTML = `
          <summary class="text-[12px] font-medium text-amber-800 cursor-pointer select-none">💡 Кандидаты на индивидуальную отправку: ${recs.length}</summary>
          <div class="pt-1 pb-0.5">
            ${recs.map(r => `<div class="text-xs text-amber-700 py-0.5">${escapeHtmlClient(r.clientDisplay)} — ${r.count} посылок к посреднику КЗ</div>`).join('')}
          </div>
        `;
        recommendationsBlock.classList.remove('hidden');
      } catch (error) {
        recommendationsBlock.classList.add('hidden');
      }
    }

    function filteredCards() {
      const clientQuery = clientFilterInput.value.trim().toLowerCase();
      const channel = channelFilterSelect.value;
      const manager = managerFilterSelect.value;
      return allCards.filter(c => {
        if (activeTab === 'client' && c.isOwnPurchase) return false;
        if (activeTab === 'own' && !c.isOwnPurchase) return false;
        if (clientQuery && !c.clientDisplay.toLowerCase().includes(clientQuery)) return false;
        if (channel && c.purchaseChannel !== channel) return false;
        if (manager && c.managerId !== manager) return false;
        return true;
      });
    }

    function getAgeColorClass(sinceMs) {
      if (!sinceMs) return 'border-gray-200';
      const daysOld = (Date.now() - sinceMs) / (1000 * 60 * 60 * 24);
      if (daysOld >= 3) return 'border-red-300 bg-red-50';
      if (daysOld >= 1) return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    }

    function stageKeyOf(card) {
      return card.stage ? card.stage.key : '';
    }

    function render() {
      const cards = filteredCards();
      const clientCount = allCards.filter(c => !c.isOwnPurchase && !c.quiet).length;
      const ownCount = allCards.filter(c => c.isOwnPurchase && !c.quiet).length;
      tabsContainer.querySelector('[data-tab="client"]').textContent = `Клиентские (${clientCount})`;
      tabsContainer.querySelector('[data-tab="own"]').textContent = `Личные (${ownCount})`;

      const criticalCount = allCards.filter(c => !c.isOwnPurchase && c.severity === 'critical').length;
      countLabel.textContent = `Срочно: ${criticalCount}`;

      listContainer.innerHTML = '';
      stageTabsContainer.innerHTML = '';

      const columns = TASK_STAGES
        .map(stage => {
          const stageCards = cards.filter(c => stageKeyOf(c) === stage.key);
          return { stage, active: stageCards.filter(c => !c.quiet), quiet: stageCards.filter(c => c.quiet) };
        })
        .filter(col => col.active.length > 0 || col.quiet.length > 0);

      if (columns.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      if (!columns.some(col => col.stage.key === activeStageKey)) {
        const firstWithTasks = columns.find(col => col.active.length > 0) || columns[0];
        activeStageKey = firstWithTasks.stage.key;
      }

      for (const col of columns) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.dataset.stageKey = col.stage.key;
        tab.textContent = `${col.stage.label} · ${col.active.length}`;
        stageTabsContainer.appendChild(tab);

        listContainer.appendChild(buildColumn(col));
      }
      paintStageTabs();
      // Телефон: лента сразу на активной колонке (без анимации — это не жест).
      if (!isWide()) jumpToStage(activeStageKey, false);
      fitBoard();
    }

    function isWide() { return window.innerWidth >= 768; }

    function paintStageTabs() {
      stageTabsContainer.querySelectorAll('[data-stage-key]').forEach((tab) => {
        const isActive = tab.dataset.stageKey === activeStageKey;
        tab.className = `shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`;
      });
    }

    function columnEls() {
      return [...listContainer.querySelectorAll(':scope > [data-stage-column]')];
    }

    function jumpToStage(key, smooth) {
      const col = columnEls().find((el) => el.dataset.stageColumn === key);
      if (!col) return;
      listContainer.scrollTo({ left: col.offsetLeft - listContainer.firstElementChild.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
    }

    // Широкий экран: доска — на всю оставшуюся высоту окна, колонки
    // прокручиваются внутри, ползунок ленты всегда виден внизу.
    function fitBoard() {
      if (!isWide()) { listContainer.style.height = ''; return; }
      const top = listContainer.getBoundingClientRect().top + window.scrollY;
      listContainer.style.height = Math.max(360, window.innerHeight - top - 6) + 'px';
    }
    window.addEventListener('resize', () => { fitBoard(); if (!isWide()) jumpToStage(activeStageKey, false); }, signal ? { signal } : undefined);

    // Телефон: какая колонка сейчас в ленте — та и активная вкладка. Если
    // новая колонка короче места, где стоит страница, — подняться к её началу.
    let syncFrame = 0;
    listContainer.addEventListener('scroll', () => {
      if (isWide()) return;
      cancelAnimationFrame(syncFrame);
      syncFrame = requestAnimationFrame(() => {
        const cols = columnEls();
        if (!cols.length) return;
        const idx = Math.max(0, Math.min(cols.length - 1, Math.round(listContainer.scrollLeft / listContainer.clientWidth)));
        const key = cols[idx].dataset.stageColumn;
        if (key === activeStageKey) return;
        activeStageKey = key;
        paintStageTabs();
        const tab = stageTabsContainer.querySelector(`[data-stage-key="${key}"]`);
        if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        const colRect = cols[idx].getBoundingClientRect();
        if (colRect.bottom < 160) window.scrollTo({ top: Math.max(0, listContainer.getBoundingClientRect().top + window.scrollY - 120), behavior: 'smooth' });
      });
    }, { passive: true });

    // Широкий экран, мышь: ленту можно тянуть за пустое место (с инерцией),
    // колесо над заголовками/промежутками листает ленту вбок.
    let pan = null;
    let inertiaFrame = 0;
    let suppressBoardClick = false;
    listContainer.addEventListener('pointerdown', (e) => {
      if (!isWide() || e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest('button, a, input, select, textarea, summary, label, [data-open]')) return;
      cancelAnimationFrame(inertiaFrame);
      pan = { startX: e.clientX, left: listContainer.scrollLeft, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!pan) return;
      const dx = e.clientX - pan.startX;
      if (!pan.moved && Math.abs(dx) < 4) return;
      if (!pan.moved) { pan.moved = true; listContainer.classList.add('is-panning'); }
      const now = performance.now();
      pan.v = (e.clientX - pan.lastX) / Math.max(1, now - pan.lastT);
      pan.lastX = e.clientX; pan.lastT = now;
      listContainer.scrollLeft = pan.left - dx;
      e.preventDefault();
    }, signal ? { signal } : undefined);
    window.addEventListener('pointerup', () => {
      if (!pan) return;
      const { moved } = pan;
      // Отпустили после паузы — без инерции.
      let v = performance.now() - pan.lastT > 80 ? 0 : pan.v * 16; // px за кадр
      pan = null;
      listContainer.classList.remove('is-panning');
      if (!moved) return;
      suppressBoardClick = true;
      setTimeout(() => { suppressBoardClick = false; }, 0);
      const step = () => {
        if (Math.abs(v) < 0.5) return;
        listContainer.scrollLeft -= v;
        v *= 0.92;
        inertiaFrame = requestAnimationFrame(step);
      };
      inertiaFrame = requestAnimationFrame(step);
    }, signal ? { signal } : undefined);
    listContainer.addEventListener('click', (e) => {
      if (suppressBoardClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    listContainer.addEventListener('wheel', (e) => {
      if (!isWide() || e.target.closest('.board-col-body')) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (listContainer.scrollWidth <= listContainer.clientWidth) return;
      e.preventDefault();
      listContainer.scrollBy({ left: e.deltaY, behavior: 'smooth' });
    }, { passive: false });

    function buildColumn(col) {
      const el = document.createElement('section');
      el.dataset.stageColumn = col.stage.key;
      el.className = 'board-col';
      el.style.setProperty('--col-color', col.stage.color);
      const total = stageTotals[col.stage.key];
      const n = col.active.length;
      el.innerHTML = `
        <div class="board-col-head hidden md:flex items-center gap-2 px-1 mb-2">
          <span class="text-xs md:text-[15px] font-semibold md:font-bold text-gray-600 md:text-gray-900 uppercase md:normal-case tracking-wide md:tracking-tight">${escapeHtmlClient(col.stage.label)}<span class="md:hidden"> · ${n}</span></span>
          <span class="hidden md:inline-block min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-bold leading-[22px] text-center ${n ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}">${n}</span>
          ${total ? `<span class="ml-auto text-[11px] text-gray-400">всего заказов: ${total}</span>` : ''}
        </div>
        <div class="board-col-body" data-cards></div>
      `;
      const cardsEl = el.querySelector('[data-cards]');

      for (const entry of groupByCollective(col.active)) {
        cardsEl.appendChild(entry.cards.length > 1 ? buildGroupCard(entry) : buildCard(entry.cards[0]));
      }

      if (col.active.length === 0) {
        cardsEl.innerHTML = '<div class="text-xs text-gray-400 px-1 py-6 mb-3 text-center rounded-xl border border-dashed border-slate-300">Задач нет</div>';
      }

      // Решение VASY 29.09.2026: «дольше нормы» — пока справочно, свёрнуто.
      if (col.quiet.length > 0) {
        const details = document.createElement('details');
        details.className = 'mb-3';
        details.open = tasksBoardState.openQuiet.has(col.stage.key);
        details.addEventListener('toggle', () => {
          if (details.open) tasksBoardState.openQuiet.add(col.stage.key); else tasksBoardState.openQuiet.delete(col.stage.key);
        });
        details.innerHTML = `<summary class="text-xs text-gray-500 px-1 py-2 cursor-pointer select-none">Долго на этапе (справочно) · ${col.quiet.length}</summary><div data-quiet class="opacity-80"></div>`;
        const quietEl = details.querySelector('[data-quiet]');
        col.quiet.forEach(card => quietEl.appendChild(buildCard(card)));
        cardsEl.appendChild(details);
      }
      return el;
    }

    // Карточки одной коллективки внутри колонки — одной группой; порядок
    // групп — по первой (самой приоритетной) карточке, как пришло с сервера.
    function groupByCollective(cards) {
      const entries = [];
      const byId = new Map();
      for (const card of cards) {
        const id = card.collective ? card.collective.id : null;
        if (id && byId.has(id)) { byId.get(id).cards.push(card); continue; }
        const entry = { collective: card.collective, cards: [card] };
        if (id) byId.set(id, entry);
        entries.push(entry);
      }
      return entries;
    }

    // Все отставшие от коллективки заказы — по всей доске (с учётом
    // фильтров), не только в этой колонке: переводятся одним действием.
    function behindOrdersOf(collectiveId) {
      const result = [];
      for (const card of filteredCards()) {
        const item = card.items.find(i => i.kind === 'behind_collective' && i.collectiveId === collectiveId);
        if (item) result.push({ orderId: card.orderId, targetStatus: item.targetStatus });
      }
      return result;
    }

    function buildGroupCard(entry) {
      const { collective, cards } = entry;
      const el = document.createElement('div');
      el.className = 'bg-white rounded-2xl shadow-sm border border-violet-200 p-4 mb-3';
      el.dataset.collectiveGroup = collective.id;

      const counts = new Map();
      for (const card of cards) {
        for (const item of card.items) {
          if (item.quiet) continue;
          const label = item.kind === 'behind_collective' ? 'Отстал от коллективки' : item.label;
          counts.set(label, (counts.get(label) || 0) + 1);
        }
      }
      const debt = cards.reduce((sum, c) => sum + (c.debtRub || 0), 0);
      const worst = SEVERITY_ORDER.find(s => cards.some(c => c.severity === s)) || 'info';
      const expanded = expandedGroups.has(collective.id);

      el.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${SEVERITY_DOT[worst]}"></span>
              <span class="text-[11px] text-violet-600 font-medium">Коллективка · ${cards.length} заказ(ов)</span>
            </div>
            <div class="font-semibold text-gray-900 text-[15px] line-clamp-2 break-words">${escapeHtmlClient(collective.name)}</div>
          </div>
          ${debt > 0 ? `<div class="shrink-0 text-sm font-semibold text-red-600">${debt.toFixed(2)} ₽</div>` : ''}
        </div>
        <div class="mt-2 space-y-0.5 text-[12px] text-gray-700">
          ${[...counts.entries()].map(([label, n]) => `<div>• ${escapeHtmlClient(label)}${n > 1 ? ` <span class="text-gray-400">×${n}</span>` : ''}</div>`).join('')}
        </div>
        <div class="mt-3 flex items-center gap-2" data-group-actions></div>
        <div data-group-cards class="${expanded ? '' : 'hidden'} mt-3"></div>
      `;

      const actionsEl = el.querySelector('[data-group-actions]');
      const behind = behindOrdersOf(collective.id);
      if (behind.length > 0) {
        const catchUpBtn = document.createElement('button');
        catchUpBtn.type = 'button';
        catchUpBtn.className = 'catch-up-btn flex-1 py-2 rounded-xl bg-violet-50 text-xs font-medium text-violet-700';
        catchUpBtn.textContent = `Перевести отставших (${behind.length})`;
        catchUpBtn.addEventListener('click', () => {
          openCatchUp(behind.map(b => b.orderId), behind[0].targetStatus, collective.name);
        });
        actionsEl.appendChild(catchUpBtn);
      }
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'group-toggle-btn flex-1 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600';
      toggleBtn.textContent = expanded ? 'Свернуть' : 'Показать заказы';
      toggleBtn.addEventListener('click', () => {
        const listEl = el.querySelector('[data-group-cards]');
        listEl.classList.toggle('hidden');
        const nowExpanded = !listEl.classList.contains('hidden');
        if (nowExpanded) expandedGroups.add(collective.id); else expandedGroups.delete(collective.id);
        toggleBtn.textContent = nowExpanded ? 'Свернуть' : 'Показать заказы';
      });
      actionsEl.appendChild(toggleBtn);

      const groupCardsEl = el.querySelector('[data-group-cards]');
      cards.forEach(card => groupCardsEl.appendChild(buildCard(card)));
      return el;
    }

    function buildCard(card) {
      const el = document.createElement('div');
      el.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 transition-shadow ${getAgeColorClass(card.oldestSinceMs)}`;
      el.dataset.orderCard = card.orderId;

      const positionLabel = card.statusPosition
        ? `<span class="text-[11px] text-gray-400">${card.statusPosition}/${DELIVERY_LADDER_TOTAL} — ${escapeHtmlClient(card.statusDelivery || '')}</span>`
        : (card.statusDelivery ? `<span class="text-[11px] text-gray-400">${escapeHtmlClient(card.statusDelivery)}</span>` : '');
      // §1.3 (20.09.2026) — укрупнённая «Стадия», отдельно от точной позиции
      // лестницы выше (та остаётся, менеджеры уже к ней привыкли).
      const stageLabel = card.stage
        ? `<span class="text-[11px] text-violet-600 font-medium ml-1">· ${escapeHtmlClient(card.stage.label)}</span>`
        : '';

      // «Ждёт N дн» (05.10.2026, демо кабинета) — от самого старого пункта
      // задачи; цвет — тот же порог, что у рамки карточки (1 и 3 дня).
      const waitDays = card.oldestSinceMs ? Math.floor((Date.now() - card.oldestSinceMs) / 86400000) : null;
      const waitBadge = waitDays === null ? ''
        : `<span class="text-[11px] font-medium ${waitDays >= 3 ? 'text-red-600' : waitDays >= 1 ? 'text-amber-600' : 'text-gray-400'}">${waitDays === 0 ? 'сегодня' : `ждёт ${waitDays} дн`}</span>`;
      el.innerHTML = `
        <div class="flex items-start justify-between gap-2 cursor-pointer" data-open>
          ${card.imageUrl ? `<img src="${escapeHtmlClient(card.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1 flex-wrap">${positionLabel}${stageLabel}</div>
            <div class="font-semibold text-gray-900 text-[15px] line-clamp-2 break-words">${escapeHtmlClient(card.productDisplay)}</div>
            <div class="text-[13px] text-gray-500 mt-0.5 truncate">${escapeHtmlClient(card.clientDisplay || 'Клиент не привязан')}</div>
            <div class="flex items-center gap-1.5 flex-wrap mt-1">
              ${card.purchaseChannel ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">${escapeHtmlClient(card.purchaseChannel)}</span>` : ''}
              ${waitBadge}
            </div>
          </div>
          ${card.debtRub > 0 ? `<div class="shrink-0 text-sm font-semibold text-red-600">${card.debtRub.toFixed(2)} ₽</div>` : ''}
        </div>
        <div class="mt-2 space-y-1.5" data-items></div>
        <div class="mt-3 flex items-center gap-2" data-actions></div>
      `;

      const itemsEl = el.querySelector('[data-items]');
      card.items.forEach(item => itemsEl.appendChild(buildItemRow(card, item)));

      const actionsEl = el.querySelector('[data-actions]');
      if (card.canSnooze) {
        const snoozeBtn = document.createElement('button');
        snoozeBtn.type = 'button';
        snoozeBtn.className = 'snooze-btn flex-1 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600';
        snoozeBtn.textContent = `Отложить на ${CONFIG_SNOOZE_DAYS_LABEL}`;
        snoozeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          snoozeBtn.disabled = true;
          snoozeBtn.textContent = 'Откладываю...';
          try {
            await callServer('snoozeReminder', card.orderId);
            el.remove();
          } catch (error) {
            snoozeBtn.disabled = false;
            snoozeBtn.textContent = 'Ошибка, повторить';
          }
        });
        actionsEl.appendChild(snoozeBtn);
      }

      // "Записать оплату" — ТОЛЬКО переход в "Оплаты" с контекстом (Р5),
      // намеренно НЕ кнопка "закрыть долг" прямо здесь: деньги в новой
      // модели живут в пуле клиента, а не на заказе — платёж, записанный "с
      // карточки" мимо экрана "Оплаты", может уйти в другой заказ того же
      // клиента (реальный найденный класс бага, см. JSDoc reminderService.js).
      const hasMoneyItem = card.items.some(i => i.kind === 'stage_unpaid' || i.kind === 'debt_on_close');
      if (hasMoneyItem && card.clientTelegramId) {
        const payBtn = document.createElement('button');
        payBtn.type = 'button';
        payBtn.className = 'flex-1 py-2 rounded-xl bg-indigo-50 text-xs font-medium text-indigo-600';
        payBtn.textContent = 'Занести оплату';
        payBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Волна 4 (03.10.2026) — «Оплаты» сразу открывают «Занести оплату» по этому заказу.
          navigateTo('payments', {
            telegramId: card.clientTelegramId, orderId: card.orderId,
            name: card.clientName || '', username: card.clientUsername || '', openPay: '1'
          });
        });
        actionsEl.appendChild(payBtn);

        // Волна 4, п.5 — напоминание клиенту, только вручную, с предпросмотром в «Оплатах».
        const remindBtn = document.createElement('button');
        remindBtn.type = 'button';
        remindBtn.className = 'flex-1 py-2 rounded-xl border border-indigo-100 text-xs font-medium text-indigo-600';
        remindBtn.textContent = 'Напомнить';
        remindBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateTo('payments', {
            telegramId: card.clientTelegramId, orderId: card.orderId,
            name: card.clientName || '', username: card.clientUsername || '', remind: '1'
          });
        });
        actionsEl.appendChild(remindBtn);
      }

      // «Списать долг на компанию» (29.09.2026) — только закрытый заказ с долгом.
      if (card.items.some(i => i.kind === 'debt_on_close')) {
        const writeoffBtn = document.createElement('button');
        writeoffBtn.type = 'button';
        writeoffBtn.className = 'debt-writeoff-btn flex-1 py-2 rounded-xl bg-red-50 text-xs font-medium text-red-600';
        writeoffBtn.textContent = 'Списать долг';
        writeoffBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          DebtWriteoffModal.open(card.orderId, { onChanged: () => loadReminders() });
        });
        actionsEl.appendChild(writeoffBtn);
      }

      // Волна 3 — «Отстал от коллективки»: перевод одного заказа, без уведомления.
      const behindItem = card.items.find(i => i.kind === 'behind_collective');
      if (behindItem) {
        const catchUpBtn = document.createElement('button');
        catchUpBtn.type = 'button';
        catchUpBtn.className = 'catch-up-one-btn flex-1 py-2 rounded-xl bg-violet-50 text-xs font-medium text-violet-700';
        catchUpBtn.textContent = 'Перевести';
        catchUpBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCatchUp([card.orderId], behindItem.targetStatus, behindItem.collectiveName || behindItem.collectiveId);
        });
        actionsEl.appendChild(catchUpBtn);
      }

      el.querySelector('[data-open]').addEventListener('click', () => openOrderFromBoard(card.orderId));

      return el;
    }

    function buildItemRow(card, item) {
      const row = document.createElement('div');
      row.className = 'text-[12px] flex items-start gap-1.5';
      const dotClass = SEVERITY_DOT[item.severity] || 'bg-gray-300';
      row.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${dotClass}"></span>
        <div class="min-w-0 flex-1">
          <span class="text-gray-700">${escapeHtmlClient(item.label)}</span>
          <span class="text-gray-400">— ${escapeHtmlClient(item.hint)}</span>
          <div data-inline-fill></div>
        </div>
      `;

      // §2.1 (20.09.2026) — клиент отметил "Получено" при долге > 0
      // (claimOrderReceived НЕ применил статус напрямую, см. её JSDoc).
      // Менеджер решает прямо с карточки: "Подтвердить" — форсирует переход
      // в "Получено клиентом" (тот же смысл, что уже принятое "Всё равно
      // закрыть" в _delivery-status-modal.js) + пишет дату получения;
      // "Отклонить" — заявка просто перестаёт быть pending, статус не трогается.
      if (item.kind === 'client_claimed_received_with_debt' && item.claimId) {
        const holder = row.querySelector('[data-inline-fill]');
        holder.innerHTML = `
          <div class="flex items-center gap-1.5 mt-1">
            <button type="button" class="claim-approve-btn text-xs text-emerald-600 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50">Подтвердить</button>
            <button type="button" class="claim-reject-btn text-xs text-red-500 font-medium px-2 py-1 rounded-lg hover:bg-red-50">Отклонить</button>
          </div>
        `;
        const approveBtn = holder.querySelector('.claim-approve-btn');
        const rejectBtn = holder.querySelector('.claim-reject-btn');

        approveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
          approveBtn.textContent = 'Подтверждаю...';
          try {
            await callServer('approveOrderReceiptClaim', item.claimId);
            showSaveToast(true, 'Заказ переведён в «Получено клиентом».');
            await loadReminders();
          } catch (error) {
            showSaveToast(false, error.message);
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
            approveBtn.textContent = 'Подтвердить';
          }
        });

        rejectBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
          rejectBtn.textContent = 'Отклоняю...';
          try {
            await callServer('rejectOrderReceiptClaim', item.claimId, '');
            showSaveToast(true, 'Заявка отклонена, статус заказа не изменён.');
            await loadReminders();
          } catch (error) {
            showSaveToast(false, error.message);
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
            rejectBtn.textContent = 'Отклонить';
          }
        });
      }

      // "Пропустить с причиной" (22.09.2026) — ТОЛЬКО для видов из серверного
      // DISMISSIBLE_KINDS (см. обоснование там, почему это не общая кнопка
      // на любом пункте). С волны 1 (28.09.2026) это "Не заполнено: канал/
      // аккаунт/карго/валюта" — для старых заказов, где данные уже не
      // восстановить. "Факт выкупа" больше не напоминание вовсе.
      if (item.kind === 'fields_missing') {
        const holder = row.querySelector('[data-inline-fill]');
        holder.innerHTML = `
          <div class="flex items-center gap-1.5 mt-1">
            <button type="button" class="dismiss-item-btn text-xs text-gray-500 font-medium px-2 py-1 rounded-lg hover:bg-gray-100">Пропустить (данные утеряны)</button>
          </div>
        `;
        const dismissBtn = holder.querySelector('.dismiss-item-btn');
        dismissBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const reason = await showPromptModal(
            'Почему этот пункт нельзя закрыть? (например: "старый заказ, аккаунт уже не вспомнить")',
            { confirmLabel: 'Пропустить', cancelLabel: 'Отмена' }
          );
          if (reason === null) return;
          if (!reason.trim()) { showSaveToast(false, 'Причина обязательна.'); return; }
          dismissBtn.disabled = true;
          dismissBtn.textContent = 'Пропускаю...';
          try {
            await callServer('dismissReminderItem', card.orderId, item.kind, reason.trim());
            showSaveToast(true, 'Пункт пропущен — отменить можно на самой карточке заказа.');
            await loadReminders();
          } catch (error) {
            showSaveToast(false, error.message);
            dismissBtn.disabled = false;
            dismissBtn.textContent = 'Пропустить (данные утеряны)';
          }
        });
      }

      const inlineConfig = item.stage ? INLINE_FILL_FIELDS[item.stage] : null;
      if (inlineConfig) {
        const holder = row.querySelector('[data-inline-fill]');
        holder.innerHTML = `
          <div class="flex items-center gap-1.5 mt-1">
            <input type="number" step="0.01" placeholder="${escapeHtmlClient(inlineConfig.label)}" class="inline-fill-input w-28 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400">
            <button type="button" class="inline-fill-save text-xs text-indigo-600 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50">Сохранить</button>
          </div>
        `;
        const input = holder.querySelector('.inline-fill-input');
        const saveBtn = holder.querySelector('.inline-fill-save');
        input.addEventListener('click', (e) => e.stopPropagation());
        saveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const value = parseFloat(input.value);
          if (isNaN(value) || value < 0) {
            showSaveToast(false, 'Введите неотрицательное число.');
            return;
          }
          saveBtn.disabled = true;
          saveBtn.textContent = 'Сохраняю...';
          try {
            // setReminderStageAmount, НЕ updateOrder — updateOrder ждёт ПОЛНУЮ
            // форму заказа (любое не переданное поле пишется как пустое),
            // одно число с карточки напоминания тем путём стёрло бы статус
            // доставки/клиента/курсы и остальные поля заказа. Отдельный узкий
            // метод пишет только цель этой стадии (order_stage_targets),
            // см. JSDoc reminderService.setStageAmount.
            await callServer('setReminderStageAmount', card.orderId, item.stage, value);
            showSaveToast(true, 'Сохранено.');
            await loadReminders();
          } catch (error) {
            showSaveToast(false, error.message);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
          }
        });
      }

      return row;
    }
  }
};
