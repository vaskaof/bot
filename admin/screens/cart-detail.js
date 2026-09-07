'use strict';

/**
 * Экран "Карточка корзины" (Фаза F, IMPLEMENTATION-PLAN-CART-UX.md §7,
 * 07.09.2026) — read-only, тот же паттерн, что `lot-detail.js`: шапка
 * (валюта/дата/карго/итоги — канал/аккаунт закупки НЕ показаны, тот же
 * набор полей, что уже опущен в `lot-detail.js`'s шапке) + список заявок,
 * клик по заявке ведёт на `orders/{id}/edit` (донастройка отдельного заказа
 * — обычным редактированием, маршрут не отличается от любого другого).
 *
 * Отличие от лота (F2, §7 плана) — три блока, которых у `lot-detail.js` нет:
 * "План против факта" (сохранённый при создании «Итог с сайта выкупа» ПРОТИВ
 * суммы уже известных цен заявок сейчас), "Уже оплачено"/"Осталось" (реальный
 * ledger-баланс, не оценка) и "По клиентам" (та же ментальная модель, что
 * липкая панель `cart-new.js` показывает ДО сохранения — теперь и ПОСЛЕ, см.
 * `cartsService.getCartDetails` JSDoc). Кнопка "Факт выкупа" (F3) открывает
 * `CartPurchaseEventModal`.
 */
