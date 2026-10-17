'use strict';

/**
 * «Удобно было? 👍 👎» после важных действий (Этап 2, 17.10.2026, «да» VASY на видение из 18 пунктов, п.8–14).
 *
 * - Когда: удачная запись одного из методов METHOD_ACTIONS (новый заказ, правка заказа, оплата, коллективка,
 *   лот, выкуп). Сигнал даёт сборщик событий (_ui-events.js, `io.onAction`) вместе с признаками трудности визита.
 * - Как: без окна поверх экрана — строка в том же уведомлении «Сохранено» (#save-toast), 6 секунд. 👍 — «спасибо»;
 *   👎 — причины кнопками и необязательный комментарий; не ответил — ничего.
 * - Как часто — решает сервер (`requestActionFeedback`, src/analytics/actionFeedbackService.js): одно действие —
 *   раз в 7 дней, всего — один вопрос в день, «Не спрашивать месяц», при замеченной трудности — именно сейчас.
 *   Здесь — только серия: оплаты/лоты/выкупы подряд спрашиваются один раз, когда серия кончилась (45 с без
 *   повтора или ушли с экрана), отдельным уведомлением.
 * - Что прикладывается само (п.12): экран, действие, сколько длилось, ошибки/повторные клики, версия, телефон.
 *
 * Во время урока и в e2e (`__E2E_SKIP_UI_EVENTS` / `__E2E_SKIP_ACTION_FEEDBACK`) не спрашивает. Сбой — молча.
 */
