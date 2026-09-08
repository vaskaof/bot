'use strict';

/**
 * Карточка отдельной позиции «Корзины» — вынесена из `cart-new.js` (§5 D4,
 * IMPLEMENTATION-PLAN-CART-UX.md, 07.09.2026, ответ на вопрос VASY про
 * god-файлы, см. план §9 п.8: старые `order-new.js`/`order-edit.js` не
 * трогаем, `cart-new.js` не даём стать третьим). Вся денежная связка
 * Сумма↔Комиссия%↔Комиссия₽↔Итог (§2 A1), ручная фиксация доли (§3 B1/B2),
 * сворачивание карточки (§5 D1) и разбивка "по клиентам" (§4 C1/C2) — то,
 * что раньше жило внутри `addPositionItem` в `cart-new.js`, теперь здесь,
 * БЕЗ поведенческих изменений (чистый перенос, целевое ревью + полный
 * прогон тестов до и после — см. память).
 *
 * `cart-new.js` остаётся оркестратором (шапка корзины, липкая панель
 * итогов, сохранение) — вызывает `CartPosition.create(ctx, prefillClient)`
 * на "+ Добавить позицию", получает готовый item-объект с тем же
 * интерфейсом, что был у `addPositionItem` раньше (getTotalRub/
 * getEffectiveBaseRub/getCommissionRub/getCostCoefficient/getClientRow/
 * getUnresolvedClientRows/getPayload/setReconciledShareRub/setCollapsed/
 * onRateChanged/validateCommissionGate/updateCardSummaryText), кладёт его
 * в свой массив `items`.
 *
 * `ctx` — единственный канал связи с состоянием экрана, которым владеет
 * cart-new.js (не глобальные переменные, не второй источник правды):
 *   - `items` — общий массив заявок корзины (та же ссылка, что в
 *     cart-new.js — `.push()` виден сразу, это МАССИВ, не примитив).
 *   - `itemsList` — DOM-контейнер, куда вставляется новая карточка.
 *   - `nextItemId()` — общий на позиции И лоты счётчик id (гарантирует
 *     уникальность id заявки на весь экран, не только внутри этого файла).
 *   - `getCurrentRate()`/`getCurrentCurrency()` — курс/валюта корзины
 *     меняются (шапка экрана, "Обновить курс"/`<select>` валюты) уже ПОСЛЕ
 *     того, как позиция создана — нужны геттеры, не голые значения на
 *     момент создания.
 *   - `recomputeTotals()`/`updateSummaryDisplay()` — пересчёт "Итого
 *     корзины"/липкой панели итогов (§4 C1), живёт в cart-new.js.
 *   - `removeItem(id)` — удаление заявки из общего списка.
 *   - `clientLabelFor(entity)`/`collectClientRow(entity, uidHint)` —
 *     разбивка "по клиентам" (§4 C1/C2, §5 D5), общая для позиции и лота,
 *     тоже живёт в cart-new.js (единый источник правды на обе сущности).
 *   - `wireManualShareControl(blockEl)` — контрол ручной фиксации доли
 *     (§3 B1/B2), общий для позиции и строки лота.
 *   - `currentChannel()` — канал выкупа (шапка экрана) для запроса
 *     `getOrderForecast` (пороги комиссии/прогноз).
 *
 * `CartMoney` (`_cart-money.js`) — чистые функции денежной связки,
 * `CURRENCY_SYMBOLS`, `FORECAST_FIELD_KEYS`, `computeBookingFields` —
 * ИСПОЛЬЗУЮТСЯ НАПРЯМУЮ как глобал, не через `ctx` (см. её же JSDoc).
 * Остальные глобалы проекта (`callServer`, `debounce`, `escapeHtmlClient`,
 * `generateRequestId`, `helpIcon`, `wireSliderThumbGuard`, `showSaveToast`,
 * `FormHelpers`, `SkuModal`, `ManualClientModal`) — тоже напрямую, как и
 * раньше в `cart-new.js` (это window-уровня функции/объекты из common.js/
 * router.js/_form-helpers.js/_sku-modal.js/_manual-client-modal.js,
 * загруженных раньше этого файла в `admin/app.html`).
 */