window.Screens = window.Screens || {};
window.Screens.cartDetail = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Корзина #${escapeHtmlClient(params.cartId || '')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button type="button" id="cart-purchase-event-btn" title="Факт выкупа" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="banknote" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => navigateBack('carts'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="cart-loading" class="text-center text-sm text-gray-400 py-10">Загрузка…</div>
        <div id="cart-content" class="hidden">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div class="text-[11px] text-gray-400">Валюта</div>
                <div id="cart-currency" class="font-semibold text-gray-900"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Дата выкупа</div>
                <div id="cart-purchase-date" class="font-medium text-gray-700"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Карго</div>
                <div id="cart-cargo" class="font-medium text-gray-700"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Заявок</div>
                <div id="cart-entry-count" class="font-medium text-gray-700"></div>
              </div>
            </div>
          </div>

          <!-- "План против факта" (F2) — видно только если корзина создавалась
               с "Итогом с сайта выкупа" (plannedTotalAmountInCurrency != null). -->
          <div id="cart-plan-fact-block" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div class="text-[11px] text-gray-400 mb-1">План против факта (Итог с сайта выкупа)</div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500">План: <span id="cart-plan-amount" class="font-medium text-gray-800"></span></span>
              <span class="text-gray-500">Факт: <span id="cart-fact-amount" class="font-medium text-gray-800"></span></span>
            </div>
            <div id="cart-plan-fact-diff" class="mt-1 text-[11px]"></div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div class="text-[11px] text-gray-400 mb-2">Деньги клиентов</div>
            <div class="grid grid-cols-2 gap-3 text-sm mb-2">
              <div>
                <div class="text-[11px] text-gray-400">Уже оплачено</div>
                <div id="cart-total-paid" class="font-semibold text-emerald-700"></div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Осталось получить</div>
                <div id="cart-total-remaining" class="font-semibold text-gray-900"></div>
              </div>
            </div>
            <div id="cart-client-breakdown" class="space-y-1.5"></div>
            <div id="cart-no-clients" class="hidden text-[12px] text-gray-400">Нет заявок с клиентом (все — личные).</div>
          </div>

          <div id="cart-orders-list"></div>
        </div>
      </main>

      ${CartPurchaseEventModal.html()}
    `;

    const purchaseEventModal = CartPurchaseEventModal.init({
      onRecorded: () => load()
    });
    document.getElementById('cart-purchase-event-btn').addEventListener('click', () => {
      if (!currentCartDetails) return;
      purchaseEventModal.open(currentCartDetails.cartId, currentCartDetails.currency);
    });

    let currentCartDetails = null;

    function formatMoney(n) {
      return `${Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
    }

    async function load() {
      try {
        const details = await callServer('getCartDetails', params.cartId);
        currentCartDetails = details;
        document.getElementById('cart-loading').classList.add('hidden');
        document.getElementById('cart-content').classList.remove('hidden');

        document.getElementById('cart-currency').textContent = details.currency;
        document.getElementById('cart-purchase-date').textContent = details.purchaseDate || '—';
        document.getElementById('cart-cargo').textContent = details.cargo || '—';
        document.getElementById('cart-entry-count').textContent =
          `${details.summary.orderCount} заказ(ов)${details.summary.lotCount > 0 ? `, ${details.summary.lotCount} лот(ов)` : ''}`;

        // "План против факта" (F2) — та же логика бейджа расхождения, что
        // `cart-new.js`'s липкая панель показывает ДО сохранения (§4 C1).
        const planFactBlock = document.getElementById('cart-plan-fact-block');
        if (details.plannedTotalAmountInCurrency !== null && details.plannedTotalAmountInCurrency !== undefined) {
          planFactBlock.classList.remove('hidden');
          const plan = details.plannedTotalAmountInCurrency;
          const fact = details.summary.totalAmountInCurrency;
          document.getElementById('cart-plan-amount').textContent = `${plan} ${details.currency}`;
          document.getElementById('cart-fact-amount').textContent = `${fact} ${details.currency}`;
          const diff = Math.round((fact - plan) * 100) / 100;
          const diffEl = document.getElementById('cart-plan-fact-diff');
          if (Math.abs(diff) < 0.01) {
            diffEl.textContent = 'Совпадает';
            diffEl.className = 'mt-1 text-[11px] text-emerald-600';
          } else {
            diffEl.textContent = `Расхождение: ${diff > 0 ? '+' : ''}${diff} ${details.currency}`;
            diffEl.className = 'mt-1 text-[11px] text-amber-600';
          }
        } else {
          planFactBlock.classList.add('hidden');
        }

        document.getElementById('cart-total-paid').textContent = formatMoney(details.summary.totalPaidRub);
        document.getElementById('cart-total-remaining').textContent = formatMoney(details.summary.totalRemainingRub);

        const breakdownEl = document.getElementById('cart-client-breakdown');
        breakdownEl.innerHTML = '';
        document.getElementById('cart-no-clients').classList.toggle('hidden', details.clientBreakdown.length > 0);
        details.clientBreakdown.forEach((c) => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between text-[12px] bg-gray-50 rounded-lg px-2.5 py-1.5';
          row.innerHTML = `
            <span class="text-gray-700 truncate">${escapeHtmlClient(c.clientLabel)}</span>
            <span class="text-gray-500 shrink-0">оплачено ${formatMoney(c.paidRub)} · осталось ${formatMoney(c.remainingRub)}</span>
          `;
          breakdownEl.appendChild(row);
        });

        const listEl = document.getElementById('cart-orders-list');
        listEl.innerHTML = '';
        details.orders.forEach((o) => {
          const card = document.createElement('div');
          card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
          card.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`));
          card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(o.productOriginal)}</div>
                <div class="text-[13px] text-gray-500 mt-0.5">${o.isOwnPurchase ? 'Личный заказ' : escapeHtmlClient(o.clientName || o.username || 'Клиент не привязан')}</div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-[13px] font-semibold text-gray-900">${o.amountInCurrency !== null ? o.amountInCurrency : '—'} ${escapeHtmlClient(o.currency || '')}</div>
                <div class="text-[11px] text-gray-400">комиссия ${o.bookingCommission !== null ? o.bookingCommission : 0} ₽</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${o.lotId ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">лот #${escapeHtmlClient(o.lotId)}</span>` : ''}
              ${o.statusOrder ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">${escapeHtmlClient(o.statusOrder)}</span>` : ''}
              ${o.statusDelivery ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">${escapeHtmlClient(o.statusDelivery)}</span>` : ''}
            </div>
          `;
          listEl.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        document.getElementById('cart-loading').textContent = `Не удалось загрузить корзину: ${error.message}`;
      }
    }
    load();

    if (window.lucide) window.lucide.createIcons();
  }
};
