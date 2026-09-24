'use strict';

/**
 * Экран «Линейки» — справочник веток каталога (IMPLEMENTATION-PLAN-
 * GAMIFICATION.md §2.7 Т1; вид подтверждён VASY 24.09.2026, §10):
 * - «Дерево»: бренд → поколение → линейка с числом кукол и пометкой
 *   «состав сверен»; добавление/переименование/перенос веток, удаление
 *   только пустых;
 * - «Разметка серий»: различающиеся серии из старых текстовых тегов →
 *   ветка одним действием (серия запоминается, дальше система относит
 *   такие позиции сама);
 * - «Персонажи»: словарь персонажей с вариантами написания (§11.7).
 *
 * Не в нижней навигации (маршрут catalog/lines), вход иконкой «Линейки» с
 * экрана «Каталог» — тот же паттерн, что «Коллекции».
 */
window.Screens = window.Screens || {};
window.Screens.catalogLines = {
  render(root) {
    const KIND_LABELS = { brand: 'Бренд', generation: 'Поколение', line: 'Линейка' };
    let tab = 'tree';
    let tree = { lines: [], unassignedSkus: 0, totalSkus: 0 };
    let ordered = [];
    let seriesGroups = [];
    let characters = [];
    const expanded = new Set();
    let expandedInitialized = false;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Линейки${helpIcon('Справочник линеек', '<p><b>Дерево</b> — бренд → поколение → линейка. По нему клиентские «Коллекции» собираются сами, без ручных наборов. «Состав сверен» — ветка проверена по справочнику, только тогда клиенту покажется праздник «Коллекция собрана!».</p><p><b>Разметка серий</b> — старые текстовые серии каталога. Отнесите серию к ветке один раз — все позиции с ней переедут туда, а новые система будет относить сама.</p><p><b>Персонажи</b> — одно имя на персонажа и все его написания (SASHA = Sasha), чтобы не было путаницы.</p>')}</h1>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="flex bg-gray-200/60 rounded-xl p-1 mb-3 text-sm font-medium">
          <button type="button" data-tab="tree" class="lines-tab flex-1 py-1.5 rounded-lg">Дерево</button>
          <button type="button" data-tab="series" class="lines-tab flex-1 py-1.5 rounded-lg">Разметка серий</button>
          <button type="button" data-tab="characters" class="lines-tab flex-1 py-1.5 rounded-lg">Персонажи</button>
        </div>
        <div id="lines-body"></div>
      </main>

      <div id="lines-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 id="lines-modal-title" class="text-base font-semibold text-gray-900 min-w-0 truncate"></h2>
            <button id="lines-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600 shrink-0">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="lines-modal-body" class="p-4 space-y-3 overflow-y-auto custom-scrollbar"></div>
          <div id="lines-modal-error" class="px-4 pb-2 text-xs text-red-500 hidden"></div>
          <div id="lines-modal-footer" class="p-4 border-t border-gray-100 flex gap-2 shrink-0"></div>
        </div>
      </div>
    `;

    const body = document.getElementById('lines-body');
    const modal = document.getElementById('lines-modal');

    // --- Модалка ---
    function openModal(title, bodyHtml, buttons) {
      document.getElementById('lines-modal-title').textContent = title;
      document.getElementById('lines-modal-body').innerHTML = bodyHtml;
      const err = document.getElementById('lines-modal-error');
      err.classList.add('hidden');
      const footer = document.getElementById('lines-modal-footer');
      footer.innerHTML = '';
      footer.classList.toggle('hidden', buttons.length === 0);
      for (const b of buttons) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = b.primary
          ? 'flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50'
          : 'flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium';
        el.textContent = b.label;
        el.addEventListener('click', async () => {
          if (!b.onClick) { closeModal(); return; }
          el.disabled = true;
          try {
            await b.onClick();
          } catch (error) {
            err.textContent = error.message;
            err.classList.remove('hidden');
          } finally {
            el.disabled = false;
          }
        });
        footer.appendChild(el);
      }
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }
    function closeModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    document.getElementById('lines-modal-close').addEventListener('click', closeModal);
    function field(id) { return document.getElementById(id); }
    const inputCls = 'w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400';

    // --- Загрузка ---
    async function loadTree() {
      tree = await callServer('getCatalogLinesTree');
      ordered = LinesUtil.ordered(tree.lines);
      if (!expandedInitialized) {
        // По умолчанию раскрыты бренды — видно поколения, дальше по тапу.
        ordered.filter(l => l.depth === 0).forEach(l => expanded.add(l.id));
        expandedInitialized = true;
      }
    }
    async function loadTab() {
      body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        await loadTree();
        if (tab === 'series') seriesGroups = await callServer('getCatalogSeriesMapping');
        if (tab === 'characters') characters = await callServer('listCatalogCharacters');
        renderTab();
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderHeaderActions() {
      const addTitle = tab === 'characters' ? 'Новый персонаж' : 'Новый бренд';
      document.getElementById('header-actions').innerHTML = `
        <button id="lines-refresh-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="refresh-cw" class="w-5 h-5"></i>
        </button>
        ${tab === 'series' ? '' : `<button id="lines-add-btn" title="${addTitle}" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="plus" class="w-6 h-6"></i>
        </button>`}
      `;
      document.getElementById('lines-refresh-btn').addEventListener('click', loadTab);
      const addBtn = document.getElementById('lines-add-btn');
      if (addBtn) addBtn.addEventListener('click', () => (tab === 'characters' ? openCharacterForm(null) : openLineForm(null, null)));
      if (window.lucide) window.lucide.createIcons();
    }

    function renderTabs() {
      document.querySelectorAll('.lines-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-gray-900', active);
        btn.classList.toggle('text-gray-500', !active);
      });
    }
    document.querySelectorAll('.lines-tab').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.tab === tab) return;
      tab = btn.dataset.tab;
      renderTabs();
      renderHeaderActions();
      loadTab();
    }));

    function renderTab() {
      if (tab === 'tree') renderTree();
      else if (tab === 'series') renderSeries();
      else renderCharacters();
      if (window.lucide) window.lucide.createIcons();
    }

    // --- Дерево ---
    function yearsText(line) {
      if (line.yearFrom && line.yearTo) return line.yearFrom === line.yearTo ? String(line.yearFrom) : `${line.yearFrom}–${line.yearTo}`;
      if (line.yearFrom) return `с ${line.yearFrom}`;
      if (line.yearTo) return `до ${line.yearTo}`;
      return '';
    }
    function isVisible(line) {
      const byId = new Map(ordered.map(l => [l.id, l]));
      for (let p = line.parentId; p; p = byId.get(p) ? byId.get(p).parentId : null) {
        if (!expanded.has(p)) return false;
      }
      return true;
    }

    function renderTree() {
      const assigned = tree.totalSkus - tree.unassignedSkus;
      const pct = tree.totalSkus > 0 ? Math.round(assigned * 100 / tree.totalSkus) : 0;
      const summary = `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3">
          <div class="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Позиций каталога в ветках</span><span class="tabular-nums">${assigned} из ${tree.totalSkus}</span>
          </div>
          <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full bg-indigo-500" style="width:${pct}%"></div></div>
        </div>`;
      if (ordered.length === 0) {
        body.innerHTML = summary + `<div class="text-center text-sm text-gray-400 py-8">Веток пока нет. Начните с бренда — кнопка «+» вверху.</div>`;
        return;
      }
      const rows = ordered.filter(isVisible).map(line => {
        const hasChildren = line.childIds.length > 0;
        const isOpen = expanded.has(line.id);
        const sub = [line.nameRu, yearsText(line)].filter(Boolean).join(' · ');
        return `
          <div class="flex items-center gap-1 pr-3 py-1.5 border-b border-gray-50 last:border-0" style="padding-left:${6 + line.depth * 16}px">
            ${hasChildren
              ? `<button type="button" data-toggle="${line.id}" class="w-7 h-7 shrink-0 grid place-items-center text-gray-400 rounded-lg active:bg-gray-100"><i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4"></i></button>`
              : '<span class="w-7 h-7 shrink-0"></span>'}
            <button type="button" data-open="${line.id}" class="flex-1 min-w-0 text-left py-0.5">
              <div class="text-sm ${line.depth === 0 ? 'font-semibold' : 'font-medium'} text-gray-900 truncate">${escapeHtmlClient(line.name)}</div>
              ${sub ? `<div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(sub)}</div>` : ''}
            </button>
            ${line.referenceStatus === 'verified' ? '<span class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">сверено</span>' : ''}
            <span class="shrink-0 w-8 text-right text-xs text-gray-500 tabular-nums">${line.totalSkus}</span>
          </div>`;
      }).join('');
      body.innerHTML = summary + `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 py-1">${rows}</div>`;
    }

    body.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        const id = Number(toggle.dataset.toggle);
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        renderTab();
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) { openLineActions(Number(open.dataset.open)); return; }
      const series = e.target.closest('[data-series]');
      if (series) { openSeriesAssign(seriesGroups[Number(series.dataset.series)]); return; }
      const character = e.target.closest('[data-character]');
      if (character) { openCharacterForm(characters.find(c => c.id === Number(character.dataset.character))); return; }
      if (e.target.closest('#add-character-inline')) openCharacterForm(null);
    });

    function lineById(id) { return ordered.find(l => l.id === id); }

    function openLineActions(id) {
      const line = lineById(id);
      if (!line) return;
      const canDelete = line.childCount === 0 && line.directSkus === 0;
      const verified = line.referenceStatus === 'verified';
      const actionBtn = (act, icon, label, extra) => `
        <button type="button" data-act="${act}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm ${extra || 'text-gray-800 active:bg-gray-50'}">
          <i data-lucide="${icon}" class="w-4 h-4 shrink-0"></i><span>${label}</span>
        </button>`;
      openModal(line.path, `
        <div class="text-xs text-gray-500 -mt-1">${KIND_LABELS[line.kind] || ''} · ${line.totalSkus} поз. каталога${line.aliases.length ? ` · серии: ${escapeHtmlClient(line.aliases.join(', '))}` : ''}</div>
        <div class="space-y-0.5">
          ${actionBtn('edit', 'pencil', 'Изменить')}
          ${actionBtn('add', 'plus', 'Добавить подветку')}
          ${actionBtn('move', 'move', 'Перенести')}
          ${actionBtn('verify', verified ? 'circle-slash' : 'badge-check', verified ? 'Снять «состав сверен»' : 'Отметить «состав сверен»')}
          ${canDelete
            ? actionBtn('delete', 'trash-2', 'Удалить', 'text-red-600 active:bg-red-50')
            : `<div class="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300"><i data-lucide="trash-2" class="w-4 h-4"></i><span>Удалить — только пустую ветку</span></div>`}
        </div>`, []);
      document.getElementById('lines-modal-body').querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'edit') openLineForm(line, null);
        else if (act === 'add') openLineForm(null, line);
        else if (act === 'move') openMoveForm(line);
        else if (act === 'verify') {
          try {
            await callServer('setCatalogLineReferenceStatus', line.id, verified ? 'draft' : 'verified');
            closeModal();
            showSaveToast(true, verified ? 'Отметка снята' : 'Состав отмечен сверенным');
            await loadTab();
          } catch (error) { showSaveToast(false, error.message); }
        } else if (act === 'delete') {
          if (!(await showConfirmModal(`Удалить ветку «${line.name}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
          try {
            await callServer('deleteCatalogLine', line.id);
            closeModal();
            showSaveToast(true, 'Ветка удалена');
            await loadTab();
          } catch (error) { showSaveToast(false, error.message); }
        }
      }));
    }

    /** line — редактирование; иначе создание под parent (null — корень, бренд). */
    function openLineForm(line, parent) {
      const isNew = !line;
      const defaultKind = isNew ? (parent ? (parent.depth === 0 ? 'generation' : 'line') : 'brand') : line.kind;
      const v = line || { name: '', nameRu: '', aliases: [], yearFrom: null, yearTo: null };
      const title = isNew ? (parent ? `Новая ветка в «${parent.name}»` : 'Новый бренд') : 'Изменить ветку';
      openModal(title, `
        <div>
          <label class="text-xs font-medium text-gray-500">Название (как у производителя) *</label>
          <input id="lf-name" class="${inputCls}" maxlength="150" value="${escapeHtmlClient(v.name)}" placeholder="Например: Dead Tired">
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500">Русское название</label>
          <input id="lf-name-ru" class="${inputCls}" maxlength="150" value="${escapeHtmlClient(v.nameRu)}" placeholder="Например: Смертельно уставшие">
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="text-xs font-medium text-gray-500">Вид</label>
            <select id="lf-kind" class="${inputCls} bg-white">
              ${Object.entries(KIND_LABELS).map(([k, l]) => `<option value="${k}"${k === defaultKind ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500">Год с</label>
            <input id="lf-year-from" inputmode="numeric" class="${inputCls}" value="${v.yearFrom || ''}" placeholder="2011">
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500">по</label>
            <input id="lf-year-to" inputmode="numeric" class="${inputCls}" value="${v.yearTo || ''}" placeholder="2013">
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500">Другие написания серии (через запятую)</label>
          <input id="lf-aliases" class="${inputCls}" value="${escapeHtmlClient(v.aliases.join(', '))}" placeholder="Необязательно">
          <div class="text-[11px] text-gray-400 mt-1">По ним система сама относит позиции каталога к этой ветке.</div>
        </div>`, [
        { label: 'Отмена' },
        {
          label: 'Сохранить', primary: true, onClick: async () => {
            const data = {
              name: field('lf-name').value,
              nameRu: field('lf-name-ru').value,
              kind: field('lf-kind').value,
              yearFrom: field('lf-year-from').value.trim(),
              yearTo: field('lf-year-to').value.trim(),
              aliases: field('lf-aliases').value.split(',')
            };
            if (isNew) {
              const created = await callServer('createCatalogLine', { ...data, parentId: parent ? parent.id : null });
              if (parent) expanded.add(parent.id);
              expanded.add(created.id);
            } else {
              await callServer('updateCatalogLine', line.id, data);
            }
            closeModal();
            showSaveToast(true, 'Сохранено');
            await loadTab();
          }
        }
      ]);
      setTimeout(() => field('lf-name').focus(), 50);
    }

    function openMoveForm(line) {
      const blocked = LinesUtil.subtreeIds(tree.lines, line.id);
      const targets = ordered.filter(l => !blocked.has(l.id));
      openModal(`Перенести «${line.name}»`, `
        <div>
          <label class="text-xs font-medium text-gray-500">Куда</label>
          <select id="mv-parent" class="${inputCls} bg-white">
            ${LinesUtil.optionsHtml(targets, line.parentId, '— в корень (отдельный бренд) —')}
          </select>
        </div>`, [
        { label: 'Отмена' },
        {
          label: 'Перенести', primary: true, onClick: async () => {
            const target = field('mv-parent').value;
            await callServer('moveCatalogLine', line.id, target ? Number(target) : null);
            if (target) expanded.add(Number(target));
            closeModal();
            showSaveToast(true, 'Ветка перенесена');
            await loadTab();
          }
        }
      ]);
    }

    // --- Разметка серий ---
    function renderSeries() {
      if (seriesGroups.length === 0) {
        body.innerHTML = '<div class="text-center text-sm text-gray-400 py-8">В каталоге нет позиций с заполненной серией.</div>';
        return;
      }
      const pending = seriesGroups.filter(g => g.unassigned > 0).length;
      const rows = seriesGroups.map((g, i) => {
        let status;
        if (g.unassigned === g.count) {
          status = `<span class="text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">не размечено</span>`;
        } else if (g.unassigned === 0 && g.lineIds.length === 1) {
          const line = lineById(g.lineIds[0]);
          status = `<span class="text-[11px] text-emerald-700 truncate">${escapeHtmlClient(line ? line.path : 'ветка')}</span>`;
        } else {
          status = `<span class="text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">частично</span>`;
        }
        return `
          <button type="button" data-series="${i}" class="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(g.series)}</div>
              <div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(g.brand || 'без бренда')} · ${g.count} поз.</div>
            </div>
            <div class="shrink-0 max-w-[45%] text-right">${status}</div>
          </button>`;
      }).join('');
      body.innerHTML = `
        <div class="text-xs text-gray-500 px-1 mb-2">Не размечено серий: ${pending} из ${seriesGroups.length}. Нажмите на серию и выберите ветку — все позиции с ней переедут туда.</div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100">${rows}</div>`;
    }

    function openSeriesAssign(group) {
      if (!group) return;
      if (ordered.length === 0) {
        showSaveToast(false, 'Сначала создайте ветки на вкладке «Дерево»');
        return;
      }
      const current = group.lineIds.length === 1 ? group.lineIds[0] : null;
      openModal(`Серия «${group.series}»`, `
        <div class="text-xs text-gray-500 -mt-1">${escapeHtmlClient(group.brand || 'без бренда')} · ${group.count} поз. каталога</div>
        <div>
          <label class="text-xs font-medium text-gray-500">Ветка</label>
          <select id="sa-line" class="${inputCls} bg-white">${LinesUtil.optionsHtml(ordered, current, '— выберите ветку —')}</select>
          <div class="text-[11px] text-gray-400 mt-1">Нужной ветки нет — создайте её на вкладке «Дерево». Позиции, ветку которым выбрали вручную в карточке, не перенесутся.</div>
        </div>`, [
        { label: 'Отмена' },
        {
          label: 'Разметить', primary: true, onClick: async () => {
            const lineId = field('sa-line').value;
            if (!lineId) throw new Error('Выберите ветку.');
            const res = await callServer('assignCatalogSeriesToLine', group.brand, group.series, Number(lineId));
            closeModal();
            showSaveToast(true, `Размечено позиций: ${res.updated}`);
            await loadTab();
          }
        }
      ]);
    }

    // --- Персонажи ---
    function renderCharacters() {
      const brandName = (id) => { const l = id ? lineById(id) : null; return l ? l.name : 'Без бренда'; };
      const groups = new Map();
      for (const c of characters) {
        const key = brandName(c.brandLineId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }
      if (characters.length === 0) {
        body.innerHTML = `<div class="text-center text-sm text-gray-400 py-8">Словарь персонажей пуст.<br>
          <button type="button" id="add-character-inline" class="mt-3 text-indigo-600 font-medium">Добавить персонажа</button></div>`;
        return;
      }
      body.innerHTML = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([brand, list]) => `
        <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1 mt-3 mb-1.5">${escapeHtmlClient(brand)} · ${list.length}</div>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
          ${list.map(c => `
            <button type="button" data-character="${c.id}" class="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(c.name)}${c.nameRu ? ` <span class="text-gray-400 font-normal">· ${escapeHtmlClient(c.nameRu)}</span>` : ''}</div>
                ${c.aliases.length ? `<div class="text-[11px] text-gray-400 truncate">также: ${escapeHtmlClient(c.aliases.join(', '))}</div>` : ''}
              </div>
              <span class="shrink-0 text-xs text-gray-500 tabular-nums">${c.skuCount}</span>
            </button>`).join('')}
        </div>`).join('');
    }

    function openCharacterForm(character) {
      const isNew = !character;
      const v = character || { name: '', nameRu: '', aliases: [], brandLineId: null };
      const brands = ordered.filter(l => l.depth === 0);
      const buttons = [{ label: 'Отмена' }];
      if (!isNew) {
        buttons.unshift({
          label: 'Удалить', onClick: async () => {
            if (!(await showConfirmModal(`Удалить персонажа «${character.name}»?`, { confirmLabel: 'Удалить', danger: true }))) return;
            await callServer('deleteCatalogCharacter', character.id);
            closeModal();
            showSaveToast(true, 'Персонаж удалён');
            await loadTab();
          }
        });
      }
      buttons.push({
        label: 'Сохранить', primary: true, onClick: async () => {
          const data = {
            name: field('cf-name').value,
            nameRu: field('cf-name-ru').value,
            brandLineId: field('cf-brand').value ? Number(field('cf-brand').value) : null,
            aliases: field('cf-aliases').value.split(',')
          };
          if (isNew) await callServer('createCatalogCharacter', data);
          else await callServer('updateCatalogCharacter', character.id, data);
          closeModal();
          showSaveToast(true, 'Сохранено');
          await loadTab();
        }
      });
      openModal(isNew ? 'Новый персонаж' : 'Персонаж', `
        <div>
          <label class="text-xs font-medium text-gray-500">Имя (как у производителя) *</label>
          <input id="cf-name" class="${inputCls}" maxlength="150" value="${escapeHtmlClient(v.name)}" placeholder="Например: Draculaura">
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500">Имя по-русски</label>
          <input id="cf-name-ru" class="${inputCls}" maxlength="150" value="${escapeHtmlClient(v.nameRu)}" placeholder="Например: Дракулаура">
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500">Бренд</label>
          <select id="cf-brand" class="${inputCls} bg-white">${LinesUtil.optionsHtml(brands, v.brandLineId, '— без бренда —')}</select>
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500">Другие написания (через запятую)</label>
          <input id="cf-aliases" class="${inputCls}" value="${escapeHtmlClient(v.aliases.join(', '))}" placeholder="Например: SASHA, Саша">
        </div>`, buttons);
      setTimeout(() => field('cf-name').focus(), 50);
    }

    renderTabs();
    renderHeaderActions();
    loadTab();
  }
};
