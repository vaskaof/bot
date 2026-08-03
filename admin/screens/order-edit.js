'use strict';

/**
 * Экран "Редактирование заказа" — перенесён из admin/edit-order.html
 * (SPA админки, 02.08.2026, God-файл №2). Маршрут `orders/<id>/edit`
 * (см. router.js matchRoute) — orderId приходит из params, а не из
 * URLSearchParams(location.search). Треугольник комиссии здесь считает
 * amountRubBase из УЖЕ сохранённых сумм заказа (mainSum - bookingSum),
 * а не через live-курс с сервера — решение 6 из исходного файла: открытие
 * формы редактирования не должно переписывать историю сделки свежим курсом.
 * SKU-модалка/модалка ручного клиента/populateSelect-хелперы — общие
 * модули (_sku-modal.js/_manual-client-modal.js/_form-helpers.js),
 * идентичные тем, что использует order-new.js.
 */
window.Screens = window.Screens || {};
window.Screens.orderEdit = {
  render(root, dictionaries, params, signal) {
    const currentOrderId = params.orderId || null;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors shrink-0">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <div class="flex flex-col items-center ml-2 min-w-0">
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight">Редактирование</h1>
        <span class="text-[11px] text-gray-400" id="order-id-display"></span>
      </div>
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
      <div id="order-not-found-screen" class="hidden fixed inset-0 bg-[#f3f4f9] items-center justify-center z-50 px-6">
        <div class="text-center">
          <p class="text-gray-500 text-sm mb-3">Заказ не найден.</p>
          <button type="button" id="back-to-orders-btn" class="text-indigo-600 text-sm font-medium">← Вернуться к списку заказов</button>
        </div>
      </div>

      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="individual-shipping-banner" class="hidden mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"></div>
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
              <input type="text" id="short-name-input" class="w-full bg-transparent border-none outline-none text-[15px] text-gray-500 py-1" readonly placeholder="Определяется автоматически из каталога">
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
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer text-gray-800" data-dict="statusOrder"></select>
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

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i data-lucide="package-check" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Дата получения</span>
            </div>
            <div class="flex-1 w-full">
              <input type="date" id="date-received-input" class="w-full bg-transparent border-none outline-none text-[15px] py-1 text-gray-700">
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                <i data-lucide="split" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Тип доставки СДЭК</span>
            </div>
            <div class="flex-1 w-full">
              <select id="sdek-type-select" class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer">
                <option value="Коллективная">Коллективная</option>
                <option value="Индивидуальная">Индивидуальная</option>
              </select>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <i data-lucide="package-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Коллективка</span>
            </div>
            <div class="flex-1 w-full">
              <select id="collective-select" class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer">
                <option value="">— не привязано —</option>
              </select>
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
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <i data-lucide="landmark" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Курсы (штамп)</span>
            </div>
            <div class="flex-1 w-full flex items-center gap-3">
              <div class="flex-1">
                <label class="text-[10px] text-gray-400">Тенге к валюте</label>
                <input type="text" id="rate-kzt-input" class="w-full bg-transparent border-none outline-none text-[14px] text-gray-700 py-0.5">
              </div>
              <div class="flex-1">
                <label class="text-[10px] text-gray-400">Тенге к рублю</label>
                <input type="text" id="rate-rub-input" class="w-full bg-transparent border-none outline-none text-[14px] text-gray-700 py-0.5">
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-gray-50/50">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                <i data-lucide="calculator" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Итог / Доход</span>
            </div>
            <div class="flex-1 w-full flex items-center gap-4 text-sm text-gray-500">
              <span>Итог Руб: <b id="total-rub-display" class="text-gray-800">—</b></span>
              <span>Доход Руб: <b id="profit-rub-display" class="text-gray-800">—</b></span>
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

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
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

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i data-lucide="weight" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Вес</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-1">
                <input type="number" id="weight-sum-input" class="w-28 bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
              <div class="flex items-center gap-1 shrink-0" id="weight-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                <i data-lucide="plane" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Доставка КЗ→РФ</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-1">
                <input type="number" id="delivery-kzrf-sum-input" class="w-28 bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
              <div class="flex items-center gap-1 shrink-0" id="delivery-kzrf-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 gap-2 sm:gap-4 rounded-b-2xl">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <i data-lucide="truck" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Доставка по РФ</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-1">
                <input type="number" id="delivery-rf-sum-input" class="w-28 bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
              <div class="flex items-center gap-1 shrink-0" id="delivery-rf-paid-toggle" data-value="Нет">
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

    document.getElementById('back-to-orders-btn').addEventListener('click', () => navigateTo('orders'));

    if (!currentOrderId) {
      showNotFound();
      return;
    }

    // Локальное состояние формы — раньше жило на верхнем уровне <script>
    // edit-order.html, теперь обязано жить внутри render().
    let noteInput, noteCounter, releaseSearch, shortNameInput, selectedReleaseId = null;
    let clientSearch, selectedClientId = null, selectedClientUsername = '', selectedClientName = '';
    let manualClientData = null;
    let amountInput, feePercentInput, feeRubInput, totalPaymentInput;
    let dateInput, dateReceivedInput, rateKztInput, rateRubInput;
    let weightSumInput, deliveryKzRfSumInput, deliveryRfSumInput;
    let collectiveSelect, sdekTypeSelect;
    let amountRubBase = 0;
    const CONSTANTS_CLIENT = { SDEK_TYPE_COLLECTIVE: 'Коллективная' };
    // Ссылка на источник покупки, вставленная/распознанная в поле "Выпуск"
    // (Фаза 3 интеграции Вишлист/Каталог/Заказы, 03.08.2026) — см. order-new.js.
    let pendingPurchaseLink = '';

    function searchReleaseStub(query) { return callServer('searchSku', query); }
    function searchClientStub(query) { return callServer('searchClient', query); }

    async function saveOrder() {
      const client = manualClientData
        ? { telegramId: '', username: manualClientData.username, name: manualClientData.name }
        : { telegramId: selectedClientId || '', username: selectedClientUsername, name: selectedClientName };

      const fields = {
        remark: noteInput.value,
        productOriginal: releaseSearch.value,
        statusDelivery: document.querySelector('select[data-dict="statusDelivery"]').value,
        statusOrder: document.querySelector('select[data-dict="statusOrder"]').value,
        purchaseChannel: document.querySelector('select[data-dict="purchaseChannel"]').value,
        purchaseAccount: document.querySelector('select[data-dict="purchaseAccount"]').value,
        cargo: document.querySelector('select[data-dict="cargo"]').value,
        dateOrder: dateInput.value,
        dateReceived: dateReceivedInput.value,
        sdekDeliveryType: sdekTypeSelect.value,
        client: client,
        currency: document.getElementById('currency-select').value,
        amount: amountInput.value,
        rateKztToCurrency: rateKztInput.value,
        rateRubToKzt: rateRubInput.value,
        bookingSum: feeRubInput.value,
        bookingPaid: document.getElementById('booking-paid-toggle').dataset.value,
        mainSum: totalPaymentInput.value,
        mainPaid: document.getElementById('main-paid-toggle').dataset.value,
        weightSum: weightSumInput.value,
        weightPaid: document.getElementById('weight-paid-toggle').dataset.value,
        deliveryKzRfSum: deliveryKzRfSumInput.value,
        deliveryKzRfPaid: document.getElementById('delivery-kzrf-paid-toggle').dataset.value,
        deliveryRfSum: deliveryRfSumInput.value,
        deliveryRfPaid: document.getElementById('delivery-rf-paid-toggle').dataset.value,
        notifyClient: document.getElementById('notify-client-checkbox').checked,
        purchaseLink: pendingPurchaseLink
      };

      return callServer('updateOrder', currentOrderId, fields);
    }

    function showNotFound() {
      const notFound = document.getElementById('order-not-found-screen');
      notFound.classList.remove('hidden');
      notFound.classList.add('flex');
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
    dateInput = document.getElementById('date-input');
    dateReceivedInput = document.getElementById('date-received-input');
    sdekTypeSelect = document.getElementById('sdek-type-select');
    rateKztInput = document.getElementById('rate-kzt-input');
    rateRubInput = document.getElementById('rate-rub-input');
    weightSumInput = document.getElementById('weight-sum-input');
    deliveryKzRfSumInput = document.getElementById('delivery-kzrf-sum-input');
    deliveryRfSumInput = document.getElementById('delivery-rf-sum-input');
    collectiveSelect = document.getElementById('collective-select');

    FormHelpers.populateSelect('select[data-dict="statusDelivery"]', dictionaries.statusDelivery);
    FormHelpers.populateSelect('select[data-dict="statusOrder"]', dictionaries.statusOrder);
    FormHelpers.populateSelect('select[data-dict="purchaseChannel"]', dictionaries.purchaseChannel);
    FormHelpers.populateSelect('select[data-dict="purchaseAccount"]', dictionaries.purchaseAccount);
    FormHelpers.populateSelect('select[data-dict="cargo"]', dictionaries.cargo);

    ['booking-paid-toggle', 'main-paid-toggle', 'weight-paid-toggle', 'delivery-kzrf-paid-toggle', 'delivery-rf-paid-toggle']
      .forEach(id => FormHelpers.initTagToggle(id));

    noteInput.addEventListener('input', (e) => {
      noteCounter.textContent = `${e.target.value.length}/300`;
    });

    // --- Выпуск (autocomplete) + SKU-модалка ---
    const releaseDropdown = document.getElementById('release-dropdown');

    const skuModal = SkuModal.init({
      onSaved: (result, action, context) => {
        // Только режим create автозаполняет форму заказа новой позицией —
        // правка каталога (update/merge) форму заказа НЕ трогает (см. исходный
        // edit-order.html: applyCreatedOrEditedSku проверяла skuModalMode).
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
    // wishlist.js и order-new.js.
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
        // накопленную pendingPurchaseLink (см. order-new.js).
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

    document.addEventListener('click', (e) => {
      if (!releaseSearch.contains(e.target) && !releaseDropdown.contains(e.target)) {
        releaseDropdown.classList.remove('active');
      }
      if (!clientSearch.contains(e.target) && !clientDropdown.contains(e.target)) {
        clientDropdown.classList.remove('active');
      }
    }, { signal });

    // --- Коллективка — выпадающий список, назначение сразу при выборе ---
    async function populateCollectiveSelect() {
      try {
        const list = await callServer('getCollectivesList');
        const options = list.map(c => {
          const trackPart = c.trackNumber ? ` (${c.trackNumber})` : '';
          return `<option value="${c.collectiveId}">${c.collectiveId}${trackPart} — ${c.status}</option>`;
        }).join('');
        collectiveSelect.innerHTML = '<option value="">— не привязано —</option>' + options;
      } catch (error) {
        // Список коллективок не критичен для остальной формы — тихо игнорируем
      }
    }

    collectiveSelect.addEventListener('change', async () => {
      const newId = collectiveSelect.value;
      try {
        if (newId === '') {
          await callServer('unassignOrderFromCollective', currentOrderId);
          showSaveToast(true, 'Заказ отвязан от коллективки');
        } else {
          await callServer('assignOrderToCollective', currentOrderId, newId);
          showSaveToast(true, 'Заказ привязан к коллективке');
        }
      } catch (error) {
        showSaveToast(false, `Не удалось изменить коллективку: ${error.message}`);
      }
    });

    // --- Треугольник Комиссия % / Комиссия ₽ / Основная оплата — база
    // amountRubBase считается из УЖЕ сохранённых сумм заказа (см. loadOrder),
    // а не через live-курс — открытие формы не должно переписывать историю
    // сделки свежим рыночным курсом (решение 6).
    function updateTotalPayment() {
      if (document.activeElement === totalPaymentInput) return;
      const total = amountRubBase + (parseFloat(feeRubInput.value) || 0);
      totalPaymentInput.value = total > 0 ? total.toFixed(2) : '';
    }
    function updateFeeRub() {
      if (document.activeElement === feeRubInput) { updateTotalPayment(); return; }
      const percent = parseFloat(feePercentInput.value) || 0;
      const rubFee = amountRubBase * (percent / 100);
      feeRubInput.value = rubFee > 0 ? rubFee.toFixed(2) : '';
      updateTotalPayment();
    }
    function updateFeePercent() {
      if (document.activeElement === feePercentInput) { updateTotalPayment(); return; }
      const rubFee = parseFloat(feeRubInput.value) || 0;
      feePercentInput.value = amountRubBase > 0 && rubFee > 0 ? ((rubFee / amountRubBase) * 100).toFixed(2) : '';
      updateTotalPayment();
    }
    function updateFromTotalPayment() {
      const feeRub = (parseFloat(totalPaymentInput.value) || 0) - amountRubBase;
      feeRubInput.value = feeRub > 0 ? feeRub.toFixed(2) : '';
      feePercentInput.value = amountRubBase > 0 && feeRub > 0 ? ((feeRub / amountRubBase) * 100).toFixed(2) : '';
    }
    function clampTotalPaymentOnBlur() {
      const clamped = Math.max(parseFloat(totalPaymentInput.value) || 0, amountRubBase);
      totalPaymentInput.value = clamped > 0 ? clamped.toFixed(2) : '';
      updateFromTotalPayment();
    }

    feePercentInput.addEventListener('input', updateFeeRub);
    feeRubInput.addEventListener('input', updateFeePercent);
    totalPaymentInput.addEventListener('input', updateFromTotalPayment);
    totalPaymentInput.addEventListener('blur', clampTotalPaymentOnBlur);

    // --- Загрузка данных заказа и заполнение формы ---
    async function loadOrder() {
      let details;
      try {
        details = await callServer('getOrderDetails', currentOrderId);
      } catch (error) {
        showNotFound();
        return;
      }

      document.getElementById('order-id-display').textContent = `Заказ ID: ${details.orderId}`;
      noteInput.value = details.remark;
      noteCounter.textContent = `${details.remark.length}/300`;
      releaseSearch.value = details.productOriginal;
      shortNameInput.value = details.productShort;
      selectedReleaseId = details.productOriginal;
      setReleaseThumbnail(details.imageUrl);

      document.querySelector('select[data-dict="statusDelivery"]').value = details.statusDelivery;
      document.querySelector('select[data-dict="statusOrder"]').value = details.statusOrder;
      document.querySelector('select[data-dict="purchaseChannel"]').value = details.purchaseChannel;
      document.querySelector('select[data-dict="purchaseAccount"]').value = details.purchaseAccount;
      document.querySelector('select[data-dict="cargo"]').value = details.cargo;

      dateInput.value = details.dateOrder;
      dateReceivedInput.value = details.dateReceived;

      selectedClientId = details.client.telegramId;
      selectedClientUsername = details.client.username;
      selectedClientName = details.client.name;
      clientSearch.value = details.client.name && details.client.username
        ? `${details.client.name} (${details.client.username})`
        : (details.client.name || details.client.username);

      document.getElementById('currency-select').value = details.currency || 'Доллар';
      sdekTypeSelect.value = details.sdekDeliveryType || CONSTANTS_CLIENT.SDEK_TYPE_COLLECTIVE;
      collectiveSelect.value = details.collectiveId || '';
      amountInput.value = details.amount || '';
      rateKztInput.value = details.rateKztToCurrency;
      rateRubInput.value = details.rateRubToKzt;
      document.getElementById('total-rub-display').textContent = details.totalRub !== '' ? details.totalRub : '—';
      document.getElementById('profit-rub-display').textContent = details.profitRub !== '' ? details.profitRub : '—';

      const mainSum = parseFloat(details.payments.main.sum) || 0;
      const bookingSum = parseFloat(details.payments.booking.sum) || 0;
      amountRubBase = mainSum - bookingSum;
      if (amountRubBase < 0) amountRubBase = 0;

      feeRubInput.value = bookingSum > 0 ? bookingSum.toFixed(2) : '';
      totalPaymentInput.value = mainSum > 0 ? mainSum.toFixed(2) : '';
      updateFeePercent();

      FormHelpers.setTagToggle('booking-paid-toggle', details.payments.booking.paid === 'Да' || details.payments.booking.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('main-paid-toggle', details.payments.main.paid === 'Да' || details.payments.main.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('weight-paid-toggle', details.payments.weight.paid === 'Да' || details.payments.weight.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('delivery-kzrf-paid-toggle', details.payments.deliveryKzRf.paid === 'Да' || details.payments.deliveryKzRf.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('delivery-rf-paid-toggle', details.payments.deliveryRf.paid === 'Да' || details.payments.deliveryRf.paid === 'да' ? 'Да' : 'Нет');

      weightSumInput.value = details.payments.weight.sum || '';
      deliveryKzRfSumInput.value = details.payments.deliveryKzRf.sum || '';
      deliveryRfSumInput.value = details.payments.deliveryRf.sum || '';

      if (details.client.telegramId) {
        try {
          const recs = await callServer('getShippingRecommendations');
          const match = recs.find(r => r.telegramId === details.client.telegramId);
          if (match) {
            const banner = document.getElementById('individual-shipping-banner');
            banner.textContent = `У этого клиента ${match.count} посылок едут к посреднику в КЗ — рассмотрите индивидуальную отправку.`;
            banner.classList.remove('hidden');
          }
        } catch (e) { }
      }

      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('save-order-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      if (!releaseSearch.value.trim()) {
        showSaveToast(false, 'Не получилось сохранить: не заполнено поле «Выпуск»');
        return;
      }
      try {
        const result = await saveOrder();
        showSaveToast(true, 'Изменения сохранены');
        if (result.notifyWarning) {
          setTimeout(() => showSaveToast(false, result.notifyWarning), 4300);
        }
      } catch (error) {
        showSaveToast(false, `Не получилось сохранить: ${error.message}`);
      }
    });

    populateCollectiveSelect();
    loadOrder();
  }
};
