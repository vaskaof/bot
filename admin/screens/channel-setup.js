'use strict';

/**
 * Пилот limisteam (13.10.2026, просьба VASY: «при заходе в бота — сессия настройки по пунктам») — «Настройка
 * канала» админа канала: шаги по порядку (сначала деньги, потом вид, потом запуск), прогресс, «Сделать» ведёт
 * в нужное место, шаги без следа в данных отмечаются кнопкой. Сюда ведёт кнопка из бота (/start) и карточка в
 * «Мой канал (админ)». Шаги и готовность считает сервер (`getChannelSetup`, src/staff/channelSetupService.js).
 */
window.Screens = window.Screens || {};
window.Screens.channelSetup = {
  render(root) {
    const adminOf = window.CURRENT_CHANNEL_ADMIN_OF;
    const cs = window.ChannelSwitch;
    document.getElementById('header-left').innerHTML = `
      <div class="flex items-center gap-1 min-w-0">
        <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="arrow-left" class="w-5 h-5"></i>
        </button>
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight truncate">Настройка канала</h1>
      </div>`;
    document.getElementById('header-actions').innerHTML = '';
    root.innerHTML = '<main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto" id="channel-setup-root"><div class="text-center text-sm text-gray-400 py-10">Загрузка...</div></main>';
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    if (window.lucide) window.lucide.createIcons();
    const main = document.getElementById('channel-setup-root');

    if (!adminOf || window.CURRENT_ACCESS_ROLE === 'admin') {
      main.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Этот раздел — для админа своего канала.</div>';
      return;
    }
    // Настройка — только в своём канале: переключаем шапку (экран перерисуется уже в нём).
    if (cs && cs.enabled() && cs.currentStorefrontId() !== adminOf) {
      cs.choose(adminOf);
      return;
    }

    let state = null;
    let postText = '';

    load();

    async function load() {
      try {
        state = await callServer('getChannelSetup');
        render();
      } catch (error) {
        main.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${escapeHtmlClient(error.message || 'Не удалось загрузить.')}</div>`;
      }
    }

    function defaultPost() {
      return `Девочки, у ${state.title} теперь свой бот 🤖\n`
        + 'В нём видно ваши заказы: где сейчас кукла и сколько оплатить. Оплатили — нажмите «Я оплатила» и приложите чек.\n'
        + `Заходите: ${state.inviteLink}`;
    }

    function stepHtml(step, index) {
      const isNext = step.key === state.nextKey;
      const mark = step.done
        ? '<span class="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm shrink-0">✓</span>'
        : `<span class="w-7 h-7 rounded-full ${isNext ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'} flex items-center justify-center text-sm font-semibold shrink-0">${index + 1}</span>`;
      const actions = [];
      if (!step.done) {
        if (step.lesson) actions.push(`<button type="button" data-cs-lesson="${escapeHtmlClient(step.lesson)}" class="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-medium">Пройти урок</button>`);
        if (step.route) actions.push(`<button type="button" data-cs-go="${escapeHtmlClient(step.route)}" class="px-3 py-2 rounded-xl ${step.manualLabel ? 'border border-indigo-200 text-indigo-700' : 'bg-indigo-600 text-white'} text-[13px] font-medium">Открыть</button>`);
        if (step.manualLabel) actions.push(`<button type="button" data-cs-mark="${escapeHtmlClient(step.key)}" class="px-3 py-2 rounded-xl ${step.route ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white'} text-[13px] font-medium">${escapeHtmlClient(step.manualLabel)}</button>`);
      } else if (step.manualLabel) {
        actions.push(`<button type="button" data-cs-unmark="${escapeHtmlClient(step.key)}" class="text-[12px] text-gray-400">Снять отметку</button>`);
      }
      const invite = step.invite && state.inviteLink ? `
        <div class="mt-2 space-y-2">
          <div class="flex items-center gap-2">
            <code class="flex-1 min-w-0 truncate bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 text-[12px]">${escapeHtmlClient(state.inviteLink)}</code>
            <button type="button" data-cs-copy="link" class="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-700 shrink-0">Скопировать</button>
          </div>
          <textarea id="cs-post" rows="4" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]">${escapeHtmlClient(postText || defaultPost())}</textarea>
          <button type="button" data-cs-copy="post" class="w-full py-2 rounded-xl border border-indigo-200 text-indigo-700 text-[13px] font-medium">Скопировать текст поста</button>
          <div class="text-[11px] text-gray-400">Клиенток в канале: ${state.clientsCount}.</div>
        </div>` : '';
      return `
        <section data-cs-step="${escapeHtmlClient(step.key)}" class="bg-white rounded-2xl shadow-sm border ${isNext ? 'border-indigo-200' : 'border-gray-100'} p-4 mb-2">
          <div class="flex items-start gap-3">
            ${mark}
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold ${step.done ? 'text-gray-500' : 'text-gray-900'}">${escapeHtmlClient(step.title)}</div>
              ${step.done && !step.invite ? '' : `<div class="text-[12px] text-gray-500 mt-0.5">${escapeHtmlClient(step.why)}</div>`}
              ${invite}
              ${actions.length ? `<div class="flex flex-wrap items-center gap-2 mt-2">${actions.join('')}</div>` : ''}
            </div>
          </div>
        </section>`;
    }

    function render() {
      const pct = Math.round((state.doneCount / state.total) * 100);
      const allDone = state.doneCount >= state.total;
      main.innerHTML = `
        <section class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="text-sm font-semibold text-gray-900">Канал «${escapeHtmlClient(state.title)}»</div>
          <div class="text-[12px] text-gray-500 mt-0.5">${allDone ? 'Всё готово — можно работать.' : `Готово ${state.doneCount} из ${state.total}. Можно прерваться и вернуться — сделанное отметится само.`}</div>
          <div class="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden"><div class="h-full bg-indigo-600 rounded-full" style="width:${pct}%"></div></div>
        </section>
        ${state.steps.map(stepHtml).join('')}
        <button type="button" id="cs-finish" class="w-full mt-2 py-2.5 rounded-xl ${state.finished ? 'border border-gray-200 text-gray-600' : (allDone ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-600')} text-sm font-medium">
          ${state.finished ? 'Снова напоминать о настройке' : (allDone ? 'Готово' : 'Больше не напоминать')}
        </button>
        <div class="text-[11px] text-gray-400 text-center mt-1">${state.finished ? 'Бот больше не зовёт к настройке.' : 'Пока настройка не закончена, бот раз в день напомнит о ней на /start.'}</div>`;
      wire();
    }

    function wire() {
      main.querySelectorAll('[data-cs-lesson]').forEach((btn) => btn.addEventListener('click', () => {
        if (window.Tour && window.TourScenarios && window.TourScenarios[btn.dataset.csLesson]) Tour.start(btn.dataset.csLesson);
        else showSaveToast(false, 'Урок не загрузился — обновите приложение.');
      }));
      main.querySelectorAll('[data-cs-go]').forEach((btn) => btn.addEventListener('click', () => navigateTo(btn.dataset.csGo)));
      main.querySelectorAll('[data-cs-mark], [data-cs-unmark]').forEach((btn) => btn.addEventListener('click', async () => {
        const key = btn.dataset.csMark || btn.dataset.csUnmark;
        btn.disabled = true;
        try {
          state = await callServer('setChannelSetupStep', key, !!btn.dataset.csMark);
          render();
        } catch (error) {
          btn.disabled = false;
          showSaveToast(false, error.message || 'Не удалось сохранить.');
        }
      }));
      const post = document.getElementById('cs-post');
      if (post) post.addEventListener('input', () => { postText = post.value; });
      main.querySelectorAll('[data-cs-copy]').forEach((btn) => btn.addEventListener('click', async () => {
        const text = btn.dataset.csCopy === 'link' ? state.inviteLink : (post ? post.value : defaultPost());
        try {
          await navigator.clipboard.writeText(text);
          showSaveToast(true, 'Скопировано.');
        } catch (e) {
          showSaveToast(false, 'Не получилось скопировать — выделите текст и скопируйте вручную.');
        }
      }));
      document.getElementById('cs-finish').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          state = await callServer('finishChannelSetup', !state.finished);
          render();
        } catch (error) {
          e.currentTarget.disabled = false;
          showSaveToast(false, error.message || 'Не удалось сохранить.');
        }
      });
    }
  }
};
