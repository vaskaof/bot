'use strict';

/**
 * router.js — хэш-роутинг SPA-шелла клиентского мини-аппа (Phase 2, 02.08.2026).
 * Без сборки — GH Pages статичен, hash не требует серверной поддержки.
 * location.hash = ... сам создаёт запись в history, поэтому javascript:history.back()
 * в экранах (order-details) продолжает работать без изменений.
 *
 * matchRoute() — чистая функция без DOM, тестируется тем же vm-харнессом, что
 * escapeHtmlClient/generateRequestId в common.js (см. tests/router.test.js).
 */
const ROUTES = [
  { path: 'news', screen: 'news', navKey: 'news' },
  { path: 'questions', screen: 'questions', navKey: 'questions' },
  { path: 'wishlist', screen: 'wishlist', navKey: 'wishlist' },
  { path: 'orders', screen: 'orders', navKey: 'orders' },
  { path: 'contests', screen: 'contests', navKey: 'contests' },
  { path: 'profile', screen: 'profile', navKey: 'profile' },
];
const DEFAULT_ROUTE = 'news';

/**
 * Разбирает location.hash в {screen, navKey, params}. Не бросает на пустом/
 * некорректном хэше — фолбэк на DEFAULT_ROUTE (тот же экран, что раньше был
 * целью редиректа из app.html для роли "client").
 * @param {string} hash Например "#/orders" или "#/order-details/ABC-123"
 * @returns {{screen:string, navKey:string|null, params:Object}}
 */
function matchRoute(hash) {
  const clean = (hash || '').replace(/^#\/?/, '');
  if (clean === '') return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, params: {} };

  const detailsMatch = clean.match(/^order-details\/([^/]+)$/);
  if (detailsMatch) {
    return { screen: 'orderDetails', navKey: null, params: { orderId: decodeURIComponent(detailsMatch[1]) } };
  }

  // Политика конфиденциальности (17.08.2026) — не пункт нижней навигации,
  // доступ по ссылке (из «Профиль» и из /start бота), тот же паттерн, что
  // order-details выше.
  if (clean === 'policy') {
    return { screen: 'policy', navKey: null, params: {} };
  }

  const route = ROUTES.find((r) => r.path === clean);
  if (route) return { screen: route.screen, navKey: route.navKey, params: {} };

  return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, params: {} };
}

/** Переход между экранами — используется вместо window.location.href/<a href="X.html">. */
function navigateTo(path) {
  window.location.hash = '#/' + path;
}

/**
 * Общий toast для всех экранов. Раньше showSaveToast() была дословно
 * скопирована в news/order-details/wishlist/contests.html (4 идентичные
 * копии) — теперь одна функция + одна разметка #save-toast в шелле app.html.
 */
function showSaveToast(success, message) {
  const toast = document.getElementById('save-toast');
  const inner = document.getElementById('save-toast-inner');
  if (!toast || !inner) return;
  inner.textContent = message;
  inner.className = success
    ? 'rounded-xl px-4 py-3 text-sm font-medium text-center shadow-md bg-green-50 text-green-700 border border-green-200'
    : 'rounded-xl px-4 py-3 text-sm font-medium text-center shadow-md bg-red-50 text-red-700 border border-red-200';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

/**
 * Отрисовывает текущий маршрут: полностью очищает #screen-root и вызывает
 * render() экрана заново — тот же принцип, что старые loadX()-функции уже
 * применяли к спискам (innerHTML = '' + перестроить), просто теперь на весь
 * экран целиком. Экран сам владеет всем, что внутри #screen-root (шапка,
 * main, модалки) — общая часть (CDN/config/common.js, loading/access-denied,
 * нижняя навигация, toast) живёт в шелле один раз.
 */
function renderRoute(context) {
  const { screen, navKey, params } = matchRoute(window.location.hash);
  const screenModule = window.Screens && window.Screens[screen];
  const root = document.getElementById('screen-root');
  const nav = document.getElementById('bottom-nav');

  if (!screenModule || !root) {
    console.error(`Экран "${screen}" не найден (hash: ${window.location.hash}).`);
    return;
  }

  root.innerHTML = '';
  screenModule.render(root, context, params);

  if (nav) {
    nav.classList.toggle('hidden', !navKey);
    nav.querySelectorAll('[data-nav-key]').forEach((link) => {
      const active = link.dataset.navKey === navKey;
      link.classList.toggle('text-indigo-600', active);
      link.classList.toggle('text-gray-400', !active);
    });
  }

  if (window.lucide) window.lucide.createIcons();
  window.scrollTo(0, 0);
}

/**
 * Запускает SPA-шелл: initClientAccess() ОДИН раз за открытие приложения —
 * не на каждый переход между экранами, как было раньше (см. PROJECT_STATE.md
 * 02.08.2026, ADR-0004). Дальше — только смена экрана по hashchange, без
 * повторных обращений к серверу за контекстом.
 */
function startClientRouter() {
  // Нижняя навигация — <button data-nav-key="..."> (НЕ <a href>). Telegram
  // WebView в некоторых клиентах перехватывает клики по <a href="#...">
  // как полноценный переход/перезагрузку контейнера мини-аппа, даже когда
  // это просто смена хэша на той же странице — из-за этого весь смысл SPA
  // (один initClientAccess за открытие) терялся: каждый тап по нижней
  // панели фактически перезапускал приложение с нуля (найдено 02.08.2026 по
  // отчёту VASY — полноэкранная "Загрузка" без шапки/низа на каждый тап).
  // Один делегированный обработчик на контейнер — не на каждую кнопку —
  // не требует перепривязки при повторных renderRoute().
  const nav = document.getElementById('bottom-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-key]');
      if (!btn) return;
      navigateTo(btn.dataset.navKey);
    });
  }

  initClientAccess(function (context) {
    renderRoute(context);
    window.addEventListener('hashchange', () => renderRoute(context));
  });
}
