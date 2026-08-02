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
              <input type="text" id="sku-original-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Полное название">
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
        } catch (error) {
          const errorText = document.getElementById('sku-error-text');
          errorText.textContent = error.message;
          errorText.classList.remove('hidden');
        }
      } else {
        titleEl.textContent = 'Новая позиция каталога';
        saveBtn.textContent = 'Сохранить';
        deleteBtn.classList.add('hidden');
        ['sku-original-input', 'sku-short-input', 'sku-brand-input', 'sku-character-input', 'sku-series-input', 'sku-link-input']
          .forEach(id => { document.getElementById(id).value = ''; });

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
            link: document.getElementById('sku-link-input').value.trim()
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
        link: document.getElementById('sku-link-input').value.trim()
      };

      try {
        if (skuModalMode === 'create') {
          const result = await callServer('createSku', skuData);
          closeSkuModal();
          onSaved(result, 'create');
        } else {
          const result = await callServer('updateSku', skuModalOldOriginal, skuData, null);
          if (result.status === 'conflict') {
            showMergeConflict(result.existing, result.incoming);
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
