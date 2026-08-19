'use strict';

/**
 * Экран "Мои вопросы" — перенесён из client/questions.html (Phase 2 SPA,
 * 02.08.2026).
 *
 * 17.08.2026 (репорт VASY) — своя фокусная модалка "Задать вопрос" (кнопка
 * в шапке + пустое состояние), раньше уводило на весь экран Профиля. Та же
 * механика, что profile.js's "Задать общий вопрос" (submitOrderQuestion,
 * orderId='').
 *
 * "Оставить отзыв на ответ" (16.08.2026, задания для бета-теста) — не
 * отдельная фича, а UI поверх УЖЕ существующего механизма ручных заданий
 * (см. tasks/tasksService.js): вопрос сам по себе не хранит отзыв, кнопка
 * находит повторяемое ручное задание с названием REVIEW_TASK_TITLE и шлёт
 * submitTaskProof с текстом отзыва, префиксованным ссылкой на вопрос —
 * ЕДИНСТВЕННЫЙ способ на сегодня связать заявку с конкретным вопросом (нет
 * отдельного поля questionId в "Выполнения_Заданий"). Задание должно быть
 * создано в админке ТОЧНО с этим названием, тип "Ручное", "Повторяемое" —
 * иначе кнопка не появится (задание не найдено — тихий skip, не ошибка).
 *
 * ИЗМЕНЕНО 19.08.2026 (п.6 бета-фидбека, round 7) — "Вопросы" стал единым
 * хабом обратной связи. Раньше "Задать общий вопрос"/"Сообщить о проблеме"
 * жили в profile.js (два похожих, но по-разному называющихся входа) и
 * "Сообщить о проблеме" уводило на экран "Конкурсы" (deep-link через
 * sessionStorage) — репорт клиента: "меня перекидывает в конкурсы, и там
 * никаких предложить нет / почему в конкурсы а не в вопросы". Оба входа
 * profile.js УДАЛЕНЫ (см. profile.js) — profile.js теперь просто
 * navigateTo('questions'). Здесь три равноправные кнопки над списком:
 * "Вопрос" (эта же ask-question-modal, без наград), "Проблема"/"Идея" —
 * та же механика заданий, что раньше была в contests.js.openProofModal, но
 * встроена прямо сюда — клиент никогда не покидает "Вопросы" ради этого.
 * Задания "Баг-репорт"/"Предложение" должны быть заведены в админке ТОЧНО
 * с этими названиями, тип "Ручное" — иначе кнопка при клике покажет toast
 * "функция скоро появится", не пытается угадать другое задание.
 */
const REVIEW_TASK_TITLE = 'Оцени ответ на вопрос';
// ИСПРАВЛЕНО 19.08.2026 (после деплоя round 7) — реальное название на живом
// листе "Задания" оказалось "🐞 Сообщи о баге" (с эмодзи), не "Баг-репорт" —
// угадал по памяти проекта, не сверился с текущими данными таблицы. Кнопка
// "Проблема" молча не находила задание и показывала toast "недоступна".
const BUG_REPORT_TASK_TITLE = '🐞 Сообщи о баге';
const SUGGESTION_TASK_TITLE = 'Предложение';

