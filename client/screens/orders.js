'use strict';

/**
 * Экран "Мои заказы" — перенесён из client/orders.html (Phase 2 SPA, 02.08.2026).
 * Логика не менялась, только: (1) навигация на карточку — через navigateTo()
 * вместо window.location.href; (2) шапка+main теперь строятся в render(),
 * а не лежат в HTML файла.
 */
window.Screens = window.Screens || {};
window.Screens.orders = {
  render(root, context) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Мои заказы</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="greeting" class="text-sm text-gray-500 mb-4"></div>

        <div id="priority-rollup-card" class="hidden bg-amber-50 rounded-2xl border border-amber-100 p-4 mb-3"></div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-2 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="orders-search" autocomplete="off"
            class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400"
            placeholder="Поиск по названию...">
        </div>
        <div class="flex items-center gap-2 mb-3 px-1">
          <span class="text-[11px] text-gray-400">Сортировка:</span>
          <select id="orders-sort" class="text-[12px] bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-600">
            <option value="date-desc">Сначала новые</option>
            <option value="date-asc">Сначала старые</option>
            <option value="status">По статусу доставки</option>
          </select>
        </div>

        <div id="active-section">
          <div class="text-[11px] text-gray-400 px-1 mb-2">Активные</div>
          <div id="active-list"></div>
        </div>

        <div id="completed-section" class="mt-6">
          <div class="text-[11px] text-gray-400 px-1 mb-2">Завершённые</div>
          <div id="completed-list"></div>
        </div>

        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">
          У вас пока нет заказов. Если вы уже оформляли заказ — напишите менеджеру.
        </div>
        <div id="no-results-message" class="hidden text-center text-sm text-gray-400 py-10">
          По этому запросу ничего не найдено.
        </div>
      </main>
    `;

    document.getElementById('greeting').textContent = context.name ? `Привет, ${context.name}!` : 'Привет!';

    const activeList = document.getElementById('active-list');
    const completedList = document.getElementById('completed-list');
    const activeSection = document.getElementById('active-section');
    const completedSection = document.getElementById('completed-section');
    const emptyMessage = document.getElementById('empty-message');
    const noResultsMessage = document.getElementById('no-results-message');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('orders-search');
    const sortSelect = document.getElementById('orders-sort');

    let allOrders = [];

    const STAGE_LABELS = {
      'Основная': 'Основная оплата',
      'Вес': 'Вес',
      'СДЭК': 'СДЭК (КЗ→РФ)',
      'Доставка_РФ': 'Доставка по РФ',
      'СДЭК_Индивидуальная': 'СДЭК (индивидуальная)'
    };
    const stageLabel = (stage) => (stage || '').split('/').map((s) => STAGE_LABELS[s] || s).join(' / ');

    loadOrders();
    // Приоритетная сумма "прямо сейчас" по всем new-model заказам клиента
    // (12.08.2026, по запросу VASY — видно и в списке, не только на экране
    // заказа) — отдельный, не блокирующий запрос: список заказов должен
    // открыться нормально, даже если этот запрос упадёт.
    callServer('getMyPaymentsRollup').then(renderPriorityRollup).catch(() => {});

    function renderPriorityRollup(rollup) {
      const card = document.getElementById('priority-rollup-card');
      if (!rollup || rollup.priorityAmount <= 0.01) { card.classList.add('hidden'); return; }
      card.innerHTML = `
        <div class="text-[11px] text-amber-700">Приоритетно нужно оплатить сейчас</div>
        <div class="flex items-baseline gap-2">
          <div class="text-2xl font-bold text-amber-700">${rollup.priorityAmount.toFixed(2)} ₽</div>
          <div class="text-xs text-amber-600">${escapeHtmlClient(stageLabel(rollup.priorityStage))}</div>
        </div>
      `;
      card.classList.remove('hidden');
    }

    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      loadOrders().finally(() => {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    // Поиск/сортировка — чисто на уже загруженном списке, без похода на
    // сервер (04.08.2026, по запросу VASY).
    searchInput.addEventListener('input', debounce(() => render(), 200));
    sortSelect.addEventListener('change', () => render());

    async function loadOrders() {
      activeList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      completedList.innerHTML = '';
      try {
        allOrders = await callServer('getClientOrdersList');
        render();
      } catch (error) {
        activeList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function applySort(list, sortMode) {
      if (sortMode === 'date-asc') return list.sort((a, b) => a.dateOrderSort - b.dateOrderSort);
      if (sortMode === 'status') return list.sort((a, b) => (a.statusDelivery || '').localeCompare(b.statusDelivery || '', 'ru'));
      return list.sort((a, b) => b.dateOrderSort - a.dateOrderSort); // date-desc, дефолт
    }

    // Дефолтная сортировка: сначала блок активных, затем завершённых;
    // внутри каждого блока — по выбранной сортировке (по умолчанию — по
    // дате, новые сверху). Поиск — по короткому и полному названию позиции.
    function render() {
      const query = searchInput.value.trim().toLowerCase();
      const sortMode = sortSelect.value;

      const filtered = query === ''
        ? allOrders
        : allOrders.filter(o => `${o.productDisplay} ${o.productOriginal || ''}`.toLowerCase().includes(query));

      if (allOrders.length === 0) {
        activeSection.classList.add('hidden');
        completedSection.classList.add('hidden');
        noResultsMessage.classList.add('hidden');
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      if (filtered.length === 0) {
        activeSection.classList.add('hidden');
        completedSection.classList.add('hidden');
        noResultsMessage.classList.remove('hidden');
        return;
      }
      noResultsMessage.classList.add('hidden');

      const active = applySort(filtered.filter(o => !o.isCompleted), sortMode);
      const completed = applySort(filtered.filter(o => o.isCompleted), sortMode);

      activeSection.classList.toggle('hidden', active.length === 0);
      completedSection.classList.toggle('hidden', completed.length === 0);

      activeList.innerHTML = '';
      active.forEach(o => activeList.appendChild(buildCard(o)));

      completedList.innerHTML = '';
      completed.forEach(o => completedList.appendChild(buildCard(o)));

      if (window.lucide) window.lucide.createIcons();
    }

    function buildCard(o) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => {
        navigateTo(`order-details/${encodeURIComponent(o.orderId)}`);
      });

      const debtColor = o.debtSummary === 'Оплачено' ? 'text-green-600' : (o.debtSummary.startsWith('К оплате') ? 'text-red-500' : 'text-amber-500');

      // Sov-строка (B, client_display_overhaul, 12.08.2026) — одна строка,
      // либо "уже начислено", либо "будет начислено при полной оплате",
      // никогда обе сразу (VASY: список слишком занят для двух чисел).
      const sov = o.sovInfo;
      let sovHtml = '';
      if (sov && sov.amount > 0) {
        sovHtml = sov.accrued
          ? `<div class="text-[11px] text-amber-600 mt-1">🎟️ ${sov.amount} сов начислено</div>`
          : `<div class="text-[11px] text-gray-400 mt-1">🎟️ +${sov.amount} сов при полной оплате</div>`;
      }

      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(o.productDisplay)}</div>
                ${o.productOriginal ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(o.productOriginal)}</div>` : ''}
                <div class="text-[11px] text-gray-300 mt-0.5">№ ${escapeHtmlClient(o.orderId)}</div>
              </div>
              <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(o.dateOrderDisplay)}</div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              ${o.statusDelivery ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">${escapeHtmlClient(o.statusDelivery)}</span>` : ''}
              ${o.statusOrder ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">${escapeHtmlClient(o.statusOrder)}</span>` : ''}
            </div>
            <div class="text-[13px] font-medium mt-2 ${debtColor}">${escapeHtmlClient(o.debtSummary)}</div>
            ${sovHtml}
          </div>
        </div>
      `;
      return card;
    }
  }
};
