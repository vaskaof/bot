'use strict';

/**
 * События интерфейса админки (Этап 1, 17.10.2026, «да» VASY на видение из 18 пунктов, п.4–7) — на что
 * сотрудники тратят время и где интерфейс неудобен. Сервер: `recordUiEvents` (server/src/analytics/
 * uiEventsService.js), таблица ui_events, 90 дней.
 *
 * Что собирается:
 * - заход/уход с экрана: откуда пришёл, сколько провёл (только пока приложение на экране), когда экран
 *   догрузился (все запросы первых 1,5 с ответили) — `screen_view` / `screen_leave`;
 * - действие — запись на сервер: метод, ответ, сколько прошло от открытия экрана и от первого ввода — `action`;
 * - медленный ответ (≥2 с, вместе с сетью телефона) — `slow_call`, запрос не дошёл — `net_fail`;
 * - признаки неудобства: 3+ быстрых нажатия в одно место — `rage_click`; нажатие без отклика (за 1 с ни
 *   изменения на экране, ни перехода, ни запроса) — `dead_click`; «туда-обратно» за 5 с — `bounce`; начатая и
 *   брошенная правка — `abandon`; показанная ошибка — `error_shown`; поиск без результатов — `search_empty`;
 *   перезагрузка посреди работы — `reload`;
 * - скорость загрузки приложения — `boot`.
 *
 * Чего НЕТ: текста, который вводят. Кнопка/поле описываются id, data-атрибутом, иконкой или подписью кнопки
 * (коротко, без цифр и @) — `describeTarget`. Сервер чистит ещё раз.
 *
 * Пачка уходит раз в 15 с и при сворачивании приложения; не ушло — лежит в localStorage до следующего раза.
 * Во время урока (Tour/учебный режим) не пишется: это не работа. Сбой сбора не должен мешать работе — всё
 * в try/catch, ответа сервера никто не ждёт.
 */
