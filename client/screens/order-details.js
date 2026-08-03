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

    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
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
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 mt-3">
            <span id="d-status-delivery" class="text-[11px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700"></span>
            <span id="d-status-order" class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700"></span>
          </div>
          <div class="text-[13px] text-gray-500 mt-3 space-y-1">
            <div>Дата заказа: <span id="d-date-order"></span></div>
            <div id="d-date-received-row" class="hidden">Дата получения: <span id="d-date-received"></span></div>
            <div id="d-duration-row" class="hidden">Доставка заняла: <span id="d-duration"></span></div>
          </div>
          <div id="d-collective-row"
            class="hidden mt-3 p-3 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-sm"></div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-700 mb-2">Оплаты</div>
          <div id="d-payments-list" class="space-y-2"></div>
        </div>

        <button id="ask-question-btn" type="button"
          class="w-full mt-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-medium">
          Задать вопрос по заказу
        </button>
      </main>

      <div id="question-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Вопрос по заказу</h2>
            <button id="question-modal-close" class="p-1 text-gray-400 hover:text-gray-600">
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
        render(d);
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
      const productImage = document.getElementById('d-product-image');
      if (d.imageUrl) {
        productImage.src = d.imageUrl;
        productImage.classList.remove('hidden');
        productImage.addEventListener('error', () => productImage.classList.add('hidden'), { once: true });
      }
      document.getElementById('d-status-delivery').textContent = d.statusDelivery || '—';
      document.getElementById('d-status-order').textContent = d.statusOrder || '—';
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

      if (d.payments.lines.length === 0) {
        list.innerHTML = '<div class="text-sm text-green-600 font-medium">Все платежи получены, спасибо!</div>';
      } else {
        d.payments.lines.forEach(line => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between text-sm';
          let valueHtml;
          if (line.status === 'paid') {
            valueHtml = `<span class="text-green-600 font-medium">${line.sum.toFixed(2)} ₽ оплачено</span>`;
          } else if (line.status === 'owed') {
            valueHtml = `<span class="text-red-500 font-medium">${line.sum.toFixed(2)} ₽ к оплате</span>`;
          } else {
            valueHtml = `<span class="text-amber-500 font-medium">Уточняется</span>`;
          }
          row.innerHTML = `<span class="text-gray-600">${line.label}</span>${valueHtml}`;
          list.appendChild(row);
        });

        if (d.payments.totalOwed > 0) {
          const totalRow = document.createElement('div');
          totalRow.className = 'flex items-center justify-between text-sm font-semibold pt-2 mt-2 border-t border-gray-100';
          totalRow.innerHTML = `<span>Итого к оплате</span><span class="text-red-600">${d.payments.totalOwed.toFixed(2)} ₽</span>`;
          list.appendChild(totalRow);
        }
      }

      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('app-content').classList.remove('hidden');
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
  }
};
