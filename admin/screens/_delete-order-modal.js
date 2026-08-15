'use strict';

/**
 * Модалка "решить оплаты и удалить заказ" (16.08.2026, "Удаление заказов
 * в админ-панели" — см. личную память Architect'а
 * project_bot_knopka_order_deletion) — общий модуль по образцу
 * ManualClientModal, подключается в order-edit.js.
 *
 * Список платежей (`payments`) — то, что вернул `getOrderDeletionPreview`:
 * `{id, date, amount, reason}[]`. Для КАЖДОГО активного платежа нужен явный
 * выбор "Удалить"/"В пул", кнопка подтверждения неактивна, пока выбор не
 * сделан по всем строкам — минимизация случайного/недодуманного удаления
 * (по прямому запросу VASY). Второе, финальное окно `confirm()` — уже в
 * order-edit.js, ПОСЛЕ закрытия этой модалки (двойной гейт).
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${DeleteOrderModal.html()}`;
 *   const deleteOrderModal = DeleteOrderModal.init({
 *     onConfirmed: (resolutions) => { ...deleteOrder(orderId, resolutions)... }
 *   });
 *   deleteOrderModal.open(payments, isNewModel); // из getOrderDeletionPreview
 */
window.DeleteOrderModal = {
  html() {
    return `
      <div id="delete-order-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Удаление заказа — оплаты</h2>
            <button id="delete-order-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto">
            <p class="text-xs text-gray-500 mb-3">По заказу есть активные оплаты. По каждой нужно решить: удалить совсем (ошибочный ввод) или оставить деньги в пуле клиента — они сами перейдут на другие открытые заказы.</p>
            <div id="delete-order-payment-list" class="space-y-2"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="delete-order-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="delete-order-modal-confirm" disabled class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Удалить заказ</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onConfirmed: (resolutions:{id:string, action:'delete'|'pool'}[]) => void }} options
   * @returns {{ open: (payments:{id:string,date:*,amount:number,reason:string}[], isNewModel:boolean) => void }}
   */
  init({ onConfirmed }) {
    let choices = new Map(); // id -> 'delete'|'pool'
    let paymentIds = [];

    function close() {
      document.getElementById('delete-order-modal').classList.add('hidden');
      document.getElementById('delete-order-modal').classList.remove('flex');
    }

    function updateConfirmState() {
      const confirmBtn = document.getElementById('delete-order-modal-confirm');
      const allChosen = paymentIds.every((id) => choices.has(id));
      confirmBtn.disabled = !allChosen;
    }

    function renderList(payments, isNewModel) {
      const list = document.getElementById('delete-order-payment-list');
      // Бронь — свой note-текст ("Бронь по заказу ...") — визуально не
      // выделяется отдельной секцией специальным кодом, разница видна
      // менеджеру прямо в подписи строки (см. личную память Architect'а —
      // "бронь естественно выделяется отдельной строкой, потому что у неё
      // свой text note", отдельная логика не нужна).
      // У old-model нет пула — только "Удалить" (по решению VASY, старые
      // заказы не считались новым платёжным движком, усложнять не нужно).
      list.innerHTML = payments.map((p) => `
        <div class="border border-gray-200 rounded-xl p-3" data-payment-id="${p.id}">
          <div class="flex items-baseline justify-between mb-2">
            <span class="text-sm font-medium text-gray-900">${Number(p.amount).toFixed(2)} ₽</span>
            <span class="text-xs text-gray-400">${p.date ? new Date(p.date).toLocaleDateString('ru-RU') : ''}</span>
          </div>
          <p class="text-xs text-gray-500 mb-2">${p.reason || ''}</p>
          <div class="flex gap-2">
            <button type="button" data-action="delete" class="delete-order-choice-btn flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Удалить</button>
            ${isNewModel ? '<button type="button" data-action="pool" class="delete-order-choice-btn flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">В пул</button>' : ''}
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.delete-order-choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('[data-payment-id]');
          const id = card.dataset.paymentId;
          const action = btn.dataset.action;
          choices.set(id, action);
          card.querySelectorAll('.delete-order-choice-btn').forEach((b) => {
            const active = b.dataset.action === action;
            b.classList.toggle('border-red-500', active && action === 'delete');
            b.classList.toggle('bg-red-50', active && action === 'delete');
            b.classList.toggle('text-red-600', active && action === 'delete');
            b.classList.toggle('border-indigo-500', active && action === 'pool');
            b.classList.toggle('bg-indigo-50', active && action === 'pool');
            b.classList.toggle('text-indigo-600', active && action === 'pool');
            b.classList.toggle('border-gray-200', !active);
            b.classList.toggle('text-gray-500', !active);
          });
          updateConfirmState();
        });
      });

      if (window.lucide) window.lucide.createIcons();
    }

    function open(payments, isNewModel) {
      choices = new Map();
      paymentIds = payments.map((p) => p.id);
      renderList(payments, isNewModel);
      updateConfirmState();
      document.getElementById('delete-order-modal').classList.remove('hidden');
      document.getElementById('delete-order-modal').classList.add('flex');
    }

    document.getElementById('delete-order-modal-close').addEventListener('click', close);
    document.getElementById('delete-order-modal-cancel').addEventListener('click', close);

    document.getElementById('delete-order-modal-confirm').addEventListener('click', () => {
      if (!paymentIds.every((id) => choices.has(id))) return;
      const resolutions = paymentIds.map((id) => ({ id, action: choices.get(id) }));
      close();
      onConfirmed(resolutions);
    });

    return { open };
  }
};
