'use strict';

/**
 * router.js — хэш-роутинг SPA-шелла админ-панели (02.08.2026, тот же паттерн,
 * что client/router.js). Отличия от клиентского роутера:
 * - showNav отдельно от navKey: несколько экранов показывают нижнюю навигацию,
 *   но без подсветки активного пункта (collectives.html, index.html — не входят
 *   в 6 основных разделов меню), а не только "показать/скрыть целиком".
 * - AbortController на каждый монтированный экран — несколько экранов админки
 *   вешают document-level click-обработчики (закрытие выпадающих списков вне
 *   клика) внутри своего render(); без явной отмены такие обработчики не
 *   снимаются при повторном заходе на экран (очистка #screen-root их не
 *   трогает, они висят на document, не внутри контейнера) и копятся на
 *   каждый повторный визит. Экран получает signal четвёртым аргументом
 *   render() и вешает такие слушатели с { signal }.
 */
const ROUTES = [
  { path: 'news', screen: 'news', navKey: 'news', showNav: true },
  { path: 'questions', screen: 'questions', navKey: 'questions', showNav: true },
  { path: 'reminders', screen: 'reminders', navKey: 'reminders', showNav: true },
  { path: 'orders', screen: 'orders', navKey: 'orders', showNav: true },
  { path: 'catalog', screen: 'catalog', navKey: 'catalog', showNav: true },
  { path: 'contests', screen: 'contests', navKey: 'contests', showNav: true },
  { path: 'collectives', screen: 'collectives', navKey: null, showNav: true },
  { path: 'orders/new', screen: 'orderNew', navKey: null, showNav: true },
  { path: 'wishlist-demand', screen: 'wishlistDemand', navKey: null, showNav: false },
];
const DEFAULT_ROUTE = 'news';

/**
 * Разбирает location.hash в {screen, navKey, showNav, params}. Не бросает на
 * пустом/некорректном хэше — фолбэк на DEFAULT_ROUTE.
 * @param {string} hash Например "#/orders" или "#/orders/ORD-1/edit"
 * @returns {{screen:string, navKey:string|null, showNav:boolean, params:Object}}
 */
function matchRoute(hash) {
  const clean = (hash || '').replace(/^#\/?/, '');
  if (clean === '') return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, showNav: true, params: {} };

  const editMatch = clean.match(/^orders\/([^/]+)\/edit$/);
  if (editMatch) {
    return { screen: 'orderEdit', navKey: null, showNav: false, params: { orderId: decodeURIComponent(editMatch[1]) } };
  }

  const route = ROUTES.find((r) => r.path === clean);
  if (route) return { screen: route.screen, navKey: route.navKey, showNav: route.showNav, params: {} };

  return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, showNav: true, params: {} };
}

/** Переход между экранами — используется вместо window.location.href/<a href="X.html">. */
function navigateTo(path) {
  window.location.hash = '#/' + path;
}

/** Общий toast — та же общая функция, что и в клиентском router.js (независимая копия, разные шеллы). */
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

let _currentScreenController = null;

/**
 * Отрисовывает текущий маршрут: полностью очищает #screen-root, отменяет
 * document/window-level слушатели предыдущего экрана (AbortController) и
 * вызывает render() нового экрана. dictionaries — результат getDictionaries(),
 * полученный один раз при старте (см. startAdminRouter), передаётся каждому
 * экрану, даже если конкретный экран его не использует (дёшево, тот же приём,
 * что был в старых initApp(dictionaries) везде, где нужны справочники).
 */
function renderRoute(dictionaries) {
  const { screen, navKey, showNav, params } = matchRoute(window.location.hash);
  const screenModule = window.Screens && window.Screens[screen];
  const root = document.getElementById('screen-root');
  const nav = document.getElementById('bottom-nav');

  if (!screenModule || !root) {
    console.error(`Экран "${screen}" не найден (hash: ${window.location.hash}).`);
    return;
  }

  if (_currentScreenController) _currentScreenController.abort();
  _currentScreenController = new AbortController();

  root.innerHTML = '';
  screenModule.render(root, dictionaries, params, _currentScreenController.signal);

  if (nav) {
    nav.classList.toggle('hidden', !showNav);
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
 * Запускает SPA-шелл админки: initAccessCheck() ОДИН раз за открытие
 * приложения (не на каждый переход между экранами, как было раньше).
 */
function startAdminRouter() {
  const nav = document.getElementById('bottom-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-key]');
      if (!btn) return;
      navigateTo(btn.dataset.navKey);
    });
  }

  initAccessCheck(function (dictionaries) {
    renderRoute(dictionaries);
    window.addEventListener('hashchange', () => renderRoute(dictionaries));
  });
}
