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
/**
 * 17.08.2026 (project_bot_knopka_admin_bottom_nav_redesign) — нижняя
 * навигация сокращена с 8 до 6 постоянных пунктов:
 * - 'news'+'questions' слиты в один экран 'home' (screens/home.js, вкладки)
 *   — по прямому запросу VASY обе остаются на виду, просто под одной
 *   кнопкой, а не переехали в скрытое "Ещё".
 * - 'settings'/'contests' + новый 'analytics' сворачиваются под 'more' на
 *   узких экранах (screens/more.js) и разворачиваются в обычные inline-
 *   кнопки нав-бара на широких (см. app.html, брейкпоint `md:`) — сам
 *   маршрут у них не меняется, меняется только то, кладёт ли их app.html в
 *   видимую часть бара или под кнопку "Ещё".
 * MORE_GROUP ниже — единственное место, которое обе стороны (view app.html
 * и подсветка активного пункта здесь) обязаны знать одинаково.
 */
const MORE_GROUP = ['settings', 'contests', 'analytics'];

const ROUTES = [
  { path: 'home', screen: 'home', navKey: 'home', showNav: true },
  { path: 'reminders', screen: 'reminders', navKey: 'reminders', showNav: true },
  { path: 'orders', screen: 'orders', navKey: 'orders', showNav: true },
  { path: 'catalog', screen: 'catalog', navKey: 'catalog', showNav: true },
  { path: 'payments', screen: 'payments', navKey: 'payments', showNav: true },
  { path: 'more', screen: 'more', navKey: 'more', showNav: true },
  { path: 'contests', screen: 'contests', navKey: 'contests', showNav: true },
  { path: 'settings', screen: 'settings', navKey: 'settings', showNav: true },
  { path: 'analytics', screen: 'analytics', navKey: 'analytics', showNav: true },
  { path: 'collectives', screen: 'collectives', navKey: null, showNav: true },
  { path: 'orders/new', screen: 'orderNew', navKey: null, showNav: true },
  { path: 'orders/deleted', screen: 'deletedOrders', navKey: null, showNav: true },
  { path: 'wishlist-demand', screen: 'wishlistDemand', navKey: null, showNav: false },
];
const DEFAULT_ROUTE = 'home';

/**
 * Собирает query-строку из плоского объекта — вручную (без URLSearchParams,
 * тот же принцип осторожности, что и на бэкенде — GAS его не имеет, а
 * тестовый vm-сэндбокс фронтенда его тоже не предоставляет). Пропускает
 * undefined/null/пустые значения.
 * @param {Object} params
 * @returns {string} Без ведущего "?"
 */
function buildQueryString(params) {
  const parts = [];
  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
  }
  return parts.join('&');
}

/** Обратная операция к buildQueryString. Пустая/некорректная строка -> {}. */
function parseQueryString(qs) {
  const params = {};
  if (!qs) return params;
  qs.split('&').forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const key = idx === -1 ? pair : pair.slice(0, idx);
    const rawValue = idx === -1 ? '' : pair.slice(idx + 1);
    if (!key) return;
    params[decodeURIComponent(key)] = decodeURIComponent(rawValue);
  });
  return params;
}

/**
 * Разбирает location.hash в {screen, navKey, showNav, params}. Не бросает на
 * пустом/некорректном хэше — фолбэк на DEFAULT_ROUTE. Query-строка (Фаза 5
 * интеграции Вишлист/Каталог/Заказы, 04.08.2026) отделяется ДО поиска
 * маршрута — не задевает уже работающий разбор "orders/<id>/edit" (у него
 * свой params с orderId, query туда не подмешивается).
 * @param {string} hash Например "#/orders" или "#/orders/new?telegramId=123"
 * @returns {{screen:string, navKey:string|null, showNav:boolean, params:Object}}
 */
function matchRoute(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const qIndex = raw.indexOf('?');
  const clean = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const queryParams = qIndex === -1 ? {} : parseQueryString(raw.slice(qIndex + 1));

  if (clean === '') return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, showNav: true, params: {} };

  const editMatch = clean.match(/^orders\/([^/]+)\/edit$/);
  if (editMatch) {
    return { screen: 'orderEdit', navKey: null, showNav: false, params: { orderId: decodeURIComponent(editMatch[1]) } };
  }

  const route = ROUTES.find((r) => r.path === clean);
  if (route) return { screen: route.screen, navKey: route.navKey, showNav: route.showNav, params: queryParams };

  return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, showNav: true, params: {} };
}

/**
 * Переход между экранами — используется вместо window.location.href/<a href="X.html">.
 * @param {string} path
 * @param {Object} [params] Необязательно (Фаза 5, 04.08.2026) — сериализуется в query-строку.
 */
function navigateTo(path, params) {
  const qs = params ? buildQueryString(params) : '';
  window.location.hash = '#/' + path + (qs ? '?' + qs : '');
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

/**
 * Бейджи нижней навигации (17.08.2026) — вне зависимости от того, какой
 * экран сейчас смонтирован: "Главная" (непроверенные вопросы) и "Ещё"
 * (заявки конкурсов на модерации) должны быть видны СРАЗУ, не только после
 * захода внутрь. window.updateHomeBadge(count) — home.js вызывает его же
 * функцией с уже загруженными данными (не дублирует свой собственный
 * getQuestionsList ещё одним запросом); здесь — только бэкграунд-обновление
 * для случая, когда экран "Главная" ещё не открывали в этом заходе в
 * приложение.
 */
function _setNavBadge(navKey, count) {
  const link = document.querySelector(`#bottom-nav [data-nav-key="${navKey}"]`);
  if (!link) return;
  let badge = link.querySelector('.nav-badge');
  if (!count) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-badge absolute top-1 right-[18%] min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 text-center font-medium';
    link.classList.add('relative');
    link.appendChild(badge);
  }
  badge.textContent = count > 9 ? '9+' : String(count);
}

window.updateHomeBadge = (count) => _setNavBadge('home', count);
window.updateMoreBadge = (count) => _setNavBadge('more', count);

let _navBadgesLoaded = false;
async function refreshNavBadges() {
  if (_navBadgesLoaded) return; // Достаточно один раз за открытие приложения — дальше обновляют сами экраны (home.js/more.js) по факту своей загрузки.
  _navBadgesLoaded = true;
  try {
    const questions = await callServer('getQuestionsList');
    _setNavBadge('home', questions.filter((q) => q.status === 'Новый').length);
  } catch (error) { /* бейдж необязателен — не мешать навигации ошибкой фонового запроса */ }
  try {
    const pending = await callServer('getPendingTaskSubmissions');
    _setNavBadge('more', pending.length);
  } catch (error) { /* см. выше */ }
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
      // Настройки/Конкурсы/Аналитика подсвечивают и себя (inline-кнопка на
      // широком экране), и кнопку "Ещё" (единственная видимая на узком) —
      // см. MORE_GROUP выше, app.html держит обе формы в разметке одновременно
      // и переключает видимость чисто CSS-медиа-запросом.
      const key = link.dataset.navKey;
      const active = key === navKey || (key === 'more' && MORE_GROUP.includes(navKey));
      link.classList.toggle('text-indigo-600', active);
      link.classList.toggle('text-gray-400', !active);
    });
  }

  refreshNavBadges();

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
