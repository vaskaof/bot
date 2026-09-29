'use strict';

/**
 * «Списать долг на компанию» (29.09.2026) — окно для закрытого заказа с
 * долгом: сумма (по умолчанию весь долг), причина, комментарий; ниже —
 * прежние списания по заказу с кнопкой «Отменить». Серверная часть —
 * getOrderDebtForWriteoff/writeOffOrderDebt/cancelOrderDebtWriteoff
 * (server/src/payments/debtWriteoffService.js). Клиент списания не видит —
 * долг у него просто исчезает (решение VASY).
 *
 * DebtWriteoffModal.open(orderId, { onChanged }) — onChanged вызывается после
 * списания или отмены (перезагрузить доску/карточку).
 */
window.DebtWriteoffModal = (function () {
  const REASONS = [
    ['manager_error', 'Ошибка менеджера'],
    ['agreement', 'Договорились с клиентом'],
    ['other', 'Другое']
  ];

  let el = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'debt-writeoff-modal';
    el.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-[90] px-4';
    el.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">Списать долг на компанию</h2>
          <button type="button" data-close class="p-1 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div class="p-4" data-body><div class="text-sm text-gray-400">Загрузка...</div></div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    return el;
  }

  function close() {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
  }

  function money(v) {
    return (Math.round(v * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₽';
  }

  function formatDate(value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU');
  }

  async function open(orderId, opts) {
    const onChanged = (opts && opts.onChanged) || function () {};
    const modal = ensure();
    const body = modal.querySelector('[data-body]');
    body.innerHTML = '<div class="text-sm text-gray-400">Загрузка...</div>';
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    let info;
    try {
      info = await callServer('getOrderDebtForWriteoff', orderId);
    } catch (error) {
      body.innerHTML = `<div class="text-sm text-red-600">${escapeHtmlClient(error.message)}</div>`;
      return;
    }
    render(body, orderId, info, onChanged);
  }

  function render(body, orderId, info, onChanged) {
    const requestId = generateRequestId(); // один на открытие окна — повторный тап не спишет дважды
    const canWriteOff = info.canWriteOff && info.totalRemaining > 0.005;
    const stagesHtml = info.stages.filter(s => s.remaining > 0.005).map(s => `
      <div class="flex justify-between text-[13px]"><span class="text-gray-600">${escapeHtmlClient(s.stage)}</span><span class="text-gray-900">${money(s.remaining)}</span></div>
    `).join('');
    const history = info.writeoffs || [];

    body.innerHTML = `
      ${canWriteOff ? `
        <div class="text-[13px] text-gray-500 mb-2">Долг по заказу: <b class="text-red-600">${money(info.totalRemaining)}</b></div>
        <div class="space-y-1 mb-3">${stagesHtml}</div>
        <label class="block text-xs text-gray-500 mb-1">Сколько списать, ₽</label>
        <input type="number" step="0.01" min="0" data-amount value="${info.totalRemaining}"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 mb-3">
        <label class="block text-xs text-gray-500 mb-1">Причина</label>
        <div class="space-y-1.5 mb-3">
          ${REASONS.map(([key, label]) => `
            <label class="flex items-center gap-2 text-sm text-gray-700"><input type="radio" name="debt-writeoff-reason" value="${key}"> ${label}</label>
          `).join('')}
        </div>
        <label class="block text-xs text-gray-500 mb-1">Комментарий <span data-comment-hint>(необязательно)</span></label>
        <textarea data-comment rows="2" maxlength="500"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 mb-2"></textarea>
        <div class="text-[11px] text-gray-400 mb-3">Клиент перестанет видеть этот долг. Сумма уйдёт в расходы компании.</div>
        <div data-error class="text-xs text-red-600 hidden mb-2"></div>
        <button type="button" data-submit class="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">Списать</button>
      ` : `
        <div class="text-sm text-gray-600 mb-2">${info.isOpen ? 'Заказ ещё открыт — списать долг можно только после закрытия.' : 'Долга по заказу нет.'}</div>
      `}
      ${history.length > 0 ? `
        <div class="mt-4 pt-3 border-t border-gray-100">
          <div class="text-xs font-medium text-gray-500 mb-2">Списания по заказу</div>
          <div class="space-y-2">
            ${history.map((w, i) => `
              <div class="flex items-start justify-between gap-2 text-[13px] ${w.cancelledAt ? 'opacity-50' : ''}">
                <div class="min-w-0">
                  <div class="text-gray-900">${money(w.amount)} · ${escapeHtmlClient(w.reasonLabel)}</div>
                  <div class="text-[11px] text-gray-400">${formatDate(w.createdAt)}${w.comment ? ' · ' + escapeHtmlClient(w.comment) : ''}${w.cancelledAt ? ' · отменено ' + formatDate(w.cancelledAt) : ''}</div>
                </div>
                ${w.cancelledAt ? '' : `<button type="button" data-cancel="${i}" class="shrink-0 text-xs text-gray-500 font-medium px-2 py-1 rounded-lg hover:bg-gray-100">Отменить</button>`}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    body.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const w = history[Number(btn.dataset.cancel)];
        const ok = await showConfirmModal(`Отменить списание ${money(w.amount)}? Долг снова будет на клиенте.`, { confirmLabel: 'Отменить списание', cancelLabel: 'Назад', danger: true });
        if (!ok) return;
        btn.disabled = true;
        try {
          await callServer('cancelOrderDebtWriteoff', w.requestId);
          showSaveToast(true, 'Списание отменено.');
          onChanged();
          render(body, orderId, await callServer('getOrderDebtForWriteoff', orderId), onChanged);
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
        }
      });
    });

    if (!canWriteOff) return;

    const amountInput = body.querySelector('[data-amount]');
    const commentInput = body.querySelector('[data-comment]');
    const commentHint = body.querySelector('[data-comment-hint]');
    const errorEl = body.querySelector('[data-error]');
    const submitBtn = body.querySelector('[data-submit]');
    body.querySelectorAll('input[name="debt-writeoff-reason"]').forEach(r => {
      r.addEventListener('change', () => {
        commentHint.textContent = r.value === 'other' && r.checked ? '(обязательно)' : '(необязательно)';
      });
    });

    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      errorEl.classList.add('hidden');
      const amount = parseFloat(amountInput.value);
      const reasonEl = body.querySelector('input[name="debt-writeoff-reason"]:checked');
      const comment = commentInput.value.trim();
      let problem = '';
      if (!(amount > 0)) problem = 'Введите сумму больше нуля.';
      else if (amount > info.totalRemaining + 0.005) problem = `Нельзя списать больше долга (${money(info.totalRemaining)}).`;
      else if (!reasonEl) problem = 'Выберите причину.';
      else if (reasonEl.value === 'other' && !comment) problem = 'Для «Другое» напишите комментарий.';
      if (problem) {
        errorEl.textContent = problem;
        errorEl.classList.remove('hidden');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Списываю...';
      try {
        const res = await callServer('writeOffOrderDebt', { orderId, amount, reasonKind: reasonEl.value, comment, requestId });
        showSaveToast(true, res.totalRemaining > 0.005 ? `Списано. Остаток долга: ${money(res.totalRemaining)}.` : 'Долг списан.');
        close();
        onChanged();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Списать';
      }
    });
  }

  return { open, close };
})();
