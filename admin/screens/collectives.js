'use strict';

/**
 * Экран "Коллективки" — список + создание новой. Детальная карточка
 * (Э2, 24.08.2026) переехала на адресуемый маршрут `collectives/{id}`
 * (`collective-detail.js`, `router.js`) — весь код модалки
 * (`collective-detail-modal`) и алгоритм связанных ползунков сверки
 * (`redistributeShares`/`normalizeSharesSum`/`updateSliderPositions`)
 * вырезаны отсюда тем же срезом, доли теперь не проценты, а units,
 * нормализуются на сервере (§2.4 плана).
 *
 * Не входит в нижнюю навигацию (открывается иконкой из orders.js), но сама
 * навигация остаётся видимой (showNav:true, navKey:null в маршруте — см.
 * router.js).
 */
/**
 * Сортировка списка коллективок (репорт VASY 27.08.2026, п.7; доработка
 * 30.08.2026 добавила sentAtAsc/sentAtDesc) — чистая функция (без DOM),
 * вынесена из render() ради юнит-теста (collectives-sort.test.js). Не
 * мутирует `list` — возвращает новый массив.
 * `'default'` — как пришло с сервера (`collectivesRepository.getAll`,
 * `ORDER BY id`, т.е. по возрастанию — старые сначала); `'newest'` — тот же
 * порядок в обратную сторону (id растёт монотонно с созданием, поэтому
 * reverse() эквивалентен сортировке по дате без парсинга отображаемой
 * dd.MM.yyyy строки, которая сама по себе не лексикографически сортируема).
 * `sentAtAsc`/`sentAtDesc` — по ISO `c.sentAt` (сортируема как строка
 * лексикографически, но парсим через `Date` явно для ясности); коллективки
 * БЕЗ даты отправки (`sentAt:null`, ещё не отправлены) — ВСЕГДА в конце
 * списка независимо от направления, не путаются с "самой ранней датой".
 * @param {Object[]} list
 * @param {string} sortKey 'default'|'newest'|'orderCount'|'name'|'status'|'sentAtAsc'|'sentAtDesc'
 * @returns {Object[]}
 */
function sortCollectives(list, sortKey) {
  const arr = list.slice();
  switch (sortKey) {
    case 'newest':
      return arr.reverse();
    case 'orderCount':
      return arr.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
    case 'name':
      return arr.sort((a, b) => (a.name || a.collectiveId).localeCompare(b.name || b.collectiveId, 'ru'));
    case 'status':
      return arr.sort((a, b) => (a.status || '').localeCompare(b.status || '', 'ru'));
    case 'sentAtAsc':
    case 'sentAtDesc':
      return arr.sort((a, b) => {
        if (!a.sentAt && !b.sentAt) return 0;
        if (!a.sentAt) return 1; // без даты — всегда в конец
        if (!b.sentAt) return -1;
        const diff = new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
        return sortKey === 'sentAtAsc' ? diff : -diff;
      });
    default:
      return arr;
  }
}

