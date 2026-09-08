'use strict';

/**
 * Модалка «клиент не указан» — Фаза E (§6 IMPLEMENTATION-PLAN-CART-UX.md,
 * 07.09.2026). Общий модуль по образцу `_delete-order-modal.js` (список +
 * обязательный выбор по КАЖДОЙ строке, кнопка подтверждения неактивна, пока
 * выбор не сделан по всем).
 *
 * Раньше пустой клиент без «Личного заказа» тихо уходил в `createCart` как
 * заявка без плательщика (репорт из плана — "заявка тихо уходит с пустым
 * клиентом"). Теперь `saveCart()` (`cart-new.js`) собирает такие заявки
 * ПЕРЕД отправкой (`item.getUnresolvedClientRows()`/`lotItem.
 * getUnresolvedClientRows()`, см. их JSDoc в `_cart-position.js`/
 * `_cart-lot.js`) и требует явного решения по каждой.
 *
 * **«На продаже» (IMPLEMENTATION-PLAN-ON-SALE.md, 08.09.2026)** — второй
 * рабочий выбор, статус существует. Не `isOwnPurchase`/`client_kind='own'`
 * — заявка уходит с `statusOrder:'На продаже'`, признаётся расходом сразу
 * (`costService.syncCogsRecognition`), клиент назначается позже правкой
 * того же заказа.
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${ClientRequiredModal.html()}`;
 *   const modal = ClientRequiredModal.init();
 *   const resolutions = await modal.open(rows); // rows: {id, label}[]
 *   if (!resolutions) return; // отменено — сохранение прервано целиком
 *   // resolutions: {id, kind:'own'|'on_sale'}[]
 */
window.ClientRequiredModal = {
  html() {
    return `
      <div id="client-required-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Клиент не указан</h2>
            <button id="client-required-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto">
            <p class="text-xs text-gray-500 mb-3">По каждой заявке ниже не выбран клиент и не отмечено «Личный заказ». Выберите, чем это является, прежде чем сохранить корзину.</p>
            <div id="client-required-row-list" class="space-y-2"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="client-required-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Вернуться к правке</button>
            <button id="client-required-modal-confirm" disabled class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Продолжить</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @returns {{ open: (rows:{id:string,label:string}[]) => Promise<{id:string,kind:'own'}[]|null> }}
   *   null — отменено (крестик/клик мимо/«Вернуться к правке»), сохранение
   *   должно прерваться целиком, ничего применять не нужно.
   */
  init() {
    let choices = new Map(); // id -> 'own'
    let rowIds = [];
    let resolveFn = null;

    function close(result) {
      document.getElementById('client-required-modal').classList.add('hidden');
      document.getElementById('client-required-modal').classList.remove('flex');
      if (resolveFn) { resolveFn(result); resolveFn = null; }
    }

    function updateConfirmState() {
      const confirmBtn = document.getElementById('client-required-modal-confirm');
      confirmBtn.disabled = !rowIds.every((id) => choices.has(id));
    }

    function renderList(rows) {
      const list = document.getElementById('client-required-row-list');
      list.innerHTML = rows.map((r) => `
        <div class="border border-gray-200 rounded-xl p-3" data-row-id="${r.id}">
          <div class="text-sm text-gray-800 mb-2 truncate">${escapeHtmlClient(r.label)}</div>
          <div class="flex gap-2">
            <button type="button" data-kind="own" class="client-required-choice-btn flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Личный заказ (на менеджера)</button>
            <button type="button" data-kind="on_sale" class="client-required-choice-btn flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">На продаже</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.client-required-choice-btn:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('[data-row-id]');
          const id = card.dataset.rowId;
          const kind = btn.dataset.kind;
          choices.set(id, kind);
          card.querySelectorAll('.client-required-choice-btn').forEach((b) => {
            const active = b.dataset.kind === kind;
            b.classList.toggle('border-indigo-500', active);
            b.classList.toggle('bg-indigo-50', active);
            b.classList.toggle('text-indigo-600', active && !b.disabled);
            b.classList.toggle('border-gray-200', !active);
            b.classList.toggle('text-gray-500', !active && !b.disabled);
          });
          updateConfirmState();
        });
      });

      if (window.lucide) window.lucide.createIcons();
    }

    function open(rows) {
      return new Promise((resolve) => {
        choices = new Map();
        rowIds = rows.map((r) => r.id);
        resolveFn = resolve;
        renderList(rows);
        updateConfirmState();
        document.getElementById('client-required-modal').classList.remove('hidden');
        document.getElementById('client-required-modal').classList.add('flex');
      });
    }

    document.getElementById('client-required-modal-close').addEventListener('click', () => close(null));
    document.getElementById('client-required-modal-cancel').addEventListener('click', () => close(null));

    document.getElementById('client-required-modal-confirm').addEventListener('click', () => {
      if (!rowIds.every((id) => choices.has(id))) return;
      const resolutions = rowIds.map((id) => ({ id, kind: choices.get(id) }));
      close(resolutions);
    });

    return { open };
  }
};
