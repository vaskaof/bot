'use strict';

/**
 * Экран "Коллективка" — адресуемый маршрут `collectives/{id}` (Э2
 * рефакторинга коллективок, 24.08.2026, REFACTOR-COLLECTIVES.md §6.1),
 * заменяет `collective-detail-modal` из `collectives.js` (та модалка и весь
 * код связанных ползунков сверки вырезаны оттуда тем же срезом). Решает
 * прямую жалобу VASY "ушёл в заказ из коллективки, вернулся в закрытую
 * модалку" — тап по карточке заказа ведёт на настоящий `orders/{id}/edit`,
 * "Назад" там — обычный `history.back()`, который сам возвращает сюда
 * (оба перехода — реальные записи в history, не replace). Доп. правка
 * 25.08.2026 (тот же класс жалобы, но после РЕДАКТИРОВАНИЯ, не только
 * "Назад" без изменений) — "Сохранить"/"Удалить" на order-edit.js раньше
 * жёстко уводили на "Заказы" независимо от места входа; заменены на
 * `navigateBack()` (router.js), которая тоже возвращает сюда.
 *
 * Единый список заказов (п.3 Э2) — раньше было два разных рендера одних и
 * тех же заказов (список заказов коллективки + список для сверки долей),
 * VASY явно попросил объединить. Источник данных — ДВА вызова
 * (getCollectiveDetails + getCollectiveLogisticsContext), тот же принцип,
 * что был в старой модалке (openDetailModal + loadLogisticsSection), но
 * рендерятся уже ОДНИМ списком карточек, не двумя.
 *
 * Доли — ползунок 0…2 шаг 1/4 (§1 п.2, §2.4; диапазон расширен 1→2
 * 25.08.2026 по запросу VASY — "1" была потолком шкалы, стала серединой:
 * 0 = не участвует, 1 = обычный вес заказа, 2 = вдвое тяжелее обычного; шаг
 * тем же днём доп. правкой сужен 1/8→1/4 — 8 позиций ползунка на весь
 * диапазон вместо 16, репорт VASY "слишком дробно"),
 * сохраняется В ЗАКАЗ с дебаунсом ~600мс через setOrderLogisticsUnits,
 * ОТДЕЛЬНО от "Сохранить сверку" (та пишет только денежные проводки).
 * Алгоритм связанных ползунков (redistributeShares/normalizeSharesSum/
 * updateSliderPositions) с долями не нужен — нормализация теперь на сервере
 * (доля_i = units_i/Σunits, §2.4) — поэтому "2" не гарантирует буквально
 * "вдвое дороже в деньгах" независимо от чужих ползунков в этой же
 * коллективке, это вес ОТНОСИТЕЛЬНО остальных заказов; подсказка у самого
 * поля (см. ниже) формулирует это без слова "нормализация".
 *
 * Находка D (план §0/§5 Q9, подтверждено VASY 24.08.2026) — сверка не
 * двигает цель оплаты клиента автоматически ни в одной модели, поэтому
 * карточка заказа и итоговый баннер после сохранения показывают перерасход/
 * недорасход СИММЕТРИЧНО, явным текстом с действием ("довзыщите"/"возможен
 * возврат"), а не просто цветной цифрой, как было в Э1-версии модалки.
 *
 * Множественный выбор + массовые действия (Э3, 24.08.2026,
 * REFACTOR-COLLECTIVES.md §3) — тот же режим "Выбрать" + чекбоксы, что
 * `orders.js`, здесь только два действия ("Убрать из коллективки"/
 * "Перенести в другую", п.2 Э3), без "Удалить" (массовое удаление — только
 * с экрана "Заказы"). Одиночные действия (крестик на карточке, "Добавить
 * заказ" через поиск) тоже получили подтверждение здесь же — раньше "Убрать"
 * срабатывало без единого вопроса, но с этим срезом молча пишет
 * корректирующую проводку сверки (авто-пересчёт, см. `financeService.
 * recalculateCollectiveReconciliation`), это уже не "бесплатное" действие.
 */
