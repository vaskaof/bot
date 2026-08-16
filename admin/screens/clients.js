'use strict';

/**
 * Экран "Клиенты" (17.08.2026, project_bot_knopka_client_blocking) — список
 * клиентов + блокировка по telegram_id/username + отчёт по клиенту + быстрые
 * переходы в уже существующие клиент-центричные экраны/данные.
 *
 * Продолжение того же дня — по подтверждённому видению ("Продолжаем то что
 * не сделано" + 2 новых пункта):
 * - Журнал блокировок, временная блокировка (`blockUntil`), сортировка
 *   списка (дата регистрации/имя/сумма заказов), топ-5 по доходу.
 * - Deep-link из `suspiciousActivityMonitorJob`'s Telegram-алерта
 *   (`?telegramId=...`) сразу открывает карточку клиента — см. `params`.
 * - Отчёт по месяцам: пресеты периода + свои даты, подсказки "?" на каждую
 *   цифру отчёта (общий `helpIcon`/`showHelpModal` из common.js).
 * - Экспорт списка/отчёта в CSV — разделитель `;` (не `,`) и BOM в начале
 *   файла, тот же формат, что уже выбран для `exportUsageEvents`
 *   (Excel в ru-локали Windows иначе кладёт файл в один столбец).
 *
 * Блокировка по username "заранее" (клиент ещё ни разу не писал боту) не
 * создаёт строку в `clients` здесь — переносится на неё сервером сам, при
 * первой привязке telegram_id (см. clientsService.consumeStagedBlockByUsername).
 */
