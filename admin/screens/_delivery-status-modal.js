'use strict';

/**
 * Массовая смена "Статус доставки" (Э5 рефакторинга коллективок,
 * REFACTOR-COLLECTIVES.md §3 "Э5", 25.08.2026) — общая модалка для
 * orders.js и collective-detail.js (тот же приём переиспользования, что
 * _collective-picker-modal.js/_delete-order-modal.js).
 *
 * Гейт по оплате (§6.2 "как работает гейт долга"): сервер
 * (previewDeliveryStatusChange) делит выборку на "оплачены полностью"
 * (закрываются СРАЗУ, одним подтверждением с числами — правило "Общие
 * правила" промта Э5, "подтверждение всегда с конкретными числами") и
 * "с долгом" (показываются отдельным списком "заказ · клиент · долг ₽",
 * закрыть можно только отдельным явным кликом "Всё равно закрыть").
 * Гейт применяется ТОЛЬКО к целевому статусу "Получено клиентом" —
 * для остальных статусов `withDebt` всегда пуст, модалка ведёт себя как
 * обычное массовое действие в одно подтверждение.
 *
 * **Р6, «Напоминания 2.0» (31.08.2026)** — тот же `previewDeliveryStatusChange`
 * заодно отдаёт `missingData` (пропуски данных при движении ВПЕРЁД по
 * лестнице статусов, любой целевой статус, не только "Получено клиентом") —
 * см. её JSDoc в `ordersService.js`. Заказ может попасть И в `withDebt`,
 * И в `missingData` одновременно (не конкурируют) — оба показываются в
 * ОДНОМ объединённом списке "не готовы" (`#delivery-status-debt-list`, id
 * не переименован — покрыт e2e), с ОДНИМ общим "Всё равно перевести"
 * (снимает оба гейта разом для заказа, один `forceOrderIds`, то же
 * подтверждение, что уже было у долга).
 */
