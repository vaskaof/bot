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
        <div id="welcome-banner" class="hidden bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 relative">
          <button type="button" id="welcome-banner-close" title="Скрыть" class="absolute top-2.5 right-2.5 p-1 text-indigo-300 hover:text-indigo-500">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
          <div class="text-sm font-semibold text-gray-900 pr-6">👋 Добро пожаловать в «Кнопку»!</div>
          <div class="text-[13px] text-gray-600 mt-1.5 leading-relaxed">
            Это приложение — ваш личный кабинет. В разделах ниже: статус заказов, совы за покупки и приглашённых друзей, конкурсы и связь с менеджером.
            А здесь, на «Новостях», — обновления о боте и магазине.
            Если заказа ещё нет — просто напишите менеджеру, чтобы оформить первый.
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-2 mb-4 flex items-center justify-between gap-2">
          <div class="text-[12px] text-gray-500">Уведомлять о новостях</div>
          <div id="subscription-toggle" class="toggle-switch toggle-switch-sm on"><div class="knob"></div></div>
        </div>

        <div id="news-list"></div>
        <div id="empty-message" class="hidden">${buildEmptyState('megaphone', 'Новостей пока нет.')}</div>
      </main>
    `;

    const listContainer = document.getElementById('news-list');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');
    const toggle = document.getElementById('subscription-toggle');

    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 6): "Новости" — первый экран,
    // который видит любой клиент при открытии мини-аппа (DEFAULT_ROUTE в
    // router.js), но до этой правки он ничего не объяснял про сам продукт —
    // онбординг целиком лежал на тексте /start в чате бота, до которого
    // клиент мог и не дочитать. Баннер — чисто клиентский localStorage-флаг,
    // без нового запроса к серверу (важно: этот экран открывается на КАЖДОМ
    // старте приложения, добавлять сюда лишний сетевой вызов ради баннера
    // не стоит — тот же принцип, что уже применён к перф-долгу в этом ауди).
    // Ограничение принятое сознательно: это флаг "видел на этом устройстве",
    // не "видел хоть раз" — тот же trade-off, что и большинство
    // localStorage-based once-баннеров, при смене устройства баннер
    // покажется снова, не критично для одноразового приветствия.
    //
    // ИСПРАВЛЕНО 19.08.2026 (п.4 бета-фидбека) — текст баннера раньше
    // говорил "здесь вы следите за статусом заказов", хотя заголовок
    // экрана — "Новости" (не "Заказы"). VASY подтвердил, что маршрутизация
    // на "Новости" первым экраном намеренная (клиент знакомится с
    // функциями раньше, чем идёт к заказам) — путаница была не в этом, а
    // в самом ТЕКСТЕ баннера, который читался как описание ТЕКУЩЕЙ вкладки
    // ("У меня был конфьюз — я слежу за заказами или читаю новости?").
    // Текст переписан, явно разделяя "здесь, на Новостях" (текущий экран) и
    // "в разделах ниже" (остальное приложение) — сама навигация не менялась.
    const WELCOME_BANNER_KEY = 'knopka_welcome_seen';
    const welcomeBanner = document.getElementById('welcome-banner');
    try {
      if (!localStorage.getItem(WELCOME_BANNER_KEY)) {
        welcomeBanner.classList.remove('hidden');
      }
    } catch (e) { /* приватный режим/localStorage недоступен — просто не показываем баннер повторно-безопасно */ }
    document.getElementById('welcome-banner-close').addEventListener('click', () => {
      try { localStorage.setItem(WELCOME_BANNER_KEY, '1'); } catch (e) { /* см. выше */ }
      welcomeBanner.classList.add('hidden');
    });

    // 17.08.2026 — переведено на getMyNotificationSettings/setMyNotificationSettings
    // (тот же ключ `news`, что и дублирующий тумблер в Профиль → Уведомления,
    // единственное хранилище — news_subscribed, см. clientsRepository).
    // Раньше это состояние вообще не читалось с сервера (тумблер всегда
    // стартовал "включено"), теперь показывает актуальное значение.
    let subscribed = true;
    callServer('getMyNotificationSettings').then((prefs) => {
      subscribed = !!prefs.news;
      toggle.classList.toggle('on', subscribed);
    }).catch(() => {}); // не критично для экрана — тумблер останется в дефолте "включено"

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
        await callServer('setMyNotificationSettings', { news: next });
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