window.Screens = window.Screens || {};
window.Screens.clients = {
  render(root, dictionaries, params, signal) {
    let currentClient = null; // {telegramId, name, username, blocked, blockReason}
    let query = '';
    let blockedOnly = false;
    let sortBy = 'registeredAt';
    let periodPreset = 'all'; // 'all' | 'thisMonth' | 'lastMonth' | 'custom'
    let customFrom = '';
    let customTo = '';

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Клиенты</h1>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    function renderHeaderActions() {
      document.getElementById('header-actions').innerHTML = currentClient ? '' : `
        <button id="export-list-btn" title="Экспорт списка в CSV" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="download" class="w-5 h-5"></i>
        </button>
        <button id="bulk-block-btn" title="Заблокировать несколько по username" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="user-x" class="w-5 h-5"></i>
        </button>
      `;
      if (!currentClient) {
        document.getElementById('export-list-btn').addEventListener('click', exportListCsv);
        document.getElementById('bulk-block-btn').addEventListener('click', openBulkBlockModal);
      }
      if (window.lucide) window.lucide.createIcons();
    }
    renderHeaderActions();

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="clients-list-view">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
            <input type="text" id="clients-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по имени/username/ID..." autocomplete="off">
          </div>
          <div class="flex items-center gap-2 mb-3">
            <button type="button" id="blocked-filter-btn" class="text-xs px-3 py-1.5 rounded-full font-medium border border-gray-200 text-gray-500">Только заблокированные</button>
            <select id="sort-select" class="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-indigo-400 ml-auto">
              <option value="registeredAt">По дате регистрации</option>
              <option value="name">По имени</option>
              <option value="revenue">По сумме заказов</option>
            </select>
          </div>
          <div id="top5-block" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3"></div>
          <div id="clients-count" class="text-[11px] text-gray-400 mb-2"></div>
          <div id="clients-list"></div>
        </div>

        <div id="client-detail-view" class="hidden"></div>
      </main>

      <div id="bulk-block-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Заблокировать по username</h2>
            <button id="bulk-block-close" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Username, по одному на строку (с @ или без)</label>
              <textarea id="bulk-block-usernames" rows="5" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" placeholder="@user1&#10;user2&#10;@user3"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Причина (необязательно)</label>
              <input type="text" id="bulk-block-reason" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">До какой даты (необязательно — иначе навсегда)</label>
              <input type="datetime-local" id="bulk-block-until" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <p class="text-xs text-gray-400">Если клиент ещё ни разу не писал боту — блокировка сработает автоматически, как только он впервые напишет боту или откроет приложение.</p>
          </div>
          <div id="bulk-block-error" class="px-4 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="bulk-block-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="bulk-block-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Заблокировать</button>
          </div>
        </div>
      </div>

      <div id="block-client-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Заблокировать клиента</h2>
            <button id="block-client-close" class="p-1 text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Причина (необязательно)</label>
              <input type="text" id="block-client-reason" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">До какой даты (необязательно — иначе навсегда)</label>
              <input type="datetime-local" id="block-client-until" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <p class="text-xs text-gray-400">Мини-апп и бот перестанут отвечать этому клиенту.</p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="block-client-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="block-client-save" class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium">Заблокировать</button>
          </div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('clients-search');
    const blockedFilterBtn = document.getElementById('blocked-filter-btn');
    const sortSelect = document.getElementById('sort-select');
    const listContainer = document.getElementById('clients-list');
    const countLabel = document.getElementById('clients-count');
    const top5Block = document.getElementById('top5-block');
    const listView = document.getElementById('clients-list-view');
    const detailView = document.getElementById('client-detail-view');

    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { query = searchInput.value.trim(); loadList(); }, 300);
    });

    blockedFilterBtn.addEventListener('click', () => {
      blockedOnly = !blockedOnly;
      blockedFilterBtn.className = `text-xs px-3 py-1.5 rounded-full font-medium border ${blockedOnly ? 'bg-red-50 border-red-200 text-red-600' : 'border-gray-200 text-gray-500'}`;
      loadList();
    });

    sortSelect.addEventListener('change', () => { sortBy = sortSelect.value; loadList(); });

    async function loadList() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const { items, total } = await callServer('getClientsList', { query, blockedOnly, sortBy, limit: 100, offset: 0 });
        countLabel.textContent = `Найдено: ${total}`;
        renderList(items);
        loadTop5();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    // Топ-5 по доходу за весь период — отдельный лёгкий блок сверху списка
    // ("что можно добавить сверху", VASY подтвердил). Использует sortBy:
    // 'revenue' на пустом поиске, без пагинации — те же данные, что уже
    // одним проходом считает getAllClientsFinancialTotals на сервере.
    async function loadTop5() {
      try {
        const { items } = await callServer('getClientsList', { sortBy: 'revenue', limit: 5, offset: 0 });
        const top = items.filter((c) => c.totalRevenueRub > 0);
        if (top.length === 0) { top5Block.classList.add('hidden'); return; }
        top5Block.classList.remove('hidden');
        top5Block.innerHTML = `
          <div class="text-sm font-semibold text-gray-900 mb-2">Топ-5 клиентов по доходу</div>
          ${top.map((c, i) => `
            <div class="flex items-center justify-between text-sm py-1">
              <span class="text-gray-600">${i + 1}. ${escapeHtmlClient(c.name || c.username || c.telegramId)}</span>
              <span class="font-medium text-gray-900">${money(c.totalRevenueRub)} ₽</span>
            </div>
          `).join('')}
        `;
      } catch (error) {
        top5Block.classList.add('hidden'); // необязательный блок — не мешает списку из-за своей ошибки
      }
    }

    function money(n) {
      return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function renderList(items) {
      if (items.length === 0) {
        listContainer.innerHTML = buildEmptyState('users', 'Клиентов не найдено.');
        return;
      }
      listContainer.innerHTML = '';
      items.forEach((c) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `w-full text-left bg-white rounded-2xl shadow-sm border p-3 mb-2 flex items-center gap-3 ${c.blocked ? 'border-red-200 bg-red-50' : 'border-gray-100'}`;
        card.innerHTML = `
          <div class="w-9 h-9 rounded-full ${c.blocked ? 'bg-red-100 text-red-500' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center shrink-0">
            <i data-lucide="${c.blocked ? 'user-x' : 'user'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(c.name || c.username || c.telegramId)}</div>
            <div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(c.username || '')} · ID ${escapeHtmlClient(c.telegramId)}</div>
          </div>
          ${c.blocked ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">Заблокирован</span>' : ''}
        `;
        card.addEventListener('click', () => openClient(c));
        listContainer.appendChild(card);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    // Экспорт видимого (отфильтрованного/отсортированного) списка — до 100
    // строк за раз, тот же лимит, что и у самого списка (не отдельный
    // безлимитный запрос — цена/выгода не оправдана для CSV-выгрузки списка
    // клиентов такого масштаба).
    async function exportListCsv() {
      const btn = document.getElementById('export-list-btn');
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const { items } = await callServer('getClientsList', { query, blockedOnly, sortBy, limit: 100, offset: 0 });
        const rows = items.map((c) => [c.telegramId, c.name, c.username, c.blocked ? 'Да' : 'Нет', c.blockReason || '']);
        downloadCsv(['Telegram ID', 'Имя', 'Username', 'Заблокирован', 'Причина блокировки'], rows, 'clients.csv');
      } catch (error) {
        showSaveToast(false, `Не удалось экспортировать: ${error.message}`);
      } finally {
        btn.disabled = false;
      }
    }

    /**
     * CSV-разделитель — ';', НЕ ',' — та же правка, что уже применена к
     * `exportUsageEvents` (Excel в ru-локали Windows иначе кладёт весь файл
     * в один столбец). BOM в начале — корректная кодировка кириллицы в Excel.
     */
    function downloadCsv(headers, rows, filename) {
      const escapeCell = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(';'));
      const csv = '﻿' + lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    // ===================== Карточка клиента =====================

    function openClient(client) {
      currentClient = client;
      periodPreset = 'all';
      customFrom = '';
      customTo = '';
      listView.classList.add('hidden');
      detailView.classList.remove('hidden');
      renderHeaderActions();
      loadClientDetail();
    }

    function closeClient() {
      currentClient = null;
      detailView.classList.add('hidden');
      listView.classList.remove('hidden');
      renderHeaderActions();
      loadList();
    }

    /** Пресет периода -> {fromMs, toMs} для getClientReport, undefined = весь период. */
    function currentRange() {
      const now = new Date();
      if (periodPreset === 'thisMonth') {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        return { fromMs: from.getTime() };
      }
      if (periodPreset === 'lastMonth') {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 1);
        return { fromMs: from.getTime(), toMs: to.getTime() };
      }
      if (periodPreset === 'custom') {
        const range = {};
        if (customFrom) range.fromMs = new Date(customFrom).getTime();
        if (customTo) range.toMs = new Date(customTo).getTime();
        return Object.keys(range).length ? range : undefined;
      }
      return undefined;
    }

    async function loadClientDetail() {
      detailView.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const [report, questions, wishlist, blockLog] = await Promise.all([
          callServer('getClientReport', currentClient.telegramId, currentRange()),
          callServer('getQuestionsForClientAdmin', currentClient.telegramId),
          callServer('getWishlistForClientAdmin', currentClient.telegramId),
          callServer('getClientBlockLog', currentClient.telegramId)
        ]);
        renderClientDetail(report, questions, wishlist, blockLog);
      } catch (error) {
        detailView.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    const REPORT_HELP = {
      orders: ['Заказы', 'Общее количество заказов клиента и сколько из них уже завершено (доставлено).'],
      revenue: ['Выручка', 'Сумма стоимости выкупа по всем заказам клиента (поле «Итог Руб») — без вычета расходов и до какой-либо оплаты клиентом.'],
      profit: ['Доход', 'Чистая прибыль по заказам клиента после вычета комиссии/логистики/налогового резерва — то, что реально зарабатывается на этом клиенте (поле «Доход Руб»).'],
      commission: ['Комиссия', 'Сумма комиссии за посредничество по заказам клиента (поле «Бронь/комиссия за посредничество») — часть дохода, а не дополнительные деньги сверху.'],
      paid: ['Оплачено клиентом', 'Сколько денег клиент реально перевёл (сумма платежей в его пул), независимо от того, на какой заказ/стадию они уже распределены.'],
      credit: ['Кредит', 'Остаток на балансе клиента, который менеджер ещё не распределил ни на один заказ вручную. Текущее состояние — период на эту цифру не влияет.'],
      sovy: ['Совы', 'Бонусный баланс клиента по программе лояльности — совы за заказы/приглашения. Текущее состояние — период на эту цифру не влияет.'],
      tickets: ['Билеты', 'Билеты для розыгрышей — начисляются за каждые 100 сов. Текущее состояние — период на эту цифру не влияет.']
    };
    const help = (key) => helpIcon(REPORT_HELP[key][0], REPORT_HELP[key][1]);

    function renderClientDetail(report, questions, wishlist, blockLog) {
      const blocked = !!currentClient.blocked;

      detailView.innerHTML = `
        <button type="button" id="detail-back-btn" class="text-xs text-indigo-600 font-medium mb-3 flex items-center gap-1">
          <i data-lucide="chevron-left" class="w-4 h-4"></i> Ко всем клиентам
        </button>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-base font-semibold text-gray-900 truncate">${escapeHtmlClient(currentClient.name || currentClient.username || currentClient.telegramId)}</div>
              <div class="text-[12px] text-gray-400">${escapeHtmlClient(currentClient.username || '')} · ID ${escapeHtmlClient(currentClient.telegramId)}</div>
            </div>
            ${blocked ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">Заблокирован</span>' : ''}
          </div>
          ${blocked && currentClient.blockReason ? `<div class="text-xs text-gray-500 mt-2">Причина: ${escapeHtmlClient(currentClient.blockReason)}</div>` : ''}
          ${blocked && currentClient.blockedUntil ? `<div class="text-xs text-gray-500 mt-1">До: ${new Date(currentClient.blockedUntil).toLocaleString('ru-RU')}</div>` : ''}
          <button type="button" id="toggle-block-btn" class="mt-3 w-full py-2.5 rounded-xl text-sm font-medium ${blocked ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}">
            ${blocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
        </div>

        ${blockLog.length > 0 ? `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-sm font-semibold text-gray-900 mb-2">История блокировок</div>
          ${blockLog.map((e) => `
            <div class="border-t border-gray-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0 text-[12px]">
              <span class="font-medium ${e.action === 'blocked' ? 'text-red-600' : 'text-green-600'}">${e.action === 'blocked' ? 'Заблокирован' : 'Разблокирован'}</span>
              <span class="text-gray-400">— ${new Date(e.createdAt).toLocaleString('ru-RU')}${e.actor ? `, ${escapeHtmlClient(e.actor)}` : ''}</span>
              ${e.reason ? `<div class="text-gray-500">${escapeHtmlClient(e.reason)}</div>` : ''}
            </div>
          `).join('')}
        </div>` : ''}

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-gray-900">Отчёт по клиенту</div>
            <button type="button" id="export-report-btn" title="Экспорт в CSV" class="p-1.5 text-indigo-600 rounded-full hover:bg-indigo-50">
              <i data-lucide="download" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            <button type="button" data-preset="all" class="period-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Весь период</button>
            <button type="button" data-preset="thisMonth" class="period-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Этот месяц</button>
            <button type="button" data-preset="lastMonth" class="period-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Прошлый месяц</button>
            <button type="button" data-preset="custom" class="period-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Свои даты</button>
          </div>
          <div id="custom-range-inputs" class="hidden flex items-center gap-2 mb-3">
            <input type="date" id="range-from" class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400">
            <span class="text-xs text-gray-400">—</span>
            <input type="date" id="range-to" class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400">
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Заказов ${help('orders')}</div><div class="font-medium text-gray-900">${report.ordersCount} (завершено ${report.completedCount})</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Выручка ${help('revenue')}</div><div class="font-medium text-gray-900">${money(report.totalRevenueRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Доход ${help('profit')}</div><div class="font-medium text-gray-900">${money(report.totalProfitRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Комиссия ${help('commission')}</div><div class="font-medium text-gray-900">${money(report.totalCommissionRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Оплачено клиентом ${help('paid')}</div><div class="font-medium text-gray-900">${money(report.totalPaidRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Кредит ${help('credit')}</div><div class="font-medium text-gray-900">${money(report.creditBalanceRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Совы ${help('sovy')}</div><div class="font-medium text-gray-900">${report.sovyProgress}</div></div>
            <div><div class="text-[11px] text-gray-400 flex items-center gap-1">Билеты ${help('tickets')}</div><div class="font-medium text-gray-900">${report.tickets}</div></div>
          </div>
          <p class="text-[11px] text-gray-400 mt-3">Кредит/совы/билеты — текущий остаток, период на них не действует.</p>
        </div>

        <button type="button" id="open-payments-btn" class="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between text-left">
          <div>
            <div class="text-sm font-medium text-gray-900">Заказы и оплаты</div>
            <div class="text-[11px] text-gray-400">Открыть на экране «Оплаты»</div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
        </button>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-sm font-semibold text-gray-900 mb-2">Вопросы (${questions.length})</div>
          ${questions.length === 0 ? '<div class="text-xs text-gray-400">Вопросов нет.</div>' :
            questions.map((q) => `
              <div class="border-t border-gray-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
                <div class="text-[11px] text-indigo-600">${escapeHtmlClient(q.productDisplay)}</div>
                <div class="text-[13px] text-gray-800">${escapeHtmlClient(q.text)}</div>
                ${q.answer ? `<div class="text-[12px] text-gray-500 mt-1">Ответ: ${escapeHtmlClient(q.answer)}</div>` : '<div class="text-[11px] text-amber-600 mt-1">Без ответа</div>'}
              </div>
            `).join('')}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-sm font-semibold text-gray-900 mb-2">Вишлист (${wishlist.length})</div>
          ${wishlist.length === 0 ? '<div class="text-xs text-gray-400">Вишлист пуст.</div>' :
            wishlist.map((w) => `
              <div class="border-t border-gray-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0 flex items-center justify-between gap-2">
                <div class="text-[13px] text-gray-800 truncate">${escapeHtmlClient(w.productDisplay)}</div>
                <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(w.status || '')}</div>
              </div>
            `).join('')}
        </div>
      `;

      document.getElementById('detail-back-btn').addEventListener('click', closeClient);
      document.getElementById('open-payments-btn').addEventListener('click', () => {
        navigateTo('payments', { telegramId: currentClient.telegramId, name: currentClient.name, username: currentClient.username });
      });

      document.getElementById('export-report-btn').addEventListener('click', () => {
        const rows = [
          ['Заказов', report.ordersCount], ['Завершено', report.completedCount],
          ['Выручка ₽', report.totalRevenueRub], ['Доход ₽', report.totalProfitRub],
          ['Комиссия ₽', report.totalCommissionRub], ['Оплачено клиентом ₽', report.totalPaidRub],
          ['Кредит ₽', report.creditBalanceRub], ['Совы', report.sovyProgress], ['Билеты', report.tickets]
        ];
        downloadCsv(['Показатель', 'Значение'], rows, `client_${currentClient.telegramId}_report.csv`);
      });

      const periodButtons = Array.from(document.querySelectorAll('.period-btn'));
      function updatePeriodStyles() {
        periodButtons.forEach((btn) => {
          const active = btn.dataset.preset === periodPreset;
          btn.className = `period-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
        });
        document.getElementById('custom-range-inputs').classList.toggle('hidden', periodPreset !== 'custom');
      }
      updatePeriodStyles();
      periodButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          periodPreset = btn.dataset.preset;
          updatePeriodStyles();
          if (periodPreset !== 'custom') loadClientDetail();
        });
      });
      const fromInput = document.getElementById('range-from');
      const toInput = document.getElementById('range-to');
      fromInput.value = customFrom;
      toInput.value = customTo;
      fromInput.addEventListener('change', () => { customFrom = fromInput.value; loadClientDetail(); });
      toInput.addEventListener('change', () => { customTo = toInput.value; loadClientDetail(); });

      document.getElementById('toggle-block-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        if (blocked) {
          if (!confirm('Разблокировать клиента?')) return;
          btn.disabled = true;
          try {
            await callServer('unblockClient', { telegramId: currentClient.telegramId });
            currentClient.blocked = false;
            currentClient.blockReason = '';
            currentClient.blockedUntil = null;
            showSaveToast(true, 'Клиент разблокирован');
            loadClientDetail();
          } catch (error) {
            btn.disabled = false;
            showSaveToast(false, `Не удалось разблокировать: ${error.message}`);
          }
          return;
        }
        openBlockClientModal();
      });

      if (window.lucide) window.lucide.createIcons();
    }

    // ===================== Модалка блокировки одного клиента =====================

    const blockModal = document.getElementById('block-client-modal');
    const blockReasonInput = document.getElementById('block-client-reason');
    const blockUntilInput = document.getElementById('block-client-until');
    const blockSaveBtn = document.getElementById('block-client-save');

    function openBlockClientModal() {
      blockReasonInput.value = '';
      blockUntilInput.value = '';
      blockModal.classList.remove('hidden');
      blockModal.classList.add('flex');
    }
    function closeBlockClientModal() {
      blockModal.classList.add('hidden');
      blockModal.classList.remove('flex');
    }
    document.getElementById('block-client-close').addEventListener('click', closeBlockClientModal);
    document.getElementById('block-client-cancel').addEventListener('click', closeBlockClientModal);
    blockSaveBtn.addEventListener('click', async () => {
      if (blockSaveBtn.disabled) return;
      if (!confirm('Заблокировать клиента? Мини-апп и бот перестанут ему отвечать.')) return;
      blockSaveBtn.disabled = true;
      try {
        const until = blockUntilInput.value ? new Date(blockUntilInput.value).toISOString() : null;
        await callServer('blockClient', { telegramId: currentClient.telegramId }, blockReasonInput.value.trim(), until);
        currentClient.blocked = true;
        currentClient.blockReason = blockReasonInput.value.trim();
        currentClient.blockedUntil = until;
        closeBlockClientModal();
        showSaveToast(true, 'Клиент заблокирован');
        loadClientDetail();
      } catch (error) {
        showSaveToast(false, `Не удалось заблокировать: ${error.message}`);
      } finally {
        blockSaveBtn.disabled = false;
      }
    });

    // ===================== Массовая блокировка по username =====================

    const bulkModal = document.getElementById('bulk-block-modal');
    const bulkUsernames = document.getElementById('bulk-block-usernames');
    const bulkReason = document.getElementById('bulk-block-reason');
    const bulkUntil = document.getElementById('bulk-block-until');
    const bulkError = document.getElementById('bulk-block-error');
    const bulkSaveBtn = document.getElementById('bulk-block-save');

    function openBulkBlockModal() {
      bulkUsernames.value = '';
      bulkReason.value = '';
      bulkUntil.value = '';
      bulkError.classList.add('hidden');
      bulkModal.classList.remove('hidden');
      bulkModal.classList.add('flex');
    }
    function closeBulkBlockModal() {
      bulkModal.classList.add('hidden');
      bulkModal.classList.remove('flex');
    }
    document.getElementById('bulk-block-close').addEventListener('click', closeBulkBlockModal);
    document.getElementById('bulk-block-cancel').addEventListener('click', closeBulkBlockModal);

    bulkSaveBtn.addEventListener('click', async () => {
      if (bulkSaveBtn.disabled) return;
      bulkError.classList.add('hidden');
      const usernames = bulkUsernames.value.split('\n').map((s) => s.trim()).filter((s) => s !== '');
      if (usernames.length === 0) {
        bulkError.textContent = 'Укажите хотя бы один username.';
        bulkError.classList.remove('hidden');
        return;
      }
      const reason = bulkReason.value.trim();
      const until = bulkUntil.value ? new Date(bulkUntil.value).toISOString() : null;

      bulkSaveBtn.disabled = true;
      bulkSaveBtn.textContent = 'Блокирую...';
      const failed = [];
      for (const username of usernames) {
        try {
          await callServer('blockClient', { username }, reason, until);
        } catch (error) {
          failed.push(username);
        }
      }
      bulkSaveBtn.disabled = false;
      bulkSaveBtn.textContent = 'Заблокировать';

      if (failed.length > 0) {
        bulkError.textContent = `Не удалось заблокировать: ${failed.join(', ')}`;
        bulkError.classList.remove('hidden');
      } else {
        closeBulkBlockModal();
        showSaveToast(true, `Заблокировано: ${usernames.length}`);
        loadList();
      }
    });

    // Deep-link из алерта suspiciousActivityMonitorJob (?telegramId=...) —
    // сразу открывает карточку клиента, минуя список (тот же приём, что уже
    // есть у payments.js). Реальный статус блокировки подтягивается отдельно
    // (не угадывается как "не заблокирован") — иначе кнопка "Заблокировать"
    // показалась бы даже для уже заблокированного клиента.
    if (params && params.telegramId) {
      (async () => {
        listView.classList.add('hidden');
        detailView.classList.remove('hidden');
        detailView.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
        try {
          const client = await callServer('getClientByTelegramId', params.telegramId);
          openClient(client || { telegramId: params.telegramId, name: params.name || '', username: params.username || '', blocked: false });
        } catch (error) {
          detailView.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
        }
      })();
      return;
    }

    loadList();
  }
};
