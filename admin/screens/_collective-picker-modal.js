'use strict';

/**
 * Модалка "выбрать коллективку" (Э3 рефакторинга коллективок, 24.08.2026,
 * REFACTOR-COLLECTIVES.md §3) — общий модуль по образцу `_delete-order-
 * modal.js`, подключается и в `orders.js` ("В коллективку"/перенос
 * массового выбора), и в `collective-detail.js` ("Перенести в другую").
 * Список коллективок (`getCollectivesList`) запрашивается заново при
 * КАЖДОМ открытии — `orderCount` нужен свежим для текста подтверждения
 * "пересчитается на оставшиеся N" на вызывающей стороне.
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${CollectivePickerModal.html()}`;
 *   const picker = CollectivePickerModal.init({
 *     onPicked: (collective) => { ...собрать текст подтверждения, дальше assign... }
 *   });
 *   picker.open({ excludeCollectiveId: currentCollectiveId }); // excludeCollectiveId необязателен
 *
 * Аудит коллективок, п.6Б (27.08.2026, репорт VASY) — "Продолжить как «По
 * РФ»" (collective-detail.js): `open({ stageFilter, allowCreate })`.
 * `stageFilter` — список сужается ТОЛЬКО до коллективок этого этапа (при
 * переходе КЗ→РФ → По РФ нет смысла показывать/выбрать коллективку первого
 * этапа). `allowCreate:true` добавляет строку "+ Создать новую" ПЕРВОЙ в
 * списке — открывает лёгкую inline-форму (только "Название", `stageFilter`
 * уже известен и не переспрашивается), по сохранению зовёт `createCollective`
 * и передаёт результат в `onPicked` тем же путём, что выбор существующей —
 * вызывающей стороне не нужно различать "выбрана" / "создана".
 *
 * Коллективки 2.0 (10.10.2026): строка показывает название, статус, куда
 * едет, трек, число заказов и дату; порядок — `sortCollectives(...,'smart')`
 * (в работе и свежие сверху); завершённые по всем шагам (`progress.done`)
 * свёрнуты под «Показать завершённые». `open({title})` — свой заголовок.
 */
