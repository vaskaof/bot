'use strict';

/**
 * Экран «Короткие названия» — названия по тегам (IMPLEMENTATION-PLAN-
 * GAMIFICATION.md §11.15, З1–З4 VASY 26.09.2026). Два шага:
 * - «Русские имена»: словарь персонажей и веток, участвующих в названиях.
 *   «Подсказать» — ИИ ищет, как менеджеры уже пишут имя в нынешних названиях
 *   (только подсказка в поле, пишет человек кнопкой «Сохранить»). Пусто —
 *   в названии будет английское имя (З2).
 * - «Названия»: «было → станет» по тегам, галочки + «Применить выбранные»,
 *   «Не надо» — больше не предлагать. Принятое пересобирается само при
 *   правке словаря, пока его не поменяли руками.
 * Позиции без ветки/персонажа не трогаются (З3).
 *
 * Маршрут catalog/short-names, вход — иконка «Имена» на экране «Каталог».
 */
window.Screens = window.Screens || {};
window.Screens.catalogShortNames = {
  render(root) {
    let tab = 'dictionary';
    let dict = { items: [], aiError: '' };
    let names = { items: [], unresolved: [], accepted: 0, tagged: 0, total: 0, missingRu: 0 };
    const suggested = new Map(); // key → подсказка ИИ (ещё не сохранена)

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Названия${helpIcon('Короткие названия', '<p>Короткое название собирается из тегов позиции: <b>Персонаж · Серия</b> («Хлоя · Скорчин»). У Skullector и коллабораций серия первой («Скуллектор · Гозер»). Если у двух позиций название совпало — добавляется год, потом код модели.</p><p><b>Русские имена</b> — как писать персонажа и серию по-русски. «Подсказать» ищет, как вы уже пишете их в нынешних названиях; пустое поле — останется английское имя. Ничего не сохраняется без кнопки «Сохранить».</p><p><b>Названия</b> — «было → станет». Отметьте нужные и нажмите «Применить». «Не надо» — позиция остаётся со своим названием. Принятые названия сами обновятся, если поправить русское имя; поправленное руками название система больше не меняет.</p><p>Позиции без серии или персонажа (другие бренды, не куклы) не трогаются.</p>')}</h1>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('header-actions').innerHTML = '';

    root.innerHTML = `
      <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="flex bg-gray-200/60 rounded-xl p-1 mb-3 text-sm font-medium">
          <button type="button" data-tab="dictionary" class="sn-tab flex-1 py-1.5 rounded-lg">1. Русские имена</button>
          <button type="button" data-tab="names" class="sn-tab flex-1 py-1.5 rounded-lg">2. Названия</button>
        </div>
        <div id="sn-body"></div>
      </main>
      <div id="sn-footer" class="hidden fixed bottom-0 inset-x-0 bg-white/95 border-t border-gray-100 p-3 z-40">
        <div class="max-w-2xl mx-auto flex gap-2" id="sn-footer-inner"></div>
      </div>
    `;
    const body = document.getElementById('sn-body');
    const footer = document.getElementById('sn-footer');
    const footerInner = document.getElementById('sn-footer-inner');
    const keyOf = (it) => `${it.kind}:${it.id}`;

    function setTabs() {
      document.querySelectorAll('.sn-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-indigo-600', active);
        btn.classList.toggle('text-gray-500', !active);
      });
    }
    document.querySelectorAll('.sn-tab').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.tab === tab) return;
      tab = btn.dataset.tab;
      setTabs();
      load();
    }));

    async function load() {
      body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      footer.classList.add('hidden');
      try {
        if (tab === 'dictionary') {
          dict = await callServer('getCatalogNameDictionary', {});
          renderDictionary();
        } else {
          names = await callServer('getCatalogTagShortNames');
          renderNames();
        }
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
      if (window.lucide) window.lucide.createIcons();
    }

    // --- 1. Русские имена ---

    function dictRowHtml(it) {
      const key = keyOf(it);
      const value = it.nameRu || suggested.get(key) || '';
      const isSuggested = !it.nameRu && suggested.has(key);
      return `
        <div class="bg-white rounded-xl border border-gray-100 p-2.5 space-y-1">
          <div class="flex items-baseline justify-between gap-2">
            <div class="text-sm font-medium text-gray-900 break-words">${escapeHtmlClient(it.name)}</div>
            <div class="text-[10px] text-gray-400 shrink-0">${it.skuCount} поз.</div>
          </div>
          <input type="text" maxlength="60" class="sn-ru-input w-full text-sm border ${isSuggested ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} rounded-lg px-2 py-1" data-key="${escapeHtmlClient(key)}" value="${escapeHtmlClient(value)}" placeholder="по-английски: ${escapeHtmlClient(it.name)}">
          ${isSuggested ? '<div class="text-[10px] text-amber-700">Подсказка — проверьте и сохраните</div>' : ''}
          ${it.examples.length ? `<div class="text-[11px] text-gray-400 break-words">Сейчас: ${it.examples.map(escapeHtmlClient).join(' · ')}</div>` : ''}
        </div>
      `;
    }

    function renderDictionary() {
      const chars = dict.items.filter(i => i.kind === 'character');
      const lines = dict.items.filter(i => i.kind === 'line');
      const empty = dict.items.filter(i => !i.nameRu).length;
      body.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-3 text-xs text-gray-600 space-y-2">
          <div>Имён: <b>${dict.items.length}</b>, без русского — <b>${empty}</b>. Пустое поле — в названии останется английское имя.</div>
          ${dict.aiError ? `<div class="text-rose-500">${escapeHtmlClient(dict.aiError)}</div>` : ''}
          <button type="button" id="sn-suggest-btn" class="w-full py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-medium disabled:opacity-50">Подсказать из нынешних названий</button>
        </div>
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Персонажи</div>
        <div class="space-y-2 mb-4">${chars.map(dictRowHtml).join('') || '<div class="text-xs text-gray-400">Нет</div>'}</div>
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Серии</div>
        <div class="space-y-2">${lines.map(dictRowHtml).join('') || '<div class="text-xs text-gray-400">Нет</div>'}</div>
      `;
      document.getElementById('sn-suggest-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = 'Ищу в названиях…';
        try {
          const res = await callServer('getCatalogNameDictionary', { suggest: true });
          res.items.forEach(it => { if (it.suggested) suggested.set(keyOf(it), it.suggested); });
          dict = res;
          renderDictionary();
          const n = res.items.filter(it => it.suggested).length;
          showSaveToast(true, n ? `Подсказано: ${n}` : 'Подсказок не нашлось');
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
          btn.textContent = 'Подсказать из нынешних названий';
        }
      });
      footerInner.innerHTML = '<button type="button" id="sn-save-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">Сохранить</button>';
      footer.classList.remove('hidden');
      document.getElementById('sn-save-btn').addEventListener('click', saveDictionary);
    }

    async function saveDictionary(e) {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      const byKey = new Map(dict.items.map(it => [keyOf(it), it]));
      const entries = [];
      body.querySelectorAll('.sn-ru-input').forEach(input => {
        const it = byKey.get(input.dataset.key);
        const value = input.value.trim();
        if (it && value !== (it.nameRu || '')) entries.push({ kind: it.kind, id: it.id, nameRu: value });
      });
      if (entries.length === 0) { showSaveToast(false, 'Ничего не изменено.'); return; }
      btn.disabled = true;
      try {
        const res = await callServer('saveCatalogNameDictionary', entries);
        entries.forEach(en => suggested.delete(`${en.kind}:${en.id}`));
        showSaveToast(true, `Сохранено: ${res.saved}${res.renamed ? `, названий обновлено: ${res.renamed}` : ''}`);
        await load();
      } catch (error) {
        showSaveToast(false, error.message);
        btn.disabled = false;
      }
    }

    // --- 2. Названия ---

    function renderNames() {
      const n = names;
      const head = `
        <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-3 text-xs text-gray-600 space-y-1">
          <div>С тегами: <b>${n.tagged}</b> из ${n.total} позиций · принято из тегов: <b>${n.accepted}</b></div>
          ${n.missingRu ? `<div class="text-amber-700">Без русского имени: ${n.missingRu} — в названиях будет английское. Заполните на шаге 1.</div>` : ''}
          ${n.unresolved.length ? `<div class="text-rose-500">Не различить даже с годом и кодом: ${n.unresolved.length} — название не предлагается.</div>` : ''}
        </div>
      `;
      if (n.items.length === 0) {
        body.innerHTML = head + '<div class="p-6 text-center text-sm text-gray-400">Новых предложений нет — все названия совпадают с тегами или решены.</div>';
        return;
      }
      body.innerHTML = head + `
        <label class="flex items-center gap-2 text-xs text-gray-600 mb-2 px-1"><input type="checkbox" id="sn-all" checked> Выбрать все (${n.items.length})</label>
        <div class="space-y-2">${n.items.map((it, idx) => `
          <div class="bg-white rounded-xl border border-gray-100 p-2.5 flex items-start gap-2">
            <input type="checkbox" class="sn-pick mt-1" data-idx="${idx}" checked>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-gray-400 line-through break-words">${escapeHtmlClient(it.current || '(пусто)')}</div>
              <div class="text-sm font-medium ${it.tooLong ? 'text-rose-600' : 'text-gray-900'} break-words">${escapeHtmlClient(it.suggested)}</div>
              ${it.long ? `<div class="text-[10px] ${it.tooLong ? 'text-rose-500' : 'text-amber-600'}">${it.suggested.length} симв. — длинно для плитки, сократите имя на шаге 1</div>` : ''}
              <div class="text-[10px] text-gray-300 break-words">${escapeHtmlClient(it.original)}</div>
            </div>
            <button type="button" class="sn-reject shrink-0 text-[11px] text-gray-400 hover:text-rose-500 disabled:opacity-50" data-idx="${idx}">Не надо</button>
          </div>
        `).join('')}</div>
      `;
      const allBox = document.getElementById('sn-all');
      const picks = () => [...body.querySelectorAll('.sn-pick')];
      allBox.addEventListener('change', () => { picks().forEach(cb => { cb.checked = allBox.checked; }); updateApply(); });
      picks().forEach(cb => cb.addEventListener('change', updateApply));
      body.querySelectorAll('.sn-reject').forEach(btn => btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          await callServer('rejectCatalogTagShortName', n.items[Number(btn.dataset.idx)].original);
          await load();
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
        }
      }));
      footerInner.innerHTML = '<button type="button" id="sn-apply-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"></button>';
      footer.classList.remove('hidden');
      const applyBtn = document.getElementById('sn-apply-btn');
      function updateApply() {
        const count = picks().filter(cb => cb.checked).length;
        applyBtn.textContent = `Применить выбранные (${count})`;
        applyBtn.disabled = count === 0;
      }
      updateApply();
      applyBtn.addEventListener('click', async () => {
        if (applyBtn.disabled) return;
        const originals = picks().filter(cb => cb.checked).map(cb => n.items[Number(cb.dataset.idx)].original);
        applyBtn.disabled = true;
        try {
          const res = await callServer('applyCatalogTagShortNames', originals);
          showSaveToast(true, `Применено: ${res.applied}`);
          await load();
        } catch (error) {
          showSaveToast(false, error.message);
          updateApply();
        }
      });
    }

    setTabs();
    load();
  }
};
