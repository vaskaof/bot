'use strict';

/**
 * Экран "Новая корзина" — REFACTOR-CART.md §4 (фаза 3, 03.09.2026), слияние
 * с "Новым заказом" 05.09.2026 (IMPLEMENTATION-PLAN-CART-MERGE.md).
 * **Единственная точка входа в создание заказа** — кнопка "+ Новый заказ"
 * убрана с `orders.js`. Старые `order-new.js`/`lot-new.js` НЕ удалены
 * физически (маршруты `orders/new`/`lots/new` технически достижимы), но
 * больше не видны из UI — переходный период до полной живой проверки этого
 * экрана тем же протоколом, что «Лот»/«Корзина» 02-03.09.2026.
 *
 * Модель экрана — список "заявок" корзины, каждая одного из двух видов:
 * - Позиция — клиент+товар+сумма (в валюте корзины)+комиссия+«Сколько уже
 *   оплачено»+прогноз расходов (тот же набор полей, что был в `order-new.js`,
 *   минус старая пара «Оплачена ли бронь?»/«Уже получено при оформлении» —
 *   см. ниже) — одна карточка = один будущий `orders`-заказ с `cart_id`,
 *   БЕЗ лота.
 * - Лот — свёрнутая карточка-сводка, разворачивается в мини-версию формы
 *   `lot-new.js` (построчные клиент+товар+известная цена+два слайдера
 *   доли+комиссия+«Сколько уже оплачено», `splitProportionallyClient` —
 *   намеренно та же копия, что уже дублирует backend `splitProportionally`,
 *   см. её JSDoc там же про намеренное дублирование). Канал/аккаунт/карго/
 *   дата/статусы и валюта — ОБЩИЕ на всю корзину (шапка экрана), не
 *   запрашиваются повторно ни на позиции, ни на лоте — упрощение v1,
 *   переопределение по заявке backend уже поддерживает (`cartsService.
 *   createCart`'s `header` per-lot/per-position override), но UI для этого
 *   не заведён (см. задачу ниже "Что сознательно не входит в эту версию").
 *
 * **«Сколько уже оплачено, ₽»** (IMPLEMENTATION-PLAN-CART-MERGE.md §0) —
 * заменяет старую пару «Оплачена ли бронь?»(toggle)+«Уже получено при
 * оформлении» — менеджеры путали эти два поля. На каждой карточке (и
 * позиции, и позиции внутри лота) вычисляется `bookingPaid`/
 * `bookingAlreadyInMainAmount`, отправляемые в уже существующий контракт
 * `createOrder` (см. `computeBookingFields` ниже) — НЕ «живой» статус,
 * фиксируется один раз в момент создания заказа, ровно как и старый ручной
 * флаг (нет STAGE_BOOKING в платёжном движке, задним числом не
 * пересчитывается — принятое ограничение, см. план §0).
 *
 * Единственный запрос на сохранение — `createCart(payload)`
 * (`server/src/carts/cartsService.js`, уже задеплоен фазой 2). Ничего не
 * летит на сервер до финального сохранения — черновик только в памяти
 * фронтенда (localStorage-черновик — тот же ограниченный паттерн, что уже
 * есть в `lot-new.js`: пишется ПЕРЕД отправкой, чистится при успехе, БЕЗ
 * баннера восстановления при следующем заходе — параллель с `lot-new.js`
 * сознательная, не отдельный недочёт этого экрана).
 *
 * Что сознательно НЕ входит в эту версию (озвучено VASY как открытая
 * заявка, не молча пропущено):
 * - Переопределение канала/аккаунта/карго/даты на уровне отдельной заявки
 *   (bulk-режим `order-new.js` это умеет для одиночных заказов — здесь нет).
 * - Восстановление черновика после сбоя (баннер) — см. параллель с
 *   `lot-new.js` выше.
 */
const CART_DRAFT_KEY = 'pendingCartDraft';
const CURRENCY_SYMBOLS = { 'Доллар': '$', 'Юань': '¥', 'Евро': '€', 'Фунт': '£' };

// Слияние «Новый заказ»→«Корзина» (05.09.2026, IMPLEMENTATION-PLAN-CART-
// MERGE.md §0) — единственное место, где считается формула замены старой
// пары «Оплачена ли бронь?»+«Уже получено при оформлении» на одно число
// «Сколько уже оплачено, ₽». Возвращает ровно тот же контракт, который
// раньше заполнял менеджер вручную через toggle+модалку `#booking-overlap-
// modal` в order-new.js — НЕ живой статус, фиксируется один раз здесь же,
// при отправке формы (см. JSDoc шапки файла).
function computeBookingFields(bookingSumRub, alreadyPaidRub) {
  const bookingCovered = bookingSumRub > 0 && alreadyPaidRub >= bookingSumRub;
  return { bookingPaid: bookingCovered ? 'Да' : 'Нет', bookingAlreadyInMainAmount: bookingCovered };
}

