'use strict';
/**
 * Модалка «Повторить покупку» (бывшая «Дублировать — какие позиции»,
 * Волна 7, 12.09.2026; переделана волной 5 аудита менеджера, 03.10.2026 —
 * VASY: «клиенты меняются, нужно уточнять позиции и количество»).
 *
 * На каждую позицию — количество (0…20; ×3 = три отдельных заказа, один
 * заказ = одна кукла, так считаются статусы и «Мои куклы») и галочка «тот же
 * клиент» (по умолчанию выкл. — клиенты меняются). Цена НЕ переносится
 * значением, только подсказкой «была N (дата)» в пустом поле суммы: у б/у
 * товара цена почти всегда другая, а молча подставленная старая сумма уходит
 * прямо в долг клиента. Процент комиссии переносится.
 *
 * Открывается с карточки заказа (позиции его корзины, по умолчанию отмечена
 * своя ×1) и из режима «Выбрать» на «Заказах» (все выбранные ×1).
 * Канал/аккаунт/карго/валюта — из шапки исходной покупки, если она одна;
 * статусы не копируются (решение VASY, Волна 7).
 *
 * Использование:
 *   root.innerHTML = `... ${DuplicatePositionsModal.html()}`;
 *   const modal = DuplicatePositionsModal.init();
 *   modal.open(positions, { preselectedOrderId, header, detailsCache });
 *   positions: [{orderId, product, clientLabel, hasClient, sum, date, lotId}]
 */
