'use strict';

/**
 * Модалка создания/редактирования позиции каталога (SKU) — общий модуль
 * (02.08.2026), раньше был почти дословно скопирован в catalog.html,
 * index.html и edit-order.html (3 копии). Используется тремя экранами:
 * catalog.js, order-new.js, order-edit.js.
 *
 * Использование в экране:
 *   root.innerHTML = `...основной контент... ${SkuModal.html()}`;
 *   const skuModal = SkuModal.init({ onSaved: () => reload() });
 *   skuModal.open('create');           // новая позиция
 *   skuModal.open('edit', original);   // редактирование существующей
 *   // prefill/context — необязательные (Фаза 3 интеграции Вишлист/Каталог/
 *   // Заказы, 03.08.2026), нужны order-new.js/order-edit.js для сценария
 *   // "вставили ссылку в поле Выпуск":
 *   skuModal.open('create', null, { original, description, imageUrl }, { pendingLink: url });
 */

// Слой 5 плана дедупликации каталога (03.08.2026, опционально) — авто-
// подсказка Бренда по словарю известных франшиз коллекционных кукол. Только
// подсказка: никогда не перезаписывает уже заполненное поле, чистый клиентский
// keyword-matching без AI и без обращения к серверу — дёшево и достаточно для
// закрытого списка известных брендов (в отличие от Персонажа/Серии — открытый
// список имён, туда эта эвристика не годится).
const SKU_MODAL_KNOWN_BRANDS = [
  'Monster High', 'Bratzillaz', 'Bratz', 'Rainbow High', 'Barbie', 'Ever After High',
  'Equestria Girls', 'My Little Pony', 'L.O.L. Surprise', 'LOL Surprise', 'Na! Na! Na! Surprise',
  'Enchantimals', 'Winx Club', 'Shopkins', 'Disney Princess', 'Disney', 'Polly Pocket',
  'American Girl', 'Cry Babies', 'Baby Alive', 'Novi Stars', 'Project Mc2'
];

function skuModalGuessBrand(title) {
  const lower = title.toLowerCase();
  for (const brand of SKU_MODAL_KNOWN_BRANDS) {
    if (lower.includes(brand.toLowerCase())) return brand;
  }
  return null;
}

