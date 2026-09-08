'use strict';

/**
 * Экран "Персонал" (Фаза 2, roles/RBAC, M2.3, 04.09.2026) — admin-only
 * (см. more.js/app.html/router.js — карточка/кнопка скрыты для менеджера;
 * реальный гейт — серверный MANAGER_ALLOWED_METHODS, не этот экран).
 * Использует getStaffList/addStaffMember/updateStaffRole/
 * deactivateStaffMember/reactivateStaffMember/getStaffAuditLog — canonical
 * контракт в backend `webapp-api.md`.
 *
 * Доп. правка (04.09.2026, репорт VASY после M2.5/M2.6 — "сравнить персонал
 * с пользователями"/"добавлять персонал находя из БД клиентов"):
 * `getStaffList`'s элементы получили `clientName`/`clientUsername` (LEFT
 * JOIN на clients, null — telegram_id ни разу не открывал бота). Форма
 * добавления сотрудника — поиск по `searchClients` (уже существующий
 * admin-метод, тот же паттерн, что order-new.js) вместо ручного ввода TG-ID
 * по умолчанию; `pending:true`-результаты (синтетический telegramId
 * клиентов, известных только по "Заказы") отфильтрованы — непригодны для
 * staff.telegram_id. Ручной ввод остаётся доступен ("Ввести Telegram ID
 * вручную") для сотрудников, ещё не открывавших бота.
 *
 * Журнал изменений менеджеров (IMPLEMENTATION-PLAN-STAFF-AUDIT-LOG.md,
 * 08.09.2026) — вторая вкладка ВНУТРИ уже существующей панели
 * `staff-report-panel` (не новый экран/маршрут, решение согласовано
 * 05.09.2026). `getEntityAuditLog` — admin-only на сервере
 * (`MANAGER_EXCLUDED_METHODS`), эта вкладка не имеет смысла для менеджера
 * даже в теории — тот же принцип, что «Отчёт по менеджерам».
 */
