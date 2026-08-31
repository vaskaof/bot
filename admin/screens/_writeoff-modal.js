'use strict';

/**
 * Модалка "Зафиксировать списание" (Э8, M8.1, D-11/F-27, 27.08.2026) —
 * пишет `order_writeoffs` + проводки в леджер (`recordOrderWriteoff`, см.
 * backend `writeoffService.js` JSDoc за схемой проводок). Тот же паттерн
 * модуля, что `PurchaseEventModal` (html()+init({...})->{open}).
 *
 * `reasonKind` НЕ вводится в модалке — приходит из уже выбранного статуса
 * заказа (`open(orderId, reasonKind)`), одна причина = один статус, менять
 * её здесь означало бы разойтись с полем "Статус заказа" на экране.
 *
 * `our_share_rub` НЕ редактируется руками — вычисляется как остаток
 * `total_loss_rub - reseller_share_rub` (тот же принцип, что "треугольник"
 * Сумма/Комиссия/Итог в order-new.js — одно из трёх чисел всегда
 * производное, не вводится, чтобы сумма физически не могла разойтись с
 * `total_loss_rub`, а не полагаться на то, что менеджер сам верно сложит).
 *
 * Доля посредника (`reseller_share_rub`/`reseller_telegram_id`) видна
 * ТОЛЬКО при причине "Потеряно" — по правилу VASY остальные причины с
 * посредником не делятся (тот же гейт есть и на backend, схема).
 *
 * `requestId` генерируется один раз на открытие модалки (`generateRequestId`,
 * `common.js`) и переиспользуется на повторных кликах "Зафиксировать" в
 * рамках одного открытия — двойной тап не задваивает проводку в леджере
 * (см. backend `writeoffRepository.findByRequestId`), кнопка также
 * блокируется на время запроса (fail-safe чек-лист, frontend-contract.md).
 */