window.SkuModal = {
  html() {
    return `
      <div id="create-sku-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="sku-modal-title" class="text-base font-semibold text-gray-900">Новая позиция каталога</h2>
            <button id="create-sku-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Выпуск *</label>
              <div class="relative">
                <input type="text" id="sku-original-input" autocomplete="off"
                  class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Полное название">
                <ul id="sku-original-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Короткое название RU</label>
              <input type="text" id="sku-short-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Бренд</label>
              <div class="relative">
                <input type="text" id="sku-brand-input" autocomplete="off"
                  class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Необязательно">
                <ul id="sku-brand-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Персонаж(и)</label>
              <div id="sku-character-chips" class="flex flex-wrap gap-1.5 mt-1 empty:hidden"></div>
              <div class="relative mt-1.5">
                <input type="text" id="sku-character-input" autocomplete="off"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Добавить персонажа, Enter — подтвердить">
                <ul id="sku-character-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Серия</label>
              <div class="relative">
                <input type="text" id="sku-series-input" autocomplete="off"
                  class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Необязательно">
                <ul id="sku-series-dropdown" class="dropdown-menu custom-scrollbar"></ul>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылки</label>
              <div id="sku-links-list" class="space-y-1.5 mt-1"></div>
              <div class="flex gap-2 mt-2">
                <input type="text" id="sku-link-add-input"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Добавить ссылку">
                <button type="button" id="sku-link-add-btn"
                  class="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm shrink-0">Добавить</button>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Фото</label>
              <input type="text" id="sku-image-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Ссылка на изображение">
              <img id="sku-image-preview" src="" alt=""
                class="hidden mt-2 w-20 h-20 rounded-lg object-cover border border-gray-100">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="sku-description-input" rows="3"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div id="sku-error-text" class="text-xs text-red-500 hidden"></div>
            <div id="sku-merge-conflict" class="hidden"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="sku-delete-btn" class="hidden px-3 py-2.5 rounded-xl border border-red-200 text-red-600">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
            <button id="create-sku-cancel"
              class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="create-sku-save"
              class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Подключает обработчики к уже вставленной в DOM разметке (см. html()).
   * @param {{ onSaved: (result:Object|null, action:'create'|'update'|'merge'|'delete', context?:Object|null) => void }} options
   *   onSaved вызывается после успешного create/update/delete/merge. result —
   *   ответ сервера (есть value/label для create/update/merge — нужно
   *   order-new.js/order-edit.js, чтобы подставить в поле "Выпуск" после
   *   создания/правки прямо из формы заказа), null для delete. context —
   *   объект, переданный четвёртым параметром в open() (Фаза 3 интеграции
   *   Вишлист/Каталог/Заказы, 03.08.2026) — прокидывается насквозь без
   *   изменений, null, если open() вызван без него. catalog.js/уже
   *   существующие вызовы order-new.js/order-edit.js его не передают и не
   *   читают — обратная совместимость не нарушена.
   * @returns {{ open: (mode:'create'|'edit', original?:string, prefill?:Object|null, context?:Object|null) => void }}
   */
  init({ onSaved }) {
    let skuModalMode = 'create';
    let skuModalOldOriginal = null;
    let skuModalContext = null;

    // Обёртка над onSaved (Фаза 4 интеграции Вишлист/Каталог/Заказы, 04.08.2026) —
    // если модалка была открыта из "Спрос клиентов" (context.wishlistId), после
    // успешного create/update/merge позиция вишлиста молча привязывается к
    // сохранённому SKU. delete исключён явно — там result === null, привязывать
    // нечего. Сбой привязки не блокирует уже сохранённый SKU — только логируется.
    // context.wishlistIds (Фаза 6.1, 04.08.2026, массив) — тот же принцип, но
    // для кластера из "Не найдено": один клик привязывает СРАЗУ все позиции
    // кластера к одной созданной SKU. wishlistId (единственное число) и
    // wishlistIds (массив) не смешиваются в одном вызове — если передан
    // массив, используется он, singular-путь Фазы 4 не трогаем.
    async function handleSaved(result, action, context) {
      if (context && action !== 'delete') {
        const idsToLink = Array.isArray(context.wishlistIds) ? context.wishlistIds
          : (context.wishlistId ? [context.wishlistId] : []);
        for (const wishlistId of idsToLink) {
          try {
            await callServer('linkWishlistItemToSku', wishlistId, result.value);
          } catch (error) {
            console.error('Не удалось привязать позицию вишлиста к каталогу:', error);
          }
        }
      }
      onSaved(result, action, context);
    }

    function closeSkuModal() {
      document.getElementById('create-sku-modal').classList.add('hidden');
      document.getElementById('create-sku-modal').classList.remove('flex');
    }

    // Автоподсказки Бренд/Персонаж/Серия из уже использованных значений
    // (слой 1 плана дедупликации каталога, 03.08.2026) — снижает разнобой
    // написания одного и того же тега. Загружается один раз при монтировании
    // экрана, не на каждое открытие модалки.
    //
    // ИСПРАВЛЕНО 05.09.2026 (репорт менеджера: "нажимает на Персонаж,
    // выбирает из списка — ничего не вставляется") — раньше это был родной
    // HTML5 `<input list=...>`+`<datalist>`. Нативный datalist ненадёжен
    // именно в мобильных WebView (Android/iOS Telegram-клиент рендерит
    // подсказки, но выбор по тапу не всегда реально проставляет `.value` —
    // известная проблема платформы, не код этого проекта). Поле "Выпуск"
    // рядом в этой же форме НИКОГДА не страдало этим, потому что у него уже
    // был свой полностью самописный JS-дропдаун (`sku-original-dropdown`) —
    // теперь Бренд/Персонаж/Серия переведены на тот же проверенный паттерн
    // (`FormHelpers.renderDropdown` не переиспользован напрямую, т.к. он
    // рассчитан на асинхронный поиск с debounce; здесь достаточно синхронной
    // фильтрации по уже загруженному массиву).
    let knownBrands = [];
    let knownCharacters = [];
    let knownSeries = [];
    (async function loadTagValues() {
      try {
        const tags = await callServer('getCatalogTagValues');
        knownBrands = tags.brands || [];
        knownCharacters = tags.characters || [];
        knownSeries = tags.series || [];
      } catch (error) {
        // Подсказки — удобство, не критичная функциональность; тихо не показываем при сбое.
      }
    })();

    /**
     * Общий самописный дропдаун-автокомплит поверх уже загруженного массива
     * значений (Бренд/Серия — одиночный выбор, клик просто подставляет
     * значение в input). У Персонажа — свой отдельный вариант ниже
     * (множественный выбор чипами, с исключением уже добавленных).
     */
    function wireSingleTagAutocomplete(inputId, dropdownId, getValues) {
      const input = document.getElementById(inputId);
      const dropdown = document.getElementById(dropdownId);

      function renderSuggestions() {
        const query = input.value.trim().toLowerCase();
        if (query === '') { dropdown.classList.remove('active'); return; }
        const matches = getValues().filter(v => v.toLowerCase().includes(query)).slice(0, 8);
        if (matches.length === 0) { dropdown.classList.remove('active'); return; }

        dropdown.innerHTML = matches.map(v => `<li class="p-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0 text-sm text-gray-700">${escapeHtmlClient(v)}</li>`).join('');
        Array.from(dropdown.children).forEach((li, idx) => {
          // mousedown, не click — срабатывает РАНЬШЕ blur инпута ниже, иначе
          // дропдаун успевает скрыться до того, как долетит клик по пункту
          // (тот же приём, что уже используется для "Выпуск" в этом файле).
          li.addEventListener('mousedown', () => {
            input.value = matches[idx];
            dropdown.classList.remove('active');
          });
        });
        dropdown.classList.add('active');
      }

      input.addEventListener('input', renderSuggestions);
      input.addEventListener('focus', renderSuggestions);
      input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('active'), 150));
    }

    wireSingleTagAutocomplete('sku-brand-input', 'sku-brand-dropdown', () => knownBrands);
    wireSingleTagAutocomplete('sku-series-input', 'sku-series-dropdown', () => knownSeries);

    // Персонаж(и) — множественный выбор (репорт VASY 05.09.2026: серии с
    // 2+ персонажами раньше физически некуда было вписать второго). Хранится
    // в UI как массив чипов, на сервер уходит одной строкой через запятую —
    // без миграции: колонка `catalog_skus.character` остаётся тем же text-
    // полем, что и раньше, старые одиночные значения читаются как один чип.
    let characterChips = [];

    function renderCharacterChips() {
      const container = document.getElementById('sku-character-chips');
      container.innerHTML = characterChips.map((name, idx) => `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
          ${escapeHtmlClient(name)}
          <button type="button" class="character-chip-remove text-indigo-400 hover:text-indigo-700" data-idx="${idx}">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </span>
      `).join('');
      container.querySelectorAll('.character-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          characterChips.splice(parseInt(btn.dataset.idx, 10), 1);
          renderCharacterChips();
        });
      });
      if (window.lucide) window.lucide.createIcons();
    }

    function addCharacterChip(rawName) {
      const name = rawName.trim();
      if (name === '') return;
      if (characterChips.some(c => c.toLowerCase() === name.toLowerCase())) return; // уже добавлен, тихий no-op
      characterChips.push(name);
      renderCharacterChips();
    }

    const characterInput = document.getElementById('sku-character-input');
    const characterDropdown = document.getElementById('sku-character-dropdown');

    function renderCharacterSuggestions() {
      const query = characterInput.value.trim().toLowerCase();
      if (query === '') { characterDropdown.classList.remove('active'); return; }
      const matches = knownCharacters
        .filter(v => v.toLowerCase().includes(query))
        .filter(v => !characterChips.some(c => c.toLowerCase() === v.toLowerCase()))
        .slice(0, 8);
      if (matches.length === 0) { characterDropdown.classList.remove('active'); return; }

      characterDropdown.innerHTML = matches.map(v => `<li class="p-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0 text-sm text-gray-700">${escapeHtmlClient(v)}</li>`).join('');
      Array.from(characterDropdown.children).forEach((li, idx) => {
        li.addEventListener('mousedown', () => {
          addCharacterChip(matches[idx]);
          characterInput.value = '';
          characterDropdown.classList.remove('active');
        });
      });
      characterDropdown.classList.add('active');
    }

    characterInput.addEventListener('input', renderCharacterSuggestions);
    characterInput.addEventListener('focus', renderCharacterSuggestions);
    characterInput.addEventListener('blur', () => setTimeout(() => characterDropdown.classList.remove('active'), 150));
    characterInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // не отправлять форму/модалку по Enter
      addCharacterChip(characterInput.value);
      characterInput.value = '';
      characterDropdown.classList.remove('active');
    });

    // Слой 5 (опционально) — авто-подстановка Бренда по словарю известных
    // франшиз, только если поле Бренд ещё пусто (никогда не перезаписывает
    // то, что менеджер уже ввёл сам). Срабатывает по уходу с поля "Выпуск" —
    // не на каждый символ, чтобы не дёргать поле во время набора текста.
    document.getElementById('sku-original-input').addEventListener('blur', () => {
      const brandInput = document.getElementById('sku-brand-input');
      if (brandInput.value.trim() !== '') return;

      const title = document.getElementById('sku-original-input').value.trim();
      if (title === '') return;

      const guessed = skuModalGuessBrand(title);
      if (guessed) brandInput.value = guessed;
    });

    // Живой поиск по каталогу прямо в поле "Выпуск" (по фидбеку VASY
    // 03.08.2026 — окончательная проверка на дубли раньше срабатывала только
    // по нажатию "Сохранить", менеджер не видел совпадений по ходу набора
    // текста). Клик по найденной позиции переключает модалку в редактирование
    // именно её — тот же принцип, что "Объединить" в инструменте поиска дублей.
    const originalInput = document.getElementById('sku-original-input');
    const originalDropdown = document.getElementById('sku-original-dropdown');

    const handleOriginalSearch = debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) { originalDropdown.classList.remove('active'); return; }

      const results = (await callServer('searchSku', query))
        .filter(item => item.value.toLowerCase() !== (skuModalOldOriginal || '').toLowerCase());

      originalDropdown.innerHTML = '';
      if (results.length === 0) {
        originalDropdown.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
      } else {
        results.forEach(item => {
          const li = document.createElement('li');
          li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0';
          li.innerHTML = `
            <div class="font-medium text-gray-800 text-sm">${escapeHtmlClient(item.label)}</div>
            ${item.label !== item.value ? `<div class="text-[11px] text-gray-400">${escapeHtmlClient(item.value)}</div>` : ''}
          `;
          // mousedown, не click — срабатывает РАНЬШЕ blur инпута ниже, иначе
          // дропдаун успевает скрыться до того, как долетит клик по пункту.
          li.addEventListener('mousedown', () => {
            originalDropdown.classList.remove('active');
            open('edit', item.value);
          });
          originalDropdown.appendChild(li);
        });
      }
      originalDropdown.classList.add('active');
    }, 300);

    originalInput.addEventListener('input', handleOriginalSearch);
    originalInput.addEventListener('blur', () => {
      setTimeout(() => originalDropdown.classList.remove('active'), 150);
    });

    // Живое превью фото по URL — тот же приём "onerror скрывает", что уже
    // используется для карточек в client/screens/wishlist.js, только здесь
    // это слушатель, а не инлайн-атрибут (разметка модалки статична, не
    // перерисовывается через innerHTML).
    function updateImagePreview() {
      const url = document.getElementById('sku-image-input').value.trim();
      const preview = document.getElementById('sku-image-preview');
      if (url === '') {
        preview.classList.add('hidden');
        preview.src = '';
        return;
      }
      preview.src = url;
      preview.classList.remove('hidden');
    }
    document.getElementById('sku-image-input').addEventListener('input', updateImagePreview);
    document.getElementById('sku-image-preview').addEventListener('error', () => {
      document.getElementById('sku-image-preview').classList.add('hidden');
    });

    // Раздел "Ссылки" (Фаза 2 интеграции Вишлист/Каталог/Заказы, 03.08.2026) —
    // заменяет прежнее единственное поле "Ссылка". В режиме edit позиция уже
    // существует — добавление/удаление ссылки уходит на сервер СРАЗУ по клику,
    // но список ПОСЛЕ этого обновляется ЛОКАЛЬНО (currentLinks), без второго
    // round-trip'а — по фидбеку VASY 03.08.2026 ("добавляется очень долго"):
    // раньше добавление делало ДВА последовательных запроса подряд (записать +
    // перезагрузить весь список), что и ощущалось медленно. В режиме create
    // позиции ещё нет — ссылки копятся в pendingLinks локально и отправляются
    // по очереди ПОСЛЕ успешного createSku (см. flushPendingLinks).
    let pendingLinks = [];
    let currentLinks = [];

    function renderLinksList(links, pending) {
      const container = document.getElementById('sku-links-list');
      if (links.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-400">Ссылок пока нет</div>';
        return;
      }
      container.innerHTML = links.map((link, idx) => `
        <div class="flex items-center justify-between gap-2 p-2 border border-gray-100 rounded-lg text-xs">
          <a href="${escapeHtmlClient(link.url)}" target="_blank" rel="noopener" class="text-indigo-600 truncate flex-1">${escapeHtmlClient(link.url)}</a>
          <span class="shrink-0 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">${escapeHtmlClient(link.source)}</span>
          <button type="button" class="link-delete-btn shrink-0 p-1 text-gray-400 hover:text-red-500" title="Удалить ссылку" data-idx="${idx}">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `).join('');
      if (window.lucide) window.lucide.createIcons();

      container.querySelectorAll('.link-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.idx, 10);
          if (pending) {
            pendingLinks.splice(idx, 1);
            renderLinksList(pendingLinks, true);
          } else {
            const linkId = links[idx].linkId;
            try {
              await callServer('deleteCatalogLink', linkId);
              currentLinks = currentLinks.filter(l => l.linkId !== linkId);
              renderLinksList(currentLinks, false);
            } catch (error) {
              const errorText = document.getElementById('sku-error-text');
              errorText.textContent = error.message;
              errorText.classList.remove('hidden');
            }
          }
        });
      });
    }

    async function loadLinksForEdit() {
      currentLinks = await callServer('getCatalogLinksForSku', skuModalOldOriginal);
      renderLinksList(currentLinks, false);
    }

    async function flushPendingLinks(skuOriginal) {
      for (const link of pendingLinks) {
        try {
          await callServer('addCatalogLink', skuOriginal, link.url, link.source);
        } catch (error) {
          // Позиция уже создана — ссылка не должна блокировать успешный
          // результат, только логируем для диагностики.
          console.error('Не удалось привязать ссылку после создания SKU:', error);
        }
      }
      pendingLinks = [];
    }

    // Автозаполнение Фото/Описание, если они ещё пустые — никогда не
    // перезаписывает то, что уже видно на экране (тот же принцип, что
    // авто-подстановка Бренда). Используется в обоих режимах.
    function applyResolvedFields(imageUrl, description) {
      const imageInput = document.getElementById('sku-image-input');
      const descriptionInput = document.getElementById('sku-description-input');
      if (imageInput.value.trim() === '' && imageUrl) {
        imageInput.value = imageUrl;
        updateImagePreview();
      }
      if (descriptionInput.value.trim() === '' && description) {
        descriptionInput.value = description;
      }
    }

    document.getElementById('sku-link-add-btn').addEventListener('click', async () => {
      const input = document.getElementById('sku-link-add-input');
      const addBtn = document.getElementById('sku-link-add-btn');
      const url = input.value.trim();
      if (url === '') return;

      if (skuModalMode === 'edit') {
        const errorText = document.getElementById('sku-error-text');
        addBtn.disabled = true;
        try {
          // Один запрос вместо двух — addCatalogLinkWithResolve одновременно
          // привязывает ссылку И (лучшим усилием) подтягивает Фото/Описание,
          // если они ещё пустые (backend решает это сам, без второго round-trip'а).
          const result = await callServer('addCatalogLinkWithResolve', skuModalOldOriginal, url, 'Каталог');
          input.value = '';
          errorText.classList.add('hidden');
          // wasExisting=true — сервер нашёл уже привязанную ссылку и НЕ создал
          // новую запись (де-дуп по normalizeProductUrl); currentLinks её уже
          // содержит — повторное добавление в список создавало ВИЗУАЛЬНЫЙ дубль
          // (на сервере дубля не было, но менеджер видел два одинаковых пункта
          // в списке до перезагрузки формы). Найдено 03.08.2026, репорт VASY.
          if (result.link.wasExisting) {
            showSaveToast(true, 'Такая ссылка уже привязана к этой позиции');
          } else {
            currentLinks = [result.link, ...currentLinks];
            renderLinksList(currentLinks, false);
          }
          applyResolvedFields(result.imageUrl, result.description);
        } catch (error) {
          errorText.textContent = error.message;
          errorText.classList.remove('hidden');
        } finally {
          addBtn.disabled = false;
        }
      } else {
        // Позиции ещё нет — сверяться с сервером не с чем, но хотя бы точное
        // повторное нажатие на ту же ссылку не должно давать визуальный дубль
        // в локальном списке (та же категория бага, что и в режиме edit).
        const alreadyPending = pendingLinks.some(l => l.url === url);
        input.value = '';
        if (alreadyPending) {
          showSaveToast(true, 'Такая ссылка уже добавлена');
          return;
        }
        pendingLinks.push({ url, source: 'Каталог' });
        renderLinksList(pendingLinks, true);

        // Позиции ещё нет — сохранять на сервер нечего, только подтягиваем
        // Фото/Описание в форму. Не блокирует добавление ссылки в список —
        // оно уже произошло выше. Запускается ТОЛЬКО если пусты ОБА поля (по
        // фидбеку VASY 03.08.2026) — если данные уже есть хотя бы с одной
        // ссылки, повторный парсинг для следующей — трата лимита без пользы.
        if (document.getElementById('sku-image-input').value.trim() === ''
          && document.getElementById('sku-description-input').value.trim() === '') {
          callServer('resolveProductLinkForAdmin', url)
            .then(result => applyResolvedFields(result.imageUrl, result.description))
            .catch(() => {
              // Распознавание — удобство, не критичная функциональность; тихо не показываем при сбое.
            });
        }
      }
    });

    async function open(mode, original, prefill, context) {
      skuModalMode = mode;
      skuModalOldOriginal = original || null;
      skuModalContext = context || null;

      document.getElementById('sku-error-text').classList.add('hidden');
      document.getElementById('sku-merge-conflict').classList.add('hidden');
      document.getElementById('create-sku-save').classList.remove('hidden');

      const titleEl = document.getElementById('sku-modal-title');
      const deleteBtn = document.getElementById('sku-delete-btn');
      const saveBtn = document.getElementById('create-sku-save');

      if (mode === 'edit') {
        titleEl.textContent = 'Редактирование позиции';
        saveBtn.textContent = 'Сохранить изменения';
        deleteBtn.classList.remove('hidden');

        document.getElementById('create-sku-modal').classList.remove('hidden');
        document.getElementById('create-sku-modal').classList.add('flex');

        try {
          const details = await callServer('getSkuDetails', original);
          document.getElementById('sku-original-input').value = details.original;
          document.getElementById('sku-short-input').value = details.shortName;
          document.getElementById('sku-brand-input').value = details.brand;
          // "Персонаж" хранится на сервере одной строкой через запятую
          // (несколько персонажей, 05.09.2026) — старые позиции с ровно
          // одним значением превращаются в один чип, без миграции данных.
          characterChips = details.character ? details.character.split(',').map(s => s.trim()).filter(Boolean) : [];
          document.getElementById('sku-character-input').value = '';
          renderCharacterChips();
          document.getElementById('sku-series-input').value = details.series;
          document.getElementById('sku-image-input').value = details.imageUrl || '';
          document.getElementById('sku-description-input').value = details.description || '';
          updateImagePreview();
          document.getElementById('sku-link-add-input').value = '';
          await loadLinksForEdit();
        } catch (error) {
          const errorText = document.getElementById('sku-error-text');
          errorText.textContent = error.message;
          errorText.classList.remove('hidden');
        }
      } else {
        titleEl.textContent = 'Новая позиция каталога';
        saveBtn.textContent = 'Сохранить';
        deleteBtn.classList.add('hidden');
        ['sku-original-input', 'sku-short-input', 'sku-brand-input', 'sku-character-input', 'sku-series-input',
          'sku-image-input', 'sku-description-input', 'sku-link-add-input']
          .forEach(id => { document.getElementById(id).value = ''; });
        characterChips = [];
        renderCharacterChips();

        // Prefill (Фаза 3 интеграции Вишлист/Каталог/Заказы, 03.08.2026) —
        // форма заказа передаёт сюда то, что менеджер уже напечатал в поле
        // "Выпуск", либо то, что удалось распознать по вставленной ссылке
        // (resolveOrderProductLink, status:'unmatched') — вместо всегда
        // пустой формы. Никогда не применяется в режиме edit.
        if (prefill) {
          if (prefill.original) document.getElementById('sku-original-input').value = prefill.original;
          if (prefill.description) document.getElementById('sku-description-input').value = prefill.description;
          if (prefill.imageUrl) document.getElementById('sku-image-input').value = prefill.imageUrl;
        }

        updateImagePreview();
        pendingLinks = [];
        // Ссылка, по которой распознали позицию (Фаза 3, resolveOrderProductLink
        // status:'unmatched') — раньше нигде не отображалась в самой модалке,
        // хотя реально уйдёт на сервер при сохранении заказа. Добавляем её в
        // pendingLinks, чтобы она была видна в разделе "Ссылки" уже на этапе
        // создания позиции.
        if (context && context.pendingLink) {
          // pendingLinkSource — Фаза 4 интеграции Вишлист/Каталог/Заказы
          // (04.08.2026): источник ссылки должен отражать, откуда она реально
          // пришла (вишлист → "Вишлист"), не всегда "Заказ". order-new.js/
          // order-edit.js не передают этот параметр — фоллбэк на "Заказ"
          // сохраняет их поведение неизменным.
          pendingLinks.push({ url: context.pendingLink, source: context.pendingLinkSource || 'Заказ' });
        }
        renderLinksList(pendingLinks, true);

        document.getElementById('create-sku-modal').classList.remove('hidden');
        document.getElementById('create-sku-modal').classList.add('flex');
      }

      if (window.lucide) window.lucide.createIcons();
    }

    function showMergeConflict(existing, incoming) {
      document.getElementById('create-sku-save').classList.add('hidden');
      const box = document.getElementById('sku-merge-conflict');
      box.classList.remove('hidden');
      box.innerHTML = `
        <p class="text-xs text-amber-700 mb-2 px-1">Позиция «${escapeHtmlClient(incoming.original)}» уже есть в каталоге. Выберите, какую версию оставить — вторая будет удалена, её заказы переключатся на выбранную.</p>
        <div class="space-y-2">
          <button type="button" class="merge-choice-btn w-full text-left p-2.5 border border-gray-200 rounded-xl text-xs hover:border-indigo-400" data-choice="keepExisting">
            <b>Оставить старую:</b> ${escapeHtmlClient(existing.shortName || existing.original)}
          </button>
          <button type="button" class="merge-choice-btn w-full text-left p-2.5 border border-gray-200 rounded-xl text-xs hover:border-indigo-400" data-choice="keepNew">
            <b>Оставить новую версию:</b> ${escapeHtmlClient(incoming.shortName || incoming.original)}
          </button>
        </div>
      `;
      box.querySelectorAll('.merge-choice-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const skuData = {
            original: document.getElementById('sku-original-input').value.trim(),
            shortName: document.getElementById('sku-short-input').value.trim(),
            brand: document.getElementById('sku-brand-input').value.trim(),
            character: characterChips.join(', '),
            series: document.getElementById('sku-series-input').value.trim(),
            imageUrl: document.getElementById('sku-image-input').value.trim(),
            description: document.getElementById('sku-description-input').value.trim()
          };
          try {
            const result = await callServer('updateSku', skuModalOldOriginal, skuData, btn.dataset.choice);
            closeSkuModal();
            handleSaved(result, 'merge', skuModalContext);
          } catch (error) {
            const errorText = document.getElementById('sku-error-text');
            errorText.textContent = error.message;
            errorText.classList.remove('hidden');
          }
        });
      });
    }

    // Слой 2 плана дедупликации каталога (03.08.2026) — сервер нашёл ПОХОЖУЮ,
    // но не идентичную позицию (опечатка/пунктуация). Не блокирует — три пути:
    // использовать одну из найденных похожих, объединить с ней (переиграть
    // сохранение с её точным именем — превращается в обычный конфликт выше),
    // либо всё равно сохранить как отдельную (forceCreate/forceUpdate).
    function showPossibleDuplicateWarning(candidates, skuData) {
      document.getElementById('create-sku-save').classList.add('hidden');
      const box = document.getElementById('sku-merge-conflict');
      box.classList.remove('hidden');

      const candidatesHtml = candidates.map((c, idx) => `
        <button type="button" class="duplicate-choice-btn w-full text-left p-2.5 border border-gray-200 rounded-xl text-xs hover:border-indigo-400" data-idx="${idx}">
          <b>${escapeHtmlClient(c.shortName || c.original)}</b><br>
          <span class="text-gray-400">${escapeHtmlClient(c.original)}</span>
        </button>
      `).join('');

      box.innerHTML = `
        <p class="text-xs text-amber-700 mb-2 px-1">Похоже, такая позиция уже есть в каталоге. Использовать существующую или сохранить как отдельную?</p>
        <div class="space-y-2">${candidatesHtml}</div>
        <button type="button" id="duplicate-force-btn" class="w-full text-center p-2.5 mt-2 border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-indigo-400">
          Всё равно сохранить как отдельную позицию
        </button>
      `;

      box.querySelectorAll('.duplicate-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const candidate = candidates[parseInt(btn.dataset.idx, 10)];
          if (skuModalMode === 'create') {
            // Менеджер выбрал уже существующую похожую позицию вместо создания
            // новой — сама позиция не создаётся, поэтому накопленные pendingLinks
            // здесь намеренно не переносятся (та же логика уже применяется к
            // остальным полям формы — Бренд/Персонаж и т.п. тоже не переносятся).
            closeSkuModal();
            handleSaved({ value: candidate.original, label: candidate.shortName || candidate.original }, 'create', skuModalContext);
          } else {
            // Подставляем точное имя кандидата и переигрываем сохранение —
            // дальше это уже обычный точный конфликт с готовым merge-флоу выше.
            document.getElementById('sku-original-input').value = candidate.original;
            box.classList.add('hidden');
            document.getElementById('create-sku-save').classList.remove('hidden');
            document.getElementById('create-sku-save').click();
          }
        });
      });

      document.getElementById('duplicate-force-btn').addEventListener('click', async () => {
        const errorText = document.getElementById('sku-error-text');
        try {
          if (skuModalMode === 'create') {
            const result = await callServer('createSku', skuData, true);
            await flushPendingLinks(result.value);
            closeSkuModal();
            handleSaved(result, 'create', skuModalContext);
          } else {
            const result = await callServer('updateSku', skuModalOldOriginal, skuData, null, true);
            if (result.status === 'conflict') {
              showMergeConflict(result.existing, result.incoming);
            } else {
              closeSkuModal();
              handleSaved(result, 'update', skuModalContext);
            }
          }
        } catch (error) {
          box.classList.add('hidden');
          document.getElementById('create-sku-save').classList.remove('hidden');
          errorText.textContent = error.message;
          errorText.classList.remove('hidden');
        }
      });
    }

    document.getElementById('create-sku-close').addEventListener('click', closeSkuModal);
    document.getElementById('create-sku-cancel').addEventListener('click', closeSkuModal);

    document.getElementById('sku-delete-btn').addEventListener('click', async () => {
      if (skuModalMode !== 'edit' || !skuModalOldOriginal) return;
      if (!(await showConfirmModal(`Удалить позицию «${skuModalOldOriginal}» из каталога?`, { confirmLabel: 'Удалить', danger: true }))) return;

      const errorText = document.getElementById('sku-error-text');
      try {
        await callServer('deleteSku', skuModalOldOriginal);
        closeSkuModal();
        handleSaved(null, 'delete', skuModalContext);
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      }
    });

    document.getElementById('create-sku-save').addEventListener('click', async () => {
      const original = document.getElementById('sku-original-input').value.trim();
      const errorText = document.getElementById('sku-error-text');
      errorText.classList.add('hidden');

      if (original === '') {
        errorText.textContent = 'Поле «Выпуск» обязательно для заполнения.';
        errorText.classList.remove('hidden');
        return;
      }

      // Захватываем текст, который менеджер напечатал в поле "Персонаж", но
      // не подтвердил Enter/кликом по подсказке — иначе набранное, но не
      // добавленное явным действием, тихо терялось бы при сохранении.
      addCharacterChip(characterInput.value);
      characterInput.value = '';

      const skuData = {
        original: original,
        shortName: document.getElementById('sku-short-input').value.trim(),
        brand: document.getElementById('sku-brand-input').value.trim(),
        character: characterChips.join(', '),
        series: document.getElementById('sku-series-input').value.trim(),
        // Только для проверки на дубль на входе (createSku/updateSku не пишут
        // link в саму строку SKU, Фаза 2, 03.08.2026) — первая из накопленных
        // pendingLinks как представительный сигнал; в режиме edit pendingLinks
        // всегда пуст (там ссылки уходят сразу через addCatalogLink по клику).
        link: pendingLinks.length > 0 ? pendingLinks[0].url : '',
        imageUrl: document.getElementById('sku-image-input').value.trim(),
        description: document.getElementById('sku-description-input').value.trim()
      };

      try {
        if (skuModalMode === 'create') {
          const result = await callServer('createSku', skuData);
          if (result.status === 'possible_duplicate') {
            showPossibleDuplicateWarning(result.candidates, skuData);
          } else {
            await flushPendingLinks(result.value);
            closeSkuModal();
            handleSaved(result, 'create', skuModalContext);
          }
        } else {
          const result = await callServer('updateSku', skuModalOldOriginal, skuData, null);
          if (result.status === 'conflict') {
            showMergeConflict(result.existing, result.incoming);
          } else if (result.status === 'possible_duplicate') {
            showPossibleDuplicateWarning(result.candidates, skuData);
          } else {
            closeSkuModal();
            handleSaved(result, 'update', skuModalContext);
          }
        }
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      }
    });

    return { open };
  }
};
