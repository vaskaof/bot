'use strict';

/**
 * Пошаговые сценарии обучения поверх настоящих экранов (обучение менеджеров,
 * этап 1, 04.10.2026; VASY: «наглядно, как клиента в приложении ведут по
 * действиям с объяснениями»). Сценарии — `_tour-scenarios.js`.
 *
 * Как устроено:
 * - Слой `#tour-layer` живёт на body, поверх экранов (z-90; общие модалки
 *   подтверждения z-95 остаются выше). Смена экрана (router.renderRoute
 *   чистит #screen-root) слой не трогает — сценарий идёт через экраны.
 * - Затемнение — 4 полосы вокруг подсвеченного элемента: сам элемент
 *   остаётся кликабельным, всё остальное — нет (кроме шагов `free: true`).
 *   Прокрутка через затемнение пробрасывается странице вручную.
 * - Шаг продвигается: «Далее» (`advance: 'next'`), нажатием на подсвеченное
 *   (`'click'`) или условием (`{ until() }`). Цель ищется заново каждый кадр —
 *   экраны перерисовываются и грузятся асинхронно.
 * - Необязательный шаг (`optional`) без цели пропускается; `group` +
 *   `groupLeader` — пропуск «ведущего» шага группы (нет карточки задачи)
 *   пропускает и остальные её шаги, не дожидаясь их целей.
 * - `block` (у сценария или шага) — клики, которые в учебном режиме
 *   запрещены (например, «Сохранить» корзины: учимся без записи данных).
 * - `place: 'away'` — подсказка у дальнего от цели края экрана (поле поиска
 *   с выпадающим списком: иначе подсказка ложится на список).
 * - Шаг без `target` (этап 4) — объяснение по центру поверх затемнения; с
 *   `quiz: { options: [{ label, correct?, explain }] }` — вопрос-проверка:
 *   «Далее» появляется после верного ответа, неверный объясняется и даёт
 *   попробовать ещё (не экзамен — закрепление).
 * - Состояние в sessionStorage: перезагрузка WebView продолжает с того же шага.
 * - События (start/step/complete/abandon) — на сервер без ожидания: по ним
 *   VASY видит, на каком шаге бросают.
 */
