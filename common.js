/**
 * common.js — общий слой авторизации и связи с сервером для всех страниц Web App панели.
 * Устраняет дублирование callServer()/initAccessCheck()/debounce() между index.html
 * и orders.html (и будущими экранами). Подключать ПОСЛЕ config.js и telegram-web-app.js,
 * но ДО скрипта конкретной страницы.
 */

const GAS_API_URL = APP_CONFIG.GAS_API_URL;

/**
 * Единая обёртка над fetch() к GAS API. При СЕТЕВОМ сбое (обрыв соединения,
 * не ответ сервера) делает автоматические повторы с небольшой паузой.
 * Два независимых источника такого сбоя, оба клиентские, не серверные:
 * 1) Web App от GAS отвечает через редирект на script.googleusercontent.com,
 *    и если этот второй "прыжок" в моменте не проходит (мобильная сеть,
 *    Telegram WebView), fetch() бросает "Failed to fetch" (найдено и
 *    исправлено 03.08.2026 по репорту VASY "иногда долго грузит/ошибка").
 * 2) Node-сервер за api.dreamdool.ru перезапускается через /internal/restart
 *    после каждого деплоя бэкенда (~5-10 сек простоя, пока watchdog поднимает
 *    процесс заново, см. server/src/app.js) — открытие панели ровно в это
 *    окно раньше выглядело как "не проходит проверку доступа", хотя сама
 *    проверка initData ни при чём (найдено 11.08.2026 по репорту VASY "с
 *    телефона не проходит проверку" — на десктопе просто не попал в окно
 *    рестарта). Старого окна ретраев (3 попытки/1.1 сек) хватало против (1),
 *    но не хватало пережить (2) — увеличено до 5 попыток/~10 сек.
 * В обоих случаях сам бэкенд отрабатывает штатно — это разовая заминка на
 * клиенте. НЕ повторяет вызов, если сервер ответил (в том числе с ошибкой
 * success:false) — это осознанный ответ, а не сбой связи, повторять его
 * нельзя (может задублировать запись).
 */
function callServer(methodName, ...args) {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    const initData = tg ? tg.initData : "";

    const doFetch = () => fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ method: methodName, args: args, initData: initData })
    }).then(response => response.json());

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function withRetries() {
        const delaysMs = [0, 500, 1500, 3000, 5000]; // 1-я попытка сразу, потом 4 повтора с растущей паузой (~10 сек)
        let lastError;
        for (const delay of delaysMs) {
            if (delay > 0) await sleep(delay);
            try {
                return await doFetch();
            } catch (networkError) {
                lastError = networkError;
            }
        }
        throw lastError;
    }

    return withRetries()
        .then(response => {
            if (response.success) return response.data;
            throw new Error(response.error);
        });
}

/**
 * Проверяет доступ (сервер отклонит, если initData не прошёл проверку) и одним
 * вызовом получает справочники. Страница передаёт свой колбэк инициализации,
 * получающий dictionaries. Требует на странице элементы #loading-screen,
 * #access-denied-screen, #app-content, #debug-init-data (разметка как в index.html).
 * @param {Function} onSuccess Колбэк инициализации конкретной страницы
 */
function initAccessCheck(onSuccess) {
    const loadingScreen = document.getElementById('loading-screen');
    const accessDeniedScreen = document.getElementById('access-denied-screen');
    const appContent = document.getElementById('app-content');

    (async function () {
        try {
            const dictionaries = await callServer('getDictionaries');
            loadingScreen.classList.add('hidden');
            appContent.classList.remove('hidden');
            onSuccess(dictionaries);
        } catch (error) {
            loadingScreen.classList.add('hidden');
            accessDeniedScreen.classList.remove('hidden');
            accessDeniedScreen.classList.add('flex');
            document.getElementById('debug-init-data').textContent = 'Ошибка: ' + error.message;
            console.error('Ошибка проверки доступа:', error);
        }
    })();
}

