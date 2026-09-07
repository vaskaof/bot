'use strict';

/**
 * Карточка «Лот» «Корзины» — вынесена из `cart-new.js` (§5 D4,
 * IMPLEMENTATION-PLAN-CART-UX.md, 07.09.2026) — тот же перенос без
 * поведенческих изменений, что и `_cart-position.js` (см. её JSDoc за
 * полным описанием `ctx`/global-конвенций, не повторяется здесь). Лот —
 * свёрнутая карточка-сводка, разворачивается в мини-версию формы
 * `lot-new.js` (построчные клиент+товар+известная цена+два слайдера
 * доли+комиссия+«Сколько уже оплачено»).
 *
 * `cart-new.js` вызывает `CartLot.create(ctx)` на "+ Добавить лот",
 * получает готовый lotItem-объект с тем же интерфейсом, что был у
 * `addLotItem` раньше (getTotalRub/getEffectiveBaseRub/getCommissionRub/
 * getCostCoefficient/getClientRows/getUnresolvedClientRows/getPayload/
 * setReconciledShareRub/setCollapsed/onRateChanged/validateCommissionGates/
 * hasPositions/hasMissingProduct), кладёт его в свой массив `items`.
 *
 * `ctx` — тот же контракт, что у `_cart-position.js`: `items`, `itemsList`,
 * `nextItemId()`, `getCurrentRate()`, `getCurrentCurrency()`,
 * `recomputeTotals()`, `updateSummaryDisplay()`, `removeItem(id)`,
 * `collectClientRow(entity, uidHint)`, `wireManualShareControl(blockEl)`,
 * `currentChannel()`. Лот НЕ использует `clientLabelFor` напрямую (только
 * через `collectClientRow`, которая уже вызывает его внутри себя в
 * cart-new.js).
 */
