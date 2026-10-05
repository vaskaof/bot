'use strict';

/**
 * «Что нового» в клиентском приложении (05.10.2026, решение VASY: окно при
 * входе «работает лучше окна новостей» — и для обычных пользователей тоже).
 * Записи пишет Claude при обновлениях, видимых клиенту (сервер:
 * server/src/training/whatsNew.js, роль 'client'; правила показа —
 * whatsNewService.js): новичку старое не показывается, лист можно выключить
 * в «Профиль» → «Уведомления», а записи всё равно лежат в «Новостях».
 *
 * ClientWhatsNew.check() — роутер зовёт один раз после старта.
 * ClientWhatsNew.cardHtml(e) — карточка записи для ленты «Новости».
 */
(function () {
  const SHEET_ID = 'client-whats-new-sheet';
  let checked = false;

  const ddmmyy = (iso) => String(iso || '').split('-').reverse().join('.');

  /** full — статья целиком (лист при входе); иначе статья под «Читать полностью». */
  function cardHtml(e, full) {
    const body = e.body
      ? (full === true
        ? `<div class="text-[13px] text-gray-700 leading-snug">${whatsNewBodyHtml(e.body)}</div>`
        : `<details class="mt-1.5"><summary class="text-[13px] text-indigo-600 cursor-pointer select-none">Читать полностью</summary><div class="text-[13px] text-gray-700 leading-snug">${whatsNewBodyHtml(e.body)}</div></details>`)
      : '';
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4" data-whats-new="${escapeHtmlClient(e.id)}">
        <div class="text-[10px] font-semibold text-indigo-600">🆕 Обновление приложения · ${ddmmyy(e.date)}</div>
        <div class="font-semibold text-gray-900 text-[15px] mt-1">${escapeHtmlClient(e.title)}</div>
        ${e.body && full === true ? '' : e.lines.map((l) => `<div class="text-[13px] text-gray-600 mt-1">${escapeHtmlClient(l)}</div>`).join('')}
        ${body}
        ${e.route ? `<button type="button" data-whats-new-go="${escapeHtmlClient(e.route)}" class="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[13px] font-medium">${escapeHtmlClient(e.actionLabel || 'Открыть')}</button>` : ''}
      </div>`;
  }

  function wireGo(root, before) {
    root.querySelectorAll('[data-whats-new-go]').forEach((b) => {
      b.onclick = () => { if (before) before(); navigateTo(b.dataset.whatsNewGo); };
    });
  }

  /** Промис завершается, когда лист закрыт (или показывать нечего) — следом роутер предлагает обучение. */
  async function check() {
    if (checked || window.__E2E_SKIP_WHATS_NEW) return;
    checked = true;
    let data;
    try { data = await callServer('getMyWhatsNew'); } catch (e) { return; }
    const fresh = data.entries.filter((e) => data.unseen.includes(e.id));
    if (!fresh.length) return;
    await new Promise((r) => setTimeout(r, 800));
    // Не поверх согласия с политикой и других открытых окон.
    if (Array.from(document.querySelectorAll('.fixed.inset-0')).some((el) => !el.classList.contains('hidden') && el.getClientRects().length)) return;
    const articles = fresh.filter((e) => e.body);
    const rest = articles.length ? fresh.filter((e) => !e.body) : fresh;
    const restHtml = rest.map((e) => cardHtml(e)).join('');
    const el = document.createElement('div');
    el.id = SHEET_ID;
    el.className = 'fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[70]';
    el.innerHTML = `
      <div class="bg-gray-50 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <div class="text-base font-semibold text-gray-900 mb-3">🆕 Что нового</div>
        ${articles.map((e) => cardHtml(e, true)).join('')}
        ${articles.length && rest.length
          ? `<details class="mt-2"><summary class="text-[13px] text-indigo-600 cursor-pointer select-none">Ещё изменения (${rest.length})</summary><div class="space-y-2 mt-2">${restHtml}</div></details>`
          : `<div class="space-y-2">${restHtml}</div>`}
        <button type="button" data-ok class="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Понятно</button>
        <div class="text-[11px] text-gray-400 text-center mt-2">Всё это есть в «Новостях». Не показывать при входе — «Профиль» → «Уведомления».</div>
      </div>`;
    document.body.appendChild(el);
    let marked = false;
    let closed;
    const closedPromise = new Promise((resolve) => { closed = resolve; });
    const done = () => {
      el.remove();
      closed();
      if (marked) return;
      marked = true;
      callServer('markMyWhatsNewSeen', fresh.map((e) => e.id)).catch(() => {});
    };
    el.querySelector('[data-ok]').onclick = done;
    el.onclick = (ev) => { if (ev.target === el) done(); };
    wireGo(el, done);
    return closedPromise;
  }

  window.ClientWhatsNew = { check, cardHtml, wireGo };
})();
