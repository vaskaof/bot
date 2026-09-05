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
/**
 * 18.08.2026 (репорт VASY о новых бета-клиентах, "Доступ не подтверждён: не
 * удалось проверить пользователя") — раньше пустой/отсутствующий initData
 * молча уходил на сервер как "" и там же получал ОБЩУЮ ошибку валидации
 * подписи ("Не удалось проверить пользователя."), неотличимую от настоящего
 * сбоя HMAC-проверки. Разделяем на входе, до сети: `window.Telegram.WebApp`
 * вообще отсутствует — приложение открыто не внутри Telegram (обычный
 * браузер/пересланная ссылка); объект есть, но `initData` пуст — SDK не
 * успел/не смог инициализироваться (то же самое на практике: WebApp не был
 * запущен штатной кнопкой в чате бота). Оба случая — client-side, сеть тут
 * ни при чём, поэтому бросаем сразу, не тратя retry-окно `withRetries` ниже.
 * @returns {{tg: Object|null, initData: string}}
 */
function _getTelegramWebAppContext() {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    return { tg, initData: tg ? tg.initData : "" };
}

const TELEGRAM_CONTEXT_MISSING_MESSAGE =
    "Приложение открыто не через Telegram. Откройте его через кнопку «Кнопка» в чате с ботом, не по прямой ссылке и не в обычном браузере.";

