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
 *
 * Правки по отзывам VASY 04.10.2026 (staff_feedback №10, 11, 13):
 * - текст подсказки печатается (≈40 знаков/с), «Далее» — когда допечатан;
 *   нажатие на текст допечатывает сразу. Повторный показ шага (← Назад) и
 *   e2e (`window.__E2E_TOUR_INSTANT`) — без печати;
 * - «Свернуть» в подсказке — когда она закрывает нужное на экране;
 * - на шаге-пояснении («Далее») нажатие на подсвеченное не срабатывает —
 *   раньше так открывались окна, которые нечем было закрыть (коллективка,
 *   «Статус доставки»); нужно нажимать — `allowClick: true`;
 * - после смены экрана следующий шаг ждёт, пока экран отрисуется;
 * - выход из урока и конец урока — в «Обучение».
 *
 * 05.10.2026 (VASY: «Секунду, ищу нужное место» в 10-м уроке после ухода из
 * окна): если Telegram перезапустил окно, урок продолжается с того же шага,
 * но открытые вкладки и окна пропали — шаг, не найдя цель за 3 с,
 * откатывается к ближайшему шагу «нажми», который их откроет.
 *
 * 05.10.2026 (план Б — обучение клиентов): движок общий для кабинета и
 * клиентского приложения (файл переехал из admin/screens/_tour.js).
 * Различия — в `window.TourHost` (задаёт клиент, client/training.js):
 * куда писать события, куда возвращаться, что делать после урока и тексты
 * (клиенту — на «вы»). Без TourHost — поведение кабинета, как было.
 *
 * 05.10.2026 (VASY: «объяснение идёт автоматически — дай клиентам нажимать
 * на кнопки, чтобы лучше понимать, где что»): шаг `practice: true` —
 * упражнение «Найдите сами». Цель НЕ подсвечена и не затемнена — экран
 * виден целиком и прокручивается; нажатие на цель (или `accept(el, target)`)
 * — «✅ Верно!» и текст `found`, дальше «Далее»; мимо — «Не здесь», после
 * третьего промаха или через `hintAfter` мс (по умолчанию 18 с) и по кнопке
 * «Подсказать» цель подсвечивается рамкой. Нажатия в упражнении ничего не
 * открывают (ни цель, ни остальное). Промахи и подсказки — события
 * 'miss'/'hint' (только если `TourHost.practiceEvents`): по ним видно, где
 * теряются.
 */
