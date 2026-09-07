'use strict';

/**
 * Модалка "Факт выкупа по корзине" (Фаза F, IMPLEMENTATION-PLAN-CART-UX.md
 * §7 F3, 07.09.2026) — паттерн модуля тот же, что `_purchase-event-modal.js`
 * (html()+init({...})->{open}), но списывает НЕ по одному заказу, а сразу по
 * всем ещё не выкупленным заявкам корзины (`recordCartPurchaseEvent`,
 * backend-only с фазы 2, ни одна строка фронтенда не вызывала его до этого
 * экрана). Валюта — из шапки корзины (одновалютная, `open()` получает её как
 * есть, менеджер её не выбирает — в отличие от одиночного заказа, где валюта
 * заказа могла отличаться от факта выкупа).
 *
 * **Дедуп повторного запроса — НЕ через `requestId`** (в отличие от
 * `_writeoff-modal.js`), сознательное решение: `cartsService.
 * recordCartPurchaseEvent` САМА исключает заявки, у которых уже есть
 * `purchase_event`, запросом `getOrderIdsWithPurchaseEvents` В НАЧАЛЕ
 * каждого вызова — если `callServer`'s собственный ретрай (`withRetries`)
 * повторяет тот же запрос после сетевого сбоя, но предыдущий вызов на
 * сервере уже записал часть/все проводки, повтор увидит их уже
 * зафиксированными и пропустит (см. `alreadyRecordedCount` в ответе) —
 * тот же класс защиты, что requestId даёт `_writeoff-modal.js`, только
 * через идемпотентность по состоянию, а не по явному ключу. Кнопка всё
 * равно блокируется на время запроса (fail-safe чек-лист, п.1
 * frontend-contract.md) — вторая линия защиты от двойного тапа ДО того,
 * как первый запрос вообще ушёл.
 */
window.CartPurchaseEventModal = {
  html() {
    return `
      <div id="cart-purchase-event-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div class="inline-flex items-center gap-1">
              <div>
                <h2 class="text-base font-semibold text-gray-900">Факт выкупа по корзине</h2>
                <span id="cpe-cart-id" class="text-[11px] text-gray-400"></span>
              </div>
              ${helpIcon('Что делает «Факт выкупа»', '<p>Списывает потраченную на корзину валюту с тенгового кошелька по текущему курсу WAC и записывает реальную себестоимость по КАЖДОЙ ещё не выкупленной заявке корзины — заявки, у которых факт выкупа уже есть, пропускаются автоматически, повторный запуск безопасен.</p><p>Разница между внесённой суммой и уже известными ценами заявок делится между ними поровну.</p>')}
            </div>
            <button id="cpe-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-3">
            <p class="text-xs text-gray-500">Спишет тенге со счёта по текущему курсу WAC-кошелька и посчитает себестоимость по всем ещё не выкупленным заявкам корзины.</p>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Количество к валюте (<span id="cpe-currency-label"></span>)</label>
              <input type="number" id="cpe-amount-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Списано тенге</label>
              <input type="number" id="cpe-kzt-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Примечание (необязательно)</label>
              <input type="text" id="cpe-note-input" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" maxlength="300">
            </div>
            <div id="cpe-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2"></div>
            <div id="cpe-result" class="hidden text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="cpe-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Закрыть</button>
            <button id="cpe-modal-submit" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Записать факт выкупа</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onRecorded?: (result:{cartId:string, alreadyRecordedCount:number, results:Array}) => void }} options
   * @returns {{ open: (cartId:string, currency:string) => void }}
   */
  init({ onRecorded } = {}) {
    let currentCartId = null;

    function close() {
      document.getElementById('cart-purchase-event-modal').classList.add('hidden');
      document.getElementById('cart-purchase-event-modal').classList.remove('flex');
    }

    function resetFeedback() {
      document.getElementById('cpe-error').classList.add('hidden');
      document.getElementById('cpe-result').classList.add('hidden');
    }

    function showError(message) {
      const el = document.getElementById('cpe-error');
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function showResult(result) {
      const el = document.getElementById('cpe-result');
      const okCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.filter((r) => !r.success).length;
      const lines = [`Записано: ${okCount} из ${result.results.length}`];
      if (result.alreadyRecordedCount > 0) lines.push(`Уже было выкуплено ранее: ${result.alreadyRecordedCount}`);
      if (failCount > 0) {
        lines.push(`Не удалось: ${failCount}`);
        result.results.filter((r) => !r.success).forEach((r) => lines.push(`— ${escapeHtmlClient(r.orderId)}: ${escapeHtmlClient(r.error)}`));
      }
      el.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
      el.classList.remove('hidden');
    }

    function open(cartId, currency) {
      currentCartId = cartId;
      resetFeedback();
      document.getElementById('cpe-cart-id').textContent = `Корзина ID: ${cartId}`;
      document.getElementById('cpe-currency-label').textContent = currency || '';
      document.getElementById('cpe-amount-input').value = '';
      document.getElementById('cpe-kzt-input').value = '';
      document.getElementById('cpe-note-input').value = '';
      document.getElementById('cart-purchase-event-modal').classList.remove('hidden');
      document.getElementById('cart-purchase-event-modal').classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('cpe-modal-close').addEventListener('click', close);
    document.getElementById('cpe-modal-cancel').addEventListener('click', close);

    const submitBtn = document.getElementById('cpe-modal-submit');
    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      resetFeedback();
      const amountInCurrency = parseFloat(document.getElementById('cpe-amount-input').value);
      const kztDebited = parseFloat(document.getElementById('cpe-kzt-input').value);
      const note = document.getElementById('cpe-note-input').value.trim();
      if (!(amountInCurrency > 0)) { showError('«Количество к валюте» должно быть больше нуля.'); return; }
      if (!(kztDebited > 0)) { showError('«Списано тенге» должно быть больше нуля.'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Записываю...';
      try {
        const result = await callServer('recordCartPurchaseEvent', currentCartId, {
          amountInCurrency, kztDebited, note: note || undefined
        });
        showResult(result);
        if (onRecorded) onRecorded(result);
      } catch (error) {
        showError(error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Записать факт выкупа';
      }
    });

    return { open };
  }
};
