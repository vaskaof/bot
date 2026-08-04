'use strict';

/**
 * Экран "Вопросы" (админ) — перенесён из admin/questions.html (SPA админки,
 * 02.08.2026). Переход к заказу — navigateTo() вместо window.location.href.
 */
window.Screens = window.Screens || {};
window.Screens.questions = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Вопросы</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-questions" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="text-[11px] text-gray-400 px-1 mb-2" id="questions-count"></div>
        <div id="questions-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Вопросов нет 🎉</div>
      </main>
    `;

    const listContainer = document.getElementById('questions-list');
    const emptyMessage = document.getElementById('empty-message');
    const countLabel = document.getElementById('questions-count');
    const refreshBtn = document.getElementById('refresh-questions');

    loadQuestions();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await loadQuestions();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function loadQuestions() {
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const questions = await callServer('getQuestionsList');
        render(questions);
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function render(questions) {
      countLabel.textContent = `Найдено: ${questions.length}`;
      listContainer.innerHTML = '';

      if (questions.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      questions.forEach(q => listContainer.appendChild(buildCard(q)));
    }

    function buildCard(q) {
      const isNew = q.status === 'Новый';
      const card = document.createElement('div');
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${isNew ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`;

      card.innerHTML = `
    <div class="cursor-pointer" data-open>
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-[11px] font-medium text-indigo-600 mb-0.5">${escapeHtmlClient(q.productDisplay)}</div>
          <div class="text-[13px] text-gray-500">${escapeHtmlClient(q.clientDisplay || 'Клиент не указан')}</div>
        </div>
        <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(q.createdAtDisplay)}</div>
      </div>
      <div class="text-[14px] text-gray-800 mt-2">${escapeHtmlClient(q.text)}</div>
    </div>
    <div class="mt-3">
      <textarea class="answer-input w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" rows="2" placeholder="Введите ответ клиенту...">${escapeHtmlClient(q.answer)}</textarea>
      <button type="button" class="save-answer-btn mt-2 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium">${isNew ? 'Отправить ответ' : 'Обновить ответ'}</button>
    </div>
  `;

      card.querySelector('[data-open]').addEventListener('click', () => {
        navigateTo(`orders/${encodeURIComponent(q.orderId)}/edit`);
      });

      const saveBtn = card.querySelector('.save-answer-btn');
      const textarea = card.querySelector('.answer-input');
      saveBtn.addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (text === '') { alert('Введите текст ответа.'); return; }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохраняю...';
        try {
          await callServer('saveQuestionAnswer', q.questionId, text);
          loadQuestions();
        } catch (error) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Ошибка, повторить';
        }
      });

      return card;
    }
  }
};
