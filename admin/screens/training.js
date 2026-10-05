'use strict';

/**
 * Экран «Обучение» (#/training, обучение менеджеров этап 1, 04.10.2026).
 * Сотрудник: уровень, весь курс (доступные сценарии — «Пройти», остальные —
 * «скоро»), достижения, свои идеи со статусами. Админ дополнительно: «Команда»
 * (прогресс каждого, где бросают сценарии, средние оценки) и «Отзывы»
 * (решение по каждому: в работу / внедрено / не будем).
 * Этап 2 (04.10.2026): «🆘 Проблемы» — в «Моих идеях» и в «Отзывах» (с тем,
 * что собрал код: ошибка, заказ, последние действия), вкладка «Ошибки» —
 * что менеджеры видели за 14 дней (ответы сервера и проверки форм) и есть ли
 * на это подсказка (_error-hints.js).
 * Этап 3 (04.10.2026): вкладка «Помощник» — журнал разговоров менеджеров с
 * ИИ-помощником (что спросили, что собрал код, что ответил ИИ, помогло ли);
 * категорию предлагает ИИ, утверждает VASY; «Ответить» — VASY продолжает
 * разговор сам (сообщение автору в Telegram). Сервер — assistantService.js.
 * Этап 4 (04.10.2026): полка «Проверено делом» (то же, что в уроке, но
 * по-настоящему); в «Команде» — память по человеку (что видит помощник) и
 * заметки VASY; заметку, предложенную ИИ, VASY утверждает/правит/отклоняет
 * (в «Команде» и под разговором во вкладке «Помощник»).
 * Сервер — `server/src/training/trainingService.js`.
 */
window.Screens = window.Screens || {};

