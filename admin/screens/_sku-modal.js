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
            <button id="create-sku-close" class="p-1 text-gray-400 hover:text-gray-600">
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
              <input type="text" id="sku-brand-input" list="sku-brand-datalist"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно" autocomplete="off">
              <datalist id="sku-brand-datalist"></datalist>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Персонаж</label>
              <input type="text" id="sku-character-input" list="sku-character-datalist"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно" autocomplete="off">
              <datalist id="sku-character-datalist"></datalist>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Серия</label>
              <input type="text" id="sku-series-input" list="sku-series-datalist"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно" autocomplete="off">
              <datalist id="sku-series-datalist"></datalist>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Ссылка</label>
              <input type="text" id="sku-link-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
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
   * @param {{ onSaved: (result:Object|null, action:'create'|'update'|'merge'|'delete') => void }} options
   *   onSaved вызывается после успешного create/update/delete/merge. result —
   *   ответ сервера (есть value/label для create/update/merge — нужно
   *   order-new.js/order-edit.js, чтобы подставить в поле "Выпуск" после
   *   создания/правки прямо из формы заказа), null для delete. catalog.js
   *   свои аргументы игнорирует, просто перезагружает список.
   * @returns {{ open: (mode:'create'|'edit', original?:string) => void }}
   */
  init({ onSaved }) {
    let skuModalMode = 'create';
    let skuModalOldOriginal = null;

    function closeSkuModal() {
      document.getElementById('create-sku-modal').classList.add('hidden');
      document.getElementById('create-sku-modal').classList.remove('flex');
    }

    // Автоподсказки Бренд/Персонаж/Серия из уже использованных значений
    // (слой 1 плана дедупликации каталога, 03.08.2026) — снижает разнобой
    // написания одного и того же тега. Не блокирует свободный ввод нового
    // значения — обычный HTML5 datalist, просто подсказка. Загружается один
    // раз при монтировании экрана, не на каждое открытие модалки.
    (async function loadTagDatalists() {
      try {
        const tags = await callServer('getCatalogTagValues');
        const fill = (listId, values) => {
          document.getElementById(listId).innerHTML =
            values.map(v => `<option value="${escapeHtmlClient(v)}">`).join('');
        };
        fill('sku-brand-datalist', tags.brands);
        fill('sku-character-datalist', tags.characters);
        fill('sku-series-datalist', tags.series);
      } catch (error) {
        // Подсказки — удобство, не критичная функциональность; тихо не показываем при сбое.
      }
    })();

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

    async function open(mode, original) {
      skuModalMode = mode;
      skuModalOldOriginal = original || null;

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
          document.getElementById('sku-character-input').value = details.character;
          document.getElementById('sku-series-input').value = details.series;
          document.getElementById('sku-link-input').value = details.link;
          document.getElementById('sku-image-input').value = details.imageUrl || '';
          document.getElementById('sku-description-input').value = details.description || '';
          updateImagePreview();
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
          'sku-link-input', 'sku-image-input', 'sku-description-input']
          .forEach(id => { document.getElementById(id).value = ''; });
        updateImagePreview();

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
            character: document.getElementById('sku-character-input').value.trim(),
            series: document.getElementById('sku-series-input').value.trim(),
            link: document.getElementById('sku-link-input').value.trim(),
            imageUrl: document.getElementById('sku-image-input').value.trim(),
            description: document.getElementById('sku-description-input').value.trim()
          };
          try {
            const result = await callServer('updateSku', skuModalOldOriginal, skuData, btn.dataset.choice);
            closeSkuModal();
            onSaved(result, 'merge');
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
            closeSkuModal();
            onSaved({ value: candidate.original, label: candidate.shortName || candidate.original }, 'create');
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
            closeSkuModal();
            onSaved(result, 'create');
          } else {
            const result = await callServer('updateSku', skuModalOldOriginal, skuData, null, true);
            if (result.status === 'conflict') {
              showMergeConflict(result.existing, result.incoming);
            } else {
              closeSkuModal();
              onSaved(result, 'update');
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
      if (!confirm(`Удалить позицию «${skuModalOldOriginal}» из каталога?`)) return;

      const errorText = document.getElementById('sku-error-text');
      try {
        await callServer('deleteSku', skuModalOldOriginal);
        closeSkuModal();
        onSaved(null, 'delete');
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

      const skuData = {
        original: original,
        shortName: document.getElementById('sku-short-input').value.trim(),
        brand: document.getElementById('sku-brand-input').value.trim(),
        character: document.getElementById('sku-character-input').value.trim(),
        series: document.getElementById('sku-series-input').value.trim(),
        link: document.getElementById('sku-link-input').value.trim(),
        imageUrl: document.getElementById('sku-image-input').value.trim(),
        description: document.getElementById('sku-description-input').value.trim()
      };

      try {
        if (skuModalMode === 'create') {
          const result = await callServer('createSku', skuData);
          if (result.status === 'possible_duplicate') {
            showPossibleDuplicateWarning(result.candidates, skuData);
          } else {
            closeSkuModal();
            onSaved(result, 'create');
          }
        } else {
          const result = await callServer('updateSku', skuModalOldOriginal, skuData, null);
          if (result.status === 'conflict') {
            showMergeConflict(result.existing, result.incoming);
          } else if (result.status === 'possible_duplicate') {
            showPossibleDuplicateWarning(result.candidates, skuData);
          } else {
            closeSkuModal();
            onSaved(result, 'update');
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
