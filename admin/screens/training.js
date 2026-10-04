'use strict';

/**
 * Экран «Обучение» (#/training, обучение менеджеров этап 1, 04.10.2026).
 * Сотрудник: уровень, весь курс (доступные сценарии — «Пройти», остальные —
 * «скоро»), достижения, свои идеи со статусами. Админ дополнительно: «Команда»
 * (прогресс каждого, где бросают сценарии, средние оценки) и «Отзывы»
 * (решение по каждому: в работу / внедрено / не будем).
 * Сервер — `server/src/training/trainingService.js`.
 */
window.Screens = window.Screens || {};

(function () {
  const SCORE_EMOJI = { 1: '😕', 2: '🙂', 3: '😃' };
  const STATUS_CHIP = {
    new: 'bg-gray-100 text-gray-600', accepted: 'bg-sky-50 text-sky-700',
    rejected: 'bg-red-50 text-red-600', done: 'bg-emerald-50 text-emerald-700'
  };
  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  const day = (d) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');
  const avgEmoji = (v) => (v == null ? '—' : `${SCORE_EMOJI[Math.round(v)] || ''} ${v}`);

  function levelCard(t) {
    const pct = Math.round((t.level.done / t.level.total) * 100);
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-[11px] text-gray-500 uppercase tracking-wide">Уровень</div>
            <div class="text-xl font-semibold text-gray-900">${esc(t.level.name)}</div>
          </div>
          <div class="text-right text-sm text-gray-600">${t.level.done} из ${t.level.total}</div>
        </div>
        <div class="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden"><div class="h-full bg-indigo-500 rounded-full" style="width:${pct}%"></div></div>
        ${t.level.next ? `<div class="text-[12px] text-gray-500 mt-2">До «${esc(t.level.next.name)}» — ещё ${t.level.next.at - t.level.done}</div>` : '<div class="text-[12px] text-emerald-700 mt-2">Весь курс пройден 🏆</div>'}
      </div>`;
  }

  function courseList(t) {
    return `
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Курс</div>
      <div class="space-y-2 mb-4">
        ${t.scenarios.map((s, i) => {
          const playable = s.available && window.TourScenarios && window.TourScenarios[s.id];
          const icon = s.status === 'done' ? '✅' : playable ? s.badge.emoji : '🔒';
          const btn = playable
            ? `<button type="button" data-start="${s.id}" class="shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium ${s.status === 'done' ? 'border border-gray-200 text-gray-600' : 'bg-indigo-600 text-white'}">${s.status === 'done' ? 'Ещё раз' : 'Пройти'}</button>`
            : '<span class="shrink-0 text-[11px] text-gray-400">скоро</span>';
          return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-3 ${playable ? '' : 'opacity-60'}" data-scenario-row="${s.id}">
              <div class="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg shrink-0">${icon}</div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-gray-900">${i + 1}. ${esc(s.title)}</div>
                <div class="text-[12px] text-gray-500">${esc(s.summary)} · ~${s.minutes} мин</div>
              </div>
              ${btn}
            </div>`;
        }).join('')}
      </div>`;
  }

  function badgesGrid(t) {
    return `
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Достижения</div>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
        ${t.badges.map((b) => `
          <div class="bg-white rounded-2xl border border-gray-100 p-2 text-center ${b.earned ? '' : 'opacity-40 grayscale'}" title="${esc(b.description)}" data-badge="${esc(b.code)}">
            <div class="text-3xl">${b.emoji}</div>
            <div class="text-[11px] font-medium text-gray-800 leading-tight mt-1">${esc(b.title)}</div>
            ${b.earned ? `<div class="text-[10px] text-gray-400">${day(b.earnedAt)}</div>` : `<div class="text-[10px] text-gray-400 leading-tight">${esc(b.description)}</div>`}
          </div>`).join('')}
      </div>`;
  }

  function ideasBlock(t) {
    return `
      <div class="flex items-center justify-between px-1 mb-2">
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Мои идеи</div>
        <button type="button" id="training-new-idea" class="text-[13px] font-medium text-amber-700">💡 Предложить</button>
      </div>
      ${t.ideas.length ? `<div class="space-y-2 mb-4">${t.ideas.map((i) => `
        <div class="bg-white rounded-2xl border border-gray-100 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-gray-400">${day(i.createdAt)}${i.screen ? ` · ${esc(i.screen)}` : ''}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[i.status]}">${esc(i.statusLabel)}</span>
          </div>
          <div class="text-sm text-gray-800 mt-1 whitespace-pre-wrap">${esc(i.text)}</div>
        </div>`).join('')}</div>`
        : '<div class="text-[12px] text-gray-400 px-1 mb-4">Пока нет. Всё, что мешает в работе, — сюда: за внедрённую идею — достижение 🛠</div>'}`;
  }

  function teamBlock(o) {
    const titleOf = new Map(o.scenarios.map((s) => [s.id, s.title]));
    const chip = (s) => s.status === 'done' ? '✅' : s.status === 'started' ? `⏸ шаг ${s.lastStep}` : '—';
    return `
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Сотрудники</div>
      <div class="space-y-2 mb-4">
        ${o.people.map((p) => `
          <div class="bg-white rounded-2xl border border-gray-100 p-3" data-person>
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium text-gray-900">${esc(p.name)} ${p.role === 'admin' ? '<span class="text-[10px] text-gray-400">админ</span>' : ''}</div>
              <div class="text-[12px] text-gray-500">${esc(p.level)} · ${p.doneCount}/${p.scenarios.length}</div>
            </div>
            <div class="mt-1.5 space-y-0.5">
              ${p.scenarios.map((s) => `<div class="text-[12px] text-gray-600 flex justify-between gap-2"><span class="truncate">${esc(titleOf.get(s.id))}</span><span class="shrink-0">${chip(s)}</span></div>`).join('')}
            </div>
            <div class="text-[11px] text-gray-400 mt-1">${p.lastActivityAt ? `последний шаг ${day(p.lastActivityAt)}` : 'ещё не начинал(а)'}</div>
          </div>`).join('')}
      </div>
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Сценарии</div>
      <div class="space-y-2 mb-4">
        ${o.scenarioStats.map((s) => {
          const steps = Object.entries(s.abandonSteps).sort((a, b) => b[1] - a[1]).map(([step, n]) => `шаг ${step} ×${n}`).join(', ');
          return `
            <div class="bg-white rounded-2xl border border-gray-100 p-3" data-scenario-stat="${s.id}">
              <div class="text-sm font-medium text-gray-900">${esc(s.title)}</div>
              <div class="text-[12px] text-gray-600 mt-1">Начали ${s.starts} · прошли ${s.completes} · бросили ${s.abandons}${steps ? ` (${steps})` : ''}</div>
              <div class="text-[12px] text-gray-600">Понятно ${avgEmoji(s.avgClarity)} · легко ${avgEmoji(s.avgEase)} · оценок ${s.ratings}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function feedbackBlock(o, filter) {
    const list = filter === 'new' ? o.feedback.filter((f) => f.status === 'new') : o.feedback;
    const newCount = o.feedback.filter((f) => f.status === 'new').length;
    return `
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
        <button type="button" data-fb-filter="new" class="flex-1 py-1.5 rounded-lg text-sm font-medium ${filter === 'new' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}">Новые (${newCount})</button>
        <button type="button" data-fb-filter="all" class="flex-1 py-1.5 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}">Все (${o.feedback.length})</button>
      </div>
      ${list.length ? `<div class="space-y-2">${list.map((f) => `
        <div class="bg-white rounded-2xl border border-gray-100 p-3" data-feedback="${f.id}">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] text-gray-500">${f.kind === 'idea' ? '💡 Идея' : '📝 Отзыв'} · ${esc(f.authorName)} · ${day(f.createdAt)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[f.status]}">${esc(f.statusLabel)}</span>
          </div>
          <div class="text-[12px] text-gray-500 mt-0.5">${f.kind === 'idea' ? `Экран: ${esc(f.screen || '—')}` : `«${esc(f.scenarioTitle)}»${f.clarity ? ` · понятно ${SCORE_EMOJI[f.clarity]}` : ''}${f.ease ? ` · легко ${SCORE_EMOJI[f.ease]}` : ''}`}</div>
          ${f.text ? `<div class="text-sm text-gray-800 mt-1 whitespace-pre-wrap">${esc(f.text)}</div>` : ''}
          ${f.adminNote ? `<div class="text-[12px] text-gray-500 mt-1">Ответ: ${esc(f.adminNote)}</div>` : ''}
          <div class="flex gap-1.5 mt-2">
            <button type="button" data-set-status="accepted" class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-sky-700">В работу</button>
            <button type="button" data-set-status="done" class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-emerald-700">Внедрено</button>
            <button type="button" data-set-status="rejected" class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-red-600">Не будем</button>
          </div>
        </div>`).join('')}</div>`
        : '<div class="text-center text-sm text-gray-400 py-8">Нет отзывов</div>'}`;
  }

  window.Screens.training = {
    render(root, _dictionaries, params) {
      document.getElementById('header-left').innerHTML = `
        <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="arrow-left" class="w-6 h-6"></i>
        </button>
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Обучение</h1>`;
      document.getElementById('header-actions').innerHTML = '';
      document.getElementById('back-btn').addEventListener('click', () => navigateBack('more'));

      const isAdmin = window.CURRENT_ACCESS_ROLE === 'admin';
      let tab = isAdmin && params && (params.tab === 'feedback' || params.tab === 'team') ? params.tab : 'me';
      let fbFilter = 'new';
      let overview = null;

      root.innerHTML = `
        <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto">
          ${isAdmin ? `<div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3" id="training-tabs">
            <button type="button" data-tab="me" class="flex-1 py-1.5 rounded-lg text-sm font-medium">Моё</button>
            <button type="button" data-tab="team" class="flex-1 py-1.5 rounded-lg text-sm font-medium">Команда</button>
            <button type="button" data-tab="feedback" class="flex-1 py-1.5 rounded-lg text-sm font-medium">Отзывы</button>
          </div>` : ''}
          <div id="training-body"><div class="text-center text-sm text-gray-400 py-10">Загрузка…</div></div>
        </main>`;
      const body = document.getElementById('training-body');

      function paintTabs() {
        document.querySelectorAll('#training-tabs [data-tab]').forEach((b) => {
          const on = b.dataset.tab === tab;
          b.classList.toggle('bg-white', on);
          b.classList.toggle('shadow-sm', on);
          b.classList.toggle('text-gray-900', on);
          b.classList.toggle('text-gray-500', !on);
        });
      }

      async function loadMe() {
        try {
          const t = await callServer('getMyTraining');
          if (tab !== 'me') return;
          body.innerHTML = levelCard(t) + courseList(t) + badgesGrid(t) + ideasBlock(t);
          body.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => Tour.start(b.dataset.start)));
          document.getElementById('training-new-idea').addEventListener('click', () => TrainingUI.openIdea('Обучение'));
          TrainingUI.checkNewBadges(t);
        } catch (error) {
          body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${esc(error.message)}</div>`;
        }
      }

      async function loadOverview(force) {
        try {
          if (!overview || force) overview = await callServer('getTrainingOverview');
          if (tab === 'team') body.innerHTML = teamBlock(overview);
          if (tab === 'feedback') paintFeedback();
        } catch (error) {
          body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${esc(error.message)}</div>`;
        }
      }

      function paintFeedback() {
        body.innerHTML = feedbackBlock(overview, fbFilter);
        body.querySelectorAll('[data-fb-filter]').forEach((b) => b.addEventListener('click', () => { fbFilter = b.dataset.fbFilter; paintFeedback(); }));
        body.querySelectorAll('[data-feedback]').forEach((card) => {
          card.querySelectorAll('[data-set-status]').forEach((btn) => btn.addEventListener('click', async () => {
            const status = btn.dataset.setStatus;
            let note = null;
            if (status === 'done' || status === 'rejected') {
              note = await showPromptModal(status === 'done' ? 'Что сделали? (необязательно — увидит автор)' : 'Почему не будем? (необязательно)', { confirmLabel: 'Сохранить' });
              if (note === null) return;
            }
            card.querySelectorAll('[data-set-status]').forEach((b) => { b.disabled = true; });
            try {
              const updated = await callServer('setStaffFeedbackStatus', Number(card.dataset.feedback), status, note);
              const item = overview.feedback.find((f) => f.id === updated.id);
              Object.assign(item, { status: updated.status, statusLabel: updated.statusLabel, adminNote: updated.adminNote });
              showSaveToast(true, status === 'done' ? 'Отмечено «внедрено» — автору ушло сообщение.' : 'Сохранено.');
              paintFeedback();
            } catch (error) {
              card.querySelectorAll('[data-set-status]').forEach((b) => { b.disabled = false; });
              showSaveToast(false, error.message);
            }
          }));
        });
      }

      function show() {
        paintTabs();
        body.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Загрузка…</div>';
        if (tab === 'me') loadMe(); else loadOverview(false);
      }

      document.querySelectorAll('#training-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; show(); }));
      show();
      if (isAdmin) {
      // Свайп между вкладками на телефоне (05.10.2026) — screens/_swipe-tabs.js.
      SwipeTabs.attach({
        area: root.querySelector('main'),
        keys: () => ['me', 'team', 'feedback'],
        getActive: () => tab,
        panelFor: (key) => body,
        activate: (key) => { const b = document.querySelector(`#training-tabs [data-tab="${key}"]`); if (b) b.click(); }
      });
      }
      if (window.lucide) window.lucide.createIcons();
    }
  };
})();
