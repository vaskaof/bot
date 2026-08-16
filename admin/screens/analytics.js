'use strict';

/**
 * Экран "Аналитика" (17.08.2026, project_bot_knopka_admin_bottom_nav_redesign)
 * — читает `getUsageAnalytics(days)` (см. `webapp-api.md` за форматом ответа).
 * Закрывает долг project_bot_knopka_usage_analytics — сбор данных был готов
 * с 16.08.2026, UI сознательно не делался до этого раунда.
 *
 * НЕ входит в основную нижнюю навигацию (6 постоянных пунктов) — открывается
 * с экрана "Ещё" (`more.js`) на узких экранах, на широких становится обычной
 * inline-кнопкой нав-бара (см. app.html). Нет диаграммной библиотеки в
 * проекте — гистограмма по дням нарисована обычными div'ами
 * (высота — процент от максимума), тот же принцип "минимум зависимостей",
 * что и у остального фронтенда.
 *
 * Per-user срез (17.08.2026, продолжение того же долга) — блок "Активные
 * пользователи" читает `getUsageTopUsers(days, limit)`; клик по строке
 * переключает экран в режим drill-down на одного пользователя
 * (`getUserUsageAnalytics(telegramId, days)`, `state.userView`). Отдельного
 * route на это НЕ заведено — переключение чисто внутри `render()`, "Назад"
 * из drill-down возвращает к общей сводке (не к предыдущему экрану).
 *
 * "Почти бесплатные" срезы (17.08.2026, тот же день) — те же данные, что уже
 * собирались, просто раньше не показывались: дельта к предыдущему такому же
 * окну на KPI-плитках (`summary.prevTotals`), тепловая карта активности по
 * часам/дням недели (`summary.byHourDow`, одна последовательная шкала
 * indigo — светлота = величина, см. dataviz-skill), таблица медленных
 * методов по `duration_ms` (`summary.slowMethods`, HAVING count>=3 — один
 * выброс не должен возглавлять список). Только на общей сводке, НЕ на
 * per-user drill-down.
 */
