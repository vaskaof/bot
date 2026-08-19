'use strict';

/**
 * Экран "Главная" (17.08.2026, project_bot_knopka_admin_bottom_nav_redesign)
 * — объединяет бывшие отдельные пункты нижней навигации "Новости" (`news.js`)
 * и "Вопросы" (`questions.js`) в один постоянный пункт с двумя вкладками,
 * тот же паттерн переключения, что уже есть в `contests.js` (`currentTab`,
 * `.tab-btn`). Причина объединения — не "спрятать редкое", а сократить число
 * кнопок нижней навигации с 8 до 6 без потери видимости: по прямому запросу
 * VASY Новости и Вопросы обе должны оставаться на виду (Новости — чтобы
 * менеджер не пропускал изменения, Вопросы — время-чувствительная очередь),
 * поэтому обе живут под одной кнопкой "Главная", а не переехали в "Ещё".
 *
 * Верстка/логика каждой вкладки — дословно перенесённая логика из бывших
 * news.js/questions.js (без изменений поведения), только:
 * - убран back-btn у обеих (был у questions.js — Вопросы были отдельным
 *   под-экраном с "Назад"; Главная теперь верхнеуровневый пункт меню, назад
 *   вести некуда, как и у бывших news.js/contests.js/settings.js);
 * - header-actions пересобирается при переключении вкладки (у "Новости" —
 *   обновить+добавить, у "Вопросы" — только обновить);
 * - счётчик непроверенных вопросов (`status === 'Новый'`) выводится на
 *   бейдж вкладки — тот же приём, что `pending-count-badge` в contests.js —
 *   и синхронизируется с бейджем на самой кнопке "Главная" в нижнем меню
 *   через `window.updateHomeBadge` (см. router.js — читает его после каждого
 *   рендера вкладки "Вопросы" и на периодическом обновлении бейджей нав-бара).
 */
