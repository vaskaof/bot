'use strict';

/**
 * Экран "Новости" (Главная) — перенесён из client/news.html (Phase 2 SPA,
 * 02.08.2026). showSaveToast — общая функция из router.js.
 */
window.Screens = window.Screens || {};
window.Screens.news = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Новости</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-gray-800">Уведомления о новостях</div>
            <div class="text-[11px] text-gray-400 mt-0.5">Сообщения в Telegram при выходе новостей (9:00–20:00)</div>
          </div>
          <div id="subscription-toggle" class="toggle-switch on"><div class="knob"></div></div>
        </div>

        <div id="news-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Новостей пока нет.</div>
      </main>
    `;

    const listContainer = document.getElementById('news-list');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');
    const toggle = document.getElementById('subscription-toggle');

    // Локальный признак подписки — сервер не отдаёт текущее состояние отдельным
    // методом (getUserContext его не включает), поэтому тумблер стартует в
    // состоянии "включено" (соответствует серверному default: пусто = подписан)
    // и дальше отражает только действия текущей сессии.
    let subscribed = true;

    loadNews();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await loadNews();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    toggle.addEventListener('click', async () => {
      const next = !subscribed;
      toggle.classList.toggle('on', next);
      try {
        await callServer('setNewsSubscription', next);
        subscribed = next;
      } catch (error) {
        toggle.classList.toggle('on', subscribed); // откат при ошибке
        showSaveToast(false, `Не удалось изменить настройку: ${error.message}`);
      }
    });

    async function loadNews() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const news = await callServer('getClientNewsFeed');
        render(news);
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function render(news) {
      listContainer.innerHTML = '';

      if (news.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      news.forEach(n => listContainer.appendChild(buildCard(n)));
    }

    function buildCard(n) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';
      card.innerHTML = `
        <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(n.title)}</div>
        <div class="text-[13px] text-gray-600 mt-1.5 whitespace-pre-wrap">${escapeHtmlClient(n.text)}</div>
        <div class="text-[11px] text-gray-400 mt-2">${escapeHtmlClient(n.publishedAtDisplay)}</div>
      `;
      return card;
    }
  }
};