window.CartLot = {
  create(ctx) {
    const id = ctx.nextItemId();
    const wrapEl = document.createElement('div');
    // Левый акцент-бордер (5.3, репорт VASY 05.09.2026) — визуально
    // отличает "Лот" (несколько позиций как ОДНА заявка) от обычной
    // "Позиции" на этом же экране (та же indigo-палитра, что уже у
    // иконки "boxes" ниже).
    wrapEl.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-indigo-400 mb-3 overflow-visible';
    wrapEl.innerHTML = `
      <div class="lot-summary-row flex items-center justify-between p-3 cursor-pointer">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="boxes" class="w-4 h-4 text-indigo-500 shrink-0"></i>
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-800">Лот</div>
            <div class="lot-summary-text text-[11px] text-gray-400 truncate">0 позиций · Итого 0.00 ₽</div>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="remove-item-btn p-1 text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
          <i data-lucide="chevron-down" class="lot-chevron w-4 h-4 text-gray-400 transition-transform"></i>
        </div>
      </div>
      <div class="lot-body hidden border-t border-gray-100 p-3">
        <!-- Ссылка на лот — ОДНА на весь лот, в начале (5.2, репорт VASY
             05.09.2026): раньше дублировалась на каждой позиции лота
             (менеджер вписывал один и тот же URL построчно). "Найти" тут
             не привязывает товар ни к одной конкретной строке (в лоте
             несколько разных товаров) — только распознаёт/заводит позицию
             каталога по ссылке информационно, товар на каждой строке
             по-прежнему выбирается своим поиском ниже. -->
        <div class="relative mb-2">
          <label class="text-[11px] text-gray-500">Ссылка на покупку (одна на весь лот)</label>
          <div class="flex items-center gap-1">
            <input type="text" class="lot-purchase-link-input flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="https://...">
            <button type="button" class="lot-purchase-link-resolve-btn shrink-0 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium">Найти</button>
          </div>
        </div>
        <!-- §5 D2 — поле в валюте, не в рублях, см. комментарий на
             .amount-input выше. -->
        <div class="mb-2">
          <label class="text-[11px] text-gray-500">Общая стоимость лота (в валюте корзины)</label>
          <div class="flex items-center gap-2">
            <span class="lot-amount-currency-symbol text-sm text-blue-500 font-medium"></span>
            <input type="number" class="lot-amount-input w-full bg-blue-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
          </div>
        </div>
        <!-- Ручная фиксация доли (§3 B1/B2, ИСПРАВЛЕНО 06.09.2026) —
             весь ЛОТ как ОДНА заявка корзины (НЕ путать со слайдерами
             долей ВНУТРИ лота ниже — те остаются, §3 B4). Видна ТОЛЬКО
             когда заполнено «Итог с сайта выкупа», см. её JSDoc в render(). -->
        <div class="cost-coef-block hidden mb-2">
          <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span>Итог лота с учётом разницы, ₽</span>
            <span class="manual-mode-label text-[10px] font-medium text-gray-400">авто</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input type="number" class="manual-total-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00" step="0.01" min="0">
            <button type="button" class="manual-total-reset-btn hidden shrink-0 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] whitespace-nowrap">Сбросить</button>
          </div>
        </div>
        <div class="mb-2">
          <label class="text-[11px] text-gray-500 inline-flex items-center gap-1">Округление${helpIcon('Округление', '<p>Сумма каждой позиции лота округляется до выбранного шага, остаток от округления уходит на позицию с наибольшей долей разницы.</p>')}</label>
          <select class="lot-rounding-select w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none">
            <option value="1">До 1 ₽</option>
            <option value="10">До 10 ₽</option>
            <option value="50">До 50 ₽</option>
          </select>
        </div>
        <div class="lot-positions-list"></div>
        <button type="button" class="add-lot-position-btn w-full py-2 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 text-xs font-medium">+ Добавить позицию лота</button>
      </div>
    `;
    ctx.itemsList.appendChild(wrapEl);
    if (window.lucide) window.lucide.createIcons();

    const summaryRow = wrapEl.querySelector('.lot-summary-row');
    const summaryText = wrapEl.querySelector('.lot-summary-text');
    const chevron = wrapEl.querySelector('.lot-chevron');
    const body = wrapEl.querySelector('.lot-body');
    const lotPurchaseLinkInputEl = wrapEl.querySelector('.lot-purchase-link-input');
    const lotPurchaseLinkResolveBtn = wrapEl.querySelector('.lot-purchase-link-resolve-btn');
    const amountInput = wrapEl.querySelector('.lot-amount-input');
    const amountSymbolEl = wrapEl.querySelector('.lot-amount-currency-symbol');
    const roundingSelect = wrapEl.querySelector('.lot-rounding-select');
    const positionsList = wrapEl.querySelector('.lot-positions-list');
    const addPositionBtn = wrapEl.querySelector('.add-lot-position-btn');
    // Ручная фиксация доли лота целиком (§3 B1/B2, ИСПРАВЛЕНО 06.09.2026)
    // — единственный `.cost-coef-block` на уровне всего лота (см. HTML
    // выше, сразу под "Общая стоимость лота"); строки ВНУТРИ лота
    // (positionsList) такого блока не имеют, поэтому селектор без риска
    // задеть не ту разметку.
    const cartCoefBlockEl = wrapEl.querySelector('.cost-coef-block');
    const lotManualShare = ctx.wireManualShareControl(cartCoefBlockEl);
    lotManualShare.onChange(() => ctx.recomputeTotals());

    // Ссылка на лот — та же кнопка "Найти", что на отдельной позиции
    // (resolveOrderProductLink), но БЕЗ привязки к конкретной строке —
    // лот содержит несколько разных товаров, поэтому результат только
    // информирует (тост/создание позиции каталога), ничего не подставляет
    // ни в одну из строк автоматически (5.2, см. комментарий в разметке).
    lotPurchaseLinkResolveBtn.addEventListener('click', async () => {
      const url = lotPurchaseLinkInputEl.value.trim();
      if (!url) return;
      lotPurchaseLinkResolveBtn.disabled = true;
      try {
        const result = await callServer('resolveOrderProductLink', url);
        if (result.status === 'matched') {
          showSaveToast(true, `Ссылка распознана — товар в каталоге: «${result.sku.value || result.sku.label || ''}». Выберите его в нужной строке лота вручную.`);
        } else if (result.status === 'unmatched') {
          const skuModal = SkuModal.init({
            onSaved: (skuResult, action) => {
              if (action === 'create') {
                showSaveToast(true, `Позиция «${skuResult.label || skuResult.value}» создана и добавлена в каталог — выберите её в нужной строке лота.`);
              }
            }
          });
          skuModal.open('create', null, { original: (result.resolved && result.resolved.title) || '', description: result.resolved && result.resolved.description, imageUrl: result.resolved && result.resolved.imageUrl });
        }
      } catch (error) {
        showSaveToast(false, `Не удалось распознать ссылку: ${error.message}`);
      } finally {
        lotPurchaseLinkResolveBtn.disabled = false;
      }
    });

    let expanded = false;
    // §5 D1 — "Свернуть все"/"Развернуть все" в render() зовут это же
    // через lotItem.setCollapsed ниже (общий интерфейс с позицией), не
    // дублируют переключение.
    function setLotExpanded(nextExpanded) {
      expanded = nextExpanded;
      body.classList.toggle('hidden', !expanded);
      chevron.style.transform = expanded ? 'rotate(180deg)' : '';
    }
    summaryRow.addEventListener('click', (e) => {
      if (e.target.closest('.remove-item-btn')) return;
      setLotExpanded(!expanded);
    });
    wrapEl.querySelector('.remove-item-btn').addEventListener('click', () => ctx.removeItem(id));

    let lotRows = [];
    let lotRowSeq = 0;

    // Комиссионный гейт Э6/D-10 (слияние «Новый заказ»→«Корзина»,
    // 05.09.2026) — пороги ОДНИ на весь лот (не зависят от суммы конкретной
    // позиции, только от настроек/канала), запрашиваются ОДИН раз, не на
    // каждую позицию — тот же принцип "один вызов на весь лот", что уже
    // применяется к прогнозу Вес/СДЭК/Доставка_РФ на бэкенде
    // (lotsService.createLot JSDoc).
    let commissionThresholds = { warnPercent: null, reasonPercent: null };
    // Э6, точка безубыточности — та же карточка настроек, что commissionThresholds
    // выше, тот же принцип "один запрос на весь лот" (найдено целевым ревью
    // перед деплоем, см. item.commissionGate.setBreakeven на отдельной позиции).
    let commissionBreakeven = { breakevenCommissionPercent: null, breakevenIsDefaultChannelPolicy: false, breakevenUnavailableReason: null };
    (async () => {
      try {
        const forecast = await callServer('getOrderForecast', 1, ctx.getCurrentCurrency(), ctx.currentChannel());
        commissionThresholds = { warnPercent: forecast.commissionWarnPercent, reasonPercent: forecast.commissionReasonPercent };
        commissionBreakeven = {
          breakevenCommissionPercent: forecast.breakevenCommissionPercent,
          breakevenIsDefaultChannelPolicy: forecast.breakevenIsDefaultChannelPolicy,
          breakevenUnavailableReason: forecast.breakevenUnavailableReason
        };
        lotRows.forEach((r) => { r.commissionGate.setThresholds(commissionThresholds); r.commissionGate.setBreakeven(commissionBreakeven); });
      } catch (error) { /* гейт остаётся выключенным при сбое, как и на позиции */ }
    })();

    function totalCostRub() {
      return (parseFloat(amountInput.value) || 0) * ctx.getCurrentRate();
    }

    // Реконсилированный пул лота (§2 A2, ИСПРАВЛЕНО 06.09.2026) — null,
    // пока «Итог с сайта выкупа» не затронул лот целиком (как ОДНУ заявку
    // корзины). Заполнен — все строки ВНУТРИ лота должны делить именно
    // ЭТУ сумму, не сырое поле «Общая стоимость лота» — раньше
    // `patchAllCostShares` брала сырое значение напрямую, из-за чего
    // шапка лота показывала одну сумму, а строки внутри в сумме давали
    // другую (репорт VASY «доля разницы не соотносится между позициями»).
    let reconciledPoolRub = null;
    function effectivePoolRub() {
      return reconciledPoolRub !== null ? reconciledPoolRub : totalCostRub();
    }

    // splitProportionallyClient — вынесена в screens/_cart-money.js
    // 06.09.2026 (была в области видимости render() с 05.09.2026, см. её
    // JSDoc там), используется как здесь (разбивка МЕЖДУ позициями лота),
    // так и разбивкой "Итог с сайта выкупа" (МЕЖДУ заявками корзины) —
    // одна и та же функция, не второй дубль.

    function updateSummary() {
      summaryText.textContent = `${lotRows.length} ${lotRows.length === 1 ? 'позиция' : 'позиций'} · Итого ${effectivePoolRub().toFixed(2)} ₽`;
      ctx.recomputeTotals();
    }

    // "Цена товара" на позиции лота вводится в ВАЛЮТЕ КОРЗИНЫ (тот же
    // принцип, что поле "Сумма" у отдельной позиции — символ валюты рядом
    // с полем это визуально обещает), а не в ₽ — конвертировать ЗДЕСЬ, не
    // отправлять сырое число как "knownPriceRub" (реальный денежный баг,
    // найден целевым ревью перед деплоем — без конвертации разбивка доли
    // и сумма, уходящая в createLot, были бы неверны примерно в курс раз).
    function knownPriceRub(row) {
      return (parseFloat(row.knownPriceInputEl.value) || 0) * ctx.getCurrentRate();
    }

    // ИСПРАВЛЕНО 06.09.2026 (§2 A2) — пул берётся из effectivePoolRub(),
    // не из сырого totalCostRub() напрямую: если «Итог с сайта выкупа»
    // реконсилировал лот целиком, строки внутри должны делить РЕАЛЬНУЮ
    // (реконсилированную) сумму — иначе шапка лота показывает одно число,
    // а строки внутри в сумме дают другое (репорт VASY).
    function patchAllCostShares() {
      const pool = effectivePoolRub();
      const roundingStep = parseFloat(roundingSelect.value) || 1;
      const costRows = lotRows.map((r) => ({ id: r.id, weight: r.costCoefficient, basePrice: knownPriceRub(r) }));
      const shares = CartMoney.splitProportionallyClient(pool, costRows, roundingStep);
      lotRows.forEach((r) => {
        r.costShareRub = shares.get(r.id) || 0;
        r.costShareDisplayEl.textContent = `${r.costShareRub.toFixed(2)} ₽`;
        if (document.activeElement !== r.feeRubEl) updateRowFeeRub(r);
      });
      updateSummary();
    }

    // Связка Сумма↔Комиссия %↔Комиссия ₽↔Итог для строки ВНУТРИ лота —
    // тот же расчёт, что на отдельной позиции (§2 A1), база = её
    // `costShareRub` (уже реконсилированная, если применимо — см.
    // patchAllCostShares выше). ИСПРАВЛЕНО 05.09.2026 (репорт VASY —
    // "проставил комиссию 20% везде, средняя по корзине показывала
    // ~16-17%") — обеим функциям не хватало `ctx.recomputeTotals()` в конце;
    // 06.09.2026 обе переведены на screens/_cart-money.js вместо
    // инлайн-формулы, добавлена связка с «Итогом» строки.
    function updateRowFeeRub(row) {
      const rub = CartMoney.feeRubFromPercent(row.costShareRub, parseFloat(row.feePercentEl.value) || 0);
      if (document.activeElement !== row.feeRubEl) row.feeRubEl.value = rub > 0 ? rub.toFixed(2) : '';
      updateRowTotalDisplay(row);
      ctx.recomputeTotals();
    }
    function updateRowFeePercent(row) {
      if (document.activeElement !== row.feePercentEl) {
        const percent = CartMoney.feePercentFromRub(row.costShareRub, parseFloat(row.feeRubEl.value) || 0);
        row.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
      }
      updateRowTotalDisplay(row);
      ctx.recomputeTotals();
    }
    // «Итог» строки лота (§2 C2) — тот же принцип, что на отдельной
    // позиции: редактируемое поле, четвёртая вершина связки.
    function updateRowTotalDisplay(row) {
      const feeRub = parseFloat(row.feeRubEl.value) || 0;
      const total = CartMoney.totalFromFeeRub(row.costShareRub, feeRub);
      if (document.activeElement !== row.totalPaymentEl) {
        row.totalPaymentEl.value = total > 0 ? total.toFixed(2) : '';
      }
      row.totalBreakdownEl.textContent = CartMoney.totalBreakdownText(row.costShareRub, feeRub);
    }
    function updateRowFromTotal(row) {
      const feeRub = CartMoney.feeRubFromTotal(row.costShareRub, parseFloat(row.totalPaymentEl.value) || 0);
      row.feeRubEl.value = feeRub > 0 ? feeRub.toFixed(2) : '';
      const percent = CartMoney.feePercentFromRub(row.costShareRub, feeRub);
      row.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
      row.totalBreakdownEl.textContent = CartMoney.totalBreakdownText(row.costShareRub, feeRub);
      ctx.recomputeTotals();
    }
    function clampRowTotalOnBlur(row) {
      const clamped = CartMoney.clampTotal(row.costShareRub, parseFloat(row.totalPaymentEl.value) || 0);
      row.totalPaymentEl.value = clamped > 0 ? clamped.toFixed(2) : '';
      updateRowFromTotal(row);
    }

    function removeLotRow(rowId) {
      const idx = lotRows.findIndex((r) => r.id === rowId);
      if (idx === -1) return;
      lotRows[idx].rowEl.remove();
      lotRows.splice(idx, 1);
      patchAllCostShares();
    }

    function addLotRow(prefillClient) {
      const rowId = ++lotRowSeq;
      const rowEl = document.createElement('div');
      rowEl.className = 'bg-gray-50 rounded-xl border border-gray-100 p-2.5 mb-2';
      rowEl.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-semibold text-gray-400">Позиция ${lotRows.length + 1}</span>
          <button type="button" class="remove-lot-row-btn p-1 text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="client-row relative mb-1.5">
          <input type="text" class="client-search w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="Поиск клиента..." autocomplete="off">
          <ul class="client-dropdown dropdown-menu custom-scrollbar"></ul>
        </div>
        <div class="relative mb-1.5">
          <input type="text" class="product-search w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="Поиск товара..." autocomplete="off">
          <ul class="product-dropdown dropdown-menu custom-scrollbar"></ul>
        </div>
        <!-- §5 D2 — поле в валюте, не в рублях, см. комментарий на
             .amount-input выше (пример D2 плана). -->
        <div class="mb-1">
          <label class="text-[10px] text-gray-500">Цена товара (если известна заранее)</label>
          <div class="flex items-center gap-1">
            <span class="known-price-currency-symbol text-xs text-blue-500 font-medium"></span>
            <input type="number" class="known-price-input w-full bg-blue-50 rounded-lg px-2 py-1.5 text-sm outline-none border border-blue-100" placeholder="0.00 — оставьте пустым, если не знаете" step="0.01">
          </div>
        </div>
        <!-- §5 D3 — подпись слайдера человеческим языком вместо голого
             множителя ("1.00" ничего не значит менеджеру, не знакомому с
             формулой splitProportionally). CartMoney.humanFractionLabel
             перезаписывает текст ниже сразу при создании строки и на
             каждое движение слайдера — статичный текст здесь только
             дефолт до первого JS-прохода. -->
        <div class="text-[10px] text-gray-500">Доля в общих тратах</div>
        <div class="coef-fraction-label text-[11px] font-semibold text-indigo-600 mb-0.5">×1 — как у всех</div>
        <input type="range" min="0" max="2" step="0.25" value="1" class="cost-slider w-full">
        <div class="text-right text-xs font-semibold text-gray-800 cost-share-display mt-0.5">0.00 ₽</div>
        <div class="mt-1.5 pt-1.5 border-t border-gray-200">
          <div class="text-[10px] text-gray-500">Доля веса/логистики</div>
          <div class="weight-fraction-label text-[11px] font-semibold text-teal-600 mb-0.5">×1 — как у всех</div>
          <input type="range" min="0" max="2" step="0.25" value="1" class="weight-slider w-full">
        </div>
        <div class="grid grid-cols-2 gap-1.5 mt-1.5 pt-1.5 border-t border-gray-200">
          <div>
            <label class="text-[10px] text-gray-500">Комиссия %</label>
            <input type="number" class="fee-percent-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00" step="0.01">
          </div>
          <div>
            <label class="text-[10px] text-gray-500">Комиссия ₽</label>
            <input type="number" class="fee-rub-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00" step="0.01">
          </div>
        </div>
        ${FormHelpers.commissionGateHtml(`lot${id}-row${rowId}-`)}

        <!-- «Итог» строки лота — та же четвёртая вершина связки, что на
             отдельной позиции (§2 A1/C2, ИСПРАВЛЕНО 06.09.2026). -->
        <div class="mt-1.5 pt-1.5 border-t border-gray-200 bg-indigo-50 -mx-2.5 px-2.5 py-1.5">
          <label class="text-[10px] text-gray-600 font-medium">Итог (клиент платит), ₽</label>
          <input type="number" class="total-payment-input w-full bg-white rounded-lg px-2 py-1.5 text-sm font-bold text-gray-900 outline-none border border-indigo-100" placeholder="0.00" step="0.01">
          <div class="total-breakdown-display text-[10px] text-gray-500 mt-0.5"></div>
        </div>

        <!-- Слияние «Новый заказ»→«Корзина» (05.09.2026) — те же поля,
             что на обычной позиции, см. IMPLEMENTATION-PLAN-CART-MERGE.md §2.2.
             Ссылка на покупку сюда НЕ входит — одна на весь лот, см.
             .lot-purchase-link-input в шапке лота (5.2). -->
        <label class="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none mt-1.5">
          <input type="checkbox" class="own-purchase-checkbox w-3.5 h-3.5 accent-indigo-600 cursor-pointer">
          Личный заказ (без плательщика)
          ${helpIcon('Личный заказ', '<p>Для себя, без клиента и без будущей оплаты (подарок, тест, личная покупка) — комиссия и уведомление клиенту не нужны.</p><p>Если товар куплен впрок для будущей продажи (покупателя пока нет, но расход уже есть) — это НЕ личный заказ, для этого случая отдельный статус «На продаже».</p>')}
        </label>
        <div class="mt-1.5">
          <label class="text-[10px] text-gray-500">Сколько уже оплачено, ₽</label>
          <input type="number" class="already-paid-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00" step="0.01">
        </div>
        <div class="mt-1.5">
          <label class="text-[10px] text-gray-500">Примечание</label>
          <textarea class="note-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" rows="2" maxlength="300" placeholder="Введите примечание..."></textarea>
        </div>
        <label class="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none mt-1.5">
          <input type="checkbox" class="notify-client-checkbox w-3.5 h-3.5 accent-indigo-600 cursor-pointer">
          Уведомить клиента
        </label>
      `;
      positionsList.appendChild(rowEl);
      if (window.lucide) window.lucide.createIcons();

      const row = {
        id: rowId, rowEl,
        clientSearchEl: rowEl.querySelector('.client-search'),
        clientDropdownEl: rowEl.querySelector('.client-dropdown'),
        telegramId: '', username: '', name: '', manualClientData: null,
        productSearchEl: rowEl.querySelector('.product-search'),
        productDropdownEl: rowEl.querySelector('.product-dropdown'),
        productOriginal: '',
        costCoefficient: 1,
        knownPriceInputEl: rowEl.querySelector('.known-price-input'),
        knownPriceCurrencySymbolEl: rowEl.querySelector('.known-price-currency-symbol'),
        costSliderEl: rowEl.querySelector('.cost-slider'),
        costFractionLabelEl: rowEl.querySelector('.coef-fraction-label'),
        costShareDisplayEl: rowEl.querySelector('.cost-share-display'),
        costShareRub: 0,
        weightCoefficient: 1,
        weightSliderEl: rowEl.querySelector('.weight-slider'),
        weightFractionLabelEl: rowEl.querySelector('.weight-fraction-label'),
        feePercentEl: rowEl.querySelector('.fee-percent-input'),
        feeRubEl: rowEl.querySelector('.fee-rub-input'),
        totalPaymentEl: rowEl.querySelector('.total-payment-input'),
        totalBreakdownEl: rowEl.querySelector('.total-breakdown-display'),
        ownPurchaseCheckboxEl: rowEl.querySelector('.own-purchase-checkbox'),
        alreadyPaidInputEl: rowEl.querySelector('.already-paid-input'),
        noteInputEl: rowEl.querySelector('.note-input'),
        notifyClientCheckboxEl: rowEl.querySelector('.notify-client-checkbox')
      };
      if (row.knownPriceCurrencySymbolEl) row.knownPriceCurrencySymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || '';
      lotRows.push(row);

      // Комиссионный гейт Э6/D-10 на позиции лота — тот же приём, что на
      // отдельной позиции корзины (§2.1), пороги — общие на весь лот (см.
      // commissionThresholds выше, лот не запрашивает getOrderForecast на
      // каждую строку отдельно).
      row.commissionGate = FormHelpers.wireCommissionGate({
        root: rowEl, idPrefix: `lot${id}-row${rowId}-`,
        feePercentSelector: '.fee-percent-input', feeRubSelector: '.fee-rub-input'
      });
      row.commissionGate.setThresholds(commissionThresholds);
      row.commissionGate.setBreakeven(commissionBreakeven);

      // "Личный заказ" — та же логика, что на отдельной позиции (§2.1).
      row.ownPurchaseCheckboxEl.addEventListener('change', () => {
        rowEl.querySelector('.client-row').classList.toggle('hidden', row.ownPurchaseCheckboxEl.checked);
        row.clientDropdownEl.classList.remove('active');
        ctx.updateSummaryDisplay(); // §4 C1 — метка "Личный заказ" в разбивке "по клиентам"
      });
      // §4 C1 — "Уже оплачено" на позиции лота тоже участвует в "Уже
      // оплачено"/"Осталось получить" липкой панели.
      row.alreadyPaidInputEl.addEventListener('input', ctx.updateSummaryDisplay);

      if (prefillClient) {
        row.telegramId = prefillClient.telegramId || '';
        row.username = prefillClient.username || '';
        row.name = prefillClient.name || '';
        row.manualClientData = prefillClient.manualClientData || null;
        row.clientSearchEl.value = prefillClient.display || '';
      }

      rowEl.querySelector('.remove-lot-row-btn').addEventListener('click', () => removeLotRow(rowId));

      const handleClientSearch = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) { row.clientDropdownEl.classList.remove('active'); return; }
        const results = await callServer('searchClients', query);
        FormHelpers.renderDropdown(row.clientDropdownEl, results, (r) => `
          <div class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
            ${escapeHtmlClient(r.displayName)}
            ${r.pending ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">не подтверждён</span>' : ''}
          </div>
        `, (r) => {
          row.clientSearchEl.value = r.displayName;
          row.telegramId = r.telegramId;
          row.username = r.username;
          row.name = r.name;
          row.manualClientData = null;
          row.clientDropdownEl.classList.remove('active');
          ctx.updateSummaryDisplay(); // §4 C1 — имя клиента в разбивке "по клиентам"
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
              ctx.updateSummaryDisplay(); // §4 C1 — имя клиента в разбивке "по клиентам"
            }
          });
          manualModal.open();
        });
      }, 300);
      row.clientSearchEl.addEventListener('input', handleClientSearch);
      row.clientSearchEl.addEventListener('focus', () => { if (row.clientSearchEl.value.trim().length >= 2) row.clientDropdownEl.classList.add('active'); });

      const handleProductSearch = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) { row.productDropdownEl.classList.remove('active'); return; }
        const results = await callServer('searchSku', query);
        FormHelpers.renderDropdown(row.productDropdownEl, results, (r) => `<div class="font-medium text-gray-800 text-sm truncate">${r.label}</div>`, (r) => {
          row.productSearchEl.value = r.value;
          row.productOriginal = r.value;
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

      // Тянуть можно только за сам бегунок, не за любую точку трека —
      // репорт VASY 05.09.2026, тот же паттерн, что уже есть на
      // "Коллективках" (`common.js:wireSliderThumbGuard`).
      wireSliderThumbGuard(row.costSliderEl);
      wireSliderThumbGuard(row.weightSliderEl);

      row.knownPriceInputEl.addEventListener('input', patchAllCostShares);
      // §5 D3 — подпись человеческим языком (CartMoney.humanFractionLabel),
      // не голый множитель. Начальное значение проставляется сразу же
      // ниже (return row;), не только на первое движение слайдера.
      row.costSliderEl.addEventListener('input', () => {
        row.costCoefficient = parseFloat(row.costSliderEl.value);
        row.costFractionLabelEl.textContent = CartMoney.humanFractionLabel(row.costCoefficient);
        patchAllCostShares();
      });
      row.weightSliderEl.addEventListener('input', () => {
        row.weightCoefficient = parseFloat(row.weightSliderEl.value);
        row.weightFractionLabelEl.textContent = CartMoney.humanFractionLabel(row.weightCoefficient);
      });
      row.feePercentEl.addEventListener('input', () => updateRowFeeRub(row));
      row.feeRubEl.addEventListener('input', () => updateRowFeePercent(row));
      row.totalPaymentEl.addEventListener('input', () => updateRowFromTotal(row));
      row.totalPaymentEl.addEventListener('blur', () => clampRowTotalOnBlur(row));

      // §5 D3 — не полагаемся на то, что дефолтный текст в разметке
      // (`×1 — как у всех`) навсегда совпадёт с дефолтом слайдера (`1`) —
      // явный проход через ту же функцию, что и на каждое движение.
      row.costFractionLabelEl.textContent = CartMoney.humanFractionLabel(row.costCoefficient);
      row.weightFractionLabelEl.textContent = CartMoney.humanFractionLabel(row.weightCoefficient);

      patchAllCostShares();
      return row;
    }

    addPositionBtn.addEventListener('click', () => {
      const last = lotRows[lotRows.length - 1];
      const prefill = last ? {
        telegramId: last.telegramId, username: last.username, name: last.name,
        manualClientData: last.manualClientData, display: last.clientSearchEl.value
      } : null;
      addLotRow(prefill);
    });

    amountInput.addEventListener('input', patchAllCostShares);
    roundingSelect.addEventListener('change', patchAllCostShares);
    amountSymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || '';

    addLotRow(); // одна позиция сразу, как в lot-new.js
    expanded = true;
    body.classList.remove('hidden');
    chevron.style.transform = 'rotate(180deg)';

    const lotItem = {
      id, type: 'lot', rowEl: wrapEl,
      // §5 D1 — общий интерфейс с позицией для кнопок "Свернуть все"/
      // "Развернуть все" (render()). Лот уже сворачивался и до Фазы D
      // (свой summaryRow/body/chevron) — здесь только внешний доступ.
      setCollapsed: (collapsed) => setLotExpanded(!collapsed),
      onRateChanged: () => { amountSymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || ''; lotRows.forEach((r) => { if (r.knownPriceCurrencySymbolEl) r.knownPriceCurrencySymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || ''; }); patchAllCostShares(); },
      // СЫРАЯ база лота — то, что реально ввёл менеджер в «Общая стоимость
      // лота», ИЛИ ручная фиксация (§3 B1/B2) — используется в разбивке
      // разницы НА УРОВНЕ КОРЗИНЫ (тот же смысл, что basePrice позиции —
      // известная цена ДО реконсиляции).
      getTotalRub: () => {
        const manualRub = lotManualShare.getManualRub();
        return manualRub !== null ? manualRub : totalCostRub();
      },
      // РЕКОНСИЛИРОВАННАЯ база лота (§2 A3, ИСПРАВЛЕНО 06.09.2026) — для
      // отображения "Итого корзины"/"Средняя комиссия" наверху экрана.
      getEffectiveBaseRub: () => effectivePoolRub(),
      getCommissionRub: () => lotRows.reduce((s, r) => s + (parseFloat(r.feeRubEl.value) || 0), 0),
      // «Доля разницы» лота ЦЕЛИКОМ как одной заявки корзины — НЕ путать с
      // costCoefficient позиций ВНУТРИ лота (r.costCoefficient ниже,
      // другой уровень разбивки, слайдеры, §3 B4).
      getCostCoefficient: () => (lotManualShare.getManualRub() !== null ? 0 : 1),
      // Реконсиляция на уровне корзины (§2 A1/A2) — вызывается из
      // recomputeSiteTotalReconciliation в render(). Прокидывает
      // реконсилированный пул ВНУТРЬ лота через patchAllCostShares (A2) —
      // без этого шапка лота показывала одну сумму, строки внутри
      // суммировались в другую (репорт VASY). Реконсиляция выключена
      // целиком (`null`) — сбрасывает ручную фиксацию лота тоже.
      setReconciledShareRub: (shareRub) => {
        reconciledPoolRub = shareRub;
        if (shareRub === null) lotManualShare.reset();
        else lotManualShare.setAutoPreview(shareRub);
        patchAllCostShares();
      },
      coefBlockEl: cartCoefBlockEl,
      // §4 C1 — строка "по клиентам" даёт ОДНУ строку на КАЖДУЮ позицию
      // лота (не одну на лот целиком) — лот содержит несколько разных
      // клиентов, каждый должен увидеть свою сумму. uidHint комбинирует id
      // лота (уникален на всю корзину) + rowId (уникален только ВНУТРИ
      // лота, lotRowSeq свой на каждый лот) — иначе два лота с "Позиция 1"
      // оба дали бы одинаковый фолбэк-ключ.
      getClientRows: () => lotRows.map((r) => ctx.collectClientRow(r, `lot${id}-row${r.id}`)),
      // §6 Фаза E — тот же критерий "пусто", что на отдельной позиции
      // (см. её JSDoc в _cart-position.js), применённый к КАЖДОЙ строке
      // лота отдельно (лот может содержать и клиентские, и «личные»
      // строки одновременно — та же граница, что уже проведена для
      // "С клиентов"/"Осталось получить" в updateSummaryDisplay).
      // НЕ читаем r.clientSearchEl.value.trim() как признак "клиент есть" —
      // тот же реальный баг, что найден целевым ревью на отдельной позиции
      // (см. её JSDoc в _cart-position.js) — свободный текст без выбора из
      // выпадашки/"+ Ввести вручную" оставляет telegramId/manualClientData
      // пустыми, а getPayload() уйдёт без реального плательщика.
      getUnresolvedClientRows: () => lotRows
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => !r.ownPurchaseCheckboxEl.checked && !r.telegramId && !r.manualClientData)
        .map(({ r, idx }) => ({
          id: `lot${id}-row${r.id}`,
          label: `Лот · позиция ${idx + 1} · ${r.productOriginal || r.productSearchEl.value.trim() || 'товар не указан'}`,
          markOwnPurchase: () => {
            r.ownPurchaseCheckboxEl.checked = true;
            r.ownPurchaseCheckboxEl.dispatchEvent(new Event('change'));
          }
        })),
      hasPositions: () => lotRows.length > 0,
      hasMissingProduct: () => lotRows.some((r) => !(r.productOriginal || r.productSearchEl.value).trim()),
      // Слияние «Новый заказ»→«Корзина» (05.09.2026) — вызывается из
      // saveCart() перед отправкой, тот же принцип, что на отдельной
      // позиции (§2.1).
      // «Личный заказ» исключён из гейта на КАЖДОЙ позиции лота — то же
      // обоснование, что у отдельной позиции (item.validateCommissionGate).
      validateCommissionGates: () => lotRows.every((r) => r.ownPurchaseCheckboxEl.checked || r.commissionGate.validate()),
      getPayload: () => ({
        // «Доля разницы»/ручная фиксация (§2 A1, §3 B1/B2) лота целиком —
        // ТОЛЬКО если на экране заполнено «Итог с сайта выкупа», см.
        // cartsService.createCart JSDoc. Верхний уровень объекта, НЕ
        // внутри header — отдельный namespace от positions[].costCoefficient.
        costCoefficient: lotManualShare.getManualRub() !== null ? 0 : 1,
        fixedShareRub: lotManualShare.getManualRub(),
        header: {
          totalAmountInCurrency: amountInput.value,
          roundingStep: roundingSelect.value
        },
        positions: lotRows.map((r) => ({
          client: r.ownPurchaseCheckboxEl.checked
            ? { telegramId: '', username: '', name: '' }
            : (r.manualClientData
              ? { telegramId: '', username: r.manualClientData.username, name: r.manualClientData.name }
              : { telegramId: r.telegramId || '', username: r.username, name: r.name }),
          isOwnPurchase: r.ownPurchaseCheckboxEl.checked,
          productOriginal: r.productOriginal || r.productSearchEl.value,
          costCoefficient: r.costCoefficient,
          knownPriceRub: knownPriceRub(r),
          weightCoefficient: r.weightCoefficient,
          commissionRub: parseFloat(r.feeRubEl.value) || 0,
          // Комиссия по проценту (§2 A1, ИСПРАВЛЕНО 06.09.2026) —
          // lotsService.createLot пересчитывает commissionRub от РЕАЛЬНОЙ
          // costShareRub позиции, если этот процент задан — см. её JSDoc.
          commissionPercent: r.feePercentEl.value,
          // «Сколько уже оплачено, ₽» — bookingPaid/bookingAlreadyInMainAmount
          // вычисляются на СЕРВЕРЕ внутри lotsService.createLot (см. её
          // JSDoc), не здесь — сюда уходит только сырое значение.
          alreadyPaidRub: parseFloat(r.alreadyPaidInputEl.value) || 0,
          // Ссылка на покупку — одна на весь лот (5.2), то же значение
          // уходит в КАЖДУЮ позицию лота (positions[].purchaseLink на
          // backend'е как принимал строку на каждую позицию, так и
          // принимает — контракт не менялся, меняется только откуда
          // фронтенд берёт это значение).
          purchaseLink: lotPurchaseLinkInputEl.value.trim(),
          remark: r.noteInputEl.value,
          notifyClient: r.notifyClientCheckboxEl.checked,
          commissionLowReason: r.commissionGate.getReason(),
          requestId: generateRequestId()
        }))
      })
    };
    ctx.items.push(lotItem);
    updateSummary();
    return lotItem;
  }
};
