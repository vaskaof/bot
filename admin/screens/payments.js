'use strict';

/**
 * Экран "Оплаты" (F2.1, 11.08.2026) — клиент-центричный (не order-центричный,
 * см. личную память Architect'а project_bot_knopka_staged_payments_refactor,
 * §17 E.1). Бэкенд-фундамент — F2.0 (тот же раунд): getPaymentsForClient/
 * getEarmarksForClient/editClientPayment/cancelClientPayment/
 * getClientCreditBalance/releaseClientCreditForClient — все admin-методы,
 * НЕ в CLIENT_ALLOWED_METHODS.
 *
 * Разделение путей записи платежа — намеренное, не упрощение (см. money-gate
 * находку в webapp-api.md): `paymentsRepository.getOpenOrdersForClient`
 * читает ТОЛЬКО new-model заказы (`order_meta`) — платёж, отправленный через
 * клиентский пул (`recordClientPaymentDirect`) клиенту, у которого открыты
 * ТОЛЬКО old-model заказы, был бы тут же заморожен в кредит мимо реального
 * заказа. Поэтому "Записать платёж" всегда явно спрашивает КУДА: общий пул
 * (new-model, `recordClientPaymentDirect`) или конкретный old-model заказ
 * (`recordOrderPayment`, старый заказный путь, без изменений).
 */