window.DuplicatePositionsModal = {
  PREFILL_KEY: 'knopka_cart_duplicate_prefill',
  MAX_QTY: 20,

  html() {
    return `
      <div id="dup-positions-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Повторить покупку</h2>
            <button id="dup-positions-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto">
            <p class="text-xs text-gray-500 mb-3">Сколько штук каждой позиции купить снова (0 — не повторять). Каждая штука — отдельный заказ. Цена не переносится: старая будет подсказкой в поле суммы. Статусы и примечание заново.</p>
            <div id="dup-positions-list" class="space-y-2"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="dup-positions-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="dup-positions-modal-confirm" disabled class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Повторить</button>
          </div>
        </div>
      </div>
    `;
  },

  /** Позиция модалки из ответа getCartDetails().orders. */
  fromCartOrder(o) {
    const client = o.clientName && o.username ? `${o.clientName} (${o.username})` : (o.clientName || o.username || '');
    return {
      orderId: o.orderId,
      product: o.productOriginal || 'товар не указан',
      clientLabel: o.isOwnPurchase ? 'Личный заказ' : (client || 'клиент не указан'),
      hasClient: !o.isOwnPurchase && !!client,
      sum: o.amountInCurrency ? `${o.amountInCurrency} ${o.currency || ''}`.trim() : '',
      date: '',
      lotId: o.lotId || ''
    };
  },

  /** Позиция модалки из строки getOrdersList (режим «Выбрать»). */
  fromOrdersListItem(o) {
    return {
      orderId: o.orderId,
      product: o.productDisplay || o.productOriginal || 'товар не указан',
      clientLabel: o.clientDisplay || 'Личный заказ',
      hasClient: !!o.clientDisplay,
      sum: o.amount ? `${o.amount} ${o.currency || ''}`.trim() : '',
      date: o.dateOrderDisplay || '',
      lotId: o.lotId || ''
    };
  },

  /**
   * Собирает черновик «Новой корзины» и уходит туда. Позиции читаются через
   * getOrderDetails (там productShort — точное попадание в позицию каталога,
   * и суммы этапов для процента комиссии).
   * @param {{currency?:string, purchaseChannel?:string, purchaseAccount?:string, cargo?:string}} header
   * @param {Array<{orderId:string, qty:number, sameClient:boolean}>} selections
   * @param {Object<string, Object>} [detailsCache] уже загруженные getOrderDetails по orderId
   */
  async goToNewCart(header, selections, detailsCache) {
    const positions = [];
    for (const sel of selections) {
      const d = (detailsCache && detailsCache[sel.orderId]) || await callServer('getOrderDetails', sel.orderId);
      const bookingSum = parseFloat(d.payments.booking.sum) || 0;
      const mainSum = parseFloat(d.payments.main.sum) || 0;
      let amountRub = mainSum - bookingSum;
      if (amountRub < 0) amountRub = 0;
      const feePercent = amountRub > 0 && bookingSum > 0 ? ((bookingSum / amountRub) * 100).toFixed(2) : '';
      const c = d.client || {};
      const client = sel.sameClient && (c.telegramId || c.username || c.name)
        ? {
          telegramId: c.telegramId || '', username: c.username || '', name: c.name || '',
          display: c.name && c.username ? `${c.name} (${c.username})` : (c.name || c.username || 'Клиент')
        }
        : null;
      const dateLabel = d.dateOrder ? d.dateOrder.split('-').reverse().join('.') : '';
      for (let i = 0; i < sel.qty; i++) {
        positions.push({
          productOriginal: d.productOriginal,
          productShort: d.productShort,
          priceHint: d.amount ? `было ${d.amount} ${d.currency || ''}${dateLabel ? ` (${dateLabel})` : ''}`.replace(/\s+/g, ' ').trim() : '',
          feePercent,
          client
        });
      }
    }
    sessionStorage.setItem(this.PREFILL_KEY, JSON.stringify({ header: header || {}, positions }));
    navigateTo('carts/new');
  },

  init() {
    const self = this;
    let rows = []; // {orderId, qty, sameClient, hasClient}
    let current = { header: {}, detailsCache: null };

    function close() {
      document.getElementById('dup-positions-modal').classList.add('hidden');
      document.getElementById('dup-positions-modal').classList.remove('flex');
    }
    function updateConfirmState() {
      const total = rows.reduce((s, r) => s + r.qty, 0);
      const btn = document.getElementById('dup-positions-modal-confirm');
      btn.disabled = total === 0;
      btn.textContent = total > 0 ? `Повторить (${total})` : 'Повторить';
    }
    function renderList(positions) {
      const list = document.getElementById('dup-positions-list');
      list.innerHTML = positions.map((p, idx) => `
        <div class="border border-gray-200 rounded-xl p-3" data-order-id="${escapeHtmlClient(p.orderId)}" data-idx="${idx}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(p.product)}</div>
              <div class="text-xs text-gray-500">${escapeHtmlClient(p.clientLabel)}${p.sum ? ` · ${escapeHtmlClient(p.sum)}` : ''}${p.date ? ` · ${escapeHtmlClient(p.date)}` : ''}${p.lotId ? ' · из лота' : ''}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" class="dup-qty-minus w-7 h-7 rounded-lg border border-gray-200 text-gray-600">−</button>
              <span class="dup-qty w-6 text-center text-sm font-semibold text-gray-900">${rows[idx].qty}</span>
              <button type="button" class="dup-qty-plus w-7 h-7 rounded-lg border border-gray-200 text-gray-600">+</button>
            </div>
          </div>
          ${p.hasClient ? `
            <label class="flex items-center gap-2 mt-2 text-xs text-gray-600">
              <input type="checkbox" class="dup-same-client w-4 h-4"> тот же клиент
            </label>` : ''}
        </div>
      `).join('');
      list.querySelectorAll('[data-idx]').forEach((el) => {
        const r = rows[Number(el.dataset.idx)];
        const qtyEl = el.querySelector('.dup-qty');
        const setQty = (q) => { r.qty = Math.max(0, Math.min(self.MAX_QTY, q)); qtyEl.textContent = r.qty; el.classList.toggle('opacity-50', r.qty === 0); updateConfirmState(); };
        el.querySelector('.dup-qty-minus').addEventListener('click', () => setQty(r.qty - 1));
        el.querySelector('.dup-qty-plus').addEventListener('click', () => setQty(r.qty + 1));
        el.classList.toggle('opacity-50', r.qty === 0);
        const same = el.querySelector('.dup-same-client');
        if (same) same.addEventListener('change', () => { r.sameClient = same.checked; });
      });
    }

    /**
     * @param {Array} positions см. JSDoc модуля
     * @param {{preselectedOrderId?:string, header?:Object, detailsCache?:Object}} [options]
     *   preselectedOrderId задан — только эта позиция ×1, остальные ×0; иначе все ×1.
     */
    function open(positions, options = {}) {
      current = { header: options.header || {}, detailsCache: options.detailsCache || null };
      rows = positions.map((p) => ({
        orderId: p.orderId,
        qty: options.preselectedOrderId ? (p.orderId === options.preselectedOrderId ? 1 : 0) : 1,
        sameClient: false
      }));
      renderList(positions);
      updateConfirmState();
      document.getElementById('dup-positions-modal').classList.remove('hidden');
      document.getElementById('dup-positions-modal').classList.add('flex');
    }

    document.getElementById('dup-positions-modal-close').addEventListener('click', close);
    document.getElementById('dup-positions-modal-cancel').addEventListener('click', close);
    document.getElementById('dup-positions-modal-confirm').addEventListener('click', async () => {
      const selections = rows.filter((r) => r.qty > 0).map(({ orderId, qty, sameClient }) => ({ orderId, qty, sameClient }));
      if (selections.length === 0) return;
      const btn = document.getElementById('dup-positions-modal-confirm');
      btn.disabled = true;
      try {
        await self.goToNewCart(current.header, selections, current.detailsCache);
        close();
      } catch (error) {
        showSaveToast(false, 'Не удалось подготовить повтор: ' + error.message);
        updateConfirmState();
      }
    });

    return { open };
  }
};
