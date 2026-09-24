'use strict';

/**
 * Экран "Каталог" — перенесён из admin/catalog.html (SPA админки, 02.08.2026).
 * SKU-модалка вынесена в общий _sku-modal.js (была дословной копией в
 * catalog.html/index.html/edit-order.html).
 */
window.Screens = window.Screens || {};
window.Screens.catalog = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Каталог</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-catalog-btn" title="Обновить каталог" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="add-sku-btn" title="Добавить позицию в каталог" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <!-- 19.09.2026 (репорт VASY): 6 иконок в header-actions (фиксированная
             h-14 шапка) перестали помещаться рядом с "Каталог" на узких экранах
             Telegram Mini App — тот же класс переполнения, что уже чинили на
             "Заказы" 07.09.2026 (см. orders.js). Тем же приёмом: в шапке
             остаются только 2 самые частые кнопки (Обновить/Добавить), четыре
             реже используемых инструмента переехали в свой ряд icon+подпись
             внутри тела экрана. -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-3 grid grid-cols-6 gap-1">
          <button type="button" id="find-duplicates-btn" title="Аудит каталога: дубли, позиции без ссылки/фото" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="copy-check" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Дубли</span>
          </button>
          <button type="button" id="short-name-btn" title="Стандартизация коротких имён" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="wand-2" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Имена</span>
          </button>
          <button type="button" id="tag-suggestions-btn" title="Теги ИИ" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="tags" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Теги ИИ</span>
          </button>
          <button type="button" id="wishlist-demand-btn" title="Спрос клиентов" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="heart" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Спрос</span>
          </button>
          <!-- «Коллекции» (§4 IMPLEMENTATION-PLAN-PROCESS-AND-WISHLIST.md, 20.09.2026) -->
          <button type="button" id="collections-nav-btn" title="Коллекции" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="layers" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Коллекции</span>
          </button>
          <!-- «Линейки» — справочник веток (IMPLEMENTATION-PLAN-GAMIFICATION.md §2.7 Т1, 24.09.2026) -->
          <button type="button" id="lines-nav-btn" title="Линейки" class="flex flex-col items-center gap-1 py-1.5 rounded-xl text-indigo-600 active:bg-indigo-50 transition-colors">
            <i data-lucide="git-branch" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">Линейки</span>
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="catalog-search"
            class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400"
            placeholder="Поиск по каталогу..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="catalog-count"></div>

        <div id="catalog-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Позиции не найдены</div>
      </main>

      ${SkuModal.html()}

      <div id="duplicates-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900 inline-flex items-center gap-1.5">Аудит каталога${helpIcon('Что показывают разделы', '<p><b>Вероятные дубли</b> — позиции, чьи названия автоматически похожи (нечёткое совпадение, не 100%). Кнопка «Объединить» покажет обе целиком для сравнения — ничего не удаляется без вашего явного выбора, какую оставить.</p><p><b>Заказы без соответствия в каталоге</b> / <b>Позиции без единого заказа</b> — рассинхронизация между листом «Заказы» и каталогом, только информационно.</p><p><b>Без ссылки</b> / <b>Без фото</b> — позиции каталога с пустыми полями, ничего не ломают, но мешают клиентам и авто-распознаванию ссылок.</p>')}</h2>
            <button id="duplicates-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="duplicates-body" class="p-4 space-y-4"></div>
        </div>
      </div>

      <div id="merge-compare-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Слияние позиций</h2>
            <button id="merge-compare-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="merge-compare-body" class="p-4"></div>
        </div>
      </div>

      <div id="short-name-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900 inline-flex items-center gap-1.5">Короткие имена${helpIcon('Что это', '<p>Позиции каталога с пустым «Коротким именем» — оно показывается клиенту вместо технического названия. Если уже заполнены Бренд и Персонаж — имя собирается автоматически, бесплатно. Иначе — предлагает ИИ, пачками (батчами), по запросу.</p><p>Ничего не применяется автоматически — отметьте нужные строки и нажмите «Применить выбранные», или отклоните конкретную (тогда ИИ больше не будет предлагать её снова, пока название позиции не изменится).</p>')}</h2>
            <button id="short-name-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="short-name-body" class="p-4 space-y-2"></div>
          <div class="p-4 pt-0">
            <button type="button" id="short-name-apply-btn" class="hidden w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Применить выбранные</button>
          </div>
        </div>
      </div>

      <!-- Тег-агент (репорт VASY 19.09.2026, вариант 1 развилки — "я не
           доверяю конечное решение ИИ") — предложения Бренда/Персонажа/
           Серии считает ФОНОВЫЙ периодический job (catalogTagSuggestionJob.js,
           раз в сутки), экран только читает уже готовое и применяет по
           явному выбору администратора. "Обновить сейчас" — тот же код
           путь, что периодический job, для тех, кто не хочет ждать. -->
      <div id="tag-suggestions-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900 inline-flex items-center gap-1.5">Теги ИИ${helpIcon('Что это', '<p>Бренд/Персонаж/Серия, которые ИИ предлагает для позиций каталога с пустыми тегами — считается автоматически раз в сутки в фоне, здесь только уже готовые предложения.</p><p>Ничего не применяется автоматически. Отметьте нужные поля и нажмите «Применить выбранные», или отклоните позицию целиком (тогда ИИ больше не предложит по ней снова, пока название не изменится). Уже заполненные вручную теги предложение никогда не перезапишет.</p>')}</h2>
            <button id="tag-suggestions-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="tag-suggestions-body" class="p-4 space-y-2"></div>
          <div class="p-4 pt-0 flex gap-2">
            <button type="button" id="tag-suggestions-scan-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium">Обновить сейчас (ИИ)</button>
            <button type="button" id="tag-suggestions-apply-btn" class="hidden flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Применить выбранные</button>
          </div>
        </div>
      </div>
    `;

    let allSku = [];

    const listContainer = document.getElementById('catalog-list');
    const emptyMessage = document.getElementById('empty-message');
    const searchInput = document.getElementById('catalog-search');
    const countLabel = document.getElementById('catalog-count');

    const skuModal = SkuModal.init({ onSaved: () => loadCatalog() });

    loadCatalog();

    // forceRefresh — сбрасывает 15-минутный кэш каталога на бэкенде
    // (WebAppApi.refreshCatalogList), не просто перечитывает тот же кэш —
    // кнопка "Обновить" по фидбеку VASY 03.08.2026.
    async function loadCatalog(forceRefresh) {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка каталога...</div>';
      try {
        allSku = await callServer(forceRefresh ? 'refreshCatalogList' : 'getCatalogList');
        render();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    document.getElementById('refresh-catalog-btn').addEventListener('click', () => {
      const btn = document.getElementById('refresh-catalog-btn');
      const icon = btn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      loadCatalog(true).finally(() => {
        const liveIcon = btn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    const handleSearch = debounce(() => render(), 250);
    searchInput.addEventListener('input', handleSearch);

    function render() {
      const query = searchInput.value.trim().toLowerCase();

      let filtered = allSku;
      if (query !== '') {
        filtered = allSku.filter(s => {
          const haystack = `${s.original} ${s.shortName} ${s.brand} ${s.character} ${s.series}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      countLabel.textContent = `Найдено: ${filtered.length}`;
      listContainer.innerHTML = '';

      if (filtered.length === 0) {
        emptyMessage.classList.remove('hidden');
      } else {
        emptyMessage.classList.add('hidden');
        filtered.forEach(s => listContainer.appendChild(buildCard(s)));
      }
    }

    function buildCard(s) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => skuModal.open('edit', s.original));

      const tags = [s.brand, s.character, s.series].filter(t => t !== '');

      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${s.imageUrl ? `<img src="${escapeHtmlClient(s.imageUrl)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(s.shortName || s.original)}</div>
            ${s.shortName && s.shortName !== s.original ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(s.original)}</div>` : ''}
            ${tags.length > 0 ? `<div class="flex flex-wrap gap-1.5 mt-2">${tags.map(t => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      `;
      return card;
    }

    document.getElementById('add-sku-btn').addEventListener('click', () => skuModal.open('create'));
    // wishlist-demand-btn переехал из header-actions в тело экрана 19.09.2026
    // (см. комментарий у разметки выше) — слушатель теперь вешается здесь,
    // после root.innerHTML, а не сразу за header-actions, как раньше.
    document.getElementById('wishlist-demand-btn').addEventListener('click', () => navigateTo('wishlist-demand'));
    document.getElementById('collections-nav-btn').addEventListener('click', () => navigateTo('catalog/collections'));
    document.getElementById('lines-nav-btn').addEventListener('click', () => navigateTo('catalog/lines'));

    // Аудит существующего каталога — кластеры вероятных дублей + позиции без
    // ссылки/фото (инструмент "Найти вероятные дубли", 03.08.2026).
    //
    // РЕДИЗАЙН 04.08.2026 (репорт VASY: при слиянии обе позиции оставались в
    // каталоге вместо одной) — раньше "Объединить" открывало общую SKU-модалку
    // в режиме редактирования, молча подменяло поле "Выпуск" на имя цели и
    // полагалось на то, что менеджер нажмёт "Сохранить" и правильно выберет
    // между keepNew/keepExisting в возникшем конфликте. Прямые вызовы
    // updateSku(oldOriginal, skuData, mergeChoice) подтверждены тестами как
    // корректные — проблема была именно в этой хрупкой цепочке. Теперь
    // "Объединить" сразу показывает обе позиции целиком (фото/теги/описание/
    // ссылки) и вызывает updateSku НАПРЯМУЮ с explicit mergeChoice, без
    // промежуточной формы редактирования.
    const duplicatesModal = document.getElementById('duplicates-modal');
    const duplicatesBody = document.getElementById('duplicates-body');
    const mergeCompareModal = document.getElementById('merge-compare-modal');
    const mergeCompareBody = document.getElementById('merge-compare-body');

    function closeMergeCompareModal() {
      mergeCompareModal.classList.add('hidden');
      mergeCompareModal.classList.remove('flex');
    }
    document.getElementById('merge-compare-close').addEventListener('click', closeMergeCompareModal);

    function buildMergeCandidateHtml(details, links) {
      const tags = [details.brand, details.character, details.series].filter(t => t !== '');
      return `
        <div class="border border-gray-200 rounded-xl p-3 space-y-1.5 min-w-0">
          ${details.imageUrl ? `<img src="${escapeHtmlClient(details.imageUrl)}" alt="" class="w-16 h-16 rounded-lg object-cover bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="font-semibold text-gray-900 text-sm break-words">${escapeHtmlClient(details.shortName || details.original)}</div>
          <div class="text-[11px] text-gray-400 break-words">${escapeHtmlClient(details.original)}</div>
          ${tags.length > 0 ? `<div class="flex flex-wrap gap-1">${tags.map(t => `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(t)}</span>`).join('')}</div>` : ''}
          ${details.description ? `<div class="text-[11px] text-gray-500">${escapeHtmlClient(details.description)}</div>` : ''}
          ${links.length > 0
            ? `<div class="space-y-0.5">${links.map(l => `<a href="${escapeHtmlClient(l.url)}" target="_blank" rel="noopener" class="block text-[11px] text-indigo-500 truncate">${escapeHtmlClient(l.url)}</a>`).join('')}</div>`
            : '<div class="text-[11px] text-gray-300">Ссылок нет</div>'}
        </div>
      `;
    }

    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 5): ни одна из двух кнопок этого
    // диалога не блокировалась на время запроса — двойной тап (тот же класс
    // риска, что уже 4+ раза находили в разных углах этого проекта) мог
    // вызвать performMerge дважды подряд для одной и той же пары позиций,
    // причём именно эта функция ЯВНО удаляет одну из двух записей каталога
    // на сервере (см. подсказку выше кнопок) — самый чувствительный из всех
    // найденных при аудите write-путей без disable-guard.
    async function performMerge(targetDetails, sourceDetails, mergeChoice) {
      const errorEl = document.getElementById('merge-compare-error');
      errorEl.classList.add('hidden');
      const targetBtn = document.getElementById('merge-keep-target-btn');
      const sourceBtn = document.getElementById('merge-keep-source-btn');
      if (targetBtn.disabled || sourceBtn.disabled) return; // уже в процессе — второй клик игнорируем
      targetBtn.disabled = true;
      sourceBtn.disabled = true;
      const skuData = {
        original: targetDetails.original,
        shortName: sourceDetails.shortName,
        brand: sourceDetails.brand,
        character: sourceDetails.character,
        series: sourceDetails.series,
        imageUrl: sourceDetails.imageUrl,
        description: sourceDetails.description
      };
      try {
        await callServer('updateSku', sourceDetails.original, skuData, mergeChoice);
        closeMergeCompareModal();
        showSaveToast(true, 'Позиции объединены');
        loadCatalog();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
        targetBtn.disabled = false;
        sourceBtn.disabled = false;
      }
    }

    function renderMergeCompare(targetDetails, sourceDetails, targetLinks, sourceLinks) {
      mergeCompareBody.innerHTML = `
        <p class="text-xs text-gray-500 mb-3">Выберите, какую позицию оставить — вторая будет удалена, её заказы переключатся на выбранную.</p>
        <div class="grid grid-cols-2 gap-3 mb-3">
          ${buildMergeCandidateHtml(targetDetails, targetLinks)}
          ${buildMergeCandidateHtml(sourceDetails, sourceLinks)}
        </div>
        <div id="merge-compare-error" class="text-xs text-red-500 hidden mb-2"></div>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="merge-keep-target-btn" class="py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium hover:border-indigo-400">
            Оставить: ${escapeHtmlClient(targetDetails.shortName || targetDetails.original)}
          </button>
          <button type="button" id="merge-keep-source-btn" class="py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium hover:border-indigo-400">
            Оставить: ${escapeHtmlClient(sourceDetails.shortName || sourceDetails.original)}
          </button>
        </div>
      `;
      document.getElementById('merge-keep-target-btn').addEventListener('click', () => performMerge(targetDetails, sourceDetails, 'keepExisting'));
      document.getElementById('merge-keep-source-btn').addEventListener('click', () => performMerge(targetDetails, sourceDetails, 'keepNew'));
      if (window.lucide) window.lucide.createIcons();
    }

    async function openMergeCompare(targetOriginal, sourceOriginal) {
      mergeCompareBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Загрузка данных...</div>';
      mergeCompareModal.classList.remove('hidden');
      mergeCompareModal.classList.add('flex');

      try {
        const [targetDetails, sourceDetails, targetLinks, sourceLinks] = await Promise.all([
          callServer('getSkuDetails', targetOriginal),
          callServer('getSkuDetails', sourceOriginal),
          callServer('getCatalogLinksForSku', targetOriginal),
          callServer('getCatalogLinksForSku', sourceOriginal)
        ]);
        renderMergeCompare(targetDetails, sourceDetails, targetLinks, sourceLinks);
      } catch (error) {
        mergeCompareBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function closeDuplicatesModal() {
      duplicatesModal.classList.add('hidden');
      duplicatesModal.classList.remove('flex');
    }
    document.getElementById('duplicates-close').addEventListener('click', closeDuplicatesModal);

    // "Короткие имена" — план "Лоты/ИИ", Этап 5, Часть Б (16.09.2026).
    // Отдельная модалка (не внутри "Аудит каталога" — другой смысл: это
    // проактивная стандартизация витрины, не пассивный аудит). НИЧЕГО не
    // применяется автоматически (см. helpIcon в разметке) — только по
    // явному "Применить выбранные"/"Отклонить" на каждую строку.
    const shortNameModal = document.getElementById('short-name-modal');
    const shortNameBody = document.getElementById('short-name-body');
    const shortNameApplyBtn = document.getElementById('short-name-apply-btn');
    let currentShortNameSuggestions = [];

    function closeShortNameModal() {
      shortNameModal.classList.add('hidden');
      shortNameModal.classList.remove('flex');
    }
    document.getElementById('short-name-close').addEventListener('click', closeShortNameModal);

    document.getElementById('short-name-btn').addEventListener('click', () => {
      shortNameModal.classList.remove('hidden');
      shortNameModal.classList.add('flex');
      loadShortNameSuggestions();
    });

    async function loadShortNameSuggestions() {
      shortNameBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Загрузка предложений...</div>';
      shortNameApplyBtn.classList.add('hidden');
      try {
        const result = await callServer('getCatalogShortNameSuggestions');
        currentShortNameSuggestions = result.suggestions || [];
        renderShortNameSuggestions(result.remainingForAi || 0);
      } catch (error) {
        shortNameBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    // `remainingForAi` "Загрузить ещё" сознательно показывается ТОЛЬКО когда
    // текущий список полностью разобран (пуст) — иначе повторный клик до
    // того, как человек применил/отклонил уже показанные ИИ-предложения,
    // заново отправил бы ТЕ ЖЕ позиции в Gemini (getShortNameSuggestions не
    // помнит "уже показано, но ещё не решено" — только "решено") и сжёг бы
    // токены впустую, прямо против тезиса VASY "разумный прогон".
    function renderShortNameSuggestions(remainingForAi) {
      if (currentShortNameSuggestions.length === 0) {
        shortNameBody.innerHTML = remainingForAi > 0
          ? `<div class="text-center text-sm text-gray-400 py-6">Список пуст. Ещё ${remainingForAi} — ожидают ИИ-разбора.</div>
             <button type="button" id="short-name-more-btn" class="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium">Загрузить ещё (ИИ)</button>`
          : '<div class="text-center text-sm text-gray-400 py-6">Все позиции с пустым коротким именем разобраны.</div>';
        shortNameApplyBtn.classList.add('hidden');
        const moreBtn = document.getElementById('short-name-more-btn');
        if (moreBtn) moreBtn.addEventListener('click', loadShortNameSuggestions);
        return;
      }

      shortNameBody.innerHTML = currentShortNameSuggestions.map((s, idx) => `
        <div class="border border-gray-200 rounded-xl p-3">
          <div class="flex items-start gap-2">
            <input type="checkbox" class="short-name-checkbox mt-1.5" data-idx="${idx}">
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(s.original)}</div>
              <input type="text" class="short-name-input w-full text-sm border border-gray-200 rounded-lg px-2 py-1 mt-1" data-idx="${idx}" value="${escapeHtmlClient(s.suggested)}">
              <div class="text-[10px] text-gray-400 mt-1">${s.source === 'ai' ? 'предложено ИИ' : 'из тегов, бесплатно'}</div>
            </div>
            <button type="button" class="short-name-reject-btn text-[11px] text-gray-400 hover:text-red-500 shrink-0" data-idx="${idx}">Отклонить</button>
          </div>
        </div>
      `).join('');

      shortNameApplyBtn.classList.remove('hidden');
      wireShortNameRowEvents(remainingForAi);
    }

    function wireShortNameRowEvents(remainingForAi) {
      shortNameBody.querySelectorAll('.short-name-reject-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          btn.disabled = true;
          const idx = parseInt(btn.dataset.idx, 10);
          const item = currentShortNameSuggestions[idx];
          try {
            await callServer('rejectCatalogShortNameSuggestion', item.original);
            currentShortNameSuggestions = currentShortNameSuggestions.filter((_, i) => i !== idx);
            renderShortNameSuggestions(remainingForAi);
          } catch (error) {
            showSaveToast(false, error.message);
            btn.disabled = false;
          }
        });
      });

      shortNameApplyBtn.onclick = async () => {
        if (shortNameApplyBtn.disabled) return;
        const checkedIdx = [...shortNameBody.querySelectorAll('.short-name-checkbox:checked')].map((cb) => parseInt(cb.dataset.idx, 10));
        if (checkedIdx.length === 0) { showSaveToast(false, 'Отметьте хотя бы одну позицию.'); return; }
        shortNameApplyBtn.disabled = true;
        try {
          for (const idx of checkedIdx) {
            const item = currentShortNameSuggestions[idx];
            const input = shortNameBody.querySelector(`.short-name-input[data-idx="${idx}"]`);
            const value = input.value.trim();
            if (value === '') continue;
            await callServer('applyCatalogShortNameSuggestion', item.original, value);
          }
          showSaveToast(true, `Применено: ${checkedIdx.length}`);
          currentShortNameSuggestions = currentShortNameSuggestions.filter((_, i) => !checkedIdx.includes(i));
          renderShortNameSuggestions(remainingForAi);
          loadCatalog(); // короткие имена изменились — обновить список каталога
        } catch (error) {
          showSaveToast(false, error.message);
        } finally {
          shortNameApplyBtn.disabled = false;
        }
      };
    }

    // Тег-агент (репорт VASY 19.09.2026, вариант 1 развилки — "я не доверяю
    // конечное решение ИИ") — предложения уже посчитаны фоновым job'ом,
    // экран только читает (МГНОВЕННО, без Gemini) и применяет по явному
    // выбору. НИЧЕГО не применяется автоматически — тот же принцип, что у
    // "Коротких имён" выше, просто три независимых поля на позицию вместо
    // одного значения.
    const tagSuggestionsModal = document.getElementById('tag-suggestions-modal');
    const tagSuggestionsBody = document.getElementById('tag-suggestions-body');
    const tagSuggestionsApplyBtn = document.getElementById('tag-suggestions-apply-btn');
    const tagSuggestionsScanBtn = document.getElementById('tag-suggestions-scan-btn');
    let currentTagSuggestions = [];

    function closeTagSuggestionsModal() {
      tagSuggestionsModal.classList.add('hidden');
      tagSuggestionsModal.classList.remove('flex');
    }
    document.getElementById('tag-suggestions-close').addEventListener('click', closeTagSuggestionsModal);

    document.getElementById('tag-suggestions-btn').addEventListener('click', () => {
      tagSuggestionsModal.classList.remove('hidden');
      tagSuggestionsModal.classList.add('flex');
      loadTagSuggestions();
    });

    async function loadTagSuggestions() {
      tagSuggestionsBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Загрузка предложений...</div>';
      tagSuggestionsApplyBtn.classList.add('hidden');
      try {
        currentTagSuggestions = await callServer('getPendingCatalogTagSuggestions');
        renderTagSuggestions();
      } catch (error) {
        tagSuggestionsBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    const TAG_FIELD_LABELS = { brand: 'Бренд', character: 'Персонаж', series: 'Серия' };

    function renderTagSuggestions() {
      if (currentTagSuggestions.length === 0) {
        tagSuggestionsBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Нет ожидающих предложений. Следующий фоновый прогон — раз в сутки, либо нажмите «Обновить сейчас».</div>';
        tagSuggestionsApplyBtn.classList.add('hidden');
        return;
      }

      tagSuggestionsBody.innerHTML = currentTagSuggestions.map((s, idx) => {
        const fields = ['brand', 'character', 'series'].filter((f) => s[`suggested${f[0].toUpperCase()}${f.slice(1)}`]);
        const fieldsHtml = fields.map((f) => {
          const suggestedValue = s[`suggested${f[0].toUpperCase()}${f.slice(1)}`];
          return `
            <label class="flex items-center gap-2 text-sm mt-1">
              <input type="checkbox" class="tag-suggestion-checkbox" data-idx="${idx}" data-field="${f}" checked>
              <span class="text-gray-500">${TAG_FIELD_LABELS[f]}:</span>
              <span class="font-medium text-gray-900">${escapeHtmlClient(suggestedValue)}</span>
            </label>
          `;
        }).join('');

        return `
          <div class="border border-gray-200 rounded-xl p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-[11px] text-gray-400 break-words">${escapeHtmlClient(s.original)}</div>
                ${fieldsHtml}
              </div>
              <button type="button" class="tag-suggestion-reject-btn text-[11px] text-gray-400 hover:text-red-500 shrink-0" data-idx="${idx}">Отклонить</button>
            </div>
          </div>
        `;
      }).join('');

      tagSuggestionsApplyBtn.classList.remove('hidden');
      wireTagSuggestionRowEvents();
    }

    function wireTagSuggestionRowEvents() {
      tagSuggestionsBody.querySelectorAll('.tag-suggestion-reject-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          btn.disabled = true;
          const idx = parseInt(btn.dataset.idx, 10);
          const item = currentTagSuggestions[idx];
          try {
            await callServer('rejectCatalogTagSuggestion', item.original);
            currentTagSuggestions = currentTagSuggestions.filter((_, i) => i !== idx);
            renderTagSuggestions();
          } catch (error) {
            showSaveToast(false, error.message);
            btn.disabled = false;
          }
        });
      });

      tagSuggestionsApplyBtn.onclick = async () => {
        if (tagSuggestionsApplyBtn.disabled) return;
        tagSuggestionsApplyBtn.disabled = true;
        try {
          let appliedCount = 0;
          for (const [index, item] of currentTagSuggestions.entries()) {
            const checked = [...tagSuggestionsBody.querySelectorAll(`.tag-suggestion-checkbox[data-idx="${index}"]:checked`)];
            if (checked.length === 0) continue;
            const accepted = {};
            for (const cb of checked) accepted[cb.dataset.field] = item[`suggested${cb.dataset.field[0].toUpperCase()}${cb.dataset.field.slice(1)}`];
            await callServer('applyCatalogTagSuggestion', item.original, accepted);
            appliedCount++;
          }
          showSaveToast(true, `Применено: ${appliedCount}`);
          await loadTagSuggestions();
          loadCatalog(); // теги изменились — обновить список каталога
        } catch (error) {
          showSaveToast(false, error.message);
        } finally {
          tagSuggestionsApplyBtn.disabled = false;
        }
      };
    }

    tagSuggestionsScanBtn.addEventListener('click', async () => {
      if (tagSuggestionsScanBtn.disabled) return;
      tagSuggestionsScanBtn.disabled = true;
      tagSuggestionsBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Прогоняю ИИ по каталогу...</div>';
      try {
        await callServer('runCatalogTagSuggestionScanNow');
        await loadTagSuggestions();
      } catch (error) {
        tagSuggestionsBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      } finally {
        tagSuggestionsScanBtn.disabled = false;
      }
    });

    // Вынесено из клика "find-duplicates-btn" (16.09.2026, Этап 5, Часть А)
    // — "Сверить с ИИ" тоже должна перезагрузить весь отчёт после ответа
    // (решённые пары должны пропасть из «Спорные пары»/переехать в «ИИ
    // предлагает объединить»), без дублирования того же запроса.
    async function loadDuplicatesReport() {
      duplicatesBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Проверяю каталог...</div>';
      try {
        // Фаза 6.4 (04.08.2026) — аудит Заказы↔Каталог в той же модалке,
        // единая точка входа для менеджера. Два независимых запроса
        // параллельно — findDuplicateCatalogClusters уже проверенная и
        // задеплоенная логика, не трогаем её структуру ради нового отчёта.
        const [duplicatesResult, ordersAudit] = await Promise.all([
          callServer('findDuplicateCatalogClusters'),
          callServer('getCatalogOrdersAudit')
        ]);
        renderDuplicatesReport({ ...duplicatesResult, ...ordersAudit });
      } catch (error) {
        duplicatesBody.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    document.getElementById('find-duplicates-btn').addEventListener('click', () => {
      duplicatesModal.classList.remove('hidden');
      duplicatesModal.classList.add('flex');
      loadDuplicatesReport();
    });

    function renderDuplicatesReport(result) {
      // conflicts/aiSuggestedMerges — план "Лоты/ИИ", Этап 2/5 (15-16.09.2026):
      // могут отсутствовать у старого закэшированного ответа, поэтому ||[].
      const conflicts = result.conflicts || [];
      const aiSuggestedMerges = result.aiSuggestedMerges || [];
      if (result.clusters.length === 0 && conflicts.length === 0 && aiSuggestedMerges.length === 0
        && result.missingLink.length === 0 && result.missingImage.length === 0
        && result.orphanedOrders.length === 0 && result.unusedSkus.length === 0) {
        duplicatesBody.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Вероятных дублей, позиций без ссылки/фото и рассинхронизации с заказами не найдено.</div>';
        return;
      }

      duplicatesBody.innerHTML = '';

      if (result.clusters.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `<div class="text-xs font-semibold text-gray-500 mb-2">Вероятные дубли (${result.clusters.length})</div>`;
        result.clusters.forEach(cluster => {
          const block = document.createElement('div');
          block.className = 'border border-amber-200 bg-amber-50 rounded-xl p-3 mb-2 space-y-1.5';
          cluster.forEach((item, idx) => {
            // 19.09.2026 (репорт VASY: не видно, с чем сравнивается) — первая
            // позиция кластера ("Объединить" у остальных мержит ИМЕННО в неё,
            // см. openMergeCompare(cluster[0].original, ...) ниже) выделена
            // визуально, чтобы было видно, что это эталон, а не просто первая
            // строка списка.
            const isAnchor = idx === 0;
            const row = document.createElement('div');
            row.className = `flex items-center justify-between gap-2 text-xs${isAnchor ? ' bg-white border border-amber-300 rounded-lg px-2 py-1.5' : ''}`;
            row.innerHTML = `
              <span class="flex items-center gap-2 min-w-0">
                ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
                <span class="min-w-0">
                  ${isAnchor ? '<span class="block text-[9px] font-semibold text-amber-700 uppercase tracking-wide">Сравниваем с</span>' : ''}
                  <span class="text-gray-700 break-words">${escapeHtmlClient(item.shortName || item.original)}
                    <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span></span>
                </span>
              </span>
              ${idx > 0 ? `<button type="button" class="merge-with-first-btn shrink-0 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-idx="${idx}">Объединить</button>` : ''}
            `;
            block.appendChild(row);
          });
          block.querySelectorAll('.merge-with-first-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.idx, 10);
              closeDuplicatesModal();
              openMergeCompare(cluster[0].original, cluster[idx].original);
            });
          });
          section.appendChild(block);
        });
        duplicatesBody.appendChild(section);
      }

      // "Спорные пары" — план "Лоты/ИИ", Этап 2, решения 3+5 (15.09.2026).
      // Похоже, НО расходится число/размер/цвет — не авто-предложение
      // "Объединить" по умолчанию (как выше), а явный выбор человека: либо
      // всё равно "Объединить" (переиспользует ту же openMergeCompare), либо
      // "Это разные" — пишет вердикт (`recordCatalogDedupVerdict`), после
      // чего пара больше не показывается ни здесь, ни в кластерах
      // (catalog_dedup_verdicts, пока одно из двух названий не изменится).
      if (conflicts.length > 0) {
        const section = document.createElement('div');
        // Этап 5, Часть А (16.09.2026) — «Сверить с ИИ» рядом с заголовком:
        // один клик = один батч ≤50 пар (см. JSDoc catalogService.
        // reviewConflictsWithAi), решённые пары уходят из «Спорные пары» либо
        // в «ИИ предлагает объединить», либо пропадают совсем — модалка
        // перезагружается целиком после ответа, как после любой другой
        // записи в этом экране.
        section.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div class="text-xs font-semibold text-gray-500">Спорные пары (${conflicts.length})</div>
            <button type="button" id="review-conflicts-ai-btn" class="px-2 py-1 rounded-lg bg-violet-600 text-white text-[11px] inline-flex items-center gap-1">
              <i data-lucide="sparkles" class="w-3 h-3"></i>Сверить с ИИ
            </button>
          </div>
        `;
        conflicts.forEach((pair, pairIdx) => {
          const block = document.createElement('div');
          block.className = 'border border-sky-200 bg-sky-50 rounded-xl p-3 mb-2 space-y-1.5';
          // 19.09.2026 (репорт VASY: не видно, с чем сравнивается) — pair.a
          // выделена как эталон, pair.b — кандидат, который с ним сверяется
          // (та же пара идёт в openMergeCompare(pair.a.original, pair.b.original)).
          [pair.a, pair.b].forEach((item, idx) => {
            const isAnchor = idx === 0;
            const row = document.createElement('div');
            row.className = `flex items-center gap-2 text-xs${isAnchor ? ' bg-white border border-sky-300 rounded-lg px-2 py-1.5' : ''}`;
            row.innerHTML = `
              ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
              <span class="min-w-0">
                ${isAnchor ? '<span class="block text-[9px] font-semibold text-sky-700 uppercase tracking-wide">Сравниваем с</span>' : ''}
                <span class="text-gray-700 break-words">${escapeHtmlClient(item.shortName || item.original)}
                  <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span></span>
              </span>
            `;
            block.appendChild(row);
          });
          const actions = document.createElement('div');
          actions.className = 'flex items-center justify-between gap-2 pt-1';
          actions.innerHTML = `
            <span class="text-[11px] text-sky-700 truncate">отличается по: ${escapeHtmlClient(pair.distinguishingTokens.join(', '))}</span>
            <span class="flex gap-1.5 shrink-0">
              <button type="button" class="conflict-not-duplicate-btn px-2 py-1 rounded-lg border border-gray-200 text-gray-700 text-[11px]" data-idx="${pairIdx}">Это разные</button>
              <button type="button" class="conflict-merge-btn px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-idx="${pairIdx}">Объединить</button>
            </span>
          `;
          block.appendChild(actions);
          section.appendChild(block);
        });
        section.querySelectorAll('.conflict-merge-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const pair = conflicts[parseInt(btn.dataset.idx, 10)];
            closeDuplicatesModal();
            openMergeCompare(pair.a.original, pair.b.original);
          });
        });
        section.querySelectorAll('.conflict-not-duplicate-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (btn.disabled) return; // fail-safe чек-лист п.1 — второй клик до отключения игнорируем
            btn.disabled = true;
            const pair = conflicts[parseInt(btn.dataset.idx, 10)];
            try {
              await callServer('recordCatalogDedupVerdict', pair.a.original, pair.b.original, 'not_duplicate');
              showSaveToast(true, 'Отмечено: это разные позиции');
              btn.closest('.border-sky-200').remove();
            } catch (error) {
              showSaveToast(false, error.message);
              btn.disabled = false;
            }
          });
        });
        duplicatesBody.appendChild(section);

        const reviewAiBtn = document.getElementById('review-conflicts-ai-btn');
        reviewAiBtn.addEventListener('click', async () => {
          if (reviewAiBtn.disabled) return;
          reviewAiBtn.disabled = true;
          reviewAiBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>Сверяю...';
          if (window.lucide) window.lucide.createIcons();
          try {
            const reviewResult = await callServer('reviewCatalogConflictsWithAi');
            showSaveToast(true, `ИИ сверила ${reviewResult.reviewedCount} пар` + (reviewResult.remainingCount > 0 ? ` — ещё ${reviewResult.remainingCount} в очереди` : ''));
            await loadDuplicatesReport();
          } catch (error) {
            showSaveToast(false, error.message);
            reviewAiBtn.disabled = false;
            reviewAiBtn.innerHTML = '<i data-lucide="sparkles" class="w-3 h-3"></i>Сверить с ИИ';
            if (window.lucide) window.lucide.createIcons();
          }
        });
      }

      // "ИИ предлагает объединить" — план "Лоты/ИИ", Этап 5, Часть А
      // (16.09.2026). Вердикт `duplicate` от ИИ (`source='ai'`) уже записан
      // в catalog_dedup_verdicts (см. `reviewConflictsWithAi` — пара больше
      // никогда не уйдёт в Gemini повторно), но САМО слияние — необратимая
      // операция (переезд заказов/ссылок/вишлиста) — остаётся ТОЛЬКО по
      // клику человека, тот же принцип, что у решения 4 плана. "Это разные"
      // здесь перезаписывает ИИ-вердикт на `not_duplicate, source='manual'`
      // (тот же `recordCatalogDedupVerdict`, что и у «Спорных пар» — upsert
      // всегда перезаписывает предыдущий вердикт независимо от источника).
      if (aiSuggestedMerges.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `<div class="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-violet-500"></i>ИИ предлагает объединить (${aiSuggestedMerges.length})</div>`;
        aiSuggestedMerges.forEach((pair, pairIdx) => {
          const block = document.createElement('div');
          block.className = 'border border-violet-200 bg-violet-50 rounded-xl p-3 mb-2 space-y-1.5';
          // 19.09.2026 (репорт VASY: не видно, с чем сравнивается) — та же
          // разметка эталон/кандидат, что у "Спорных пар" выше.
          [pair.a, pair.b].forEach((item, idx) => {
            const isAnchor = idx === 0;
            const row = document.createElement('div');
            row.className = `flex items-center gap-2 text-xs${isAnchor ? ' bg-white border border-violet-300 rounded-lg px-2 py-1.5' : ''}`;
            row.innerHTML = `
              ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
              <span class="min-w-0">
                ${isAnchor ? '<span class="block text-[9px] font-semibold text-violet-700 uppercase tracking-wide">Сравниваем с</span>' : ''}
                <span class="text-gray-700 break-words">${escapeHtmlClient(item.shortName || item.original)}
                  <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span></span>
              </span>
            `;
            block.appendChild(row);
          });
          const actions = document.createElement('div');
          actions.className = 'flex items-center justify-between gap-2 pt-1';
          actions.innerHTML = `
            <span class="text-[11px] text-violet-700 truncate" title="${escapeHtmlClient(pair.reason)}">${pair.reason ? escapeHtmlClient(pair.reason) : 'ИИ считает это одним товаром'}</span>
            <span class="flex gap-1.5 shrink-0">
              <button type="button" class="ai-merge-not-duplicate-btn px-2 py-1 rounded-lg border border-gray-200 text-gray-700 text-[11px]" data-idx="${pairIdx}">Это разные</button>
              <button type="button" class="ai-merge-btn px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px]" data-idx="${pairIdx}">Объединить</button>
            </span>
          `;
          block.appendChild(actions);
          section.appendChild(block);
        });
        section.querySelectorAll('.ai-merge-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const pair = aiSuggestedMerges[parseInt(btn.dataset.idx, 10)];
            closeDuplicatesModal();
            openMergeCompare(pair.a.original, pair.b.original);
          });
        });
        section.querySelectorAll('.ai-merge-not-duplicate-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            const pair = aiSuggestedMerges[parseInt(btn.dataset.idx, 10)];
            try {
              await callServer('recordCatalogDedupVerdict', pair.a.original, pair.b.original, 'not_duplicate');
              showSaveToast(true, 'Отмечено: это разные позиции');
              btn.closest('.border-violet-200').remove();
            } catch (error) {
              showSaveToast(false, error.message);
              btn.disabled = false;
            }
          });
        });
        duplicatesBody.appendChild(section);
      }

      if (window.lucide) window.lucide.createIcons();

      // Фаза 6.4 (04.08.2026) — аудит Заказы↔Каталог, обе стороны. Чисто
      // информационно, ничего не блокирует и не трогает автоматически.
      // Сознательно СРАЗУ после "Вероятные дубли" (03.08.2026, репорт VASY:
      // раньше стояли в самом низу, за длинным списком "Без ссылки" —
      // терялись из виду) — эти два списка обычно короче и требуют внимания
      // не меньше, чем дубли.
      if (result.orphanedOrders.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Заказы без соответствия в каталоге (${result.orphanedOrders.length})</div>
          <div class="space-y-1">
            ${result.orphanedOrders.map(o => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(o.productOriginal)}
                <span class="text-gray-400">— ${escapeHtmlClient(o.orderId)}${o.dateOrderDisplay ? ` · ${escapeHtmlClient(o.dateOrderDisplay)}` : ''}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }

      if (result.unusedSkus.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Позиции без единого заказа (${result.unusedSkus.length})</div>
          <div class="space-y-1">
            ${result.unusedSkus.map(item => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }

      if (result.missingLink.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Без ссылки (${result.missingLink.length})</div>
          <div class="space-y-1">
            ${result.missingLink.map(item => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }

      if (result.missingImage.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `
          <div class="text-xs font-semibold text-gray-500 mb-2">Без фото (${result.missingImage.length})</div>
          <div class="space-y-1">
            ${result.missingImage.map(item => `
              <div class="text-xs text-gray-600 border border-gray-100 rounded-lg px-2.5 py-1.5">
                ${escapeHtmlClient(item.shortName || item.original)}
                <span class="text-gray-400">— ${escapeHtmlClient(item.original)}</span>
              </div>
            `).join('')}
          </div>
        `;
        duplicatesBody.appendChild(section);
      }
    }
  }
};