window.Screens = window.Screens || {};
window.Screens.collectives = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Коллективки${helpIcon('Что такое коллективка', '<p>Коллективка — это физическая объединённая посылка Казахстан → Россия, в которую собирают несколько заказов разных клиентов для одной пересылки (экономия на доставке).</p><p>Здесь вы создаёте коллективку (трек-номер), привязываете к ней заказы клиентов и следите за общим статусом доставки.</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="add-collective-btn" title="Новая коллективка" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="collective-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/треку/названию..." autocomplete="off">
        </div>

        <!-- Фильтр по этапу (Э4 рефакторинга коллективок, §3, 24.08.2026) —
             тот же список этапов, что backend collectiveStages.js. -->
        <div class="flex gap-1.5 mb-2" id="stage-filter-tabs">
          <button type="button" data-stage="" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">Все</button>
          <button type="button" data-stage="КЗ→РФ" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">КЗ→РФ</button>
          <button type="button" data-stage="По РФ" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">По РФ</button>
        </div>

        <!-- Сортировка (репорт VASY 27.08.2026, п.7) — чисто клиентская, без
             похода на сервер: сервер уже отдаёт список в порядке создания
             (id по возрастанию, см. collectivesRepository.getAll), поэтому
             "Сначала новые" — просто reverse(), без парсинга отображаемой
             даты dd.MM.yyyy (не лексикографически сортируема саму по себе). -->
        <div class="flex items-center justify-between px-1 mb-2">
          <div class="text-[11px] text-gray-400" id="collective-count"></div>
          <select id="collective-sort-select" class="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded-full px-2 py-1 outline-none">
            <option value="default">Дата создания: сначала старые</option>
            <option value="newest">Дата создания: сначала новые</option>
            <option value="sentAtAsc">Дата отправки: сначала ранние</option>
            <option value="sentAtDesc">Дата отправки: сначала поздние</option>
            <option value="orderCount">По кол-ву заказов</option>
            <option value="name">По названию</option>
            <option value="status">По статусу</option>
          </select>
        </div>

        <!-- Поиск/фильтр по дате отправки (доработка 30.08.2026) — необязательный
             диапазон, свёрнут по умолчанию (репорт "можно даже добавить поиск
             по дате"), не заменяет текстовый поиск выше, дополняет его. -->
        <div class="flex items-center justify-between px-1 mb-2">
          <button type="button" id="date-filter-toggle-btn" class="text-[11px] font-medium text-indigo-600 inline-flex items-center gap-1">
            <i data-lucide="calendar" class="w-3.5 h-3.5"></i> Фильтр по дате отправки
          </button>
        </div>
        <div id="date-filter-panel" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-2 flex items-center gap-2">
          <div class="flex-1">
            <label class="text-[10px] text-gray-400">С</label>
            <input type="date" id="date-filter-from" class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400">
          </div>
          <div class="flex-1">
            <label class="text-[10px] text-gray-400">По</label>
            <input type="date" id="date-filter-to" class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400">
          </div>
          <button type="button" id="date-filter-clear-btn" title="Сбросить" class="p-2 text-gray-400 hover:text-gray-600 self-end">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <div id="collective-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Коллективок не найдено</div>
      </main>

      <div id="create-collective-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Новая коллективка</h2>
            <button id="create-collective-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Название</label>
              <input type="text" id="new-collective-name" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Обязательно, только для менеджера — клиент не видит">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Трек-номер</label>
              <input type="text" id="new-collective-track" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Необязательно, можно добавить позже">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Этап</label>
              <select id="new-collective-stage" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white">
                <option value="КЗ→РФ">КЗ→РФ</option>
                <option value="По РФ">По РФ</option>
              </select>
            </div>
            <div id="create-collective-error" class="text-xs text-red-500 hidden"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="create-collective-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="create-collective-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Создать</button>
          </div>
        </div>
      </div>
    `;

    let allCollectives = [];
    let stageFilter = ''; // '' = все этапы

    const listContainer = document.getElementById('collective-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('collective-list-search');
    const countLabel = document.getElementById('collective-count');
    const sortSelect = document.getElementById('collective-sort-select');
    sortSelect.addEventListener('change', () => render());

    // Фильтр по этапу (Э4, §3) — тот же принцип, что режим "Выбрать" на
    // других экранах: активная кнопка подсвечена, состояние в замыкании.
    const stageFilterBtns = document.querySelectorAll('.stage-filter-btn');
    function renderStageFilterButtons() {
      stageFilterBtns.forEach((btn) => {
        const active = btn.dataset.stage === stageFilter;
        btn.className = `stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500'}`;
      });
    }
    stageFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        stageFilter = btn.dataset.stage;
        renderStageFilterButtons();
        render();
      });
    });
    renderStageFilterButtons();

    // Фильтр по дате отправки (доработка 30.08.2026) — свёрнут по умолчанию,
    // не мешает уже привычному текстовому поиску.
    const dateFilterToggleBtn = document.getElementById('date-filter-toggle-btn');
    const dateFilterPanel = document.getElementById('date-filter-panel');
    const dateFilterFrom = document.getElementById('date-filter-from');
    const dateFilterTo = document.getElementById('date-filter-to');
    dateFilterToggleBtn.addEventListener('click', () => dateFilterPanel.classList.toggle('hidden'));
    dateFilterFrom.addEventListener('change', () => render());
    dateFilterTo.addEventListener('change', () => render());
    document.getElementById('date-filter-clear-btn').addEventListener('click', () => {
      dateFilterFrom.value = '';
      dateFilterTo.value = '';
      render();
    });

    loadCollectives();

    async function loadCollectives() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        allCollectives = await callServer('getCollectivesList');
        render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    const handleSearch = debounce(() => render(), 250);
    searchInput.addEventListener('input', handleSearch);

    function render() {
      const query = searchInput.value.trim().toLowerCase();
      let filtered = allCollectives;
      if (stageFilter !== '') {
        filtered = filtered.filter(c => c.stage === stageFilter);
      }
      if (query !== '') {
        filtered = filtered.filter(c => `${c.collectiveId} ${c.trackNumber} ${c.name}`.toLowerCase().includes(query));
      }
      // Диапазон по дате отправки (доработка 30.08.2026) — коллективки БЕЗ
      // даты отправки (ещё не отправлены) выпадают из результата, как только
      // задана хотя бы одна граница — так и должно быть, у них нет даты,
      // которую можно сравнить с диапазоном.
      const dateFrom = dateFilterFrom.value; // 'yyyy-MM-dd' или ''
      const dateTo = dateFilterTo.value;
      if (dateFrom !== '' || dateTo !== '') {
        filtered = filtered.filter((c) => {
          if (!c.sentAt) return false;
          const sentDateOnly = c.sentAt.slice(0, 10);
          if (dateFrom !== '' && sentDateOnly < dateFrom) return false;
          if (dateTo !== '' && sentDateOnly > dateTo) return false;
          return true;
        });
      }
      filtered = sortCollectives(filtered, sortSelect.value);

      countLabel.textContent = `Найдено: ${filtered.length}`;
      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        filtered.forEach(c => listContainer.appendChild(buildCard(c)));
      }
    }

    function buildCard(c) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => navigateTo(`collectives/${encodeURIComponent(c.collectiveId)}`));

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(c.name || c.collectiveId)}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">${c.name ? `ID ${escapeHtmlClient(c.collectiveId)}${c.trackNumber ? ' · трек ' + escapeHtmlClient(c.trackNumber) : ''}` : (c.trackNumber ? `Трек: ${escapeHtmlClient(c.trackNumber)}` : 'Трек не указан')}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0 text-right">
            <div>${escapeHtmlClient(c.createdAt)}</div>
            ${c.sentAtDisplay ? `<div class="text-emerald-600">отправлено ${escapeHtmlClient(c.sentAtDisplay)}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">${escapeHtmlClient(c.stage)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">${escapeHtmlClient(c.status)}</span>
          <span class="text-[11px] text-gray-500">Заказов: ${c.orderCount}</span>
        </div>
      `;
      return card;
    }

    // --- Создание новой коллективки ---
    const createModal = document.getElementById('create-collective-modal');
    const createErrorText = document.getElementById('create-collective-error');
    document.getElementById('add-collective-btn').addEventListener('click', () => {
      document.getElementById('new-collective-name').value = '';
      document.getElementById('new-collective-track').value = '';
      document.getElementById('new-collective-stage').value = 'КЗ→РФ';
      createErrorText.classList.add('hidden');
      createModal.classList.remove('hidden');
      createModal.classList.add('flex');
    });
    function closeCreateModal() {
      createModal.classList.add('hidden');
      createModal.classList.remove('flex');
    }
    document.getElementById('create-collective-close').addEventListener('click', closeCreateModal);
    document.getElementById('create-collective-cancel').addEventListener('click', closeCreateModal);
    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 5): ни одна из write-кнопок этого
    // экрана не блокировалась на время запроса — двойной тап на "Создать"
    // мог породить две коллективки подряд (тот же класс риска, что уже
    // 4+ раза находили в разных углах проекта).
    const createSaveBtn = document.getElementById('create-collective-save');
    createSaveBtn.addEventListener('click', async () => {
      if (createSaveBtn.disabled) return;
      createErrorText.classList.add('hidden');
      const name = document.getElementById('new-collective-name').value.trim();
      const trackNumber = document.getElementById('new-collective-track').value.trim();
      const stage = document.getElementById('new-collective-stage').value;

      // Название обязательно с Э2 (VASY, Q5) — та же валидация уже стоит на
      // сервере (createCollective отказывает без имени), проверяем и здесь,
      // чтобы не тратить round-trip и показать ошибку сразу под полем.
      if (name === '') {
        createErrorText.textContent = 'Название коллективки обязательно.';
        createErrorText.classList.remove('hidden');
        return;
      }

      createSaveBtn.disabled = true;
      try {
        await callServer('createCollective', { name, trackNumber, stage });
        closeCreateModal();
        loadCollectives();
      } catch (error) {
        createErrorText.textContent = error.message;
        createErrorText.classList.remove('hidden');
        showSaveToast(false, 'Не удалось создать коллективку: ' + error.message);
      } finally {
        createSaveBtn.disabled = false;
      }
    });
  }
};
