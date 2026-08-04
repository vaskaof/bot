'use strict';

/**
 * Экран "Новости" (админ) — перенесён из admin/news.html (SPA админки,
 * 02.08.2026). Раньше editingNewsId/reloadNews и вся модалка жили на верхнем
 * уровне <script> страницы — в SPA это утекало бы между заходами на экран,
 * перенесено внутрь render() (тот же класс фикса, что client/screens/news.js
 * на Phase 2). showSaveToast — общая функция из router.js, локальная копия
 * удалена.
 */
window.Screens = window.Screens || {};
window.Screens.news = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Новости</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="add-news-btn" title="Новая новость" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="audience-filter" class="flex gap-1.5 mb-2 overflow-x-auto pb-1">
          <button type="button" data-filter="__all__" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Все записи</button>
          <button type="button" data-filter="Админ" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Админам</button>
          <button type="button" data-filter="Клиент" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Клиентам</button>
          <button type="button" data-filter="Все" class="filter-btn text-xs px-3 py-1.5 rounded-full font-medium shrink-0">Только «Всем»</button>
        </div>
        <div class="text-[11px] text-gray-400 px-1 mb-2" id="news-count"></div>
        <div id="news-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Новостей пока нет.</div>
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

    let editingNewsId = null;
    let allNews = [];
    let currentFilter = '__all__';

    const listContainer = document.getElementById('news-list');
    const emptyMessage = document.getElementById('empty-message');
    const countLabel = document.getElementById('news-count');
    const refreshBtn = document.getElementById('refresh-btn');
    const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));

    loadNews();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await loadNews();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        updateFilterStyles();
        renderList();
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
      listContainer.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        allNews = await callServer('getNewsList');
        renderList();
      } catch (error) {
        listContainer.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderList() {
      const news = currentFilter === '__all__' ? allNews : allNews.filter(n => n.audience === currentFilter);
      countLabel.textContent = currentFilter === '__all__'
        ? `Всего: ${allNews.length}`
        : `Показано: ${news.length} из ${allNews.length}`;
      listContainer.innerHTML = '';

      if (news.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');

      news.forEach(n => listContainer.appendChild(buildCard(n)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildCard(n) {
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
          if (!confirm('Опубликовать новость? Она станет видна клиентам и уйдёт в рассылку (в окне 9:00–20:00 МСК).')) return;
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
        if (!confirm('Удалить новость?')) return;
        try {
          await callServer('deleteNews', n.newsId);
          loadNews();
        } catch (error) {
          showSaveToast(false, `Не удалось удалить: ${error.message}`);
        }
      });

      return card;
    }

    document.getElementById('add-news-btn').addEventListener('click', () => openModalForCreate());

    // --- Модалка создания/редактирования ---
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

    document.getElementById('news-modal-save').addEventListener('click', async () => {
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
      }
    });
  }
};