function callServer(methodName, ...args) {
    const { tg, initData } = _getTelegramWebAppContext();
    if (!tg || !initData) {
        return Promise.reject(new Error(TELEGRAM_CONTEXT_MISSING_MESSAGE));
    }

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
 * Показывает экран "не удалось загрузить" — раньше это был сырой monospace-
 * дамп `error.message` без единой возможности восстановиться (20.08.2026,
 * находка исходного UX-аудита: реальный dead-end для клиента при ЛЮБОЙ
 * ошибке инициализации, не только настоящем отказе в доступе). Теперь —
 * дружелюбный текст + кнопка "Обновить страницу"; техническая деталь
 * (`error.message`) не удалена, а свёрнута под "Показать технические
 * детали" — остаётся доступной для диагностики (VASY/разработчик), просто
 * не бьёт по глазам обычного клиента. Требует разметку `#access-denied-
 * screen` с `#access-denied-retry-btn`/`#access-denied-details-toggle`/
 * `#debug-init-data` внутри (см. client/app.html, admin/app.html).
 * @private
 */
function _showAccessDeniedScreen(accessDeniedScreen, error) {
    accessDeniedScreen.classList.remove('hidden');
    accessDeniedScreen.classList.add('flex');
    const debugText = document.getElementById('debug-init-data');
    debugText.textContent = 'Ошибка: ' + error.message;
    console.error('Ошибка проверки доступа:', error);

    const retryBtn = document.getElementById('access-denied-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => location.reload());

    const detailsToggle = document.getElementById('access-denied-details-toggle');
    if (detailsToggle) {
        detailsToggle.addEventListener('click', () => {
            const nowHidden = debugText.classList.toggle('hidden');
            detailsToggle.textContent = nowHidden ? 'Показать технические детали' : 'Скрыть технические детали';
        });
    }
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
            // Фаза 2 (roles/RBAC, 04.09.2026) — роль текущего пользователя
            // (admin/manager), нужна экранам, чтобы скрыть admin-only UI от
            // менеджера (см. более.js/settings.js). Best-effort — сбой ЭТОГО
            // запроса не должен блокировать открытие всей панели целиком;
            // отсутствие window.CURRENT_ACCESS_ROLE трактуется экранами как
            // "не показывать admin-only" (безопасный дефолт, не наоборот).
            try {
                const accessInfo = await callServer('getMyAccessInfo');
                window.CURRENT_ACCESS_ROLE = accessInfo.accessRole;
                window.CURRENT_STAFF_NAME = accessInfo.name;
                // Фаза 2 (roles/RBAC, M2.6, 04.09.2026) — нужен orders.js/
                // clients.js для клиентского фильтра "мои заказы/клиенты".
                window.CURRENT_STAFF_TELEGRAM_ID = accessInfo.telegramId;
            } catch (error) {
                window.CURRENT_ACCESS_ROLE = null;
                window.CURRENT_STAFF_NAME = '';
                window.CURRENT_STAFF_TELEGRAM_ID = '';
            }
            loadingScreen.classList.add('hidden');
            appContent.classList.remove('hidden');
            onSuccess(dictionaries);
        } catch (error) {
            loadingScreen.classList.add('hidden');
            _showAccessDeniedScreen(accessDeniedScreen, error);
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
 * Гвард "тянуть только за кончик ползунка" для `<input type="range">` —
 * вынесено в общий модуль 05.09.2026 (репорт VASY на `cart-new.js`) из
 * `collective-detail.js` (25.08.2026, тот же репорт "пальцем можно случайно
 * нажать на ползунок и он сразу перескочет"). Нативный range в большинстве
 * браузеров и мобильном Telegram WebView перепрыгивает к точке клика при
 * тапе В ЛЮБОМ месте трека, не только за сам "бегунок" — это и есть
 * источник случайных нажатий. Перехватывает `mousedown`/`touchstart` ДО
 * начала перетаскивания и блокирует его (`preventDefault`), если точка
 * касания дальше `THUMB_GRAB_TOLERANCE_PX` от текущего положения бегунка —
 * дальнейшее движение пальца/курсора уже не долетает до слайдера, т.к.
 * сам "drag" так и не начался. `collective-detail.js` оставлен со своей
 * исходной инлайн-копией (стабильный, отдельно протестированный код,
 * трогать не было причины) — эта функция для НОВЫХ мест использования
 * (`lot-new.js`/`cart-new.js`), сама логика идентична.
 * @param {HTMLInputElement} sliderEl `<input type="range">`
 */
function wireSliderThumbGuard(sliderEl) {
    const THUMB_GRAB_TOLERANCE_PX = 14;
    function isNearThumb(clientX) {
        const rect = sliderEl.getBoundingClientRect();
        const min = parseFloat(sliderEl.min);
        const max = parseFloat(sliderEl.max);
        const percent = (parseFloat(sliderEl.value) - min) / (max - min);
        const thumbX = rect.left + percent * rect.width;
        return Math.abs(clientX - thumbX) <= THUMB_GRAB_TOLERANCE_PX;
    }
    function guardSliderGrab(e) {
        const point = e.touches && e.touches[0] ? e.touches[0] : e;
        if (!isNearThumb(point.clientX)) e.preventDefault();
    }
    sliderEl.addEventListener('mousedown', guardSliderGrab);
    sliderEl.addEventListener('touchstart', guardSliderGrab, { passive: false });
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

            // Гейт согласия с политикой конфиденциальности (17.08.2026,
            // project_bot_knopka_privacy_policy) — блокирует доступ к
            // остальному аппу, пока клиент явно не подтвердит. consentGiven
            // приходит с сервера (сравнение версий — см. clientsService.
            // PRIVACY_POLICY_VERSION), кэш контекста (см. выше) тоже
            // обновляется, чтобы гейт не показывался повторно в рамках уже
            // подтверждённой сессии.
            if (!context.consentGiven) {
                _showConsentGate(() => {
                    context.consentGiven = true;
                    _writeCachedClientContext(context);
                    appContent.classList.remove('hidden');
                    onSuccess(context);
                });
                return;
            }

            appContent.classList.remove('hidden');
            onSuccess(context);
        } catch (error) {
            loadingScreen.classList.add('hidden');
            _showAccessDeniedScreen(accessDeniedScreen, error);
        }
    })();
}

/**
 * Полноэкранный гейт согласия с политикой конфиденциальности — создаётся
 * лениво и один раз, тот же приём, что `_ensureHelpModal` ниже (аппендится
 * в document.body, не дублируется в разметке app.html). Чекбокс обязателен,
 * кнопка "Продолжить" неактивна, пока он не отмечен, и на время запроса
 * (fail-safe чек-лист, п.1, frontend-contract.md) — двойной клик не может
 * отправить `recordPrivacyConsent` дважды (метод и так идемпотентен, но
 * незачем гонять лишний запрос).
 * @param {Function} onConfirmed Вызывается после успешного recordPrivacyConsent
 */
let _consentGateEl = null;

function _showConsentGate(onConfirmed) {
    if (!_consentGateEl) {
        const el = document.createElement('div');
        el.id = 'consent-gate-screen';
        el.className = 'fixed inset-0 bg-[#f3f4f9] flex items-center justify-center z-[95] px-4 py-6';
        el.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div class="p-4 border-b border-gray-100">
          <h2 class="text-base font-semibold text-gray-900">🔒 Политика конфиденциальности</h2>
        </div>
        <div class="p-4 overflow-y-auto text-[13px] text-gray-600 leading-relaxed">
          <div id="consent-summary-text"></div>
          <button type="button" id="consent-expand-btn" class="text-indigo-600 text-xs font-medium mb-3">Читать полностью</button>
          <div id="consent-full-text" class="hidden border-t border-gray-100 pt-3"></div>
        </div>
        <div class="p-4 border-t border-gray-100">
          <label class="flex items-start gap-2 mb-3 cursor-pointer">
            <input type="checkbox" id="consent-checkbox" class="mt-0.5">
            <span class="text-[13px] text-gray-700">Я ознакомлен(а) и согласен(на) с политикой конфиденциальности</span>
          </label>
          <div id="consent-error-text" class="text-xs text-red-500 hidden mb-2"></div>
          <button type="button" id="consent-confirm-btn" disabled
            class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            Продолжить
          </button>
        </div>
      </div>
    `;
        document.body.appendChild(el);

        el.querySelector('#consent-summary-text').innerHTML = window.PolicyText.POLICY_SUMMARY_HTML;

        el.querySelector('#consent-expand-btn').addEventListener('click', () => {
            const block = el.querySelector('#consent-full-text');
            const expanding = block.classList.contains('hidden');
            if (expanding) block.innerHTML = window.PolicyText.POLICY_HTML;
            block.classList.toggle('hidden');
            el.querySelector('#consent-expand-btn').textContent = expanding ? 'Свернуть' : 'Читать полностью';
        });

        const checkbox = el.querySelector('#consent-checkbox');
        const confirmBtn = el.querySelector('#consent-confirm-btn');
        checkbox.addEventListener('change', () => { confirmBtn.disabled = !checkbox.checked; });

        _consentGateEl = el;
    }

    _consentGateEl.classList.remove('hidden');
    _consentGateEl.classList.add('flex');

    const confirmBtn = _consentGateEl.querySelector('#consent-confirm-btn');
    const errorText = _consentGateEl.querySelector('#consent-error-text');

    // Обработчик переустанавливается на каждый показ — замыкание должно
    // ссылаться на актуальный onConfirmed этого конкретного вызова (initClientAccess
    // вызывается ровно раз за открытие аппа, но защита от накопления
    // обработчиков не помешает).
    confirmBtn.onclick = async () => {
        if (confirmBtn.disabled) return;
        errorText.classList.add('hidden');
        confirmBtn.disabled = true;
        try {
            await callServer('recordPrivacyConsent');
            _consentGateEl.classList.add('hidden');
            _consentGateEl.classList.remove('flex');
            onConfirmed();
        } catch (error) {
            errorText.textContent = 'Не удалось сохранить согласие: ' + error.message;
            errorText.classList.remove('hidden');
            confirmBtn.disabled = false;
        }
    };
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

/**
 * Инлайновое раскрывающееся пояснение — 19.08.2026, ВЗАМЕН прошлого раунда
 * (единая иконка "?" в шапке трёх экранов, открывающая общий модал). VASY
 * отклонил это решение явно: "информация по совам должна быть там, где про
 * совы встречается запись... не надо делать повсюду в шапке описание".
 * Теперь пояснение живёт РЯДОМ с конкретной строкой-упоминанием (сумма сов
 * на карточке заказа, награда на карточке задания, сама карточка баланса на
 * Профиле) — маленькая ссылка-переключатель, разворачивает готовый HTML
 * прямо под собой, без модалки.
 *
 * `bodyHtml` — уже ГОТОВЫЙ HTML (не текст), вставляется НАПРЯМУЮ, без
 * escapeHtmlClient — в отличие от `helpIcon`, здесь нет отдельного
 * шага "записать в data-атрибут, потом прочитать через getAttribute",
 * поэтому HTML не нужно (и НЕЛЬЗЯ) экранировать заранее. Реальный баг
 * прошлого раунда: `buildSovyHelpBody()` в orders.js/contests.js вызывался
 * ПОСЛЕ первого рендера (числа приходили асинхронно) через
 * `btn.setAttribute('data-help-body', escapeHtmlClient(...))` —
 * `setAttribute` не парсит HTML-сущности так, как это делает браузерный
 * парсер при чтении атрибута из HTML-разметки, поэтому при чтении назад
 * `&lt;p&gt;` не раскодировался обратно в `<p>`, и клиент видел сырые
 * теги текстом. Здесь такого разрыва нет: числа получаются ДО построения
 * карточек (см. вызывающие экраны), bodyHtml собирается и сразу попадает
 * в innerHTML одним куском — экранировать нечего и негде ошибиться.
 * @param {string} label Текст кнопки-переключателя (экранируется — обычный текст)
 * @param {string} bodyHtml Готовый HTML, показывается по клику как есть
 * @returns {string}
 */
function inlineExpand(label, bodyHtml) {
    return `<span class="inline-expand-wrap block">
      <button type="button" class="inline-expand-btn text-[11px] text-indigo-500 underline decoration-dotted underline-offset-2">${escapeHtmlClient(label)}</button>
      <div class="inline-expand-body hidden mt-1.5 p-2.5 rounded-lg bg-indigo-50/70 text-[11px] text-gray-600 leading-relaxed space-y-1.5">${bodyHtml}</div>
    </span>`;
}

/**
 * Подключает клик-обработчики ко всем `.inline-expand-btn` внутри контейнера
 * — вызывать один раз после того, как карточки с inlineExpand() вставлены в
 * DOM (тот же момент, что и `lucide.createIcons()`). `dataset.wired` —
 * защита от повторной подписки при повторных вызовах render()
 * (поиск/сортировка на "Заказы" перестраивает карточки без похода на сервер).
 * `stopPropagation` — карточка заказа целиком кликабельна (открывает
 * детали), клик по переключателю не должен туда провалиться.
 * @param {HTMLElement} container
 */
function wireInlineExpand(container) {
    container.querySelectorAll('.inline-expand-btn').forEach((btn) => {
        if (btn.dataset.wired) return;
        btn.dataset.wired = '1';
        const label = btn.textContent;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const body = btn.nextElementSibling;
            const isHidden = body.classList.toggle('hidden');
            btn.textContent = isHidden ? label : 'Свернуть';
        });
    });
}

/**
 * Полное объяснение системы Сов/Билетов — ЕДИНСТВЕННЫЙ источник текста для
 * ЛЮБОГО inlineExpand про Совы во всём приложении (Профиль/Заказы/Задания).
 *
 * ИЗМЕНЕНО 19.08.2026 (round 7, репорт клиента после round 6 "не
 * понравился"): round 5 правильно решил вопрос РАСПОЛОЖЕНИЯ (пояснение
 * живёт у самой записи о совах, не иконкой "?" в шапке — это остаётся), но
 * заодно завёл ТРИ РАЗНЫХ по полноте текста под одной и той же кнопкой
 * (buildSovyHelpBodyFull на Профиле — полный; buildSovyOrderNote на
 * Заказах и buildSovyTaskNote на Заданиях — обрезанные контекстные версии).
 * VASY явно подтвердил: "с любой страницы должен иметь возможность
 * полностью изучить [механику]" — то есть неполнота содержания, а не
 * расположение, и была причиной "не понравился". buildSovyOrderNote/
 * buildSovyTaskNote УДАЛЕНЫ — все три места (orders.js/contests.js/
 * profile.js) теперь зовут ровно эту функцию с одним и тем же info,
 * никакого расхождения текста больше физически не может завестись.
 * @param {{conversionRateRub:number, sovyPerTicket:number, inviteeReward:number, referrerReward:number}} info
 * @returns {string}
 */
function buildSovyHelpBodyFull(info) {
    return `
      <p><b>Как получить Сов</b><br>
      — Оплата заказа: в среднем ${info.conversionRateRub} ₽ оплаты ≈ ${info.sovyPerTicket} Сов (курс меняется командой — здесь всегда актуальное значение)<br>
      — Приглашение друга по личной ссылке: вам — ${info.referrerReward} Сов, когда друг оплатит свой первый заказ; другу — ${info.inviteeReward} Сов сразу при переходе по ссылке<br>
      — Выполнение заданий: награда указана в самом задании. Для некоторых заданий, если условие выполнения перестаёт быть верным, начисленные Совы могут быть списаны обратно.</p>
      <p><b>Во что превращаются Совы</b><br>
      Каждые ${info.sovyPerTicket} Сов автоматически становятся 1 Билетом (это тоже может меняться) — шкала показывает прогресс до следующего.</p>
      <p><b>На что тратятся Билеты</b><br>
      — Лотереи с ячейками (бейдж «Премиум»): 1 билет = 1 попытка забронировать ячейку. Если её только что занял кто-то другой — билет не списывается<br>
      — Обычные лотереи (без бейджа) — участие бесплатное, кнопкой «Участвовать»</p>
      <p class="text-gray-400">Если заказ, за который начислены Совы, отменяется — начисление тоже отменяется.</p>
    `;
}

/**
 * Общая модалка подтверждения — замена нативного `confirm()` (19.08.2026,
 * P0.8 из аудита интерфейса). Причина: `confirm()`/`alert()`/`prompt()`
 * внутри Telegram WebView — известная зона риска: чужеродный системный
 * диалог, ломающий визуальный язык приложения, непредсказуемое поведение
 * на части клиентов Telegram (особенно iOS). Раньше был единственным
 * механизмом подтверждения НЕОБРАТИМЫХ действий (удаление заказа и т.п.) —
 * там, где цена ошибки выше всего, надёжность UI была ниже всего.
 * Ленивое создание — тот же паттерн, что `_ensureHelpModal`/`_showConsentGate`.
 * @param {string} message Текст вопроса (обычный текст — экранируется через textContent)
 * @param {{confirmLabel?: string, cancelLabel?: string, danger?: boolean}} [opts]
 *   `danger` — красная кнопка подтверждения (необратимые/деструктивные действия)
 * @returns {Promise<boolean>} true — подтверждено, false — отменено (в т.ч. клик мимо)
 */
let _confirmModalEl = null;

function showConfirmModal(message, opts) {
    opts = opts || {};
    const confirmLabel = opts.confirmLabel || 'Подтвердить';
    const cancelLabel = opts.cancelLabel || 'Отмена';
    const danger = !!opts.danger;

    return new Promise((resolve) => {
        if (!_confirmModalEl) {
            const el = document.createElement('div');
            el.id = 'shared-confirm-modal';
            el.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-[95] px-4';
            el.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="p-4">
            <div id="shared-confirm-text" class="text-sm text-gray-700 whitespace-pre-wrap"></div>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button type="button" id="shared-confirm-cancel-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"></button>
            <button type="button" id="shared-confirm-ok-btn" class="flex-1 py-2.5 rounded-xl text-white text-sm font-medium"></button>
          </div>
        </div>
      `;
            document.body.appendChild(el);
            _confirmModalEl = el;
        }

        const modal = _confirmModalEl;
        const textEl = modal.querySelector('#shared-confirm-text');
        const okBtn = modal.querySelector('#shared-confirm-ok-btn');
        const cancelBtn = modal.querySelector('#shared-confirm-cancel-btn');

        textEl.textContent = message;
        okBtn.textContent = confirmLabel;
        cancelBtn.textContent = cancelLabel;
        okBtn.className = `flex-1 py-2.5 rounded-xl text-white text-sm font-medium ${danger ? 'bg-red-600' : 'bg-indigo-600'}`;

        // onclick (не addEventListener) — переприсваивается на каждый вызов,
        // модалка одна на весь экран, накопления обработчиков не бывает.
        function cleanup(result) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(result);
        }
        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    });
}

