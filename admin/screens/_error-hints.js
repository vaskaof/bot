'use strict';

/**
 * Подсказки при ошибках (обучение менеджеров, этап 2, 04.10.2026, решения VASY).
 *
 * Все красные тосты админки идут сюда (router.js → showSaveToast(false, …)):
 * - известная ошибка — человеческое «почему и что делать» (справочник HINTS);
 * - техническая (английский текст, «NULL в столбце», «Внутренняя ошибка») —
 *   «сбой на сервере, это не ваша ошибка», исходный текст под «Подробнее»;
 * - тост с подсказкой не гаснет сам — его закрывают;
 * - на каждой ошибке «Сообщить» — TrainingUI.openProblem: код сам прикладывает
 *   экран, метод, текст ошибки, открытый заказ, сервер — последние действия;
 * - та же ошибка второй раз за 10 минут — «показать по шагам?», если для
 *   экрана есть сценарий;
 * - ошибку проверки формы (до сервера не дошла) тихо пишем на сервер
 *   (reportUiError): иначе не видно, где менеджеры спотыкаются. Ошибки
 *   ответов сервера не пишем — они уже в analytics_events.
 *
 * Новая частая ошибка — строка в HINTS. Подсказки пишем только там, где есть
 * что посоветовать: «Укажите клиента» понятна и без неё.
 */
