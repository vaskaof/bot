'use strict';

/**
 * Экран "Мои вопросы" — перенесён из client/questions.html (Phase 2 SPA,
 * 02.08.2026). Логика не менялась.
 */
window.Screens = window.Screens || {};
window.Screens.questions = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Мои вопросы</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="questions-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">
          Вы ещё не задавали вопросов по заказам.
        </div>
      </main>
    `;

    const listContainer = document.getElementById('questions-list');
    const emptyMessage = document.getElementById('empty-message');
    const refreshBtn = document.getElementById('refresh-btn');

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
        const questions = await callServer('getClientQuestionsList');
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
      return card;
    }
  }
};