(function () {
  const FLUSH_MS = 15000;
  const READY_WINDOW_MS = 1500;
  const SLOW_CALL_MS = 2000;
  const RAGE_GAP_MS = 700;
  const RAGE_COUNT = 3;
  const DEAD_CLICK_MS = 1000;
  const BOUNCE_MS = 5000;
  const QUEUE_MAX = 500;
  const BATCH = 100;
  const STORE_KEY = 'knopkaUiEventsPending';

  const READ_RE = /^(get|list|search|preview|find|check|resolve|match|suggest|export|parse|refresh|fetch)/;
  // Служебное: не работа человека, а само приложение (обучение, помощник, отзывы, этот сборщик).
  const SERVICE_METHODS = new Set([
    'recordUiEvents', 'reportUiError', 'recordTrainingEvent', 'markTrainingBadgesSeen', 'markWhatsNewSeen',
    'setWhatsNewPopup', 'submitStaffFeedback', 'askAssistant', 'rateAssistantSession', 'attachAssistantScreenshot',
    'recordPracticeSignal'
  ]);

  function isWriteMethod(method) {
    return !READ_RE.test(method) && !SERVICE_METHODS.has(method);
  }

  /** Подпись без данных человека: короткая, без цифр и @. Иначе — пусто. */
  function safeText(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > (max || 24) || /[\d@]/.test(t)) return '';
    return t;
  }

  /** Строка сообщения об ошибке: номера и @username вырезаются (текст ошибки пишет сервер или форма). */
  function safeMessage(text) {
    return String(text || '').replace(/@[\w.]+/g, '@').replace(/\d{3,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [data-nav-key]';

  function attrValueSafe(v) {
    return v && v.length <= 24 && !/[\d@\s]/.test(v) ? v : '';
  }

  function iconName(node) {
    const icon = node.matches && node.matches('[data-lucide], svg.lucide') ? node : node.querySelector && node.querySelector('[data-lucide], svg.lucide');
    if (!icon) return '';
    const byAttr = icon.getAttribute && icon.getAttribute('data-lucide');
    if (byAttr) return byAttr;
    const cls = String((icon.getAttribute && icon.getAttribute('class')) || '').split(/\s+/).find((c) => c.indexOf('lucide-') === 0);
    return cls ? cls.slice(7) : '';
  }

  /** Описание одного элемента: тег + id | data-атрибут | aria/title | иконка | подпись кнопки. */
  function describeNode(node) {
    const tag = String(node.tagName || '').toLowerCase();
    if (node.id && !/\d{3,}/.test(node.id)) return `${tag}#${node.id}`;
    const attrs = node.attributes ? Array.from(node.attributes) : [];
    const data = attrs.find((a) => a.name.indexOf('data-') === 0 && a.name !== 'data-lucide');
    if (data) {
      const v = attrValueSafe(data.value);
      return v ? `${tag}[${data.name}=${v}]` : `${tag}[${data.name}]`;
    }
    if (node.name && attrValueSafe(node.name)) return `${tag}[name=${node.name}]`;
    const aria = safeText(node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title')), 40);
    if (aria) return `${tag}[${aria}]`;
    const icon = iconName(node);
    if (icon) return `${tag}:${icon}`;
    if (/^(button|a|summary)$/.test(tag) || (node.getAttribute && /^(button|tab)$/.test(node.getAttribute('role') || ''))) {
      const text = safeText(node.textContent);
      if (text) return `${tag}«${text}»`;
    }
    if (/^(input|textarea|select)$/.test(tag)) {
      const ph = safeText(node.getAttribute && node.getAttribute('placeholder'), 40);
      const type = node.getAttribute && node.getAttribute('type');
      return `${tag}${type ? `[${type}]` : ''}${ph ? `«${ph}»` : ''}`;
    }
    return tag;
  }

  /** Ближайший предок с id — «где» (список, модалка, карточка), до 8 уровней вверх. */
  function contextId(node) {
    let el = node && node.parentElement;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      if (el.id && el.id !== 'screen-root' && !/\d{3,}/.test(el.id)) return el.id;
    }
    return '';
  }

  function interactiveOf(el) {
    return el && el.closest ? el.closest(INTERACTIVE) : null;
  }

  function describeTarget(el) {
    if (!el || !el.tagName) return '';
    const node = interactiveOf(el) || el;
    const self = describeNode(node);
    const ctx = self.indexOf('#') === -1 ? contextId(node) : '';
    return (ctx ? `#${ctx} › ` : '') + self;
  }

  /** Открытая модалка/лист сверху (по разметке модалок шелла: fixed inset-0 без hidden). */
  function currentModal() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return '';
    const list = Array.from(document.querySelectorAll('.fixed.inset-0:not(.hidden)'));
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const style = getComputedStyle(m);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      if (m.id) return m.id;
      const inner = m.querySelector('[id]');
      if (inner) return inner.id;
      return 'modal';
    }
    return '';
  }

  function isSearchField(el) {
    const hint = `${el.type || ''} ${el.id || ''} ${el.name || ''} ${(el.getAttribute && el.getAttribute('placeholder')) || ''}`.toLowerCase();
    return /search|поиск|найти|filter|фильтр/.test(hint);
  }

  function isTextField(el) {
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag !== 'input') return false;
    return !/^(checkbox|radio|range|button|submit|file|color|hidden)$/.test(String(el.type || 'text').toLowerCase());
  }

  function randomId() {
    try {
      const a = new Uint8Array(9);
      window.crypto.getRandomValues(a);
      return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_e) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  /**
   * Ядро без DOM: состояние визита и правила признаков. `emit(event)` — в очередь.
   * @param {{now: () => number, emit: (e: object) => void}} io
   */
  function createCore(io) {
    let visit = null;
    let prevVisit = null; // визит до текущего — для «туда-обратно»
    let rage = { target: '', count: 0, last: 0, reported: false };
    let calls = 0;
    const emit = (e) => io.emit(Object.assign({ at: io.now() }, e));

    function visibleMs(v, now) {
      return v.visibleMs + (v.visibleSince !== null ? now - v.visibleSince : 0);
    }

    function leave(now, reason) {
      if (!visit) return null;
      const v = visit;
      const ms = visibleMs(v, now);
      const data = { calls: v.calls, inputs: v.inputs, errors: v.errors, clicks: v.clicks };
      if (v.readyAt !== null) data.readyMs = v.readyAt - v.enteredAt;
      else if (v.windowCalls > 0) data.leftBeforeReady = true;
      if (reason) data[reason] = true;
      emit({ kind: 'screen_leave', screen: v.screen, ms, data });
      if (v.textInputsSinceSave > 0) {
        emit({ kind: 'abandon', screen: v.screen, data: { inputs: v.textInputsSinceSave, fields: v.fields.size, sinceInputMs: now - v.firstInputAt, saved: v.saves } });
      }
      return { screen: v.screen, ms };
    }

    function onScreen(screen, now) {
      if (visit && visit.screen === screen && now - visit.enteredAt < 50) return; // двойной рендер того же экрана
      const left = leave(now);
      if (left && prevVisit && prevVisit.screen === screen && left.ms < BOUNCE_MS) {
        emit({ kind: 'bounce', screen: left.screen, from: screen, ms: left.ms });
      }
      emit({ kind: 'screen_view', screen, from: left ? left.screen : '' });
      prevVisit = left;
      visit = {
        screen, enteredAt: now, visibleMs: 0, visibleSince: now, readyAt: null, windowCalls: 0, pending: 0,
        calls: 0, inputs: 0, textInputsSinceSave: 0, fields: new Set(), firstInputAt: null, errors: 0, clicks: 0, saves: 0
      };
    }

    function onHidden(now) {
      if (visit && visit.visibleSince !== null) {
        visit.visibleMs += now - visit.visibleSince;
        visit.visibleSince = null;
      }
    }

    function onVisible(now) {
      if (visit && visit.visibleSince === null) visit.visibleSince = now;
    }

    /** Снимок незавершённого визита — переживает закрытие приложения (уход допишется при следующем входе). */
    function snapshot(now) {
      if (!visit) return null;
      return { screen: visit.screen, ms: visibleMs(visit, now), inputs: visit.textInputsSinceSave, at: now };
    }

    function callStart(method, args, now, modal) {
      calls += 1;
      const v = visit;
      const token = { method, start: now, visit: v, inWindow: false, modal: modal || '', qLen: 0 };
      if (/^search/.test(method)) {
        const q = (args || []).find((a) => typeof a === 'string');
        token.qLen = q ? q.trim().length : 0;
      }
      if (v) {
        v.calls += 1;
        if (now - v.enteredAt <= READY_WINDOW_MS && v.readyAt === null) {
          token.inWindow = true;
          v.windowCalls += 1;
          v.pending += 1;
        }
      }
      return token;
    }

    function isEmptyResult(result) {
      if (Array.isArray(result)) return result.length === 0;
      if (result && typeof result === 'object') {
        for (const key of ['items', 'results', 'clients', 'orders', 'skus']) {
          if (Array.isArray(result[key])) return result[key].length === 0;
        }
      }
      return false;
    }

    function callEnd(token, outcome, now) {
      const v = token.visit;
      const ms = now - token.start;
      if (v && token.inWindow) {
        v.pending -= 1;
        if (v.pending === 0 && v.readyAt === null) v.readyAt = now;
      }
      const write = isWriteMethod(token.method);
      const screen = v ? v.screen : '';
      if (outcome.networkFail) emit({ kind: 'net_fail', screen, target: token.method, ms });
      if (ms >= SLOW_CALL_MS) emit({ kind: 'slow_call', screen, target: token.method, ms, data: { write, ok: !!outcome.ok } });
      if (write && !outcome.networkFail) {
        const data = { ok: !!outcome.ok, errors: v ? v.errors : 0 };
        if (v) data.sinceScreenMs = visibleMs(v, token.start);
        if (v && v.firstInputAt !== null) data.sinceInputMs = token.start - v.firstInputAt;
        emit({ kind: 'action', screen, target: token.method, modal: token.modal, ms, data });
        if (outcome.ok && v) {
          v.textInputsSinceSave = 0;
          v.saves += 1;
        }
      }
      if (outcome.ok && /^search/.test(token.method) && token.qLen > 0 && isEmptyResult(outcome.result)) {
        emit({ kind: 'search_empty', screen, target: token.method, data: { qLen: token.qLen } });
      }
    }

    function onInput(field, isText, now) {
      if (!visit) return;
      visit.inputs += 1;
      if (field) visit.fields.add(field);
      if (isText) {
        visit.textInputsSinceSave += 1;
        if (visit.firstInputAt === null) visit.firstInputAt = now;
      }
    }

    function onClick(target, modal, now) {
      if (visit) visit.clicks += 1;
      if (rage.target === target && now - rage.last <= RAGE_GAP_MS) {
        rage.count += 1;
      } else {
        rage = { target, count: 1, last: now, reported: false };
      }
      rage.last = now;
      if (rage.count >= RAGE_COUNT && !rage.reported) {
        rage.reported = true;
        emit({ kind: 'rage_click', screen: visit ? visit.screen : '', target, modal, data: { n: rage.count } });
      }
    }

    // Тройное нажатие на мёртвую кнопку — одно «без отклика» (повторы и так видны как rage_click).
    let lastDead = { target: '', at: -Infinity };
    function onDeadClick(target, modal, extra) {
      const t = io.now();
      if (lastDead.target === target && t - lastDead.at < 2000) return;
      lastDead = { target, at: t };
      emit({ kind: 'dead_click', screen: visit ? visit.screen : '', target, modal, data: extra || {} });
    }

    function onError(method, message) {
      if (visit) visit.errors += 1;
      emit({ kind: 'error_shown', screen: visit ? visit.screen : '', target: method || 'form', modal: '', data: { msg: safeMessage(message) } });
    }

    return {
      onScreen, onHidden, onVisible, leave, snapshot, callStart, callEnd, onInput, onClick, onDeadClick, onError,
      screen: () => (visit ? visit.screen : ''),
      callCount: () => calls
    };
  }

  // ---------- Браузерная часть ----------
  let started = false;
  let core = null;
  let queue = [];
  let sessionId = '';
  let lastActivity = 0;
  let sending = false;
  let rawCall = null;
  const now = () => Date.now();

  function disabled() {
    if (window.__E2E_SKIP_UI_EVENTS) return true;
    try {
      if (window.Tour && window.Tour.isActive && window.Tour.isActive()) return true;
      if (window.TrainingSandbox && window.TrainingSandbox.isActive && window.TrainingSandbox.isActive()) return true;
    } catch (_e) { /* нет обучения — пишем */ }
    return false;
  }

  function push(e) {
    if (disabled()) return;
    lastActivity = now();
    queue.push(e);
    if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
  }

  function storeKey() {
    try { return typeof tenantStorageKey === 'function' ? tenantStorageKey(STORE_KEY) : STORE_KEY; } catch (_e) { return STORE_KEY; }
  }

  function staffId() {
    return String(window.CURRENT_STAFF_TELEGRAM_ID || '');
  }

  /** Неотправленное + незавершённый визит — в localStorage (свернули/закрыли приложение). */
  function persist() {
    try {
      const payload = { staff: staffId(), sessionId, queue: queue.slice(-QUEUE_MAX), visit: core ? core.snapshot(now()) : null, lastActivity };
      localStorage.setItem(storeKey(), JSON.stringify(payload));
    } catch (_e) { /* без хранилища — потеряем только хвост */ }
  }

  function restore() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storeKey()) || 'null');
      localStorage.removeItem(storeKey());
    } catch (_e) { saved = null; }
    if (!saved || saved.staff !== staffId()) return null; // чужой аккаунт на этом телефоне — не наше
    // Прошлая сессия уходит отдельной пачкой со своим sessionId (сервер берёт его с пачки).
    const prev = { sessionId: String(saved.sessionId || ''), queue: Array.isArray(saved.queue) ? saved.queue : [] };
    if (saved.visit && saved.visit.screen) {
      prev.queue.push({ kind: 'screen_leave', screen: saved.visit.screen, ms: saved.visit.ms, at: saved.visit.at, data: { closed: true } });
      if (saved.visit.inputs > 0) prev.queue.push({ kind: 'abandon', screen: saved.visit.screen, at: saved.visit.at, data: { inputs: saved.visit.inputs, closed: true } });
    }
    prev.lastActivity = Number(saved.lastActivity) || 0;
    prev.lastScreen = saved.visit ? saved.visit.screen : '';
    return prev;
  }

  function send(sid, events) {
    if (!rawCall || !events.length || window.__E2E_SKIP_UI_EVENTS) return Promise.resolve(true);
    const before = window.__lastServerError;
    return rawCall('recordUiEvents', { sessionId: sid, events }).then(() => true, () => {
      window.__lastServerError = before; // наш сбой — не ошибка, которую видит сотрудник (_error-hints.js)
      return false;
    });
  }

  function flush() {
    if (sending || !queue.length) return Promise.resolve();
    sending = true;
    const batch = queue.splice(0, BATCH);
    return send(sessionId, batch).then((ok) => {
      if (!ok) queue = batch.concat(queue).slice(-QUEUE_MAX);
    }).finally(() => { sending = false; });
  }

  function navType() {
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      return nav ? nav.type : '';
    } catch (_e) { return ''; }
  }

  function bootEvent(screen) {
    const data = { navType: navType() };
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      data.loadMs = Math.round(performance.now());
      if (nav) data.domMs = Math.round(nav.domContentLoadedEventEnd);
      if (nav && data.domMs) data.accessMs = data.loadMs - data.domMs;
      if (nav && nav.transferSize !== undefined) data.cached = nav.transferSize === 0;
    } catch (_e) { /* старый WebView без Navigation Timing */ }
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.platform) data.platform = String(tg.platform);
      if (tg && tg.version) data.tgVersion = String(tg.version);
    } catch (_e) { /* вне Telegram */ }
    try {
      const conn = navigator.connection;
      if (conn && conn.effectiveType) data.net = conn.effectiveType;
      if (conn && conn.rtt) data.rtt = conn.rtt;
    } catch (_e) { /* нет Network Information API */ }
    data.width = window.innerWidth || 0;
    const script = document.querySelector('script[src*="_ui-events.js"]');
    const m = script && /[?&]v=(\w+)/.exec(script.getAttribute('src'));
    if (m && /^\d{1,14}$/.test(m[1])) data.version = Number(m[1]); // числом: строку с цифрами сервер вычистит
    data.role = String(window.CURRENT_ACCESS_ROLE || '');
    push({ kind: 'boot', screen, at: now(), data });
  }

  function wrapCallServer() {
    rawCall = window.callServer;
    if (typeof rawCall !== 'function') return;
    window.callServer = function (method, ...args) {
      if (method === 'recordUiEvents' || !core || disabled()) return rawCall(method, ...args);
      let token = null;
      try { token = core.callStart(method, args, now(), currentModal()); } catch (_e) { token = null; }
      return rawCall(method, ...args).then((result) => {
        if (token) try { core.callEnd(token, { ok: true, result }, now()); } catch (_e) { /* сбор не мешает */ }
        return result;
      }, (error) => {
        if (token) try { core.callEnd(token, { ok: false, networkFail: !!(error && error.isNetworkFailure) }, now()); } catch (_e) { /* сбор не мешает */ }
        throw error;
      });
    };
  }

  function wireDom() {
    document.addEventListener('visibilitychange', () => {
      if (!core) return;
      if (document.visibilityState === 'hidden') {
        core.onHidden(now());
        persist();
        flush().then(persist);
      } else {
        core.onVisible(now());
        // Вернулись — снимок «свернули» больше не нужен: иначе при следующем входе визит закрылся бы дважды.
        try { localStorage.removeItem(storeKey()); } catch (_e) { /* без хранилища */ }
      }
    });
    window.addEventListener('pagehide', () => { if (core) persist(); });

    document.addEventListener('input', (e) => onFieldEvent(e, false), true);
    document.addEventListener('change', (e) => onFieldEvent(e, true), true);
    document.addEventListener('click', onClickEvent, true);
  }

  function onFieldEvent(e, isChange) {
    try {
      if (!core || disabled()) return;
      const el = e.target;
      if (!el || !el.tagName || isSearchField(el)) return;
      if (el.closest && el.closest('#training-assistant-sheet, #lesson-feedback-sheet')) return;
      const text = isTextField(el);
      if (isChange && text) return; // текстовое поле уже посчитано по input
      core.onInput(describeTarget(el), text, now());
    } catch (_e) { /* сбор не мешает */ }
  }

  function onClickEvent(e) {
    try {
      if (!core || disabled()) return;
      const el = e.target;
      if (!el || !el.tagName) return;
      const target = describeTarget(el);
      const modal = currentModal();
      core.onClick(target, modal, now());
      watchForReaction(el, target, modal);
    } catch (_e) { /* сбор не мешает */ }
  }

  /** «Нажатие без отклика»: за 1 с ни изменений в DOM, ни перехода, ни запроса к серверу. */
  function watchForReaction(el, target, modal) {
    if (typeof MutationObserver !== 'function') return;
    const node = interactiveOf(el);
    const tag = String((node || el).tagName || '').toLowerCase();
    if (/^(input|select|textarea|label|option)$/.test(tag)) return; // фокус/галочка меняют состояние без DOM
    const looksClickable = !!node || /^(img|svg|path|i)$/.test(String(el.tagName).toLowerCase()) || getComputedStyle(el).cursor === 'pointer';
    if (!looksClickable) return;
    const hash = window.location.hash;
    const callsBefore = core.callCount();
    let changed = false;
    const observer = new MutationObserver(() => { changed = true; observer.disconnect(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => {
      observer.disconnect();
      if (changed || window.location.hash !== hash || core.callCount() !== callsBefore) return;
      const extra = {};
      if (node && node.disabled) extra.disabled = true;
      if (!node) extra.notButton = true;
      core.onDeadClick(target, modal, extra);
    }, DEAD_CLICK_MS);
  }

  /** Первый экран после входа (router.js renderRoute): запуск сборщика. */
  function start(screen) {
    started = true;
    sessionId = randomId();
    core = createCore({ now, emit: push });
    const prev = restore();
    if (prev && prev.queue.length) send(prev.sessionId || sessionId, prev.queue.slice(-BATCH));
    const type = navType();
    if (type === 'reload') {
      push({ kind: 'reload', screen: (prev && prev.lastScreen) || screen, at: now(), data: prev && prev.lastActivity ? { sinceLastMs: now() - prev.lastActivity } : {} });
    }
    bootEvent(screen);
    wireDom();
    setInterval(() => { flush(); }, window.__UI_EVENTS_FLUSH_MS || FLUSH_MS);
  }

  function onScreen(screen) {
    try {
      if (!started) start(screen);
      core.onScreen(screen, now());
    } catch (_e) { /* сбор не мешает */ }
  }

  /** Показанная ошибка (router.js showSaveToast(false)): ответ сервера или проверка формы. */
  function onErrorShown(message) {
    try {
      if (!core || disabled()) return;
      const last = window.__lastServerError;
      const fromServer = last && last.message === String(message || '') && now() - last.at < 30000;
      core.onError(fromServer ? last.method : 'form', message);
    } catch (_e) { /* сбор не мешает */ }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    wrapCallServer();
  }

  window.UiEvents = {
    onScreen,
    onErrorShown,
    flush,
    // Для тестов.
    _createCore: createCore,
    _describeTarget: describeTarget,
    _safeText: safeText,
    _safeMessage: safeMessage,
    _isWriteMethod: isWriteMethod,
    _queue: () => queue.slice()
  };
})();