(function () {
  // Кабинет менеджера — по умолчанию (на «ты», события recordTrainingEvent).
  const ADMIN_HOST = {
    home: 'training',
    record: (id, event, step, total) => callServer('recordTrainingEvent', id, event, step, total),
    after: (scenario) => { if (window.TrainingUI) window.TrainingUI.afterScenario(scenario); },
    texts: {
      press: '👆 Нажми на подсвеченное.',
      retry: ' Попробуй ещё раз.',
      explainOnly: 'Это пояснение — нажми «Далее» в подсказке.',
      blocked: 'Учебный режим: здесь не сохраняем — ничего не запишется.',
      blockedSlider: 'Учебный режим: здесь не меняем — ничего не запишется.',
      notFound: 'Не вижу нужное место на экране — возможно, он ещё грузится или выглядит иначе. Можно нажать «Далее».',
      exit: 'Выйти из обучения? Пройти сценарий можно заново в любой момент — «Обучение» в разделе «Ещё».',
      practiceMiss: 'Не здесь — попробуй ещё 🙂',
      practiceMissAgain: 'Снова не здесь. Можно нажать «Подсказать».',
      practiceHint: '👆 Вот здесь — нажми на подсвеченное.'
    }
  };
  function host() {
    const h = window.TourHost || {};
    return { ...ADMIN_HOST, ...h, texts: { ...ADMIN_HOST.texts, ...(h.texts || {}) } };
  }
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
  let typingTimer = null;
  let collapsed = false;
  let routeChangedAt = 0;
  const TYPE_CHARS = 2;   // знаков за такт
  const TYPE_TICK_MS = 50; // ≈40 знаков в секунду
  const ROUTE_SETTLE_MS = 400;
  const RESUME_WAIT_MS = 3000;
  const PRACTICE_HINT_MS = 18000;
  const PRACTICE_MISSES_TO_HINT = 3;
  let practiceTimer = null;

  window.addEventListener('hashchange', () => { routeChangedAt = Date.now(); });

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
    // id — сейчас: выход из урока обнуляет active сразу после этого вызова.
    const id = active.scenario.id;
    Promise.resolve().then(() => host().record(id, event, step, total)).catch(() => {});
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

  /** Нижний край видимого тоста #save-toast; 0 — тоста нет. */
  function toastBottom() {
    const t = document.getElementById('save-toast');
    if (!t || t.classList.contains('hidden')) return 0;
    const r = t.getBoundingClientRect();
    return r.height > 0 ? Math.round(r.bottom) : 0;
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

    // «Найдите сами»: без затемнения — экран виден целиком. Пока цель не
    // найдена и подсказки не было — без рамки, подсказка у края экрана
    // (над нижним меню или под шапкой — `place: 'top'`), чтобы не выдать место.
    if (step.practice) {
      layer.querySelectorAll('.tour-shade').forEach((s) => { s.style.pointerEvents = 'none'; s.style.opacity = '0'; });
      if (practiceHidden(step) || !target) {
        ring.style.display = 'none';
        const bh = bubble.offsetHeight;
        const nav = document.getElementById('bottom-nav');
        const navRect = nav ? nav.getBoundingClientRect() : null;
        const navTop = navRect && navRect.height ? navRect.top : vh;
        const tb = toastBottom();
        const topAt = (side) => {
          let t = side === 'top' ? 64 : navTop - bh - 10;
          if (tb && t < tb + 8) t = tb + 8;
          return Math.max(12, Math.min(t, vh - bh - 12));
        };
        // Сторона — `place` шага; иначе снизу, а если подсказка закрывает цель
        // — к другому краю (без прыжков туда-обратно при прокрутке).
        const p = active && active.practice;
        let side = step.place === 'top' ? 'top' : ((p && p.side) || 'bottom');
        if (target && step.place !== 'top') {
          const r = target.getBoundingClientRect();
          const covers = (s) => { const t = topAt(s); return r.bottom > t && r.top < t + bh; };
          if (covers(side) && !covers(side === 'top' ? 'bottom' : 'top')) side = side === 'top' ? 'bottom' : 'top';
        }
        if (p) p.side = side;
        const bTop = topAt(side);
        bubble.style.top = `${bTop}px`;
        bubble.style.left = `${Math.max(12, (vw - bubble.offsetWidth) / 2)}px`;
        return;
      }
    }

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
    // Свёрнутая подсказка — тоже у дальнего края, чтобы открыть цель целиком.
    if (step.place === 'away' || collapsed) bTop = (r.top + r.height / 2) < vh / 2 ? vh - bh - 12 : 12;
    else if (vh - bottom >= bh + 12) bTop = bottom + 10;
    else if (top >= bh + 12) bTop = top - bh - 10;
    else bTop = Math.max(12, vh - bh - 12);
    // Тост вверху экрана («Учебный режим…», «Добавлено строк…») лежит поверх
    // всего — подсказку у верхнего края опускаем под него (скриншоты С5).
    const tb = toastBottom();
    if (tb && bTop < tb + 8) bTop = Math.min(tb + 8, Math.max(12, vh - bh - 12));
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
      const key = (r ? `${r.left}|${r.top}|${r.width}|${r.height}|${window.innerWidth}|${window.innerHeight}` : `none|${window.innerWidth}|${window.innerHeight}`) + `|${toastBottom()}`;
      if (key !== lastRectKey) { lastRectKey = key; layout(target, step); }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function stopTyping() {
    if (typingTimer) clearInterval(typingTimer);
    typingTimer = null;
  }

  /**
   * Печатает текст подсказки: весь текст сразу лежит на месте невидимым
   * (размер подсказки не прыгает, раскладка не съезжает), и по такту
   * становится видимым. Разметка (<b>, <br>) не ломается — печатаются только
   * текстовые узлы. Нажатие на текст — допечатать сразу.
   */
  function typeText(el, onDone) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode);
    const queue = parts.filter((n) => n.nodeValue.length).map((node) => {
      const full = node.nodeValue;
      const ghost = document.createElement('span');
      ghost.style.visibility = 'hidden';
      ghost.textContent = full;
      node.nodeValue = '';
      node.parentNode.insertBefore(ghost, node.nextSibling);
      return { node, ghost, full, shown: 0 };
    });
    let i = 0;
    const finish = () => {
      stopTyping();
      queue.forEach((p) => { p.node.nodeValue = p.full; p.ghost.remove(); });
      el.removeEventListener('click', finish);
      onDone();
    };
    el.addEventListener('click', finish);
    typingTimer = setInterval(() => {
      let budget = TYPE_CHARS;
      while (budget > 0 && i < queue.length) {
        const p = queue[i];
        const take = Math.min(budget, p.full.length - p.shown);
        p.shown += take;
        budget -= take;
        p.node.nodeValue = p.full.slice(0, p.shown);
        p.ghost.textContent = p.full.slice(p.shown);
        if (p.shown >= p.full.length) { p.ghost.remove(); i += 1; }
      }
      if (i >= queue.length) finish();
    }, TYPE_TICK_MS);
  }

  function renderBubble(step, opts) {
    stopTyping();
    const bubble = document.getElementById('tour-bubble');
    const total = active.scenario.steps.length;
    const showNext = opts.showNext;
    // Печатаем только «настоящий» текст шага и только при первом показе.
    const typing = !!opts.typing && !window.__E2E_TOUR_INSTANT && !active.seen.has(active.index);
    bubble.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <div class="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide min-w-0 truncate">Шаг ${active.index + 1} из ${total} · ${escapeHtmlClient(active.scenario.title)}</div>
        <span class="flex items-center gap-3 shrink-0">
          ${active.history.length > 1 ? '<button type="button" data-tour="back" class="text-[11px] text-indigo-600">← Назад</button>' : ''}
          <button type="button" data-tour="collapse" class="text-[11px] text-indigo-600">${collapsed ? 'Развернуть' : 'Свернуть'}</button>
          <button type="button" data-tour="exit" class="text-[11px] text-gray-400">Выйти</button>
        </span>
      </div>
      <div data-tour-body class="${collapsed ? 'hidden' : ''}">
        ${opts.title ? `<div class="text-[15px] font-semibold text-gray-900 mb-1">${opts.title}</div>` : ''}
        <div data-tour-text class="text-sm text-gray-700 leading-snug">${opts.text}</div>
        ${opts.quiz ? `<div data-quiz-options class="space-y-1.5 mt-3 ${typing ? 'hidden' : ''}">${opts.quiz.options.map((o, i) => `<button type="button" data-quiz="${i}" class="w-full text-left px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800">${o.label}</button>`).join('')}</div>
          <div data-quiz-explain class="hidden text-[13px] leading-snug mt-2 rounded-xl px-3 py-2"></div>` : ''}
        ${opts.hint ? `<div class="text-[12px] text-amber-700 mt-2">${opts.hint}</div>` : ''}
        ${opts.practice ? '<div data-practice-msg class="hidden text-[13px] leading-snug mt-2 rounded-xl px-3 py-2"></div>' : ''}
        <div class="flex flex-wrap gap-2 mt-3" data-tour-actions>
          ${opts.practice ? '<button type="button" data-tour="hint" class="flex-1 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium">💡 Подсказать</button>' : ''}
          ${(opts.actions || []).map((a, i) => `<button type="button" data-tour-action="${i}" class="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium">${escapeHtmlClient(a.label)}</button>`).join('')}
          ${showNext ? `<button type="button" data-tour="next" class="${opts.quiz || typing ? 'hidden ' : ''}flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">${active.index + 1 === total ? 'Готово' : 'Далее'}</button>` : ''}
        </div>
      </div>
      ${collapsed ? `<div class="text-[13px] text-gray-700 truncate">${opts.title ? opts.title.replace(/<[^>]+>/g, '') : 'Подсказка свёрнута'}</div>` : ''}
    `;
    bubble.querySelector('[data-tour="exit"]').addEventListener('click', () => exit());
    bubble.querySelector('[data-tour="collapse"]').addEventListener('click', () => {
      collapsed = !collapsed;
      const index = active.index;
      active.seen.add(index); // при разворачивании — не печатать заново
      renderBubble(step, opts);
      lastRectKey = ''; // пересчитать место подсказки
    });
    const backBtn = bubble.querySelector('[data-tour="back"]');
    if (backBtn) backBtn.addEventListener('click', () => goBack());
    const nextBtn = bubble.querySelector('[data-tour="next"]');
    if (nextBtn) nextBtn.addEventListener('click', () => goNext());
    const hintBtn = bubble.querySelector('[data-tour="hint"]');
    if (hintBtn) hintBtn.addEventListener('click', () => showPracticeHint());
    if (typing) {
      const textEl = bubble.querySelector('[data-tour-text]');
      const index = active.index;
      typeText(textEl, () => {
        if (!active || active.index !== index) return;
        active.seen.add(index);
        const quizOptions = bubble.querySelector('[data-quiz-options]');
        if (quizOptions) quizOptions.classList.remove('hidden');
        else if (nextBtn) nextBtn.classList.remove('hidden');
        lastRectKey = '';
      });
    } else if (opts.typing) {
      active.seen.add(active.index);
    }
    if (opts.quiz) {
      const explain = bubble.querySelector('[data-quiz-explain]');
      bubble.querySelectorAll('[data-quiz]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const option = opts.quiz.options[Number(btn.dataset.quiz)];
          bubble.querySelectorAll('[data-quiz]').forEach((b) => b.classList.remove('border-emerald-500', 'bg-emerald-50', 'border-red-400', 'bg-red-50'));
          btn.classList.add(...(option.correct ? ['border-emerald-500', 'bg-emerald-50'] : ['border-red-400', 'bg-red-50']));
          explain.className = `text-[13px] leading-snug mt-2 rounded-xl px-3 py-2 ${option.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`;
          explain.innerHTML = `${option.correct ? '✅ Верно. ' : '❌ Не совсем. '}${option.explain || ''}${option.correct ? '' : host().texts.retry}`;
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
    let limit = step.wait || (step.optional ? OPTIONAL_WAIT_MS : WAIT_MS);
    // После перезапуска окна долго не ждём: не нашлось — вернёмся назад (showStep).
    if (active && active.resumed) limit = Math.min(limit, RESUME_WAIT_MS);
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
    clearPracticeTimer();
    active.practice = null;
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
    collapsed = false;

    ensureLayer();
    // Шаг без цели — объяснение или вопрос-проверка по центру экрана.
    if (!step.target) {
      if (step.onEnter) { try { await step.onEnter(); } catch (e) { /* шаг всё равно показываем */ } }
      if (token !== stepToken || !active) return;
      const waits = !!(step.advance && typeof step.advance === 'object' && step.advance.until);
      renderBubble(step, { title: step.title, text: step.text, quiz: step.quiz, actions: step.actions, showNext: !waits, typing: true });
      startLoop({}, () => null);
      // Объяснение с кнопкой-действием, которое само ведёт дальше (С5: «Показать мою сводку»).
      if (waits) await waitUntil(step, token);
      return;
    }
    // Пока ищем цель — подсказка по центру, без затемнения кликов по экрану.
    // Необязательный шаг может не найтись — его текст не показываем заранее.
    const searching = active.resumed ? 'Возвращаю урок на место…' : 'Секунду, ищу нужное место на экране…';
    renderBubble(step, step.optional
      ? { text: searching, showNext: false }
      : { title: step.title, text: step.text, hint: searching, showNext: false });
    startLoop({ free: true }, () => null);

    // Экран только что сменился — даём ему отрисоваться, иначе шаг цепляется
    // за элемент старого экрана или за место, которое сейчас съедет
    // (отзыв VASY №10: «не идеально следует открытию экрана»).
    const sinceRoute = Date.now() - routeChangedAt;
    if (sinceRoute < ROUTE_SETTLE_MS) await wait(ROUTE_SETTLE_MS - sinceRoute);
    if (token !== stepToken || !active) return;
    if (step.onEnter) { try { await step.onEnter(); } catch (e) { /* шаг всё равно показываем */ } }
    if (token !== stepToken || !active) return;

    const target = await waitTarget(step, token);
    if (token !== stepToken || !active) return;

    if (!target && active.resumed && !step.optional) {
      // Окно перезапустилось (Telegram выгрузил приложение, пока ты был в
      // другом окне): открытая вкладка, окно или выбор пропали — шаг их не
      // находит. Возвращаемся к ближайшему шагу «нажми», который это
      // открывает (отзыв VASY 05.10: «Секунду, ищу» в 10-м уроке).
      const back = resumeFallbackIndex();
      if (back !== null) {
        active.index = back;
        return showStep();
      }
      active.resumed = false;
    }
    if (target) active.resumed = false;

    if (!target) {
      if (step.optional) {
        if (step.group && step.groupLeader) skippedGroups.add(step.group);
        if (step.skippedText) {
          renderBubble(step, { title: step.title, text: step.skippedText, showNext: true, typing: true });
          startLoop({}, () => null);
          return;
        }
        active.index += 1;
        return showStep();
      }
      renderBubble(step, {
        title: step.title, text: step.text,
        hint: host().texts.notFound,
        showNext: true, typing: true
      });
      startLoop({}, () => null);
      return;
    }

    // «Найдите сами»: цель не подсвечиваем и не прокручиваем к ней — ищут сами.
    if (step.practice) {
      active.practice = { hinted: false, solved: false, misses: 0 };
      renderBubble(step, { title: step.title, text: step.text, practice: true, showNext: false, typing: true });
      startLoop(step, () => findTarget(step) || (target.isConnected ? target : null));
      practiceTimer = setTimeout(() => { if (token === stepToken) showPracticeHint(); }, step.hintAfter || PRACTICE_HINT_MS);
      return;
    }

    if (step.scroll !== false) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const advance = step.advance || 'next';
    renderBubble(step, {
      title: step.title, text: step.text,
      hint: advance === 'click' ? host().texts.press : step.hint,
      actions: step.actions, showNext: advance === 'next', typing: true
    });
    // Старая цель ушла вместе с экраном — подсказка не висит над пустым местом.
    startLoop(step, () => findTarget(step) || (target.isConnected ? target : null));

    if (advance && typeof advance === 'object' && advance.until) await waitUntil(step, token);
  }

  // --- «Найдите сами» ---

  function practiceHidden(step) {
    return !!(step && step.practice && active && active.practice && !active.practice.hinted && !active.practice.solved);
  }

  function clearPracticeTimer() {
    if (practiceTimer) clearTimeout(practiceTimer);
    practiceTimer = null;
  }

  function trackPractice(event) {
    if (active && host().practiceEvents) track(event, active.index + 1);
  }

  function practiceMsg(text, kind) {
    const el = document.querySelector('#tour-bubble [data-practice-msg]');
    if (!el) return;
    el.className = `text-[13px] leading-snug mt-2 rounded-xl px-3 py-2 ${kind === 'miss' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-800'}`;
    el.textContent = text;
    lastRectKey = ''; // подсказка выросла — пересчитать место
  }

  function haptic(kind) {
    try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred(kind); } catch (e) { /* без вибрации */ }
  }

  /** Подсказка: рамка на цели (и прокрутка к ней). Кнопка, таймер или третий промах. */
  function showPracticeHint() {
    if (!active || !active.practice || active.practice.solved || active.practice.hinted) return;
    clearPracticeTimer();
    active.practice.hinted = true;
    trackPractice('hint');
    const step = active.scenario.steps[active.index];
    const target = findTarget(step);
    if (target && step.scroll !== false) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const btn = document.querySelector('#tour-bubble [data-tour="hint"]');
    if (btn) btn.remove();
    practiceMsg(host().texts.practiceHint, 'hint');
    lastRectKey = '';
  }

  function missPractice() {
    const p = active.practice;
    p.misses += 1;
    trackPractice('miss');
    haptic('error');
    const bubble = document.getElementById('tour-bubble');
    if (bubble) bubble.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 });
    if (p.hinted) { practiceMsg(host().texts.practiceHint, 'miss'); return; }
    practiceMsg(p.misses === 1 ? host().texts.practiceMiss : host().texts.practiceMissAgain, 'miss');
    if (p.misses >= PRACTICE_MISSES_TO_HINT) showPracticeHint();
  }

  function solvePractice(step) {
    active.practice.solved = true;
    clearPracticeTimer();
    haptic('success');
    renderBubble(step, { title: step.foundTitle || '✅ Верно!', text: step.found || '', showNext: true, typing: true });
    lastRectKey = '';
  }

  /** `advance: { until }` — дальше, как только условие выполнилось. */
  async function waitUntil(step, token) {
    while (token === stepToken && active) {
      let done = false;
      try { done = !!step.advance.until(); } catch (e) { done = false; }
      if (done) { await wait(250); if (token === stepToken) goNext(); return; }
      await wait(300);
    }
  }

  /**
   * Куда вернуться после перезапуска окна: ближайший раньше шаг «нажми»
   * (он заново откроет вкладку/окно; уже открытое пропустит skipIf). Каждый
   * следующий откат — только ниже предыдущего, чтобы не ходить по кругу.
   */
  function resumeFallbackIndex() {
    const steps = active.scenario.steps;
    const ceil = Math.min(active.index, active.fallbackCeil);
    for (let k = ceil - 1; k >= 0; k--) {
      if (steps[k].advance === 'click') { active.fallbackCeil = k; return k; }
    }
    if (ceil > 0) { active.fallbackCeil = 0; return 0; }
    return null;
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
      showSaveToast(true, host().texts.blockedSlider);
    }
  }, { capture: true, passive: false }));

  // Нажатие на подсвеченное (advance: 'click') и запреты учебного режима.
  document.addEventListener('click', (e) => {
    if (!active) return;
    const step = active.scenario.steps[active.index];
    // «Найдите сами»: нажатие только проверяется — ни цель, ни остальное не
    // открывается (кроме самой подсказки, окна «Выйти?» и тоста).
    if (step && step.practice && active.practice) {
      if (e.target.closest && e.target.closest('#tour-layer, #shared-confirm-modal, #save-toast')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (active.practice.solved) { pulseBubble(); return; }
      const target = findTarget(step);
      const hit = !!target && (step.accept ? !!step.accept(e.target, target) : target.contains(e.target));
      if (hit) solvePractice(step); else missPractice();
      return;
    }
    if (isBlocked(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showSaveToast(true, host().texts.blocked);
      return;
    }
    if (!step) return;
    // Шаг-пояснение: подсвеченное только показываем. Иначе нажатие открывает
    // окно, которое под затемнением нечем закрыть (отзыв VASY №11).
    if ((step.advance || 'next') === 'next' && step.target && !step.free && !step.allowClick) {
      const shown = findTarget(step);
      if (shown && shown.contains(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pulseBubble();
        showSaveToast(true, host().texts.explainOnly);
      }
      return;
    }
    if (step.advance !== 'click') return;
    const target = findTarget(step);
    if (target && target.contains(e.target)) {
      const token = stepToken;
      // Даём обработчику самого экрана отработать (переход, раскрытие), потом — дальше.
      setTimeout(() => { if (token === stepToken) goNext(); }, 60);
    }
  }, true);

  /**
   * Учебный пример (_training-sandbox.js): на время урока экраны показывают
   * учебных клиенток и заказы вместо настоящих. Экран, открытый в момент
   * старта, перерисовывается — иначе на нём остались бы настоящие данные.
   * `sandbox: false` у сценария — урок на настоящих данных.
   */
  function enterSandbox(scenario) {
    if (scenario.sandbox === false || !window.TrainingSandbox) return;
    window.TrainingSandbox.activate();
    // Урок запущен с экрана, которого нет в учебном примере (например, «Здесь
    // есть урок» на НАСТОЯЩЕЙ коллективке): там остались бы настоящие данные под
    // плашкой «Учебный пример», и урок не находил бы свои шаги (отзыв VASY
    // 10.10.2026). Такой урок начинается со своего экрана — `startRoute`.
    if (scenario.startRoute && scenario.startScreens && !scenario.startScreens.includes(currentScreen()) && typeof navigateTo === 'function') {
      navigateTo(scenario.startRoute);
      return;
    }
    if (currentScreen() !== host().home) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function teardown() {
    stopLoop();
    stopTyping();
    clearPracticeTimer();
    if (window.TrainingSandbox) window.TrainingSandbox.deactivate();
    stepToken++;
    if (layer) { layer.remove(); layer = null; }
    writeState(null);
  }

  async function finish() {
    const scenario = active.scenario;
    const total = scenario.steps.length;
    active = null;
    teardown();
    if (scenario.onComplete) { try { scenario.onComplete(); } catch (e) { /* не мешаем отзыву */ } }
    // Ждём, пока сервер запишет «пройдено» (не дольше 4 с): иначе «Обучение»
    // рисуется со старыми результатами и достижениями до следующего входа
    // (отзыв VASY 05.10).
    let result = null;
    const saved = Promise.resolve().then(() => host().record(scenario.id, 'complete', total, total)).then((r) => { result = r; }).catch(() => {});
    await Promise.race([saved, wait(4000)]);
    backToTraining(true);
    host().after(scenario, result);
  }

  async function exit() {
    if (!active) return;
    const sure = await showConfirmModal(host().texts.exit, { confirmLabel: 'Выйти', cancelLabel: 'Продолжить' });
    if (!sure || !active) return;
    track('abandon', active.index + 1);
    const scenario = active.scenario;
    active = null;
    teardown();
    if (scenario.onExit) { try { scenario.onExit(); } catch (e) { /* ничего */ } }
    backToTraining();
  }

  /** Вышел или прошёл — назад в «Обучение», а не на экран, где остановился (отзыв VASY №13). */
  function backToTraining(refresh) {
    if (currentScreen() !== host().home && typeof navigateTo === 'function') navigateTo(host().home);
    // Урок закончился на самом «Обучении» (сводка, помощник) — перерисовать результаты.
    else if (refresh) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  /** Запуск сценария по id (из «Обучения» или «Помощи»). */
  function start(scenarioId) {
    const scenario = scenarios()[scenarioId];
    if (!scenario) { showSaveToast(false, 'Этот сценарий ещё готовится.'); return; }
    if (active) teardown();
    skippedGroups = new Set();
    active = { scenario, index: 0, history: [], seen: new Set() };
    enterSandbox(scenario);
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
    const index = Math.min(state.index || 0, scenario.steps.length - 1);
    active = { scenario, index, history: [], seen: new Set(), resumed: true, fallbackCeil: index };
    enterSandbox(scenario);
    showStep();
  }

  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  const daysWord = (n) => {
    const m10 = n % 10; const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} день`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} дня`;
    return `${n} дней`;
  };

  /**
   * Экран перемотки (06.10.2026, VASY: «момент прокрутки времени можно как-то
   * обозначить, чтоб был лучше понятен переход»): «⏩ Прошло N дней» со
   * счётчиком дней, событие и что изменилось (было → стало). Дальше — только
   * по нажатию «Смотреть», сам не уходит.
   */
  function showTimeSkip(skip) {
    return new Promise((resolve) => {
      if (!document.getElementById('time-skip-style')) {
        const st = document.createElement('style');
        st.id = 'time-skip-style';
        st.textContent = '@keyframes tsSpin{to{transform:rotate(360deg)}}@keyframes tsIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
          + '#time-skip [data-ts-row]{opacity:0;animation:tsIn .35s ease-out forwards}'
          + '@media (prefers-reduced-motion:reduce){#time-skip *{animation:none!important;opacity:1!important}}';
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.id = 'time-skip';
      el.className = 'fixed inset-0 z-[96] flex items-center justify-center px-5';
      el.style.background = 'rgba(30,27,75,.72)';
      el.innerHTML = `<div class="w-full max-w-sm rounded-3xl p-5 text-white shadow-2xl" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#ec4899 100%)">
        <div class="flex items-center gap-3">
          <div class="text-4xl leading-none" style="animation:tsSpin 1.2s ease-in-out 1">⏩</div>
          <div>
            <div class="text-[12px] uppercase tracking-wide opacity-80">Перемотка времени</div>
            <div class="text-[22px] font-bold leading-tight">Прошло <span data-ts-days>0 дней</span></div>
          </div>
        </div>
        <div class="mt-3 text-[15px] font-semibold leading-snug" data-ts-row style="animation-delay:.5s">${esc(skip.event)}</div>
        <div class="mt-3 bg-white/95 rounded-2xl p-3 text-gray-800 space-y-2">
          ${skip.changes.map((c, i) => `<div data-ts-row style="animation-delay:${0.8 + i * 0.25}s">
            <div class="text-[11px] text-gray-500">${esc(c[0])}</div>
            <div class="text-[13px] leading-snug"><span class="text-gray-400 line-through">${esc(c[1])}</span> → <b class="text-indigo-700">${esc(c[2])}</b></div>
          </div>`).join('')}
        </div>
        <button type="button" data-ts-go class="mt-4 w-full py-2.5 rounded-xl bg-white text-indigo-700 text-[15px] font-semibold" data-ts-row style="animation-delay:${0.9 + skip.changes.length * 0.25}s">Смотреть, что изменилось ▶</button>
      </div>`;
      document.body.appendChild(el);
      // Счётчик дней: 0 → N за ~0,8 с.
      const daysEl = el.querySelector('[data-ts-days]');
      let d = 0;
      const timer = setInterval(() => {
        d = Math.min(skip.days, d + 1);
        daysEl.textContent = daysWord(d);
        if (d >= skip.days) clearInterval(timer);
      }, Math.max(60, Math.round(800 / skip.days)));
      el.querySelector('[data-ts-go]').onclick = () => { clearInterval(timer); el.remove(); resolve(); };
    });
  }

  window.Tour = {
    start,
    resume,
    isActive: () => !!active,
    activeId: () => (active ? active.scenario.id : ''),
    currentScreen,
    // «⏩ Прошло N дней» (уроки клиентов «Мой заказ», кабинет «Собрать на СДЭК заранее»)
    showTimeSkip,
    // для тестов
    _layout: layout
  };
})();
