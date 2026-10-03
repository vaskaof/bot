'use strict';

/**
 * Экран "Карточка лота" — в основном read-only (delegated-spinning-rabbit.md,
 * 02.09.2026). Шапка лота по-прежнему неизменяема (план, раздел "Риски",
 * п.3) — донастройка отдельного заказа (сумма/комиссия) — обычным
 * редактированием заказа (`orders/{id}/edit`), маршрут не отличается от
 * любого другого. ИСКЛЮЧЕНИЕ, добавленное Этапом 4 плана "Лоты/ИИ"
 * (15.09.2026): бейдж "доля веса N" на карточке заказа теперь кликабелен —
 * та же узкая правка через `updateLotOrderWeight`, что и на `order-edit.js`
 * (см. её JSDoc в ordersService.js), не полноценный пересчёт всей шапки.
 */
window.Screens = window.Screens || {};
window.Screens.lotDetail = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Лот #${escapeHtmlClient(params.lotId || '')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => navigateBack('purchases'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="lot-loading" class="text-center text-sm text-gray-400 py-10">Загрузка…</div>
        <div id="lot-content" class="hidden">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div class="text-[11px] text-gray-400">Общая стоимость</div>
                <div id="lot-total-amount" class="font-semibold text-gray-900"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Дата выкупа</div>
                <div id="lot-purchase-date" class="font-medium text-gray-700"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Карго</div>
                <div id="lot-cargo" class="font-medium text-gray-700"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Заказов</div>
                <div id="lot-order-count" class="font-medium text-gray-700"></div>
              </div>
            </div>
          </div>
          <!-- Волна 5 (03.10.2026, запрос VASY) — «Вес на весь лот»: общая
               стоимость карго делится по «доле веса» заказов, предпросмотр
               «было → станет» перед записью. -->
          <div class="bg-white rounded-2xl shadow-sm border border-amber-100 p-4 mb-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-[11px] text-gray-400">Вес (карго) по лоту сейчас</div>
                <div id="lot-weight-sum" class="font-semibold text-gray-900"></div>
              </div>
              <button type="button" id="lot-weight-open-btn" class="shrink-0 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-medium inline-flex items-center gap-1">
                <i data-lucide="weight" class="w-4 h-4"></i> Вес на весь лот
              </button>
            </div>
            <div id="lot-weight-form" class="hidden mt-3 pt-3 border-t border-gray-100">
              <label class="text-[11px] text-gray-500">Общая стоимость карго за лот, ₽</label>
              <div class="flex items-center gap-2 mt-1">
                <input type="number" id="lot-weight-total-input" class="w-full bg-amber-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01" min="0">
                <span class="text-xs text-gray-400">$</span>
                <input type="number" id="lot-weight-usd-input" class="w-20 bg-gray-50 rounded-lg px-2 py-1.5 text-xs outline-none" placeholder="0.00" step="0.01">
              </div>
              <div class="text-[11px] text-gray-400 mt-1">Делится по «доле веса» заказов (✎ на карточках ниже). Курс $: <span id="lot-weight-usd-rate">—</span> ₽</div>
              <div id="lot-weight-preview" class="mt-2 space-y-1"></div>
              <label class="flex items-center gap-2 mt-2 text-xs text-gray-600">
                <input type="checkbox" id="lot-weight-notify" class="w-4 h-4"> Сообщить клиентам об изменении суммы
              </label>
              <div class="flex gap-2 mt-2">
                <button type="button" id="lot-weight-cancel-btn" class="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm">Отмена</button>
                <button type="button" id="lot-weight-apply-btn" disabled class="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium disabled:opacity-40">Записать в заказы</button>
              </div>
            </div>
          </div>
          <div id="lot-orders-list"></div>
        </div>
      </main>
    `;

    async function load() {
      try {
        const details = await callServer('getLotDetails', params.lotId);
        document.getElementById('lot-loading').classList.add('hidden');
        document.getElementById('lot-content').classList.remove('hidden');

        document.getElementById('lot-total-amount').textContent = `${details.totalAmountInCurrency} ${details.currency}`;
        document.getElementById('lot-purchase-date').textContent = details.purchaseDate || '—';
        document.getElementById('lot-cargo').textContent = details.cargo || '—';
        document.getElementById('lot-order-count').textContent = details.summary.orderCount;
        const weightSum = details.orders.reduce((sum, o) => sum + (o.weightPrice || 0), 0);
        const weightMissing = details.orders.filter((o) => o.weightPrice === null).length;
        document.getElementById('lot-weight-sum').textContent = `${weightSum.toFixed(2)} ₽${weightMissing > 0 ? ` (у ${weightMissing} не задан)` : ''}`;

        const listEl = document.getElementById('lot-orders-list');
        listEl.innerHTML = '';
        details.orders.forEach((o) => {
          const card = document.createElement('div');
          card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
          card.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`));
          card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(o.productDisplay)}</div>
                <div class="text-[13px] text-gray-500 mt-0.5">${escapeHtmlClient(o.clientDisplay || 'Клиент не привязан')}</div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-[13px] font-semibold text-gray-900">${o.amountInCurrency !== null ? o.amountInCurrency : '—'} ${escapeHtmlClient(o.currency || '')}</div>
                <div class="text-[11px] text-gray-400">комиссия ${o.bookingCommission !== null ? o.bookingCommission : 0} ₽</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${o.statusOrder ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">${escapeHtmlClient(o.statusOrder)}</span>` : ''}
              ${o.statusDelivery ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">${escapeHtmlClient(o.statusDelivery)}</span>` : ''}
              <!-- Доп. раунд 02.09.2026 — lotCostWeight теперь ВСЕГДА заполнен
                   (доля участия в разнице между общей суммой лота и
                   известными ценами товаров, не "доля стоимости" в старом
                   смысле). -->
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">вес ${o.weightPrice !== null ? o.weightPrice.toFixed(2) + ' ₽' : 'не задан'}</span>
              ${o.lotCostWeight !== null ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">доля в общих тратах ${o.lotCostWeight}</span>` : ''}
              ${o.lotWeightCoefficient !== null ? `<button type="button" class="lot-weight-edit-badge text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium" data-order-id="${escapeHtmlClient(o.orderId)}" data-weight="${o.lotWeightCoefficient}">доля веса ${o.lotWeightCoefficient} ✎</button>` : ''}
            </div>
          `;
          // Этап 4 плана "Лоты/ИИ" (15.09.2026) — бейдж живёт внутри карточки,
          // на всю которую висит навигация на orders/{id}/edit (addEventListener
          // выше) — stopPropagation, иначе клик по бейджу уводил бы с экрана
          // вместо открытия модалки.
          const weightBadge = card.querySelector('.lot-weight-edit-badge');
          if (weightBadge) {
            weightBadge.addEventListener('click', async (e) => {
              e.stopPropagation();
              const raw = await showPromptModal('Доля веса лота (0 — не участвует, 1 — как у всех):', {
                defaultValue: weightBadge.dataset.weight,
                inputType: 'number'
              });
              if (raw === null) return;
              const value = parseFloat(raw);
              if (isNaN(value) || value < 0) { showSaveToast(false, 'Доля должна быть неотрицательным числом.'); return; }
              try {
                await callServer('updateLotOrderWeight', weightBadge.dataset.orderId, value);
                showSaveToast(true, 'Доля веса обновлена');
                load();
              } catch (error) {
                showSaveToast(false, 'Не удалось изменить долю веса: ' + error.message);
              }
            });
          }
          listEl.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        document.getElementById('lot-loading').textContent = `Не удалось загрузить лот: ${error.message}`;
      }
    }
    // «Вес на весь лот» (волна 5) — предпросмотр с сервера на каждый ввод
    // (с задержкой), запись — только кнопкой после предпросмотра.
    const weightForm = document.getElementById('lot-weight-form');
    const weightTotalInput = document.getElementById('lot-weight-total-input');
    const weightPreviewEl = document.getElementById('lot-weight-preview');
    const weightApplyBtn = document.getElementById('lot-weight-apply-btn');
    WeightUsd.wire(document.getElementById('lot-weight-usd-input'), weightTotalInput, document.getElementById('lot-weight-usd-rate'));
    let previewSeq = 0;
    function fmtRub(v) { return v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} ₽`; }
    document.getElementById('lot-weight-open-btn').addEventListener('click', () => {
      weightForm.classList.toggle('hidden');
      if (!weightForm.classList.contains('hidden')) weightTotalInput.focus();
    });
    document.getElementById('lot-weight-cancel-btn').addEventListener('click', () => {
      weightForm.classList.add('hidden');
      weightTotalInput.value = '';
      weightPreviewEl.innerHTML = '';
      weightApplyBtn.disabled = true;
    });
    weightTotalInput.addEventListener('input', debounce(async () => {
      const seq = ++previewSeq;
      const raw = weightTotalInput.value.trim();
      weightApplyBtn.disabled = true;
      if (raw === '' || !(parseFloat(raw) >= 0)) { weightPreviewEl.innerHTML = ''; return; }
      weightPreviewEl.innerHTML = '<div class="text-[11px] text-gray-400">Считаю…</div>';
      try {
        const rows = await callServer('previewApplyLotWeight', params.lotId, parseFloat(raw));
        if (seq !== previewSeq) return;
        weightPreviewEl.innerHTML = rows.map((r) => `
          <div class="flex items-center justify-between text-[12px] bg-gray-50 rounded-lg px-2.5 py-1.5">
            <span class="text-gray-700 truncate">${escapeHtmlClient(r.productDisplay || r.orderId)} <span class="text-gray-400">×${r.weightCoefficient}</span></span>
            <span class="shrink-0 ${r.before !== null && Math.abs(r.before - r.after) < 0.005 ? 'text-gray-400' : 'text-gray-800 font-medium'}">${fmtRub(r.before)} → ${fmtRub(r.after)}</span>
          </div>`).join('');
        weightApplyBtn.disabled = false;
      } catch (error) {
        if (seq !== previewSeq) return;
        weightPreviewEl.innerHTML = `<div class="text-[12px] text-red-500">${escapeHtmlClient(error.message)}</div>`;
      }
    }, 300));
    weightApplyBtn.addEventListener('click', async () => {
      const total = parseFloat(weightTotalInput.value);
      if (!(total >= 0)) return;
      weightApplyBtn.disabled = true;
      try {
        const result = await callServer('applyLotWeight', params.lotId, total, { notifyClients: document.getElementById('lot-weight-notify').checked });
        if (result.failed.length > 0) {
          showSaveToast(false, `Записано ${result.applied.length}, не удалось ${result.failed.length}: ${result.failed.map((f) => `${f.orderId} — ${f.reason}`).join('; ')}`);
        } else {
          showSaveToast(true, `Вес записан в ${result.applied.length} заказ(ов)`);
        }
        weightForm.classList.add('hidden');
        weightTotalInput.value = '';
        weightPreviewEl.innerHTML = '';
        load();
      } catch (error) {
        showSaveToast(false, 'Не удалось записать вес: ' + error.message);
        weightApplyBtn.disabled = false;
      }
    });

    load();
    if (window.lucide) window.lucide.createIcons();
  }
};