/**
 * Утилита Debounce — используется живым поиском на нескольких страницах.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Экранирует HTML-теги для безопасного вывода пользовательских данных.
 * @param {string} unsafe Строка с потенциально опасными символами
 * @returns {string} Безопасная строка
 */
function escapeHtmlClient(unsafe) {
    if (unsafe === undefined || unsafe === null) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Клиентский порт `server/src/orders/deliveryLadder.js`'s STATUS_TO_POSITION
 * (13.08.2026) — нужен ТОЛЬКО там, где лестницу нужно показать ДО того, как
 * заказ вообще сохранён (order-new.js — ещё нет `orderId`, сервер посчитать
 * не может) или ЖИВО при смене select'а (order-edit.js — VASY-репорт:
 * лестница раньше не менялась до сохранения, только на снимке при загрузке).
 * Тот же приём, что уже есть у `guessPurchaseChannel` (клиентский порт
 * справочника ради живого UI без похода на сервер). Единая точка правды по
 * СОДЕРЖАНИЮ таблицы всё равно server-side — если она когда-нибудь изменится,
 * эту копию тоже нужно поправить (маленький, редко меняющийся спpavочник,
 * не стоит городить отдельный API-метод ради него).
 * @param {string} statusDelivery
 * @returns {{position:number,total:number}|null}
 */
function computeDeliveryLadderPosition(statusDelivery) {
    const DELIVERY_POSITIONS = [
        { position: 1, statuses: ["Ожидает выкупа"] },
        { position: 2, statuses: ["Ожидает отправки с магазина"] },
        { position: 3, statuses: ["Магазин отправил на склад в США"] },
        { position: 4, statuses: ["На складе в США (карго)"] },
        { position: 5, statuses: ["В пути США→КЗ (карго)"] },
        { position: 6, statuses: ["На складе КЗ (карго)"] },
        { position: 7, statuses: ["Курьер со склада до посредника в КЗ", "Локер в КЗ (карго)"] },
        { position: 8, statuses: ["У посредника в КЗ"] },
        { position: 9, statuses: ["В пути КЗ→РФ (СДЭК)", "В пути КЗ→РФ (личная)"] },
        { position: 10, statuses: ["У посредника в РФ"] },
        { position: 11, statuses: ["В пути по РФ до клиента"] },
        { position: 12, statuses: ["Получено клиентом"] }
    ];
    for (const { position, statuses } of DELIVERY_POSITIONS) {
        if (statuses.includes(statusDelivery)) return { position, total: DELIVERY_POSITIONS.length };
    }
    return null;
}

/**
 * Визуальная лестница статусов доставки (§H client_display_overhaul,
 * 12.08.2026) — общий рендер для admin/client, список/детали. Позиция
 * приходит с сервера (`deliveryLadder: {position,total}|null`,
 * `server/src/orders/deliveryLadder.js` — единая точка правды, здесь ничего
 * не пересчитывается). `ladder === null` — статус вне лестницы ("возврат
 * средств" или нераспознанный) — рисуется отдельной строкой, не баром.
 * @param {{position:number,total:number}|null} ladder
 * @param {string} statusText Текст статуса для подписи/off-track строки
 * @param {{compact?: boolean}} [opts] compact — тонкий бар без подписи (списки)
 * @returns {string} HTML
 */
function buildDeliveryLadder(ladder, statusText, opts) {
    opts = opts || {};
    const compact = !!opts.compact;

    if (!ladder) {
        if (!statusText) return '';
        return `<div class="${compact ? 'text-[10px]' : 'text-[11px]'} text-red-500 font-medium">${escapeHtmlClient(statusText)}</div>`;
    }

    const segments = [];
    for (let i = 1; i <= ladder.total; i++) {
        const filled = i <= ladder.position;
        segments.push(`<div class="flex-1 ${compact ? 'h-1' : 'h-1.5'} rounded-full ${filled ? 'bg-indigo-500' : 'bg-gray-200'}"></div>`);
    }
    const bar = `<div class="flex gap-0.5">${segments.join('')}</div>`;

    if (compact) return bar;

    return `
        <div>
            ${bar}
            <div class="text-[11px] text-gray-500 mt-1">Шаг ${ladder.position} из ${ladder.total} · ${escapeHtmlClient(statusText)}</div>
        </div>
    `;
}

