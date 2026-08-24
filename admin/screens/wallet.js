'use strict';

/**
 * Экран "Кошелёк ₸" (Э2 рефакторинга экономики, хвост "экран менеджера",
 * 25.08.2026, NEXT-SESSION-PROMPT-E2.md) — единственная форма, которой не
 * хватало, чтобы backend Э2 (WAC-кошелёк, задеплоен и закоммичен 25.08.2026,
 * см. project_bot_knopka_economy_refactor) реально заработал: без неё ни
 * один менеджер физически не мог занести конвертацию ₽→₸.
 *
 * "Факт выкупа" сюда НЕ входит — он привязан к конкретному заказу
 * (`orderId` уже известен из контекста) и открывается кнопкой на самом
 * заказе (order-edit.js → PurchaseEventModal), не отсюда — вводить orderId
 * руками на отдельном экране не нужно.
 *
 * Три независимых блока, каждый сам грузится и сам обрабатывает свою ошибку
 * (тот же принцип, что settings.js — секция не должна блокировать соседние):
 *   1. Форма "Конвертация ₽→₸" (recordFxConversion) — единственная, которая
 *      что-то пишет на этом экране.
 *   2. "Реализованный буфер по каналам" (getCostBufferReport) — витрина,
 *      пустая, пока не накопятся purchase_events (R-03/R-07 — порог 30
 *      заказов на канал для осмысленного среднего, показывается явно).
 *   3. "Личные закупки" (getOwnPurchasesReport) — метрика личного контура,
 *      исключённого из остальных дашбордов (Э2, F-07/F-08).
 */
window.Screens = window.Screens || {};

const BUFFER_CHANNEL_MIN_ORDERS = 30; // R-07, REFACTOR-ECONOMY.md §6

window.Screens.wallet = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Кошелёк ₸</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-10 px-4 md:px-0 max-w-2xl mx-auto space-y-5">
        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Конвертация ₽ → ₸</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Отдано рублей</label>
              <input type="number" id="fx-rub-out-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Получено тенге</label>
              <input type="number" id="fx-kzt-in-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Комиссия банка, ₽ (если выделена отдельной строкой)</label>
              <input type="number" id="fx-bank-fee-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div id="fx-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2"></div>
            <div id="fx-result" class="hidden text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1"></div>
            <button type="button" id="fx-submit-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Записать конвертацию</button>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Реализованный буфер по каналам</div>
          <div id="buffer-report-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Личные закупки</div>
          <div id="own-purchases-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>
      </main>
    `;

    wireFxForm();
    loadBufferReport();
    loadOwnPurchases();
    if (window.lucide) window.lucide.createIcons();

    function wireFxForm() {
      const submitBtn = document.getElementById('fx-submit-btn');
      submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled) return;
        document.getElementById('fx-error').classList.add('hidden');
        document.getElementById('fx-result').classList.add('hidden');

        const rubOut = parseFloat(document.getElementById('fx-rub-out-input').value);
        const kztIn = parseFloat(document.getElementById('fx-kzt-in-input').value);
        const bankFeeRawInput = document.getElementById('fx-bank-fee-input').value;
        const bankFeeRub = bankFeeRawInput ? parseFloat(bankFeeRawInput) : undefined;

        if (!(rubOut > 0)) { showFxError('«Отдано рублей» должно быть больше нуля.'); return; }
        if (!(kztIn > 0)) { showFxError('«Получено тенге» должно быть больше нуля.'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Записываю...';
        try {
          const result = await callServer('recordFxConversion', { rubOut, kztIn, bankFeeRub });
          showFxResult(result);
          document.getElementById('fx-rub-out-input').value = '';
          document.getElementById('fx-kzt-in-input').value = '';
          document.getElementById('fx-bank-fee-input').value = '';
        } catch (error) {
          showFxError(error.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Записать конвертацию';
        }
      });
    }

    function showFxError(message) {
      const el = document.getElementById('fx-error');
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function showFxResult(result) {
      const el = document.getElementById('fx-result');
      el.innerHTML = `
        <div>Эффективный курс: <b>${result.effectiveRate.toFixed(4)} ₽/₸</b></div>
        <div>Новый баланс кошелька: ${result.walletBalanceKztAfter.toFixed(2)} ₸</div>
        <div>Новый WAC: ${result.wacAfter.toFixed(4)} ₽/₸</div>
      `;
      el.classList.remove('hidden');
    }

    async function loadBufferReport() {
      const body = document.getElementById('buffer-report-body');
      try {
        const rows = await callServer('getCostBufferReport');
        if (!rows || rows.length === 0) {
          body.innerHTML = `<div class="text-gray-400">Пока нет ни одного факта выкупа — буфер посчитать не из чего.</div>`;
          return;
        }
        body.innerHTML = `
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-gray-400">
                  <th class="pb-2 pr-2">Канал</th>
                  <th class="pb-2 pr-2 text-right">Заказов</th>
                  <th class="pb-2 pr-2 text-right">Средний</th>
                  <th class="pb-2 pr-2 text-right">Медиана</th>
                  <th class="pb-2 text-right">Мин–Макс</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${rows.map(rowHtml).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function rowHtml(r) {
      const ordersN = parseInt(r.orders_n, 10) || 0;
      const lowData = ordersN < BUFFER_CHANNEL_MIN_ORDERS;
      return `
        <tr class="text-gray-700">
          <td class="py-2 pr-2 font-medium">${escapeHtmlClient(r.purchase_channel || '—')}</td>
          <td class="py-2 pr-2 text-right ${lowData ? 'text-amber-600' : ''}">${ordersN}${lowData ? ' ⚠' : ''}</td>
          <td class="py-2 pr-2 text-right">${r.buffer_avg_pct !== null ? Number(r.buffer_avg_pct).toFixed(2) + '%' : '—'}</td>
          <td class="py-2 pr-2 text-right">${r.buffer_median_pct !== null ? Number(r.buffer_median_pct).toFixed(2) + '%' : '—'}</td>
          <td class="py-2 text-right">${r.buffer_min_pct !== null ? Number(r.buffer_min_pct).toFixed(2) : '—'}–${r.buffer_max_pct !== null ? Number(r.buffer_max_pct).toFixed(2) + '%' : '—'}</td>
        </tr>
        ${lowData ? `<tr><td colspan="5" class="pb-2 text-[10px] text-amber-600">⚠ Меньше ${BUFFER_CHANNEL_MIN_ORDERS} заказов с фактом — среднее ещё не показательно (R-07).</td></tr>` : ''}
      `;
    }

    async function loadOwnPurchases() {
      const body = document.getElementById('own-purchases-body');
      try {
        const report = await callServer('getOwnPurchasesReport');
        body.innerHTML = `
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="text-[11px] text-gray-400">Заказов</div>
              <div class="text-base font-semibold text-gray-900">${report.orderCount}</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Потрачено</div>
              <div class="text-base font-semibold text-gray-900">${Number(report.totalSpentRub).toLocaleString('ru-RU')} ₽</div>
            </div>
          </div>
          <div class="text-[11px] text-gray-400 mt-2 text-center">Личный контур (client_kind='own') — исключён из остальных дашбордов, у него нет плательщика.</div>
        `;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }
  }
};
