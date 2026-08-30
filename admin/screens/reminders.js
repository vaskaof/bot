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

window.Screens.reminders = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Напоминания</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-reminders" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
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

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="reminders-count"></div>
        <div id="reminders-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Незакрытых пунктов нет 🎉</div>
      </main>
    `;

    const listContainer = document.getElementById('reminders-list');
    const emptyMessage = document.getElementById('empty-message');
    const countLabel = document.getElementById('reminders-count');
    const refreshBtn = document.getElementById('refresh-reminders');
    const recommendationsBlock = document.getElementById('recommendations-block');
    const clientFilterInput = document.getElementById('reminders-client-filter');
    const channelFilterSelect = document.getElementById('reminders-channel-filter');
    const tabsContainer = document.getElementById('reminders-tabs');

    let allCards = [];
    let activeTab = 'client';

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
    setActiveTab('client');

    clientFilterInput.addEventListener('input', () => render());
    channelFilterSelect.addEventListener('change', () => render());

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
        allCards = await callServer('getReminders');
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
      return allCards.filter(c => {
        if (activeTab === 'client' && c.isOwnPurchase) return false;
        if (activeTab === 'own' && !c.isOwnPurchase) return false;
        if (clientQuery && !c.clientDisplay.toLowerCase().includes(clientQuery)) return false;
        if (channel && c.purchaseChannel !== channel) return false;
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

    function render() {
      const cards = filteredCards();
      const clientCount = allCards.filter(c => !c.isOwnPurchase).length;
      const ownCount = allCards.filter(c => c.isOwnPurchase).length;
      tabsContainer.querySelector('[data-tab="client"]').textContent = `Клиентские (${clientCount})`;
      tabsContainer.querySelector('[data-tab="own"]').textContent = `Личные (${ownCount})`;

      const criticalCount = allCards.filter(c => !c.isOwnPurchase && c.severity === 'critical').length;
      countLabel.textContent = `Срочно: ${criticalCount}`;

      listContainer.innerHTML = '';

      if (cards.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      // Группировка по severity — карточки внутри группы уже пришли с сервера
      // отсортированными по приоритету (priorityScore), порядок не трогаем.
      for (const severity of SEVERITY_ORDER) {
        const group = cards.filter(c => c.severity === severity);
        if (group.length === 0) continue;

        const header = document.createElement('div');
        header.className = 'flex items-center gap-2 px-1 mb-2 mt-4 first:mt-0';
        header.innerHTML = `
          <span class="w-2 h-2 rounded-full ${SEVERITY_DOT[severity]}"></span>
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${SEVERITY_LABELS[severity]} (${group.length})</span>
        `;
        listContainer.appendChild(header);

        group.forEach(card => listContainer.appendChild(buildCard(card)));
      }
    }

    function buildCard(card) {
      const el = document.createElement('div');
      el.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${getAgeColorClass(card.oldestSinceMs)}`;

      const positionLabel = card.statusPosition
        ? `<span class="text-[11px] text-gray-400">${card.statusPosition}/${DELIVERY_LADDER_TOTAL} — ${escapeHtmlClient(card.statusDelivery || '')}</span>`
        : (card.statusDelivery ? `<span class="text-[11px] text-gray-400">${escapeHtmlClient(card.statusDelivery)}</span>` : '');

      el.innerHTML = `
        <div class="flex items-start justify-between gap-2 cursor-pointer" data-open>
          <div class="min-w-0">
            ${positionLabel}
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
          navigateTo('payments', { telegramId: card.clientTelegramId, orderId: card.orderId });
        });
        actionsEl.appendChild(payBtn);
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
