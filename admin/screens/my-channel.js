'use strict';

/**
 * «Настройки → Мой канал» (В4 плана SaaS, IMPLEMENTATION-PLAN-SAAS.md) — только админ.
 * Название, ссылка на канал, контакт менеджера, фирменный эмодзи, цвет приложения клиентов, валюта бонусов
 * и тексты бота клиентам.
 * Пустое поле = «как по умолчанию» (подсказка под полем показывает, что будет). Тексты — целыми фразами:
 * своя фраза заменяет стандартную, «Вернуть как было» — убирает свою. Сервер — brandingAdminService.js.
 */
window.Screens = window.Screens || {};

const MY_CHANNEL_VAR_LABELS = {
  channel: 'название канала',
  channelUrl: 'ссылка на канал',
  manager: 'контакт менеджера',
  emoji: 'фирменный эмодзи'
};

// Готовые цвета (VASY 11.10.2026: «любой + готовые»). Первый — как сейчас у Dream Dolls.
const MY_CHANNEL_COLORS = [
  { hex: '#4f46e5', name: 'Индиго' }, { hex: '#7c3aed', name: 'Фиолетовый' }, { hex: '#db2777', name: 'Розовый' },
  { hex: '#dc2626', name: 'Красный' }, { hex: '#ea580c', name: 'Оранжевый' }, { hex: '#16a34a', name: 'Зелёный' },
  { hex: '#0d9488', name: 'Бирюзовый' }, { hex: '#2563eb', name: 'Синий' }
];

