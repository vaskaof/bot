'use strict';

/**
 * Экран "Мой вишлист" — перенесён из client/wishlist.html (Phase 2 SPA,
 * 02.08.2026). В оригинале часть состояния (selectedSkuValue, editingWishlistId,
 * reloadWishlist) и обвязка модалки жили на верхнем уровне <script> страницы —
 * это было безопасно, т.к. каждая навигация была полной перезагрузкой страницы
 * (свежий JS-контекст). В SPA все screens/*.js грузятся ОДИН раз и живут в общем
 * global scope весь сеанс — поэтому всё, что раньше было "top-level для страницы",
 * здесь обязано быть ВНУТРИ render(), иначе состояние одного захода на экран
 * утечёт в следующий. showSaveToast — общая функция из router.js.
 */
window.Screens = window.Screens || {};
window.Screens.wishlist = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Мой вишлист</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="add-item-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="active-section">
          <div class="text-[11px] text-gray-400 px-1 mb-2">Хочу</div>
          <div id="active-list"></div>
        </div>

        <div id="purchased-section" class="mt-6">
          <div class="text-[11px] text-gray-400 px-1 mb-2">Куплено</div>
          <div id="purchased-list"></div>
        </div>

        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">
          Список желаний пуст. Нажмите «+», чтобы добавить куклу.
        </div>
      </main>

      <div id="item-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="item-modal-title" class="text-base font-semibold text-gray-900">Добавить в вишлист</h2>
            <button id="item-modal-close" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div id="search-mode-block" class="p-4 space-y-3">
            <div class="relative">
              <input type="text" id="item-search"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Поиск куклы в каталоге или вставьте ссылку" autocomplete="off">
              <ul id="item-search-dropdown" class="dropdown-menu custom-scrollbar"></ul>
            </div>
            <div id="url-hint-block" class="hidden p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-sm text-indigo-800 flex items-center justify-between gap-2">
              <span>Похоже на ссылку на товар</span>
              <button type="button" id="url-hint-resolve-btn" class="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium">Распознать</button>
            </div>
            <div id="selected-sku-display" class="hidden p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-sm text-indigo-800"></div>
            <button type="button" id="switch-to-manual-btn" class="text-xs text-indigo-600 font-medium">Не нашли? Добавить вручную</button>
          </div>

          <div id="manual-mode-block" class="hidden p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на товар</label>
              <div class="flex gap-2 mt-1">
                <input type="text" id="manual-url-input"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Вставьте ссылку — можно распознать автоматически">
                <button type="button" id="resolve-link-btn" disabled
                  class="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                  Распознать
                </button>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Название *</label>
              <input type="text" id="manual-title-input" maxlength="150"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Monster High Ghoulia Yelps">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="manual-description-input" maxlength="300" rows="2"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка на изображение</label>
              <input type="text" id="manual-image-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <button type="button" id="switch-to-search-btn" class="text-xs text-indigo-600 font-medium">← Вернуться к поиску по каталогу</button>
          </div>

          <div id="item-error-text" class="px-4 text-xs text-red-500 hidden"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="item-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="item-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>
    `;

    let selectedSkuValue = null;
    let editingWishlistId = null;
    let reloadWishlist = null;

    const activeList = document.getElementById('active-list');
    const purchasedList = document.getElementById('purchased-list');
    const activeSection = document.getElementById('active-section');
    const purchasedSection = document.getElementById('purchased-section');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');

    let allItems = [];

    loadWishlist();
    reloadWishlist = loadWishlist;

    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      loadWishlist().finally(() => {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    async function loadWishlist() {
      activeList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      purchasedList.innerHTML = '';
      try {
        allItems = await callServer('getClientWishlist');
        renderList();
      } catch (error) {
        activeList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderList() {
      const active = allItems.filter(i => i.status !== 'Куплено');
      const purchased = allItems.filter(i => i.status === 'Куплено');

      if (allItems.length === 0) {
        activeSection.classList.add('hidden');
        purchasedSection.classList.add('hidden');
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      activeSection.classList.toggle('hidden', active.length === 0);
      purchasedSection.classList.toggle('hidden', purchased.length === 0);

      activeList.innerHTML = '';
      active.forEach(item => activeList.appendChild(buildCard(item)));

      purchasedList.innerHTML = '';
      purchased.forEach(item => purchasedList.appendChild(buildCard(item)));

      if (window.lucide) window.lucide.createIcons();
    }

    function buildCard(item) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex gap-3';

      const isPurchased = item.status === 'Куплено';

      card.innerHTML = `
        ${item.rawImageUrl ? `<img src="${escapeHtmlClient(item.rawImageUrl)}" alt="" class="w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-100" onerror="this.style.display='none'">` : ''}
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(item.productDisplay)}</div>
          ${item.isUnknown ? '<span class="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Не в каталоге</span>' : ''}
          ${item.rawDescription ? `<div class="text-[12px] text-gray-400 mt-1">${escapeHtmlClient(item.rawDescription)}</div>` : ''}
          <div class="flex flex-wrap gap-3 mt-1">
            ${item.sourceUrl ? `<a href="${escapeHtmlClient(item.sourceUrl)}" target="_blank" rel="noopener" class="text-[12px] text-indigo-500">Ссылка на товар</a>` : ''}
          </div>
          <div class="flex items-center gap-2 mt-3">
            <button type="button" class="toggle-status-btn flex-1 py-2 rounded-xl text-xs font-medium ${isPurchased ? 'border border-gray-200 text-gray-600' : 'bg-indigo-600 text-white'}">
              ${isPurchased ? 'Вернуть в «Хочу»' : 'Отметить купленным'}
            </button>
            ${item.isUnknown ? '<button type="button" class="edit-item-btn p-2 text-gray-400 hover:text-indigo-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>' : ''}
            <button type="button" class="delete-item-btn p-2 text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>
      `;

      card.querySelector('.toggle-status-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const newStatus = isPurchased ? 'Хочу' : 'Куплено';
          await callServer('updateWishlistItemStatus', item.wishlistId, newStatus);
          loadWishlist();
        } catch (error) {
          btn.disabled = false;
          showSaveToast(false, `Не удалось изменить статус: ${error.message}`);
        }
      });

      card.querySelector('.delete-item-btn').addEventListener('click', async () => {
        if (!confirm('Удалить позицию из вишлиста?')) return;
        try {
          await callServer('deleteWishlistItem', item.wishlistId);
          loadWishlist();
        } catch (error) {
          showSaveToast(false, `Не удалось удалить: ${error.message}`);
        }
      });

      const editBtn = card.querySelector('.edit-item-btn');
      if (editBtn) editBtn.addEventListener('click', () => openModalForEdit(item));

      return card;
    }

    document.getElementById('add-item-btn').addEventListener('click', () => openModalForCreate());

    // --- Модалка добавления/редактирования ---
    const itemModal = document.getElementById('item-modal');
    const searchBlock = document.getElementById('search-mode-block');
    const manualBlock = document.getElementById('manual-mode-block');
    const itemSearch = document.getElementById('item-search');
    const itemSearchDropdown = document.getElementById('item-search-dropdown');
    const selectedSkuDisplay = document.getElementById('selected-sku-display');
    const errorText = document.getElementById('item-error-text');
    const resolveLinkBtn = document.getElementById('resolve-link-btn');
    const manualUrlInput = document.getElementById('manual-url-input');
    const manualTitleInput = document.getElementById('manual-title-input');
    const manualDescriptionInput = document.getElementById('manual-description-input');
    const manualImageInput = document.getElementById('manual-image-input');
    const urlHintBlock = document.getElementById('url-hint-block');
    const urlHintResolveBtn = document.getElementById('url-hint-resolve-btn');

    function looksLikeUrl(value) {
      return /^https?:\/\//i.test(value.trim());
    }

    function resetModalState() {
      selectedSkuValue = null;
      editingWishlistId = null;
      itemSearch.value = '';
      selectedSkuDisplay.classList.add('hidden');
      itemSearchDropdown.classList.remove('active');
      urlHintBlock.classList.add('hidden');
      document.getElementById('manual-title-input').value = '';
      document.getElementById('manual-description-input').value = '';
      document.getElementById('manual-url-input').value = '';
      document.getElementById('manual-image-input').value = '';
      errorText.classList.add('hidden');
      searchBlock.classList.remove('hidden');
      manualBlock.classList.add('hidden');
      resolveLinkBtn.disabled = true;
    }

    function openModalForCreate() {
      resetModalState();
      document.getElementById('item-modal-title').textContent = 'Добавить в вишлист';
      itemModal.classList.remove('hidden');
      itemModal.classList.add('flex');
    }

    // Редактирование доступно только для Unknown-позиций (решение C.5, C4).
    // Технически это delete старой + create новой — отдельного update-метода
    // в согласованном контракте API нет. Wishlist_ID при этом обновляется.
    function openModalForEdit(item) {
      resetModalState();
      editingWishlistId = item.wishlistId;
      document.getElementById('item-modal-title').textContent = 'Редактировать позицию';
      document.getElementById('manual-title-input').value = item.rawTitle;
      document.getElementById('manual-description-input').value = item.rawDescription;
      document.getElementById('manual-url-input').value = item.sourceUrl;
      document.getElementById('manual-image-input').value = item.rawImageUrl;
      resolveLinkBtn.disabled = item.sourceUrl.trim() === '';
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
      itemModal.classList.remove('hidden');
      itemModal.classList.add('flex');
    }

    function closeItemModal() {
      itemModal.classList.add('hidden');
      itemModal.classList.remove('flex');
    }
    document.getElementById('item-modal-close').addEventListener('click', closeItemModal);
    document.getElementById('item-modal-cancel').addEventListener('click', closeItemModal);

    document.getElementById('switch-to-manual-btn').addEventListener('click', () => {
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
    });
    document.getElementById('switch-to-search-btn').addEventListener('click', () => {
      manualBlock.classList.add('hidden');
      searchBlock.classList.remove('hidden');
    });

    // Авто-распознавание товара по ссылке (Phase A: OG-теги/JSON-LD, без AI —
    // см. LinkResolverService.js). Перезаписывает поля формы результатом,
    // пользователь видит и может поправить перед Сохранить. Общая функция —
    // вызывается и с кнопки в ручном режиме, и с подсказки над поиском по каталогу.
    async function performLinkResolve(url) {
      errorText.classList.add('hidden');
      resolveLinkBtn.disabled = true;
      const icon = resolveLinkBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');

      try {
        const result = await callServer('resolveWishlistLink', url);
        manualTitleInput.value = result.title.slice(0, 150);
        manualDescriptionInput.value = result.description.slice(0, 300);
        if (result.imageUrl) manualImageInput.value = result.imageUrl;
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      } finally {
        resolveLinkBtn.disabled = false;
        if (icon) icon.classList.remove('animate-spin');
      }
    }

    manualUrlInput.addEventListener('input', () => {
      resolveLinkBtn.disabled = manualUrlInput.value.trim() === '';
    });

    resolveLinkBtn.addEventListener('click', () => {
      const url = manualUrlInput.value.trim();
      if (url === '') return;
      performLinkResolve(url);
    });

    // Вставка ссылки прямо в строку поиска каталога — подсказка вместо
    // бессмысленного поиска по каталогу текстом ссылки.
    urlHintResolveBtn.addEventListener('click', () => {
      const url = itemSearch.value.trim();
      urlHintBlock.classList.add('hidden');
      itemSearch.value = '';
      searchBlock.classList.add('hidden');
      manualBlock.classList.remove('hidden');
      manualUrlInput.value = url;
      resolveLinkBtn.disabled = false;
      performLinkResolve(url);
    });

    // Автокомплит поиска по каталогу — тот же паттерн debounce/dropdown, что в edit-order.html
    const handleItemSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (looksLikeUrl(query)) { itemSearchDropdown.classList.remove('active'); return; }
      if (query.length < 2) { itemSearchDropdown.classList.remove('active'); return; }

      const results = await callServer('searchSkuForClient', query);
      itemSearchDropdown.innerHTML = '';
      if (results.length === 0) {
        itemSearchDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 last:border-0';
          li.innerHTML = `<div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.label)}</div>`;
          li.addEventListener('click', () => {
            selectedSkuValue = item.value;
            selectedSkuDisplay.textContent = `Выбрано: ${item.label}`;
            selectedSkuDisplay.classList.remove('hidden');
            itemSearch.value = item.label;
            itemSearchDropdown.classList.remove('active');
          });
          itemSearchDropdown.appendChild(li);
        });
      }
      itemSearchDropdown.classList.add('active');
    }, 300);
    itemSearch.addEventListener('input', handleItemSearch);
    itemSearch.addEventListener('input', (e) => {
      urlHintBlock.classList.toggle('hidden', !looksLikeUrl(e.target.value));
    });

    document.addEventListener('click', (e) => {
      if (!itemSearch.contains(e.target) && !itemSearchDropdown.contains(e.target)) {
        itemSearchDropdown.classList.remove('active');
      }
    });

    document.getElementById('item-modal-save').addEventListener('click', async () => {
      errorText.classList.add('hidden');
      const isManualMode = !manualBlock.classList.contains('hidden');

      const payload = {
        skuOriginal: isManualMode ? null : selectedSkuValue,
        rawTitle: document.getElementById('manual-title-input').value.trim(),
        rawDescription: document.getElementById('manual-description-input').value.trim(),
        sourceUrl: document.getElementById('manual-url-input').value.trim(),
        rawImageUrl: document.getElementById('manual-image-input').value.trim()
      };

      if (!isManualMode && !payload.skuOriginal) {
        errorText.textContent = 'Выберите позицию из списка или переключитесь на ручной ввод.';
        errorText.classList.remove('hidden');
        return;
      }
      if (isManualMode && payload.rawTitle === '') {
        errorText.textContent = 'Название обязательно для заполнения.';
        errorText.classList.remove('hidden');
        return;
      }

      try {
        if (editingWishlistId) {
          await callServer('deleteWishlistItem', editingWishlistId);
        }
        await callServer('addWishlistItem', payload);
        closeItemModal();
        showSaveToast(true, editingWishlistId ? 'Позиция обновлена' : 'Добавлено в вишлист');
        if (reloadWishlist) reloadWishlist();
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      }
    });
  }
};
