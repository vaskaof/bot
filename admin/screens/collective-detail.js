'use strict';

/**
 * Экран "Коллективка" — адресуемый маршрут `collectives/{id}` (Э2
 * рефакторинга коллективок, 24.08.2026, REFACTOR-COLLECTIVES.md §6.1),
 * заменяет `collective-detail-modal` из `collectives.js` (та модалка и весь
 * код связанных ползунков сверки вырезаны оттуда тем же срезом). Решает
 * прямую жалобу VASY "ушёл в заказ из коллективки, вернулся в закрытую
 * модалку" — тап по карточке заказа ведёт на настоящий `orders/{id}/edit`,
 * "Назад" там — обычный `history.back()`, который сам возвращает сюда
 * (оба перехода — реальные записи в history, не replace).
 *
 * Единый список заказов (п.3 Э2) — раньше было два разных рендера одних и
 * тех же заказов (список заказов коллективки + список для сверки долей),
 * VASY явно попросил объединить. Источник данных — ДВА вызова
 * (getCollectiveDetails + getCollectiveLogisticsContext), тот же принцип,
 * что был в старой модалке (openDetailModal + loadLogisticsSection), но
 * рендерятся уже ОДНИМ списком карточек, не двумя.
 *
 * Доли — ползунок 0…1 шаг 1/8 (§1 п.2, §2.4), сохраняется В ЗАКАЗ с
 * дебаунсом ~600мс через setOrderLogisticsUnits, ОТДЕЛЬНО от "Сохранить
 * сверку" (та пишет только денежные проводки). Алгоритм связанных ползунков
 * (redistributeShares/normalizeSharesSum/updateSliderPositions) с долями не
 * нужен — нормализация теперь на сервере (доля_i = units_i/Σunits, §2.4).
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
        <!-- Общая датаlist для всех ползунков доли (§1 п.2) — засечки на
             каждый шаг 1/8; поддерживается не везде (Safari/iOS WebView
             даталист-засечки для range не рисует вообще), поэтому под каждым
             ползунком ЕЩЁ и статичная текстовая строка "0 ¼ ½ ¾ 1" ниже —
             единственный надёжный кросс-платформенный вариант в Telegram Mini App. -->
        <datalist id="units-ticks">
          <option value="0"></option><option value="0.125"></option><option value="0.25"></option><option value="0.375"></option>
          <option value="0.5"></option><option value="0.625"></option><option value="0.75"></option><option value="0.875"></option><option value="1"></option>
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
            <span class="text-sm font-medium text-gray-700">Выбрано: <span id="bulk-selected-count">0</span></span>
            <button type="button" id="bulk-cancel-btn" class="text-xs text-gray-400 font-medium">Отменить</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="bulk-unassign-btn" class="py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Убрать из коллективки</button>
            <button type="button" id="bulk-transfer-btn" class="py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Перенести в другую</button>
            <!-- Э5, REFACTOR-COLLECTIVES.md §3 -->
            <button type="button" id="bulk-status-btn" class="col-span-2 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Сменить статус доставки</button>
          </div>
        </div>
      </div>

      ${CollectivePickerModal.html()}
      ${DeliveryStatusModal.html()}
    `;

    let details = null; // {collectiveId,name,trackNumber,status,stage,summary,...}
    let orders = []; // единый массив карточек — объединяет getCollectiveDetails.orders + alreadyEstimated/units из getCollectiveLogisticsContext
    let actualCosts = { sdekCost: 0, taxiKzCost: 0, taxiRfCost: 0 };
    const unitDebounceTimers = new Map(); // orderId -> timer, отдельный дебаунс на каждый ползунок

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
        renderCostFields();
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

    function renderDetailsCard() {
      document.getElementById('detail-name').value = details.name || '';
      document.getElementById('detail-track').value = details.trackNumber || '';
      document.getElementById('stage-chip').textContent = details.stage;
      renderStatusOptions(details.status);
      renderSummary();
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
    detailSaveBtn.addEventListener('click', async () => {
      if (detailSaveBtn.disabled) return;
      detailErrorText.classList.add('hidden');

      const name = document.getElementById('detail-name').value.trim();
      const trackNumber = document.getElementById('detail-track').value.trim();
      const status = document.getElementById('detail-status').value;

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
        if (!confirmed) return;
      }

      detailSaveBtn.disabled = true;
      try {
        await callServer('updateCollective', collectiveId, { name, trackNumber, status });
        details.name = name;
        details.trackNumber = trackNumber;
        details.status = status;
        document.getElementById('header-title').textContent = name || collectiveId;
        showSaveToast(true, 'Коллективка обновлена');
      } catch (error) {
        detailErrorText.textContent = error.message;
        detailErrorText.classList.remove('hidden');
        showSaveToast(false, 'Не удалось сохранить: ' + error.message);
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
    // Курс — БЕЗ клиентской наценки (currencyService.getRawKztToRubRate,
    // см. её JSDoc за обоснованием) — тот же принцип, что $→₽ калькулятор
    // веса в форме заказа: клиент конвертирует сам, отправляет уже готовую
    // ₽-сумму, тенге-ввод никогда не уходит на сервер как источник истины.
    let rawKztToRubRate = null; // кэш на время экрана, обновляется явной кнопкой
    const costFieldCurrency = {}; // key -> 'RUB'|'KZT'
    const costFieldOriginal = {}; // key -> введённая сумма В ТЕКУЩЕЙ валюте поля (для KZT — тенге)

    async function ensureRawRate() {
      if (rawKztToRubRate !== null) return rawKztToRubRate;
      const { kztToRub } = await callServer('getRawKztToRubRate');
      rawKztToRubRate = kztToRub;
      return rawKztToRubRate;
    }

    function renderCostFields() {
      const fields = COST_FIELD_LABELS[details.stage] || COST_FIELD_LABELS['КЗ→РФ'];
      const currencyKeyOf = { sdekCost: 'sdekCostCurrency', taxiKzCost: 'taxiKzCostCurrency', taxiRfCost: 'taxiRfCostCurrency' };
      const originalKeyOf = { sdekCost: 'sdekCostOriginal', taxiKzCost: 'taxiKzCostOriginal', taxiRfCost: 'taxiRfCostOriginal' };
      fields.forEach((f) => {
        const currency = actualCosts[currencyKeyOf[f.key]] || 'RUB';
        costFieldCurrency[f.key] = currency;
        const original = actualCosts[originalKeyOf[f.key]];
        costFieldOriginal[f.key] = currency === 'KZT' && original !== null && original !== undefined ? original : (actualCosts[f.key] || '');
      });

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
          if (costFieldCurrency[key] === 'KZT') { try { await ensureRawRate(); } catch (e) { /* сеть недоступна — hint покажет "курс недоступен" ниже */ } }
          updateCostsPreview();
        });
      });

      updateCostsPreview();
    }

    // Читает поля формы в {sdekCost,taxiKzCost,taxiRfCost} УЖЕ В РУБЛЯХ
    // (конвертирует KZT-поля по rawKztToRubRate) + `*Currency`/`*Original`
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
          result[f.key] = rawKztToRubRate ? round2(rawValue * rawKztToRubRate) : null;
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
        hint.textContent = rawKztToRubRate
          ? `≈ ${costs[f.key].toLocaleString('ru-RU')} ₽ по курсу ${rawKztToRubRate.toFixed(4)} ₽/₸`
          : 'Курс ЦБ РФ недоступен — переключите на ₽ или дождитесь курса, сохранение пока заблокировано';
      });
      const total = round2(actualCosts.sdekCost + actualCosts.taxiKzCost + actualCosts.taxiRfCost);
      document.getElementById('logistics-total').textContent = total.toLocaleString('ru-RU');
      renderOrderList(); // доля в ₽/разница видны только когда total > 0 (п.3) — пересчитать видимость
    }

    // --- Единый список заказов (карточка = миниатюра/статусы/примечание/ползунок доли/доля в ₽) ---

    function unitsFraction(units) {
      const eighths = Math.round(units * 8);
      return eighths === 8 ? '1' : eighths === 0 ? '0' : `${eighths}/8`;
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

    const bulkTransferPicker = CollectivePickerModal.init({
      onPicked: async (targetCollective) => {
        const toMove = selectedOrders();
        if (toMove.length === 0) return;
        const remaining = Math.max(0, orders.length - toMove.length);
        const recalcNote = currentTotalCost() > 0 ? ` Сверка «${details.name || details.collectiveId}» будет пересчитана на оставшиеся ${remaining}.` : '';
        const confirmed = await showConfirmModal(
          `Перенести ${toMove.length} заказ(ов) в «${targetCollective.name || targetCollective.collectiveId}»?${recalcNote}`,
          { confirmLabel: 'Перенести' }
        );
        if (!confirmed) return;

        try {
          const result = await callServer('assignOrdersToCollective', toMove.map((o) => o.orderId), targetCollective.collectiveId);
          const okCount = result.moved.length + result.added.length;
          if (result.failed.length > 0) showSaveToast(false, `Перенесено ${okCount}, ${result.failed.length} не удалось.`);
          else showSaveToast(true, `Перенесено: ${okCount}.`);
          setSelectMode(false);
          await loadAll();
        } catch (error) {
          showSaveToast(false, 'Не удалось перенести: ' + error.message);
        }
      }
    });

    bulkTransferBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      bulkTransferPicker.open({ excludeCollectiveId: collectiveId });
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

    bulkStatusBtn.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
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

    function buildOrderCard(o, totalCost, unitsSum) {
      const card = document.createElement('div');
      const isSelected = selectedIds.has(o.orderId);
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-100'}`;
      card.dataset.orderId = o.orderId;
      card.addEventListener('click', () => {
        if (selectMode) { toggleSelected(o.orderId); renderOrderList(); return; }
        navigateTo(`orders/${encodeURIComponent(o.orderId)}/edit`);
      });

      const diff = diffLabel(o, totalCost, unitsSum);

      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${selectMode ? `
            <div class="shrink-0 pt-0.5">
              <input type="checkbox" class="order-select-checkbox w-5 h-5 rounded border-gray-300 text-indigo-600" ${isSelected ? 'checked' : ''}>
            </div>
          ` : ''}
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(o.productDisplay)}</div>
                <div class="text-[11px] text-gray-300 mt-0.5">№ ${escapeHtmlClient(o.orderId)}</div>
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
                <span>Доля логистики</span>
                <span class="units-fraction-label font-semibold text-indigo-600">${unitsFraction(o.currentUnits)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.125" value="${o.currentUnits}" list="units-ticks" class="units-slider w-full mt-1">
              <div class="flex justify-between text-[9px] text-gray-300 px-0.5 -mt-0.5"><span>0</span><span>¼</span><span>½</span><span>¾</span><span>1</span></div>
              ${diff ? `<div class="diff-label text-[11px] mt-1 ${diff.cls}">${diff.text}</div>` : ''}
            </div>
          </div>
        </div>
      `;

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
      sliderBlock.addEventListener('click', (e) => e.stopPropagation());
      const slider = card.querySelector('.units-slider');
      slider.addEventListener('input', () => {
        const newUnits = parseFloat(slider.value);
        o.currentUnits = newUnits;
        card.querySelector('.units-fraction-label').textContent = unitsFraction(newUnits);
        // Пересчёт diff-подписи и Σ долей в шапке — чисто локально, без
        // похода на сервер (те же данные уже на руках), сохранение самой
        // доли — отдельным дебаунсом ниже.
        const freshTotal = round2((actualCosts.sdekCost || 0) + (actualCosts.taxiKzCost || 0) + (actualCosts.taxiRfCost || 0));
        const freshUnitsSum = orders.reduce((s, x) => s + x.currentUnits, 0);
        const label = diffLabel(o, freshTotal, freshUnitsSum);
        const diffEl = card.querySelector('.diff-label');
        if (label && diffEl) {
          diffEl.textContent = label.text;
          diffEl.className = `diff-label text-[11px] mt-1 ${label.cls}`;
        } else if (label && !diffEl) {
          sliderBlock.insertAdjacentHTML('beforeend', `<div class="diff-label text-[11px] mt-1 ${label.cls}">${label.text}</div>`);
        } else if (!label && diffEl) {
          diffEl.remove();
        }
        document.getElementById('summary-units-sum').textContent = round2(freshUnitsSum);

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
        logisticsErrorText.textContent = `Курс ЦБ РФ недоступен для поля(ей) в ₸: ${unresolvedKzt.join(', ')}. Переключите на ₽ или дождитесь курса.`;
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
