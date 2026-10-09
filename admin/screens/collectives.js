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
 *
 * Коллективки 2.0 (10.10.2026, IMPLEMENTATION-PLAN-COLLECTIVES-2.md, этап 1):
 * вкладки «В работе» / «Без коллективки» / «Завершённые» со свайпом.
 * «Завершённые» — все шаги закрыты (`progress.done`, решение VASY 10.10);
 * незакрытое висит «В работе» с пометками, чего не хватает. «Без коллективки»
 * — пул заказов (`getCollectivePool`), из него — «В коллективку».
 */

/** Подписи плеч для людей (VASY 10.10: «плечо» менеджерам непонятно). */
const COLLECTIVE_STAGE_LABELS = { 'КЗ→РФ': 'Казахстан → Россия', 'По РФ': 'По России' };
function collectiveStageLabel(stage) {
  return COLLECTIVE_STAGE_LABELS[stage] || stage || '';
}

/**
 * Сортировка списка коллективок (репорт VASY 27.08.2026, п.7; доработка
 * 30.08.2026 добавила sentAtAsc/sentAtDesc; 10.10.2026 — `smart`) — чистая
 * функция (без DOM), вынесена из render() ради юнит-теста
 * (collectives-sort.test.js). Не мутирует `list` — возвращает новый массив.
 * `'default'` — как пришло с сервера (`collectivesRepository.getAll`,
 * `ORDER BY id`, т.е. по возрастанию — старые сначала); `'newest'` — тот же
 * порядок в обратную сторону (id растёт монотонно с созданием, поэтому
 * reverse() эквивалентен сортировке по дате без парсинга отображаемой
 * dd.MM.yyyy строки, которая сама по себе не лексикографически сортируема).
 * `sentAtAsc`/`sentAtDesc` — по ISO `c.sentAt`; коллективки БЕЗ даты
 * отправки — ВСЕГДА в конце списка независимо от направления.
 * `smart` (по умолчанию с 10.10.2026, VASY: «свежие/в работе сверху») —
 * незакрытый статус выше закрытого, внутри — `lastActivityAt` (отправка,
 * иначе создание) по убыванию; без даты — в конец, порядок сервера.
 * @param {Object[]} list
 * @param {string} sortKey 'smart'|'default'|'newest'|'orderCount'|'name'|'status'|'sentAtAsc'|'sentAtDesc'
 * @returns {Object[]}
 */
