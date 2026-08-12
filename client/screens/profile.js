'use strict';

/**
 * Экран "Профиль" — новый (Подфаза 3.1+3.2 client_display_overhaul, раздел D
 * Round 1, 12.08.2026). Консолидирует клиентские client-level балансы, ранее
 * разбросанные по другим экранам:
 * - Кредитный баланс — раньше виден ТОЛЬКО внутри контекста конкретного
 *   заказа (getClientOrderDetails.creditBalanceRub), у клиента без открытых
 *   заказов не было способа его увидеть вообще. Новый метод
 *   getMyCreditBalance (contract.js) — та же функция, что уже отдаёт баланс
 *   админу, просто со скоупом на самого себя.
 * - Сов/билеты + рефералка — ПЕРЕНЕСЕНЫ (не задублированы) из
 *   screens/contests.js, где раньше жили вместе с лотереями/заданиями —
 *   VASY подтвердил это разделение (client-level балансы вне контекста
 *   конкретной активности заслуживают отдельного места). contests.js после
 *   этого переноса содержит только лотереи/задания.
 *
 * Подфаза 3.3 (та же дата) — настройки уведомлений, 3 группы toggle
 * (getMyNotificationSettings/setMyNotificationSettings), opt-out —
 * реальное серверное состояние (не локальный optimistic-default, как у
 * старого news.js/setNewsSubscription — тот не имел отдельного getter'а).
 *
 * Ещё не построено (следующая подфаза): свободная форма вопроса/жалобы —
 * см. личную память Architect'а project_bot_knopka_client_display_overhaul.md,
 * раздел D.
 */
