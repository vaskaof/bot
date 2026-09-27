'use strict';

/**
 * «Итоги года» (IMPLEMENTATION-PLAN-GAMIFICATION.md §4.2) — маршрут `year`,
 * кнопка «Выбрать куклу года» под картинкой итогов в чате и баннер в «Моих
 * куклах»/«Заказах». Цифры — снимок, который админ одобрил перед рассылкой;
 * здесь их только показываем. Сумм в рублях нет (VASY 27.09.2026).
 * «Кукла года» — клиент выбирает из своих заказов за год, сервер
 * пересобирает картинку и присылает в чат (её удобно переслать).
 */
window.Screens = window.Screens || {};
window.Screens.yearSummary = {
  render(root) {
    let summary = null;
    let picked = null;

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="year-back-btn" class="p-2 -ml-2 text-gray-600 rounded-full" aria-label="Назад"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
      <h1 id="year-title" class="text-lg font-semibold text-gray-900 tracking-tight truncate">Итоги года</h1>`;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('year-back-btn').addEventListener('click', () => navigateTo('wishlist'));

    root.innerHTML = `
      <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="year-body"><div class="p-6 text-center text-sm text-gray-400">Загрузка...</div></div>
      </main>`;
    const body = document.getElementById('year-body');

    async function load() {
      try {
        summary = await callServer('getMyYearSummary');
        if (!summary) {
          body.innerHTML = `<div class="p-6 text-center text-sm text-gray-500">Итоги года появятся 25 декабря — мы пришлём их в чат с ботом.</div>`;
          return;
        }
        picked = summary.doll ? summary.doll.orderId : null;
        draw();
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function tile(value, label, gold) {
      return `<div class="bg-white rounded-2xl p-3.5 border-t-4 ${gold ? 'border-[#E8B130]' : 'border-indigo-600'} shadow-sm">
        <div class="text-2xl font-extrabold text-gray-900 tabular-nums">${value}</div>
        <div class="text-[12px] text-gray-500 mt-0.5 leading-tight">${escapeHtmlClient(label)}</div>
      </div>`;
    }

    function draw() {
      const d = summary.data;
      const doll = summary.doll;
      document.getElementById('year-title').textContent = `Итоги ${summary.year}`;
      const P = Hunt.plural;
      const tiles = [tile(d.ordered, P(d.ordered, 'кукла заказана', 'куклы заказано', 'кукол заказано'))];
      if (d.received > 0) tiles.push(tile(d.received, 'уже у вас'));
      if (d.grails.length > 0) tiles.push(tile(d.grails.length, P(d.grails.length, 'Грааль добыт', 'Грааля добыто', 'Граалей добыто'), true));
      else if (d.achievements.length > 0) tiles.push(tile(d.achievements.length, P(d.achievements.length, 'достижение', 'достижения', 'достижений')));

      const facts = [];
      if (d.ordered > 1 && d.firstDoll) facts.push(['sparkles', `Первая кукла года: ${d.firstDoll.name}`]);
      if (d.favoriteSeries) facts.push(['layers', `Любимая серия: ${d.favoriteSeries.name} (${d.favoriteSeries.count})`]);
      if (d.bestMonth) facts.push(['calendar', `Самый активный месяц: ${d.bestMonth.label}`]);
      if (d.grails.length > 0) facts.push(['star', `${d.grails.length > 1 ? 'Граали' : 'Грааль'}: ${d.grails.join(', ')}`]);
      if (d.achievements.length > 0) facts.push(['award', `Достижения: ${d.achievements.join(', ')}`]);
      if (d.since) facts.push(['heart', `С нами с ${d.since}`]);

      const canPick = d.dolls.length > 1;
      const heroLabel = d.ordered === 1 ? 'Ваша первая кукла с нами' : 'Кукла года';
      body.innerHTML = `
        <div class="bg-white rounded-2xl border-t-4 border-[#E8B130] shadow-sm p-3.5 flex gap-3.5 items-center">
          <div class="hn-tile owned w-32 shrink-0"><div class="hn-ph">${doll ? Hunt.imgHtml(doll.imageUrl, doll.name) : ''}</div></div>
          <div class="min-w-0">
            <div class="text-[12px] text-gray-400">${heroLabel}</div>
            <div class="font-bold text-[16px] text-gray-900 leading-snug mt-0.5">${doll ? escapeHtmlClient(doll.name) : ''}</div>
            ${canPick ? `<div class="text-[12px] text-gray-500 mt-1.5">${summary.dollChosen ? 'Выбрана вами' : 'Выберите свою ниже'}</div>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-${tiles.length} gap-2.5 mt-3">${tiles.join('')}</div>
        ${facts.length > 0 ? `<div class="bg-white rounded-2xl shadow-sm p-3.5 mt-3 space-y-2">
          ${facts.map(([icon, text]) => `<div class="flex gap-2.5 items-start text-[13.5px] text-gray-700"><i data-lucide="${icon}" class="w-4 h-4 text-indigo-500 shrink-0 mt-0.5"></i><span>${escapeHtmlClient(text)}</span></div>`).join('')}
        </div>` : ''}
        ${canPick ? `
          <div class="text-[13px] font-semibold text-gray-900 mt-5 mb-2 px-0.5">Выберите куклу года</div>
          <div class="hn-grid" id="year-dolls">${d.dolls.map((it) => Hunt.tileHtml({
            state: 'owned', title: it.name, imageUrl: it.imageUrl, selected: it.orderId === picked,
            attrs: `data-order="${escapeHtmlClient(it.orderId)}"`
          })).join('')}</div>
          <div class="fixed bottom-16 inset-x-0 px-4 pb-3 max-w-2xl mx-auto">
            <button type="button" id="year-pick-btn" class="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-md disabled:opacity-50">Сделать куклой года и прислать картинку</button>
          </div>` : `
          <button type="button" id="year-pick-btn" class="w-full mt-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Прислать картинку в чат</button>`}
        <div class="text-center text-[12px] text-gray-400 mt-4">Спасибо, что охотитесь вместе с нами!</div>`;
      if (window.lucide) window.lucide.createIcons();
      Hunt.wireImages(body);

      const grid = document.getElementById('year-dolls');
      if (grid) {
        grid.addEventListener('click', (e) => {
          const t = e.target.closest('[data-order]');
          if (!t) return;
          picked = t.dataset.order;
          Hunt.haptic('selection');
          grid.querySelectorAll('.hn-tile').forEach((el) => el.classList.toggle('selected', el.dataset.order === picked));
        });
      }
      document.getElementById('year-pick-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!picked) return;
        btn.disabled = true;
        try {
          const res = await callServer('setMyDollOfYear', picked);
          summary.doll = res.doll;
          summary.dollChosen = true;
          Hunt.haptic('success');
          showSaveToast(true, 'Готово! Картинка придёт в чат с ботом — её можно переслать.');
          draw();
        } catch (error) {
          showSaveToast(false, error.message);
          btn.disabled = false;
        }
      });
    }

    load();
  }
};

/**
 * Баннер «Ваши итоги года» (25.12–31.01) — «Мои куклы» и «Заказы».
 * Сбой — просто без баннера.
 * @param {HTMLElement} container
 */
window.renderYearSummaryBanner = async function renderYearSummaryBanner(container) {
  if (!container) return;
  try {
    const s = await callServer('getMyYearSummary');
    if (!s || !s.showBanner) return;
    container.innerHTML = `
      <button type="button" class="w-full mb-3 p-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white flex items-center gap-3 text-left shadow-sm">
        <i data-lucide="party-popper" class="w-6 h-6 shrink-0"></i>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold">Ваши итоги ${s.year}</div>
          <div class="text-[12px] text-indigo-100">${s.dollChosen ? 'Кукла года выбрана — посмотрите ещё раз' : 'Выберите свою куклу года'}</div>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 shrink-0"></i>
      </button>`;
    container.querySelector('button').addEventListener('click', () => navigateTo('year'));
    if (window.lucide) window.lucide.createIcons();
  } catch (_error) { /* баннер необязателен */ }
};
