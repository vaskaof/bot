'use strict';

/**
 * Обучение клиентов (план Б, 05.10.2026; VASY: «обучение — на видном месте,
 * замотивировать на прохождение; упор на понятность и геймификацию»).
 *
 * - Уроки идут на общем движке tour.js (как у менеджеров) поверх настоящих
 *   экранов, на учебном примере (training-sandbox.js); шаги —
 *   tour-scenarios.js. window.TourHost — клиентская часть движка: события
 *   recordMyLessonEvent, возврат в «Обучение», праздник после урока.
 * - Квест «Первые шаги» сверху «Новостей» (пока курс не пройден и не скрыт),
 *   после двух уроков — тонкая строка.
 * - Приглашение новичку — один раз, после «Что нового», не поверх окон.
 * - Строка «Урок на минуту про этот экран» — по одному разу на экран.
 * - Экран #/training — уроки, награды за прогресс, достижения.
 * Хуки зовёт роутер: ClientTraining.onScreen(screen) после каждого экрана.
 */
(function () {
  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  let data = null;
  let loading = null;

  // Какие уроки открывают достижение полки «Обучение» (зеркало server achievementsCatalog).
  const ACH_LESSONS = {
    lesson_first: ['where'],
    lesson_orders: ['my-order', 'paid', 'order-question'],
    lesson_dolls: ['my-dolls', 'shelf'],
    lesson_owls: ['contests'],
    lesson_all: null
  };

  function load(force) {
    if (!force && loading) return loading;
    loading = callServer('getMyLessons').then((d) => { data = d; return d; }).catch((e) => { loading = null; throw e; });
    return loading;
  }
  function invalidate() { loading = null; }
  const cached = () => data;
  const plural = (n, a, b, c) => (window.ClientAchievements ? ClientAchievements.plural(n, a, b, c) : c);

  function lessonById(id) { return data ? data.lessons.find((l) => l.id === id) : null; }

  function lessonForAchievement(code) {
    if (!data) return null;
    const ids = ACH_LESSONS[code] || data.lessons.filter((l) => l.available).map((l) => l.id);
    return ids.map(lessonById).find((l) => l && l.available && l.status !== 'done') || null;
  }

  /** Урок начинается со своего экрана: сначала туда, потом шаги. */
  function startLesson(id) {
    const sc = window.TourScenarios && TourScenarios[id];
    if (!sc || !window.Tour) { showSaveToast(false, 'Этот урок ещё готовится.'); return; }
    if (Tour.isActive()) return;
    document.querySelectorAll('#training-offer-sheet, #achievement-sheet').forEach((el) => el.remove());
    // Тост наверху («Урок пройден…») закрывал бы первую подсказку нового урока.
    const toast = document.getElementById('save-toast');
    if (toast) toast.classList.add('hidden');
    const route = typeof sc.startRoute === 'function' ? sc.startRoute() : sc.startRoute;
    // Учебный пример — до перехода: экран урока (учебный заказ TRN…) сразу читает учебные данные.
    if (sc.sandbox !== false && window.TrainingSandbox) window.TrainingSandbox.activate();
    if (route && window.location.hash !== `#/${route}`) navigateTo(route);
    setTimeout(() => Tour.start(id), route ? 350 : 0);
  }

  // --- Движок: клиентская часть ---
  window.TourHost = {
    home: 'training',
    record: (id, event, step, total) => callServer('recordMyLessonEvent', id, event, step, total),
    after: (scenario, result) => {
      invalidate();
      const closed = window.ClientAchievements ? ClientAchievements.celebrate(result, scenario) : null;
      // Сначала праздник, потом отзыв (поверх праздника — не успеют порадоваться).
      Promise.resolve(closed).then(() => askFeedback(scenario)).catch(() => {});
    },
    texts: {
      press: '👆 Нажмите на подсвеченное.',
      retry: ' Попробуйте ещё раз.',
      explainOnly: 'Это пояснение — нажмите «Далее» в подсказке.',
      blocked: 'В уроке это не нажимаем — это учебный пример.',
      blockedSlider: 'В уроке это не меняем — это учебный пример.',
      notFound: 'Не вижу нужное место на экране — возможно, он ещё грузится. Можно нажать «Далее».',
      exit: 'Выйти из урока? Пройти его заново можно в любой момент — «Профиль» → «Обучение».',
      practiceMiss: 'Не здесь — попробуйте ещё 🙂',
      practiceMissAgain: 'Снова не здесь. Можно нажать «Подсказать».',
      practiceHint: '👆 Вот здесь — нажмите на подсвеченное.'
    },
    // Промахи и подсказки в «Найдите сами» — в сводку VASY (где теряются).
    practiceEvents: true
  };

  // --- Отзыв после урока (05.10.2026, VASY: «нет обратной связи после урока») ---
  // Смайлик сохраняется сразу по нажатию — одного нажатия достаточно. После
  // 😕/😐 — «Что было не так?»: кнопки-причины и сразу поле для своих слов;
  // после 😍 — «Чего ещё не хватает?», только поле. Спрашиваем один раз на
  // урок: оценённый (rated с сервера) или пропущенный на этом устройстве — нет.

  const FEEDBACK_RATES = [
    { v: 1, emoji: '😕', label: 'Сложно' },
    { v: 2, emoji: '😐', label: 'Так себе' },
    { v: 3, emoji: '😍', label: 'Понятно' }
  ];
  const FEEDBACK_REASONS = [
    { code: 'fast', label: 'Слишком быстро' },
    { code: 'lost', label: 'Непонятно, куда нажимать' },
    { code: 'long', label: 'Слишком длинно' },
    { code: 'unclear', label: 'Непонятный текст' }
  ];
  const SKIP_KEY = 'knopkaLessonFeedbackSkipped';

  function skippedFeedback() {
    try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]'); } catch (e) { return []; }
  }
  function rememberSkip(id) {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify([...new Set([...skippedFeedback(), id])])); } catch (e) { /* спросим ещё раз — не страшно */ }
  }

  async function askFeedback(scenario) {
    if (window.__E2E_SKIP_LESSON_FEEDBACK || document.getElementById('lesson-feedback-sheet')) return;
    if (skippedFeedback().includes(scenario.id)) return;
    let d;
    try { d = await load(); } catch (e) { return; }
    const lesson = d.lessons.find((l) => l.id === scenario.id);
    if (!lesson || lesson.rated || (window.Tour && Tour.isActive())) return;

    const state = { rating: 0, reasons: new Set() };
    let saved = null; // последняя отправка смайлика — «Готово» дожидается её
    const el = document.createElement('div');
    el.id = 'lesson-feedback-sheet';
    el.className = 'fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[80]';
    el.innerHTML = `<div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <div class="flex items-start justify-between gap-2">
        <div class="text-[16px] font-bold text-gray-900">Как вам урок «${esc(lesson.title)}»?</div>
        <button type="button" data-close title="Закрыть" class="shrink-0 p-1 -mt-1 -mr-1 text-gray-300"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="text-[12.5px] text-gray-500 mt-0.5">Ответ видит только магазин — так уроки станут понятнее.</div>
      <div class="grid grid-cols-3 gap-2 mt-4">${FEEDBACK_RATES.map((r) => `
        <button type="button" data-rate="${r.v}" class="py-3 rounded-2xl border-2 border-gray-100 flex flex-col items-center gap-1 active:scale-95 transition">
          <span class="text-4xl leading-none">${r.emoji}</span><span class="text-[12px] text-gray-600">${r.label}</span>
        </button>`).join('')}
      </div>
      <div data-more class="hidden mt-4">
        <div data-more-title class="text-[14px] font-semibold text-gray-900"></div>
        <div data-reasons class="flex flex-wrap gap-2 mt-2">${FEEDBACK_REASONS.map((r) => `
          <button type="button" data-reason="${r.code}" class="px-3 py-1.5 rounded-full border border-gray-200 text-[13px] text-gray-700">${r.label}</button>`).join('')}
        </div>
        <textarea data-text rows="3" maxlength="1000" class="w-full mt-3 text-sm bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-indigo-400"></textarea>
        <button type="button" data-done class="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Готово</button>
      </div>
      <button type="button" data-skip class="mt-4 w-full text-[13px] text-gray-400">Пропустить</button>
    </div>`;
    document.body.appendChild(el);
    if (window.lucide) window.lucide.createIcons();

    const more = el.querySelector('[data-more]');
    const text = el.querySelector('[data-text]');
    const doneBtn = el.querySelector('[data-done]');
    const close = () => {
      el.remove();
      if (!state.rating) rememberSkip(scenario.id);
    };
    const send = (payload) => callServer('submitMyLessonFeedback', scenario.id, payload);

    el.querySelectorAll('[data-rate]').forEach((btn) => {
      btn.onclick = () => {
        state.rating = Number(btn.dataset.rate);
        el.querySelectorAll('[data-rate]').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('border-indigo-400', on);
          b.classList.toggle('bg-indigo-50', on);
          b.classList.toggle('border-gray-100', !on);
        });
        const good = state.rating === 3;
        el.querySelector('[data-more-title]').textContent = good ? 'Спасибо! 💜 Чего ещё не хватает?' : 'Что было не так?';
        el.querySelector('[data-reasons]').classList.toggle('hidden', good);
        if (good) state.reasons.clear();
        text.placeholder = good ? 'Например: хочу урок про…' : 'Или напишите своими словами';
        more.classList.remove('hidden');
        el.querySelector('[data-skip]').classList.add('hidden');
        // Оценка уходит сразу — даже если дальше просто закроют.
        saved = send({ rating: state.rating, reasons: [...state.reasons], text: text.value }).catch(() => null);
        invalidate();
      };
    });
    el.querySelectorAll('[data-reason]').forEach((btn) => {
      btn.onclick = () => {
        const code = btn.dataset.reason;
        if (state.reasons.has(code)) state.reasons.delete(code); else state.reasons.add(code);
        const on = state.reasons.has(code);
        btn.classList.toggle('bg-indigo-600', on);
        btn.classList.toggle('text-white', on);
        btn.classList.toggle('border-indigo-600', on);
        btn.classList.toggle('text-gray-700', !on);
      };
    });
    doneBtn.onclick = async () => {
      if (doneBtn.disabled) return;
      const comment = text.value.trim();
      if (!state.reasons.size && !comment) { close(); return; }
      doneBtn.disabled = true;
      doneBtn.textContent = 'Отправляю…';
      try {
        await saved;
        await send({ rating: state.rating, reasons: [...state.reasons], text: comment });
        el.remove();
        showSaveToast(true, 'Спасибо за отзыв! 💜');
      } catch (error) {
        doneBtn.disabled = false;
        doneBtn.textContent = 'Готово';
        showSaveToast(false, error.message);
      }
    };
    el.querySelector('[data-close]').onclick = close;
    el.querySelector('[data-skip]').onclick = close;
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
  }

  // --- Квест на «Новостях» ---

  function nextReward(d) {
    return (d.rewards || []).find((r) => !r.done) || null;
  }

  function rewardLine(d) {
    const r = nextReward(d);
    if (!r) return '';
    const left = Math.max(0, r.lessons - d.done);
    return left > 0
      ? `🦉 Ещё ${left} ${plural(left, 'урок', 'урока', 'уроков')} — и +${r.reward} ${plural(r.reward, 'сова', 'совы', 'сов')}`
      : `🦉 +${r.reward} ${plural(r.reward, 'сова', 'совы', 'сов')} — загляните в «Конкурсы»`;
  }

  function questHtml(d) {
    const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
    const next = d.next;
    const reward = rewardLine(d);
    if (d.done >= 2) {
      return `<div id="training-quest" class="mb-4 rounded-2xl bg-white border border-indigo-100 shadow-sm p-3 flex items-center gap-3">
        <div class="shrink-0 w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg">🎓</div>
        <button type="button" data-quest-go class="flex-1 min-w-0 text-left">
          <div class="text-[13px] font-semibold text-gray-900">Обучение · ${d.done} из ${d.total}</div>
          <div class="text-[12px] text-indigo-600 truncate">${next ? `▶ Дальше: ${esc(next.title)} · ${next.minutes} мин` : 'Открыть'}</div>
        </button>
        <button type="button" data-quest-hide title="Скрыть" class="shrink-0 p-1 text-gray-300"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>`;
    }
    return `<div id="training-quest" class="mb-4 rounded-3xl p-4 text-white shadow-sm relative overflow-hidden" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#ec4899 100%)">
      <button type="button" data-quest-hide title="Скрыть" class="absolute top-2.5 right-2.5 p-1 text-white/70"><i data-lucide="x" class="w-4 h-4"></i></button>
      <div class="text-[16px] font-bold pr-6">🎓 Первые шаги в приложении</div>
      <div class="text-[12.5px] opacity-90 mt-0.5">Короткие уроки по минуте — покажем, где заказы, оплата, ваши куклы и совы. За уроки — достижения.</div>
      <div class="flex items-center gap-2 mt-3">
        <div class="flex-1 h-2 rounded-full bg-white/25 overflow-hidden"><div class="h-full rounded-full bg-white" style="width:${Math.max(pct, 4)}%"></div></div>
        <div class="text-[12px] font-semibold">${d.done} из ${d.total}</div>
      </div>
      ${next ? `<button type="button" data-quest-start="${esc(next.id)}" class="mt-3 w-full py-2.5 rounded-xl bg-white text-indigo-700 text-[14px] font-semibold">▶ ${d.done ? 'Дальше' : 'Начать'}: ${esc(next.title)} · ${next.minutes} мин</button>` : ''}
      <div class="flex items-center justify-between mt-2">
        <span class="text-[12px] opacity-90">${esc(reward)}</span>
        <button type="button" data-quest-go class="text-[12px] font-medium underline underline-offset-2 opacity-90">Все уроки</button>
      </div>
    </div>`;
  }

  async function renderQuest(main) {
    let d;
    try { d = await load(); } catch (e) { return; }
    if (!d.showQuest || !main.isConnected || document.getElementById('training-quest')) return;
    const box = document.createElement('div');
    box.innerHTML = questHtml(d);
    const quest = box.firstElementChild;
    main.insertBefore(quest, main.firstChild);
    // Квест заменяет старое приветствие «Добро пожаловать» — две карточки подряд лишние.
    const welcome = document.getElementById('welcome-banner');
    if (welcome) welcome.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
    quest.querySelectorAll('[data-quest-start]').forEach((b) => { b.onclick = () => startLesson(b.dataset.questStart); });
    quest.querySelectorAll('[data-quest-go]').forEach((b) => { b.onclick = () => navigateTo('training'); });
    quest.querySelector('[data-quest-hide]').onclick = async () => {
      quest.remove();
      showSaveToast(true, 'Скрыли. Обучение всегда в «Профиле» → «Обучение»');
      try { await callServer('setMyLessonPrefs', { questHidden: true }); invalidate(); } catch (e) { /* покажется ещё раз — не страшно */ }
    };
  }

  // --- Приглашение на экране ---

  async function renderInvite(screen, main) {
    let d;
    try { d = await load(); } catch (e) { return; }
    if (d.showOffer || !main.isConnected || document.getElementById('training-invite')) return;
    const inv = (d.invites || []).find((i) => i.screen === screen);
    const lesson = inv && lessonById(inv.lessonId);
    if (!lesson) return;
    const el = document.createElement('div');
    el.id = 'training-invite';
    el.className = 'mb-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center gap-3';
    el.innerHTML = `<span class="text-xl shrink-0">${esc(lesson.emoji)}</span>
      <div class="flex-1 min-w-0 text-[13px] text-indigo-900">Урок на ${lesson.minutes} мин про этот экран: <b>${esc(lesson.title)}</b></div>
      <button type="button" data-invite-start class="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium">Пройти</button>
      <button type="button" data-invite-close class="shrink-0 p-1 text-indigo-300" title="Не сейчас"><i data-lucide="x" class="w-4 h-4"></i></button>`;
    main.insertBefore(el, main.firstChild);
    if (window.lucide) window.lucide.createIcons();
    el.querySelector('[data-invite-start]').onclick = () => { el.remove(); startLesson(lesson.id); };
    el.querySelector('[data-invite-close]').onclick = () => el.remove();
    // Показали — больше на этом экране не предлагаем (урок остаётся в «Обучении»).
    d.invites = d.invites.filter((i) => i.screen !== screen);
    callServer('setMyLessonPrefs', { inviteSeen: screen }).catch(() => { /* покажется ещё раз — не страшно */ });
  }

  /** Роутер: после каждого экрана. Во время урока ничего не добавляем. */
  function onScreen(screen) {
    if (window.__E2E_SKIP_TRAINING_HINTS || (window.Tour && Tour.isActive())) return;
    const main = document.querySelector('#screen-root main');
    if (!main) return;
    if (screen === 'news') renderQuest(main);
    else renderInvite(screen, main);
  }

  // --- Приглашение новичку ---

  async function offer() {
    if (window.__E2E_SKIP_TRAINING_OFFER) return;
    let d;
    try { d = await load(); } catch (e) { return; }
    if (!d.showOffer || (window.Tour && Tour.isActive())) return;
    if (Array.from(document.querySelectorAll('.fixed.inset-0')).some((el) => !el.classList.contains('hidden') && el.getClientRects().length)) return;
    const first = d.next;
    const reward = (d.rewards || [])[0];
    const el = document.createElement('div');
    el.id = 'training-offer-sheet';
    el.className = 'fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[70]';
    el.innerHTML = `<div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center">
      <div class="text-5xl">👋</div>
      <div class="text-lg font-bold text-gray-900 mt-2">Добро пожаловать!</div>
      <div class="text-[14px] text-gray-600 mt-1.5 leading-snug">Покажу за минуту, где что лежит: заказы, оплата, ваши куклы и совы. За уроки — достижения${reward ? ` и совы` : ''} ✨</div>
      <div class="flex gap-2 mt-5">
        <button type="button" data-later class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Потом</button>
        <button type="button" data-show class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Показать</button>
      </div>
      <div class="text-[11px] text-gray-400 mt-3">Уроки всегда в «Профиле» → «Обучение»</div>
    </div>`;
    document.body.appendChild(el);
    const answer = (value) => { callServer('setMyLessonPrefs', { offerAnswer: value }).catch(() => {}); d.showOffer = false; el.remove(); };
    el.querySelector('[data-later]').onclick = () => answer('later');
    el.querySelector('[data-show]').onclick = () => { answer('show'); if (first) startLesson(first.id); };
  }

  // --- Карточка в «Профиле» ---

  function profileCardHtml(d) {
    const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
    return `<button type="button" id="profile-training-card" class="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex items-center gap-3">
      <div class="shrink-0 w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center text-xl">🎓</div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-gray-900">Обучение</div>
        <div class="text-[12px] text-gray-500">${d.done === d.total ? 'Все уроки пройдены 🎉' : (d.next ? `Дальше: ${esc(d.next.title)}` : '')}</div>
        <div class="flex items-center gap-2 mt-1.5"><div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full bg-indigo-500" style="width:${pct}%"></div></div><span class="text-[11px] text-gray-400">${d.done} из ${d.total}</span></div>
      </div>
      <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
    </button>`;
  }

  // --- Экран «Обучение» ---

  window.Screens = window.Screens || {};
  window.Screens.training = {
    render(root) {
      document.getElementById('header-left').innerHTML = `
        <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50"><i data-lucide="arrow-left" class="w-6 h-6"></i></button>
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Обучение</h1>`;
      document.getElementById('header-actions').innerHTML = '';
      document.getElementById('back-btn').onclick = () => navigateTo('profile');
      root.innerHTML = `<main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto"><div id="training-root"><div class="p-6 text-center text-sm text-gray-400">Загрузка...</div></div></main>`;
      load(true).then(draw).catch((e) => {
        const box = document.getElementById('training-root');
        if (box) box.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${esc(e.message)}</div>`;
      });

      function draw(d) {
        const box = document.getElementById('training-root');
        if (!box) return;
        const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
        const status = (l) => (l.status === 'done'
          ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">✓ Пройден</span>'
          : (l.status === 'started' ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Начат</span>'
            : (l.status === 'soon' ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Скоро</span>' : '')));
        box.innerHTML = `
          <div class="rounded-3xl p-5 mb-4 text-white shadow-sm" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#ec4899 100%)">
            <div class="text-[17px] font-bold">${d.done === d.total ? 'Курс пройден! 🎓' : '🎓 Как пользоваться приложением'}</div>
            <div class="text-[12.5px] opacity-90 mt-0.5">Уроки по минуте на учебном примере — ничего не отправится и не сломается.</div>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-2 rounded-full bg-white/25 overflow-hidden"><div class="h-full rounded-full bg-white" style="width:${Math.max(pct, 4)}%"></div></div>
              <div class="text-[12px] font-semibold">${d.done} из ${d.total}</div>
            </div>
          </div>
          ${(d.rewards || []).length ? `<div class="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 mb-4">
            <div class="text-sm font-semibold text-gray-900 mb-2">🦉 Награды за прогресс</div>
            ${d.rewards.map((r) => `<div class="flex items-center justify-between py-1.5 text-[13px] ${r.done ? 'text-emerald-700' : 'text-gray-700'}">
              <span>${r.done ? '✓' : '○'} ${r.lessons === d.total ? 'Весь курс' : `${r.lessons} ${plural(r.lessons, 'урок', 'урока', 'уроков')}`}</span>
              <span class="font-semibold">+${r.reward} ${plural(r.reward, 'сова', 'совы', 'сов')}</span>
            </div>`).join('')}
          </div>` : ''}
          <div class="space-y-2.5">${d.lessons.map((l, i) => `
            <button type="button" data-lesson="${esc(l.id)}" ${l.available ? '' : 'disabled'} class="w-full text-left bg-white rounded-2xl border ${l.status === 'done' ? 'border-emerald-100' : 'border-gray-100'} shadow-sm p-3.5 flex items-center gap-3 ${l.available ? 'active:scale-[0.99]' : 'opacity-60'}">
              <div class="shrink-0 w-11 h-11 rounded-full ${l.status === 'done' ? 'bg-emerald-50' : 'bg-indigo-50'} flex items-center justify-center text-xl">${esc(l.emoji)}</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2"><span class="text-[14px] font-semibold text-gray-900">${i + 1}. ${esc(l.title)}</span>${status(l)}</div>
                <div class="text-[12px] text-gray-500 mt-0.5 leading-snug">${esc(l.summary)} · ${l.minutes} мин</div>
              </div>
              <i data-lucide="${l.status === 'done' ? 'rotate-ccw' : 'play'}" class="w-4 h-4 text-indigo-400 shrink-0"></i>
            </button>`).join('')}
          </div>
          <button type="button" id="training-achievements-btn" class="mt-4 w-full py-3 rounded-2xl bg-white border border-indigo-100 text-indigo-600 text-sm font-medium shadow-sm">🏆 Мои достижения</button>`;
        if (window.lucide) window.lucide.createIcons();
        box.querySelectorAll('[data-lesson]').forEach((b) => { b.onclick = () => startLesson(b.dataset.lesson); });
        document.getElementById('training-achievements-btn').onclick = () => navigateTo('achievements');
      }
    }
  };

  window.ClientTraining = { load, invalidate, cached, startLesson, lessonForAchievement, onScreen, offer, profileCardHtml };
})();
