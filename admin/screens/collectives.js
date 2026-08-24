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

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="collective-count"></div>

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

    const listContainer = document.getElementById('collective-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('collective-list-search');
    const countLabel = document.getElementById('collective-count');

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
      if (query !== '') {
        filtered = allCollectives.filter(c => `${c.collectiveId} ${c.trackNumber} ${c.name}`.toLowerCase().includes(query));
      }

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
          <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(c.createdAt)}</div>
        </div>
        <div class="flex items-center gap-2 mt-2">
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
        await callServer('createCollective', { name, trackNumber });
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
