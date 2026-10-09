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
// 04.10.2026: + 'training'/'year-summaries' — на широком экране у них свои
// кнопки в колонке навигации (там нет «Ещё»), на узком подсвечивают «Ещё».
const MORE_GROUP = ['settings', 'contests', 'analytics', 'clients', 'wallet', 'staff', 'training', 'year-summaries', 'bookings'];

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
  // Э2 рефакторинга экономики, 25.08.2026 — форма "Конвертация" + отчёты
  // буфера/личных закупок, см. wallet.js. В MORE_GROUP наравне с settings/
  // contests/analytics/clients — та же логика сворачивания под "Ещё".
  { path: 'wallet', screen: 'wallet', navKey: 'wallet', showNav: true },
  // Фаза 2 (roles/RBAC, M2.3, 04.09.2026) — admin-only (см. more.js/app.html
  // — кнопка/карточка скрыты для менеджера; серверный гейт — MANAGER_ALLOWED_METHODS).
  { path: 'staff', screen: 'staff', navKey: 'staff', showNav: true },
  { path: 'collectives', screen: 'collectives', navKey: null, showNav: true },
  // Фича «Лот»/«Корзина» (delegated-spinning-rabbit.md, 02.09.2026) — тот же
  // паттерн, что 'collectives'/'orders/new' — список + форма создания,
  // деталь одного лота адресуется regex-маршрутом ниже (см. lotMatch),
  // по образцу collectiveMatch.
  { path: 'lots', screen: 'lots', navKey: null, showNav: true },
  { path: 'lots/new', screen: 'lotNew', navKey: null, showNav: true },
  // ИСПРАВЛЕНО 13.09.2026 (Волна 7 п.3, снос order-new.js) — маршрут
  // 'orders/new'/screen 'orderNew' убран целиком, экран снесён физически
  // (см. cart-new.js JSDoc — переходный период закончился, «Корзина»
  // единственная точка входа в создание заказа с 05.09.2026).
  { path: 'carts/new', screen: 'cartNew', navKey: null, showNav: true },
  // Фаза F (IMPLEMENTATION-PLAN-CART-UX.md §7, 07.09.2026) — список корзин,
  // тот же паттерн, что 'lots'/'collectives' — не в нижней навигации, вход
  // иконкой с orders.js. Карточка одной корзины — regex-маршрут ниже
  // (cartMatch), по образцу lotMatch.
  { path: 'carts', screen: 'carts', navKey: null, showNav: true },
  // Волна 5 (03.10.2026) — «Покупки»: корзины и лоты одним списком, вход с «Заказов».
  { path: 'purchases', screen: 'purchases', navKey: null, showNav: true },
  { path: 'orders/deleted', screen: 'deletedOrders', navKey: null, showNav: true },
  { path: 'wishlist-demand', screen: 'wishlistDemand', navKey: 'catalog', showNav: true }, // волна 5: вкладка «Спрос» каталога
  // «Коллекции» (§4 IMPLEMENTATION-PLAN-PROCESS-AND-WISHLIST.md, 20.09.2026)
  // — тот же паттерн, что 'wishlist-demand': не в нижней навигации, вход
  // иконкой с catalog.js.
  { path: 'catalog/collections', screen: 'catalogCollections', navKey: null, showNav: false },
  // Волна 5 (03.10.2026) — разделы «Порядок»/«Справочники» каталога (_catalog-tabs.js).
  { path: 'catalog/tools', screen: 'catalogTools', navKey: 'catalog', showNav: true },
  { path: 'catalog/refs', screen: 'catalogRefs', navKey: 'catalog', showNav: true },
  // Справочник линеек (IMPLEMENTATION-PLAN-GAMIFICATION.md §2.7 Т1, 24.09.2026).
  { path: 'catalog/lines', screen: 'catalogLines', navKey: null, showNav: false },
  // «Проверка каталога» по справочнику кукол (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.10, 24.09.2026).
  { path: 'catalog/check', screen: 'catalogCheck', navKey: null, showNav: false },
  // Короткие названия по тегам (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.15, 26.09.2026).
  { path: 'catalog/short-names', screen: 'catalogShortNames', navKey: null, showNav: false },
  { path: 'clients', screen: 'clients', navKey: 'clients', showNav: true },
  // «Итоги года» — модерация рассылки (IMPLEMENTATION-PLAN-GAMIFICATION.md §4.2),
  // admin-only, вход из «Ещё» и кнопкой из сообщения бота 18.12.
  { path: 'year-summaries', screen: 'yearSummaries', navKey: 'year-summaries', showNav: true },
  // Обучение менеджеров (04.10.2026) — вход из «Ещё», «Помощи» и баннера «Главной».
  { path: 'training', screen: 'training', navKey: 'training', showNav: true },
  // Б1 (09.10.2026) — бронь под постом в канале: список и каналы; карточка и «Новая бронь» — regex ниже.
  { path: 'bookings', screen: 'bookings', navKey: 'bookings', showNav: true },
];
const DEFAULT_ROUTE = 'home';

