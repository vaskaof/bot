'use strict';

/**
 * Карточка заказа блоками со «Следующим шагом» (волна 3 аудита менеджера,
 * сессия 2, 30.09.2026). Вынесено из order-edit.js (god-file, см.
 * frontend/.claude/rules/frontend-nav.md) — сам экран только вызывает это.
 *
 * - `OrderCard.nextSteps(card, details)` — чистая функция: пункты доски
 *   «Задачи» (`getOrderTasks`, тот же `buildOrderCard` на сервере) → шаги с
 *   кнопками. Доска и карточка не расходятся, потому что источник один.
 * - `OrderCard.initBlocks(root)` — сворачивание блоков ТОЛЬКО визуально
 *   (`hidden` на теле блока): поля остаются в DOM, saveOrder читает их все —
 *   updateOrder пишет пустым любое не переданное поле. Точка «не сохранено»
 *   на заголовке блока.
 * - `OrderCard.clientStatusText(details)` — текст «статус для клиента».
 * - `TasksQueue` — очередь заказов с доски для «Следующая задача →»
 *   (sessionStorage; нет хранилища — кнопки просто нет).
 */
(function () {
  const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
  const SEVERITY_DOT = { critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-sky-500' };

  // Статусы «Выкуплено» — самая частая пара ручных правок в карточке
  // (журнал изменений, 30 дней до 30.09.2026).
  const STATUS_AWAITING_PURCHASE = 'Ожидает выкупа';
  const BUYOUT_STATUS_DELIVERY = 'Ожидает отправки с магазина';
  const BUYOUT_STATUS_ORDER = 'Актуально, в доставке';

  // Стадия → поле формы, куда вносится её цена.
  const STAGE_FIELDS = {
    'Основная': { block: 'product', selector: '#amount-input', label: 'сумму выкупа' },
    'Вес': { block: 'money', selector: '#weight-sum-input', label: 'цену веса' },
    'СДЭК': { block: 'money', selector: '#sdek-cost-sum-input', label: 'стоимость СДЭК' },
    'СДЭК_Индивидуальная': { block: 'money', selector: '#sdek-cost-sum-input', label: 'стоимость СДЭК' },
    'Доставка_РФ': { block: 'money', selector: '#shipping-rf-sum-input', label: 'доставку по РФ' }
  };

  // Подписи стадий для клиента — без внутренних имён («Основная»/«СДЭК_…»).
  const CLIENT_STAGE_LABELS = {
    'Основная': 'выкуп',
    'Вес': 'вес',
    'СДЭК': 'доставка КЗ→РФ',
    'СДЭК_Индивидуальная': 'доставка КЗ→РФ',
    'Доставка_РФ': 'доставка по РФ'
  };

  const HISTORY_FIELD_LABELS = {
    statusDelivery: 'Статус доставки', statusOrder: 'Статус заказа', amount: 'Сумма', currency: 'Валюта',
    mainSum: 'Основная оплата', bookingSum: 'Комиссия', weightSum: 'Вес', taxiKzSum: 'Такси КЗ',
    sdekSum: 'СДЭК', taxiRfSum: 'Такси РФ', shippingRfSum: 'Отправка по РФ', taxiRfSendSum: 'Такси (отправка)',
    taxiRfReceiveSum: 'Такси (получение)', managerId: 'Менеджер', clientType: 'Тип клиента',
    wishlistId: 'Вишлист', purchaseLink: 'Ссылка', payment_recorded: 'Оплата', credit_released: 'Кредит'
  };

  function money(n) {
    return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function step(item, buttons, extra) {
    return Object.assign({
      kind: item.kind, label: item.label, hint: item.hint || '', severity: item.severity || 'info',
      quiet: !!item.quiet, buttons: buttons || []
    }, extra || {});
  }

  /**
   * @param {Object|null} card Карточка доски (`getOrderTasks().card`) или null
   * @param {Object} details `getOrderDetails`
   * @returns {Array<{kind,label,hint,severity,quiet,buttons:Array<{text,action}>}>}
   */
  function nextSteps(card, details) {
    const items = card && Array.isArray(card.items) ? card.items : [];
    const steps = [];

    const unpaid = items.filter((i) => i.kind === 'stage_unpaid');
    if (unpaid.length > 0) {
      steps.push(step(
        { kind: 'stage_unpaid', label: 'Ждёт оплаты', hint: unpaid.map((i) => `${i.label.replace(/: ждёт оплаты$/, '')} — ${i.hint}`).join('; '), severity: 'warning' },
        [{ text: 'Записать оплату', action: { type: 'payments' } }]
      ));
    }

    for (const item of items) {
      switch (item.kind) {
        case 'stage_unpaid':
          break;
        case 'price_missing':
          steps.push(step(item, [{ text: 'Заполнить курсы и сумму', action: { type: 'focus', block: 'product', selectors: ['#amount-input', '#rate-kzt-input', '#rate-rub-input'] } }]));
          break;
        case 'fields_missing':
          steps.push(step(item, [
            { text: 'Заполнить', action: { type: 'focus', block: 'product', selectors: ['select[data-dict="purchaseChannel"]', 'select[data-dict="purchaseAccount"]', 'select[data-dict="cargo"]', '#currency-select'] } },
            { text: 'Пропустить (данные утеряны)', secondary: true, action: { type: 'dismiss', kind: item.kind } }
          ]));
          break;
        case 'stage_forecast':
        case 'stage_upcoming': {
          const field = STAGE_FIELDS[item.stage];
          steps.push(step(item, field ? [{ text: `Внести ${field.label}`, action: { type: 'focus', block: field.block, selectors: [field.selector] } }] : []));
          break;
        }
        case 'debt_on_close':
          steps.push(step(item, [
            { text: 'Записать оплату', action: { type: 'payments' } },
            { text: 'Списать долг', secondary: true, action: { type: 'debtWriteoff' } }
          ]));
          break;
        case 'behind_collective':
          steps.push(step(item, [{ text: `Перевести в «${item.targetStatus}»`, action: { type: 'setStatus', statusDelivery: item.targetStatus } }]));
          break;
        case 'writeoff_missing':
          steps.push(step(item, [{ text: 'Оформить списание', action: { type: 'writeoff' } }]));
          break;
        case 'client_claimed_received_with_debt':
          steps.push(step(item, [
            { text: 'Подтвердить получение', action: { type: 'claimApprove', claimId: item.claimId } },
            { text: 'Отклонить', secondary: true, action: { type: 'claimReject', claimId: item.claimId } }
          ]));
          break;
        default:
          steps.push(step(item, []));
      }
    }

    if (details && details.statusDelivery === STATUS_AWAITING_PURCHASE) {
      steps.push(step(
        {
          kind: 'buyout',
          label: 'Товар уже выкуплен?',
          hint: `Поставит «${BUYOUT_STATUS_DELIVERY}», «${BUYOUT_STATUS_ORDER}» и сегодняшнюю дату выкупа, если её нет. Проверьте и сохраните.`,
          severity: 'warning'
        },
        [{ text: 'Выкуплено', action: { type: 'setStatus', statusDelivery: BUYOUT_STATUS_DELIVERY, statusOrder: BUYOUT_STATUS_ORDER, fillDateOrder: true } }]
      ));
    }

    // Стабильная сортировка: срочное → «ждёт денег» → справочное; quiet — в конце.
    return steps
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.quiet - b.s.quiet) || (SEVERITY_RANK[a.s.severity] - SEVERITY_RANK[b.s.severity]) || (a.i - b.i))
      .map((x) => x.s);
  }

  /** Текст для клиента: товар, статус, что сейчас к оплате (только подтверждённые цены). */
  function clientStatusText(details) {
    const product = details.productShort || details.productOriginal || 'заказ';
    const lines = [`Ваш заказ «${product}»`];
    lines.push(`Статус: ${details.statusDelivery || 'оформляется'}`);
    const stages = details.isNewModel ? (details.stagesBalance || []) : [];
    const due = stages.filter((s) => s.target > 0 && s.isForecast !== true && s.remaining > 0.01);
    const total = due.reduce((sum, s) => sum + s.remaining, 0);
    if (due.length > 0) {
      lines.push(`К оплате: ${money(total)} ₽ (${due.map((s) => `${CLIENT_STAGE_LABELS[s.stage] || s.stage} — ${money(s.remaining)} ₽`).join(', ')})`);
    } else if (stages.length > 0 && stages.every((s) => s.target > 0 && s.isForecast !== true)) {
      lines.push('Всё оплачено, спасибо!');
    }
    return lines.join('\n');
  }

  function historyFieldLabel(field) {
    return HISTORY_FIELD_LABELS[field] || field;
  }

  /** Одна строка истории: «30.09 14:05 Настя: Статус доставки: А → Б». */
  function historyLine(row) {
    const d = new Date(row.createdAt);
    const when = isNaN(d) ? '' : `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    const who = row.actorName || (row.actorRole === 'admin' ? 'админ' : row.actorRole === 'manager' ? 'менеджер' : 'система');
    const what = row.entityType === 'client_payment'
      ? row.newValue
      : `${historyFieldLabel(row.field)}: ${row.oldValue || '—'} → ${row.newValue || '—'}`;
    return { when, who, what };
  }

  // --- Блоки: сворачивание, сводка, точка «не сохранено» ---

  const PREFS_KEY = 'orderCardBlocksExpanded';

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (_e) { return {}; }
  }
  function writePrefs(prefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_e) { /* только удобство */ }
  }

  function serializeBlock(body) {
    const parts = [];
    body.querySelectorAll('input, select, textarea').forEach((el) => {
      parts.push(el.type === 'checkbox' ? String(el.checked) : el.value);
    });
    body.querySelectorAll('[data-value]').forEach((el) => parts.push(el.dataset.value));
    return parts.join('\u0001');
  }

  function initBlocks(root) {
    const prefs = readPrefs();
    const blocks = new Map();

    root.querySelectorAll('section[data-block]').forEach((section) => {
      const key = section.dataset.block;
      const body = section.querySelector('.order-block-body');
      const entry = { section, body, snapshot: null };
      blocks.set(key, entry);
      setExpanded(key, prefs[key] === true);

      section.querySelector('[data-block-toggle]').addEventListener('click', () => {
        const next = body.classList.contains('hidden');
        setExpanded(key, next);
        const p = readPrefs();
        p[key] = next;
        writePrefs(p);
      });

      // Снимок берётся лениво — перед первым касанием блока (форма к этому
      // моменту уже загружена), дальше сравнение с ним: вернули как было —
      // точка гаснет.
      const snap = () => { if (entry.snapshot === null) entry.snapshot = serializeBlock(body); };
      body.addEventListener('pointerdown', snap, true);
      body.addEventListener('focusin', snap, true);
      body.addEventListener('keydown', snap, true);
      const check = () => setTimeout(() => refreshDirty(key), 0);
      body.addEventListener('input', check);
      body.addEventListener('change', check);
      body.addEventListener('click', check);
    });

    function setExpanded(key, expanded) {
      const entry = blocks.get(key);
      if (!entry) return;
      entry.body.classList.toggle('hidden', !expanded);
      const chevron = entry.section.querySelector('.order-block-chevron');
      if (chevron) chevron.style.transform = expanded ? 'rotate(180deg)' : '';
    }

    function refreshDirty(key) {
      const entry = blocks.get(key);
      if (!entry || entry.snapshot === null) return;
      const dirty = serializeBlock(entry.body) !== entry.snapshot;
      entry.section.querySelector('.order-block-dirty').classList.toggle('hidden', !dirty);
    }

    return {
      expand(key) { setExpanded(key, true); },
      /** Программная правка поля: снимок ДО неё, иначе точка не загорится. */
      change(key, fn) {
        const entry = blocks.get(key);
        if (entry && entry.snapshot === null) entry.snapshot = serializeBlock(entry.body);
        fn();
        refreshDirty(key);
      },
      setSummary(key, text) {
        const entry = blocks.get(key);
        if (entry) entry.section.querySelector('.order-block-summary').textContent = text || '';
      },
      /** После загрузки заказа — всё «как сохранено». */
      resetDirty() {
        blocks.forEach((entry) => {
          entry.snapshot = null;
          entry.section.querySelector('.order-block-dirty').classList.add('hidden');
        });
      },
      hasDirty() {
        return [...blocks.values()].some((e) => !e.section.querySelector('.order-block-dirty').classList.contains('hidden'));
      },
      blockOf(el) {
        const section = el && el.closest ? el.closest('section[data-block]') : null;
        return section ? section.dataset.block : null;
      }
    };
  }

  // --- Отрисовка «Следующего шага» ---

  function escapeHtml(value) {
    return (value === null || value === undefined ? '' : String(value))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLElement} container
   * @param {Array} steps `nextSteps(...)`
   * @param {Object} opts `{stageLabel, errorText, onAction(action, button, stepEl)}`
   */
  function renderNextStep(container, steps, opts) {
    const [primary, ...rest] = steps.filter((s) => !s.quiet);
    const quiet = steps.filter((s) => s.quiet);

    const stepHtml = (s, isPrimary) => `
      <div class="${isPrimary ? '' : 'pt-2 mt-2 border-t border-gray-100'}" data-step>
        <div class="flex items-start gap-1.5">
          <span class="w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[s.severity] || 'bg-gray-300'}"></span>
          <div class="min-w-0 flex-1">
            <div class="${isPrimary ? 'text-[15px] font-semibold text-gray-900' : 'text-[13px] text-gray-700'}">${escapeHtml(s.label)}</div>
            ${s.hint ? `<div class="text-xs text-gray-500 mt-0.5">${escapeHtml(s.hint)}</div>` : ''}
            ${s.buttons.length > 0 ? `<div class="flex flex-wrap gap-2 mt-2">${s.buttons.map((b, i) => `
              <button type="button" data-step-btn="${i}" class="${isPrimary && !b.secondary
                ? 'px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium'
                : 'px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700'}">${escapeHtml(b.text)}</button>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>`;

    container.innerHTML = `
      <div class="bg-white rounded-2xl shadow-sm border border-indigo-100 p-4">
        <div class="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">Следующий шаг</div>
        ${primary
          ? stepHtml(primary, true) + rest.map((s) => stepHtml(s, false)).join('')
          : opts.errorText
            ? `<div class="text-sm text-red-500">${escapeHtml(opts.errorText)}</div>`
            : `<div class="text-sm text-gray-700">Задач по заказу нет${opts.stageLabel ? ` — ждём: <b>${escapeHtml(opts.stageLabel)}</b>` : ''}.</div>`}
        ${quiet.length > 0 ? `<div class="text-[11px] text-gray-400 mt-2">${quiet.map((s) => `${escapeHtml(s.label)} (${escapeHtml(s.hint)})`).join('; ')}</div>` : ''}
        <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100" data-step-footer></div>
      </div>`;

    const stepEls = container.querySelectorAll('[data-step]');
    const visible = [primary, ...rest].filter(Boolean);
    stepEls.forEach((el, idx) => {
      const s = visible[idx];
      el.querySelectorAll('[data-step-btn]').forEach((btn) => {
        const b = s.buttons[Number(btn.dataset.stepBtn)];
        btn.addEventListener('click', () => opts.onAction(b.action, btn, el));
      });
    });
    container.classList.remove('hidden');
    return container.querySelector('[data-step-footer]');
  }

  // --- Очередь доски для «Следующая задача →» ---

  const QUEUE_KEY = 'tasksBoardQueue';
  const TasksQueue = {
    save(ids, currentId) {
      try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ ids, currentId })); } catch (_e) { /* без очереди — без кнопки */ }
    },
    read() {
      try { return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || 'null'); } catch (_e) { return null; }
    },
    /** `{nextId, index, total}` — только если этот заказ открыт с доски. */
    positionOf(orderId) {
      const q = TasksQueue.read();
      if (!q || !Array.isArray(q.ids) || q.currentId !== orderId) return null;
      const index = q.ids.indexOf(orderId);
      if (index === -1) return null;
      return { nextId: q.ids[index + 1] || null, index, total: q.ids.length };
    },
    setCurrent(orderId) {
      const q = TasksQueue.read();
      if (q) TasksQueue.save(q.ids, orderId);
    }
  };

  window.OrderCard = { nextSteps, clientStatusText, historyLine, historyFieldLabel, initBlocks, renderNextStep, BUYOUT_STATUS_DELIVERY, BUYOUT_STATUS_ORDER };
  window.TasksQueue = TasksQueue;
})();
