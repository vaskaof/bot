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
