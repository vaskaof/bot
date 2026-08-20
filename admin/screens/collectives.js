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
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Коллективки${helpIcon('Что такое коллективка', '<p>Коллективка — это физическая объединённая посылка Казахстан → Россия, в которую собирают несколько заказов разных клиентов для одной пересылки (экономия на доставке).</p><p>Здесь вы создаёте коллективку (трек-номер), привязываете к ней заказы клиентов и следите за общим статусом доставки.</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="add-collective-btn" title="Новая коллективка" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
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
            <button id="create-collective-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
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
            <button id="collective-detail-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
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

            <div class="pt-3 border-t border-gray-100">
              <label class="text-xs font-medium text-gray-500 flex items-center gap-1">Сверка логистики${helpIcon('Что такое сверка логистики', '<p>Разбивает факт. расход на доставку коллективки (СДЭК + такси КЗ + такси РФ) между заказами и сравнивает с тем, что было заранее оценено при создании каждого заказа.</p><p>Разница записывается в финансовый леджер. Повторное сохранение исправляет уже записанную сверку, не дублирует её.</p>')}</label>
              <div class="grid grid-cols-3 gap-2 mt-1">
                <div>
                  <label class="text-[10px] text-gray-400">СДЭК, ₽</label>
                  <input type="number" id="logistics-sdek" min="0" step="0.01" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
                </div>
                <div>
                  <label class="text-[10px] text-gray-400">Такси КЗ, ₽</label>
                  <input type="number" id="logistics-taxi-kz" min="0" step="0.01" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
                </div>
                <div>
                  <label class="text-[10px] text-gray-400">Такси РФ, ₽</label>
                  <input type="number" id="logistics-taxi-rf" min="0" step="0.01" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
                </div>
              </div>
              <div class="text-[11px] text-gray-500 mt-1.5">Итого факт. расход: <span id="logistics-total" class="font-medium text-gray-700">0</span> ₽</div>

              <div id="logistics-shares-list" class="mt-2 space-y-2"></div>

              <button id="logistics-save-btn" class="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить сверку</button>
              <div id="logistics-error-text" class="text-xs text-red-500 hidden mt-1.5"></div>
            </div>
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
    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 5): ни одна из write-кнопок этого
    // экрана не блокировалась на время запроса — двойной тап на "Создать"
    // мог породить две коллективки подряд (тот же класс риска, что уже
    // 4+ раза находили в разных углах проекта).
    const createSaveBtn = document.getElementById('create-collective-save');
    createSaveBtn.addEventListener('click', async () => {
      if (createSaveBtn.disabled) return;
      const trackNumber = document.getElementById('new-collective-track').value.trim();
      createSaveBtn.disabled = true;
      try {
        await callServer('createCollective', { trackNumber });
        closeCreateModal();
        loadCollectives();
      } catch (error) {
        showSaveToast(false, 'Не удалось создать коллективку: ' + error.message);
      } finally {
        createSaveBtn.disabled = false;
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
        // Своя секция, свой try/catch внутри (loadLogisticsSection) — сбой
        // загрузки сверки не должен ронять остальную, уже загруженную модалку.
        await loadLogisticsSection(collectiveId);
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
          <button type="button" class="unassign-order-btn shrink-0 text-red-500" title="Убрать заказ из коллективки" data-order-id="${escapeHtmlClient(o.orderId)}">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        `;
        row.querySelector('.unassign-order-btn').addEventListener('click', async () => {
          try {
            await callServer('unassignOrderFromCollective', o.orderId);
            const details = await callServer('getCollectiveDetails', currentDetailId);
            renderOrdersList(details.orders);
            loadLogisticsSection(currentDetailId); // состав заказов сменился — сверка тоже должна обновиться
            loadCollectives();
          } catch (error) {
            showSaveToast(false, 'Не удалось отвязать заказ: ' + error.message);
          }
        });
        detailOrderList.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    // --- Сверка логистики (21.08.2026) — сумма факт. расхода (СДЭК/такси КЗ/
    // такси РФ) разбивается между заказами коллективки взаимосвязанными
    // ползунками (сумма долей всегда 100% — перетягивание одного пропорционально
    // подстраивает остальные), с живым предпросмотром разницы к уже учтённой
    // оценке ДО сохранения. Пересчёт при движении ползунка/вводе суммы — чисто
    // на фронте (не ходит на сервер), сервер — только на "Сохранить сверку".
    let logisticsOrders = []; // [{orderId, productDisplay, clientDisplay, alreadyEstimated, lastShare}]
    let logisticsShares = []; // [{orderId, percent}], параллельно logisticsOrders

    function round1(v) { return Math.round(v * 10) / 10; }

    // Последний элемент "прочих" гасит погрешность округления — сумма долей
    // всегда РОВНО 100, без дрейфа на десятые доли процента.
    function normalizeSharesSum(shares) {
      if (shares.length === 0) return;
      const sumExceptLast = shares.slice(0, -1).reduce((s, x) => s + x.percent, 0);
      shares[shares.length - 1].percent = round1(100 - sumExceptLast);
    }

    async function loadLogisticsSection(collectiveId) {
      const sdekInput = document.getElementById('logistics-sdek');
      const taxiKzInput = document.getElementById('logistics-taxi-kz');
      const taxiRfInput = document.getElementById('logistics-taxi-rf');
      const listContainer2 = document.getElementById('logistics-shares-list');

      try {
        const context = await callServer('getCollectiveLogisticsContext', collectiveId);
        logisticsOrders = context.orders;

        const costs = context.actualLogisticsCosts || { sdekCost: 0, taxiKzCost: 0, taxiRfCost: 0 };
        sdekInput.value = costs.sdekCost || '';
        taxiKzInput.value = costs.taxiKzCost || '';
        taxiRfInput.value = costs.taxiRfCost || '';

        if (logisticsOrders.length === 0) {
          logisticsShares = [];
          listContainer2.innerHTML = '<div class="text-xs text-gray-400 py-1">Нет заказов для сверки</div>';
          document.getElementById('logistics-save-btn').disabled = true;
          updateLogisticsPreview();
          return;
        }
        document.getElementById('logistics-save-btn').disabled = false;

        const totalCost = (costs.sdekCost || 0) + (costs.taxiKzCost || 0) + (costs.taxiRfCost || 0);
        if (totalCost > 0) {
          // Сверка уже проводилась — восстанавливаем доли, которые дали
          // именно lastShare при том totalCost (предзаполнение для правки).
          logisticsShares = logisticsOrders.map(o => ({ orderId: o.orderId, percent: round1((o.lastShare / totalCost) * 100) }));
        } else {
          const equal = round1(100 / logisticsOrders.length);
          logisticsShares = logisticsOrders.map(o => ({ orderId: o.orderId, percent: equal }));
        }
        normalizeSharesSum(logisticsShares);

        renderLogisticsShares();
        updateLogisticsPreview();
      } catch (error) {
        listContainer2.innerHTML = `<div class="text-xs text-red-500">Не удалось загрузить сверку: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderLogisticsShares() {
      const container = document.getElementById('logistics-shares-list');
      container.innerHTML = logisticsOrders.map(o => {
        const share = logisticsShares.find(s => s.orderId === o.orderId);
        const percent = share ? share.percent : 0;
        return `
          <div class="p-2 bg-gray-50 rounded-lg text-xs" data-order-id="${escapeHtmlClient(o.orderId)}">
            <div class="flex items-center justify-between gap-2">
              <div class="truncate font-medium text-gray-800">${escapeHtmlClient(o.productDisplay)} — ${escapeHtmlClient(o.clientDisplay || 'без клиента')}</div>
              <div class="shrink-0 font-semibold text-indigo-600 logistics-percent-label">${percent}%</div>
            </div>
            <input type="range" min="0" max="100" step="0.5" value="${percent}" class="logistics-slider w-full mt-1">
            <div class="flex items-center justify-between text-[11px] text-gray-400 mt-0.5">
              <span>Оценка: ${o.alreadyEstimated.toLocaleString('ru-RU')} ₽</span>
              <span class="logistics-diff-label">—</span>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-order-id]').forEach(row => {
        const slider = row.querySelector('.logistics-slider');
        slider.addEventListener('input', () => {
          redistributeShares(row.dataset.orderId, parseFloat(slider.value) || 0);
          updateSliderPositions(row.dataset.orderId);
          updateLogisticsPreview();
        });
      });
    }

    // Перетягивание одного ползунка пропорционально подстраивает остальные —
    // сумма долей всегда остаётся 100% (не просто числа, которые нужно
    // вручную свести к 100, как в "Долях выплат" на экране "Настройки").
    function redistributeShares(changedOrderId, rawNewValue) {
      const idx = logisticsShares.findIndex(s => s.orderId === changedOrderId);
      if (idx === -1) return;
      const n = logisticsShares.length;
      const newValue = Math.max(0, Math.min(100, rawNewValue));

      if (n === 1) {
        logisticsShares[0].percent = 100;
        return;
      }

      const otherIdx = logisticsShares.map((_, i) => i).filter(i => i !== idx);
      const remaining = round1(100 - newValue);
      const othersSum = otherIdx.reduce((s, i) => s + logisticsShares[i].percent, 0);

      if (othersSum <= 0) {
        const equal = remaining / otherIdx.length;
        otherIdx.forEach(i => { logisticsShares[i].percent = round1(equal); });
      } else {
        otherIdx.forEach(i => { logisticsShares[i].percent = round1(remaining * (logisticsShares[i].percent / othersSum)); });
      }
      logisticsShares[idx].percent = newValue;

      const drift = round1(100 - logisticsShares.reduce((s, x) => s + x.percent, 0));
      if (drift !== 0) {
        const fixIdx = otherIdx[otherIdx.length - 1];
        logisticsShares[fixIdx].percent = round1(logisticsShares[fixIdx].percent + drift);
      }
    }

    // Обновляет позиции/подписи ОСТАЛЬНЫХ ползунков, не трогая DOM того,
    // который сейчас реально тянет пользователь — полная перерисовка
    // (innerHTML) на каждое 'input'-событие пересоздала бы его узел и
    // оборвала бы перетягивание на середине жеста.
    function updateSliderPositions(activeOrderId) {
      document.querySelectorAll('#logistics-shares-list [data-order-id]').forEach(row => {
        const orderId = row.dataset.orderId;
        const share = logisticsShares.find(s => s.orderId === orderId);
        if (!share) return;
        row.querySelector('.logistics-percent-label').textContent = share.percent + '%';
        if (orderId !== activeOrderId) {
          row.querySelector('.logistics-slider').value = share.percent;
        }
      });
    }

    function updateLogisticsPreview() {
      const sdek = parseFloat(document.getElementById('logistics-sdek').value) || 0;
      const taxiKz = parseFloat(document.getElementById('logistics-taxi-kz').value) || 0;
      const taxiRf = parseFloat(document.getElementById('logistics-taxi-rf').value) || 0;
      const total = Math.round((sdek + taxiKz + taxiRf) * 100) / 100;
      document.getElementById('logistics-total').textContent = total.toLocaleString('ru-RU');

      document.querySelectorAll('#logistics-shares-list [data-order-id]').forEach(row => {
        const orderId = row.dataset.orderId;
        const order = logisticsOrders.find(o => o.orderId === orderId);
        const share = logisticsShares.find(s => s.orderId === orderId);
        const label = row.querySelector('.logistics-diff-label');
        if (!order || !share || !label) return;

        const shareAmount = Math.round(total * share.percent / 100 * 100) / 100;
        const diff = Math.round((shareAmount - order.alreadyEstimated) * 100) / 100;

        if (diff > 0) {
          label.textContent = `Доля: ${shareAmount.toLocaleString('ru-RU')} ₽ (+${diff.toLocaleString('ru-RU')} к оценке)`;
          label.className = 'logistics-diff-label text-amber-600';
        } else if (diff < 0) {
          label.textContent = `Доля: ${shareAmount.toLocaleString('ru-RU')} ₽ (переплата ${Math.abs(diff).toLocaleString('ru-RU')} ₽)`;
          label.className = 'logistics-diff-label text-red-500';
        } else {
          label.textContent = `Доля: ${shareAmount.toLocaleString('ru-RU')} ₽ (совпадает с оценкой)`;
          label.className = 'logistics-diff-label text-gray-400';
        }
      });
    }

    ['logistics-sdek', 'logistics-taxi-kz', 'logistics-taxi-rf'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateLogisticsPreview);
    });

    const logisticsSaveBtn = document.getElementById('logistics-save-btn');
    const logisticsErrorText = document.getElementById('logistics-error-text');
    logisticsSaveBtn.addEventListener('click', async () => {
      if (logisticsSaveBtn.disabled) return;
      logisticsErrorText.classList.add('hidden');

      if (logisticsShares.length === 0) {
        logisticsErrorText.textContent = 'В коллективке нет заказов для сверки.';
        logisticsErrorText.classList.remove('hidden');
        return;
      }

      const sdekCost = parseFloat(document.getElementById('logistics-sdek').value) || 0;
      const taxiKzCost = parseFloat(document.getElementById('logistics-taxi-kz').value) || 0;
      const taxiRfCost = parseFloat(document.getElementById('logistics-taxi-rf').value) || 0;

      logisticsSaveBtn.disabled = true;
      try {
        await callServer('saveCollectiveLogisticsReconciliation', currentDetailId, {
          sdekCost, taxiKzCost, taxiRfCost, shares: logisticsShares
        });
        showSaveToast(true, 'Сверка логистики сохранена');
        await loadLogisticsSection(currentDetailId); // перезагрузка — lastShare теперь отражает только что сохранённое
      } catch (error) {
        logisticsErrorText.textContent = error.message;
        logisticsErrorText.classList.remove('hidden');
        showSaveToast(false, 'Не удалось сохранить сверку: ' + error.message);
      } finally {
        logisticsSaveBtn.disabled = false;
      }
    });

    const detailSaveBtn = document.getElementById('detail-save-btn');
    detailSaveBtn.addEventListener('click', async () => {
      if (detailSaveBtn.disabled) return;
      detailSaveBtn.disabled = true;
      try {
        await callServer('updateCollective', currentDetailId, { trackNumber: detailTrack.value.trim(), status: detailStatus.value });
        loadCollectives();
        showSaveToast(true, 'Коллективка обновлена');
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
        showSaveToast(false, `Не удалось сохранить: ${error.message}`);
      } finally {
        detailSaveBtn.disabled = false;
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
              loadLogisticsSection(currentDetailId); // состав заказов сменился — сверка тоже должна обновиться
              loadCollectives();
            } catch (error) {
              showSaveToast(false, 'Не удалось добавить заказ: ' + error.message);
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

    const detailDeleteBtn = document.getElementById('detail-delete-btn');
    detailDeleteBtn.addEventListener('click', async () => {
      if (detailDeleteBtn.disabled) return;
      if (!(await showConfirmModal(`Удалить коллективку «${currentDetailId}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
      detailDeleteBtn.disabled = true;
      try {
        await callServer('deleteCollective', currentDetailId);
        closeDetailModal();
        loadCollectives();
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
      } finally {
        detailDeleteBtn.disabled = false;
      }
    });
  }
};