(function () {
  const REPEAT_WINDOW_MS = 10 * 60 * 1000;
  const FORM_REPORTS_PER_SESSION = 30;
  const AUTO_HIDE_MS = 8000;
  const LINK_METHOD_RE = /link|resolve|parse|checkout/i;

  /**
   * match(text, method) — первое совпадение побеждает, порядок важен.
   * text — свой заголовок вместо исходного текста (тогда исходный — под «Подробнее»).
   */
  const HINTS = [
    {
      id: 'network', match: (t) => /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(t),
      text: 'Нет связи с сервером.',
      hint: 'Проверьте интернет (или переключите VPN) и повторите. Если сохраняли — сначала проверьте, не сохранилось ли, потом жмите ещё раз.'
    },
    {
      id: 'link-timeout', match: (t, m) => /aborted due to timeout|timed? ?out|ETIMEDOUT/i.test(t) && LINK_METHOD_RE.test(m || t),
      text: 'Сайт магазина долго не отвечает — это не ваша ошибка.',
      hint: 'Попробуйте ещё раз через минуту. Не выходит — найдите позицию поиском по каталогу или вставьте скриншот оформления в «Новой корзине».'
    },
    {
      id: 'timeout', match: (t) => /aborted due to timeout|timed? ?out|ETIMEDOUT/i.test(t),
      text: 'Сервер долго не отвечает — это не ваша ошибка.',
      hint: 'Подождите минуту и повторите. Если сохраняли — сначала проверьте, не сохранилось ли.'
    },
    {
      id: 'link-unrecognized', match: (t) => /Не удалось распознать товар по ссылке|Ссылка недоступна/i.test(t),
      hint: 'Ссылку не удалось разобрать автоматически — с некоторыми магазинами так бывает. Найдите позицию поиском по каталогу (хватит части названия) или создайте новую.'
    },
    {
      id: 'link-invalid', match: (t) => /Введите корректную ссылку/i.test(t),
      hint: 'Скопируйте ссылку целиком из адресной строки магазина — она начинается с https://'
    },
    {
      id: 'sku-duplicate', match: (t) => /уже есть в каталоге/i.test(t),
      hint: 'Вторую такую же позицию создавать не нужно — найдите существующую поиском в каталоге (хватит части названия) и выберите её.',
      action: { label: 'Открыть каталог', route: 'catalog' }
    },
    {
      id: 'access-denied', match: (t) => /Доступ запрещён|Access denied/i.test(t),
      hint: 'Этот раздел доступен только VASY. Если он нужен вам для работы — нажмите «Сообщить» и напишите зачем.'
    },
    {
      id: 'no-client-telegram', match: (t) => /не привязан Telegram клиента/i.test(t),
      hint: 'Клиент в заказе вписан без Telegram. Откройте заказ, выберите клиента поиском по @нику — после этого оплату можно записать.'
    },
    {
      id: 'image-too-big', match: (t) => /слишком больш(ое|ая)/i.test(t),
      hint: 'Сделайте скриншот вместо фото или обрежьте картинку — файл станет меньше.'
    },
    {
      id: 'quota', match: (t) => /Quota exceeded|rate limit|Too Many Requests/i.test(t),
      text: 'Сервис временно перегружен — это не ваша ошибка.',
      hint: 'Подождите минуту и повторите.'
    },
    {
      id: 'not-found', match: (t) => /не найден[аоы]?(\.|$|\s)|уже решена|больше не предлагается|обновите экран/i.test(t),
      hint: 'Похоже, это уже удалили, объединили или изменили с другого телефона. Вернитесь назад и откройте заново.'
    },
    {
      id: 'server-crash',
      match: (t) => /Внутренняя ошибка сервера|нарушает ограничение|violates|NOT NULL|syntax error|Cannot read propert|is not defined|is not a function|\bundefined\b|null value/i.test(t),
      text: 'Сбой на сервере — это не ваша ошибка.',
      hint: 'Данные не сохранены. Попробуйте ещё раз; если повторится — нажмите «Сообщить», починим.'
    }
  ];

  // Без кириллицы, но с латиницей — технический текст, которого не узнали.
  const UNKNOWN_TECHNICAL = {
    id: 'technical', text: 'Что-то пошло не так — это не ваша ошибка.',
    hint: 'Попробуйте ещё раз; если повторится — нажмите «Сообщить», починим.'
  };

  /**
   * @param {string} message Текст ошибки, как его передали в тост.
   * @param {string} [method] Метод сервера, если ошибка — его ответ.
   * @returns {{id:string|null, text:string, hint:string, action:Object|null, technical:boolean, raw:string}}
   */
  function describe(message, method) {
    const raw = String(message == null ? '' : message).trim();
    let found = HINTS.find((h) => h.match(raw, method || '')) || null;
    if (!found && raw && !/[а-яё]/i.test(raw) && /[a-z]/i.test(raw)) found = UNKNOWN_TECHNICAL;
    if (!found) return { id: null, text: raw, hint: '', action: null, technical: false, raw };
    return {
      id: found.id, text: found.text || raw, hint: found.hint || '', action: found.action || null,
      technical: !!found.text, raw
    };
  }

  function screenTitle() {
    const h1 = document.querySelector('#header-left h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return typeof matchRoute === 'function' ? matchRoute(window.location.hash).screen : '';
  }

  function currentScreen() {
    return typeof matchRoute === 'function' ? matchRoute(window.location.hash).screen : '';
  }

  // Повтор: тот же текст (без чисел — суммы/коды разные) за последние 10 минут.
  const seenAt = new Map();
  function noteRepeat(raw) {
    const key = raw.replace(/\d+/g, '#').toLowerCase();
    const now = Date.now();
    const prev = seenAt.get(key);
    seenAt.set(key, now);
    return !!(prev && now - prev < REPEAT_WINDOW_MS);
  }

  const formReported = new Map();
  let formReportsSent = 0;
  function reportFormError(raw) {
    if (!raw || typeof callServer !== 'function' || formReportsSent >= FORM_REPORTS_PER_SESSION) return;
    const screen = screenTitle();
    const key = `${screen}|${raw}`;
    const prev = formReported.get(key);
    if (prev && Date.now() - prev < REPEAT_WINDOW_MS) return;
    formReported.set(key, Date.now());
    formReportsSent += 1;
    callServer('reportUiError', { screen, message: raw }).catch(() => {});
  }

  /** Сценарий обучения про текущий экран (для «показать по шагам?»). */
  function scenarioForScreen() {
    const screen = currentScreen();
    return Object.values(window.TourScenarios || {}).find((s) => (s.screens || []).includes(screen)) || null;
  }

  function show(message) {
    const toast = document.getElementById('save-toast');
    const inner = document.getElementById('save-toast-inner');
    if (!toast || !inner) return;
    const raw = String(message == null ? '' : message);
    const last = window.__lastServerError;
    // Ответ сервера — только если его текст и есть текст тоста: соседний
    // фоновый сбой (курсы валют и т.п.) не должен прятать ошибку формы.
    const fromServer = !!(last && last.message && Date.now() - last.at < 5000 && raw.includes(last.message));
    const method = fromServer ? last.method : '';
    const d = describe(raw, method);
    const repeat = noteRepeat(raw);
    if (!fromServer) reportFormError(raw);
    const scenario = repeat && window.Tour && !Tour.isActive() ? scenarioForScreen() : null;

    const btn = (attr, label, cls) => `<button type="button" ${attr} class="px-2.5 py-1 rounded-lg text-[12px] font-medium ${cls}">${escapeHtmlClient(label)}</button>`;
    inner.className = 'rounded-xl px-3 py-2.5 text-sm shadow-md bg-red-50 text-red-700 border border-red-200 text-left';
    inner.innerHTML = `
      <div class="flex items-start gap-2" data-error-hint="${escapeHtmlClient(d.id || '')}">
        <div class="min-w-0 flex-1">
          <div class="font-medium break-words">${escapeHtmlClient(d.text)}</div>
          ${d.hint ? `<div class="text-[12px] text-red-900/80 mt-1">${escapeHtmlClient(d.hint)}</div>` : ''}
          ${scenario ? `<div class="text-[12px] text-red-900/80 mt-1">Похоже, тут что-то непонятно — показать по шагам «${escapeHtmlClient(scenario.title)}»?</div>` : ''}
          ${d.technical ? `<details class="mt-1 text-[11px] text-red-900/70"><summary class="cursor-pointer">Подробнее</summary><div class="break-words mt-0.5">${escapeHtmlClient(d.raw)}</div></details>` : ''}
          <div class="flex flex-wrap gap-1.5 mt-2">
            ${d.action ? btn('data-hint-action', d.action.label, 'bg-white border border-red-200 text-red-700') : ''}
            ${scenario ? btn('data-hint-scenario', 'Показать по шагам', 'bg-indigo-600 text-white') : ''}
            ${window.Assistant ? btn('data-hint-assistant', '🤖 Спросить', 'bg-white border border-red-200 text-red-700') : ''}
            ${btn('data-hint-report', '🆘 Сообщить', 'bg-white border border-red-200 text-red-700')}
          </div>
        </div>
        <button type="button" data-hint-close title="Закрыть" class="shrink-0 -mr-1 -mt-0.5 px-1 text-red-400 text-lg leading-none">×</button>
      </div>`;
    toast.classList.remove('hidden');
    const close = () => { toast.classList.add('hidden'); scheduleToastHide(null); };
    inner.querySelector('[data-hint-close]').onclick = close;
    inner.querySelector('[data-hint-report]').onclick = () => {
      close();
      if (window.TrainingUI) TrainingUI.openProblem({ error: raw, method, origin: fromServer ? 'server' : 'form' });
    };
    const assistantBtn = inner.querySelector('[data-hint-assistant]');
    if (assistantBtn) assistantBtn.onclick = () => { close(); Assistant.open({ error: raw, method, origin: fromServer ? 'server' : 'form' }); };
    const actionBtn = inner.querySelector('[data-hint-action]');
    if (actionBtn) actionBtn.onclick = () => { close(); navigateTo(d.action.route); };
    const scenarioBtn = inner.querySelector('[data-hint-scenario]');
    if (scenarioBtn) scenarioBtn.onclick = () => { close(); Tour.start(scenario.id); };
    // Подсказку надо успеть прочитать — висит, пока не закроют.
    scheduleToastHide(d.hint || d.technical || scenario ? null : AUTO_HIDE_MS);
  }

  window.ErrorHints = { describe, show, HINTS };
})();