(function () {
  const STATE_KEY = 'knopkaTourState';
  const WAIT_MS = 8000;
  const OPTIONAL_WAIT_MS = 3500;
  const PAD = 6;

  let active = null; // { scenario, index }
  let layer = null;
  let stepToken = 0;
  let rafId = null;
  let lastRectKey = '';
  let skippedGroups = new Set();

  function scenarios() { return window.TourScenarios || {}; }

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeState(state) {
    try {
      if (state) sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      else sessionStorage.removeItem(STATE_KEY);
    } catch (e) { /* нет хранилища — просто без продолжения после перезагрузки */ }
  }

  function currentScreen() {
    return typeof matchRoute === 'function' ? matchRoute(window.location.hash).screen : '';
  }

  function track(event, step) {
    if (!active) return;
    const total = active.scenario.steps.length;
    callServer('recordTrainingEvent', active.scenario.id, event, step, total).catch(() => {});
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    // По горизонтали — в окне: на телефоне колонки доски «Задачи» лежат
    // лентой, соседние колонки за краем экрана (05.10.2026).
    return r.width > 0 && r.height > 0 && el.getClientRects().length > 0 && r.right > 0 && r.left < window.innerWidth;
  }

  function findTarget(step) {
    if (!step.target) return null;
    if (typeof step.target === 'function') {
      const el = step.target();
      return isVisible(el) ? el : null;
    }
    // Первый ВИДИМЫЙ: на доске «Задачи» первые по DOM карточки бывают в
    // скрытой колонке этапа или в свёрнутой группе коллективки (репорт VASY
    // 04.10: «задач нет», хотя задачи были).
    return Array.from(document.querySelectorAll(step.target)).find(isVisible) || null;
  }

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'tour-layer';
    layer.className = 'fixed inset-0 z-[90] pointer-events-none';
    layer.innerHTML = `
      <div data-shade="top" class="tour-shade absolute bg-black/55 pointer-events-auto"></div>
      <div data-shade="bottom" class="tour-shade absolute bg-black/55 pointer-events-auto"></div>
      <div data-shade="left" class="tour-shade absolute bg-black/55 pointer-events-auto"></div>
      <div data-shade="right" class="tour-shade absolute bg-black/55 pointer-events-auto"></div>
      <div id="tour-ring" class="absolute rounded-xl ring-4 ring-amber-400 pointer-events-none transition-all duration-150"></div>
      <div id="tour-bubble" class="absolute bg-white rounded-2xl shadow-2xl p-4 pointer-events-auto" style="width:min(340px, calc(100vw - 24px))"></div>
    `;
    document.body.appendChild(layer);

    // Прокрутка страницы «сквозь» затемнение — иначе на телефоне нельзя
    // докрутить до нужного поля, пока идёт сценарий.
    let touchY = null;
    layer.querySelectorAll('.tour-shade').forEach((shade) => {
      shade.addEventListener('wheel', (e) => { window.scrollBy(0, e.deltaY); }, { passive: true });
      shade.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
      shade.addEventListener('touchmove', (e) => {
        if (touchY === null) return;
        const y = e.touches[0].clientY;
        window.scrollBy(0, touchY - y);
        touchY = y;
      }, { passive: true });
      shade.addEventListener('click', () => pulseBubble());
    });
    return layer;
  }

  function pulseBubble() {
    const bubble = document.getElementById('tour-bubble');
    if (!bubble) return;
    bubble.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 250 });
  }

  function setShade(name, left, top, width, height) {
    const el = layer.querySelector(`[data-shade="${name}"]`);
    el.style.left = `${left}px`; el.style.top = `${top}px`;
    el.style.width = `${Math.max(0, width)}px`; el.style.height = `${Math.max(0, height)}px`;
  }

  /** Раскладка затемнения/рамки/подсказки под текущий прямоугольник цели. */
  function layout(target, step) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ring = document.getElementById('tour-ring');
    const bubble = document.getElementById('tour-bubble');
    const free = !!step.free;
    layer.querySelectorAll('.tour-shade').forEach((s) => {
      s.style.pointerEvents = free ? 'none' : 'auto';
      s.style.opacity = free ? '0.35' : '1';
    });

    if (!target) {
      setShade('top', 0, 0, vw, vh);
      setShade('bottom', 0, 0, 0, 0); setShade('left', 0, 0, 0, 0); setShade('right', 0, 0, 0, 0);
      ring.style.display = 'none';
      bubble.style.left = `${Math.max(12, (vw - bubble.offsetWidth) / 2)}px`;
      bubble.style.top = `${Math.max(12, (vh - bubble.offsetHeight) / 2)}px`;
      return;
    }

    const r = target.getBoundingClientRect();
    const top = Math.max(0, r.top - PAD);
    const left = Math.max(0, r.left - PAD);
    const right = Math.min(vw, r.right + PAD);
    const bottom = Math.min(vh, r.bottom + PAD);
    setShade('top', 0, 0, vw, top);
    setShade('bottom', 0, bottom, vw, vh - bottom);
    setShade('left', 0, top, left, bottom - top);
    setShade('right', right, top, vw - right, bottom - top);
    ring.style.display = 'block';
    ring.style.left = `${left}px`; ring.style.top = `${top}px`;
    ring.style.width = `${right - left}px`; ring.style.height = `${bottom - top}px`;

    const bh = bubble.offsetHeight;
    const bw = bubble.offsetWidth;
    let bTop;
    // place: 'away' — у поля поиска с выпадающим списком: подсказка у дальнего
    // края экрана, иначе она закрывает список (e2e «Занести оплату», 04.10).
    if (step.place === 'away') bTop = (r.top + r.height / 2) < vh / 2 ? vh - bh - 12 : 12;
    else if (vh - bottom >= bh + 12) bTop = bottom + 10;
    else if (top >= bh + 12) bTop = top - bh - 10;
    else bTop = Math.max(12, vh - bh - 12);
    const bLeft = Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), vw - bw - 12);
    bubble.style.top = `${bTop}px`;
    bubble.style.left = `${bLeft}px`;
  }

  function startLoop(step, getTarget) {
    stopLoop();
    lastRectKey = '';
    const tick = () => {
      const target = getTarget();
      const r = target ? target.getBoundingClientRect() : null;
      const key = r ? `${r.left}|${r.top}|${r.width}|${r.height}|${window.innerWidth}|${window.innerHeight}` : `none|${window.innerWidth}|${window.innerHeight}`;
      if (key !== lastRectKey) { lastRectKey = key; layout(target, step); }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function renderBubble(step, opts) {
    const bubble = document.getElementById('tour-bubble');
    const total = active.scenario.steps.length;
    const showNext = opts.showNext;
    bubble.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <div class="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">Шаг ${active.index + 1} из ${total} · ${escapeHtmlClient(active.scenario.title)}</div>
        <span class="flex items-center gap-3 shrink-0">
          ${active.history.length > 1 ? '<button type="button" data-tour="back" class="text-[11px] text-indigo-600">← Назад</button>' : ''}
          <button type="button" data-tour="exit" class="text-[11px] text-gray-400">Выйти</button>
        </span>
      </div>
      ${opts.title ? `<div class="text-[15px] font-semibold text-gray-900 mb-1">${opts.title}</div>` : ''}
      <div class="text-sm text-gray-700 leading-snug">${opts.text}</div>
      ${opts.quiz ? `<div class="space-y-1.5 mt-3">${opts.quiz.options.map((o, i) => `<button type="button" data-quiz="${i}" class="w-full text-left px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800">${o.label}</button>`).join('')}</div>
        <div data-quiz-explain class="hidden text-[13px] leading-snug mt-2 rounded-xl px-3 py-2"></div>` : ''}
      ${opts.hint ? `<div class="text-[12px] text-amber-700 mt-2">${opts.hint}</div>` : ''}
      <div class="flex flex-wrap gap-2 mt-3" data-tour-actions>
        ${(opts.actions || []).map((a, i) => `<button type="button" data-tour-action="${i}" class="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium">${escapeHtmlClient(a.label)}</button>`).join('')}
        ${showNext ? `<button type="button" data-tour="next" class="${opts.quiz ? 'hidden ' : ''}flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">${active.index + 1 === total ? 'Готово' : 'Далее'}</button>` : ''}
      </div>
    `;
    bubble.querySelector('[data-tour="exit"]').addEventListener('click', () => exit());
    const backBtn = bubble.querySelector('[data-tour="back"]');
    if (backBtn) backBtn.addEventListener('click', () => goBack());
    const nextBtn = bubble.querySelector('[data-tour="next"]');
    if (nextBtn) nextBtn.addEventListener('click', () => goNext());
    if (opts.quiz) {
      const explain = bubble.querySelector('[data-quiz-explain]');
      bubble.querySelectorAll('[data-quiz]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const option = opts.quiz.options[Number(btn.dataset.quiz)];
          bubble.querySelectorAll('[data-quiz]').forEach((b) => b.classList.remove('border-emerald-500', 'bg-emerald-50', 'border-red-400', 'bg-red-50'));
          btn.classList.add(...(option.correct ? ['border-emerald-500', 'bg-emerald-50'] : ['border-red-400', 'bg-red-50']));
          explain.className = `text-[13px] leading-snug mt-2 rounded-xl px-3 py-2 ${option.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`;
          explain.innerHTML = `${option.correct ? '✅ Верно. ' : '❌ Не совсем. '}${option.explain || ''}${option.correct ? '' : ' Попробуй ещё раз.'}`;
          if (option.correct && nextBtn) nextBtn.classList.remove('hidden');
        });
      });
    }
    (opts.actions || []).forEach((a, i) => {
      const btn = bubble.querySelector(`[data-tour-action="${i}"]`);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Секунду…';
        try { await a.run(); } catch (error) { showSaveToast(false, error.message || 'Не получилось.'); }
        if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
      });
    });
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /** Ждёт цель шага; null — не дождались (или `missingIf` сказал, что её не будет). */
  async function waitTarget(step, token) {
    const limit = step.wait || (step.optional ? OPTIONAL_WAIT_MS : WAIT_MS);
    const started = Date.now();
    while (Date.now() - started < limit) {
      if (token !== stepToken) return null;
      const el = findTarget(step);
      if (el) return el;
      if (step.missingIf && step.missingIf()) return null;
      await wait(200);
    }
    return findTarget(step);
  }

  async function showStep() {
    if (!active) return;
    const token = ++stepToken;
    const { scenario } = active;
    const step = scenario.steps[active.index];
    if (!step) return finish();
    writeState({ scenarioId: scenario.id, index: active.index });

    if ((step.group && skippedGroups.has(step.group)) || (step.skipIf && step.skipIf())) {
      active.index += 1;
      return showStep();
    }
    // История показанных шагов — для «← Назад»: вместе с экраном, на котором
    // шаг показывался (возврат через переход возвращает и экран).
    const last = active.history[active.history.length - 1];
    if (!last || last.index !== active.index) active.history.push({ index: active.index, hash: window.location.hash });
    track('step', active.index + 1);
    if (step.onEnter) { try { step.onEnter(); } catch (e) { /* шаг всё равно показываем */ } }

    ensureLayer();
    // Шаг без цели — объяснение или вопрос-проверка по центру экрана.
    if (!step.target) {
      renderBubble(step, { title: step.title, text: step.text, quiz: step.quiz, actions: step.actions, showNext: true });
      startLoop({}, () => null);
      return;
    }
    // Пока ищем цель — подсказка по центру, без затемнения кликов по экрану.
    // Необязательный шаг может не найтись — его текст не показываем заранее.
    renderBubble(step, step.optional
      ? { text: 'Секунду, ищу нужное место на экране…', showNext: false }
      : { title: step.title, text: step.text, hint: 'Секунду, ищу нужное место на экране…', showNext: false });
    startLoop({ free: true }, () => null);

    const target = await waitTarget(step, token);
    if (token !== stepToken || !active) return;

    if (!target) {
      if (step.optional) {
        if (step.group && step.groupLeader) skippedGroups.add(step.group);
        if (step.skippedText) {
          renderBubble(step, { title: step.title, text: step.skippedText, showNext: true });
          startLoop({}, () => null);
          return;
        }
        active.index += 1;
        return showStep();
      }
      renderBubble(step, {
        title: step.title, text: step.text,
        hint: 'Не вижу нужное место на экране — возможно, он ещё грузится или выглядит иначе. Можно нажать «Далее».',
        showNext: true
      });
      startLoop({}, () => null);
      return;
    }

    if (step.scroll !== false) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const advance = step.advance || 'next';
    renderBubble(step, {
      title: step.title, text: step.text,
      hint: advance === 'click' ? '👆 Нажми на подсвеченное.' : step.hint,
      actions: step.actions, showNext: advance === 'next'
    });
    startLoop(step, () => findTarget(step) || target);

    if (advance && typeof advance === 'object' && advance.until) {
      while (token === stepToken && active) {
        let done = false;
        try { done = !!advance.until(); } catch (e) { done = false; }
        if (done) { await wait(250); if (token === stepToken) goNext(); return; }
        await wait(300);
      }
    }
  }

  function goNext() {
    if (!active) return;
    active.index += 1;
    showStep();
  }

  /** «← Назад» — предыдущий показанный шаг; если он был на другом экране — туда же. */
  function goBack() {
    if (!active || active.history.length < 2) return;
    active.history.pop();
    const prev = active.history.pop(); // снова попадёт в историю в showStep
    active.index = prev.index;
    skippedGroups = new Set();
    if (prev.hash !== window.location.hash) window.location.hash = prev.hash;
    showStep();
  }

  function isBlocked(el) {
    if (!active || !el || !el.closest) return false;
    const step = active.scenario.steps[active.index];
    const blocked = [...(active.scenario.block || []), ...((step && step.block) || [])];
    return blocked.some((sel) => el.closest(sel));
  }

  // Ползунки (доля в коллективке) пишут без клика — запрещаем само касание.
  ['pointerdown', 'touchstart'].forEach((type) => document.addEventListener(type, (e) => {
    if (isBlocked(e.target) && e.target.matches && e.target.matches('input[type="range"]')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showSaveToast(true, 'Учебный режим: здесь не меняем — ничего не запишется.');
    }
  }, { capture: true, passive: false }));

  // Нажатие на подсвеченное (advance: 'click') и запреты учебного режима.
  document.addEventListener('click', (e) => {
    if (!active) return;
    const step = active.scenario.steps[active.index];
    if (isBlocked(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showSaveToast(true, 'Учебный режим: здесь не сохраняем — ничего не запишется.');
      return;
    }
    if (!step || step.advance !== 'click') return;
    const target = findTarget(step);
    if (target && target.contains(e.target)) {
      const token = stepToken;
      // Даём обработчику самого экрана отработать (переход, раскрытие), потом — дальше.
      setTimeout(() => { if (token === stepToken) goNext(); }, 60);
    }
  }, true);

  function teardown() {
    stopLoop();
    stepToken++;
    if (layer) { layer.remove(); layer = null; }
    writeState(null);
  }

  async function finish() {
    const scenario = active.scenario;
    track('complete', scenario.steps.length);
    active = null;
    teardown();
    if (scenario.onComplete) { try { scenario.onComplete(); } catch (e) { /* не мешаем отзыву */ } }
    if (window.TrainingUI) window.TrainingUI.afterScenario(scenario);
  }

  async function exit() {
    if (!active) return;
    const sure = await showConfirmModal('Выйти из обучения? Пройти сценарий можно заново в любой момент — «Обучение» в разделе «Ещё».', { confirmLabel: 'Выйти', cancelLabel: 'Продолжить' });
    if (!sure || !active) return;
    track('abandon', active.index + 1);
    const scenario = active.scenario;
    active = null;
    teardown();
    if (scenario.onExit) { try { scenario.onExit(); } catch (e) { /* ничего */ } }
  }

  /** Запуск сценария по id (из «Обучения» или «Помощи»). */
  function start(scenarioId) {
    const scenario = scenarios()[scenarioId];
    if (!scenario) { showSaveToast(false, 'Этот сценарий ещё готовится.'); return; }
    if (active) teardown();
    skippedGroups = new Set();
    active = { scenario, index: 0, history: [] };
    track('start', 0);
    showStep();
  }

  /** После перезагрузки WebView — продолжить с того же шага. */
  function resume() {
    const state = readState();
    if (!state || active) return;
    const scenario = scenarios()[state.scenarioId];
    if (!scenario) { writeState(null); return; }
    skippedGroups = new Set();
    active = { scenario, index: Math.min(state.index || 0, scenario.steps.length - 1), history: [] };
    showStep();
  }

  window.Tour = {
    start,
    resume,
    isActive: () => !!active,
    currentScreen,
    // для тестов
    _layout: layout
  };
})();
