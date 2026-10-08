'use strict';

/**
 * Четыре раздела каталога (волна 5 аудита менеджера, 03.10.2026) — вместо
 * списка + 7 иконок-инструментов: «Каталог» | «Спрос» | «Порядок» |
 * «Справочники». VASY: «максимально понятно и без дублирования функционала».
 * Полоса вкладок рисуется вверху каждого из 4 экранов; переход — через
 * location.replace, чтобы переключение вкладок не копило историю «Назад».
 * Счётчики: «Спрос» — недобавленные из вишлиста, «Порядок» — строки
 * проверки каталога, ждущие решения.
 *
 * Использование: в шаблон `${CatalogTabs.html('catalog')}`, после вставки —
 * `CatalogTabs.wire()`.
 */
window.CatalogTabs = {
  TABS: [
    { key: 'catalog', label: 'Каталог', icon: 'book-open', path: 'catalog' },
    // В3 плана SaaS: `module` — вкладка есть только при модуле канала; `badgeModule` — счётчик тоже.
    { key: 'demand', label: 'Спрос', icon: 'heart', path: 'wishlist-demand', badge: 'getWishlistMatchQueueCount', module: 'wishlist' },
    { key: 'tools', label: 'Порядок', icon: 'scan-search', path: 'catalog/tools', badge: 'getCatalogCheckCount', badgeModule: 'dolls_reference' },
    { key: 'refs', label: 'Справочники', icon: 'git-branch', path: 'catalog/refs' }
  ],

  visibleTabs() {
    return this.TABS.filter((t) => !t.module || hasModule(t.module));
  },

  html(active) {
    const tabs = this.visibleTabs();
    return `
      <div class="catalog-tabs bg-white rounded-2xl shadow-sm border border-gray-100 p-1 mb-3 grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1">
        ${tabs.map((t) => `
          <button type="button" data-catalog-tab="${t.key}" class="relative flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${t.key === active ? 'bg-indigo-600 text-white' : 'text-indigo-600 active:bg-indigo-50'}">
            <i data-lucide="${t.icon}" class="w-5 h-5"></i>
            <span class="text-[10px] font-medium leading-none">${t.label}</span>
            ${t.badge ? `<span data-catalog-tab-badge="${t.key}" class="hidden absolute top-0 right-1/2 translate-x-5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center"></span>` : ''}
          </button>`).join('')}
      </div>
    `;
  },

  wire() {
    document.querySelectorAll('[data-catalog-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = this.TABS.find((t) => t.key === btn.dataset.catalogTab);
        if (!tab || btn.classList.contains('bg-indigo-600')) return;
        location.replace(location.href.replace(/#.*$/, '') + '#/' + tab.path);
      });
    });
    this.visibleTabs().filter((t) => t.badge && (!t.badgeModule || hasModule(t.badgeModule))).forEach((t) => {
      callServer(t.badge).then((count) => {
        const badge = document.querySelector(`[data-catalog-tab-badge="${t.key}"]`);
        if (!badge || !count) return;
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
      }).catch(() => {});
    });
  },

  /** Карточка-переход на хаб-экранах «Порядок»/«Справочники». */
  hubCard({ id, icon, title, text, badgeId }) {
    return `
      <button type="button" id="${id}" class="relative w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-start gap-3 active:bg-gray-50 transition-colors">
        <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-gray-900 text-[15px] flex items-center gap-2">${title}${badgeId ? `<span id="${badgeId}" class="hidden min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] leading-[18px] text-center"></span>` : ''}</div>
          <div class="text-[12px] text-gray-500 mt-0.5">${text}</div>
        </div>
        <i data-lucide="chevron-right" class="w-5 h-5 text-gray-300 shrink-0 mt-2"></i>
      </button>
    `;
  }
};

window.Screens = window.Screens || {};

/** «Порядок» — инструменты наведения порядка в каталоге. */
window.Screens.catalogTools = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Каталог</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl md:max-w-6xl mx-auto">
        ${CatalogTabs.html('tools')}
        <div class="text-[12px] text-gray-500 px-1 mb-2">Проверки и исправления каталога. Ничего не меняется само — только по вашему выбору.</div>
        <div class="wide-grid">
          ${hasModule('dolls_reference') ? CatalogTabs.hubCard({ id: 'tools-check', icon: 'scan-search', title: 'Проверка по справочнику', badgeId: 'tools-check-badge', text: 'Сверка позиций с внешним справочником кукол: ссылка не совпадает с названием, несколько вариантов, одинаковый код модели, не нашлось.' }) : ''}
          ${CatalogTabs.hubCard({ id: 'tools-duplicates', icon: 'copy-check', title: 'Похожие названия и пробелы', text: 'Позиции с похожими названиями (объединить), заказы без позиции в каталоге, позиции без ссылки или фото.' })}
          ${CatalogTabs.hubCard({ id: 'tools-tags', icon: 'tags', title: 'Теги от ИИ', text: 'Бренд/персонаж/серия, которые ИИ предлагает для позиций с пустыми тегами. Применяете вы.' })}
          ${CatalogTabs.hubCard({ id: 'tools-names', icon: 'wand-2', title: 'Короткие имена', text: 'Короткие русские названия по тегам — как позицию видят клиенты.' })}
        </div>
      </main>
    `;
    CatalogTabs.wire();
    const toolsCheck = document.getElementById('tools-check');
    if (toolsCheck) toolsCheck.addEventListener('click', () => navigateTo('catalog/check'));
    document.getElementById('tools-duplicates').addEventListener('click', () => navigateTo('catalog', { tool: 'duplicates' }));
    document.getElementById('tools-tags').addEventListener('click', () => navigateTo('catalog', { tool: 'tags' }));
    document.getElementById('tools-names').addEventListener('click', () => navigateTo('catalog/short-names'));
    if (hasModule('dolls_reference')) callServer('getCatalogCheckCount').then((count) => {
      const badge = document.getElementById('tools-check-badge');
      if (!badge || !count) return;
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    }).catch(() => {});
    if (window.lucide) window.lucide.createIcons();
  }
};

/** «Справочники» — линейки и коллекции. */
window.Screens.catalogRefs = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Каталог</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl md:max-w-6xl mx-auto">
        ${CatalogTabs.html('refs')}
        <div class="text-[12px] text-gray-500 px-1 mb-2">Справочники, по которым раскладываются позиции каталога.</div>
        <div class="wide-grid">
          ${CatalogTabs.hubCard({ id: 'refs-lines', icon: 'git-branch', title: 'Линейки', text: 'Дерево брендов, поколений и линеек, разметка серий, словарь персонажей — по ним раскладываются позиции каталога.' })}
          ${hasModule('dolls_client') ? CatalogTabs.hubCard({ id: 'refs-collections', icon: 'layers', title: 'Коллекции', text: 'Именованные наборы позиций каталога, собранные вручную.' }) : ''}
        </div>
      </main>
    `;
    CatalogTabs.wire();
    document.getElementById('refs-lines').addEventListener('click', () => navigateTo('catalog/lines'));
    const refsCollections = document.getElementById('refs-collections');
    if (refsCollections) refsCollections.addEventListener('click', () => navigateTo('catalog/collections'));
    if (window.lucide) window.lucide.createIcons();
  }
};
