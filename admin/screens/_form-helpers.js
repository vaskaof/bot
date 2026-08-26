'use strict';

/**
 * Общие хелперы форм заказа — раньше дословно дублировались в index.html и
 * edit-order.html (populateSelect/initTagToggle/renderDropdown). Используются
 * order-new.js/order-edit.js.
 */
const DICT_ADD_NEW_VALUE = '__add_new_dictionary_value__';

window.FormHelpers = {
  /** Заполняет <select> значениями справочника с плейсхолдером "не выбрано". */
  populateSelect(selector, values) {
    const select = document.querySelector(selector);
    if (!select || !values) return;
    const placeholder = '<option value="" selected disabled>— не выбрано —</option>';
    select.innerHTML = placeholder + values.map(v => `<option value="${v}">${v}</option>`).join('');
  },

  /**
   * Справочный `<select>` + возможность добавить своё значение прямо из формы
   * (21.08.2026, Фаза 2 миграции на Postgres, домен "Справочники" — аналог
   * "создать выпуск" на лету, только без полноценной модалки: справочники —
   * плоские строки, не карточки с полями). Заполняет список ЧЕРЕЗ
   * populateSelect + добавляет опцию "+ Добавить своё значение…" в конец.
   * При её выборе — `showPromptModal` (common.js), новое значение уходит на
   * сервер (`addDictionaryValue`), список локально обновляется и новое
   * значение сразу выбирается. Отмена/пустой ввод — селект возвращается на
   * значение, которое было выбрано до открытия модалки.
   * @param {string} selector CSS-селектор `<select>`
   * @param {string} category Один из ключей ответа getDictionaries
   * @param {string[]} values Текущий список значений категории
   */
  wireDictionarySelect(selector, category, values) {
    const select = document.querySelector(selector);
    if (!select) return;

    let currentValues = values || [];
    let lastRealValue = ''; // значение ДО открытия "+Добавить" — сентинел сюда никогда не попадает

    function render() {
      FormHelpers.populateSelect(selector, currentValues);
      const addOption = document.createElement('option');
      addOption.value = DICT_ADD_NEW_VALUE;
      addOption.textContent = '+ Добавить своё значение…';
      select.appendChild(addOption);
    }
    render();

    select.addEventListener('change', async () => {
      if (select.value !== DICT_ADD_NEW_VALUE) {
        lastRealValue = select.value;
        return;
      }

      const input = await showPromptModal('Новое значение справочника:', { placeholder: 'Введите значение' });
      const trimmed = input ? input.trim() : '';
      if (trimmed === '') {
        select.value = lastRealValue;
        return;
      }

      try {
        const result = await callServer('addDictionaryValue', category, trimmed);
        currentValues = result.values;
        render();
        select.value = result.value;
        lastRealValue = result.value;
      } catch (error) {
        showSaveToast(false, error.message || 'Не удалось добавить значение справочника.');
        select.value = lastRealValue;
      }
    });
  },

  /**
   * Универсальный обработчик тэг-переключателей Да/Нет. Состояние хранится
   * в data-value контейнера.
   */
  initTagToggle(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const buttons = container.querySelectorAll('.toggle-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.toggleValue;
        container.dataset.value = value;

        buttons.forEach(b => {
          const active = b.dataset.toggleValue === value;
          b.classList.toggle('border-indigo-500', active);
          b.classList.toggle('bg-indigo-50', active);
          b.classList.toggle('text-indigo-600', active);
          b.classList.toggle('border-gray-200', !active);
          b.classList.toggle('text-gray-500', !active);
        });
      });
    });
  },

  /** Программно выставляет состояние тэг-переключателя (для предзаполнения из загруженных данных). */
  setTagToggle(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.value = value;
    container.querySelectorAll('.toggle-btn').forEach(b => {
      const active = b.dataset.toggleValue === value;
      b.classList.toggle('border-indigo-500', active);
      b.classList.toggle('bg-indigo-50', active);
      b.classList.toggle('text-indigo-600', active);
      b.classList.toggle('border-gray-200', !active);
      b.classList.toggle('text-gray-500', !active);
    });
  },

  /**
   * Авто-подсказка "Канал выкупа" по домену вставленной ссылки на покупку
   * (Фаза 6.2, 04.08.2026) — тот же принцип, что skuModalGuessBrand в
   * _sku-modal.js: чистый словарь без AI, никогда не перезаписывает уже
   * выбранное (проверка на пустое значение — на вызывающей стороне). В
   * отличие от Бренда, "Канал выкупа" — управляемый справочник, а не
   * свободный текст, поэтому подсказка ищет СОВПАДЕНИЕ ПОДСТРОКИ по ключевому
   * слову внутри уже существующих значений availableChannels, а не отдаёт
   * фиксированную строку "в лоб" — названия каналов в справочнике у разных
   * магазинов настраиваются вручную и могут отличаться ("Amazon"/"Amazon.com").
   * @param {string} url
   * @param {string[]} availableChannels dictionaries.purchaseChannel
   * @returns {string|null} Одно из значений availableChannels, либо null
   */
  guessPurchaseChannel(url, availableChannels) {
    if (!url || !availableChannels || availableChannels.length === 0) return null;

    const hostMatch = url.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
    if (!hostMatch) return null;
    const host = hostMatch[1].toLowerCase();

    const DOMAIN_KEYWORDS = [
      ['amazon.', 'amazon'],
      ['ebay.', 'ebay'],
      ['mercari.', 'mercari'],
      ['mattel.com', 'mattel'],
      ['bratz.com', 'bratz'],
      ['aliexpress.', 'aliexpress'],
      ['etsy.', 'etsy'],
      ['walmart.', 'walmart'],
      ['target.', 'target']
    ];

    for (const [domainFragment, keyword] of DOMAIN_KEYWORDS) {
      if (!host.includes(domainFragment)) continue;
      const match = availableChannels.find(ch => ch.toLowerCase().includes(keyword));
      if (match) return match;
    }
    return null;
  },

  /**
   * Разметка блока подсказки/обязательной причины при заниженной комиссии
   * (Э6, D-10/F-24, 26.08.2026) — общая для order-new.js/order-edit.js,
   * вставляется сразу под полем "Комиссия" (`#fee-percent`/`#fee-rub`).
   * Скрыта по умолчанию — `wireCommissionGate` управляет видимостью.
   */
  commissionGateHtml() {
    return `
      <div id="commission-hint-row" class="hidden field-row flex flex-col p-4 border-b border-gray-100 gap-2">
        <div id="commission-hint-text" class="text-[12px] leading-tight"></div>
        <div id="commission-reason-block" class="hidden flex flex-col gap-1">
          <label for="commission-reason-input" class="text-[11px] text-gray-500">Причина занижения комиссии (обязательно для сохранения)</label>
          <textarea id="commission-reason-input" rows="2" class="w-full rounded-lg border border-red-200 px-3 py-2 text-sm" placeholder="Например: постоянный клиент, скидка по договорённости"></textarea>
        </div>
      </div>
    `;
  },

  /**
   * Живая подсказка + обязательное поле причины при заниженной комиссии
   * (Э6, D-10/F-24, 26.08.2026) — договорённость с VASY 26.08.2026: мягкая
   * подсказка ниже `warnPercent`, ОБЯЗАТЕЛЬНОЕ поле причины ниже
   * `reasonPercent` (не блокирует сам заказ — только формально пустую
   * причину, `validate()` вызывается ТОЛЬКО когда сервер реально будет
   * гейтить это сохранение — см. вызывающий код в order-new.js/
   * order-edit.js: гейт на бэкенде срабатывает лишь когда "Бронь/комиссия"
   * реально введена/изменена в этом сохранении, тот же принцип здесь на
   * фронте не дублируется — `validate()` просто сверяет ТЕКУЩЕЕ состояние
   * поля % в момент клика "Сохранить", вызывающая сторона сама решает,
   * когда его звать).
   *
   * Пороги приходят НЕ через отдельный вызов — `getOrderForecast` уже
   * возвращает `commissionWarnPercent`/`commissionReasonPercent` в той же
   * карточке, что `commissionPercent` (целевая комиссия).
   *
   * `feePercentInput.value` меняется из ТРЁХ разных путей на этих экранах
   * (ввод в сам % напрямую, пересчёт из ₽-поля через `updateFeePercent`,
   * автоподстановка прогноза) — ни один из них не гарантированно диспатчит
   * `'input'` на самом `#fee-percent` (программное `.value =` не диспатчит
   * событие). Поэтому `update()` слушает `'input'` НА ОБОИХ полях
   * (`#fee-percent`/`#fee-rub`) — к моменту, когда наш слушатель
   * срабатывает, `updateFeePercent`/`updateFeeRub` (уже навешанные раньше в
   * самом экране) успевают отработать синхронно первыми.
   * `isDirty()` (по умолчанию — всегда `true`, order-new.js: заказ целиком
   * новый, "заниженность" всегда актуальна) — order-edit.js передаёт
   * реальную проверку "Бронь/комиссия отличается от загруженной", тот же
   * критерий, что и на сервере (`ordersService.updateOrder`). Пока
   * `isDirty()` false — ни подсказка, ни обязательное поле НЕ показываются
   * вообще, даже если % уже исторически ниже порога: несвязанная правка
   * старого заказа не должна упираться в причину, которую менеджер не
   * вводил и не обязан знать (R-03).
   * @param {{feePercentSelector?:string, feeRubSelector?:string, isDirty?:()=>boolean}} [options]
   * @returns {{setThresholds(t:{warnPercent:number,reasonPercent:number}):void, refresh():void, getReason():string, validate():boolean}}
   */
  wireCommissionGate({ feePercentSelector = '#fee-percent', feeRubSelector = '#fee-rub', isDirty = () => true } = {}) {
    const feePercentInput = document.querySelector(feePercentSelector);
    const feeRubInput = document.querySelector(feeRubSelector);
    const hintRow = document.getElementById('commission-hint-row');
    const hintText = document.getElementById('commission-hint-text');
    const reasonBlock = document.getElementById('commission-reason-block');
    const reasonInput = document.getElementById('commission-reason-input');
    const noop = { setThresholds() {}, refresh() {}, getReason: () => '', validate: () => true };
    if (!feePercentInput || !hintRow || !hintText || !reasonBlock || !reasonInput) return noop;

    let thresholds = { warnPercent: null, reasonPercent: null };

    function update() {
      const pct = parseFloat(feePercentInput.value);
      if (isNaN(pct) || thresholds.reasonPercent === null || thresholds.warnPercent === null || !isDirty()) {
        hintRow.classList.add('hidden');
        reasonBlock.classList.add('hidden');
        return;
      }
      if (pct < thresholds.reasonPercent) {
        hintRow.classList.remove('hidden');
        hintText.className = 'text-[12px] leading-tight text-red-600';
        hintText.textContent = `Комиссия ${pct.toFixed(2)}% ниже порога ${thresholds.reasonPercent}% — без указанной причины заказ не сохранится.`;
        reasonBlock.classList.remove('hidden');
      } else if (pct < thresholds.warnPercent) {
        hintRow.classList.remove('hidden');
        hintText.className = 'text-[12px] leading-tight text-amber-600';
        hintText.textContent = `Комиссия ${pct.toFixed(2)}% ниже целевых ${thresholds.warnPercent}%.`;
        reasonBlock.classList.add('hidden');
      } else {
        hintRow.classList.add('hidden');
        reasonBlock.classList.add('hidden');
      }
    }

    feePercentInput.addEventListener('input', update);
    if (feeRubInput) feeRubInput.addEventListener('input', update);

    return {
      setThresholds(t) { thresholds = t || { warnPercent: null, reasonPercent: null }; update(); },
      refresh: update,
      getReason() { return reasonInput.value.trim(); },
      validate() {
        if (!isDirty()) return true;
        const pct = parseFloat(feePercentInput.value);
        if (!isNaN(pct) && thresholds.reasonPercent !== null && pct < thresholds.reasonPercent && reasonInput.value.trim() === '') {
          reasonBlock.classList.remove('hidden');
          hintRow.classList.remove('hidden');
          reasonInput.focus();
          return false;
        }
        return true;
      }
    };
  },

  /** Общий рендер выпадающего списка автокомплита (release/client search). */
  renderDropdown(container, items, templateFn, onSelect) {
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
    } else {
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0';
        li.innerHTML = templateFn(item);
        li.addEventListener('click', (e) => {
          const editBtn = e.target.closest('.sku-edit-icon');
          if (editBtn) {
            e.stopPropagation();
            onSelect(null, editBtn);
            return;
          }
          onSelect(item, null);
        });
        container.appendChild(li);
      });
    }
    container.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  }
};
