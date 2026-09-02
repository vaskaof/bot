'use strict';

/**
 * Экран "Новый лот"/"Новая корзина" — delegated-spinning-rabbit.md
 * (02.09.2026). Один экран, точка входа (`params.entryPoint`, 'lot'|'cart')
 * влияет только на заголовок и подпись — сама механика идентична, VASY
 * явно подтвердил "Лот и Корзина — один экран с разным дефолтом клиента".
 *
 * Структура — гибрид bulk-режима `order-new.js` (построчные клиенты,
 * `ManualClientModal`/`SkuModal` переинициализируются на каждый клик "+
 * добавить", тот же приём, что `addBulkRow`'s "+ Ввести вручную") и
 * слайдер-механики `collective-detail.js` (живой пересчёт долей без
 * пересоздания DOM активного ползунка).
 *
 * Стоимость позиции = "Цена товара" (опционально, если менеджер её знает
 * заранее — реальный кейс VASY, доп. раунд 02.09.2026: в корзине цена
 * каждого товара известна, но есть общие траты типа доставки/упаковки
 * площадки) + её доля от РАЗНИЦЫ между общей суммой лота и суммой всех
 * известных цен (коэффициент 0…2, дефолт 1 = поровну — обязательно
 * заполнено на КАЖДОЙ позиции, не переключатель режима). Это строгое
 * обобщение прежней "коэффициент XOR вручную" модели — цена=0 у всех даёт
 * ровно старое чисто-коэффициентное поведение. Доля ВЕСА/логистики —
 * ВТОРОЙ, полностью независимый коэффициент (явное решение VASY: стоимость
 * в лоте не равна весу, одно не выводится из другого). Округление суммы
 * позиции + перенос остатка на позицию с наибольшей долей разницы —
 * согласованное решение, см. splitProportionallyClient ниже (дублирует
 * backend `splitProportionally`, см. её JSDoc про намеренное дублирование
 * между Node backend и SPA без сборки — сервер пересчитывает сам при
 * сохранении, эта копия только для мгновенного визуального фидбека при
 * перетаскивании ползунка).
 */
const LOT_DRAFT_KEY_PREFIX = 'pendingLotDraft:';

