'use strict';

/**
 * Экран "Коллективки" — перенесён из admin/collectives.html (SPA админки,
 * 02.08.2026). Не входит в нижнюю навигацию (открывается иконкой из
 * orders.js), но сама навигация остаётся видимой (showNav:true, navKey:null
 * в маршруте — см. router.js). document-level click-обработчик (закрытие
 * dropdown поиска заказа вне клика) навешан с { signal } — без этого при
 * повторном заходе на экран слушатели бы копились (см. router.js про
 * AbortController). showSaveToast — общая функция из router.js, локальная
 * копия (была идентична edit-order.html) удалена.
 */
window.Screens = window.Screens || {};
window.Screens.collectives = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Коллективки</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="add-collective-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="collective-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/треку..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="collective-count"></div>

        <div id="collective-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Коллективок не найдено</div>
      </main>

      <div id="create-collective-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Новая коллективка</h2>
            <button id="create-collective-close" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Трек-номер</label>
              <input type="text" id="new-collective-track" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Необязательно, можно добавить позже">
            </div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="create-collective-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="create-collective-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Создать</button>
          </div>
        </div>
      </div>

      <div id="collective-detail-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900" id="detail-title">Коллективка</h2>
            <button id="collective-detail-close" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Трек-номер</label>
              <input type="text" id="detail-track" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Статус коллективки</label>
              <select id="detail-status" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"></select>
            </div>
            <button id="detail-save-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить трек/статус</button>

            <div class="pt-2 border-t border-gray-100">
              <label class="text-xs font-medium text-gray-500">Добавить заказ</label>
              <div class="relative mt-1">
                <input type="text" id="detail-order-search" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Поиск заказа по ID/названию/клиенту..." autocomplete="off">
                <ul id="detail-order-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>

            <div>
              <label class="text-xs font-medium text-gray-500">Заказы в коллективке (<span id="detail-order-count">0</span>)</label>
              <div id="detail-order-list" class="mt-1 space-y-1.5"></div>
            </div>

            <div id="detail-error-text" class="text-xs text-red-500 hidden"></div>
          </div>
          <div class="p-4 border-t border-gray-100">
            <button id="detail-delete-btn" class="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium">Удалить коллективку</button>
          </div>
        </div>
      </div>
    `;

    let allCollectives = [];
    let currentDetailId = null;

    const listContainer = document.getElementById('collective-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('collective-list-search');
    const countLabel = document.getElementById('collective-count');

    loadCollectives();

    async function loadCollectives() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        allCollectives = await callServer('getCollectivesList');
        render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    const handleSearch = debounce(() => render(), 250);
    searchInput.addEventListener('input', handleSearch);

    function render() {
      const query = searchInput.value.trim().toLowerCase();
      let filtered = allCollectives;
      if (query !== '') {
        filtered = allCollectives.filter(c => `${c.collectiveId} ${c.trackNumber}`.toLowerCase().includes(query));
      }

      countLabel.textContent = `Найдено: ${filtered.length}`;
      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        filtered.forEach(c => listContainer.appendChild(buildCard(c)));
      }
    }

    function buildCard(c) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => openDetailModal(c.collectiveId));

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(c.collectiveId)}</div>
            ${c.trackNumber ? `<div class="text-[12px] text-gray-400 mt-0.5">Трек: ${escapeHtmlClient(c.trackNumber)}</div>` : '<div class="text-[12px] text-gray-400 mt-0.5">Трек не указан</div>'}
          </div>
          <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(c.createdAt)}</div>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">${escapeHtmlClient(c.status)}</span>
          <span class="text-[11px] text-gray-500">Заказов: ${c.orderCount}</span>
        </div>
      `;
      return card;
    }

    // --- Создание новой коллективки ---
    const createModal = document.getElementById('create-collective-modal');
    document.getElementById('add-collective-btn').addEventListener('click', () => {
      document.getElementById('new-collective-track').value = '';
      createModal.classList.remove('hidden');
      createModal.classList.add('flex');
    });
    function closeCreateModal() {
      createModal.classList.add('hidden');
      createModal.classList.remove('flex');
    }
    document.getElementById('create-collective-close').addEventListener('click', closeCreateModal);
    document.getElementById('create-collective-cancel').addEventListener('click', closeCreateModal);
    document.getElementById('create-collective-save').addEventListener('click', async () => {
      const trackNumber = document.getElementById('new-collective-track').value.trim();
      try {
        await callServer('createCollective', { trackNumber });
        closeCreateModal();
        loadCollectives();
      } catch (error) {
        alert('Не удалось создать коллективку: ' + error.message);
      }
    });

    // --- Детализация коллективки ---
    const detailModal = document.getElementById('collective-detail-modal');
    const detailTrack = document.getElementById('detail-track');
    const detailStatus = document.getElementById('detail-status');
    const detailOrderList = document.getElementById('detail-order-list');
    const detailOrderCount = document.getElementById('detail-order-count');
    const detailErrorText = document.getElementById('detail-error-text');

    async function openDetailModal(collectiveId) {
      currentDetailId = collectiveId;
      detailErrorText.classList.add('hidden');
      document.getElementById('detail-title').textContent = collectiveId;
      document.getElementById('detail-order-search').value = '';
      document.getElementById('detail-order-dropdown').classList.remove('active');

      detailModal.classList.remove('hidden');
      detailModal.classList.add('flex');

      try {
        const details = await callServer('getCollectiveDetails', collectiveId);
        detailTrack.value = details.trackNumber;
        renderStatusOptions(details.status);
        renderOrdersList(details.orders);
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
      }
    }

    function renderStatusOptions(currentStatus) {
      const statuses = ['Формируется', 'Отправлено (СДЭК)', 'Прибыло к посреднику РФ', 'Завершено'];
      detailStatus.innerHTML = statuses.map(s => `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`).join('');
    }

    function renderOrdersList(orders) {
      detailOrderCount.textContent = orders.length;
      detailOrderList.innerHTML = '';

      if (orders.length === 0) {
        detailOrderList.innerHTML = '<div class="text-xs text-gray-400 py-2">Заказов пока нет</div>';
        return;
      }

      orders.forEach(o => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg text-xs';
        row.innerHTML = `
          <div class="truncate">
            <span class="font-medium text-gray-800">${escapeHtmlClient(o.productDisplay)}</span>
            <span class="text-gray-400"> — ${escapeHtmlClient(o.clientDisplay || 'без клиента')}</span>
          </div>
          <button type="button" class="unassign-order-btn shrink-0 text-red-500" data-order-id="${escapeHtmlClient(o.orderId)}">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        `;
        row.querySelector('.unassign-order-btn').addEventListener('click', async () => {
          try {
            await callServer('unassignOrderFromCollective', o.orderId);
            const details = await callServer('getCollectiveDetails', currentDetailId);
            renderOrdersList(details.orders);
            loadCollectives();
          } catch (error) {
            alert('Не удалось отвязать заказ: ' + error.message);
          }
        });
        detailOrderList.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('detail-save-btn').addEventListener('click', async () => {
      try {
        await callServer('updateCollective', currentDetailId, { trackNumber: detailTrack.value.trim(), status: detailStatus.value });
        loadCollectives();
        showSaveToast(true, 'Коллективка обновлена');
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
        showSaveToast(false, `Не удалось сохранить: ${error.message}`);
      }
    });

    const detailOrderSearch = document.getElementById('detail-order-search');
    const detailOrderDropdown = document.getElementById('detail-order-dropdown');
    const handleOrderSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { detailOrderDropdown.classList.remove('active'); return; }

      const results = await callServer('searchOrdersForCollective', query);
      detailOrderDropdown.innerHTML = '';
      if (results.length === 0) {
        detailOrderDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.productDisplay)}</div><div class="text-xs text-gray-400">${escapeHtmlClient(item.clientDisplay || 'без клиента')}</div>`;
          li.addEventListener('click', async () => {
            detailOrderDropdown.classList.remove('active');
            detailOrderSearch.value = '';
            try {
              await callServer('assignOrderToCollective', item.orderId, currentDetailId);
              const details = await callServer('getCollectiveDetails', currentDetailId);
              renderOrdersList(details.orders);
              loadCollectives();
            } catch (error) {
              alert('Не удалось добавить заказ: ' + error.message);
            }
          });
          detailOrderDropdown.appendChild(li);
        });
      }
      detailOrderDropdown.classList.add('active');
    }, 300);
    detailOrderSearch.addEventListener('input', handleOrderSearch);

    // { signal } — снимается роутером перед монтированием следующего экрана
    // (иначе при повторном заходе сюда слушатели копятся, document переживает
    // смену экрана, в отличие от #screen-root).
    document.addEventListener('click', (e) => {
      if (!detailOrderSearch.contains(e.target) && !detailOrderDropdown.contains(e.target)) {
        detailOrderDropdown.classList.remove('active');
      }
    }, { signal });

    function closeDetailModal() {
      detailModal.classList.add('hidden');
      detailModal.classList.remove('flex');
      currentDetailId = null;
    }
    document.getElementById('collective-detail-close').addEventListener('click', closeDetailModal);

    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
      if (!confirm(`Удалить коллективку «${currentDetailId}»?`)) return;
      try {
        await callServer('deleteCollective', currentDetailId);
        closeDetailModal();
        loadCollectives();
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
      }
    });
  }
};