window.Screens = window.Screens || {};
window.Screens.home = {
  render(root, dictionaries, params, signal) {
    let currentTab = 'news';

    function renderHeaderActions() {
      if (currentTab === 'news') {
        document.getElementById('header-actions').innerHTML = `
          <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
            <i data-lucide="refresh-cw" class="w-5 h-5"></i>
          </button>
          <button id="add-news-btn" title="Новая новость" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
            <i data-lucide="plus" class="w-6 h-6"></i>
          </button>
        `;
        document.getElementById('refresh-btn').addEventListener('click', async () => {
          const icon = document.querySelector('#refresh-btn svg');
          if (icon) icon.classList.add('animate-spin');
          await loadNews();
          const liveIcon = document.querySelector('#refresh-btn svg');
          if (liveIcon) liveIcon.classList.remove('animate-spin');
        });
        document.getElementById('add-news-btn').addEventListener('click', () => openModalForCreate());
      } else {
        document.getElementById('header-actions').innerHTML = `
          <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
            <i data-lucide="refresh-cw" class="w-5 h-5"></i>
          </button>
        `;
        document.getElementById('refresh-btn').addEventListener('click', async () => {
          const icon = document.querySelector('#refresh-btn svg');
          if (icon) icon.classList.add('animate-spin');
          await loadQuestions();
          const liveIcon = document.querySelector('#refresh-btn svg');
          if (liveIcon) liveIcon.classList.remove('animate-spin');
        });
      }
      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Главная</h1>';
    renderHeaderActions();

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="tab-switcher" class="flex gap-1.5 mb-3">
          <button type="button" data-tab="news" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">Новости</button>
          <button type="button" data-tab="questions" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">
            Вопросы <span id="questions-count-badge"></span>
          </button>
        </div>

        <div id="news-tab">
          <div id="audience-filter" class="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            <button type="button" data-filter="__all__" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Все записи</button>
            <button type="button" data-filter="Админ" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Админам</button>
            <button type="button" data-filter="Клиент" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Клиентам</button>
            <button type="button" data-filter="Все" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Только «Всем»</button>
          </div>
          <div class="text-[11px] text-gray-400 px-1 mb-2" id="news-count"></div>
          <div id="news-list"></div>
          <div id="news-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Новостей пока нет.</div>
        </div>

        <div id="questions-tab" class="hidden">
          <div class="text-[11px] text-gray-400 px-1 mb-2" id="questions-count"></div>
          <div id="questions-list"></div>
          <div id="questions-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Вопросов нет 🎉</div>
        </div>
      </main>

      <div id="news-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="news-modal-title" class="text-base font-semibold text-gray-900">Новая новость</h2>
            <button id="news-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Заголовок *</label>
              <input type="text" id="news-title-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Появился раздел «Вишлист»">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Текст *</label>
              <textarea id="news-text-input" rows="6"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Что нового и как этим пользоваться..."></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Кому видна *</label>
              <select id="news-audience-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white">
                <option value="Клиент">Клиентам</option>
                <option value="Админ">Админам</option>
                <option value="Все">Всем</option>
              </select>
            </div>
          </div>

          <div id="news-error-text" class="px-4 text-xs text-red-500 hidden"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="news-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="news-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>
    `;

    // --- Переключатель вкладок ---
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === currentTab) return;
        currentTab = btn.dataset.tab;
        updateTabStyles();
        renderHeaderActions();
      });
    });
    function updateTabStyles() {
      tabButtons.forEach(btn => {
        const active = btn.dataset.tab === currentTab;
        btn.className = `tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
      });
      document.getElementById('news-tab').classList.toggle('hidden', currentTab !== 'news');
      document.getElementById('questions-tab').classList.toggle('hidden', currentTab !== 'questions');
    }
    updateTabStyles();

    // ===================== Вкладка "Новости" (логика из бывшего news.js) =====================
    let editingNewsId = null;
    let allNews = [];
    let currentFilter = '__all__';

    const newsListContainer = document.getElementById('news-list');
    const newsEmptyMessage = document.getElementById('news-empty-message');
    const newsCountLabel = document.getElementById('news-count');
    const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));

    loadNews();

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        updateFilterStyles();
        renderNewsList();
      });
    });

    function updateFilterStyles() {
      filterButtons.forEach(btn => {
        const active = btn.dataset.filter === currentFilter;
        btn.className = `filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
      });
    }
    updateFilterStyles();

    async function loadNews() {
      newsListContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        allNews = await callServer('getNewsList');
        renderNewsList();
      } catch (error) {
        newsListContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderNewsList() {
      const news = currentFilter === '__all__' ? allNews : allNews.filter(n => n.audience === currentFilter);
      newsCountLabel.textContent = currentFilter === '__all__'
        ? `Всего: ${allNews.length}`
        : `Показано: ${news.length} из ${allNews.length}`;
      newsListContainer.innerHTML = '';

      if (news.length === 0) {
        newsEmptyMessage.classList.remove('hidden');
        return;
      }
      newsEmptyMessage.classList.add('hidden');

      news.forEach(n => newsListContainer.appendChild(buildNewsCard(n)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildNewsCard(n) {
      const isDraft = n.status === 'Черновик';
      const card = document.createElement('div');
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${isDraft ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`;

      const audienceLabels = { 'Админ': 'Админам', 'Клиент': 'Клиентам', 'Все': 'Всем' };
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(n.title)}</div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="text-[10px] px-2 py-0.5 rounded-full ${isDraft ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}">${escapeHtmlClient(n.status)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${escapeHtmlClient(audienceLabels[n.audience] || n.audience)}</span>
          </div>
        </div>
        <div class="text-[13px] text-gray-600 mt-1 whitespace-pre-wrap">${escapeHtmlClient(n.text)}</div>
        <div class="text-[11px] text-gray-400 mt-2">Создано: ${escapeHtmlClient(n.createdAtDisplay)}${n.publishedAtDisplay ? ` · Опубликовано: ${escapeHtmlClient(n.publishedAtDisplay)}` : ''}</div>
        <div class="flex items-center gap-2 mt-3">
          ${isDraft ? '<button type="button" class="publish-btn flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium">Опубликовать</button>' : ''}
          <button type="button" class="edit-btn p-2 text-gray-400 hover:text-indigo-600" title="Редактировать"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          <button type="button" class="delete-btn p-2 text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      `;

      const publishBtn = card.querySelector('.publish-btn');
      if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
          if (!(await showConfirmModal('Опубликовать новость? Она станет видна клиентам и уйдёт в рассылку (в окне 9:00–20:00 МСК).', { confirmLabel: 'Опубликовать' }))) return;
          publishBtn.disabled = true;
          try {
            await callServer('publishNews', n.newsId);
            showSaveToast(true, 'Новость опубликована');
            loadNews();
          } catch (error) {
            publishBtn.disabled = false;
            showSaveToast(false, `Не удалось опубликовать: ${error.message}`);
          }
        });
      }

      card.querySelector('.edit-btn').addEventListener('click', () => openModalForEdit(n));

      card.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!(await showConfirmModal('Удалить новость?', { confirmLabel: 'Удалить', danger: true }))) return;
        try {
          await callServer('deleteNews', n.newsId);
          loadNews();
        } catch (error) {
          showSaveToast(false, `Не удалось удалить: ${error.message}`);
        }
      });

      return card;
    }

    // --- Модалка создания/редактирования новости ---
    const newsModal = document.getElementById('news-modal');
    const titleInput = document.getElementById('news-title-input');
    const textInput = document.getElementById('news-text-input');
    const audienceInput = document.getElementById('news-audience-input');
    const errorText = document.getElementById('news-error-text');

    function resetModalState() {
      editingNewsId = null;
      titleInput.value = '';
      textInput.value = '';
      audienceInput.value = 'Клиент';
      errorText.classList.add('hidden');
    }

    function openModalForCreate() {
      resetModalState();
      document.getElementById('news-modal-title').textContent = 'Новая новость';
      newsModal.classList.remove('hidden');
      newsModal.classList.add('flex');
    }

    function openModalForEdit(n) {
      resetModalState();
      editingNewsId = n.newsId;
      document.getElementById('news-modal-title').textContent = 'Редактировать новость';
      titleInput.value = n.title;
      textInput.value = n.text;
      audienceInput.value = n.audience || 'Клиент';
      newsModal.classList.remove('hidden');
      newsModal.classList.add('flex');
    }

    function closeNewsModal() {
      newsModal.classList.add('hidden');
      newsModal.classList.remove('flex');
    }
    document.getElementById('news-modal-close').addEventListener('click', closeNewsModal);
    document.getElementById('news-modal-cancel').addEventListener('click', closeNewsModal);

    const newsModalSaveBtn = document.getElementById('news-modal-save');
    newsModalSaveBtn.addEventListener('click', async () => {
      if (newsModalSaveBtn.disabled) return;
      errorText.classList.add('hidden');
      const title = titleInput.value.trim();
      const text = textInput.value.trim();
      const audience = audienceInput.value;

      if (title === '') {
        errorText.textContent = 'Введите заголовок.';
        errorText.classList.remove('hidden');
        return;
      }
      if (text === '') {
        errorText.textContent = 'Введите текст новости.';
        errorText.classList.remove('hidden');
        return;
      }

      newsModalSaveBtn.disabled = true;
      try {
        if (editingNewsId) {
          await callServer('updateNews', editingNewsId, title, text, audience);
        } else {
          await callServer('createNews', title, text, audience);
        }
        closeNewsModal();
        showSaveToast(true, editingNewsId ? 'Новость обновлена' : 'Черновик создан');
        loadNews();
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      } finally {
        newsModalSaveBtn.disabled = false;
      }
    });

    // ===================== Вкладка "Вопросы" (логика из бывшего questions.js) =====================
    const questionsListContainer = document.getElementById('questions-list');
    const questionsEmptyMessage = document.getElementById('questions-empty-message');
    const questionsCountLabel = document.getElementById('questions-count');
    const questionsTabBadge = document.getElementById('questions-count-badge');

    loadQuestions();

    async function loadQuestions() {
      questionsListContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const questions = await callServer('getQuestionsList');
        renderQuestions(questions);
      } catch (error) {
        questionsListContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderQuestions(questions) {
      questionsCountLabel.textContent = `Найдено: ${questions.length}`;
      const unanswered = questions.filter(q => q.status === 'Новый').length;
      questionsTabBadge.textContent = unanswered > 0 ? `(${unanswered})` : '';
      if (window.updateHomeBadge) window.updateHomeBadge(unanswered);

      questionsListContainer.innerHTML = '';

      if (questions.length === 0) {
        questionsEmptyMessage.classList.remove('hidden');
        return;
      }
      questionsEmptyMessage.classList.add('hidden');

      questions.forEach(q => questionsListContainer.appendChild(buildQuestionCard(q)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildQuestionCard(q) {
      const isNew = q.status === 'Новый';
      const card = document.createElement('div');
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${isNew ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`;

      const hasOrder = q.orderId !== '';
      const hasUsername = !!q.clientUsername;
      const chatLink = hasUsername ? `https://t.me/${encodeURIComponent(q.clientUsername.replace(/^@/, ''))}` : '';

      card.innerHTML = `
    <div class="${hasOrder ? 'cursor-pointer' : ''}" ${hasOrder ? 'data-open' : ''}>
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-[11px] font-medium text-indigo-600 mb-0.5">${escapeHtmlClient(q.productDisplay)}${hasOrder ? ` · Заказ ${escapeHtmlClient(q.orderId)}` : ''}</div>
          <div class="text-[13px] text-gray-500">${escapeHtmlClient(q.clientDisplay || 'Клиент не указан')}${hasUsername ? ` · <a href="${chatLink}" target="_blank" rel="noopener" class="chat-link text-indigo-500 underline">написать</a>` : ''}</div>
        </div>
        <div class="text-[11px] text-gray-400 shrink-0">${escapeHtmlClient(q.createdAtDisplay)}</div>
      </div>
      <div class="text-[14px] text-gray-800 mt-2 whitespace-pre-wrap">${escapeHtmlClient(q.text)}</div>
    </div>
    <div class="mt-3">
      <textarea class="answer-input w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none" rows="2" placeholder="Введите ответ клиенту...">${escapeHtmlClient(q.answer)}</textarea>
      <button type="button" class="save-answer-btn mt-2 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium">${isNew ? 'Отправить ответ' : 'Обновить ответ'}</button>
    </div>
  `;

      if (hasOrder) {
        card.querySelector('[data-open]').addEventListener('click', () => {
          navigateTo(`orders/${encodeURIComponent(q.orderId)}/edit`);
        });
      }
      const chatLinkEl = card.querySelector('.chat-link');
      if (chatLinkEl) chatLinkEl.addEventListener('click', (e) => e.stopPropagation());

      const saveBtn = card.querySelector('.save-answer-btn');
      const textarea = card.querySelector('.answer-input');
      saveBtn.addEventListener('click', async () => {
        if (saveBtn.disabled) return;
        const text = textarea.value.trim();
        // ИСПРАВЛЕНО 19.08.2026 (P0.8 аудита) — было alert(), единственный
        // разрыв стиля в этом файле: остальные формы проекта показывают
        // ошибку инлайн-текстом, не системным диалогом.
        if (text === '') { showSaveToast(false, 'Введите текст ответа.'); return; }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохраняю...';
        try {
          await callServer('saveQuestionAnswer', q.questionId, text);
          loadQuestions();
        } catch (error) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Ошибка, повторить';
          // ИСПРАВЛЕНО 19.08.2026 (аудит: "админ не знает причину сбоя,
          // только что он был") — текст ошибки теперь виден, не только факт сбоя.
          showSaveToast(false, `Не удалось сохранить ответ: ${error.message}`);
        }
      });

      return card;
    }
  }
};