/**
 * §1.1 (19.09.2026, IMPLEMENTATION-PLAN-PROCESS-AND-WISHLIST.md) — "Мой
 * день": менеджер, открыв приложение, должен сразу видеть СВОЮ рабочую
 * очередь (getReminders теперь и правда её фильтрует, см. reminderService.js),
 * не ленту новостей. Admin — без изменений, DEFAULT_ROUTE ('home') как раньше
 * (у admin нет личной очереди в том же смысле — "Напоминания" там уже
 * показывают ВСЁ, отдельная кнопка в нижней навигации никуда не делась).
 * `window.CURRENT_ACCESS_ROLE` на момент вызова УЖЕ известен — matchRoute
 * вызывается из renderRoute, которая сама вызывается только внутри
 * initAccessCheck-колбэка (см. startAdminRouter ниже), не раньше.
 * @returns {{screen:string, navKey:string, showNav:boolean, params:Object}}
 */
function resolveDefaultRoute() {
  if (window.CURRENT_ACCESS_ROLE === 'manager') {
    const remindersRoute = ROUTES.find((r) => r.path === 'reminders');
    return { screen: remindersRoute.screen, navKey: remindersRoute.navKey, showNav: true, params: {} };
  }
  return { screen: DEFAULT_ROUTE, navKey: DEFAULT_ROUTE, showNav: true, params: {} };
}

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

  if (clean === '') return resolveDefaultRoute();

  const editMatch = clean.match(/^orders\/([^/]+)\/edit$/);
  if (editMatch) {
    return { screen: 'orderEdit', navKey: null, showNav: false, params: { orderId: decodeURIComponent(editMatch[1]) } };
  }

  // Адресуемый маршрут карточки коллективки (Э2 рефакторинга коллективок,
  // 24.08.2026) — заменяет модалку `collective-detail-modal` в collectives.js.
  // Тот же паттерн разбора, что editMatch выше. Решает жалобу VASY "ушёл в
  // заказ, вернулся в закрытую модалку" — тап по карточке заказа теперь ведёт
  // на настоящий `orders/{id}/edit`, а "Назад" там — обычный history.back(),
  // который сам вернёт сюда, раз оба перехода — реальные записи в history.
  const collectiveMatch = clean.match(/^collectives\/([^/]+)$/);
  if (collectiveMatch) {
    return { screen: 'collectiveDetail', navKey: null, showNav: true, params: { collectiveId: decodeURIComponent(collectiveMatch[1]) } };
  }

  // Адресуемый маршрут карточки лота (delegated-spinning-rabbit.md,
  // 02.09.2026) — тот же паттерн, что collectiveMatch выше. Проверяется
  // ПОСЛЕ collectiveMatch/ПЕРЕД общим ROUTES.find, но не может
  // конфликтовать с 'lots'/'lots/new' (те матчат ROUTES напрямую, сюда не
  // доходят — regex требует непустой сегмент после 'lots/', 'new' тоже под
  // него подошёл бы, поэтому 'lots/new' обязан стоять в ROUTES выше этой
  // проверки... фактически неважно: `route` для 'lots/new' находится через
  // ROUTES.find НИЖЕ, но эта regex-проверка сработает первой и уведёт на
  // lotDetail с lotId='new' — поэтому явное исключение).
  const lotMatch = clean !== 'lots/new' && clean.match(/^lots\/([^/]+)$/);
  if (lotMatch) {
    return { screen: 'lotDetail', navKey: null, showNav: true, params: { lotId: decodeURIComponent(lotMatch[1]) } };
  }

  // Адресуемый маршрут карточки корзины (Фаза F, §7 плана, 07.09.2026) —
  // тот же паттерн/то же исключение 'carts/new', что lotMatch выше.
  const cartMatch = clean !== 'carts/new' && clean.match(/^carts\/([^/]+)$/);
  if (cartMatch) {
    return { screen: 'cartDetail', navKey: null, showNav: true, params: { cartId: decodeURIComponent(cartMatch[1]) } };
  }

  // Б1 — карточка брони и «Новая бронь» (из пересланного боту поста: booking-new/<канал>/<пост>[/album]).
  const bookingMatch = clean.match(/^booking\/([^/]+)$/);
  if (bookingMatch) {
    return { screen: 'bookingDetail', navKey: 'bookings', showNav: true, params: { postId: decodeURIComponent(bookingMatch[1]) } };
  }
  const bookingNewMatch = clean.match(/^booking-new(?:\/(\d+)\/(\d+)(\/album)?)?$/);
  if (bookingNewMatch) {
    return { screen: 'bookingNew', navKey: 'bookings', showNav: true, params: bookingNewMatch[1] ? { channelId: bookingNewMatch[1], messageId: bookingNewMatch[2], album: bookingNewMatch[3] ? '1' : '' } : {} };
  }

  const route = ROUTES.find((r) => r.path === clean);
  if (route) return { screen: route.screen, navKey: route.navKey, showNav: route.showNav, params: queryParams };

  return resolveDefaultRoute();
}

