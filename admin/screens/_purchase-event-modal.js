'use strict';

/**
 * Модалка "Факт выкупа" (Э2 рефакторинга экономики, хвост "экран менеджера",
 * 25.08.2026, NEXT-SESSION-PROMPT-E2.md) — списывает тенге со счёта за
 * конкретный заказ и фиксирует себестоимость в рублях по WAC на момент
 * списания. Тот же паттерн модуля, что DeleteOrderModal/ManualClientModal
 * (html()+init({...})->{open}, подключается в order-edit.js).
 *
 * orderId/currency приходят из контекста уже открытого заказа (`open`) —
 * менеджер их не вводит руками, только валюту может поменять, если по факту
 * платили не в той, что стоит на заказе.
 *
 * Обе ошибки движка ("сначала внесите конвертацию"/"недостаточно тенге в
 * кошельке") — намеренный гейт (REFACTOR-ECONOMY-DDL.md §5 M2.2, "не
 * догадываться о WAC"), показываются текстом как есть, персистентно внутри
 * модалки (не toast — 4-секундного окна мало, чтобы менеджер успел прочитать
 * и решить, что делать: сначала внести конвертацию или уменьшить сумму).
 */
window.PurchaseEventModal = {
  html() {
    return `
      <div id="purchase-event-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h2 class="text-base font-semibold text-gray-900">Факт выкупа</h2>
              <span id="purchase-event-order-id" class="text-[11px] text-gray-400"></span>
            </div>
            <button id="purchase-event-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-3">
            <p class="text-xs text-gray-500">Спишет тенге со счёта по текущему курсу WAC-кошелька и посчитает себестоимость заказа в рублях.</p>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Валюта</label>
              <select id="pe-currency-select" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="Доллар">USD ($)</option>
                <option value="Юань">CNY (¥)</option>
                <option value="Евро">EUR (€)</option>
                <option value="Фунт">GBP (£)</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Количество к валюте</label>
              <input type="number" id="pe-amount-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Списано тенге</label>
              <input type="number" id="pe-kzt-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Примечание (необязательно)</label>
              <input type="text" id="pe-note-input" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" maxlength="300">
            </div>
            <div id="pe-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2"></div>
            <div id="pe-result" class="hidden text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="purchase-event-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Закрыть</button>
            <button id="purchase-event-modal-submit" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Записать факт выкупа</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onRecorded?: (result:{purchaseEventId:string, costActualRub:number, wacRateAtMoment:number, walletBalanceKztAfter:number, bufferFactPct:number|null}) => void }} options
   * @returns {{ open: (orderId:string, defaultCurrency?:string) => void }}
   */
  init({ onRecorded } = {}) {
    let currentOrderId = null;

    function close() {
      document.getElementById('purchase-event-modal').classList.add('hidden');
      document.getElementById('purchase-event-modal').classList.remove('flex');
    }

    function resetFeedback() {
      document.getElementById('pe-error').classList.add('hidden');
      document.getElementById('pe-result').classList.add('hidden');
    }

    function showError(message) {
      const el = document.getElementById('pe-error');
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function showResult(result) {
      const el = document.getElementById('pe-result');
      const bufferLine = result.bufferFactPct === null
        ? 'Реализованный буфер появится, когда у заказа будет посчитан "Итог Руб".'
        : `Реализованный буфер по заказу: ${result.bufferFactPct.toFixed(2)}%`;
      el.innerHTML = `
        <div>Себестоимость заказа: <b>${result.costActualRub.toFixed(2)} ₽</b></div>
        <div>Курс WAC на момент списания: ${result.wacRateAtMoment.toFixed(4)} ₽/₸</div>
        <div>Остаток в кошельке: ${result.walletBalanceKztAfter.toFixed(2)} ₸</div>
        <div>${bufferLine}</div>
      `;
      el.classList.remove('hidden');
    }

    function open(orderId, defaultCurrency) {
      currentOrderId = orderId;
      resetFeedback();
      document.getElementById('purchase-event-order-id').textContent = `Заказ ID: ${orderId}`;
      document.getElementById('pe-currency-select').value = defaultCurrency || 'Доллар';
      document.getElementById('pe-amount-input').value = '';
      document.getElementById('pe-kzt-input').value = '';
      document.getElementById('pe-note-input').value = '';
      document.getElementById('purchase-event-modal').classList.remove('hidden');
      document.getElementById('purchase-event-modal').classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('purchase-event-modal-close').addEventListener('click', close);
    document.getElementById('purchase-event-modal-cancel').addEventListener('click', close);

    const submitBtn = document.getElementById('purchase-event-modal-submit');
    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      resetFeedback();
      const currency = document.getElementById('pe-currency-select').value;
      const amountInCurrency = parseFloat(document.getElementById('pe-amount-input').value);
      const kztDebited = parseFloat(document.getElementById('pe-kzt-input').value);
      const note = document.getElementById('pe-note-input').value.trim();
      if (!(amountInCurrency > 0)) { showError('«Количество к валюте» должно быть больше нуля.'); return; }
      if (!(kztDebited > 0)) { showError('«Списано тенге» должно быть больше нуля.'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Записываю...';
      try {
        const result = await callServer('recordPurchaseEvent', {
          orderId: currentOrderId, currency, amountInCurrency, kztDebited,
          note: note || undefined
        });
        showResult(result);
        if (onRecorded) onRecorded(result);
      } catch (error) {
        // Гейты движка (нет конвертации / не хватает тенге) — намеренные,
        // показываем текст ошибки как есть, не подменяем формулировку.
        showError(error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Записать факт выкупа';
      }
    });

    return { open };
  }
};
