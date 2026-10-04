'use strict';

/**
 * Обучение менеджеров, этап 1 (04.10.2026) — всё, что вокруг сценариев:
 * - кнопка «Помощь» в шапке (`#header-help-btn`, живёт в шелле app.html, есть
 *   на любом экране) → лист: сценарии про текущий экран, весь курс,
 *   «💡 Неудобно / идея»;
 * - отзыв после сценария: «Понятно?» / «Легко?» (😕🙂😃) + «Как бы ты
 *   переделал(а)?» — каждый отзыв сразу уходит VASY в Telegram;
 * - праздник новых достижений;
 * - «🆘 Сообщить о проблеме» (этап 2) — из «Помощи» и с тоста ошибки (_error-hints.js).
 * Сервер — `server/src/training/trainingService.js`.
 */
(function () {
  const SCORES = [{ v: 1, e: '😕' }, { v: 2, e: '🙂' }, { v: 3, e: '😃' }];

  function screenTitle() {
    const h1 = document.querySelector('#header-left h1');
    return (h1 && h1.textContent.trim()) || Tour.currentScreen();
  }

  function overlay(id, innerHtml) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'fixed inset-0 bg-black/40 hidden items-end sm:items-center justify-center z-[92]';
      document.body.appendChild(el);
    }
    el.innerHTML = innerHtml;
    el.classList.remove('hidden');
    el.classList.add('flex');
    const close = () => { el.classList.add('hidden'); el.classList.remove('flex'); };
    el.onclick = (e) => { if (e.target === el) close(); };
    return { el, close };
  }

  // --- «Помощь» ---

  function openHelp() {
    if (Tour.isActive()) return;
    const screen = Tour.currentScreen();
    const all = Object.values(window.TourScenarios || {});
    const here = all.filter((s) => (s.screens || []).includes(screen));
    const row = (s) => `
      <button type="button" data-start="${s.id}" class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 text-left active:bg-gray-50">
        <span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="play" class="w-4 h-4"></i></span>
        <span class="text-sm text-gray-800">${escapeHtmlClient(s.title)}</span>
      </button>`;
    const { el, close } = overlay('training-help-sheet', `
      <div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <div class="text-base font-semibold text-gray-900">Помощь</div>
          <button type="button" data-close class="p-1 text-gray-400"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        ${here.length ? `<div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Как это сделать — на этом экране</div>
          <div class="space-y-2 mb-4">${here.map(row).join('')}</div>` : ''}
        <button type="button" data-idea class="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-left mb-2">
          <span class="text-xl">💡</span>
          <span class="min-w-0"><span class="block text-sm font-medium text-amber-900">Неудобно / идея</span>
          <span class="block text-[11px] text-amber-800">Что мешает или как сделать удобнее — уйдёт VASY</span></span>
        </button>
        <button type="button" data-problem class="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-left mb-2">
          <span class="text-xl">🆘</span>
          <span class="min-w-0"><span class="block text-sm font-medium text-red-900">Что-то не работает</span>
          <span class="block text-[11px] text-red-800">Ошибка или странное поведение — уйдёт VASY вместе с экраном</span></span>
        </button>
        <button type="button" data-course class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 text-left">
          <span class="text-xl">🎓</span>
          <span class="min-w-0"><span class="block text-sm font-medium text-gray-900">Всё обучение</span>
          <span class="block text-[11px] text-gray-500">Курс, прогресс и достижения</span></span>
        </button>
      </div>`);
    el.querySelector('[data-close]').onclick = close;
    el.querySelectorAll('[data-start]').forEach((b) => { b.onclick = () => { close(); Tour.start(b.dataset.start); }; });
    el.querySelector('[data-idea]').onclick = () => { close(); openIdea(); };
    el.querySelector('[data-problem]').onclick = () => { close(); openProblem({}); };
    el.querySelector('[data-course]').onclick = () => { close(); navigateTo('training'); };
    if (window.lucide) window.lucide.createIcons();
  }

  function openIdea(screenOverride) {
    const screen = screenOverride || screenTitle();
    const { el, close } = overlay('training-idea-modal', `
      <div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4">
        <div class="text-base font-semibold text-gray-900">💡 Неудобно / идея</div>
        <div class="text-[12px] text-gray-500 mt-0.5">Экран: ${escapeHtmlClient(screen)}</div>
        <textarea id="training-idea-text" rows="5" maxlength="2000" class="mt-3 w-full text-sm bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-indigo-400"
          placeholder="Что неудобно, где путаешься или как сделать лучше. Можно коротко."></textarea>
        <div class="flex gap-2 mt-3">
          <button type="button" data-cancel class="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Отмена</button>
          <button type="button" data-send class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
        </div>
      </div>`);
    const text = el.querySelector('#training-idea-text');
    const sendBtn = el.querySelector('[data-send]');
    el.querySelector('[data-cancel]').onclick = close;
    sendBtn.onclick = async () => {
      if (sendBtn.disabled) return;
      if (!text.value.trim()) { text.focus(); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Отправляю…';
      try {
        await callServer('submitStaffFeedback', { kind: 'idea', screen, text: text.value.trim() });
        close();
        showSaveToast(true, 'Спасибо! Ушло VASY. Статус идеи — в «Обучении».');
        checkNewBadges();
      } catch (error) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить';
        showSaveToast(false, error.message);
      }
    };
    setTimeout(() => text.focus(), 50);
  }

  // --- «Сообщить о проблеме» (этап 2, 04.10.2026) ---

  /**
   * Что знает код о моменте проблемы: экран, его параметры (заказ/корзина),
   * версия приложения. Последние действия добавляет сервер.
   */
  function problemContext(extra) {
    const route = typeof matchRoute === 'function' ? matchRoute(window.location.hash) : { screen: '', params: {} };
    const params = route.params || {};
    const script = document.querySelector('script[src*="router.js"]');
    const version = script ? (script.getAttribute('src').match(/[?&]v=(\d+)/) || [])[1] : '';
    return {
      route: route.screen, screenTitle: screenTitle(), params,
      orderId: params.orderId || '', cartId: params.cartId || '', collectiveId: params.collectiveId || '',
      appVersion: version || '', viewport: `${window.innerWidth}x${window.innerHeight}`,
      error: extra.error || '', method: extra.method || '', origin: extra.origin || ''
    };
  }

  /**
   * @param {{error?:string, method?:string, origin?:'server'|'form'}} info С тоста ошибки — её текст;
   *   из «Помощи» — пусто, тогда нужно описать словами.
   */
  function openProblem(info) {
    const context = problemContext(info || {});
    const screen = context.screenTitle;
    const { el, close } = overlay('training-problem-modal', `
      <div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4">
        <div class="text-base font-semibold text-gray-900">🆘 Сообщить о проблеме</div>
        <div class="text-[12px] text-gray-500 mt-0.5">Экран: ${escapeHtmlClient(screen)}</div>
        ${context.error ? `<div class="mt-2 text-[12px] bg-red-50 border border-red-100 text-red-700 rounded-lg p-2 break-words">${escapeHtmlClient(context.error)}</div>` : ''}
        <textarea id="training-problem-text" rows="4" maxlength="2000" class="mt-3 w-full text-sm bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-indigo-400"
          placeholder="${context.error ? 'Что вы делали? Одной фразой — необязательно.' : 'Что не работает? Одной фразой.'}"></textarea>
        <div class="text-[11px] text-gray-400 mt-1">Вместе с сообщением уйдут экран, текст ошибки и ваши последние действия в приложении — чтобы не переспрашивать.</div>
        <div class="flex gap-2 mt-3">
          <button type="button" data-cancel class="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Отмена</button>
          <button type="button" data-send class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
        </div>
      </div>`);
    const text = el.querySelector('#training-problem-text');
    const sendBtn = el.querySelector('[data-send]');
    el.querySelector('[data-cancel]').onclick = close;
    sendBtn.onclick = async () => {
      if (sendBtn.disabled) return;
      if (!context.error && !text.value.trim()) { text.focus(); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Отправляю…';
      try {
        await callServer('submitStaffFeedback', { kind: 'problem', screen, text: text.value.trim(), context });
        close();
        showSaveToast(true, 'Спасибо! Ушло VASY. Что с этим сделали — в «Обучении».');
      } catch (error) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить';
        showSaveToast(false, error.message);
      }
    };
    if (!context.error) setTimeout(() => text.focus(), 50);
  }

  // --- Отзыв после сценария ---

  function scoreRow(name, label) {
    return `
      <div class="mt-3">
        <div class="text-sm text-gray-700 mb-1.5">${label}</div>
        <div class="flex gap-2" data-score="${name}">
          ${SCORES.map((s) => `<button type="button" data-v="${s.v}" class="flex-1 py-2 rounded-xl border border-gray-200 text-2xl">${s.e}</button>`).join('')}
        </div>
      </div>`;
  }

  function afterScenario(scenario) {
    const picked = { clarity: null, ease: null };
    const { el, close } = overlay('training-feedback-modal', `
      <div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4">
        <div class="text-base font-semibold text-gray-900">Готово: «${escapeHtmlClient(scenario.title)}» 🎉</div>
        <div class="text-[12px] text-gray-500 mt-0.5">Три быстрых вопроса — ответы видит только VASY.</div>
        ${scoreRow('clarity', 'Понятно?')}
        ${scoreRow('ease', 'Легко?')}
        <div class="text-sm text-gray-700 mt-3 mb-1.5">Как бы ты переделал(а)? <span class="text-gray-400">(необязательно)</span></div>
        <textarea id="training-feedback-text" rows="3" maxlength="2000" class="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-indigo-400"></textarea>
        <div class="flex gap-2 mt-3">
          <button type="button" data-skip class="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Пропустить</button>
          <button type="button" data-send class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
        </div>
      </div>`);
    el.querySelectorAll('[data-score]').forEach((group) => {
      group.querySelectorAll('[data-v]').forEach((btn) => {
        btn.onclick = () => {
          picked[group.dataset.score] = Number(btn.dataset.v);
          group.querySelectorAll('[data-v]').forEach((b) => {
            const on = b === btn;
            b.classList.toggle('bg-indigo-50', on);
            b.classList.toggle('border-indigo-400', on);
          });
        };
      });
    });
    const done = () => { close(); checkNewBadges(); };
    el.querySelector('[data-skip]').onclick = done;
    const sendBtn = el.querySelector('[data-send]');
    sendBtn.onclick = async () => {
      if (sendBtn.disabled) return;
      const text = el.querySelector('#training-feedback-text').value.trim();
      if (!picked.clarity && !picked.ease && !text) { done(); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Отправляю…';
      try {
        await callServer('submitStaffFeedback', { kind: 'scenario', scenarioId: scenario.id, clarity: picked.clarity, ease: picked.ease, text });
        showSaveToast(true, 'Спасибо за отзыв!');
        done();
      } catch (error) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить';
        showSaveToast(false, error.message);
      }
    };
  }

  // --- Достижения ---

  async function checkNewBadges(preloaded) {
    let training = preloaded;
    try { if (!training) training = await callServer('getMyTraining'); } catch (e) { return null; }
    // Сначала отзыв, потом праздник: открытая форма отзыва сама позовёт
    // проверку значков, когда закроется.
    const feedbackOpen = document.querySelector('#training-feedback-modal.flex');
    if (feedbackOpen) return training;
    const fresh = training.badges.filter((b) => training.newBadges.includes(b.code));
    if (fresh.length) celebrate(fresh, training.level);
    return training;
  }

  function celebrate(badges, level) {
    const { el, close } = overlay('training-badge-modal', `
      <div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 text-center">
        <div class="text-sm font-semibold text-indigo-600 uppercase tracking-wide">${badges.length > 1 ? 'Новые достижения' : 'Новое достижение'}!</div>
        <div class="flex justify-center flex-wrap gap-4 my-4">
          ${badges.map((b) => `<div class="w-24"><div class="text-5xl">${b.emoji}</div><div class="text-sm font-medium text-gray-900 mt-1">${escapeHtmlClient(b.title)}</div></div>`).join('')}
        </div>
        <div class="text-sm text-gray-600">Уровень: <b>${escapeHtmlClient(level.name)}</b> · пройдено ${level.done} из ${level.total}</div>
        <button type="button" data-ok class="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отлично</button>
      </div>`);
    const ok = () => {
      close();
      callServer('markTrainingBadgesSeen', badges.map((b) => b.code)).catch(() => {});
    };
    el.querySelector('[data-ok]').onclick = ok;
    el.onclick = (e) => { if (e.target === el) ok(); };
  }

  /**
   * Баннер на «Главной»: пока есть непройденные доступные сценарии.
   * «Скрыть» — до следующего нового сценария (ключ — их число).
   */
  async function renderHomeBanner(el) {
    if (!el) return;
    let t;
    try { t = await callServer('getMyTraining'); } catch (e) { return; }
    if (!el.isConnected) return;
    const available = t.scenarios.filter((s) => s.available && window.TourScenarios && window.TourScenarios[s.id]);
    const done = available.filter((s) => s.status === 'done').length;
    const hideKey = `knopkaTrainingBannerHidden:${available.length}`;
    let hidden = false;
    try { hidden = localStorage.getItem(hideKey) === '1'; } catch (e) { /* без хранилища — показываем */ }
    if (available.length === 0 || done === available.length || hidden) return;
    const next = available.find((s) => s.status !== 'done');
    el.innerHTML = `
      <div class="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-4 text-white">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-semibold">🎓 Обучение: пройдено ${done} из ${available.length}</div>
            <div class="text-[12px] text-indigo-100 mt-0.5">Дальше: «${escapeHtmlClient(next.title)}» · ~${next.minutes} мин. За каждый сценарий — достижение.</div>
          </div>
          <button type="button" data-hide class="text-[11px] text-indigo-200 shrink-0">Скрыть</button>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" data-go class="flex-1 py-2 rounded-xl bg-white text-indigo-700 text-sm font-medium">Пройти</button>
          <button type="button" data-all class="flex-1 py-2 rounded-xl bg-white/15 text-white text-sm font-medium">Весь курс</button>
        </div>
      </div>`;
    el.classList.remove('hidden');
    el.querySelector('[data-go]').onclick = () => Tour.start(next.id);
    el.querySelector('[data-all]').onclick = () => navigateTo('training');
    el.querySelector('[data-hide]').onclick = () => {
      try { localStorage.setItem(hideKey, '1'); } catch (e) { /* ничего */ }
      el.classList.add('hidden');
    };
    checkNewBadges(t);
  }

  /** Вешается один раз при старте шелла (router.startAdminRouter). */
  function wireHelpButton() {
    const btn = document.getElementById('header-help-btn');
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', openHelp);
    }
  }

  window.TrainingUI = { openHelp, openIdea, openProblem, afterScenario, checkNewBadges, celebrate, wireHelpButton, renderHomeBanner };
})();
