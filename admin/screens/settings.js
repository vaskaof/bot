'use strict';

/**
 * Экран "Настройки" (13.08.2026, project_bot_knopka_financial_settings_ui,
 * Фаза 1) — комиссия/налоговый резерв/доли выплат, редактируемые без
 * деплоя. Заменяет ручную правку листа "Настройки_Финансов".
 *
 * Категория `payout_share` (доли выплат) — ОСОБЫЙ блок, редактируется ТОЛЬКО
 * целиком через `replacePayoutShares` (сервер отказывает целиком, если сумма
 * ≠ 100%, см. `financialSettingsRepository.js`) — правки долей копятся
 * локально (`sharesDraft`), кнопка "Сохранить доли" неактивна, пока сумма ≠
 * 100%. `commission`/`tax_reserve` редактируются построчно через общую форму
 * "Добавить позицию", сохранение сразу по кнопке у строки.
 *
 * Категория `forecast` (прогноз расходов) — ТОЖЕ особый блок, редизайн
 * 13.08.2026 (тот же день, по итогам ручной проверки Фазы 2): ФИКСИРОВАННЫЕ
 * 5 позиций (см. FORECAST_FIELD_DEFS, ключи СОВПАДАЮТ с backend
 * financialSettingsService.FORECAST_KEYS) — БОЛЬШЕ НЕ входит в "Добавить
 * позицию" (ключ там генерируется из лейбла, непредсказуем, ломает
 * getOrderForecast). "Вес" — единственная позиция с выбором единицы
 * (%/₽/$, VASY явно попросил); остальные 4 — только ₽, без выбора.
 * "Доставка КЗ→РФ" на заказе больше НЕ настраивается напрямую здесь —
 * складывается из "Такси КЗ"/"СДЭК"/"Такси РФ" на самом заказе.
 *
 * Э6, D-04 (26.08.2026, project_bot_knopka_economy_refactor) — "Налоговый
 * резерв" получил второй параметр, `Налог_База` (`type='enum'`), рядом с
 * уже существующим процентом, в той же секции. Единственный ключ типа
 * 'enum' сегодня, рендерится select'ом вместо числового поля (см.
 * enumRowHtml/TAX_BASE_KEY ниже) — общий `plainSectionHtml`/`rowHtml`/
 * `wirePlainSection` цикл остался один на все категории, не заведён
 * отдельный особый блок ради одной строки.
 */
window.Screens = window.Screens || {};

const CATEGORY_LABELS = {
  commission: 'Комиссия',
  tax_reserve: 'Налоговый резерв',
  forecast: 'Прогноз расходов на заказ',
  payout_share: 'Доли выплат',
  delivery_position_threshold: 'Пороги для "Доход Руб"',
  economy: 'Экономика (совы/билеты)',
  currency_margin: 'Наценка на конвертацию (курсы валют)'
};
const CATEGORY_ORDER = ['commission', 'tax_reserve', 'forecast', 'delivery_position_threshold', 'economy', 'currency_margin', 'payout_share'];
const SHARE_SUM_TOLERANCE = 0.01;

// Категории, доступные в форме "Добавить позицию" (payout_share сюда НЕ входит —
// доли добавляются отдельной кнопкой "+ Добавить долю" в своём блоке, см.
// wireSharesSection; forecast сюда БОЛЬШЕ НЕ входит с 13.08.2026 — 5
// фиксированных позиций редактируются своим отдельным блоком, см.
// forecastSectionHtml, ключ через эту форму непредсказуем). Подписи/описания
// показываются прямо в выпадающем списке формы.
const ADDABLE_CATEGORIES = [
  { value: 'commission', label: 'Комиссия', help: 'Проценты, связанные с самой комиссией/бронью посредничества по заказу.' },
  { value: 'tax_reserve', label: 'Налоговый резерв', help: 'Проценты, откладываемые в резерв под налоги — вычитаются из комиссии до раздела на доли выплат.' }
];