window.Screens = window.Screens || {};
window.Screens.profile = {
  render(root) {
    const balanceHelpBody = `
      <p><b>🦉 Совы</b> — начисляются за приглашение друга, за выполненные задания
      и при оплате заказа (в среднем 5000 ₽ оплаты ≈ 100 сов, точный курс задаёт
      команда).</p>
      <p>Каждые <b>100 Сов</b> автоматически превращаются в <b>1 Билет</b> — шкала
      выше показывает прогресс до следующего билета.</p>
      <p><b>🎟️ Билеты</b> нужны для лотерей с ячейками (бейдж «Премиум» на карточке
      в разделе «Конкурсы»): 1 билет = 1 попытка забронировать ячейку на доске.</p>
    `;

    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Профиль</h1>';
    document.getElementById('header-actions').innerHTML = `
      ${helpIcon('Совы, Билеты и кредит', balanceHelpBody, { header: true })}
      <button id="refresh-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="credit-card" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <span>💰</span><span>Кредитный баланс</span>
          </div>
          <div id="credit-amount" class="text-xl font-semibold text-gray-900">0 ₽</div>
          <div class="text-[11px] text-gray-400 mt-1">На распределении менеджера — сумма закреплена за вами и будет направлена на ближайшую оплату по согласованию с вами.</div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <span>🦉</span><span>Совы</span>
            </div>
            <span id="sovy-progress-label" class="text-xs text-gray-400">0/100</span>
          </div>
          <div class="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div id="sovy-progress-bar" class="h-full bg-indigo-500 rounded-full transition-all" style="width:0%"></div>
          </div>
          <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700 mt-3">
            <span>🎟️</span><span>Билеты: <span id="tickets-count">0</span></span>
          </div>
          <div class="text-[11px] text-gray-400 mt-2">100 Сов = 1 Билет для лотерей с ячейками — подробнее по «?» в шапке</div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-1">🎁 Пригласите друга</div>
          <div id="referral-text" class="text-[12px] text-gray-500 mb-2">Загрузка...</div>
          <div class="flex items-center gap-2 mb-3">
            <input type="text" id="referral-link-input" readonly
              class="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 bg-gray-50">
            <button id="copy-referral-btn" type="button" class="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium">
              Скопировать
            </button>
          </div>
          <div class="text-[11px] text-gray-400 mb-1">Готовый текст для отправки другу:</div>
          <div id="referral-invite-text" class="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 whitespace-pre-wrap"></div>
          <button id="copy-invite-btn" type="button" class="w-full py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-medium">
            Скопировать текст приглашения
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-1">🔔 Уведомления</div>
          <div class="text-[11px] text-gray-400 mb-3">Уведомления приходят только с 9:00 до 21:00 по Москве — ночью и рано утром бот вас не побеспокоит, сообщения просто придут чуть позже, как только окно откроется.</div>

          <div class="flex items-center justify-between gap-3 py-2 border-t border-gray-50">
            <div>
              <div class="text-sm text-gray-800">Заказы и оплаты</div>
              <div class="text-[11px] text-gray-400">Оформление, смена статуса доставки, платежи</div>
            </div>
            <div id="notify-orders-payments-toggle" class="toggle-switch on" data-key="ordersPayments"><div class="knob"></div></div>
          </div>

          <div class="flex items-center justify-between gap-3 py-2 border-t border-gray-50">
            <div>
              <div class="text-sm text-gray-800">Ответы на вопросы</div>
              <div class="text-[11px] text-gray-400">Когда менеджер отвечает на ваш вопрос по заказу</div>
            </div>
            <div id="notify-question-answers-toggle" class="toggle-switch on" data-key="questionAnswers"><div class="knob"></div></div>
          </div>

          <div class="flex items-center justify-between gap-3 py-2 border-t border-gray-50">
            <div>
              <div class="text-sm text-gray-800">Конкурсы и розыгрыши</div>
              <div class="text-[11px] text-gray-400">Отмена билета, победа, итоги розыгрыша</div>
            </div>
            <div id="notify-lottery-toggle" class="toggle-switch on" data-key="lottery"><div class="knob"></div></div>
          </div>
        </div>
      </main>
    `;

    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await loadAll();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    loadAll();

    async function loadAll() {
      await Promise.all([loadCreditBalance(), loadReferralInfo(), loadNotificationSettings()]);
    }

    async function loadCreditBalance() {
      try {
        const amount = await callServer('getMyCreditBalance');
        const card = document.getElementById('credit-card');
        if (amount > 0) {
          document.getElementById('credit-amount').textContent = `${amount.toFixed(2)} ₽`;
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      } catch (error) {
        // Тихий фейл — кредит не критичен для остального экрана, карточка
        // просто останется скрытой (тот же принцип, что и её "нет остатка").
        console.error('getMyCreditBalance:', error.message);
      }
    }

    async function loadReferralInfo() {
      try {
        const info = await callServer('getReferralInfo');
        document.getElementById('sovy-progress-label').textContent = `${info.balance.sovyProgress}/100`;
        document.getElementById('sovy-progress-bar').style.width = `${info.balance.sovyProgress}%`;
        document.getElementById('tickets-count').textContent = info.balance.tickets;

        const referralText = document.getElementById('referral-text');
        const referralInput = document.getElementById('referral-link-input');
        const inviteTextBlock = document.getElementById('referral-invite-text');
        if (info.link) {
          referralText.textContent = `Друг получит ${info.inviteeReward} сов сразу, а вы — ${info.referrerReward} сов за его первый оплаченный заказ.`;
          referralInput.value = info.link;
          inviteTextBlock.textContent = buildInviteText(info.link);
        } else {
          referralText.textContent = 'Не удалось собрать ссылку, попробуйте обновить страницу.';
          referralInput.value = '';
          inviteTextBlock.textContent = '';
        }
      } catch (error) {
        document.getElementById('referral-text').textContent = `Ошибка загрузки: ${error.message}`;
      }
    }

    // Готовый текст приглашения (черновик согласован с VASY, 12.08.2026) —
    // отдельно от голой ссылки, чтобы клиенту не нужно было придумывать
    // сопроводительный текст самому.
    function buildInviteText(link) {
      return `Привет! Я заказываю через бот "Кнопка" — удобно следить за заказом и статусом доставки прямо в Telegram. Переходи по ссылке, и мы оба получим бонус: ${link}`;
    }

    document.getElementById('copy-referral-btn').addEventListener('click', async () => {
      const input = document.getElementById('referral-link-input');
      if (!input.value) return;
      try {
        await navigator.clipboard.writeText(input.value);
        showSaveToast(true, 'Ссылка скопирована');
      } catch (error) {
        input.select();
        showSaveToast(false, 'Не удалось скопировать — выделите ссылку вручную');
      }
    });

    document.getElementById('copy-invite-btn').addEventListener('click', async () => {
      const text = document.getElementById('referral-invite-text').textContent;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showSaveToast(true, 'Текст приглашения скопирован');
      } catch (error) {
        showSaveToast(false, 'Не удалось скопировать — выделите текст вручную');
      }
    });

    // --- Настройки уведомлений (Подфаза 3.3, 12.08.2026) ---
    const notifyToggles = {
      ordersPayments: document.getElementById('notify-orders-payments-toggle'),
      questionAnswers: document.getElementById('notify-question-answers-toggle'),
      lottery: document.getElementById('notify-lottery-toggle')
    };
    let notifyPrefs = { ordersPayments: true, questionAnswers: true, lottery: true };

    async function loadNotificationSettings() {
      try {
        notifyPrefs = await callServer('getMyNotificationSettings');
        Object.keys(notifyToggles).forEach((key) => {
          notifyToggles[key].classList.toggle('on', !!notifyPrefs[key]);
        });
      } catch (error) {
        console.error('getMyNotificationSettings:', error.message);
      }
    }

    Object.entries(notifyToggles).forEach(([key, toggle]) => {
      toggle.addEventListener('click', async () => {
        const next = !notifyPrefs[key];
        toggle.classList.toggle('on', next);
        try {
          notifyPrefs = await callServer('setMyNotificationSettings', { [key]: next });
        } catch (error) {
          toggle.classList.toggle('on', notifyPrefs[key]); // откат при ошибке
          showSaveToast(false, `Не удалось изменить настройку: ${error.message}`);
        }
      });
    });
  }
};