window.CollectivePickerModal = {
  html() {
    return `
      <div id="collective-picker-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900" id="collective-picker-title">Выбрать коллективку</h2>
            <button type="button" id="collective-picker-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 pb-2 shrink-0">
            <input type="text" id="collective-picker-search" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Поиск по названию, ID или треку..." autocomplete="off">
          </div>
          <!-- Аудит коллективок, п.6Б, 27.08.2026 — inline-форма создания,
               видна только когда open({allowCreate:true}) и после клика на
               "+ Создать новую" в списке ниже. -->
          <div id="collective-picker-create-block" class="hidden px-4 pb-3 shrink-0 space-y-2">
            <input type="text" id="collective-picker-create-name" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Название новой коллективки">
            <div id="collective-picker-create-error" class="text-xs text-red-500 hidden"></div>
            <div class="flex gap-2">
              <button type="button" id="collective-picker-create-cancel" class="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
              <button type="button" id="collective-picker-create-save" class="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Создать</button>
            </div>
          </div>
          <div id="collective-picker-list" class="overflow-y-auto px-4 pb-4 flex-1 space-y-1.5"></div>
          <div id="collective-picker-empty" class="hidden text-center text-sm text-gray-400 py-6">Коллективки не найдены</div>
          <div id="collective-picker-loading" class="text-center text-sm text-gray-400 py-6">Загрузка...</div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onPicked: (collective:{collectiveId:string,name:string,trackNumber:string,status:string,orderCount:number}) => void }} options
   * @returns {{ open: (opts?:{excludeCollectiveId?:string, stageFilter?:string, allowCreate?:boolean, title?:string}) => void }}
   */
  init({ onPicked }) {
    let all = [];
    let excludeId = null;
    let stageFilter = null; // п.6Б — null = все этапы, как раньше
    let allowCreate = false;
    let createStage = null;

    const modal = document.getElementById('collective-picker-modal');
    const searchInput = document.getElementById('collective-picker-search');
    const listEl = document.getElementById('collective-picker-list');
    const emptyEl = document.getElementById('collective-picker-empty');
    const loadingEl = document.getElementById('collective-picker-loading');
    const createBlock = document.getElementById('collective-picker-create-block');
    const createNameInput = document.getElementById('collective-picker-create-name');
    const createErrorEl = document.getElementById('collective-picker-create-error');
    const createSaveBtn = document.getElementById('collective-picker-create-save');

    function close() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      hideCreateForm();
    }

    function showCreateForm() {
      createBlock.classList.remove('hidden');
      createNameInput.value = '';
      createErrorEl.classList.add('hidden');
      listEl.classList.add('hidden');
      searchInput.parentElement.classList.add('hidden');
    }

    function hideCreateForm() {
      createBlock.classList.add('hidden');
      listEl.classList.remove('hidden');
      searchInput.parentElement.classList.remove('hidden');
    }

    let showDone = false;

    function rowHtml(c) {
      const stageLabel = (typeof collectiveStageLabel === 'function') ? collectiveStageLabel(c.stage) : c.stage;
      const date = c.sentAtDisplay ? `отправлена ${c.sentAtDisplay}` : (c.createdAt ? `создана ${c.createdAt}` : '');
      const meta = [c.status, stageLabel, c.trackNumber ? `трек ${c.trackNumber}` : '', `заказов: ${c.orderCount}`, date].filter(Boolean);
      return `
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-900 break-words">${escapeHtmlClient(c.name || ('ID ' + c.collectiveId))}</div>
            <div class="text-[11px] text-gray-500">${meta.map(escapeHtmlClient).join(' · ')}</div>
            ${c.name ? `<div class="text-[10px] text-gray-400">ID ${escapeHtmlClient(c.collectiveId)}</div>` : ''}
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
        `;
    }

    function appendRow(c) {
      const row = document.createElement('div');
      row.className = 'p-3 border border-gray-200 rounded-xl cursor-pointer active:bg-gray-50 flex items-center justify-between gap-2';
      row.dataset.pickCollective = c.collectiveId;
      row.innerHTML = rowHtml(c);
      row.addEventListener('click', () => {
        close();
        onPicked(c);
      });
      listEl.appendChild(row);
    }

    function render() {
      const query = searchInput.value.trim().toLowerCase();
      const matched = all.filter((c) => {
        if (excludeId && c.collectiveId === excludeId) return false;
        if (stageFilter && c.stage !== stageFilter) return false;
        if (query === '') return true;
        return `${c.collectiveId} ${c.name} ${c.trackNumber || ''}`.toLowerCase().includes(query);
      });
      const sorted = typeof sortCollectives === 'function' ? sortCollectives(matched, 'smart') : matched;
      const isDone = (c) => !!(c.progress && c.progress.done);
      const active = sorted.filter((c) => !isDone(c));
      const done = sorted.filter(isDone);

      listEl.innerHTML = '';
      // "+ Создать новую" — всегда первой строкой в режиме allowCreate, даже
      // если фильтр по этапу ничего не нашёл.
      if (allowCreate) {
        const createRow = document.createElement('div');
        createRow.id = 'collective-picker-create-row';
        createRow.className = 'p-3 border border-dashed border-indigo-300 rounded-xl cursor-pointer active:bg-indigo-50 flex items-center gap-2 text-indigo-600';
        const stageLabel = stageFilter && typeof collectiveStageLabel === 'function' ? collectiveStageLabel(stageFilter) : stageFilter;
        createRow.innerHTML = `<i data-lucide="plus" class="w-4 h-4 shrink-0"></i><span class="text-sm font-medium">Создать новую коллективку${stageFilter && stageFilter !== 'КЗ→РФ' ? ` («${escapeHtmlClient(stageLabel)}»)` : ''}</span>`;
        createRow.addEventListener('click', showCreateForm);
        listEl.appendChild(createRow);
      }
      emptyEl.classList.toggle('hidden', sorted.length > 0 || allowCreate);

      active.forEach(appendRow);
      // Завершённые (все шаги закрыты) свёрнуты: в них обычно не добавляют;
      // при поиске показываем сразу — раз искали, значит нужна.
      if (done.length > 0) {
        if (showDone || query !== '') {
          const sep = document.createElement('div');
          sep.className = 'text-[11px] text-gray-400 pt-2 px-1';
          sep.textContent = `Завершённые: ${done.length}`;
          listEl.appendChild(sep);
          done.forEach(appendRow);
        } else {
          const more = document.createElement('button');
          more.type = 'button';
          more.id = 'collective-picker-show-done';
          more.className = 'w-full py-2 text-[12px] font-medium text-indigo-600';
          more.textContent = `Показать завершённые (${done.length})`;
          more.addEventListener('click', () => { showDone = true; render(); });
          listEl.appendChild(more);
        }
      }
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.addEventListener('input', debounce(render, 150));

    document.getElementById('collective-picker-create-cancel').addEventListener('click', hideCreateForm);
    createSaveBtn.addEventListener('click', async () => {
      if (createSaveBtn.disabled) return;
      const name = createNameInput.value.trim();
      if (name === '') {
        createErrorEl.textContent = 'Название коллективки обязательно.';
        createErrorEl.classList.remove('hidden');
        return;
      }
      createSaveBtn.disabled = true;
      try {
        const stage = createStage || 'КЗ→РФ';
        // createCollective отдаёт только {collectiveId,label} — достраиваем
        // остальные поля из уже известных локально значений, чтобы
        // onPicked() получал ТОТ ЖЕ форм-фактор объекта, что при выборе
        // существующей коллективки из списка (name/stage/orderCount).
        const created = await callServer('createCollective', { name, trackNumber: '', stage });
        close();
        onPicked({ collectiveId: created.collectiveId, name, trackNumber: '', stage, status: '', orderCount: 0 });
      } catch (error) {
        createErrorEl.textContent = error.message;
        createErrorEl.classList.remove('hidden');
      } finally {
        createSaveBtn.disabled = false;
      }
    });

    async function open(opts) {
      excludeId = (opts && opts.excludeCollectiveId) || null;
      stageFilter = (opts && opts.stageFilter) || null;
      allowCreate = !!(opts && opts.allowCreate);
      createStage = stageFilter;
      showDone = false;
      document.getElementById('collective-picker-title').textContent = (opts && opts.title) || 'Выбрать коллективку';
      searchInput.value = '';
      listEl.innerHTML = '';
      hideCreateForm();
      emptyEl.classList.add('hidden');
      loadingEl.classList.remove('hidden');
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      try {
        all = await callServer('getCollectivesList', { progress: true });
        loadingEl.classList.add('hidden');
        render();
      } catch (error) {
        loadingEl.textContent = 'Не удалось загрузить список: ' + error.message;
      }
    }

    document.getElementById('collective-picker-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    return { open };
  }
};
