'use strict';

/**
 * Экран "Напоминания" — перенесён из admin/reminders.html (SPA админки,
 * 02.08.2026). CONDITION_LABELS/CONFIG_SNOOZE_DAYS_LABEL — настоящие константы
 * (не мутируются), безопасно оставлены на верхнем уровне модуля, в отличие от
 * состояния, которое обязано жить внутри render().
 */
window.Screens = window.Screens || {};

const CONDITION_LABELS = {
  1: 'Валюта и курсы',
  2: 'Оплаты',
  3: 'Вес и доставка КЗ→РФ',
  4: 'Доставка по РФ'
};
const CONFIG_SNOOZE_DAYS_LABEL = '3 дня';

window.Screens.reminders = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Напоминания</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-reminders" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="recommendations-block" class="hidden mb-4"></div>
        <div class="text-[11px] text-gray-400 px-1 mb-2" id="reminders-count"></div>
        <div id="reminders-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Незаполненных полей нет 🎉</div>
      </main>
    `;

    const listContainer = document.getElementById('reminders-list');
    const emptyMessage = document.getElementById('empty-message');
    const countLabel = document.getElementById('reminders-count');
    const refreshBtn = document.getElementById('refresh-reminders');
    const recommendationsBlock = document.getElementById('recommendations-block');

    loadReminders();
    loadRecommendations();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await Promise.all([loadReminders(), loadRecommendations()]);
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function loadReminders() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const reminders = await callServer('getReminders');
        render(reminders);
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    async function loadRecommendations() {
      try {
        const recs = await callServer('getShippingRecommendations');
        if (recs.length === 0) {
          recommendationsBlock.classList.add('hidden');
          return;
        }
        recommendationsBlock.innerHTML = `
          <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div class="text-sm font-semibold text-amber-800 mb-2">💡 Кандидаты на индивидуальную отправку</div>
            ${recs.map(r => `<div class="text-xs text-amber-700 py-0.5">${escapeHtmlClient(r.clientDisplay)} — ${r.count} посылок к посреднику КЗ</div>`).join('')}
          </div>
        `;
        recommendationsBlock.classList.remove('hidden');
      } catch (error) {
        recommendationsBlock.classList.add('hidden');
      }
    }

    function getAgeColorClass(sinceMs) {
      if (!sinceMs) return 'border-gray-200';
      const daysOld = (Date.now() - sinceMs) / (1000 * 60 * 60 * 24);
      if (daysOld >= 3) return 'border-red-300 bg-red-50';
      if (daysOld >= 1) return 'border-amber-300 bg-amber-50';
      return 'border-gray-200';
    }

    function render(reminders) {
      countLabel.textContent = `Найдено: ${reminders.length}`;
      listContainer.innerHTML = '';

      if (reminders.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      reminders.forEach(r => listContainer.appendChild(buildCard(r)));
    }

    function buildCard(r) {
      const card = document.createElement('div');
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${getAgeColorClass(r.sinceMs)}`;

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2 cursor-pointer" data-open>
          <div>
            <div class="text-[11px] font-medium text-indigo-600 mb-0.5">Условие ${r.condition} — ${CONDITION_LABELS[r.condition]}</div>
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(r.productDisplay)}</div>
            <div class="text-[13px] text-gray-500 mt-0.5">${escapeHtmlClient(r.clientDisplay || 'Клиент не привязан')}</div>
            <div class="text-[12px] text-gray-600 mt-1">Не заполнено: ${escapeHtmlClient(r.fieldLabel)}</div>
          </div>
        </div>
        ${r.canSnooze ? `<button type="button" class="snooze-btn mt-3 w-full py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600">Отложить на ${CONFIG_SNOOZE_DAYS_LABEL}</button>` : ''}
      `;

      card.querySelector('[data-open]').addEventListener('click', () => {
        navigateTo(`orders/${encodeURIComponent(r.orderId)}/edit`);
      });

      const snoozeBtn = card.querySelector('.snooze-btn');
      if (snoozeBtn) {
        snoozeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          snoozeBtn.disabled = true;
          snoozeBtn.textContent = 'Откладываю...';
          try {
            await callServer('snoozeReminder', r.orderId);
            card.remove();
          } catch (error) {
            snoozeBtn.disabled = false;
            snoozeBtn.textContent = 'Ошибка, повторить';
          }
        });
      }

      return card;
    }
  }
};
