'use strict';

/**
 * Каналы «Версия 2», К7 — «Полный проход по настройкам» (видение «ок» VASY 12.10.2026): понятные подписи,
 * строка «на что влияет» с примером на живых значениях, шаги доставки по названиям, что делает каждый статус
 * заказа, подсказка «сколько ставить» у коэффициентов обмена валют (запрос VASY: «чтоб явно было понятно, сколько
 * поставить для выгодного перевода»). Только текст и арифметика на экране — ключи и значения настроек те же.
 */
(function () {
  // Та же цепочка, что server/src/orders/deliveryLadder.js — менять синхронно.
  const DELIVERY_STEPS = [
    'Ожидает выкупа',
    'Ожидает отправки с магазина',
    'Магазин отправил на склад в США',
    'На складе в США (карго)',
    'В пути США→КЗ (карго)',
    'На складе КЗ (карго)',
    'Курьер со склада до посредника в КЗ / Локер в КЗ (карго)',
    'У посредника в КЗ',
    'В пути КЗ→РФ (СДЭК или личная)',
    'У посредника в РФ',
    'В пути по РФ до клиента',
    'Получено клиентом'
  ];

  // Что статус заказа реально включает в программе (ordersService/reminderService/costService/botOrdersFormatter).
  const WRITEOFF = 'Появляется задача «Нужно оформить списание» — убыток заводит администратор.';
  const ORDER_STATUS_EFFECTS = {
    'Ожидает выкупа': 'Рабочая пометка. Оплаты и этапы идут от статуса доставки.',
    'Актуально, в доставке': 'Рабочая пометка. Оплаты и этапы идут от статуса доставки.',
    'Завершено': 'Бот показывает клиенту заказ завершённым. Сам заказ закрывает статус доставки «Получено клиентом».',
    'На продаже': 'Заказ без клиента: товар выставлен на продажу, себестоимость учитывается сразу.',
    'Не найдено': WRITEOFF + ' Сумму выкупа не просит, пока статус доставки пуст.',
    'Не выкуплено': 'Сумму выкупа не просит, пока статус доставки пуст.',
    'Заказ отменён магазином': WRITEOFF,
    'Отказ клиента': WRITEOFF,
    'Потеряно': WRITEOFF
  };
  const PLAIN_MARK = 'Просто пометка — ни на что не влияет.';

  const fmt = (n, digits) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  const rub = (n) => `${fmt(Math.round(n))} ₽`;
  const pct = (n) => `${n > 0 ? '+' : ''}${fmt(n, 1)}%`;

  function value(all, key) {
    const row = (all || []).find((s) => s.key === key);
    return row ? row : null;
  }

  /** Строка «на что влияет» + пример для настройки по её ключу (null — подсказки нет). */
  function help(s, all) {
    const v = Number(s.value);
    switch (s.key) {
      case 'Комиссия_Процент_От_Итог_Руб':
        return `Подставляется в новый заказ: процент от «Итог Руб» (цена товара в рублях). В заказе можно поменять. Пример: товар 10 000 ₽ → комиссия ${rub(10000 * v / 100)}.`;
      case 'Комиссия_Порог_Предупреждения':
        return `Комиссия в заказе ниже ${fmt(v, 1)}% — форма заказа предупредит, сохранить можно.`;
      case 'Комиссия_Порог_Причины':
        return `Комиссия ниже ${fmt(v, 1)}% — заказ не сохранится, пока не указана причина.`;
      case 'Резерв_Налог_Процент': {
        const base = value(all, 'Налог_База');
        const fromTurnover = base && base.valueText === 'оборот';
        const commission = value(all, 'Комиссия_Процент_От_Итог_Руб');
        const c = commission ? Number(commission.value) : 20;
        return fromTurnover
          ? `Откладывается на налоги с каждого заказа, до раздела на доли. Сейчас от оборота: заказ 10 000 ₽ → в резерв ${rub(10000 * v / 100)}.`
          : `Откладывается на налоги с каждого заказа, до раздела на доли. Сейчас от комиссии: комиссия ${rub(10000 * c / 100)} → в резерв ${rub(10000 * c / 100 * v / 100)}.`;
      }
      case 'Налог_База':
        return '«От комиссии» — резерв считается от комиссии заказа; «От оборота» — от всей суммы заказа в рублях.';
      case 'Час_Дайджеста':
        return `В ${fmt(v)}:00 по Москве сотрудникам приходит сводка напоминаний за день.`;
      case 'Тихие_Часы_Начало':
      case 'Тихие_Часы_Конец': {
        const start = value(all, 'Тихие_Часы_Начало');
        const end = value(all, 'Тихие_Часы_Конец');
        const range = start && end ? ` Сейчас: с ${fmt(start.value)}:00 до ${fmt(end.value)}:00.` : '';
        return `Рассылки, розыгрыши и ответы на вопросы клиентам уходят только в это окно по Москве; остальное ждёт утра.${range}`;
      }
      case 'Дней_До_Эскалации':
        return 'Если пункт напоминания не закрыт столько дней — он поднимается выше в «Напоминаниях».';
      case 'Коллективки_Автоуведомление':
        return 'Когда статус доставки заказов меняется сам по правилу коллективки (таблица в «Статусах и этапах»), — писать ли клиентам.';
      case 'Курс_Рубли_На_Билет': {
        const perTicket = value(all, 'Сов_За_Билет');
        const n = perTicket ? Number(perTicket.value) : 100;
        return `Клиент получает 1 билет за каждые ${rub(v)} оплат. Оплата 1 000 ₽ даёт ${fmt(1000 / (v || 1) * n, 1)} из ${fmt(n)}, нужных на билет.`;
      }
      case 'Сов_За_Билет':
        return `Сколько нужно накопить на 1 билет (${currencyLower()} начисляются за оплаты и приглашения).`;
      case 'Реферал_Совы_Приглашённому':
        return 'Начисляется новому клиенту, который пришёл по приглашению. 0 — не начислять.';
      case 'Реферал_Совы_Пригласившему':
        return 'Начисляется клиенту, чей друг пришёл по его ссылке. 0 — не начислять.';
      case 'Билет_Оценка_Руб':
        return 'Во сколько рублей учитывать 1 билет в бухгалтерии. 0 — билеты в учёт не попадают. На клиента не влияет.';
      case 'Бюджет_Маркетинг_Конкурсы':
        return 'Сколько выделено на конкурсы и розыгрыши — виден остаток в «Кошелёк ₸». 0 — бюджет не задан.';
      default:
        return null;
    }
  }

  // Короткие названия на экране; в базе подпись остаётся прежней (сохраняется как есть).
  const SHORT_LABELS = {
    Комиссия_Процент_От_Итог_Руб: 'Комиссия в новом заказе',
    Комиссия_Порог_Предупреждения: 'Предупреждать, если комиссия ниже',
    Комиссия_Порог_Причины: 'Требовать причину, если комиссия ниже',
    Резерв_Налог_Процент: 'Резерв на налоги',
    Налог_База: 'Налог считается от',
    Час_Дайджеста: 'Сводка напоминаний сотрудникам',
    Тихие_Часы_Начало: 'Писать клиентам с',
    Тихие_Часы_Конец: 'Писать клиентам до',
    Дней_До_Эскалации: 'Поднимать напоминание через, дней',
    Коллективки_Автоуведомление: 'Уведомлять клиентов при авто-смене статуса'
  };
  function label(s) {
    return SHORT_LABELS[s.key] || s.label;
  }

  function stepOptionsHtml(selected) {
    const sel = Number(selected);
    return DELIVERY_STEPS.map((name, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1} · ${escapeHtmlClient(name)}</option>`).join('');
  }

  const STAGE_LABELS = { Основная: 'Основная', Вес: 'Вес', СДЭК: 'СДЭК', Доставка_РФ: 'Доставка по РФ' };

  /** Цепочка шагов доставки с отметками порогов — какой этап с какого шага «нужно оплатить» и «в доходе». */
  function ladderHtml(all) {
    const marks = {};
    const add = (step, html) => { (marks[step] = marks[step] || []).push(html); };
    Object.keys(STAGE_LABELS).forEach((stage) => {
      const pay = value(all, `Оплата_Порог_${stage}`);
      const income = value(all, `Позиция_Порог_${stage}`);
      if (pay) add(Number(pay.value), `<span class="inline-block rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] mr-1 mt-1">оплатить: ${STAGE_LABELS[stage]}</span>`);
      if (income) add(Number(income.value), `<span class="inline-block rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-[10px] mr-1 mt-1">в доходе: ${STAGE_LABELS[stage]}</span>`);
    });
    const rows = DELIVERY_STEPS.map((name, i) => `
      <div class="flex items-start gap-3 px-3 py-2">
        <span class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold flex items-center justify-center shrink-0">${i + 1}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm text-gray-900">${escapeHtmlClient(name)}</div>
          ${(marks[i + 1] || []).length ? `<div>${marks[i + 1].join('')}</div>` : ''}
        </div>
      </div>`).join('');
    return `
      <section class="mb-5">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Шаги доставки по порядку</div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50" id="settings-ladder">${rows}</div>
        <div class="text-[11px] text-gray-400 px-1 mt-2">Номера шагов — это числа в порогах ниже. Заказ закрывается статусом доставки «Получено клиентом» или «возврат средств» («возврат средств» — вне шагов). Порядок шагов задан в программе: новый статус, добавленный в заказе через «+ Добавить своё значение», в шаги не попадёт.</div>
      </section>`;
  }

  function orderStatusesHtml(statuses) {
    const list = (statuses && statuses.length ? statuses : Object.keys(ORDER_STATUS_EFFECTS));
    const rows = list.map((status) => `
      <div class="px-3 py-2">
        <div class="text-sm font-medium text-gray-900">${escapeHtmlClient(status)}</div>
        <div class="text-[11px] ${ORDER_STATUS_EFFECTS[status] ? 'text-gray-500' : 'text-gray-400'}">${escapeHtmlClient(ORDER_STATUS_EFFECTS[status] || PLAIN_MARK)}</div>
      </div>`).join('');
    return `
      <section class="mb-5">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Статус заказа — что он делает</div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">${rows}</div>
        <div class="text-[11px] text-gray-400 px-1 mt-2">Оплаты, пороги и закрытие заказа идут от статуса доставки, не от статуса заказа.</div>
      </section>`;
  }

  // ── Курсы валют ──────────────────────────────────────────────────────────────────────────────────────────
  // Формула сервера (currencyService.computeCrossRates): 1 ₸ клиенту = ЦБ(₽ за ₸) / k₽₸;
  // 1 $ клиенту = ЦБ(₽ за $) × k₸$ / k₽₸. Коэффициент обмена, при котором цена ровно покрывает реальный обмен:
  // ЦБ на дату обмена / реальный курс обмена (₽ за ₸).
  const MARGIN_CURRENCY = {
    Маржа_KZT_USD: { code: 'USD', sym: '$' },
    Маржа_KZT_CNY: { code: 'CNY', sym: '¥' },
    Маржа_KZT_EUR: { code: 'EUR', sym: '€' },
    Маржа_KZT_GBP: { code: 'GBP', sym: '£' }
  };
  const SAFETY = 0.98; // запас 2% на скачок курса, пока заказ ждёт выкупа
  const floor3 = (n) => Math.floor(n * 1000) / 1000;

  function marginIntroHtml() {
    return `Как читать: 1 — ровно по курсу ЦБ. У «Обмен ₽ → ₸» число <b>меньше 1</b> = считаем, что за рубль дают меньше тенге, чем по ЦБ (банк берёт своё): цена клиенту выше, ваш запас больше. У «₸ → валюта» число <b>больше 1</b> = закладываем, что валюта за тенге дороже ЦБ.`;
  }

  /** Живые подсказки под коэффициентами; пересчитываются при вводе. advice — ответ getConversionAdvice (или null). */
  function wireCurrencyHints(container, advice) {
    if (!container) return;
    const cbr = (advice && advice.cbrRubPer) || {};
    const rubKztInput = container.querySelector('[data-margin-key="Маржа_RUB_KZT"] .margin-value-input');
    const readK = (input) => { const n = parseFloat(input && input.value); return n > 0 ? n : null; };

    function refresh() {
      const k = readK(rubKztInput);
      const kztHint = container.querySelector('[data-margin-hint="Маржа_RUB_KZT"]');
      if (kztHint) {
        if (!cbr.KZT) kztHint.textContent = 'Курс ЦБ ещё не загружен — пример не посчитать.';
        else if (!k) kztHint.textContent = 'Не задано — цены в тенге и валюте не посчитаются.';
        else {
          const client = cbr.KZT / k;
          kztHint.innerHTML = `ЦБ: 1 ₸ = ${fmt(cbr.KZT, 4)} ₽ · в цене клиенту: 1 ₸ = <b>${fmt(client, 4)} ₽</b> (${pct((1 / k - 1) * 100)} к ЦБ). Товар 10 000 ₸ → клиенту ${rub(10000 * client)} (по ЦБ ${rub(10000 * cbr.KZT)}).`;
        }
      }
      Object.entries(MARGIN_CURRENCY).forEach(([key, cur]) => {
        const hint = container.querySelector(`[data-margin-hint="${key}"]`);
        if (!hint) return;
        const kx = readK(container.querySelector(`[data-margin-key="${key}"] .margin-value-input`));
        if (!kx) { hint.textContent = `Не задано — заказы в ${cur.sym} не посчитаются.`; return; }
        if (!cbr[cur.code] || !cbr.KZT || !k) { hint.textContent = ''; return; }
        const kztPerX = cbr[cur.code] / cbr.KZT;
        const clientRub = cbr[cur.code] * kx / k;
        hint.innerHTML = `1 ${cur.sym} = ${fmt(kztPerX * kx, 1)} ₸ (ЦБ ${fmt(kztPerX, 1)} ₸). Итого клиенту 1 ${cur.sym} = <b>${fmt(clientRub, 2)} ₽</b> (ЦБ ${fmt(cbr[cur.code], 2)} ₽, ${pct((clientRub / cbr[cur.code] - 1) * 100)}) — вместе с обменом ₽ → ₸.`;
      });
      renderAdvice(k);
    }

    function renderAdvice(k) {
      const box = container.querySelector('#margin-advice');
      if (!box) return;
      const conversions = ((advice && advice.conversions) || []).filter((c) => c.cbrRubPerKzt > 0 && c.rubPerKzt > 0);
      if (conversions.length === 0) {
        box.innerHTML = 'Внесите обмен ₽ → ₸ в «Кошелёк ₸» → «Конвертация» — здесь появится, сколько ставить, чтобы не уйти в минус.';
        return;
      }
      const withEq = conversions.map((c) => ({ ...c, eq: c.cbrRubPerKzt / c.rubPerKzt }));
      const worst = withEq.reduce((a, b) => (b.eq < a.eq ? b : a));
      const maxK = floor3(worst.eq);
      const safeK = floor3(worst.eq * SAFETY);
      const lines = withEq.slice(0, 5).map((c) => {
        const over = (c.rubPerKzt / c.cbrRubPerKzt - 1) * 100;
        const covered = k && k <= c.eq;
        return `<div>${escapeHtmlClient(c.date)}: ${rub(c.rubOut)} → ${fmt(c.kztIn)} ₸, 1 ₸ = ${fmt(c.rubPerKzt, 4)} ₽ (${pct(over)} к ЦБ) ${k ? (covered ? '<span class="text-emerald-600">✓ цена покрывает</span>' : '<span class="text-red-600">⚠ дороже, чем в цене</span>') : ''}</div>`;
      }).join('');
      let verdict = '';
      if (k) {
        const room = (worst.eq / k - 1) * 100;
        verdict = room >= 0
          ? `<div class="mt-1 text-emerald-700">Сейчас ${fmt(k, 3)}: запас ${fmt(room, 1)}% к самому дорогому обмену.</div>`
          : `<div class="mt-1 text-red-600 font-medium">Сейчас ${fmt(k, 3)}: самый дорогой обмен обошёлся на ${fmt(-room, 1)}% дороже, чем заложено в цену, — на нём вы в минусе.</div>`;
      }
      box.innerHTML = `
        <div class="font-medium text-gray-700 mb-1">Ваши обмены ₽ → ₸ (из «Кошелёк ₸»)</div>
        ${lines}
        ${verdict}
        <div class="mt-1">Чтобы цена покрывала самый дорогой обмен (${escapeHtmlClient(worst.date)}), ставьте <b>не больше ${fmt(maxK, 3)}</b>. С запасом 2% на скачок курса, пока заказ ждёт выкупа, — <b>${fmt(safeK, 3)}</b>.</div>
        <button type="button" id="margin-advice-apply" class="mt-1.5 text-indigo-600 font-medium underline decoration-dotted underline-offset-2">Подставить ${fmt(safeK, 3)} (сохранить — галочкой)</button>`;
      box.querySelector('#margin-advice-apply').addEventListener('click', () => {
        rubKztInput.value = String(safeK);
        refresh();
        rubKztInput.focus();
      });
    }

    container.querySelectorAll('.margin-value-input').forEach((input) => input.addEventListener('input', refresh));
    refresh();
  }

  window.SettingsGuide = {
    DELIVERY_STEPS, help, label, stepOptionsHtml, ladderHtml, orderStatusesHtml, marginIntroHtml, wireCurrencyHints
  };
})();