/**
 * Переход между экранами — используется вместо window.location.href/<a href="X.html">.
 * @param {string} path
 * @param {Object} [params] Необязательно (Фаза 5, 04.08.2026) — сериализуется в query-строку.
 */
function navigateTo(path, params) {
  _hasNavigatedInSession = true;
  const qs = params ? buildQueryString(params) : '';
  window.location.hash = '#/' + path + (qs ? '?' + qs : '');
}

/**
 * Ставится в true при первом же navigateTo() за это открытие приложения —
 * используется navigateBack(), чтобы отличить "экран открыт обычным переходом
 * внутри SPA" (тогда history.back() безопасен и вернёт на предыдущий реальный
 * экран) от "экран — самая первая точка входа в этой сессии" (прямой заход по
 * хэшу/восстановление вебвью на сохранённом хэше — тогда history.back() может
 * увести за пределы приложения, там безопаснее navigateTo(fallback)).
 */
let _hasNavigatedInSession = false;

/**
 * "Закрыть текущий экран" — возвращает туда, откуда реально пришли (25.08.2026,
 * репорт VASY: "Сохранить"/"Удалить" на редактировании заказа жёстко уводили на
 * "Заказы", даже если экран открыли из коллективки/Напоминаний/Оплат/Главной —
 * см. project_bot_knopka_collectives_refactor). В отличие от простого
 * `history.back()` (уже применялся точечно, например collective-detail.js) —
 * безопасен и при прямом заходе на экран без предшествующей навигации внутри
 * приложения, тогда откатывается на явный `fallbackPath`.
 * @param {string} fallbackPath Куда перейти, если возвращаться внутри SPA некуда.
 * @param {Object} [fallbackParams]
 */