/**
 * Общая модалка текстового/числового ввода — замена нативного `prompt()`
 * (19.08.2026, P0.8 аудита, тот же повод, что showConfirmModal выше).
 * Отмена/клик мимо/крестик — резолвится `null` (тот же контракт, что у
 * `prompt()`: пустая строка ≠ отмена, это осознанный ввод пустого текста,
 * различие важно для мест вроде "причина отклонения (необязательно)").
 * @param {string} message Текст-вопрос над полем ввода
 * @param {{defaultValue?: string, inputType?: 'text'|'number', placeholder?: string, confirmLabel?: string, cancelLabel?: string}} [opts]
 * @returns {Promise<string|null>}
 */
let _promptModalEl = null;

function showPromptModal(message, opts) {
    opts = opts || {};
    const defaultValue = opts.defaultValue !== undefined ? opts.defaultValue : '';
    const inputType = opts.inputType || 'text';
    const confirmLabel = opts.confirmLabel || 'ОК';
    const cancelLabel = opts.cancelLabel || 'Отмена';

    return new Promise((resolve) => {
        if (!_promptModalEl) {
            const el = document.createElement('div');
            el.id = 'shared-prompt-modal';
            el.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-[95] px-4';
            el.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="p-4">
            <label id="shared-prompt-text" class="text-sm text-gray-700 block mb-2"></label>
            <input type="text" id="shared-prompt-input"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button type="button" id="shared-prompt-cancel-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"></button>
            <button type="button" id="shared-prompt-ok-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium"></button>
          </div>
        </div>
      `;
            document.body.appendChild(el);
            _promptModalEl = el;
        }

        const modal = _promptModalEl;
        const textEl = modal.querySelector('#shared-prompt-text');
        const input = modal.querySelector('#shared-prompt-input');
        const okBtn = modal.querySelector('#shared-prompt-ok-btn');
        const cancelBtn = modal.querySelector('#shared-prompt-cancel-btn');

        textEl.textContent = message;
        input.type = inputType;
        input.value = defaultValue;
        input.placeholder = opts.placeholder || '';
        okBtn.textContent = confirmLabel;
        cancelBtn.textContent = cancelLabel;

        function cleanup(result) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            input.onkeydown = null;
            resolve(result);
        }
        okBtn.onclick = () => cleanup(input.value);
        cancelBtn.onclick = () => cleanup(null);
        modal.onclick = (e) => { if (e.target === modal) cleanup(null); };
        input.onkeydown = (e) => { if (e.key === 'Enter') cleanup(input.value); };

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        // Фокус + выделение — та же удобная деталь, что у нативного prompt()
        // (можно сразу печатать новое значение поверх старого).
        setTimeout(() => { input.focus(); input.select(); }, 0);
    });
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