window.WriteoffModal = {
  html() {
    return `
      <div id="writeoff-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div class="inline-flex items-center gap-1">
              <div>
                <h2 class="text-base font-semibold text-gray-900">Зафиксировать списание</h2>
                <span id="wo-order-id" class="text-[11px] text-gray-400"></span>
              </div>
              ${helpIcon('Что такое списание', '<p>Списание означает, что заказ признан убытком — потерян, отменён магазином или клиент отказался. Проводка сразу и необратимо записывается в леджер (отменить можно только сторно, не удалением).</p><p>Если убыток частично на посреднике (причина «Потеряно») — компания списывает только «Нашу долю», остальное — отдельная проводка на посредника.</p>')}
            </div>
            <button id="writeoff-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-3">
            <div id="wo-reason-badge" class="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Общий убыток, ₽</label>
              <input type="number" id="wo-total-loss-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Возврат клиенту, ₽ (если был)</label>
              <input type="number" id="wo-refunded-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div id="wo-reseller-block" class="hidden space-y-3 border-t border-gray-100 pt-3">
              <div>
                <label class="text-xs font-medium text-gray-500 mb-1 block inline-flex items-center gap-1">Доля посредника, ₽ (0 — не делится)${helpIcon('Доля посредника', '<p>Заполняется только при причине «Потеряно» — по остальным причинам (отменено магазином, не найдено, отказ клиента) убыток полностью на компании, посредник не участвует.</p><p>Если указываете долю больше нуля — обязательно укажите Telegram ID посредника ниже, иначе списание с него не запишется.</p>')}</label>
                <input type="number" id="wo-reseller-share-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500 mb-1 block">Telegram ID посредника</label>
                <input type="text" id="wo-reseller-id-input" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Обязательно, если есть доля посредника">
              </div>
            </div>
            <div class="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 inline-flex items-center gap-1">
              Наша доля (расчётно): <b id="wo-our-share-display">0.00 ₽</b>${helpIcon('Как считается', '<p>Наша доля = Общий убыток минус Доля посредника. Поле не редактируется вручную — так сумма физически не может разойтись с общим убытком.</p>')}
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Примечание (необязательно)</label>
              <textarea id="wo-note-input" rows="2" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" maxlength="500"></textarea>
            </div>
            <div id="wo-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2"></div>
            <div id="wo-result" class="hidden text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button id="writeoff-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Закрыть</button>
            <button id="writeoff-modal-submit" class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Зафиксировать</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onRecorded?: (result:{writeoffId:string}) => void }} options
   * @returns {{ open: (orderId:string, reasonKind:string) => void }}
   */
  init({ onRecorded } = {}) {
    let currentOrderId = null;
    let currentReasonKind = null;
    let requestId = null;
    const REASON_LOST = 'Потеряно';

    function close() {
      document.getElementById('writeoff-modal').classList.add('hidden');
      document.getElementById('writeoff-modal').classList.remove('flex');
    }

    function resetFeedback() {
      document.getElementById('wo-error').classList.add('hidden');
      document.getElementById('wo-result').classList.add('hidden');
    }

    function showError(message) {
      const el = document.getElementById('wo-error');
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function updateOurShareDisplay() {
      const total = parseFloat(document.getElementById('wo-total-loss-input').value) || 0;
      const resellerShare = currentReasonKind === REASON_LOST
        ? (parseFloat(document.getElementById('wo-reseller-share-input').value) || 0)
        : 0;
      const ourShare = Math.max(0, total - resellerShare);
      document.getElementById('wo-our-share-display').textContent = `${ourShare.toFixed(2)} ₽`;
    }

    function open(orderId, reasonKind) {
      currentOrderId = orderId;
      currentReasonKind = reasonKind;
      requestId = generateRequestId();
      resetFeedback();
      document.getElementById('wo-order-id').textContent = `Заказ ID: ${orderId}`;
      document.getElementById('wo-reason-badge').textContent = `Причина: ${reasonKind}`;
      document.getElementById('wo-total-loss-input').value = '';
      document.getElementById('wo-refunded-input').value = '';
      document.getElementById('wo-reseller-share-input').value = '';
      document.getElementById('wo-reseller-id-input').value = '';
      document.getElementById('wo-note-input').value = '';
      document.getElementById('wo-reseller-block').classList.toggle('hidden', reasonKind !== REASON_LOST);
      updateOurShareDisplay();
      document.getElementById('writeoff-modal').classList.remove('hidden');
      document.getElementById('writeoff-modal').classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('writeoff-modal-close').addEventListener('click', close);
    document.getElementById('writeoff-modal-cancel').addEventListener('click', close);
    document.getElementById('wo-total-loss-input').addEventListener('input', updateOurShareDisplay);
    document.getElementById('wo-reseller-share-input').addEventListener('input', updateOurShareDisplay);

    const submitBtn = document.getElementById('writeoff-modal-submit');
    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      resetFeedback();

      const totalLossRub = parseFloat(document.getElementById('wo-total-loss-input').value);
      const refundedToClientRub = parseFloat(document.getElementById('wo-refunded-input').value) || 0;
      const resellerShareRub = currentReasonKind === REASON_LOST
        ? (parseFloat(document.getElementById('wo-reseller-share-input').value) || 0)
        : 0;
      const resellerTelegramId = document.getElementById('wo-reseller-id-input').value.trim();
      const note = document.getElementById('wo-note-input').value.trim();

      if (!(totalLossRub >= 0)) { showError('«Общий убыток» обязателен и не может быть отрицательным.'); return; }
      if (resellerShareRub > totalLossRub) { showError('Доля посредника не может быть больше общего убытка.'); return; }
      if (resellerShareRub > 0 && !resellerTelegramId) { showError('Укажите Telegram ID посредника — доля посредника без него не сохранится.'); return; }

      const ourShareRub = Math.max(0, totalLossRub - resellerShareRub);

      if (!(await showConfirmModal(
        `Зафиксировать списание по заказу ${currentOrderId} на ${totalLossRub.toFixed(2)} ₽? Проводка в леджер запишется сразу и необратимо (только сторно, не удаление).`,
        { confirmLabel: 'Зафиксировать', danger: true }
      ))) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Записываю...';
      try {
        const result = await callServer('recordOrderWriteoff', {
          orderId: currentOrderId, reasonKind: currentReasonKind, totalLossRub,
          refundedToClientRub, ourShareRub, resellerTelegramId: resellerTelegramId || undefined,
          resellerShareRub, note: note || undefined, requestId
        });
        document.getElementById('wo-result').textContent = 'Списание зафиксировано, проводка записана.';
        document.getElementById('wo-result').classList.remove('hidden');
        if (onRecorded) onRecorded(result);
      } catch (error) {
        showError(error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Зафиксировать';
      }
    });

    return { open };
  }
};
