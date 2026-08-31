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
// Черновик правки (16.08.2026, тот же UX, что у order-new.js — см. память
// project_bot_knopka_order_save_idempotency, Round 2). В ОТЛИЧИЕ от createOrder,
// updateOrder пишет в ТУ ЖЕ Sheets-строку по orderId и не создаёт вторую — риска
// задвоить заказ здесь нет, денежные под-операции внутри updateOrder уже либо
// идемпотентны по конструкции, либо используют детерминированный requestId
// (`booking-<orderId>`). Это ЧИСТО клиентское неудобство: если Telegram
// зависнет посреди сохранения правки, менеджер не узнает, применилась ли она —
// черновик нужен только чтобы не оставлять его в неведении, requestId серверу
// не передаётся (updateOrder его не принимает и не нуждается в нём).
const ORDER_EDIT_DRAFT_KEY = 'pendingOrderEditDraft';

// Списание (Э8, M8.1, D-11/F-27, 27.08.2026) — 4 статуса-причины, реальные
// литералы orders.status_order (проверены против живой БД, НЕ придуманы —
// см. память project_bot_knopka_economy_refactor_e7/backend миграции M8.1
// за ту же проверку и найденное расхождение с исходным черновиком DDL).
const WRITEOFF_REASON_STATUSES = new Set(['Не найдено', 'Заказ отменён магазином', 'Отказ клиента', 'Потеряно']);

