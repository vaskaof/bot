'use strict';

/**
 * Экран "Мои вопросы" — перенесён из client/questions.html (Phase 2 SPA,
 * 02.08.2026). Логика не менялась.
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
 */
const REVIEW_TASK_TITLE = 'Оцени ответ на вопрос';

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
        <div id="questions-list"></div>
        <div id="empty-message" class="hidden">
          ${buildEmptyState('message-circle', 'Вы ещё не задавали вопросов по заказам.', { label: 'Задать вопрос', btnId: 'empty-ask-question-btn' })}
        </div>
      </main>
    `;

    const listContainer = document.getElementById('questions-list');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');
    // Форма "Задать вопрос" переехала в Профиль (Подфаза 3.4, 12.08.2026,
    // client_display_overhaul) — здесь нет своей модалки, CTA просто ведёт туда.
    document.getElementById('empty-ask-question-btn').addEventListener('click', () => navigateTo('profile'));

    let reviewTask = null; // повторяемое ручное задание "Оцени ответ на вопрос", если заведено

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
  }
};
