'use strict';

/**
 * «Итоги года» — модерация перед рассылкой (IMPLEMENTATION-PLAN-GAMIFICATION.md
 * §4.2, VASY 27.09.2026: «автоматом, но с модерацией админом перед этим»).
 * 18.12 система собирает черновики и присылает админу «проверьте»; 25.12 с
 * 10:00 уходят только одобренные. Итоги менеджеров — без модерации (здесь
 * только посмотреть). Admin-only: карточка в «Ещё», серверный гейт —
 * MANAGER_EXCLUDED_METHODS.
 */
window.Screens = window.Screens || {};
window.Screens.yearSummaries = {
  render(root) {
    let state = null;
    const images = new Map(); // id → base64 превью (или текст менеджера)

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="ys-back-btn" class="p-2 -ml-2 text-gray-600 rounded-full" aria-label="Назад"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
      <h1 id="ys-title" class="text-lg font-semibold text-gray-900 tracking-tight">Итоги года</h1>`;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('ys-back-btn').addEventListener('click', () => navigateTo('more'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="ys-body"><div class="p-6 text-center text-sm text-gray-400">Загрузка...</div></div>
      </main>`;
    const body = document.getElementById('ys-body');

    const STATUS = {
      draft: ['Черновик', 'bg-gray-100 text-gray-600'],
      approved: ['Одобрено', 'bg-emerald-50 text-emerald-700'],
      excluded: ['Не отправлять', 'bg-amber-50 text-amber-700'],
      sent: ['Отправлено', 'bg-indigo-50 text-indigo-700'],
      failed: ['Ошибка отправки', 'bg-red-50 text-red-700']
    };

    async function load() {
      try {
        state = await callServer('getYearSummaries');
        draw();
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function fmtDate(d) {
      return d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    }

    function chip(status) {
      const [label, cls] = STATUS[status] || [status, 'bg-gray-100 text-gray-600'];
      return `<span class="text-[11px] px-2 py-0.5 rounded-full ${cls}">${label}</span>`;
    }

    function plural(n, one, few, many) {
      const m10 = n % 10;
      const m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
      return many;
    }

    function clientFacts(d) {
      const parts = [`${d.ordered} ${plural(d.ordered, 'заказ', 'заказа', 'заказов')}`, `получено ${d.received}`];
      if (d.favoriteSeries) parts.push(`серия: ${d.favoriteSeries.name}`);
      if (d.bestMonth) parts.push(`месяц: ${d.bestMonth.label}`);
      if (d.grails.length > 0) parts.push(`Граалей: ${d.grails.length}`);
      if (d.since) parts.push(`с ${d.since}`);
      return parts.join(' · ');
    }

    function btn(action, id, label, cls) {
      return `<button type="button" data-action="${action}" data-id="${id}" class="px-2.5 py-1.5 rounded-lg text-xs font-medium ${cls || 'border border-gray-200 text-gray-600'}">${label}</button>`;
    }

    function preview(id) {
      const p = images.get(id);
      if (!p) return '';
      if (p.base64) return `<img src="data:image/jpeg;base64,${p.base64}" class="mt-3 w-full rounded-xl border border-gray-100" alt="">`;
      return `<pre class="mt-3 text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">${escapeHtmlClient(p.text.replace(/<[^>]+>/g, ''))}</pre>`;
    }

    function clientCard(c) {
      const d = c.data;
      const who = [d.clientName, d.clientUsername].filter(Boolean).join(' ') || c.telegramId;
      const actions = [];
      if (c.status !== 'sent') {
        if (c.status !== 'approved') actions.push(btn('approve', c.id, 'Одобрить', 'bg-emerald-600 text-white'));
        if (c.status !== 'excluded') actions.push(btn('exclude', c.id, 'Не отправлять'));
        if (c.status === 'approved' || c.status === 'excluded') actions.push(btn('draft', c.id, 'В черновик'));
      }
      actions.push(btn('image', c.id, images.has(c.id) ? 'Скрыть картинку' : 'Картинка'));
      actions.push(btn('me', c.id, 'Прислать мне'));
      if (c.status !== 'excluded') actions.push(btn('now', c.id, c.status === 'sent' ? 'Отправить ещё раз' : 'Отправить сейчас', 'border border-indigo-200 text-indigo-600'));
      return `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
        <div class="flex items-center gap-2">
          <div class="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">${escapeHtmlClient(who)}</div>
          ${chip(c.status)}
        </div>
        <div class="text-xs text-gray-500 mt-1">${escapeHtmlClient(clientFacts(d))}</div>
        <div class="text-xs text-gray-400 mt-0.5">Кукла года: ${escapeHtmlClient(c.doll ? c.doll.name : '—')}${c.dollChosen ? ' (выбрал клиент)' : ''}</div>
        ${c.sentAt ? `<div class="text-xs text-gray-400 mt-0.5">Отправлено ${fmtDate(c.sentAt)}</div>` : ''}
        ${c.sendError ? `<div class="text-xs text-red-500 mt-0.5">${escapeHtmlClient(c.sendError)}</div>` : ''}
        <div class="flex flex-wrap gap-1.5 mt-2.5">${actions.join('')}</div>
        ${preview(c.id)}
      </div>`;
    }

    function managerCard(m) {
      const d = m.data;
      return `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
        <div class="flex items-center gap-2">
          <div class="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">${escapeHtmlClient(d.managerName || m.telegramId)}</div>
          ${chip(m.status)}
        </div>
        <div class="text-xs text-gray-500 mt-1">${d.orders} ${plural(d.orders, 'заказ', 'заказа', 'заказов')} · ${d.clients} ${plural(d.clients, 'клиент', 'клиента', 'клиентов')} · получено ${d.received}</div>
        ${m.sendError ? `<div class="text-xs text-red-500 mt-0.5">${escapeHtmlClient(m.sendError)}</div>` : ''}
        <div class="flex flex-wrap gap-1.5 mt-2.5">
          ${btn('image', m.id, images.has(m.id) ? 'Скрыть текст' : 'Текст')}
          ${btn('me', m.id, 'Прислать мне')}
        </div>
        ${preview(m.id)}
      </div>`;
    }

    function draw() {
      const s = state;
      document.getElementById('ys-title').textContent = `Итоги ${s.year}`;
      const drafts = s.clients.filter((c) => c.status === 'draft').length;
      const approved = s.clients.filter((c) => c.status === 'approved').length;
      body.innerHTML = `
        <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5 text-[13px] text-indigo-900 leading-snug">
          ${s.generateDate} система соберёт итоги и пришлёт вам «проверьте». <b>${s.sendDate}</b> уйдут только одобренные.
          Если после одобрения у клиента появится новый заказ и итоги пересоберутся — одобрение снимется, проверьте ещё раз.
          ${s.generatedAt ? `<div class="text-indigo-700/70 mt-1">Последняя сборка: ${fmtDate(s.generatedAt)}</div>` : ''}
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" id="ys-generate-btn" class="flex-1 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium">${s.generatedAt ? 'Пересобрать сейчас' : 'Собрать сейчас'}</button>
          <button type="button" id="ys-approve-all-btn" class="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-40" ${drafts === 0 ? 'disabled' : ''}>Одобрить все (${drafts})</button>
        </div>
        <div class="text-[11px] text-gray-400 px-1 mt-4 mb-2">Клиенты · ${s.clients.length} (одобрено ${approved})</div>
        <div class="space-y-2">${s.clients.length > 0 ? s.clients.map(clientCard).join('') : '<div class="p-4 text-center text-sm text-gray-400">Итогов пока нет — нажмите «Собрать сейчас».</div>'}</div>
        <div class="text-[11px] text-gray-400 px-1 mt-4 mb-2">Менеджеры · уйдут ${s.sendDate} без проверки</div>
        <div class="space-y-2">${s.managers.length > 0 ? s.managers.map(managerCard).join('') : '<div class="p-4 text-center text-sm text-gray-400">Нет менеджеров с 5+ заказами за год.</div>'}</div>`;
      if (window.lucide) window.lucide.createIcons();

      document.getElementById('ys-generate-btn').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          const r = await callServer('generateYearSummaries', s.year);
          images.clear();
          showSaveToast(true, `Собрано: клиентов ${r.clients}, менеджеров ${r.managers}${r.reset > 0 ? `. Снято одобрений: ${r.reset}` : ''}`);
        } catch (error) { showSaveToast(false, error.message); }
        load();
      });
      document.getElementById('ys-approve-all-btn').addEventListener('click', async () => {
        if (!(await showConfirmModal(`Одобрить все черновики (${drafts})? Они уйдут клиентам ${s.sendDate}.`, { confirmLabel: 'Одобрить' }))) return;
        try {
          await callServer('approveAllYearSummaries', s.year);
        } catch (error) { showSaveToast(false, error.message); }
        load();
      });
    }

    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const id = Number(b.dataset.id);
      const action = b.dataset.action;
      b.disabled = true;
      try {
        if (action === 'approve' || action === 'exclude' || action === 'draft') {
          await callServer('setYearSummaryStatus', id, action === 'approve' ? 'approved' : action === 'exclude' ? 'excluded' : 'draft');
          return load();
        }
        if (action === 'image') {
          if (images.has(id)) images.delete(id);
          else images.set(id, await callServer('getYearSummaryImage', id));
          return draw();
        }
        if (action === 'me') {
          await callServer('sendYearSummaryToMe', id);
          showSaveToast(true, 'Превью отправлено вам в чат с ботом');
        }
        if (action === 'now') {
          if (!(await showConfirmModal('Отправить итоги этому клиенту прямо сейчас, не дожидаясь 25 декабря?', { confirmLabel: 'Отправить' }))) return;
          await callServer('sendYearSummaryNow', id);
          showSaveToast(true, 'Итоги отправлены');
          return load();
        }
      } catch (error) {
        showSaveToast(false, error.message);
      } finally {
        b.disabled = false;
      }
    });

    load();
  }
};
