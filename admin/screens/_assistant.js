'use strict';

/**
 * Помощник менеджеров (обучение, этап 3, решения VASY 04.10.2026).
 * - Круглая кнопка внизу справа (`#assistant-fab`) на любом экране + «🤖»
 *   в «Помощи» и на красной подсказке ошибки.
 * - Окно ничего не тратит: ИИ зовётся только на «Отправить».
 * - Разговор: вопрос + до 3 уточнений, «✅ Помогло / ❌ Не помогло»; «Не
 *   помогло» уходит VASY проблемой, после — можно приложить скриншот (для
 *   VASY, в ИИ не уходит).
 * - Даже без ответа вопрос сохраняется и виден VASY — это и есть главное.
 * Сервер — `server/src/assistant/assistantService.js`.
 */
(function () {
  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  const SHEET_ID = 'training-assistant-sheet'; // «training-» — «Что нового» не всплывёт поверх
  // Нижние панели экранов, над которыми кнопка поднимается.
  const BOTTOM_BARS = ['#bottom-nav', '#cart-summary-bar', '#bulk-actions-bar', '#sn-footer', '[data-bottom-bar]'];
  const STATUS_LABEL = { open: '', helped: '✅ помогло', not_helped: '❌ не помогло' };

  let state = null; // { context, session, remaining, perDay, history, busy, rating }

  // --- Кнопка ---

  function ensureFab() {
    let fab = document.getElementById('assistant-fab');
    if (fab) return fab;
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'assistant-fab';
    fab.title = 'Помощник';
    fab.setAttribute('aria-label', 'Спросить помощника');
    fab.className = 'hidden fixed right-3 z-[39] w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 items-center justify-center active:scale-95 transition-transform';
    fab.innerHTML = '<i data-lucide="bot" class="w-6 h-6"></i>';
    fab.addEventListener('click', () => open({}));
    document.body.appendChild(fab);
    if (window.lucide) window.lucide.createIcons();
    return fab;
  }

  function visible(el) {
    if (!el || el.classList.contains('hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  }

  /** Прячем на время сценария и открытых окон; поднимаем над нижними панелями экрана. */
  function placeFab() {
    if (window.__E2E_SKIP_ASSISTANT_FAB || !window.CURRENT_ACCESS_ROLE) return;
    const fab = ensureFab();
    // Урок «Твой помощник» показывает саму кнопку — на время него не прячем (слой урока — не окно).
    const lesson = window.Tour && Tour.isActive() && Tour.activeId() === 'assistant';
    const hide = (window.Tour && Tour.isActive() && !lesson) || Array.from(document.querySelectorAll('.fixed.inset-0')).some((el) => el.id !== 'tour-layer' && visible(el));
    if (hide) { fab.classList.add('hidden'); fab.classList.remove('flex'); return; }
    let lift = 0;
    for (const sel of BOTTOM_BARS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!visible(el)) return;
        const r = el.getBoundingClientRect();
        if (r.bottom >= window.innerHeight - 4) lift = Math.max(lift, window.innerHeight - r.top);
      });
    }
    fab.style.bottom = `${Math.round(lift + 12)}px`;
    fab.classList.remove('hidden');
    fab.classList.add('flex');
  }

  // --- Окно ---

  function context(extra) {
    const base = window.TrainingUI && TrainingUI.problemContext ? TrainingUI.problemContext(extra || {}) : {};
    const params = base.params || {};
    return { ...base, lotId: params.lotId || '' };
  }

  async function open(extra) {
    if (window.Tour && Tour.isActive()) return;
    state = { context: context(extra || {}), session: null, remaining: null, perDay: null, history: [], busy: false, rating: false, prefill: extra && extra.error ? 'Что делать с этой ошибкой?' : '' };
    render();
    try {
      const my = await callServer('getMyAssistant');
      if (!state) return;
      state.remaining = my.remaining;
      state.perDay = my.perDay;
      state.history = my.sessions;
      render();
    } catch (e) { /* без истории тоже можно спросить */ }
  }

  function close() {
    const el = document.getElementById(SHEET_ID);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    state = null;
  }

  function sheet() {
    let el = document.getElementById(SHEET_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = SHEET_ID;
      el.className = 'fixed inset-0 bg-black/40 hidden items-end sm:items-center justify-center z-[92]';
      el.addEventListener('click', (e) => { if (e.target === el && !(state && state.busy)) close(); });
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
    el.classList.add('flex');
    return el;
  }

  function bubble(m) {
    if (m.role === 'manager') {
      const rating = m.data && m.data.kind === 'rating';
      return `<div class="flex justify-end"><div class="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-3 py-2 text-sm whitespace-pre-wrap break-words">${rating ? '<span class="opacity-70">Отзыв: </span>' : ''}${esc(m.text)}</div></div>`;
    }
    if (m.role === 'admin') {
      return `<div class="max-w-[90%] rounded-2xl rounded-bl-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900 whitespace-pre-wrap break-words"><div class="text-[11px] font-semibold text-emerald-700 mb-0.5">VASY</div>${esc(m.text)}</div>`;
    }
    if (m.role === 'system') {
      return `<div class="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">${esc(m.text)}</div>`;
    }
    const a = (m.data && m.data.answer) || { answer: m.text, steps: [] };
    const scenario = a.scenarioId && window.TourScenarios && window.TourScenarios[a.scenarioId];
    return `
      <div class="max-w-[90%] rounded-2xl rounded-bl-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-800">
        ${a.answer ? `<div class="whitespace-pre-wrap break-words">${esc(a.answer)}</div>` : ''}
        ${a.clarify ? `<div class="font-medium text-indigo-700 break-words">❓ ${esc(a.clarify)}</div>` : ''}
        ${a.steps && a.steps.length ? `<ol class="list-decimal pl-5 mt-1.5 space-y-0.5 text-[13px]">${a.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        ${scenario ? `<button type="button" data-scenario="${esc(a.scenarioId)}" class="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[13px] font-medium">▶ Показать по шагам: «${esc(scenario.title)}»</button>` : ''}
        ${m.data && m.data.handoffNote ? `<div class="mt-2 text-[12px] text-gray-500">${esc(m.data.handoffNote)}</div>` : ''}
      </div>`;
  }

  function introHtml() {
    const s = state;
    const err = s.context.error;
    const left = s.remaining == null ? '' : s.remaining > 0
      ? `Сегодня можно задать ещё ${s.remaining} из ${s.perDay}.`
      : 'Вопросы на сегодня закончились — всё равно напиши: вопрос уйдёт VASY.';
    return `
      <div class="text-[13px] text-gray-600 space-y-1.5">
        <div>Спроси, что непонятно или не получается. Я вижу этот экран и твои последние действия; клиентов — нет.</div>
        <div>Не знаю ответа — передам VASY. <b>Любой вопрос важен:</b> по ним VASY видит, где приложению нужно стать удобнее.</div>
        ${left ? `<div class="text-gray-400">${esc(left)}</div>` : ''}
      </div>
      ${err ? `<div class="mt-2 text-[12px] bg-red-50 border border-red-100 text-red-700 rounded-lg p-2 break-words">Ошибка: ${esc(err)}</div>` : ''}
      ${s.history.length ? `
        <details class="mt-3">
          <summary class="text-[12px] text-gray-500 cursor-pointer select-none">Прошлые вопросы (${s.history.length})</summary>
          <div class="mt-2 space-y-1.5">${s.history.map((h) => `
            <button type="button" data-history="${h.id}" class="w-full text-left p-2 rounded-xl border border-gray-100 active:bg-gray-50">
              <div class="text-[13px] text-gray-800 truncate">${esc(h.question)}</div>
              <div class="text-[11px] text-gray-400">${new Date(h.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}${STATUS_LABEL[h.status] ? ' · ' + STATUS_LABEL[h.status] : ''}${h.handoff ? ' · передано VASY' : ''}${h.messages.some((m) => m.role === 'admin') ? ' · <span class="text-emerald-600">есть ответ VASY</span>' : ''}</div>
            </button>`).join('')}</div>
        </details>` : ''}`;
  }

  function footerHtml() {
    const s = state;
    const session = s.session;
    const answered = session && session.messages.some((m) => m.role !== 'manager');
    let rate = '';
    if (session && answered && session.status === 'open') {
      rate = s.rating ? `
        <textarea id="assistant-rate-text" rows="2" maxlength="1000" class="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:border-indigo-400" placeholder="Что не так? (необязательно)"></textarea>
        <div class="flex gap-2 mt-2">
          <button type="button" data-rate-cancel class="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Отмена</button>
          <button type="button" data-rate-send class="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium">Отправить VASY</button>
        </div>` : `
        <div class="flex gap-2">
          <button type="button" data-helped class="flex-1 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">✅ Помогло</button>
          <button type="button" data-not-helped class="flex-1 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">❌ Не помогло</button>
        </div>`;
    } else if (session && session.status !== 'open') {
      rate = `<div class="text-[12px] text-center text-gray-500">${session.status === 'helped' ? 'Рад, что помог!' : 'Ушло VASY — он разберётся лично. Спасибо!'}</div>`;
    }
    const shot = session && (session.status === 'not_helped' || session.handoff)
      ? (session.hasScreenshot
        ? '<div class="text-[12px] text-center text-gray-500 mt-2">📎 Скриншот приложен — его увидит только VASY.</div>'
        : `<label class="mt-2 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-300 text-[13px] text-gray-600 cursor-pointer">
            📎 Приложить скриншот для VASY
            <input type="file" id="assistant-shot-input" accept="image/*" class="hidden">
          </label>`)
      : '';
    const canAsk = !session || session.canAsk;
    const input = canAsk ? `
      <div class="flex gap-2 items-end ${rate ? 'mt-3' : ''}">
        <textarea id="assistant-input" rows="2" maxlength="1000" class="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 resize-none"
          placeholder="${session ? 'Уточнить…' : 'Например: куда записать, если клиент перевёл больше?'}" ${s.busy ? 'disabled' : ''}>${esc(s.prefill || '')}</textarea>
        <button type="button" data-send class="shrink-0 h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50" ${s.busy ? 'disabled' : ''}>${s.busy ? '…' : 'Отправить'}</button>
      </div>`
      : `<button type="button" data-new class="w-full ${rate ? 'mt-3' : ''} py-2 rounded-xl border border-gray-200 text-sm text-gray-700">Новый вопрос</button>`;
    return rate + shot + input;
  }

  function render() {
    if (!state) return;
    const s = state;
    const el = sheet();
    const messages = s.session ? s.session.messages : [];
    el.innerHTML = `
      <div class="bg-gray-50 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[88vh]">
        <div class="flex items-center justify-between px-4 pt-4 pb-2">
          <div class="text-base font-semibold text-gray-900">🤖 Помощник</div>
          <div class="flex items-center gap-1">
            ${s.session ? '<button type="button" data-new class="px-2 py-1 rounded-lg text-[12px] text-indigo-600">Новый вопрос</button>' : ''}
            <button type="button" data-close class="p-1 text-gray-400"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
        </div>
        <div id="assistant-body" class="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
          ${s.session ? `${s.session.screen ? `<div class="text-[11px] text-gray-400">Экран: ${esc(s.session.screen)}</div>` : ''}${messages.map(bubble).join('')}` : introHtml()}
          ${s.busy ? '<div class="max-w-[60%] rounded-2xl rounded-bl-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-400" data-thinking>Думаю…</div>' : ''}
        </div>
        <div class="px-4 pt-2 pb-4 border-t border-gray-100 bg-white rounded-b-none sm:rounded-b-2xl">${footerHtml()}</div>
      </div>`;
    wire(el);
    const body = el.querySelector('#assistant-body');
    if (s.session) body.scrollTop = body.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  function wire(el) {
    const s = state;
    el.querySelector('[data-close]').onclick = () => { if (!s.busy) close(); };
    el.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => { if (s.busy) return; s.session = null; s.rating = false; s.prefill = ''; render(); }; });
    el.querySelectorAll('[data-history]').forEach((b) => {
      b.onclick = () => { s.session = s.history.find((h) => h.id === Number(b.dataset.history)) || null; render(); };
    });
    el.querySelectorAll('[data-scenario]').forEach((b) => { b.onclick = () => { const id = b.dataset.scenario; close(); Tour.start(id); }; });
    const input = el.querySelector('#assistant-input');
    if (input) {
      input.oninput = () => { s.prefill = input.value; };
      if (!s.busy && !s.rating) setTimeout(() => input.focus(), 50);
    }
    const send = el.querySelector('[data-send]');
    if (send) send.onclick = () => ask(input.value);
    const helped = el.querySelector('[data-helped]');
    if (helped) helped.onclick = () => rate(true, '');
    const notHelped = el.querySelector('[data-not-helped]');
    if (notHelped) notHelped.onclick = () => { s.rating = true; render(); };
    const rateCancel = el.querySelector('[data-rate-cancel]');
    if (rateCancel) rateCancel.onclick = () => { s.rating = false; render(); };
    const rateSend = el.querySelector('[data-rate-send]');
    if (rateSend) rateSend.onclick = () => rate(false, (el.querySelector('#assistant-rate-text') || {}).value || '');
    const shot = el.querySelector('#assistant-shot-input');
    if (shot) shot.onchange = () => attachShot(shot.files && shot.files[0]);
  }

  async function ask(text) {
    const s = state;
    const question = String(text || '').trim();
    if (!question || s.busy) return;
    s.busy = true;
    s.prefill = '';
    // Свой вопрос — сразу на экране, пока ждём ответ.
    if (s.session) s.session.messages.push({ role: 'manager', text: question, data: {} });
    else s.session = { id: null, status: 'open', handoff: '', screen: s.context.screenTitle, messages: [{ role: 'manager', text: question, data: {} }], canAsk: false };
    render();
    try {
      const payload = s.session.id ? { sessionId: s.session.id, text: question } : { text: question, context: s.context };
      const r = await callServer('askAssistant', payload);
      if (state !== s) return;
      s.session = r.session;
      s.remaining = r.remaining;
      s.perDay = r.perDay;
      s.history = [r.session, ...s.history.filter((h) => h.id !== r.session.id)];
    } catch (error) {
      if (state !== s) return;
      s.session.messages.pop();
      if (!s.session.id) s.session = null;
      s.prefill = question;
      showSaveToast(false, error.message);
    } finally {
      if (state === s) { s.busy = false; render(); }
    }
  }

  async function rate(helped, comment) {
    const s = state;
    if (s.busy || !s.session || !s.session.id) return;
    s.busy = true;
    render();
    try {
      const r = await callServer('rateAssistantSession', s.session.id, helped, comment.trim());
      if (state !== s) return;
      s.session.status = r.status;
      s.rating = false;
    } catch (error) {
      showSaveToast(false, error.message);
    } finally {
      if (state === s) { s.busy = false; render(); }
    }
  }

  async function attachShot(file) {
    const s = state;
    if (!file || s.busy || !s.session) return;
    s.busy = true;
    render();
    try {
      const image = await CheckoutShot.compress(file);
      await callServer('attachAssistantScreenshot', s.session.id, { mimeType: image.mimeType, data: image.data });
      if (state !== s) return;
      s.session.hasScreenshot = true;
    } catch (error) {
      showSaveToast(false, error.message);
    } finally {
      if (state === s) { s.busy = false; render(); }
    }
  }

  /** Вешается один раз при старте шелла (router.startAdminRouter). */
  function start() {
    if (window.__E2E_SKIP_ASSISTANT_FAB) return;
    placeFab();
    window.addEventListener('hashchange', () => setTimeout(placeFab, 50));
    window.addEventListener('resize', placeFab);
    // Панели экранов появляются и прячутся без смены экрана — сверяемся раз в 0,7 с.
    setInterval(placeFab, 700);
  }

  window.Assistant = { open, close, start, placeFab };
})();
