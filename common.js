/**
 * common.js — общий слой авторизации и связи с сервером для всех страниц Web App панели.
 * Устраняет дублирование callServer()/initAccessCheck()/debounce() между index.html
 * и orders.html (и будущими экранами). Подключать ПОСЛЕ config.js и telegram-web-app.js,
 * но ДО скрипта конкретной страницы.
 */

const GAS_API_URL = APP_CONFIG.GAS_API_URL;

/**
 * Единая обёртка над fetch() к GAS API. При СЕТЕВОМ сбое (обрыв соединения,
 * не ответ сервера) делает один автоматический повтор — мобильные сети и
 * Telegram WebView иногда обрывают первый запрос. НЕ повторяет вызов, если
 * сервер ответил (в том числе с ошибкой success:false) — это осознанный
 * ответ, а не сбой связи, повторять его нельзя (может задублировать запись).
 */
function callServer(methodName, ...args) {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    const initData = tg ? tg.initData : "";

    const doFetch = () => fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ method: methodName, args: args, initData: initData })
    }).then(response => response.json());

    return doFetch()
        .catch(networkError => doFetch()) // один повтор только при сбое самого fetch
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