/**
 * Единый паттерн пустого состояния (UX-аудит, Шаг 7, 16.08.2026) — иконка +
 * текст + опциональная CTA-кнопка. До этой правки каждый список ("Мои
 * заказы"/"Вишлист"/"Мои вопросы"/"Новости"/лотереи/задания) рисовал пустое
 * состояние точечно (одинаковый CSS-класс на div, но без иконки, без единого
 * подхода к CTA) — не баг, но заметная разница между экранами при обходе
 * приложения подряд. Возвращает HTML; если передан `cta`, кнопка получает
 * `id=cta.btnId` — вызывающий экран сам вешает свой обработчик клика ПОСЛЕ
 * вставки в DOM (тот же принцип, что и остальные built-разметку хелперы
 * этого файла — верстка отдельно, обработчики отдельно).
 * @param {string} icon Имя lucide-иконки (например 'package', 'heart')
 * @param {string} text Основной текст
 * @param {{label:string, btnId:string}} [cta] Необязательная кнопка-действие
 * @returns {string} HTML
 */
function buildEmptyState(icon, text, cta) {
    return `
        <div class="text-center py-10">
            <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center text-gray-300">
                <i data-lucide="${escapeHtmlClient(icon)}" class="w-7 h-7"></i>
            </div>
            <div class="text-sm text-gray-400">${text}</div>
            ${cta ? `<button type="button" id="${escapeHtmlClient(cta.btnId)}" class="mt-3 text-sm text-indigo-600 font-medium">${escapeHtmlClient(cta.label)}</button>` : ''}
        </div>
    `;
}

/**
 * Запрашивает контекст текущего пользователя (роль + личные данные).
 * Единственный метод API, доступный ДО определения роли — используется
 * точкой входа (app.html) для маршрутизации и клиентскими страницами
 * для проверки доступа.
 * @returns {Promise<{role: string, telegramId?: string, name?: string, username?: string}>}
 */
function fetchUserContext() {
    return callServer('getUserContext');
}

/**
 * Кэш контекста клиента внутри одной сессии браузера/WebView (sessionStorage,
 * не переживает закрытие Mini App). Устраняет повторный getUserContext на
 * КАЖДОМ переходе между client/*.html — каждый такой вызов на бэкенде дёргает
 * registerUser() (полный скан Bot_Data) и upsertClientByTelegramId() (захват
 * общего LockService.getScriptLock() + скан Индекс_Клиентов), даже когда
 * писать нечего. TTL 15 минут — компромисс: заказ, привязанный менеджером по
 * username ПОКА клиентская сессия уже открыта, попадёт в индекс с задержкой
 * до TTL вместо немедленной привязки (тот же класс задержки, что и сейчас
 * между двумя открытиями приложения, просто с явной верхней границей).
 * Полноценное решение — вызывать getUserContext один раз за открытие
 * приложения на уровне SPA-каркаса (Phase 2), это временная мера до него.
 */
const CLIENT_CONTEXT_CACHE_KEY = 'clientContextCache';
const CLIENT_CONTEXT_CACHE_TTL_MS = 15 * 60 * 1000;

function _readCachedClientContext() {
    try {
        const raw = sessionStorage.getItem(CLIENT_CONTEXT_CACHE_KEY);
        if (!raw) return null;
        const { context, ts } = JSON.parse(raw);
        if (!context || typeof ts !== 'number') return null;
        if (Date.now() - ts > CLIENT_CONTEXT_CACHE_TTL_MS) return null;
        return context;
    } catch (error) {
        return null; // повреждённая запись — не блокируем доступ, просто перезапросим
    }
}

