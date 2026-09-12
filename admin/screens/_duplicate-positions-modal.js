'use strict';

/**
 * Модалка «Дублировать — какие позиции скопировать» (Волна 7, §7 п.1
 * IMPLEMENTATION-PLAN-ROLES-AND-NOTIFICATIONS.md, решение VASY: менеджер
 * идёт от позиции, а не от корзины; всегда явный вопрос, когда у заказа
 * есть корзина — без исключения для корзины из одной позиции). Общий
 * модуль по образцу `DeleteOrderModal`, подключается в `order-edit.js`.
 *
 * Список — `getCartDetails(cartId).orders` (уже загружен вызывающей
 * стороной, эта модалка сама ничего не запрашивает). По умолчанию отмечена
 * ТОЛЬКО позиция, с которой менеджер зашёл (`preselectedOrderId`) — цель
 * VASY: не плодить лишние копии по умолчанию, менеджер добавляет остальные
 * осознанно.
 *
 * Канал/аккаунт/карго/валюта НЕ выбираются здесь — они берутся из шапки
 * ИСХОДНОЙ корзины напрямую (все позиции одной реальной корзины физически
 * не могут иметь разные значения этих полей, см. личную память Architect'а
 * — они заданы один раз при создании корзины и применяются ко всем заявкам
 * в ней). Статус доставки/заказа НЕ копируется вовсе (решение VASY) — новая
 * карточка стартует обычным дефолтом, как при создании с нуля.
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${DuplicatePositionsModal.html()}`;
 *   const dupModal = DuplicatePositionsModal.init({
 *     onConfirm: (selectedOrderIds) => { ...построить prefill и уйти в carts/new... }
 *   });
 *   dupModal.open(cartDetails.orders, currentOrderId); // orders — из getCartDetails
 */
window.DuplicatePositionsModal = {
  html() {
    return `
      <div id="dup-positions-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Дублировать — какие позиции?</h2>
            <button id="dup-positions-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto">
            <p class="text-xs text-gray-500 mb-3">Эта позиция была создана вместе с другими в одной корзине. Отметьте, какие из них тоже скопировать в новую корзину — клиент, примечание и статусы не переносятся, их нужно будет указать заново.</p>
            <div id="dup-positions-list" class="space-y-2"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="dup-positions-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="dup-positions-modal-confirm" disabled class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Дублировать</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onConfirm: (selectedOrderIds:string[]) => void }} options
   * @returns {{ open: (orders:Array<{orderId:string,productOriginal:string,clientName:string,username:string,amountInCurrency:number|null,currency:string,lotId:string|null}>, preselectedOrderId:string) => void }}
   */
  init({ onConfirm }) {
    let selected = new Set();
    let orderIds = [];

    function close() {
      document.getElementById('dup-positions-modal').classList.add('hidden');
      document.getElementById('dup-positions-modal').classList.remove('flex');
    }

    function updateConfirmState() {
      document.getElementById('dup-positions-modal-confirm').disabled = selected.size === 0;
    }

    function labelFor(o) {
      const client = o.clientName && o.username ? `${o.clientName} (${o.username})` : (o.clientName || o.username || (o.isOwnPurchase ? 'Личный заказ' : 'клиент не указан'));
      const sum = o.amountInCurrency ? `${o.amountInCurrency} ${o.currency || ''}`.trim() : '';
      return { product: o.productOriginal || 'товар не указан', client, sum };
    }

    function renderList(orders, preselectedOrderId) {
      const list = document.getElementById('dup-positions-list');
      list.innerHTML = orders.map((o) => {
        const { product, client, sum } = labelFor(o);
        return `
          <label class="flex items-start gap-3 border border-gray-200 rounded-xl p-3 cursor-pointer" data-order-id="${o.orderId}">
            <input type="checkbox" class="dup-position-checkbox mt-0.5 w-4 h-4 shrink-0" ${o.orderId === preselectedOrderId ? 'checked' : ''}>
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${product}</div>
              <div class="text-xs text-gray-500">${client}${sum ? ` · ${sum}` : ''}${o.lotId ? ' · из лота' : ''}</div>
            </div>
          </label>
        `;
      }).join('');

      list.querySelectorAll('.dup-position-checkbox').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id = cb.closest('[data-order-id]').dataset.orderId;
          if (cb.checked) selected.add(id); else selected.delete(id);
          updateConfirmState();
        });
      });
    }

    function open(orders, preselectedOrderId) {
      selected = new Set(preselectedOrderId ? [preselectedOrderId] : []);
      orderIds = orders.map((o) => o.orderId);
      renderList(orders, preselectedOrderId);
      updateConfirmState();
      document.getElementById('dup-positions-modal').classList.remove('hidden');
      document.getElementById('dup-positions-modal').classList.add('flex');
    }

    document.getElementById('dup-positions-modal-close').addEventListener('click', close);
    document.getElementById('dup-positions-modal-cancel').addEventListener('click', close);

    document.getElementById('dup-positions-modal-confirm').addEventListener('click', () => {
      if (selected.size === 0) return;
      // Порядок — как в исходном списке, не как отмечали (предсказуемее на
      // экране назначения).
      const ordered = orderIds.filter((id) => selected.has(id));
      close();
      onConfirm(ordered);
    });

    return { open };
  }
};
