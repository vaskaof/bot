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
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Спрос клиентов</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="text-[11px] text-gray-400 px-1 mb-2">По каталогу</div>
        <div id="demand-list"></div>
        <div id="demand-empty" class="hidden text-center text-sm text-gray-400 py-6">Активных желаний пока нет.</div>

        <div class="text-[11px] text-gray-400 px-1 mb-2 mt-6">Не найдено в каталоге</div>
        <div id="unknown-list"></div>
        <div id="unknown-empty" class="hidden text-center text-sm text-gray-400 py-6">Таких позиций нет.</div>
      </main>
      ${SkuModal.html()}
    `;

    const demandList = document.getElementById('demand-list');
    const demandEmpty = document.getElementById('demand-empty');
    const unknownList = document.getElementById('unknown-list');
    const unknownEmpty = document.getElementById('unknown-empty');
    const refreshBtn = document.getElementById('refresh-btn');
    // Фаза 4 интеграции Вишлист/Каталог/Заказы (04.08.2026) — "черновик SKU":
    // перенос позиции вишлиста в каталог из раздела "Не найдено".
    const skuModal = SkuModal.init({ onSaved: () => load() });

    load();

    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      load().finally(() => {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    async function load() {
      demandList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      unknownList.innerHTML = '';
      try {
        const result = await callServer('getWishlistDemand');
        render(result);
      } catch (error) {
        demandList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function render(result) {
      demandList.innerHTML = '';
      if (result.demand.length === 0) {
        demandEmpty.classList.remove('hidden');
      } else {
        demandEmpty.classList.add('hidden');
        result.demand.forEach(d => demandList.appendChild(buildDemandCard(d)));
      }

      unknownList.innerHTML = '';
      if (result.unknown.length === 0) {
        unknownEmpty.classList.remove('hidden');
      } else {
        unknownEmpty.classList.add('hidden');
        result.unknown.forEach(u => unknownList.appendChild(buildUnknownRow(u)));
      }

      if (window.lucide) window.lucide.createIcons();
    }

    function buildDemandCard(d) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      card.innerHTML = `
        <div class="flex items-center justify-between gap-2 cursor-pointer" data-toggle>
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(d.productDisplay)}</div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Хотят: ${d.activeCount}</span>
            ${d.purchasedCount > 0 ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Куплено: ${d.purchasedCount}</span>` : ''}
            <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 chevron-icon"></i>
          </div>
        </div>
        <div class="clients-block hidden mt-2 pt-2 border-t border-gray-100 space-y-1.5">
          ${d.clients.map((c, idx) => `
            <div class="flex items-center justify-between gap-2">
              <span class="text-[12px] text-gray-500">${escapeHtmlClient(c.display)}</span>
              <button type="button" class="order-from-demand-btn shrink-0 px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 text-[11px] font-medium" data-idx="${idx}">
                Оформить заказ
              </button>
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
      card.querySelectorAll('.order-from-demand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const c = d.clients[parseInt(btn.dataset.idx, 10)];
          navigateTo('orders/new', {
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
        <div class="font-medium text-gray-800 text-[14px]">${escapeHtmlClient(u.rawTitle)}</div>
        ${u.rawDescription ? `<div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(u.rawDescription)}</div>` : ''}
        ${u.sourceUrl ? `<div class="text-[12px] text-indigo-500 mt-0.5 truncate"><a href="${escapeHtmlClient(u.sourceUrl)}" target="_blank" rel="noopener">${escapeHtmlClient(u.sourceUrl)}</a></div>` : ''}
        <div class="text-[12px] text-gray-500 mt-1">${escapeHtmlClient(u.clientDisplay || 'Клиент не указан')} · ${escapeHtmlClient(u.createdAtDisplay)}</div>
        <div class="flex gap-2 mt-2">
          <button type="button" class="add-to-catalog-btn flex-1 text-center py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium">
            Добавить в каталог
          </button>
          <button type="button" class="order-from-unknown-btn flex-1 text-center py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium">
            Оформить заказ
          </button>
        </div>
      `;

      row.querySelector('.add-to-catalog-btn').addEventListener('click', () => {
        skuModal.open('create', null,
          { original: u.rawTitle, description: u.rawDescription, imageUrl: u.rawImageUrl },
          { wishlistId: u.wishlistId, pendingLink: u.sourceUrl, pendingLinkSource: 'Вишлист' });
      });

      // Фаза 5 (04.08.2026) — заказ без привязки к каталогу: "Выпуск" в форме
      // заполнится свободным текстом (productOriginal), не позицией каталога.
      row.querySelector('.order-from-unknown-btn').addEventListener('click', () => {
        navigateTo('orders/new', {
          telegramId: u.telegramId, username: u.username, name: u.clientName,
          productOriginal: u.rawTitle, wishlistId: u.wishlistId
        });
      });

      return row;
    }
  }
};