function sortCollectives(list, sortKey) {
  const arr = list.slice();
  switch (sortKey) {
    case 'smart': {
      const closed = (c) => (c.progress ? (c.progress.isTerminal ? 1 : 0) : (/Завершено|Доставлено/.test(c.status || '') ? 1 : 0));
      const ts = (c) => (c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : -Infinity);
      return arr
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (closed(a.c) - closed(b.c)) || (ts(b.c) - ts(a.c)) || (b.i - a.i))
        .map((x) => x.c);
    }
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

/**
 * Пометки «чего не хватает» на карточке коллективки «В работе» (10.10.2026) —
 * чистая функция для теста. Полные фразы с числом после двоеточия: окончания
 * не приклеиваем (правило проекта про мн. число).
 * @param {{sdekPriceMissing:number, sdekUnpaid:number, sdekRemainingRub:number, behindCount:number, reconciled:boolean, isTerminal:boolean}|undefined} progress
 * @param {{sentAt:string|null}} c
 * @returns {string[]}
 */
function collectiveWarnings(progress, c) {
  if (!progress) return [];
  const out = [];
  if ((progress.isTerminal || (c && c.sentAt)) && !progress.reconciled) out.push('Чек СДЭК не внесён');
  if (progress.sdekPriceMissing > 0) out.push(`Цена СДЭК не выставлена: ${progress.sdekPriceMissing}`);
  if (progress.sdekUnpaid > 0) out.push(`Не оплатили СДЭК: ${progress.sdekUnpaid} · ${Math.round(progress.sdekRemainingRub).toLocaleString('ru-RU')} ₽`);
  if (progress.behindCount > 0) out.push(`Отстали по статусу: ${progress.behindCount}`);
  return out;
}

/** Группы пула по порядку показа (решение VASY 10.10). */
const POOL_GROUPS = [
  { key: 'kz', title: 'Уже в Казахстане', hint: 'склад КЗ, курьер или у посредника — можно отправлять' },
  { key: 'enroute', title: 'Сейчас едут', hint: 'из магазина в США и дальше в Казахстан' },
  { key: 'store', title: 'Ждут отправки с магазина', hint: '', collapsed: true }
];

/**
 * Раскладка пула по группам — чистая функция для теста.
 * @param {{group:string}[]} items
 * @returns {Object<string, Object[]>}
 */
function groupPool(items) {
  const out = { kz: [], enroute: [], store: [] };
  for (const it of items || []) if (out[it.group]) out[it.group].push(it);
  return out;
}

const COLLECTIVES_SORT_KEY = 'knopkaCollectivesSort';

window.Screens = window.Screens || {};
window.Screens.collectives = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Коллективки${helpIcon('Что такое коллективка', '<p>Коллективка — одна посылка, в которой едут заказы разных клиентов (дешевле доставка). Даже один заказ отправляем коллективкой.</p><p><b>В работе</b> — посылки, по которым ещё что-то нужно сделать (статус, чек СДЭК, оплаты клиентов). <b>Без коллективки</b> — заказы, которые ещё никуда не собраны. <b>Завершённые</b> — всё сделано.</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="add-collective-btn" title="Новая коллективка" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    let savedSort = 'smart';
    try { savedSort = localStorage.getItem(COLLECTIVES_SORT_KEY) || 'smart'; } catch (e) { /* хранилище недоступно — по умолчанию */ }

    root.innerHTML = `
      <main class="pt-16 pb-28 px-4 md:px-0 max-w-2xl md:max-w-6xl mx-auto">
        <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3" id="collectives-tabs">
          <button type="button" data-tab="work" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">В работе</button>
          <button type="button" data-tab="pool" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Без коллективки</button>
          <button type="button" data-tab="done" class="flex-1 py-1.5 px-0.5 rounded-lg text-[13px] font-medium">Завершённые</button>
        </div>

        <div id="collectives-list-panel">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
            <input type="text" id="collective-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/треку/названию..." autocomplete="off">
          </div>

          <!-- Фильтр по этапу (Э4, §3, 24.08.2026). 10.10.2026 — скрыт, пока нет
               ни одной коллективки «По России» (на проде их нет). -->
          <div class="hidden flex gap-1.5 mb-2" id="stage-filter-tabs">
            <button type="button" data-stage="" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">Все</button>
            <button type="button" data-stage="КЗ→РФ" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">Казахстан → Россия</button>
            <button type="button" data-stage="По РФ" class="stage-filter-btn px-3 py-1.5 rounded-full text-xs font-medium border">По России</button>
          </div>

          <div class="flex items-center justify-between px-1 mb-2 gap-2">
            <div class="text-[11px] text-gray-400" id="collective-count"></div>
            <select id="collective-sort-select" class="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded-full px-2 py-1 outline-none">
              <option value="smart">Сначала в работе, свежие сверху</option>
              <option value="default">Дата создания: сначала старые</option>
              <option value="newest">Дата создания: сначала новые</option>
              <option value="sentAtAsc">Дата отправки: сначала ранние</option>
              <option value="sentAtDesc">Дата отправки: сначала поздние</option>
              <option value="orderCount">По кол-ву заказов</option>
              <option value="name">По названию</option>
              <option value="status">По статусу</option>
            </select>
          </div>

          <!-- Фильтр по дате отправки (доработка 30.08.2026), свёрнут по умолчанию. -->
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

          <div id="collective-list" class="wide-grid"></div>
          <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Коллективок не найдено</div>
        </div>

        <div id="collectives-pool-panel" class="hidden">
          <div class="text-[12px] text-gray-500 px-1 mb-3">Заказы, которые ещё не собраны ни в одну коллективку. Отметь нужные нажатием и нажми «В коллективку».</div>
          <div id="pool-list"></div>
        </div>
      </main>

      <!-- Панель выбора пула — поверх нижней навигации (тот же приём, что #bulk-actions-bar в «Заказах»). -->
      <div id="pool-actions-bar" data-bottom-bar class="hidden fixed bottom-0 inset-x-0 z-[55] bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div class="max-w-2xl mx-auto flex items-center gap-2">
          <div class="text-sm text-gray-700 flex-1" id="pool-selected-count"></div>
          <button type="button" id="pool-cancel-btn" class="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Снять выбор</button>
          <button type="button" id="pool-assign-btn" class="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">В коллективку</button>
        </div>
      </div>

      ${CollectivePickerModal.html()}

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
              <label class="text-xs font-medium text-gray-500">Куда едет</label>
              <select id="new-collective-stage" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white">
                <option value="КЗ→РФ">Казахстан → Россия</option>
                <option value="По РФ">По России</option>
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
    let pool = [];
    let poolLoaded = false;
    let stageFilter = ''; // '' = все этапы
    let tab = params && ['work', 'pool', 'done'].includes(params.tab) ? params.tab : 'work';
    const selectedPool = new Set();
    const expandedPoolGroups = new Set();

    const listPanel = document.getElementById('collectives-list-panel');
    const poolPanel = document.getElementById('collectives-pool-panel');
    const listContainer = document.getElementById('collective-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('collective-list-search');
    const countLabel = document.getElementById('collective-count');
    const sortSelect = document.getElementById('collective-sort-select');
    const poolList = document.getElementById('pool-list');
    const poolBar = document.getElementById('pool-actions-bar');
    sortSelect.value = savedSort;
    if (!sortSelect.value) sortSelect.value = 'smart';
    sortSelect.addEventListener('change', () => {
      try { localStorage.setItem(COLLECTIVES_SORT_KEY, sortSelect.value); } catch (e) { /* не критично */ }
      render();
    });

    // --- Вкладки ---
    function paintTabs() {
      const done = allCollectives.filter((c) => c.progress && c.progress.done).length;
      const labels = {
        work: `В работе${allCollectives.length ? ` (${allCollectives.length - done})` : ''}`,
        pool: `Без коллективки${poolLoaded ? ` (${pool.length})` : ''}`,
        done: `Завершённые${allCollectives.length ? ` (${done})` : ''}`
      };
      document.querySelectorAll('#collectives-tabs [data-tab]').forEach((b) => {
        const on = b.dataset.tab === tab;
        b.textContent = labels[b.dataset.tab];
        b.classList.toggle('bg-white', on);
        b.classList.toggle('shadow-sm', on);
        b.classList.toggle('text-gray-900', on);
        b.classList.toggle('text-gray-500', !on);
      });
    }
    function showTab() {
      paintTabs();
      listPanel.classList.toggle('hidden', tab === 'pool');
      poolPanel.classList.toggle('hidden', tab !== 'pool');
      if (tab === 'pool') renderPool(); else render();
      updatePoolBar();
    }
    document.querySelectorAll('#collectives-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      showTab();
    }));
    if (window.SwipeTabs) {
      SwipeTabs.attach({
        area: root.querySelector('main'),
        keys: () => ['work', 'pool', 'done'],
        getActive: () => tab,
        panelFor: (key) => (key === 'pool' ? poolPanel : listPanel),
        activate: (key) => { const b = document.querySelector(`#collectives-tabs [data-tab="${key}"]`); if (b) b.click(); }
      });
    }

    // Фильтр по этапу (Э4, §3).
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

    const dateFilterPanel = document.getElementById('date-filter-panel');
    const dateFilterFrom = document.getElementById('date-filter-from');
    const dateFilterTo = document.getElementById('date-filter-to');
    document.getElementById('date-filter-toggle-btn').addEventListener('click', () => dateFilterPanel.classList.toggle('hidden'));
    dateFilterFrom.addEventListener('change', () => render());
    dateFilterTo.addEventListener('change', () => render());
    document.getElementById('date-filter-clear-btn').addEventListener('click', () => {
      dateFilterFrom.value = '';
      dateFilterTo.value = '';
      render();
    });

    loadCollectives();
    loadPool();

    async function loadCollectives() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        allCollectives = await callServer('getCollectivesList', { progress: true });
        document.getElementById('stage-filter-tabs').classList.toggle('hidden', !allCollectives.some((c) => c.stage === 'По РФ'));
        paintTabs();
        if (tab !== 'pool') render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    async function loadPool() {
      if (tab === 'pool') poolList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        pool = await callServer('getCollectivePool');
        poolLoaded = true;
        for (const id of [...selectedPool]) if (!pool.some((o) => o.orderId === id)) selectedPool.delete(id);
        paintTabs();
        if (tab === 'pool') renderPool();
        updatePoolBar();
      } catch (error) {
        poolList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    const handleSearch = debounce(() => render(), 250);
    searchInput.addEventListener('input', handleSearch);

    function render() {
      if (tab === 'pool') return;
      const query = searchInput.value.trim().toLowerCase();
      let filtered = allCollectives.filter((c) => (tab === 'done') === !!(c.progress && c.progress.done));
      if (stageFilter !== '') {
        filtered = filtered.filter(c => c.stage === stageFilter);
      }
      if (query !== '') {
        filtered = filtered.filter(c => `${c.collectiveId} ${c.trackNumber} ${c.name}`.toLowerCase().includes(query));
      }
      // Диапазон по дате отправки (доработка 30.08.2026) — без даты отправки
      // выпадают, как только задана хотя бы одна граница.
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
      emptyMessage.textContent = tab === 'done'
        ? 'Завершённых пока нет — коллективка попадает сюда, когда по ней всё сделано: статус, чек СДЭК, цены и оплаты клиентов, статусы заказов.'
        : 'Коллективок не найдено';

      if (filtered.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        filtered.forEach(c => listContainer.appendChild(buildCard(c)));
      }
      if (window.lucide) window.lucide.createIcons();
    }

    function buildCard(c) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.dataset.collectiveId = c.collectiveId;
      card.addEventListener('click', () => navigateTo(`collectives/${encodeURIComponent(c.collectiveId)}`));

      const warnings = tab === 'work' ? collectiveWarnings(c.progress, c) : [];
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px] break-words">${escapeHtmlClient(c.name || c.collectiveId)}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">${c.name ? `ID ${escapeHtmlClient(c.collectiveId)}${c.trackNumber ? ' · трек ' + escapeHtmlClient(c.trackNumber) : ''}` : (c.trackNumber ? `Трек: ${escapeHtmlClient(c.trackNumber)}` : 'Трек не указан')}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0 text-right">
            <div>${escapeHtmlClient(c.createdAt)}</div>
            ${c.sentAtDisplay ? `<div class="text-emerald-600">отправлено ${escapeHtmlClient(c.sentAtDisplay)}</div>` : ''}
          </div>
        </div>
        <div class="flex items-center flex-wrap gap-2 mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">${escapeHtmlClient(collectiveStageLabel(c.stage))}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">${escapeHtmlClient(c.status)}</span>
          <span class="text-[11px] text-gray-500">Заказов: ${c.orderCount}</span>
        </div>
        ${warnings.length ? `<div class="mt-2 flex flex-wrap gap-1.5" data-collective-warnings>${warnings.map((w) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">${escapeHtmlClient(w)}</span>`).join('')}</div>` : ''}
      `;
      return card;
    }

    // --- Пул «Без коллективки» ---
    function renderPool() {
      if (!poolLoaded) return;
      const groups = groupPool(pool);
      if (pool.length === 0) {
        poolList.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Все заказы уже в коллективках.</div>';
        return;
      }
      poolList.innerHTML = POOL_GROUPS.map((g) => {
        const items = groups[g.key];
        if (items.length === 0) return '';
        const expanded = !g.collapsed || expandedPoolGroups.has(g.key);
        const allSelected = items.every((o) => selectedPool.has(o.orderId));
        return `
          <section class="mb-4" data-pool-group="${g.key}">
            <div class="flex items-center justify-between gap-2 px-1 mb-2">
              <button type="button" class="pool-group-toggle text-left min-w-0" data-group="${g.key}">
                <div class="text-sm font-semibold text-gray-800">${escapeHtmlClient(g.title)} (${items.length})${g.collapsed ? ` <span class="text-[11px] font-normal text-indigo-600">${expanded ? 'свернуть' : 'показать'}</span>` : ''}</div>
                ${g.hint ? `<div class="text-[11px] text-gray-400">${escapeHtmlClient(g.hint)}</div>` : ''}
              </button>
              ${expanded ? `<button type="button" class="pool-group-select text-[11px] font-medium text-indigo-600 shrink-0" data-group="${g.key}">${allSelected ? 'Снять все' : 'Выбрать все'}</button>` : ''}
            </div>
            ${expanded ? `<div class="wide-grid">${items.map(poolCardHtml).join('')}</div>` : ''}
          </section>`;
      }).join('');
      if (window.lucide) window.lucide.createIcons();
    }

    function poolCardHtml(o) {
      const on = selectedPool.has(o.orderId);
      const sdekLine = o.sdekPaid > 0
        ? `<span class="text-emerald-700">На СДЭК внесено ${Math.round(o.sdekPaid).toLocaleString('ru-RU')} ₽${o.sdekTarget > 0 ? ` из ${Math.round(o.sdekTarget).toLocaleString('ru-RU')} ₽` : ''}</span>`
        : (o.sdekTarget > 0 ? `<span class="text-gray-500">СДЭК ${o.sdekIsForecast ? '≈' : ''}${Math.round(o.sdekTarget).toLocaleString('ru-RU')} ₽, не оплачено</span>` : '');
      return `
        <div class="pool-card bg-white rounded-2xl shadow-sm border ${on ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-100'} p-3 mb-2 flex gap-3 cursor-pointer active:bg-gray-50" data-pool-order="${escapeHtmlClient(o.orderId)}">
          <div class="shrink-0 w-5 h-5 mt-0.5 rounded-md border ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'} flex items-center justify-center">${on ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}</div>
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100" loading="lazy">` : '<div class="w-12 h-12 rounded-lg bg-gray-100 shrink-0"></div>'}
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-gray-900 line-clamp-2 break-words">${escapeHtmlClient(o.productDisplay)}</div>
            <div class="text-[12px] text-gray-500 truncate">${escapeHtmlClient(o.clientDisplay || '—')} · № ${escapeHtmlClient(o.orderId)}</div>
            <div class="text-[11px] text-gray-400 mt-0.5">${escapeHtmlClient(o.statusDelivery)}${o.daysSinceOrder !== null && o.daysSinceOrder !== undefined ? ` · выкуплен ${escapeHtmlClient(o.dateOrderDisplay)}` : ''}</div>
            ${sdekLine ? `<div class="text-[11px] mt-0.5">${sdekLine}</div>` : ''}
          </div>
          <button type="button" class="pool-open-order shrink-0 self-start p-1 text-gray-300 hover:text-indigo-600" title="Открыть заказ" data-order-id="${escapeHtmlClient(o.orderId)}"><i data-lucide="external-link" class="w-4 h-4"></i></button>
        </div>`;
    }

    poolList.addEventListener('click', (e) => {
      const openBtn = e.target.closest('.pool-open-order');
      if (openBtn) {
        e.stopPropagation();
        navigateTo(`orders/${encodeURIComponent(openBtn.dataset.orderId)}/edit`);
        return;
      }
      const toggle = e.target.closest('.pool-group-toggle');
      if (toggle) {
        const key = toggle.dataset.group;
        if (expandedPoolGroups.has(key)) expandedPoolGroups.delete(key); else expandedPoolGroups.add(key);
        renderPool();
        return;
      }
      const selectAll = e.target.closest('.pool-group-select');
      if (selectAll) {
        const items = groupPool(pool)[selectAll.dataset.group] || [];
        const allSelected = items.every((o) => selectedPool.has(o.orderId));
        items.forEach((o) => (allSelected ? selectedPool.delete(o.orderId) : selectedPool.add(o.orderId)));
        renderPool();
        updatePoolBar();
        return;
      }
      const card = e.target.closest('[data-pool-order]');
      if (card) {
        const id = card.dataset.poolOrder;
        if (selectedPool.has(id)) selectedPool.delete(id); else selectedPool.add(id);
        renderPool();
        updatePoolBar();
      }
    });

    function updatePoolBar() {
      const show = tab === 'pool' && selectedPool.size > 0;
      poolBar.classList.toggle('hidden', !show);
      document.getElementById('pool-selected-count').textContent = `Выбрано: ${selectedPool.size}`;
    }
    document.getElementById('pool-cancel-btn').addEventListener('click', () => {
      selectedPool.clear();
      renderPool();
      updatePoolBar();
    });

    const picker = CollectivePickerModal.init({
      onPicked: async (collective) => {
        const ids = [...selectedPool];
        if (ids.length === 0) return;
        const title = collective.name || collective.collectiveId;
        const confirmed = await showConfirmModal(`Добавить в «${title}» выбранные заказы: ${ids.length}?`, { confirmLabel: 'В коллективку' });
        if (!confirmed) return;
        const btn = document.getElementById('pool-assign-btn');
        btn.disabled = true;
        try {
          const result = await callServer('assignOrdersToCollective', ids, collective.collectiveId);
          const okCount = result.moved.length + result.added.length;
          if (result.failed.length > 0) showSaveToast(false, `Добавлено: ${okCount}, не удалось: ${result.failed.length} (${result.failed[0].reason})`);
          else showSaveToast(true, `Готово: в «${title}» добавлено заказов: ${okCount}.`);
          selectedPool.clear();
          await Promise.all([loadPool(), loadCollectives()]);
        } catch (error) {
          showSaveToast(false, 'Не удалось добавить в коллективку: ' + error.message);
        } finally {
          btn.disabled = false;
        }
      }
    });
    document.getElementById('pool-assign-btn').addEventListener('click', () => {
      if (selectedPool.size === 0) return;
      picker.open({ stageFilter: 'КЗ→РФ', allowCreate: true });
    });

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
    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 5): кнопка блокируется на время
    // запроса — двойной тап на "Создать" мог породить две коллективки.
    const createSaveBtn = document.getElementById('create-collective-save');
    createSaveBtn.addEventListener('click', async () => {
      if (createSaveBtn.disabled) return;
      createErrorText.classList.add('hidden');
      const name = document.getElementById('new-collective-name').value.trim();
      const trackNumber = document.getElementById('new-collective-track').value.trim();
      const stage = document.getElementById('new-collective-stage').value;

      // Название обязательно с Э2 (VASY, Q5) — та же валидация на сервере.
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

    showTab();
  }
};
