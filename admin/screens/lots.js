'use strict';

/**
 * Экран "Лоты" — ЧИСТО read-only список для просмотра (запрос менеджера).
 * Тот же паттерн, что `collectives.js`: не в нижней навигации (открывается
 * иконкой из orders.js), но сама навигация остаётся видимой (showNav:true,
 * navKey:null — см. router.js).
 *
 * ИСПРАВЛЕНО 12.09.2026 (решение VASY, session — «мёртвый код») — обе
 * кнопки создания ("+ Лот"/"+ Корзина") убраны. Раньше обе вели на один и
 * тот же `lot-new.js`, который ВСЕГДА зовёт `createLot` — кнопка
 * "+ Корзина" создавала голый `lots`-ряд с `cart_id = NULL` (никогда не
 * попадал в реальный список "Корзины"/`cartsRepository`, не мог получить
 * "Факт выкупа по корзине"), при этом называлась и показывала тост как
 * настоящая корзина. Это НЕ была "более ранняя механика того же самого" —
 * Лот и Корзина больше НЕ одна сущность (см. `cartsService.js` JSDoc шапки
 * файла): Корзина — уровень НАД Лотом, у нового и старого создания разная
 * денежная модель (разбивка разницы между заявками корзины теперь может
 * идти в 2 уровня — см. `REFACTOR-CART.md`). Единственная точка входа в
 * СОЗДАНИЕ (и одиночного лота, и лота внутри корзины) теперь `carts/new`
 * (`cart-new.js`) — см. её JSDoc. `lots/new`/`lot-new.js` НЕ удалены
 * физически (технически достижимы по прямому хешу/e2e), только без
 * видимого входа — тот же переходный статус, что уже у `orders/new`/
 * `order-new.js` (снос обоих одним заходом позже, вместе с e2e-фикстурами).
 *
 * Экран остаётся нужен как есть — детальная карточка одного лота
 * (`lots/<id>`) читается и по прямому клику из этого списка, и по "чипу"
 * лота на заказе/коллективке (`orders.js`/`collective-detail.js`) — список
 * просто больше не единственный путь туда, но сам по себе продолжает
 * нужную менеджеру функцию "посмотреть все лоты".
 */
window.Screens = window.Screens || {};
window.Screens.lots = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2 inline-flex items-center gap-1.5">Лоты${helpIcon('Что такое лот', '<p>Лот — это одна общая закупка (у продавца ассорти, или корзина с площадки), которую нужно разнести на несколько заказов клиентов сразу.</p><p>Стоимость и вес/логистика делятся между позициями коэффициентами — вы задаёте только общую сумму и доли, суммы по каждому заказу считаются автоматически.</p>')}</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-3 flex items-center gap-2">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 shrink-0"></i>
          <input type="text" id="lot-list-search" class="w-full bg-transparent border-none outline-none text-[15px] placeholder-gray-400" placeholder="Поиск по ID/карго..." autocomplete="off">
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="lot-count"></div>
        <div id="lot-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Лотов не найдено</div>
      </main>
    `;

    let allLots = [];
    const listEl = document.getElementById('lot-list');
    const emptyMessage = document.getElementById('empty-message');
    const countEl = document.getElementById('lot-count');
    const searchInput = document.getElementById('lot-list-search');

    function buildCard(lot) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 cursor-pointer active:bg-gray-50 transition-colors';
      card.addEventListener('click', () => navigateTo(`lots/${encodeURIComponent(lot.lotId)}`));
      // Историческая пометка (НЕ "это настоящая корзина") — до 12.09.2026
      // кнопка "+ Корзина" на этом же экране писала `entry_point='cart'` в
      // голый `lots`-ряд без `cart_id` (см. JSDoc шапки файла) — такая
      // запись НИКОГДА не была реальной сущностью `carts`. Название не
      // "Корзина #X" (вводило бы в то же заблуждение), а явная пометка
      // старого входа, чтобы такие строки были видны для ручной сверки.
      const entryBadge = lot.entryPoint === 'cart' ? ' <span class="text-[10px] text-gray-400">(старый вход «Корзина»)</span>' : '';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 text-[15px]">Лот #${escapeHtmlClient(lot.lotId)}${entryBadge}</div>
            <div class="text-[12px] text-gray-400 mt-0.5">${escapeHtmlClient(lot.totalAmountInCurrency)} ${escapeHtmlClient(lot.currency)}${lot.cargo ? ' · ' + escapeHtmlClient(lot.cargo) : ''}</div>
          </div>
          <div class="text-[11px] text-gray-400 shrink-0">${lot.purchaseDate ? escapeHtmlClient(lot.purchaseDate) : ''}</div>
        </div>
        <div class="mt-2">
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">${lot.orderCount} ${lot.orderCount === 1 ? 'заказ' : 'заказов'}</span>
        </div>
      `;
      return card;
    }

    function renderList() {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = query === '' ? allLots : allLots.filter((l) =>
        l.lotId.toLowerCase().includes(query) || (l.cargo || '').toLowerCase().includes(query));

      listEl.innerHTML = '';
      filtered.forEach((l) => listEl.appendChild(buildCard(l)));
      emptyMessage.classList.toggle('hidden', filtered.length > 0);
      countEl.textContent = `Всего: ${filtered.length}`;
      if (window.lucide) window.lucide.createIcons();
    }

    searchInput.addEventListener('input', renderList);

    async function load() {
      try {
        allLots = await callServer('getLotsList');
        renderList();
      } catch (error) {
        showSaveToast(false, `Не удалось загрузить лоты: ${error.message}`);
      }
    }
    load();

    if (window.lucide) window.lucide.createIcons();
  }
};
