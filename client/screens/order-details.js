'use strict';

/**
 * Экран "Детали заказа" — перенесён из client/order-details.html (Phase 2 SPA,
 * 02.08.2026). orderId теперь приходит из params роутера (маршрут
 * #/order-details/<orderId>), а не из URLSearchParams(location.search).
 * showSaveToast — общая функция из router.js, локальная копия удалена.
 */
window.Screens = window.Screens || {};
window.Screens.orderDetails = {
  render(root, context, params) {
    const currentOrderId = params.orderId || null;
    let currentDetails = null; // getClientOrderDetails, нужен модалке "Сообщить об оплате" (isNewModel/stagesBalance)

    const STAGE_LABELS = {
      'Основная': 'Основная оплата',
      'Вес': 'Вес',
      'СДЭК': 'СДЭК (КЗ→РФ)',
      'Доставка_РФ': 'Доставка по РФ',
      'СДЭК_Индивидуальная': 'СДЭК (индивидуальная)'
    };
    const stageLabel = (stage) => (stage || '').split('/').map((s) => STAGE_LABELS[s] || s).join(' / ');

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Заказ</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';

    root.innerHTML = `
      <div id="order-not-found-screen" class="hidden fixed inset-0 bg-[#f3f4f9] items-center justify-center z-50 px-6">
        <div class="text-center">
          <p class="text-gray-500 text-sm mb-3">Заказ не найден.</p>
          <button type="button" id="back-to-orders-btn" class="text-indigo-600 text-sm font-medium">← Вернуться к списку</button>
        </div>
      </div>

      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
          <div class="flex items-start gap-3">
            <img id="d-product-image" src="" alt="" class="hidden w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-100">
            <div class="min-w-0 flex-1">
              <div id="d-product" class="font-semibold text-gray-900 text-lg"></div>
              <div id="d-product-original" class="text-[12px] text-gray-400 mt-0.5"></div>
              <div id="d-order-id" class="text-[11px] text-gray-300 mt-0.5"></div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 mt-3">
            <span id="d-status-delivery" class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700"></span>
            <span id="d-status-order" class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700"></span>
          </div>
          <div id="d-delivery-ladder" class="mt-3"></div>
          <div class="text-[13px] text-gray-500 mt-3 space-y-1">
            <div>Дата заказа: <span id="d-date-order"></span></div>
            <div id="d-date-received-row" class="hidden">Дата получения: <span id="d-date-received"></span></div>
            <div id="d-duration-row" class="hidden">Доставка заняла: <span id="d-duration"></span></div>
          </div>
          <div id="d-collective-row"
            class="hidden mt-3 p-3 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-sm"></div>
          <div id="d-sov-info" class="hidden mt-3 text-[12px] text-amber-600"></div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-700 mb-2">Оплаты</div>
          <div id="d-payments-list" class="space-y-2"></div>
        </div>

        <div id="d-rollup-card" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mt-3">
          <div id="d-order-rollup" class="text-sm"></div>
          <div id="d-pool-rollup" class="hidden text-sm mt-3 pt-3 border-t border-gray-100"></div>
        </div>

        <button id="report-payment-btn" type="button"
          class="w-full mt-4 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-medium">
          Сообщить об оплате
        </button>

        <button id="ask-question-btn" type="button"
          class="w-full mt-3 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-medium">
          Задать вопрос по заказу
        </button>
      </main>

      <div id="question-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Вопрос по заказу</h2>
            <button id="question-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4">
            <textarea id="question-text-input" rows="4" maxlength="300"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
              placeholder="Опишите ваш вопрос..."></textarea>
            <div class="text-right text-[10px] text-gray-400 mt-1" id="question-counter">0/300</div>
            <div id="question-error-text" class="text-xs text-red-500 hidden mt-1"></div>
          </div>

          <div id="question-rate-limit-banner" class="hidden mx-4 mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="question-cancel-btn"
              class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="question-send-btn"
              class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
          </div>
        </div>
      </div>

      <!-- Модалка "Сообщить об оплате" (F3, self-report, 11.08.2026) — амаунт + текст/ссылка,
           без загрузки файла (известное ограничение проекта, не решается здесь).
           Менеджер одобряет/отклоняет в админке. -->
      <div id="report-payment-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Сообщить об оплате</h2>
            <button id="rp-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p class="text-xs text-gray-400">Укажите сумму и приложите текст/ссылку, подтверждающую перевод — менеджер проверит и подтвердит платёж.</p>
            <div>
              <label class="text-xs font-medium text-gray-500">Сумма перевода, ₽</label>
              <input type="number" id="rp-modal-amount" step="0.01" min="0.01"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="0.00">
            </div>
            <div id="rp-modal-scope-row" class="hidden">
              <label class="text-xs font-medium text-gray-500">За что</label>
              <div class="flex gap-2 mt-1">
                <label class="flex-1 flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs cursor-pointer">
                  <input type="radio" name="rp-modal-scope" value="order" checked> Только за этот заказ
                </label>
                <label class="flex-1 flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs cursor-pointer">
                  <input type="radio" name="rp-modal-scope" value="pool"> За все мои заказы
                </label>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Текст или ссылка на подтверждение</label>
              <textarea id="rp-modal-proof" rows="3" maxlength="500"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Например: ссылка на чек или скриншот, либо описание перевода"></textarea>
            </div>
            <p id="rp-modal-error" class="text-xs text-red-500 hidden"></p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="rp-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="rp-modal-send" class="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium">Отправить</button>
          </div>
        </div>
      </div>
    `;

    // <button> + click-обработчики вместо <a href> — Telegram WebView может
    // перехватывать клики по <a href> как переход/перезагрузку контейнера
    // мини-аппа (см. router.js). Тот же принцип для javascript:history.back().
    document.getElementById('back-btn').addEventListener('click', () => history.back());
    document.getElementById('back-to-orders-btn').addEventListener('click', () => navigateTo('orders'));

    if (!currentOrderId) {
      showNotFound();
      return;
    }

    initApp();

    async function initApp() {
      try {
        const d = await callServer('getClientOrderDetails', currentOrderId);
        currentDetails = d;
        render(d);
        // Пул-уровень (F3-довесок) — отдельный, не блокирующий запрос: если он
        // упадёт, экран заказа всё равно должен открыться нормально (это
        // дополнительная, не критичная информация).
        callServer('getMyPaymentsRollup').then(renderPoolRollup).catch(() => {});
      } catch (error) {
        showNotFound();
      }
    }

    function showNotFound() {
      document.getElementById('loading-screen').classList.add('hidden');
      const notFound = document.getElementById('order-not-found-screen');
      notFound.classList.remove('hidden');
      notFound.classList.add('flex');
    }

    function render(d) {
      document.getElementById('d-product').textContent = d.productDisplay;
      document.getElementById('d-product-original').textContent = d.productOriginal || '';
      document.getElementById('d-order-id').textContent = `№ ${d.orderId}`;

      // Sov-инфо (B, client_display_overhaul, 12.08.2026) — формула считается
      // на бэкенде (ordersService.computeSovInfoAmount), здесь только рендер.
      const sovBox = document.getElementById('d-sov-info');
      if (d.sovInfo && d.sovInfo.amount > 0) {
        sovBox.textContent = d.sovInfo.accrued
          ? `🎟️ ${d.sovInfo.amount} сов начислено за этот заказ`
          : `🎟️ +${d.sovInfo.amount} сов при полной оплате основной суммы`;
        sovBox.classList.remove('hidden');
      } else {
        sovBox.classList.add('hidden');
      }
      const productImage = document.getElementById('d-product-image');
      if (d.imageUrl) {
        productImage.src = d.imageUrl;
        productImage.classList.remove('hidden');
        productImage.addEventListener('error', () => productImage.classList.add('hidden'), { once: true });
      }
      document.getElementById('d-status-delivery').textContent = d.statusDelivery || '—';
      document.getElementById('d-status-order').textContent = d.statusOrder || '—';
      document.getElementById('d-delivery-ladder').innerHTML = buildDeliveryLadder(d.deliveryLadder, d.statusDelivery, {});
      document.getElementById('d-date-order').textContent = d.dateOrderDisplay || '—';

      if (d.dateReceivedDisplay) {
        document.getElementById('d-date-received-row').classList.remove('hidden');
        document.getElementById('d-date-received').textContent = d.dateReceivedDisplay;
      }
      if (d.durationDisplay) {
        document.getElementById('d-duration-row').classList.remove('hidden');
        document.getElementById('d-duration').textContent = d.durationDisplay;
      }
      if (d.collectiveLabel) {
        const row = document.getElementById('d-collective-row');
        row.textContent = `В составе отправки: ${d.collectiveLabel}`;
        row.classList.remove('hidden');
      }

      const list = document.getElementById('d-payments-list');
      list.innerHTML = '';

      // New-model: старый булево-флаговый список (d.payments.lines) может
      // честно показывать "Нет" даже когда деньги уже реально лежат в пуле,
      // просто ждут, пока весь тир (по ВСЕМ открытым заказам клиента) наберётся
      // целиком (tier-batch, §19 личной памяти Architect'а) — тот же класс
      // путаницы, что уже чинили на админском экране «Оплаты». Показываем
      // здесь честную картину из d-rollup-card (renderOrderRollup ниже,
      // считана из d.stagesBalance) вместо дублирующего/противоречащего списка.
      // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 4): раньше здесь была одна
      // фраза-заглушка "Разбивка по оплате — ниже", которая указывала на
      // d-rollup-card ниже — но тот блок показывает только ИТОГ и
      // приоритетную стадию, не разбивку по каждому этапу. Теперь настоящий
      // список этапов (d.stagesBalance — уже приходит с сервера, новый
      // сетевой вызов не нужен), с прогресс-баром на каждый, тем же
      // визуальным языком, что sov-прогресс на client/screens/profile.js.
      if (d.isNewModel) {
        const known = (d.stagesBalance || []).filter((s) => s.target > 0);
        if (known.length === 0) {
          list.innerHTML = '<div class="text-sm text-gray-400">Стоимость этапов ещё не рассчитана менеджером.</div>';
        } else {
          const firstUncovered = known.find((s) => !s.covered);
          known.forEach((s) => {
            const pct = Math.max(0, Math.min(100, Math.round((s.paid / s.target) * 100)));
            const isPriority = firstUncovered && s.stage === firstUncovered.stage;
            const row = document.createElement('div');
            row.className = `mb-2.5 last:mb-0${isPriority ? ' -mx-2 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200' : ''}`;
            row.innerHTML = `
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="text-gray-600 flex items-center gap-1">${isPriority ? '<i data-lucide="alert-circle" class="w-3.5 h-3.5 text-amber-500"></i>' : ''}${escapeHtmlClient(stageLabel(s.stage))}${s.isForecast ? ' <span class="text-[10px] text-gray-400">(предварительно)</span>' : ''}</span>
                <span class="${s.covered ? 'text-green-600' : 'text-gray-700'} font-medium">${s.paid.toFixed(2)} / ${s.target.toFixed(2)} ₽</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full rounded-full transition-all ${s.covered ? 'bg-green-500' : 'bg-indigo-500'}" style="width:${pct}%"></div>
              </div>
            `;
            list.appendChild(row);
          });
          if (window.lucide) window.lucide.createIcons();
        }
      } else if (d.payments.lines.length === 0) {
        list.innerHTML = '<div class="text-sm text-green-600 font-medium">Все платежи получены, спасибо!</div>';
      } else {
        d.payments.lines.forEach(line => {
          const row = document.createElement('div');
          let valueHtml;
          // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 4): "Уточняется" раньше было
          // голым словом без контекста — клиент не понимал, ждать ли ему
          // чего-то или это ошибка. Подпись под строкой только для этого
          // статуса (status:'unclear' — ordersService.calculatePaymentStatus,
          // сумма этапа менеджером ещё не введена).
          if (line.status === 'paid') {
            valueHtml = `<span class="text-green-600 font-medium">${line.sum.toFixed(2)} ₽ оплачено</span>`;
          } else if (line.status === 'owed') {
            valueHtml = `<span class="text-red-500 font-medium">${line.sum.toFixed(2)} ₽ к оплате</span>`;
          } else {
            valueHtml = `<span class="text-amber-500 font-medium">Уточняется</span>`;
          }
          row.innerHTML = `
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">${line.label}</span>${valueHtml}
            </div>
            ${line.status === 'unclear' ? '<div class="text-[11px] text-gray-400 mt-0.5">Менеджер ещё не рассчитал точную стоимость этого этапа</div>' : ''}
          `;
          list.appendChild(row);
        });

        if (d.payments.totalOwed > 0) {
          const totalRow = document.createElement('div');
          totalRow.className = 'flex items-center justify-between text-sm font-semibold pt-2 mt-2 border-t border-gray-100';
          totalRow.innerHTML = `<span>Итого к оплате</span><span class="text-red-600">${d.payments.totalOwed.toFixed(2)} ₽</span>`;
          list.appendChild(totalRow);
        }
      }

      renderOrderRollup(d);

      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('app-content').classList.remove('hidden');
    }

    // ИСПРАВЛЕНО 16.08.2026 (UX-аудит, Шаг 4): "Приоритетно сейчас" была
    // просто амбер-текстом — единственный самый важный call-to-action на
    // экране визуально не выделялся среди прочих строк. Общий хелпер для
    // обоих rollup-блоков (за заказ / за весь пул), чтобы не расходиться.
    function priorityLineHtml(amount, stage) {
      return `
        <div class="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
          <i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0"></i>
          <span>Приоритетно сейчас: <b>${amount.toFixed(2)} ₽</b> (${escapeHtmlClient(stageLabel(stage))})</span>
        </div>
      `;
    }

    // --- "Сумма/приоритетная сумма" за заказ (F3-довесок, 11.08.2026) ---
    // За ЭТОТ заказ — бесплатно, чистая фронтенд-арифметика над уже
    // отданным d.stagesBalance (массив УЖЕ в приоритетном порядке, §3) —
    // никакой новой бизнес-логики здесь не считается, только сумма/поиск
    // первой непокрытой стадии. Только new-model — у старой модели нет
    // partial-tracking по стадиям (см. d.payments.lines выше).
    function renderOrderRollup(d) {
      const card = document.getElementById('d-rollup-card');
      const orderBox = document.getElementById('d-order-rollup');
      if (!d.isNewModel || !d.stagesBalance || d.stagesBalance.length === 0) {
        orderBox.innerHTML = '';
        updateRollupCardVisibility();
        return;
      }
      const known = d.stagesBalance.filter((s) => s.target > 0);
      if (known.length === 0) { orderBox.innerHTML = ''; updateRollupCardVisibility(); return; }

      const totalRemaining = known.reduce((sum, s) => sum + Math.max(s.remaining, 0), 0);
      const priority = known.find((s) => s.remaining > 0.01);

      if (totalRemaining <= 0.01) {
        orderBox.innerHTML = '<div class="text-green-600 font-medium">По этому заказу всё оплачено.</div>';
      } else {
        orderBox.innerHTML = `
          <div class="text-gray-500 text-[11px]">По этому заказу</div>
          <div class="flex items-baseline gap-2 mt-0.5">
            <span class="text-lg font-bold text-gray-900">${totalRemaining.toFixed(2)} ₽</span>
            <span class="text-[12px] text-gray-400">осталось к оплате</span>
          </div>
          ${priority ? priorityLineHtml(priority.remaining, priority.stage) : ''}
        `;
      }
      if (window.lucide) window.lucide.createIcons();
      updateRollupCardVisibility();
    }

    // Пул-уровень — через getMyPaymentsRollup (paymentsService.getClientPaymentsRollup),
    // кросс-заказный, учитывает tier-batch блокировку (§19) по ВСЕМ открытым
    // заказам новой модели клиента, не только текущему — считается на бэкенде
    // намеренно, не на фронте (см. личную память Architect'а
    // project_bot_knopka_staged_payments_refactor, §17 продолжение).
    function renderPoolRollup(rollup) {
      const box = document.getElementById('d-pool-rollup');
      if (!rollup || rollup.totalRemaining <= 0.01) { box.classList.add('hidden'); updateRollupCardVisibility(); return; }
      box.innerHTML = `
        <div class="text-gray-500 text-[11px]">По всем вашим заказам новой модели</div>
        <div class="flex items-baseline gap-2 mt-0.5">
          <span class="text-lg font-bold text-gray-900">${rollup.totalRemaining.toFixed(2)} ₽</span>
          <span class="text-[12px] text-gray-400">осталось к оплате всего</span>
        </div>
        ${rollup.priorityAmount > 0.01 ? priorityLineHtml(rollup.priorityAmount, rollup.priorityStage) : ''}
      `;
      box.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
      updateRollupCardVisibility();
    }

    function updateRollupCardVisibility() {
      const card = document.getElementById('d-rollup-card');
      const hasOrderBox = document.getElementById('d-order-rollup').innerHTML.trim() !== '';
      const hasPoolBox = !document.getElementById('d-pool-rollup').classList.contains('hidden');
      card.classList.toggle('hidden', !hasOrderBox && !hasPoolBox);
    }

    // --- Форма "Вопрос по заказу" ---
    const questionModal = document.getElementById('question-modal');
    const questionTextInput = document.getElementById('question-text-input');
    const questionCounter = document.getElementById('question-counter');
    const questionErrorText = document.getElementById('question-error-text');

    document.getElementById('ask-question-btn').addEventListener('click', () => {
      questionTextInput.value = '';
      questionCounter.textContent = '0/300';
      questionErrorText.classList.add('hidden');
      document.getElementById('question-rate-limit-banner').classList.add('hidden');
      questionModal.classList.remove('hidden');
      questionModal.classList.add('flex');
    });

    function closeQuestionModal() {
      questionModal.classList.add('hidden');
      questionModal.classList.remove('flex');
    }
    document.getElementById('question-modal-close').addEventListener('click', closeQuestionModal);
    document.getElementById('question-cancel-btn').addEventListener('click', closeQuestionModal);

    questionTextInput.addEventListener('input', (e) => {
      questionCounter.textContent = `${e.target.value.length}/300`;
    });

    document.getElementById('question-send-btn').addEventListener('click', async () => {
      const text = questionTextInput.value.trim();
      questionErrorText.classList.add('hidden');
      document.getElementById('question-rate-limit-banner').classList.add('hidden');

      if (text === '') {
        questionErrorText.textContent = 'Введите текст вопроса.';
        questionErrorText.classList.remove('hidden');
        return;
      }

      const requestId = generateRequestId();

      try {
        await callServer('submitOrderQuestion', currentOrderId, text, requestId);
        closeQuestionModal();
        showSaveToast(true, 'Вопрос отправлен');
      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          const banner = document.getElementById('question-rate-limit-banner');
          banner.textContent = 'Вы уже отправляли вопрос недавно — повторите через 30 секунд.';
          banner.classList.remove('hidden');
        } else {
          questionErrorText.textContent = error.message;
          questionErrorText.classList.remove('hidden');
        }
      }
    });

    // --- Форма "Сообщить об оплате" (F3, self-report) ---
    const reportModal = document.getElementById('report-payment-modal');
    const rpModalAmount = document.getElementById('rp-modal-amount');
    const rpModalProof = document.getElementById('rp-modal-proof');
    const rpModalScopeRow = document.getElementById('rp-modal-scope-row');
    const rpModalError = document.getElementById('rp-modal-error');

    document.getElementById('report-payment-btn').addEventListener('click', () => {
      rpModalAmount.value = '';
      rpModalProof.value = '';
      rpModalError.classList.add('hidden');
      // Scope-выбор — только когда ЭТОТ заказ new-model (§17 E.3, точка входа
      // всегда экран конкретного заказа, без отдельной "свободной" точки
      // входа — упрощение, согласованное с VASY). Old-model — scope всегда
      // "этот заказ", выбор не нужен (нет кросс-заказного пула для старой модели).
      const isNewModel = currentDetails && currentDetails.isNewModel;
      rpModalScopeRow.classList.toggle('hidden', !isNewModel);
      if (isNewModel) {
        const orderRadio = reportModal.querySelector('input[name="rp-modal-scope"][value="order"]');
        if (orderRadio) orderRadio.checked = true;
      }
      reportModal.classList.remove('hidden');
      reportModal.classList.add('flex');
    });

    function closeReportModal() {
      reportModal.classList.add('hidden');
      reportModal.classList.remove('flex');
    }
    document.getElementById('rp-modal-close').addEventListener('click', closeReportModal);
    document.getElementById('rp-modal-cancel').addEventListener('click', closeReportModal);

    document.getElementById('rp-modal-send').addEventListener('click', async () => {
      rpModalError.classList.add('hidden');
      const amount = parseFloat(rpModalAmount.value);
      if (isNaN(amount) || amount <= 0) {
        rpModalError.textContent = 'Укажите сумму больше нуля.';
        rpModalError.classList.remove('hidden');
        return;
      }
      const proofText = rpModalProof.value.trim();
      if (proofText === '') {
        rpModalError.textContent = 'Добавьте текст или ссылку, подтверждающую перевод.';
        rpModalError.classList.remove('hidden');
        return;
      }

      const isNewModel = currentDetails && currentDetails.isNewModel;
      const scopeChoice = isNewModel
        ? (reportModal.querySelector('input[name="rp-modal-scope"]:checked') || {}).value
        : 'order';
      const scopeOrderId = scopeChoice === 'pool' ? null : currentOrderId;

      const sendBtn = document.getElementById('rp-modal-send');
      sendBtn.disabled = true;
      try {
        await callServer('submitPaymentClaim', amount, proofText, scopeOrderId, generateRequestId());
        closeReportModal();
        showSaveToast(true, 'Заявка отправлена, менеджер проверит платёж');
      } catch (error) {
        rpModalError.textContent = error.message;
        rpModalError.classList.remove('hidden');
      } finally {
        sendBtn.disabled = false;
      }
    });
  }
};
