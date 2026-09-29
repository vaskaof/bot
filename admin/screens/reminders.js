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
const TASK_STAGES = [
  { key: 'e2', label: 'Просчёт' },
  { key: 'e3', label: 'Выкуп' },
  { key: 'e4', label: 'Логистика до КЗ' },
  { key: 'e5', label: 'Консолидация в КЗ' },
  { key: 'e6', label: 'Доставка в РФ' },
  { key: 'e7', label: 'Выдача' },
  { key: '', label: 'Без статуса' }
];

window.Screens.reminders = {
  render(root) {
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

    // Доска: телефон — вкладки стадий и одна колонка; широкий экран (lg) —
    // все непустые колонки рядом. Фильтры — те же, что были у списка.
    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 max-w-2xl lg:max-w-none mx-auto">
        <div class="lg:max-w-2xl">
          <div id="recommendations-block" class="hidden mb-4"></div>

          <div class="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-3" id="reminders-tabs">
            <button type="button" data-tab="client" class="reminders-tab flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors">Клиентские</button>
            <button type="button" data-tab="own" class="reminders-tab flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors">Личные</button>
          </div>

          <div class="flex items-center gap-2 mb-3">
            <div class="relative flex-1">
              <input type="text" id="reminders-client-filter" placeholder="Фильтр по клиенту..." class="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-400">
            </div>
            <select id="reminders-channel-filter" class="text-sm bg-white border border-gray-200 rounded-xl px-2 py-2 outline-none focus:border-indigo-400">
              <option value="">Все каналы</option>
            </select>
          </div>

          <!-- §1.1 (19.09.2026) — сервер УЖЕ ограничил видимый набор ролью,
               дропдаун только сужает его на экране для admin/менеджера с
               can_view_all_clients. -->
          <select id="reminders-manager-filter" class="hidden w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-3 py-2 mb-3 text-sm outline-none focus:border-indigo-400">
            <option value="">Все менеджеры</option>
          </select>

          <div class="text-[11px] text-gray-400 px-1 mb-2" id="reminders-count"></div>
          <div id="stage-tabs" class="flex gap-1.5 overflow-x-auto pb-2 mb-2 lg:hidden"></div>
        </div>
        <div id="reminders-list" class="lg:flex lg:gap-4 lg:items-start lg:overflow-x-auto lg:pb-4"></div>
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
    let activeTab = 'client';
    let activeStageKey = null; // вкладка стадии на телефоне; null — первая с задачами
    const expandedGroups = new Set(); // id коллективок, раскрытых на доске

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
      render();
    });
    setActiveTab('client');

    clientFilterInput.addEventListener('input', () => render());
    channelFilterSelect.addEventListener('change', () => render());
    managerFilterSelect.addEventListener('change', () => render());

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
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function populateChannelFilter() {
      const current = channelFilterSelect.value;
      const channels = Array.from(new Set(allCards.map(c => c.purchaseChannel).filter(Boolean))).sort();
      channelFilterSelect.innerHTML = '<option value="">Все каналы</option>' +
        channels.map(ch => `<option value="${escapeHtmlClient(ch)}">${escapeHtmlClient(ch)}</option>`).join('');
      if (channels.includes(current)) channelFilterSelect.value = current;
    }

    async function loadRecommendations() {
      try {
        const recs = await callServer('getShippingRecommendations');
        if (recs.length === 0) {
          recommendationsBlock.classList.add('hidden');
          return;
        }
        recommendationsBlock.innerHTML = `
          <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div class="text-sm font-semibold text-amber-800 mb-2">💡 Кандидаты на индивидуальную отправку</div>
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
        const isActive = col.stage.key === activeStageKey;
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.dataset.stageKey = col.stage.key;
        tab.className = `shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`;
        tab.textContent = `${col.stage.label} · ${col.active.length}`;
        stageTabsContainer.appendChild(tab);

        listContainer.appendChild(buildColumn(col, isActive));
      }
    }

    function buildColumn(col, isActive) {
      const el = document.createElement('section');
      el.dataset.stageColumn = col.stage.key;
      // На телефоне видна только активная вкладка; на lg — все колонки.
      el.className = `${isActive ? '' : 'hidden'} lg:block lg:w-[340px] lg:shrink-0`;
      const total = stageTotals[col.stage.key];
      el.innerHTML = `
        <div class="flex items-baseline justify-between px-1 mb-2">
          <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">${escapeHtmlClient(col.stage.label)} · ${col.active.length}</span>
          ${total ? `<span class="text-[11px] text-gray-400">всего заказов: ${total}</span>` : ''}
        </div>
        <div data-cards></div>
      `;
      const cardsEl = el.querySelector('[data-cards]');

      for (const entry of groupByCollective(col.active)) {
        cardsEl.appendChild(entry.cards.length > 1 ? buildGroupCard(entry) : buildCard(entry.cards[0]));
      }

      if (col.active.length === 0) {
        cardsEl.innerHTML = '<div class="text-xs text-gray-400 px-1 pb-3">Задач нет</div>';
      }

      // Решение VASY 29.09.2026: «дольше нормы» — пока справочно, свёрнуто.
      if (col.quiet.length > 0) {
        const details = document.createElement('details');
        details.className = 'mb-3';
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
            <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(collective.name)}</div>
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
      el.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${getAgeColorClass(card.oldestSinceMs)}`;

      const positionLabel = card.statusPosition
        ? `<span class="text-[11px] text-gray-400">${card.statusPosition}/${DELIVERY_LADDER_TOTAL} — ${escapeHtmlClient(card.statusDelivery || '')}</span>`
        : (card.statusDelivery ? `<span class="text-[11px] text-gray-400">${escapeHtmlClient(card.statusDelivery)}</span>` : '');
      // §1.3 (20.09.2026) — укрупнённая «Стадия», отдельно от точной позиции
      // лестницы выше (та остаётся, менеджеры уже к ней привыкли).
      const stageLabel = card.stage
        ? `<span class="text-[11px] text-violet-600 font-medium ml-1">· ${escapeHtmlClient(card.stage.label)}</span>`
        : '';

      el.innerHTML = `
        <div class="flex items-start justify-between gap-2 cursor-pointer" data-open>
          <div class="min-w-0">
            ${positionLabel}${stageLabel}
            <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(card.productDisplay)}</div>
            <div class="text-[13px] text-gray-500 mt-0.5">${escapeHtmlClient(card.clientDisplay || 'Клиент не привязан')}</div>
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
        payBtn.textContent = 'Записать оплату';
        payBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateTo('payments', {
            telegramId: card.clientTelegramId, orderId: card.orderId,
            name: card.clientName || '', username: card.clientUsername || ''
          });
        });
        actionsEl.appendChild(payBtn);
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

      el.querySelector('[data-open]').addEventListener('click', () => {
        navigateTo(`orders/${encodeURIComponent(card.orderId)}/edit`);
      });

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