// Наценка на конвертацию через тенге (project_bot_knopka_full_postgres_
// migration, 21.08.2026) — ФИКСИРОВАННЫЕ позиции, ключи СОВПАДАЮТ с backend
// currencyService.js (MARGIN_KEY_RUB_KZT/MARGIN_KEY_BY_CODE), тот же принцип,
// что ECONOMY_SETTINGS_DEFS/FORECAST_FIELD_DEFS выше — ключ должен быть
// известен заранее, не произволен. ИЗНАЧАЛЬНО эта категория была в
// ADDABLE_CATEGORIES (общая форма "Добавить позицию") — реальный баг, найден
// VASY в тот же день: общая форма генерирует ключ из лейбла (slugKey), у
// VASY физически не было способа ввести именно "Маржа_KZT_GBP" — узнать
// точный алгоритм слага снаружи невозможно. GBP-строка показывается ПУСТОЙ
// (setting=undefined), пока VASY не впишет и не сохранит значение сам.
const CURRENCY_MARGIN_DEFS = [
  { key: 'Маржа_RUB_KZT', label: 'Наценка: рубль → тенге' },
  { key: 'Маржа_KZT_USD', label: 'Наценка: тенге → доллар' },
  { key: 'Маржа_KZT_CNY', label: 'Наценка: тенге → юань' },
  { key: 'Маржа_KZT_EUR', label: 'Наценка: тенге → евро' },
  { key: 'Маржа_KZT_GBP', label: 'Наценка: тенге → фунт' }
];
const TYPE_OPTIONS = [
  { value: 'percent', label: 'Процент (%)', help: 'Значение — процент от базы (например, от суммы товара или от комиссии).' },
  { value: 'fixed', label: 'Фиксированная сумма (₽)', help: 'Значение — фиксированная сумма в рублях, не зависит от суммы заказа.' }
];

// 5 фиксированных позиций прогноза расходов (13.08.2026, редизайн) — ключи
// СОВПАДАЮТ с backend financialSettingsService.FORECAST_KEYS, менять только
// синхронно с обеих сторон. `unitOptions.length > 1` — показывает выбор
// единицы вместо статичного значка ₽ (сейчас это только "Вес").
const FORECAST_FIELD_DEFS = [
  {
    key: 'Прогноз_Вес', label: 'Вес',
    unitOptions: [
      { value: 'percent', badge: '%' },
      { value: 'fixed', badge: '₽' },
      { value: 'fixed_usd', badge: '$' }
    ]
  },
  { key: 'Прогноз_Такси_КЗ', label: 'Такси КЗ', unitOptions: [{ value: 'fixed', badge: '₽' }] },
  { key: 'Прогноз_Стоимость_СДЭК', label: 'СДЭК', unitOptions: [{ value: 'fixed', badge: '₽' }] },
  { key: 'Прогноз_Такси_РФ', label: 'Такси РФ', unitOptions: [{ value: 'fixed', badge: '₽' }] },
  // Э4 рефакторинга коллективок (§2.5, 24.08.2026) — "Доставка по РФ"
  // раскладывается на 3 прогноза тем же приёмом, что и "Доставка КЗ→РФ"
  // выше. Старый единый ключ 'Прогноз_Доставка_РФ' переименован в
  // 'Прогноз_Отправка_РФ' (значение перенесено миграцией на backend).
  { key: 'Прогноз_Такси_РФ_Отправка', label: 'Такси (отправка)', unitOptions: [{ value: 'fixed', badge: '₽' }] },
  { key: 'Прогноз_Отправка_РФ', label: 'Отправка', unitOptions: [{ value: 'fixed', badge: '₽' }] },
  { key: 'Прогноз_Такси_РФ_Получение', label: 'Такси (получение)', unitOptions: [{ value: 'fixed', badge: '₽' }] }
];

