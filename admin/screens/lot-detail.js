'use strict';

/**
 * Экран "Карточка лота" — read-only (delegated-spinning-rabbit.md,
 * 02.09.2026). В отличие от коллективки, у лота в первой волне НЕТ живого
 * пересчёта долей после создания (шапка лота неизменяема — план, раздел
 * "Риски", п.3) — здесь просто показывается, что получилось при создании;
 * донастройка отдельного заказа (сумма/комиссия) — обычным редактированием
 * заказа (`orders/{id}/edit`), маршрут не отличается от любого другого.
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
    document.getElementById('back-btn').addEventListener('click', () => navigateBack('lots'));

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
              ${o.lotCostWeight !== null ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">доля стоимости ${o.lotCostWeight}</span>` : `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">вручную</span>`}
              ${o.lotWeightCoefficient !== null ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">доля веса ${o.lotWeightCoefficient}</span>` : ''}
            </div>
          `;
          listEl.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        document.getElementById('lot-loading').textContent = `Не удалось загрузить лот: ${error.message}`;
      }
    }
    load();

    if (window.lucide) window.lucide.createIcons();
  }
};
