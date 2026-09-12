'use strict';

/**
 * Массовая смена "Статус заказа" (Волна 6, находка 5, IMPLEMENTATION-PLAN-
 * ROLES-AND-NOTIFICATIONS.md §6, 11.09.2026) — тот же "Выбрать"/
 * bulk-actions-bar на orders.js, что уже даёт "Сменить статус" (доставки,
 * `_delivery-status-modal.js`), только для ДРУГОГО поля и БЕЗ её сложности:
 * "Статус заказа" не имеет позиции/лестницы (см. JSDoc
 * `ordersService.setOrdersStatusOrder`), поэтому здесь нет ни списка "не
 * готовы", ни кнопки "Всё равно перевести" — одно подтверждение сразу
 * применяет статус ко всей выборке. Специально НЕ переиспользует
 * `DeliveryStatusModal` (та вся построена вокруг гейта долга/готовности,
 * которого здесь нет) — отдельный, короткий модуль, тот же паттерн, что
 * `_purchase-event-modal.js`/`_writeoff-modal.js`.
 */
window.StatusOrderModal = {
  html() {
    return `
      <div id="status-order-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Сменить статус заказа</h2>
            <button type="button" id="status-order-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p class="text-xs text-gray-500">Выбрано заказов: <span id="status-order-count">0</span></p>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Новый статус</label>
              <select id="status-order-select" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></select>
            </div>
          </div>
          <div class="p-4 border-t border-gray-100">
            <button type="button" id="status-order-apply-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed" disabled>Применить</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{onApplied: (result:{changed:string[], failed:{orderId:string,reason:string}[]}) => void, getStatusDictionary: () => Promise<string[]>}} opts
   *   `getStatusDictionary` — ленивая загрузка справочника (один запрос на
   *   первое открытие модалки, тот же приём, что DeliveryStatusModal).
   * @returns {{open: (orderIds:string[]) => Promise<void>}}
   */
  init({ onApplied, getStatusDictionary }) {
    const modal = document.getElementById('status-order-modal');
    const closeBtn = document.getElementById('status-order-close');
    const select = document.getElementById('status-order-select');
    const countEl = document.getElementById('status-order-count');
    const applyBtn = document.getElementById('status-order-apply-btn');

    let orderIds = [];
    let statusesCache = null;

    function close() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    closeBtn.addEventListener('click', close);
    select.addEventListener('change', () => { applyBtn.disabled = select.value === ''; });

    applyBtn.addEventListener('click', async () => {
      // Guard-check + disabled ДО любой асинхронной работы (в т.ч. до самого
      // showConfirmModal, не только до callServer) — найдено code-review
      // 11.09.2026: без этого двойной клик/двойное срабатывание событие
      // успевает открыть showConfirmModal ДВАЖДЫ до того, как кнопка
      // реально заблокируется, и оба подтверждения дали бы два параллельных
      // callServer('setOrdersStatusOrder', ...) — тот же класс бага, что
      // fail-safe чек-лист проекта (frontend-contract.md) требует закрывать
      // на КАЖДОЙ новой кнопке записи, и который сестринская
      // _delivery-status-modal.js уже закрывает (disabled — первая строка
      // обработчика).
      if (applyBtn.disabled) return;
      const status = select.value;
      if (!status || orderIds.length === 0) return;
      applyBtn.disabled = true;

      try {
        // Числовое подтверждение (то же правило, что DeliveryStatusModal —
        // "Общие правила" промта Э5: подтверждение массового действия
        // всегда с конкретными числами, не голым "Применить"). Здесь нет
        // гейта долга/готовности, поэтому подтверждение ровно одно, без
        // второго "Всё равно" шага.
        const confirmed = await showConfirmModal(
          `Статус заказа «${status}» будет установлен для ${orderIds.length} заказ(ов). Продолжить?`
        );
        if (!confirmed) { applyBtn.disabled = false; return; }

        const result = await callServer('setOrdersStatusOrder', orderIds, status);
        close();
        onApplied(result);
      } catch (error) {
        showSaveToast(false, 'Не удалось сменить статус заказа: ' + error.message);
        applyBtn.disabled = false;
      }
    });

    return {
      async open(ids) {
        orderIds = ids || [];
        countEl.textContent = orderIds.length;
        applyBtn.disabled = true;
        if (!statusesCache) statusesCache = await getStatusDictionary();
        FormHelpers.populateSelect('#status-order-select', statusesCache);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    };
  }
};
