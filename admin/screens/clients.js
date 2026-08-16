'use strict';

/**
 * Экран "Клиенты" (17.08.2026, project_bot_knopka_client_blocking) — список
 * клиентов + блокировка по telegram_id/username + отчёт по клиенту + быстрые
 * переходы в уже существующие клиент-центричные экраны/данные.
 *
 * Блокировка по username "заранее" (клиент ещё ни разу не писал боту) не
 * создаёт строку в `clients` здесь — переносится на неё сервером сам, при
 * первой привязке telegram_id (см. clientsService.consumeStagedBlockByUsername).
 * Поэтому такой клиент физически не появится в списке до первого контакта —
 * это ожидаемо, не баг: массовая блокировка "заранее" работает вслепую,
 * список не может показать то, чего ещё нет.
 *
 * "Оплаты"/"Заказы" НЕ дублируются на этом экране — уже полноценно
 * реализованы на экране "Оплаты" (payments.js уже умеет открываться сразу на
 * конкретном клиенте через navigateTo('payments', {telegramId,...})), просто
 * кнопка-переход туда. "Вопросы"/"Вишлист" — своих экранов под конкретного
 * клиента ещё нет, отрисовываются здесь же, инлайн (getQuestionsForClientAdmin/
 * getWishlistForClientAdmin — новые тонкие admin-обёртки над уже
 * существующими клиентскими сервис-методами, без новой бизнес-логики).
 */
window.Screens = window.Screens || {};
window.Screens.clients = {
  render(root, dictionaries, params, signal) {
    let currentClient = null; // {telegramId, name, username}
    let query = '';
    let blockedOnly = false;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Клиенты</h1>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    function renderHeaderActions() {
      document.getElementById('header-actions').innerHTML = currentClient ? '' : `
        <button id="bulk-block-btn" title="Заблокировать несколько по username" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="user-x" class="w-5 h-5"></i>
        </button>
      `;
      if (!currentClient) {
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
            <span id="clients-count" class="text-[11px] text-gray-400 ml-auto"></span>
          </div>
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
            <p class="text-xs text-gray-400">Если клиент ещё ни разу не писал боту — блокировка сработает автоматически, как только он впервые напишет боту или откроет приложение.</p>
          </div>
          <div id="bulk-block-error" class="px-4 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="bulk-block-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="bulk-block-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Заблокировать</button>
          </div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('clients-search');
    const blockedFilterBtn = document.getElementById('blocked-filter-btn');
    const listContainer = document.getElementById('clients-list');
    const countLabel = document.getElementById('clients-count');
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

    async function loadList() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const { items, total } = await callServer('getClientsList', { query, blockedOnly, limit: 100, offset: 0 });
        countLabel.textContent = `Найдено: ${total}`;
        renderList(items);
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
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

    // ===================== Карточка клиента =====================

    function openClient(client) {
      currentClient = client;
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

    async function loadClientDetail() {
      detailView.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const [report, questions, wishlist] = await Promise.all([
          callServer('getClientReport', currentClient.telegramId),
          callServer('getQuestionsForClientAdmin', currentClient.telegramId),
          callServer('getWishlistForClientAdmin', currentClient.telegramId)
        ]);
        renderClientDetail(report, questions, wishlist);
      } catch (error) {
        detailView.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderClientDetail(report, questions, wishlist) {
      const money = (n) => (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
          <button type="button" id="toggle-block-btn" class="mt-3 w-full py-2.5 rounded-xl text-sm font-medium ${blocked ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}">
            ${blocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-sm font-semibold text-gray-900 mb-3">Отчёт по клиенту</div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><div class="text-[11px] text-gray-400">Заказов</div><div class="font-medium text-gray-900">${report.ordersCount} (завершено ${report.completedCount})</div></div>
            <div><div class="text-[11px] text-gray-400">Выручка</div><div class="font-medium text-gray-900">${money(report.totalRevenueRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400">Доход</div><div class="font-medium text-gray-900">${money(report.totalProfitRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400">Комиссия</div><div class="font-medium text-gray-900">${money(report.totalCommissionRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400">Оплачено клиентом</div><div class="font-medium text-gray-900">${money(report.totalPaidRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400">Кредит</div><div class="font-medium text-gray-900">${money(report.creditBalanceRub)} ₽</div></div>
            <div><div class="text-[11px] text-gray-400">Совы</div><div class="font-medium text-gray-900">${report.sovyProgress}</div></div>
            <div><div class="text-[11px] text-gray-400">Билеты</div><div class="font-medium text-gray-900">${report.tickets}</div></div>
          </div>
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
            showSaveToast(true, 'Клиент разблокирован');
            loadClientDetail();
          } catch (error) {
            btn.disabled = false;
            showSaveToast(false, `Не удалось разблокировать: ${error.message}`);
          }
          return;
        }

        const reason = prompt('Причина блокировки (необязательно):', '') || '';
        if (!confirm('Заблокировать клиента? Мини-апп и бот перестанут ему отвечать.')) return;
        btn.disabled = true;
        try {
          await callServer('blockClient', { telegramId: currentClient.telegramId }, reason);
          currentClient.blocked = true;
          currentClient.blockReason = reason;
          showSaveToast(true, 'Клиент заблокирован');
          loadClientDetail();
        } catch (error) {
          btn.disabled = false;
          showSaveToast(false, `Не удалось заблокировать: ${error.message}`);
        }
      });

      if (window.lucide) window.lucide.createIcons();
    }

    // ===================== Массовая блокировка по username =====================

    const bulkModal = document.getElementById('bulk-block-modal');
    const bulkUsernames = document.getElementById('bulk-block-usernames');
    const bulkReason = document.getElementById('bulk-block-reason');
    const bulkError = document.getElementById('bulk-block-error');
    const bulkSaveBtn = document.getElementById('bulk-block-save');

    function openBulkBlockModal() {
      bulkUsernames.value = '';
      bulkReason.value = '';
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

      bulkSaveBtn.disabled = true;
      bulkSaveBtn.textContent = 'Блокирую...';
      const failed = [];
      for (const username of usernames) {
        try {
          await callServer('blockClient', { username }, reason);
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

    loadList();
  }
};
