/**
 * common.js — общий слой авторизации и связи с сервером для всех страниц Web App панели.
 * Устраняет дублирование callServer()/initAccessCheck()/debounce() между index.html
 * и orders.html (и будущими экранами). Подключать ПОСЛЕ config.js и telegram-web-app.js,
 * но ДО скрипта конкретной страницы.
 */

const GAS_API_URL = APP_CONFIG.GAS_API_URL;

/**
 * Единая обёртка над fetch() к GAS API — заменяет google.script.run,
 * так как фронтенд хостится отдельно (GitHub Pages), не внутри GAS.
 * Автоматически прикладывает initData к каждому запросу — сервер
 * проверяет подпись и роль централизованно на каждый вызов.
 */
function callServer(methodName, ...args) {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    const initData = tg ? tg.initData : "";

    return fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ method: methodName, args: args, initData: initData })
    })
        .then(response => response.json())
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