function navigateBack(fallbackPath, fallbackParams) {
  if (_hasNavigatedInSession) {
    history.back();
  } else {
    navigateTo(fallbackPath, fallbackParams);
  }
}

/**
 * Общий toast — та же общая функция, что и в клиентском router.js (независимая копия, разные шеллы).
 * Ошибки (04.10.2026, обучение менеджеров этап 2) рисует ErrorHints
 * (screens/_error-hints.js): человеческий текст, подсказка, «Сообщить».
 */
function showSaveToast(success, message) {
  if (!success && window.ErrorHints) {
    ErrorHints.show(message);
    return;
  }
  const toast = document.getElementById('save-toast');
  const inner = document.getElementById('save-toast-inner');
  if (!toast || !inner) return;
  inner.textContent = message;
  inner.className = success
    ? 'rounded-xl px-4 py-3 text-sm font-medium text-center shadow-md bg-green-50 text-green-700 border border-green-200'
    : 'rounded-xl px-4 py-3 text-sm font-medium text-center shadow-md bg-red-50 text-red-700 border border-red-200';
  toast.classList.remove('hidden');
  scheduleToastHide(4000);
}

/**
 * Один таймер на тост: новый тост не гасится таймером предыдущего.
 * @param {number|null} ms null — висит, пока не закроют.
 */