window.Screens = window.Screens || {};
window.Screens.lotNew = {
  render(root, dictionaries, params, signal) {
    const entryPoint = params.entryPoint === 'cart' ? 'cart' : 'lot';
    const title = entryPoint === 'cart' ? 'Новая корзина' : 'Новый лот';

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">${title}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="save-lot-btn" title="Создать" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="draft-recovery-banner" class="hidden mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"></div>

        <!-- Шапка лота — общая, НЕ переопределяется по позициям (в отличие
             от bulk-режима одиночного заказа) -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible mb-3">
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Общая стоимость</span>
            </div>
            <div class="flex-1 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <select id="lot-currency-select" class="bg-transparent border-none outline-none text-sm font-medium text-gray-600 cursor-pointer">
                  <option value="Доллар">USD ($)</option>
                  <option value="Юань">CNY (¥)</option>
                  <option value="Евро">EUR (€)</option>
                  <option value="Фунт">GBP (£)</option>
                </select>
                <input type="number" id="lot-amount-input" class="w-24 bg-transparent border-none outline-none text-lg font-semibold text-gray-900 placeholder-gray-300 py-1" placeholder="0.00" step="0.01">
              </div>
              <div class="flex flex-col sm:items-end">
                <div class="flex items-center gap-1 text-[11px] text-gray-500">
                  Курс: <span id="lot-rate-display">—</span> ₽
                  <button id="lot-refresh-rate" title="Обновить курс" class="hover:text-indigo-600 transition-colors">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                  </button>
                </div>
                <div class="text-sm text-gray-600 font-medium mt-0.5">≈ <span id="lot-calculated-rub">0.00</span> ₽</div>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                <i data-lucide="shopping-bag" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Канал выкупа</span>
            </div>
            <div class="flex-1 w-full"><select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="purchaseChannel"></select></div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <i data-lucide="user" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Аккаунт</span>
            </div>
            <div class="flex-1 w-full"><select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="purchaseAccount"></select></div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                <i data-lucide="package" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Карго</span>
            </div>
            <div class="flex-1 w-full"><select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="cargo"></select></div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <i data-lucide="calendar" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Дата выкупа</span>
            </div>
            <div class="flex-1 w-full"><input type="date" id="lot-date-input" class="w-full bg-transparent border-none outline-none text-[15px] py-1 text-gray-700"></div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i data-lucide="ruler" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700 inline-flex items-center gap-1">Округление${helpIcon('Округление суммы позиции', '<p>Сумма каждой позиции округляется до выбранного шага. Разница, которая набегает от округления, целиком уходит на позицию с наибольшей долей — чтобы расхождение было видно на одной строке, а не терялось незаметно.</p>')}</span>
            </div>
            <div class="flex-1 w-full">
              <select id="lot-rounding-select" class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer">
                <option value="1">До 1 ₽</option>
                <option value="10">До 10 ₽</option>
                <option value="50">До 50 ₽</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Прогноз веса/логистики на ВЕСЬ лот (§1.5 плана) — считается ОДИН
             раз от общей суммы лота, делится по коэффициенту веса каждой
             позиции при сохранении, здесь только информационная сводка. -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Прогноз расходов на весь лот</div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div><div class="text-[11px] text-gray-400">Вес</div><div id="lot-forecast-weight" class="text-sm font-semibold text-gray-800">—</div></div>
            <div><div class="text-[11px] text-gray-400">Доставка КЗ→РФ</div><div id="lot-forecast-kzrf" class="text-sm font-semibold text-gray-800">—</div></div>
            <div><div class="text-[11px] text-gray-400">Доставка по РФ</div><div id="lot-forecast-rf" class="text-sm font-semibold text-gray-800">—</div></div>
          </div>
          <div class="text-[11px] text-gray-400 mt-2">Разделится между позициями по доле веса, независимо от доли стоимости.</div>
        </div>

        <!-- Позиции -->
        <div id="lot-positions-list"></div>
        <button type="button" id="add-position-btn" class="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium mb-3">+ Добавить позицию</button>

        ${ManualClientModal.html()}
        ${SkuModal.html()}
      </main>
    `;

    // --- Общие поля / курс ---
    const amountInput = document.getElementById('lot-amount-input');
    const currencySelect = document.getElementById('lot-currency-select');
    const rateDisplay = document.getElementById('lot-rate-display');
    const calculatedRub = document.getElementById('lot-calculated-rub');
    const dateInput = document.getElementById('lot-date-input');
    const roundingSelect = document.getElementById('lot-rounding-select');

    let currentRates = {};
    let currentRate = 0;
    let currentCurrency = 'Доллар';

    const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_CONFIG.TIMEZONE });
    dateInput.value = todayFormatter.format(new Date());

    FormHelpers.wireDictionarySelect('select[data-dict="purchaseChannel"]', 'purchaseChannel', dictionaries.purchaseChannel);
    FormHelpers.wireDictionarySelect('select[data-dict="purchaseAccount"]', 'purchaseAccount', dictionaries.purchaseAccount);
    FormHelpers.wireDictionarySelect('select[data-dict="cargo"]', 'cargo', dictionaries.cargo);

    function updateCalc() {
      const amount = parseFloat(amountInput.value) || 0;
      calculatedRub.textContent = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount * currentRate);
    }

    function applyCurrentCurrencyRate() {
      const rawRate = currentRates[currentCurrency];
      if (rawRate === undefined || rawRate === '') return;
      currentRate = parseFloat(rawRate.toString().replace(',', '.'));
      if (isNaN(currentRate)) return;
      rateDisplay.textContent = currentRate.toFixed(2);
      updateCalc();
      patchAllCostShares();
    }

    async function refreshRate() {
      const icon = document.getElementById('lot-refresh-rate').querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      try {
        const rates = await callServer('refreshRate');
        if (rates && rates.finalRates) {
          currentRates = rates.finalRates;
          applyCurrentCurrencyRate();
        }
      } catch (error) {
        showSaveToast(false, `Не удалось обновить курсы валют: ${error.message}`);
      } finally {
        if (icon) icon.classList.remove('animate-spin');
      }
    }
    document.getElementById('lot-refresh-rate').addEventListener('click', refreshRate);
    currencySelect.addEventListener('change', (e) => { currentCurrency = e.target.value; applyCurrentCurrencyRate(); });
    refreshRate();

    const fetchLotForecast = debounce(async () => {
      const amount = parseFloat(amountInput.value) || 0;
      if (amount <= 0) return;
      try {
        const channel = document.querySelector('select[data-dict="purchaseChannel"]').value;
        const forecast = await callServer('getOrderForecast', amount, currencySelect.value, channel);
        document.getElementById('lot-forecast-weight').textContent = `${(forecast.weight || 0).toFixed(2)} ₽`;
        document.getElementById('lot-forecast-kzrf').textContent = `${((forecast.taxiKz || 0) + (forecast.sdek || 0) + (forecast.taxiRf || 0)).toFixed(2)} ₽`;
        document.getElementById('lot-forecast-rf').textContent = `${((forecast.taxiRfSend || 0) + (forecast.shippingRf || 0) + (forecast.taxiRfReceive || 0)).toFixed(2)} ₽`;
      } catch (error) { /* прогноз — необязательное удобство */ }
    }, 400);
    amountInput.addEventListener('input', () => { updateCalc(); patchAllCostShares(); fetchLotForecast(); });
    currencySelect.addEventListener('change', fetchLotForecast);
    document.querySelector('select[data-dict="purchaseChannel"]').addEventListener('change', fetchLotForecast);
    roundingSelect.addEventListener('change', patchAllCostShares);

    // --- Клиентская копия splitProportionally (backend — источник истины,
    // см. её JSDoc; здесь только для живого фидбека при перетаскивании).
    // Доп. раунд 02.09.2026: каждая строка = известная цена (basePrice,
    // по умолчанию 0) + доля УЧАСТИЯ В РАЗНИЦЕ между pool и суммой всех
    // известных цен (weight, по умолчанию 1 = поровну; 0 = не участвует в
    // разнице, получает ровно свою цену) — строгое обобщение прежней
    // "коэффициент XOR вручную" модели, не отдельный режим. ---
    function splitProportionallyClient(pool, rows, roundingStep) {
      const step = roundingStep && roundingStep > 0 ? roundingStep : 0.01;
      const result = new Map();
      if (rows.length === 0) return result;
      const basePrices = rows.map((r) => Number(r.basePrice) || 0);
      const basesSum = basePrices.reduce((s, v) => s + v, 0);
      const remainder = pool - basesSum;
      const weights = rows.map((r) => (r.weight === null || r.weight === undefined ? 1 : Number(r.weight) || 0));
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      const rawShares = rows.map((r, i) => (totalWeight > 0 ? (remainder * weights[i]) / totalWeight : 0));
      const rawFinals = rows.map((r, i) => basePrices[i] + rawShares[i]);
      let roundedSum = 0, largestIndex = 0;
      rows.forEach((r, i) => {
        const rounded = Math.round(rawFinals[i] / step) * step;
        result.set(r.id, rounded);
        roundedSum += rounded;
        if (rawShares[i] > rawShares[largestIndex]) largestIndex = i;
      });
      const roundingRemainder = pool - roundedSum;
      const targetId = rows[largestIndex].id;
      result.set(targetId, (result.get(targetId) || 0) + roundingRemainder);
      return result;
    }

    // --- Позиции ---
    let rows = [];
    let rowSeq = 0;
    const positionsList = document.getElementById('lot-positions-list');
    const addPositionBtn = document.getElementById('add-position-btn');

    function totalCostRub() {
      return (parseFloat(amountInput.value) || 0) * currentRate;
    }

    function patchAllCostShares() {
      const pool = totalCostRub();
      const roundingStep = parseFloat(roundingSelect.value) || 1;
      const costRows = rows.map((r) => ({
        id: r.id,
        weight: r.costCoefficient,
        basePrice: parseFloat(r.knownPriceInputEl.value) || 0
      }));
      const shares = splitProportionallyClient(pool, costRows, roundingStep);
      rows.forEach((r) => {
        r.costShareRub = shares.get(r.id) || 0;
        r.costShareDisplayEl.textContent = `${r.costShareRub.toFixed(2)} ₽`;
        if (document.activeElement !== r.feeRubEl) updateRowFeeRub(r);
      });
    }

    function updateRowFeeRub(row) {
      const percent = parseFloat(row.feePercentEl.value) || 0;
      const rub = row.costShareRub * (percent / 100);
      if (document.activeElement !== row.feeRubEl) row.feeRubEl.value = rub > 0 ? rub.toFixed(2) : '';
    }
    function updateRowFeePercent(row) {
      const rub = parseFloat(row.feeRubEl.value) || 0;
      if (row.costShareRub > 0) {
        const percent = (rub / row.costShareRub) * 100;
        if (document.activeElement !== row.feePercentEl) row.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
      } else if (document.activeElement !== row.feePercentEl) {
        row.feePercentEl.value = '';
      }
    }

    function unitsFractionLabel(v) {
      return Number(v).toFixed(2);
    }

    function removeRow(id) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return;
      rows[idx].rowEl.remove();
      rows.splice(idx, 1);
      patchAllCostShares();
    }

    function searchClientStub(query) { return callServer('searchClients', query); }
    function searchReleaseStub(query) { return callServer('searchSku', query); }

    function addRow(prefillClient) {
      const id = ++rowSeq;
      const rowEl = document.createElement('div');
      rowEl.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3';
      rowEl.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-semibold text-gray-400">Позиция ${rows.length + 1}</span>
          <button type="button" class="remove-row-btn p-1 text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>

        <div class="relative mb-2">
          <input type="text" class="client-search w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Поиск клиента..." autocomplete="off">
          <ul class="client-dropdown dropdown-menu custom-scrollbar"></ul>
        </div>

        <div class="relative mb-2">
          <input type="text" class="product-search w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Поиск товара..." autocomplete="off">
          <ul class="product-dropdown dropdown-menu custom-scrollbar"></ul>
        </div>

        <div class="mb-1.5">
          <label class="text-[11px] text-gray-500">Цена товара, ₽ (если известна заранее)</label>
          <input type="number" class="known-price-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00 — оставьте пустым, если не знаете" step="0.01">
        </div>
        <div class="flex items-center justify-between text-[11px] text-gray-500">
          <span class="inline-flex items-center gap-0.5">Доля в общих тратах${helpIcon('Доля в общих тратах', '<p>Разница между общей суммой лота и суммой известных цен товаров (доставка/упаковка и т.п.) делится между позициями по этой доле. По умолчанию 1 у всех — поровну. 0 — позиция не участвует в разнице, получает ровно свою известную цену.</p>')}</span>
          <span class="coef-fraction-label font-semibold text-indigo-600">1.00</span>
        </div>
        <input type="range" min="0" max="2" step="0.25" value="1" class="cost-slider w-full">
        <div class="text-right text-sm font-semibold text-gray-800 cost-share-display mt-1">0.00 ₽</div>

        <div class="mt-2 pt-2 border-t border-gray-100">
          <div class="flex items-center justify-between text-[11px] text-gray-500">
            <span class="inline-flex items-center gap-0.5">Доля веса/логистики${helpIcon('Доля веса', '<p>Независимый коэффициент — стоимость товара в лоте не равна его весу. Задайте, насколько тяжёлая/лёгкая эта позиция ОТНОСИТЕЛЬНО других в этом лоте, для разбивки прогноза веса/доставки выше.</p>')}</span>
            <span class="weight-fraction-label font-semibold text-teal-600">1.00</span>
          </div>
          <input type="range" min="0" max="2" step="0.25" value="1" class="weight-slider w-full">
        </div>

        <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
          <div>
            <label class="text-[11px] text-gray-500">Комиссия %</label>
            <input type="number" class="fee-percent-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
          </div>
          <div>
            <label class="text-[11px] text-gray-500">Комиссия ₽</label>
            <input type="number" class="fee-rub-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
          </div>
        </div>
      `;
      positionsList.appendChild(rowEl);
      if (window.lucide) window.lucide.createIcons();

      const row = {
        id, rowEl,
        clientSearchEl: rowEl.querySelector('.client-search'),
        clientDropdownEl: rowEl.querySelector('.client-dropdown'),
        telegramId: '', username: '', name: '', manualClientData: null,
        productSearchEl: rowEl.querySelector('.product-search'),
        productDropdownEl: rowEl.querySelector('.product-dropdown'),
        productOriginal: '',
        costCoefficient: 1,
        knownPriceInputEl: rowEl.querySelector('.known-price-input'),
        costSliderEl: rowEl.querySelector('.cost-slider'),
        costFractionLabelEl: rowEl.querySelector('.coef-fraction-label'),
        costShareDisplayEl: rowEl.querySelector('.cost-share-display'),
        costShareRub: 0,
        weightCoefficient: 1,
        weightSliderEl: rowEl.querySelector('.weight-slider'),
        weightFractionLabelEl: rowEl.querySelector('.weight-fraction-label'),
        feePercentEl: rowEl.querySelector('.fee-percent-input'),
        feeRubEl: rowEl.querySelector('.fee-rub-input')
      };
      rows.push(row);

      // Клиент — дефолт: копируется из предыдущей строки при добавлении
      // (прямое требование VASY), легко переопределяется поиском.
      if (prefillClient) {
        row.telegramId = prefillClient.telegramId || '';
        row.username = prefillClient.username || '';
        row.name = prefillClient.name || '';
        row.manualClientData = prefillClient.manualClientData || null;
        row.clientSearchEl.value = prefillClient.display || '';
      }

      rowEl.querySelector('.remove-row-btn').addEventListener('click', () => removeRow(id));

      // --- поиск клиента ---
      const handleClientSearch = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) { row.clientDropdownEl.classList.remove('active'); return; }
        const results = await searchClientStub(query);
        FormHelpers.renderDropdown(row.clientDropdownEl, results, (item) => `
          <div class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
            ${escapeHtmlClient(item.displayName)}
            ${item.pending ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">не подтверждён</span>' : ''}
          </div>
        `, (item) => {
          row.clientSearchEl.value = item.displayName;
          row.telegramId = item.telegramId;
          row.username = item.username;
          row.name = item.name;
          row.manualClientData = null;
          row.clientDropdownEl.classList.remove('active');
        });
        row.clientDropdownEl.appendChild(Object.assign(document.createElement('li'), {
          className: 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center',
          textContent: '+ Ввести вручную'
        })).addEventListener('click', () => {
          row.clientDropdownEl.classList.remove('active');
          const manualModal = ManualClientModal.init({
            onSaved: ({ username, name }) => {
              row.manualClientData = { username, name };
              row.telegramId = '';
              row.username = username;
              row.name = name;
              row.clientSearchEl.value = name !== '' ? `${name} (${username || 'без username'})` : (username || 'Без данных');
            }
          });
          manualModal.open();
        });
      }, 300);
      row.clientSearchEl.addEventListener('input', handleClientSearch);
      row.clientSearchEl.addEventListener('focus', () => { if (row.clientSearchEl.value.trim().length >= 2) row.clientDropdownEl.classList.add('active'); });

      // --- поиск товара ---
      const handleProductSearch = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) { row.productDropdownEl.classList.remove('active'); return; }
        const results = await searchReleaseStub(query);
        FormHelpers.renderDropdown(row.productDropdownEl, results, (item) => `
          <div class="font-medium text-gray-800 text-sm truncate">${item.label}</div>
        `, (item) => {
          row.productSearchEl.value = item.value;
          row.productOriginal = item.value;
          row.productDropdownEl.classList.remove('active');
        });
        row.productDropdownEl.appendChild(Object.assign(document.createElement('li'), {
          className: 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center',
          textContent: '+ Добавить товар'
        })).addEventListener('click', () => {
          row.productDropdownEl.classList.remove('active');
          const skuModal = SkuModal.init({
            onSaved: (result, action) => {
              if (action === 'create') {
                row.productSearchEl.value = result.value;
                row.productOriginal = result.value;
                showSaveToast(true, `Позиция «${result.label || result.value}» создана и добавлена в каталог`);
              }
            }
          });
          skuModal.open('create', null, { original: row.productSearchEl.value.trim() });
        });
      }, 300);
      row.productSearchEl.addEventListener('input', handleProductSearch);
      row.productSearchEl.addEventListener('input', () => { row.productOriginal = row.productSearchEl.value; });
      row.productSearchEl.addEventListener('focus', () => { if (row.productSearchEl.value.trim().length >= 2) row.productDropdownEl.classList.add('active'); });

      // --- цена товара + доля в общих тратах ---
      row.knownPriceInputEl.addEventListener('input', patchAllCostShares);

      row.costSliderEl.addEventListener('input', () => {
        row.costCoefficient = parseFloat(row.costSliderEl.value);
        row.costFractionLabelEl.textContent = unitsFractionLabel(row.costCoefficient);
        patchAllCostShares();
      });
      row.weightSliderEl.addEventListener('input', () => {
        row.weightCoefficient = parseFloat(row.weightSliderEl.value);
        row.weightFractionLabelEl.textContent = unitsFractionLabel(row.weightCoefficient);
      });

      row.feePercentEl.addEventListener('input', () => updateRowFeeRub(row));
      row.feeRubEl.addEventListener('input', () => updateRowFeePercent(row));

      patchAllCostShares();
      return row;
    }

    addPositionBtn.addEventListener('click', () => {
      const last = rows[rows.length - 1];
      const prefill = last ? {
        telegramId: last.telegramId, username: last.username, name: last.name,
        manualClientData: last.manualClientData, display: last.clientSearchEl.value
      } : null;
      addRow(prefill);
    });
    addRow(); // одна строка сразу, как в bulk-режиме заказа

    document.addEventListener('click', (e) => {
      rows.forEach((row) => {
        if (!row.clientSearchEl.contains(e.target) && !row.clientDropdownEl.contains(e.target)) row.clientDropdownEl.classList.remove('active');
        if (!row.productSearchEl.contains(e.target) && !row.productDropdownEl.contains(e.target)) row.productDropdownEl.classList.remove('active');
      });
    }, { signal });

    // --- Сохранение ---
    const saveBtn = document.getElementById('save-lot-btn');
    let saving = false;

    function buildPayload() {
      return {
        header: {
          totalAmountInCurrency: amountInput.value,
          currency: currencySelect.value,
          entryPoint,
          roundingStep: roundingSelect.value,
          purchaseChannel: document.querySelector('select[data-dict="purchaseChannel"]').value,
          purchaseAccount: document.querySelector('select[data-dict="purchaseAccount"]').value,
          cargo: document.querySelector('select[data-dict="cargo"]').value,
          purchaseDate: dateInput.value
        },
        positions: rows.map((r) => ({
          id: String(r.id),
          client: r.manualClientData
            ? { telegramId: '', username: r.manualClientData.username, name: r.manualClientData.name }
            : { telegramId: r.telegramId || '', username: r.username, name: r.name },
          productOriginal: r.productOriginal || r.productSearchEl.value,
          costCoefficient: r.costCoefficient,
          knownPriceRub: parseFloat(r.knownPriceInputEl.value) || 0,
          weightCoefficient: r.weightCoefficient,
          commissionRub: parseFloat(r.feeRubEl.value) || 0,
          requestId: generateRequestId()
        }))
      };
    }

    async function saveLot() {
      if (saving) return;
      if (rows.length === 0) { showSaveToast(false, 'Добавьте хотя бы одну позицию.'); return; }
      const missingProduct = rows.some((r) => !(r.productOriginal || r.productSearchEl.value).trim());
      if (missingProduct) { showSaveToast(false, 'У каждой позиции должен быть указан товар.'); return; }

      saving = true;
      saveBtn.disabled = true;
      saveBtn.classList.add('save-pulse');
      const payload = buildPayload();
      const draftKey = LOT_DRAFT_KEY_PREFIX + entryPoint;
      saveOrderDraft(draftKey, payload);
      try {
        const response = await callServer('createLot', payload);
        const failCount = response.results.filter((r) => !r.success).length;
        if (failCount === 0) {
          clearOrderDraft(draftKey);
          showSaveToast(true, entryPoint === 'cart' ? 'Корзина создана' : 'Лот создан');
          navigateTo(`lots/${encodeURIComponent(response.lotId)}`);
        } else {
          showSaveToast(false, `Создано ${response.results.length - failCount} из ${response.results.length} позиций — часть не удалась, лот уже сохранён, откройте карточку.`);
          navigateTo(`lots/${encodeURIComponent(response.lotId)}`);
        }
      } catch (error) {
        showSaveToast(false, `Не удалось создать лот: ${error.message}`);
      } finally {
        saving = false;
        saveBtn.disabled = false;
        saveBtn.classList.remove('save-pulse');
      }
    }
    saveBtn.addEventListener('click', saveLot);

    if (window.lucide) window.lucide.createIcons();
  }
};