window.Screens = window.Screens || {};
window.Screens.cartNew = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Новая корзина</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="save-cart-btn" title="Создать корзину" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">

        <!-- Шапка корзины — общая на все заявки внутри (§4 п.1 плана) -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible mb-3">
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Валюта корзины</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <select id="cart-currency-select" class="bg-transparent border-none outline-none text-sm font-medium text-gray-600 cursor-pointer">
                <option value="Доллар">USD ($)</option>
                <option value="Юань">CNY (¥)</option>
                <option value="Евро">EUR (€)</option>
                <option value="Фунт">GBP (£)</option>
              </select>
              <div class="flex items-center gap-1 text-[11px] text-gray-500">
                Курс: <span id="cart-rate-display">—</span> ₽
                <button id="cart-refresh-rate" title="Обновить курс" class="hover:text-indigo-600 transition-colors">
                  <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                <i data-lucide="truck" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Доставка</span>
            </div>
            <div class="flex-1 w-full">
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="statusDelivery"></select>
              <div id="cart-delivery-ladder" class="mt-2"></div>
            </div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <i data-lucide="check-circle-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Статус заказа</span>
            </div>
            <div class="flex-1 w-full"><select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="statusOrder"></select></div>
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
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <i data-lucide="calendar" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Дата выкупа</span>
            </div>
            <div class="flex-1 w-full"><input type="date" id="cart-date-input" class="w-full bg-transparent border-none outline-none text-[15px] py-1 text-gray-700"></div>
          </div>
        </div>

        <!-- Заявки -->
        <div id="cart-items-list"></div>
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button type="button" id="add-position-btn" class="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium">+ Добавить позицию</button>
          <button type="button" id="add-lot-btn" class="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium">+ Добавить лот</button>
        </div>

        <!-- Итого корзины — живой пересчёт (§4 п.4/п.5 плана), намеренно
             ПОСЛЕДНИЙ блок экрана, как итог/завершение (репорт VASY
             05.09.2026 — раньше стоял над списком заявок, до того как
             менеджер вообще что-то добавил). -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-700">Итого корзины</div>
              <div class="text-[11px] text-gray-400 inline-flex items-center gap-1">Средняя комиссия${helpIcon('Средняя комиссия', '<p>Read-only сводка — взвешенное среднее по уже введённым комиссиям заявок. Ничего не сохраняется отдельно и ни на что не влияет, комиссия по-прежнему считается только на позициях.</p>')}: <span id="cart-avg-commission">—</span></div>
            </div>
            <div class="text-lg font-bold text-gray-900"><span id="cart-total-rub">0.00</span> ₽</div>
          </div>
          <!-- «Итог с сайта выкупа» (доп. раунд 05.09.2026, репорт VASY) —
               необязательно, пусто = ничего не меняется. Заполнено —
               разница с суммой позиций делится между заявками по их долям
               (слайдер "Доля разницы" появляется на каждой карточке ниже). -->
          <div class="mt-3 pt-3 border-t border-gray-100">
            <label class="text-[11px] text-gray-500 inline-flex items-center gap-1">Итог с сайта выкупа, в валюте корзины${helpIcon('Итог с сайта выкупа', '<p>Необязательно. Итоговая сумма чека с сайта/площадки выкупа целиком — если она отличается от суммы, введённой по заявкам (округление, общие расходы площадки и т.п.), разница распределяется между заявками пропорционально их «Доле разницы» (по умолчанию — поровну, слайдер на каждой заявке).</p><p>Пусто — работает как раньше, без разбивки.</p>')}</label>
            <input type="number" id="cart-site-total-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none mt-1" placeholder="0.00 — необязательно" step="0.01">
            <div id="cart-site-total-diff" class="hidden text-[11px] text-gray-500 mt-1.5"></div>
          </div>
        </div>

        ${ManualClientModal.html()}
        ${SkuModal.html()}
      </main>
    `;

    // --- Общие поля шапки / курс ---
    const currencySelect = document.getElementById('cart-currency-select');
    const rateDisplay = document.getElementById('cart-rate-display');
    const dateInput = document.getElementById('cart-date-input');
    const totalRubDisplay = document.getElementById('cart-total-rub');
    const avgCommissionDisplay = document.getElementById('cart-avg-commission');

    let currentRates = {};
    let currentRate = 0;
    let currentCurrency = 'Доллар';

    const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_CONFIG.TIMEZONE });
    dateInput.value = todayFormatter.format(new Date());

    FormHelpers.wireDictionarySelect('select[data-dict="statusDelivery"]', 'statusDelivery', dictionaries.statusDelivery);
    FormHelpers.wireDictionarySelect('select[data-dict="statusOrder"]', 'statusOrder', dictionaries.statusOrder);
    FormHelpers.wireDictionarySelect('select[data-dict="purchaseChannel"]', 'purchaseChannel', dictionaries.purchaseChannel);
    FormHelpers.wireDictionarySelect('select[data-dict="purchaseAccount"]', 'purchaseAccount', dictionaries.purchaseAccount);
    FormHelpers.wireDictionarySelect('select[data-dict="cargo"]', 'cargo', dictionaries.cargo);

    function currentChannel() { return document.querySelector('select[data-dict="purchaseChannel"]').value; }

    // Лестница статусов доставки — та же клиентская механика, что
    // order-new.js/lot-new.js (заявки ещё не сохранены, сервер её посчитать
    // не может).
    function updateDeliveryLadderPreview() {
      const select = document.querySelector('select[data-dict="statusDelivery"]');
      const ladder = computeDeliveryLadderPosition(select.value);
      document.getElementById('cart-delivery-ladder').innerHTML = buildDeliveryLadder(ladder, select.value, { compact: true });
    }
    document.querySelector('select[data-dict="statusDelivery"]').addEventListener('change', updateDeliveryLadderPreview);
    updateDeliveryLadderPreview();

    async function refreshRate() {
      const icon = document.getElementById('cart-refresh-rate').querySelector('svg');
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

    function applyCurrentCurrencyRate() {
      const rawRate = currentRates[currentCurrency];
      if (rawRate === undefined || rawRate === '') return;
      currentRate = parseFloat(rawRate.toString().replace(',', '.'));
      if (isNaN(currentRate)) return;
      rateDisplay.textContent = currentRate.toFixed(2);
      items.forEach((item) => item.onRateChanged());
      recomputeTotals();
    }

    document.getElementById('cart-refresh-rate').addEventListener('click', refreshRate);
    currencySelect.addEventListener('change', (e) => { currentCurrency = e.target.value; applyCurrentCurrencyRate(); });
    refreshRate();

    function searchClientStub(query) { return callServer('searchClients', query); }
    function searchReleaseStub(query) { return callServer('searchSku', query); }

    // Денежная математика (связка Сумма↔Комиссия%↔Комиссия₽↔Итог,
    // разбивка разницы) вынесена в screens/_cart-money.js 06.09.2026
    // (IMPLEMENTATION-PLAN-CART-UX.md §5 D4 — ответ на вопрос VASY про
    // god-файлы: cart-new.js не должен стать третьим, чистый расчёт без DOM
    // заодно впервые покрывается unit-тестами без браузера). Локальный
    // алиас — короче на месте вызова, тот же приём, что уже применён к
    // window.FormHelpers-функциям.
    const splitProportionallyClient = CartMoney.splitProportionallyClient;

    // Ручная фиксация доли (§3 B1/B2, ИСПРАВЛЕНО 06.09.2026) — общий
    // контрол для отдельной позиции И лота целиком (оба — заявки корзины
    // верхнего уровня, §0 п.1). Заменяет абстрактный слайдер-коэффициент
    // (0-2, "1.00" ничего не значит для человека) редактируемым полем
    // конечной суммы в ₽ + переключателем «авто»/«вручную». НЕ применяется
    // к строкам ВНУТРИ лота (те остаются слайдерами, §3 B4 — сознательная
    // граница, не забытый случай).
    function wireManualShareControl(blockEl) {
      const inputEl = blockEl.querySelector('.manual-total-input');
      const labelEl = blockEl.querySelector('.manual-mode-label');
      const resetBtn = blockEl.querySelector('.manual-total-reset-btn');
      let manualRub = null; // null = «авто»
      let onChangeCb = null;

      function setModeDisplay(isManual) {
        labelEl.textContent = isManual ? 'вручную' : 'авто';
        labelEl.classList.toggle('text-indigo-600', isManual);
        labelEl.classList.toggle('text-gray-400', !isManual);
        resetBtn.classList.toggle('hidden', !isManual);
      }

      inputEl.addEventListener('input', () => {
        manualRub = parseFloat(inputEl.value) || 0;
        setModeDisplay(true);
        if (onChangeCb) onChangeCb();
      });
      resetBtn.addEventListener('click', () => {
        manualRub = null;
        inputEl.value = '';
        setModeDisplay(false);
        if (onChangeCb) onChangeCb();
      });

      return {
        getManualRub: () => manualRub,
        // Живой предпросмотр в режиме «авто» — НЕ трогает поле, если оно
        // сейчас в фокусе (менеджер может как раз вводить своё число) ИЛИ
        // уже переведено в «вручную» (значение принадлежит менеджеру, не
        // автопересчёту).
        setAutoPreview: (valueRub) => {
          if (manualRub !== null || document.activeElement === inputEl) return;
          inputEl.value = valueRub > 0 ? valueRub.toFixed(2) : '';
        },
        // Полный сброс — вызывается, когда реконсиляция целиком выключена
        // (поле «Итог с сайта выкупа» очищено), чтобы не оставлять
        // «вручную» висеть на скрытом, неактуальном блоке.
        reset: () => { manualRub = null; inputEl.value = ''; setModeDisplay(false); },
        onChange: (fn) => { onChangeCb = fn; }
      };
    }

    // --- Итого/средняя комиссия (§4 п.4/п.5, ИСПРАВЛЕНО 06.09.2026 —
    // IMPLEMENTATION-PLAN-CART-UX.md §2 A2/A3) ---
    // { type:'position'|'lot', getTotalRub() — СЫРАЯ известная база (для
    // разбивки разницы, зеркало backend basePrice), getEffectiveBaseRub() —
    // РЕКОНСИЛИРОВАННАЯ база (для отображения "Итого"/комиссии, A3),
    // setReconciledShareRub(rubOrNull), getCommissionRub(), onRateChanged(),
    // getPayload(), getCostCoefficient() — 0, если заявка зафиксирована
    // вручную (§3 B1/B2, manualShare), иначе 1 — coefBlockEl? }
    let items = [];
    let itemSeq = 0;
    // Guard от бесконечной рекурсии (см. план §2 A2 — единственное место с
    // реальным риском зацикливания): setReconciledShareRub на каждой заявке
    // вызывает её собственный пересчёт (updateFeeRub/patchAllCostShares),
    // который зовёт recomputeTotals() → recomputeSiteTotalReconciliation()
    // заново. Без guard'а это бесконечный цикл.
    let reconciling = false;

    // Чистое обновление сводки — БЕЗ повторного запуска реконсиляции (её
    // вызывает только recomputeTotals ниже). Используется как из
    // recomputeTotals, так и изнутри recomputeSiteTotalReconciliation после
    // применения долей — там нельзя звать recomputeTotals (см. guard выше).
    function updateSummaryDisplay() {
      // A3: "Итого корзины"/"Средняя комиссия" считаются от РЕКОНСИЛИРОВАННОЙ
      // базы (если реконсиляция активна) — раньше показывали СЫРУЮ сумму,
      // которая расходилась с реально сохраняемыми суммами (репорт VASY
      // "итог корзины теряется"/не совпадает).
      // Скобки вокруг `|| 0` обязательны — `+` связывает крепче `||`, без
      // скобок `s + X || 0` читается как `(s + X) || 0`: если накопленная
      // сумма ДО этого шага случайно даст 0/NaN, весь накопленный итог
      // (не только вклад текущей заявки) обнулился бы молча. Найдено
      // целевым ревью перед деплоем 06.09.2026 (latent — сегодня
      // getEffectiveBaseRub()/getTotalRub() сами гарантируют не-NaN, но
      // выражение не должно полагаться на это неявно).
      const effectiveTotalRub = items.reduce((s, it) => s + ((it.getEffectiveBaseRub ? it.getEffectiveBaseRub() : it.getTotalRub()) || 0), 0);
      const totalCommission = items.reduce((s, it) => s + (it.getCommissionRub() || 0), 0);
      totalRubDisplay.textContent = effectiveTotalRub.toFixed(2);
      avgCommissionDisplay.textContent = effectiveTotalRub > 0
        ? `${((totalCommission / effectiveTotalRub) * 100).toFixed(1)}% (${totalCommission.toFixed(2)} ₽)`
        : '—';
    }

    function recomputeTotals() {
      updateSummaryDisplay();
      // Реконсиляция всегда получает СЫРУЮ сумму известных цен (та же база,
      // что backend's knownBasesSum) — не реконсилированную, иначе разница
      // считалась бы от уже сдвинутого числа.
      const rawTotalRub = items.reduce((s, it) => s + (it.getTotalRub() || 0), 0);
      recomputeSiteTotalReconciliation(rawTotalRub);
    }

    // «Итог с сайта выкупа» (доп. раунд 05.09.2026, репорт VASY: "должны
    // быть стоимости позиций, помимо этого стоимость всей корзины, их
    // разница должна делиться между заказами с возможностью настройки") —
    // необязательное поле в шапке "Итого корзины" (внизу экрана). Пусто —
    // ничего не меняется визуально (та же карточка, что была всегда), сумма
    // заявок остаётся единственным источником "Итого". Заполнено —
    // показывает разницу с суммой позиций и живую разбивку по каждой
    // заявке (та же формула/тот же UX, что уже есть внутри лота — здесь
    // ровно на уровень выше). Ничего не отправляется на сервер отдельно —
    // `buildPayload()` читает это же поле напрямую в header.
    //
    // ИСПРАВЛЕНО 06.09.2026 (§2 A1/A2) — раньше только показывала
    // read-only текст "С учётом итога корзины: N ₽" и НИЧЕГО не сообщала
    // самим заявкам, из-за чего комиссия и (для лота) внутренняя разбивка
    // оставались привязаны к СТАРОЙ, до-реконсиляционной сумме — корень
    // обоих багов из репорта VASY. Теперь передаёт реальную долю каждой
    // заявке через `setReconciledShareRub`, которая сама триггерит
    // пересчёт комиссии/итога (позиция) или строк внутри лота (A2).
    const siteTotalInput = document.getElementById('cart-site-total-input');
    const siteTotalDiffEl = document.getElementById('cart-site-total-diff');
    function recomputeSiteTotalReconciliation(totalRub) {
      if (reconciling) return; // см. guard выше
      const raw = parseFloat(siteTotalInput.value);
      const active = raw > 0;
      items.forEach((it) => { if (it.coefBlockEl) it.coefBlockEl.classList.toggle('hidden', !active); });

      reconciling = true;
      try {
        if (!active) {
          siteTotalDiffEl.classList.add('hidden');
          items.forEach((it) => it.setReconciledShareRub(null));
          return;
        }

        const poolRub = raw * currentRate;
        const diffRub = poolRub - totalRub;
        siteTotalDiffEl.classList.remove('hidden');
        siteTotalDiffEl.textContent = Math.abs(diffRub) < 0.01
          ? 'Совпадает с суммой позиций.'
          : `Расходится с суммой позиций на ${diffRub > 0 ? '+' : ''}${diffRub.toFixed(2)} ₽ — разница делится по долям ниже.`;

        const rows = items.map((it) => ({ id: it.id, weight: it.getCostCoefficient(), basePrice: it.getTotalRub() }));
        const shares = splitProportionallyClient(poolRub, rows, 1);
        items.forEach((it) => {
          const shareRub = shares.get(it.id) || 0;
          it.setReconciledShareRub(shareRub);
        });
      } finally {
        reconciling = false;
      }
      // Заявки внутри применили свои пересчёты, пока guard был поднят —
      // сводка наверху экрана обновляется финальным чистым проходом.
      updateSummaryDisplay();
    }
    siteTotalInput.addEventListener('input', () => recomputeTotals());

    const itemsList = document.getElementById('cart-items-list');

    // ==================== Позиция (обычная заявка) ====================
    function addPositionItem(prefillClient) {
      const id = ++itemSeq;
      const rowEl = document.createElement('div');
      rowEl.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3';
      rowEl.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-semibold text-gray-400">Позиция</span>
          <button type="button" class="remove-item-btn p-1 text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>

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

        <div class="flex items-center gap-3 mb-2">
          <div class="flex items-center gap-1 flex-1">
            <span class="amount-currency-symbol text-sm text-gray-400"></span>
            <input type="number" class="amount-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
          </div>
          <div class="text-xs text-gray-500 shrink-0">≈ <span class="amount-rub-display">0.00</span> ₽</div>
        </div>

        <!-- Ручная фиксация доли (§3 B1/B2, ИСПРАВЛЕНО 06.09.2026 — замена
             абстрактного слайдера-коэффициента прямым вводом суммы, VASY:
             "отредактировать вручную долю"). Видна ТОЛЬКО когда заполнено
             «Итог с сайта выкупа» внизу экрана, см. её JSDoc в render().
             Скрыта по умолчанию — не захламляет обычное создание. -->
        <div class="cost-coef-block hidden mb-2 pt-2 border-t border-gray-100">
          <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span>Итог заявки с учётом разницы, ₽</span>
            <span class="manual-mode-label text-[10px] font-medium text-gray-400">авто</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input type="number" class="manual-total-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
            <button type="button" class="manual-total-reset-btn hidden shrink-0 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] whitespace-nowrap">Сбросить</button>
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
      `;
      itemsList.appendChild(rowEl);
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
        coefBlockEl: rowEl.querySelector('.cost-coef-block')
      };
      // Ручная фиксация доли (§3 B1/B2) — контрол внутри coefBlockEl.
      item.manualShare = wireManualShareControl(item.coefBlockEl);
      item.manualShare.onChange(() => recomputeTotals());

      if (prefillClient) {
        item.telegramId = prefillClient.telegramId || '';
        item.username = prefillClient.username || '';
        item.name = prefillClient.name || '';
        item.manualClientData = prefillClient.manualClientData || null;
        item.clientSearchEl.value = prefillClient.display || '';
      }

      item.amountCurrencySymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || '';
      rowEl.querySelector('.remove-item-btn').addEventListener('click', () => removeItem(id));

      // "Личный заказ" — та же логика, что order-new.js:230-235,656-664:
      // скрывает поиск клиента, на getPayload() игнорирует уже выбранного.
      item.ownPurchaseCheckboxEl.addEventListener('change', () => {
        rowEl.querySelector('.client-row').classList.toggle('hidden', item.ownPurchaseCheckboxEl.checked);
        item.clientDropdownEl.classList.remove('active');
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
        const results = await searchClientStub(query);
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
        const results = await searchReleaseStub(query);
        FormHelpers.renderDropdown(item.productDropdownEl, results, (r) => `<div class="font-medium text-gray-800 text-sm truncate">${r.label}</div>`, (r) => {
          item.productSearchEl.value = r.value;
          item.productOriginal = r.value;
          item.productDropdownEl.classList.remove('active');
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
              }
            }
          });
          skuModal.open('create', null, { original: item.productSearchEl.value.trim() });
        });
      }, 300);
      item.productSearchEl.addEventListener('input', handleProductSearch);
      item.productSearchEl.addEventListener('input', () => { item.productOriginal = item.productSearchEl.value; });
      item.productSearchEl.addEventListener('focus', () => { if (item.productSearchEl.value.trim().length >= 2) item.productDropdownEl.classList.add('active'); });

      function updateAmountRub() {
        const amount = parseFloat(item.amountInputEl.value) || 0;
        item.amountRubDisplayEl.textContent = (amount * currentRate).toFixed(2);
        recomputeTotals();
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
        recomputeTotals();
      }
      function updateFeePercent() {
        if (document.activeElement !== item.feePercentEl) {
          const percent = CartMoney.feePercentFromRub(item.getEffectiveBaseRub(), parseFloat(item.feeRubEl.value) || 0);
          item.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
        }
        updateTotalDisplay();
        recomputeTotals();
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
        recomputeTotals();
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
          const forecast = await callServer('getOrderForecast', amount, currencySelect.value, currentChannel());
          if (item.weightSumEl.value === '') item.weightSumEl.value = (forecast.weight || 0).toFixed(2);
          if (item.taxiKzEl.value === '' && forecast.taxiKz) item.taxiKzEl.value = forecast.taxiKz.toFixed(2);
          if (item.sdekEl.value === '' && forecast.sdek) item.sdekEl.value = forecast.sdek.toFixed(2);
          if (item.taxiRfEl.value === '' && forecast.taxiRf) item.taxiRfEl.value = forecast.taxiRf.toFixed(2);
          if (item.taxiRfSendEl.value === '' && forecast.taxiRfSend) item.taxiRfSendEl.value = forecast.taxiRfSend.toFixed(2);
          if (item.shippingRfEl.value === '' && forecast.shippingRf) item.shippingRfEl.value = forecast.shippingRf.toFixed(2);
          if (item.taxiRfReceiveEl.value === '' && forecast.taxiRfReceive) item.taxiRfReceiveEl.value = forecast.taxiRfReceive.toFixed(2);
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
        item.amountCurrencySymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || '';
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
        return manualRub !== null ? manualRub : (parseFloat(item.amountInputEl.value) || 0) * currentRate;
      };
      item.getCommissionRub = () => parseFloat(item.feeRubEl.value) || 0;
      item.getCostCoefficient = () => (item.manualShare.getManualRub() !== null ? 0 : 1);
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
        const booking = computeBookingFields(bookingSumRub, alreadyPaidRub);
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
          costCoefficient: item.getCostCoefficient(),
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
      items.push(item);
      return item;
    }

    // ==================== Лот (свёрнутая заявка, встроенная lot-new.js-форма) ====================
    function addLotItem() {
      const id = ++itemSeq;
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
          <div class="mb-2">
            <label class="text-[11px] text-gray-500">Общая стоимость лота (в валюте корзины)</label>
            <div class="flex items-center gap-2">
              <span class="lot-amount-currency-symbol text-sm text-gray-400"></span>
              <input type="number" class="lot-amount-input w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
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
              <input type="number" class="manual-total-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00" step="0.01">
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
      itemsList.appendChild(wrapEl);
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
      const lotManualShare = wireManualShareControl(cartCoefBlockEl);
      lotManualShare.onChange(() => recomputeTotals());

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
      summaryRow.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) return;
        expanded = !expanded;
        body.classList.toggle('hidden', !expanded);
        chevron.style.transform = expanded ? 'rotate(180deg)' : '';
      });
      wrapEl.querySelector('.remove-item-btn').addEventListener('click', () => removeItem(id));

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
          const forecast = await callServer('getOrderForecast', 1, currencySelect.value, currentChannel());
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
        return (parseFloat(amountInput.value) || 0) * currentRate;
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
        recomputeTotals();
      }

      // "Цена товара" на позиции лота вводится в ВАЛЮТЕ КОРЗИНЫ (тот же
      // принцип, что поле "Сумма" у отдельной позиции — символ валюты рядом
      // с полем это визуально обещает), а не в ₽ — конвертировать ЗДЕСЬ, не
      // отправлять сырое число как "knownPriceRub" (реальный денежный баг,
      // найден целевым ревью перед деплоем — без конвертации разбивка доли
      // и сумма, уходящая в createLot, были бы неверны примерно в currentRate
      // раз).
      function knownPriceRub(row) {
        return (parseFloat(row.knownPriceInputEl.value) || 0) * currentRate;
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
        const shares = splitProportionallyClient(pool, costRows, roundingStep);
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
      // ~16-17%") — обеим функциям не хватало `recomputeTotals()` в конце;
      // 06.09.2026 обе переведены на screens/_cart-money.js вместо
      // инлайн-формулы, добавлена связка с «Итогом» строки.
      function updateRowFeeRub(row) {
        const rub = CartMoney.feeRubFromPercent(row.costShareRub, parseFloat(row.feePercentEl.value) || 0);
        if (document.activeElement !== row.feeRubEl) row.feeRubEl.value = rub > 0 ? rub.toFixed(2) : '';
        updateRowTotalDisplay(row);
        recomputeTotals();
      }
      function updateRowFeePercent(row) {
        if (document.activeElement !== row.feePercentEl) {
          const percent = CartMoney.feePercentFromRub(row.costShareRub, parseFloat(row.feeRubEl.value) || 0);
          row.feePercentEl.value = percent > 0 ? percent.toFixed(2) : '';
        }
        updateRowTotalDisplay(row);
        recomputeTotals();
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
        recomputeTotals();
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
          <div class="mb-1">
            <label class="text-[10px] text-gray-500">Цена товара (если известна заранее)</label>
            <div class="flex items-center gap-1">
              <span class="known-price-currency-symbol text-xs text-gray-400"></span>
              <input type="number" class="known-price-input w-full bg-white rounded-lg px-2 py-1.5 text-sm outline-none border border-gray-200" placeholder="0.00 — оставьте пустым, если не знаете" step="0.01">
            </div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-gray-500">
            <span>Доля в общих тратах</span>
            <span class="coef-fraction-label font-semibold text-indigo-600">1.00</span>
          </div>
          <input type="range" min="0" max="2" step="0.25" value="1" class="cost-slider w-full">
          <div class="text-right text-xs font-semibold text-gray-800 cost-share-display mt-0.5">0.00 ₽</div>
          <div class="mt-1.5 pt-1.5 border-t border-gray-200">
            <div class="flex items-center justify-between text-[10px] text-gray-500">
              <span>Доля веса/логистики</span>
              <span class="weight-fraction-label font-semibold text-teal-600">1.00</span>
            </div>
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
        if (row.knownPriceCurrencySymbolEl) row.knownPriceCurrencySymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || '';
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
        });

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
          const results = await searchClientStub(query);
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

        const handleProductSearch = debounce(async (e) => {
          const query = e.target.value.trim();
          if (query.length < 2) { row.productDropdownEl.classList.remove('active'); return; }
          const results = await searchReleaseStub(query);
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
        row.costSliderEl.addEventListener('input', () => {
          row.costCoefficient = parseFloat(row.costSliderEl.value);
          row.costFractionLabelEl.textContent = row.costCoefficient.toFixed(2);
          patchAllCostShares();
        });
        row.weightSliderEl.addEventListener('input', () => {
          row.weightCoefficient = parseFloat(row.weightSliderEl.value);
          row.weightFractionLabelEl.textContent = row.weightCoefficient.toFixed(2);
        });
        row.feePercentEl.addEventListener('input', () => updateRowFeeRub(row));
        row.feeRubEl.addEventListener('input', () => updateRowFeePercent(row));
        row.totalPaymentEl.addEventListener('input', () => updateRowFromTotal(row));
        row.totalPaymentEl.addEventListener('blur', () => clampRowTotalOnBlur(row));

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
      amountSymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || '';

      addLotRow(); // одна позиция сразу, как в lot-new.js
      expanded = true;
      body.classList.remove('hidden');
      chevron.style.transform = 'rotate(180deg)';

      const lotItem = {
        id, type: 'lot', rowEl: wrapEl,
        onRateChanged: () => { amountSymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || ''; lotRows.forEach((r) => { if (r.knownPriceCurrencySymbolEl) r.knownPriceCurrencySymbolEl.textContent = CURRENCY_SYMBOLS[currentCurrency] || ''; }); patchAllCostShares(); },
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
      items.push(lotItem);
      updateSummary();
      return lotItem;
    }

    function removeItem(id) {
      const idx = items.findIndex((it) => it.id === id);
      if (idx === -1) return;
      items[idx].rowEl.remove();
      items.splice(idx, 1);
      recomputeTotals();
    }

    document.getElementById('add-position-btn').addEventListener('click', () => addPositionItem());
    document.getElementById('add-lot-btn').addEventListener('click', () => addLotItem());

    // Предзаполнение из "Спрос клиентов" (слияние «Новый заказ»→«Корзина»,
    // 05.09.2026, wishlist-demand.js теперь ведёт сюда вместо orders/new) —
    // тот же набор параметров, что раньше читал order-new.js:1699-1719.
    if (params && (params.telegramId || params.skuOriginal || params.productOriginal)) {
      const prefillClient = params.telegramId ? {
        telegramId: params.telegramId, username: params.username || '', name: params.name || '',
        display: (params.name && params.username) ? `${params.name} (${params.username})` : (params.name || params.username || 'Клиент')
      } : null;
      const item = addPositionItem(prefillClient);
      if (params.skuOriginal) {
        item.productSearchEl.value = params.productDisplay || params.skuOriginal;
        item.productOriginal = params.skuOriginal;
      } else if (params.productOriginal) {
        item.productSearchEl.value = params.productOriginal;
        item.productOriginal = params.productOriginal;
      }
      if (params.wishlistId) item.wishlistId = params.wishlistId;
    } else {
      addPositionItem(); // одна позиция сразу — заказ по умолчанию не тяжелее сегодняшнего (§4 плана)
    }

    document.addEventListener('click', (e) => {
      items.forEach((it) => {
        if (it.type !== 'position') return;
        if (!it.clientSearchEl.contains(e.target) && !it.clientDropdownEl.contains(e.target)) it.clientDropdownEl.classList.remove('active');
        if (!it.productSearchEl.contains(e.target) && !it.productDropdownEl.contains(e.target)) it.productDropdownEl.classList.remove('active');
      });
    }, { signal });

    // --- Сохранение ---
    const saveBtn = document.getElementById('save-cart-btn');
    let saving = false;

    function buildPayload() {
      const siteTotal = parseFloat(siteTotalInput.value);
      const header = {
        currency: currencySelect.value,
        purchaseChannel: currentChannel(),
        purchaseAccount: document.querySelector('select[data-dict="purchaseAccount"]').value,
        cargo: document.querySelector('select[data-dict="cargo"]').value,
        purchaseDate: dateInput.value,
        // «Итог с сайта выкупа» (доп. раунд 05.09.2026) — необязательно,
        // undefined если поле пустое (cartsService.createCart трактует это
        // как «не указано», ровно прежнее поведение без разбивки разницы).
        totalAmountInCurrency: siteTotal > 0 ? siteTotal : undefined
      };
      const statusDelivery = document.querySelector('select[data-dict="statusDelivery"]').value;
      const statusOrder = document.querySelector('select[data-dict="statusOrder"]').value;
      const positions = items.filter((it) => it.type === 'position').map((it) => ({ ...it.getPayload(), statusDelivery, statusOrder }));
      const lots = items.filter((it) => it.type === 'lot').map((it) => {
        const payload = it.getPayload();
        payload.positions = payload.positions.map((p) => ({ ...p, statusDelivery, statusOrder }));
        return payload;
      });
      return { header, positions, lots };
    }

    async function saveCart() {
      if (saving) return;
      if (items.length === 0) { showSaveToast(false, 'Добавьте хотя бы одну позицию или лот.'); return; }
      const missingProduct = items.some((it) => it.type === 'position'
        ? !(it.productOriginal || it.productSearchEl.value).trim()
        : (it.hasMissingProduct() || !it.hasPositions()));
      if (missingProduct) { showSaveToast(false, 'У каждой позиции (в том числе внутри лота) должен быть указан товар.'); return; }

      // Ручная фиксация доли (§3 B3) — если реконсиляция активна И ВСЕ
      // заявки зафиксированы вручную, splitProportionally кладёт остаток
      // округления на первую заявку (вырожденный случай totalWeight<=0,
      // см. её JSDoc) — введённое вручную число молча "поехало" бы.
      // Блокируем ДО отправки вместо тихого сдвига денег.
      const siteTotalRaw = parseFloat(siteTotalInput.value);
      if (siteTotalRaw > 0) {
        const allManual = items.every((it) => it.getCostCoefficient() === 0);
        if (allManual) {
          const poolRub = siteTotalRaw * currentRate;
          const manualSum = items.reduce((s, it) => s + (it.getTotalRub() || 0), 0);
          const diffRub = poolRub - manualSum;
          if (Math.abs(diffRub) > 1) {
            showSaveToast(false, `Все суммы заданы вручную, но в сумме дают ${manualSum.toFixed(2)} ₽ вместо ${poolRub.toFixed(2)} ₽ (расхождение ${diffRub > 0 ? '+' : ''}${diffRub.toFixed(2)} ₽) — поправьте одну из сумм или верните заявку в режим «авто».`);
            return;
          }
        }
      }

      // Комиссионный гейт Э6/D-10 (слияние «Новый заказ»→«Корзина»,
      // 05.09.2026) — валидируется на КАЖДОЙ позиции (и на каждой позиции
      // внутри каждого лота) перед отправкой, тот же принцип, что
      // order-new.js:1632. Первый непрошедший гейт получает фокус сам
      // (см. FormHelpers.wireCommissionGate's validate()), достаточно
      // одного общего тоста здесь.
      const commissionGateFailed = items.some((it) => it.type === 'position'
        ? !it.validateCommissionGate()
        : !it.validateCommissionGates());
      if (commissionGateFailed) { showSaveToast(false, 'Заниженная комиссия требует указать причину — проверьте позиции.'); return; }

      saving = true;
      saveBtn.disabled = true;
      saveBtn.classList.add('save-pulse');
      const payload = buildPayload();
      saveOrderDraft(CART_DRAFT_KEY, payload);
      try {
        const response = await callServer('createCart', payload);
        clearOrderDraft(CART_DRAFT_KEY);
        // Лот, успешный НА СВОЁМ уровне (response.lotResults[i].success),
        // может всё равно содержать частичные сбои ВНУТРИ себя — createLot
        // возвращает {lotId, results:[...]} по каждой своей позиции (тот же
        // формат, что читает lot-new.js's saveLot()) — считаем и это, иначе
        // тост молчал бы о реальном частичном сбое одной позиции лота.
        let okCount = response.positionResults.filter((r) => r.success).length;
        let failCount = response.positionResults.filter((r) => !r.success).length;
        response.lotResults.forEach((lr) => {
          if (!lr.success) { failCount += 1; return; }
          const inner = Array.isArray(lr.results) ? lr.results : [];
          okCount += inner.filter((r) => r.success).length;
          failCount += inner.filter((r) => !r.success).length;
        });
        if (failCount === 0) {
          showSaveToast(true, `Корзина ${response.cartId} создана: ${okCount} из ${okCount} заявок`);
        } else {
          showSaveToast(false, `Корзина ${response.cartId} создана частично: ${okCount} из ${okCount + failCount} заявок — проверьте список заказов/лотов.`);
        }
        navigateTo('orders');
      } catch (error) {
        showSaveToast(false, `Не удалось создать корзину: ${error.message}`);
      } finally {
        saving = false;
        saveBtn.disabled = false;
        saveBtn.classList.remove('save-pulse');
      }
    }
    saveBtn.addEventListener('click', saveCart);

    if (window.lucide) window.lucide.createIcons();
  }
};
