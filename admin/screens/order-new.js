'use strict';

/**
 * Экран "Новый заказ" — перенесён из admin/index.html (SPA админки,
 * 02.08.2026, God-файл №1). SKU-модалка и модалка ручного клиента вынесены в
 * общие _sku-modal.js/_manual-client-modal.js (были дословными копиями с
 * catalog.html/edit-order.html). _populateSelect/initTagToggle/renderDropdown
 * вынесены в _form-helpers.js. Все top-level let-переменные формы (были
 * безопасны при полной перезагрузке страницы на каждый заход) перенесены
 * внутрь render() — иначе утекали бы между заходами на экран в общем
 * SPA-контексте (тот же класс фикса, что и на client-стороне Phase 2).
 */
window.Screens = window.Screens || {};
window.Screens.orderNew = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Новый заказ</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <label class="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
        <input type="checkbox" id="notify-client-checkbox" class="w-4 h-4 accent-indigo-600 cursor-pointer">
        Уведомить
      </label>
      <button id="save-order-btn" title="Сохранить заказ" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="wishlist-match-banner" class="hidden mb-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm"></div>
        <div id="bulk-mode-banner" class="hidden mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"></div>

        <!-- "Несколько сразу" (13.08.2026, bulk order creation) — общие поля
             формы заполняются один раз, клиент+сумма — построчно. Отдельная
             кнопка "Дублировать" на экране редактирования заказа открывает
             этот же режим с 1 предзаполненной строкой. -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-gray-700">Несколько сразу</div>
            <div class="text-[11px] text-gray-400">Общие поля ниже заполняются один раз, клиент и сумма — по каждой строке отдельно.</div>
          </div>
          <button type="button" id="bulk-mode-toggle" class="shrink-0 relative w-11 h-6 rounded-full bg-gray-200 transition-colors" data-value="0">
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"></span>
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">

          <div class="field-row flex flex-col sm:flex-row sm:items-start p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <i data-lucide="sticky-note" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Примечание</span>
            </div>
            <div class="flex-1 w-full relative">
              <textarea id="note-input" rows="2" class="w-full bg-transparent border-none outline-none text-[15px] resize-none placeholder-gray-400" placeholder="Введите примечание..." maxlength="300"></textarea>
              <div class="text-right text-[10px] text-gray-400 mt-1" id="note-counter">0/300</div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 relative">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i data-lucide="link-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Ссылка на покупку</span>
            </div>
            <div class="flex-1 w-full relative">
              <input type="text" id="purchase-link-input" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400 py-1" placeholder="Вставьте ссылку на товар" autocomplete="off">
              <div id="purchase-link-hint" class="hidden mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-800 flex items-center justify-between gap-2">
                <span>Похоже на ссылку на товар</span>
                <button type="button" id="purchase-link-resolve-btn" class="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium">Распознать</button>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 relative">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="box" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Выпуск</span>
            </div>
            <div class="flex-1 w-full relative">
              <div class="flex items-center w-full">
                <input type="text" id="release-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400 py-1" placeholder="Поиск выпуска" autocomplete="off">
                <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute right-0"></i>
              </div>
              <ul id="release-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-gray-50/50">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <i data-lucide="tag" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Название RU</span>
            </div>
            <div class="flex-1 w-full flex items-center gap-2">
              <img id="release-thumbnail" src="" alt="" class="hidden w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100">
              <input type="text" id="short-name-input" class="w-full bg-transparent border-none outline-none text-[15px] text-gray-500 py-1" readonly placeholder="Заполнится автоматически">
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
              <div id="delivery-ladder" class="mt-2"></div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <i data-lucide="check-circle-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Статус заказа</span>
            </div>
            <div class="flex-1 w-full">
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer text-gray-800" id="order-status-select" data-dict="statusOrder"></select>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                <i data-lucide="shopping-bag" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Канал выкупа</span>
            </div>
            <div class="flex-1 w-full">
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="purchaseChannel"></select>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <i data-lucide="user" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Аккаунт</span>
            </div>
            <div class="flex-1 w-full">
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="purchaseAccount"></select>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                <i data-lucide="package" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Карго</span>
            </div>
            <div class="flex-1 w-full">
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer" data-dict="cargo"></select>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <i data-lucide="calendar" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Дата выкупа</span>
            </div>
            <div class="flex-1 w-full">
              <input type="date" id="date-input" class="w-full bg-transparent border-none outline-none text-[15px] py-1 text-gray-700">
            </div>
          </div>

          <div id="single-client-row" class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 relative">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-[#e0f2fe] text-[#0ea5e9] flex items-center justify-center shrink-0">
                <i data-lucide="send" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Телеграм</span>
            </div>
            <div class="flex-1 w-full relative">
              <div class="flex items-center w-full">
                <input type="text" id="client-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400 py-1" placeholder="Поиск клиента..." autocomplete="off">
                <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute right-0"></i>
              </div>
              <ul id="client-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
          </div>

          <div id="amount-section" class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700" id="amount-section-label">Количество</span>
            </div>
            <div class="flex-1 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2 relative">
                <select id="currency-select" class="bg-transparent border-none outline-none text-sm font-medium text-gray-600 cursor-pointer">
                  <option value="Доллар">USD ($)</option>
                  <option value="Юань">CNY (¥)</option>
                  <option value="Евро">EUR (€)</option>
                </select>
                <input type="number" id="amount-input" class="w-24 bg-transparent border-none outline-none text-lg font-semibold text-gray-900 placeholder-gray-300 py-1" placeholder="0.00" step="0.01">
              </div>
              <div class="flex flex-col sm:items-end">
                <div class="flex items-center gap-1 text-[11px] text-gray-500">
                  Курс: <span id="rate-display">91.65</span> ₽
                  <button id="refresh-rate" title="Обновить курс" class="hover:text-indigo-600 transition-colors">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                  </button>
                </div>
                <div class="text-sm text-gray-600 font-medium mt-0.5">
                  ≈ <span id="calculated-rub">0.00</span> ₽
                </div>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <i data-lucide="percent" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Комиссия</span>
            </div>
            <div class="flex-1 w-full flex items-center gap-4">
              <div class="flex items-baseline gap-1 flex-1 border-b border-dashed border-gray-300 pb-1">
                <input type="number" id="fee-percent" class="w-full bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0" step="0.1">
                <span class="text-sm text-gray-500 font-medium">%</span>
              </div>
              <i data-lucide="arrow-right-left" class="w-4 h-4 text-gray-300 shrink-0"></i>
              <div class="flex items-baseline gap-1 flex-1 border-b border-dashed border-gray-300 pb-1">
                <input type="number" id="fee-rub" class="w-full bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0" step="1">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
            </div>
          </div>

          <!-- "Клиенты и суммы" перемещено сюда, НИЖЕ курса/комиссии
               (13.08.2026, по фидбеку VASY — раньше стояло выше "Количество",
               из-за чего приходилось сначала скроллить вниз считать курс,
               потом возвращаться назад добавлять клиентов). Кнопки — с явным
               фоном/рамкой (были голым цветным текстом, непонятно нажимаемое). -->
          <div id="bulk-rows-section" class="hidden field-row flex flex-col p-4 border-b border-gray-100 gap-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <span class="text-sm font-medium text-gray-700">Клиенты и суммы</span>
              <div class="flex items-center gap-2">
                <button type="button" id="bulk-copy-amount-btn" class="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-medium hover:bg-indigo-100 transition-colors">Скопировать сумму во все</button>
                <button type="button" id="bulk-from-wishlist-btn" class="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-medium hover:bg-indigo-100 transition-colors">Из листа ожидания</button>
              </div>
            </div>
            <div id="bulk-rows-list" class="flex flex-col gap-2"></div>
            <button type="button" id="bulk-add-row-btn" class="self-start px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium flex items-center gap-1 hover:bg-indigo-100 transition-colors">
              <i data-lucide="plus" class="w-4 h-4"></i> Добавить клиента
            </button>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <i data-lucide="badge-check" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Оплачена ли бронь?</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <p class="text-[11px] text-gray-400 leading-tight max-w-[220px]">Отметьте «Да», если клиент уже перевёл бронь/комиссию за посредничество отдельно, до того как известна итоговая сумма выкупа.</p>
              <div class="flex items-center gap-1 shrink-0" id="booking-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
            </div>
          </div>

          <div id="total-payment-section" class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i data-lucide="wallet" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Основная оплата</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-1">
                <input type="number" id="total-payment-input" class="w-32 bg-transparent border-none outline-none text-lg font-bold text-gray-900 text-right sm:text-left placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-lg font-bold text-gray-900">₽</span>
              </div>
            </div>
          </div>

          <div id="main-amount-received-section" class="field-row flex flex-col sm:flex-row sm:items-center p-4 gap-2 sm:gap-4 bg-[#f8fafc] rounded-b-2xl">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i data-lucide="hand-coins" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Уже получено при оформлении</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <p class="text-[11px] text-gray-400 leading-tight max-w-[220px]">Если клиент уже перевёл деньги до того, как вы завели заказ — впишите фактически полученную сумму (не обязательно всю). Она будет закреплена именно за этим заказом и не уйдёт на оплату других открытых заказов клиента.</p>
              <div class="flex items-baseline gap-1 shrink-0">
                <input type="number" id="main-amount-received-input" class="w-28 bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 text-right placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      ${SkuModal.html()}
      ${ManualClientModal.html()}
    `;

    // Локальное состояние формы — раньше жило на верхнем уровне <script>
    // (безопасно при полной перезагрузке страницы на каждый заход), теперь
    // обязано жить внутри render(), иначе утечёт между заходами на экран.
    let noteInput, noteCounter, releaseSearch, shortNameInput, selectedReleaseId = null;
    let clientSearch, selectedClientId = null, selectedClientUsername = '', selectedClientName = '';
    let manualClientData = null;
    let amountInput, feePercentInput, feeRubInput, totalPaymentInput, mainAmountReceivedInput, calculatedRub, rateDisplay, refreshRateBtn, dateInput;
    let currentCurrency = 'Доллар';
    let currentRates = {};
    let currentRate = 0;
    let purchaseLinkInput, purchaseLinkHint, purchaseLinkResolveBtn;
    // Фаза 5 интеграции Вишлист/Каталог/Заказы (04.08.2026) — заказ, оформленный
    // из "Спрос клиентов", несёт связь с исходной позицией вишлиста насквозь до
    // saveOrder(). null для обычного пути создания заказа (без изменений).
    let prefillWishlistId = null;

    function searchReleaseStub(query) { return callServer('searchSku', query); }
    function searchClientStub(query) { return callServer('searchClient', query); }
    function getExchangeRatesStub() {
      return callServer('refreshRate').then(rates => rates.finalRates || null);
    }

    // Общие поля — одинаковы для одиночного заказа И для каждой строки
    // "Несколько сразу" (13.08.2026). client/amount/bookingSum/bookingPaid/
    // mainSum/mainAmountReceivedAtCreation — НЕ общие, передаются отдельно
    // вызывающей стороной (см. saveOrder/saveBulkOrders ниже).
    function buildSharedOrderData() {
      return {
        remark: noteInput.value,
        productOriginal: releaseSearch.value,
        statusDelivery: document.querySelector('select[data-dict="statusDelivery"]').value,
        statusOrder: document.querySelector('select[data-dict="statusOrder"]').value,
        purchaseChannel: document.querySelector('select[data-dict="purchaseChannel"]').value,
        purchaseAccount: document.querySelector('select[data-dict="purchaseAccount"]').value,
        cargo: document.querySelector('select[data-dict="cargo"]').value,
        dateOrder: dateInput.value,
        currency: currencyCurrencyValue(),
        notifyClient: document.getElementById('notify-client-checkbox').checked,
        purchaseLink: purchaseLinkInput.value.trim()
      };
    }

    async function saveOrder() {
      const client = manualClientData
        ? { telegramId: '', username: manualClientData.username, name: manualClientData.name }
        : { telegramId: selectedClientId || '', username: selectedClientUsername, name: selectedClientName };
      const orderData = {
        ...buildSharedOrderData(),
        client: client,
        amount: amountInput.value,
        bookingSum: feeRubInput.value,
        bookingPaid: document.getElementById('booking-paid-toggle').dataset.value,
        mainSum: totalPaymentInput.value,
        mainAmountReceivedAtCreation: mainAmountReceivedInput.value,
        wishlistId: prefillWishlistId || ''
      };
      return callServer('createOrder', orderData);
    }

    // "Несколько сразу" — N полных orderData, backend (createOrdersBatch)
    // просто вызывает createOrder на каждый по очереди, вся денежная логика
    // переиспользуется как есть (см. личную память Architect'а про причину,
    // почему это НЕ одна атомарная транзакция). "Оплачена ли бронь?"/
    // "Основная оплата"/"Уже получено" сознательно не передаются — см.
    // комментарий у setBulkMode.
    async function saveBulkOrders() {
      const shared = buildSharedOrderData();
      const ordersDataList = bulkRows
        .filter((row) => row.telegramId || row.manualClientData)
        .map((row) => {
          const amountRub = bulkAmountRub(row.amountEl.value);
          const percent = parseFloat(feePercentInput.value) || 0;
          const feeRub = amountRub * (percent / 100);
          const mainSum = amountRub + feeRub;
          const client = row.manualClientData
            ? { telegramId: '', username: row.manualClientData.username, name: row.manualClientData.name }
            : { telegramId: row.telegramId, username: row.username, name: row.name };
          return {
            ...shared,
            client,
            amount: row.amountEl.value,
            bookingSum: feeRub > 0 ? feeRub.toFixed(2) : '',
            mainSum: mainSum > 0 ? mainSum.toFixed(2) : ''
          };
        });
      if (ordersDataList.length === 0) {
        throw new Error('Не заполнено ни одной строки с клиентом');
      }
      return callServer('createOrdersBatch', ordersDataList);
    }

    function currencyCurrencyValue() {
      return document.getElementById('currency-select').value;
    }

    noteInput = document.getElementById('note-input');
    noteCounter = document.getElementById('note-counter');
    releaseSearch = document.getElementById('release-search');
    shortNameInput = document.getElementById('short-name-input');
    clientSearch = document.getElementById('client-search');
    amountInput = document.getElementById('amount-input');
    feePercentInput = document.getElementById('fee-percent');
    feeRubInput = document.getElementById('fee-rub');
    totalPaymentInput = document.getElementById('total-payment-input');
    mainAmountReceivedInput = document.getElementById('main-amount-received-input');
    calculatedRub = document.getElementById('calculated-rub');
    rateDisplay = document.getElementById('rate-display');
    refreshRateBtn = document.getElementById('refresh-rate');
    dateInput = document.getElementById('date-input');
    purchaseLinkInput = document.getElementById('purchase-link-input');
    purchaseLinkHint = document.getElementById('purchase-link-hint');
    purchaseLinkResolveBtn = document.getElementById('purchase-link-resolve-btn');

    const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_CONFIG.TIMEZONE });
    dateInput.value = todayFormatter.format(new Date());

    FormHelpers.populateSelect('select[data-dict="statusDelivery"]', dictionaries.statusDelivery);
    FormHelpers.populateSelect('select[data-dict="statusOrder"]', dictionaries.statusOrder);
    FormHelpers.populateSelect('select[data-dict="purchaseChannel"]', dictionaries.purchaseChannel);
    FormHelpers.populateSelect('select[data-dict="purchaseAccount"]', dictionaries.purchaseAccount);
    FormHelpers.populateSelect('select[data-dict="cargo"]', dictionaries.cargo);

    // Лестница статусов доставки (13.08.2026, VASY-репорт: "на новом заказе
    // не вижу") — новый заказ ещё не сохранён, сервер её посчитать не может
    // (getOrderDetails требует существующий orderId), поэтому здесь чисто
    // клиентский расчёт (computeDeliveryLadderPosition, common.js), живой на
    // каждую смену select'а — тот же select, что уходит в orderData.
    function updateDeliveryLadderPreview() {
      const select = document.querySelector('select[data-dict="statusDelivery"]');
      const ladder = computeDeliveryLadderPosition(select.value);
      document.getElementById('delivery-ladder').innerHTML = buildDeliveryLadder(ladder, select.value, { compact: true });
    }
    document.querySelector('select[data-dict="statusDelivery"]').addEventListener('change', updateDeliveryLadderPreview);
    updateDeliveryLadderPreview();

    FormHelpers.initTagToggle('booking-paid-toggle');

    noteInput.addEventListener('input', (e) => {
      noteCounter.textContent = `${e.target.value.length}/300`;
    });

    // --- Выпуск (autocomplete) + SKU-модалка ---
    const releaseDropdown = document.getElementById('release-dropdown');

    const skuModal = SkuModal.init({
      onSaved: (result, action, context) => {
        // Только режим create автозаполняет форму заказа новой позицией —
        // правка существующей (update/merge) форму НЕ трогает (решение,
        // зафиксированное в исходном index.html).
        if (action === 'create') {
          applyCreatedOrEditedSku(result.value, result.label);
          // Тост нужен и при создании через распознанную ссылку, и при обычном
          // ручном добавлении ("+ Добавить выпуск") — раньше оба сценария были
          // "тихими", из-за чего менеджер не понимал, что позиция сохранена.
          showSaveToast(true, `Позиция «${result.label || result.value}» создана и добавлена в каталог`);
        }
      }
    });

    // Баннер "у этого клиента это есть в вишлисте" (Фаза 5, 04.08.2026) — по
    // образцу individual-shipping-banner в order-edit.js. Проверяется каждый
    // раз, когда известны И клиент, И позиция (оба выбора независимы друг от
    // друга) — точечные вызовы после выбора, не на каждый ввод текста.
    const wishlistMatchBanner = document.getElementById('wishlist-match-banner');
    async function maybeCheckWishlistMatch() {
      if (!selectedClientId || !selectedReleaseId) {
        wishlistMatchBanner.classList.add('hidden');
        return;
      }
      try {
        const match = await callServer('checkClientWishlistMatch', selectedClientId, selectedReleaseId);
        if (match) {
          wishlistMatchBanner.textContent = 'У этого клиента эта позиция есть в вишлисте.';
          wishlistMatchBanner.classList.remove('hidden');
        } else {
          wishlistMatchBanner.classList.add('hidden');
        }
      } catch (error) {
        wishlistMatchBanner.classList.add('hidden');
      }
    }

    const releaseThumbnail = document.getElementById('release-thumbnail');
    function setReleaseThumbnail(imageUrl) {
      if (imageUrl) {
        releaseThumbnail.src = imageUrl;
        releaseThumbnail.classList.remove('hidden');
      } else {
        releaseThumbnail.src = '';
        releaseThumbnail.classList.add('hidden');
      }
    }
    releaseThumbnail.addEventListener('error', () => releaseThumbnail.classList.add('hidden'));

    function applyCreatedOrEditedSku(value, label) {
      releaseSearch.value = value;
      shortNameInput.value = label;
      selectedReleaseId = value;
      setReleaseThumbnail(null); // createSku/updateSku возвращают только value/label, фото подтянется при следующем поиске/открытии
      maybeCheckWishlistMatch();
    }

    // --- "Похоже на ссылку -> Распознать" (Фаза 3 интеграции Вишлист/Каталог/
    // Заказы, редизайн 04.08.2026) — отдельное постоянное поле "Ссылка на
    // покупку", поле "Выпуск" теперь чистый поиск без URL-логики.
    function looksLikeUrl(value) {
      return /^https?:\/\//i.test(value.trim());
    }

    async function performPurchaseLinkResolve(url) {
      purchaseLinkResolveBtn.disabled = true;
      try {
        const result = await callServer('resolveOrderProductLink', url);
        if (result.status === 'matched') {
          const sku = result.sku;
          releaseSearch.value = sku.original;
          shortNameInput.value = sku.shortName || sku.original;
          selectedReleaseId = sku.original;
          setReleaseThumbnail(sku.imageUrl);
          purchaseLinkHint.classList.add('hidden');
        } else {
          const resolved = result.resolved;
          purchaseLinkHint.classList.add('hidden');
          skuModal.open(
            'create', null,
            { original: resolved.title, description: resolved.description, imageUrl: resolved.imageUrl },
            { pendingLink: url }
          );
        }
      } catch (error) {
        showSaveToast(false, `Не удалось распознать ссылку: ${error.message}`);
      } finally {
        purchaseLinkResolveBtn.disabled = false;
      }
    }

    purchaseLinkInput.addEventListener('input', (e) => {
      const looksLike = looksLikeUrl(e.target.value);
      purchaseLinkHint.classList.toggle('hidden', !looksLike);
      if (looksLike) maybeGuessPurchaseChannel(e.target.value);
    });

    // Авто-подсказка "Канал выкупа" по домену ссылки (Фаза 6.2, 04.08.2026) —
    // никогда не перезаписывает уже выбранное значение.
    function maybeGuessPurchaseChannel(url) {
      const channelSelect = document.querySelector('select[data-dict="purchaseChannel"]');
      if (!channelSelect || channelSelect.value !== '') return;
      const guessed = FormHelpers.guessPurchaseChannel(url, dictionaries.purchaseChannel);
      if (guessed) channelSelect.value = guessed;
    }

    purchaseLinkResolveBtn.addEventListener('click', () => {
      const url = purchaseLinkInput.value.trim();
      if (url === '') return;
      performPurchaseLinkResolve(url);
    });

    const handleReleaseSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { releaseDropdown.classList.remove('active'); return; }

      const results = await searchReleaseStub(query);
      FormHelpers.renderDropdown(releaseDropdown, results, (item) => `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
            <div class="font-medium text-gray-800 text-sm truncate">${item.label}</div>
          </div>
          <button type="button" class="sku-edit-icon p-1 text-gray-400 hover:text-indigo-600 shrink-0" title="Редактировать позицию каталога" data-original="${escapeHtmlClient(item.value)}">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
        </div>
      `, (item, editBtn) => {
        if (editBtn) {
          releaseDropdown.classList.remove('active');
          skuModal.open('edit', editBtn.dataset.original);
          return;
        }
        releaseSearch.value = item.value;
        shortNameInput.value = item.label;
        selectedReleaseId = item.value;
        setReleaseThumbnail(item.imageUrl);
        releaseDropdown.classList.remove('active');
        maybeCheckWishlistMatch();
      });

      const addLi = document.createElement('li');
      addLi.className = 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center';
      addLi.textContent = '+ Добавить выпуск';
      addLi.addEventListener('click', () => {
        releaseDropdown.classList.remove('active');
        // Прокидываем то, что менеджер уже успел напечатать в поле "Выпуск" —
        // вместо всегда пустой формы (Фаза 3, 03.08.2026).
        skuModal.open('create', null, { original: releaseSearch.value.trim() });
      });
      releaseDropdown.appendChild(addLi);
    }, 300);

    releaseSearch.addEventListener('input', handleReleaseSearch);
    releaseSearch.addEventListener('focus', (e) => { if (e.target.value.trim().length >= 2) releaseDropdown.classList.add('active'); });

    // --- Телеграм (клиент) autocomplete + модалка ручного клиента ---
    const clientDropdown = document.getElementById('client-dropdown');

    const manualClientModal = ManualClientModal.init({
      onSaved: ({ username, name }) => {
        manualClientData = { username, name };
        selectedClientId = '';
        clientSearch.value = name !== '' ? `${name} (${username || 'без username'})` : (username || 'Без данных');
      }
    });

    const handleClientSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { clientDropdown.classList.remove('active'); return; }

      const results = await searchClientStub(query);
      FormHelpers.renderDropdown(clientDropdown, results, (item) => `
        <div class="font-medium text-gray-800 text-sm">${item.displayName}</div>
      `, (item) => {
        clientSearch.value = item.displayName;
        selectedClientId = item.telegramId;
        selectedClientUsername = item.username;
        selectedClientName = item.name;
        manualClientData = null;
        clientDropdown.classList.remove('active');
        maybeCheckWishlistMatch();
      });

      const addLi = document.createElement('li');
      addLi.className = 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center';
      addLi.textContent = '+ Ввести вручную';
      addLi.addEventListener('click', () => {
        clientDropdown.classList.remove('active');
        manualClientModal.open();
      });
      clientDropdown.appendChild(addLi);
    }, 300);

    clientSearch.addEventListener('input', handleClientSearch);
    clientSearch.addEventListener('focus', (e) => { if (e.target.value.trim().length >= 2) clientDropdown.classList.add('active'); });

    // { signal } — снимается роутером перед монтированием следующего экрана.
    document.addEventListener('click', (e) => {
      if (!releaseSearch.contains(e.target) && !releaseDropdown.contains(e.target)) {
        releaseDropdown.classList.remove('active');
      }
      if (!clientSearch.contains(e.target) && !clientDropdown.contains(e.target)) {
        clientDropdown.classList.remove('active');
      }
    }, { signal });

    // --- "Несколько сразу" (13.08.2026, bulk order creation) ---
    // Общие поля формы (Выпуск/Доставка/Статус/Канал/Аккаунт/Карго/Дата/
    // Валюта+курс/Комиссия %) используются как есть для КАЖДОЙ строки; поле
    // "Телеграм" превращается в список строк "клиент + сумма". "Оплачена ли
    // бронь?"/"Основная оплата"/"Уже получено при оформлении" в этом режиме
    // НЕ показываются и НЕ отправляются (см. Implementation Plan, 13.08.2026) —
    // каждый созданный заказ стартует с чистого "Нет"/пусто по этим полям,
    // менеджер донастраивает их индивидуально на экране редактирования, если
    // нужно (тот же принцип, что и явное требование VASY не копировать флаг
    // брони при дублировании — здесь применено единообразно ко всей пачке).
    let bulkMode = false;
    let bulkRows = []; // { id, rowEl, searchEl, dropdownEl, amountEl, sumEl, telegramId, username, name, manualClientData }
    let bulkRowSeq = 0;

    const bulkModeToggle = document.getElementById('bulk-mode-toggle');
    const bulkModeBanner = document.getElementById('bulk-mode-banner');
    const singleClientRow = document.getElementById('single-client-row');
    const bulkRowsSection = document.getElementById('bulk-rows-section');
    const bulkRowsList = document.getElementById('bulk-rows-list');
    const amountSectionLabel = document.getElementById('amount-section-label');
    const totalPaymentSection = document.getElementById('total-payment-section');
    const mainAmountReceivedSection = document.getElementById('main-amount-received-section');
    const bookingPaidRow = document.getElementById('booking-paid-toggle').closest('.field-row');

    function bulkAmountRub(rawAmount) {
      const amountVal = parseFloat(rawAmount) || 0;
      return amountVal * currentRate;
    }

    function recalcBulkRowSum(row) {
      const amountRub = bulkAmountRub(row.amountEl.value);
      const percent = parseFloat(feePercentInput.value) || 0;
      const feeRub = amountRub * (percent / 100);
      const mainSum = amountRub + feeRub;
      row.sumEl.textContent = mainSum > 0 ? `${mainSum.toFixed(2)} ₽` : '—';
    }

    function recalcAllBulkRows() {
      bulkRows.forEach(recalcBulkRowSum);
    }

    function updateBulkDuplicateWarnings() {
      const idsSeen = {};
      bulkRows.forEach((row) => {
        if (row.telegramId) idsSeen[row.telegramId] = (idsSeen[row.telegramId] || 0) + 1;
      });
      bulkRows.forEach((row) => {
        const warnEl = row.rowEl.querySelector('.bulk-dup-warning');
        const isDup = row.telegramId && idsSeen[row.telegramId] > 1;
        warnEl.classList.toggle('hidden', !isDup);
      });
    }

    function removeBulkRow(id) {
      const idx = bulkRows.findIndex((r) => r.id === id);
      if (idx === -1) return;
      bulkRows[idx].rowEl.remove();
      bulkRows.splice(idx, 1);
      updateBulkDuplicateWarnings();
    }

    function addBulkRow(prefill) {
      const id = ++bulkRowSeq;
      const rowEl = document.createElement('div');
      rowEl.className = 'bulk-row bg-gray-50 rounded-xl p-2';
      rowEl.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="flex-1 relative">
            <input type="text" class="bulk-client-search w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Поиск клиента..." autocomplete="off">
            <ul class="bulk-client-dropdown dropdown-menu custom-scrollbar"></ul>
          </div>
          <input type="number" class="bulk-amount-input w-20 bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="Сумма" step="0.01">
          <span class="bulk-main-sum text-[11px] text-gray-500 w-16 text-right shrink-0">—</span>
          <button type="button" class="bulk-remove-row p-1 text-gray-300 hover:text-red-500 shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <div class="bulk-dup-warning hidden text-[11px] text-amber-600 mt-1">Этот клиент уже есть в списке выше.</div>
      `;
      bulkRowsList.appendChild(rowEl);
      if (window.lucide) window.lucide.createIcons();

      const row = {
        id, rowEl,
        searchEl: rowEl.querySelector('.bulk-client-search'),
        dropdownEl: rowEl.querySelector('.bulk-client-dropdown'),
        amountEl: rowEl.querySelector('.bulk-amount-input'),
        sumEl: rowEl.querySelector('.bulk-main-sum'),
        telegramId: '', username: '', name: '', manualClientData: null
      };
      bulkRows.push(row);

      if (prefill) {
        if (prefill.amount !== undefined) row.amountEl.value = prefill.amount;
        if (prefill.telegramId) {
          row.telegramId = prefill.telegramId;
          row.username = prefill.username || '';
          row.name = prefill.name || '';
          row.searchEl.value = prefill.name && prefill.username ? `${prefill.name} (${prefill.username})` : (prefill.name || prefill.username || 'Клиент');
        }
      }
      recalcBulkRowSum(row);

      const handleSearch = debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) { row.dropdownEl.classList.remove('active'); return; }
        const results = await searchClientStub(query);
        FormHelpers.renderDropdown(row.dropdownEl, results, (item) => `
          <div class="font-medium text-gray-800 text-sm">${item.displayName}</div>
        `, (item) => {
          row.searchEl.value = item.displayName;
          row.telegramId = item.telegramId;
          row.username = item.username;
          row.name = item.name;
          row.manualClientData = null;
          row.dropdownEl.classList.remove('active');
          updateBulkDuplicateWarnings();
        });
        row.dropdownEl.appendChild(Object.assign(document.createElement('li'), {
          className: 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center',
          textContent: '+ Ввести вручную'
        })).addEventListener('click', () => {
          row.dropdownEl.classList.remove('active');
          const manualModal = ManualClientModal.init({
            onSaved: ({ username, name }) => {
              row.manualClientData = { username, name };
              row.telegramId = '';
              row.username = username;
              row.name = name;
              row.searchEl.value = name !== '' ? `${name} (${username || 'без username'})` : (username || 'Без данных');
              updateBulkDuplicateWarnings();
            }
          });
          manualModal.open();
        });
      }, 300);
      row.searchEl.addEventListener('input', handleSearch);
      row.searchEl.addEventListener('focus', () => { if (row.searchEl.value.trim().length >= 2) row.dropdownEl.classList.add('active'); });
      row.amountEl.addEventListener('input', () => recalcBulkRowSum(row));
      rowEl.querySelector('.bulk-remove-row').addEventListener('click', () => removeBulkRow(id));

      return row;
    }

    function setBulkMode(enabled) {
      bulkMode = enabled;
      bulkModeToggle.dataset.value = enabled ? '1' : '0';
      bulkModeToggle.classList.toggle('bg-indigo-600', enabled);
      bulkModeToggle.classList.toggle('bg-gray-200', !enabled);
      bulkModeToggle.querySelector('span').style.transform = enabled ? 'translateX(20px)' : '';

      singleClientRow.classList.toggle('hidden', enabled);
      bulkRowsSection.classList.toggle('hidden', !enabled);
      totalPaymentSection.classList.toggle('hidden', enabled);
      mainAmountReceivedSection.classList.toggle('hidden', enabled);
      bookingPaidRow.classList.toggle('hidden', enabled);
      amountSectionLabel.textContent = enabled ? 'Сумма по умолчанию' : 'Количество';
      bulkModeBanner.classList.toggle('hidden', !enabled);
      bulkModeBanner.textContent = 'Каждая строка ниже станет отдельным заказом. «Оплачена ли бронь?»/«Основная оплата»/«Уже получено» здесь не задаются — донастройте их индивидуально после создания, если нужно.';

      if (enabled && bulkRows.length === 0) addBulkRow();
    }

    bulkModeToggle.addEventListener('click', () => setBulkMode(!bulkMode));

    document.getElementById('bulk-add-row-btn').addEventListener('click', () => addBulkRow({ amount: amountInput.value }));

    document.getElementById('bulk-copy-amount-btn').addEventListener('click', () => {
      bulkRows.forEach((row) => { row.amountEl.value = amountInput.value; recalcBulkRowSum(row); });
    });

    document.getElementById('bulk-from-wishlist-btn').addEventListener('click', async () => {
      const releaseKey = (selectedReleaseId || releaseSearch.value || '').trim();
      if (!releaseKey) {
        showSaveToast(false, 'Сначала выберите «Выпуск» — по нему ищем список ожидания');
        return;
      }
      try {
        const result = await callServer('getWishlistDemand');
        const match = (result.demand || []).find((d) => d.skuOriginal.toLowerCase() === releaseKey.toLowerCase());
        if (!match || match.clients.length === 0) {
          showSaveToast(false, 'Для этой позиции нет клиентов в списке ожидания');
          return;
        }
        const existingIds = new Set(bulkRows.map((r) => r.telegramId).filter(Boolean));
        let added = 0;
        match.clients.forEach((c) => {
          if (c.telegramId && existingIds.has(c.telegramId)) return;
          addBulkRow({ telegramId: c.telegramId, username: c.username, name: c.name, amount: amountInput.value });
          if (c.telegramId) existingIds.add(c.telegramId);
          added += 1;
        });
        updateBulkDuplicateWarnings();
        showSaveToast(true, added > 0 ? `Добавлено клиентов: ${added}` : 'Все клиенты уже добавлены');
      } catch (error) {
        showSaveToast(false, `Не удалось загрузить список ожидания: ${error.message}`);
      }
    });

    // --- Расчёт суммы в рублях и комиссии (треугольник Сумма/Комиссия/Итог) ---
    function getAmountRub() {
      const amountUsd = parseFloat(amountInput.value) || 0;
      return amountUsd * currentRate;
    }

    function updateTotalPayment() {
      if (document.activeElement === totalPaymentInput) return;
      const amountRub = getAmountRub();
      const feeRub = parseFloat(feeRubInput.value) || 0;
      const total = amountRub + feeRub;
      totalPaymentInput.value = total > 0 ? total.toFixed(2) : '';
    }

    function updateCalc() {
      const amount = parseFloat(amountInput.value) || 0;
      const result = amount * currentRate;
      calculatedRub.textContent = new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(result);
      updateTotalPayment();
    }

    function updateFeeRub() {
      const amountRub = getAmountRub();
      const percent = parseFloat(feePercentInput.value) || 0;
      const rubFee = amountRub * (percent / 100);
      if (document.activeElement !== feeRubInput) {
        feeRubInput.value = rubFee > 0 ? rubFee.toFixed(2) : '';
      }
      updateTotalPayment();
    }

    function updateFeePercent() {
      const amountRub = getAmountRub();
      const rubFee = parseFloat(feeRubInput.value) || 0;

      if (amountRub > 0) {
        const percent = (rubFee / amountRub) * 100;
        if (document.activeElement !== feePercentInput) {
          feePercentInput.value = percent > 0 ? percent.toFixed(2) : '';
        }
      } else if (document.activeElement !== feePercentInput) {
        feePercentInput.value = '';
      }
      updateTotalPayment();
    }

    function updateFromTotalPayment() {
      const amountRub = getAmountRub();
      const rawTotal = parseFloat(totalPaymentInput.value) || 0;

      const feeRub = rawTotal - amountRub;
      feeRubInput.value = feeRub > 0 ? feeRub.toFixed(2) : '';

      if (amountRub > 0) {
        const percent = feeRub > 0 ? (feeRub / amountRub) * 100 : 0;
        feePercentInput.value = percent > 0 ? percent.toFixed(2) : '';
      } else {
        feePercentInput.value = '';
      }
    }

    function clampTotalPaymentOnBlur() {
      const amountRub = getAmountRub();
      const rawTotal = parseFloat(totalPaymentInput.value) || 0;
      const clampedTotal = Math.max(rawTotal, amountRub);
      totalPaymentInput.value = clampedTotal > 0 ? clampedTotal.toFixed(2) : '';
      updateFromTotalPayment();
    }

    amountInput.addEventListener('input', () => { updateCalc(); updateFeeRub(); recalcAllBulkRows(); });
    feePercentInput.addEventListener('input', () => { updateFeeRub(); recalcAllBulkRows(); });
    feeRubInput.addEventListener('input', updateFeePercent);
    totalPaymentInput.addEventListener('input', updateFromTotalPayment);
    totalPaymentInput.addEventListener('blur', clampTotalPaymentOnBlur);

    function applyCurrentCurrencyRate() {
      const rawRate = currentRates[currentCurrency];
      if (rawRate === undefined || rawRate === "") return;

      currentRate = parseFloat(rawRate.toString().replace(',', '.'));
      if (isNaN(currentRate)) return;

      rateDisplay.textContent = currentRate.toFixed(2);
      updateCalc();
      updateFeeRub();
      recalcAllBulkRows();
    }

    async function refreshRate() {
      const icon = refreshRateBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');

      const finalRates = await getExchangeRatesStub();
      if (finalRates) {
        currentRates = finalRates;
        applyCurrentCurrencyRate();
      }

      if (icon) icon.classList.remove('animate-spin');
    }

    const currencySelect = document.getElementById('currency-select');
    currencySelect.addEventListener('change', (e) => {
      currentCurrency = e.target.value;
      applyCurrentCurrencyRate();
    });

    refreshRateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      refreshRate();
    });

    // --- Сохранение заказа ---
    // Раньше здесь была clearFormAfterSave() (сброс полей, экран оставался
    // открытым для следующего заказа) — по запросу VASY (12.08.2026) заменено
    // на закрытие экрана (navigateTo('orders')) сразу после успешного
    // сохранения, функция стала не нужна, убрана.

    const saveOrderBtn = document.getElementById('save-order-btn');

    // ИСПРАВЛЕНО (13.08.2026, реальный инцидент — заказы задублировались в
    // проде): createOrder/createOrdersBatch делают много последовательных
    // Sheets API запросов, сохранение батча заметно небыстрое, а кнопка
    // раньше оставалась активной и не давала никакой видимой обратной связи
    // во время ожидания — VASY кликал повторно, думая что не сработало,
    // каждый клик заново создавал всю пачку. Теперь кнопка блокируется на
    // всё время запроса + крутится иконка, разблокируется в finally
    // независимо от исхода.
    saveOrderBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (saveOrderBtn.disabled) return;

      if (!releaseSearch.value.trim()) {
        showSaveToast(false, 'Не получилось сохранить заказ: не заполнено поле «Выпуск»');
        return;
      }

      saveOrderBtn.disabled = true;
      saveOrderBtn.classList.add('opacity-50', 'cursor-not-allowed');
      const icon = saveOrderBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');

      try {
        if (bulkMode) {
          const { results } = await saveBulkOrders();
          const okCount = results.filter((r) => r.success).length;
          const failCount = results.length - okCount;
          if (failCount === 0) {
            showSaveToast(true, `Создано заказов: ${okCount}`);
          } else {
            // Частичный успех (см. личную память Architect'а про
            // createOrdersBatch) — успевшие строки НЕ откатываются, менеджер
            // видит явно, сколько прошло и сколько нет, чтобы решить, что
            // делать с оставшимися вручную.
            showSaveToast(false, `Создано: ${okCount}, не удалось: ${failCount} — проверьте список заказов`);
            setTimeout(() => {
              const firstError = results.find((r) => !r.success);
              if (firstError) showSaveToast(false, `Пример ошибки: ${firstError.error}`);
            }, 4300);
          }
          navigateTo('orders');
          return;
        }

        const result = await saveOrder();
        showSaveToast(true, `Сохранено (Заказ ID: ${result.orderId})`);
        if (result.notifyWarning) {
          setTimeout(() => showSaveToast(false, result.notifyWarning), 4300);
        }
        if (result.mainAmountPaymentFailed) {
          // Хуже, чем earmarkFailed — сама запись платежа не удалась, деньги
          // клиента НИГДЕ не учтены (money-gate Review, 12.08.2026, находка №1).
          // Записать вручную — экран "Оплаты", "Записать платёж".
          setTimeout(() => showSaveToast(false, 'Сумма «уже получено при оформлении» НЕ записана из-за сбоя — запишите платёж вручную на экране «Оплаты»'), 4300);
        } else if (result.mainAmountEarmarkFailed) {
          // Деньги реально записаны в пул клиента (не потеряны) — просто не
          // закреплены за этим конкретным заказом (нет ещё известной цели, или
          // транзиентный сбой). Закрепить вручную — экран "Оплаты", кнопка «Закрепить».
          setTimeout(() => showSaveToast(false, 'Сумма записана в общий пул клиента, но не закреплена за этим заказом — закрепите вручную на экране «Оплаты»'), 4300);
        }
        // По запросу VASY (12.08.2026) — закрывать экран после сохранения,
        // не оставаться на форме. save-toast — элемент общей оболочки
        // (router.js), не самого экрана, переживает навигацию, поэтому
        // отложенные предупреждения выше всё равно успеют показаться.
        navigateTo('orders');
      } catch (error) {
        showSaveToast(false, bulkMode ? `Не получилось создать заказы: ${error.message}` : `Не получилось сохранить заказ: ${error.message}`);
      } finally {
        // navigateTo() выше при успехе уже сменил экран (AbortController
        // роутера убьёт этот render() целиком) — сброс здесь безвреден в
        // любом случае, страхует именно ветку ошибки, где форма остаётся.
        saveOrderBtn.disabled = false;
        saveOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        if (icon) icon.classList.remove('animate-spin');
      }
    });

    // Предзаполнение из "Спрос клиентов" (Фаза 5, 04.08.2026) — до этого
    // params полностью игнорировались. Клиент/позиция — независимые блоки,
    // каждый заполняется, только если соответствующие данные переданы.
    if (params && params.telegramId) {
      selectedClientId = params.telegramId;
      selectedClientUsername = params.username || '';
      selectedClientName = params.name || '';
      clientSearch.value = selectedClientName && selectedClientUsername
        ? `${selectedClientName} (${selectedClientUsername})`
        : (selectedClientName || selectedClientUsername || 'Клиент');
    }
    if (params && params.skuOriginal) {
      releaseSearch.value = params.skuOriginal;
      shortNameInput.value = params.productDisplay || params.skuOriginal;
      selectedReleaseId = params.skuOriginal;
    } else if (params && params.productOriginal) {
      releaseSearch.value = params.productOriginal;
    }
    if (params && params.wishlistId) {
      prefillWishlistId = params.wishlistId;
    }

    // Кнопка "Дублировать" на экране редактирования заказа (13.08.2026,
    // bulk order creation) — открывает этот экран в режиме "Несколько сразу"
    // с 1 предзаполненной пустой строкой. НЕ копируются: клиент, примечание
    // (уже не копируются по общей задумке дублирования) И "Оплачена ли
    // бронь?" (явное требование VASY, 12.08.2026 — новый заказ всегда
    // стартует с этим флагом сброшенным, ставится вручную) — оба и так
    // отсутствуют в setBulkMode-режиме, отдельно исключать нечего.
    // ИСПРАВЛЕНО (13.08.2026, реальный баг репорта VASY — позиция не
    // копировалась): navigateTo/matchRoute (admin/router.js) сериализуют
    // params ТОЛЬКО как плоскую query-строку (buildQueryString по своему
    // же комментарию рассчитан на плоский объект) — вложенный объект
    // duplicateFrom превращался в бесполезную строку "[object Object]" при
    // прогоне через encodeURIComponent, все поля терялись молча. Теперь —
    // плоские top-level ключи с префиксом dup*, как и остальные params здесь.
    if (params && params.dupMode) {
      if (params.dupProductOriginal) { releaseSearch.value = params.dupProductOriginal; selectedReleaseId = params.dupProductOriginal; }
      if (params.dupStatusDelivery) document.querySelector('select[data-dict="statusDelivery"]').value = params.dupStatusDelivery;
      if (params.dupStatusOrder) document.querySelector('select[data-dict="statusOrder"]').value = params.dupStatusOrder;
      if (params.dupPurchaseChannel) document.querySelector('select[data-dict="purchaseChannel"]').value = params.dupPurchaseChannel;
      if (params.dupPurchaseAccount) document.querySelector('select[data-dict="purchaseAccount"]').value = params.dupPurchaseAccount;
      if (params.dupCargo) document.querySelector('select[data-dict="cargo"]').value = params.dupCargo;
      if (params.dupDateOrder) dateInput.value = params.dupDateOrder;
      if (params.dupCurrency) { document.getElementById('currency-select').value = params.dupCurrency; currentCurrency = params.dupCurrency; }
      if (params.dupAmount) amountInput.value = params.dupAmount;
      if (params.dupFeePercent) feePercentInput.value = params.dupFeePercent;
      setBulkMode(true);
      updateDeliveryLadderPreview();
    }

    if (params && (params.telegramId || params.skuOriginal)) {
      maybeCheckWishlistMatch();
    }

    refreshRate();
  }
};