// UX-аудит, Шаг 2 (16.08.2026) — редизайн "Доход Руб" под финансовый
// рефакторинг. 4 фиксированных ключа, ключи СОВПАДАЮТ с backend миграцией
// (…_seed-delivery-position-thresholds.js). Значение — номер позиции
// (1-12) в 12-шаговой лестнице доставки (server/src/orders/deliveryLadder.js),
// НЕ деньги и не проценты — неоплаченный расход по этому этапу считается
// вычетом из дохода только когда заказ уже ДОШЁЛ до этой позиции (VASY,
// 16.08.2026: "делает большую погрешность", если считать неоплаченное
// расходом всегда, независимо от того, наступил ли этот этап на самом деле).
const DELIVERY_POSITION_THRESHOLD_DEFS = [
  { key: 'Позиция_Порог_Основная', label: 'Основная' },
  { key: 'Позиция_Порог_Вес', label: 'Вес' },
  { key: 'Позиция_Порог_СДЭК', label: 'СДЭК' },
  { key: 'Позиция_Порог_Доставка_РФ', label: 'Доставка по РФ' }
];

// 18.08.2026 (подготовка к бета-тесту) — 3 фиксированных ключа, ключи
// СОВПАДАЮТ с backend economyService.js (ECONOMY_PARAM_*) и миграцией
// …_seed-economy-settings.js — тот же принцип, что FORECAST_FIELD_DEFS/
// DELIVERY_POSITION_THRESHOLD_DEFS выше. Раньше правились ТОЛЬКО вручную в
// листе "Настройки_Экономики" (лист больше не читается никаким кодом).
// "Сов_За_Билет" добавлен 19.08.2026 (п.2 фидбека после первого дня беты) —
// раньше был захардкожен как ECONOMY_SOVY_PER_TICKET=100 в двух backend-файлах.
const ECONOMY_SETTINGS_DEFS = [
  { key: 'Курс_Рубли_На_Билет', label: 'Курс: рублей на 1 билет', min: 1 },
  { key: 'Сов_За_Билет', label: 'Совы за 1 билет', min: 1 },
  { key: 'Реферал_Совы_Приглашённому', label: 'Реферал: сов приглашённому', min: 0 },
  { key: 'Реферал_Совы_Пригласившему', label: 'Реферал: сов пригласившему', min: 0 }
];

function slugKey(label) {
  return label.trim().replace(/\s+/g, '_');
}

// Э6, D-04 (26.08.2026, project_bot_knopka_economy_refactor) — «Налог
// считается от», единственный сегодня `type='enum'` параметр (category
// 'tax_reserve', та же секция, что "Резерв_Налог_Процент" — рядом стоящий
// процент применяется к выбранной здесь базе). VASY, старт Э6: «режим пока
// определяем, заложи обе возможности» — переключение остаётся ручным
// действием на будущее, форма ничего не выбирает сама. Не удаляется через
// общую кнопку "Удалить" (см. rowHtml/wirePlainSection ниже) — тот же
// принцип, что у FORECAST_FIELD_DEFS/ECONOMY_SETTINGS_DEFS: системный ключ
// с известным значением по умолчанию на backend (getTextValue fallback),
// случайное удаление не опасно, но и не имеет смысла как самостоятельное
// действие (в отличие от произвольных позиций "Добавить позицию").
const TAX_BASE_KEY = 'Налог_База';
const TAX_BASE_OPTIONS = [
  { value: 'комиссия', label: 'От комиссии' },
  { value: 'оборот', label: 'От оборота' }
];