(function () {
  const SCORE_EMOJI = { 1: '😕', 2: '🙂', 3: '😃' };
  const STATUS_CHIP = {
    new: 'bg-gray-100 text-gray-600', accepted: 'bg-sky-50 text-sky-700',
    rejected: 'bg-red-50 text-red-600', done: 'bg-emerald-50 text-emerald-700', noted: 'bg-gray-50 text-gray-500'
  };
  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  const day = (d) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');
  const avgEmoji = (v) => (v == null ? '—' : `${SCORE_EMOJI[Math.round(v)] || ''} ${v}`);
  const time = (d) => (d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
  // Названия методов — словарь экрана «Аналитика» (analytics.js), если загружен.
  const actionLabel = (m) => (typeof METHOD_LABELS !== 'undefined' && METHOD_LABELS[m]) || m;
  const KIND_TITLE = { idea: '💡 Идея', problem: '🆘 Проблема', scenario: '📝 Отзыв' };
  const STATUS_BUTTONS = {
    // «👍 Принято» (05.10.2026, VASY) — похвала или отзыв, по которому делать нечего: закрыт без сообщения автору.
    idea: [['accepted', 'В работу', 'text-sky-700'], ['done', 'Внедрено', 'text-emerald-700'], ['noted', '👍 Принято', 'text-gray-700'], ['rejected', 'Не будем', 'text-red-600']],
    problem: [['accepted', 'В работу', 'text-sky-700'], ['done', 'Исправлено', 'text-emerald-700'], ['rejected', 'Не баг', 'text-red-600']]
  };

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

  function badgeTiles(list) {
    return `
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
        ${list.map((b) => `
          <div class="bg-white rounded-2xl border border-gray-100 p-2 text-center ${b.earned ? '' : 'opacity-40 grayscale'}" title="${esc(b.description)}" data-badge="${esc(b.code)}">
            <div class="text-3xl">${b.emoji}</div>
            <div class="text-[11px] font-medium text-gray-800 leading-tight mt-1">${esc(b.title)}</div>
            ${b.earned ? `<div class="text-[10px] text-gray-400">${day(b.earnedAt)}</div>` : `<div class="text-[10px] text-gray-400 leading-tight">${esc(b.description)}</div>`}
          </div>`).join('')}
      </div>`;
  }

  function badgesGrid(t) {
    const practice = t.badges.filter((b) => b.shelf === 'practice' && b.available);
    return `
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Достижения</div>
      ${badgeTiles(t.badges.filter((b) => b.shelf !== 'practice'))}
      ${practice.length ? `
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Проверено делом</div>
        <div class="text-[12px] text-gray-500 px-1 mb-2">То же, что в уроке, но по-настоящему. Засчитывается только после урока.</div>
        <div data-shelf="practice">${badgeTiles(practice)}</div>` : ''}`;
  }

  const NOTE_STATUS = { pending: ['ждёт тебя', 'bg-amber-50 text-amber-800'], active: ['в памяти', 'bg-emerald-50 text-emerald-700'], rejected: ['отклонена', 'bg-gray-100 text-gray-500'], archived: ['убрана', 'bg-gray-100 text-gray-500'] };

  /** Заметка памяти: предложенную ИИ — утвердить/поправить/отклонить, активную — убрать. */
  function noteRow(n) {
    const [label, chip] = NOTE_STATUS[n.status] || NOTE_STATUS.active;
    return `
      <div class="rounded-lg bg-gray-50 px-2 py-1.5" data-note="${n.id}">
        <div class="flex items-center justify-between gap-2 text-[11px] text-gray-400">
          <span>${n.source === 'ai' ? '🤖 предложил ИИ' : '✍️ VASY'} · ${day(n.createdAt)}</span>
          <span class="px-1.5 py-0.5 rounded-full ${chip}">${label}</span>
        </div>
        <div class="text-[13px] text-gray-800 mt-0.5 whitespace-pre-wrap break-words" data-note-text>${esc(n.text)}</div>
        ${n.status === 'pending' ? `<div class="flex gap-1.5 mt-1.5">
          <button type="button" data-note-set="active" class="flex-1 py-1 rounded-lg border border-gray-200 text-[12px] text-emerald-700">Утвердить</button>
          <button type="button" data-note-set="edit" class="flex-1 py-1 rounded-lg border border-gray-200 text-[12px] text-indigo-700">Поправить</button>
          <button type="button" data-note-set="rejected" class="flex-1 py-1 rounded-lg border border-gray-200 text-[12px] text-red-600">Отклонить</button>
        </div>` : n.status === 'active' ? '<button type="button" data-note-set="archived" class="mt-1 text-[11px] text-gray-500 underline">Убрать из памяти</button>' : ''}
      </div>`;
  }

  /** Кнопки заметок внутри root; после решения — onDone(). */
  function wireNotes(root, onDone) {
    root.querySelectorAll('[data-note]').forEach((row) => {
      row.querySelectorAll('[data-note-set]').forEach((btn) => btn.addEventListener('click', async () => {
        let status = btn.dataset.noteSet;
        let text = null;
        if (status === 'edit') {
          const current = row.querySelector('[data-note-text]').textContent;
          text = await showPromptModal('Заметка в память (видит помощник, менеджер — нет)', { confirmLabel: 'Утвердить', defaultValue: current });
          if (!text || !text.trim()) return;
          status = 'active';
        }
        row.querySelectorAll('[data-note-set]').forEach((b) => { b.disabled = true; });
        try {
          await callServer('setStaffNoteStatus', Number(row.dataset.note), status, text);
          showSaveToast(true, status === 'active' ? 'Заметка в памяти — помощник будет её учитывать.' : 'Сохранено.');
          onDone();
        } catch (error) {
          row.querySelectorAll('[data-note-set]').forEach((b) => { b.disabled = false; });
          showSaveToast(false, error.message);
        }
      }));
    });
  }

  function ideasBlock(t) {
    return `
      <div class="flex items-center justify-between px-1 mb-2">
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Мои идеи и проблемы</div>
        <button type="button" id="training-new-idea" class="text-[13px] font-medium text-amber-700">💡 Предложить</button>
      </div>
      ${t.ideas.length ? `<div class="space-y-2 mb-4">${t.ideas.map((i) => `
        <div class="bg-white rounded-2xl border border-gray-100 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-gray-400">${i.kind === 'problem' ? '🆘 ' : '💡 '}${day(i.createdAt)}${i.screen ? ` · ${esc(i.screen)}` : ''}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[i.status]}">${esc(i.statusLabel)}</span>
          </div>
          <div class="text-sm text-gray-800 mt-1 whitespace-pre-wrap">${esc(i.text)}</div>
        </div>`).join('')}</div>`
        : '<div class="text-[12px] text-gray-400 px-1 mb-4">Пока нет. Всё, что мешает в работе, — сюда: за внедрённую идею — достижение 🛠</div>'}`;
  }

  /** История «Что нового» (этап 2, блок Б) — все записи для роли, новые сверху. */
  function whatsNewBlock(entries, popupEnabled) {
    if (!entries.length) return '';
    // Выключатель листа при входе (05.10.2026, VASY: «можно отключить в целом»).
    return `
      <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2" id="training-whats-new">Что нового</div>
      <div class="bg-white rounded-xl border border-gray-100 px-3 py-2 mb-2 flex items-center justify-between gap-2">
        <div class="text-[12px] text-gray-600">Показывать новое при входе</div>
        <div id="whats-new-popup-toggle" class="toggle-switch toggle-switch-sm ${popupEnabled === false ? '' : 'on'}"><div class="knob"></div></div>
      </div>
      <div class="space-y-2 mb-4">${entries.map((e) => TrainingUI.whatsNewEntryHtml(e)).join('')}</div>`;
  }

  /** Память по человеку (то, что видит помощник) + заметки. */
  function memoryBlock(p) {
    const pending = p.memory.notes.some((n) => n.status === 'pending');
    return `
      <details class="mt-2" data-person-memory ${pending ? 'open' : ''}>
        <summary class="text-[12px] text-indigo-700 cursor-pointer">🧠 Память${pending ? ' · есть заметка на утверждение' : ''}</summary>
        <div class="text-[11px] text-gray-500 mt-1">Это помощник знает о человеке перед каждым вопросом. Собирает код; заметки — твои или утверждённые тобой.</div>
        <pre class="mt-1 text-[11px] text-gray-700 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap break-words">${esc(p.memory.text || '—')}</pre>
        <div class="space-y-1 mt-1.5">${p.memory.notes.map(noteRow).join('')}</div>
        <button type="button" data-add-note="${esc(p.telegramIds[0])}" class="mt-1.5 w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-600">✍️ Добавить заметку</button>
      </details>`;
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
            ${(p.practice || []).length ? `<div class="mt-1.5 flex flex-wrap gap-1" data-person-practice>${p.practice.map((x) => `<span class="text-[11px] px-1.5 py-0.5 rounded-full ${x.earnedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}" title="Проверено делом">${x.emoji} ${esc(x.title)}${x.earnedAt ? ` · ${day(x.earnedAt)}` : ''}</span>`).join('')}</div>` : ''}
            ${p.memory ? memoryBlock(p) : ''}
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

  /** Что собрал код вместе с «Сообщить о проблеме». */
  function problemDetails(f) {
    const c = f.context || {};
    const actions = c.recentActions || [];
    return `
      <div class="mt-1.5 rounded-lg bg-gray-50 p-2 text-[12px] text-gray-600 space-y-0.5">
        ${c.error ? `<div class="text-red-700 break-words">Ошибка: ${esc(c.error)}</div>` : ''}
        ${c.method ? `<div>Действие: ${esc(actionLabel(c.method))}${c.origin === 'form' ? ' (проверка формы)' : ''}</div>` : ''}
        ${c.orderId ? `<div>Заказ: <button type="button" data-open-order="${esc(c.orderId)}" class="text-indigo-600 underline">${esc(c.orderId)}</button></div>` : ''}
        ${c.cartId ? `<div>Корзина: ${esc(c.cartId)}</div>` : ''}
        ${actions.length ? `<div class="pt-0.5 text-gray-500">Перед этим:</div>${actions.map((a) => `<div class="pl-2">${a.ok ? '·' : '✗'} ${time(a.at)} ${esc(actionLabel(a.method))}${a.error ? ` — <span class="text-red-600">${esc(a.error)}</span>` : ''}</div>`).join('')}` : ''}
        <div class="text-[10px] text-gray-400">${esc([c.route, c.viewport, c.appVersion ? 'v' + c.appVersion : ''].filter(Boolean).join(' · '))}</div>
      </div>`;
  }

  /** Вкладка «Ошибки»: по человеку, свежие сверху; есть ли подсказка в _error-hints.js. */
  function errorsBlock(o) {
    if (!o.errors.length) return `<div class="text-center text-sm text-gray-400 py-8">За ${o.errorsWindowDays} дней у менеджеров ошибок нет</div>`;
    const byPerson = new Map();
    for (const e of o.errors) {
      if (!byPerson.has(e.authorName)) byPerson.set(e.authorName, []);
      byPerson.get(e.authorName).push(e);
    }
    const hinted = (e) => window.ErrorHints && ErrorHints.describe(e.message, e.method).hint;
    return `
      <div class="text-[12px] text-gray-500 px-1 mb-2">Что менеджеры видели за ${o.errorsWindowDays} дней. «Сервер» — ответ сервера, «форма» — проверка на экране. 💬 — на ошибку есть подсказка.</div>
      ${[...byPerson.entries()].map(([name, list]) => `
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 mt-3">${esc(name)} · ${list.reduce((n, e) => n + e.count, 0)}</div>
        <div class="space-y-2">${list.map((e) => `
          <div class="bg-white rounded-2xl border border-gray-100 p-3" data-error-row>
            <div class="flex items-center justify-between gap-2 text-[11px] text-gray-400">
              <span><span class="px-1.5 py-0.5 rounded ${e.source === 'server' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}">${e.source === 'server' ? 'сервер' : 'форма'}</span>
                ${esc(e.source === 'server' ? actionLabel(e.method) : (e.screen || '—'))}</span>
              <span class="shrink-0">${e.count > 1 ? `×${e.count} · ` : ''}${day(e.lastAt)}</span>
            </div>
            <div class="text-sm text-gray-800 mt-1 break-words">${hinted(e) ? '💬 ' : ''}${esc(e.message)}</div>
          </div>`).join('')}</div>`).join('')}`;
  }

  const ASSIST_STATUS = { open: ['без оценки', 'bg-gray-100 text-gray-600'], helped: ['помогло', 'bg-emerald-50 text-emerald-700'], not_helped: ['не помогло', 'bg-red-50 text-red-600'] };
  const needsLook = (s) => !s.adminReviewedAt && (s.status === 'not_helped' || !!s.handoff);

  function assistantBubble(m) {
    const who = { manager: 'Менеджер', assistant: '🤖 ИИ', admin: 'VASY', system: 'Система' }[m.role] || m.role;
    const a = m.role === 'assistant' && m.data && m.data.answer;
    const body = a
      ? `${a.answer ? esc(a.answer) : ''}${a.clarify ? `<div class="text-indigo-700">❓ ${esc(a.clarify)}</div>` : ''}${a.steps && a.steps.length ? `<ol class="list-decimal pl-5 text-[12px]">${a.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}${a.scenarioId ? `<div class="text-[11px] text-gray-400">сценарий: ${esc(a.scenarioId)}</div>` : ''}`
      : esc(m.text);
    const cls = m.role === 'manager' ? 'bg-indigo-50' : m.role === 'admin' ? 'bg-emerald-50' : m.role === 'system' ? 'bg-amber-50' : 'bg-gray-50';
    return `<div class="rounded-lg ${cls} px-2 py-1.5 text-[13px] text-gray-800 whitespace-pre-wrap break-words"><span class="text-[11px] font-semibold text-gray-500">${who}${m.tokens ? ` · ${m.tokens} ток.` : ''}</span><br>${body}</div>`;
  }

  function assistantBlock(log, filter) {
    const list = filter === 'look' ? log.sessions.filter(needsLook) : log.sessions;
    const lookCount = log.sessions.filter(needsLook).length;
    const t = log.totals;
    const money = (v) => `$${(v || 0).toFixed(3)}`;
    return `
      <div class="text-[12px] text-gray-500 px-1 mb-2">Сегодня: ${t.today.count} · ${money(t.today.costUsd)} · за 7 дней: ${t.week.count} · ${money(t.week.costUsd)} (${Math.round(t.week.tokens / 1000)} тыс. токенов)</div>
      <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
        <button type="button" data-as-filter="look" class="flex-1 py-1.5 rounded-lg text-sm font-medium ${filter === 'look' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}">Требуют внимания (${lookCount})</button>
        <button type="button" data-as-filter="all" class="flex-1 py-1.5 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}">Все (${log.sessions.length})</button>
      </div>
      ${list.length ? `<div class="space-y-2">${list.map((s) => {
        const [label, chip] = ASSIST_STATUS[s.status] || ASSIST_STATUS.open;
        const order = s.snapshot && s.snapshot['открытый заказ'] && s.snapshot['открытый заказ'].orderId;
        return `
        <div class="bg-white rounded-2xl border border-gray-100 p-3" data-assist="${s.id}">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] text-gray-500">${esc(s.authorName)} · ${day(s.createdAt)} ${time(s.createdAt)}${s.screen ? ` · ${esc(s.screen)}` : ''}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full shrink-0 ${chip}">${label}</span>
          </div>
          ${s.handoff ? `<div class="mt-1 text-[11px] inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">передано тебе: ${esc(log.handoffLabels[s.handoff] || s.handoff)}</div>` : ''}
          ${s.summary ? `<div class="text-[12px] text-gray-500 mt-1">Итог ИИ: ${esc(s.summary)}</div>` : ''}
          ${s.memoryNote ? `<div class="mt-1.5" data-as-memory><div class="text-[11px] text-gray-500 mb-0.5">🧠 Заметка в память о менеджере</div>${noteRow(s.memoryNote)}</div>` : ''}
          <div class="mt-2 space-y-1">${s.messages.map(assistantBubble).join('')}</div>
          <div class="flex flex-wrap items-center gap-2 mt-2 text-[12px]">
            <select data-as-category class="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-[12px]">
              ${Object.entries(log.categories).map(([k, v]) => `<option value="${k}" ${(s.adminCategory || s.aiCategory) === k ? 'selected' : ''}>${esc(v)}${!s.adminCategory && s.aiCategory === k ? ' (ИИ)' : ''}</option>`).join('')}
            </select>
            ${s.adminCategory ? '<span class="text-emerald-600">✓ подтверждено</span>' : '<button type="button" data-as-confirm class="px-2 py-1 rounded-lg border border-gray-200 text-gray-700">Подтвердить</button>'}
            <span class="text-gray-400 ml-auto">${s.modelCalls} отв. · ${money(s.costUsd)}</span>
          </div>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <button type="button" data-as-reply class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-indigo-700">Ответить</button>
            ${s.hasScreenshot ? '<button type="button" data-as-shot class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-700">📎 Скриншот</button>' : ''}
            ${order ? `<button type="button" data-open-order="${esc(order)}" class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-700">Заказ ${esc(order)}</button>` : ''}
          </div>
          <details class="mt-1.5"><summary class="text-[11px] text-gray-400 cursor-pointer">Что собрал код (снимок)</summary>
            <pre class="mt-1 text-[10px] text-gray-600 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">${esc(JSON.stringify(s.snapshot, null, 1))}</pre>
          </details>
        </div>`;
      }).join('')}</div>`
        : `<div class="text-center text-sm text-gray-400 py-8">${filter === 'look' ? 'Всё разобрано 🎉' : 'Вопросов помощнику пока не было'}</div>`}`;
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
            <span class="text-[12px] text-gray-500">${KIND_TITLE[f.kind] || '📝 Отзыв'} · ${esc(f.authorName)} · ${day(f.createdAt)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[f.status]}">${esc(f.statusLabel)}</span>
          </div>
          <div class="text-[12px] text-gray-500 mt-0.5">${f.kind !== 'scenario' ? `Экран: ${esc(f.screen || '—')}` : `«${esc(f.scenarioTitle)}»${f.clarity ? ` · понятно ${SCORE_EMOJI[f.clarity]}` : ''}${f.ease ? ` · легко ${SCORE_EMOJI[f.ease]}` : ''}`}</div>
          ${f.text ? `<div class="text-sm text-gray-800 mt-1 whitespace-pre-wrap">${esc(f.text)}</div>` : ''}
          ${f.kind === 'problem' ? problemDetails(f) : ''}
          ${f.adminNote ? `<div class="text-[12px] text-gray-500 mt-1">Ответ: ${esc(f.adminNote)}</div>` : ''}
          <div class="flex gap-1.5 mt-2">
            ${(STATUS_BUTTONS[f.kind] || STATUS_BUTTONS.idea).map(([st, label, cls]) => `<button type="button" data-set-status="${st}" class="flex-1 py-1.5 rounded-lg border border-gray-200 text-[12px] ${cls}">${label}</button>`).join('')}
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
      let tab = isAdmin && params && ['feedback', 'team', 'errors', 'assistant'].includes(params.tab) ? params.tab : 'me';
      let fbFilter = 'new';
      let asFilter = 'look';
      let overview = null;
      let assistantLog = null;

      root.innerHTML = `
        <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto">
          ${isAdmin ? `<div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3" id="training-tabs">
            <button type="button" data-tab="me" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Моё</button>
            <button type="button" data-tab="team" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Команда</button>
            <button type="button" data-tab="feedback" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Отзывы</button>
            <button type="button" data-tab="errors" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Ошибки</button>
            <button type="button" data-tab="assistant" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Помощник</button>
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
          const [t, news] = await Promise.all([
            callServer('getMyTraining'),
            callServer('getWhatsNew').catch(() => ({ entries: [] }))
          ]);
          if (tab !== 'me') return;
          body.innerHTML = levelCard(t) + courseList(t) + badgesGrid(t) + ideasBlock(t) + whatsNewBlock(news.entries, news.popupEnabled);
          const popupToggle = document.getElementById('whats-new-popup-toggle');
          if (popupToggle) popupToggle.addEventListener('click', async () => {
            const next = !popupToggle.classList.contains('on');
            popupToggle.classList.toggle('on', next);
            try {
              await callServer('setWhatsNewPopup', next);
              showSaveToast(true, next ? 'Новое будет показываться при входе.' : 'При входе больше не показываем — новое есть здесь и в «Новостях».');
            } catch (error) {
              popupToggle.classList.toggle('on', !next);
              showSaveToast(false, error.message);
            }
          });
          body.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => Tour.start(b.dataset.start)));
          TrainingUI.wireWhatsNewShow(body, news.entries);
          document.getElementById('training-new-idea').addEventListener('click', () => TrainingUI.openIdea('Обучение'));
          TrainingUI.checkNewBadges(t);
        } catch (error) {
          body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${esc(error.message)}</div>`;
        }
      }

      async function loadOverview(force) {
        try {
          if (!overview || force) overview = await callServer('getTrainingOverview');
          if (tab === 'team') paintTeam();
          if (tab === 'feedback') paintFeedback();
          if (tab === 'errors') body.innerHTML = errorsBlock(overview);
        } catch (error) {
          body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${esc(error.message)}</div>`;
        }
      }

      function paintTeam() {
        body.innerHTML = teamBlock(overview);
        wireNotes(body, () => loadOverview(true));
        body.querySelectorAll('[data-add-note]').forEach((b) => b.addEventListener('click', async () => {
          const text = await showPromptModal('Заметка о человеке — помощник будет её учитывать (менеджер не видит)', { confirmLabel: 'Сохранить' });
          if (!text || !text.trim()) return;
          try {
            await callServer('addStaffNote', b.dataset.addNote, text.trim());
            showSaveToast(true, 'Заметка в памяти.');
            loadOverview(true);
          } catch (error) { showSaveToast(false, error.message); }
        }));
        paintClientTraining();
      }

      // Обучение клиентов (план Б, 05.10.2026) — внизу «Команды»: начали/прошли, где бросают.
      async function paintClientTraining() {
        const slot = document.createElement('div');
        slot.id = 'client-training-overview';
        slot.className = 'mt-6';
        body.appendChild(slot);
        let o;
        try { o = await callServer('getClientTrainingOverview'); } catch (error) { slot.innerHTML = `<div class="text-xs text-red-500">${esc(error.message)}</div>`; return; }
        if (!slot.isConnected) return;
        slot.innerHTML = `
          <div class="text-sm font-semibold text-gray-900 mb-1">🎓 Обучение клиентов</div>
          <div class="text-[12px] text-gray-500 mb-2">Учились: ${o.people} · приглашение: «Показать» ${o.offers.show}, «Потом» ${o.offers.later} · скрыли квест: ${o.questHidden}</div>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            ${o.lessons.map((l) => `<div class="p-3 flex items-center justify-between gap-2 text-[13px]">
              <span>${esc(l.emoji)} ${esc(l.title)}</span>
              <span class="text-gray-500 shrink-0">начали ${l.started} · прошли ${l.completed}${l.stuckAtStep.length ? ` · бросают на шаге ${l.stuckAtStep[0].step} (${l.stuckAtStep[0].count})` : ''}</span>
            </div>`).join('')}
          </div>`;
      }

      function paintFeedback() {
        body.innerHTML = feedbackBlock(overview, fbFilter);
        body.querySelectorAll('[data-fb-filter]').forEach((b) => b.addEventListener('click', () => { fbFilter = b.dataset.fbFilter; paintFeedback(); }));
        body.querySelectorAll('[data-open-order]').forEach((b) => b.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(b.dataset.openOrder)}/edit`)));
        body.querySelectorAll('[data-feedback]').forEach((card) => {
          card.querySelectorAll('[data-set-status]').forEach((btn) => btn.addEventListener('click', async () => {
            const status = btn.dataset.setStatus;
            let note = null;
            if (status === 'done' || status === 'rejected') {
              const isProblem = (overview.feedback.find((f) => f.id === Number(card.dataset.feedback)) || {}).kind === 'problem';
              note = await showPromptModal(status === 'done' ? 'Что сделали? (необязательно — увидит автор)' : (isProblem ? 'Почему не баг? (необязательно)' : 'Почему не будем? (необязательно)'), { confirmLabel: 'Сохранить' });
              if (note === null) return;
            }
            card.querySelectorAll('[data-set-status]').forEach((b) => { b.disabled = true; });
            try {
              const updated = await callServer('setStaffFeedbackStatus', Number(card.dataset.feedback), status, note);
              const item = overview.feedback.find((f) => f.id === updated.id);
              Object.assign(item, { status: updated.status, statusLabel: updated.statusLabel, adminNote: updated.adminNote });
              showSaveToast(true, status === 'done' ? `Отмечено «${updated.statusLabel}» — автору ушло сообщение.` : 'Сохранено.');
              paintFeedback();
            } catch (error) {
              card.querySelectorAll('[data-set-status]').forEach((b) => { b.disabled = false; });
              showSaveToast(false, error.message);
            }
          }));
        });
      }

      async function loadAssistant(force) {
        try {
          if (!assistantLog || force) assistantLog = await callServer('getAssistantLog');
          if (tab === 'assistant') paintAssistant();
        } catch (error) {
          body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${esc(error.message)}</div>`;
        }
      }

      function paintAssistant() {
        body.innerHTML = assistantBlock(assistantLog, asFilter);
        body.querySelectorAll('[data-as-filter]').forEach((b) => b.addEventListener('click', () => { asFilter = b.dataset.asFilter; paintAssistant(); }));
        wireNotes(body, () => { overview = null; loadAssistant(true); });
        body.querySelectorAll('[data-open-order]').forEach((b) => b.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(b.dataset.openOrder)}/edit`)));
        body.querySelectorAll('[data-assist]').forEach((card) => {
          const id = Number(card.dataset.assist);
          const item = assistantLog.sessions.find((x) => x.id === id);
          const select = card.querySelector('[data-as-category]');
          const saveCategory = async () => {
            try {
              const updated = await callServer('setAssistantCategory', id, select.value);
              Object.assign(item, { adminCategory: updated.adminCategory, adminReviewedAt: updated.adminReviewedAt });
              paintAssistant();
            } catch (error) { showSaveToast(false, error.message); }
          };
          select.addEventListener('change', saveCategory);
          const confirmBtn = card.querySelector('[data-as-confirm]');
          if (confirmBtn) confirmBtn.addEventListener('click', saveCategory);
          card.querySelector('[data-as-reply]').addEventListener('click', async () => {
            const text = await showPromptModal('Ответ менеджеру (уйдёт в Telegram и в этот разговор)', { confirmLabel: 'Отправить' });
            if (!text || !text.trim()) return;
            try {
              const r = await callServer('replyAssistantSession', id, text.trim());
              showSaveToast(r.delivered, r.delivered ? 'Ответ отправлен.' : 'Сохранено, но Telegram не доставил сообщение.');
              await loadAssistant(true);
            } catch (error) { showSaveToast(false, error.message); }
          });
          const shotBtn = card.querySelector('[data-as-shot]');
          if (shotBtn) shotBtn.addEventListener('click', async () => {
            try {
              const shot = await callServer('getAssistantScreenshot', id);
              const w = document.createElement('div');
              w.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[96] p-3';
              w.innerHTML = `<img class="max-w-full max-h-full object-contain rounded-lg" src="data:${shot.mimeType};base64,${shot.data}" alt="">`;
              w.addEventListener('click', () => w.remove());
              document.body.appendChild(w);
            } catch (error) { showSaveToast(false, error.message); }
          });
        });
      }

      function show() {
        paintTabs();
        body.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Загрузка…</div>';
        if (tab === 'me') loadMe(); else if (tab === 'assistant') loadAssistant(false); else loadOverview(false);
      }

      document.querySelectorAll('#training-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; show(); }));
      show();
      if (isAdmin) {
      // Свайп между вкладками на телефоне (05.10.2026) — screens/_swipe-tabs.js.
      SwipeTabs.attach({
        area: root.querySelector('main'),
        keys: () => ['me', 'team', 'feedback', 'errors', 'assistant'],
        getActive: () => tab,
        panelFor: (key) => body,
        activate: (key) => { const b = document.querySelector(`#training-tabs [data-tab="${key}"]`); if (b) b.click(); }
      });
      }
      if (window.lucide) window.lucide.createIcons();
    }
  };
})();