window.Screens = window.Screens || {};
window.Screens.analytics = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Аналитика</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-analytics" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    // drill-down состояние: null — общая сводка, иначе {telegramId, label}
    // выбранного пользователя (см. topUsersList → openUser).
    let activeUser = null;

    document.getElementById('back-btn').addEventListener('click', () => {
      if (activeUser) {
        activeUser = null;
        load();
        return;
      }
      navigateTo('more');
    });

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="flex items-center justify-between mb-3">
          <div id="analytics-subtitle" class="text-[11px] text-gray-400">Кто и как пользуется приложением</div>
          <select id="days-select" class="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-indigo-400">
            <option value="7">7 дней</option>
            <option value="14" selected>14 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
          </select>
        </div>

        <div id="analytics-body">
          <div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>
        </div>
      </main>
    `;

    const daysSelect = document.getElementById('days-select');
    const refreshBtn = document.getElementById('refresh-analytics');
    const body = document.getElementById('analytics-body');
    const subtitle = document.getElementById('analytics-subtitle');

    load();

    daysSelect.addEventListener('change', load);
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await load();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function load() {
      body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      const days = Number(daysSelect.value);
      try {
        if (activeUser) {
          subtitle.textContent = activeUser.label;
          const summary = await callServer('getUserUsageAnalytics', activeUser.telegramId, days);
          renderUser(summary);
        } else {
          subtitle.textContent = 'Кто и как пользуется приложением';
          const [summary, topUsers] = await Promise.all([
            callServer('getUsageAnalytics', days),
            callServer('getUsageTopUsers', days, 10)
          ]);
          render(summary, topUsers);
        }
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function openUser(telegramId, label) {
      activeUser = { telegramId, label };
      load();
    }

    function render(summary, topUsers) {
      const { totals, prevTotals, byMethod, byDay, recentErrors, slowMethods, byHourDow } = summary;
      const successRate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0;
      const prevSuccessRate = prevTotals.total > 0 ? Math.round((prevTotals.success / prevTotals.total) * 100) : 0;

      body.innerHTML = `
        <div class="grid grid-cols-2 gap-2 mb-4">
          ${kpiTile('activity', 'Вызовов всего', totals.total, deltaBadge(totals.total, prevTotals.total, 'neutral'))}
          ${kpiTile('check-circle', 'Успешно', `${successRate}%`, deltaBadge(successRate, prevSuccessRate, 'up'))}
          ${kpiTile('alert-triangle', 'Ошибок', totals.failed, deltaBadge(totals.failed, prevTotals.failed, 'down'))}
          ${kpiTile('user', 'Активных админов', totals.uniqueAdmins)}
          ${kpiTile('users', 'Активных клиентов', totals.uniqueClients)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Вызовов по дням</div>
          ${byDay.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : dayChart(byDay)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Активность по часам и дням недели</div>
          ${byHourDow.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : heatmap(byHourDow)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Топ методов</div>
          ${byMethod.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : methodTable(byMethod)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Медленные методы</div>
          ${slowMethods.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : slowMethodsTable(slowMethods)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Активные пользователи</div>
          ${topUsers.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : topUsersList(topUsers)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Последние ошибки</div>
          ${recentErrors.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Ошибок нет 🎉</div>' : errorsList(recentErrors)}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      body.querySelectorAll('[data-user-telegram-id]').forEach((el) => {
        el.addEventListener('click', () => openUser(el.dataset.userTelegramId, el.dataset.userLabel));
      });
    }

    function renderUser(summary) {
      const { totals, byMethod, byDay } = summary;
      const successRate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0;

      body.innerHTML = `
        <button type="button" id="back-to-users" class="text-xs text-indigo-600 mb-3 flex items-center gap-1">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Все пользователи
        </button>

        <div class="grid grid-cols-3 gap-2 mb-4">
          ${kpiTile('activity', 'Вызовов', totals.total)}
          ${kpiTile('check-circle', 'Успешно', `${successRate}%`)}
          ${kpiTile('alert-triangle', 'Ошибок', totals.failed)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Вызовов по дням</div>
          ${byDay.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : dayChart(byDay)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Топ методов</div>
          ${byMethod.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : methodTable(byMethod)}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      document.getElementById('back-to-users').addEventListener('click', () => {
        activeUser = null;
        load();
      });
    }

    function kpiTile(icon, label, value, deltaHtml) {
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div class="flex items-center gap-1.5 text-gray-400 mb-1">
            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
            <span class="text-[11px]">${escapeHtmlClient(label)}</span>
          </div>
          <div class="text-xl font-semibold text-gray-900">${escapeHtmlClient(String(value))}${deltaHtml || ''}</div>
        </div>
      `;
    }

    /**
     * Дельта к предыдущему такому же окну (см. summary.prevTotals) — signed,
     * цвет = направление × "хорошо ли расти" (goodDirection). 'neutral' —
     * рост объёма вызовов сам по себе не хороший и не плохой, показываем
     * серым, без оценки. previous=0 — делить не на что, дельту не показываем
     * (не "разово было 0, стало N" в проценты — вводит в заблуждение).
     */
    function deltaBadge(current, previous, goodDirection) {
      if (!previous) return '';
      const pct = Math.round(((current - previous) / previous) * 100);
      const up = pct > 0;
      let colorClass = 'text-gray-400';
      if (goodDirection === 'up') colorClass = up ? 'text-green-600' : (pct < 0 ? 'text-red-500' : 'text-gray-400');
      else if (goodDirection === 'down') colorClass = up ? 'text-red-500' : (pct < 0 ? 'text-green-600' : 'text-gray-400');
      const arrow = pct === 0 ? '' : (up ? '▲' : '▼');
      return ` <span class="text-[10px] font-normal ${colorClass}">${arrow}${Math.abs(pct)}%</span>`;
    }

    function dayChart(byDay) {
      const max = Math.max(...byDay.map(d => d.count), 1);
      return `
        <div class="flex items-end gap-1 h-24">
          ${byDay.map(d => `
            <div class="flex-1 flex flex-col items-center justify-end h-full" title="${escapeHtmlClient(d.day)}: ${d.count}">
              <div class="w-full bg-indigo-500 rounded-t" style="height: ${Math.max(4, Math.round((d.count / max) * 100))}%"></div>
            </div>
          `).join('')}
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>${escapeHtmlClient(byDay[0].day)}</span>
          <span>${escapeHtmlClient(byDay[byDay.length - 1].day)}</span>
        </div>
      `;
    }

    /**
     * Тепловая карта активности — одна последовательная шкала (indigo,
     * светлота = величина), не палитра identity-цветов, поэтому
     * categorical-валидатор dataviz-skill сюда не применяется (см. его же
     * color-formula.md: "sequential ramp — не категориальная проверка").
     * Пн-первым для удобства чтения — Postgres отдаёт DOW 0=Вс..6=Сб как есть,
     * переупорядочиваем только на отрисовке.
     */
    function heatmap(byHourDow) {
      const dowLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const dowOrder = [1, 2, 3, 4, 5, 6, 0];
      const lookup = {};
      let max = 1;
      byHourDow.forEach(d => {
        lookup[`${d.dow}-${d.hour}`] = d.count;
        if (d.count > max) max = d.count;
      });

      const rows = dowOrder.map((dow, i) => {
        const cells = [];
        for (let hour = 0; hour < 24; hour++) {
          const count = lookup[`${dow}-${hour}`] || 0;
          const opacity = count === 0 ? 0.04 : Math.max(0.15, count / max).toFixed(2);
          cells.push(`<div class="aspect-square rounded-sm" style="background-color: rgba(79,70,229,${opacity})" title="${dowLabels[i]}, ${hour}:00–${hour + 1}:00: ${count}"></div>`);
        }
        return `
          <div class="flex items-center gap-1">
            <div class="w-5 text-[9px] text-gray-400 shrink-0">${dowLabels[i]}</div>
            <div class="flex-1 grid gap-0.5" style="grid-template-columns: repeat(24, 1fr);">${cells.join('')}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="space-y-1">${rows}</div>
        <div class="flex justify-between text-[9px] text-gray-400 mt-1 pl-6">
          <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
      `;
    }

    function slowMethodsTable(slowMethods) {
      const routeLabels = { admin: 'Админ', client: 'Клиент', proxy: 'GAS', invalid: 'Некорр.' };
      return `
        <div class="space-y-1.5">
          ${slowMethods.map(m => `
            <div class="flex items-center justify-between text-[13px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${escapeHtmlClient(routeLabels[m.route] || m.route)}</span>
                <span class="text-gray-800 truncate">${escapeHtmlClient(m.method)}</span>
              </div>
              <div class="shrink-0 text-right">
                <div class="text-gray-500">~${m.avgMs} мс</div>
                <div class="text-[10px] text-gray-400">p95 ${m.p95Ms} мс</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function methodTable(byMethod) {
      const routeLabels = { admin: 'Админ', client: 'Клиент', proxy: 'GAS', invalid: 'Некорр.' };
      return `
        <div class="space-y-1.5">
          ${byMethod.map(m => `
            <div class="flex items-center justify-between text-[13px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${escapeHtmlClient(routeLabels[m.route] || m.route)}</span>
                <span class="text-gray-800 truncate">${escapeHtmlClient(m.method)}</span>
              </div>
              <div class="shrink-0 text-gray-500">${m.count}${m.failed > 0 ? ` <span class="text-red-500">(${m.failed} ошиб.)</span>` : ''}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function topUsersList(topUsers) {
      return `
        <div class="space-y-1.5">
          ${topUsers.map(u => {
            const label = u.name || u.username || u.telegramId;
            const sub = u.name && u.username ? u.username : '';
            const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleString('ru-RU') : '';
            return `
              <div class="flex items-center justify-between text-[13px] cursor-pointer hover:bg-gray-50 rounded-lg px-1 -mx-1 py-1" data-user-telegram-id="${escapeHtmlClient(u.telegramId)}" data-user-label="${escapeHtmlClient(label)}">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${u.isAdmin ? 'Админ' : 'Клиент'}</span>
                  <div class="min-w-0">
                    <div class="text-gray-800 truncate">${escapeHtmlClient(label)}</div>
                    ${sub ? `<div class="text-[10px] text-gray-400 truncate">${escapeHtmlClient(sub)}</div>` : ''}
                  </div>
                </div>
                <div class="shrink-0 text-right">
                  <div class="text-gray-500">${u.count}</div>
                  ${lastActive ? `<div class="text-[10px] text-gray-400">${escapeHtmlClient(lastActive)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function errorsList(recentErrors) {
      return `
        <div class="space-y-2">
          ${recentErrors.map(e => `
            <div class="text-[12px] border-l-2 border-red-300 pl-2">
              <div class="text-gray-500">${escapeHtmlClient(e.method)} · ${escapeHtmlClient(e.isAdmin ? 'админ' : 'клиент')}${e.telegramId ? ` (${escapeHtmlClient(e.telegramId)})` : ''}</div>
              <div class="text-red-600">${escapeHtmlClient(e.errorMessage || 'без текста ошибки')}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
};