window.Screens = window.Screens || {};
window.Screens.questions = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Мои вопросы</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <!-- Единый хаб обратной связи (19.08.2026, п.6 бета-фидбека) — три
             равноправных входа, ни один не покидает этот экран. -->
        <div class="grid grid-cols-3 gap-2 mb-4">
          <button type="button" id="open-ask-question-btn" class="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm text-indigo-600">
            <i data-lucide="help-circle" class="w-4 h-4"></i>
            <span class="text-[11px] font-medium">Вопрос</span>
          </button>
          <button type="button" id="open-bug-report-btn" class="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm text-indigo-600">
            <i data-lucide="bug" class="w-4 h-4"></i>
            <span class="text-[11px] font-medium">Проблема</span>
          </button>
          <button type="button" id="open-suggestion-btn" class="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm text-indigo-600">
            <i data-lucide="lightbulb" class="w-4 h-4"></i>
            <span class="text-[11px] font-medium">Идея</span>
          </button>
        </div>

        <div id="questions-list"></div>
        <div id="empty-message" class="hidden">
          ${buildEmptyState('message-circle', 'Вы ещё не задавали вопросов по заказам.', { label: 'Задать вопрос', btnId: 'empty-ask-question-btn' })}
        </div>
      </main>

      <div id="ask-question-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Задать вопрос</h2>
            <button id="ask-question-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4">
            <textarea id="ask-question-text-input" rows="4" maxlength="300"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
              placeholder="О чём хотите спросить?"></textarea>
            <div class="text-right text-[10px] text-gray-400 mt-1" id="ask-question-counter">0/300</div>
            <div id="ask-question-error-text" class="text-xs text-red-500 hidden mt-1"></div>
          </div>
          <div id="ask-question-rate-limit-banner" class="hidden mx-4 mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="ask-question-cancel-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="ask-question-send-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
          </div>
        </div>
      </div>

      <!-- Модалка "Проблема"/"Идея" (19.08.2026, п.6) — та же механика, что
           contests.js's openProofModal (submitTaskProof), встроена сюда,
           чтобы клиент не покидал "Вопросы". Заголовок/плейсхолдер задаются
           динамически при открытии, см. openFeedbackTaskModal ниже. -->
      <div id="feedback-task-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="feedback-task-modal-title" class="text-base font-semibold text-gray-900">Отправить</h2>
            <button id="feedback-task-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p id="feedback-task-modal-description" class="text-xs text-gray-500"></p>
            <div>
              <label class="text-xs font-medium text-gray-500">Текст или ссылка *</label>
              <textarea id="feedback-task-text-input" rows="4"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"></textarea>
            </div>
          </div>
          <div id="feedback-task-error-text" class="px-4 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="feedback-task-cancel-btn" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="feedback-task-send-btn" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
          </div>
        </div>
      </div>
    `;

    const listContainer = document.getElementById('questions-list');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');

    // 17.08.2026 (репорт VASY) — раньше "Задать вопрос" уводило на весь
    // экран Профиля, где форма была лишь одной из нескольких. Теперь у
    // экрана "Вопросы" своя фокусная модалка — та же механика
    // (submitOrderQuestion, orderId='' — вопрос без привязки к заказу), что
    // profile.js's "Задать общий вопрос", просто доступна сразу здесь, и не
    // только когда список пуст (кнопка в шапке — всегда).
    const askModal = document.getElementById('ask-question-modal');
    const askTextInput = document.getElementById('ask-question-text-input');
    const askCounter = document.getElementById('ask-question-counter');
    const askErrorText = document.getElementById('ask-question-error-text');
    const askSendBtn = document.getElementById('ask-question-send-btn');

    function openAskModal() {
      askTextInput.value = '';
      askCounter.textContent = '0/300';
      askErrorText.classList.add('hidden');
      document.getElementById('ask-question-rate-limit-banner').classList.add('hidden');
      askModal.classList.remove('hidden');
      askModal.classList.add('flex');
    }
    function closeAskModal() {
      askModal.classList.add('hidden');
      askModal.classList.remove('flex');
    }

    document.getElementById('open-ask-question-btn').addEventListener('click', openAskModal);
    document.getElementById('empty-ask-question-btn').addEventListener('click', openAskModal);
    document.getElementById('ask-question-modal-close').addEventListener('click', closeAskModal);
    document.getElementById('ask-question-cancel-btn').addEventListener('click', closeAskModal);
    askTextInput.addEventListener('input', (e) => {
      askCounter.textContent = `${e.target.value.length}/300`;
    });
    askSendBtn.addEventListener('click', async () => {
      if (askSendBtn.disabled) return;
      const text = askTextInput.value.trim();
      askErrorText.classList.add('hidden');
      document.getElementById('ask-question-rate-limit-banner').classList.add('hidden');
      if (text === '') {
        askErrorText.textContent = 'Введите текст вопроса.';
        askErrorText.classList.remove('hidden');
        return;
      }
      const requestId = generateRequestId();
      askSendBtn.disabled = true;
      try {
        await callServer('submitOrderQuestion', '', text, requestId);
        closeAskModal();
        showSaveToast(true, 'Вопрос отправлен');
        loadQuestions();
      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          const banner = document.getElementById('ask-question-rate-limit-banner');
          banner.textContent = 'Вы уже отправляли сообщение недавно — повторите через 30 секунд.';
          banner.classList.remove('hidden');
        } else {
          askErrorText.textContent = error.message;
          askErrorText.classList.remove('hidden');
        }
      } finally {
        askSendBtn.disabled = false;
      }
    });

    let reviewTask = null; // повторяемое ручное задание "Оцени ответ на вопрос", если заведено
    let bugReportTask = null; // ручное задание "Баг-репорт", если заведено (кнопка "Проблема")
    let suggestionTask = null; // ручное задание "Предложение", если заведено (кнопка "Идея")

    loadQuestions();

    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      loadQuestions().finally(() => {
        const liveIcon = refreshBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      });
    });

    async function loadQuestions() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const [questions, tasks] = await Promise.all([
          callServer('getClientQuestionsList'),
          // Не критично для экрана — сбой не должен ломать список вопросов.
          callServer('getTasksList').catch(() => [])
        ]);
        reviewTask = tasks.find(t => t.title === REVIEW_TASK_TITLE && t.type === 'Ручное' && t.repeatable) || null;
        bugReportTask = tasks.find(t => t.title === BUG_REPORT_TASK_TITLE && t.type === 'Ручное') || null;
        suggestionTask = tasks.find(t => t.title === SUGGESTION_TASK_TITLE && t.type === 'Ручное') || null;
        render(questions);
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function render(questions) {
      listContainer.innerHTML = '';

      if (questions.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      questions.forEach(q => listContainer.appendChild(buildCard(q)));
    }

    function buildCard(q) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(q.productDisplay)}</div>
          <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(q.createdAtDisplay)}</div>
        </div>
        <div class="text-[14px] text-gray-700 mt-2">${escapeHtmlClient(q.text)}</div>
        ${q.status === 'Отвечено'
          ? `<div class="mt-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-[13px] text-indigo-800"><b>Ответ менеджера:</b> ${escapeHtmlClient(q.answer)}</div>`
          : `<div class="mt-2 text-[12px] text-amber-500 font-medium">Ожидает ответа</div>`}
      `;

      if (q.status === 'Отвечено' && reviewTask) {
        const reviewBtn = document.createElement('button');
        reviewBtn.type = 'button';
        reviewBtn.className = 'mt-2 w-full py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-medium';
        reviewBtn.textContent = `Оставить отзыв на ответ (+${reviewTask.reward} сов)`;
        reviewBtn.addEventListener('click', async () => {
          const reviewText = (prompt('Что скажете об ответе менеджера? Было ли уведомление понятным, ответ полезным, что улучшить:', '') || '').trim();
          if (reviewText === '') return;
          if (reviewBtn.disabled) return;
          reviewBtn.disabled = true;
          try {
            const questionRef = q.text ? q.text.slice(0, 60) : q.productDisplay;
            await callServer('submitTaskProof', reviewTask.taskId, `[Вопрос: "${questionRef}"] ${reviewText}`);
            showSaveToast(true, 'Спасибо за отзыв! Отправлен на проверку.');
          } catch (error) {
            showSaveToast(false, `Не удалось отправить: ${error.message}`);
          } finally {
            reviewBtn.disabled = false;
          }
        });
        card.appendChild(reviewBtn);
      }

      return card;
    }

    // --- Модалка "Проблема"/"Идея" (19.08.2026, п.6) ---
    // Тот же паттерн, что contests.js's openProofModal (submitTaskProof),
    // встроенный сюда, чтобы клиент не покидал "Вопросы".
    const feedbackModal = document.getElementById('feedback-task-modal');
    const feedbackModalTitle = document.getElementById('feedback-task-modal-title');
    const feedbackModalDescription = document.getElementById('feedback-task-modal-description');
    const feedbackTextInput = document.getElementById('feedback-task-text-input');
    const feedbackErrorText = document.getElementById('feedback-task-error-text');
    const feedbackSendBtn = document.getElementById('feedback-task-send-btn');
    let activeFeedbackTask = null;

    const DEFAULT_FEEDBACK_PLACEHOLDER = 'Опишите, что вы сделали — текстом, ссылкой или тем и другим сразу';

    function openFeedbackTaskModal(title, task) {
      // Задание не заведено в админке (точным названием/типом) — тихий
      // отказ с объяснением, а не молчание и не переход в неожиданное
      // место (та же жалоба из п.6: "почему в конкурсы а не в вопросы" —
      // здесь мы просто остаёмся на месте и говорим прямо).
      if (!task) {
        showSaveToast(false, 'Эта функция сейчас недоступна — загляните позже');
        return;
      }
      activeFeedbackTask = task;
      feedbackModalTitle.textContent = title;
      feedbackModalDescription.textContent = task.description || '';
      feedbackTextInput.value = '';
      feedbackTextInput.placeholder = task.answerHint || DEFAULT_FEEDBACK_PLACEHOLDER;
      feedbackErrorText.classList.add('hidden');
      feedbackModal.classList.remove('hidden');
      feedbackModal.classList.add('flex');
    }
    function closeFeedbackTaskModal() {
      feedbackModal.classList.add('hidden');
      feedbackModal.classList.remove('flex');
      activeFeedbackTask = null;
    }

    document.getElementById('open-bug-report-btn').addEventListener('click', () => openFeedbackTaskModal('Сообщить о проблеме', bugReportTask));
    document.getElementById('open-suggestion-btn').addEventListener('click', () => openFeedbackTaskModal('Предложить идею', suggestionTask));
    document.getElementById('feedback-task-modal-close').addEventListener('click', closeFeedbackTaskModal);
    document.getElementById('feedback-task-cancel-btn').addEventListener('click', closeFeedbackTaskModal);

    feedbackSendBtn.addEventListener('click', async () => {
      if (feedbackSendBtn.disabled) return;
      feedbackErrorText.classList.add('hidden');
      const text = feedbackTextInput.value.trim();
      if (text === '') {
        feedbackErrorText.textContent = 'Добавьте текст или ссылку.';
        feedbackErrorText.classList.remove('hidden');
        return;
      }
      if (!activeFeedbackTask) return;

      feedbackSendBtn.disabled = true;
      try {
        await callServer('submitTaskProof', activeFeedbackTask.taskId, text);
        const rewardNote = activeFeedbackTask.reward > 0 ? ` (+${activeFeedbackTask.reward} сов после проверки)` : '';
        closeFeedbackTaskModal();
        showSaveToast(true, `Отправлено на проверку${rewardNote}`);
      } catch (error) {
        feedbackErrorText.textContent = error.message;
        feedbackErrorText.classList.remove('hidden');
      } finally {
        feedbackSendBtn.disabled = false;
      }
    });
  }
};
