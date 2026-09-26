'use strict';

/**
 * Экран "Спрос клиентов" — перенесён из admin/wishlist-demand.html (SPA
 * админки, 02.08.2026). Без нижней навигации (как и в оригинале) — открывается
 * иконкой из catalog.html, не входит в 6 основных разделов меню.
 */
window.Screens = window.Screens || {};
window.Screens.wishlistDemand = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Спрос клиентов</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="add-manual-wishlist-btn" title="Добавить в вишлист от лица клиента" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-5 h-5"></i>
      </button>
      <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <!-- «Уже заказано — связать?» (IMPLEMENTATION-PLAN-GAMIFICATION.md §3.5): у клиента есть
             позиция вишлиста под его заказ в пути, а связи нет — клиент не видит охоту. -->
        <div id="link-suggest"></div>
        <div class="text-[11px] text-gray-400 px-1 mb-2">По каталогу</div>
        <div id="demand-list"></div>
        <div id="demand-empty" class="hidden text-center text-sm text-gray-400 py-6">Активных желаний пока нет.</div>

        <!-- Очередь «Недобавленные из вишлиста» (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.16.1, Р2/А5)
             вместо «Не найдено в каталоге»: позиции, которые не определились по каталогу и не
             подтверждены клиентом, одинаковые у разных клиентов — одной группой. -->
        <div class="text-[11px] text-gray-400 px-1 mb-2 mt-6">Недобавленные из вишлиста</div>
        <div id="unknown-list"></div>
        <div id="unknown-empty" class="hidden text-center text-sm text-gray-400 py-6">Таких позиций нет.</div>
      </main>
      ${SkuModal.html()}

      <!-- Фаза 6.3 (04.08.2026) — менеджер добавляет позицию в вишлист от лица клиента. -->
      <div id="manual-wishlist-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Добавить в вишлист от лица клиента</h2>
            <button id="manual-wishlist-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div class="relative">
              <label class="text-xs font-medium text-gray-500">Клиент</label>
              <input type="text" id="manual-wishlist-client-search" autocomplete="off"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Поиск клиента...">
              <ul id="manual-wishlist-client-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
            <button type="button" id="manual-wishlist-use-manual-client" class="text-xs text-indigo-600 font-medium">+ Ввести вручную (без подтверждения)</button>

            <!-- Доработка 04.08.2026 (репорт VASY) — ссылка первым полем, тот
                 же приём, что уже работает в client/screens/wishlist.js и в
                 форме заказа: "похоже на ссылку -> Распознать" через
                 LinkResolverService (resolveWishlistLink). Дедуп по ссылке
                 (совпадение с уже привязанной позицией каталога) делает сам
                 backend внутри addWishlistItem — здесь достаточно передать
                 sourceUrl, повторную ручную проверку не дублируем. -->
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на товар</label>
              <div class="flex gap-2 mt-1">
                <input type="text" id="manual-wishlist-url"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Вставьте ссылку — можно распознать автоматически">
                <button type="button" id="manual-wishlist-resolve-btn" disabled
                  class="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                  Распознать
                </button>
              </div>
            </div>

            <!-- Поиск по каталогу (04.08.2026, репорт VASY) — тот же приём,
                 что в order-new.js/_sku-modal.js: если позиция уже есть в
                 каталоге, выбор из поиска однозначно исключает дубль-по-тексту,
                 не полагаясь только на совпадение по ссылке. -->
            <div class="relative">
              <label class="text-xs font-medium text-gray-500">Или найдите в каталоге</label>
              <input type="text" id="manual-wishlist-catalog-search" autocomplete="off"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Поиск по каталогу...">
              <ul id="manual-wishlist-catalog-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              <div id="manual-wishlist-selected-sku" class="hidden mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-800 flex items-center justify-between gap-2">
                <span id="manual-wishlist-selected-sku-text"></span>
                <button type="button" id="manual-wishlist-clear-sku" title="Очистить выбор" class="shrink-0 text-indigo-400 hover:text-indigo-700">
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div>
              <label class="text-xs font-medium text-gray-500">Название * <span class="text-gray-400 font-normal">(если не нашли в каталоге)</span></label>
              <input type="text" id="manual-wishlist-title" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Monster High Ghoulia Yelps">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Короткое название RU</label>
              <input type="text" id="manual-wishlist-short-name" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="manual-wishlist-description" rows="2" maxlength="300"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на изображение</label>
              <input type="text" id="manual-wishlist-image"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <div id="manual-wishlist-error" class="text-xs text-red-500 hidden"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="manual-wishlist-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="manual-wishlist-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить</button>
          </div>
        </div>
      </div>
      ${ManualClientModal.html()}
    `;

    const demandList = document.getElementById('demand-list');
    const demandEmpty = document.getElementById('demand-empty');
    const unknownList = document.getElementById('unknown-list');
    const unknownEmpty = document.getElementById('unknown-empty');
    const refreshBtn = document.getElementById('refresh-btn');
    // Фаза 4 интеграции Вишлист/Каталог/Заказы (04.08.2026) — "черновик SKU":
    // перенос позиции вишлиста в каталог из раздела "Не найдено".
    const skuModal = SkuModal.init({ onSaved: () => load() });

    // Фаза 6.3 (04.08.2026) — менеджер добавляет позицию в вишлист от лица
    // клиента (клиент попросил куклу в переписке, не через мини-апп).
    const manualWishlistModal = document.getElementById('manual-wishlist-modal');
    const manualWishlistClientSearch = document.getElementById('manual-wishlist-client-search');
    const manualWishlistClientDropdown = document.getElementById('manual-wishlist-client-dropdown');
    const manualWishlistSaveBtn = document.getElementById('manual-wishlist-save');
    const manualWishlistError = document.getElementById('manual-wishlist-error');
    let manualWishlistClientId = '';
    let manualWishlistClientUsername = '';
    let manualWishlistClientName = '';
    // Выбранная позиция каталога (04.08.2026, доработка по фидбеку VASY) —
    // если заполнено, при сохранении уходит как skuOriginal вместо ручных
    // полей, тот же принцип, что isManualMode в client/screens/wishlist.js.
    let manualWishlistSelectedSku = null;
    const manualWishlistUrlInput = document.getElementById('manual-wishlist-url');
    const manualWishlistResolveBtn = document.getElementById('manual-wishlist-resolve-btn');
    const manualWishlistCatalogSearch = document.getElementById('manual-wishlist-catalog-search');
    const manualWishlistCatalogDropdown = document.getElementById('manual-wishlist-catalog-dropdown');
    const manualWishlistSelectedSkuBox = document.getElementById('manual-wishlist-selected-sku');

    const manualClientModal = ManualClientModal.init({
      onSaved: ({ username, name }) => {
        manualWishlistClientId = '';
        manualWishlistClientUsername = username;
        manualWishlistClientName = name;
        manualWishlistClientSearch.value = name !== '' ? `${name} (${username || 'без username'})` : (username || 'Без данных');
      }
    });

    function closeManualWishlistModal() {
      manualWishlistModal.classList.add('hidden');
      manualWishlistModal.classList.remove('flex');
    }

    function openManualWishlistModal() {
      manualWishlistClientId = ''; manualWishlistClientUsername = ''; manualWishlistClientName = '';
      manualWishlistClientSearch.value = '';
      manualWishlistClientDropdown.classList.remove('active');
      manualWishlistSelectedSku = null;
      manualWishlistSelectedSkuBox.classList.add('hidden');
      manualWishlistCatalogSearch.value = '';
      manualWishlistCatalogDropdown.classList.remove('active');
      manualWishlistUrlInput.value = '';
      manualWishlistResolveBtn.disabled = true;
      document.getElementById('manual-wishlist-title').value = '';
      document.getElementById('manual-wishlist-short-name').value = '';
      document.getElementById('manual-wishlist-description').value = '';
      document.getElementById('manual-wishlist-image').value = '';
      manualWishlistError.classList.add('hidden');
      manualWishlistModal.classList.remove('hidden');
      manualWishlistModal.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }

    function looksLikeManualWishlistUrl(value) {
      return /^https?:\/\//i.test(value.trim());
    }
    manualWishlistUrlInput.addEventListener('input', (e) => {
      manualWishlistResolveBtn.disabled = !looksLikeManualWishlistUrl(e.target.value);
    });

    // "Распознать" (05.08.2026, фикс по фидбоку VASY) — этот экран админский,
    // а WebApp.js подставляет user первым аргументом ТОЛЬКО клиентским методам
    // (см. WebApp.js:_handleWebAppRequest). resolveWishlistLink(user, url) — из
    // CLIENT_ALLOWED_METHODS, ждёт user первым параметром; вызов отсюда без
    // user на самом деле передавал url НА МЕСТО user (url становился undefined),
    // отсюда всегда "Введите корректную ссылку на товар." даже на валидной
    // ссылке. Правильный метод для админского контекста — уже существующий
    // resolveProductLinkForAdmin(url) (общий троттлинг, без user), тот же,
    // что использует SKU-модалка в режиме create.
    manualWishlistResolveBtn.addEventListener('click', async () => {
      const url = manualWishlistUrlInput.value.trim();
      if (url === '') return;

      manualWishlistResolveBtn.disabled = true;
      const icon = manualWishlistResolveBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      try {
        const result = await callServer('resolveProductLinkForAdmin', url);
        document.getElementById('manual-wishlist-title').value = result.title.slice(0, 150);
        document.getElementById('manual-wishlist-description').value = result.description.slice(0, 300);
        if (result.imageUrl) document.getElementById('manual-wishlist-image').value = result.imageUrl;
      } catch (error) {
        manualWishlistError.textContent = error.message;
        manualWishlistError.classList.remove('hidden');
      } finally {
        manualWishlistResolveBtn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');
      }
    });

    // Поиск по каталогу (04.08.2026, доработка по фидбоку VASY) — выбор
    // существующей позиции вместо ручного ввода, тот же приём, что в
    // order-new.js/order-edit.js.
    const handleManualWishlistCatalogSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { manualWishlistCatalogDropdown.classList.remove('active'); return; }

      const results = await callServer('searchSku', query);
      manualWishlistCatalogDropdown.innerHTML = '';
      if (results.length === 0) {
        manualWishlistCatalogDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
              ${item.imageUrl ? `<img src="${escapeHtmlClient(item.imageUrl)}" alt="" class="w-8 h-8 rounded-lg object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
              <div class="font-medium text-gray-800 text-sm truncate">${escapeHtmlClient(item.label)}</div>
            </div>
          `;
          li.addEventListener('click', () => {
            manualWishlistSelectedSku = item.value;
            document.getElementById('manual-wishlist-selected-sku-text').textContent = `Выбрано: ${item.label}`;
            manualWishlistSelectedSkuBox.classList.remove('hidden');
            manualWishlistCatalogSearch.value = '';
            manualWishlistCatalogDropdown.classList.remove('active');
            // Доработка 05.08.2026 (фидбек VASY) — те же поля, что
            // order-new.js подставляет при выборе позиции из поиска
            // (searchSku отдаёт только value/label/imageUrl, описания там нет),
            // чтобы менеджер видел, что именно уйдёт в вишлист, до сохранения.
            document.getElementById('manual-wishlist-title').value = item.value;
            document.getElementById('manual-wishlist-short-name').value = item.label;
            if (item.imageUrl) document.getElementById('manual-wishlist-image').value = item.imageUrl;
          });
          manualWishlistCatalogDropdown.appendChild(li);
        });
      }
      manualWishlistCatalogDropdown.classList.add('active');
      if (window.lucide) window.lucide.createIcons();
    }, 300);
    manualWishlistCatalogSearch.addEventListener('input', handleManualWishlistCatalogSearch);

    document.getElementById('manual-wishlist-clear-sku').addEventListener('click', () => {
      manualWishlistSelectedSku = null;
      manualWishlistSelectedSkuBox.classList.add('hidden');
    });

    document.getElementById('add-manual-wishlist-btn').addEventListener('click', openManualWishlistModal);
    document.getElementById('manual-wishlist-close').addEventListener('click', closeManualWishlistModal);
    document.getElementById('manual-wishlist-cancel').addEventListener('click', closeManualWishlistModal);
    document.getElementById('manual-wishlist-use-manual-client').addEventListener('click', () => manualClientModal.open());

    const handleManualWishlistClientSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { manualWishlistClientDropdown.classList.remove('active'); return; }

      // ИСПРАВЛЕНО (18.08.2026) — см. тот же комментарий в order-new.js:
      // 'searchClient' (без "s") не существует в контракте, прозрачно
      // проксировался на старый GAS-индекс (только зашедшие в бота клиенты).
      const results = await callServer('searchClients', query);
      manualWishlistClientDropdown.innerHTML = '';
      if (results.length === 0) {
        manualWishlistClientDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
            ${escapeHtmlClient(item.displayName)}
            ${item.pending ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">не подтверждён</span>' : ''}
          </div>`;
          li.addEventListener('click', () => {
            manualWishlistClientId = item.telegramId;
            manualWishlistClientUsername = item.username;
            manualWishlistClientName = item.name;
            manualWishlistClientSearch.value = item.displayName;
            manualWishlistClientDropdown.classList.remove('active');
          });
          manualWishlistClientDropdown.appendChild(li);
        });
      }
      manualWishlistClientDropdown.classList.add('active');
    }, 300);
    manualWishlistClientSearch.addEventListener('input', handleManualWishlistClientSearch);

    document.addEventListener('click', (e) => {
      if (!manualWishlistClientSearch.contains(e.target) && !manualWishlistClientDropdown.contains(e.target)) {
        manualWishlistClientDropdown.classList.remove('active');
      }
      if (!manualWishlistCatalogSearch.contains(e.target) && !manualWishlistCatalogDropdown.contains(e.target)) {
        manualWishlistCatalogDropdown.classList.remove('active');
      }
    });

    manualWishlistSaveBtn.addEventListener('click', async () => {
      manualWishlistError.classList.add('hidden');

      if (!manualWishlistClientId && !manualWishlistClientUsername) {
        manualWishlistError.textContent = 'Выберите клиента из поиска или введите вручную.';
        manualWishlistError.classList.remove('hidden');
        return;
      }
      const rawTitle = document.getElementById('manual-wishlist-title').value.trim();
      if (!manualWishlistSelectedSku && rawTitle === '') {
        manualWishlistError.textContent = 'Выберите позицию из каталога или укажите название вручную.';
        manualWishlistError.classList.remove('hidden');
        return;
      }

      // Блокировка кнопки на время запроса — та же защита от двойной
      // отправки, что уже добавлена в клиентский вишлист (04.08.2026).
      manualWishlistSaveBtn.disabled = true;
      try {
        await callServer('addWishlistItemForClient',
          { telegramId: manualWishlistClientId, username: manualWishlistClientUsername, name: manualWishlistClientName },
          {
            skuOriginal: manualWishlistSelectedSku,
            rawTitle: rawTitle,
            shortNameRu: document.getElementById('manual-wishlist-short-name').value.trim(),
            rawDescription: document.getElementById('manual-wishlist-description').value.trim(),
            sourceUrl: manualWishlistUrlInput.value.trim(),
            rawImageUrl: document.getElementById('manual-wishlist-image').value.trim()
          });
        closeManualWishlistModal();
        showSaveToast(true, 'Добавлено в вишлист клиента');
        load();
      } catch (error) {
        manualWishlistError.textContent = error.message;
        manualWishlistError.classList.remove('hidden');
      } finally {
        manualWishlistSaveBtn.disabled = false;
      }
    });

    load();

    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      load().finally(() => {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    // wishlistId → orderId живого заказа (метка «Заказано», §3.5 плана геймификации).
    let orderedByWishlistId = {};

    function orderedChipHtml(orderId) {
      return `<button type="button" class="ordered-chip shrink-0 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-medium" data-order-id="${escapeHtmlClient(orderId)}">Заказано · ${escapeHtmlClient(orderId)}</button>`;
    }
    function wireOrderedChips(el) {
      el.querySelectorAll('.ordered-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateTo(`orders/${encodeURIComponent(btn.dataset.orderId)}/edit`);
        });
      });
    }

    const linkSuggestBox = document.getElementById('link-suggest');
    async function loadLinkSuggestions() {
      let list = [];
      try { list = await callServer('getOrderLinkSuggestions'); } catch (_e) { list = []; }
      linkSuggestBox.innerHTML = '';
      if (list.length === 0) return;
      const box = document.createElement('div');
      box.className = 'mb-5';
      box.innerHTML = `<div class="text-[11px] text-gray-400 px-1 mb-2">Уже заказано — связать с вишлистом? · ${list.length}</div>`;
      list.forEach(s => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl shadow-sm border border-emerald-100 p-3 mb-2 flex items-center gap-3';
        card.innerHTML = `
          ${s.imageUrl ? `<img src="${escapeHtmlClient(s.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1 text-[12px] text-gray-500">
            <div class="text-[13px] font-medium text-gray-800 truncate">${escapeHtmlClient(s.clientDisplay)}</div>
            <div class="truncate">Заказ <a href="#" class="ls-order text-indigo-600">${escapeHtmlClient(s.orderId)}</a> · ${escapeHtmlClient(s.orderProduct)}</div>
            <div class="truncate">В вишлисте: «${escapeHtmlClient(s.wishlistName)}»${s.by === 'model' ? ' (по модели)' : ''}</div>
          </div>
          <button type="button" class="ls-link shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-medium">Связать</button>`;
        card.querySelector('.ls-order').addEventListener('click', (e) => {
          e.preventDefault();
          navigateTo(`orders/${encodeURIComponent(s.orderId)}/edit`);
        });
        card.querySelector('.ls-link').addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await callServer('setOrderWishlistLink', s.orderId, s.wishlistId);
            showSaveToast(true, 'Связано — клиент увидит путь охоты');
            load();
          } catch (error) {
            btn.disabled = false;
            showSaveToast(false, error.message);
          }
        });
        box.appendChild(card);
      });
      linkSuggestBox.appendChild(box);
    }

    async function load() {
      demandList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      unknownList.innerHTML = '';
      loadLinkSuggestions();
      try {
        const [result, queue] = await Promise.all([
          callServer('getWishlistDemand'),
          callServer('getWishlistMatchQueue').catch(() => null)
        ]);
        orderedByWishlistId = result.ordered || {};
        render(result, queue);
      } catch (error) {
        demandList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function render(result, queue) {
      demandList.innerHTML = '';
      if (result.demand.length === 0) {
        demandEmpty.classList.remove('hidden');
      } else {
        demandEmpty.classList.add('hidden');
        result.demand.forEach(d => demandList.appendChild(buildDemandCard(d)));
      }

      unknownList.innerHTML = '';
      if (queue) {
        renderQueue(queue);
      } else if (result.unknown.length === 0) {
        unknownEmpty.classList.remove('hidden');
      } else {
        unknownEmpty.classList.add('hidden');
        // Фаза 6.1 (04.08.2026) — result.unknown теперь массив кластеров
        // (похожие по названию Unknown-позиции сгруппированы бэкендом).
        result.unknown.forEach(cluster => unknownList.appendChild(buildUnknownCluster(cluster)));
      }

      if (window.lucide) window.lucide.createIcons();
    }

    // --- Очередь «Недобавленные из вишлиста» (§11.16.1 А5) ---
    const QUEUE_SECTIONS = {
      rejected: { title: 'Клиент ответил «Нет»', open: true },
      offer: { title: 'Несколько вариантов — выберите', open: true },
      unknown: { title: 'Не узнали', open: true },
      waiting: { title: 'Ждут ответа клиента', open: false },
      confirmed: { title: 'Подтверждены клиентом, в каталоге нет', open: false }
    };

    function renderQueue(queue) {
      if (queue.groups.length === 0) { unknownEmpty.classList.remove('hidden'); return; }
      unknownEmpty.classList.add('hidden');
      for (const [section, meta] of Object.entries(QUEUE_SECTIONS)) {
        const groups = queue.groups.filter(g => g.section === section);
        if (groups.length === 0) continue;
        const box = document.createElement('details');
        box.className = 'mb-3';
        if (meta.open) box.open = true;
        box.innerHTML = `<summary class="cursor-pointer text-[12px] font-semibold text-gray-600 px-1 mb-2">${escapeHtmlClient(meta.title)} · ${groups.length}</summary>`;
        groups.forEach(g => box.appendChild(buildQueueGroup(g)));
        unknownList.appendChild(box);
      }
    }

    function optionRowHtml(o, idx) {
      const sub = [o.kind === 'sku' ? 'в каталоге' : o.series, o.year, o.modelCode].filter(Boolean).join(' · ');
      return `
        <div class="flex items-center gap-2 p-2 rounded-xl border ${o.kind === 'sku' ? 'border-indigo-100 bg-indigo-50/40' : 'border-gray-200'}">
          ${o.imageUrl ? `<img src="${escapeHtmlClient(o.imageUrl)}" alt="" class="w-10 h-10 rounded-lg object-cover shrink-0 bg-white" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="text-[13px] font-medium text-gray-800 truncate">${escapeHtmlClient(o.name)}</div>
            ${sub ? `<div class="text-[11px] text-gray-400 truncate">${escapeHtmlClient(sub)}</div>` : ''}
          </div>
          <button type="button" class="q-opt-yes shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-medium" data-idx="${idx}">Это она</button>
        </div>`;
    }

    function buildQueueGroup(g) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';
      const ids = g.items.map(i => i.wishlistId);
      const first = g.items[0];
      const image = (g.model && g.model.imageUrl) || (g.options[0] && g.options[0].imageUrl) || first.rawImageUrl || '';
      const sub = g.model ? [g.model.series, g.model.year, g.model.modelCode].filter(Boolean).join(' · ') : '';
      const refOption = g.options.find(o => o.kind === 'ref');
      const modelKey = g.model ? g.model.modelKey : (g.options.length === 1 && refOption ? refOption.modelKey : '');

      card.innerHTML = `
        <div class="flex items-start gap-3">
          ${image ? `<img src="${escapeHtmlClient(image)}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="font-medium text-gray-800 text-[14px]">${escapeHtmlClient(g.title)}</div>
              <span class="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">${g.items.length > 1 ? 'Хотят: ' + g.items.length : '1 клиент'}</span>
            </div>
            ${sub ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(sub)}</div>` : ''}
            ${g.rawTitle && g.rawTitle !== g.title ? `<div class="text-[12px] text-gray-400 mt-0.5">«${escapeHtmlClient(g.rawTitle)}»</div>` : ''}
          </div>
        </div>
        <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
          ${g.items.map((u, i) => `
            <div class="text-[12px] text-gray-500">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate">${escapeHtmlClient(u.clientDisplay)} · ${escapeHtmlClient(u.createdAtDisplay)}${u.status !== 'Хочу' ? ' · ' + escapeHtmlClient(u.status) : ''}</span>
                ${u.status === 'Хочу' ? (orderedByWishlistId[u.wishlistId] ? orderedChipHtml(orderedByWishlistId[u.wishlistId]) : `<button type="button" class="q-order shrink-0 text-indigo-600 text-[11px] font-medium" data-idx="${i}">Заказ</button>`) : ''}
              </div>
              ${u.sourceUrl ? `<a href="${escapeHtmlClient(u.sourceUrl)}" target="_blank" rel="noopener" class="block text-indigo-500 truncate">${escapeHtmlClient(u.sourceUrl)}</a>` : ''}
              ${u.rejected.length ? `<div class="text-amber-700">Предлагали: ${escapeHtmlClient(u.rejected.join('; '))}</div>` : ''}
              ${u.clientHint ? `<div class="text-emerald-700">Клиент: «${escapeHtmlClient(u.clientHint)}»</div>` : ''}
            </div>`).join('')}
        </div>
        ${g.options.length ? `<div class="mt-2 space-y-1.5">${g.options.map(optionRowHtml).join('')}</div>` : ''}
        <div class="q-panel hidden mt-2"></div>
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button type="button" class="q-find py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium">Это она… (найти)</button>
          <button type="button" class="q-add py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium">Внести в каталог</button>
          <button type="button" class="q-rename py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">Только переименовать</button>
          <button type="button" class="q-skip py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium">Пропустить</button>
        </div>
      `;

      const panel = card.querySelector('.q-panel');
      const resolve = async (action, payload, btn) => {
        if (btn) btn.disabled = true;
        try {
          await callServer('resolveWishlistQueueGroup', ids, action, payload || {});
          showSaveToast(true, action === 'skip' ? 'Убрано из очереди' : action === 'rename' ? 'Название сохранено' : `Привязано: ${ids.length}`);
          load();
        } catch (error) {
          if (btn) btn.disabled = false;
          showSaveToast(false, error.message);
        }
      };

      card.querySelectorAll('.q-opt-yes').forEach(btn => {
        btn.addEventListener('click', () => {
          const o = g.options[Number(btn.dataset.idx)];
          if (o.kind === 'sku') resolve('link', { skuOriginal: o.original }, btn);
          else resolve('model', { modelKey: o.modelKey }, btn);
        });
      });

      wireOrderedChips(card);
      card.querySelectorAll('.q-order').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = g.items[Number(btn.dataset.idx)];
          navigateTo('carts/new', { telegramId: u.telegramId, username: u.username, name: u.clientName, productOriginal: u.rawTitle, wishlistId: u.wishlistId });
        });
      });

      card.querySelector('.q-skip').addEventListener('click', (e) => resolve('skip', {}, e.currentTarget));

      card.querySelector('.q-rename').addEventListener('click', () => {
        panel.classList.remove('hidden');
        panel.innerHTML = `
          <div class="flex gap-2">
            <input type="text" maxlength="150" class="q-name flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Название для клиента" value="${escapeHtmlClient(g.title)}">
            <button type="button" class="q-name-save shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium">Сохранить</button>
          </div>`;
        panel.querySelector('.q-name-save').addEventListener('click', (e) => resolve('rename', { name: panel.querySelector('.q-name').value.trim() }, e.currentTarget));
      });

      card.querySelector('.q-find').addEventListener('click', () => {
        panel.classList.remove('hidden');
        panel.innerHTML = `
          <input type="text" class="q-search w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Каталог или справочник кукол..." value="${escapeHtmlClient(g.rawTitle || '')}">
          <div class="q-results mt-2 space-y-1.5"></div>`;
        const input = panel.querySelector('.q-search');
        const results = panel.querySelector('.q-results');
        const run = debounce(async () => {
          const q = input.value.trim();
          if (q.length < 2) { results.innerHTML = ''; return; }
          let found;
          try { found = await callServer('searchWishlistCandidatesAdmin', q); } catch (error) { results.innerHTML = `<div class="text-xs text-red-500">${escapeHtmlClient(error.message)}</div>`; return; }
          if (input.value.trim() !== q) return;
          const opts = [
            ...found.catalog.map(c => ({ kind: 'sku', original: c.value, name: c.label, imageUrl: c.imageUrl })),
            ...found.reference.map(r => ({ kind: 'ref', modelKey: r.key, name: r.name, imageUrl: r.imageUrl, series: r.series, year: r.year, modelCode: r.modelCode }))
          ];
          results.innerHTML = opts.length ? opts.map(optionRowHtml).join('') : '<div class="text-xs text-gray-400">Ничего не найдено</div>';
          results.querySelectorAll('.q-opt-yes').forEach(btn => {
            btn.addEventListener('click', () => {
              const o = opts[Number(btn.dataset.idx)];
              if (o.kind === 'sku') resolve('link', { skuOriginal: o.original }, btn);
              else resolve('model', { modelKey: o.modelKey }, btn);
            });
          });
        }, 300);
        input.addEventListener('input', run);
        run();
        input.focus();
      });

      card.querySelector('.q-add').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        let prefill = { original: g.rawTitle || g.title, description: first.rawDescription, imageUrl: first.rawImageUrl };
        if (modelKey) {
          btn.disabled = true;
          try {
            const { model, suggestedTags } = await callServer('getReferenceModelPrefill', modelKey);
            prefill = {
              original: model.title || g.rawTitle || g.title,
              description: first.rawDescription,
              imageUrl: model.imageUrl || first.rawImageUrl,
              brand: suggestedTags.brand,
              character: suggestedTags.character,
              series: suggestedTags.series,
              modelCode: model.modelCode || ''
            };
          } catch (error) {
            showSaveToast(false, error.message);
          } finally {
            btn.disabled = false;
          }
        }
        // После сохранения SKU-модалка привяжет все позиции группы (context.wishlistIds),
        // а сервер — и остальные позиции с той же моделью справочника (А5).
        skuModal.open('create', null, prefill, { wishlistIds: ids, pendingLink: first.sourceUrl, pendingLinkSource: 'Вишлист' });
      });

      return card;
    }

    function buildDemandCard(d) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      card.innerHTML = `
        <div class="flex items-start gap-3 cursor-pointer" data-toggle>
          ${d.imageUrl ? `<img src="${escapeHtmlClient(d.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <div class="font-semibold text-gray-900 text-[15px] truncate">${escapeHtmlClient(d.productDisplay)}</div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Хотят: ${d.activeCount}</span>
                ${d.orderedCount > 0 ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Заказано: ${d.orderedCount}</span>` : ''}
                ${d.purchasedCount > 0 ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Куплено: ${d.purchasedCount}</span>` : ''}
                <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 chevron-icon"></i>
              </div>
            </div>
            ${d.skuOriginal !== d.productDisplay ? `<div class="text-[12px] text-gray-400 mt-0.5 truncate">${escapeHtmlClient(d.skuOriginal)}</div>` : ''}
            ${d.description ? `<div class="text-[12px] text-gray-500 mt-1">${escapeHtmlClient(d.description)}</div>` : ''}
            ${d.link ? `<a href="${escapeHtmlClient(d.link)}" target="_blank" rel="noopener" class="block text-[12px] text-indigo-500 mt-0.5 truncate" onclick="event.stopPropagation()">${escapeHtmlClient(d.link)}</a>` : ''}
          </div>
        </div>
        <div class="clients-block hidden mt-2 pt-2 border-t border-gray-100 space-y-1.5">
          ${d.clients.map((c, idx) => `
            <div class="flex items-center justify-between gap-2">
              <span class="text-[12px] text-gray-500">${escapeHtmlClient(c.display)}</span>
              ${c.orderedOrderId ? orderedChipHtml(c.orderedOrderId) : `<button type="button" class="order-from-demand-btn shrink-0 px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 text-[11px] font-medium" data-idx="${idx}">
                Оформить заказ
              </button>`}
            </div>
          `).join('')}
        </div>
      `;

      card.querySelector('[data-toggle]').addEventListener('click', () => {
        const block = card.querySelector('.clients-block');
        const chevron = card.querySelector('.chevron-icon');
        block.classList.toggle('hidden');
        chevron.style.transform = block.classList.contains('hidden') ? '' : 'rotate(180deg)';
      });

      // Фаза 5 интеграции Вишлист/Каталог/Заказы (04.08.2026) — "Оформить
      // заказ" у каждого клиента отдельно (клиенты теперь структурированные
      // объекты, не строки, см. getWishlistDemand).
      wireOrderedChips(card);
      card.querySelectorAll('.order-from-demand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const c = d.clients[parseInt(btn.dataset.idx, 10)];
          // Слияние «Новый заказ»→«Корзина» (05.09.2026) — cart-new.js читает
          // те же параметры (см. её JSDoc §2.3).
          navigateTo('carts/new', {
            telegramId: c.telegramId, username: c.username, name: c.name,
            skuOriginal: d.skuOriginal, productDisplay: d.productDisplay
          });
        });
      });

      return card;
    }

    function buildUnknownRow(u) {
      const row = document.createElement('div');
      row.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';
      row.innerHTML = `
        <div class="flex items-start gap-3">
          ${u.imageUrl ? `<img src="${escapeHtmlClient(u.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="font-medium text-gray-800 text-[14px] truncate">${escapeHtmlClient(u.productDisplay)}</div>
            ${u.rawTitle && u.rawTitle !== u.productDisplay ? `<div class="text-[12px] text-gray-400 mt-0.5 truncate">${escapeHtmlClient(u.rawTitle)}</div>` : ''}
            ${u.rawDescription ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(u.rawDescription)}</div>` : ''}
            ${u.sourceUrl ? `<div class="text-[12px] text-indigo-500 mt-0.5 truncate"><a href="${escapeHtmlClient(u.sourceUrl)}" target="_blank" rel="noopener">${escapeHtmlClient(u.sourceUrl)}</a></div>` : ''}
            <div class="text-[12px] text-gray-500 mt-1">${escapeHtmlClient(u.clientDisplay || 'Клиент не указан')} · ${escapeHtmlClient(u.createdAtDisplay)}</div>
            ${u.orderedOrderId ? `<div class="mt-1">${orderedChipHtml(u.orderedOrderId)}</div>` : ''}
          </div>
        </div>
        <div class="flex gap-2 mt-2">
          <button type="button" class="add-to-catalog-btn flex-1 text-center py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium">
            Добавить в каталог
          </button>
          <button type="button" class="order-from-unknown-btn flex-1 text-center py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">
            Оформить заказ
          </button>
        </div>
      `;

      wireOrderedChips(row);
      row.querySelector('.add-to-catalog-btn').addEventListener('click', () => {
        skuModal.open('create', null,
          { original: u.rawTitle, description: u.rawDescription, imageUrl: u.rawImageUrl },
          { wishlistId: u.wishlistId, pendingLink: u.sourceUrl, pendingLinkSource: 'Вишлист' });
      });

      // Фаза 5 (04.08.2026) — заказ без привязки к каталогу: "Выпуск" в форме
      // заполнится свободным текстом (productOriginal), не позицией каталога.
      row.querySelector('.order-from-unknown-btn').addEventListener('click', () => {
        navigateTo('carts/new', {
          telegramId: u.telegramId, username: u.username, name: u.clientName,
          productOriginal: u.rawTitle, wishlistId: u.wishlistId
        });
      });

      return row;
    }

    // Фаза 6.1 (04.08.2026) — кластер похожих Unknown-позиций (несколько
    // клиентов хотят одну и ту же куклу с разным написанием/ссылкой).
    // Одиночный кластер (самый частый случай) рендерится как раньше —
    // buildUnknownRow без изменений. Кластер из нескольких — сводная
    // карточка, "Добавить в каталог" создаёт ОДНУ позицию и привязывает
    // сразу все вишлисты кластера (context.wishlistIds, см. _sku-modal.js).
    function buildUnknownCluster(cluster) {
      if (cluster.length === 1) return buildUnknownRow(cluster[0]);

      const primary = cluster[0]; // самая свежая позиция кластера
      const box = document.createElement('div');
      box.className = 'bg-white rounded-2xl shadow-sm border border-amber-200 p-4 mb-3';
      box.innerHTML = `
        <div class="flex items-start gap-3">
          ${primary.imageUrl ? `<img src="${escapeHtmlClient(primary.imageUrl)}" alt="" class="w-11 h-11 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
          <div class="min-w-0 flex-1">
            <div class="font-medium text-gray-800 text-[14px] truncate">${escapeHtmlClient(primary.productDisplay)}</div>
            <span class="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Похоже, хотят ${cluster.length} клиентов</span>
          </div>
        </div>
        <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
          ${cluster.map(u => `
            <div class="text-[12px] text-gray-500 truncate">${escapeHtmlClient(u.clientDisplay || 'Клиент не указан')} — ${escapeHtmlClient(u.rawTitle)}</div>
          `).join('')}
        </div>
        <button type="button" class="add-cluster-to-catalog-btn mt-3 w-full text-center py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium">
          Добавить в каталог (свяжет все ${cluster.length})
        </button>
      `;

      box.querySelector('.add-cluster-to-catalog-btn').addEventListener('click', () => {
        skuModal.open('create', null,
          { original: primary.rawTitle, description: primary.rawDescription, imageUrl: primary.rawImageUrl },
          { wishlistIds: cluster.map(u => u.wishlistId), pendingLink: primary.sourceUrl, pendingLinkSource: 'Вишлист' });
      });

      return box;
    }
  }
};