window.Screens = window.Screens || {};
window.Screens.collectiveDetail = {
  render(root, dictionaries, params, signal) {
    const collectiveId = params.collectiveId;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 truncate" id="header-title">Коллективка</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto space-y-3">
        <!-- Общая датаlist для всех ползунков доли (§1 п.2, диапазон 0…2 с
             25.08.2026, шаг сужен 1/8→1/4 доп. правкой тем же днём — 8 шагов
             ползунка на весь диапазон, не 16, по прямому запросу VASY) —
             засечки на каждый шаг 1/4; поддерживается не везде (Safari/iOS
             WebView даталист-засечки для range не рисует вообще), поэтому
             под каждым ползунком ЕЩЁ и статичная текстовая шкала
             "0 · ½ · 1 (обычный) · 1½ · 2 (вдвое)" ниже — единственный
             надёжный кросс-платформенный вариант в Telegram Mini App. -->
        <datalist id="units-ticks">
          <option value="0"></option><option value="0.25"></option><option value="0.5"></option><option value="0.75"></option>
          <option value="1"></option><option value="1.25"></option><option value="1.5"></option><option value="1.75"></option><option value="2"></option>
        </datalist>

        <div id="load-error" class="hidden bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-4"></div>

        <div id="screen-body" class="hidden space-y-3">
          <!-- Детали + итоги в шапке -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-gray-400">ID ${escapeHtmlClient(collectiveId)}</span>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700" id="stage-chip"></span>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Название</label>
              <input type="text" id="detail-name" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Обязательно для новых коллективок">
            </div>
            <div class="mt-2">
              <label class="text-xs font-medium text-gray-500">Трек-номер</label>
              <input type="text" id="detail-track" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <div class="mt-2">
              <label class="text-xs font-medium text-gray-500">Статус коллективки</label>
              <select id="detail-status" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"></select>
              <!-- Доработка 30.08.2026 (запрос VASY) — "отправлено дата" прямо
                   у статуса. Проставляется автоматически при переходе на
                   статус, настроенный как "отправлено" ("Настройки" →
                   "Автоматизация коллективок"), либо руками ниже. -->
              <div id="detail-sent-caption" class="hidden text-[11px] text-gray-400 mt-1"></div>
            </div>
            <div class="mt-2">
              <label class="text-xs font-medium text-gray-500 flex items-center gap-1">Дата отправки${helpIcon('Дата отправки', '<p>Проставляется автоматически при переходе коллективки на статус «отправлено» (если это настроено в «Настройки» → «Автоматизация коллективок»).</p><p>Здесь можно поправить/задать вручную — например, для коллективки, которая прошла нужный статус ещё до появления этого поля.</p>')}</label>
              <input type="date" id="detail-sent-at" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            </div>
            <button id="detail-save-btn" class="w-full mt-3 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
            <div id="detail-error-text" class="text-xs text-red-500 hidden mt-1.5"></div>

            <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 text-center">
              <div>
                <div class="text-base font-semibold text-gray-900" id="summary-order-count">0</div>
                <div class="text-[10px] text-gray-400">заказов</div>
              </div>
              <div>
                <div class="text-base font-semibold text-gray-900" id="summary-units-sum">0</div>
                <div class="text-[10px] text-gray-400">Σ долей</div>
              </div>
              <div>
                <div class="text-base font-semibold text-gray-900" id="summary-paid-count">0</div>
                <div class="text-[10px] text-gray-400">оплатили плечо</div>
              </div>
            </div>
          </div>

          <!-- Сверка логистики: факт. компоненты -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <label class="text-xs font-medium text-gray-500 flex items-center gap-1">Факт. расход логистики${helpIcon('Что такое сверка логистики', '<p>Разбивает факт. расход на доставку коллективки между заказами по их долям и сравнивает с тем, что было заранее оценено при создании каждого заказа.</p><p>Разница записывается в финансовый леджер. Повторное сохранение исправляет уже записанную сверку, не дублирует её.</p>')}</label>
            <div class="grid grid-cols-3 gap-2 mt-1" id="cost-fields-grid"></div>
            <div class="text-[11px] text-gray-500 mt-1.5">Итого: <span id="logistics-total" class="font-medium text-gray-700">0</span> ₽</div>
            <button id="logistics-save-btn" class="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить сверку</button>
            <div id="logistics-error-text" class="text-xs text-red-500 hidden mt-1.5"></div>
            <div id="reconciliation-banner" class="hidden text-xs rounded-lg p-2.5 mt-1.5"></div>
            <!-- Доработка 30.08.2026 (запрос VASY) — пишет посчитанную долю
                 ПРЯМО в цель оплаты заказа (не только в леджер, как
                 "Сохранить сверку" выше), даже для заказов без предварительной
                 стоимости. Требует уже сохранённой сверки — сервер сам
                 откажет ("Сначала сохраните сверку"), если факт. расход ещё
                 не введён. -->
            <button type="button" id="apply-costs-btn" disabled class="w-full mt-2 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Применить расход в заказы${helpIcon('Что это делает', '<p>Берёт факт. расход, посчитанный по коэффициентам (долям) заказов, и записывает его прямо в поле «Стоимость доставки» каждого заказа — даже там, где предварительной стоимости ещё не было.</p><p>Это МЕНЯЕТ сумму к оплате клиентом за это плечо доставки, даже если поле уже было заполнено раньше — расчёт с клиентом пересматривается по факту.</p>')}</button>
          </div>

          <!-- Добавить заказ -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <label class="text-xs font-medium text-gray-500">Добавить заказ</label>
            <div class="relative mt-1">
              <input type="text" id="detail-order-search" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Поиск заказа по ID/названию/клиенту..." autocomplete="off">
              <ul id="detail-order-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
          </div>

          <!-- Единый список заказов -->
          <div class="flex items-center justify-between px-1">
            <div class="text-[11px] text-gray-400">Заказы (<span id="order-count-label">0</span>)</div>
            <button type="button" id="select-mode-btn" class="text-[11px] font-medium text-indigo-600">Выбрать</button>
          </div>
          <div id="order-list"></div>
          <div id="order-empty" class="hidden text-center text-sm text-gray-400 py-6">Заказов пока нет</div>

          <button id="detail-delete-btn" class="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium">Удалить коллективку</button>
        </div>
      </main>

      <!-- Нижняя панель массовых действий (Э3) — видна только в режиме "Выбрать" -->
      <div id="bulk-actions-bar" class="hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-40 px-4 py-3">
        <div class="max-w-2xl mx-auto">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-700 inline-flex items-center gap-1">Выбрано: <span id="bulk-selected-count">0</span>${helpIcon('Массовые действия', '<p><b>Убрать из коллективки</b> — заказы остаются как есть, просто больше не входят в эту коллективку и не участвуют в раскладке логистики. Уже записанная сверка пересчитается сама.</p><p><b>Перенести в другую</b> — то же самое, но заказы сразу попадают в выбранную коллективку.</p><p><b>Сменить статус доставки</b> — один статус сразу всем выбранным заказам. Если по заказу остался непогашенный долг, система предупредит и попросит подтвердить отдельно.</p><p><b>Продолжить как «По РФ»</b> — только для этапа «КЗ→РФ»: выбранные заказы (можно часть, не обязательно все — посылка могла разделиться) добавляются ВТОРЫМ плечом в коллективку этапа «По РФ» (новую или уже существующую), первое плечо остаётся как есть.</p>')}</span>
            <button type="button" id="bulk-cancel-btn" class="text-xs text-gray-400 font-medium">Отменить</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="bulk-unassign-btn" class="py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Убрать из коллективки</button>
            <button type="button" id="bulk-transfer-btn" class="py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Перенести в другую</button>
            <!-- Э5, REFACTOR-COLLECTIVES.md §3 -->
            <button type="button" id="bulk-status-btn" class="col-span-2 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Сменить статус доставки</button>
            <!-- Аудит коллективок, п.6Б, 27.08.2026 — только для этапа "КЗ→РФ"
                 (см. renderDetailsCard), допускает ЧАСТИЧНЫЙ выбор заказов. -->
            <button type="button" id="bulk-continue-rf-btn" class="hidden col-span-2 py-2.5 rounded-xl border border-emerald-200 text-emerald-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Продолжить как «По РФ»</button>
          </div>
        </div>
      </div>

      ${CollectivePickerModal.html()}
      ${DeliveryStatusModal.html()}

      <!-- "Применить расход в заказы" (доработка 30.08.2026) — предпросмотр
           "было → станет" перед записью, раз это меняет сумму к оплате
           клиента (VASY: "можно добавить модалку"). -->
      <div id="apply-costs-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Применить расход в заказы</h2>
            <button type="button" id="apply-costs-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 overflow-y-auto custom-scrollbar" id="apply-costs-list"></div>
          <div class="p-4 border-t border-gray-100 space-y-2 shrink-0">
            <label class="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" id="apply-costs-notify" class="rounded border-gray-300">
              Уведомить клиентов об изменении суммы
            </label>
            <div id="apply-costs-warning" class="text-xs text-red-500 hidden"></div>
            <div class="flex gap-2">
              <button type="button" id="apply-costs-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
              <button type="button" id="apply-costs-confirm" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Применить</button>
            </div>
          </div>
        </div>
      </div>
    `;

    let details = null; // {collectiveId,name,trackNumber,status,stage,summary,...}
    let orders = []; // единый массив карточек — объединяет getCollectiveDetails.orders + alreadyEstimated/units из getCollectiveLogisticsContext
    let actualCosts = { sdekCost: 0, taxiKzCost: 0, taxiRfCost: 0 };
    const unitDebounceTimers = new Map(); // orderId -> timer, отдельный дебаунс на каждый ползунок

    // Снимок последних СОХРАНЁННЫХ на сервере факт.-полей — для dirty-проверки
    // (репорт VASY 27.08.2026, см. `guardUnsavedBeforeReload` ниже).
    // key -> {currency, original}, заполняется в renderCostFields().
    let lastLoadedCostSnapshot = {};

    // Аудит коллективок, п.6А (27.08.2026, репорт VASY) — "статус доставки
    // менять не через выделение, а через статус коллективки". Конфигурация
    // (таблица соответствия + признак "уведомлять") — ленивая, один запрос
    // на экран, см. ensureAutomationConfig/maybeTriggerStatusAutomation ниже.
    let automationConfig = null; // {statusMap, autoNotify}
    async function ensureAutomationConfig() {
      if (automationConfig) return automationConfig;
      automationConfig = await callServer('getCollectiveAutomationConfig');
      return automationConfig;
    }

    // Режим "Выбрать" (Э3) — module-scope этого render(), сбрасывается при
    // каждом новом заходе на экран (тот же принцип, что orders.js).
    let selectMode = false;
    const selectedIds = new Set();

    const loadErrorEl = document.getElementById('load-error');
    const bodyEl = document.getElementById('screen-body');

    loadAll();

    async function loadAll() {
      try {
        const [d, logistics] = await Promise.all([
          callServer('getCollectiveDetails', collectiveId),
          callServer('getCollectiveLogisticsContext', collectiveId)
        ]);
        details = d;
        actualCosts = logistics.actualLogisticsCosts || { sdekCost: 0, taxiKzCost: 0, taxiRfCost: 0 };
        // logistics.orders — те же объекты, что details.orders, плюс
        // alreadyEstimated/units (см. financeService.getCollectiveLogisticsContext) —
        // единственный источник для единого списка карточек (п.3 Э2).
        orders = logistics.orders.map((o) => ({ ...o, currentUnits: o.logisticsUnitsEffective }));

        document.getElementById('header-title').textContent = details.name || details.collectiveId;
        renderDetailsCard();
        await renderCostFields();
        renderOrderList();
        loadErrorEl.classList.add('hidden');
        bodyEl.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        loadErrorEl.textContent = 'Не удалось загрузить коллективку: ' + error.message;
        loadErrorEl.classList.remove('hidden');
        bodyEl.classList.add('hidden');
      }
    }

    // --- Детали коллективки ---

    // "yyyy-MM-dd" — формат <input type="date">, из ISO сервера (sentAt).
    function isoToDateInputValue(iso) {
      return iso ? iso.slice(0, 10) : '';
    }

    function renderDetailsCard() {
      document.getElementById('detail-name').value = details.name || '';
      document.getElementById('detail-track').value = details.trackNumber || '';
      document.getElementById('detail-sent-at').value = isoToDateInputValue(details.sentAt);
      const sentCaption = document.getElementById('detail-sent-caption');
      sentCaption.textContent = details.sentAtDisplay ? `Отправлено: ${details.sentAtDisplay}` : '';
      sentCaption.classList.toggle('hidden', !details.sentAtDisplay);
      document.getElementById('stage-chip').textContent = details.stage;
      renderStatusOptions(details.status);
      renderSummary();
      // Аудит коллективок, п.6Б — "продолжить как По РФ" осмысленно только
      // с самого первого этапа (у "По РФ" уже нет следующего).
      document.getElementById('bulk-continue-rf-btn').classList.toggle('hidden', details.stage !== 'КЗ→РФ');
    }

    // Статусы по этапу (Э4, §2.1/§5 Q3) — тот же список, что backend
    // collectiveStages.COLLECTIVE_STAGES, хардкожен на фронте по тому же
    // принципу, что COST_FIELD_LABELS ниже (сервер — источник истины при
    // валидации, здесь только отображение).
    const STAGE_STATUSES = {
      'КЗ→РФ': ['Формируется', 'Отправлено (СДЭК)', 'Прибыло к посреднику РФ', 'Завершено'],
      'По РФ': ['Формируется', 'Отправлено', 'Доставлено']
    };

    function renderStatusOptions(currentStatus) {
      const statuses = STAGE_STATUSES[details.stage] || STAGE_STATUSES['КЗ→РФ'];
      const select = document.getElementById('detail-status');
      select.innerHTML = statuses.map((s) => `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`).join('');
    }

    function renderSummary() {
      document.getElementById('summary-order-count').textContent = details.summary.orderCount;
      document.getElementById('summary-units-sum').textContent = details.summary.unitsSum;
      document.getElementById('summary-paid-count').textContent = `${details.summary.ownLegPaidCount}/${details.summary.orderCount}`;
    }

    const detailSaveBtn = document.getElementById('detail-save-btn');
    const detailErrorText = document.getElementById('detail-error-text');

    // --- Защита от потери несохранённых правок (репорт VASY 27.08.2026) ---
    //
    // Баг: правка Названия/Трека/Статуса коллективки НЕ уходит на сервер сама
    // по себе — только по нажатию отдельной кнопки "Сохранить" в этом блоке.
    // Если следующим действием менеджер трогал факт.-поля расхода и жал
    // "Сохранить сверку" (другая кнопка, другой запрос), тот обработчик по
    // успеху звал loadAll() — она перезагружает `details` с сервера и
    // renderDetailsCard() затирает несохранённые правки инпутов свежими
    // серверными значениями. То же самое верно для ЛЮБОГО другого действия
    // экрана, которое зовёт loadAll() (перенос/убрать заказ, добавить заказ,
    // массовая смена статуса) — не только "Сохранить сверку".
    //
    // Фикс — ровно то, что предложил VASY ("сохранение одновременно"):
    // `guardUnsavedBeforeReload()` вызывается в начале КАЖДОГО обработчика,
    // который в итоге дойдёт до loadAll(). Название/Трек/Статус — не денежные
    // данные, поэтому тихо досохраняются автоматически (`flushDetailFieldsIfDirty`).
    // Факт.-поля расхода логистики — денежные (сверка пишет проводки в леджер),
    // поэтому НЕ сохраняются молча за пределами явного "Сохранить сверку" —
    // вместо этого явное предупреждение с возможностью отменить действие
    // (`warnIfCostFieldsDirty`), тот же принцип, что уже используется в этом
    // файле для любого другого денежного побочного эффекта.

    function isDetailDirty() {
      return document.getElementById('detail-name').value.trim() !== (details.name || '')
        || document.getElementById('detail-track').value.trim() !== (details.trackNumber || '')
        || document.getElementById('detail-status').value !== details.status
        || document.getElementById('detail-sent-at').value !== isoToDateInputValue(details.sentAt);
    }

    // Возвращает true (сохранено), false (реальная ошибка сервера) или null
    // (пользователь сам отменил на подтверждении "Завершено без сверки").
    // `triggerAutomation` (п.6А) — включать автоматическую смену статуса
    // доставки ТОЛЬКО по явному клику "Сохранить" самим менеджером, НЕ по
    // тихому авто-досохранению перед другим действием
    // (`flushDetailFieldsIfDirty`) — иначе перевод статуса всплыл бы как
    // неожиданный побочный эффект действия "Убрать заказ"/"Добавить заказ".
    async function saveDetailFields({ triggerAutomation = false } = {}) {
      detailErrorText.classList.add('hidden');
      const name = document.getElementById('detail-name').value.trim();
      const trackNumber = document.getElementById('detail-track').value.trim();
      const status = document.getElementById('detail-status').value;
      const sentAtInput = document.getElementById('detail-sent-at').value; // 'yyyy-MM-dd' или ''
      const previousStatus = details.status;

      // Предупреждение при переводе в терминальный статус этапа без сверки
      // (Э2, п.8) — "терминальный" здесь буквально последний пункт списка
      // статусов выше (тот же список, что и в renderStatusOptions).
      const statuses = STAGE_STATUSES[details.stage] || STAGE_STATUSES['КЗ→РФ'];
      const movingToTerminal = status === statuses[statuses.length - 1] && details.status !== status;
      const totalActualCost = round2((actualCosts.sdekCost || 0) + (actualCosts.taxiKzCost || 0) + (actualCosts.taxiRfCost || 0));
      if (movingToTerminal && totalActualCost === 0) {
        const confirmed = await showConfirmModal(
          'Сверка логистики ещё не проведена (факт. расход = 0) — перевести коллективку в статус «Завершено» всё равно?',
          { confirmLabel: 'Всё равно завершить', danger: false }
        );
        if (!confirmed) return null;
      }

      try {
        await callServer('updateCollective', collectiveId, { name, trackNumber, status });
        details.name = name;
        details.trackNumber = trackNumber;
        details.status = status;
        document.getElementById('header-title').textContent = name || collectiveId;

        // Дата отправки (доработка 30.08.2026) — отдельный endpoint (не часть
        // updateCollective), но одна и та же кнопка "Сохранить"/один и тот же
        // dirty-гейт — менеджер не должен думать о двух разных сохранениях.
        if (sentAtInput !== isoToDateInputValue(details.sentAt)) {
          await callServer('setCollectiveSentAt', collectiveId, sentAtInput || null);
          details.sentAt = sentAtInput ? new Date(sentAtInput).toISOString() : null;
          details.sentAtDisplay = sentAtInput ? formatDateRu(sentAtInput) : '';
          const sentCaption = document.getElementById('detail-sent-caption');
          sentCaption.textContent = details.sentAtDisplay ? `Отправлено: ${details.sentAtDisplay}` : '';
          sentCaption.classList.toggle('hidden', !details.sentAtDisplay);
        }

        if (triggerAutomation && status !== previousStatus) await maybeTriggerStatusAutomation(status);
        return true;
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
        return false;
      }
    }

    // dd.MM.yyyy из 'yyyy-MM-dd' (<input type="date">) — тот же формат
    // отображения, что уже шлёт сервер (createdAt/sentAtDisplay), без похода
    // на сервер за пересчётом ради одной локальной правки поля.
    function formatDateRu(isoDateOnly) {
      const [y, m, d] = isoDateOnly.split('-');
      return `${d}.${m}.${y}`;
    }

    // Аудит коллективок, п.6А — после РЕАЛЬНОГО перехода статуса коллективки
    // (не пересохранения того же значения), если для (этап, новый статус)
    // настроено соответствие (не "не менять") — открывает ТУ ЖЕ модалку
    // смены статуса доставки, что и ручная массовая смена (Э5), уже с
    // выбранным статусом и той же защитой (гейт долга, previewDeliveryStatusChange).
    // Best-effort: сбой автоматизации НЕ откатывает уже сохранённый статус
    // коллективки, только предупреждает — тот же принцип, что
    // recalculateCollectiveReconciliation на backend.
    async function maybeTriggerStatusAutomation(newStatus) {
      try {
        const config = await ensureAutomationConfig();
        const rule = config.statusMap.find((r) => r.stage === details.stage && r.collectiveStatus === newStatus);
        const mappedDeliveryStatus = rule ? rule.deliveryStatus : null;
        if (!mappedDeliveryStatus) return; // не настроено — "не менять"

        const liveOrderIds = orders.map((o) => o.orderId);
        if (liveOrderIds.length === 0) return;

        deliveryStatusModal.open(liveOrderIds, {
          presetStatus: mappedDeliveryStatus,
          presetNotify: config.autoNotify,
          autoNote: `По правилу автоматизации коллективки статус доставки для ${liveOrderIds.length} заказ(ов) меняется на «${mappedDeliveryStatus}».`
        });
      } catch (error) {
        showSaveToast(false, 'Коллективка сохранена, но не удалось запустить автоматическую смену статуса доставки: ' + error.message);
      }
    }

    // Авто-досохранение перед действием, которое перезагрузит экран — не
    // трогает факт.-поля (см. warnIfCostFieldsDirty), только неденежные детали.
    async function flushDetailFieldsIfDirty() {
      if (!isDetailDirty()) return true;
      const result = await saveDetailFields();
      if (result === false) {
        showSaveToast(false, 'Действие отменено: не удалось сохранить Название/Трек/Статус — ' + detailErrorText.textContent);
      }
      return result === true;
    }

    function isCostFieldsDirty() {
      const fields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      return fields.some((f) => {
        const el = document.getElementById(f.id);
        if (!el) return false;
        const snap = lastLoadedCostSnapshot[f.key] || { currency: 'RUB', original: '' };
        const curOriginal = parseFloat(el.value) || 0;
        const snapOriginal = parseFloat(snap.original) || 0;
        return (costFieldCurrency[f.key] || 'RUB') !== snap.currency || curOriginal !== snapOriginal;
      });
    }

    // Факт.-расход — денежные данные (сверка пишет проводки), поэтому не
    // авто-сохраняются как деталь: явное предупреждение + возможность отмены.
    async function warnIfCostFieldsDirty() {
      if (!isCostFieldsDirty()) return true;
      return showConfirmModal(
        'Несохранённые изменения факт. расхода логистики будут потеряны этим действием. Нажмите «Отмена» и сначала «Сохранить сверку», если хотите их сохранить.',
        { confirmLabel: 'Продолжить без сохранения', danger: true }
      );
    }

    // Общий guard для ЛЮБОГО обработчика, который дойдёт до loadAll().
    async function guardUnsavedBeforeReload() {
      if (!(await flushDetailFieldsIfDirty())) return false;
      if (!(await warnIfCostFieldsDirty())) return false;
      return true;
    }

    detailSaveBtn.addEventListener('click', async () => {
      if (detailSaveBtn.disabled) return;
      detailSaveBtn.disabled = true;
      try {
        const result = await saveDetailFields({ triggerAutomation: true });
        if (result === true) showSaveToast(true, 'Коллективка обновлена');
        else if (result === false) showSaveToast(false, 'Не удалось сохранить: ' + detailErrorText.textContent);
      } finally {
        detailSaveBtn.disabled = false;
      }
    });

    const detailDeleteBtn = document.getElementById('detail-delete-btn');
    detailDeleteBtn.addEventListener('click', async () => {
      if (detailDeleteBtn.disabled) return;
      if (!(await showConfirmModal(`Удалить коллективку «${details.name || collectiveId}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
      detailDeleteBtn.disabled = true;
      try {
        await callServer('deleteCollective', collectiveId);
        navigateTo('collectives');
      } catch (error) {
        showSaveToast(false, 'Не удалось удалить: ' + error.message);
        detailDeleteBtn.disabled = false;
      }
    });

    // --- Факт. расход (3 поля, подписи по этапу) ---

    // Подписи слотов по этапу (§2.1 плана) — этап 'По РФ' появится в UI в Э4,
    // здесь заготовка на будущее, сейчас коллективка всегда 'КЗ→РФ'.
    const COST_FIELD_LABELS = {
      'КЗ→РФ': [{ id: 'cost-1', key: 'sdekCost', label: 'Стоимость СДЭК, ₽' }, { id: 'cost-2', key: 'taxiKzCost', label: 'Такси КЗ, ₽' }, { id: 'cost-3', key: 'taxiRfCost', label: 'Такси РФ, ₽' }],
      'По РФ': [{ id: 'cost-1', key: 'sdekCost', label: 'Отправка, ₽' }, { id: 'cost-2', key: 'taxiKzCost', label: 'Такси (отправка), ₽' }, { id: 'cost-3', key: 'taxiRfCost', label: 'Такси (получение), ₽' }]
    };

    // ₽/₸ на каждом факт.-поле (Э4, §2.6, 24.08.2026, доп. запрос VASY —
    // "СДЭК сейчас тоже расценивается в тенге, но расценка может меняться")
    // — переключатель НЕЗАВИСИМ на каждом из трёх полей, не общий на всю
    // коллективку (в отличие от блока "Доставка КЗ→РФ" в форме заказа, здесь
    // валюта — не подпись слота, а то, в чём менеджер реально платил).
    // Курс — ТОТ ЖЕ механизм, что $→₽-калькулятор веса в форме заказа
    // (currencyService.getCalculatorKztToRubRate, см. её JSDoc). ИСПРАВЛЕНО
    // 27.08.2026 (репорт VASY, аудит коллективок) — до этого среза здесь был
    // сырой курс ЦБ РФ без наценки (`getRawKztToRubRate`), обоснование "своя
    // наценка исказит прибыль" (Э4, 24.08.2026) VASY поправил: реальная
    // конвертация валюты всегда несёт банковский спред/комиссию, сырой курс
    // ЦБ систематически занижал факт. расход коллективки в рублях. Клиент
    // по-прежнему конвертирует сам и отправляет уже готовую ₽-сумму (тенге-
    // ввод никогда не уходит на сервер как источник истины) — поменялась
    // только формула курса, не сам принцип "конвертация на клиенте".
    let kztToRubRate = null; // кэш на время экрана, обновляется явной кнопкой
    const costFieldCurrency = {}; // key -> 'RUB'|'KZT'
    const costFieldOriginal = {}; // key -> введённая сумма В ТЕКУЩЕЙ валюте поля (для KZT — тенге)

    async function ensureKztRate() {
      if (kztToRubRate !== null) return kztToRubRate;
      const { kztToRub } = await callServer('getCalculatorKztToRubRate');
      kztToRubRate = kztToRub;
      return kztToRubRate;
    }

    // РЕАЛЬНЫЙ БАГ (репорты VASY 27.08.2026, п.3 "карточки не показывают
    // расход" + п.5 "рубль с тенге в памяти не связаны") — оба были одним и
    // тем же корнем: курс КЗТ→РУБ запрашивался с сервера ТОЛЬКО по клику
    // на кнопку-переключатель ₽/₸ (см. её обработчик ниже), не при открытии
    // экрана. Если поле было СОХРАНЕНО в ₸ на предыдущем заходе, при
    // повторном открытии `renderCostFields()` подставляла ₸-число в инпут
    // (корректно), но `updateCostsPreview()` → `readCostFields()` считала
    // `kztToRubRate` ещё null → `costs[f.key] = null` → `updateCostsPreview`
    // коалесит `null` в 0 (`costs.sdekCost ?? 0`) — рублёвый компонент этого
    // поля молча схлопывался в 0 при каждом открытии, "Итого" занижалось (или
    // обнулялось целиком), а `diffLabel` на карточках заказов гасился своим
    // же guard'ом (`totalCost <= 0 → return ''`) — отсюда пустые карточки.
    // Теперь курс запрашивается ЗАРАНЕЕ, если хоть одно поле уже в ₸.
    async function renderCostFields() {
      const fields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      const currencyKeyOf = { sdekCost: 'sdekCostCurrency', taxiKzCost: 'taxiKzCostCurrency', taxiRfCost: 'taxiRfCostCurrency' };
      const originalKeyOf = { sdekCost: 'sdekCostOriginal', taxiKzCost: 'taxiKzCostOriginal', taxiRfCost: 'taxiRfCostOriginal' };
      lastLoadedCostSnapshot = {};
      fields.forEach((f) => {
        const currency = actualCosts[currencyKeyOf[f.key]] || 'RUB';
        costFieldCurrency[f.key] = currency;
        const original = actualCosts[originalKeyOf[f.key]];
        costFieldOriginal[f.key] = currency === 'KZT' && original !== null && original !== undefined ? original : (actualCosts[f.key] || '');
        lastLoadedCostSnapshot[f.key] = { currency, original: costFieldOriginal[f.key] };
      });

      if (fields.some((f) => costFieldCurrency[f.key] === 'KZT')) {
        try { await ensureKztRate(); } catch (e) { /* сеть недоступна — hint ниже и так сообщит, сохранение заблокировано readCostFields'ом */ }
      }

      const grid = document.getElementById('cost-fields-grid');
      grid.innerHTML = fields.map((f) => `
        <div>
          <label class="text-[10px] text-gray-400">${f.label.replace(', ₽', '')}</label>
          <div class="flex items-center gap-1">
            <input type="number" id="${f.id}" min="0" step="0.01" value="${costFieldOriginal[f.key]}" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            <button type="button" class="currency-toggle-btn shrink-0 text-[11px] font-medium px-1.5 py-1.5 rounded-lg border border-gray-200 text-gray-500" data-field="${f.key}">${costFieldCurrency[f.key] === 'KZT' ? '₸' : '₽'}</button>
          </div>
          <div id="${f.id}-kzt-hint" class="text-[10px] text-gray-400 mt-0.5 ${costFieldCurrency[f.key] === 'KZT' ? '' : 'hidden'}"></div>
        </div>
      `).join('');

      fields.forEach((f) => {
        document.getElementById(f.id).addEventListener('input', () => { costFieldOriginal[f.key] = document.getElementById(f.id).value; updateCostsPreview(); });
      });
      grid.querySelectorAll('.currency-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.field;
          costFieldCurrency[key] = costFieldCurrency[key] === 'KZT' ? 'RUB' : 'KZT';
          btn.textContent = costFieldCurrency[key] === 'KZT' ? '₸' : '₽';
          const hint = document.getElementById(`${fields.find((x) => x.key === key).id}-kzt-hint`);
          hint.classList.toggle('hidden', costFieldCurrency[key] !== 'KZT');
          if (costFieldCurrency[key] === 'KZT') { try { await ensureKztRate(); } catch (e) { /* сеть недоступна — hint покажет "курс недоступен" ниже */ } }
          updateCostsPreview();
        });
      });

      updateCostsPreview();
    }

    // Читает поля формы в {sdekCost,taxiKzCost,taxiRfCost} УЖЕ В РУБЛЯХ
    // (конвертирует KZT-поля по kztToRubRate) + `*Currency`/`*Original`
    // для аудируемости — ровно контракт setCollectiveActualLogisticsCosts (§2.6).
    // `result[f.key] = null` — поле в ₸, но курс ещё не загружен: НЕ
    // подставляем тенге-число как рубли (реальный риск молчаливого 5-кратного
    // завышения расхода) и не тихо считаем его нулём — `readCostFields` явно
    // сигналит "не готово", вызывающая сторона (updateCostsPreview/save-хендлер)
    // решает, что показать/заблокировать.
    function readCostFields() {
      const fields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      const currencyKeyOf = { sdekCost: 'sdekCostCurrency', taxiKzCost: 'taxiKzCostCurrency', taxiRfCost: 'taxiRfCostCurrency' };
      const originalKeyOf = { sdekCost: 'sdekCostOriginal', taxiKzCost: 'taxiKzCostOriginal', taxiRfCost: 'taxiRfCostOriginal' };
      const result = {};
      fields.forEach((f) => {
        const rawValue = parseFloat(document.getElementById(f.id).value) || 0;
        const currency = costFieldCurrency[f.key] || 'RUB';
        if (currency === 'KZT') {
          result[f.key] = kztToRubRate ? round2(rawValue * kztToRubRate) : null;
          result[currencyKeyOf[f.key]] = 'KZT';
          result[originalKeyOf[f.key]] = rawValue;
        } else {
          result[f.key] = rawValue;
          result[currencyKeyOf[f.key]] = 'RUB';
          result[originalKeyOf[f.key]] = null;
        }
      });
      return result;
    }

    function round2(v) { return Math.round(v * 100) / 100; }

    function updateCostsPreview() {
      const fields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      const costs = readCostFields();
      // actualCosts.sdekCost и т.д. — только для отображения ("Итого" ниже,
      // диффы в карточках заказов, шапка) ДО реального сохранения, null
      // (курс ещё не готов) трактуется как 0 ЗДЕСЬ, но не при сохранении —
      // см. logisticsSaveBtn ниже, там null блокирует запрос целиком.
      actualCosts = { ...actualCosts, ...costs, sdekCost: costs.sdekCost ?? 0, taxiKzCost: costs.taxiKzCost ?? 0, taxiRfCost: costs.taxiRfCost ?? 0 };
      fields.forEach((f) => {
        if (costFieldCurrency[f.key] !== 'KZT') return;
        const hint = document.getElementById(`${f.id}-kzt-hint`);
        if (!hint) return;
        // ИСПРАВЛЕНО 27.08.2026 (репорт VASY, п.2 — "расчёт по факт. расходу
        // не бьётся с калькулятором") — раньше здесь стоял сырой курс ЦБ РФ
        // без наценки, обоснование "своя наценка исказит прибыль" (Э4,
        // 24.08.2026), и подсказка честно предупреждала, что это ДРУГОЙ курс,
        // чем в калькуляторе. VASY поправил саму экономику: реальная
        // конвертация валюты всегда несёт банковский спред, сырой курс ЦБ
        // занижал факт. расход — теперь здесь ТОТ ЖЕ механизм расчёта, что и
        // в $→₽-калькуляторе формы заказа (`currencyService.
        // getCalculatorKztToRubRate`, та же наценка `Маржа_RUB_KZT`).
        hint.textContent = kztToRubRate
          ? `≈ ${costs[f.key].toLocaleString('ru-RU')} ₽ по курсу ${kztToRubRate.toFixed(4)} ₽/₸ (тот же курс, что в калькуляторе формы заказа)`
          : 'Курс недоступен — переключите на ₽ или дождитесь курса, сохранение пока заблокировано';
      });
      const total = round2(actualCosts.sdekCost + actualCosts.taxiKzCost + actualCosts.taxiRfCost);
      document.getElementById('logistics-total').textContent = total.toLocaleString('ru-RU');
      // "Применить в заказы" читает СОХРАНЁННУЮ сверку на сервере — гейтим
      // кнопку тем же ориентиром (total > 0), финальную проверку "сверка
      // реально сохранена" всё равно делает сервер при клике.
      const applyBtn = document.getElementById('apply-costs-btn');
      if (applyBtn) applyBtn.disabled = total <= 0;
      renderOrderList(); // доля в ₽/разница видны только когда total > 0 (п.3) — пересчитать видимость
    }

    // --- Единый список заказов (карточка = миниатюра/статусы/примечание/ползунок доли/доля в ₽) ---

    // Юникод-дроби вместо "N/8" (25.08.2026, репорт VASY — "дроби обозначь
    // максимально понятно") — тот же символьный ряд, что уже используется в
    // статичной шкале засечек ниже (¼/½/¾), просто на весь шаг 1/8, не
    // только четверти. Диапазон теперь 0…2 (§1 п.2) — целая часть выводится
    // отдельно, дробная часть только там, где она есть ("1", не "1 0/8").
    const UNITS_FRACTION_GLYPHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
    function unitsFraction(units) {
      const eighths = Math.round(units * 8);
      const whole = Math.floor(eighths / 8);
      const remainder = eighths % 8;
      if (remainder === 0) return String(whole);
      return whole === 0 ? UNITS_FRACTION_GLYPHS[remainder] : `${whole}${UNITS_FRACTION_GLYPHS[remainder]}`;
    }

    function diffLabel(order, totalCost, unitsSum) {
      if (totalCost <= 0 || unitsSum <= 0) return '';
      const shareAmount = round2(totalCost * order.currentUnits / unitsSum);
      const diff = round2(shareAmount - order.alreadyEstimated);
      const shareText = `Доля: ${shareAmount.toLocaleString('ru-RU')} ₽`;
      // Находка D (REFACTOR-COLLECTIVES.md §0/§5 Q9) — симметричный текст с
      // действием на ОБА направления, не просто цветная цифра: сверка не
      // трогает цель оплаты клиента автоматически ни в одной модели.
      if (diff > 0) return { text: `${shareText} — дороже оценки на ${diff.toLocaleString('ru-RU')} ₽. Довзыщите с клиента или спишите на компанию.`, cls: 'text-amber-600' };
      if (diff < 0) return { text: `${shareText} — дешевле оценки на ${Math.abs(diff).toLocaleString('ru-RU')} ₽. Возможен возврат клиенту.`, cls: 'text-red-500' };
      return { text: `${shareText} — совпадает с оценкой.`, cls: 'text-gray-400' };
    }

    // --- Режим "Выбрать" (Э3) ---

    const selectModeBtn = document.getElementById('select-mode-btn');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const bulkSelectedCount = document.getElementById('bulk-selected-count');
    const bulkUnassignBtn = document.getElementById('bulk-unassign-btn');
    const bulkTransferBtn = document.getElementById('bulk-transfer-btn');
    const bulkStatusBtn = document.getElementById('bulk-status-btn');
    const bulkContinueRfBtn = document.getElementById('bulk-continue-rf-btn');

    function setSelectMode(on) {
      selectMode = on;
      if (!on) selectedIds.clear();
      selectModeBtn.textContent = on ? 'Готово' : 'Выбрать';
      bulkBar.classList.toggle('hidden', !on);
      renderOrderList();
    }

    selectModeBtn.addEventListener('click', () => setSelectMode(!selectMode));
    document.getElementById('bulk-cancel-btn').addEventListener('click', () => setSelectMode(false));

    function updateBulkBar() {
      bulkSelectedCount.textContent = selectedIds.size;
      const disabled = selectedIds.size === 0;
      bulkUnassignBtn.disabled = disabled;
      bulkTransferBtn.disabled = disabled;
      bulkStatusBtn.disabled = disabled;
      bulkContinueRfBtn.disabled = disabled;
    }

    function toggleSelected(orderId) {
      if (selectedIds.has(orderId)) selectedIds.delete(orderId);
      else selectedIds.add(orderId);
      updateBulkBar();
    }

    function selectedOrders() {
      return orders.filter((o) => selectedIds.has(o.orderId));
    }

    function currentTotalCost() {
      return round2((actualCosts.sdekCost || 0) + (actualCosts.taxiKzCost || 0) + (actualCosts.taxiRfCost || 0));
    }

    bulkUnassignBtn.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      if (!(await guardUnsavedBeforeReload())) return;
      const remaining = Math.max(0, orders.length - selectedIds.size);
      const recalcNote = currentTotalCost() > 0 ? ` Сверка коллективки будет пересчитана на оставшиеся ${remaining}.` : '';
      const confirmed = await showConfirmModal(`Убрать ${selectedIds.size} заказ(ов) из коллективки?${recalcNote}`, { confirmLabel: 'Убрать', danger: true });
      if (!confirmed) return;

      try {
        // Этап — ВСЕГДА этап ПРОСМАТРИВАЕМОЙ коллективки (Э4): экран
        // scoped на одну коллективку/один этап, неоднозначности нет.
        const result = await callServer('unassignOrdersFromCollective', [...selectedIds], details.stage);
        if (result.failed.length > 0) showSaveToast(false, `Убрано ${result.removed.length}, ${result.failed.length} не удалось.`);
        else showSaveToast(true, `Убрано: ${result.removed.length}.`);
        setSelectMode(false);
        await loadAll();
      } catch (error) {
        showSaveToast(false, 'Не удалось убрать заказы: ' + error.message);
      }
    });

    // Один и тот же picker/onPicked обслуживает ДВЕ кнопки ("Перенести в
    // другую" и "Продолжить как «По РФ»", п.6Б) — CollectivePickerModal.html()
    // вставлен в разметку ОДИН раз, повторный .init() задвоил бы обработчики
    // на общих DOM-элементах модалки. `transferPurpose` — что именно нажали,
    // выставляется прямо перед `.open()`, читается внутри onPicked.
    let transferPurpose = 'transfer'; // 'transfer' | 'continueRf'

    const bulkTransferPicker = CollectivePickerModal.init({
      onPicked: async (targetCollective) => {
        const toMove = selectedOrders();
        if (toMove.length === 0) return;
        if (!(await guardUnsavedBeforeReload())) return;
        const remaining = Math.max(0, orders.length - toMove.length);
        const isContinueRf = transferPurpose === 'continueRf';
        const recalcNote = currentTotalCost() > 0 ? ` Сверка «${details.name || details.collectiveId}» будет пересчитана на оставшиеся ${remaining}.` : '';
        // "Продолжить как По РФ" технически тот же assignOrdersToCollective,
        // что "Перенести в другую" — целевой этап другой ('По РФ' vs этап
        // ИСТОЧНИКА), поэтому сервер сам трактует это как ДОБАВЛЕНИЕ второго
        // плеча, а не перенос (§3 Э3: связь уникальна на (заказ, этап)) —
        // заказ остаётся и в этой коллективке. Текст подтверждения называет
        // это прямо, чтобы не создавалось впечатление "заказ пропадёт отсюда".
        const confirmText = isContinueRf
          ? `Добавить ${toMove.length} заказ(ов) вторым плечом («По РФ») в «${targetCollective.name || targetCollective.collectiveId}»? Заказы останутся и здесь (плечо «КЗ→РФ» не меняется).`
          : `Перенести ${toMove.length} заказ(ов) в «${targetCollective.name || targetCollective.collectiveId}»?${recalcNote}`;
        const confirmed = await showConfirmModal(confirmText, { confirmLabel: isContinueRf ? 'Добавить' : 'Перенести' });
        if (!confirmed) return;

        try {
          const result = await callServer('assignOrdersToCollective', toMove.map((o) => o.orderId), targetCollective.collectiveId);
          const okCount = result.moved.length + result.added.length;
          const verb = isContinueRf ? 'Добавлено вторым плечом' : 'Перенесено';
          if (result.failed.length > 0) showSaveToast(false, `${verb}: ${okCount}, ${result.failed.length} не удалось.`);
          else showSaveToast(true, `${verb}: ${okCount}.`);
          setSelectMode(false);
          await loadAll();
        } catch (error) {
          showSaveToast(false, 'Не удалось выполнить: ' + error.message);
        }
      }
    });

    bulkTransferBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      transferPurpose = 'transfer';
      bulkTransferPicker.open({ excludeCollectiveId: collectiveId });
    });

    bulkContinueRfBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      transferPurpose = 'continueRf';
      // Сужаем список ТОЛЬКО до коллективок этапа "По РФ" + предлагаем
      // создать новую прямо отсюда (п.6Б) — не нужно уходить на экран
      // "Коллективки" и возвращаться за выбранными заказами.
      bulkTransferPicker.open({ stageFilter: 'По РФ', allowCreate: true });
    });

    // --- "Сменить статус доставки" (Э5, REFACTOR-COLLECTIVES.md §3 "Э5") ---

    const deliveryStatusModal = DeliveryStatusModal.init({
      getStatusDictionary: async () => (await callServer('getDictionaries')).statusDelivery,
      onApplied: async ({ closedCount, forcedCount, failedCount }) => {
        const total = closedCount + forcedCount;
        if (failedCount > 0) {
          showSaveToast(false, `Статус изменён у ${total}, не удалось у ${failedCount} (см. лог).`);
        } else if (total > 0) {
          showSaveToast(true, `Статус изменён у ${total} заказ(ов).`);
        }
        setSelectMode(false);
        await loadAll();
      }
    });

    bulkStatusBtn.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      if (!(await guardUnsavedBeforeReload())) return;
      deliveryStatusModal.open([...selectedIds]);
    });

    function renderOrderList() {
      const listEl = document.getElementById('order-list');
      const emptyEl = document.getElementById('order-empty');
      document.getElementById('order-count-label').textContent = orders.length;

      if (orders.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      const totalCost = round2((actualCosts.sdekCost || 0) + (actualCosts.taxiKzCost || 0) + (actualCosts.taxiRfCost || 0));
      const unitsSum = orders.reduce((s, o) => s + o.currentUnits, 0);

      listEl.innerHTML = '';
      orders.forEach((o) => listEl.appendChild(buildOrderCard(o, totalCost, unitsSum)));
      if (window.lucide) window.lucide.createIcons();
      updateBulkBar();
    }

    // Пересчитывает и патчит diff-label ("Доля: N ₽ — …") у ВСЕХ карточек
    // списка + Σ долей в шапке, БЕЗ пересоздания DOM карточек (см. JSDoc у
    // вызова в обработчике 'input' ползунка выше — полный renderOrderList()
    // сорвал бы активный drag). Не трогает `.units-fraction-label`/сам
    // ползунок ни у одной карточки — только текст/класс `.diff-label`.
    function patchAllDiffLabels() {
      const freshTotal = round2((actualCosts.sdekCost || 0) + (actualCosts.taxiKzCost || 0) + (actualCosts.taxiRfCost || 0));
      const freshUnitsSum = orders.reduce((s, x) => s + x.currentUnits, 0);
      document.getElementById('summary-units-sum').textContent = round2(freshUnitsSum);

      document.querySelectorAll('#order-list > [data-order-id]').forEach((card) => {
        const order = orders.find((x) => x.orderId === card.dataset.orderId);
        if (!order) return;
        const sliderBlock = card.querySelector('[data-slider-block]');
        const label = diffLabel(order, freshTotal, freshUnitsSum);
        const diffEl = card.querySelector('.diff-label');
        if (label && diffEl) {
          diffEl.textContent = label.text;
          diffEl.className = `diff-label text-[11px] mt-1 ${label.cls}`;
        } else if (label && !diffEl && sliderBlock) {
          sliderBlock.insertAdjacentHTML('beforeend', `<div class="diff-label text-[11px] mt-1 ${label.cls}">${label.text}</div>`);
        } else if (!label && diffEl) {
          diffEl.remove();
        }
      });
    }

    function buildOrderCard(o, totalCost, unitsSum) {
      const card = document.createElement('div');
      const isSelected = selectedIds.has(o.orderId);
      // 25.08.2026 (репорт VASY — случайные открытия заказа при скролле
      // списка) — карточка целиком БОЛЬШЕ НЕ переходит на редактирование
      // заказа; клик по карточке вне режима "Выбрать" теперь ничего не
      // делает, переход — только с фото/названия/ID (см. `[data-open-order]`
      // ниже, `openOrderTap`). В режиме "Выбрать" карточка целиком
      // по-прежнему переключает отметку — это осознанный режим, случайных
      // касаний там не боялись.
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 active:bg-gray-50 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-100'}`;
      card.dataset.orderId = o.orderId;
      card.addEventListener('click', () => {
        if (selectMode) { toggleSelected(o.orderId); renderOrderList(); }
      });

      function openOrderTap(e) {
        e.stopPropagation();
        if (selectMode) { toggleSelected(o.orderId); renderOrderList(); return; }
        navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`);
      }

      const diff = diffLabel(o, totalCost, unitsSum);

      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${selectMode ? `
            <div class="shrink-0 pt-0.5">
              <input type="checkbox" class="order-select-checkbox w-5 h-5 rounded border-gray-300 text-indigo-600" ${isSelected ? 'checked' : ''}>
            </div>
          ` : ''}
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100 cursor-pointer" data-open-order onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px] truncate cursor-pointer" data-open-order>${escapeHtmlClient(o.productDisplay)}</div>
                <div class="text-[11px] text-gray-400 mt-0.5 cursor-pointer" data-open-order>№ ${escapeHtmlClient(o.orderId)}</div>
              </div>
              ${selectMode ? '' : `
              <button type="button" class="unassign-order-btn shrink-0 text-red-400 p-1" title="Убрать из коллективки">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
              `}
            </div>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              ${o.statusOrder ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">${escapeHtmlClient(o.statusOrder)}</span>` : ''}
              ${o.statusDelivery ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">${escapeHtmlClient(o.statusDelivery)}</span>` : ''}
              ${o.ownLegPaid ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">плечо оплачено</span>` : ''}
            </div>
            <div class="text-[13px] text-gray-500 mt-1.5">${escapeHtmlClient(o.clientDisplay || 'Клиент не привязан')}</div>
            ${o.remark ? `
            <div class="mt-1.5 pt-1.5 border-t border-gray-50">
              <div class="order-remark-text text-[12px] text-gray-500 line-clamp-2 whitespace-pre-wrap">${escapeHtmlClient(o.remark)}</div>
              <button type="button" class="order-remark-toggle text-[11px] text-indigo-600 font-medium mt-0.5">Показать полностью</button>
            </div>
            ` : ''}

            <div class="mt-2 pt-2 border-t border-gray-50" data-slider-block>
              <div class="flex items-center justify-between text-[11px] text-gray-500">
                <span class="inline-flex items-center gap-0.5">Доля логистики${helpIcon('Как работает доля логистики', '<p><b>1</b> — обычный заказ, все заказы наравне между собой. <b>2</b> — вдвое тяжелее/дороже обычного, получит примерно вдвое больше доли общего расхода. <b>0</b> — заказ вообще не участвует в раскладке (мелочь бесплатно).</p><p>Это вес ЗАКАЗА ОТНОСИТЕЛЬНО ДРУГИХ заказов в этой же коллективке, а не фиксированная доля в рублях — если поменять вес у нескольких заказов сразу, доли пересчитаются у всех.</p>')}</span>
                <span class="units-fraction-label font-semibold text-indigo-600">${unitsFraction(o.currentUnits)}</span>
              </div>
              <input type="range" min="0" max="2" step="0.25" value="${o.currentUnits}" list="units-ticks" class="units-slider w-full mt-1.5">
              <!-- 4 деления шкалы (§1 п.2, диапазон 0…2 с 25.08.2026, шаг
                   сужен 1/8→1/4 25.08.2026 доп. правкой — 8 позиций ползунка
                   на весь диапазон вместо 16, сами деления шкалы не менялись)
                   — средние два сегмента (0,5…1,5) чуть подсвечены как "зона
                   вокруг обычного веса", отметка "1" — акцентная и подписана
                   явно "обычный", чтобы дефолт был виден без пояснений. -->
              <div class="flex mt-1 h-1 rounded-full overflow-hidden bg-gray-100">
                <div class="flex-1 border-r border-white"></div>
                <div class="flex-1 border-r border-white bg-indigo-200"></div>
                <div class="flex-1 border-r border-white bg-indigo-200"></div>
                <div class="flex-1"></div>
              </div>
              <!-- Доп. правка 25.08.2026 (репорт VASY, второй раунд) — раньше
                   цифра и пояснение шли ОДНОЙ строкой в одном <span> ("1 ·
                   обычный"), из-за чего у "1"/"2" span был заметно шире, чем
                   у голых "0"/"½"/"1½" — justify-between распределяет ГРАНИЦЫ
                   элементов, а не их центры, так что широкий span сдвигал
                   саму цифру в сторону от реальной точки на шкале выше.
                   Теперь цифры — абсолютно спозиционированные точки РОВНО на
                   0/25/50/75/100% (те же координаты, что границы 4 сегментов
                   шкалы выше), все на одной высоте; пояснение — отдельной
                   строкой ниже, поэтому не толкает цифру и его можно
                   написать чуть подробнее. -->
              <div class="relative h-[27px] mt-1.5">
                <span class="absolute left-0 top-0 text-[10px] font-medium text-gray-600 leading-none">0</span>
                <span class="absolute left-1/4 top-0 -translate-x-1/2 text-[10px] text-gray-500 leading-none">½</span>
                <span class="absolute left-1/2 top-0 -translate-x-1/2 text-[10px] font-semibold text-indigo-500 leading-none">1</span>
                <span class="absolute left-3/4 top-0 -translate-x-1/2 text-[10px] text-gray-500 leading-none">1½</span>
                <span class="absolute right-0 top-0 text-[10px] font-medium text-gray-600 leading-none">2</span>

                <span class="absolute left-0 top-[13px] text-[9px] text-gray-400 leading-none whitespace-nowrap">не участвует</span>
                <span class="absolute left-1/2 top-[13px] -translate-x-1/2 text-[9px] text-indigo-400 font-medium leading-none whitespace-nowrap">обычный вес</span>
                <span class="absolute right-0 top-[13px] text-[9px] text-gray-400 leading-none whitespace-nowrap">вдвое тяжелее</span>
              </div>
              ${diff ? `<div class="diff-label text-[11px] mt-1 ${diff.cls}">${diff.text}</div>` : ''}
            </div>
          </div>
        </div>
      `;

      // Переход на заказ теперь только с фото/названия/ID (см. openOrderTap
      // выше и className-комментарий у card) — не со всей карточки.
      card.querySelectorAll('[data-open-order]').forEach((el) => el.addEventListener('click', openOrderTap));

      const unassignBtn = card.querySelector('.unassign-order-btn');
      if (unassignBtn) {
        unassignBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          unassignOrder(o.orderId);
        });
      }
      const checkbox = card.querySelector('.order-select-checkbox');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => { e.stopPropagation(); toggleSelected(o.orderId); renderOrderList(); });
      }

      const remarkToggle = card.querySelector('.order-remark-toggle');
      if (remarkToggle) {
        remarkToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const textEl = card.querySelector('.order-remark-text');
          const expanded = textEl.classList.toggle('line-clamp-2') === false;
          remarkToggle.textContent = expanded ? 'Свернуть' : 'Показать полностью';
        });
      }

      const sliderBlock = card.querySelector('[data-slider-block]');
      sliderBlock.addEventListener('click', (e) => {
        // Доп. правка 25.08.2026 (репорт VASY — "кнопка инфо не прожимается")
        // — stopPropagation() здесь нужен, чтобы клик по ползунку/подписи не
        // всплывал до card и не открывал заказ на редактирование, НО кнопка
        // подсказки (.help-icon-btn) слушается через делегирование на
        // document (common.js), которое стоит ВЫШЕ card в дереве — прежний
        // безусловный stopPropagation() гасил событие ДО document, модалка
        // подсказки просто никогда не получала клик.
        if (e.target.closest('.help-icon-btn')) return;
        e.stopPropagation();
      });
      const slider = card.querySelector('.units-slider');

      // 25.08.2026 (репорт VASY — "пальцем можно случайно нажать на ползунок
      // и он сразу перескочет") — нативный <input type=range> в большинстве
      // мобильных браузеров/WebView по умолчанию прыгает на позицию касания
      // при ЛЮБОМ тапе по треку, не только при захвате самой точки — ровно
      // то, что делает случайное касание при скролле списка опасным. Гасим
      // этот прыжок: на нажатии/касании проверяем, что палец/курсор стартовал
      // рядом с ТЕКУЩИМ положением точки (допуск ~её видимый радиус + чуть
      // запаса), иначе preventDefault() — браузер тогда вообще не начинает
      // жест, значение не меняется. Настоящее перетаскивание САМОЙ точки
      // (после успешного захвата рядом с ней) не тронуто — работает штатно,
      // дальнейшее движение пальца/курсора этим обработчиком не перехватывается.
      const THUMB_GRAB_TOLERANCE_PX = 14;
      function isNearThumb(clientX) {
        const rect = slider.getBoundingClientRect();
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const percent = (parseFloat(slider.value) - min) / (max - min);
        const thumbX = rect.left + percent * rect.width;
        return Math.abs(clientX - thumbX) <= THUMB_GRAB_TOLERANCE_PX;
      }
      function guardSliderGrab(e) {
        const point = e.touches && e.touches[0] ? e.touches[0] : e;
        if (!isNearThumb(point.clientX)) e.preventDefault();
      }
      slider.addEventListener('mousedown', guardSliderGrab);
      slider.addEventListener('touchstart', guardSliderGrab, { passive: false });

      slider.addEventListener('input', () => {
        const newUnits = parseFloat(slider.value);
        o.currentUnits = newUnits;
        card.querySelector('.units-fraction-label').textContent = unitsFraction(newUnits);
        // ИСПРАВЛЕНО 31.08.2026 (репорт VASY — "доли по коэффициентам не
        // пересчитываются сразу при изменении коэффициентов") — доля
        // КАЖДОГО заказа зависит от Σ долей ВСЕХ заказов коллективки
        // (§2.4, доля_i = units_i/Σunits), значит движение ОДНОГО ползунка
        // меняет цифру у ВСЕХ карточек, не только у той, что тронули.
        // Раньше патчилась только СВОЯ карточка — соседние показывали
        // устаревшую сумму, пока их не пересобирал полный renderOrderList()
        // (следующая загрузка/сохранение). Полный renderOrderList() здесь
        // не годится — пересоздал бы DOM всех ползунков, включая ТОТ, что
        // менеджер сейчас тащит пальцем/мышью, и сорвал бы сам drag-жест;
        // поэтому patchAllDiffLabels() ниже трогает только текстовые
        // diff-label каждой карточки, ни одного <input type=range> не
        // пересоздаёт — сохранение самой доли отдельным дебаунсом ниже.
        patchAllDiffLabels();
        debouncedSaveUnits(o.orderId, newUnits);
      });

      return card;
    }

    function debouncedSaveUnits(orderId, units) {
      const existing = unitDebounceTimers.get(orderId);
      if (existing) clearTimeout(existing);
      unitDebounceTimers.set(orderId, setTimeout(async () => {
        unitDebounceTimers.delete(orderId);
        try {
          await callServer('setOrderLogisticsUnits', orderId, units);
        } catch (error) {
          showSaveToast(false, `Не удалось сохранить долю заказа ${orderId}: ${error.message}`);
        }
      }, 600));
    }

    async function unassignOrder(orderId) {
      if (!(await guardUnsavedBeforeReload())) return;
      // Подтверждение (Э3) — раньше срабатывало без единого вопроса, но с
      // авто-пересчётом сверки (`financeService.recalculateCollectiveReconciliation`)
      // это уже не "бесплатное" действие, если сверка коллективки уже
      // проводилась (иначе пересчитывать нечего — не спрашиваем зря).
      if (currentTotalCost() > 0) {
        const remaining = Math.max(0, orders.length - 1);
        const confirmed = await showConfirmModal(
          `Убрать заказ из коллективки? Сверка будет пересчитана на оставшиеся ${remaining}.`,
          { confirmLabel: 'Убрать', danger: true }
        );
        if (!confirmed) return;
      }

      try {
        // Этап — этап ЭТОЙ коллективки (Э4, тот же принцип, что bulkUnassignBtn выше).
        await callServer('unassignOrderFromCollective', orderId, details.stage);
        await loadAll();
      } catch (error) {
        showSaveToast(false, 'Не удалось убрать заказ: ' + error.message);
      }
    }

    // --- Сохранить сверку (пишет только денежные проводки) ---

    const logisticsSaveBtn = document.getElementById('logistics-save-btn');
    const logisticsErrorText = document.getElementById('logistics-error-text');
    const banner = document.getElementById('reconciliation-banner');

    logisticsSaveBtn.addEventListener('click', async () => {
      if (logisticsSaveBtn.disabled) return;
      logisticsErrorText.classList.add('hidden');
      banner.classList.add('hidden');

      // Реальный баг (репорт VASY 27.08.2026, п.1) — эта кнопка вызывает
      // loadAll() по успеху, который затирал НЕсохранённые правки
      // Названия/Трека/Статуса свежими данными с сервера. Досохраняем их
      // здесь же ("сохранение одновременно", как и предложил VASY) — НЕ
      // предупреждаем про факт.-поля, т.к. именно их сохранение и есть
      // текущее действие.
      if (!(await flushDetailFieldsIfDirty())) return;

      if (orders.length === 0) {
        logisticsErrorText.textContent = 'В коллективке нет заказов для сверки.';
        logisticsErrorText.classList.remove('hidden');
        return;
      }

      const costs = readCostFields();
      // Э4 (§2.6) — поле в ₸ без загруженного курса даёт costs[key]===null
      // (см. readCostFields) — реальный риск денежной ошибки (тенге как
      // рубли/тихий 0), сохранение блокируется, не отправляется на сервер.
      const stageFields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      const unresolvedKzt = stageFields.filter((f) => costs[f.key] === null).map((f) => f.label.replace(', ₽', ''));
      if (unresolvedKzt.length > 0) {
        logisticsErrorText.textContent = `Курс недоступен для поля(ей) в ₸: ${unresolvedKzt.join(', ')}. Переключите на ₽ или дождитесь курса.`;
        logisticsErrorText.classList.remove('hidden');
        return;
      }

      logisticsSaveBtn.disabled = true;
      try {
        const result = await callServer('saveCollectiveLogisticsReconciliation', collectiveId, {
          ...costs,
          shares: orders.map((o) => ({ orderId: o.orderId, units: o.currentUnits }))
        });
        showSaveToast(true, 'Сверка логистики сохранена');
        renderReconciliationBanner(result);
        await loadAll(); // перезагрузка — alreadyEstimated теперь отражает только что сохранённое
      } catch (error) {
        logisticsErrorText.textContent = error.message;
        logisticsErrorText.classList.remove('hidden');
        showSaveToast(false, 'Не удалось сохранить сверку: ' + error.message);
      } finally {
        logisticsSaveBtn.disabled = false;
      }
    });

    // Итоговый баннер после сохранения (Находка D) — суммирует ОБА
    // направления сразу по коллективке, чтобы менеджер видел последствия, не
    // заходя в каждую карточку по отдельности.
    function renderReconciliationBanner(result) {
      const overrun = result.perOrder.filter((o) => o.diff > 0);
      const refund = result.perOrder.filter((o) => o.possibleClientDebt > 0);
      const overrunSum = round2(overrun.reduce((s, o) => s + o.diff, 0));
      const refundSum = round2(refund.reduce((s, o) => s + o.possibleClientDebt, 0));

      if (overrun.length === 0 && refund.length === 0) {
        banner.textContent = 'Сверка сохранена, расхождений с оценкой нет.';
        banner.className = 'text-xs rounded-lg p-2.5 mt-1.5 bg-gray-50 text-gray-500';
        banner.classList.remove('hidden');
        return;
      }

      const parts = [];
      if (overrun.length > 0) parts.push(`${overrun.length} заказ(ов) подорожали на ${overrunSum.toLocaleString('ru-RU')} ₽ суммарно — довзыщите с клиентов или спишите на компанию.`);
      if (refund.length > 0) parts.push(`${refund.length} заказ(ов) дешевле оценки на ${refundSum.toLocaleString('ru-RU')} ₽ суммарно (возможен возврат).`);
      banner.textContent = parts.join(' ');
      banner.className = 'text-xs rounded-lg p-2.5 mt-1.5 bg-amber-50 text-amber-700 border border-amber-200';
      banner.classList.remove('hidden');
    }

    // --- Применить расход в заказы (доработка 30.08.2026, запрос VASY) ---
    //
    // ОТДЕЛЬНО от "Сохранить сверку" выше (та пишет только денежные проводки
    // в леджер) — эта кнопка ЗАПИСЫВАЕТ посчитанную долю прямо в поле-цель
    // заказа ("Стоимость доставки КЗ→РФ"/"…по РФ"), даже для заказов, где
    // предварительной стоимости ещё не было. Требует уже СОХРАНЁННОЙ сверки —
    // предпросмотр/применение читают `actualLogisticsCosts` с сервера, не
    // текущие незасейвленные значения полей формы.

    const applyCostsBtn = document.getElementById('apply-costs-btn');
    const applyCostsModal = document.getElementById('apply-costs-modal');
    const applyCostsList = document.getElementById('apply-costs-list');
    const applyCostsNotify = document.getElementById('apply-costs-notify');
    const applyCostsWarning = document.getElementById('apply-costs-warning');
    const applyCostsConfirmBtn = document.getElementById('apply-costs-confirm');

    function closeApplyCostsModal() {
      applyCostsModal.classList.add('hidden');
      applyCostsModal.classList.remove('flex');
    }
    document.getElementById('apply-costs-close').addEventListener('click', closeApplyCostsModal);
    document.getElementById('apply-costs-cancel').addEventListener('click', closeApplyCostsModal);

    function orderLabelFor(orderId) {
      const o = orders.find((x) => x.orderId === orderId);
      return o ? `${o.productDisplay} (${o.orderId})` : orderId;
    }

    function openApplyCostsModal(preview) {
      applyCostsNotify.checked = false;
      applyCostsWarning.classList.add('hidden');
      applyCostsList.innerHTML = preview.map((p) => {
        const beforeText = p.before === null ? 'пусто' : `${p.before.toLocaleString('ru-RU')} ₽`;
        return `
          <div class="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0 text-sm">
            <span class="text-gray-600 truncate">${escapeHtmlClient(orderLabelFor(p.orderId))}</span>
            <span class="shrink-0 font-medium text-gray-900">${beforeText} → ${p.after.toLocaleString('ru-RU')} ₽</span>
          </div>
        `;
      }).join('');
      applyCostsModal.classList.remove('hidden');
      applyCostsModal.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    applyCostsBtn.addEventListener('click', async () => {
      if (applyCostsBtn.disabled) return;
      // Незасейвленные факт.-поля — предупредить, тот же гейт, что у любого
      // другого действия, читающего СОХРАНЁННУЮ сверку (см. warnIfCostFieldsDirty).
      if (!(await warnIfCostFieldsDirty())) return;

      applyCostsBtn.disabled = true;
      try {
        const preview = await callServer('previewApplyCollectiveLogisticsSharesToOrders', collectiveId);
        openApplyCostsModal(preview);
      } catch (error) {
        showSaveToast(false, 'Не удалось построить предпросмотр: ' + error.message);
      } finally {
        applyCostsBtn.disabled = false;
      }
    });

    applyCostsConfirmBtn.addEventListener('click', async () => {
      if (applyCostsConfirmBtn.disabled) return;
      applyCostsConfirmBtn.disabled = true;
      applyCostsWarning.classList.add('hidden');
      try {
        const result = await callServer('applyCollectiveLogisticsSharesToOrders', collectiveId, { notifyClients: applyCostsNotify.checked });
        closeApplyCostsModal();
        if (result.failed.length > 0) showSaveToast(false, `Применено к ${result.applied.length}, не удалось для ${result.failed.length}.`);
        else showSaveToast(true, `Применено к ${result.applied.length} заказ(ам).`);
      } catch (error) {
        applyCostsWarning.textContent = error.message;
        applyCostsWarning.classList.remove('hidden');
      } finally {
        applyCostsConfirmBtn.disabled = false;
      }
    });

    // --- Добавить заказ ---

    const detailOrderSearch = document.getElementById('detail-order-search');
    const detailOrderDropdown = document.getElementById('detail-order-dropdown');
    const handleOrderSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { detailOrderDropdown.classList.remove('active'); return; }

      const results = await callServer('searchOrdersForCollective', query);
      detailOrderDropdown.innerHTML = '';
      if (results.length === 0) {
        detailOrderDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach((item) => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.productDisplay)}</div><div class="text-xs text-gray-400">${escapeHtmlClient(item.clientDisplay || 'без клиента')}</div>`;
          li.addEventListener('click', async () => {
            detailOrderDropdown.classList.remove('active');
            detailOrderSearch.value = '';
            if (!(await guardUnsavedBeforeReload())) return;

            // Перенос из ДРУГОЙ коллективки того же этапа (Э3) — раньше
            // это происходило молча; теперь тянет авто-пересчёт сверки той
            // коллективки, откуда заказ уходит, если она уже сверялась.
            if (item.collectiveId && item.collectiveId !== collectiveId) {
              let sourceName = item.collectiveId;
              try {
                const list = await callServer('getCollectivesList');
                const source = list.find((c) => c.collectiveId === item.collectiveId);
                if (source) sourceName = source.name || source.collectiveId;
              } catch (e) { /* best-effort — покажем хотя бы ID */ }
              const confirmed = await showConfirmModal(
                `Заказ уже в коллективке «${sourceName}» — это перенос, её сверка (если уже проводилась) будет пересчитана. Продолжить?`,
                { confirmLabel: 'Перенести' }
              );
              if (!confirmed) return;
            }

            try {
              await callServer('assignOrderToCollective', item.orderId, collectiveId);
              await loadAll();
            } catch (error) {
              showSaveToast(false, 'Не удалось добавить заказ: ' + error.message);
            }
          });
          detailOrderDropdown.appendChild(li);
        });
      }
      detailOrderDropdown.classList.add('active');
    }, 300);
    detailOrderSearch.addEventListener('input', handleOrderSearch);

    document.addEventListener('click', (e) => {
      if (!detailOrderSearch.contains(e.target) && !detailOrderDropdown.contains(e.target)) {
        detailOrderDropdown.classList.remove('active');
      }
    }, { signal });
  }
};
