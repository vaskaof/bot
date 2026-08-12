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
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <span>💰</span><span>Кредитный баланс</span>
          </div>
          <div id="credit-amount" class="text-xl font-semibold text-gray-900">0 ₽</div>
          <div class="text-[11px] text-gray-400 mt-1">Заморожен, пока нет открытых заказов — применяется вручную по согласованию с менеджером.</div>

          <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1 mt-3 pt-3 border-t border-gray-50">
            <span>⏳</span><span>На распределении</span>
          </div>
          <div id="pool-leftover-amount" class="text-xl font-semibold text-gray-900">0 ₽</div>
          <div class="text-[11px] text-gray-400 mt-1">Деньги уже в пуле, но пока не покрыли очередной этап оплаты целиком — как только накопится нужная сумма, менеджер их распределит.</div>
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

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">💬 Связь с нами</div>
          <button id="ask-general-question-btn" type="button" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium mb-2">
            Задать общий вопрос
          </button>
          <button id="report-problem-btn" type="button" class="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">
            Сообщить о проблеме или предложить
          </button>
        </div>
      </main>

      <div id="contact-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="contact-modal-title" class="text-base font-semibold text-gray-900">Вопрос</h2>
            <button id="contact-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4">
            <textarea id="contact-text-input" rows="4" maxlength="300"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
              placeholder="Опишите ваш вопрос..."></textarea>
            <div class="text-right text-[10px] text-gray-400 mt-1" id="contact-counter">0/300</div>
            <div id="contact-error-text" class="text-xs text-red-500 hidden mt-1"></div>
          </div>

          <div id="contact-rate-limit-banner" class="hidden mx-4 mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="contact-cancel-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="contact-send-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
          </div>
        </div>
      </div>
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
      await Promise.all([loadCreditBalance(), loadPoolLeftover(), loadReferralInfo(), loadNotificationSettings()]);
    }

    // Карточка балансов — ВСЕГДА видна, включая нулевые значения (VASY,
    // 12.08.2026: "не скрывай нулевые показатели в виде валют" — раньше
    // карточка кредита пряталась при 0 ₽, что читалось как "раздел не
    // работает", а не как "баланс реально нулевой").
    async function loadCreditBalance() {
      try {
        const amount = await callServer('getMyCreditBalance');
        document.getElementById('credit-amount').textContent = `${amount.toFixed(2)} ₽`;
      } catch (error) {
        console.error('getMyCreditBalance:', error.message);
      }
    }

    // "На распределении" — отдельное число от кредита (VASY, 12.08.2026):
    // кредит замораживается только когда у клиента НЕТ открытых заказов;
    // это — деньги, уже лежащие в пуле по открытым заказам, но ещё не
    // покрывшие ни одну стадию оплаты целиком (см. paymentsService.
    // getClientPoolLeftover — тир финансируется целиком-или-никак).
    async function loadPoolLeftover() {
      try {
        const amount = await callServer('getMyPoolLeftover');
        document.getElementById('pool-leftover-amount').textContent = `${amount.toFixed(2)} ₽`;
      } catch (error) {
        console.error('getMyPoolLeftover:', error.message);
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

    // --- Свободная форма вопроса/жалобы (Подфаза 3.4, 12.08.2026) ---
    // Одна и та же серверная функция (submitOrderQuestion, orderId='' — общий
    // вопрос без привязки к заказу), два входа с разными заголовком/плейсхолдером
    // модалки — только для понимания клиентом разницы намерения, см. Round 1 §D.5.
    const contactModal = document.getElementById('contact-modal');
    const contactTitle = document.getElementById('contact-modal-title');
    const contactTextInput = document.getElementById('contact-text-input');
    const contactCounter = document.getElementById('contact-counter');
    const contactErrorText = document.getElementById('contact-error-text');

    function openContactModal(title, placeholder) {
      contactTitle.textContent = title;
      contactTextInput.value = '';
      contactTextInput.placeholder = placeholder;
      contactCounter.textContent = '0/300';
      contactErrorText.classList.add('hidden');
      document.getElementById('contact-rate-limit-banner').classList.add('hidden');
      contactModal.classList.remove('hidden');
      contactModal.classList.add('flex');
    }

    function closeContactModal() {
      contactModal.classList.add('hidden');
      contactModal.classList.remove('flex');
    }

    document.getElementById('ask-general-question-btn').addEventListener('click', () => {
      openContactModal('Задать общий вопрос', 'О чём хотите спросить?');
    });
    document.getElementById('report-problem-btn').addEventListener('click', () => {
      openContactModal('Сообщить о проблеме или предложить', 'Опишите проблему или ваше предложение...');
    });
    document.getElementById('contact-modal-close').addEventListener('click', closeContactModal);
    document.getElementById('contact-cancel-btn').addEventListener('click', closeContactModal);

    contactTextInput.addEventListener('input', (e) => {
      contactCounter.textContent = `${e.target.value.length}/300`;
    });

    document.getElementById('contact-send-btn').addEventListener('click', async () => {
      const text = contactTextInput.value.trim();
      contactErrorText.classList.add('hidden');
      document.getElementById('contact-rate-limit-banner').classList.add('hidden');

      if (text === '') {
        contactErrorText.textContent = 'Введите текст сообщения.';
        contactErrorText.classList.remove('hidden');
        return;
      }

      const requestId = generateRequestId();

      try {
        await callServer('submitOrderQuestion', '', text, requestId);
        closeContactModal();
        showSaveToast(true, 'Сообщение отправлено');
      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          const banner = document.getElementById('contact-rate-limit-banner');
          banner.textContent = 'Вы уже отправляли сообщение недавно — повторите через 30 секунд.';
          banner.classList.remove('hidden');
        } else {
          contactErrorText.textContent = error.message;
          contactErrorText.classList.remove('hidden');
        }
      }
    });
  }
};