function _writeCachedClientContext(context) {
    try {
        sessionStorage.setItem(CLIENT_CONTEXT_CACHE_KEY, JSON.stringify({ context, ts: Date.now() }));
    } catch (error) {
        // sessionStorage недоступен/переполнен — не критично, просто не кэшируем
    }
}

/**
 * Черновики "заказ ещё не подтверждён сервером" (15.08.2026, баг "заказы
 * могут не сохраняться при зависании Telegram") — localStorage, не
 * sessionStorage: должен пережить не только смену экрана, но и полную
 * перезагрузку/убийство Telegram WebView ОС (см. диагноз в
 * project_bot_knopka_financial_settings_ui.md/анализ бага). Общие функции —
 * переиспользуются order-new.js сейчас, задел на updateOrder/saveBulkOrders
 * позже (тот же класс риска, отдельно не чинится этим раундом).
 *
 * Формат хранимого значения — {payload, savedAt} — payload это ПОЛНЫЙ
 * orderData (включая requestId, см. generateRequestId), готовый к повторной
 * отправке как есть, без пересборки из DOM (форма могла уже не существовать
 * к моменту восстановления).
 */
function saveOrderDraft(draftKey, payload) {
    try {
        localStorage.setItem(draftKey, JSON.stringify({ payload, savedAt: Date.now() }));
    } catch (error) {
        // localStorage недоступен/переполнен — черновик просто не переживёт
        // сбой, не хуже прежнего поведения (без черновиков вообще).
    }
}

function loadOrderDraft(draftKey) {
    try {
        const raw = localStorage.getItem(draftKey);
        if (!raw) return null;
        const { payload, savedAt } = JSON.parse(raw);
        if (!payload || typeof savedAt !== 'number') return null;
        return { payload, savedAt };
    } catch (error) {
        return null; // повреждённая запись — не блокируем экран, ведём себя как "черновика нет"
    }
}

function clearOrderDraft(draftKey) {
    try {
        localStorage.removeItem(draftKey);
    } catch (error) {
        // недоступен — уже некритично, черновик и так не мог быть сохранён
    }
}

/**
 * Проверка доступа для клиентских страниц — аналог initAccessCheck() из
 * админки, но вместо getDictionaries использует getUserContext (единственный
 * метод, не требующий вхождения в CLIENT_ALLOWED_METHODS). Если роль не
 * 'client' — показывает экран отказа тем же паттерном, что и в админке.
 * Требует на странице те же элементы: #loading-screen, #access-denied-screen,
 * #app-content, #debug-init-data.
 * @param {Function} onSuccess Колбэк(context), context = {role, telegramId, name, username}
 */
function initClientAccess(onSuccess) {
    const loadingScreen = document.getElementById('loading-screen');
    const accessDeniedScreen = document.getElementById('access-denied-screen');
    const appContent = document.getElementById('app-content');

    (async function () {
        try {
            const cached = _readCachedClientContext();
            const context = cached || await fetchUserContext();
            if (context.role !== 'client') {
                throw new Error('Доступ только для клиентов.');
            }
            if (!cached) _writeCachedClientContext(context);
            loadingScreen.classList.add('hidden');
            appContent.classList.remove('hidden');
            onSuccess(context);
        } catch (error) {
            loadingScreen.classList.add('hidden');
            accessDeniedScreen.classList.remove('hidden');
            accessDeniedScreen.classList.add('flex');
            document.getElementById('debug-init-data').textContent = 'Ошибка: ' + error.message;
            console.error('Ошибка проверки клиентского доступа:', error);
        }
    })();
}

/**
 * Генерирует client-side ID запроса — защита от дублирования записи при
 * повторной отправке (обрыв связи + автоповтор в callServer, двойной клик).
 * crypto.randomUUID может отсутствовать в старых WebView Telegram — фолбэк.
 */
function generateRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Общая подсказка "?" (05.08.2026, по итогам аудита юзерфрендли фронтенда) —
 * для мест, где короткой строки под полем недостаточно (правила Сов/Билетов,
 * механика лотерей Тип1/Тип2, розыгрыш призов и т.п.). Модалка создаётся ОДИН
 * раз лениво и переиспользуется на весь шелл (аппендится в document.body, а
 * не дублируется в разметке каждого экрана — иначе тот же долг, что уже есть
 * с дублированием <nav>, см. frontend-nav.md). Значок — lucide "help-circle",
 * тот же, что уже используется на вкладке "Вопросы" нижней навигации, чтобы
 * не вводить новый визуальный язык (запрос VASY 05.08.2026 — не выделяться
 * стилем среди других кнопок).
 *
 * Контент кладётся прямо в data-атрибуты кнопки (экранированный
 * escapeHtmlClient), без отдельного реестра в памяти — браузер сам
 * раскодирует HTML-сущности при чтении getAttribute, тот же принцип
 * экранирования, что и везде в проекте.
 */
let _helpModalEl = null;

function _ensureHelpModal() {
    if (_helpModalEl) return _helpModalEl;
    const el = document.createElement('div');
    el.id = 'shared-help-modal';
    el.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-[90] px-4';
    el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 id="shared-help-title" class="text-base font-semibold text-gray-900"></h2>
        <button type="button" id="shared-help-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <div id="shared-help-body" class="p-4 text-[13px] text-gray-600 leading-relaxed space-y-2"></div>
    </div>
  `;
    document.body.appendChild(el);
    el.querySelector('#shared-help-close').addEventListener('click', closeHelpModal);
    el.addEventListener('click', (e) => { if (e.target === el) closeHelpModal(); });
    if (window.lucide) window.lucide.createIcons();
    _helpModalEl = el;
    return el;
}

function closeHelpModal() {
    if (!_helpModalEl) return;
    _helpModalEl.classList.add('hidden');
    _helpModalEl.classList.remove('flex');
}

function showHelpModal(title, bodyHtml) {
    const modal = _ensureHelpModal();
    modal.querySelector('#shared-help-title').textContent = title;
    modal.querySelector('#shared-help-body').innerHTML = bodyHtml;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * HTML маленькой кнопки "?" — вставлять прямо в template-строку разметки
 * экрана рядом с обычными innerHTML-собранными блоками (renderRoute() уже
 * вызывает lucide.createIcons() после render(), отдельно вызывать не нужно).
 * {header:true} — вариант для #header-actions: p-2/rounded-full/hover:bg-white/50,
 * визуально как соседние кнопки-иконки (refresh/plus), не выделяется стилем.
 * По умолчанию — маленький инлайн-значок для подписи/лейбла внутри блока.
 * @param {string} title Заголовок модалки
 * @param {string} bodyHtml HTML-содержимое (можно несколько <p>/<ul>)
 * @param {{header?: boolean}} [opts]
 * @returns {string}
 */
function helpIcon(title, bodyHtml, opts) {
    const isHeader = opts && opts.header;
    const cls = isHeader
        ? 'help-icon-btn p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors'
        : 'help-icon-btn inline-flex items-center justify-center align-middle text-gray-300 hover:text-indigo-500 transition-colors';
    const iconSize = isHeader ? 'w-5 h-5' : 'w-3.5 h-3.5';
    return `<button type="button" class="${cls}" data-help-title="${escapeHtmlClient(title)}" data-help-body="${escapeHtmlClient(bodyHtml)}"><i data-lucide="help-circle" class="${iconSize}"></i></button>`;
}

// Один делегированный обработчик на document — не требует перепривязки при
// повторных renderRoute() (тот же принцип, что уже применён к нижней
// навигации в router.js). Гвард на typeof — common.js подключается и в
// тестовом vm-харнессе (tests/mocks/browser-mocks.js), где document —
// минимальный мок без addEventListener; там showHelpModal/helpIcon не
// тестируются, но модуль обязан загружаться без ошибок на верхнем уровне.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.help-icon-btn');
        if (!btn) return;
        showHelpModal(btn.getAttribute('data-help-title') || '', btn.getAttribute('data-help-body') || '');
    });
}
