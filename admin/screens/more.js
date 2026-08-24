'use strict';

/**
 * Экран "Ещё" (17.08.2026, project_bot_knopka_admin_bottom_nav_redesign) —
 * узкоэкранный вход в Настройки/Конкурсы/Аналитику: на широких экранах
 * (`md:` и шире) эти три вместо этого рендерятся как обычные inline-кнопки
 * прямо в нижней навигации (см. app.html, `md:hidden`/`hidden md:flex`),
 * этот экран там не нужен — кнопка "Ещё" сама скрыта на этой ширине.
 *
 * В отличие от `wishlist-demand.js`/`collectives.js`/`deleted-orders.js`
 * (открываются иконкой с родительского экрана, не входят в нав вообще) —
 * это полноценный пункт нижней навигации (просто на узких экранах
 * "сворачивает" под себя три менее частых раздела), поэтому карточки здесь
 * снабжены пояснением под названием — то, ради чего эти разделы вообще можно
 * было прятать: не спутать их друг с другом, не заходя внутрь.
 *
 * Бейдж на карточке "Конкурсы" — количество заявок на проверку
 * (`getPendingTaskSubmissions`, тот же метод, что уже красит вкладку
 * "Модерация" в `contests.js`) — сигнал "там есть на что среагировать" не
 * теряется от того, что раздел не в основной панели, ровно то, что VASY
 * поддержал при обсуждении дизайна.
 */
window.Screens = window.Screens || {};
window.Screens.more = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Ещё</h1>';
    document.getElementById('header-actions').innerHTML = '';

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="more-list" class="space-y-2"></div>
      </main>
    `;

    const items = [
      { route: 'contests', icon: 'gift', title: 'Конкурсы', description: 'Задания и лотереи', badgeId: 'contests-badge' },
      { route: 'clients', icon: 'users', title: 'Клиенты', description: 'Блокировка, отчёты, вопросы и вишлист по клиенту' },
      { route: 'settings', icon: 'settings', title: 'Настройки', description: 'Комиссия, налоги, доли выплат' },
      { route: 'analytics', icon: 'bar-chart-2', title: 'Аналитика', description: 'Кто и как пользуется приложением' },
      // Э2 рефакторинга экономики, 25.08.2026 — "Факт выкупа" сюда не входит,
      // он привязан к заказу и открывается с экрана заказа (order-edit.js).
      { route: 'wallet', icon: 'coins', title: 'Кошелёк ₸', description: 'Конвертация ₽→₸, буфер по каналам, личные закупки' }
    ];

    const list = document.getElementById('more-list');
    list.innerHTML = items.map(item => `
      <button type="button" data-route="${item.route}" class="more-item w-full flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-left">
        <div class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <i data-lucide="${item.icon}" class="w-5 h-5"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium text-gray-900">${escapeHtmlClient(item.title)}</span>
            ${item.badgeId ? `<span id="${item.badgeId}" class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"></span>` : ''}
          </div>
          <div class="text-xs text-gray-400">${escapeHtmlClient(item.description)}</div>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300 shrink-0"></i>
      </button>
    `).join('');

    list.querySelectorAll('.more-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.route));
    });

    if (window.lucide) window.lucide.createIcons();
    loadContestsBadge();

    async function loadContestsBadge() {
      const badge = document.getElementById('contests-badge');
      if (!badge) return;
      try {
        const pending = await callServer('getPendingTaskSubmissions');
        badge.textContent = pending.length > 0 ? `${pending.length} на проверке` : '';
        if (window.updateMoreBadge) window.updateMoreBadge(pending.length);
      } catch (error) {
        // Тихий пропуск — бейдж необязателен, не блокировать список разделов из-за него.
      }
    }
  }
};
