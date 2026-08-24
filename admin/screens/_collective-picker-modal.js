'use strict';

/**
 * Модалка "выбрать коллективку" (Э3 рефакторинга коллективок, 24.08.2026,
 * REFACTOR-COLLECTIVES.md §3) — общий модуль по образцу `_delete-order-
 * modal.js`, подключается и в `orders.js` ("В коллективку"/перенос
 * массового выбора), и в `collective-detail.js` ("Перенести в другую").
 * Список коллективок (`getCollectivesList`) запрашивается заново при
 * КАЖДОМ открытии — `orderCount` нужен свежим для текста подтверждения
 * "пересчитается на оставшиеся N" на вызывающей стороне.
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${CollectivePickerModal.html()}`;
 *   const picker = CollectivePickerModal.init({
 *     onPicked: (collective) => { ...собрать текст подтверждения, дальше assign... }
 *   });
 *   picker.open({ excludeCollectiveId: currentCollectiveId }); // excludeCollectiveId необязателен
 */
window.CollectivePickerModal = {
  html() {
    return `
      <div id="collective-picker-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[70] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-base font-semibold text-gray-900">Выбрать коллективку</h2>
            <button type="button" id="collective-picker-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 pb-2 shrink-0">
            <input type="text" id="collective-picker-search" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Поиск по названию/ID..." autocomplete="off">
          </div>
          <div id="collective-picker-list" class="overflow-y-auto px-4 pb-4 flex-1 space-y-1.5"></div>
          <div id="collective-picker-empty" class="hidden text-center text-sm text-gray-400 py-6">Коллективки не найдены</div>
          <div id="collective-picker-loading" class="text-center text-sm text-gray-400 py-6">Загрузка...</div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onPicked: (collective:{collectiveId:string,name:string,trackNumber:string,status:string,orderCount:number}) => void }} options
   * @returns {{ open: (opts?:{excludeCollectiveId?:string}) => void }}
   */
  init({ onPicked }) {
    let all = [];
    let excludeId = null;

    const modal = document.getElementById('collective-picker-modal');
    const searchInput = document.getElementById('collective-picker-search');
    const listEl = document.getElementById('collective-picker-list');
    const emptyEl = document.getElementById('collective-picker-empty');
    const loadingEl = document.getElementById('collective-picker-loading');

    function close() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function render() {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = all.filter((c) => {
        if (excludeId && c.collectiveId === excludeId) return false;
        if (query === '') return true;
        return `${c.collectiveId} ${c.name}`.toLowerCase().includes(query);
      });

      listEl.innerHTML = '';
      emptyEl.classList.toggle('hidden', filtered.length > 0);

      filtered.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'p-3 border border-gray-200 rounded-xl cursor-pointer active:bg-gray-50 flex items-center justify-between gap-2';
        row.innerHTML = `
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(c.name || ('ID ' + c.collectiveId))}</div>
            <div class="text-[11px] text-gray-400">ID ${escapeHtmlClient(c.collectiveId)} · ${escapeHtmlClient(c.status)} · заказов: ${c.orderCount}</div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
        `;
        row.addEventListener('click', () => {
          close();
          onPicked(c);
        });
        listEl.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.addEventListener('input', debounce(render, 150));

    async function open(opts) {
      excludeId = (opts && opts.excludeCollectiveId) || null;
      searchInput.value = '';
      listEl.innerHTML = '';
      emptyEl.classList.add('hidden');
      loadingEl.classList.remove('hidden');
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      try {
        all = await callServer('getCollectivesList');
        loadingEl.classList.add('hidden');
        render();
      } catch (error) {
        loadingEl.textContent = 'Не удалось загрузить список: ' + error.message;
      }
    }

    document.getElementById('collective-picker-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    return { open };
  }
};