(function () {
  const SHOW_MS = 6000;
  const SERIES_IDLE_MS = 45000;
  const ATTACH_DELAY_MS = 350; // экран успевает показать своё «Сохранено»
  const ANSWER_WAIT_MS = 4000; // сервер не ответил за 4 с — вопрос уже не к месту
  const STORE_KEY = 'knopkaActionFeedback';

  /** Метод сервера → действие. series — бывает подряд: спрашиваем в конце серии. */
  const METHOD_ACTIONS = {
    createOrder: { action: 'order_new' },
    createOrdersBatch: { action: 'order_new' },
    updateOrder: { action: 'order_edit' },
    recordOrderPayment: { action: 'payment', series: true },
    recordClientPaymentDirect: { action: 'payment', series: true },
    recordPaymentForStages: { action: 'payment', series: true },
    createManualAllocation: { action: 'payment', series: true },
    updateCollective: { action: 'collective_status' },
    setCollectiveSentAt: { action: 'collective_status' },
    setOrdersDeliveryStatus: { action: 'collective_status' },
    applyCollectiveLogisticsSharesToOrders: { action: 'collective_expense' },
    createLot: { action: 'lot_add', series: true },
    recordPurchaseEvent: { action: 'purchase', series: true },
    recordCartPurchaseEvent: { action: 'purchase', series: true }
  };

  /** Полные фразы (без склейки окончаний): одно действие и серия. */
  const QUESTIONS = {
    order_new: ['Удобно было создать заказ?', 'Удобно было создавать заказы?'],
    order_edit: ['Удобно было править заказ?', 'Удобно было править заказы?'],
    payment: ['Удобно было внести оплату?', 'Удобно было вносить оплаты?'],
    collective_status: ['Удобно было обновить коллективку?', 'Удобно было обновлять коллективки?'],
    collective_expense: ['Удобно было применить расход?', 'Удобно было применять расходы?'],
    lot_add: ['Удобно было добавить лот?', 'Удобно было добавлять лоты?'],
    purchase: ['Удобно было отметить выкуп?', 'Удобно было отмечать выкупы?']
  };

  const REASONS = [
    { key: 'search', label: 'Долго искал(а)' },
    { key: 'unclear', label: 'Непонятно, что нажать' },
    { key: 'slow', label: 'Медленно грузилось' },
    { key: 'fix', label: 'Пришлось исправлять' },
    { key: 'other', label: 'Другое' }
  ];

  function question(action, series) {
    const q = QUESTIONS[action] || ['Удобно было?', 'Удобно было?'];
    return series > 1 ? q[1] : q[0];
  }

  /** Сумма признаков: в серии берём худшее по каждому. */
  function mergeSignals(a, b) {
    const out = Object.assign({}, a);
    for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(Number(out[k]) || 0, Number(v) || 0);
    return out;
  }

  /**
   * Ядро без DOM: какие действия ведут к вопросу и когда. `ask(item)` — спросить сервер и показать.
   * @param {{setTimer: Function, clearTimer: Function, ask: (item: object) => void}} io
   */
  function createPlanner(io) {
    let pending = null; // серия: { action, method, screen, info, signals, series, timer }

    function flushSeries() {
      if (!pending) return;
      const item = pending;
      pending = null;
      io.clearTimer(item.timer);
      io.ask({ action: item.action, method: item.method, screen: item.screen, info: item.info, signals: Object.assign({}, item.signals, { series: item.series }), series: item.series, standalone: true });
    }

    function onAction(info) {
      const rule = METHOD_ACTIONS[info && info.method];
      if (!rule) return false;
      if (pending && (pending.action !== rule.action || pending.screen !== info.screen)) flushSeries();
      if (!rule.series) {
        io.ask({ action: rule.action, method: info.method, screen: info.screen, info, signals: info.signals || {}, series: 1, standalone: false });
        return true;
      }
      if (pending) {
        io.clearTimer(pending.timer);
        pending.series += 1;
        pending.info = info;
        pending.method = info.method;
        pending.signals = mergeSignals(pending.signals, info.signals);
      } else {
        pending = { action: rule.action, method: info.method, screen: info.screen, info, signals: Object.assign({}, info.signals || {}), series: 1 };
      }
      pending.timer = io.setTimer(flushSeries, SERIES_IDLE_MS);
      return true;
    }

    function onScreen(screen) {
      if (pending && pending.screen !== screen) flushSeries();
    }

    return { onAction, onScreen, flushSeries, pendingSeries: () => (pending ? pending.series : 0) };
  }

  // ---------- Браузерная часть ----------

  function disabled() {
    if (window.__E2E_SKIP_UI_EVENTS || window.__E2E_SKIP_ACTION_FEEDBACK) return true;
    try {
      if (window.Tour && window.Tour.isActive && window.Tour.isActive()) return true;
      if (window.TrainingSandbox && window.TrainingSandbox.isActive && window.TrainingSandbox.isActive()) return true;
    } catch (_e) { /* нет обучения */ }
    return false;
  }

  function mskDay() {
    try { return new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }); } catch (_e) { return new Date().toDateString(); }
  }

  function storeKey() {
    try { return typeof tenantStorageKey === 'function' ? tenantStorageKey(STORE_KEY) : STORE_KEY; } catch (_e) { return STORE_KEY; }
  }

  /** Что уже известно без сервера: сегодня спрашивали / «не спрашивать месяц» — лишний запрос не нужен. */
  function readLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(storeKey()) || 'null');
      return s && s.staff === String(window.CURRENT_STAFF_TELEGRAM_ID || '') ? s : {};
    } catch (_e) { return {}; }
  }

  function writeLocal(patch) {
    try {
      const s = Object.assign(readLocal(), patch, { staff: String(window.CURRENT_STAFF_TELEGRAM_ID || '') });
      localStorage.setItem(storeKey(), JSON.stringify(s));
    } catch (_e) { /* без хранилища — спросит сервер */ }
  }

  function locallyBlocked() {
    const s = readLocal();
    if (s.mutedUntil && Date.now() < s.mutedUntil) return true;
    return s.askedDay === mskDay();
  }

  function appVersion() {
    const script = document.querySelector('script[src*="_action-feedback.js"]');
    const m = script && /[?&]v=(\d{1,14})/.exec(script.getAttribute('src'));
    return m ? m[1] : '';
  }

  function contextOf(info) {
    const c = { ms: info.sinceScreenMs, sinceInputMs: info.sinceInputMs, callMs: info.callMs, version: appVersion(), modal: info.modal || '' };
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.platform) c.platform = String(tg.platform);
      if (tg && tg.version) c.tgVersion = String(tg.version);
    } catch (_e) { /* вне Telegram */ }
    try { if (navigator.connection && navigator.connection.effectiveType) c.net = navigator.connection.effectiveType; } catch (_e) { /* нет API */ }
    c.viewport = `${window.innerWidth || 0}x${window.innerHeight || 0}`;
    return c;
  }

  /** Служебный вызов: его сбой — не ошибка, которую видит сотрудник (_error-hints.js). */
  function quietCall(method, payload) {
    const before = window.__lastServerError;
    return window.callServer(method, payload).catch((error) => {
      window.__lastServerError = before;
      throw error;
    });
  }

  let asking = false;

  function ask(item) {
    if (disabled() || asking || locallyBlocked()) return;
    asking = true;
    const startedAt = Date.now();
    const payload = { action: item.action, method: item.method, screen: item.screen, signals: item.signals, context: contextOf(item.info || {}) };
    const go = () => quietCall('requestActionFeedback', payload).then((res) => {
      if (!res || !res.ask) {
        if (res && res.why === 'today') writeLocal({ askedDay: mskDay() });
        if (res && res.why === 'muted') writeLocal({ mutedUntil: Date.now() + 24 * 60 * 60 * 1000 }); // точный срок знает сервер
        return;
      }
      writeLocal({ askedDay: mskDay() });
      if (Date.now() - startedAt > ANSWER_WAIT_MS || disabled()) return;
      show(res.id, item);
    }).catch(() => { /* не спросили — и ладно */ }).finally(() => { asking = false; });
    if (item.standalone) go();
    else setTimeout(go, ATTACH_DELAY_MS);
  }

  function answer(id, body) {
    return quietCall('answerActionFeedback', Object.assign({ id }, body)).catch(() => { /* ответ потерян — не страшно */ });
  }

  const btnCls = 'px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700';

  /** Уведомление «Сохранено» ещё видно и зелёное — дописываем в него; иначе — своё, нейтральное. */
  function show(id, item) {
    const toast = document.getElementById('save-toast');
    const inner = document.getElementById('save-toast-inner');
    if (!toast || !inner) return;
    const attach = !item.standalone && !toast.classList.contains('hidden') && /bg-green-50/.test(inner.className) && !inner.querySelector('[data-af]');
    const block = document.createElement('div');
    block.setAttribute('data-af', String(id));
    block.className = attach ? 'mt-2 pt-2 border-t border-green-200' : '';
    block.innerHTML = `
      <div class="flex items-center justify-center gap-2 flex-wrap">
        <span class="text-[13px] font-medium">${escapeHtmlClient(question(item.action, item.series))}</span>
        <button type="button" data-af-up class="${btnCls} text-base leading-none" title="Удобно">👍</button>
        <button type="button" data-af-down class="${btnCls} text-base leading-none" title="Неудобно">👎</button>
      </div>
      <div class="text-[11px] font-normal opacity-70 mt-1">Это оценка приложения, а не вашей работы</div>
      <button type="button" data-af-mute class="text-[11px] font-normal opacity-70 underline mt-0.5">Не спрашивать месяц</button>`;
    if (attach) {
      inner.appendChild(block);
    } else {
      inner.className = 'rounded-xl px-4 py-3 text-sm text-center shadow-md bg-white text-gray-800 border border-gray-200';
      inner.textContent = '';
      inner.appendChild(block);
      toast.classList.remove('hidden');
    }
    scheduleToastHide(SHOW_MS);
    // Начал отвечать — не прячем, пока не закончит.
    block.addEventListener('pointerdown', () => scheduleToastHide(null), true);
    block.addEventListener('focusin', () => scheduleToastHide(null), true);

    const done = (text) => {
      block.innerHTML = `<div class="text-[13px] font-medium">${escapeHtmlClient(text)}</div>`;
      scheduleToastHide(1800);
    };
    block.querySelector('[data-af-up]').onclick = () => { answer(id, { answer: 'up' }); done('Спасибо!'); };
    block.querySelector('[data-af-mute]').onclick = () => {
      answer(id, { answer: 'mute' });
      writeLocal({ mutedUntil: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      done('Хорошо, месяц не спросим.');
    };
    block.querySelector('[data-af-down]').onclick = () => {
      answer(id, { answer: 'down' }); // 👎 записан сразу — даже если причины не выберут
      openReasons(block, id, done);
    };
  }

  function openReasons(block, id, done) {
    scheduleToastHide(null);
    const picked = new Set();
    block.className = (block.className ? block.className + ' ' : '') + 'text-left';
    block.innerHTML = `
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-medium">Что помешало?</div>
          <div class="text-[11px] font-normal opacity-70">Это оценка приложения, а не вашей работы. Экран и действие приложатся сами.</div>
        </div>
        <button type="button" data-af-close title="Закрыть" class="shrink-0 -mr-1 px-1 text-gray-400 text-lg leading-none">×</button>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2">
        ${REASONS.map((r) => `<button type="button" data-af-reason="${r.key}" class="${btnCls} text-[12px] font-normal">${escapeHtmlClient(r.label)}</button>`).join('')}
      </div>
      <textarea id="af-comment" rows="2" maxlength="1000" placeholder="Как было бы удобнее? Необязательно."
        class="mt-2 w-full text-[13px] font-normal bg-gray-50 border border-gray-200 rounded-lg p-2 outline-none focus:border-indigo-400"></textarea>
      <button type="button" data-af-send class="mt-2 w-full py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-medium">Отправить</button>`;
    block.querySelectorAll('[data-af-reason]').forEach((b) => {
      b.onclick = () => {
        const key = b.getAttribute('data-af-reason');
        if (picked.has(key)) picked.delete(key); else picked.add(key);
        b.classList.toggle('bg-indigo-50', picked.has(key));
        b.classList.toggle('border-indigo-300', picked.has(key));
        b.classList.toggle('text-indigo-700', picked.has(key));
      };
    });
    const close = () => { const toast = document.getElementById('save-toast'); if (toast) toast.classList.add('hidden'); scheduleToastHide(null); };
    block.querySelector('[data-af-close]').onclick = close;
    block.querySelector('[data-af-send]').onclick = () => {
      const comment = block.querySelector('#af-comment').value.trim();
      if (picked.size || comment) answer(id, { answer: 'down', reasons: Array.from(picked), comment });
      done('Спасибо! VASY посмотрит.');
    };
  }

  const planner = createPlanner({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t),
    ask: (item) => { try { ask(item); } catch (_e) { /* вопрос не мешает работе */ } }
  });

  function safe(fn) {
    return (...args) => { try { if (!disabled()) fn(...args); } catch (_e) { /* вопрос не мешает работе */ } };
  }

  window.ActionFeedback = {
    onAction: safe(planner.onAction),
    onScreen: safe(planner.onScreen),
    // Для тестов.
    _createPlanner: createPlanner,
    _question: question,
    _METHOD_ACTIONS: METHOD_ACTIONS,
    _show: show
  };
})();