window.Screens = window.Screens || {};
window.Screens.orderEdit = {
  render(root, dictionaries, params, signal) {
    const currentOrderId = params.orderId || null;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors shrink-0">
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
      <button id="purchase-event-btn" title="Факт выкупа" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="receipt" class="w-6 h-6"></i>
      </button>
      <button id="duplicate-order-btn" title="Дублировать заказ" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="copy" class="w-6 h-6"></i>
      </button>
      <button id="delete-order-btn" title="Удалить заказ" class="p-2 text-red-500 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="trash-2" class="w-6 h-6"></i>
      </button>
      <button id="save-order-btn" title="Сохранить изменения" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
      </button>
    `;
    // navigateBack() вместо голого history.back() (25.08.2026) — тот же
    // безопасный фолбэк на "orders", что и у "Сохранить"/"Удалить" ниже, на
    // случай прямого захода на этот экран без предшествующей навигации внутри
    // SPA (см. router.js).
    document.getElementById('back-btn').addEventListener('click', () => navigateBack('orders'));

    root.innerHTML = `
      <div id="order-not-found-screen" class="hidden fixed inset-0 bg-[#f3f4f9] items-center justify-center z-50 px-6">
        <div class="text-center">
          <p class="text-gray-500 text-sm mb-3">Заказ не найден.</p>
          <button type="button" id="back-to-orders-btn" class="text-indigo-600 text-sm font-medium">← Вернуться к списку заказов</button>
        </div>
      </div>

      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="draft-recovery-banner" class="hidden mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"></div>
        <div id="individual-shipping-banner" class="hidden mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"></div>
        <div id="wishlist-match-banner" class="hidden mb-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm"></div>
        <div id="payment-summary-card" class="hidden mb-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="text-[11px] text-gray-400">Оплачено</div>
              <div id="ps-paid" class="text-base font-semibold text-emerald-600">—</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Осталось</div>
              <div id="ps-remaining" class="text-base font-semibold text-amber-600">—</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Итого расходов</div>
              <div id="ps-total" class="text-base font-semibold text-gray-900">—</div>
            </div>
          </div>
          <div id="ps-hint" class="hidden text-[11px] text-gray-400 mt-2 text-center"></div>
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
              <select class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer text-gray-800" data-dict="statusOrder"></select>
            </div>
          </div>

          <!-- Списание (Э8, M8.1, D-11/F-27, 27.08.2026) — видно только при
               одном из 4 статусов-причин, см. WRITEOFF_REASON_STATUSES ниже. -->
          <div id="writeoff-banner" class="hidden field-row flex flex-col p-4 border-b border-gray-100 gap-2 bg-red-50/50">
            <div id="writeoff-existing-list" class="hidden text-xs text-gray-600 space-y-1"></div>
            <button type="button" id="open-writeoff-modal-btn" class="self-start px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium">
              Зафиксировать списание
            </button>
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

          <!-- Э4 рефакторинга коллективок (§3, 24.08.2026) — ДВЕ независимые
               привязки (плечо 1 «КЗ→РФ» / плечо 2 «По РФ») вместо одного
               селекта — заказ может ехать через оба этапа одновременно. -->
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <i data-lucide="package-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Коллективка КЗ→РФ</span>
            </div>
            <div class="flex-1 w-full">
              <select id="collective-select-stage1" class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer">
                <option value="">— не привязано —</option>
              </select>
            </div>
          </div>
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <i data-lucide="package-2" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Коллективка по РФ</span>
            </div>
            <div class="flex-1 w-full">
              <select id="collective-select-stage2" class="w-full bg-transparent border-none outline-none text-[15px] py-1 cursor-pointer">
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

          <!-- Личный заказ менеджера (31.08.2026, задача "Напоминания 2.0",
               Р8) — то же поле, что order-new.js добавил на создание, здесь
               для правки уже существующего (исправить историческую
               классификацию). Состояние загружается из getOrderDetails.
               isOwnPurchase (см. loadOrder), fields.isOwnPurchase уходит на
               сервер ТОЛЬКО если менеджер реально переключил галочку (см.
               saveOrder) — "не трогать, если не менял" тот же принцип, что
               остальные необязательные поля этой формы. -->
          <div class="field-row flex items-center p-4 border-b border-gray-100 gap-3">
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" id="own-purchase-checkbox" class="w-4 h-4 accent-indigo-600 cursor-pointer">
              Личный заказ (без плательщика)
            </label>
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
                  <option value="Фунт">GBP (£)</option>
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
            </div>
          </div>
          ${FormHelpers.commissionGateHtml()}

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <i data-lucide="badge-check" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Оплачена ли бронь?</span>
            </div>
            <div class="flex-1 w-full flex items-center justify-between gap-2">
              <p class="text-[11px] text-gray-400 leading-tight max-w-[220px]">Клиент оплатил комиссию как бронь? Отметьте «Да», если клиент уже перевёл бронь/комиссию за посредничество отдельно, до того как известна итоговая сумма выкупа.</p>
              <div class="flex items-center gap-1 shrink-0" id="booking-paid-toggle" data-value="Нет">
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
              <!-- Новая финансовая модель (11.08.2026) — движок сам решает "оплачено ли
                   Основная" по waterfall, тумблер выше для new-model заказов НИКОГДА не
                   читается сервером (см. ordersService.updateOrder — эти 4 колонки для
                   new-model пишет ТОЛЬКО applyRecomputeSideEffects). Спрятан здесь и
                   заменён read-only статусом, чтобы не выглядеть как рабочий переключатель. -->
              <div id="main-paid-readonly" class="hidden shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border"></div>
            </div>
          </div>

          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i data-lucide="weight" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Вес</span>
            </div>
            <div class="flex-1 w-full flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-baseline gap-1">
                <input type="number" id="weight-sum-input" class="w-28 bg-transparent border-none outline-none text-[15px] font-medium text-gray-900 placeholder-gray-300" placeholder="0.00" step="0.01">
                <span class="text-sm text-gray-500 font-medium">₽</span>
              </div>
              <div class="flex items-center gap-1 shrink-0" id="weight-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
              <div id="weight-paid-readonly" class="hidden shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border"></div>
            </div>
            <!-- $→₽ калькулятор (13.08.2026, Фаза 2) — оплата веса считается в
                 долларах, менеджер вводит доллар, рубль подставляется по
                 актуальному курсу; итоговое поле ("Цена веса") остаётся
                 обычным редактируемым ₽-полем, доллар нигде не сохраняется. -->
            <div class="flex items-center gap-1 self-end">
              <span class="text-xs text-gray-400">$</span>
              <input type="number" id="weight-usd-input" class="w-20 bg-gray-50 rounded-lg px-2 py-1 text-xs outline-none" placeholder="0.00" step="0.01" title="Сумма в долларах — рубль подставится по актуальному курсу">
              <i data-lucide="arrow-right" class="w-3 h-3 text-gray-300"></i>
              <span class="text-[11px] text-gray-400">≈<span id="weight-usd-rate-display">—</span>₽/$</span>
            </div>
            </div>
          </div>

          <!-- "Доставка КЗ→РФ" (13.08.2026, редизайн по запросу VASY тем же
               днём) — БОЛЬШЕ НЕ одно вводимое число, складывается из 3
               отдельных сумм (Такси КЗ/СДЭК/Такси РФ), которые менеджер
               заполняет здесь по факту — нужно для точной разбивки расходов
               позже. Итог — read-only, живой sum трёх полей ниже. -->
          <div class="field-row flex flex-col p-4 border-b border-gray-100 gap-2">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                <i data-lucide="plane" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Доставка КЗ→РФ</span>
              <span class="ml-auto text-[15px] font-semibold text-gray-900"><span id="delivery-kzrf-total-display">0.00</span> ₽</span>
            </div>
            <div class="grid grid-cols-3 gap-2 pl-12">
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">Такси КЗ</label>
                <input type="number" id="taxi-kz-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">СДЭК</label>
                <input type="number" id="sdek-cost-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">Такси РФ</label>
                <input type="number" id="taxi-rf-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
            </div>
            <div class="flex items-center justify-end gap-1 pl-12">
              <div class="flex items-center gap-1 shrink-0" id="delivery-kzrf-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
              <div id="delivery-kzrf-paid-readonly" class="hidden shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border"></div>
            </div>
          </div>

          <!-- "Доставка по РФ" (Э4 рефакторинга коллективок, §2.5,
               24.08.2026) — тем же приёмом, что "Доставка КЗ→РФ" выше,
               зеркало, файл в файл. -->
          <div class="field-row flex flex-col p-4 gap-2 rounded-b-2xl">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <i data-lucide="truck" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Доставка по РФ</span>
              <span class="ml-auto text-[15px] font-semibold text-gray-900"><span id="delivery-rf-total-display">0.00</span> ₽</span>
            </div>
            <div class="grid grid-cols-3 gap-2 pl-12">
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">Такси (отправка)</label>
                <input type="number" id="taxi-rf-send-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">Отправка</label>
                <input type="number" id="shipping-rf-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
              <div>
                <label class="text-[11px] text-gray-400 block mb-0.5">Такси (получение)</label>
                <input type="number" id="taxi-rf-receive-sum-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              </div>
            </div>
            <div class="flex items-center justify-end gap-1 pl-12">
              <div class="flex items-center gap-1 shrink-0" id="delivery-rf-paid-toggle" data-value="Нет">
                <button type="button" data-toggle-value="Да" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-500">Да</button>
                <button type="button" data-toggle-value="Нет" class="toggle-btn px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500 bg-indigo-50 text-indigo-600">Нет</button>
              </div>
              <div id="delivery-rf-paid-readonly" class="hidden shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border"></div>
            </div>
          </div>

        </div>
      </main>

      ${SkuModal.html()}
      ${ManualClientModal.html()}
      ${DeleteOrderModal.html()}
      ${PurchaseEventModal.html()}
      ${WriteoffModal.html()}
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
    let commissionGate; // Э6, D-10/F-24 — FormHelpers.wireCommissionGate(), пороги приходят в loadOrder()
    let refreshExistingWriteoffs = async () => {}; // Э8, M8.1 — переопределяется внутри loadOrder(), нужна снаружи для onRecorded/кнопки
    let originalBookingSum = 0; // снимок "Бронь/комиссия" на момент загрузки — для isDirty() ниже, тот же критерий, что на сервере
    let dateInput, dateReceivedInput, rateKztInput, rateRubInput;
    let weightSumInput;
    let weightUsdInput, weightUsdRateDisplay;
    // "Доставка КЗ→РФ" (13.08.2026, редизайн) — больше не одно поле, сумма
    // 3 живых полей ниже; deliveryKzRfTotalDisplay — read-only, не input.
    let taxiKzSumInput, sdekCostSumInput, taxiRfSumInput, deliveryKzRfTotalDisplay;
    // "Доставка по РФ" (Э4 рефакторинга коллективок, §2.5, 24.08.2026) —
    // тот же паттерн, зеркало трёх строк выше.
    let taxiRfSendSumInput, shippingRfSumInput, taxiRfReceiveSumInput, deliveryRfTotalDisplay;
    let usdToRubRate = 0; // курс "Доллар" из finalRates (13.08.2026, $→₽ калькулятор веса) — этот экран раньше курсы вообще не запрашивал
    let collectiveSelectStage1, collectiveSelectStage2, sdekTypeSelect;
    let amountRubBase = 0;
    const CONSTANTS_CLIENT = { SDEK_TYPE_COLLECTIVE: 'Коллективная' };
    let purchaseLinkInput, purchaseLinkHint, purchaseLinkResolveBtn;
    // Снимок amount/rateKzt/rateRub на момент загрузки (04.08.2026, по
    // запросу VASY) — после сохранения "Итог Руб" на экране оставался старым
    // до перезагрузки заказа, хотя в самой таблице формула уже пересчиталась.
    // Пересчитываем на фронтенде без лишнего запроса — та же формула, что и
    // в листе ("Итог Руб" = "Количество к валюте" * "Тенге к валюте" /
    // "Тенге к рублю", проверено по реальной таблице). "Доход Руб" НЕ
    // пересчитываем — 5-членная формула с условиями по каждому флагу оплаты,
    // дублировать её ещё в одном месте — риск тихо показать неверную цифру
    // (уже есть техдолг про дублирование расчёта платежей), честнее пометить
    // как требующую перезагрузки.
    let originalCalcSnapshot = null;
    // Снимок последней загруженной getOrderDetails — источник для кнопки
    // "Дублировать" (13.08.2026, bulk order creation), см. её обработчик ниже.
    let loadedDetails = null;

    // Восстановление черновика правки (16.08.2026) — см. комментарий у
    // ORDER_EDIT_DRAFT_KEY выше про то, почему это чисто UX-подстраховка, не
    // защита от денежного дубля. Черновик может относиться к ДРУГОМУ заказу,
    // чем открыт сейчас (менеджер мог зайти на редактирование заказа X уже
    // после незавершённой правки заказа Y) — восстановление всё равно
    // пытается уйти в фон независимо от currentOrderId этого захода.
    const draftBanner = document.getElementById('draft-recovery-banner');
    function hideDraftBanner() {
      draftBanner.classList.add('hidden');
      draftBanner.innerHTML = '';
    }
    function showDraftBanner(message, onRetry, onDiscard) {
      draftBanner.classList.remove('hidden');
      draftBanner.innerHTML = `
        <div class="mb-2">${message}</div>
        <div class="flex gap-2">
          <button type="button" id="draft-retry-btn" class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium">Отправить снова</button>
          <button type="button" id="draft-discard-btn" class="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-medium">Удалить черновик</button>
        </div>
      `;
      document.getElementById('draft-retry-btn').addEventListener('click', onRetry);
      document.getElementById('draft-discard-btn').addEventListener('click', () => {
        onDiscard();
        hideDraftBanner();
      });
    }
    async function attemptEditDraftRecovery(manualRetry) {
      const draft = loadOrderDraft(ORDER_EDIT_DRAFT_KEY);
      if (!draft) return;
      try {
        await callServer('updateOrder', draft.payload.orderId, draft.payload.fields);
        clearOrderDraft(ORDER_EDIT_DRAFT_KEY);
        hideDraftBanner();
        showSaveToast(true, `Восстановлена ранее не сохранённая правка заказа (ID: ${draft.payload.orderId})`);
      } catch (error) {
        const when = new Date(draft.savedAt).toLocaleString('ru-RU');
        showDraftBanner(
          `Есть не сохранённая правка заказа ${escapeHtmlClient(draft.payload.orderId)} от ${escapeHtmlClient(when)} — попытка отправить после сбоя связи не удалась.`,
          () => attemptEditDraftRecovery(true),
          () => clearOrderDraft(ORDER_EDIT_DRAFT_KEY)
        );
        if (manualRetry) showSaveToast(false, `Не получилось отправить черновик: ${error.message}`);
      }
    }
    attemptEditDraftRecovery(false);

    function searchReleaseStub(query) { return callServer('searchSku', query); }
    // ИСПРАВЛЕНО (18.08.2026) — см. тот же комментарий в order-new.js:
    // 'searchClient' (без "s") не существует в контракте, прозрачно
    // проксировался на старый GAS-индекс (только зашедшие в бота клиенты).
    function searchClientStub(query) { return callServer('searchClients', query); }

    async function saveOrder(confirmedCloseWithDebt, confirmedProceedWithMissingData) {
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
        // "Доставка КЗ→РФ" (13.08.2026, редизайн) — 3 отдельных поля, каждое
        // пишется отдельной колонкой на сервере (для разбивки расходов) +
        // computeDeliveryKzRfTotal() — их живая сумма, та же колонка "Стоимость
        // доставки КЗ→РФ", что и раньше (платёжный движок её и читает).
        taxiKzSum: taxiKzSumInput.value,
        sdekSum: sdekCostSumInput.value,
        taxiRfSum: taxiRfSumInput.value,
        deliveryKzRfSum: computeDeliveryKzRfTotal().toFixed(2),
        deliveryKzRfPaid: document.getElementById('delivery-kzrf-paid-toggle').dataset.value,
        // "Доставка по РФ" (Э4, §2.5) — тот же принцип, зеркало 3 строк выше.
        taxiRfSendSum: taxiRfSendSumInput.value,
        shippingRfSum: shippingRfSumInput.value,
        taxiRfReceiveSum: taxiRfReceiveSumInput.value,
        deliveryRfPaid: document.getElementById('delivery-rf-paid-toggle').dataset.value,
        notifyClient: document.getElementById('notify-client-checkbox').checked,
        purchaseLink: purchaseLinkInput.value.trim(),
        commissionLowReason: commissionGate.getReason() // Э6, D-10/F-24 — сервер сам решает, нужна ли она (только если "Бронь/комиссия" реально менялась)
      };
      // Гейт долга (Q7, см. блок выше save-order-btn) — подтверждение уже
      // получено ДО вызова saveOrder, здесь только прокидывается на сервер,
      // который перепроверяет его сам (страховка от гонки, не второй UX-путь).
      if (confirmedCloseWithDebt) fields.confirmedCloseWithDebt = true;
      // Гейт готовности данных (Р6, «Напоминания 2.0», 31.08.2026) — тот же
      // принцип: подтверждение уже получено ДО вызова saveOrder, сервер сам
      // перепроверяет (страховка от гонки).
      if (confirmedProceedWithMissingData) fields.confirmedProceedWithMissingData = true;

      // Р8 (31.08.2026) — только если менеджер реально переключил галочку в
      // ЭТОМ заходе (сравнение с уже загруженным loadedDetails.isOwnPurchase,
      // не жёстко true/false) — сервер трактует undefined как "не трогать",
      // отправлять fields.isOwnPurchase на КАЖДОЕ сохранение заставило бы
      // гейт заниженной комиссии каждый раз заново решать own/system по
      // этому полю без надобности.
      const ownPurchaseChecked = document.getElementById('own-purchase-checkbox').checked;
      if (ownPurchaseChecked !== !!(loadedDetails && loadedDetails.isOwnPurchase)) {
        fields.isOwnPurchase = ownPurchaseChecked;
      }

      // Черновик — ДО отправки, как у order-new.js, только чисто UX-цель
      // (см. ORDER_EDIT_DRAFT_KEY выше) — updateOrder сам по себе безопасен
      // к повтору, черновик просто не даёт менеджеру остаться в неведении,
      // применилась ли правка, если Telegram зависнет посреди запроса.
      saveOrderDraft(ORDER_EDIT_DRAFT_KEY, { orderId: currentOrderId, fields });
      const result = await callServer('updateOrder', currentOrderId, fields);
      clearOrderDraft(ORDER_EDIT_DRAFT_KEY);
      return result;
    }

    // Пересчитывает "Итог Руб" на экране без обращения к серверу, если
    // amount/курсы отличаются от того, что было при открытии формы —
    // см. комментарий у originalCalcSnapshot выше.
    function maybeRefreshTotalDisplay() {
      if (!originalCalcSnapshot) return;

      const changed = amountInput.value !== originalCalcSnapshot.amount
        || rateKztInput.value !== originalCalcSnapshot.rateKzt
        || rateRubInput.value !== originalCalcSnapshot.rateRub;
      if (!changed) return;

      const parse = (val) => parseFloat((val || '').toString().replace(',', '.'));
      const amount = parse(amountInput.value);
      const rateKzt = parse(rateKztInput.value);
      const rateRub = parse(rateRubInput.value);

      const totalRubDisplay = document.getElementById('total-rub-display');
      if (!isNaN(amount) && !isNaN(rateKzt) && !isNaN(rateRub) && rateRub !== 0) {
        totalRubDisplay.textContent = (amount * rateKzt / rateRub).toFixed(2);
      }
      // "Доход Руб" зависит от "Итог Руб" в формуле листа — раз тот поменялся,
      // старое значение на экране уже неверно, но пересчитать его здесь
      // безопасно нельзя (см. комментарий выше) — честно помечаем как устаревшее.
      document.getElementById('profit-rub-display').textContent = 'обновится при открытии';

      originalCalcSnapshot = { amount: amountInput.value, rateKzt: rateKztInput.value, rateRub: rateRubInput.value };
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
    weightUsdInput = document.getElementById('weight-usd-input');
    weightUsdRateDisplay = document.getElementById('weight-usd-rate-display');
    taxiKzSumInput = document.getElementById('taxi-kz-sum-input');
    sdekCostSumInput = document.getElementById('sdek-cost-sum-input');
    taxiRfSumInput = document.getElementById('taxi-rf-sum-input');
    deliveryKzRfTotalDisplay = document.getElementById('delivery-kzrf-total-display');
    taxiRfSendSumInput = document.getElementById('taxi-rf-send-sum-input');
    shippingRfSumInput = document.getElementById('shipping-rf-sum-input');
    taxiRfReceiveSumInput = document.getElementById('taxi-rf-receive-sum-input');
    deliveryRfTotalDisplay = document.getElementById('delivery-rf-total-display');

    // "Доставка КЗ→РФ" — живой sum трёх полей, обновляется в display на
    // каждый ввод (13.08.2026, редизайн).
    function computeDeliveryKzRfTotal() {
      return (parseFloat(taxiKzSumInput.value) || 0) + (parseFloat(sdekCostSumInput.value) || 0) + (parseFloat(taxiRfSumInput.value) || 0);
    }
    function updateDeliveryKzRfTotalDisplay() {
      deliveryKzRfTotalDisplay.textContent = computeDeliveryKzRfTotal().toFixed(2);
    }
    [taxiKzSumInput, sdekCostSumInput, taxiRfSumInput].forEach((input) => input.addEventListener('input', updateDeliveryKzRfTotalDisplay));

    // "Доставка по РФ" (Э4, §2.5) — тот же паттерн, зеркало блока выше.
    function computeDeliveryRfTotal() {
      return (parseFloat(taxiRfSendSumInput.value) || 0) + (parseFloat(shippingRfSumInput.value) || 0) + (parseFloat(taxiRfReceiveSumInput.value) || 0);
    }
    function updateDeliveryRfTotalDisplay() {
      deliveryRfTotalDisplay.textContent = computeDeliveryRfTotal().toFixed(2);
    }
    [taxiRfSendSumInput, shippingRfSumInput, taxiRfReceiveSumInput].forEach((input) => input.addEventListener('input', updateDeliveryRfTotalDisplay));
    collectiveSelectStage1 = document.getElementById('collective-select-stage1');
    collectiveSelectStage2 = document.getElementById('collective-select-stage2');
    purchaseLinkInput = document.getElementById('purchase-link-input');
    purchaseLinkHint = document.getElementById('purchase-link-hint');
    purchaseLinkResolveBtn = document.getElementById('purchase-link-resolve-btn');

    // wireDictionarySelect — не просто populateSelect: добавляет "+Добавить
    // своё значение" (21.08.2026, Фаза 2 миграции на Postgres, домен
    // "Справочники" — VASY попросил возможность добавлять справочники прямо
    // из формы заказа, аналогично созданию выпуска).
    FormHelpers.wireDictionarySelect('select[data-dict="statusDelivery"]', 'statusDelivery', dictionaries.statusDelivery);
    FormHelpers.wireDictionarySelect('select[data-dict="statusOrder"]', 'statusOrder', dictionaries.statusOrder);
    FormHelpers.wireDictionarySelect('select[data-dict="purchaseChannel"]', 'purchaseChannel', dictionaries.purchaseChannel);
    FormHelpers.wireDictionarySelect('select[data-dict="purchaseAccount"]', 'purchaseAccount', dictionaries.purchaseAccount);
    FormHelpers.wireDictionarySelect('select[data-dict="cargo"]', 'cargo', dictionaries.cargo);

    ['booking-paid-toggle', 'main-paid-toggle', 'weight-paid-toggle', 'delivery-kzrf-paid-toggle', 'delivery-rf-paid-toggle']
      .forEach(id => FormHelpers.initTagToggle(id));

    // $→₽ калькулятор веса (13.08.2026, Фаза 2) — этот экран раньше курсы не
    // запрашивал вообще (в отличие от order-new.js, где они уже нужны для
    // "Количество"); тот же callServer('refreshRate') — проксируется на GAS,
    // родного Node-метода под это ещё нет (см. currencyService.js — только
    // серверное использование при createOrder/updateOrder, наружу не отдаётся).
    callServer('refreshRate').then(rates => {
      const rate = rates && rates.finalRates ? parseFloat((rates.finalRates['Доллар'] || '').toString().replace(',', '.')) : NaN;
      if (!isNaN(rate) && rate > 0) {
        usdToRubRate = rate;
        weightUsdRateDisplay.textContent = rate.toFixed(2);
      }
    }).catch(() => {}); // курс — необязательное удобство, сбой не должен мешать редактированию заказа

    weightUsdInput.addEventListener('input', () => {
      const usd = parseFloat(weightUsdInput.value) || 0;
      if (usdToRubRate > 0 && usd > 0) {
        weightSumInput.value = (usd * usdToRubRate).toFixed(2);
      }
    });

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
          // Тост нужен и при создании через распознанную ссылку, и при обычном
          // ручном добавлении ("+ Добавить выпуск") — раньше оба сценария были
          // "тихими", из-за чего менеджер не понимал, что позиция сохранена.
          showSaveToast(true, `Позиция «${result.label || result.value}» создана и добавлена в каталог`);
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
        <div class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
          ${escapeHtmlClient(item.displayName)}
          ${item.pending ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">не подтверждён</span>' : ''}
        </div>
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

    // --- Коллективка — ДВА независимых списка по этапу (Э4, §3), назначение
    // сразу при выборе. Каждый список показывает ТОЛЬКО коллективки СВОЕГО
    // этапа — assignOrderToCollective сам пишет связь в стадию ЦЕЛЕВОЙ
    // коллективки (её собственный `stage`, см. collectivesService), так что
    // выбор в "нужном" списке гарантированно попадает в нужное плечо.
    async function populateCollectiveSelects() {
      try {
        const list = await callServer('getCollectivesList');
        const buildOptions = (stage) => list
          .filter((c) => c.stage === stage)
          .map((c) => {
            const trackPart = c.trackNumber ? ` (${c.trackNumber})` : '';
            return `<option value="${c.collectiveId}">${c.collectiveId}${trackPart} — ${c.status}</option>`;
          }).join('');
        collectiveSelectStage1.innerHTML = '<option value="">— не привязано —</option>' + buildOptions('КЗ→РФ');
        collectiveSelectStage2.innerHTML = '<option value="">— не привязано —</option>' + buildOptions('По РФ');
      } catch (error) {
        // Список коллективок не критичен для остальной формы — тихо игнорируем
      }
    }

    function wireCollectiveSelect(selectEl, stage) {
      selectEl.addEventListener('change', async () => {
        const newId = selectEl.value;
        try {
          if (newId === '') {
            await callServer('unassignOrderFromCollective', currentOrderId, stage);
            showSaveToast(true, 'Заказ отвязан от коллективки');
          } else {
            await callServer('assignOrderToCollective', currentOrderId, newId);
            showSaveToast(true, 'Заказ привязан к коллективке');
          }
        } catch (error) {
          showSaveToast(false, `Не удалось изменить коллективку: ${error.message}`);
        }
      });
    }
    wireCollectiveSelect(collectiveSelectStage1, 'КЗ→РФ');
    wireCollectiveSelect(collectiveSelectStage2, 'По РФ');

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
    // Э6, D-10/F-24 — регистрируется ПОСЛЕ триугольника выше (тот же
    // 'input' на #fee-percent/#fee-rub, слушатели одного элемента срабатывают
    // в порядке регистрации — наш обязан читать feePercentInput.value УЖЕ
    // ПОСЛЕ updateFeeRub/updateFeePercent). isDirty сравнивает ТЕКУЩЕЕ
    // значение ₽-поля с загруженным снимком (originalBookingSum, см.
    // loadOrder()) — тот же критерий и допуск (0.005 ₽), что
    // ordersService.updateOrder на сервере: гейт не должен всплывать на
    // несвязанной правке заказа с исторически низкой комиссией.
    commissionGate = FormHelpers.wireCommissionGate({
      isDirty: () => Math.abs((parseFloat(feeRubInput.value) || 0) - originalBookingSum) > 0.005
    });
    // Э6, чек-лист п.7 (точка безубыточности, 26.08.2026) — валюта/канал
    // РЕДАКТИРУЕМЫ на этом экране (в отличие от order-new.js, где это
    // единственный путь получить точку безубыточности вообще) — перечитать
    // при их смене, тот же вызов, что loadOrder делает один раз при заходе.
    function refreshBreakevenAndThresholds() {
      const currency = document.getElementById('currency-select').value;
      const channel = document.querySelector('select[data-dict="purchaseChannel"]').value;
      callServer('getOrderForecast', amountInput.value, currency, channel)
        .then((forecast) => {
          commissionGate.setThresholds({ warnPercent: forecast.commissionWarnPercent, reasonPercent: forecast.commissionReasonPercent });
          commissionGate.setBreakeven({
            breakevenCommissionPercent: forecast.breakevenCommissionPercent,
            breakevenIsDefaultChannelPolicy: forecast.breakevenIsDefaultChannelPolicy,
            breakevenUnavailableReason: forecast.breakevenUnavailableReason
          });
        })
        .catch(() => {});
    }
    document.getElementById('currency-select').addEventListener('change', refreshBreakevenAndThresholds);
    document.querySelector('select[data-dict="purchaseChannel"]').addEventListener('change', refreshBreakevenAndThresholds);
    totalPaymentInput.addEventListener('input', updateFromTotalPayment);
    totalPaymentInput.addEventListener('blur', clampTotalPaymentOnBlur);

    // Итог по суммам (12.08.2026, запрос VASY) — "сколько оплачено / осталось
    // / сколько всего выходит расходов по заказу". Чисто фронтенд-подсчёт из
    // уже загруженных `getOrderDetails` данных (тот же принцип, что "Доход
    // Руб" — §17 личной памяти проекта, не дублирует backend-формулу, просто
    // складывает уже посчитанные сервером числа).
    //
    // Бронь/комиссия НЕ прибавляется отдельной строкой — она УЖЕ часть цели
    // "Основная" в обеих моделях (new-model: `getNewModelPaymentTarget`
    // читает "Осталось", которое уже включает бронь; old-model:
    // `getMainBalanceForOrder` строит target = Итог Руб + Бронь) — повторное
    // прибавление задвоило бы её независимо от того, стоит тумблер "Оплачена
    // ли бронь?" в Да или Нет (VASY явно попросил не допустить этого).
    function renderPaymentSummary(details) {
      const card = document.getElementById('payment-summary-card');
      const hint = document.getElementById('ps-hint');
      let total = 0, paid = 0, hasUnknownTarget = false;

      if (details.isNewModel) {
        (details.stagesBalance || []).forEach((s) => {
          if (s.target > 0) {
            total += s.target;
            paid += s.paid;
          } else {
            hasUnknownTarget = true;
          }
        });
      } else {
        // Основная — уже посчитанный financeService-баланс (Итог Руб + Бронь,
        // partial-tracking, Фаза 2) — единственная стадия old-model с реальным paid.
        const mb = details.mainBalance || { target: 0, paid: 0 };
        if (mb.target > 0) {
          total += mb.target;
          paid += mb.paid;
        } else {
          hasUnknownTarget = true;
        }
        // Вес/КЗ→РФ/РФ (old-model) — только boolean "оплачено?" + сырая сумма,
        // без partial-tracking (задокументированная лимитация, та же, что в
        // "Доход Руб"-формуле §17) — оплачено целиком или не оплачено вовсе.
        ['weight', 'deliveryKzRf', 'deliveryRf'].forEach((key) => {
          const p = details.payments[key];
          const sum = parseFloat(p.sum) || 0;
          if (sum > 0) {
            total += sum;
            if (p.paid === 'Да' || p.paid === 'да') paid += sum;
          }
        });
      }

      const remaining = Math.max(total - paid, 0);
      document.getElementById('ps-paid').textContent = `${paid.toFixed(2)} ₽`;
      document.getElementById('ps-remaining').textContent = `${remaining.toFixed(2)} ₽`;
      document.getElementById('ps-total').textContent = `${total.toFixed(2)} ₽`;

      if (hasUnknownTarget) {
        hint.textContent = 'Не все суммы ещё известны — итог посчитан только по заполненным полям.';
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
      }
      card.classList.remove('hidden');
    }

    // --- Загрузка данных заказа и заполнение формы ---
    async function loadOrder() {
      let details;
      try {
        details = await callServer('getOrderDetails', currentOrderId);
      } catch (error) {
        showNotFound();
        return;
      }
      loadedDetails = details;

      document.getElementById('order-id-display').textContent = `Заказ ID: ${details.orderId}`;
      noteInput.value = details.remark;
      noteCounter.textContent = `${details.remark.length}/300`;
      releaseSearch.value = details.productOriginal;
      shortNameInput.value = details.productShort;
      selectedReleaseId = details.productOriginal;
      setReleaseThumbnail(details.imageUrl);
      purchaseLinkInput.value = details.purchaseLink || '';
      document.getElementById('own-purchase-checkbox').checked = !!details.isOwnPurchase;

      document.querySelector('select[data-dict="statusDelivery"]').value = details.statusDelivery;
      // §H (12.08.2026) исходно рисовала только снимок с сервера при загрузке,
      // не обновляясь при смене select до сохранения — сознательный компромисс
      // на тот момент ("не дублируем позиционную таблицу на фронте"). VASY
      // (13.08.2026) отметил это багом на практике — исправлено: снимок с
      // сервера используется как стартовое значение (он же источник правды на
      // момент загрузки), а дальше 'change' пересчитывает через клиентский
      // computeDeliveryLadderPosition (common.js — тот же порт, что теперь
      // использует и order-new.js, уже не первое дублирование этой маленькой
      // таблицы, а согласованный приём).
      const deliveryLadderEl = document.getElementById('delivery-ladder');
      const statusDeliverySelect = document.querySelector('select[data-dict="statusDelivery"]');
      deliveryLadderEl.innerHTML = buildDeliveryLadder(details.deliveryLadder, details.statusDelivery, {});
      statusDeliverySelect.addEventListener('change', () => {
        const ladder = computeDeliveryLadderPosition(statusDeliverySelect.value);
        deliveryLadderEl.innerHTML = buildDeliveryLadder(ladder, statusDeliverySelect.value, {});
      });
      document.querySelector('select[data-dict="statusOrder"]').value = details.statusOrder;

      // Списание (Э8, M8.1) — тот же приём, что delivery-ladder выше:
      // снимок с сервера на загрузке + пересчёт на 'change', не дублируем
      // статус отдельным состоянием. refreshExistingWriteoffs — best-effort,
      // сбой чтения истории не должен мешать открыть форму заказа.
      const statusOrderSelect = document.querySelector('select[data-dict="statusOrder"]');
      const writeoffBanner = document.getElementById('writeoff-banner');
      const writeoffExistingList = document.getElementById('writeoff-existing-list');

      // Переопределяет hoisted-заглушку выше — доступна снаружи loadOrder()
      // (кнопка "Зафиксировать списание"/её onRecorded живут в внешней
      // области render(), не здесь, тот же приём, что commissionGate).
      refreshExistingWriteoffs = async function() {
        writeoffExistingList.classList.add('hidden');
        writeoffExistingList.innerHTML = '';
        try {
          const rows = await callServer('getOrderWriteoffs', currentOrderId);
          if (rows.length === 0) return;
          writeoffExistingList.innerHTML = `<div class="font-medium text-gray-500">Уже зафиксировано:</div>` + rows.map((r) =>
            `<div>${r.reason_kind}, ${parseFloat(r.total_loss_rub).toFixed(2)} ₽ (${new Date(r.occurred_at).toLocaleDateString('ru-RU')})</div>`
          ).join('');
          writeoffExistingList.classList.remove('hidden');
        } catch { /* best-effort, не блокирует форму */ }
      };

      function updateWriteoffBanner() {
        const isWriteoffReason = WRITEOFF_REASON_STATUSES.has(statusOrderSelect.value);
        writeoffBanner.classList.toggle('hidden', !isWriteoffReason);
        if (isWriteoffReason) refreshExistingWriteoffs();
      }
      updateWriteoffBanner();
      statusOrderSelect.addEventListener('change', updateWriteoffBanner);

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
      // Э4 (§3) — details.collectiveLinks:[{stage,collectiveId,...}], до
      // ДВУХ записей (по одной на этап). Каждый селект — своя стадия.
      const links = details.collectiveLinks || [];
      collectiveSelectStage1.value = (links.find((l) => l.stage === 'КЗ→РФ') || {}).collectiveId || '';
      collectiveSelectStage2.value = (links.find((l) => l.stage === 'По РФ') || {}).collectiveId || '';
      amountInput.value = details.amount || '';
      rateKztInput.value = details.rateKztToCurrency;
      rateRubInput.value = details.rateRubToKzt;
      originalCalcSnapshot = { amount: amountInput.value, rateKzt: rateKztInput.value, rateRub: rateRubInput.value };
      document.getElementById('total-rub-display').textContent = details.totalRub !== '' ? details.totalRub : '—';
      document.getElementById('profit-rub-display').textContent = details.profitRub !== '' ? details.profitRub : '—';

      const mainSum = parseFloat(details.payments.main.sum) || 0;
      const bookingSum = parseFloat(details.payments.booking.sum) || 0;
      amountRubBase = mainSum - bookingSum;
      if (amountRubBase < 0) amountRubBase = 0;

      feeRubInput.value = bookingSum > 0 ? bookingSum.toFixed(2) : '';
      originalBookingSum = bookingSum; // Э6, D-10/F-24 — снимок для isDirty() гейта комиссии
      totalPaymentInput.value = mainSum > 0 ? mainSum.toFixed(2) : '';
      updateFeePercent();
      // Э6, D-10/F-24 (26.08.2026) — та же карточка настроек, что
      // order-new.js's fetchForecast, здесь без прогноза (поля уже
      // заполнены) — только пороги. Best-effort, тот же принцип, что
      // остальные необязательные подсказки формы.
      // Э6, чек-лист п.7 (точка безубыточности, 26.08.2026) — валюта/канал
      // уже проставлены в форму на этом этапе loadOrder (строки выше).
      callServer('getOrderForecast', amountInput.value, details.currency || 'Доллар', details.purchaseChannel || '')
        .then((forecast) => {
          commissionGate.setThresholds({ warnPercent: forecast.commissionWarnPercent, reasonPercent: forecast.commissionReasonPercent });
          commissionGate.setBreakeven({
            breakevenCommissionPercent: forecast.breakevenCommissionPercent,
            breakevenIsDefaultChannelPolicy: forecast.breakevenIsDefaultChannelPolicy,
            breakevenUnavailableReason: forecast.breakevenUnavailableReason
          });
        })
        .catch(() => {});

      FormHelpers.setTagToggle('booking-paid-toggle', details.payments.booking.paid === 'Да' || details.payments.booking.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('main-paid-toggle', details.payments.main.paid === 'Да' || details.payments.main.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('weight-paid-toggle', details.payments.weight.paid === 'Да' || details.payments.weight.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('delivery-kzrf-paid-toggle', details.payments.deliveryKzRf.paid === 'Да' || details.payments.deliveryKzRf.paid === 'да' ? 'Да' : 'Нет');
      FormHelpers.setTagToggle('delivery-rf-paid-toggle', details.payments.deliveryRf.paid === 'Да' || details.payments.deliveryRf.paid === 'да' ? 'Да' : 'Нет');

      // Новая финансовая модель — ЧЕТЫРЕ тумблера (Основная/Вес/СДЭК/Доставка_РФ)
      // дублируют то, что уже решает waterfall и НИКОГДА не читаются сервером
      // для new-model заказов (см. ordersService.updateOrder — эти 4 колонки
      // пишет ТОЛЬКО applyRecomputeSideEffects); суммы (weight-sum-input и т.д.)
      // остаются рабочими — их updateOrder действительно читает и ревизует цель.
      // §17 E.4/F5 задел, здесь — только эта строка формы, не весь F5. Old-model
      // — без изменений, тумблеры остаются единственным механизмом (ledger их
      // не покрывает).
      function applyNewModelReadonlyStage(toggleId, readonlyId, stage) {
        const toggleEl = document.getElementById(toggleId);
        const readonlyEl = document.getElementById(readonlyId);
        if (!details.isNewModel) {
          toggleEl.classList.remove('hidden');
          readonlyEl.classList.add('hidden');
          return;
        }
        toggleEl.classList.add('hidden');
        readonlyEl.classList.remove('hidden');
        const s = (details.stagesBalance || []).find((st) => st.stage === stage);
        if (s && s.covered) {
          readonlyEl.textContent = '✓ Оплачено';
          readonlyEl.className = 'shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700';
        } else if (s && s.target > 0) {
          readonlyEl.textContent = `Не покрыто: ${s.paid.toFixed(2)}/${s.target.toFixed(2)} ₽`;
          readonlyEl.className = 'shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500';
        } else {
          readonlyEl.textContent = 'Цель ещё не известна';
          readonlyEl.className = 'shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-400';
        }
      }
      applyNewModelReadonlyStage('main-paid-toggle', 'main-paid-readonly', 'Основная');
      applyNewModelReadonlyStage('weight-paid-toggle', 'weight-paid-readonly', 'Вес');
      // СДЭК/СДЭК_Индивидуальная — какая из двух реально в stagesBalance (зависит
      // от ветки заказа, см. paymentsService.stagesForBranch), та и покажется —
      // ищем совпадение по любому из двух имён, не завязываемся на sdekTypeSelect.
      const sdekStageName = (details.stagesBalance || []).some((s) => s.stage === 'СДЭК_Индивидуальная') ? 'СДЭК_Индивидуальная' : 'СДЭК';
      applyNewModelReadonlyStage('delivery-kzrf-paid-toggle', 'delivery-kzrf-paid-readonly', sdekStageName);
      applyNewModelReadonlyStage('delivery-rf-paid-toggle', 'delivery-rf-paid-readonly', 'Доставка_РФ');

      renderPaymentSummary(details);

      weightSumInput.value = details.payments.weight.sum || '';
      // "Доставка КЗ→РФ" (13.08.2026, редизайн) — заполняем 3 отдельных поля
      // из сохранённой разбивки; итог пересчитывается сразу же тем же кодом,
      // что и на ручной ввод (updateDeliveryKzRfTotalDisplay), не полагаемся
      // на details.payments.deliveryKzRf.sum напрямую здесь.
      taxiKzSumInput.value = details.payments.deliveryKzRf.taxiKz || '';
      sdekCostSumInput.value = details.payments.deliveryKzRf.sdek || '';
      taxiRfSumInput.value = details.payments.deliveryKzRf.taxiRf || '';
      updateDeliveryKzRfTotalDisplay();
      // "Доставка по РФ" (Э4, §2.5) — тот же принцип, зеркало 4 строк выше.
      taxiRfSendSumInput.value = details.payments.deliveryRf.taxiRfSend || '';
      shippingRfSumInput.value = details.payments.deliveryRf.shippingRf || '';
      taxiRfReceiveSumInput.value = details.payments.deliveryRf.taxiRfReceive || '';
      updateDeliveryRfTotalDisplay();

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

        // Баннер "есть в вишлисте" (Фаза 5, 04.08.2026) — оба поля уже
        // известны сразу после загрузки заказа, повторной проверки при
        // ручных правках формы (в отличие от order-new.js) не требуется.
        if (selectedReleaseId) {
          try {
            const wishlistMatch = await callServer('checkClientWishlistMatch', details.client.telegramId, selectedReleaseId);
            if (wishlistMatch) {
              const wishlistBanner = document.getElementById('wishlist-match-banner');
              wishlistBanner.textContent = 'У этого клиента эта позиция есть в вишлисте.';
              wishlistBanner.classList.remove('hidden');
            }
          } catch (e) { }
        }
      }

      if (window.lucide) window.lucide.createIcons();
    }

    // Та же защита от повторного клика, что и в order-new.js (13.08.2026,
    // см. личную память Architect'а про инцидент с дублями заказов) —
    // применена здесь тоже для единообразия, хотя updateOrder безопаснее
    // при повторе (перезаписывает ту же строку, не плодит новые).
    // Закрывающие статусы — тот же литерал, что backend
    // ordersRepository.ORDER_CLOSING_STATUSES (Config.js-конвенция: копируем
    // значение как есть, не изобретаем свой код, см. личную память
    // feedback_gas_original_contract_values). Заказ в одном из этих статусов
    // выходит из платёжного движка целиком (ни waterfall, ни точечное
    // распределение больше не тронут его стадии — getOpenOrdersForClient его
    // не отдаёт).
    const ORDER_CLOSING_STATUSES = ['Получено клиентом', 'возврат средств'];
    // Гейт долга (Q7, REFACTOR-COLLECTIVES.md §5 Q7/§6.2, 25.08.2026, Э5
    // рефакторинга коллективок) — ТОЛЬКО этот статус, "возврат средств"
    // исключён явным решением VASY (долг там — нормальное состояние).
    // Заменяет более раннюю (13.08.2026, найдено на живом заказе 3E7473)
    // клиент-локальную/только-new-model проверку — теперь считается на
    // сервере (previewDeliveryStatusChange, та же функция, что и у массовой
    // смены статуса на "Заказах"/в коллективке), покрывает обе модели, не
    // только new-model.
    const ORDER_CLOSING_STATUS_WITH_DEBT_GATE = 'Получено клиентом';

    function findUnpaidNewModelStages() {
      if (!loadedDetails || !loadedDetails.isNewModel) return [];
      return (loadedDetails.stagesBalance || []).filter((s) => s.target > 0 && s.remaining > 0.01);
    }

    const saveOrderBtn = document.getElementById('save-order-btn');
    saveOrderBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (saveOrderBtn.disabled) return;
      if (!releaseSearch.value.trim()) {
        showSaveToast(false, 'Не получилось сохранить: не заполнено поле «Выпуск»');
        return;
      }
      // Э6, D-10/F-24 — та же клиентская проверка, что сервер сделает жёстко
      // (isDirty внутри commissionGate сама решает, применим ли гейт вообще —
      // см. её JSDoc); здесь только чтобы не тратить round-trip. "Личный
      // заказ" (Р8) зеркалит серверное исключение — у заказа без плательщика
      // заниженная комиссия не имеет смысла как понятие. Проверяем ТЕКУЩЕЕ
      // состояние галочки, не loadedDetails — если менеджер только что её
      // включил в этом заходе, гейт не должен сработать для только что
      // помеченного личным заказа.
      if (!document.getElementById('own-purchase-checkbox').checked && !commissionGate.validate()) {
        showSaveToast(false, 'Комиссия ниже порога — укажите причину занижения');
        return;
      }

      const nextStatusDelivery = document.querySelector('select[data-dict="statusDelivery"]').value;
      let confirmedCloseWithDebt = false;
      let confirmedProceedWithMissingData = false;

      // Гейт применяется только на РЕАЛЬНОМ переходе в закрывающий (не на
      // каждом сохранении уже закрытого заказа) — та же проверка, что
      // сервер сделает повторно как страховку (previousStatus известен уже
      // здесь, лишний запрос на no-op-сохранение не нужен).
      const wasAlreadyClosing = loadedDetails && ORDER_CLOSING_STATUSES.includes(loadedDetails.statusDelivery);
      const statusActuallyChanging = !loadedDetails || loadedDetails.statusDelivery !== nextStatusDelivery;

      if (nextStatusDelivery === ORDER_CLOSING_STATUS_WITH_DEBT_GATE && !wasAlreadyClosing) {
        let preview;
        try {
          preview = await callServer('previewDeliveryStatusChange', [currentOrderId], nextStatusDelivery);
        } catch (error) {
          showSaveToast(false, `Не удалось проверить оплату перед закрытием: ${error.message}`);
          return;
        }
        const debtEntry = (preview.withDebt || [])[0];
        // Р6 (31.08.2026) — тот же preview теперь заодно возвращает пропуски
        // данных (не только долг), ОБА гейта показываются в одной модалке,
        // не конкурируют (заказ может фигурировать в обоих списках сразу).
        const missingEntry = (preview.missingData || [])[0];
        if (debtEntry || missingEntry) {
          let text = `Заказ переходит в статус «Получено клиентом»`;
          if (debtEntry) {
            text += `, но по нему остаётся непогашенный долг ${debtEntry.debt.toFixed(2)} ₽.\n\n` +
              `После закрытия остаток перестаёт быть целью — деньги, которые клиент занесёт позже, на этот заказ уже не пойдут, а сам долг нигде не будет виден как открытая позиция.`;
          }
          if (missingEntry) {
            const itemsText = missingEntry.items.map((i) => `• ${i.label} (${i.hint})`).join('\n');
            text += (debtEntry ? '\n\nВдобавок' : ', но') + ` не хватает данных:\n${itemsText}`;
          }
          text += `\n\nВсё равно закрыть?`;
          const proceed = await showConfirmModal(text, { confirmLabel: 'Закрыть', danger: true });
          if (!proceed) return;
          if (debtEntry) confirmedCloseWithDebt = true;
          if (missingEntry) confirmedProceedWithMissingData = true;
        }
      } else if (ORDER_CLOSING_STATUSES.includes(nextStatusDelivery)) {
        // "возврат средств" (и повторное сохранение уже закрытого статуса) —
        // без гейта, только общее информационное предупреждение, без изменений.
        // Вне лестницы позиций целиком (deliveryLadder.js) — Р6 сюда не
        // заходит вообще (previewDeliveryStatusChange не сочтёт это движением
        // вперёд), эта информационная проверка остаётся единственной здесь.
        const unpaidStages = findUnpaidNewModelStages();
        if (unpaidStages.length > 0) {
          const debtText = unpaidStages.map((s) => `${s.stage}: ${s.remaining.toFixed(2)} ₽`).join(', ');
          const proceed = await showConfirmModal(
            `Заказ переходит в статус «${nextStatusDelivery}», но по нему остаётся непокрытый долг (${debtText}).\n\n` +
            `После этого заказ выходит из платёжного движка — ни обычное распределение, ни закрепление меткой больше не смогут принять по нему оплату, даже если у клиента есть деньги в пуле.\n\n` +
            `Всё равно сохранить с этим статусом?`,
            { confirmLabel: 'Сохранить', danger: true }
          );
          if (!proceed) return;
        }
      } else if (statusActuallyChanging) {
        // Р6 (31.08.2026) — открытый статус, просто движение по лестнице
        // (не закрывающий, гейт долга здесь неприменим вообще). Backend сам
        // решает, было ли это движение ВПЕРЁД (см. JSDoc
        // previewDeliveryStatusChange) — на откате назад/выбор той же
        // позиции missingData всегда пуст, лишнего запроса на закрытие уже
        // не избежать (нужно узнать направление), но модалка не появится.
        let preview;
        try {
          preview = await callServer('previewDeliveryStatusChange', [currentOrderId], nextStatusDelivery);
        } catch (error) {
          showSaveToast(false, `Не удалось проверить готовность данных: ${error.message}`);
          return;
        }
        const missingEntry = (preview.missingData || [])[0];
        if (missingEntry) {
          const itemsText = missingEntry.items.map((i) => `• ${i.label} (${i.hint})`).join('\n');
          const proceed = await showConfirmModal(
            `Заказ переходит в статус «${nextStatusDelivery}», но не хватает данных:\n${itemsText}\n\nВсё равно перевести?`,
            { confirmLabel: 'Перевести', danger: true }
          );
          if (!proceed) return;
          confirmedProceedWithMissingData = true;
        }
      }

      saveOrderBtn.disabled = true;
      saveOrderBtn.classList.add('opacity-50', 'cursor-not-allowed');
      const icon = saveOrderBtn.querySelector('svg');
      // Пульсация, не вращение — см. .save-pulse в admin/app.html.
      if (icon) icon.classList.add('save-pulse');
      try {
        const result = await saveOrder(confirmedCloseWithDebt, confirmedProceedWithMissingData);
        showSaveToast(true, 'Изменения сохранены');
        if (result.notifyWarning) {
          setTimeout(() => showSaveToast(false, result.notifyWarning), 4300);
        }
        // По запросу VASY (12.08.2026) — закрывать экран после сохранения.
        // save-toast переживает навигацию (элемент оболочки, не экрана), так
        // что отложенное предупреждение выше всё равно успеет показаться.
        // navigateBack(), не хардкод 'orders' (25.08.2026, репорт VASY) —
        // заказ на редактирование открывают не только со списка "Заказы", но
        // и из коллективки/Напоминаний/Оплат/Главной; раньше отсюда всегда
        // уходили на "Заказы", теряя место, откуда реально пришли.
        navigateBack('orders');
      } catch (error) {
        showSaveToast(false, `Не получилось сохранить: ${error.message}`);
      } finally {
        saveOrderBtn.disabled = false;
        saveOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        if (icon) icon.classList.remove('save-pulse');
      }
    });

    // "Дублировать" (13.08.2026, bulk order creation) — открывает "Новый
    // заказ" в режиме "Несколько сразу" с общими полями этого заказа. НЕ
    // копируются: клиент, примечание (не входят в общий набор), и "Оплачена
    // ли бронь?" (явное требование VASY — новый заказ всегда стартует с
    // этим флагом сброшенным, ставится вручную) — bulk-режим order-new.js и
    // так не выставляет этот флаг ни для одной строки, здесь просто не
    // передаём его вовсе, чтобы не создавать соблазн когда-нибудь его
    // прокинуть по аналогии с остальными полями.
    document.getElementById('duplicate-order-btn').addEventListener('click', () => {
      if (!loadedDetails) return;
      const bookingSum = parseFloat(loadedDetails.payments.booking.sum) || 0;
      const amountRub = amountRubBase; // уже посчитан loadOrder() из mainSum-bookingSum
      const feePercent = amountRub > 0 && bookingSum > 0 ? ((bookingSum / amountRub) * 100).toFixed(2) : '';
      // ИСПРАВЛЕНО (13.08.2026) — params должны быть ПЛОСКИМ объектом
      // (navigateTo/buildQueryString в admin/router.js не умеют вложенные
      // объекты, см. комментарий в order-new.js у обработчика dupMode; сюда
      // раньше уходил вложенный duplicateFrom, что молча теряло все поля).
      navigateTo('orders/new', {
        dupMode: '1',
        dupProductOriginal: loadedDetails.productOriginal,
        // ИСПРАВЛЕНО (13.08.2026, репорт VASY после первого фикса — "Выпуск"
        // копировался как голый текст, не как выбранная позиция каталога):
        // короткое название/фото раньше вообще не передавались, order-new.js
        // не могло их проставить — releaseSearch.value выглядел заполненным,
        // но без short-name/thumbnail это не совпадало с тем, что видно при
        // обычном выборе через поиск. Теперь оба поля идут вместе с позицией.
        dupProductShort: loadedDetails.productShort,
        dupImageUrl: loadedDetails.imageUrl,
        dupStatusDelivery: loadedDetails.statusDelivery,
        dupStatusOrder: loadedDetails.statusOrder,
        dupPurchaseChannel: loadedDetails.purchaseChannel,
        dupPurchaseAccount: loadedDetails.purchaseAccount,
        dupCargo: loadedDetails.cargo,
        // dupDateOrder больше НЕ передаётся (16.08.2026, багфикс "дата молча
        // копировалась со старого заказа") — order-new.js больше не читает
        // это поле, дата всегда стартует на сегодня в режиме дублирования.
        dupCurrency: loadedDetails.currency,
        dupAmount: loadedDetails.amount,
        dupFeePercent: feePercent
      });
    });

    // --- Удаление заказа (16.08.2026, см. личную память Architect'а
    // project_bot_knopka_order_deletion) — двойной гейт против случайного
    // удаления: сначала явный выбор по каждому активному платежу заказа
    // (модалка, только если такие платежи есть), затем финальное подтверждение
    // (showConfirmModal — 19.08.2026, P0.8 аудита, заменил нативный confirm()).
    const deleteOrderModal = DeleteOrderModal.init({
      onConfirmed: async (resolutions) => {
        await finishDeleteOrder(resolutions);
      }
    });

    // "Факт выкупа" (Э2 рефакторинга экономики, 25.08.2026, хвост "экран
    // менеджера") — orderId/валюта берутся из уже загруженного заказа,
    // менеджер их не вводит руками. onRecorded ничего не обновляет на самом
    // экране заказа намеренно — "Итог Руб"/"Доход Руб" считаются от других
    // полей (не от purchase_events), обновлять здесь нечего.
    const purchaseEventModal = PurchaseEventModal.init({});
    document.getElementById('purchase-event-btn').addEventListener('click', () => {
      if (!currentOrderId || !loadedDetails) return;
      purchaseEventModal.open(currentOrderId, loadedDetails.currency);
    });

    // "Зафиксировать списание" (Э8, M8.1, D-11/F-27, 27.08.2026) — кнопка
    // видна только когда "Статус заказа" — одна из 4 причин списания (см.
    // WRITEOFF_REASON_STATUSES/updateWriteoffBanner выше). onRecorded
    // обновляет список уже зафиксированных списаний тем же best-effort
    // запросом, что и при смене статуса — не задваивает логику.
    const writeoffModal = WriteoffModal.init({
      onRecorded: () => refreshExistingWriteoffs()
    });
    document.getElementById('open-writeoff-modal-btn').addEventListener('click', () => {
      if (!currentOrderId) return;
      writeoffModal.open(currentOrderId, document.querySelector('select[data-dict="statusOrder"]').value);
    });

    const deleteOrderBtn = document.getElementById('delete-order-btn');
    const deleteOrderIcon = deleteOrderBtn.querySelector('svg');

    async function finishDeleteOrder(resolutions) {
      // Экран "Удалённые" (16.08.2026) — восстановление доступно оттуда,
      // текст ниже больше не говорит "только вручную через базу".
      if (!(await showConfirmModal(`Заказ ${currentOrderId} будет удалён. Его можно будет восстановить на экране «Удалённые». Продолжить?`, { confirmLabel: 'Удалить', danger: true }))) return;
      deleteOrderBtn.disabled = true;
      if (deleteOrderIcon) deleteOrderIcon.classList.add('save-pulse'); // та же пульсация, что у save-order-btn
      try {
        await callServer('deleteOrder', currentOrderId, resolutions);
        showSaveToast(true, 'Заказ удалён');
        navigateBack('orders'); // см. обоснование у "Сохранить" выше
      } catch (error) {
        showSaveToast(false, `Не получилось удалить: ${error.message}`);
      } finally {
        deleteOrderBtn.disabled = false;
        if (deleteOrderIcon) deleteOrderIcon.classList.remove('save-pulse');
      }
    }

    deleteOrderBtn.addEventListener('click', async () => {
      if (!currentOrderId) return;
      let preview;
      try {
        preview = await callServer('getOrderDeletionPreview', currentOrderId);
      } catch (error) {
        showSaveToast(false, `Не получилось проверить оплаты: ${error.message}`);
        return;
      }

      if (!preview.payments || preview.payments.length === 0) {
        await finishDeleteOrder([]);
        return;
      }

      deleteOrderModal.open(preview.payments, preview.isNewModel);
    });

    populateCollectiveSelects();
    loadOrder();
  }
};
