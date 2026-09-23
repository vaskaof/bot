'use strict';

/**
 * Альбом коллекции (IMPLEMENTATION-PLAN-GAMIFICATION.md §2.3) — маршрут
 * `collection/<id>`. Все куклы набора: цветные — есть, с сердечком — в
 * вишлисте, серые — ещё нет (тап → «Хочу эту» / «Она уже у меня»).
 * Пробелы в альбоме — главный источник новых позиций вишлиста.
 */
window.Screens = window.Screens || {};
window.Screens.collectionAlbum = {
  render(root, _context, params) {
    const collectionId = params && params.collectionId;
    let detail = null;
    let popSku = null;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="album-back-btn" class="p-2 -ml-2 text-gray-600 rounded-full" aria-label="Назад"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
      <h1 id="album-title" class="text-lg font-semibold text-gray-900 tracking-tight truncate">Коллекция</h1>`;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('album-back-btn').addEventListener('click', () => navigateTo('wishlist'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="album-body"><div class="p-6 text-center text-sm text-gray-400">Загрузка...</div></div>
      </main>`;
    const body = document.getElementById('album-body');

    async function load() {
      try {
        detail = await callServer('getClientCollectionDetail', collectionId);
        render();
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function headline(d) {
      const left = d.totalCount - d.ownedCount;
      if (d.totalCount > 0 && left === 0) return 'Коллекция собрана';
      if (left === 1) return 'Осталась одна кукла';
      return `Осталось ${left} ${Hunt.plural(left, 'кукла', 'куклы', 'кукол')}`;
    }

    function render() {
      const d = detail;
      document.getElementById('album-title').textContent = d.name;
      const done = d.totalCount > 0 && d.ownedCount === d.totalCount;
      const r = 27;
      const len = 2 * Math.PI * r;
      const pct = d.totalCount > 0 ? d.ownedCount / d.totalCount : 0;
      const hint = done
        ? 'Золотая рамка — навсегда.'
        : `${d.wantCount > 0 ? `${d.wantCount} уже в вишлисте. ` : ''}Нажмите на серую — добавим в охоту.`;

      const tiles = d.items.map((it) => Hunt.tileHtml({
        state: it.state,
        title: it.productDisplay,
        imageUrl: it.imageUrl,
        isGrail: it.isGrail,
        badge: it.state === 'owned' ? '<span class="hn-badge win"><i data-lucide="check"></i></span>'
          : it.state === 'want' ? '<span class="hn-badge want"><i data-lucide="heart"></i></span>'
            : '<span class="hn-badge add"><i data-lucide="plus"></i></span>',
        pop: popSku === it.skuOriginal,
        attrs: `data-sku="${escapeHtmlClient(it.skuOriginal)}"`
      })).join('');

      body.innerHTML = `
        <div class="flex gap-3.5 items-center bg-white rounded-2xl p-3.5 border ${done ? 'border-[#E8B130]' : 'border-gray-100'}">
          <div class="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" class="w-16 h-16 -rotate-90">
              <circle cx="32" cy="32" r="${r}" stroke="#eceef5" stroke-width="7" fill="none"/>
              <circle cx="32" cy="32" r="${r}" stroke="${done ? '#E8B130' : '#4f46e5'}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - pct)}"/>
            </svg>
            <b class="absolute inset-0 grid place-items-center text-[15px] font-extrabold tabular-nums">${d.ownedCount}/${d.totalCount}</b>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-[15px] text-gray-900">${headline(d)}</div>
            <div class="text-[12.5px] text-gray-500 mt-0.5 leading-snug">${hint}</div>
          </div>
        </div>
        ${d.description ? `<div class="text-[12.5px] text-gray-400 mt-2 px-0.5">${escapeHtmlClient(d.description)}</div>` : ''}
        <div class="flex gap-3 text-[11px] text-gray-400 mt-3 mb-3 px-0.5">
          <span class="flex items-center gap-1"><i class="inline-block w-2.5 h-2.5 rounded bg-emerald-500"></i>есть</span>
          <span class="flex items-center gap-1"><i class="inline-block w-2.5 h-2.5 rounded bg-indigo-600"></i>в вишлисте</span>
          <span class="flex items-center gap-1"><i class="inline-block w-2.5 h-2.5 rounded bg-gray-300"></i>ещё нет</span>
        </div>
        ${d.items.length > 0 ? `<div class="hn-grid">${tiles}</div>` : '<div class="p-6 text-center text-sm text-gray-400">В коллекции пока нет кукол.</div>'}`;
      if (window.lucide) window.lucide.createIcons();
      Hunt.wireImages(body);
      popSku = null;
    }

    body.addEventListener('click', (e) => {
      const tile = e.target.closest('[data-sku]');
      if (!tile || !detail) return;
      const item = detail.items.find((it) => it.skuOriginal === tile.dataset.sku);
      if (item) openSheet(item);
    });

    function openSheet(item) {
      Hunt.haptic('selection');
      let actions;
      let note;
      if (item.state === 'missing') {
        note = 'Ещё не в вашем вишлисте';
        actions = `
          <button type="button" class="hn-btn primary" data-act="want"><i data-lucide="heart"></i>Хочу эту</button>
          <button type="button" class="hn-btn soft" data-act="have"><i data-lucide="check"></i>Она уже у меня</button>`;
      } else if (item.state === 'want') {
        note = 'В вашем вишлисте';
        actions = '<button type="button" class="hn-btn primary" data-act="own"><i data-lucide="check"></i>У меня!</button>';
      } else {
        note = 'На вашей полке';
        actions = '';
      }
      const html = `
        <div class="hn-sh-top">
          <div class="hn-tile ${item.state}${item.isGrail ? ' grail' : ''}" style="width:112px;flex:none"><div class="hn-ph">${Hunt.imgHtml(item.imageUrl, item.productDisplay)}</div></div>
          <div class="min-w-0">
            <div class="hn-sh-name">${escapeHtmlClient(item.productDisplay)}</div>
            <div class="hn-sh-sub">${escapeHtmlClient(detail.name)}</div>
          </div>
        </div>
        <div class="hn-meta"><div><i data-lucide="info"></i>${note}</div>${item.imageUrl ? '' : '<div><i data-lucide="image-off"></i>Фото появится, как только его добавят в каталог</div>'}</div>
        <div data-slot="err" class="mt-3"></div>
        ${actions ? `<div class="hn-acts">${actions}</div>` : ''}`;

      Hunt.sheet(html, (sheetEl) => {
        const showErr = (message) => {
          sheetEl.querySelector('[data-slot="err"]').innerHTML = `<div class="hn-err">${escapeHtmlClient(message)}</div>`;
        };
        const add = async (btn, addToChecklist) => {
          btn.disabled = true;
          try {
            await callServer('addWishlistItem', { skuOriginal: item.skuOriginal, addToChecklist });
            Hunt.closeSheet();
            Hunt.haptic('light');
            popSku = item.skuOriginal;
            showSaveToast(true, addToChecklist ? `${item.productDisplay} — на полке` : `${item.productDisplay} — в вишлисте. Охота началась`);
            load();
          } catch (error) {
            btn.disabled = false;
            showErr(error.message);
          }
        };
        const want = sheetEl.querySelector('[data-act="want"]');
        if (want) want.addEventListener('click', () => add(want, false));
        const have = sheetEl.querySelector('[data-act="have"]');
        if (have) have.addEventListener('click', () => add(have, true));
        const own = sheetEl.querySelector('[data-act="own"]');
        if (own) {
          own.addEventListener('click', async () => {
            own.disabled = true;
            Hunt.closeSheet();
            const outcome = await Hunt.acquire(item.wishlistId);
            if (outcome === 'failed') return;
            if (outcome !== 'undone') popSku = item.skuOriginal;
            load();
          });
        }
      });
    }

    if (!collectionId) {
      body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Коллекция не найдена.</div>';
      return;
    }
    load();
  }
};
