'use strict';

/**
 * «Слияние позиций» — сравнение двух позиций каталога целиком и выбор, какую
 * оставить. Вынесено из catalog.js (24.09.2026), чтобы тем же окном
 * объединять «Возможные дубли» с экрана «Проверка каталога»
 * (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.10: одинаковый код модели —
 * предложение слияния через существующее «Объединить», не автоматически).
 *
 * Поведение не менялось (редизайн 04.08.2026, защита от двойного тапа
 * 16.08.2026): обе позиции целиком (фото/теги/описание/ссылки), updateSku
 * НАПРЯМУЮ с явным mergeChoice, кнопки блокируются на время запроса —
 * вторая позиция удаляется на сервере, её заказы переезжают.
 */
window.MergeCompare = {
  html() {
    return `
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
    `;
  },

  /**
   * @param {{onMerged: function(): void}} options вызывается после успешного слияния
   * @returns {{open: function(string, string): Promise<void>}}
   */
  init({ onMerged }) {
    const modal = document.getElementById('merge-compare-modal');
    const body = document.getElementById('merge-compare-body');

    function close() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    document.getElementById('merge-compare-close').addEventListener('click', close);

    function candidateHtml(details, links) {
      const tags = [details.brand, details.character, details.series].filter(t => t !== '');
      return `
        <div class="border border-gray-200 rounded-xl p-3 space-y-1.5 min-w-0">
          ${details.imageUrl ? `<a href="${escapeHtmlClient(details.imageUrl)}" target="_blank" rel="noopener" title="Открыть фото"><img src="${escapeHtmlClient(details.imageUrl)}" alt="" class="w-full aspect-square rounded-lg object-contain bg-gray-100" onerror="this.style.display='none'"></a>` : ''}
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
        close();
        showSaveToast(true, 'Позиции объединены');
        if (onMerged) onMerged();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
        targetBtn.disabled = false;
        sourceBtn.disabled = false;
      }
    }

    function render(targetDetails, sourceDetails, targetLinks, sourceLinks) {
      body.innerHTML = `
        <p class="text-xs text-gray-500 mb-3">Выберите, какую позицию оставить — вторая будет удалена, её заказы переключатся на выбранную.</p>
        <div class="grid grid-cols-2 gap-3 mb-3">
          ${candidateHtml(targetDetails, targetLinks)}
          ${candidateHtml(sourceDetails, sourceLinks)}
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

    async function open(targetOriginal, sourceOriginal) {
      body.innerHTML = '<div class="text-center text-sm text-gray-400 py-6">Загрузка данных...</div>';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      try {
        const [targetDetails, sourceDetails, targetLinks, sourceLinks] = await Promise.all([
          callServer('getSkuDetails', targetOriginal),
          callServer('getSkuDetails', sourceOriginal),
          callServer('getCatalogLinksForSku', targetOriginal),
          callServer('getCatalogLinksForSku', sourceOriginal)
        ]);
        render(targetDetails, sourceDetails, targetLinks, sourceLinks);
      } catch (error) {
        body.innerHTML = `<div class="text-center text-sm text-red-500 py-6">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    return { open };
  }
};
