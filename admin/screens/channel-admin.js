'use strict';

/**
 * Каналы К6.4 (IMPLEMENTATION-PLAN-STOREFRONTS.md «К6.4 — админ своего канала», «да» VASY 12.10.2026) —
 * «Мой канал (админ)»: менеджер-админ канала (у Насти — limisteam) в своём канале. Бот канала (бренд — экран
 * «Мой канал»), счёт Кнопке, модули клиентов канала, свои менеджеры, своя доля посредника, отчёт по менеджерам.
 * Граница — на сервере (CHANNEL_ADMIN_METHODS и только в своём канале); экран сам переключает шапку на свой канал.
 */
window.Screens = window.Screens || {};
window.Screens.channelAdmin = {
  render(root) {
    const adminOf = window.CURRENT_CHANNEL_ADMIN_OF;
    const cs = window.ChannelSwitch;
    const title = cs ? cs.titleOf(adminOf) : 'канал';
    document.getElementById('header-left').innerHTML = `
      <div class="flex items-center gap-1 min-w-0">
        <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
          <i data-lucide="arrow-left" class="w-5 h-5"></i>
        </button>
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight truncate">Мой канал «${escapeHtmlClient(title)}»</h1>
      </div>`;
    document.getElementById('header-actions').innerHTML = '';
    root.innerHTML = `<main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto" id="channel-admin-root"></main>`;
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    const main = document.getElementById('channel-admin-root');

    if (!adminOf || window.CURRENT_ACCESS_ROLE === 'admin') {
      main.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Этот раздел — для админа своего канала.</div>';
      return;
    }
    // Права админа канала — только в его канале: переключаем шапку (экран перерисуется уже в нём).
    if (cs && cs.enabled() && cs.currentStorefrontId() !== adminOf) {
      cs.choose(adminOf);
      return;
    }

    const rub = (n) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
    const card = (id, heading, body) => `
      <section class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
        <div class="text-sm font-semibold text-gray-900 mb-2">${heading}</div>
        <div id="${id}">${body || '<div class="text-[12px] text-gray-400">Загрузка...</div>'}</div>
      </section>`;

    main.innerHTML = [
      card('ca-bot', 'Бот канала', `
        <div class="text-[12px] text-gray-500 mb-2">Название, ссылка на канал, менеджер, цвет и тексты, которые видят ваши клиенты в боте и приложении.</div>
        <button type="button" id="ca-open-brand" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Открыть «Мой канал»</button>`),
      card('ca-billing', 'Счёт Кнопке'),
      card('ca-modules', 'Разделы для клиентов'),
      card('ca-staff', 'Мои менеджеры'),
      card('ca-share', 'Моя доля'),
      card('ca-report', 'Менеджеры канала за 30 дней')
    ].join('');
    document.getElementById('ca-open-brand').addEventListener('click', () => navigateTo('my-channel'));
    if (window.lucide) window.lucide.createIcons();

    const fail = (id, error) => {
      document.getElementById(id).innerHTML = `<div class="text-[12px] text-red-500">${escapeHtmlClient(error.message || 'Не удалось загрузить.')}</div>`;
    };

    loadBilling().catch((e) => fail('ca-billing', e));
    loadModules().catch((e) => fail('ca-modules', e));
    loadStaff().catch((e) => fail('ca-staff', e));
    loadShare().catch((e) => fail('ca-share', e));
    loadReport().catch((e) => fail('ca-report', e));

    async function loadBilling() {
      const bill = await callServer('getMyBilling');
      const box = document.getElementById('ca-billing');
      if (!bill || !bill.enabled) {
        box.innerHTML = '<div class="text-[12px] text-gray-500">Счёт ещё не ведётся — его включает Кнопка с даты подключения.</div>';
        return;
      }
      const cur = bill.periods.find((p) => p.isCurrent) || bill.periods[0];
      box.innerHTML = `
        ${cur ? `<div class="text-sm text-gray-900">${escapeHtmlClient(cur.label)}${cur.isCurrent ? ' (идёт)' : ''}: <b>${rub(cur.amountDue)}</b></div>
        <div class="text-[12px] text-gray-500">Оборот ${rub(cur.turnoverRub)} × ${String(cur.ratePercent).replace('.', ',')}%${cur.minApplied ? ` → минимум ${rub(cur.minPaymentRub)}` : ''}</div>` : ''}
        <div class="text-sm mt-2">Долг: <b class="${bill.balance > 0 ? 'text-red-600' : 'text-emerald-600'}">${rub(bill.balance)}</b>
          <span class="text-[12px] text-gray-500">· с текущим месяцем ${rub(bill.balanceWithCurrent)}</span></div>
        <div class="text-[11px] text-gray-400 mt-1">Оборот — оплаты клиентов канала на «Основную» (товар и комиссия). Счёт выставляется 1-го числа за прошлый месяц.</div>`;
    }

    async function loadModules(data) {
      const state = data || await callServer('getChannelModules');
      const box = document.getElementById('ca-modules');
      box.innerHTML = state.modules.length === 0
        ? '<div class="text-[12px] text-gray-400">Разделов для клиентов нет в тарифе.</div>'
        : `<div class="text-[12px] text-gray-500 mb-2">Что видят ваши клиенты в боте и приложении.</div>` + state.modules.map((m) => `
          <label class="flex items-center justify-between gap-3 py-2 border-t border-gray-50 first:border-t-0">
            <span class="text-[13px] text-gray-800">${escapeHtmlClient(m.label)}</span>
            <input type="checkbox" data-ca-module="${escapeHtmlClient(m.module)}" ${m.enabled ? 'checked' : ''} class="w-5 h-5 accent-indigo-600">
          </label>`).join('');
      box.querySelectorAll('[data-ca-module]').forEach((input) => input.addEventListener('change', async () => {
        const module = input.dataset.caModule;
        const enabled = input.checked;
        if (module === 'gamification' && enabled
          && !await showConfirmModal('Включить бонусы? Клиентам канала начнут начисляться совы за оплаты заказов.', { confirmLabel: 'Включить' })) {
          input.checked = false;
          return;
        }
        input.disabled = true;
        try {
          await loadModules(await callServer('setChannelModuleEnabled', module, enabled));
          showSaveToast(true, 'Сохранено.');
        } catch (error) {
          input.checked = !enabled;
          input.disabled = false;
          showSaveToast(false, error.message || 'Не удалось сохранить.');
        }
      }));
    }

    async function loadStaff() {
      const list = await callServer('getStaffList');
      const box = document.getElementById('ca-staff');
      const rows = list.map((m) => `
        <div class="flex items-center justify-between gap-2 py-2 border-t border-gray-50 first:border-t-0">
          <div class="min-w-0">
            <div class="text-[13px] text-gray-900 truncate">${escapeHtmlClient(m.name || m.clientName || m.telegramId)}
              ${m.isChannelAdmin ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 ml-1">админ канала</span>' : ''}
              ${m.isActive ? '' : '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 ml-1">отключён</span>'}</div>
            <div class="text-[11px] text-gray-400">${m.clientUsername ? escapeHtmlClient(m.clientUsername) + ' · ' : ''}ID ${escapeHtmlClient(m.telegramId)}</div>
          </div>
          ${m.isChannelAdmin ? '' : `<button type="button" data-ca-toggle="${escapeHtmlClient(m.telegramId)}" data-active="${m.isActive ? '1' : ''}"
            class="text-[12px] px-3 py-1.5 rounded-lg border ${m.isActive ? 'border-red-200 text-red-600' : 'border-gray-200 text-gray-700'}">${m.isActive ? 'Отключить' : 'Вернуть'}</button>`}
        </div>`).join('');
      box.innerHTML = `${rows}
        <div class="text-[12px] text-gray-500 mt-3 mb-1">Новый менеджер работает только в вашем канале.</div>
        <div class="grid grid-cols-2 gap-2">
          <input id="ca-staff-id" inputmode="numeric" placeholder="Telegram ID" class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <input id="ca-staff-name" placeholder="Имя" class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <button type="button" id="ca-staff-add" class="col-span-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить менеджера</button>
        </div>
        <div class="text-[11px] text-gray-400 mt-1">Telegram ID человек узнаёт, написав боту @userinfobot.</div>`;
      document.getElementById('ca-staff-add').addEventListener('click', async (e) => {
        const id = document.getElementById('ca-staff-id').value.trim();
        const name = document.getElementById('ca-staff-name').value.trim();
        if (!/^\d+$/.test(id)) { showSaveToast(false, 'Telegram ID — только цифры.'); return; }
        e.currentTarget.disabled = true;
        try {
          await callServer('addStaffMember', id, name, 'manager');
          showSaveToast(true, 'Менеджер добавлен.');
          await loadStaff();
        } catch (error) {
          showSaveToast(false, error.message || 'Не удалось добавить.');
          e.currentTarget.disabled = false;
        }
      });
      box.querySelectorAll('[data-ca-toggle]').forEach((btn) => btn.addEventListener('click', async () => {
        const active = btn.dataset.active === '1';
        if (active && !await showConfirmModal('Отключить менеджера? Он больше не сможет открыть панель.', { confirmLabel: 'Отключить', danger: true })) return;
        btn.disabled = true;
        try {
          await callServer(active ? 'deactivateStaffMember' : 'reactivateStaffMember', btn.dataset.caToggle);
          await loadStaff();
        } catch (error) {
          showSaveToast(false, error.message || 'Не удалось.');
          btn.disabled = false;
        }
      }));
    }

    async function loadShare() {
      const box = document.getElementById('ca-share');
      let data;
      try {
        data = await callServer('getChannelSharePayables', 90);
      } catch (error) {
        box.innerHTML = `<div class="text-[12px] text-gray-500">${escapeHtmlClient(error.message || 'Доли нет.')}</div>`;
        return;
      }
      const g = data.group;
      const entries = g.entries.map((e) => `
        <div class="flex items-center justify-between gap-2 py-1.5 border-t border-gray-50 first:border-t-0">
          <span class="text-[12px] text-gray-700">Заказ ${escapeHtmlClient(e.orderId)} · ${rub(e.amount)}</span>
          <button type="button" data-ca-paid="${escapeHtmlClient(e.orderId)}" data-paid="${e.paid ? '1' : ''}"
            class="text-[11px] px-2 py-1 rounded-lg ${e.paid ? 'bg-emerald-50 text-emerald-700' : 'border border-gray-200 text-gray-700'}">${e.paid ? '✓ Выплачено' : 'Отметить выплаченным'}</button>
        </div>`).join('');
      box.innerHTML = `
        ${data.sharePct ? `<div class="text-[12px] text-gray-500 mb-2">Ваша доля — ${String(data.sharePct).replace('.', ',')}% полной комиссии заказов канала, заведённых с ${new Date(data.since).toLocaleDateString('ru-RU')}.</div>` : ''}
        <div class="grid grid-cols-2 gap-2 mb-2">
          <div><div class="text-[11px] text-gray-400">Начислено за 90 дней</div><div class="text-sm font-medium">${rub(g.totalAmount)}</div></div>
          <div><div class="text-[11px] text-gray-400">Не отмечено выплаченным</div><div class="text-sm font-semibold ${g.unpaidAmount > 0 ? 'text-amber-700' : 'text-emerald-600'}">${rub(g.unpaidAmount)}</div></div>
        </div>
        ${entries || '<div class="text-[12px] text-gray-400">Начислений пока нет — доля появится после оплаты «Основной» новых заказов.</div>'}
        <div class="text-[11px] text-gray-400 mt-1">Если свою половину вы оставляете себе при получении оплаты — сразу отмечайте «Выплачено».</div>`;
      box.querySelectorAll('[data-ca-paid]').forEach((btn) => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await callServer('markChannelSharePayout', btn.dataset.caPaid, btn.dataset.paid !== '1', '');
          await loadShare();
        } catch (error) {
          showSaveToast(false, error.message || 'Не удалось.');
          btn.disabled = false;
        }
      }));
    }

    async function loadReport() {
      const rows = await callServer('getManagerPerformanceReport', 30);
      const box = document.getElementById('ca-report');
      box.innerHTML = rows.length === 0
        ? '<div class="text-[12px] text-gray-400">За 30 дней заказов нет.</div>'
        : rows.map((r) => `
          <div class="flex items-center justify-between gap-2 py-1.5 border-t border-gray-50 first:border-t-0">
            <div class="min-w-0"><div class="text-[13px] text-gray-900 truncate">${escapeHtmlClient(r.name)}</div>
              <div class="text-[11px] text-gray-400">Заказов: ${r.ordersCount}${r.overdueOrdersCount > 0 ? ` · просрочено ${r.overdueOrdersCount}` : ''}</div></div>
            <div class="text-right shrink-0"><div class="text-[13px]">${rub(r.totalRevenueRub)}</div><div class="text-[11px] text-gray-400">доход ${rub(r.totalProfitRub)}</div></div>
          </div>`).join('');
    }
  }
};