window.CartPosition = {
  create(ctx, prefillClient) {
    const id = ctx.nextItemId();
    const rowEl = document.createElement('div');
    rowEl.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3';
    rowEl.innerHTML = `
      <!-- §5 D1 — сворачивание заполненной карточки в одну строку (тот же
           приём, что уже есть у лота — .lot-summary-row/.lot-body/
           .lot-chevron в _cart-lot.js, просто применён к позиции,
           которая раньше не сворачивалась вообще). Строка сводки видна
           ВСЕГДА (обновляется на каждый денежный/клиентский ввод, см.
           ctx.updateSummaryDisplay), тело карточки — по тапу. -->
      <div class="position-summary-row flex items-center justify-between gap-2 mb-2 -m-1 p-1 rounded-lg cursor-pointer hover:bg-gray-50">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[11px] font-semibold text-gray-400 shrink-0">Позиция</span>
          <span class="position-summary-text text-[11px] text-gray-500 truncate"></span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="remove-item-btn p-1 text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
          <i data-lucide="chevron-down" class="position-chevron w-4 h-4 text-gray-400 transition-transform" style="transform: rotate(180deg)"></i>
        </div>
      </div>
      <div class="position-body">

      <!-- Ссылка на покупку — намеренно ПЕРВОЕ поле карточки (репорт VASY
           05.09.2026): менеджер обычно стартует ввод именно со вставки
           ссылки, "Найти" распознаёт товар в каталоге (в т.ч. по ссылкам,
           ранее подтянутым из других заказов/вишлиста — см.
           catalogService.findSkuByProductUrl, ничего нового заводить не
           пришлось). -->
      <div class="relative mb-2">
        <label class="text-[11px] text-gray-500">Ссылка на покупку</label>
        <div class="flex items-center gap-1">
          <input type="text" class="purchase-link-input flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="https://...">
          <button type="button" class="purchase-link-resolve-btn shrink-0 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium">Найти</button>
        </div>
      </div>

      <div class="client-row relative mb-2">
        <input type="text" class="client-search w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Поиск клиента..." autocomplete="off">
        <ul class="client-dropdown dropdown-menu custom-scrollbar"></ul>
      </div>
      <div class="relative mb-2">
        <input type="text" class="product-search w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Поиск товара..." autocomplete="off">
        <ul class="product-dropdown dropdown-menu custom-scrollbar"></ul>
      </div>

      <!-- §5 D2 — поля в валюте корзины отличаются на глаз от рублёвых
           (светло-синий фон + синий символ валюты) — раньше и «Сумма»
           (валюта), и «Комиссия ₽» (рубли) были одинаковым серым, репорт
           из плана: "Сейчас они одинаковые". -->
      <div class="flex items-center gap-3 mb-2">
        <div class="flex items-center gap-1 flex-1">
          <span class="amount-currency-symbol text-sm text-blue-500 font-medium"></span>
          <input type="number" class="amount-input w-full bg-blue-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
        </div>
        <div class="text-xs text-gray-500 shrink-0">≈ <span class="amount-rub-display">0.00</span> ₽</div>
      </div>

      <!-- Читаемая выкладка расчёта (§3 B1, IMPLEMENTATION-PLAN-CART-UX-2.md,
           07.09.2026 — заменила единственное read-only поле «Итог заявки с
           учётом разницы», прямой ответ на репорт VASY: "не вижу визуально,
           как произошло изменение, как это повлияло на комиссию и сумму по
           каждому заказу"). Видна ТОЛЬКО когда заполнено «Итог с сайта
           выкупа» (§4 C1, шапка корзины), см. её JSDoc в render(). Скрыта по
           умолчанию — не захламляет обычное создание. Числа заполняются
           renderReconciliationBreakdown() ниже (см. её в JS-части файла) —
           чистая производная от уже посчитанных полей заявки, без нового
           состояния (§3 B2). Ручная фиксация (§3 B1/B2, ИСПРАВЛЕНО
           06.09.2026) осталась как есть — только спрятана за кнопкой «Задать
           сумму вручную»: .manual-total-input/.manual-total-reset-btn
           ОБЯЗАНЫ остаться теми же классами в DOM (их ищут
           wireManualShareControl() и e2e), просто их контейнер теперь
           дополнительно скрыт до клика по кнопке. НЕ использовать обратные
           кавычки внутри этого HTML-комментария — он живёт внутри JS
           template literal, обратная кавычка преждевременно закрывает
           внешний литерал и рвёт синтаксис всего файла (см. JSDoc файла,
           наступали на это трижды за сессию 07.09.2026). -->
      <div class="cost-coef-block hidden mb-2 pt-2 border-t border-gray-100">
        <div class="text-[11px] font-semibold text-gray-500 mb-1.5 inline-flex items-center gap-1">Общие расходы корзины${helpIcon('Общие расходы корзины', '<p>«Итог с сайта выкупа» распределяется между заявками корзины — здесь видно, сколько добавилось именно этой, и как это изменило её комиссию и итог.</p>')}</div>
        <div class="space-y-1 text-[12px] text-gray-600">
          <div class="flex items-center justify-between">
            <span>Своя сумма</span>
            <span class="cc-own-sum font-medium text-gray-800">0.00 ₽</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="cc-diff-label">Доля разницы</span>
            <span class="cc-diff-share font-medium text-gray-800">+0.00 ₽</span>
          </div>
          <div class="flex items-center justify-between font-medium text-gray-800 pt-1 border-t border-gray-100">
            <span>База заявки</span>
            <span class="cc-base-total">0.00 ₽</span>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-gray-100">
            <span class="cc-fee-label">Комиссия</span>
            <span class="cc-fee-change font-medium text-gray-800">0.00 ₽</span>
          </div>
          <div class="flex items-center justify-between font-semibold text-gray-900">
            <span>Клиент платит</span>
            <span class="cc-total-change">0.00 ₽</span>
          </div>
        </div>
        <button type="button" class="manual-total-toggle-btn mt-1.5 text-[11px] text-indigo-600 font-medium">Задать сумму вручную</button>
        <div class="manual-total-wrap hidden mt-1.5">
          <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span>Итог заявки с учётом разницы, ₽</span>
            <span class="manual-mode-label text-[10px] font-medium text-gray-400">авто</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input type="number" class="manual-total-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01" min="0">
            <button type="button" class="manual-total-reset-btn hidden shrink-0 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] whitespace-nowrap">Сбросить</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label class="text-[11px] text-gray-500">Комиссия %</label>
          <input type="number" class="fee-percent-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
        </div>
        <div>
          <label class="text-[11px] text-gray-500">Комиссия ₽</label>
          <input type="number" class="fee-rub-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
        </div>
      </div>
      ${FormHelpers.commissionGateHtml(`pos${id}-`)}

      <!-- «Итог» (клиент платит) — четвёртая вершина связки Сумма↔%↔₽↔Итог
           (§2 A1, ИСПРАВЛЕНО 06.09.2026, зеркало order-new.js's
           #total-payment-input) — РЕДАКТИРУЕМОЕ поле, не read-only
           подпись: менеджер часто идёт от круглой суммы к клиенту назад к
           комиссии, как уже годами работает в order-new.js. Прямой репорт
           VASY «по каждой позиции не вижу итога». -->
      <div class="mb-2 pt-2 border-t border-gray-100 bg-indigo-50 -mx-3 px-3 py-2">
        <label class="text-[11px] text-gray-600 font-medium">Итог (клиент платит), ₽</label>
        <input type="number" class="total-payment-input w-full bg-white rounded-lg px-2 py-2 text-base font-bold text-gray-900 outline-none border border-indigo-100" placeholder="0.00" step="0.01">
        <div class="total-breakdown-display text-[11px] text-gray-500 mt-1"></div>
      </div>

      <!-- Слияние «Новый заказ»→«Корзина» (05.09.2026) — «Личный заказ»,
           «Сколько уже оплачено», примечание, уведомление клиента. См.
           IMPLEMENTATION-PLAN-CART-MERGE.md §2.1. -->
      <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none mb-2">
        <input type="checkbox" class="own-purchase-checkbox w-4 h-4 accent-indigo-600 cursor-pointer">
        Личный заказ (без плательщика)
        ${helpIcon('Личный заказ', '<p>Для себя, без клиента и без будущей оплаты (подарок, тест, личная покупка) — комиссия и уведомление клиенту не нужны.</p><p>Если товар куплен впрок для будущей продажи (покупателя пока нет, но расход уже есть) — это НЕ личный заказ, для этого случая отдельный статус «На продаже».</p>')}
      </label>
      <div class="mb-2">
        <label class="text-[11px] text-gray-500">Сколько уже оплачено, ₽</label>
        <input type="number" class="already-paid-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
      </div>
      <div class="mb-2">
        <label class="text-[11px] text-gray-500">Примечание</label>
        <textarea class="note-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" rows="2" maxlength="300" placeholder="Введите примечание..."></textarea>
      </div>
      <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none mb-2">
        <input type="checkbox" class="notify-client-checkbox w-4 h-4 accent-indigo-600 cursor-pointer">
        Уведомить клиента
      </label>

      <div class="pt-2 border-t border-gray-100">
        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Прогноз расходов (можно поправить)</div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-[11px] text-gray-500 w-16 shrink-0">Вес</span>
          <input type="number" class="weight-sum-input flex-1 bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01">
        </div>
        <div class="grid grid-cols-3 gap-1 mb-1.5">
          <div><div class="text-[9px] text-gray-400 mb-0.5">Такси КЗ</div><input type="number" class="taxi-kz-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
          <div><div class="text-[9px] text-gray-400 mb-0.5">СДЭК</div><input type="number" class="sdek-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
          <div><div class="text-[9px] text-gray-400 mb-0.5">Такси РФ</div><input type="number" class="taxi-rf-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
        </div>
        <div class="grid grid-cols-3 gap-1">
          <div><div class="text-[9px] text-gray-400 mb-0.5">Такси (отпр.)</div><input type="number" class="taxi-rf-send-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
          <div><div class="text-[9px] text-gray-400 mb-0.5">Отправка</div><input type="number" class="shipping-rf-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
          <div><div class="text-[9px] text-gray-400 mb-0.5">Такси (получ.)</div><input type="number" class="taxi-rf-receive-input w-full bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01"></div>
        </div>
      </div>
      </div>
    `;
    ctx.itemsList.appendChild(rowEl);
    if (window.lucide) window.lucide.createIcons();

    const item = {
      id, type: 'position', rowEl,
      clientSearchEl: rowEl.querySelector('.client-search'),
      clientDropdownEl: rowEl.querySelector('.client-dropdown'),
      telegramId: '', username: '', name: '', manualClientData: null,
      productSearchEl: rowEl.querySelector('.product-search'),
      productDropdownEl: rowEl.querySelector('.product-dropdown'),
      productOriginal: '',
      amountCurrencySymbolEl: rowEl.querySelector('.amount-currency-symbol'),
      amountInputEl: rowEl.querySelector('.amount-input'),
      amountRubDisplayEl: rowEl.querySelector('.amount-rub-display'),
      feePercentEl: rowEl.querySelector('.fee-percent-input'),
      feeRubEl: rowEl.querySelector('.fee-rub-input'),
      totalPaymentEl: rowEl.querySelector('.total-payment-input'),
      totalBreakdownEl: rowEl.querySelector('.total-breakdown-display'),
      // Реконсилированная доля (§2 A1/A2, ИСПРАВЛЕНО 06.09.2026) — null,
      // пока «Итог с сайта выкупа» не заполнен: тогда база для комиссии —
      // СЫРАЯ сумма (getTotalRub). Заполнен — база берётся отсюда.
      reconciledShareRub: null,
      ownPurchaseCheckboxEl: rowEl.querySelector('.own-purchase-checkbox'),
      alreadyPaidInputEl: rowEl.querySelector('.already-paid-input'),
      purchaseLinkInputEl: rowEl.querySelector('.purchase-link-input'),
      purchaseLinkResolveBtn: rowEl.querySelector('.purchase-link-resolve-btn'),
      noteInputEl: rowEl.querySelector('.note-input'),
      notifyClientCheckboxEl: rowEl.querySelector('.notify-client-checkbox'),
      wishlistId: '',
      weightSumEl: rowEl.querySelector('.weight-sum-input'),
      taxiKzEl: rowEl.querySelector('.taxi-kz-input'),
      sdekEl: rowEl.querySelector('.sdek-input'),
      taxiRfEl: rowEl.querySelector('.taxi-rf-input'),
      taxiRfSendEl: rowEl.querySelector('.taxi-rf-send-input'),
      shippingRfEl: rowEl.querySelector('.shipping-rf-input'),
      taxiRfReceiveEl: rowEl.querySelector('.taxi-rf-receive-input'),
      coefBlockEl: rowEl.querySelector('.cost-coef-block'),
      // §5 D1 — сворачивание карточки.
      summaryRowEl: rowEl.querySelector('.position-summary-row'),
      summaryTextEl: rowEl.querySelector('.position-summary-text'),
      bodyEl: rowEl.querySelector('.position-body'),
      chevronEl: rowEl.querySelector('.position-chevron')
    };
    // Ручная фиксация доли (§3 B1/B2) — контрол внутри coefBlockEl (сам
    // .manual-total-input сейчас на уровень глубже, внутри .manual-total-wrap
    // — querySelector ищет по всему поддереву, ничего не меняет).
    item.manualShare = ctx.wireManualShareControl(item.coefBlockEl);
    item.manualShare.onChange(() => ctx.recomputeTotals());
    // §2 A3 (IMPLEMENTATION-PLAN-CART-UX-2.md, 07.09.2026) — плоский метод
    // на самой заявке, которым ctx.diffWeightFor(it) пользуется без знания
    // о внутреннем `manualShare` (тот же контракт нужен и лоту).
    item.getManualRub = () => item.manualShare.getManualRub();

    // §3 B1 — кнопка «Задать сумму вручную» прячет/показывает ручной ввод,
    // не удаляя его из DOM (см. комментарий в разметке выше — e2e ищет
    // .manual-total-input по классу, но, как и любой Playwright `.fill()`,
    // требует видимости, поэтому e2e-сценарии, которые реально вводят
    // значение, сами кликают эту кнопку первой).
    rowEl.querySelector('.manual-total-toggle-btn').addEventListener('click', () => {
      rowEl.querySelector('.manual-total-wrap').classList.toggle('hidden');
    });

    // §3 B1/B2/B3 — читаемая выкладка расчёта. Ссылки на элементы внутри
    // coefBlockEl, заполняются/подсвечиваются renderReconciliationBreakdown()
    // ниже, вызываемой из updateTotalDisplay()/updateFromTotal() (оба —
    // терминальные шаги связки Сумма↔%↔₽↔Итог, покрывают любой путь ввода).
    const ccOwnSumEl = rowEl.querySelector('.cc-own-sum');
    const ccDiffLabelEl = rowEl.querySelector('.cc-diff-label');
    const ccDiffShareEl = rowEl.querySelector('.cc-diff-share');
    const ccBaseTotalEl = rowEl.querySelector('.cc-base-total');
    const ccFeeLabelEl = rowEl.querySelector('.cc-fee-label');
    const ccFeeChangeEl = rowEl.querySelector('.cc-fee-change');
    const ccTotalChangeEl = rowEl.querySelector('.cc-total-change');
    // B2 — чистая производная от уже посчитанных полей, без нового
    // состояния: "было" пересчитывается заново из СЫРОЙ базы (getTotalRub())
    // и ТЕКУЩЕГО процента комиссии на каждый вызов, не хранится нигде между
    // вызовами. Стрелка «было → стало» — только если реконсиляция реально
    // сдвинула базу (>= 0.01 ₽, тот же допуск, что у остальных денежных
    // сравнений экрана).
    function renderReconciliationBreakdown() {
      if (item.coefBlockEl.classList.contains('hidden')) return; // реконсиляция выключена — блок скрыт, считать нечего
      const baseRaw = item.getTotalRub();
      const base = item.getEffectiveBaseRub();
      const diffShare = base - baseRaw;
      const pct = parseFloat(item.feePercentEl.value) || 0;
      const feeRaw = baseRaw * pct / 100;
      const totalRaw = baseRaw + feeRaw;
      const feeNow = parseFloat(item.feeRubEl.value) || 0;
      const totalNow = parseFloat(item.totalPaymentEl.value) || 0;
      const showArrow = Math.abs(base - baseRaw) >= 0.01;
      const sharePercent = ctx.diffSharePercentFor(item);

      ccOwnSumEl.textContent = `${baseRaw.toFixed(2)} ₽`;
      ccDiffLabelEl.textContent = `Доля разницы (${ctx.diffSplitModeLabel()} · ${sharePercent.toFixed(1)}%)`;
      setTextWithFlash(ccDiffShareEl, `${diffShare >= 0 ? '+' : ''}${diffShare.toFixed(2)} ₽`);
      setTextWithFlash(ccBaseTotalEl, `${base.toFixed(2)} ₽`);
      ccFeeLabelEl.textContent = `Комиссия ${pct.toFixed(2)}%`;
      setTextWithFlash(ccFeeChangeEl, showArrow ? `${feeRaw.toFixed(2)} → ${feeNow.toFixed(2)} ₽` : `${feeNow.toFixed(2)} ₽`);
      setTextWithFlash(ccTotalChangeEl, showArrow ? `${totalRaw.toFixed(2)} → ${totalNow.toFixed(2)} ₽` : `${totalNow.toFixed(2)} ₽`);
    }

    // §5 D1 — сворачивание/разворачивание карточки. Новая заявка всегда
    // открыта (per план) — `.position-body` не скрыт по умолчанию в
    // разметке, здесь только переключение. `setCollapsed` — общий
    // интерфейс с лотом (см. lotItem ниже) для кнопок "Свернуть все"/
    // "Развернуть все" в render().
    let positionCollapsed = false;
    item.setCollapsed = (collapsed) => {
      positionCollapsed = collapsed;
      item.bodyEl.classList.toggle('hidden', collapsed);
      item.chevronEl.style.transform = collapsed ? '' : 'rotate(180deg)';
    };
    item.summaryRowEl.addEventListener('click', (e) => {
      if (e.target.closest('.remove-item-btn')) return;
      item.setCollapsed(!positionCollapsed);
    });
    // Строка сводки ("Ваня · Товар · 52 $ · платит 6 240 ₽") видна и
    // свёрнутой, и развёрнутой карточке — обновляется тем же общим
    // проходом, что и липкая панель итогов (ctx.updateSummaryDisplay, §4 C1),
    // не отдельным набором слушателей.
    item.updateCardSummaryText = () => {
      const client = ctx.clientLabelFor(item);
      const product = item.productOriginal || item.productSearchEl.value.trim() || 'товар не указан';
      const amount = parseFloat(item.amountInputEl.value) || 0;
      const symbol = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || '';
      const total = parseFloat(item.totalPaymentEl.value) || 0;
      const parts = [client, product];
      if (amount > 0) parts.push(`${amount}${symbol}`);
      if (total > 0) parts.push(`платит ${total.toFixed(2)} ₽`);
      // §3 B4 — свёрнутая карточка тоже должна показывать долю разницы, не
      // только развёрнутая (репорт VASY: "не вижу визуально, как произошло
      // изменение"). Видна ТОЛЬКО пока реконсиляция реально активна на этой
      // заявке (reconciledShareRub !== null, тот же признак, что решает
      // видимость самого coefBlockEl) — не показывать "0 ₽ общих" на каждой
      // карточке, когда «Итог с сайта выкупа» вообще не заполнен.
      if (item.reconciledShareRub !== null) {
        const diffShare = item.getEffectiveBaseRub() - item.getTotalRub();
        if (Math.abs(diffShare) >= 0.01) parts.push(`${diffShare >= 0 ? '+' : ''}${diffShare.toFixed(2)} ₽ общих`);
      }
      item.summaryTextEl.textContent = parts.join(' · ');
    };

    if (prefillClient) {
      item.telegramId = prefillClient.telegramId || '';
      item.username = prefillClient.username || '';
      item.name = prefillClient.name || '';
      item.manualClientData = prefillClient.manualClientData || null;
      item.clientSearchEl.value = prefillClient.display || '';
    }

    item.amountCurrencySymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || '';
    rowEl.querySelector('.remove-item-btn').addEventListener('click', () => ctx.removeItem(id));

    // "Личный заказ" — та же логика, что order-new.js:230-235,656-664:
    // скрывает поиск клиента, на getPayload() игнорирует уже выбранного.
    item.ownPurchaseCheckboxEl.addEventListener('change', () => {
      rowEl.querySelector('.client-row').classList.toggle('hidden', item.ownPurchaseCheckboxEl.checked);
      item.clientDropdownEl.classList.remove('active');
      ctx.updateSummaryDisplay(); // §4 C1 — метка "Личный заказ" в разбивке "по клиентам"
    });

    // Ручная фиксация доли — блок скрыт, пока не заполнено «Итог с сайта
    // выкупа» (см. recomputeSiteTotalReconciliation в render()), контрол
    // (`item.manualShare`) уже подключён выше сразу после конструирования
    // `item` — здесь отдельная проводка больше не нужна (§3 B1, ИСПРАВЛЕНО
    // 06.09.2026, заменила слайдер).

    // Ссылка на покупку — тот же паттерн, что order-new.js:794-969.
    item.purchaseLinkResolveBtn.addEventListener('click', async () => {
      const url = item.purchaseLinkInputEl.value.trim();
      if (!url) return;
      item.purchaseLinkResolveBtn.disabled = true;
      try {
        const result = await callServer('resolveOrderProductLink', url);
        if (result.status === 'matched') {
          item.productSearchEl.value = result.sku.value || result.sku.label || '';
          item.productOriginal = result.sku.value || '';
          showSaveToast(true, 'Ссылка распознана — товар найден в каталоге.');
        } else if (result.status === 'unmatched') {
          const skuModal = SkuModal.init({
            onSaved: (skuResult, action) => {
              if (action === 'create') {
                item.productSearchEl.value = skuResult.value;
                item.productOriginal = skuResult.value;
                showSaveToast(true, `Позиция «${skuResult.label || skuResult.value}» создана и добавлена в каталог`);
              }
            }
          });
          skuModal.open('create', null, { original: (result.resolved && result.resolved.title) || '', description: result.resolved && result.resolved.description, imageUrl: result.resolved && result.resolved.imageUrl });
        }
      } catch (error) {
        showSaveToast(false, `Не удалось распознать ссылку: ${error.message}`);
      } finally {
        item.purchaseLinkResolveBtn.disabled = false;
      }
    });

    const handleClientSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { item.clientDropdownEl.classList.remove('active'); return; }
      const results = await callServer('searchClients', query);
      FormHelpers.renderDropdown(item.clientDropdownEl, results, (r) => `
        <div class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
          ${escapeHtmlClient(r.displayName)}
          ${r.pending ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">не подтверждён</span>' : ''}
        </div>
      `, (r) => {
        item.clientSearchEl.value = r.displayName;
        item.telegramId = r.telegramId;
        item.username = r.username;
        item.name = r.name;
        item.manualClientData = null;
        item.clientDropdownEl.classList.remove('active');
        ctx.updateSummaryDisplay(); // §4 C1 — имя клиента в разбивке "по клиентам"
      });
      item.clientDropdownEl.appendChild(Object.assign(document.createElement('li'), {
        className: 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center',
        textContent: '+ Ввести вручную'
      })).addEventListener('click', () => {
        item.clientDropdownEl.classList.remove('active');
        const manualModal = ManualClientModal.init({
          onSaved: ({ username, name }) => {
            item.manualClientData = { username, name };
            item.telegramId = '';
            item.username = username;
            item.name = name;
            item.clientSearchEl.value = name !== '' ? `${name} (${username || 'без username'})` : (username || 'Без данных');
            ctx.updateSummaryDisplay(); // §4 C1 — имя клиента в разбивке "по клиентам"
          }
        });
        manualModal.open();
      });
    }, 300);
    item.clientSearchEl.addEventListener('input', handleClientSearch);
    item.clientSearchEl.addEventListener('focus', () => { if (item.clientSearchEl.value.trim().length >= 2) item.clientDropdownEl.classList.add('active'); });

    const handleProductSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { item.productDropdownEl.classList.remove('active'); return; }
      const results = await callServer('searchSku', query);
      FormHelpers.renderDropdown(item.productDropdownEl, results, (r) => `<div class="font-medium text-gray-800 text-sm truncate">${r.label}</div>`, (r) => {
        item.productSearchEl.value = r.value;
        item.productOriginal = r.value;
        item.productDropdownEl.classList.remove('active');
        ctx.updateSummaryDisplay(); // §5 D1 — товар в строке сводки свёрнутой карточки
      });
      item.productDropdownEl.appendChild(Object.assign(document.createElement('li'), {
        className: 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center',
        textContent: '+ Добавить товар'
      })).addEventListener('click', () => {
        item.productDropdownEl.classList.remove('active');
        const skuModal = SkuModal.init({
          onSaved: (result, action) => {
            if (action === 'create') {
              item.productSearchEl.value = result.value;
              item.productOriginal = result.value;
              showSaveToast(true, `Позиция «${result.label || result.value}» создана и добавлена в каталог`);
              ctx.updateSummaryDisplay(); // §5 D1 — товар в строке сводки свёрнутой карточки
            }
          }
        });
        skuModal.open('create', null, { original: item.productSearchEl.value.trim() });
      });
    }, 300);
    item.productSearchEl.addEventListener('input', handleProductSearch);
    // §5 D1 — свободный ввод товара (без выбора из выпадашки) тоже должен
    // обновить строку сводки свёрнутой карточки (найдено вторым раундом
    // целевого ревью перед деплоем — раньше только выбор клиента это делал).
    item.productSearchEl.addEventListener('input', () => { item.productOriginal = item.productSearchEl.value; ctx.updateSummaryDisplay(); });
    item.productSearchEl.addEventListener('focus', () => { if (item.productSearchEl.value.trim().length >= 2) item.productDropdownEl.classList.add('active'); });

    function updateAmountRub() {
      const amount = parseFloat(item.amountInputEl.value) || 0;
      item.amountRubDisplayEl.textContent = (amount * ctx.getCurrentRate()).toFixed(2);
      ctx.recomputeTotals();
    }

    // База для комиссии/итога (§2 A1, ИСПРАВЛЕНО 06.09.2026) — если «Итог
    // с сайта выкупа» реконсилировал эту заявку, база = её реальная
    // реконсилированная доля, НЕ сырая сумма×курс. Раньше комиссия вообще
    // не знала о реконсиляции — корень бага "комиссия не учитывает
    // разницу" из репорта VASY (направление всегда в минус, см.
    // cartsService.createCart JSDoc за полным разбором).
    item.getEffectiveBaseRub = () => (item.reconciledShareRub !== null ? item.reconciledShareRub : item.getTotalRub());

    // Связка Сумма↔Комиссия %↔Комиссия ₽↔Итог — ТОЧНО как в order-new.js
    // (см. IMPLEMENTATION-PLAN-CART-UX.md §0 п.3, VASY 06.09.2026: "если
    // рублевая стоимость меняется то сразу визуально идёт изменение итога
    // по комиссии, и если вручную редактируется итог комиссии — меняется
    // процент под это соотношение автоматически"). Расчёт — в
    // screens/_cart-money.js (чистые функции, без DOM).
    function updateFeeRub() {
      const rub = CartMoney.feeRubFromPercent(item.getEffectiveBaseRub(), parseFloat(item.feePercentEl.value) || 0);
      if (document.activeElement !== item.feeRubEl) item.feeRubEl.value = rub > 0 ? rub.toFixed(2) : '';
      updateTotalDisplay();
      ctx.recomputeTotals();
    }
    function updateFeePercent() {
      if (document.activeElement !== item.feePercentEl) {
        const percent = CartMoney.feePercentFromRub(item.getEffectiveBaseRub(), parseFloat(item.feeRubEl.value) || 0);
        item.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
      }
      updateTotalDisplay();
      ctx.recomputeTotals();
    }
    // «Итог» (клиент платит) = база + «Комиссия ₽» — не read-only подпись,
    // полноценная четвёртая вершина связки (§2 C2).
    function updateTotalDisplay() {
      const base = item.getEffectiveBaseRub();
      const feeRub = parseFloat(item.feeRubEl.value) || 0;
      const total = CartMoney.totalFromFeeRub(base, feeRub);
      if (document.activeElement !== item.totalPaymentEl) {
        item.totalPaymentEl.value = total > 0 ? total.toFixed(2) : '';
      }
      item.totalBreakdownEl.textContent = CartMoney.totalBreakdownText(base, feeRub);
      renderReconciliationBreakdown(); // §3 B1/B2/B3 — терминальный шаг связки на пути "Сумма/Комиссия %/Комиссия ₽"
    }
    // Правка «Итога» вручную — выводит «Комиссия ₽»/«Комиссия %» обратно
    // (`updateFromTotalPayment`-эквивалент order-new.js).
    function updateFromTotal() {
      const base = item.getEffectiveBaseRub();
      const feeRub = CartMoney.feeRubFromTotal(base, parseFloat(item.totalPaymentEl.value) || 0);
      item.feeRubEl.value = feeRub > 0 ? feeRub.toFixed(2) : '';
      const percent = CartMoney.feePercentFromRub(base, feeRub);
      item.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
      item.totalBreakdownEl.textContent = CartMoney.totalBreakdownText(base, feeRub);
      renderReconciliationBreakdown(); // §3 B1/B2/B3 — терминальный шаг связки на пути "Итог"
      ctx.recomputeTotals();
    }
    function clampTotalOnBlur() {
      const clamped = CartMoney.clampTotal(item.getEffectiveBaseRub(), parseFloat(item.totalPaymentEl.value) || 0);
      item.totalPaymentEl.value = clamped > 0 ? clamped.toFixed(2) : '';
      updateFromTotal();
    }

    // ИСПРАВЛЕНО 05.09.2026 (репорт VASY — "процент написан один, а
    // реальный отличается") — раньше ввод "Суммы" пересчитывал только
    // рублёвое отображение самой суммы, но НЕ "Комиссию ₽". `updateFeeRub()`
    // безопасна для повторного вызова (не трогает поле, если оно сейчас в
    // фокусе) и уже вызывается по этому же принципу на смене курса
    // (`onRateChanged`) — теперь и на смене суммы.
    item.amountInputEl.addEventListener('input', () => { updateAmountRub(); updateFeeRub(); fetchForecast(); });
    item.feePercentEl.addEventListener('input', updateFeeRub);
    item.feeRubEl.addEventListener('input', updateFeePercent);
    item.totalPaymentEl.addEventListener('input', updateFromTotal);
    item.totalPaymentEl.addEventListener('blur', clampTotalOnBlur);
    // §4 C1 — "Уже оплачено"/"Осталось получить" и "Прогноз логистики"
    // на липкой панели итогов: оба вводятся здесь, но раньше нигде не
    // суммировались (репорт из плана). ctx.updateSummaryDisplay пересчитывает
    // ВСЮ сводку — та же, уже дешёвая для размера реальной корзины,
    // функция, что вызывается на каждый денежный ввод в других полях.
    item.alreadyPaidInputEl.addEventListener('input', ctx.updateSummaryDisplay);
    CartMoney.FORECAST_FIELD_KEYS.forEach((key) => item[key].addEventListener('input', ctx.updateSummaryDisplay));

    // Реконсиляция по «Итогу с сайта выкупа» (§2 A1) — вызывается из
    // recomputeSiteTotalReconciliation в render(). null — реконсиляция
    // выключена/сброшена, возврат к сырой сумме.
    item.setReconciledShareRub = (shareRub) => {
      item.reconciledShareRub = shareRub;
      if (shareRub === null) item.manualShare.reset(); // реконсиляция выключена целиком — не оставлять «вручную» висеть на скрытом блоке
      else item.manualShare.setAutoPreview(shareRub);
      updateFeeRub();
    };

    // Комиссионный гейт Э6/D-10 (слияние «Новый заказ»→«Корзина»,
    // 05.09.2026) — N экземпляров на экране, скоуплены на rowEl своим
    // idPrefix (см. _form-helpers.js JSDoc за обоснованием параметризации).
    item.commissionGate = FormHelpers.wireCommissionGate({
      root: rowEl, idPrefix: `pos${id}-`,
      feePercentSelector: '.fee-percent-input', feeRubSelector: '.fee-rub-input'
    });

    const fetchForecast = debounce(async () => {
      const amount = parseFloat(item.amountInputEl.value) || 0;
      if (amount <= 0) return;
      try {
        const forecast = await callServer('getOrderForecast', amount, ctx.getCurrentCurrency(), ctx.currentChannel());
        if (item.weightSumEl.value === '') item.weightSumEl.value = (forecast.weight || 0).toFixed(2);
        if (item.taxiKzEl.value === '' && forecast.taxiKz) item.taxiKzEl.value = forecast.taxiKz.toFixed(2);
        if (item.sdekEl.value === '' && forecast.sdek) item.sdekEl.value = forecast.sdek.toFixed(2);
        if (item.taxiRfEl.value === '' && forecast.taxiRf) item.taxiRfEl.value = forecast.taxiRf.toFixed(2);
        if (item.taxiRfSendEl.value === '' && forecast.taxiRfSend) item.taxiRfSendEl.value = forecast.taxiRfSend.toFixed(2);
        if (item.shippingRfEl.value === '' && forecast.shippingRf) item.shippingRfEl.value = forecast.shippingRf.toFixed(2);
        if (item.taxiRfReceiveEl.value === '' && forecast.taxiRfReceive) item.taxiRfReceiveEl.value = forecast.taxiRfReceive.toFixed(2);
        // §4 C1 — предзаполнение выше меняет .value программно, что НЕ
        // генерирует событие 'input' (см. слушатели на этих же полях
        // сразу после создания item) — без явного вызова здесь "Прогноз
        // логистики" на липкой панели не увидел бы автоподставленные
        // значения, пока менеджер не тронул поле руками.
        ctx.updateSummaryDisplay();
        item.commissionGate.setThresholds({ warnPercent: forecast.commissionWarnPercent, reasonPercent: forecast.commissionReasonPercent });
        // Э6, точка безубыточности — та же карточка настроек, что setThresholds
        // выше (найдено целевым ревью перед деплоем — без этого вызова блок
        // "точка безубыточности" молча никогда не появлялся на cart-new.js).
        item.commissionGate.setBreakeven({
          breakevenCommissionPercent: forecast.breakevenCommissionPercent,
          breakevenIsDefaultChannelPolicy: forecast.breakevenIsDefaultChannelPolicy,
          breakevenUnavailableReason: forecast.breakevenUnavailableReason
        });
      } catch (error) { /* прогноз — необязательное удобство, как в order-new.js */ }
    }, 400);

    item.onRateChanged = () => {
      item.amountCurrencySymbolEl.textContent = CartMoney.CURRENCY_SYMBOLS[ctx.getCurrentCurrency()] || '';
      updateAmountRub();
      updateFeeRub();
    };
    // Ручная фиксация доли (§3 B1/B2, ИСПРАВЛЕНО 06.09.2026) — заявка
    // «вручную» использует число, введённое менеджером в «Итог заявки с
    // учётом разницы», как свою «известную базу» ВМЕСТО сырой
    // сумма×курс — та же роль, что раньше играл вес=0 слайдера, только
    // явным числом, а не абстрактным коэффициентом.
    item.getTotalRub = () => {
      const manualRub = item.manualShare.getManualRub();
      return manualRub !== null ? manualRub : (parseFloat(item.amountInputEl.value) || 0) * ctx.getCurrentRate();
    };
    item.getCommissionRub = () => parseFloat(item.feeRubEl.value) || 0;
    item.getCostCoefficient = () => (item.manualShare.getManualRub() !== null ? 0 : 1);
    // G1 (§8 IMPLEMENTATION-PLAN-CART-UX-2.md, 08.09.2026) — точка входа
    // для обратного пересчёта «Получить с клиентов, ₽» с уровня корзины
    // (cart-new.js). Позиция — ОДНА клиентская заявка (в отличие от лота,
    // где заявок несколько — см. её JSDoc). «Личный заказ» исключён — тот
    // же критерий, что уже использует billableRows/updateSummaryDisplay
    // (платить некому). setFeePercent проставляет значение через УЖЕ
    // существующее поле+событие 'input' (ту же цепочку, что менеджер
    // запускает вручную), не пишет в fee-поля напрямую в обход неё —
    // иначе разошлось бы со связкой Сумма/Комиссия%/Комиссия₽/Итог.
    item.getFeeTargets = () => (item.ownPurchaseCheckboxEl.checked ? [] : [{
      getBaseRub: () => item.getEffectiveBaseRub(),
      setFeePercent: (percent) => {
        item.feePercentEl.value = percent.toFixed(2);
        item.feePercentEl.dispatchEvent(new Event('input'));
      }
    }]);
    // §4 C1 — строка "по клиентам" липкой панели итогов. uidHint (`id`,
    // из ctx.nextItemId() — глобально уникален на всю корзину, общий
    // счётчик с лотами) — используется только как фолбэк-ключ группировки
    // для клиента без telegramId/username, см. clientKeyFor в cart-new.js.
    item.getClientRow = () => ctx.collectClientRow(item, `pos${id}`);
    // §6 Фаза E — клиент не выбран И не отмечено «Личный заказ». Тот же
    // критерий "пусто", что уже использует clientKeyFor (cart-new.js) для
    // группировки "по клиентам" (`__empty__`) — раньше это была ТОЛЬКО
    // мягкая подсказка в модалке проверки перед сохранением (§5 D5),
    // теперь `saveCart()` блокирует сохранение целиком, пока по каждой
    // такой заявке не сделан явный выбор (см. `_cart-client-required-
    // modal.js`). `markOwnPurchase()` — применяет выбор "Личный заказ":
    // ставит чекбокс и эмулирует его 'change' (та же логика скрытия
    // client-row/обновления сводки, что при ручном клике менеджера).
    item.getUnresolvedClientRows = () => {
      // НЕ читаем clientSearchEl.value.trim() как признак "клиент есть" —
      // (найдено целевым ревью перед деплоем 07.09.2026) менеджер мог
      // напечатать текст в поиск и не выбрать ни один результат из
      // выпадашки/не открыть "+ Ввести вручную" — telegramId/manualClientData
      // тогда остаются пустыми, а payload всё равно уйдёт БЕЗ реального
      // плательщика (getPayload читает те же telegramId/manualClientData, не
      // сырой текст поля). Это ровно тот тихий баг, который Фаза E должна
      // закрывать — свободный текст здесь достаточен только для мягкой
      // группировки "по клиентам" (clientKeyFor в cart-new.js), не для этого
      // блокирующего гейта.
      const hasClient = item.ownPurchaseCheckboxEl.checked || !!item.telegramId || !!item.manualClientData;
      if (hasClient) return [];
      return [{
        id: `pos${id}`,
        label: item.productOriginal || item.productSearchEl.value.trim() || 'товар не указан',
        markOwnPurchase: () => {
          item.ownPurchaseCheckboxEl.checked = true;
          item.ownPurchaseCheckboxEl.dispatchEvent(new Event('change'));
        }
      }];
    };
    // Валидация комиссионного гейта перед сохранением — вызывается из
    // saveCart() на КАЖДОЙ позиции (см. §2.1 плана), не здесь.
    // «Личный заказ» исключён из гейта — тот же принцип, что order-new.js's
    // `!ownPurchaseCheckbox.checked && !commissionGate.validate()` (Э6/D-10):
    // сервер (ordersService.createOrder) сам никогда не требует причину для
    // client_kind='own' (F-35), гейтить это на клиенте было бы регрессией.
    item.validateCommissionGate = () => item.ownPurchaseCheckboxEl.checked || item.commissionGate.validate();
    item.getPayload = () => {
      const bookingSumRub = parseFloat(item.feeRubEl.value) || 0;
      const alreadyPaidRub = parseFloat(item.alreadyPaidInputEl.value) || 0;
      const booking = CartMoney.computeBookingFields(bookingSumRub, alreadyPaidRub);
      return {
        client: item.ownPurchaseCheckboxEl.checked
          ? { telegramId: '', username: '', name: '' }
          : (item.manualClientData
            ? { telegramId: '', username: item.manualClientData.username, name: item.manualClientData.name }
            : { telegramId: item.telegramId || '', username: item.username, name: item.name }),
        isOwnPurchase: item.ownPurchaseCheckboxEl.checked,
        productOriginal: item.productOriginal || item.productSearchEl.value,
        amount: item.amountInputEl.value,
        // «Доля разницы»/ручная фиксация (§2 A1, §3 B1/B2) — служебные
        // поля, задействуются ТОЛЬКО если на экране заполнено «Итог с
        // сайта выкупа» (см. cartsService.createCart JSDoc); сервер сам
        // отбрасывает их из payload createOrder, если не используются.
        // §2 A5 (IMPLEMENTATION-PLAN-CART-UX-2.md, 07.09.2026) —
        // ctx.diffWeightFor(item), НЕ item.getCostCoefficient(): вес
        // теперь зависит от выбранного менеджером правила деления разницы
        // ("по сумме"/"поровну"), не жёстко 1. Backend не меняется —
        // splitProportionally на сервере нормирует произвольные веса.
        costCoefficient: ctx.diffWeightFor(item),
        fixedShareRub: item.manualShare.getManualRub(),
        bookingSum: item.feeRubEl.value,
        // Комиссия по проценту (§2 A1, ИСПРАВЛЕНО 06.09.2026) — сервер
        // (cartsService.createCart) пересчитывает bookingSum от РЕАЛЬНОЙ
        // реконсилированной доли, если этот процент задан — см. её JSDoc.
        // Не мешает старому поведению: пусто/не задан — сервер не трогает
        // bookingSum вообще (обратная совместимость).
        commissionPercent: item.feePercentEl.value,
        // Цель стадии "Основная" ("Осталось") — БЕЗ этого paymentsService.
        // setStageTarget для неё вообще не вызывается (тот же реальный баг,
        // что уже нашли и исправили для позиций лота 02.09.2026, см.
        // lotsService.js's JSDoc у createLot — здесь тот же случай для
        // отдельной позиции корзины, не через лот). База — РЕКОНСИЛИРОВАННАЯ
        // (getEffectiveBaseRub), не сырая — иначе "Осталось" разошлось бы с
        // тем, что реально показано на экране как "Итог".
        mainSum: (item.getEffectiveBaseRub() + (parseFloat(item.feeRubEl.value) || 0)).toFixed(2),
        // «Сколько уже оплачено, ₽» (слияние «Новый заказ»→«Корзина»,
        // 05.09.2026, IMPLEMENTATION-PLAN-CART-MERGE.md §0) — заменяет
        // старую пару «Оплачена ли бронь?»+«Уже получено при оформлении».
        mainAmountReceivedAtCreation: item.alreadyPaidInputEl.value,
        bookingPaid: booking.bookingPaid,
        bookingAlreadyInMainAmount: booking.bookingAlreadyInMainAmount,
        purchaseLink: item.purchaseLinkInputEl.value.trim(),
        remark: item.noteInputEl.value,
        notifyClient: item.notifyClientCheckboxEl.checked,
        commissionLowReason: item.commissionGate.getReason(),
        wishlistId: item.wishlistId || '',
        weightSum: item.weightSumEl.value,
        taxiKzSum: item.taxiKzEl.value,
        sdekSum: item.sdekEl.value,
        taxiRfSum: item.taxiRfEl.value,
        taxiRfSendSum: item.taxiRfSendEl.value,
        shippingRfSum: item.shippingRfEl.value,
        taxiRfReceiveSum: item.taxiRfReceiveEl.value,
        requestId: generateRequestId()
      };
    };

    updateAmountRub();
    ctx.items.push(item);
    return item;
  }
};