window.DeliveryStatusModal = {
  html() {
    return `
      <div id="delivery-status-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Сменить статус доставки</h2>
            <button type="button" id="delivery-status-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-3" id="delivery-status-body">
            <p class="text-xs text-gray-500">Выбрано заказов: <span id="delivery-status-order-count">0</span></p>
            <div id="delivery-status-auto-note" class="hidden text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2"></div>
            <div id="delivery-status-select-block">
              <label class="block text-xs font-medium text-gray-500 mb-1">Новый статус</label>
              <select id="delivery-status-select" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></select>
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" id="delivery-status-notify-checkbox" class="rounded">
              Уведомить клиентов
            </label>
            <div id="delivery-status-debt-list" class="hidden space-y-2 pt-2 border-t border-gray-100"></div>
          </div>
          <div class="p-4 border-t border-gray-100 shrink-0 space-y-2">
            <button type="button" id="delivery-status-apply-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Применить</button>
            <button type="button" id="delivery-status-force-btn" class="hidden w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Всё равно перевести</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{onApplied: (result:{closedCount:number, forcedCount:number, failedCount:number}) => void, getStatusDictionary: () => Promise<string[]>}} opts
   *   `getStatusDictionary` — ленивая загрузка справочника статусов (один
   *   запрос на первое открытие модалки, не на каждый рендер экрана).
   * @returns {{open: (orderIds:string[]) => Promise<void>}}
   */
  init({ onApplied, getStatusDictionary }) {
    const modal = document.getElementById('delivery-status-modal');
    const closeBtn = document.getElementById('delivery-status-close');
    const select = document.getElementById('delivery-status-select');
    const selectBlock = document.getElementById('delivery-status-select-block');
    const autoNote = document.getElementById('delivery-status-auto-note');
    const orderCountEl = document.getElementById('delivery-status-order-count');
    const notifyCheckbox = document.getElementById('delivery-status-notify-checkbox');
    const debtList = document.getElementById('delivery-status-debt-list');
    const applyBtn = document.getElementById('delivery-status-apply-btn');
    const forceBtn = document.getElementById('delivery-status-force-btn');

    let orderIds = [];
    let blockedEntries = []; // [{orderId, clientDisplay, debt:number|null, missingItems:Array|null}]
    let statusesCache = null;

    function resetBody() {
      blockedEntries = [];
      debtList.classList.add('hidden');
      debtList.innerHTML = '';
      forceBtn.classList.add('hidden');
      forceBtn.disabled = false;
      applyBtn.disabled = false;
      applyBtn.classList.remove('hidden');
      applyBtn.textContent = 'Применить';
      notifyCheckbox.checked = false; // Q6 (24.08.2026) — по умолчанию выключено
    }

    function close() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      resetBody();
    }
    closeBtn.addEventListener('click', close);

    // Р6 — сводит withDebt/missingData (preview.js) в ОДИН список по
    // orderId (заказ может фигурировать в обоих сразу, не задваивается).
    function buildBlockedEntries(preview) {
      const byOrder = new Map();
      for (const e of preview.withDebt || []) {
        byOrder.set(e.orderId, { orderId: e.orderId, clientDisplay: e.clientDisplay, debt: e.debt, missingItems: null });
      }
      for (const e of preview.missingData || []) {
        const existing = byOrder.get(e.orderId);
        if (existing) existing.missingItems = e.items;
        else byOrder.set(e.orderId, { orderId: e.orderId, clientDisplay: e.clientDisplay, debt: null, missingItems: e.items });
      }
      return [...byOrder.values()];
    }

    function renderBlockedList() {
      debtList.classList.remove('hidden');
      debtList.innerHTML = `
        <p class="text-sm text-amber-700 font-medium">Не готовы к переходу (без изменений): ${blockedEntries.length}</p>
        ${blockedEntries.map((e) => `
          <div class="text-sm bg-amber-50 rounded-lg px-3 py-2 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-gray-700 truncate pr-2">${e.clientDisplay || ('заказ ' + e.orderId)} · ${e.orderId}</span>
              ${e.debt !== null ? `<span class="font-medium text-amber-700 whitespace-nowrap">Долг: ${e.debt.toFixed(2)} ₽</span>` : ''}
            </div>
            ${e.missingItems && e.missingItems.length > 0 ? `
              <ul class="text-xs text-amber-800 list-disc list-inside">
                ${e.missingItems.map((i) => `<li>${i.label} (${i.hint})</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      `;
      forceBtn.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    applyBtn.addEventListener('click', async () => {
      const targetStatus = select.value;
      if (!targetStatus) return;
      applyBtn.disabled = true;

      try {
        const preview = await callServer('previewDeliveryStatusChange', orderIds, targetStatus);
        blockedEntries = buildBlockedEntries(preview);
        const blockedIds = new Set(blockedEntries.map((e) => e.orderId));
        const trulyReady = (preview.readyToClose || []).filter((o) => !blockedIds.has(o.orderId));

        let closedCount = 0;
        let failedCount = 0;

        if (trulyReady.length > 0) {
          let confirmText = `Статус «${targetStatus}» будет установлен для ${trulyReady.length} из ${orderIds.length} заказов.`;
          if (blockedEntries.length > 0) {
            confirmText += `\n\nЕщё ${blockedEntries.length} — не готовы (долг и/или не хватает данных), останутся БЕЗ изменений: список появится ниже, перевести их можно только отдельным подтверждением «Всё равно перевести».`;
          }
          const proceed = await showConfirmModal(confirmText, { confirmLabel: 'Применить' });
          if (!proceed) { applyBtn.disabled = false; return; }

          const result = await callServer('setOrdersDeliveryStatus', trulyReady.map((o) => o.orderId), targetStatus, { notifyClients: notifyCheckbox.checked });
          closedCount = result.changed.length;
          failedCount = result.failed.length;
        }

        if (blockedEntries.length === 0) {
          close();
          onApplied({ closedCount, forcedCount: 0, failedCount });
          return;
        }

        renderBlockedList();
        applyBtn.classList.add('hidden');
        onApplied({ closedCount, forcedCount: 0, failedCount });
      } catch (error) {
        applyBtn.disabled = false;
        showSaveToast(false, `Не удалось сменить статус: ${error.message}`);
      }
    });

    forceBtn.addEventListener('click', async () => {
      const targetStatus = select.value;
      const ids = blockedEntries.map((e) => e.orderId);
      const totalDebt = blockedEntries.reduce((sum, e) => sum + (e.debt || 0), 0);
      const missingCount = blockedEntries.filter((e) => e.missingItems && e.missingItems.length > 0).length;
      const reasonParts = [];
      if (totalDebt > 0.01) reasonParts.push(`непогашенный долг (суммарно ${totalDebt.toFixed(2)} ₽)`);
      if (missingCount > 0) reasonParts.push(`нехватку данных (${missingCount} заказ(ов))`);

      const proceed = await showConfirmModal(
        `Перевести ${ids.length} заказ(ов) статусом «${targetStatus}» несмотря на ${reasonParts.join(' и ')}?\n\n` +
        `После этого заказ выходит из платёжного движка (если статус закрывающий) — ни обычное распределение, ни закрепление меткой больше не смогут принять по нему оплату, а сами пропуски данных так и останутся незаполненными.`,
        { confirmLabel: 'Всё равно перевести', danger: true }
      );
      if (!proceed) return;

      forceBtn.disabled = true;
      try {
        const result = await callServer('setOrdersDeliveryStatus', ids, targetStatus, {
          notifyClients: notifyCheckbox.checked, forceOrderIds: ids
        });
        close();
        onApplied({ closedCount: 0, forcedCount: result.changed.length, failedCount: result.failed.length });
      } catch (error) {
        forceBtn.disabled = false;
        showSaveToast(false, `Не удалось перевести: ${error.message}`);
      }
    });

    /**
     * @param {string[]} ids
     * @param {{presetStatus?:string, presetNotify?:boolean, autoNote?:string}} [opts]
     *   Аудит коллективок, п.6А (27.08.2026) — автоматическая смена статуса
     *   доставки по правилу коллективки переиспользует ЭТУ ЖЕ модалку (гейт
     *   долга/подтверждение — тот же код, что и у ручной массовой смены),
     *   просто статус уже определён правилом, не выбирается руками:
     *   `presetStatus` — блокирует select на конкретном значении,
     *   `presetNotify` — стартовое состояние чекбокса "уведомить" (из
     *   настройки "Коллективки_Автоуведомление", менеджер может переключить
     *   на месте — это не жёсткий запрет, только дефолт), `autoNote` —
     *   поясняющий текст над списком ("Статус определён правилом
     *   коллективки: ...").
     */
    async function open(ids, opts = {}) {
      orderIds = ids;
      resetBody();
      orderCountEl.textContent = orderIds.length;

      if (!statusesCache) statusesCache = await getStatusDictionary();
      FormHelpers.populateSelect('#delivery-status-select', statusesCache);

      if (opts.presetStatus) {
        select.value = opts.presetStatus;
        select.disabled = true;
        selectBlock.classList.add('hidden');
        autoNote.textContent = opts.autoNote || `Статус определён правилом коллективки: «${opts.presetStatus}».`;
        autoNote.classList.remove('hidden');
      } else {
        select.disabled = false;
        selectBlock.classList.remove('hidden');
        autoNote.classList.add('hidden');
      }
      if (opts.presetNotify !== undefined) notifyCheckbox.checked = opts.presetNotify;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    return { open };
  }
};