window.Screens.myChannel = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Мой канал</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-10 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="my-channel-body" class="text-center text-sm text-gray-400 py-10">Загрузка...</div>
      </main>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Каналы К6.4: админ канала — только бренд своего канала (сервер подставляет его сам).
    const channelAdminOf = window.CURRENT_ACCESS_ROLE !== 'admin' ? window.CURRENT_CHANNEL_ADMIN_OF : null;
    if (window.CURRENT_ACCESS_ROLE !== 'admin' && !channelAdminOf) {
      document.getElementById('my-channel-body').textContent = 'Этот раздел — только для администратора.';
      return;
    }
    // Права админа канала — только в его канале: переключаем шапку (экран перерисуется уже в нём).
    if (channelAdminOf && window.ChannelSwitch && window.ChannelSwitch.enabled()
      && window.ChannelSwitch.currentStorefrontId() !== channelAdminOf) {
      window.ChannelSwitch.choose(channelAdminOf);
      return;
    }

    let state = null;
    // Витрины: чей бренд правим — основного бота (null) или витрины (второй бот той же базы).
    let storefrontId = channelAdminOf || null;
    let editingKey = null;
    let colorDraft = null; // выбранный, ещё не сохранённый цвет
    load();

    async function load() {
      const body = document.getElementById('my-channel-body');
      try {
        state = await callServer('getMyBranding', storefrontId);
      } catch (error) {
        if (body) body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
        return;
      }
      render();
    }

    function fieldHtml({ id, label, value, placeholder, hint, maxlength }) {
      return `
        <label class="block py-2">
          <span class="text-sm font-medium text-gray-800">${escapeHtmlClient(label)}</span>
          <input id="${id}" value="${escapeHtmlClient(value || '')}" placeholder="${escapeHtmlClient(placeholder || '')}" ${maxlength ? `maxlength="${maxlength}"` : ''}
            class="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
          ${hint ? `<span class="block text-[11px] text-gray-400 mt-1">${hint}</span>` : ''}
        </label>`;
    }

    function channelSectionHtml() {
      const f = state.fields;
      const d = state.defaults;
      const dflt = (v) => (v ? `Пусто — «${escapeHtmlClient(v)}»` : 'Пусто — строки про это в боте не будет');
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Канал</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="text-[12px] text-gray-500 mb-1">Так бот и приложение называют ваш канал клиентам. Имя и аватар самого бота меняются в @BotFather.</div>
            ${fieldHtml({ id: 'mc-title', label: 'Название канала', value: f.channelTitle, placeholder: d.channelTitle, maxlength: 60,
              hint: `${dflt(d.channelTitle)}. Пишется в приветствии: «ваш личный помощник в …».` })}
            ${fieldHtml({ id: 'mc-url', label: 'Ссылка на канал', value: f.channelUrl, placeholder: d.channelUrl || 't.me/имя_канала',
              hint: `${dflt(d.channelUrl)}. Кнопка «📣 Наш канал» в меню бота и подпись на картинках клиентов.` })}
            ${fieldHtml({ id: 'mc-manager', label: 'Контакт менеджера', value: f.managerContact, placeholder: d.managerContact || '@ник_менеджера',
              hint: `${d.managerContact ? `Пусто — «${escapeHtmlClient(d.managerContact)}»` : 'Пусто — бот пишет «просто напишите мне сюда»'}. Подпись «Если есть вопросы — …» под заказами и уведомлениями.` })}
            ${fieldHtml({ id: 'mc-emoji', label: 'Фирменный эмодзи', value: f.brandEmoji, placeholder: d.brandEmoji, maxlength: 16,
              hint: `Пусто — ${escapeHtmlClient(d.brandEmoji)}. В заголовках сообщений бота: «${escapeHtmlClient(state.effective.brandEmoji)} Чем помочь?»` })}
            <button type="button" id="mc-save" class="mt-2 w-full bg-indigo-600 text-white text-sm font-medium rounded-xl py-2.5">Сохранить</button>
          </div>
        </section>`;
    }

    function colorSectionHtml() {
      const current = (colorDraft !== null ? colorDraft : state.fields.accentColor) || MY_CHANNEL_COLORS[0].hex;
      const contrast = whiteTextContrast(current);
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Цвет приложения</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="text-[12px] text-gray-500 mb-3">Цвет кнопок и выделений в приложении ваших клиентов.</div>
            <div class="flex flex-wrap gap-2 mb-3">
              ${MY_CHANNEL_COLORS.map((c) => `
                <button type="button" data-color="${c.hex}" title="${escapeHtmlClient(c.name)}"
                  class="w-9 h-9 rounded-full border-2 ${c.hex === current ? 'border-gray-900' : 'border-white'} shadow-sm" style="background:${c.hex}"></button>`).join('')}
              <label class="w-9 h-9 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-lg cursor-pointer" title="Свой цвет">
                +<input type="color" id="mc-color-custom" value="${escapeHtmlClient(current)}" class="sr-only">
              </label>
            </div>
            <div class="flex items-center gap-3">
              <span class="px-4 py-2 rounded-xl text-white text-sm font-medium" style="background:${escapeHtmlClient(current)}">Так выглядит кнопка</span>
              <span class="text-[12px] text-gray-400">${escapeHtmlClient(current)}</span>
            </div>
            ${contrast < 3 ? '<div class="text-[12px] text-amber-600 mt-2">Белый текст на этом цвете читается плохо — лучше выбрать цвет потемнее. Сохранить всё равно можно.</div>' : ''}
            <button type="button" id="mc-color-save" class="mt-3 w-full bg-indigo-600 text-white text-sm font-medium rounded-xl py-2.5">Сохранить цвет</button>
          </div>
        </section>`;
    }

    function currencySectionHtml() {
      if (!hasModule('gamification')) return '';
      const f = state.fields;
      const d = state.defaults.currency;
      const cur = state.effective.currency;
      const input = (id, value, placeholder, label) => `
        <label class="block">
          <span class="text-[12px] text-gray-500">${label}</span>
          <input id="${id}" value="${escapeHtmlClient(value || '')}" placeholder="${escapeHtmlClient(placeholder)}" maxlength="24"
            class="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
        </label>`;
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Валюта бонусов</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="text-[12px] text-gray-500 mb-3">Как называются бонусы, которые клиенты получают за заказы, друзей и задания. Нужны все формы — так бот пишет без ошибок: «1 ${escapeHtmlClient(cur.one)}», «2 ${escapeHtmlClient(cur.few)}», «5 ${escapeHtmlClient(cur.many)}». Пустые поля — «${escapeHtmlClient(d.one)} / ${escapeHtmlClient(d.few)} / ${escapeHtmlClient(d.many)}».</div>
            <div class="grid grid-cols-2 gap-2">
              ${input('mc-cur-one', f.currencyOne, d.one, 'Для 1 (1 …)')}
              ${input('mc-cur-few', f.currencyFew, d.few, 'Для 2 (2 …)')}
              ${input('mc-cur-many', f.currencyMany, d.many, 'Для 5 (5 …)')}
              ${input('mc-cur-plural', f.currencyPlural, d.plural, 'Заголовок («Совы», «Баллы»)')}
              ${input('mc-cur-emoji', f.currencyEmoji, d.emoji, 'Значок')}
            </div>
            <div id="mc-cur-preview" class="text-[12px] text-gray-500 mt-2"></div>
            <button type="button" id="mc-cur-save" class="mt-3 w-full bg-indigo-600 text-white text-sm font-medium rounded-xl py-2.5">Сохранить валюту</button>
          </div>
        </section>`;
    }

    function phraseHtml(p) {
      const isCustom = Boolean(p.custom);
      if (editingKey === p.key) {
        const vars = p.vars.map((v) => `<code class="bg-gray-100 rounded px-1">{${escapeHtmlClient(v)}}</code> — ${escapeHtmlClient(MY_CHANNEL_VAR_LABELS[v] || v)}`).join('<br>');
        return `
          <div class="py-3 border-t border-gray-50 first:border-t-0">
            <div class="text-sm font-medium text-gray-800 mb-1">${escapeHtmlClient(p.label)}</div>
            <textarea id="mc-phrase-text" rows="4" maxlength="600" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">${escapeHtmlClient(p.custom || p.defaultText)}</textarea>
            <div class="text-[11px] text-gray-400 mt-1">Можно подставить:<br>${vars}</div>
            <div class="flex gap-2 mt-2">
              <button type="button" id="mc-phrase-save" class="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-xl py-2">Сохранить</button>
              <button type="button" id="mc-phrase-cancel" class="flex-1 border border-gray-200 text-gray-700 text-sm rounded-xl py-2">Отмена</button>
            </div>
          </div>`;
      }
      return `
        <div class="py-3 border-t border-gray-50 first:border-t-0">
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium text-gray-800 flex-1">${escapeHtmlClient(p.label)}</div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isCustom ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}">${isCustom ? 'ваш текст' : 'стандартный'}</span>
          </div>
          <div class="mt-1.5 bg-sky-50 rounded-xl rounded-tl-sm px-3 py-2 text-[13px] text-gray-800 whitespace-pre-line">${p.preview ? escapeHtmlClient(p.preview) : '<span class="text-gray-400">Сейчас не выводится — нет ссылки или контакта, которые в ней нужны</span>'}</div>
          <div class="flex gap-3 mt-1.5">
            <button type="button" data-phrase-edit="${escapeHtmlClient(p.key)}" class="text-sm text-indigo-600">Изменить</button>
            ${isCustom ? `<button type="button" data-phrase-reset="${escapeHtmlClient(p.key)}" class="text-sm text-gray-500">Вернуть как было</button>` : ''}
          </div>
        </div>`;
    }

    function phrasesSectionHtml() {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Тексты бота</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="text-[12px] text-gray-500 mb-1">Фразы, которые клиент видит в чате с ботом. Пишите фразу целиком — так, как хотите, чтобы она звучала.</div>
            ${state.phrases.map(phraseHtml).join('')}
          </div>
        </section>`;
    }

    function render() {
      const body = document.getElementById('my-channel-body');
      if (!body) return;
      body.className = '';
      body.innerHTML = storefrontSwitchHtml() + channelSectionHtml() + colorSectionHtml() + currencySectionHtml() + phrasesSectionHtml();
      wire();
      body.querySelectorAll('[data-mc-storefront]').forEach((btn) => btn.addEventListener('click', () => {
        const next = btn.dataset.mcStorefront ? Number(btn.dataset.mcStorefront) : null;
        if (next === storefrontId) return;
        storefrontId = next;
        editingKey = null;
        colorDraft = null;
        load();
      }));
    }

    /** Витрины: переключатель «чей бренд» — только если у канала есть второй бот. */
    function storefrontSwitchHtml() {
      if (channelAdminOf) return '';
      const list = state.storefronts || [];
      if (list.length === 0) return '';
      const chip = (id, label, active) => `<button type="button" data-mc-storefront="${id === null ? '' : id}"
          class="px-3 py-1.5 rounded-full text-sm border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}">${escapeHtmlClient(label)}</button>`;
      return `<section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Чей бот настраиваем</div>
          <div class="flex flex-wrap gap-2">
            ${chip(null, 'Основной бот', storefrontId === null)}
            ${list.map((sf) => chip(sf.id, sf.botUsername ? `${sf.title} · @${sf.botUsername}` : sf.title, storefrontId === sf.id)).join('')}
          </div>
          <div class="text-[11px] text-gray-400 px-1 mt-1">Клиенты каждого бота видят только его название, ссылку, менеджера и тексты.</div>
        </section>`;
    }

    /** Сохраняет все поля разом (сервер принимает полный набор); `changes` — что поменялось в этом блоке. */
    async function saveFields(button, changes, okText) {
      button.disabled = true;
      try {
        state = await callServer('updateMyBranding', { ...state.fields, ...changes }, storefrontId);
        colorDraft = null;
        showSaveToast(true, okText);
        render();
      } catch (error) {
        button.disabled = false;
        showSaveToast(false, error.message);
      }
    }

    function wire() {
      document.getElementById('mc-save').addEventListener('click', (event) => saveFields(event.currentTarget, {
        channelTitle: document.getElementById('mc-title').value,
        channelUrl: document.getElementById('mc-url').value,
        managerContact: document.getElementById('mc-manager').value,
        brandEmoji: document.getElementById('mc-emoji').value
      }, 'Сохранено — бот уже пишет по-новому'));

      document.querySelectorAll('[data-color]').forEach((btn) => btn.addEventListener('click', () => {
        colorDraft = btn.dataset.color;
        render();
      }));
      document.getElementById('mc-color-custom').addEventListener('change', (event) => {
        colorDraft = event.target.value;
        render();
      });
      document.getElementById('mc-color-save').addEventListener('click', (event) => {
        const color = colorDraft !== null ? colorDraft : (state.fields.accentColor || '');
        // Цвет как у Dream Dolls по умолчанию — не храним (пусто = по умолчанию).
        saveFields(event.currentTarget, { accentColor: color === MY_CHANNEL_COLORS[0].hex ? '' : color },
          'Цвет сохранён — клиенты увидят его при следующем открытии приложения');
      });

      const curSave = document.getElementById('mc-cur-save');
      if (curSave) {
        const ids = ['mc-cur-one', 'mc-cur-few', 'mc-cur-many', 'mc-cur-plural', 'mc-cur-emoji'];
        const preview = () => {
          const [one, few, many] = ids.map((id) => document.getElementById(id).value.trim());
          const d = state.defaults.currency;
          document.getElementById('mc-cur-preview').textContent = `Будет: 1 ${one || d.one} · 2 ${few || d.few} · 5 ${many || d.many} · 21 ${one || d.one}`;
        };
        ids.forEach((id) => document.getElementById(id).addEventListener('input', preview));
        preview();
        curSave.addEventListener('click', (event) => saveFields(event.currentTarget, {
          currencyOne: document.getElementById('mc-cur-one').value,
          currencyFew: document.getElementById('mc-cur-few').value,
          currencyMany: document.getElementById('mc-cur-many').value,
          currencyPlural: document.getElementById('mc-cur-plural').value,
          currencyEmoji: document.getElementById('mc-cur-emoji').value
        }, 'Валюта сохранена'));
      }

      document.querySelectorAll('[data-phrase-edit]').forEach((btn) => btn.addEventListener('click', () => {
        editingKey = btn.dataset.phraseEdit;
        render();
        const area = document.getElementById('mc-phrase-text');
        if (area) area.focus();
      }));

      document.querySelectorAll('[data-phrase-reset]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!(await showConfirmModal('Вернуть стандартный текст этой фразы?', { confirmLabel: 'Вернуть' }))) return;
        await savePhrase(btn.dataset.phraseReset, '');
      }));

      const save = document.getElementById('mc-phrase-save');
      if (save) {
        save.addEventListener('click', () => savePhrase(editingKey, document.getElementById('mc-phrase-text').value));
        document.getElementById('mc-phrase-cancel').addEventListener('click', () => { editingKey = null; render(); });
      }
    }

    async function savePhrase(key, text) {
      const phrase = state.phrases.find((p) => p.key === key);
      // Текст совпал со стандартным — не храним копию (иначе она «застынет» при смене названия/ссылки).
      const value = phrase && text.trim() === phrase.defaultText ? '' : text;
      // Пилот limisteam (13.10.2026, просьба VASY): «Кнопку» в приветствии не убираем — по ней другие каналы
      // узнают про бота. Предупреждение, не запрет.
      if (key === 'start.greeting' && value.trim() && !/кнопк/i.test(value)
        && !await showConfirmModal('В приветствии нет слова «Кнопка». Просим его оставить: по нему другие каналы узнают про бота, и чем известнее бренд, тем больше доверия у клиенток. Сохранить без него?', { confirmLabel: 'Сохранить так', cancelLabel: 'Вернусь и добавлю' })) {
        return;
      }
      try {
        state = await callServer('setMyBrandText', key, value, storefrontId);
        editingKey = null;
        showSaveToast(true, value ? 'Фраза сохранена' : 'Вернули стандартный текст');
        render();
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }
  }
};