window.Screens = window.Screens || {};
window.Screens.staff = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Персонал</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button type="button" id="staff-report-toggle-btn" title="Отчёт по менеджерам" class="p-2 text-indigo-600">
        <i data-lucide="bar-chart-3" class="w-5 h-5"></i>
      </button>
      <button type="button" id="staff-add-toggle-btn" class="p-2 -mr-2 text-indigo-600">
        <i data-lucide="user-plus" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="staff-add-form" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 space-y-2">
          <div class="text-sm font-medium text-gray-900 mb-1">Добавить сотрудника</div>
          <!-- Поиск по уже известным клиентам (04.09.2026, репорт VASY — "добавлять
               персонал находя из БД клиентов"). Найден — telegramId настоящий,
               берётся из clients, вводить руками не нужно. -->
          <div class="relative">
            <input type="text" id="staff-search-input" placeholder="Найти клиента по имени/username/ID..." autocomplete="off"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            <ul id="staff-search-dropdown" class="dropdown-menu custom-scrollbar"></ul>
          </div>
          <button type="button" id="staff-manual-toggle-btn" class="text-xs text-indigo-600 font-medium">Ввести Telegram ID вручную (сотрудник ещё не открывал бота)</button>
          <input type="text" id="staff-add-telegram-id" placeholder="Telegram ID (только цифры)" inputmode="numeric"
            class="hidden w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
          <input type="text" id="staff-add-name" placeholder="Имя (для отображения)"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
          <select id="staff-add-role" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            <option value="manager">Менеджер</option>
            <option value="admin">Админ</option>
          </select>
          <button type="button" id="staff-add-save-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить</button>
        </div>

        <!-- Отчёт по менеджерам (Фаза 2, roles/RBAC, M2.6) + Журнал изменений
             (IMPLEMENTATION-PLAN-STAFF-AUDIT-LOG.md, 08.09.2026) — две
             вкладки одной панели, не два экрана. -->
        <div id="staff-report-panel" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex gap-1.5 mb-3">
            <button type="button" id="staff-panel-tab-report" class="staff-panel-tab-btn text-xs px-3 py-1.5 rounded-lg font-medium">Отчёт по менеджерам</button>
            <button type="button" id="staff-panel-tab-audit" class="staff-panel-tab-btn text-xs px-3 py-1.5 rounded-lg font-medium">Журнал изменений</button>
          </div>

          <div id="staff-report-tab">
            <div class="flex gap-1.5 mb-3">
              <button type="button" class="report-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="7">7 дней</button>
              <button type="button" class="report-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="30">30 дней</button>
              <button type="button" class="report-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="90">90 дней</button>
            </div>
            <div id="staff-report-body" class="space-y-2"></div>
          </div>

          <div id="staff-audit-tab" class="hidden">
            <div class="flex gap-1.5 mb-3">
              <button type="button" class="audit-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="7">7 дней</button>
              <button type="button" class="audit-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="30">30 дней</button>
              <button type="button" class="audit-period-btn text-xs px-3 py-1.5 rounded-full font-medium" data-days="90">90 дней</button>
            </div>
            <select id="audit-manager-filter" class="w-full px-3 py-2 mb-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
              <option value="">Все менеджеры</option>
            </select>
            <div id="staff-audit-body" class="space-y-2"></div>
            <button type="button" id="staff-audit-load-more-btn" class="hidden w-full mt-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 font-medium">Показать ещё</button>
          </div>
        </div>

        <div id="staff-list" class="space-y-2"></div>
        <div id="staff-empty" class="hidden text-center text-sm text-gray-400 py-10">Пока нет ни одного сотрудника.</div>
      </main>
    `;

    document.getElementById('staff-add-toggle-btn').addEventListener('click', () => {
      document.getElementById('staff-add-form').classList.toggle('hidden');
    }, { signal });

    // --- Поиск клиента для добавления в персонал (04.09.2026, репорт VASY) ---
    const staffSearchInput = document.getElementById('staff-search-input');
    const staffSearchDropdown = document.getElementById('staff-search-dropdown');
    const staffManualToggleBtn = document.getElementById('staff-manual-toggle-btn');
    const staffTelegramIdInput = document.getElementById('staff-add-telegram-id');
    const staffNameInput = document.getElementById('staff-add-name');
    let selectedTelegramId = '';
    // Журнал изменений менеджеров — переиспользует уже загруженный список
    // персонала (load() ниже) для дропдауна-фильтра и подписи актёра по
    // telegram_id, не делает второй getStaffList.
    let staffItems = [];

    staffManualToggleBtn.addEventListener('click', () => {
      staffTelegramIdInput.classList.remove('hidden');
      staffSearchInput.value = '';
      staffSearchDropdown.classList.remove('active');
      selectedTelegramId = '';
      staffTelegramIdInput.focus();
    }, { signal });

    const handleStaffSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { staffSearchDropdown.classList.remove('active'); return; }

      const results = await callServer('searchClients', query);
      // pending:true — синтетический telegramId (клиент известен только по
      // "Заказы", не настоящий Telegram ID), непригоден для staff.telegram_id
      // (см. backend clientsService.searchClients JSDoc) — исключаем.
      const realResults = results.filter((item) => !item.pending);
      FormHelpers.renderDropdown(staffSearchDropdown, realResults, (item) => `
        <div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.displayName)}</div>
      `, (item) => {
        staffSearchInput.value = item.displayName;
        selectedTelegramId = item.telegramId;
        if (staffNameInput.value.trim() === '') staffNameInput.value = item.name || '';
        staffSearchDropdown.classList.remove('active');
        staffTelegramIdInput.classList.add('hidden');
        staffTelegramIdInput.value = '';
      });
    }, 300);
    staffSearchInput.addEventListener('input', handleStaffSearch, { signal });
    staffSearchInput.addEventListener('focus', (e) => { if (e.target.value.trim().length >= 2) staffSearchDropdown.classList.add('active'); }, { signal });
    document.addEventListener('click', (e) => {
      if (!staffSearchInput.contains(e.target) && !staffSearchDropdown.contains(e.target)) {
        staffSearchDropdown.classList.remove('active');
      }
    }, { signal });

    let reportDays = 30;
    let activePanelTab = 'report'; // 'report' | 'audit'
    document.getElementById('staff-report-toggle-btn').addEventListener('click', () => {
      const panel = document.getElementById('staff-report-panel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        if (activePanelTab === 'report') loadReport(reportDays); else loadAuditLog({ reset: true });
      }
    }, { signal });

    document.querySelectorAll('.report-period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        reportDays = parseInt(btn.dataset.days, 10);
        loadReport(reportDays);
      }, { signal });
    });

    function renderPeriodButtons() {
      document.querySelectorAll('.report-period-btn').forEach((btn) => {
        const active = parseInt(btn.dataset.days, 10) === reportDays;
        btn.className = `report-period-btn text-xs px-3 py-1.5 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`;
      });
    }
    renderPeriodButtons();

    // --- Вкладки панели (Отчёт по менеджерам / Журнал изменений) ---
    function renderTabButtons() {
      document.getElementById('staff-panel-tab-report').className =
        `staff-panel-tab-btn text-xs px-3 py-1.5 rounded-lg font-medium ${activePanelTab === 'report' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`;
      document.getElementById('staff-panel-tab-audit').className =
        `staff-panel-tab-btn text-xs px-3 py-1.5 rounded-lg font-medium ${activePanelTab === 'audit' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`;
      document.getElementById('staff-report-tab').classList.toggle('hidden', activePanelTab !== 'report');
      document.getElementById('staff-audit-tab').classList.toggle('hidden', activePanelTab !== 'audit');
    }
    renderTabButtons();

    document.getElementById('staff-panel-tab-report').addEventListener('click', () => {
      activePanelTab = 'report';
      renderTabButtons();
      loadReport(reportDays);
    }, { signal });
    document.getElementById('staff-panel-tab-audit').addEventListener('click', () => {
      activePanelTab = 'audit';
      renderTabButtons();
      loadAuditLog({ reset: true });
    }, { signal });

    // --- Журнал изменений (IMPLEMENTATION-PLAN-STAFF-AUDIT-LOG.md) ---
    let auditDays = 30;
    let auditManagerFilter = '';
    let auditBeforeId = null; // курсор "показать ещё" — id последней уже показанной строки
    // Целевое ревью перед деплоем (08.09.2026, находка §7) — гонка двух
    // параллельных loadAuditLog (двойной клик "Показать ещё", или смена
    // периода/фильтра, пока предыдущий запрос ещё летит): без токена ответ
    // устаревшего запроса дописывается/перезаписывает поверх уже отрисованного
    // свежего состояния. Монотонно растущий токен — тот же принцип, что
    // requestId у форм записи (frontend-contract.md), только для чтения.
    let auditRequestToken = 0;

    /** Заполняет дропдаун-фильтр списком уже загруженного персонала (load() ниже) — второй getStaffList не нужен. */
    function populateAuditManagerFilter(items) {
      const select = document.getElementById('audit-manager-filter');
      const current = select.value;
      select.innerHTML = '<option value="">Все менеджеры</option>' +
        items.map((s) => `<option value="${escapeHtmlClient(s.telegramId)}">${escapeHtmlClient(s.name || s.telegramId)}</option>`).join('');
      select.value = current;
    }

    function renderAuditPeriodButtons() {
      document.querySelectorAll('.audit-period-btn').forEach((btn) => {
        const active = parseInt(btn.dataset.days, 10) === auditDays;
        btn.className = `audit-period-btn text-xs px-3 py-1.5 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`;
      });
    }
    renderAuditPeriodButtons();

    document.querySelectorAll('.audit-period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        auditDays = parseInt(btn.dataset.days, 10);
        loadAuditLog({ reset: true });
      }, { signal });
    });

    document.getElementById('audit-manager-filter').addEventListener('change', (e) => {
      auditManagerFilter = e.target.value;
      loadAuditLog({ reset: true });
    }, { signal });

    document.getElementById('staff-audit-load-more-btn').addEventListener('click', (e) => {
      // Guard против двойного клика/повторного события ДО того, как
      // loadAuditLog успела проставить disabled=true (та же вторая линия
      // защиты, что везде в проекте для форм записи, frontend-contract.md) —
      // здесь для чтения, чтобы не задвоить страницу пагинации.
      if (e.currentTarget.disabled) return;
      loadAuditLog({ reset: false });
    }, { signal });

    /** Человекочитаемые подписи полей — заказ/каталог/платежи (AUDITED_ORDER_FIELDS на backend). */
    const AUDIT_FIELD_LABELS = {
      statusOrder: 'Статус заказа', statusDelivery: 'Статус доставки',
      bookingSum: 'Бронь/комиссия', mainSum: 'Осталось к оплате',
      currency: 'Валюта', amount: 'Количество к валюте',
      taxiKzSum: 'Такси КЗ', sdekSum: 'Стоимость СДЭК', taxiRfSum: 'Такси РФ',
      taxiRfSendSum: 'Такси (отправка)', shippingRfSum: 'Отправка', taxiRfReceiveSum: 'Такси (получение)',
      clientType: 'Тип клиента', managerId: 'Менеджер',
      original: 'Название (Выпуск)', shortName: 'Короткое название', brand: 'Бренд', character: 'Персонаж', series: 'Серия',
      merge: 'Слияние',
      payment_recorded: 'Платёж записан', credit_released: 'Кредит освобождён', credit_refunded: 'Кредит списан'
    };
    const AUDIT_ENTITY_LABELS = { order: 'Заказ', sku: 'Каталог', client_payment: 'Платёж' };

    function auditActorName(telegramId) {
      if (!telegramId) return '—';
      const staffMember = staffItems.find((s) => s.telegramId === telegramId);
      return staffMember ? (staffMember.name || telegramId) : telegramId;
    }

    async function loadAuditLog({ reset }) {
      renderAuditPeriodButtons();
      const body = document.getElementById('staff-audit-body');
      const loadMoreBtn = document.getElementById('staff-audit-load-more-btn');
      const myToken = ++auditRequestToken;
      if (reset) {
        auditBeforeId = null;
        body.innerHTML = '<div class="text-center text-sm text-gray-400 py-4">Загрузка...</div>';
      }
      loadMoreBtn.disabled = true;
      let result;
      try {
        result = await callServer('getEntityAuditLog', {
          days: auditDays,
          managerId: auditManagerFilter || undefined,
          beforeId: auditBeforeId || undefined
        });
      } catch (error) {
        if (myToken !== auditRequestToken) return; // устаревший запрос — новый уже в работе/отрисован
        body.innerHTML = `<div class="text-center text-sm text-red-500 py-4">${escapeHtmlClient(error.message || 'Не удалось загрузить журнал.')}</div>`;
        loadMoreBtn.classList.add('hidden');
        loadMoreBtn.disabled = false;
        return;
      }
      // Ответ устаревшего запроса (двойной клик "Показать ещё"/смена периода
      // или фильтра, пока предыдущий запрос ещё летит) — отбрасываем, не
      // трогаем DOM/auditBeforeId, чтобы не задвоить строки и не перезаписать
      // уже отрисованное состояние более свежего запроса.
      if (myToken !== auditRequestToken) return;
      loadMoreBtn.disabled = false;
      const rowsHtml = result.rows.map((r) => `
        <div class="py-2 border-t border-gray-100 first:border-0 first:pt-0 ${r.isPriority ? 'bg-amber-50 -mx-4 px-4 rounded-lg' : ''}">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">${escapeHtmlClient(AUDIT_ENTITY_LABELS[r.entityType] || r.entityType)}</span>
            <span class="text-xs font-medium text-gray-800">${escapeHtmlClient(r.entityId || '—')}</span>
            ${r.mergeGroupId ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">слияние</span>' : ''}
            ${r.isPriority ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">деньги</span>' : ''}
          </div>
          <div class="text-sm text-gray-700 mt-0.5">
            <span class="text-gray-500">${escapeHtmlClient(AUDIT_FIELD_LABELS[r.field] || r.field)}:</span>
            ${r.oldValue ? `<span class="text-gray-400 line-through">${escapeHtmlClient(r.oldValue)}</span> → ` : ''}<span class="font-medium">${escapeHtmlClient(r.newValue || '—')}</span>
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5">${escapeHtmlClient(auditActorName(r.actorTelegramId))} · ${new Date(r.createdAt).toLocaleString('ru-RU')}</div>
        </div>
      `).join('');

      if (reset) {
        body.innerHTML = result.rows.length === 0
          ? '<div class="text-center text-sm text-gray-400 py-4">За этот период изменений нет.</div>'
          : rowsHtml;
      } else {
        body.insertAdjacentHTML('beforeend', rowsHtml);
      }
      auditBeforeId = result.rows.length > 0 ? result.rows[result.rows.length - 1].id : auditBeforeId;
      loadMoreBtn.classList.toggle('hidden', !result.hasMore);
    }

    function money(n) {
      return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    async function loadReport(days) {
      renderPeriodButtons();
      const body = document.getElementById('staff-report-body');
      body.innerHTML = '<div class="text-center text-sm text-gray-400 py-4">Загрузка...</div>';
      let rows;
      try {
        rows = await callServer('getManagerPerformanceReport', days);
      } catch (error) {
        body.innerHTML = `<div class="text-center text-sm text-red-500 py-4">${escapeHtmlClient(error.message || 'Не удалось загрузить отчёт.')}</div>`;
        return;
      }
      if (rows.length === 0) {
        body.innerHTML = '<div class="text-center text-sm text-gray-400 py-4">За этот период заказов нет.</div>';
        return;
      }
      body.innerHTML = rows.map((r) => `
        <div class="flex items-center justify-between gap-2 py-2 border-t border-gray-100 first:border-0 first:pt-0">
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">
              ${escapeHtmlClient(r.name)}
              ${r.isActive === false ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 ml-1">отключён</span>' : ''}
            </div>
            <div class="text-[11px] text-gray-400">Заказов: ${r.ordersCount}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-medium text-gray-900">${money(r.totalRevenueRub)} ₽</div>
            <div class="text-[11px] text-gray-400">доход ${money(r.totalProfitRub)} ₽</div>
          </div>
        </div>
      `).join('');
    }

    document.getElementById('staff-add-save-btn').addEventListener('click', async () => {
      // Telegram ID — из выбора в поиске (selectedTelegramId) ИЛИ из ручного
      // ввода (виден только после "Ввести Telegram ID вручную"); manual-поле
      // имеет приоритет, если видимо (пользователь явно переключился на него).
      const manualId = staffTelegramIdInput.classList.contains('hidden') ? '' : staffTelegramIdInput.value.trim();
      const telegramId = manualId || selectedTelegramId;
      const name = staffNameInput.value.trim();
      const accessRole = document.getElementById('staff-add-role').value;
      if (!/^\d+$/.test(telegramId)) {
        showSaveToast(false, telegramId === '' ? 'Найдите клиента или введите Telegram ID вручную.' : 'Telegram ID должен состоять только из цифр.');
        return;
      }
      const btn = document.getElementById('staff-add-save-btn');
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await callServer('addStaffMember', telegramId, name, accessRole);
        showSaveToast(true, 'Сотрудник добавлен.');
        staffSearchInput.value = '';
        staffTelegramIdInput.value = '';
        staffTelegramIdInput.classList.add('hidden');
        selectedTelegramId = '';
        staffNameInput.value = '';
        document.getElementById('staff-add-form').classList.add('hidden');
        await load();
      } catch (error) {
        showSaveToast(false, error.message || 'Не удалось добавить сотрудника.');
      } finally {
        btn.disabled = false;
      }
    }, { signal });

    if (window.lucide) window.lucide.createIcons();
    load();

    /**
     * Сравнение введённого вручную staff.name с реальным клиентом
     * (04.09.2026, репорт VASY) — clientName/clientUsername приходят из
     * getStaffList (LEFT JOIN на clients по telegram_id). Оба null — этот
     * telegram_id ни разу не открывал бота, staff.name невозможно
     * перепроверить.
     */
    function clientIdentityLine(item) {
      if (item.clientName === null && item.clientUsername === null) {
        return '<div class="text-[11px] text-amber-600 mt-0.5">Не найден среди клиентов (ни разу не открывал бота)</div>';
      }
      const label = [item.clientName, item.clientUsername].filter(Boolean).join(', ');
      return `<div class="text-[11px] text-gray-400 mt-0.5">Клиент: ${escapeHtmlClient(label)}</div>`;
    }

    async function load() {
      const listEl = document.getElementById('staff-list');
      const emptyEl = document.getElementById('staff-empty');
      let items;
      try {
        items = await callServer('getStaffList');
      } catch (error) {
        listEl.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${escapeHtmlClient(error.message || 'Не удалось загрузить список.')}</div>`;
        return;
      }
      staffItems = items;
      populateAuditManagerFilter(items);

      if (items.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      listEl.innerHTML = items.map(item => `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4" data-telegram-id="${escapeHtmlClient(item.telegramId)}">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(item.name || '(без имени)')}</div>
              <div class="text-xs text-gray-400">ID ${escapeHtmlClient(item.telegramId)}</div>
              ${clientIdentityLine(item)}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] px-2 py-0.5 rounded-full ${item.accessRole === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600'}">${item.accessRole === 'admin' ? 'Админ' : 'Менеджер'}</span>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${item.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}">${item.isActive ? 'Активен' : 'Отключён'}</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" class="staff-role-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600">
              Сделать ${item.accessRole === 'admin' ? 'менеджером' : 'админом'}
            </button>
            <button type="button" class="staff-active-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border ${item.isActive ? 'border-red-200 text-red-500' : 'border-green-200 text-green-600'}">
              ${item.isActive ? 'Деактивировать' : 'Восстановить'}
            </button>
            <button type="button" class="staff-history-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 ml-auto">
              История
            </button>
          </div>
          <div class="staff-history-block hidden mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1"></div>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-telegram-id]').forEach(card => {
        const telegramId = card.dataset.telegramId;
        const item = items.find(i => i.telegramId === telegramId);

        card.querySelector('.staff-role-toggle-btn').addEventListener('click', async () => {
          const newRole = item.accessRole === 'admin' ? 'manager' : 'admin';
          const ok = await showConfirmModal(`Сменить роль "${item.name || telegramId}" на ${newRole === 'admin' ? 'админа' : 'менеджера'}?`);
          if (!ok) return;
          try {
            await callServer('updateStaffRole', telegramId, newRole);
            showSaveToast(true, 'Роль изменена.');
            await load();
          } catch (error) {
            showSaveToast(false, error.message || 'Не удалось сменить роль.');
          }
        });

        card.querySelector('.staff-active-toggle-btn').addEventListener('click', async () => {
          const willDeactivate = item.isActive;
          const ok = await showConfirmModal(
            willDeactivate ? `Деактивировать "${item.name || telegramId}"? Доступ к панели будет закрыт немедленно.` : `Восстановить доступ "${item.name || telegramId}"?`,
            { danger: willDeactivate }
          );
          if (!ok) return;
          try {
            await callServer(willDeactivate ? 'deactivateStaffMember' : 'reactivateStaffMember', telegramId);
            showSaveToast(true, willDeactivate ? 'Доступ отключён.' : 'Доступ восстановлен.');
            await load();
          } catch (error) {
            showSaveToast(false, error.message || 'Не удалось выполнить действие.');
          }
        });

        card.querySelector('.staff-history-toggle-btn').addEventListener('click', async () => {
          const block = card.querySelector('.staff-history-block');
          if (!block.classList.contains('hidden')) {
            block.classList.add('hidden');
            return;
          }
          block.classList.remove('hidden');
          block.innerHTML = 'Загрузка…';
          try {
            const log = await callServer('getStaffAuditLog', telegramId);
            block.innerHTML = log.length === 0
              ? 'Нет событий.'
              : log.map(e => `<div>${escapeHtmlClient(formatAuditAction(e.action))}${e.details ? ' — ' + escapeHtmlClient(e.details) : ''} · ${escapeHtmlClient(e.actor || '?')}</div>`).join('');
          } catch (error) {
            block.innerHTML = escapeHtmlClient(error.message || 'Не удалось загрузить историю.');
          }
        });
      });

      if (window.lucide) window.lucide.createIcons();
    }

    function formatAuditAction(action) {
      const labels = { added: 'Добавлен', role_changed: 'Смена роли', activated: 'Активирован', deactivated: 'Деактивирован' };
      return labels[action] || action;
    }
  }
};