window.Screens = window.Screens || {};
window.Screens.payments = {
  render(root, dictionaries, params, signal) {
    const STAGE_LABELS = {
      'Основная': 'Основная оплата',
      'Вес': 'Вес',
      'СДЭК': 'СДЭК (КЗ→РФ)',
      'Доставка_РФ': 'Доставка по РФ',
      'СДЭК_Индивидуальная': 'СДЭК (индивидуальная)'
    };
    const stageLabel = (stage) => STAGE_LABELS[stage] || stage;
    const money = (n) => (Number(n) || 0).toFixed(2);

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Оплаты</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="tab-switcher" class="flex gap-1.5 mb-3">
          <button type="button" data-tab="client" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">Клиент</button>
          <button type="button" data-tab="claims" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">
            Заявки клиентов <span id="claims-count-badge"></span>
          </button>
        </div>

        <div id="client-tab">
          <div id="client-search-card" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2 relative">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
            <input type="text" id="payments-client-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск клиента по имени/username..." autocomplete="off">
            <ul id="payments-client-dropdown" class="dropdown-menu custom-scrollbar"></ul>
          </div>
          <div id="payments-client-view"></div>
        </div>

        <div id="claims-tab" class="hidden">
          <div id="claims-list"></div>
          <div id="claims-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Заявок на проверку нет.</div>
        </div>
      </main>

      <!-- Модалка "Записать платёж" — куда (пул/конкретный old-model заказ) + сумма + опциональные метки -->
      <div id="record-payment-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Записать платёж</h2>
            <button id="rp-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Куда</label>
              <select id="rp-target" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"></select>
              <p id="rp-target-hint" class="hidden text-[11px] text-gray-400 mt-1">У клиента только заказы новой модели — деньги всегда идут в общий пул, дальше их распределяет автоматика по приоритету (или ручная метка «Закрепить»), а не выбор конкретного заказа.</p>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Сумма, ₽</label>
              <input type="number" id="rp-amount" step="0.01" min="0.01" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="0.00">
            </div>
            <div id="rp-note-row">
              <label class="text-xs font-medium text-gray-500">Заметка (необязательно)</label>
              <input type="text" id="rp-note" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Например: перевод от 11.08">
            </div>
            <div id="rp-split-section" class="hidden border-t border-gray-100 pt-3">
              <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" id="rp-split-toggle">
                Сразу закрепить часть суммы за конкретной стадией (точечное распределение)
              </label>
              <div id="rp-split-rows" class="hidden mt-2 space-y-2"></div>
              <button type="button" id="rp-split-add" class="hidden mt-2 text-xs font-medium text-indigo-600">+ добавить ещё одну метку</button>
            </div>
            <p id="rp-error" class="text-xs text-red-500 hidden"></p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="rp-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="rp-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Записать</button>
          </div>
        </div>
      </div>

      <!-- Модалка "Закрепить" — точечное распределение на уже лежащие в пуле деньги -->
      <div id="earmark-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Закрепить сумму</h2>
            <button id="em-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <p id="em-target" class="text-sm text-gray-600"></p>
            <div>
              <label class="text-xs font-medium text-gray-500">Сумма, ₽ (не больше остатка стадии)</label>
              <input type="number" id="em-amount" step="0.01" min="0.01" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Заметка (необязательно)</label>
              <input type="text" id="em-note" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Например: по просьбе клиента">
            </div>
            <p id="em-error" class="text-xs text-red-500 hidden"></p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="em-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="em-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Закрепить</button>
          </div>
        </div>
      </div>

      <!-- Модалка "Списать" — возврат клиенту (деньги покидают учёт, не путать с "Освободить") -->
      <div id="refund-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Списать кредит (возврат клиенту)</h2>
            <button id="rf-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <p class="text-xs text-gray-400">Сумма ФИЗИЧЕСКИ покидает учёт — реальный перевод клиенту делается отдельно, вне этого экрана. Это только фиксация факта.</p>
            <div>
              <label class="text-xs font-medium text-gray-500">Сумма, ₽ (не больше кредитного баланса)</label>
              <input type="number" id="rf-amount" step="0.01" min="0.01" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="0.00">
            </div>
            <p id="rf-error" class="text-xs text-red-500 hidden"></p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="rf-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="rf-save" class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium">Списать</button>
          </div>
        </div>
      </div>

      <!-- Модалка "Оплатить из кредита" — мост new-model кредит → конкретный old-model заказ -->
      <div id="apply-credit-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Оплатить заказ из кредита</h2>
            <button id="ac-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <p id="ac-target" class="text-sm text-gray-600"></p>
            <div>
              <label class="text-xs font-medium text-gray-500">Сумма, ₽</label>
              <input type="number" id="ac-amount" step="0.01" min="0.01" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="0.00">
            </div>
            <p id="ac-error" class="text-xs text-red-500 hidden"></p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="ac-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="ac-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Оплатить</button>
          </div>
        </div>
      </div>
    `;

    // === Состояние экрана — живёт внутри render(), не утекает между заходами ===
    let currentClient = null; // {telegramId, username, name, displayName}
    let currentOrders = [];   // getOrdersForClientAdmin(...) + details:getOrderDetails(...) на каждый
    let currentPayments = []; // getPaymentsForClient — только new-model, {id,date,amount,reason}
    let currentEarmarks = []; // getEarmarksForClient — {id,orderId,stage,amount,note,createdBy,createdAt}
    let currentCreditBalance = 0;
    let currentRollup = { totalRemaining: 0, priorityAmount: 0, priorityStage: null }; // getClientPaymentsRollup (12.08.2026, по запросу VASY)
    let earmarkContext = null; // {clientTelegramId, orderId, stage, remaining} — контекст открытой earmark-модалки

    const clientSearch = document.getElementById('payments-client-search');
    const clientDropdown = document.getElementById('payments-client-dropdown');
    const clientView = document.getElementById('payments-client-view');

    // === Вкладки "Клиент" / "Заявки клиентов" (F3, 11.08.2026) ===
    let currentTab = 'client';
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => { currentTab = btn.dataset.tab; updateTabStyles(); });
    });
    function updateTabStyles() {
      tabButtons.forEach((btn) => {
        const active = btn.dataset.tab === currentTab;
        btn.className = `tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
      });
      document.getElementById('client-tab').classList.toggle('hidden', currentTab !== 'client');
      document.getElementById('claims-tab').classList.toggle('hidden', currentTab !== 'claims');
    }
    updateTabStyles();
    // loadClaims() вызывается НИЖЕ, сразу после объявления claimsList/claimsEmpty
    // (см. "Вкладка Заявки клиентов") — реальный баг, найденный VASY 12.08.2026:
    // вызов был здесь, а claimsList/claimsEmpty — const'ы, объявленные почти в
    // конце файла. Temporal dead zone: loadClaims() падал с ReferenceError
    // ("Cannot access 'claimsList' before initialization") при первом же
    // обращении к claimsList внутри своего тела — тихо, как необработанный
    // reject промиса (loadClaims() вызывался без await/.catch), поэтому ни
    // бейдж, ни список никогда не заполнялись, а остальной экран (поиск
    // клиента, модалки) работал нормально — из-за этого баг не был замечен
    // раньше при синтаксической проверке/тестах (node --check не ловит
    // ошибки времени выполнения, юнит-тестов на этот экран нет).

    function showEmptyState() {
      clientView.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Найдите клиента, чтобы увидеть его оплаты.</div>';
    }
    showEmptyState();

    // "Недавние" — список последних открытых в этом экране клиентов, до
    // начала ввода (по запросу VASY). Нет backend-эквивалента ("список всех
    // клиентов" не существует — searchClients с пустым query всегда отдаёт [],
    // см. clientsService.searchClients), поэтому чисто клиентский
    // localStorage, per-браузер/устройство, не общий для всех админов.
    //
    // 17.08.2026 — ИСПРАВЛЕНО: вызов ниже раньше был 'searchClient' (без
    // "s"), несуществующий метод контракта — прозрачно проксировался на
    // старый GAS-бэкенд (IndexRepository, индекс "Индекс_Клиентов"), поэтому
    // находил только клиентов, хоть раз заходивших в приложение/бота. Теперь
    // 'searchClients' (нативный Node-метод) — домешивает клиентов, известных
    // только по строкам "Заказы" (см. ordersService.searchOrderClients).
    const RECENT_CLIENTS_KEY = 'payments_recent_clients';
    const RECENT_CLIENTS_MAX = 8;

    function getRecentClients() {
      try {
        const raw = localStorage.getItem(RECENT_CLIENTS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; } // приватный режим/localStorage недоступен — не критично, просто нет списка
    }

    function addRecentClient(item) {
      try {
        const list = getRecentClients().filter((c) => c.telegramId !== item.telegramId);
        list.unshift({ telegramId: item.telegramId, username: item.username, name: item.name, displayName: item.displayName });
        localStorage.setItem(RECENT_CLIENTS_KEY, JSON.stringify(list.slice(0, RECENT_CLIENTS_MAX)));
      } catch (e) { /* см. getRecentClients */ }
    }

    function renderRecentClientsDropdown() {
      const recent = getRecentClients();
      if (recent.length === 0) { clientDropdown.classList.remove('active'); return; }
      clientDropdown.innerHTML = '<li class="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Недавние</li>';
      recent.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0';
        li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.displayName)}</div>`;
        li.addEventListener('click', () => {
          clientDropdown.classList.remove('active');
          clientSearch.value = item.displayName;
          selectClient(item);
        });
        clientDropdown.appendChild(li);
      });
      clientDropdown.classList.add('active');
    }

    const handleClientSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length === 0) { renderRecentClientsDropdown(); return; }
      if (query.length < 2) { clientDropdown.classList.remove('active'); return; }
      let results;
      try {
        results = await callServer('searchClients', query);
      } catch (error) {
        return;
      }
      FormHelpers.renderDropdown(clientDropdown, results, (item) => `
        <div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.displayName)}</div>
      `, (item) => {
        clientDropdown.classList.remove('active');
        clientSearch.value = item.displayName;
        selectClient(item);
      });
    }, 300);

    clientSearch.addEventListener('input', handleClientSearch);
    clientSearch.addEventListener('focus', (e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) clientDropdown.classList.add('active');
      else renderRecentClientsDropdown();
    });
    document.addEventListener('click', (e) => {
      if (!clientSearch.contains(e.target) && !clientDropdown.contains(e.target)) clientDropdown.classList.remove('active');
    }, { signal });

    // Точка входа из другого экрана (например, будущая кнопка "Оплаты" на карточке заказа) —
    // тот же приём, что navigateTo('orders/new', {...}) в wishlist-demand.js.
    if (params && params.telegramId) {
      const displayName = params.name || params.username || params.telegramId;
      clientSearch.value = displayName;
      selectClient({ telegramId: params.telegramId, username: params.username || '', name: params.name || '', displayName });
    }

    function selectClient(item) {
      currentClient = item;
      addRecentClient(item);
      loadClientData();
    }

    async function loadClientData() {
      clientView.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const [orderSummaries, payments, earmarks, creditBalance, rollup] = await Promise.all([
          callServer('getOrdersForClientAdmin', currentClient.telegramId),
          callServer('getPaymentsForClient', currentClient.telegramId),
          callServer('getEarmarksForClient', currentClient.telegramId),
          callServer('getClientCreditBalance', currentClient.telegramId),
          callServer('getClientPaymentsRollup', currentClient.telegramId)
        ]);
        const details = await Promise.all(orderSummaries.map((o) => callServer('getOrderDetails', o.orderId)));
        currentOrders = orderSummaries.map((o, i) => Object.assign({}, o, { details: details[i] }));
        currentPayments = payments;
        currentEarmarks = earmarks;
        currentCreditBalance = creditBalance;
        currentRollup = rollup;
        renderClientView();
      } catch (error) {
        clientView.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function earmarksForStage(orderId, stage) {
      return currentEarmarks.filter((m) => m.orderId === orderId && m.stage === stage);
    }

    function renderClientView() {
      const newModelOrders = currentOrders.filter((o) => o.isNewModel);
      const oldModelOrders = currentOrders.filter((o) => !o.isNewModel);

      // "Свободный остаток пула" — считается на фронте, не отдаётся отдельным
      // эндпоинтом (то же самое число вернул бы recomputeForClient.leftover,
      // но у нас нет read-only метода для него без мутации) — сумма НЕотменённых
      // платежей минус кредит минус уже распределённое (по приоритету ИЛИ
      // метками — stagesBalance[].paid уже учитывает оба источника). Именно
      // ЭТО число объясняет "деньги не показываются" — деньги реально лежат
      // здесь, просто ни одна стадия ещё не покрыта целиком.
      const totalPoolPayments = currentPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalAllocated = newModelOrders.reduce((sum, o) =>
        sum + (o.details.stagesBalance || []).reduce((s2, st) => s2 + st.paid, 0), 0);
      const poolLeftover = Math.max(0, totalPoolPayments - currentCreditBalance - totalAllocated);

      // "Сколько надо заплатить" — по запросу VASY, чтобы менеджер сразу видел
      // итог, не складывая стадии в уме. New-model — точная сумма по ВСЕМ
      // стадиям (stagesBalance уже покрывает Основная+Вес+СДЭК+Доставка_РФ).
      // Old-model — только "Основная" (mainBalance) — у Вес/СДЭК/Доставка_РФ
      // там нет partial-tracking, только булев флаг, честной суммы не
      // существует, поэтому не притворяемся, что она есть (сноска ниже).
      const newModelTarget = newModelOrders.reduce((sum, o) =>
        sum + (o.details.stagesBalance || []).reduce((s2, st) => s2 + st.target, 0), 0);
      const newModelPaid = totalAllocated;
      const oldModelTarget = oldModelOrders.reduce((sum, o) => sum + (o.details.mainBalance ? o.details.mainBalance.target : 0), 0);
      const oldModelPaid = oldModelOrders.reduce((sum, o) => sum + (o.details.mainBalance ? o.details.mainBalance.paid : 0), 0);
      const grandTarget = newModelTarget + oldModelTarget;
      const grandPaid = newModelPaid + oldModelPaid;
      const grandRemaining = Math.max(0, grandTarget - grandPaid);

      clientView.innerHTML = `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(currentClient.displayName || currentClient.name || currentClient.username)}</div>
            <div class="text-[12px] text-gray-400">${escapeHtmlClient(currentClient.username || '')} · ID ${escapeHtmlClient(currentClient.telegramId)}</div>
          </div>
          <button id="change-client-btn" class="shrink-0 text-xs font-medium text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100">Сменить</button>
        </div>

        ${currentOrders.length > 0 ? `
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div class="text-[11px] text-gray-400 mb-1">Нужно заплатить по всем заказам</div>
            <div class="flex items-baseline gap-2">
              <div class="text-2xl font-bold text-gray-900">${money(grandRemaining)} ₽</div>
              <div class="text-xs text-gray-400">осталось из ${money(grandTarget)} ₽ (оплачено ${money(grandPaid)} ₽)</div>
            </div>
            ${oldModelOrders.length > 0 ? `<p class="text-[11px] text-gray-400 mt-1">По заказам старой модели считается только «Основная» — вес/СДЭК/доставка по РФ там без частичного учёта, не включены.</p>` : ''}
          </div>
        ` : ''}

        ${currentRollup.priorityAmount > 0.01 ? `
          <div class="bg-amber-50 rounded-2xl border border-amber-100 p-4 mb-3">
            <div class="text-[11px] text-amber-700">Приоритетная оплата сейчас (new-model, кросс-заказно)</div>
            <div class="flex items-baseline gap-2">
              <div class="text-2xl font-bold text-amber-700">${money(currentRollup.priorityAmount)} ₽</div>
              <div class="text-xs text-amber-600">${escapeHtmlClient(stageLabel(currentRollup.priorityStage))}</div>
            </div>
            <p class="text-[11px] text-amber-600 mt-1">Именно эта сумма обязательна клиенту ПРЯМО СЕЙЧАС, чтобы разблокировать следующий тир — тир считается покрытым только когда профинансирован ЦЕЛИКОМ по всем открытым new-model заказам клиента сразу.</p>
          </div>
        ` : ''}

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="text-[11px] text-gray-400">Всего оплачено в пул</div>
              <div class="text-lg font-bold text-gray-900">${money(totalPoolPayments)} ₽</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Распределено по стадиям</div>
              <div class="text-lg font-bold text-gray-900">${money(totalAllocated)} ₽</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Свободный остаток</div>
              <div class="text-lg font-bold ${poolLeftover > 0 ? 'text-amber-600' : 'text-gray-900'}">${money(poolLeftover)} ₽</div>
            </div>
          </div>
          ${poolLeftover > 0 ? `
            <p class="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-50">
              Стадии финансируются ЦЕЛИКОМ по очереди (Основная → Вес → СДЭК → Доставка) — пока пула не хватает на всю стадию сразу по ВСЕМ открытым заказам клиента, она показывает 0% покрытия, даже если деньги уже есть. Обойти очередь можно кнопкой «Закрепить» на конкретной стадии.
            </p>
          ` : ''}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between gap-2">
          <div>
            <div class="text-[11px] text-gray-400">Кредитный баланс</div>
            <div class="text-lg font-bold text-gray-900">${money(currentCreditBalance)} ₽</div>
            <div class="text-[11px] text-gray-400 mt-0.5">Заморожен, пока у клиента нет открытых заказов — применяется вручную.</div>
            ${poolLeftover > 0 ? `<div class="text-[11px] text-amber-600 mt-0.5">(ещё ${money(poolLeftover)} ₽ находятся на распределении менеджером)</div>` : ''}
          </div>
          <div class="shrink-0 flex flex-col gap-1.5">
            <button id="release-credit-btn" ${currentCreditBalance > 0 ? '' : 'disabled'} class="text-xs font-medium px-3 py-1.5 rounded-lg border ${currentCreditBalance > 0 ? 'text-indigo-600 border-indigo-100' : 'text-gray-300 border-gray-100 cursor-not-allowed'}">Освободить</button>
            <button id="open-refund-btn" ${currentCreditBalance > 0 ? '' : 'disabled'} class="text-xs font-medium px-3 py-1.5 rounded-lg border ${currentCreditBalance > 0 ? 'text-red-600 border-red-100' : 'text-gray-300 border-gray-100 cursor-not-allowed'}">Списать</button>
          </div>
        </div>

        <button id="open-record-payment-btn" class="w-full bg-indigo-600 text-white rounded-2xl py-3 text-sm font-medium mb-4 flex items-center justify-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> Записать платёж
        </button>

        ${newModelOrders.length > 0 ? `
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Новая финансовая модель</div>
          ${newModelOrders.map((o) => renderNewModelOrderCard(o)).join('')}
        ` : ''}

        ${currentEarmarks.length > 0 ? `
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4 px-1">Активные метки (точечное распределение)</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 divide-y divide-gray-50">
            ${currentEarmarks.map((m) => `
              <div class="p-3 flex items-center justify-between gap-2 text-sm">
                <div class="min-w-0">
                  <div class="font-medium text-gray-800">🔒 ${money(m.amount)} ₽ — ${escapeHtmlClient(m.orderId)} / ${escapeHtmlClient(stageLabel(m.stage))}</div>
                  <div class="text-[11px] text-gray-400">${m.note ? escapeHtmlClient(m.note) + ' · ' : ''}${escapeHtmlClient(m.createdBy || '')}</div>
                </div>
                <button data-action="cancel-earmark" data-id="${m.id}" class="shrink-0 text-xs font-medium text-red-500 px-2 py-1">Отменить</button>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${currentPayments.length > 0 ? `
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4 px-1">Платежи в общий пул</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 divide-y divide-gray-50">
            ${currentPayments.map((p) => renderPaymentRow(p, 'pool')).join('')}
          </div>
        ` : ''}

        ${oldModelOrders.length > 0 ? `
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4 px-1">Старая модель (по заказу)</div>
          ${oldModelOrders.map((o) => renderOldModelOrderCard(o)).join('')}
        ` : ''}

        ${currentOrders.length === 0 ? '<div class="text-center text-sm text-gray-400 py-6">У клиента пока нет заказов.</div>' : ''}
      `;

      document.getElementById('change-client-btn').addEventListener('click', () => {
        currentClient = null;
        clientSearch.value = '';
        showEmptyState();
        clientSearch.focus();
      });
      document.getElementById('release-credit-btn').addEventListener('click', onReleaseCredit);
      document.getElementById('open-refund-btn').addEventListener('click', openRefundModal);
      document.getElementById('open-record-payment-btn').addEventListener('click', openRecordPaymentModal);

      if (window.lucide) window.lucide.createIcons();
    }

    function renderPaymentRow(p, scope, orderId) {
      return `
        <div class="p-3 flex items-center justify-between gap-2 text-sm">
          <div class="min-w-0">
            <div class="font-medium text-gray-800">${money(p.amount)} ₽</div>
            <div class="text-[11px] text-gray-400">${p.date ? new Date(p.date).toLocaleString('ru-RU') : ''}${p.reason ? ' · ' + escapeHtmlClient(p.reason) : ''}</div>
          </div>
          <div class="shrink-0 flex items-center gap-1">
            <button data-action="edit-payment" data-scope="${scope}" data-order-id="${orderId || ''}" data-payment-id="${escapeHtmlClient(p.id)}" data-amount="${p.amount}" title="Изменить сумму" class="p-1.5 text-gray-400 hover:text-indigo-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button data-action="cancel-payment" data-scope="${scope}" data-order-id="${orderId || ''}" data-payment-id="${escapeHtmlClient(p.id)}" title="Отменить" class="p-1.5 text-gray-400 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>
        </div>
      `;
    }

    // По рекомендации VASY (11.08.2026) — если с записью платежа что-то не
    // так, у менеджера должен быть прямой путь поправить сам заказ, не уходя
    // с экрана "Оплаты" на общий список заказов и не ища его там заново.
    // Тот же маршрут/приём, что orders.js уже использует для перехода на
    // редактирование.
    function renderEditOrderButton(orderId) {
      return `<button data-action="edit-order" data-order-id="${orderId}" title="Открыть заказ на редактирование" class="shrink-0 p-1.5 text-gray-400 hover:text-indigo-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>`;
    }

    function renderNewModelOrderCard(o) {
      const d = o.details;
      const stages = d.stagesBalance || [];
      const orderTarget = stages.reduce((sum, s) => sum + s.target, 0);
      const orderPaid = stages.reduce((sum, s) => sum + s.paid, 0);
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="min-w-0 flex items-start gap-1.5">
              ${renderEditOrderButton(o.orderId)}
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[14px] truncate">${escapeHtmlClient(o.productDisplay)}</div>
                <div class="text-[11px] text-gray-400">№ ${escapeHtmlClient(o.orderId)} · ${escapeHtmlClient(o.statusDelivery || '')}</div>
              </div>
            </div>
            ${orderTarget > 0 ? `
              <div class="text-right shrink-0">
                <div class="text-sm font-semibold text-gray-900">${money(orderPaid)} / ${money(orderTarget)} ₽</div>
                <div class="text-[11px] ${orderPaid >= orderTarget ? 'text-emerald-600' : 'text-gray-400'}">${orderPaid >= orderTarget ? '✓ по заказу оплачено' : 'по заказу нужно ' + money(orderTarget - orderPaid) + ' ₽'}</div>
              </div>
            ` : ''}
          </div>
          <div class="space-y-1.5">
            ${stages.map((s) => renderStageRow(o.orderId, s)).join('')}
          </div>
        </div>
      `;
    }

    function renderStageRow(orderId, s) {
      const marks = earmarksForStage(orderId, s.stage);
      const earmarked = marks.reduce((sum, m) => sum + m.amount, 0);
      const byPriority = Math.max(0, s.paid - earmarked);
      const remaining = Math.max(0, s.remaining);
      // Найдено 13.08.2026 (клиент 6741261992, заказ 3E7473, память
      // project_bot_knopka_staged_payments_refactor) — `s.remaining` с бэка
      // это target МИНУС уже РЕАЛЬНО распределённое (paid), оно НЕ падает
      // сразу после создания метки, если в пуле клиента пока нет реальных
      // денег на её покрытие (метка резервирует будущее, а не текущее — см.
      // paymentsService.recomputeForClient). Раньше кнопка «Закрепить»
      // оставалась активной с той же суммой в подсказке даже когда стадия
      // УЖЕ полностью закреплена — ничего не мешало нажать её второй раз и
      // создать дублирующую метку (ровно это и произошло: две метки по
      // 4407.71 ₽ на одну и ту же стадию). Кнопка/предзаполнение теперь
      // учитывают уже АКТИВНЫЕ метки, не только фактически распределённое.
      const earmarkable = Math.max(0, remaining - earmarked);
      // target=0 в stagesBalance неотличимо на бэке от "стадия ещё не участвует
      // в приоритетном списке" (§8a — цель ещё не известна, а не буквально
      // бесплатно) — реальных нулевых стадий в этом бизнесе не бывает, поэтому
      // это безопасная эвристика отображения, не бэкенд-логика.
      const targetUnknown = s.target <= 0;
      return `
        <div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
          <div class="min-w-0">
            <div class="text-sm text-gray-700">${escapeHtmlClient(stageLabel(s.stage))} <span class="${s.covered ? 'text-emerald-600' : 'text-gray-400'} text-[11px]">${s.covered ? '✓ покрыто' : (targetUnknown ? 'цель не известна' : 'открыто')}</span></div>
            ${targetUnknown ? '' : `
              <div class="text-[11px] text-gray-400">
                ${money(s.paid)} / ${money(s.target)} ₽
                ${earmarked > 0 ? ` · 🔒 ${money(earmarked)} ₽ вручную` : ''}
                ${byPriority > 0 ? ` · ${money(byPriority)} ₽ по приоритету` : ''}
              </div>
            `}
          </div>
          ${earmarkable > 0.01 ? `<button data-action="open-earmark" data-order-id="${orderId}" data-stage="${s.stage}" data-remaining="${earmarkable}" class="shrink-0 text-[11px] font-medium text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100">Закрепить</button>` : ''}
        </div>
      `;
    }

    function renderOldModelOrderCard(o) {
      // mainBalance.payments — байт-в-байт financeService.getOrderPaymentStatus(orderId,...),
      // список платежей ИМЕННО этого заказа (не путать с paymentsRaw — сырыми
      // Да/Нет-флагами формы, и не с client-скоуповым currentPayments, который
      // существует только для new-model). См. ordersService.getMainBalanceForOrder.
      const mb = o.details.mainBalance || { target: 0, paid: 0, remaining: 0, payments: [] };
      const payments = mb.payments || [];
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="min-w-0 flex items-start gap-1.5">
              ${renderEditOrderButton(o.orderId)}
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[14px] truncate">${escapeHtmlClient(o.productDisplay)}</div>
                <div class="text-[11px] text-gray-400">№ ${escapeHtmlClient(o.orderId)} · ${escapeHtmlClient(o.statusDelivery || '')}</div>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-semibold text-gray-900">${money(mb.paid)} / ${money(mb.target)} ₽</div>
              <div class="text-[11px] ${mb.remaining <= 0.01 ? 'text-emerald-600' : 'text-gray-400'}">${mb.remaining <= 0.01 ? '✓ оплачено' : 'осталось ' + money(mb.remaining) + ' ₽'}</div>
            </div>
          </div>
          ${payments.length > 0 ? `<div class="divide-y divide-gray-50 border-t border-gray-50">${payments.map((p) => renderPaymentRow(p, 'order', o.orderId)).join('')}</div>` : '<div class="text-[11px] text-gray-400">Платежей пока нет.</div>'}
          ${currentCreditBalance > 0 && mb.remaining > 0.01 ? `
            <button data-action="apply-credit-to-order" data-order-id="${o.orderId}" data-remaining="${mb.remaining}" class="mt-2 w-full text-xs font-medium text-indigo-600 border border-indigo-100 rounded-lg py-1.5">Оплатить из кредита (${money(Math.min(currentCreditBalance, mb.remaining))} ₽ доступно)</button>
          ` : ''}
        </div>
      `;
    }

    // === Делегирование кликов по динамически отрисованным кнопкам ===
    clientView.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'edit-order') {
        navigateTo(`orders/${encodeURIComponent(btn.dataset.orderId)}/edit`);
      } else if (action === 'apply-credit-to-order') {
        openApplyCreditModal(btn.dataset.orderId, parseFloat(btn.dataset.remaining));
      } else if (action === 'open-earmark') {
        openEarmarkModal(btn.dataset.orderId, btn.dataset.stage, parseFloat(btn.dataset.remaining));
      } else if (action === 'cancel-earmark') {
        if (!confirm('Отменить метку? Сумма вернётся в общий пул и будет распределена обычным порядком.')) return;
        try {
          await callServer('cancelManualAllocation', parseInt(btn.dataset.id, 10), currentClient.telegramId);
          await loadClientData();
        } catch (error) {
          alert('Не удалось отменить метку: ' + error.message);
        }
      } else if (action === 'edit-payment') {
        const scope = btn.dataset.scope;
        const currentAmount = btn.dataset.amount;
        const raw = prompt('Новая сумма платежа, ₽:', currentAmount);
        if (raw === null) return;
        const amount = parseFloat(raw);
        if (isNaN(amount) || amount <= 0) { alert('Сумма должна быть положительным числом.'); return; }
        try {
          if (scope === 'pool') {
            await callServer('editClientPayment', currentClient.telegramId, parseInt(btn.dataset.paymentId, 10), amount);
          } else {
            await callServer('editOrderPayment', btn.dataset.orderId, btn.dataset.paymentId, amount);
          }
          await loadClientData();
        } catch (error) {
          alert('Не удалось изменить платёж: ' + error.message);
        }
      } else if (action === 'cancel-payment') {
        if (!confirm('Отменить платёж? Деньги уйдут из пула клиента и распределение пересчитается заново.')) return;
        const scope = btn.dataset.scope;
        try {
          if (scope === 'pool') {
            await callServer('cancelClientPayment', currentClient.telegramId, parseInt(btn.dataset.paymentId, 10));
          } else {
            await callServer('cancelOrderPayment', btn.dataset.orderId, btn.dataset.paymentId);
          }
          await loadClientData();
        } catch (error) {
          alert('Не удалось отменить платёж: ' + error.message);
        }
      }
    });

    async function onReleaseCredit() {
      if (currentCreditBalance <= 0) return;
      if (!confirm(`Освободить ${money(currentCreditBalance)} ₽ кредита в общий пул клиента?`)) return;
      try {
        await callServer('releaseClientCreditForClient', currentClient.telegramId);
        await loadClientData();
      } catch (error) {
        alert('Не удалось освободить кредит: ' + error.message);
      }
    }

    // === Модалка "Списать" (возврат клиенту, деньги покидают учёт) ===
    const rfModal = document.getElementById('refund-modal');
    const rfAmount = document.getElementById('rf-amount');
    const rfError = document.getElementById('rf-error');

    function openRefundModal() {
      if (currentCreditBalance <= 0) return;
      rfError.classList.add('hidden');
      rfAmount.value = currentCreditBalance.toFixed(2);
      rfAmount.max = currentCreditBalance;
      rfModal.classList.remove('hidden');
      rfModal.classList.add('flex');
    }
    function closeRefundModal() {
      rfModal.classList.add('hidden');
      rfModal.classList.remove('flex');
    }
    document.getElementById('rf-close').addEventListener('click', closeRefundModal);
    document.getElementById('rf-cancel').addEventListener('click', closeRefundModal);

    document.getElementById('rf-save').addEventListener('click', async () => {
      rfError.classList.add('hidden');
      const amount = parseFloat(rfAmount.value);
      if (isNaN(amount) || amount <= 0) { rfError.textContent = 'Укажите сумму больше нуля.'; rfError.classList.remove('hidden'); return; }
      if (amount > currentCreditBalance) { rfError.textContent = 'Сумма больше кредитного баланса.'; rfError.classList.remove('hidden'); return; }
      if (!confirm(`Списать ${money(amount)} ₽? Подтвердите, что перевод клиенту уже сделан (или делается) вне этого экрана — это действие только фиксирует факт.`)) return;

      const saveBtn = document.getElementById('rf-save');
      saveBtn.disabled = true;
      try {
        await callServer('refundClientCredit', currentClient.telegramId, amount, generateRequestId());
        closeRefundModal();
        await loadClientData();
      } catch (error) {
        rfError.textContent = 'Не удалось списать: ' + error.message;
        rfError.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
      }
    });

    // === Модалка "Оплатить из кредита" (мост new-model кредит → old-model заказ) ===
    const acModal = document.getElementById('apply-credit-modal');
    const acTargetText = document.getElementById('ac-target');
    const acAmount = document.getElementById('ac-amount');
    const acError = document.getElementById('ac-error');
    let applyCreditContext = null; // {orderId, remaining}

    function openApplyCreditModal(orderId, remaining) {
      applyCreditContext = { orderId, remaining };
      acError.classList.add('hidden');
      const suggested = Math.min(currentCreditBalance, remaining);
      acAmount.value = suggested > 0 ? suggested.toFixed(2) : '';
      acTargetText.textContent = `Заказ ${orderId} · доступно из кредита: ${money(Math.min(currentCreditBalance, remaining))} ₽`;
      acModal.classList.remove('hidden');
      acModal.classList.add('flex');
    }
    function closeApplyCreditModal() {
      acModal.classList.add('hidden');
      acModal.classList.remove('flex');
    }
    document.getElementById('ac-close').addEventListener('click', closeApplyCreditModal);
    document.getElementById('ac-cancel').addEventListener('click', closeApplyCreditModal);

    document.getElementById('ac-save').addEventListener('click', async () => {
      acError.classList.add('hidden');
      const amount = parseFloat(acAmount.value);
      if (isNaN(amount) || amount <= 0) { acError.textContent = 'Укажите сумму больше нуля.'; acError.classList.remove('hidden'); return; }
      if (amount > currentCreditBalance) { acError.textContent = 'Сумма больше кредитного баланса.'; acError.classList.remove('hidden'); return; }

      const saveBtn = document.getElementById('ac-save');
      saveBtn.disabled = true;
      try {
        await callServer('applyCreditToOldModelOrder', currentClient.telegramId, applyCreditContext.orderId, amount, generateRequestId());
        closeApplyCreditModal();
        await loadClientData();
      } catch (error) {
        acError.textContent = error.message; // сервер уже формулирует понятный текст, включая "кредит списан, но..." при частичном сбое
        acError.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
      }
    });

    // === Модалка "Записать платёж" ===
    const rpModal = document.getElementById('record-payment-modal');
    const rpTarget = document.getElementById('rp-target');
    const rpAmount = document.getElementById('rp-amount');
    const rpNoteRow = document.getElementById('rp-note-row');
    const rpNote = document.getElementById('rp-note');
    const rpSplitSection = document.getElementById('rp-split-section');
    const rpSplitToggle = document.getElementById('rp-split-toggle');
    const rpSplitRows = document.getElementById('rp-split-rows');
    const rpSplitAdd = document.getElementById('rp-split-add');
    const rpError = document.getElementById('rp-error');

    function stageOptionsForSplit() {
      // Тот же учёт активных меток, что renderStageRow (13.08.2026, см. её
      // комментарий) — иначе инлайн-разбивка при "Записать платёж" тоже могла
      // предложить закрепиться ещё раз на уже полностью закреплённую стадию.
      const options = [];
      currentOrders.filter((o) => o.isNewModel).forEach((o) => {
        (o.details.stagesBalance || []).forEach((s) => {
          const earmarked = earmarksForStage(o.orderId, s.stage).reduce((sum, m) => sum + m.amount, 0);
          const earmarkable = Math.max(0, s.remaining - earmarked);
          if (earmarkable > 0.01) {
            options.push({ orderId: o.orderId, stage: s.stage, label: `${o.orderId} — ${o.productDisplay} — ${stageLabel(s.stage)} (ещё нужно: ${money(earmarkable)} ₽)`, remaining: earmarkable });
          }
        });
      });
      return options;
    }

    function addSplitRow() {
      const options = stageOptionsForSplit();
      if (options.length === 0) {
        // Раньше здесь был тихий no-op (return без объяснения) — с точки зрения
        // менеджера чекбокс/кнопка просто "ничего не делали", неотличимо от
        // поломки. Теперь явно говорим почему нечего распределять.
        rpSplitRows.innerHTML = '<p class="text-xs text-gray-400 py-1">Нет открытых стадий с известной целью ни у одного заказа новой модели — сначала должна быть задана цена веса/СДЭК/доставки хотя бы одного открытого заказа.</p>';
        return;
      }
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 split-row';
      row.innerHTML = `
        <select class="split-target flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none">
          ${options.map((o) => `<option value="${o.orderId}|||${o.stage}">${escapeHtmlClient(o.label)}</option>`).join('')}
        </select>
        <input type="number" step="0.01" min="0.01" placeholder="₽" class="split-amount w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none">
        <button type="button" class="split-remove text-gray-400 hover:text-red-500 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      `;
      row.querySelector('.split-remove').addEventListener('click', () => row.remove());
      rpSplitRows.appendChild(row);
      if (window.lucide) window.lucide.createIcons();
    }

    rpSplitToggle.addEventListener('change', () => {
      const on = rpSplitToggle.checked;
      rpSplitRows.classList.toggle('hidden', !on);
      if (on && rpSplitRows.children.length === 0) addSplitRow();
      // Кнопка "+ добавить ещё одну метку" видна только если есть ЧТО добавлять —
      // иначе это ещё один вариант того же тихого no-op, что чинили выше.
      rpSplitAdd.classList.toggle('hidden', !on || stageOptionsForSplit().length === 0);
    });
    rpSplitAdd.addEventListener('click', addSplitRow);

    function openRecordPaymentModal() {
      rpError.classList.add('hidden');
      rpAmount.value = '';
      rpNote.value = '';
      rpSplitToggle.checked = false;
      rpSplitRows.innerHTML = '';
      rpSplitRows.classList.add('hidden');
      rpSplitAdd.classList.add('hidden');

      // "Общий пул" доступен всегда, даже без единого заказа — клиент может
      // заплатить заранее (§D допускает кредит без заказов вообще).
      const oldModelOrders = currentOrders.filter((o) => !o.isNewModel);

      rpTarget.innerHTML = `
        <option value="pool">Общий пул (новая финансовая модель)</option>
        ${oldModelOrders.map((o) => `<option value="order:${o.orderId}">${escapeHtmlClient(o.orderId)} — ${escapeHtmlClient(o.productDisplay)} (старая модель)</option>`).join('')}
      `;
      document.getElementById('rp-target-hint').classList.toggle('hidden', oldModelOrders.length > 0);
      onTargetChange();
      rpModal.classList.remove('hidden');
      rpModal.classList.add('flex');
    }

    function onTargetChange() {
      const isPool = rpTarget.value === 'pool';
      rpNoteRow.classList.toggle('hidden', !isPool);
      rpSplitSection.classList.toggle('hidden', !isPool);
      if (!isPool) {
        rpSplitToggle.checked = false;
        rpSplitRows.classList.add('hidden');
        rpSplitAdd.classList.add('hidden');
      }
    }
    rpTarget.addEventListener('change', onTargetChange);

    function closeRecordPaymentModal() {
      rpModal.classList.add('hidden');
      rpModal.classList.remove('flex');
    }
    document.getElementById('rp-close').addEventListener('click', closeRecordPaymentModal);
    document.getElementById('rp-cancel').addEventListener('click', closeRecordPaymentModal);

    document.getElementById('rp-save').addEventListener('click', async () => {
      rpError.classList.add('hidden');
      const amount = parseFloat(rpAmount.value);
      if (isNaN(amount) || amount <= 0) { rpError.textContent = 'Укажите сумму больше нуля.'; rpError.classList.remove('hidden'); return; }

      const target = rpTarget.value;
      const saveBtn = document.getElementById('rp-save');
      saveBtn.disabled = true;
      try {
        if (target === 'pool') {
          await callServer('recordClientPaymentDirect', currentClient.telegramId, amount, rpNote.value.trim(), generateRequestId());

          if (rpSplitToggle.checked) {
            const rows = Array.from(rpSplitRows.querySelectorAll('.split-row'));
            for (const row of rows) {
              const [orderId, stage] = row.querySelector('.split-target').value.split('|||');
              const splitAmount = parseFloat(row.querySelector('.split-amount').value);
              if (isNaN(splitAmount) || splitAmount <= 0) continue; // пустая строка — просто пропускаем, деньги остаются в пуле
              await callServer('createManualAllocation', currentClient.telegramId, orderId, stage, splitAmount, rpNote.value.trim(), generateRequestId());
            }
          }
        } else {
          const orderId = target.slice('order:'.length);
          await callServer('recordOrderPayment', orderId, amount, generateRequestId());
        }
        closeRecordPaymentModal();
        await loadClientData();
      } catch (error) {
        rpError.textContent = 'Не удалось записать платёж: ' + error.message;
        rpError.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
      }
    });

    // === Модалка "Закрепить" (standalone-вход точечного распределения) ===
    const emModal = document.getElementById('earmark-modal');
    const emTargetText = document.getElementById('em-target');
    const emAmount = document.getElementById('em-amount');
    const emNote = document.getElementById('em-note');
    const emError = document.getElementById('em-error');

    function openEarmarkModal(orderId, stage, remaining) {
      earmarkContext = { orderId, stage, remaining };
      emError.classList.add('hidden');
      emAmount.value = remaining > 0 ? remaining.toFixed(2) : '';
      emAmount.max = remaining;
      emNote.value = '';
      emTargetText.textContent = `Заказ ${orderId} — ${stageLabel(stage)}`;
      emModal.classList.remove('hidden');
      emModal.classList.add('flex');
    }
    function closeEarmarkModal() {
      emModal.classList.add('hidden');
      emModal.classList.remove('flex');
    }
    document.getElementById('em-close').addEventListener('click', closeEarmarkModal);
    document.getElementById('em-cancel').addEventListener('click', closeEarmarkModal);

    document.getElementById('em-save').addEventListener('click', async () => {
      emError.classList.add('hidden');
      const amount = parseFloat(emAmount.value);
      if (isNaN(amount) || amount <= 0) { emError.textContent = 'Укажите сумму больше нуля.'; emError.classList.remove('hidden'); return; }

      const saveBtn = document.getElementById('em-save');
      saveBtn.disabled = true;
      try {
        await callServer('createManualAllocation', currentClient.telegramId, earmarkContext.orderId, earmarkContext.stage, amount, emNote.value.trim(), generateRequestId());
        closeEarmarkModal();
        await loadClientData();
      } catch (error) {
        emError.textContent = 'Не удалось закрепить сумму: ' + error.message;
        emError.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
      }
    });

    // === Вкладка "Заявки клиентов" (F3, 11.08.2026) — модерация self-report ===
    // Тот же паттерн, что "Модерация" в admin/screens/contests.js (бейдж
    // счётчика, карточка, Одобрить/Отклонить, отклонение — prompt() на
    // комментарий) — переиспользуем намеренно, не изобретаем новый UI.
    const claimsList = document.getElementById('claims-list');
    const claimsEmpty = document.getElementById('claims-empty-message');
    loadClaims();

    async function loadClaims() {
      claimsList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const pending = await callServer('getPendingPaymentClaims');
        renderClaims(pending);
      } catch (error) {
        claimsList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderClaims(pending) {
      const badge = document.getElementById('claims-count-badge');
      badge.textContent = pending.length > 0 ? `(${pending.length})` : '';

      claimsList.innerHTML = '';
      if (pending.length === 0) {
        claimsEmpty.classList.remove('hidden');
        return;
      }
      claimsEmpty.classList.add('hidden');
      pending.forEach((c) => claimsList.appendChild(buildClaimCard(c)));
      if (window.lucide) window.lucide.createIcons();
    }

    function isLikelyUrl(text) {
      return /^https?:\/\//i.test(text.trim());
    }

    function buildClaimCard(c) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      const scopeLabel = c.scopeOrderId ? `за заказ ${escapeHtmlClient(c.scopeOrderId)}` : 'за весь пул';
      const proofHtml = isLikelyUrl(c.proofText)
        ? `<a href="${escapeHtmlClient(c.proofText)}" target="_blank" rel="noopener" class="text-indigo-600 underline break-all">${escapeHtmlClient(c.proofText)}</a>`
        : escapeHtmlClient(c.proofText);

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px]">${money(c.amountRub)} ₽ — ${scopeLabel}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">Клиент: ${escapeHtmlClient(c.clientTelegramId)} · ${c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU') : ''}</div>
          </div>
          <button type="button" class="open-client-btn shrink-0 text-[11px] font-medium text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100">Открыть клиента</button>
        </div>
        <div class="text-[13px] text-gray-700 mt-2 p-2 bg-gray-50 rounded-lg break-words">${proofHtml}</div>
        <div class="flex items-center gap-2 mt-3">
          <button type="button" class="approve-claim-btn flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium">Одобрить</button>
          <button type="button" class="reject-claim-btn flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium">Отклонить</button>
        </div>
      `;

      card.querySelector('.open-client-btn').addEventListener('click', () => {
        currentTab = 'client';
        updateTabStyles();
        const item = { telegramId: c.clientTelegramId, username: '', name: '', displayName: c.clientTelegramId };
        clientSearch.value = item.displayName;
        selectClient(item);
      });

      card.querySelector('.approve-claim-btn').addEventListener('click', async (e) => {
        if (!confirm(`Одобрить заявку и записать платёж ${money(c.amountRub)} ₽ ${scopeLabel}?`)) return;
        e.currentTarget.disabled = true;
        try {
          const result = await callServer('approvePaymentClaim', c.id);
          // earmarkFailed (money-gate Review, 12.08.2026) — платёж уже реально
          // записан в пул (деньги не потеряны), но авто-закрепление за
          // приоритетной стадией заказа не удалось — менеджеру нужно
          // закрепить вручную кнопкой «Закрепить» на нужной стадии.
          if (result && result.earmarkFailed) {
            showSaveToast(false, 'Платёж записан, но авто-закрепление за стадией не удалось — закрепите вручную кнопкой «Закрепить»');
          } else {
            showSaveToast(true, 'Заявка одобрена, платёж записан');
          }
          loadClaims();
          if (currentClient && currentClient.telegramId === c.clientTelegramId) await loadClientData();
        } catch (error) {
          e.currentTarget.disabled = false;
          showSaveToast(false, `Не удалось одобрить: ${error.message}`);
        }
      });

      card.querySelector('.reject-claim-btn').addEventListener('click', async (e) => {
        const comment = prompt('Причина отклонения (необязательно):', '') || '';
        e.currentTarget.disabled = true;
        try {
          await callServer('rejectPaymentClaim', c.id, comment);
          showSaveToast(true, 'Заявка отклонена');
          loadClaims();
        } catch (error) {
          e.currentTarget.disabled = false;
          showSaveToast(false, `Не удалось отклонить: ${error.message}`);
        }
      });

      return card;
    }
  }
};