let _toastHideTimer = null;
function scheduleToastHide(ms) {
  clearTimeout(_toastHideTimer);
  _toastHideTimer = null;
  const toast = document.getElementById('save-toast');
  if (toast && ms) _toastHideTimer = setTimeout(() => toast.classList.add('hidden'), ms);
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
// Заявки конкурсов: на узком — бейдж «Ещё», на широком «Ещё» нет — тот же
// счётчик на кнопке «Конкурсы» в колонке навигации (04.10.2026).
window.updateMoreBadge = (count) => { _setNavBadge('more', count); _setNavBadge('contests', count); };
// Бейдж "Оплаты" за самоотчёты об оплате (20.08.2026, репорт VASY — клиент
// прислал self-report об оплате, на нижней навигации не было никакого
// сигнала, только внутриэкранный счётчик на вкладке "Заявки клиентов",
// видимый лишь при уже открытом экране). payments.js вызывает эту же
// функцию с уже загруженными данными (тот же приём, что home.js/contests.js).
window.updatePaymentsBadge = (count) => _setNavBadge('payments', count);

let _navBadgesLoaded = false;
async function refreshNavBadges() {
  if (_navBadgesLoaded) return; // Достаточно один раз за открытие приложения — дальше обновляют сами экраны (home.js/more.js) по факту своей загрузки.
  _navBadgesLoaded = true;
  try {
    const questions = await callServer('getQuestionsList');
    _setNavBadge('home', questions.filter((q) => q.status === 'Новый').length);
  } catch (error) { /* бейдж необязателен — не мешать навигации ошибкой фонового запроса */ }
  if (hasModule('gamification')) {
    try {
      const pending = await callServer('getPendingTaskSubmissions');
      window.updateMoreBadge(pending.length);
    } catch (error) { /* см. выше */ }
  }
  try {
    const claims = await callServer('getPendingPaymentClaims');
    _setNavBadge('payments', claims.length);
  } catch (error) { /* см. выше */ }
  try {
    // Р7.2 (31.08.2026) — только critical среди клиентских заказов (не
    // личных), не общее число пунктов — см. JSDoc reminderService.
    // getRemindersSummary за обоснованием.
    const summary = await callServer('getRemindersSummary');
    _setNavBadge('reminders', summary.criticalCount);
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
/**
 * В3 плана SaaS — разделы, которые есть только при включённом модуле канала (тариф «Бот» прячет то,
 * что управляет клиентским приложением). Косметика: граница — на сервере.
 */
const ROUTE_MODULES = {
  'contests': 'gamification',
  'year-summaries': 'dolls_client',
  'wishlist-demand': 'wishlist',
  'catalog/collections': 'dolls_client',
  'catalog/check': 'dolls_reference',
  'bookings': 'channel_booking'
};

/** @returns {boolean} раздел доступен по тарифу канала */
function isRouteAllowedByPlan(path) {
  const module = ROUTE_MODULES[path];
  return !module || hasModule(module);
}

function renderRoute(dictionaries) {
  const routePath = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
  if (!isRouteAllowedByPlan(routePath)) {
    navigateTo(DEFAULT_ROUTE);
    return;
  }
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
  // Обучение, этап 4: «здесь есть урок» — один раз на сценарий (см. _training-ui.js).
  if (window.TrainingUI && window.TrainingUI.offerMoment) window.TrainingUI.offerMoment();

  if (nav) {
    // nav-off прячет панель только на узком экране (app.html): на широком
    // навигация — колонка слева, ничему внизу не мешает и видна всегда.
    nav.classList.toggle('nav-off', !showNav);
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
  // Tailwind (play-сборка) дописывает стили новых классов асинхронно, а часть
  // экранов ставит <main> позже — пересчитываем ширину ещё пару раз.
  syncContentWidth();
  requestAnimationFrame(syncContentWidth);
  setTimeout(syncContentWidth, 300);
  setTimeout(syncContentWidth, 1200);

  if (window.lucide) window.lucide.createIcons();
  window.scrollTo(0, 0);
}

/**
 * Широкий экран (04.10.2026): шапка шелла фиксированная и общая на все
 * экраны, а ширина содержимого у каждого экрана своя (max-width его <main>).
 * Передаём её в CSS-переменную --content-max — app.html выравнивает по ней
 * заголовок и кнопки шапки с краями содержимого. На телефоне не используется.
 */
function syncContentWidth() {
  const main = document.querySelector('#screen-root > main');
  const mw = main ? getComputedStyle(main).maxWidth : 'none';
  document.documentElement.style.setProperty('--content-max', mw && mw !== 'none' ? mw : '100vw');
}
let _syncWidthTimer = null;
if (typeof window.addEventListener === 'function') {
  window.addEventListener('resize', () => {
    clearTimeout(_syncWidthTimer);
    _syncWidthTimer = setTimeout(syncContentWidth, 100);
  });
}

/**
 * Переносит `?deeplink=...` из query-строки в `location.hash` (31.08.2026,
 * задача «Напоминания 2.0», Р2.3) — deep-link кнопки в Telegram-сообщениях
 * (бэкенд, `config.adminDeepLink`) кладут путь именно в query, НЕ в хэш:
 * Telegram сам дописывает свой `tgWebAppData=...` в фрагмент документа при
 * открытии Mini App, и якорёные регексами `matchRoute` (`orders/([^/]+)/edit$`
 * и т.п.) после этого перестают матчить переданный маршрут, молча падая на
 * `home` — та же причина, по которой deep-link из кнопок раньше никогда не
 * работал. Query-строку Telegram не трогает, поэтому путь передаётся так.
 *
 * `history.replaceState`, НЕ `location.replace(url)` — это статический SPA
 * без сервера роутинга: полная навигация браузера перезагрузила бы документ
 * (заново скачала CDN-скрипты, сбросила уже идущий `initAccessCheck`),
 * `replaceState` меняет адресную строку без перезагрузки. Не оставляет шаг
 * в history — "Назад" с открытого по deep-link экрана не возвращает на тот
 * же `?deeplink=...` по кругу.
 *
 * Значение `deeplink` — уже полный `matchRoute`-путь как есть (например
 * "orders/123/edit" или "clients?telegramId=456"), ровно то, что
 * `adminDeepLink` на бэкенде закодировало ЦЕЛИКОМ одним `encodeURIComponent`
 * — здесь достаточно один раз декодировать через `parseQueryString`
 * (внутренние "/", "?", "=" возвращаются буквально, `matchRoute` сам
 * разберёт их как обычный хэш).
 */
function _resolveIncomingDeepLink() {
  const search = window.location.search || '';
  if (search.indexOf('deeplink=') === -1) return;

  const params = parseQueryString(search.replace(/^\?/, ''));
  if (!params.deeplink) return;

  history.replaceState(null, '', window.location.pathname + '#/' + params.deeplink);
}

/**
 * Запускает SPA-шелл админки: initAccessCheck() ОДИН раз за открытие
 * приложения (не на каждый переход между экранами, как было раньше).
 */
function startAdminRouter() {
  _resolveIncomingDeepLink();

  const nav = document.getElementById('bottom-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-key]');
      if (!btn) return;
      navigateTo(btn.dataset.navKey);
    });
  }

  initAccessCheck(function (dictionaries) {
    // Фаза 2 (roles/RBAC, M2.3, 04.09.2026) — кнопка "Персонал" в разметке
    // app.html присутствует всегда (роль неизвестна на этапе статического
    // HTML), прячем её явно для не-admin здесь, СРАЗУ после того, как роль
    // стала известна (window.CURRENT_ACCESS_ROLE — см. common.js
    // initAccessCheck). Косметика — реальный гейт уже на сервере.
    // В3 плана SaaS — кнопки разделов выключенных модулей канала.
    if (!hasModule('gamification')) {
      const contestsBtn = document.querySelector('#bottom-nav [data-nav-key="contests"]');
      if (contestsBtn) contestsBtn.style.display = 'none';
    }
    if (!hasModule('channel_booking')) {
      const bookingsBtn = document.getElementById('bookings-nav-btn');
      if (bookingsBtn) bookingsBtn.style.display = 'none';
    }
    if (!hasModule('dolls_client')) {
      const yearBtn = document.getElementById('year-summaries-nav-btn');
      if (yearBtn) yearBtn.style.display = 'none';
    }
    if (window.CURRENT_ACCESS_ROLE !== 'admin') {
      const staffNavBtn = document.getElementById('staff-nav-btn');
      if (staffNavBtn) staffNavBtn.style.display = 'none';
      const yearNavBtn = document.getElementById('year-summaries-nav-btn');
      if (yearNavBtn) yearNavBtn.style.display = 'none';
    }
    // Волна 6, находка 1 (пачка теста 08.09.2026) — `dictionaries` грузится
    // РОВНО один раз за открытие приложения и этот же объект передаётся во
    // ВСЕ экраны на всё время сессии (см. renderRoute ниже). Открываем на
    // него ссылку глобально, чтобы FormHelpers.wireDictionarySelect
    // (screens/_form-helpers.js) мог писать свежий список категории прямо
    // в этот объект после addDictionaryValue — тогда следующий рендер ЛЮБОГО
    // экрана (не только того, где добавили значение) увидит новое значение
    // без перезагрузки приложения.
    window.APP_DICTIONARIES = dictionaries;
    renderRoute(dictionaries);
    window.addEventListener('hashchange', () => renderRoute(dictionaries));
    // Обучение (04.10.2026): «Помощь» в шапке + продолжение сценария после
    // перезагрузки WebView (состояние — sessionStorage, см. _tour.js).
    if (window.TrainingUI) window.TrainingUI.wireHelpButton();
    if (window.Tour) window.Tour.resume();
    // «Что нового» (этап 2, блок Б) — лист непросмотренного при входе.
    if (window.TrainingUI) window.TrainingUI.checkWhatsNew();
    // Помощник (этап 3) — круглая кнопка внизу справа.
    if (window.Assistant) window.Assistant.start();
  });
}
