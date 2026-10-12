/**
 * Каналы К5 (IMPLEMENTATION-PLAN-STOREFRONTS.md «К5 — детальный план и риски»): перенос заказа вместе с деньгами.
 *
 * Три входа, один серверный приём (previewOrderTransfer → transferOrder):
 *   - openChannelMove — «Перенести в канал…» в карточке заказа: выбор канала → что уйдёт с заказом → «Перенести»;
 *   - askClientMoney — при сохранении заказа со сменой клиента, если за заказ уже внесены деньги: перенести их
 *     новому клиенту вместе с заказом или оставить у прежнего (сервер без ответа такую смену не примет);
 *   - foreignBannerHtml/fixForeign — плашка «на заказе деньги другого клиента» (класс 61989A).
 */
(function () {
  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function rub(n) {
    return `${Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
  }

  /**
   * Лист снизу с произвольным содержимым; резолвится значением `data-value` нажатой кнопки или null (закрыли).
   * @private
   */
  function openSheet(id, innerHtml) {
    return new Promise((resolve) => {
      const old = document.getElementById(id);
      if (old) old.remove();
      const sheet = document.createElement('div');
      sheet.id = id;
      sheet.className = 'fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/30';
      sheet.innerHTML = `<div class="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-5 pb-8 shadow-xl max-h-[85vh] overflow-y-auto">${innerHtml}</div>`;
      sheet.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (btn && btn.disabled) return;
        if (btn || e.target === sheet) {
          sheet.remove();
          resolve(btn ? btn.dataset.value : null);
        }
      });
      document.body.appendChild(sheet);
    });
  }

  function blockersHtml(blockers) {
    if (!blockers || !blockers.length) return '';
    return `<div class="text-[13px] text-red-700 bg-red-50 rounded-xl px-3 py-2 mt-3">${blockers.map(esc).join('<br>')}</div>`;
  }

  /** Строки «что уйдёт» для предпросмотра переноса канала. */
  function movingHtml(p) {
    if (!p.movingAmount) return '<div class="text-[13px] text-gray-600 mt-3">Оплат по заказу нет — меняется только канал.</div>';
    const rows = p.moving.map((m) => `<li>${esc(rub(m.amount))} — оплаты ${esc(m.clientLabel)}</li>`).join('');
    return `
      <div class="text-[13px] text-gray-700 mt-3">С заказом уйдут оплаты <b>${esc(rub(p.movingAmount))}</b>:</div>
      <ul class="text-[13px] text-gray-600 mt-1 list-disc pl-5">${rows}</ul>
      <div class="text-[12px] text-gray-500 mt-2">В канале «${esc(p.from.title)}» платёж уменьшится на эту сумму (с пометкой), в канале «${esc(p.to.title)}» она будет закреплена за этим заказом. Клиенту платить заново не нужно. Сумма попадёт во взаиморасчёт каналов.</div>`;
  }

  function sovyHtml(p) {
    if (!p.sovyToReverse) return '';
    return `<div class="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-3">Бонусы за этот заказ (${esc(p.sovyToReverse)}) будут отозваны у клиента. Если в новом канале бонусы включены — начислятся там заново.</div>`;
  }

  /**
   * «Перенести в канал…»: выбор канала, предпросмотр, перенос. Резолвится true, если заказ перенесён.
   * @param {string} orderId
   * @param {number|null} currentStorefrontId канал заказа
   */
  async function openChannelMove(orderId, currentStorefrontId) {
    const list = window.ChannelSwitch && window.ChannelSwitch.list ? window.ChannelSwitch.list() : [];
    const current = currentStorefrontId ? Number(currentStorefrontId) : null;
    const targets = list.filter((c) => c.id !== current);
    if (!targets.length) return false;
    const choice = await openSheet('order-transfer-channel-sheet', `
      <div class="text-[15px] font-semibold text-gray-900">Перенести заказ в канал</div>
      <div class="text-[12px] text-gray-500 mt-1 mb-3">Сейчас — «${esc(window.ChannelSwitch.titleOf(current))}». Заказ будут вести в выбранном канале; оплаты по нему уйдут вместе с ним.</div>
      <div class="space-y-2">
        ${targets.map((c) => `
          <button type="button" data-value="${c.id === null ? 'main' : c.id}" class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 text-left">
            <span class="w-3 h-3 rounded-full shrink-0" style="background:${window.ChannelSwitch.colorOf(c.id)}"></span>
            <span class="text-[14px] font-medium text-gray-900">${esc(c.title)}</span>
          </button>`).join('')}
      </div>`);
    if (!choice) return false;

    let preview;
    try {
      preview = await callServer('previewOrderTransfer', orderId, { channel: choice, moneyMode: 'move' });
    } catch (error) {
      showSaveToast(false, `Не удалось проверить перенос: ${error.message}`);
      return false;
    }
    const blocked = preview.blockers && preview.blockers.length > 0;
    const confirm = await openSheet('order-transfer-confirm-sheet', `
      <div class="text-[15px] font-semibold text-gray-900">Заказ ${esc(orderId)} → «${esc(preview.to.title)}»</div>
      ${movingHtml(preview)}
      ${sovyHtml(preview)}
      ${blockersHtml(preview.blockers)}
      <div class="flex gap-2 mt-4">
        <button type="button" data-value="cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
        <button type="button" data-value="ok" ${blocked ? 'disabled' : ''} class="flex-1 py-2.5 rounded-xl text-white text-sm font-medium ${blocked ? 'bg-gray-300' : 'bg-indigo-600'}">Перенести</button>
      </div>`);
    if (confirm !== 'ok') return false;
    try {
      const result = await callServer('transferOrder', orderId, { channel: choice, moneyMode: 'move' }, generateRequestId());
      showSaveToast(true, result.amount ? `Заказ перенесён в «${preview.to.title}» вместе с оплатами ${rub(result.amount)}` : `Заказ перенесён в «${preview.to.title}»`);
      return true;
    } catch (error) {
      showSaveToast(false, `Не удалось перенести заказ: ${error.message}`);
      return false;
    }
  }

  /**
   * Смена клиента в заказе: если за заказ внесены деньги — спросить, что с ними делать.
   * Резолвится: {} — денег нет, спрашивать нечего; {clientMoney, clientMoneyRequestId} — выбор; null — отмена.
   * @param {string} orderId
   * @param {{telegramId:string, username:string}} client новый клиент из формы
   */
  async function askClientMoney(orderId, client) {
    let preview;
    try {
      preview = await callServer('previewOrderTransfer', orderId, { client, moneyMode: 'move' });
    } catch (error) {
      // Не смогли проверить — сервер сам откажет, если деньги есть и ответа нет.
      return {};
    }
    if (!preview.totalOnOrder || preview.from.clientId === preview.to.clientId) return {};
    const fromLabel = preview.from.clientLabel || 'прежнего клиента';
    const toLabel = preview.to.clientLabel || 'нового клиента';
    const choice = await openSheet('order-transfer-client-sheet', `
      <div class="text-[15px] font-semibold text-gray-900">За заказ уже внесено ${esc(rub(preview.totalOnOrder))}</div>
      <div class="text-[12px] text-gray-500 mt-1 mb-3">Вы меняете клиента: ${esc(fromLabel)} → ${esc(toLabel)}. Что сделать с деньгами за этот заказ?</div>
      <div class="space-y-2">
        <button type="button" data-value="move" class="w-full px-4 py-3 rounded-2xl border-2 border-indigo-500 text-left">
          <span class="block text-[14px] font-medium text-gray-900">Перенести ${esc(toLabel)} вместе с заказом</span>
          <span class="block text-[12px] text-gray-500 mt-0.5">Заказ останется оплаченным. В оплатах ${esc(toLabel)} появится «оплачено ${esc(fromLabel)} за заказ ${esc(orderId)}»; рассчитываетесь между собой сами.</span>
        </button>
        <button type="button" data-value="stay" class="w-full px-4 py-3 rounded-2xl border border-gray-200 text-left">
          <span class="block text-[14px] font-medium text-gray-900">Оставить у ${esc(fromLabel)}</span>
          <span class="block text-[12px] text-gray-500 mt-0.5">Деньги вернутся ${esc(fromLabel)} в остаток (или на другие его заказы). У ${esc(toLabel)} заказ будет не оплачен.</span>
        </button>
        <button type="button" data-value="cancel" class="w-full py-2.5 text-[13px] text-gray-500">Отмена — не сохранять</button>
      </div>
      ${blockersHtml((preview.blockers || []).filter((b) => !/Переносить нечего/.test(b)))}`);
    if (choice !== 'move' && choice !== 'stay') return null;
    return { clientMoney: choice, clientMoneyRequestId: generateRequestId() };
  }

  /** Плашка «на заказе деньги другого клиента» (пусто — их нет). */
  function foreignBannerHtml(moneyOnOrder) {
    if (!moneyOnOrder || !moneyOnOrder.foreign || !moneyOnOrder.foreign.length) return '';
    const items = moneyOnOrder.foreign.map((f) => `${esc(rub(f.amount))} — оплаты ${esc(f.clientLabel)}`).join('<br>');
    const payer = moneyOnOrder.foreign.length === 1 ? esc(moneyOnOrder.foreign[0].clientLabel) : 'плательщикам';
    return `
      <div id="order-foreign-money" class="rounded-2xl bg-amber-50 border border-amber-200 p-3 mb-3">
        <div class="text-[13px] font-medium text-amber-900">На заказе деньги не клиента заказа</div>
        <div class="text-[12px] text-amber-800 mt-1">${items}</div>
        <div class="text-[12px] text-amber-700 mt-1">Так бывает, если клиента сменили в уже оплаченном заказе. Пока это не разобрано, деньги клиента заказа считаются неверно.</div>
        <div class="flex flex-wrap gap-2 mt-2">
          <button type="button" class="order-foreign-fix-btn px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[13px] font-medium" data-mode="move">Перенести к клиенту заказа</button>
          <button type="button" class="order-foreign-fix-btn px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 text-[13px] font-medium" data-mode="stay">Вернуть ${payer}</button>
        </div>
      </div>`;
  }

  /**
   * Разобрать «чужие деньги»: к клиенту заказа (move) или вернуть плательщику (stay). Резолвится true — сделано.
   * @param {string} orderId
   * @param {string} ownerId денежный ключ клиента заказа (moneyOnOrder.ownerId)
   * @param {'move'|'stay'} mode
   */
  async function fixForeign(orderId, ownerId, mode) {
    const text = mode === 'move'
      ? 'Деньги другого клиента на этом заказе станут оплатой клиента заказа (с пометкой, кто платил). Продолжить?'
      : 'Деньги вернутся тому, кто платил (в его остаток), а заказ останется без этой оплаты. Продолжить?';
    const ok = await showConfirmModal(text, { confirmLabel: mode === 'move' ? 'Перенести' : 'Вернуть' });
    if (!ok) return false;
    try {
      const result = await callServer('transferOrder', orderId, { client: ownerId, moneyMode: mode }, generateRequestId());
      showSaveToast(true, mode === 'move' ? `Перенесено к клиенту заказа: ${rub(result.amount)}` : `Возвращено плательщику: ${rub(result.amount)}`);
      return true;
    } catch (error) {
      showSaveToast(false, `Не удалось: ${error.message}`);
      return false;
    }
  }

  window.OrderTransfer = { openChannelMove, askClientMoney, foreignBannerHtml, fixForeign };
})();
