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
// CURRENCY_SYMBOLS/computeBookingFields перенесены в screens/_cart-money.js
// (§5 D4, разделение на модули) — оба нужны и `_cart-position.js`, и
// (только первый) `_cart-lot.js`/`_cart-lot.js`'s строкам, отдельным <script>
// файлам, которым модульный `const` этого файла уже не виден. Доступ —
// `CartMoney.CURRENCY_SYMBOLS`/`CartMoney.computeBookingFields`.

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
      <button id="save-cart-btn" title="Создать корзину" class="relative p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="save" class="w-6 h-6"></i>
        <!-- G2 (§8 плана, 08.09.2026) — пока "Итог с сайта выкупа" пуст,
             разница между реальным чеком и суммой заявок не разнесена по
             заявкам. НЕ блокирует сохранение (подсказка, не гейт) —
             видимость переключает updateSiteTotalBadge() ниже. -->
        <span id="cart-site-total-badge" class="hidden absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500"></span>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <!-- ИСПРАВЛЕНО 08.09.2026 (репорт VASY: "+ Добавить позицию"/
           "+ Добавить лот" немного перекрываются свёрнутой шторкой) —
           отступ снизу pb-28 (112px) был рассчитан ДО того, как язычок-хват
           вырос почти втрое (py-1.5 в py-3.5, тот же день, правка
           чувствительности свайпа) — высота свёрнутой панели итогов выросла
           вместе с ним, pb-28 больше не даёт достаточного зазора (замерено
           e2e: около 9.5px реального перекрытия на экране 375×667).
           pb-40 (160px) даёт запас около 50px — не впритык к точному числу,
           чтобы пережить небольшие расхождения рендеринга шрифта на
           реальных устройствах. НЕ использовать обратные кавычки внутри
           этого HTML-комментария — он живёт внутри JS template literal
           (см. JSDoc файла, наступали на это уже много раз). -->
      <main class="pt-16 pb-40 px-4 md:px-0 max-w-2xl mx-auto">

        <!-- Шапка корзины — общая на все заявки внутри (§4 п.1 плана) -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible mb-3">
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4 bg-[#f8fafc]">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="dollar-sign" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700">Валюта корзины</span>
            </div>
            <div class="flex-1 w-full">
              <div class="flex items-center justify-between gap-2">
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
              <!-- E3, IMPLEMENTATION-PLAN-CART-UX-2.md §6, 07.09.2026 — курс
                   меняется вместе с "Датой выкупа" (getRatesForDate), эта
                   подпись показывает, на какую дату он реально взят, ДО
                   сохранения. Пусто/скрыта, пока курс на сегодня (обычный
                   случай — не загромождать экран без нужды). -->
              <div id="cart-rate-date-caption" class="hidden text-[11px] text-right mt-0.5"></div>
            </div>
          </div>

          <!-- «Итог с сайта выкупа» (§5 D1, IMPLEMENTATION-PLAN-CART-UX-2.md,
               07.09.2026) — переехало сюда ИЗ #cart-summary-sheet (было
               внутри сворачиваемой панели итогов, найдено репортом VASY:
               это ВВОД, а не итог, ему не место в сворачиваемой панели).
               id-ы (#cart-site-total-input/#cart-site-total-diff) и вся
               привязанная логика (recomputeSiteTotalReconciliation,
               buildPayload) НЕ менялись — переехала только разметка (D2).
               Переключатель режима деления разницы (Фаза A,
               #cart-diff-split-row) добавится сюда же следующим шагом. -->
          <div class="field-row flex flex-col sm:flex-row sm:items-center p-4 border-b border-gray-100 gap-2 sm:gap-4">
            <div class="flex items-center gap-3 w-full sm:w-44 shrink-0">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i data-lucide="receipt" class="w-5 h-5"></i>
              </div>
              <span class="text-sm font-medium text-gray-700 inline-flex items-center gap-1">Итог с сайта выкупа${helpIcon('Итог с сайта выкупа', '<p>Необязательно. Итоговая сумма чека с сайта/площадки выкупа целиком — если она отличается от суммы, введённой по заявкам (округление, общие расходы площадки и т.п.), разница распределяется между заявками пропорционально их доле. Пусто — работает как раньше, без разбивки.</p>')}</span>
            </div>
            <div class="flex-1 w-full">
              <input type="number" id="cart-site-total-input" class="w-full bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00 — в валюте корзины, необязательно" step="0.01">
              <div id="cart-site-total-diff" class="hidden text-[11px] text-gray-500 mt-1.5"></div>

              <!-- Правило деления разницы (§2 A1, IMPLEMENTATION-PLAN-
                   CART-UX-2.md, 07.09.2026, решение VASY §0.1 п.1 —
                   менеджер выбирает сам, явным вопросом). Видно только
                   когда «Итог с сайта выкупа» заполнен (то же условие,
                   что открывает cost-coef-block на карточках, см.
                   recomputeSiteTotalReconciliation). -->
              <div id="cart-diff-split-row" class="hidden mt-2">
                <div class="text-[12px] text-gray-700 mb-1.5 inline-flex items-center gap-1">
                  Разница корзины: <b id="cart-diff-amount">+0.00 ₽</b>. Как разделить между заявками?
                  ${helpIcon('Как делится разница', '<p><b>По сумме</b> — крупная заявка получает бОльшую долю разницы (пропорционально своей известной сумме). Пример: позиция $100 и позиция $10, разница 2 000 ₽ — «по сумме» отдаст первой ≈1 818 ₽, второй ≈182 ₽.</p><p><b>Поровну</b> — разница делится на равные доли независимо от размера заявки. Тот же пример: обеим по 1 000 ₽ — вторая заявка получит долю в 2 раза больше своей суммы.</p><p>Заявки, зафиксированные вручную («Задать сумму вручную»), в разделе не участвуют — их сумма уже задана менеджером.</p>')}
                </div>
                <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button type="button" data-mode="amount" class="cart-diff-mode-btn px-3 py-1.5 text-[12px]">По сумме</button>
                  <button type="button" data-mode="equal" class="cart-diff-mode-btn px-3 py-1.5 text-[12px]">Поровну</button>
                </div>
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
        <!-- §5 D1 — "Свернуть все"/"Развернуть все", видны только когда
             есть что сворачивать (скрыты при пустом списке заявок ниже,
             см. updateCollapseAllButtonsVisibility в render()). -->
        <div id="collapse-all-row" class="hidden flex justify-end gap-3 mb-1.5 px-1">
          <button type="button" id="collapse-all-btn" class="text-[11px] font-medium text-gray-400 hover:text-gray-600">Свернуть все</button>
          <button type="button" id="expand-all-btn" class="text-[11px] font-medium text-gray-400 hover:text-gray-600">Развернуть все</button>
        </div>
        <div id="cart-items-list"></div>
        <div class="grid grid-cols-2 gap-2 mb-3">
          <button type="button" id="add-position-btn" class="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium">+ Добавить позицию</button>
          <button type="button" id="add-lot-btn" class="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium">+ Добавить лот</button>
        </div>

        ${ManualClientModal.html()}
        ${SkuModal.html()}
        ${ClientRequiredModal.html()}
      </main>

      <!-- Липкая нижняя панель итогов (§4 C1, IMPLEMENTATION-PLAN-CART-UX.md,
           06.09.2026) — ПЕРВЫЙ sticky-элемент в приложении вообще. Заменяет
           старую карту "Итого корзины", которая раньше стояла ПОСЛЕДНИМ
           блоком в конце длинного списка заявок и терялась из виду (репорт
           VASY «итог корзины теряется») — здесь видна всегда, не нужно
           скроллить вниз. Позиционирование — тот же приём, что уже решает
           задачу "над нижней навигацией" на этом экране (#bulk-actions-bar,
           orders.js/collective-detail.js): fixed + bottom:calc(70px+safe-
           area), см. правило в app.html. Свёрнута по умолчанию — сводная
           строка всегда видна, по тапу разворачивается вверх в лист с
           разбивкой по клиентам/оплате/прогнозу логистики. Поле «Итог с
           сайта выкупа» отсюда СЪЕХАЛО ОБРАТНО в шапку корзины (§5 D1,
           IMPLEMENTATION-PLAN-CART-UX-2.md, 07.09.2026) — это ввод, не
           итог, ему не место в сворачиваемой панели.

           Свёрнутая строка ПЕРЕСОБРАНА §4 C1/C2/C3 (IMPLEMENTATION-PLAN-
           CART-UX-2.md, 07.09.2026, репорт VASY «на 320px читается
           только прокруткой»): была одна overflow-x-auto whitespace-
           nowrap строка — заменена сеткой 2×2 без единого overflow-x на
           контейнере, читается целиком на 320px. Кнопка разворачивания —
           отдельная пилюля под сеткой (была весь ряд кликабелен как
           кнопка) — сама сетка больше не внутри кнопки, слушатель
           теперь только на пилюле #cart-summary-toggle. -->
      <div id="cart-summary-bar" class="fixed left-0 right-0 z-40 bg-emerald-50 border-t border-emerald-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <!-- "Язычок" для свайпа (07.09.2026, репорт VASY: удобнее раскрывать
             и сворачивать жестом, ухватив именно за границу панели, а не
             только тапом по пилюле ниже). Виден ВСЕГДА (и свёрнуто, и
             развёрнуто) — физическая верхняя граница панели всегда здесь
             (fixed+bottom, высота растёт вверх при разворачивании, эта
             полоска остаётся на месте). touch-none — жест внутри самого
             язычка не должен ещё и скроллить страницу под ним.
             УВЕЛИЧЕНО 08.09.2026 (репорт VASY: "с правой стороны пальцем
             срабатывало легче и немного на большем диапазоне... случайно
             проматываю страницу вместо захвата шторки") — контейнер уже был
             на всю ширину панели (w-full, ловит жест по всей ширине, не
             только видимая полоска по центру), реальная проблема —
             недостаточная ВЫСОТА хитбокса (было ~16px, палец промахивается
             по вертикали мимо тонкой полосы). Вертикальный отступ py-1.5
             увеличен до py-3.5, почти втрое (визуальная полоска-подсказка
             осталась тем же размером, выросла только невидимая область
             вокруг неё). См. также сниженный порог срабатывания ниже
             (0.35 → 0.2 от хода панели). НЕ использовать обратные кавычки
             внутри этого HTML-комментария — он живёт внутри JS template
             literal (см. JSDoc файла, наступали на это уже несколько раз). -->
        <div id="cart-summary-drag-handle" class="w-full flex justify-center py-3.5 cursor-grab touch-none">
          <div class="w-10 h-1.5 rounded-full bg-emerald-300"></div>
        </div>
        <div class="px-4 pb-2.5">
          <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div class="text-[11px] text-gray-500">Итог корзины</div>
            <div class="text-[11px] text-gray-500 text-right">Осталось получить</div>
            <div class="text-lg font-bold text-gray-900 truncate"><span id="cart-total-rub">0.00</span> ₽</div>
            <div class="text-lg font-bold text-gray-900 text-right truncate"><span id="cs-remaining-rub">0.00</span> ₽</div>
            <div class="text-[11px] text-gray-600 truncate">Комиссия <span id="cs-fee-rub">0.00</span> ₽ (<span id="cs-fee-pct">0.0%</span>)</div>
            <div class="text-[11px] text-right truncate">
              <span id="cs-site-note" class="text-gray-400">итог сайта не указан</span>
              <span id="cs-site-diff" class="hidden px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium"></span>
            </div>
          </div>
          <div class="flex justify-center mt-1.5">
            <button type="button" id="cart-summary-toggle" class="px-3 py-1 rounded-full border border-emerald-300 bg-white text-emerald-700 text-[12px] font-medium inline-flex items-center gap-1">
              <span id="cart-summary-toggle-label">Подробнее</span>
              <!-- ВТОРОЕ ИСПРАВЛЕНИЕ 08.09.2026 (репорт VASY после первого
                   фикса 07.09.2026 — направление оказалось обратным его
                   ожиданию): здесь именно "Развернуть = вверх, Свернуть =
                   вниз", НЕ конвенция .position-chevron/.lot-chevron (у тех
                   наоборот, но их никто не просил трогать — это осознанно
                   применяется ТОЛЬКО к этой панели). База — chevron-up
                   (свёрнуто, «Подробнее»/приглашение развернуть, смотрит
                   вверх), поворот на 180deg при развороте (даёт «Свернуть»,
                   смотрит вниз) — та же JS-логика rotate(180deg), что и
                   раньше, поменялась только САМА иконка. -->
              <i data-lucide="chevron-up" id="cart-summary-chevron" class="w-3.5 h-3.5 transition-transform"></i>
            </button>
          </div>
        </div>
        <!-- ИСПРАВЛЕНО 07.09.2026 (репорт VASY: "шторка должна работать
             свайпом и плавно, а не нажатием") — было мгновенное display:none
             ↔ display:block (классом hidden), теперь анимированная высота
             (см. #cart-summary-sheet в <style> app.html — transition на
             height, .dragging временно её отключает на время самого жеста
             для честного слежения 1:1 за пальцем, см. JS ниже). Паддинг
             (px-4 py-3) И верхняя граница (border-t) — на ОТДЕЛЬНОЙ
             внутренней обёртке, не на самом #cart-summary-sheet: паддинг
             при height:0 всё равно рисовался бы отдельной полоской (padding
             не входит в height, overflow:hidden его не прячет); border-t —
             тот же класс проблемы, НАЙДЕНО прогоном e2e ДО деплоя, не
             чтением кода — Tailwind's preflight ставит box-sizing:border-box
             глобально, из-за чего 1px верхней границы не давал computed
             height уйти ниже 1px даже при height:0 в CSS, Playwright
             (справедливо) считал панель "видимой" на 1px, e2e падал на
             самой первой проверке toBeHidden(). -->
        <div id="cart-summary-sheet" class="overflow-hidden bg-white">
          <div class="border-t border-emerald-100 px-4 py-3 max-h-[55vh] overflow-y-auto custom-scrollbar">
          <div class="text-[11px] text-gray-500 inline-flex items-center gap-1 mb-2 pb-2 border-b border-gray-100">Средняя комиссия${helpIcon('Средняя комиссия', '<p>Read-only сводка — взвешенное среднее по уже введённым комиссиям заявок. Ничего не сохраняется отдельно и ни на что не влияет, комиссия по-прежнему считается только на позициях.</p>')}: <span id="cart-avg-commission">—</span></div>

          <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">По клиентам</div>
          <div id="cs-by-client-list" class="mb-3"></div>

          <!-- "С клиентов"/"Уже оплачено" — было "Уже оплачено"/"Осталось
               получить" до §4 C1: "Осталось получить" переехало в саму
               свёрнутую строку (самое действенное число), детали остались
               здесь. -->
          <div class="grid grid-cols-2 gap-2 mb-1 pt-2 border-t border-gray-100">
            <div>
              <div class="text-[11px] text-gray-500">С клиентов</div>
              <div class="text-sm font-semibold text-gray-900"><span id="cs-client-rub">0.00</span> ₽</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-500">Уже оплачено</div>
              <div class="text-sm font-semibold text-gray-900"><span id="cs-paid-rub">0.00</span> ₽</div>
            </div>
          </div>

          <!-- G1 (§8 IMPLEMENTATION-PLAN-CART-UX-2.md, 08.09.2026) —
               обратный пересчёт: менеджер вводит желаемую сумму "Получить
               с клиентов", экран подбирает ЕДИНЫЙ % комиссии на ВСЕ
               клиентские заявки (позиции и строки лота, кроме "Личного
               заказа") и проставляет его через уже существующие
               updateFeeRub-цепочки. Кнопка "Применить", НЕ live-режим —
               случайный промежуточный ввод иначе тихо перетирал бы уже
               вручную выставленные проценты на отдельных заявках. -->
          <div class="pt-2 pb-1 border-t border-gray-100">
            <div class="text-[11px] text-gray-500 mb-1 inline-flex items-center gap-1">Получить с клиентов, ₽${helpIcon('Получить с клиентов', '<p>Желаемая итоговая сумма по ВСЕМ клиентским заявкам корзины (кроме «Личный заказ»). По кнопке «Применить» экран подбирает единый % комиссии на все эти заявки так, чтобы их сумма дала введённое число, и проставляет его — как если бы вы вписали процент на каждой заявке вручную.</p>')}</div>
            <div class="flex items-center gap-2">
              <input type="number" id="cart-desired-total-input" class="flex-1 bg-gray-50 rounded-lg px-2 py-1.5 text-sm outline-none" placeholder="0.00" step="0.01">
              <button type="button" id="cart-apply-desired-total-btn" class="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-medium hover:bg-indigo-700 transition-colors">Применить</button>
            </div>
          </div>
          <!-- §7 Фаза F — прогноз с учётом кредитов клиентов. Решение VASY
               (§0.1 п.4 плана): кредит НЕ вычитается из "Осталось получить"
               (та цифра — факт, не прогноз), он формируется только когда у
               клиента нет других открытых заказов, значит с высокой
               вероятностью уйдёт именно на этот. Строка скрыта, пока ни у
               одного клиента корзины кредита нет — не занимать место
               подсказкой, которая почти всегда неактуальна. -->
          <div id="cs-credit-forecast-row" class="hidden text-[11px] text-emerald-700 mb-3">
            С учётом кредитов клиентов — прогноз ≈ <b id="cs-remaining-with-credit" class="text-emerald-800">0.00</b> ₽
          </div>

          <div class="pt-2 border-t border-gray-100">
            <div class="text-[11px] text-gray-500">Прогноз логистики</div>
            <div class="text-sm font-semibold text-gray-900"><span id="cs-forecast-rub">0.00</span> ₽</div>
          </div>
          </div>
        </div>
      </div>
    `;

    // --- Общие поля шапки / курс ---
    const currencySelect = document.getElementById('cart-currency-select');
    const rateDisplay = document.getElementById('cart-rate-display');
    const rateDateCaptionEl = document.getElementById('cart-rate-date-caption');
    const dateInput = document.getElementById('cart-date-input');
    const totalRubDisplay = document.getElementById('cart-total-rub');
    const avgCommissionDisplay = document.getElementById('cart-avg-commission');
    // Липкая панель итогов (§4 C1) — новые DOM-ссылки, все ID введены этой
    // фазой кроме двух выше (cart-total-rub/cart-avg-commission — те же
    // элементы, что раньше жили в отдельной карте "Итого корзины", теперь
    // просто переехали внутрь новой разметки, e2e-локаторы не потребовали
    // правки для них самих).
    const csFeeRubEl = document.getElementById('cs-fee-rub');
    const csFeePctEl = document.getElementById('cs-fee-pct');
    const csClientRubEl = document.getElementById('cs-client-rub');
    const csSiteNoteEl = document.getElementById('cs-site-note');
    const csSiteDiffEl = document.getElementById('cs-site-diff');
    const csByClientListEl = document.getElementById('cs-by-client-list');
    const csPaidRubEl = document.getElementById('cs-paid-rub');
    const csRemainingRubEl = document.getElementById('cs-remaining-rub');
    const csForecastRubEl = document.getElementById('cs-forecast-rub');
    // §7 Фаза F.
    const csCreditForecastRowEl = document.getElementById('cs-credit-forecast-row');
    const csRemainingWithCreditEl = document.getElementById('cs-remaining-with-credit');
    const summaryToggleBtn = document.getElementById('cart-summary-toggle');
    const summarySheetEl = document.getElementById('cart-summary-sheet');
    // §4 C3 — пилюля вместо серого шеврона, подпись меняется на "Свернуть"
    // в раскрытом состоянии (сам шеврон, как и раньше, разворачивается на
    // 180deg — второй, избыточный сигнал того же состояния оставлен, он был
    // и раньше, менять незачем).
    const summaryToggleLabelEl = document.getElementById('cart-summary-toggle-label');
    // ИСПРАВЛЕНО 07.09.2026, ВТОРОЙ РАУНД (репорт VASY: "шторка должна
    // работать свайпом и плавно, а не нажатием" — первая версия свайпа
    // просто мгновенно переключала классом `hidden` при пересечении порога,
    // без слежения за пальцем и без анимации). Теперь высота
    // #cart-summary-sheet — управляемое JS число (px), не hidden-класс:
    // `summaryExpanded` — источник правды состояния, `sheetOpenHeightPx()`
    // измеряет РЕАЛЬНУЮ высоту содержимого (временно снимает инлайн-высоту,
    // читает `scrollHeight`, возвращает как было — внутренний `max-h-[55vh]`
    // на дочернем блоке уже сам ограничивает результат, второй раз ограничивать
    // не нужно). CSS-переход (`transition: height`, admin/app.html) отвечает
    // за анимацию тапа по пилюле/короткого тапа по язычку; во время
    // РЕАЛЬНОГО перетаскивания языка переход временно выключается классом
    // `.dragging` — иначе высота "гонится" за пальцем с опозданием на время
    // transition, а не 1:1, что и ощущается как "не работает свайпом".
    let summaryExpanded = false;
    function sheetOpenHeightPx() {
      const prevHeight = summarySheetEl.style.height;
      summarySheetEl.style.height = 'auto';
      const natural = summarySheetEl.scrollHeight;
      summarySheetEl.style.height = prevHeight;
      return natural;
    }
    function setSummaryExpanded(expanded) {
      summaryExpanded = expanded;
      summarySheetEl.style.height = expanded ? `${sheetOpenHeightPx()}px` : '0px';
      const chevronEl = document.getElementById('cart-summary-chevron');
      if (chevronEl) chevronEl.style.transform = expanded ? 'rotate(180deg)' : '';
      summaryToggleLabelEl.textContent = expanded ? 'Свернуть' : 'Подробнее';
    }
    summaryToggleBtn.addEventListener('click', () => setSummaryExpanded(!summaryExpanded));

    // "Язычок" для свайпа — ухватить полоску за верхней границей панели и
    // потянуть: панель растёт/сжимается ВМЕСТЕ с пальцем в реальном времени
    // (не по достижении порога), на отпускании "доезжает" (плавно, с
    // transition) до ближайшего из двух состояний. Pointer Events (не
    // отдельно touch/mouse) — единая обработка для тача И мыши/стилуса.
    // `setPointerCapture` — жест продолжает отслеживаться, даже если палец
    // уедет за пределы самой полоски (typical bottom-sheet drag handle).
    const dragHandleEl = document.getElementById('cart-summary-drag-handle');
    let dragStartY = null;
    let dragBaseHeight = 0; // высота панели в момент начала жеста
    let dragOpenHeight = 0; // высота полностью раскрытой панели (измеряется один раз на жест)
    let dragMoved = false;  // жест реально сдвинул высоту — отличить от простого тапа (см. click ниже)
    dragHandleEl.addEventListener('pointerdown', (e) => {
      dragStartY = e.clientY;
      dragMoved = false;
      dragBaseHeight = summarySheetEl.getBoundingClientRect().height;
      dragOpenHeight = sheetOpenHeightPx();
      summarySheetEl.classList.add('dragging'); // временно без transition — честное слежение 1:1 за пальцем
      dragHandleEl.setPointerCapture(e.pointerId);
    });
    dragHandleEl.addEventListener('pointermove', (e) => {
      if (dragStartY === null) return;
      const deltaY = dragStartY - e.clientY; // положительное — палец идёт ВВЕРХ (раскрывает)
      if (Math.abs(deltaY) > 3) dragMoved = true;
      const newHeight = Math.max(0, Math.min(dragOpenHeight, dragBaseHeight + deltaY));
      summarySheetEl.style.height = `${newHeight}px`;
    });
    function endSummaryDrag() {
      if (dragStartY === null) return;
      dragStartY = null;
      summarySheetEl.classList.remove('dragging'); // возвращаем transition — доезжает плавно до ближайшего состояния
      if (!dragMoved) return; // не двигали — это просто тап, решает click ниже
      const currentHeight = summarySheetEl.getBoundingClientRect().height;
      // Порог снижен 0.35→0.2 (08.09.2026, репорт VASY: "срабатывало легче
      // и на большем диапазоне") — раскрытие/закрытие фиксируется уже после
      // пятой части хода панели, а не трети.
      setSummaryExpanded(currentHeight >= dragOpenHeight * 0.2);
    }
    dragHandleEl.addEventListener('pointerup', endSummaryDrag);
    dragHandleEl.addEventListener('pointercancel', endSummaryDrag);
    // Короткий тап по язычку (без реального сдвига) — тоже переключает, тот
    // же UX, что кнопка-пилюля рядом, язычок ведь тоже часть панели.
    dragHandleEl.addEventListener('click', () => {
      if (dragMoved) { dragMoved = false; return; } // жест уже применил своё решение выше — не переключать второй раз
      setSummaryExpanded(!summaryExpanded);
    });

    // §5 D1 — "Свернуть все"/"Развернуть все".
    const collapseAllRowEl = document.getElementById('collapse-all-row');
    document.getElementById('collapse-all-btn').addEventListener('click', () => items.forEach((it) => it.setCollapsed(true)));
    document.getElementById('expand-all-btn').addEventListener('click', () => items.forEach((it) => it.setCollapsed(false)));

    // Прогноз расходов (§4 C1 "Прогноз логистики") — суммируется ТОЛЬКО по
    // отдельным позициям: строки внутри лота не имеют этих полей вообще
    // (прогноз лота считается на бэкенде одним вызовом на весь лот, см.
    // lotsService.createLot JSDoc) — суммировать там нечего. Список полей —
    // CartMoney.FORECAST_FIELD_KEYS (_cart-money.js, §5 D4) — общий с
    // _cart-position.js, не второй дубль.

    // Разметка «по клиентам»/«уже оплачено» (§4 C1) читает уже введённые
    // menedzherom значения (totalPaymentEl/alreadyPaidInputEl) НАПРЯМУЮ, не
    // пересчитывает их заново — та же величина, что складывается в
    // "Итого корзины"/"С клиентов" (см. updateSummaryDisplay), просто
    // сгруппирована по клиенту вместо суммы по всей корзине (C2 плана —
    // "панель показывает согласованную сумму из этих же полей").
    function clientKeyFor(entity, uidHint) {
      if (entity.ownPurchaseCheckboxEl.checked) return '__own__';
      // «На продаже» (IMPLEMENTATION-PLAN-ON-SALE.md §4.2) — своя группа,
      // ДО проверки telegramId/raw ниже. Без этой ветки on_sale-заявка
      // (telegramId/manualClientData пусты, поиск клиента пуст) попала бы в
      // '__empty__' — ту же группу, что настоящие нерешённые заявки, и
      // ложно словила бы предупреждение "без клиента" в сводке ниже.
      if (entity.onSale) return '__on_sale__';
      if (entity.telegramId) return `tg:${entity.telegramId}`;
      if (entity.manualClientData && entity.manualClientData.username) return `manual:${entity.manualClientData.username}`;
      const raw = entity.clientSearchEl.value.trim();
      if (!raw) return '__empty__';
      // Без подтверждённой идентичности (ни telegramId, ни username
      // вручную введённого клиента) свободный текст — НЕНАДЁЖНЫЙ ключ
      // группировки: два РАЗНЫХ клиента могут называться одинаково (найдено
      // целевым ревью перед деплоем, 06.09.2026) — группировка по тексту
      // молча сложила бы их деньги в одну сумму "Осталось получить".
      // Группируем по самой заявке (uidHint) — цена: одна и та же заявка,
      // введённая текстом дважды, покажется двумя строками вместо одной
      // (косметика), выигрыш — никогда не смешать деньги двух разных людей.
      return `row:${uidHint}`;
    }
    function clientLabelFor(entity) {
      if (entity.ownPurchaseCheckboxEl.checked) return 'Личный заказ';
      // «На продаже» (IMPLEMENTATION-PLAN-ON-SALE.md §4.2) — та же метка в
      // разбивке "по клиентам"/сводке перед сохранением, что «Личный заказ».
      if (entity.onSale) return 'На продаже';
      if (entity.manualClientData) return entity.manualClientData.name || entity.manualClientData.username || 'Клиент (вручную)';
      if (entity.name || entity.username) return entity.name || entity.username;
      return entity.clientSearchEl.value.trim() || 'Без клиента';
    }
    function collectClientRow(entity, uidHint) {
      // commissionWarning (§5 D5) — читает уже отрисованное DOM-состояние
      // подсказки гейта (`FormHelpers.wireCommissionGate`, `_form-helpers.js`)
      // вместо повторного вычисления порогов здесь — тот же
      // suffix-селектор, что уже используют e2e-тесты этого экрана
      // (`[id$="commission-hint-row"]`), работает одинаково и на позиции
      // (`idPrefix: pos${id}-`), и на строке лота (`lot${id}-row${rowId}-`)
      // без необходимости знать точный префикс здесь.
      const hintRow = entity.rowEl.querySelector('[id$="commission-hint-row"]');
      const hintText = entity.rowEl.querySelector('[id$="commission-hint-text"]');
      const commissionWarning = (hintRow && !hintRow.classList.contains('hidden') && hintText)
        ? hintText.textContent.trim()
        : null;
      return {
        key: clientKeyFor(entity, uidHint),
        label: clientLabelFor(entity),
        mainSum: parseFloat(entity.totalPaymentEl.value) || 0,
        alreadyPaid: parseFloat(entity.alreadyPaidInputEl.value) || 0,
        isOwnPurchase: entity.ownPurchaseCheckboxEl.checked,
        // «На продаже» (IMPLEMENTATION-PLAN-ON-SALE.md §4.2) — та же
        // семантика "платить некому", что «Личный заказ», для billableRows
        // ниже (сколько реально должны заплатить клиенты).
        isOnSale: !!entity.onSale,
        product: entity.productOriginal || entity.productSearchEl.value.trim() || '',
        commissionWarning,
        // §7 Фаза F — только подтверждённая идентичность (не ручной клиент,
        // не свободный текст) даёт telegramId, по которому вообще имеет
        // смысл спрашивать кредит/пул на сервере.
        telegramId: entity.telegramId || ''
      };
    }
    // Один общий проход по ВСЕМ заявкам корзины — позиция даёт одну строку,
    // лот даёт по одной строке на КАЖДУЮ свою позицию (r.getClientRows()).
    // Используется и липкой панелью итогов (updateSummaryPanelDetails), и
    // модалкой проверки перед сохранением (buildPreSaveSummary, §5 D5) —
    // один источник правды на оба места, не два независимых обхода items.
    function allEntityRows() {
      const rows = [];
      items.forEach((it) => {
        // Через собственный метод заявки (getClientRow/getClientRows), не
        // напрямую collectClientRow — та же публичная точка входа, что
        // документирована в JSDoc _cart-position.js/_cart-lot.js (найдено
        // целевым ревью: раньше позиция была единственным исключением,
        // getClientRow() существовал, но никогда не вызывался).
        if (it.type === 'position') rows.push(it.getClientRow());
        else rows.push(...it.getClientRows());
      });
      return rows;
    }

    // §6 Фаза E — заявки (и строки внутри лота), у которых не выбран
    // клиент и не отмечено «Личный заказ». Общий проход по items, тем же
    // принципом, что allEntityRows() — каждая сущность даёт 0..N записей
    // через свой собственный getUnresolvedClientRows() (позиция — 0 или 1,
    // лот — по одной на каждую пустую строку внутри).
    function collectUnresolvedClientRows() {
      const rows = [];
      items.forEach((it) => { if (it.getUnresolvedClientRows) rows.push(...it.getUnresolvedClientRows()); });
      return rows;
    }
    function groupRowsByClient(rows) {
      const byClient = new Map();
      rows.forEach((row) => {
        // telegramId одинаков для всех строк одного ключа (см. clientKeyFor —
        // `tg:${telegramId}` сам построен из него), безопасно взять с первой.
        const acc = byClient.get(row.key) || { label: row.label, mainSum: 0, alreadyPaid: 0, telegramId: row.telegramId || '' };
        acc.mainSum += row.mainSum;
        acc.alreadyPaid += row.alreadyPaid;
        byClient.set(row.key, acc);
      });
      return Array.from(byClient.values());
    }

    // §7 Фаза F — батч "кредит + свободный пул" по опознанным клиентам
    // корзины (getClientsMoneyContext, ordersService.js). Кэш на время жизни
    // экрана (клиент не меняет баланс за секунды оформления корзины —
    // повторный запрос по уже известному telegramId был бы расточительством),
    // дебаунс 500мс — не долбить сервер на каждое нажатие клавиши в поле
    // суммы, только когда реально меняется НАБОР опознанных клиентов.
    const clientMoneyCache = new Map(); // telegramId -> {creditRub, poolLeftoverRub}
    let clientMoneyFetchTimer = null;
    let clientMoneyFetchSignature = ''; // набор id, уже запланированный/в полёте — не задваивать тот же запрос
    function scheduleClientMoneyContextFetch(byClient) {
      const missingIds = Array.from(new Set(
        byClient.filter((r) => r.telegramId && !clientMoneyCache.has(r.telegramId)).map((r) => r.telegramId)
      ));
      if (missingIds.length === 0) return;
      const signature = missingIds.slice().sort().join(',');
      if (signature === clientMoneyFetchSignature) return; // тот же набор уже в работе
      clientMoneyFetchSignature = signature;
      if (clientMoneyFetchTimer) clearTimeout(clientMoneyFetchTimer);
      clientMoneyFetchTimer = setTimeout(async () => {
        try {
          const results = await callServer('getClientsMoneyContext', missingIds);
          if (signal.aborted) return; // экран уже покинут — не трогать DOM
          results.forEach((r) => clientMoneyCache.set(r.telegramId, { creditRub: r.creditRub, poolLeftoverRub: r.poolLeftoverRub }));
          clientMoneyFetchSignature = '';
          updateSummaryDisplay(); // перерисовать "по клиентам" уже со свежим кредитом/пулом
        } catch (error) {
          clientMoneyFetchSignature = ''; // сбой — не блокировать повторную попытку на следующее изменение набора
          console.error('getClientsMoneyContext: не удалось получить контекст клиентов', error);
        }
      }, 500);
    }

    // `rows`/`billableRows`/`clientTotalRub` — переданы, а не пересчитаны
    // заново (см. вызов в updateSummaryDisplay): один проход allEntityRows()
    // на всю сводку (найдено целевым ревью — раньше эта функция звала его
    // второй раз сама), и "Осталось получить" обязано совпадать с "С
    // клиентов" в свёрнутой строке — единый источник числа защищает от
    // расхождения из-за независимого округления.
    function updateSummaryPanelDetails(rows, billableRows, clientTotalRub) {
      const byClient = groupRowsByClient(rows); // список "по клиентам" — ВСЕ строки, включая "Личный заказ" (прозрачность, см. C1)
      const forecastTotal = items
        .filter((it) => it.type === 'position')
        .reduce((s, it) => s + CartMoney.FORECAST_FIELD_KEYS.reduce((s2, key) => s2 + (parseFloat(it[key].value) || 0), 0), 0);
      // §7 Фаза F — кредит/свободный пул на строку клиента, только если уже
      // известны (кэш заполняется асинхронно, см. scheduleClientMoneyContextFetch
      // ниже) и клиент опознан (telegramId). "внесено/осталось" — по этому же
      // клиенту (mainSum/alreadyPaid уже сгруппированы), F3 плана.
      csByClientListEl.innerHTML = byClient.length
        ? byClient.map((r) => {
            const moneyCtx = r.telegramId ? clientMoneyCache.get(r.telegramId) : null;
            const remaining = r.mainSum - r.alreadyPaid;
            return `
            <div class="py-1.5 border-b border-gray-50 last:border-0">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600 truncate">${escapeHtmlClient(r.label)}</span>
                <span class="font-medium text-gray-900 shrink-0 ml-2">${r.mainSum.toFixed(2)} ₽</span>
              </div>
              ${r.alreadyPaid > 0.004 ? `<div class="text-[11px] text-gray-400">внесено ${r.alreadyPaid.toFixed(2)} ₽ · осталось ${remaining.toFixed(2)} ₽</div>` : ''}
              ${moneyCtx && moneyCtx.creditRub > 0.004 ? `<div class="text-[11px] text-emerald-600">кредит ${moneyCtx.creditRub.toFixed(2)} ₽ — вероятно закроет часть этого заказа</div>` : ''}
              ${moneyCtx && moneyCtx.poolLeftoverRub > 0.004 ? `<div class="text-[11px] text-gray-400">в свободном пуле ${moneyCtx.poolLeftoverRub.toFixed(2)} ₽ — ждут довнесения по другим заказам</div>` : ''}
            </div>
          `;
          }).join('')
        : '<div class="text-sm text-gray-400 py-1">Пока нет заявок.</div>';

      // "Уже оплачено"/"Осталось получить" — ТОЛЬКО реальные клиенты (см.
      // billableRows в updateSummaryDisplay), тот же принцип, что "С
      // клиентов": личная покупка — не долг клиента, не считать её оплату/
      // остаток в эти цифры.
      const totalPaid = billableRows.reduce((s, r) => s + r.alreadyPaid, 0);
      const remainingRub = clientTotalRub - totalPaid;
      csPaidRubEl.textContent = totalPaid.toFixed(2);
      csRemainingRubEl.textContent = remainingRub.toFixed(2);
      csForecastRubEl.textContent = forecastTotal.toFixed(2);

      // §7 Фаза F4 (решение VASY §0.1 п.4) — кредит НЕ вычтен из
      // "Осталось получить" выше, показан отдельной прогнозной строкой.
      // Пул сюда намеренно не входит (F4/F5) — только справочная строка на
      // клиенте, в расчёт не берётся нигде.
      const totalCreditRub = byClient.reduce((s, r) => {
        const moneyCtx = r.telegramId ? clientMoneyCache.get(r.telegramId) : null;
        return s + (moneyCtx ? moneyCtx.creditRub : 0);
      }, 0);
      if (totalCreditRub > 0.004) {
        csCreditForecastRowEl.classList.remove('hidden');
        csRemainingWithCreditEl.textContent = Math.max(0, remainingRub - totalCreditRub).toFixed(2);
      } else {
        csCreditForecastRowEl.classList.add('hidden');
      }

      scheduleClientMoneyContextFetch(byClient);
    }

    // Русское множественное число ("1 заказ", "2 заказа", "5 заказов") —
    // §5 D5, сводка перед сохранением.
    function pluralRu(n, forms) {
      const mod10 = n % 10, mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 14) return forms[2];
      if (mod10 === 1) return forms[0];
      if (mod10 >= 2 && mod10 <= 4) return forms[1];
      return forms[2];
    }

    // §5 D5 — сводка ПЕРЕД отправкой (что будет создано + предупреждения),
    // показывается через showConfirmModal (common.js) — нативный confirm()
    // запрещён проектной конвенцией (см. project_bot_knopka_ux_audit_
    // 2026_08_19). Причина задачи из плана: сегодня менеджер узнаёт о
    // проблеме из тоста УЖЕ ПОСЛЕ частичного создания корзины, откатить
    // нечем — здесь только чтение уже введённого, ничего не блокирует
    // жёстко (жёсткие блокировки — раньше в saveCart(), эта сводка идёт
    // ПОСЛЕ них, только для заявок, которые уже прошли все обязательные
    // проверки).
    function buildPreSaveSummary() {
      const positions = items.filter((it) => it.type === 'position');
      const lots = items.filter((it) => it.type === 'lot');
      const rows = allEntityRows();
      const byClient = groupRowsByClient(rows);
      const grandTotal = byClient.reduce((s, r) => s + r.mainSum, 0);

      const lines = ['Будет создано:'];
      if (positions.length) lines.push(`• ${positions.length} ${pluralRu(positions.length, ['обычная позиция', 'обычные позиции', 'обычных позиций'])}`);
      if (lots.length) {
        const lotRowsCount = lots.reduce((s, it) => s + it.getClientRows().length, 0);
        lines.push(`• ${lots.length} ${pluralRu(lots.length, ['лот', 'лота', 'лотов'])} (${lotRowsCount} ${pluralRu(lotRowsCount, ['заявка', 'заявки', 'заявок'])} внутри)`);
      }

      lines.push('', 'По клиентам:');
      byClient.forEach((r) => lines.push(`${r.label} — ${r.mainSum.toFixed(2)} ₽`));
      lines.push('', `Итого: ${grandTotal.toFixed(2)} ₽`);

      const warnings = [];
      rows.forEach((r) => {
        if (r.key === '__empty__' && !r.isOwnPurchase) warnings.push(`без клиента: ${r.product || 'товар не указан'}`);
        if (r.mainSum <= 0) warnings.push(`нулевая сумма: ${r.product || 'товар не указан'}`);
        if (r.commissionWarning) warnings.push(`${r.product || 'товар не указан'} — ${r.commissionWarning}`);
      });
      if (lastSiteDiff.active && Math.abs(lastSiteDiff.diffRub) >= 0.01) {
        warnings.push(`расхождение с итогом сайта выкупа: ${lastSiteDiff.diffRub > 0 ? '+' : ''}${lastSiteDiff.diffRub.toFixed(2)} ₽`);
      }
      // G2 (§8 плана) — мягкая подсказка, не гейт (сохранение не
      // блокируется), тот же критерий "пусто", что и точка на кнопке
      // сохранения (updateSiteTotalBadge).
      if (!(parseFloat(siteTotalInput.value) > 0)) {
        warnings.push('итог с сайта выкупа не заполнен — разница не разнесена');
      }
      if (warnings.length) {
        lines.push('', '⚠ Проверьте перед созданием:');
        warnings.forEach((w) => lines.push(`• ${w}`));
      }

      return lines.join('\n');
    }

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

    // rateRequestSeq — ОБЩИЙ гвард от гонки между "Обновить курс" (кнопка)
    // и сменой "Дата выкупа" (найдено ДВУМЯ раундами целевого ревью перед
    // деплоем — первый раунд поставил гвард только внутри
    // refreshRateForDate, второй нашёл, что refreshRate() тоже пишет
    // currentRates/дёргает hideRateDateCaption() БЕЗ него: если запрос по
    // дате уйдёт первым, а начальный refreshRate() на монтировании экрана
    // ответит позже — курс и подпись "курс на DD.MM.YYYY" молча
    // перезатирались бы текущим, хотя поле даты по-прежнему показывает
    // выбранную дату). Общий на обе функции — какая бы ни завершилась
    // последней ИЗ РЕАЛЬНО ЗАПУЩЕННЫХ, та и победит, независимо от того,
    // какая из двух это была. `pendingRateRequests` — счётчик одновременно
    // летящих запросов (ТРЕТИЙ раунд ревью): спиннер гасится, только когда
    // ПОСЛЕДНИЙ из них завершился — иначе устаревший ответ мог погасить
    // иконку, пока ещё летит более свежий запрос.
    let rateRequestSeq = 0;
    let pendingRateRequests = 0;

    function beginRateSpin() {
      pendingRateRequests++;
      const icon = document.getElementById('cart-refresh-rate').querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
    }
    function endRateSpin() {
      pendingRateRequests = Math.max(0, pendingRateRequests - 1);
      if (pendingRateRequests > 0) return; // ещё летит другой запрос — рано гасить
      const icon = document.getElementById('cart-refresh-rate').querySelector('svg');
      if (icon) icon.classList.remove('animate-spin');
    }

    // Кнопка "Обновить курс" (иконка рядом с курсом) — сбрасывает кэш и
    // читает ТЕКУЩИЙ курс, дата "Дата выкупа" здесь не участвует (§6 плана,
    // Раунд 2 CART-UX-2, фаза E, 07.09.2026 — сознательно, ручное
    // "обновить" всегда должно означать "самый свежий курс"). Курс по
    // выбранной дате — отдельная связка ниже, на change у #cart-date-input.
    async function refreshRate() {
      const mySeq = ++rateRequestSeq;
      beginRateSpin();
      try {
        const rates = await callServer('refreshRate');
        if (mySeq !== rateRequestSeq) return; // устарел — курс/дата уже сменились снова
        if (rates && rates.finalRates) {
          currentRates = rates.finalRates;
          applyCurrentCurrencyRate();
          hideRateDateCaption(); // "Обновить" всегда возвращает ТЕКУЩИЙ курс — подпись про дату больше не актуальна
        }
      } catch (error) {
        if (mySeq !== rateRequestSeq) return; // устарел — не показывать ошибку поверх уже выигравшего более свежего запроса
        showSaveToast(false, `Не удалось обновить курсы валют: ${error.message}`);
      } finally {
        endRateSpin();
      }
    }

    // @returns {boolean} применился ли курс ТЕКУЩЕЙ валюты корзины
    function applyCurrentCurrencyRate() {
      const rawRate = currentRates[currentCurrency];
      if (rawRate === undefined || rawRate === '') return false;
      const parsed = parseFloat(rawRate.toString().replace(',', '.'));
      if (isNaN(parsed)) return false;
      currentRate = parsed;
      rateDisplay.textContent = currentRate.toFixed(2);
      items.forEach((item) => item.onRateChanged());
      recomputeTotals();
      return true;
    }

    function hideRateDateCaption() {
      if (!rateDateCaptionEl) return;
      rateDateCaptionEl.classList.add('hidden');
      rateDateCaptionEl.textContent = '';
    }

    // E3 (§6 плана) — реальный дефект: <input type=date> отдаёт
    // "YYYY-MM-DD", а parseRuDateToIso раньше понимала только "dd.MM.yyyy"
    // -> курс по "Дате выкупа" молча не работал НИКОГДА, ни здесь, ни в
    // order-new.js/lot-new.js. parseRuDateToIso расширена на бэкенде
    // (принимает оба формата); здесь — сама связка: смена даты сразу
    // подтягивает курс НА ЭТУ ДАТУ, чтобы менеджер видел его ДО сохранения,
    // не постфактум в заказе. Гвард от гонки — rateRequestSeq выше.
    async function refreshRateForDate() {
      const isoDate = dateInput.value || null;
      const mySeq = ++rateRequestSeq;
      beginRateSpin();
      try {
        const result = await callServer('getRatesForDate', isoDate);
        if (mySeq !== rateRequestSeq) return; // устарел — курс/дата уже сменились снова
        if (!result || !result.finalRates) {
          hideRateDateCaption();
          return;
        }
        currentRates = result.finalRates;
        // Backend (computeCrossRates) МОЖЕТ отдать finalRates без КОНКРЕТНО
        // текущей валюты корзины (наценка/сырой курс на эту дату для неё не
        // настроены/отсутствуют) — applyCurrentCurrencyRate тогда не трогает
        // экран вообще (третий раунд ревью: раньше подпись "курс на ..."
        // всё равно показывалась бы поверх СТАРОГО, не обновившегося курса).
        const applied = applyCurrentCurrencyRate();
        if (!applied) {
          showSaveToast(false, `Для валюты "${currentCurrency}" нет курса на выбранную дату — показан прежний курс.`);
          hideRateDateCaption();
          return;
        }
        if (rateDateCaptionEl) {
          if (!isoDate) {
            // Поле "Дата выкупа" очищено (не то же самое, что "нет истории
            // на эту дату" — дата вообще не задана), другая формулировка
            // (найдено целевым ревью 07.09.2026 — раньше обе ветки делили
            // один и тот же amber-текст про "нет истории").
            hideRateDateCaption();
          } else if (result.isFallback) {
            rateDateCaptionEl.textContent = 'истории курса на эту дату нет, взят текущий';
            rateDateCaptionEl.className = 'text-[11px] text-right mt-0.5 text-amber-600';
            rateDateCaptionEl.classList.remove('hidden');
          } else {
            const [y, m, d] = result.rateDateUsed.split('-');
            rateDateCaptionEl.textContent = `курс на ${d}.${m}.${y}`;
            rateDateCaptionEl.className = 'text-[11px] text-right mt-0.5 text-gray-400';
            rateDateCaptionEl.classList.remove('hidden');
          }
        }
      } catch (error) {
        if (mySeq !== rateRequestSeq) return;
        showSaveToast(false, `Не удалось получить курс на дату: ${error.message}`);
      } finally {
        endRateSpin();
      }
    }

    document.getElementById('cart-refresh-rate').addEventListener('click', refreshRate);
    currencySelect.addEventListener('change', (e) => { currentCurrency = e.target.value; applyCurrentCurrencyRate(); });
    dateInput.addEventListener('change', refreshRateForDate);
    refreshRate();

    // searchClientStub/searchReleaseStub удалены (§5 D4, найдено вторым
    // раундом целевого ревью) — были мёртвым кодом после переноса позиции/
    // лота в _cart-position.js/_cart-lot.js: обе теперь зовут
    // callServer('searchClients'/'searchSku', query) напрямую на месте.

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

      // Найдено целевым ревью перед деплоем 06.09.2026 — ДВА реальных
      // денежных бага в наивном `parseFloat(value) || 0`:
      // 1. Очистка поля (backspace до пусто) давала `manualRub = 0`, не
      //    `null` — заявка оставалась "вручную" с НУЛЕВОЙ базой вместо
      //    возврата в "авто" (0 и "не указано" неразличимы через `|| 0`).
      // 2. Отрицательное число принималось как есть и уходило в
      //    fixedShareRub без пола — отрицательная база/комиссия на сервере.
      // Пустое поле — явный возврат в "авто" (как кнопка "Сбросить"), не
      // NaN-в-0. Отрицательное — обрезается в 0 (та же граница, что уже
      // есть у остальных денежных полей экрана, см. feeRubFromPercent и
      // т.п. в _cart-money.js).
      inputEl.addEventListener('input', () => {
        const raw = inputEl.value.trim();
        if (raw === '') {
          manualRub = null;
          setModeDisplay(false);
        } else {
          const parsed = parseFloat(raw);
          manualRub = isNaN(parsed) ? null : Math.max(0, parsed);
          setModeDisplay(manualRub !== null);
        }
        if (onChangeCb) onChangeCb();
      });
      // Обрезка отрицательного значения в самом поле — только на blur (не
      // на каждый 'input'), тот же принцип, что clampTotalOnBlur (§2 A1):
      // переписывать значение прямо во время набора сбивало бы курсор
      // менеджера. Внутреннее состояние (`manualRub`) уже обрезано выше —
      // это только синхронизация видимого значения с тем, что реально уйдёт
      // на сервер.
      inputEl.addEventListener('blur', () => {
        if (manualRub !== null && inputEl.value !== '') {
          inputEl.value = manualRub.toFixed(2);
        } else if (manualRub === null && onChangeCb) {
          // Поле только что вернулось в "авто" (очищено вручную, не кнопкой
          // "Сбросить") — `setAutoPreview` внутри пересчёта пропускала
          // запись, пока поле было в фокусе (не перезаписывать то, что
          // менеджер печатает); фокус только что ушёл — самое время
          // показать живой предпросмотр вместо пустого поля.
          onChangeCb();
        }
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
    // Последнее известное расхождение "Итог с сайта выкупа" ↔ сумма позиций
    // (§4 C1) — читается свёрнутой строкой липкой панели (амбер-бейдж/серая
    // подсказка "итог сайта не указан"), пишется ТОЛЬКО из
    // recomputeSiteTotalReconciliation ниже — тот же расчёт, что уже делает
    // siteTotalDiffEl, просто сохранённый, чтобы updateSummaryDisplay могла
    // прочитать его же, не пересчитывая diff второй раз.
    let lastSiteDiff = { active: false, diffRub: 0 };

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
      const feePercent = effectiveTotalRub > 0 ? (totalCommission / effectiveTotalRub) * 100 : 0;
      totalRubDisplay.textContent = effectiveTotalRub.toFixed(2);
      // C3 (§4 плана) — раньше "20.0% (2400.00 ₽)" читалось как «20% это
      // 2400 ₽» (репорт из плана). Две ЯВНО подписанные величины вместо
      // одной с процентом в скобках.
      avgCommissionDisplay.textContent = effectiveTotalRub > 0
        ? `ставка ${feePercent.toFixed(1)}% · сумма комиссии ${totalCommission.toFixed(2)} ₽`
        : '—';

      // C1 (§4 плана) — липкая панель итогов, свёрнутая строка. "Выкуп"/
      // "Комиссия" — те же effectiveTotalRub/totalCommission, что и блок
      // выше (агрегат по ВСЕЙ корзине, включая личные заказы — та же
      // семантика, что "Итого корзины" с Фазы A, не новая).
      csFeeRubEl.textContent = totalCommission.toFixed(2);
      csFeePctEl.textContent = `${feePercent.toFixed(1)}%`;

      // "С клиентов"/"Осталось получить" — ДРУГАЯ величина: сколько реально
      // должны заплатить клиенты, БЕЗ личных заказов ("Личный заказ" — сам
      // менеджер, платить некому). Найдено целевым ревью перед деплоем
      // 06.09.2026 — раньше клиентский тотал считался как effectiveTotalRub+
      // totalCommission (та же сумма, что "Выкуп"+"Комиссия"), что молча
      // включало личные покупки в "долг клиентов". Считается по строкам
      // (allEntityRows), не по заявкам — лот может содержать И клиентские, И
      // личные строки одновременно, на уровне заявки такое не отфильтровать.
      const rows = allEntityRows();
      const billableRows = rows.filter((r) => !r.isOwnPurchase && !r.isOnSale);
      const clientTotalRub = billableRows.reduce((s, r) => s + r.mainSum, 0);
      csClientRubEl.textContent = clientTotalRub.toFixed(2);

      csSiteNoteEl.classList.toggle('hidden', lastSiteDiff.active);
      const showDiffBadge = lastSiteDiff.active && Math.abs(lastSiteDiff.diffRub) >= 0.01;
      csSiteDiffEl.classList.toggle('hidden', !showDiffBadge);
      if (showDiffBadge) {
        csSiteDiffEl.textContent = `≠ сайт: ${lastSiteDiff.diffRub > 0 ? '+' : ''}${lastSiteDiff.diffRub.toFixed(2)} ₽`;
      }
      updateSiteTotalBadge(); // G2 — та же точка эмиссии, что остальная сводка

      // rows уже посчитаны выше — передаём дальше, не считаем allEntityRows()
      // второй раз в updateSummaryPanelDetails (найдено тем же ревью).
      updateSummaryPanelDetails(rows, billableRows, clientTotalRub);

      // §5 D1 — строка сводки на свёрнутой/развёрнутой карточке (позиция и
      // лот) обновляется тем же общим проходом, что и вся остальная сводка
      // экрана — не отдельным набором слушателей на каждое поле.
      items.forEach((it) => { if (it.updateCardSummaryText) it.updateCardSummaryText(); });
      // "Свернуть все"/"Развернуть все" — видны только когда есть что
      // сворачивать (то же место, где уже гарантированно известна
      // актуальная длина items после любого add/remove).
      collapseAllRowEl.classList.toggle('hidden', items.length === 0);
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
    // необязательное поле, теперь в ШАПКЕ корзины (§5 D1,
    // IMPLEMENTATION-PLAN-CART-UX-2.md, 07.09.2026 — переехало из
    // сворачиваемой панели итогов, это ВВОД, не итог). Пусто — ничего не
    // меняется визуально, сумма заявок остаётся единственным источником
    // "Итого". Заполнено — показывает разницу с суммой позиций и живую
    // разбивку по каждой заявке (та же формула/тот же UX, что уже есть
    // внутри лота — здесь ровно на уровень выше). Ничего не отправляется на
    // сервер отдельно — `buildPayload()` читает это же поле напрямую в
    // header.
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

    // G2 (§8 плана) — точка на кнопке сохранения, пока «Итог с сайта
    // выкупа» пуст (разница не разнесена по заявкам). Вызывается из
    // updateSummaryDisplay (тот же общий проход, что и остальная сводка) +
    // один раз на монтировании экрана (siteTotalInput стартует пустым).
    const siteTotalBadgeEl = document.getElementById('cart-site-total-badge');
    function updateSiteTotalBadge() {
      siteTotalBadgeEl.classList.toggle('hidden', parseFloat(siteTotalInput.value) > 0);
    }

    // Правило деления разницы (§2 A2, IMPLEMENTATION-PLAN-CART-UX-2.md,
    // 07.09.2026, решение VASY §0.1 п.1) — сохраняется в localStorage, НЕ в
    // `financial_settings`: менеджеру запись настроек запрещена
    // (`upsertFinancialSetting` в `MANAGER_EXCLUDED_METHODS`,
    // `api/contract.js`), а это чисто личное предпочтение экрана.
    let diffSplitMode = localStorage.getItem('cartDiffSplitMode') || 'amount';
    const diffSplitRowEl = document.getElementById('cart-diff-split-row');
    const diffAmountEl = document.getElementById('cart-diff-amount');
    const diffModeButtons = Array.from(document.querySelectorAll('.cart-diff-mode-btn'));
    function updateDiffModeButtons() {
      diffModeButtons.forEach((btn) => {
        const active = btn.dataset.mode === diffSplitMode;
        btn.classList.toggle('bg-indigo-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-gray-600', !active);
      });
    }
    updateDiffModeButtons();
    diffModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (diffSplitMode === btn.dataset.mode) return;
        diffSplitMode = btn.dataset.mode;
        localStorage.setItem('cartDiffSplitMode', diffSplitMode);
        updateDiffModeButtons();
        recomputeTotals();
      });
    });

    // Вес заявки для разбивки разницы (§2 A3) — звать ВЕЗДЕ вместо
    // it.getCostCoefficient() при разбивке разницы КОРЗИНЫ (не путать с
    // getCostCoefficient(), которая осталась как есть — её по-прежнему
    // читает getPayload() заявки для ДРУГОЙ цели, см. A5/JSDoc заявок).
    // Сама формула — в screens/_cart-money.js (чистая функция, unit-тесты,
    // §10 плана), здесь только тонкая обёртка под DOM-заявку.
    function diffWeightFor(it) {
      return CartMoney.diffWeightFor(diffSplitMode, it.getManualRub ? it.getManualRub() : null, it.getTotalRub());
    }

    // §3 B1 (IMPLEMENTATION-PLAN-CART-UX-2.md, 07.09.2026) — подпись "Доля
    // разницы (по сумме · N%)" на карточке заявки: человеческое название
    // текущего режима + доля ЭТОЙ заявки от общего пула ВЕСОВ (не от суммы
    // разницы в рублях — то же число, что реально использует
    // splitProportionallyClient внутри). normalizeDegenerateWeights — та же
    // функция, что уже применяет recomputeSiteTotalReconciliation перед
    // вызовом splitProportionallyClient, читает те же веса, что реально
    // легли в основу текущей разбивки — не отдельный, рассинхронизирующийся
    // расчёт.
    function diffSplitModeLabel() {
      return diffSplitMode === 'amount' ? 'по сумме' : 'поровну';
    }
    function diffSharePercentFor(it) {
      if (items.length === 0) return 0;
      const rows = CartMoney.normalizeDegenerateWeights(items.map((x) => ({ id: x.id, weight: diffWeightFor(x) })));
      const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
      if (totalWeight <= 0) return 0;
      const myRow = rows.find((r) => r.id === it.id);
      return myRow ? (myRow.weight / totalWeight) * 100 : 0;
    }

    function recomputeSiteTotalReconciliation(totalRub) {
      if (reconciling) return; // см. guard выше
      const raw = parseFloat(siteTotalInput.value);
      const active = raw > 0;
      items.forEach((it) => { if (it.coefBlockEl) it.coefBlockEl.classList.toggle('hidden', !active); });
      diffSplitRowEl.classList.toggle('hidden', !active);

      reconciling = true;
      try {
        if (!active) {
          lastSiteDiff = { active: false, diffRub: 0 };
          siteTotalDiffEl.classList.add('hidden');
          items.forEach((it) => it.setReconciledShareRub(null));
          return;
        }

        const poolRub = raw * currentRate;
        const diffRub = poolRub - totalRub;
        lastSiteDiff = { active: true, diffRub };
        siteTotalDiffEl.classList.remove('hidden');
        siteTotalDiffEl.textContent = Math.abs(diffRub) < 0.01
          ? 'Совпадает с суммой позиций.'
          : `Расходится с суммой позиций на ${diffRub > 0 ? '+' : ''}${diffRub.toFixed(2)} ₽ — разница делится по долям ниже.`;
        diffAmountEl.textContent = `${diffRub > 0 ? '+' : ''}${diffRub.toFixed(2)} ₽`;

        // A4, вырожденный случай (ни у одной неручной заявки не введена
        // сумма в режиме 'amount', либо все заявки зафиксированы вручную)
        // — normalizeDegenerateWeights пересобирает веса в 1, молча, см.
        // её JSDoc в _cart-money.js.
        const rows = CartMoney.normalizeDegenerateWeights(
          items.map((it) => ({ id: it.id, weight: diffWeightFor(it), basePrice: it.getTotalRub() }))
        );
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

    // G1 (§8 IMPLEMENTATION-PLAN-CART-UX-2.md, 08.09.2026) — обратный
    // пересчёт «Получить с клиентов, ₽». Собирает ВСЕ клиентские заявки
    // (позиции и строки лота — каждая своей getFeeTargets(), см. их JSDoc
    // в _cart-position.js/_cart-lot.js), кроме «Личный заказ» (getFeeTargets
    // сама возвращает [] для них). Один % комиссии на все сразу — линейное
    // уравнение (percent один, база известна) решается одной формулой, без
    // итераций: Σ(base_i × (1+p/100)) = желаемыйИтог ⇒
    // p = (желаемыйИтог / Σbase_i − 1) × 100.
    const desiredTotalInput = document.getElementById('cart-desired-total-input');
    const applyDesiredTotalBtn = document.getElementById('cart-apply-desired-total-btn');
    function feeTargetsForDesiredTotal() {
      return items.flatMap((it) => (it.getFeeTargets ? it.getFeeTargets() : []));
    }
    function applyDesiredClientTotal() {
      const desiredTotalRub = parseFloat(desiredTotalInput.value);
      if (!(desiredTotalRub > 0)) { showSaveToast(false, 'Введите желаемую сумму больше нуля.'); return; }
      const targets = feeTargetsForDesiredTotal();
      const sumBaseRub = targets.reduce((s, t) => s + (t.getBaseRub() || 0), 0);
      // Вырожденный случай (план §8) — нет ни одной клиентской заявки с
      // известной базой (пусто/все «Личный заказ»/все базы по нулям) —
      // тихий no-op с тостом, не деление на ноль.
      if (sumBaseRub <= 0) { showSaveToast(false, 'Нет клиентских заявок для пересчёта.'); return; }
      const feePercent = (desiredTotalRub / sumBaseRub - 1) * 100;
      // Желаемая сумма меньше стоимости позиций — потребовала бы
      // отрицательную комиссию (продажа в минус), сами fee*-функции
      // (_cart-money.js) обрежут итоговую комиссию₽ в 0, но показывать
      // отрицательный процент на карточках было бы вводящим в заблуждение
      // — отказ вместо тихого искажения.
      if (feePercent < 0) {
        showSaveToast(false, `Сумма меньше стоимости заявок (${sumBaseRub.toFixed(2)} ₽) — комиссия не может быть отрицательной.`);
        return;
      }
      targets.forEach((t) => t.setFeePercent(feePercent));
      recomputeTotals();
      showSaveToast(true, `Комиссия ${feePercent.toFixed(2)}% применена ко всем клиентским заявкам (${targets.length}).`);
    }
    applyDesiredTotalBtn.addEventListener('click', applyDesiredClientTotal);

    const itemsList = document.getElementById('cart-items-list');

    // §5 D4 (IMPLEMENTATION-PLAN-CART-UX.md, ответ на вопрос VASY про
    // god-файлы, план §9 п.8) — карточки "Позиция"/"Лот" вынесены в
    // отдельные модули (_cart-position.js/_cart-lot.js, см. их JSDoc за
    // полным описанием контракта) — cart-new.js остаётся оркестратором
    // (шапка корзины, липкая панель итогов, сохранение). `cartItemCtx` —
    // единственный канал связи с состоянием экрана, которым владеет этот
    // файл: `items`/`itemsList` — общий массив заявок и его DOM-
    // контейнер (та же ссылка, что здесь — .push()/.length видны сразу
    // без второго источника правды), `nextItemId` — общий на позиции И
    // лоты счётчик id, `getCurrentRate`/`getCurrentCurrency` — геттеры
    // (курс/валюта меняются ПОСЛЕ создания карточки, шапка экрана),
    // остальное — уже существующие функции этого файла, переданные как
    // есть (объявлены как `function`, поднимаются — ссылка ниже по
    // тексту, включая `removeItem`, безопасна).
    const cartItemCtx = {
      items, itemsList,
      nextItemId: () => ++itemSeq,
      getCurrentRate: () => currentRate,
      getCurrentCurrency: () => currentCurrency,
      recomputeTotals, updateSummaryDisplay, removeItem,
      clientLabelFor, collectClientRow, wireManualShareControl, currentChannel,
      // §2 A5 — вес заявки для payload'а costCoefficient (разбивка разницы
      // КОРЗИНЫ), используется getPayload() и позиции, и лота вместо
      // жёсткой "1" — см. их JSDoc/_cart-money.js.
      diffWeightFor,
      // §3 B1 — читаемая выкладка на карточке ("Доля разницы (по сумме ·
      // N%)"), используется и позицией, и лотом целиком (НЕ строками ВНУТРИ
      // лота — там своя, слайдерная разбивка без переключателя режима, §3 B5).
      diffSplitModeLabel, diffSharePercentFor
    };

    function removeItem(id) {
      const idx = items.findIndex((it) => it.id === id);
      if (idx === -1) return;
      items[idx].rowEl.remove();
      items.splice(idx, 1);
      recomputeTotals();
    }

    document.getElementById('add-position-btn').addEventListener('click', () => CartPosition.create(cartItemCtx));
    document.getElementById('add-lot-btn').addEventListener('click', () => CartLot.create(cartItemCtx));

    // Предзаполнение из "Спрос клиентов" (слияние «Новый заказ»→«Корзина»,
    // 05.09.2026, wishlist-demand.js теперь ведёт сюда вместо orders/new) —
    // тот же набор параметров, что раньше читал order-new.js:1699-1719.
    if (params && (params.telegramId || params.skuOriginal || params.productOriginal)) {
      const prefillClient = params.telegramId ? {
        telegramId: params.telegramId, username: params.username || '', name: params.name || '',
        display: (params.name && params.username) ? `${params.name} (${params.username})` : (params.name || params.username || 'Клиент')
      } : null;
      const item = CartPosition.create(cartItemCtx, prefillClient);
      if (params.skuOriginal) {
        item.productSearchEl.value = params.productDisplay || params.skuOriginal;
        item.productOriginal = params.skuOriginal;
      } else if (params.productOriginal) {
        item.productSearchEl.value = params.productOriginal;
        item.productOriginal = params.productOriginal;
      }
      if (params.wishlistId) item.wishlistId = params.wishlistId;
    } else {
      CartPosition.create(cartItemCtx); // одна позиция сразу — заказ по умолчанию не тяжелее сегодняшнего (§4 плана)
    }
    // §4 C1 — без этого явного вызова разбивка "по клиентам" внутри липкой
    // панели осталась бы пустой (не "Пока нет заявок.", а буквально пустой
    // div) до первого реального ввода: bootstrap-добавление позиции выше
    // само по себе recomputeTotals не вызывает.
    updateSummaryDisplay();

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
    // §6 Фаза E — одна модалка на весь экран, инициализируется один раз
    // (тот же приём, что ManualClientModal/SkuModal, `_ensureHelpModal` в
    // common.js) — `init()` вешает слушатели на кнопки модалки, повторный
    // вызов на каждое сохранение задвоил бы их.
    const clientRequiredModal = ClientRequiredModal.init();

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

      // §6 Фаза E — пустой клиент без «Личного заказа» раньше тихо уходил
      // на сервер (репорт плана "заявка тихо уходит с пустым клиентом").
      // Блокируем ДО отправки, требуем явный выбор по КАЖДОЙ такой заявке
      // (и по каждой пустой строке внутри лота отдельно — см.
      // getUnresolvedClientRows). «На продаже» (IMPLEMENTATION-PLAN-ON-SALE.md,
      // 08.09.2026) — второй рабочий выбор наряду с «Личный заказ». ВАЖНО:
      // этот шаг — ДО комиссионного гейта ниже, чтобы заявки, переведённые в
      // «Личный заказ»/«На продаже», сразу были исключены из проверки
      // комиссии (тот же принцип, что уже применяется к изначально
      // отмеченным вручную «Личный заказ» заявкам).
      const unresolvedClientRows = collectUnresolvedClientRows();
      if (unresolvedClientRows.length) {
        const resolutions = await clientRequiredModal.open(unresolvedClientRows.map(({ id, label }) => ({ id, label })));
        if (!resolutions) return; // «Вернуться к правке» — сохранение прервано целиком
        const byId = new Map(unresolvedClientRows.map((r) => [r.id, r]));
        resolutions.forEach((res) => {
          const row = byId.get(res.id);
          if (!row) return;
          if (res.kind === 'own') row.markOwnPurchase();
          else if (res.kind === 'on_sale') row.markOnSale();
        });
      }

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

      // §5 D5 — сводка перед отправкой: что будет создано + мягкие
      // предупреждения (жёсткие блокировки уже прошли выше). "Вернуться к
      // правке" просто прерывает saveCart(), ничего не уходит на сервер.
      const confirmed = await showConfirmModal(buildPreSaveSummary(), { confirmLabel: 'Создать', cancelLabel: 'Вернуться к правке' });
      if (!confirmed) return;

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