window.Screens.settings = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Настройки</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-10 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="settings-body" class="text-center text-sm text-gray-400 py-10">Загрузка...</div>
      </main>
    `;

    let sharesDraft = null; // {key,label,value}[] — черновик долей выплат, до "Сохранить доли"
    let allSettingsCache = []; // плоский список всех настроек (не-payout_share) — нужен save-row-btn'у для label/type

    load();

    async function load() {
      const body = document.getElementById('settings-body');
      try {
        const settings = await callServer('getFinancialSettings');
        allSettingsCache = settings;
        sharesDraft = settings.filter(s => s.category === 'payout_share').map(s => ({ ...s }));
        renderBody(settings);
      } catch (error) {
        body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderBody(settings) {
      const body = document.getElementById('settings-body');
      const byCategory = {};
      const specialCategories = ['payout_share', 'forecast', 'delivery_position_threshold', 'economy', 'currency_margin'];
      settings.forEach(s => {
        if (specialCategories.includes(s.category)) return; // свои особые блоки, не общий цикл
        (byCategory[s.category] = byCategory[s.category] || []).push(s);
      });
      const forecastRows = settings.filter(s => s.category === 'forecast');
      const positionThresholdRows = settings.filter(s => s.category === 'delivery_position_threshold');
      const economyRows = settings.filter(s => s.category === 'economy');
      const currencyMarginRows = settings.filter(s => s.category === 'currency_margin');

      body.innerHTML = CATEGORY_ORDER.map(cat => {
        if (cat === 'payout_share') return sharesSectionHtml();
        if (cat === 'forecast') return forecastSectionHtml(forecastRows);
        if (cat === 'delivery_position_threshold') return positionThresholdSectionHtml(positionThresholdRows);
        if (cat === 'economy') return economySectionHtml(economyRows);
        if (cat === 'currency_margin') return currencyMarginSectionHtml(currencyMarginRows);
        return plainSectionHtml(cat, byCategory[cat] || []);
      }).join('');

      CATEGORY_ORDER.filter(c => !specialCategories.includes(c)).forEach(cat => wirePlainSection(cat));
      wireSharesSection();
      wireForecastSection();
      wirePositionThresholdSection();
      wireEconomySection();
      wireCurrencyMarginSection();
      wireAddPosition();
      if (window.lucide) window.lucide.createIcons();
    }

    function plainSectionHtml(category, rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS[category]}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="${category}">
            ${rows.length === 0 ? '<div class="p-4 text-sm text-gray-400">Пока пусто</div>' : rows.map(rowHtml).join('')}
          </div>
        </section>
      `;
    }

    function rowHtml(s) {
      if (s.type === 'enum') return enumRowHtml(s);
      return `
        <div class="flex items-center gap-2 p-3" data-row-key="${escapeHtmlClient(s.key)}">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(s.label)}</div>
            <div class="text-[11px] text-gray-400">${escapeHtmlClient(s.key)}</div>
          </div>
          <input type="number" step="0.01" class="value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${s.value}" />
          <span class="text-sm text-gray-400 w-4">${s.type === 'percent' ? '%' : '₽'}</span>
          <button type="button" class="save-row-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <button type="button" class="delete-row-btn p-2 text-gray-400 rounded-full hover:bg-red-50 hover:text-red-500" title="Удалить">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    // Э6, D-04 — строка типа 'enum' (сегодня только TAX_BASE_KEY): выбор
    // из фиксированного набора вместо числового поля, без кнопки "Удалить"
    // (см. обоснование у TAX_BASE_KEY выше).
    function enumRowHtml(s) {
      return `
        <div class="flex items-center gap-2 p-3" data-row-key="${escapeHtmlClient(s.key)}" data-row-type="enum">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(s.label)}</div>
            <div class="text-[11px] text-gray-400">${escapeHtmlClient(s.key)}</div>
          </div>
          <select class="value-select rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
            ${TAX_BASE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === s.valueText ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <button type="button" class="save-row-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function wirePlainSection(category) {
      const container = document.querySelector(`[data-category="${category}"]`);
      if (!container) return;

      container.querySelectorAll('[data-row-key]').forEach(row => {
        const key = row.dataset.rowKey;
        const setting = (allSettingsCache || []).find(s => s.key === key);
        const isEnum = row.dataset.rowType === 'enum';
        row.querySelector('.save-row-btn').addEventListener('click', async () => {
          const payload = { key, label: setting.label, type: setting.type, category: setting.category };
          if (isEnum) {
            payload.valueText = row.querySelector('.value-select').value;
            payload.value = 0;
          } else {
            const value = parseFloat(row.querySelector('.value-input').value);
            if (isNaN(value)) { showSaveToast(false, 'Значение должно быть числом.'); return; }
            payload.value = value;
          }
          try {
            await callServer('upsertFinancialSetting', payload);
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
        const deleteBtn = row.querySelector('.delete-row-btn');
        if (deleteBtn) deleteBtn.addEventListener('click', async () => {
          if (!(await showConfirmModal(`Удалить параметр «${setting.label}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
          try {
            await callServer('deleteFinancialSetting', key);
            showSaveToast(true, 'Удалено.');
            load();
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
      });
    }

    function forecastRowHtml(def, setting) {
      const value = setting ? setting.value : 0;
      const type = setting ? setting.type : def.unitOptions[0].value;
      const unitControl = def.unitOptions.length > 1
        ? `<select class="forecast-type-select bg-transparent border-none outline-none text-xs text-gray-500 shrink-0">
             ${def.unitOptions.map(u => `<option value="${u.value}" ${u.value === type ? 'selected' : ''}>${u.badge}</option>`).join('')}
           </select>`
        : `<span class="text-sm text-gray-400 w-4">${def.unitOptions[0].badge}</span>`;
      return `
        <div class="flex items-center gap-2 p-3" data-forecast-key="${def.key}" data-forecast-label="${escapeHtmlClient(def.label)}">
          <div class="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(def.label)}</div>
          <input type="number" step="0.01" class="forecast-value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${value}" />
          ${unitControl}
          <button type="button" class="forecast-save-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function forecastSectionHtml(rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.forecast}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="forecast">
            ${FORECAST_FIELD_DEFS.map(def => forecastRowHtml(def, rows.find(r => r.key === def.key))).join('')}
          </div>
          <div class="text-[11px] text-gray-400 px-1 mt-2">«Доставка КЗ→РФ» на самом заказе складывается из «Такси КЗ» + «СДЭК» + «Такси РФ» — здесь задаются только прогнозы для предзаполнения формы.</div>
        </section>
      `;
    }

    function wireForecastSection() {
      const container = document.querySelector('[data-category="forecast"]');
      if (!container) return;

      container.querySelectorAll('[data-forecast-key]').forEach(row => {
        const key = row.dataset.forecastKey;
        const label = row.dataset.forecastLabel;
        row.querySelector('.forecast-save-btn').addEventListener('click', async () => {
          const value = parseFloat(row.querySelector('.forecast-value-input').value);
          if (isNaN(value)) { showSaveToast(false, 'Значение должно быть числом.'); return; }
          const typeSelect = row.querySelector('.forecast-type-select');
          const type = typeSelect ? typeSelect.value : 'fixed';
          try {
            await callServer('upsertFinancialSetting', { key, label, value, type, category: 'forecast' });
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
      });
    }

    function positionThresholdRowHtml(def, setting) {
      const value = setting ? setting.value : '';
      return `
        <div class="flex items-center gap-2 p-3" data-position-key="${def.key}" data-position-label="${escapeHtmlClient(def.label)}">
          <div class="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(def.label)}</div>
          <input type="number" step="1" min="1" max="12" class="position-value-input w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${value}" />
          <span class="text-[11px] text-gray-400 w-10">шаг</span>
          <button type="button" class="position-save-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function positionThresholdSectionHtml(rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.delivery_position_threshold}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="delivery_position_threshold">
            ${DELIVERY_POSITION_THRESHOLD_DEFS.map(def => positionThresholdRowHtml(def, rows.find(r => r.key === def.key))).join('')}
          </div>
          <div class="text-[11px] text-gray-400 px-1 mt-2">Номер шага в лестнице статуса доставки (1-12) — неоплаченный расход по этой статье считается вычетом из "Доход Руб" только когда заказ уже прошёл этот шаг, не раньше.</div>
        </section>
      `;
    }

    // ИСПРАВЛЕНО 16.08.2026 (fail-safe чек-лист, frontend-contract.md) —
    // disable-guard на время запроса: правки настроек, влияющих на "Доход
    // Руб" во всей таблице, должны быть особенно защищены от двойного тапа.
    function wirePositionThresholdSection() {
      const container = document.querySelector('[data-category="delivery_position_threshold"]');
      if (!container) return;

      container.querySelectorAll('[data-position-key]').forEach(row => {
        const key = row.dataset.positionKey;
        const label = row.dataset.positionLabel;
        const saveBtn = row.querySelector('.position-save-btn');
        saveBtn.addEventListener('click', async () => {
          if (saveBtn.disabled) return;
          const raw = row.querySelector('.position-value-input').value;
          const value = parseInt(raw, 10);
          if (isNaN(value) || value < 1 || value > 12 || value.toString() !== raw.trim()) {
            showSaveToast(false, 'Значение должно быть целым числом от 1 до 12.');
            return;
          }
          saveBtn.disabled = true;
          try {
            await callServer('upsertFinancialSetting', { key, label, value, type: 'fixed', category: 'delivery_position_threshold' });
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          } finally {
            saveBtn.disabled = false;
          }
        });
      });
    }

    function economyRowHtml(def, setting) {
      const value = setting ? setting.value : '';
      return `
        <div class="flex items-center gap-2 p-3" data-economy-key="${def.key}" data-economy-label="${escapeHtmlClient(def.label)}" data-economy-min="${def.min}">
          <div class="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(def.label)}</div>
          <input type="number" step="1" min="${def.min}" class="economy-value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${value}" />
          <button type="button" class="economy-save-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function currencyMarginRowHtml(def, setting) {
      const value = setting ? setting.value : '';
      return `
        <div class="flex items-center gap-2 p-3" data-margin-key="${def.key}" data-margin-label="${escapeHtmlClient(def.label)}">
          <div class="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(def.label)}</div>
          <input type="number" step="0.001" min="0" class="margin-value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" placeholder="1.00" value="${value}" />
          <span class="text-sm text-gray-400 w-4">×</span>
          <button type="button" class="margin-save-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function currencyMarginSectionHtml(rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.currency_margin}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="currency_margin">
            ${CURRENCY_MARGIN_DEFS.map(def => currencyMarginRowHtml(def, rows.find(r => r.key === def.key))).join('')}
          </div>
          <div class="text-[11px] text-gray-400 px-1 mt-2">Множитель наценки на одно звено конвертации через тенге (например 1.04 = "+4%", 0.94 = "-6%"). "Наценка: тенге → фунт" пуста, пока не впишешь и не сохранишь значение — без неё фунт просто не участвует в расчёте курса заказа.</div>
        </section>
      `;
    }

    function wireCurrencyMarginSection() {
      const container = document.querySelector('[data-category="currency_margin"]');
      if (!container) return;

      container.querySelectorAll('[data-margin-key]').forEach(row => {
        const key = row.dataset.marginKey;
        const label = row.dataset.marginLabel;
        const saveBtn = row.querySelector('.margin-save-btn');
        saveBtn.addEventListener('click', async () => {
          if (saveBtn.disabled) return;
          const value = parseFloat(row.querySelector('.margin-value-input').value);
          if (isNaN(value) || value <= 0) {
            showSaveToast(false, 'Значение должно быть числом больше 0.');
            return;
          }
          saveBtn.disabled = true;
          try {
            await callServer('upsertFinancialSetting', { key, label, value, type: 'fixed', category: 'currency_margin' });
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          } finally {
            saveBtn.disabled = false;
          }
        });
      });
    }

    function economySectionHtml(rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.economy}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="economy">
            ${ECONOMY_SETTINGS_DEFS.map(def => economyRowHtml(def, rows.find(r => r.key === def.key))).join('')}
          </div>
          <div class="text-[11px] text-gray-400 px-1 mt-2">Раньше правилось вручную в таблице (лист "Настройки_Экономики"), теперь — здесь. Реферальные суммы можно поставить 0, чтобы временно отключить бонус; курс должен быть больше 0.</div>
        </section>
      `;
    }

    // Тот же disable-guard, что wirePositionThresholdSection — правки, влияющие
    // на начисление сов на КАЖДОЙ оплате заказа, должны быть защищены от
    // двойного тапа не меньше, чем "Доход Руб".
    function wireEconomySection() {
      const container = document.querySelector('[data-category="economy"]');
      if (!container) return;

      container.querySelectorAll('[data-economy-key]').forEach(row => {
        const key = row.dataset.economyKey;
        const label = row.dataset.economyLabel;
        const min = parseFloat(row.dataset.economyMin);
        const saveBtn = row.querySelector('.economy-save-btn');
        saveBtn.addEventListener('click', async () => {
          if (saveBtn.disabled) return;
          const raw = row.querySelector('.economy-value-input').value;
          const value = parseInt(raw, 10);
          if (isNaN(value) || value < min || value.toString() !== raw.trim()) {
            showSaveToast(false, `Значение должно быть целым числом от ${min}.`);
            return;
          }
          saveBtn.disabled = true;
          try {
            await callServer('upsertFinancialSetting', { key, label, value, type: 'fixed', category: 'economy' });
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          } finally {
            saveBtn.disabled = false;
          }
        });
      });
    }

    function sharesSectionHtml() {
      const sum = sharesDraft.reduce((total, s) => total + (parseFloat(s.value) || 0), 0);
      const sumOk = Math.abs(sum - 100) <= SHARE_SUM_TOLERANCE;
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.payout_share}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" id="shares-list">
            ${sharesDraft.length === 0 ? '<div class="p-4 text-sm text-gray-400">Пока пусто</div>' : sharesDraft.map((s, i) => shareRowHtml(s, i)).join('')}
          </div>
          <div class="flex items-center justify-between mt-2 px-1">
            <span id="shares-sum" class="text-sm font-medium ${sumOk ? 'text-green-600' : 'text-red-500'}">Сумма: ${sum}%${sumOk ? '' : ' — должно быть 100%'}</span>
            <button type="button" id="add-share-btn" class="text-xs font-medium text-indigo-600">+ Добавить долю</button>
          </div>
          <button type="button" id="save-shares-btn" ${sumOk ? '' : 'disabled'}
            class="w-full mt-2 py-2.5 rounded-xl text-sm font-medium ${sumOk ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}">
            Сохранить доли
          </button>
        </section>
      `;
    }

    function shareRowHtml(s, index) {
      return `
        <div class="flex items-center gap-2 p-3" data-share-index="${index}">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(s.label)}</div>
            <div class="text-[11px] text-gray-400">${escapeHtmlClient(s.key)}</div>
          </div>
          <input type="number" step="0.01" class="share-value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${s.value}" />
          <span class="text-sm text-gray-400 w-4">%</span>
          <button type="button" class="remove-share-btn p-2 text-gray-400 rounded-full hover:bg-red-50 hover:text-red-500" title="Убрать (не сохранено, пока не нажата 'Сохранить доли')">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function wireSharesSection() {
      document.querySelectorAll('.share-value-input').forEach(input => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.closest('[data-share-index]').dataset.shareIndex, 10);
          sharesDraft[idx].value = parseFloat(input.value) || 0;
          refreshSharesSum();
        });
      });
      document.querySelectorAll('.remove-share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.closest('[data-share-index]').dataset.shareIndex, 10);
          sharesDraft.splice(idx, 1);
          rerenderShares();
        });
      });
      const addBtn = document.getElementById('add-share-btn');
      if (addBtn) addBtn.addEventListener('click', async () => {
        const label = await showPromptModal('Название доли (например, "Реклама"):');
        if (!label || !label.trim()) return;
        sharesDraft.push({ key: 'Доля_' + slugKey(label) + '_Процент', label: label.trim(), value: 0 });
        rerenderShares();
      });
      const saveBtn = document.getElementById('save-shares-btn');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохраняю...';
        try {
          await callServer('replacePayoutShares', sharesDraft);
          showSaveToast(true, 'Доли сохранены.');
          load();
        } catch (error) {
          showSaveToast(false, error.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Сохранить доли';
        }
      });
    }

    function refreshSharesSum() {
      const sum = sharesDraft.reduce((total, s) => total + (parseFloat(s.value) || 0), 0);
      const sumOk = Math.abs(sum - 100) <= SHARE_SUM_TOLERANCE;
      const sumLabel = document.getElementById('shares-sum');
      const saveBtn = document.getElementById('save-shares-btn');
      if (sumLabel) {
        sumLabel.textContent = `Сумма: ${sum}%${sumOk ? '' : ' — должно быть 100%'}`;
        sumLabel.className = `text-sm font-medium ${sumOk ? 'text-green-600' : 'text-red-500'}`;
      }
      if (saveBtn) {
        saveBtn.disabled = !sumOk;
        saveBtn.className = `w-full mt-2 py-2.5 rounded-xl text-sm font-medium ${sumOk ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
      }
    }

    function rerenderShares() {
      const section = document.getElementById('shares-list').closest('section');
      section.outerHTML = sharesSectionHtml();
      wireSharesSection();
      if (window.lucide) window.lucide.createIcons();
    }

    function addPositionFormHtml() {
      return `
        <div id="add-position-form" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mt-2 space-y-3">
          <div>
            <label class="text-xs font-medium text-gray-500 mb-1 block">Название параметра</label>
            <input type="text" id="new-position-label" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Например, «Прогноз цены веса»" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500 mb-1 block">Категория</label>
            <select id="new-position-category" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              ${ADDABLE_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
            </select>
            <div id="new-position-category-help" class="text-[11px] text-gray-400 mt-1"></div>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500 mb-1 block">Тип значения</label>
            <select id="new-position-type" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              ${TYPE_OPTIONS.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
            <div id="new-position-type-help" class="text-[11px] text-gray-400 mt-1"></div>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500 mb-1 block">Значение</label>
            <input type="number" step="0.01" id="new-position-value" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value="0" />
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" id="cancel-position-btn" class="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-500">Отмена</button>
            <button type="button" id="confirm-position-btn" class="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить</button>
          </div>
        </div>
      `;
    }

    function addPositionButtonHtml() {
      return `<button type="button" id="add-position-btn" class="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500">+ Добавить позицию</button>`;
    }

    function wireAddPosition() {
      const body = document.getElementById('settings-body');
      const addSection = document.createElement('div');
      addSection.className = 'mt-2';
      body.appendChild(addSection);

      function showButton() {
        addSection.innerHTML = addPositionButtonHtml();
        document.getElementById('add-position-btn').addEventListener('click', showForm);
      }

      function showForm() {
        addSection.innerHTML = addPositionFormHtml();

        const categorySelect = document.getElementById('new-position-category');
        const categoryHelp = document.getElementById('new-position-category-help');
        const typeSelect = document.getElementById('new-position-type');
        const typeHelp = document.getElementById('new-position-type-help');

        const updateCategoryHelp = () => { categoryHelp.textContent = ADDABLE_CATEGORIES.find(c => c.value === categorySelect.value).help; };
        const updateTypeHelp = () => { typeHelp.textContent = TYPE_OPTIONS.find(t => t.value === typeSelect.value).help; };
        updateCategoryHelp();
        updateTypeHelp();
        categorySelect.addEventListener('change', updateCategoryHelp);
        typeSelect.addEventListener('change', updateTypeHelp);

        document.getElementById('cancel-position-btn').addEventListener('click', showButton);

        document.getElementById('confirm-position-btn').addEventListener('click', async () => {
          const label = document.getElementById('new-position-label').value.trim();
          if (!label) { showSaveToast(false, 'Название параметра обязательно.'); return; }
          const category = categorySelect.value;
          const type = typeSelect.value;
          const value = parseFloat(document.getElementById('new-position-value').value);
          if (isNaN(value)) { showSaveToast(false, 'Значение должно быть числом.'); return; }
          try {
            await callServer('upsertFinancialSetting', { key: slugKey(label), label, value, type, category });
            showSaveToast(true, 'Добавлено.');
            load();
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
      }

      showButton();
    }
  }
};
