/**
 * Консоль Кнопки (В6 плана SaaS) — вкладка «Деньги»: по каждому посреднику оборот, счёт, оплаты, долг и
 * сигналы недооборота; карточка посредника — условия, месяцы, начисления, оплаты. Методы — PLATFORM_METHODS
 * сервера (src/api/platformContract.js); пускают только владельца и только из бота консоли.
 */
(function () {
  'use strict';

  const PLAN_LABELS = { bot: 'Бот', standard: 'Приложение', pro: 'Клуб' };
  const state = { tenantId: null };

  const root = () => document.getElementById('console-root');
  const esc = (v) => escapeHtmlClient(v === null || v === undefined ? '' : String(v));

  function rub(n) {
    if (n === null || n === undefined) return '—';
    return `${Math.round(Number(n)).toLocaleString('ru-RU')} ₽`;
  }

  function percent(n) {
    return `${String(n).replace('.', ',')}%`;
  }

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayLabel(day) {
    if (!day) return '';
    const [y, m, d] = day.split('-');
    return `${d}.${m}.${y}`;
  }

  function flash(message, isError) {
    let el = document.getElementById('console-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'console-flash';
      el.className = 'fixed left-4 right-4 bottom-4 z-[90] rounded-xl px-4 py-3 text-sm shadow-lg';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `fixed left-4 right-4 bottom-4 z-[90] rounded-xl px-4 py-3 text-sm shadow-lg ${isError ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`;
    el.classList.remove('hidden');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.add('hidden'), isError ? 5000 : 2500);
  }

  async function run(method, ...args) {
    try {
      return await callServer(method, ...args);
    } catch (error) {
      flash(error.message || 'Ошибка', true);
      throw error;
    }
  }

  function section(title, body, extraClass) {
    return `<section class="bg-white rounded-2xl border border-gray-100 p-4 mb-3 ${extraClass || ''}">
      <div class="font-semibold text-gray-900 mb-2">${title}</div>${body}</section>`;
  }

  function signalsHtml(signals) {
    if (!signals || signals.length === 0) return '';
    return `<ul class="mt-2 space-y-1">${signals.map((s) => `<li class="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1">⚠️ ${esc(s.text)}</li>`).join('')}</ul>`;
  }

  function tenantTitle(t) {
    return `${esc(t.name || t.slug)}${t.botUsername ? ` <span class="text-gray-400 font-normal">@${esc(t.botUsername)}</span>` : ''}`;
  }

  // ── Список ──────────────────────────────────────────────────────────────────────────────────────

  function overviewRow(row) {
    let money;
    if (row.mode === 'info') {
      money = `<div class="text-gray-600">Для сведения: оборот этого месяца ${rub(row.current.turnoverRub)}, по тарифу было бы ${rub(row.current.amountDue)}</div>
        <div class="text-gray-400 text-xs">Прошлый месяц: ${rub(row.previous.turnoverRub)}</div>`;
    } else if (row.mode === 'not_started') {
      money = `<div class="text-gray-600">Счёт не ведётся — укажите дату подключения</div>
        <div class="text-gray-400 text-xs">Оборот этого месяца: ${rub(row.current && row.current.turnoverRub)}${row.balance ? ` · долг ${rub(row.balance)}` : ''}</div>`;
    } else {
      const cur = row.current;
      money = `<div class="grid grid-cols-3 gap-2 mt-1">
          <div><div class="text-xs text-gray-400">Оборот месяца</div><div class="font-medium">${rub(cur && cur.turnoverRub)}</div></div>
          <div><div class="text-xs text-gray-400">Набежало</div><div class="font-medium">${rub(cur && cur.amountDue)}${cur && cur.minApplied ? ' <span class="text-xs text-gray-400">мин.</span>' : ''}</div></div>
          <div><div class="text-xs text-gray-400">Долг</div><div class="font-semibold ${row.balance > 0 ? 'text-red-600' : 'text-emerald-600'}">${rub(row.balance)}</div></div>
        </div>`;
    }
    return `<button type="button" data-tenant="${row.tenantId}" class="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 mb-3 active:bg-gray-50">
      <div class="flex items-center justify-between gap-2">
        <div class="font-semibold">${tenantTitle(row)}</div>
        <div class="text-xs text-gray-500 shrink-0">${esc(PLAN_LABELS[row.plan] || row.plan)}${row.status !== 'active' ? ` · ${esc(row.status)}` : ''}</div>
      </div>
      ${money}
      ${signalsHtml(row.signals)}
    </button>`;
  }

  async function showOverview() {
    state.tenantId = null;
    hideBackButton();
    root().innerHTML = 'Загрузка…';
    const data = await run('getPlatformOverview');
    document.getElementById('console-subtitle').textContent = `Деньги · ${data.currentLabel}`;
    root().innerHTML = data.rows.map(overviewRow).join('') || 'Посредников пока нет.';
    root().querySelectorAll('[data-tenant]').forEach((btn) => {
      btn.addEventListener('click', () => showTenant(Number(btn.dataset.tenant)));
    });
  }

  // ── Карточка посредника ─────────────────────────────────────────────────────────────────────────

  function periodsHtml(card) {
    if (!card.periods.length) return '<div class="text-gray-500">Месяцев пока нет.</div>';
    return `<div class="divide-y divide-gray-100">${card.periods.map((p) => `
      <div class="py-2">
        <div class="flex justify-between gap-2">
          <div class="font-medium">${esc(p.label)}${p.partial ? ` <span class="text-xs text-gray-400">с ${esc(dayLabel(p.from))}</span>` : ''}</div>
          <div class="font-semibold">${rub(p.amountDue)}</div>
        </div>
        <div class="text-xs text-gray-500">
          оборот ${rub(p.bill.turnoverRub)} × ${percent(p.terms.ratePercent)} = ${rub(p.bill.percentAmount)}
          ${p.bill.minApplied ? ` → минимум ${rub(p.terms.minPaymentRub)}` : p.bill.minApplies ? '' : ' · без минимума'}
          · вес и доставка ${rub(p.otherStagesRub)}
        </div>
        <div class="text-xs ${p.closed ? 'text-gray-400' : 'text-indigo-600'}">${p.isCurrent ? 'месяц идёт' : p.closed ? 'закрыт' : 'ещё не закрыт'}
          ${p.liveDiffers ? ` · <span class="text-amber-700">сейчас по данным ${rub(p.bill.amountDue)}</span> <button type="button" data-recompute="${p.period}" class="text-indigo-600 underline">Пересчитать</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }

  function termsHtml(card) {
    const eff = card.effectiveTerms;
    const rows = card.terms.map((t) => `
      <div class="flex justify-between items-center py-1 text-xs">
        <div>с ${esc(t.validFrom)}: ${percent(t.ratePercent)}, минимум ${rub(t.minPaymentRub)}${t.minWaived ? ', без минимума' : ''}${t.note ? ` — ${esc(t.note)}` : ''}</div>
        <button type="button" data-del-terms="${esc(t.validFrom)}" class="text-red-600">Убрать</button>
      </div>`).join('');
    return `<div class="text-gray-700 mb-2">Сейчас: ${percent(eff.ratePercent)}, минимум ${rub(eff.minPaymentRub)}${eff.minWaived ? ' (снят)' : ''}
        <span class="text-xs text-gray-400">${eff.source === 'plan' ? '— по тарифу' : ''}</span></div>
      <div class="text-xs text-gray-500 mb-2">Первые два месяца (неполный и следующий) — без минимума.</div>
      ${rows}
      <form id="terms-form" class="grid grid-cols-2 gap-2 mt-2">
        <label class="text-xs text-gray-500">С месяца<input name="validFrom" type="month" required class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"></label>
        <label class="text-xs text-gray-500">Ставка, %<input name="ratePercent" inputmode="decimal" required class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="${eff.ratePercent}"></label>
        <label class="text-xs text-gray-500">Минимум, ₽<input name="minPaymentRub" inputmode="numeric" required class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="${eff.minPaymentRub}"></label>
        <label class="text-xs text-gray-500 flex items-end gap-2 pb-2"><input name="minWaived" type="checkbox"> без минимума</label>
        <input name="note" placeholder="Заметка (например, «пилот, цена Бота 3 месяца»)" class="col-span-2 border rounded-lg px-2 py-1.5 text-sm">
        <button class="col-span-2 py-2 rounded-xl bg-indigo-600 text-white font-medium">Сохранить условия</button>
      </form>`;
  }

  function paymentsHtml(card) {
    const methods = card.paymentMethods;
    const list = card.payments.length
      ? card.payments.map((p) => `
        <div class="flex justify-between items-center py-1">
          <div>${esc(dayLabel(p.paidOn))} · <b>${rub(p.amountRub)}</b> · ${esc(p.methodLabel)}${p.note ? ` <span class="text-gray-400">— ${esc(p.note)}</span>` : ''}</div>
          <button type="button" data-cancel-payment="${p.id}" class="text-red-600 text-xs">Отменить</button>
        </div>`).join('')
      : '<div class="text-gray-500">Оплат пока нет.</div>';
    return `${list}
      <form id="payment-form" class="grid grid-cols-2 gap-2 mt-3">
        <label class="text-xs text-gray-500">Сумма, ₽<input name="amountRub" inputmode="decimal" required class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"></label>
        <label class="text-xs text-gray-500">Дата<input name="paidOn" type="date" required value="${todayLocal()}" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"></label>
        <label class="text-xs text-gray-500 col-span-2">Способ<select name="method" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
          ${Object.entries(methods).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <input name="note" placeholder="Заметка (номер чека и т.п.)" class="col-span-2 border rounded-lg px-2 py-1.5 text-sm">
        <button class="col-span-2 py-2 rounded-xl bg-indigo-600 text-white font-medium">Внести оплату</button>
      </form>`;
  }

  function chargesHtml(card) {
    const list = card.charges.length
      ? card.charges.map((c) => `
        <div class="flex justify-between items-center py-1">
          <div>${esc(c.kindLabel)}${c.period ? ` · ${esc(c.period)}` : ` · ${esc(dayLabel(c.createdOn))}`} · <b>${rub(c.amountRub)}</b>${c.note ? ` <span class="text-gray-400">— ${esc(c.note)}</span>` : ''}</div>
          <button type="button" data-cancel-charge="${c.id}" class="text-red-600 text-xs">Отменить</button>
        </div>`).join('')
      : '<div class="text-gray-500">Начислений пока нет.</div>';
    return `${list}
      <form id="charge-form" class="grid grid-cols-2 gap-2 mt-3">
        <label class="text-xs text-gray-500">За что<select name="kind" class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
          <option value="setup">Подключение</option><option value="hours">Доработки</option><option value="adjustment">Корректировка (можно с минусом)</option></select></label>
        <label class="text-xs text-gray-500">Сумма, ₽<input name="amountRub" inputmode="decimal" required class="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"></label>
        <input name="note" placeholder="Заметка (для корректировки — обязательно)" class="col-span-2 border rounded-lg px-2 py-1.5 text-sm">
        <button class="col-span-2 py-2 rounded-xl bg-gray-900 text-white font-medium">Начислить</button>
      </form>`;
  }

  function startHtml(card) {
    const t = card.tenant;
    if (t.billingStartedOn) {
      return `<div>Платит с <b>${esc(dayLabel(t.billingStartedOn))}</b>. Первый месяц — с этого дня до конца месяца, дальше — с 1-го числа.</div>`;
    }
    return `<div class="text-gray-600 mb-2">Счёт не ведётся. Укажите день, с которого посредник платит (после подключения и контрольного заказа).</div>
      <form id="start-form" class="flex gap-2">
        <input name="day" type="date" required value="${todayLocal()}" class="flex-1 border rounded-lg px-2 py-1.5 text-sm">
        <button class="px-4 rounded-xl bg-indigo-600 text-white font-medium">Начать счёт</button>
      </form>`;
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    return data;
  }

  async function showTenant(tenantId) {
    state.tenantId = tenantId;
    showBackButton();
    root().innerHTML = 'Загрузка…';
    const card = await run('getPlatformTenantCard', tenantId);
    const t = card.tenant;
    let html = `<div class="mb-3"><button type="button" id="console-back" class="text-sm text-indigo-600">← Все посредники</button></div>
      <div class="text-lg font-semibold mb-1">${tenantTitle(t)}</div>
      <div class="text-xs text-gray-500 mb-3">Тариф: ${esc(PLAN_LABELS[t.plan] || t.plan)}</div>`;

    if (card.mode === 'info') {
      html += section('Для сведения (Dream Dolls не платит)', `
        <div>Этот месяц: оборот ${rub(card.current.turnoverRub)}, по тарифу было бы ${rub(card.current.wouldBe)}; вес и доставка ${rub(card.current.otherStagesRub)}</div>
        <div class="text-gray-500">Прошлый месяц: оборот ${rub(card.previous.turnoverRub)}, было бы ${rub(card.previous.wouldBe)}</div>`);
      if (card.signals.length) html += section('Сигналы', signalsHtml(card.signals));
      root().innerHTML = html;
      wireCommon();
      return;
    }

    html += section('Подключение', startHtml(card));
    {
      // Долг, оплаты и начисления — и до начала счёта: подключение оплачивается заранее.
      html += section('Долг', `
        <div class="grid grid-cols-3 gap-2">
          <div><div class="text-xs text-gray-400">Начислено</div><div class="font-medium">${rub(card.balance.charged)}</div></div>
          <div><div class="text-xs text-gray-400">Оплачено</div><div class="font-medium">${rub(card.balance.paid)}</div></div>
          <div><div class="text-xs text-gray-400">Остаток</div><div class="font-semibold ${card.balance.balance > 0 ? 'text-red-600' : 'text-emerald-600'}">${rub(card.balance.balance)}</div></div>
        </div>
        <div class="text-xs text-gray-500 mt-1">С текущим месяцем, если закрыть сегодня: ${rub(card.balanceWithCurrent)}</div>`);
      if (card.signals.length) html += section('Сигналы', signalsHtml(card.signals));
      if (card.mode === 'billing') html += section('Месяцы', periodsHtml(card));
      html += section('Оплаты от посредника', paymentsHtml(card));
      html += section('Начисления', chargesHtml(card));
    }
    html += section('Условия', termsHtml(card));
    root().innerHTML = html;
    wireCommon();
    wireCard(tenantId);
  }

  function wireCommon() {
    const back = document.getElementById('console-back');
    if (back) back.addEventListener('click', () => showOverview());
  }

  function onSubmit(id, handler) {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await handler(formData(form));
        flash('Сохранено');
        await showTenant(state.tenantId);
      } catch (_) {
        button.disabled = false;
      }
    });
  }

  function onClick(selector, handler) {
    root().querySelectorAll(selector).forEach((btn) => btn.addEventListener('click', async () => {
      try {
        if (await handler(btn) !== false) await showTenant(state.tenantId);
      } catch (_) { /* ошибка уже показана */ }
    }));
  }

  function wireCard(tenantId) {
    onSubmit('start-form', (d) => run('setTenantBillingStart', tenantId, d.day));
    onSubmit('terms-form', (d) => run('setTenantBillingTerms', tenantId, { ...d, minWaived: d.minWaived === 'on' }));
    onSubmit('payment-form', (d) => run('recordPlatformPayment', tenantId, d));
    onSubmit('charge-form', (d) => run('addPlatformCharge', tenantId, d));
    onClick('[data-cancel-payment]', async (btn) => {
      if (!await showConfirmModal('Отменить эту оплату? Долг увеличится на её сумму.', { confirmLabel: 'Отменить оплату', danger: true })) return false;
      await run('cancelPlatformPayment', tenantId, Number(btn.dataset.cancelPayment));
    });
    onClick('[data-cancel-charge]', async (btn) => {
      if (!await showConfirmModal('Отменить это начисление?', { confirmLabel: 'Отменить начисление', danger: true })) return false;
      await run('cancelPlatformCharge', tenantId, Number(btn.dataset.cancelCharge));
    });
    onClick('[data-del-terms]', async (btn) => {
      if (!await showConfirmModal(`Убрать условия с ${btn.dataset.delTerms}?`, { confirmLabel: 'Убрать', danger: true })) return false;
      await run('deleteTenantBillingTerms', tenantId, btn.dataset.delTerms);
    });
    onClick('[data-recompute]', async (btn) => {
      if (!await showConfirmModal('Пересчитать закрытый месяц по текущим данным? Старое начисление останется в истории отменённым.', { confirmLabel: 'Пересчитать' })) return false;
      await run('recomputePlatformMonth', tenantId, btn.dataset.recompute);
    });
  }

  // ── Telegram ────────────────────────────────────────────────────────────────────────────────────

  function tgApp() {
    return window.Telegram && window.Telegram.WebApp;
  }

  function showBackButton() {
    const tg = tgApp();
    if (tg && tg.BackButton) tg.BackButton.show();
  }

  function hideBackButton() {
    const tg = tgApp();
    if (tg && tg.BackButton) tg.BackButton.hide();
  }

  async function boot() {
    const tg = tgApp();
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.BackButton) tg.BackButton.onClick(() => showOverview());
    }
    document.getElementById('console-refresh').addEventListener('click', () => (state.tenantId ? showTenant(state.tenantId) : showOverview()));
    try {
      await callServer('getPlatformAccess');
    } catch (error) {
      root().innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 p-4 text-gray-700">
        Консоль открывается только у владельца Кнопки и только из служебного бота консоли.<br>
        <span class="text-xs text-gray-400">${esc(error.message)}</span></div>`;
      return;
    }
    showOverview().catch(() => { root().textContent = 'Не удалось загрузить — нажмите «Обновить».'; });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
