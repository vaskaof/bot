'use strict';

/**
 * Экран «Проверка каталога» — автоаудит по справочнику кукол
 * (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.10, шаг 1; VASY «да» 24.09.2026).
 *
 * Однозначные совпадения система уже отметила сама (теги с пометкой
 * источника). Здесь — только то, где решает человек:
 * - «Ссылка ≠ название»: ссылка позиции указывает на другую куклу, чем её
 *   название (или ссылки спорят между собой) — ошибка в ссылке или в названии;
 * - «Несколько»: подходит несколько моделей справочника (Dead Tired 2011 и 2012);
 * - «Дубли»: у нескольких позиций один код модели — это одна кукла;
 *   объединение — тем же окном «Слияние позиций», что в «Дублях» каталога;
 * - «Не нашлось»: справочник не знает такую куклу (или в названии мало данных).
 * Выбор нажатием: «Это она» пишет теги как решение человека — автоаудит их
 * больше не трогает. «Скрыть» — ничего не подходит, строка уходит до
 * переименования позиции.
 *
 * Не в нижней навигации (маршрут catalog/check), вход иконкой «Проверка» с
 * экрана «Каталог».
 */
window.Screens = window.Screens || {};
window.Screens.catalogCheck = {
  render(root) {
    const SECTIONS = [
      { key: 'linkConflicts', label: 'Ссылка ≠ название' },
      { key: 'multiple', label: 'Несколько' },
      { key: 'duplicates', label: 'Дубли' },
      { key: 'notFound', label: 'Не нашлось' }
    ];
    const TYPE_LABELS = { doll: 'кукла', doll_set: 'набор кукол', playset: 'плейсет', plush: 'плюш', figure: 'фигурка', accessory: 'аксессуары', non_doll: 'не кукольное' };
    const VIA_LABELS = { link_code: 'по ссылке', model_code: 'по коду в названии', character_line: 'по персонажу и серии', character_generation: 'по персонажу и поколению' };
    let report = null;
    let section = 'linkConflicts';
    let sectionChosen = false;
    let pollTimer = null;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Проверка${helpIcon('Проверка каталога', '<p>Каждую ночь и после сохранения позиции система сверяет каталог со справочником кукол (вики Monster High, магазины Mattel). Если кукла определяется <b>однозначно</b> — по коду модели в ссылке, фото или названии, либо по персонажу и серии, — линейка, персонажи, год, тип и код ставятся сами, с пометкой источника.</p><p>Здесь — только то, где нужен человек:</p><p><b>Ссылка ≠ название</b> — ссылка ведёт на другую куклу, чем названа позиция. Ошибиться могли и в ссылке, и в названии.</p><p><b>Несколько</b> — подходят несколько кукол (одинаковые названия разных лет). Нажмите «Это она» у нужной.</p><p><b>Дубли</b> — у позиций один код модели производителя, это одна кукла. «Сравнить» откроет обычное слияние, ничего не сливается само.</p><p><b>Не нашлось</b> — справочник такую куклу не знает. «Скрыть» убирает строку.</p><p>Ваш выбор система больше не меняет.</p>')}</h1>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('header-actions').innerHTML = `
      <button id="check-refresh-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('check-refresh-btn').addEventListener('click', () => load());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="check-status" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 text-xs text-gray-500"></div>
        <div id="check-tabs" class="grid grid-cols-4 bg-gray-200/60 rounded-xl p-1 mb-3 text-[11px] font-medium"></div>
        <div id="check-body"></div>
      </main>
      ${MergeCompare.html()}
    `;

    const statusEl = document.getElementById('check-status');
    const tabsEl = document.getElementById('check-tabs');
    const body = document.getElementById('check-body');
    const mergeCompare = MergeCompare.init({ onMerged: () => load() });

    function formatDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    async function load() {
      if (!report) body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        report = await callServer('getCatalogCheckReport');
        if (!sectionChosen) {
          // Открываем первый непустой раздел.
          const first = SECTIONS.find(s => (report[s.key] || []).length > 0);
          if (first) section = first.key;
        }
        render();
        schedulePoll();
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    // Пока идёт обновление справочника (минуты) — тихо перечитываем экран.
    function schedulePoll() {
      if (pollTimer) clearTimeout(pollTimer);
      if (report && report.running) {
        pollTimer = setTimeout(() => {
          if (document.getElementById('check-body')) load();
        }, 15000);
      }
    }

    function renderStatus() {
      const sync = report.sync || [];
      const c = report.counts || {};
      const syncHtml = sync.length === 0
        ? '<div class="text-amber-600">Справочник ещё не загружен — нажмите «Обновить справочник» (несколько минут) или дождитесь ночи.</div>'
        : sync.map(s => `
            <div class="flex items-center justify-between gap-2">
              <span class="truncate">${escapeHtmlClient(s.label)}</span>
              <span class="shrink-0 ${s.ok ? 'text-gray-400' : 'text-rose-500'}">${s.ok
                ? `${s.modelCount} мод. · ${formatDate(s.syncedAt)}`
                : `ошибка ${formatDate(s.attemptedAt)}${s.syncedAt ? ` (данные от ${formatDate(s.syncedAt)})` : ''}`}</span>
            </div>
            ${s.ok ? '' : `<div class="text-[10px] text-rose-400 break-words">${escapeHtmlClient(s.error)}</div>`}
          `).join('');
      statusEl.innerHTML = `
        <div class="space-y-1 mb-2">${syncHtml}</div>
        <div class="text-gray-700 mb-2">
          Проверено: ${formatDate(report.lastAuditAt)} ·
          определено автоматически <b>${c.unique || 0}</b>, выбрано вручную <b>${c.chosen || 0}</b>${c.dismissed ? `, скрыто ${c.dismissed}` : ''}
          ${c.outOfScope ? `<span class="text-gray-400">· других брендов ${c.outOfScope} (справочника пока нет)</span>` : ''}
        </div>
        ${report.running
          ? '<div class="text-indigo-600 inline-flex items-center gap-1.5"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>Идёт обновление справочника…</div>'
          : `<div class="grid grid-cols-2 gap-2">
              <button type="button" id="check-run-btn" class="py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">Проверить сейчас</button>
              <button type="button" id="check-sync-btn" class="py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium disabled:opacity-50">Обновить справочник</button>
            </div>`}
      `;
      const runBtn = document.getElementById('check-run-btn');
      if (runBtn) {
        runBtn.addEventListener('click', async () => {
          runBtn.disabled = true;
          try {
            const r = await callServer('runCatalogReferenceAudit');
            showSaveToast(true, r && r.skipped ? 'Справочник ещё не загружен' : `Проверено позиций: ${r.total}`);
            await load();
          } catch (error) {
            showSaveToast(false, error.message);
            runBtn.disabled = false;
          }
        });
      }
      const syncBtn = document.getElementById('check-sync-btn');
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          syncBtn.disabled = true;
          try {
            await callServer('refreshDollReference');
            showSaveToast(true, 'Обновление справочника запущено — несколько минут');
            await load();
          } catch (error) {
            showSaveToast(false, error.message);
            syncBtn.disabled = false;
          }
        });
      }
    }

    function renderTabs() {
      tabsEl.innerHTML = SECTIONS.map(s => {
        const n = (report[s.key] || []).length;
        const active = s.key === section;
        return `<button type="button" data-section="${s.key}" class="py-1.5 px-1 rounded-lg leading-tight ${active ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'}">
          ${escapeHtmlClient(s.label)}<span class="block text-[10px] ${n > 0 && s.key !== 'notFound' ? 'text-rose-500' : 'text-gray-400'}">${n}</span>
        </button>`;
      }).join('');
      tabsEl.querySelectorAll('[data-section]').forEach(btn => btn.addEventListener('click', () => {
        section = btn.dataset.section;
        sectionChosen = true;
        render();
      }));
    }

    function linksHtml(links) {
      if (!links || links.length === 0) return '<div class="text-[11px] text-gray-300">Ссылок нет</div>';
      return `<div class="space-y-0.5 mt-1">${links.map(u => `<a href="${escapeHtmlClient(u)}" target="_blank" rel="noopener" class="block text-[11px] text-indigo-500 truncate">${escapeHtmlClient(u)}</a>`).join('')}</div>`;
    }

    function skuHeadHtml(row) {
      return `
        <div class="flex items-start gap-3">
          ${row.imageUrl ? `<img src="${escapeHtmlClient(row.imageUrl)}" alt="" class="w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            ${row.shortName ? `<div class="font-semibold text-gray-900 text-sm">${escapeHtmlClient(row.shortName)}</div>` : ''}
            <div class="${row.shortName ? 'text-[11px] text-gray-400' : 'font-semibold text-gray-900 text-sm'} break-words">${escapeHtmlClient(row.original)}</div>
            ${row.modelCode ? `<div class="text-[11px] text-gray-500 mt-0.5">Код: ${escapeHtmlClient(row.modelCode)}</div>` : ''}
            ${linksHtml(row.links)}
          </div>
        </div>
      `;
    }

    function candidateHtml(c, rowIdx, candIdx, isLinkModel) {
      const path = [c.line, c.subline].filter(Boolean).join(' › ');
      const facts = [
        c.modelCode ? `<b>${escapeHtmlClient(c.modelCode)}</b>` : '<span class="text-gray-400">без кода</span>',
        c.year ? String(c.year) : '<span class="text-gray-400">год ?</span>',
        c.generation ? escapeHtmlClient(c.generation) : '',
        TYPE_LABELS[c.productType] ? TYPE_LABELS[c.productType] : ''
      ].filter(Boolean).join(' · ');
      return `
        <div class="border ${isLinkModel ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'} rounded-xl p-2.5 flex items-start gap-2">
          ${c.imageUrl ? `<img src="${escapeHtmlClient(c.imageUrl)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1 text-[12px]">
            ${isLinkModel ? '<div class="text-[10px] text-amber-700 font-medium">По ссылке</div>' : ''}
            <div class="font-medium text-gray-900">${escapeHtmlClient((c.characters || []).join(' + ') || c.title || '—')}</div>
            ${path ? `<div class="text-gray-600">${escapeHtmlClient(path)}</div>` : (c.title ? `<div class="text-gray-500 break-words">${escapeHtmlClient(c.title)}</div>` : '')}
            <div class="text-gray-500">${facts}</div>
            ${c.url ? `<a href="${escapeHtmlClient(c.url)}" target="_blank" rel="noopener" class="text-[11px] text-indigo-500">${escapeHtmlClient(c.sourceLabel || 'источник')} ↗</a>` : `<span class="text-[11px] text-gray-400">${escapeHtmlClient(c.sourceLabel || '')}</span>`}
          </div>
          <button type="button" class="choose-btn shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-medium disabled:opacity-50" data-row="${rowIdx}" data-cand="${candIdx}">Это она</button>
        </div>
      `;
    }

    function choiceRowHtml(row, idx) {
      const isConflict = section === 'linkConflicts';
      const more = row.candidateCount > row.candidates.length ? `<div class="text-[11px] text-gray-400">и ещё ${row.candidateCount - row.candidates.length} — уточните название (год, серия), чтобы сузить</div>` : '';
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 space-y-2" data-row-card="${idx}">
          ${skuHeadHtml(row)}
          ${row.reasonLabel ? `<div class="text-[11px] ${isConflict ? 'text-amber-700' : 'text-gray-500'}">${escapeHtmlClient(row.reasonLabel)}${row.textLines && row.textLines.length ? ` · в названии: ${escapeHtmlClient(row.textLines.join(', '))}` : ''}</div>` : ''}
          <div class="space-y-2">
            ${row.candidates.map((c, ci) => candidateHtml(c, idx, ci, isConflict && ci === 0)).join('')}
          </div>
          ${more}
          <div class="flex justify-end">
            <button type="button" class="dismiss-btn text-[11px] text-gray-400 hover:text-rose-500 disabled:opacity-50" data-row="${idx}">Ничего не подходит — скрыть</button>
          </div>
        </div>
      `;
    }

    function notFoundRowHtml(row, idx) {
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 space-y-2">
          ${skuHeadHtml(row)}
          <div class="flex items-center justify-between gap-2">
            <div class="text-[11px] text-gray-500">${escapeHtmlClient(row.reasonLabel || 'Нет в справочнике')}</div>
            <button type="button" class="dismiss-btn shrink-0 text-[11px] text-gray-400 hover:text-rose-500 disabled:opacity-50" data-row="${idx}">Скрыть</button>
          </div>
        </div>
      `;
    }

    function duplicateGroupHtml(group, gi) {
      const [first, ...others] = group.skus;
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 space-y-2">
          <div class="text-[12px] text-gray-700">Один код модели: <b>${escapeHtmlClient(group.modelCode)}</b> — это одна кукла</div>
          <div class="border border-gray-100 rounded-xl p-2">${skuHeadHtml(first)}</div>
          ${others.map((s, oi) => `
            <div class="border border-gray-100 rounded-xl p-2 space-y-2">
              ${skuHeadHtml(s)}
              <div class="flex justify-end gap-2">
                <button type="button" class="not-dup-btn px-2 py-1 rounded-lg border border-gray-200 text-gray-600 text-[11px] disabled:opacity-50" data-group="${gi}" data-other="${oi}">Это разные</button>
                <button type="button" class="merge-btn px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-group="${gi}" data-other="${oi}">Сравнить и объединить</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    const EMPTY = {
      linkConflicts: 'Ссылки и названия не спорят.',
      multiple: 'Все позиции определены однозначно или разобраны.',
      duplicates: 'Позиций с одинаковым кодом модели нет.',
      notFound: 'Всё, что относится к справочнику, в нём нашлось.'
    };

    function renderSection() {
      const rows = report[section] || [];
      if (rows.length === 0) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-gray-400">${EMPTY[section]}</div>`;
        return;
      }
      if (section === 'duplicates') body.innerHTML = rows.map(duplicateGroupHtml).join('');
      else if (section === 'notFound') body.innerHTML = rows.map(notFoundRowHtml).join('');
      else body.innerHTML = rows.map(choiceRowHtml).join('');

      body.querySelectorAll('.choose-btn').forEach(btn => btn.addEventListener('click', async () => {
        const row = rows[Number(btn.dataset.row)];
        const cand = row.candidates[Number(btn.dataset.cand)];
        body.querySelectorAll(`.choose-btn[data-row="${btn.dataset.row}"]`).forEach(b => { b.disabled = true; });
        try {
          await callServer('chooseCatalogReferenceCandidate', row.original, cand.key);
          showSaveToast(true, 'Отмечено');
          await load();
        } catch (error) {
          showSaveToast(false, error.message);
          body.querySelectorAll(`.choose-btn[data-row="${btn.dataset.row}"]`).forEach(b => { b.disabled = false; });
        }
      }));
      body.querySelectorAll('.dismiss-btn').forEach(btn => btn.addEventListener('click', async () => {
        const row = rows[Number(btn.dataset.row)];
        btn.disabled = true;
        try {
          await callServer('dismissCatalogCheckItem', row.original);
          await load();
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
        }
      }));
      body.querySelectorAll('.merge-btn').forEach(btn => btn.addEventListener('click', () => {
        const group = rows[Number(btn.dataset.group)];
        mergeCompare.open(group.skus[0].original, group.skus[Number(btn.dataset.other) + 1].original);
      }));
      body.querySelectorAll('.not-dup-btn').forEach(btn => btn.addEventListener('click', async () => {
        const group = rows[Number(btn.dataset.group)];
        btn.disabled = true;
        try {
          await callServer('recordCatalogDedupVerdict', group.skus[0].original, group.skus[Number(btn.dataset.other) + 1].original, 'not_duplicate');
          await load();
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
        }
      }));
    }

    function render() {
      renderStatus();
      renderTabs();
      renderSection();
      if (window.lucide) window.lucide.createIcons();
    }

    load();
  }
};
