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
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Новый заказ</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <label class="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
        <input type="checkbox" id="notify-client-checkbox" class="w-4 h-4 accent-indigo-600 cursor-pointer">
        Уведомить
      </label>
      <button id="save-order-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
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
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="box" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Выпуск</span>
            </div>
            <div class="flex-1 w-full relative">
              <div class="flex items-center w-full">
                <input type="text" id="release-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400 py-1" placeholder="Поиск выпуска или вставьте ссылку" autocomplete="off">
                <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute right-0"></i>
              </div>
              <ul id="release-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              <div id="release-url-hint" class="hidden mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-800 flex items-center justify-between gap-2">
                <span>Похоже на ссылку на товар</span>
                <button type="button" id="release-url-resolve-btn" class="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium">Распознать</button>
              </div>
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

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 relative">
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

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Количество</span>
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
                  <button id="refresh-rate" class="hover:text-indigo-600 transition-colors">
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
              <div class="flex items-center gap-1 shrink-0 ml-auto" id="booking-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 gap-2 sm:gap-4 bg-[#f8fafc] rounded-b-2xl">
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
              <div class="flex items-center gap-1 shrink-0" id="main-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
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
    let amountInput, feePercentInput, feeRubInput, totalPaymentInput, calculatedRub, rateDisplay, refreshRateBtn, dateInput;
    let currentCurrency = 'Доллар';
    let currentRates = {};
    let currentRate = 0;
    // Ссылка на источник покупки, вставленная/распознанная в поле "Выпуск"
    // (Фаза 3 интеграции Вишлист/Каталог/Заказы, 03.08.2026) — попадает в
    // orderData.purchaseLink независимо от того, совпала ли она сразу с уже
    // привязанной позицией каталога, или потребовалось создать новую через
    // SkuModal (см. skuModal.init ниже, context.pendingLink).
    let pendingPurchaseLink = '';

    function searchReleaseStub(query) { return callServer('searchSku', query); }
    function searchClientStub(query) { return callServer('searchClient', query); }
    function getExchangeRatesStub() {
      return callServer('refreshRate').then(rates => rates.finalRates || null);
    }

    async function saveOrder() {
      const client = manualClientData
        ? { telegramId: '', username: manualClientData.username, name: manualClientData.name }
        : { telegramId: selectedClientId || '', username: selectedClientUsername, name: selectedClientName };
      const orderData = {
        remark: noteInput.value,
        productOriginal: releaseSearch.value,
        statusDelivery: document.querySelector('select[data-dict="statusDelivery"]').value,
        statusOrder: document.querySelector('select[data-dict="statusOrder"]').value,
        purchaseChannel: document.querySelector('select[data-dict="purchaseChannel"]').value,
        purchaseAccount: document.querySelector('select[data-dict="purchaseAccount"]').value,
        cargo: document.querySelector('select[data-dict="cargo"]').value,
        dateOrder: dateInput.value,
        client: client,
        currency: currencyCurrencyValue(),
        amount: amountInput.value,
        bookingSum: feeRubInput.value,
        bookingPaid: document.getElementById('booking-paid-toggle').dataset.value,
        mainSum: totalPaymentInput.value,
        mainPaid: document.getElementById('main-paid-toggle').dataset.value,
        notifyClient: document.getElementById('notify-client-checkbox').checked,
        purchaseLink: pendingPurchaseLink
      };
      return callServer('createOrder', orderData);
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
    calculatedRub = document.getElementById('calculated-rub');
    rateDisplay = document.getElementById('rate-display');
    refreshRateBtn = document.getElementById('refresh-rate');
    dateInput = document.getElementById('date-input');

    const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_CONFIG.TIMEZONE });
    dateInput.value = todayFormatter.format(new Date());

    FormHelpers.populateSelect('select[data-dict="statusDelivery"]', dictionaries.statusDelivery);
    FormHelpers.populateSelect('select[data-dict="statusOrder"]', dictionaries.statusOrder);
    FormHelpers.populateSelect('select[data-dict="purchaseChannel"]', dictionaries.purchaseChannel);
    FormHelpers.populateSelect('select[data-dict="purchaseAccount"]', dictionaries.purchaseAccount);
    FormHelpers.populateSelect('select[data-dict="cargo"]', dictionaries.cargo);

    FormHelpers.initTagToggle('booking-paid-toggle');
    FormHelpers.initTagToggle('main-paid-toggle');

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
          // Ссылка, вставленная в поле "Выпуск" и не найденная в каталоге
          // (Фаза 3, 03.08.2026, resolveOrderProductLink status:'unmatched') —
          // после создания новой позиции через модалку она должна попасть в
          // orderData.purchaseLink точно так же, как при мгновенном совпадении.
          if (context && context.pendingLink) {
            pendingPurchaseLink = context.pendingLink;
          }
        }
      }
    });

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
    }

    // --- "Похоже на ссылку -> Распознать" (Фаза 3 интеграции Вишлист/Каталог/
    // Заказы, 03.08.2026) — тот же UX-паттерн, что уже есть в client/screens/
    // wishlist.js для поля добавления в вишлист.
    function looksLikeReleaseUrl(value) {
      return /^https?:\/\//i.test(value.trim());
    }

    const releaseUrlHint = document.getElementById('release-url-hint');
    const releaseUrlResolveBtn = document.getElementById('release-url-resolve-btn');

    async function performReleaseLinkResolve(url) {
      releaseUrlResolveBtn.disabled = true;
      try {
        const result = await callServer('resolveOrderProductLink', url);
        if (result.status === 'matched') {
          const sku = result.sku;
          releaseSearch.value = sku.original;
          shortNameInput.value = sku.shortName || sku.original;
          selectedReleaseId = sku.original;
          setReleaseThumbnail(sku.imageUrl);
          pendingPurchaseLink = url;
          releaseUrlHint.classList.add('hidden');
        } else {
          const resolved = result.resolved;
          releaseUrlHint.classList.add('hidden');
          skuModal.open(
            'create', null,
            { original: resolved.title, description: resolved.description, imageUrl: resolved.imageUrl },
            { pendingLink: url }
          );
        }
      } catch (error) {
        showSaveToast(false, `Не удалось распознать ссылку: ${error.message}`);
      } finally {
        releaseUrlResolveBtn.disabled = false;
      }
    }

    releaseUrlResolveBtn.addEventListener('click', () => {
      const url = releaseSearch.value.trim();
      if (url === '') return;
      performReleaseLinkResolve(url);
    });

    releaseSearch.addEventListener('input', (e) => {
      releaseUrlHint.classList.toggle('hidden', !looksLikeReleaseUrl(e.target.value));
    });

    const handleReleaseSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      // Похоже на ссылку — обычный текстовый поиск по каталогу бессмысленен,
      // распознавание запускается отдельно кнопкой в release-url-hint.
      if (looksLikeReleaseUrl(query)) { releaseDropdown.classList.remove('active'); return; }
      if (query.length < 2) { releaseDropdown.classList.remove('active'); return; }

      const results = await searchReleaseStub(query);
      FormHelpers.renderDropdown(releaseDropdown, results, (item) => `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
            <div class="font-medium text-gray-800 text-sm truncate">${item.label}</div>
          </div>
          <button type="button" class="sku-edit-icon p-1 text-gray-400 hover:text-indigo-600 shrink-0" data-original="${escapeHtmlClient(item.value)}">
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
        // Обычный выбор позиции из поиска по названию — не связан со
        // ссылкой, вставленной ранее в это же поле (если была).
        pendingPurchaseLink = '';
        releaseUrlHint.classList.add('hidden');
        releaseDropdown.classList.remove('active');
      });

      const addLi = document.createElement('li');
      addLi.className = 'p-3 cursor-pointer hover:bg-indigo-50 transition-colors text-indigo-600 font-medium text-sm text-center';
      addLi.textContent = '+ Добавить выпуск';
      addLi.addEventListener('click', () => {
        releaseDropdown.classList.remove('active');
        // Ручное добавление без распознавания ссылки — сбрасываем ранее
        // накопленную pendingPurchaseLink (если менеджер сначала пробовал
        // распознать другую ссылку, затем передумал и жмёт "+ Добавить").
        pendingPurchaseLink = '';
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

    amountInput.addEventListener('input', () => { updateCalc(); updateFeeRub(); });
    feePercentInput.addEventListener('input', updateFeeRub);
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
    function clearFormAfterSave() {
      noteInput.value = '';
      noteCounter.textContent = '0/300';
      releaseSearch.value = '';
      shortNameInput.value = '';
      selectedReleaseId = null;
      setReleaseThumbnail(null);
      pendingPurchaseLink = '';
      releaseUrlHint.classList.add('hidden');
      clientSearch.value = '';
      selectedClientId = null;
      selectedClientUsername = '';
      selectedClientName = '';
      manualClientData = null;
      amountInput.value = '';
      feePercentInput.value = '';
      feeRubInput.value = '';
      totalPaymentInput.value = '';
      calculatedRub.textContent = '0.00';
      document.getElementById('currency-select').value = 'Доллар';
      currentCurrency = 'Доллар';
      applyCurrentCurrencyRate();
      document.getElementById('notify-client-checkbox').checked = false;

      ['booking-paid-toggle', 'main-paid-toggle'].forEach(id => FormHelpers.setTagToggle(id, 'Нет'));
    }

    document.getElementById('save-order-btn').addEventListener('click', async (e) => {
      e.preventDefault();

      if (!releaseSearch.value.trim()) {
        showSaveToast(false, 'Не получилось сохранить заказ: не заполнено поле «Выпуск»');
        return;
      }

      try {
        const result = await saveOrder();
        showSaveToast(true, `Сохранено (Заказ ID: ${result.orderId})`);
        if (result.notifyWarning) {
          setTimeout(() => showSaveToast(false, result.notifyWarning), 4300);
        }
        clearFormAfterSave();
      } catch (error) {
        showSaveToast(false, `Не получилось сохранить заказ: ${error.message}`);
      }
    });

    refreshRate();
  }
};
