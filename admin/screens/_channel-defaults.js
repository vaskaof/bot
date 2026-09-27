'use strict';

/**
 * Автоподстановка «канал → аккаунт/карго/валюта» (волна 1 аудита работы
 * менеджера, 28.09.2026). Используется «Новой корзиной» (cart-new.js).
 *
 * Данные — `getChannelDefaults` (сервер считает частоту по истории заказов,
 * см. server/src/dictionaries/channelDefaultsService.js), грузятся один раз
 * за сессию SPA.
 *
 * `wireChips(select, chipsEl)` — поверх обычного справочного `<select>`
 * (он остаётся источником значения для сохранения, дублирования корзины и
 * e2e) рисует 1–3 кнопки с самыми частыми для канала вариантами + «Другой»,
 * который раскрывает полный список. Выбор человека (кнопка или список)
 * запоминается — смена канала после этого поле уже не перезаписывает.
 */
window.ChannelDefaults = {
  _promise: null,

  // Каналы, где валюта выбирается осознанно каждый раз: AmazonUK оплачивают
  // в долларах через конвертацию, но бывает и в фунтах (решение VASY,
  // 27.09.2026) — рядом с валютой показываются две крупные кнопки.
  CURRENCY_CHOICES: {
    AmazonUK: [
      { value: 'Доллар', label: '$ Доллар', note: 'через конвертацию' },
      { value: 'Фунт', label: '£ Фунт', note: 'напрямую' }
    ]
  },

  load() {
    if (!this._promise) {
      this._promise = callServer('getChannelDefaults').catch(() => {
        this._promise = null;
        return {};
      });
    }
    return this._promise;
  },

  /** Самые частые значения, которые ещё есть в справочнике. */
  topValues(stats, dictValues, limit) {
    const allowed = new Set(dictValues || []);
    return (stats || []).map((s) => s.value).filter((v) => allowed.has(v)).slice(0, limit);
  },

  wireChips(select, chipsEl) {
    let options = [];
    let expanded = false;
    let touched = false;

    function render() {
      if (options.length === 0) {
        chipsEl.classList.add('hidden');
        chipsEl.innerHTML = '';
        select.classList.remove('hidden');
        return;
      }
      const current = select.value;
      const offList = current !== '' && !options.includes(current);
      const showSelect = expanded || offList;
      chipsEl.classList.remove('hidden');
      chipsEl.innerHTML = '';
      options.forEach((value) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = value === current && !showSelect;
        btn.className = `px-2.5 py-1 rounded-lg text-[13px] border max-w-full truncate ${active
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white border-gray-200 text-gray-700'}`;
        btn.textContent = value;
        btn.title = value;
        btn.addEventListener('click', () => {
          touched = true;
          expanded = false;
          select.value = value;
          render();
        });
        chipsEl.appendChild(btn);
      });
      const other = document.createElement('button');
      other.type = 'button';
      other.className = `px-2.5 py-1 rounded-lg text-[13px] border ${showSelect
        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
        : 'bg-white border-dashed border-gray-300 text-gray-500'}`;
      other.textContent = 'Другой';
      other.addEventListener('click', () => {
        expanded = true;
        render();
        select.focus();
      });
      chipsEl.appendChild(other);
      select.classList.toggle('hidden', !showSelect);
    }

    select.addEventListener('input', () => { touched = true; });
    select.addEventListener('change', render);

    return {
      /** @param {string[]} values @param {{autoSelect?:boolean}} [opts] */
      setOptions(values, opts) {
        options = values || [];
        const autoSelect = !opts || opts.autoSelect !== false;
        // Не тронутое человеком поле целиком принадлежит автоподстановке:
        // у канала без истории прежний авто-выбор (от другого канала) снимается.
        if (autoSelect && !touched) {
          select.value = options.length > 0 ? options[0] : '';
          expanded = false;
        }
        render();
      },
      markTouched() { touched = true; render(); },
      isTouched() { return touched; }
    };
  }
};
