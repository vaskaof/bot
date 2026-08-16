'use strict';

/**
 * Экран "Конкурсы" (админ) — перенесён из admin/contests.html (SPA админки,
 * 02.08.2026). Самый крупный из "обычных" экранов — всё состояние
 * (editingTaskId/editingLotteryId/drawingLotteryId/reloadX/currentTab) и вся
 * обвязка 4 модалок (задание/лотерея/розыгрыш/доска), раньше жившие на
 * верхнем уровне <script>, перенесены внутрь render(). currentTab сбрасывается
 * на 'tasks' при каждом монтировании — раньше это не имело значения (свежий
 * JS-контекст на каждой перезагрузке страницы), в SPA без явного сброса
 * можно было бы попасть на экран с прошлым выбором вкладки. showSaveToast —
 * общая функция из router.js, локальная копия удалена.
 */
window.Screens = window.Screens || {};
window.Screens.contests = {
  render(root) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Конкурсы</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
      <button id="add-task-btn" title="Добавить (на текущей вкладке)" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="tab-switcher" class="flex gap-1.5 mb-3">
          <button type="button" data-tab="tasks" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">Задания</button>
          <button type="button" data-tab="moderation" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">
            Модерация <span id="pending-count-badge"></span>
          </button>
          <button type="button" data-tab="lotteries" class="tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium">Лотереи</button>
        </div>

        <div id="tasks-tab">
          <div id="tasks-list"></div>
          <div id="tasks-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Заданий пока нет.</div>
        </div>

        <div id="moderation-tab" class="hidden">
          <div id="moderation-list"></div>
          <div id="moderation-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Заявок на проверку нет.</div>
        </div>

        <div id="lotteries-tab" class="hidden">
          <div id="lotteries-list"></div>
          <div id="lotteries-empty-message" class="hidden text-center text-sm text-gray-400 py-10">Лотерей пока нет.</div>
        </div>
      </main>

      <div id="task-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="task-modal-title" class="text-base font-semibold text-gray-900">Новое задание</h2>
            <button id="task-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Название *</label>
              <input type="text" id="task-title-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Заполни вишлист">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Описание</label>
              <textarea id="task-description-input" rows="2"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Необязательно"></textarea>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Тип *</label>
              <select id="task-type-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white">
                <option value="Авто">Авто (система проверяет сама)</option>
                <option value="Ручное">Ручное (нужна ваша проверка)</option>
              </select>
            </div>
            <div id="task-signal-block">
              <label class="text-xs font-medium text-gray-500 inline-flex items-center gap-1">Сигнал (для авто-задания) *${helpIcon('Сигнал автозадания', '<p>Список ниже — фиксированный, ровно 3 готовых сигнала. Свой вариант («написал в поддержку», «оформил N заказов» и т.п.) добавить нельзя без правки кода бэкенда — если такой сигнал нужен, это отдельная задача на разработку, не настройка через панель.</p><p>Система сама проверяет сигнал и засчитывает задание — участнику ничего отправлять не нужно, поэтому у "Авто" нет очереди на "Модерации".</p>')}</label>
              <select id="task-signal-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white">
                <option value="Есть_Позиция_В_Вишлисте">Есть позиция в вишлисте</option>
                <option value="Подписан_На_Новости">Подписан на новости</option>
                <option value="Есть_Вопрос">Задал вопрос по заказу</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Награда (сов) *</label>
              <input type="number" id="task-reward-input" min="0" step="1"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: 10">
            </div>
            <div id="task-repeatable-block" class="flex items-center gap-2">
              <input type="checkbox" id="task-repeatable-input" class="w-4 h-4 rounded border-gray-300 text-indigo-600">
              <label for="task-repeatable-input" class="text-xs font-medium text-gray-500 inline-flex items-center gap-1">Повторяемое${helpIcon('Повторяемое задание', '<p>Клиент может присылать сколько угодно заявок по этому заданию — в том числе несколько сразу, не дожидаясь проверки предыдущей.</p><p>Подходит для баг-репортов и подобного, где один и тот же клиент естественно приходит с разными заявками не один раз. Для одноразовых заданий (вишлист, подписка и т.п.) оставьте выключенным.</p>')}</label>
            </div>
          </div>

          <div id="task-error-text" class="px-4 text-xs text-red-500 hidden"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="task-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="task-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>

      <div id="lottery-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="lottery-modal-title" class="text-base font-semibold text-gray-900">Новая лотерея</h2>
            <button id="lottery-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Название *</label>
              <input type="text" id="lottery-title-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Розыгрыш куклы к 1 сентября">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Приз</label>
              <input type="text" id="lottery-prize-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Необязательно">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Условия входа (нужны ВСЕ отмеченные, ничего не отмечено — вход всем)</label>
              <div id="lottery-task-checklist" class="mt-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50"></div>
            </div>
            <div id="lottery-type-block">
              <label class="text-xs font-medium text-gray-500 inline-flex items-center gap-1">Тип лотереи${helpIcon('Промо vs Премиум', '<p><b>Промо (участники)</b> — бесплатно для клиента: кнопка «Участвовать» просто добавляет в список претендентов. Розыгрыш — случайный номер среди участников.</p><p><b>Премиум (ячейки)</b> — клиент видит доску пронумерованных ячеек и бронирует свободную за 1 билет (билет списывается только при успешной брони). Вы дополнительно задаёте «Всего ячеек» и «Максимум ячеек на клиента». Розыгрыш — случайный номер среди занятых ячеек. У вас есть отдельная кнопка «Доска» на карточке такой лотереи — просмотр брони с именами.</p>')}</label>
              <div class="flex gap-2 mt-1">
                <button type="button" data-type="Тип2" class="lottery-type-btn flex-1 py-2 rounded-xl text-xs font-medium border">Промо (участники)</button>
                <button type="button" data-type="Тип1" class="lottery-type-btn flex-1 py-2 rounded-xl text-xs font-medium border">Премиум (ячейки)</button>
              </div>
              <div class="text-[11px] text-gray-400 mt-1">После создания тип изменить нельзя.</div>
            </div>
            <div id="lottery-type-readonly-block" class="hidden text-xs text-gray-500"></div>
            <div id="lottery-cells-block" class="hidden space-y-3">
              <div>
                <label class="text-xs font-medium text-gray-500">Всего ячеек на доске *</label>
                <input type="number" id="lottery-total-cells-input" min="1" step="1"
                  class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Например: 20">
              </div>
              <div>
                <label class="text-xs font-medium text-gray-500">Максимум ячеек на одного клиента *</label>
                <input type="number" id="lottery-max-cells-input" min="1" step="1"
                  class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                  placeholder="Например: 3">
              </div>
            </div>
          </div>

          <div id="lottery-error-text" class="px-4 text-xs text-red-500 hidden"></div>

          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="lottery-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="lottery-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>
          </div>
        </div>
      </div>

      <div id="draw-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="draw-modal-title" class="text-base font-semibold text-gray-900 inline-flex items-center gap-1.5">Розыгрыш${helpIcon('Как работает розыгрыш', '<p>«Выбрать случайно»/«Выбрать» разыгрывает приз ровно для ОДНОГО места. Лотерея после этого остаётся активной — можно нажимать снова для следующего места (2-е, 3-е и т.д.), уже выигравшие в повторный розыгрыш не попадают.</p><p><b>«Завершить розыгрыш»</b> — отдельное необратимое действие: закрывает лотерею и рассылает участникам итоговое сообщение со всеми победителями. Нажимайте, только когда разыграны ВСЕ призы, которые планировали.</p>')}</h2>
            <button id="draw-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-4 space-y-3">
            <div id="draw-winners-list" class="space-y-1"></div>

            <div id="draw-participant-count" class="text-sm text-gray-600"></div>
            <div id="draw-participants-list" class="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50"></div>

            <div>
              <label class="text-xs font-medium text-gray-500">Приз за это место *</label>
              <input type="text" id="draw-prize-input"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Например: Кукла Monster High">
            </div>

            <button id="draw-auto-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">
              Выбрать случайно
            </button>

            <div class="flex items-center gap-2 text-xs text-gray-400">
              <div class="flex-1 h-px bg-gray-100"></div>или по номеру из внешнего рандомайзера<div class="flex-1 h-px bg-gray-100"></div>
            </div>

            <div class="flex gap-2">
              <input type="number" id="draw-manual-number-input" min="1"
                class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                placeholder="Номер среди ещё не выигравших">
              <button id="draw-manual-btn" class="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Выбрать</button>
            </div>

            <div id="draw-error-text" class="text-xs text-red-500 hidden"></div>

            <div class="flex items-center gap-2 text-xs text-gray-400">
              <div class="flex-1 h-px bg-gray-100"></div>когда все призы разыграны<div class="flex-1 h-px bg-gray-100"></div>
            </div>
            <button id="draw-finish-btn" class="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium">
              Завершить розыгрыш
            </button>
          </div>

          <div class="p-4"></div>
        </div>
      </div>

      <div id="board-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="board-modal-title" class="text-base font-semibold text-gray-900">Доска ячеек</h2>
            <button id="board-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div class="flex items-center gap-3 text-[11px] text-gray-500">
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block"></span>Свободна</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-indigo-500 inline-block"></span>Занята</span>
            </div>
            <div id="board-grid" class="grid grid-cols-6 gap-1.5"></div>
          </div>
          <div class="p-4"></div>
        </div>
      </div>
    `;

    let editingTaskId = null;
    let editingLotteryId = null;
    let drawingLotteryId = null;
    let currentTab = 'tasks';

    const tasksList = document.getElementById('tasks-list');
    const tasksEmpty = document.getElementById('tasks-empty-message');
    const moderationList = document.getElementById('moderation-list');
    const moderationEmpty = document.getElementById('moderation-empty-message');
    const lotteriesList = document.getElementById('lotteries-list');
    const lotteriesEmpty = document.getElementById('lotteries-empty-message');
    const refreshBtn = document.getElementById('refresh-btn');
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));

    loadTasks();
    loadModeration();
    loadLotteries();

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        updateTabStyles();
      });
    });

    function updateTabStyles() {
      tabButtons.forEach(btn => {
        const active = btn.dataset.tab === currentTab;
        btn.className = `tab-btn flex-1 text-xs px-3 py-2 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
      });
      document.getElementById('tasks-tab').classList.toggle('hidden', currentTab !== 'tasks');
      document.getElementById('moderation-tab').classList.toggle('hidden', currentTab !== 'moderation');
      document.getElementById('lotteries-tab').classList.toggle('hidden', currentTab !== 'lotteries');
      document.getElementById('add-task-btn').classList.toggle('hidden', currentTab === 'moderation');
    }
    updateTabStyles();

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await Promise.all([loadTasks(), loadModeration(), loadLotteries()]);
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function loadTasks() {
      tasksList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const tasks = await callServer('getAdminTasksList');
        renderTasks(tasks);
      } catch (error) {
        tasksList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderTasks(tasks) {
      tasksList.innerHTML = '';
      if (tasks.length === 0) {
        tasksEmpty.classList.remove('hidden');
        return;
      }
      tasksEmpty.classList.add('hidden');
      tasks.forEach(t => tasksList.appendChild(buildTaskCard(t)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildTaskCard(t) {
      const card = document.createElement('div');
      card.className = `bg-white rounded-2xl shadow-sm border p-4 mb-3 ${t.active ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-70'}`;

      const signalLabels = {
        'Есть_Позиция_В_Вишлисте': 'Есть позиция в вишлисте',
        'Подписан_На_Новости': 'Подписан на новости',
        'Есть_Вопрос': 'Задал вопрос по заказу',
      };

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(t.title)}</div>
          <div class="flex items-center gap-1 shrink-0">
            ${t.repeatable ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Повторяемое</span>' : ''}
            <span class="text-[10px] px-2 py-0.5 rounded-full ${t.type === 'Авто' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-700'}">${escapeHtmlClient(t.type)}</span>
          </div>
        </div>
        ${t.description ? `<div class="text-[13px] text-gray-500 mt-1">${escapeHtmlClient(t.description)}</div>` : ''}
        <div class="text-[12px] text-gray-500 mt-2">
          ${t.type === 'Авто' ? `Сигнал: ${escapeHtmlClient(signalLabels[t.signal] || t.signal)} · ` : ''}Награда: ${t.reward} сов
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button type="button" class="toggle-active-btn flex-1 py-2 rounded-xl text-xs font-medium ${t.active ? 'border border-gray-200 text-gray-600' : 'bg-indigo-600 text-white'}">
            ${t.active ? 'Выключить' : 'Включить'}
          </button>
          <button type="button" class="edit-task-btn p-2 text-gray-400 hover:text-indigo-600" title="Редактировать"><i data-lucide="pencil" class="w-4 h-4"></i></button>
        </div>
      `;

      card.querySelector('.toggle-active-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await callServer('toggleTaskActive', t.taskId, !t.active);
          loadTasks();
        } catch (error) {
          btn.disabled = false;
          showSaveToast(false, `Не удалось изменить: ${error.message}`);
        }
      });

      card.querySelector('.edit-task-btn').addEventListener('click', () => openModalForEdit(t));

      return card;
    }

    async function loadModeration() {
      moderationList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const pending = await callServer('getPendingTaskSubmissions');
        renderModeration(pending);
      } catch (error) {
        moderationList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderModeration(pending) {
      const badge = document.getElementById('pending-count-badge');
      badge.textContent = pending.length > 0 ? `(${pending.length})` : '';

      moderationList.innerHTML = '';
      if (pending.length === 0) {
        moderationEmpty.classList.remove('hidden');
        return;
      }
      moderationEmpty.classList.add('hidden');
      pending.forEach(s => moderationList.appendChild(buildSubmissionCard(s)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildSubmissionCard(s) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(s.taskTitle)}</div>
        </div>
        <div class="text-[12px] text-gray-400 mt-1">Клиент: ${escapeHtmlClient(s.telegramId)} · ${escapeHtmlClient(s.submittedAt)}</div>
        <div class="text-[13px] text-gray-700 mt-2 p-2 bg-gray-50 rounded-lg break-words">${escapeHtmlClient(s.proof)}</div>
        <div class="flex items-center gap-2 mt-2">
          <label class="text-[11px] text-gray-500 shrink-0">Награда (сов, макс. ${s.reward}) ${helpIcon('Награда при одобрении', '<p>Заявлено клиентом при подаче: ' + s.reward + ' сов. Можно снизить (например, баг уже известен) — выше заявленного значения поставить нельзя.</p>')}</label>
          <input type="number" class="approve-reward-input w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400" min="0" max="${s.reward}" step="1" value="${s.reward}">
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button type="button" class="approve-btn flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium">Одобрить</button>
          <button type="button" class="reject-btn flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium">Отклонить</button>
        </div>
      `;

      const rewardInput = card.querySelector('.approve-reward-input');

      card.querySelector('.approve-btn').addEventListener('click', async (e) => {
        const finalReward = Number(rewardInput.value);
        if (rewardInput.value === '' || isNaN(finalReward) || finalReward < 0) {
          showSaveToast(false, 'Награда должна быть неотрицательным числом.');
          return;
        }
        if (finalReward > s.reward) {
          showSaveToast(false, `Награда не может быть выше заявленной (${s.reward}).`);
          return;
        }
        const confirmText = finalReward < s.reward
          ? `Одобрить и начислить ${finalReward} сов (снижено с заявленных ${s.reward})?`
          : `Одобрить и начислить ${finalReward} сов?`;
        if (!confirm(confirmText)) return;
        e.currentTarget.disabled = true;
        try {
          await callServer('approveTaskSubmission', s.submissionId, finalReward);
          showSaveToast(true, 'Заявка одобрена, совы начислены');
          loadModeration();
        } catch (error) {
          e.currentTarget.disabled = false;
          showSaveToast(false, `Не удалось одобрить: ${error.message}`);
        }
      });

      card.querySelector('.reject-btn').addEventListener('click', async (e) => {
        const comment = prompt('Причина отклонения (необязательно):', '') || '';
        e.currentTarget.disabled = true;
        try {
          await callServer('rejectTaskSubmission', s.submissionId, comment);
          showSaveToast(true, 'Заявка отклонена');
          loadModeration();
        } catch (error) {
          e.currentTarget.disabled = false;
          showSaveToast(false, `Не удалось отклонить: ${error.message}`);
        }
      });

      return card;
    }

    async function loadLotteries() {
      lotteriesList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const lotteries = await callServer('getAdminLotteriesList');
        renderLotteries(lotteries);
      } catch (error) {
        lotteriesList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderLotteries(lotteries) {
      lotteriesList.innerHTML = '';
      if (lotteries.length === 0) {
        lotteriesEmpty.classList.remove('hidden');
        return;
      }
      lotteriesEmpty.classList.add('hidden');
      lotteries.forEach(l => lotteriesList.appendChild(buildLotteryCard(l)));
      if (window.lucide) window.lucide.createIcons();
    }

    const statusStyles = {
      'Черновик': 'bg-gray-100 text-gray-500',
      'Активна': 'bg-green-50 text-green-700',
      'Завершена': 'bg-indigo-50 text-indigo-600',
      'Отменена': 'bg-red-50 text-red-500',
    };

    function buildLotteryCard(l) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      const conditionsHtml = l.conditions && l.conditions.length > 0
        ? l.conditions.map(c => `<div class="text-[12px] text-gray-500">• ${escapeHtmlClient(c.title)}${c.description ? ` — ${escapeHtmlClient(c.description)}` : ''}</div>`).join('')
        : '<div class="text-[12px] text-gray-400">Без условий — вход всем</div>';

      const winnersHtml = l.winners && l.winners.length > 0
        ? l.winners.map(w => `<div class="text-[12px] text-gray-700">🏆 ${escapeHtmlClient(w.prize)} — ${escapeHtmlClient(w.displayName)}</div>`).join('')
        : '';

      const isType1 = l.type === 'Тип1';
      const countLine = isType1
        ? `Забронировано: ${l.participantCount} из ${l.totalCells}`
        : `Участников: ${l.participantCount}`;

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(l.title)}</div>
            ${isType1 ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">Премиум</span>' : ''}
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full ${statusStyles[l.status] || 'bg-gray-100 text-gray-500'} shrink-0">${escapeHtmlClient(l.status)}</span>
        </div>
        ${l.prize ? `<div class="text-[13px] text-gray-500 mt-1">${escapeHtmlClient(l.prize)}</div>` : ''}
        <div class="mt-2 space-y-0.5">${conditionsHtml}</div>
        <div class="text-[12px] text-gray-500 mt-2">${countLine}</div>
        ${winnersHtml ? `<div class="mt-2 space-y-0.5">${winnersHtml}</div>` : ''}
        <div class="flex items-center gap-2 mt-3 flex-wrap"></div>
      `;

      const actions = card.querySelector('.flex-wrap');

      if (l.status === 'Черновик') {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'p-2 text-gray-400 hover:text-indigo-600';
        editBtn.innerHTML = '<i data-lucide="pencil" class="w-4 h-4"></i>';
        editBtn.addEventListener('click', () => openLotteryModalForEdit(l));
        actions.appendChild(editBtn);

        const publishBtn = document.createElement('button');
        publishBtn.type = 'button';
        publishBtn.className = 'flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium';
        publishBtn.textContent = 'Опубликовать';
        publishBtn.addEventListener('click', async () => {
          publishBtn.disabled = true;
          try {
            await callServer('publishLottery', l.lotteryId);
            showSaveToast(true, 'Лотерея опубликована');
            loadLotteries();
          } catch (error) {
            publishBtn.disabled = false;
            showSaveToast(false, `Не удалось опубликовать: ${error.message}`);
          }
        });
        actions.appendChild(publishBtn);
      }

      if (l.status === 'Активна') {
        if (isType1) {
          const boardBtn = document.createElement('button');
          boardBtn.type = 'button';
          boardBtn.className = 'py-2 px-3 rounded-xl border border-gray-200 text-gray-700 text-xs font-medium';
          boardBtn.textContent = 'Доска';
          boardBtn.addEventListener('click', () => openBoardModal(l));
          actions.appendChild(boardBtn);
        }

        const drawBtn = document.createElement('button');
        drawBtn.type = 'button';
        drawBtn.className = 'flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium';
        drawBtn.textContent = 'Разыграть приз';
        drawBtn.addEventListener('click', () => openDrawModal(l));
        actions.appendChild(drawBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'py-2 px-3 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium';
        cancelBtn.textContent = 'Отменить';
        cancelBtn.addEventListener('click', async () => {
          const warning = isType1
            ? 'Отменить лотерею? Действие необратимо, всем забронировавшим вернутся билеты.'
            : 'Отменить лотерею? Действие необратимо.';
          if (!confirm(warning)) return;
          cancelBtn.disabled = true;
          try {
            await callServer('cancelLottery', l.lotteryId);
            showSaveToast(true, 'Лотерея отменена');
            loadLotteries();
          } catch (error) {
            cancelBtn.disabled = false;
            showSaveToast(false, `Не удалось отменить: ${error.message}`);
          }
        });
        actions.appendChild(cancelBtn);
      }

      return card;
    }

    document.getElementById('add-task-btn').addEventListener('click', () => {
      if (currentTab === 'lotteries') {
        openLotteryModalForCreate();
      } else {
        openModalForCreate();
      }
    });

    // --- Модалка создания/редактирования задания ---
    const taskModal = document.getElementById('task-modal');
    const titleInput = document.getElementById('task-title-input');
    const descriptionInput = document.getElementById('task-description-input');
    const typeInput = document.getElementById('task-type-input');
    const signalBlock = document.getElementById('task-signal-block');
    const signalInput = document.getElementById('task-signal-input');
    const rewardInput = document.getElementById('task-reward-input');
    const repeatableBlock = document.getElementById('task-repeatable-block');
    const repeatableInput = document.getElementById('task-repeatable-input');
    const errorText = document.getElementById('task-error-text');

    function updateSignalBlockVisibility() {
      signalBlock.classList.toggle('hidden', typeInput.value !== 'Авто');
      // "Повторяемое" имеет смысл только для Ручного — Авто-задание и так
      // проверяется системой заново при каждом заходе, повторной подачи нет.
      repeatableBlock.classList.toggle('hidden', typeInput.value !== 'Ручное');
      if (typeInput.value !== 'Ручное') repeatableInput.checked = false;
    }
    typeInput.addEventListener('change', updateSignalBlockVisibility);

    function resetModalState() {
      editingTaskId = null;
      titleInput.value = '';
      descriptionInput.value = '';
      typeInput.value = 'Авто';
      signalInput.value = 'Есть_Позиция_В_Вишлисте';
      rewardInput.value = '';
      repeatableInput.checked = false;
      errorText.classList.add('hidden');
      updateSignalBlockVisibility();
    }

    function openModalForCreate() {
      resetModalState();
      document.getElementById('task-modal-title').textContent = 'Новое задание';
      taskModal.classList.remove('hidden');
      taskModal.classList.add('flex');
    }

    function openModalForEdit(t) {
      resetModalState();
      editingTaskId = t.taskId;
      document.getElementById('task-modal-title').textContent = 'Редактировать задание';
      titleInput.value = t.title;
      descriptionInput.value = t.description;
      typeInput.value = t.type;
      if (t.signal) signalInput.value = t.signal;
      rewardInput.value = t.reward;
      repeatableInput.checked = !!t.repeatable;
      updateSignalBlockVisibility();
      taskModal.classList.remove('hidden');
      taskModal.classList.add('flex');
    }

    function closeTaskModal() {
      taskModal.classList.add('hidden');
      taskModal.classList.remove('flex');
    }
    document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
    document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);

    const taskModalSaveBtn = document.getElementById('task-modal-save');
    taskModalSaveBtn.addEventListener('click', async () => {
      errorText.classList.add('hidden');
      const title = titleInput.value.trim();
      const description = descriptionInput.value.trim();
      const type = typeInput.value;
      const signal = type === 'Авто' ? signalInput.value : '';
      const reward = rewardInput.value;
      const repeatable = type === 'Ручное' && repeatableInput.checked;

      if (title === '') {
        errorText.textContent = 'Введите название задания.';
        errorText.classList.remove('hidden');
        return;
      }
      if (reward === '' || Number(reward) < 0) {
        errorText.textContent = 'Награда должна быть неотрицательным числом.';
        errorText.classList.remove('hidden');
        return;
      }

      taskModalSaveBtn.disabled = true;
      try {
        if (editingTaskId) {
          await callServer('updateTask', editingTaskId, title, description, type, signal, Number(reward), repeatable);
        } else {
          await callServer('createTask', title, description, type, signal, Number(reward), repeatable);
        }
        closeTaskModal();
        showSaveToast(true, editingTaskId ? 'Задание обновлено' : 'Задание создано');
        loadTasks();
      } catch (error) {
        errorText.textContent = error.message;
        errorText.classList.remove('hidden');
      } finally {
        taskModalSaveBtn.disabled = false;
      }
    });

    // --- Модалка создания/редактирования лотереи ---
    const lotteryModal = document.getElementById('lottery-modal');
    const lotteryTitleInput = document.getElementById('lottery-title-input');
    const lotteryPrizeInput = document.getElementById('lottery-prize-input');
    const lotteryTaskChecklist = document.getElementById('lottery-task-checklist');
    const lotteryTypeBlock = document.getElementById('lottery-type-block');
    const lotteryTypeReadonlyBlock = document.getElementById('lottery-type-readonly-block');
    const lotteryTypeButtons = Array.from(document.querySelectorAll('.lottery-type-btn'));
    const lotteryCellsBlock = document.getElementById('lottery-cells-block');
    const lotteryTotalCellsInput = document.getElementById('lottery-total-cells-input');
    const lotteryMaxCellsInput = document.getElementById('lottery-max-cells-input');
    const lotteryErrorText = document.getElementById('lottery-error-text');

    let selectedLotteryType = 'Тип2';
    let editingLotteryType = null;

    function updateLotteryTypeButtons() {
      lotteryTypeButtons.forEach(btn => {
        const active = btn.dataset.type === selectedLotteryType;
        btn.className = `lottery-type-btn flex-1 py-2 rounded-xl text-xs font-medium border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200'}`;
      });
      lotteryCellsBlock.classList.toggle('hidden', selectedLotteryType !== 'Тип1');
    }
    lotteryTypeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedLotteryType = btn.dataset.type;
        updateLotteryTypeButtons();
      });
    });

    async function populateLotteryTaskChecklist(selectedTaskIds) {
      const selected = selectedTaskIds || [];
      lotteryTaskChecklist.innerHTML = '<div class="p-3 text-xs text-gray-400">Загрузка заданий...</div>';
      try {
        const tasks = await callServer('getAdminTasksList');
        if (tasks.length === 0) {
          lotteryTaskChecklist.innerHTML = '<div class="p-3 text-xs text-gray-400">Заданий пока нет — лотерея будет без условий входа.</div>';
          return;
        }
        lotteryTaskChecklist.innerHTML = '';
        tasks.forEach(t => {
          const row = document.createElement('label');
          row.className = 'flex items-start gap-2 p-2 text-sm cursor-pointer';
          row.innerHTML = `
            <input type="checkbox" value="${escapeHtmlClient(t.taskId)}" class="lottery-task-checkbox mt-0.5">
            <span>
              <span class="block text-gray-900">${escapeHtmlClient(t.title)}</span>
              ${t.description ? `<span class="block text-xs text-gray-400">${escapeHtmlClient(t.description)}</span>` : ''}
            </span>
          `;
          const checkbox = row.querySelector('input');
          checkbox.checked = selected.includes(t.taskId);
          lotteryTaskChecklist.appendChild(row);
        });
      } catch (error) {
        lotteryTaskChecklist.innerHTML = `<div class="p-3 text-xs text-red-500">Не удалось загрузить задания: ${error.message}</div>`;
      }
    }

    function getSelectedLotteryTaskIds() {
      return Array.from(lotteryTaskChecklist.querySelectorAll('.lottery-task-checkbox:checked')).map(cb => cb.value);
    }

    function resetLotteryModalState() {
      editingLotteryId = null;
      editingLotteryType = null;
      lotteryTitleInput.value = '';
      lotteryPrizeInput.value = '';
      lotteryTotalCellsInput.value = '';
      lotteryMaxCellsInput.value = '';
      selectedLotteryType = 'Тип2';
      lotteryTypeBlock.classList.remove('hidden');
      lotteryTypeReadonlyBlock.classList.add('hidden');
      updateLotteryTypeButtons();
      lotteryErrorText.classList.add('hidden');
    }

    async function openLotteryModalForCreate() {
      resetLotteryModalState();
      document.getElementById('lottery-modal-title').textContent = 'Новая лотерея';
      await populateLotteryTaskChecklist([]);
      lotteryModal.classList.remove('hidden');
      lotteryModal.classList.add('flex');
    }

    async function openLotteryModalForEdit(l) {
      resetLotteryModalState();
      editingLotteryId = l.lotteryId;
      editingLotteryType = l.type;
      document.getElementById('lottery-modal-title').textContent = 'Редактировать лотерею';
      lotteryTitleInput.value = l.title;
      lotteryPrizeInput.value = l.prize;

      lotteryTypeBlock.classList.add('hidden');
      lotteryTypeReadonlyBlock.classList.remove('hidden');
      lotteryTypeReadonlyBlock.textContent = `Тип: ${l.type === 'Тип1' ? 'Премиум (ячейки)' : 'Промо (участники)'}`;

      if (l.type === 'Тип1') {
        lotteryCellsBlock.classList.remove('hidden');
        lotteryTotalCellsInput.value = l.totalCells || '';
        lotteryMaxCellsInput.value = l.maxCellsPerClient || '';
      }

      await populateLotteryTaskChecklist(l.taskIds || []);
      lotteryModal.classList.remove('hidden');
      lotteryModal.classList.add('flex');
    }

    function closeLotteryModal() {
      lotteryModal.classList.add('hidden');
      lotteryModal.classList.remove('flex');
    }
    document.getElementById('lottery-modal-close').addEventListener('click', closeLotteryModal);
    document.getElementById('lottery-modal-cancel').addEventListener('click', closeLotteryModal);

    const lotteryModalSaveBtn = document.getElementById('lottery-modal-save');
    lotteryModalSaveBtn.addEventListener('click', async () => {
      lotteryErrorText.classList.add('hidden');
      const title = lotteryTitleInput.value.trim();
      const prize = lotteryPrizeInput.value.trim();
      const taskIds = getSelectedLotteryTaskIds();
      const type = editingLotteryId ? editingLotteryType : selectedLotteryType;

      if (title === '') {
        lotteryErrorText.textContent = 'Введите название лотереи.';
        lotteryErrorText.classList.remove('hidden');
        return;
      }

      let totalCells, maxCellsPerClient;
      if (type === 'Тип1') {
        totalCells = Number(lotteryTotalCellsInput.value);
        maxCellsPerClient = Number(lotteryMaxCellsInput.value);
        if (!lotteryTotalCellsInput.value || totalCells < 1) {
          lotteryErrorText.textContent = 'Укажите количество ячеек (целое число больше 0).';
          lotteryErrorText.classList.remove('hidden');
          return;
        }
        if (!lotteryMaxCellsInput.value || maxCellsPerClient < 1) {
          lotteryErrorText.textContent = 'Укажите максимум ячеек на клиента (целое число больше 0).';
          lotteryErrorText.classList.remove('hidden');
          return;
        }
      }

      lotteryModalSaveBtn.disabled = true;
      try {
        if (editingLotteryId) {
          await callServer('updateLottery', editingLotteryId, title, prize, taskIds, totalCells, maxCellsPerClient);
        } else {
          await callServer('createLottery', title, prize, taskIds, type, totalCells, maxCellsPerClient);
        }
        closeLotteryModal();
        showSaveToast(true, editingLotteryId ? 'Лотерея обновлена' : 'Лотерея создана (черновик)');
        loadLotteries();
      } catch (error) {
        lotteryErrorText.textContent = error.message;
        lotteryErrorText.classList.remove('hidden');
      } finally {
        lotteryModalSaveBtn.disabled = false;
      }
    });

    // --- Модалка розыгрыша ---
    const drawModal = document.getElementById('draw-modal');
    const drawWinnersList = document.getElementById('draw-winners-list');
    const drawParticipantCount = document.getElementById('draw-participant-count');
    const drawParticipantsList = document.getElementById('draw-participants-list');
    const drawPrizeInput = document.getElementById('draw-prize-input');
    const drawAutoBtn = document.getElementById('draw-auto-btn');
    const drawManualNumberInput = document.getElementById('draw-manual-number-input');
    const drawManualBtn = document.getElementById('draw-manual-btn');
    const drawFinishBtn = document.getElementById('draw-finish-btn');
    const drawErrorText = document.getElementById('draw-error-text');

    async function openDrawModal(l) {
      drawingLotteryId = l.lotteryId;
      document.getElementById('draw-modal-title').textContent = `Розыгрыш: ${l.title}`;
      drawModal.classList.remove('hidden');
      drawModal.classList.add('flex');
      await refreshDrawModal();
    }

    async function refreshDrawModal() {
      drawErrorText.classList.add('hidden');
      drawPrizeInput.value = '';
      drawManualNumberInput.value = '';
      drawWinnersList.innerHTML = '';
      drawParticipantCount.textContent = 'Загрузка участников...';
      drawParticipantsList.innerHTML = '';

      try {
        const [lotteries, remaining] = await Promise.all([
          callServer('getAdminLotteriesList'),
          callServer('getRemainingLotteryParticipants', drawingLotteryId)
        ]);
        const current = lotteries.find(l => l.lotteryId === drawingLotteryId);

        if (current && current.winners.length > 0) {
          drawWinnersList.innerHTML = current.winners
            .map(w => `<div class="text-xs text-gray-700">🏆 №${w.place} ${escapeHtmlClient(w.prize)} — ${escapeHtmlClient(w.displayName)}</div>`)
            .join('');
        }

        drawParticipantCount.textContent = `Ещё не выигравших: ${remaining.length}`;
        drawParticipantsList.innerHTML = remaining
          .map(p => `<div class="px-3 py-1.5 text-xs text-gray-600 flex justify-between gap-2"><span>№${p.number}</span><span class="truncate">${escapeHtmlClient(p.displayName || p.telegramId)}</span></div>`)
          .join('') || '<div class="px-3 py-2 text-xs text-gray-400">Больше некого разыгрывать</div>';
      } catch (error) {
        drawParticipantCount.textContent = '';
        drawParticipantsList.innerHTML = `<div class="px-3 py-2 text-xs text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function closeDrawModal() {
      drawModal.classList.add('hidden');
      drawModal.classList.remove('flex');
      drawingLotteryId = null;
      loadLotteries();
    }
    document.getElementById('draw-modal-close').addEventListener('click', closeDrawModal);

    async function runDraw(mode, winnerNumber) {
      drawErrorText.classList.add('hidden');
      const prize = drawPrizeInput.value.trim();
      if (prize === '') {
        drawErrorText.textContent = 'Введите приз для этого места.';
        drawErrorText.classList.remove('hidden');
        return;
      }

      drawAutoBtn.disabled = true;
      drawManualBtn.disabled = true;
      try {
        const result = await callServer('drawLotteryPrize', drawingLotteryId, prize, mode, winnerNumber);
        showSaveToast(true, `Победитель: ${result.winnerDisplayName}`);
        await refreshDrawModal();
      } catch (error) {
        drawErrorText.textContent = error.message;
        drawErrorText.classList.remove('hidden');
      } finally {
        drawAutoBtn.disabled = false;
        drawManualBtn.disabled = false;
      }
    }

    drawAutoBtn.addEventListener('click', () => runDraw('auto', undefined));

    drawManualBtn.addEventListener('click', () => {
      const num = Number(drawManualNumberInput.value);
      if (!drawManualNumberInput.value || num < 1) {
        drawErrorText.textContent = 'Введите номер участника (1 и более).';
        drawErrorText.classList.remove('hidden');
        return;
      }
      runDraw('manual', num);
    });

    drawFinishBtn.addEventListener('click', async () => {
      drawErrorText.classList.add('hidden');
      if (!confirm('Завершить розыгрыш? Действие необратимо — новые призы в этой лотерее разыграть будет нельзя.')) return;

      drawFinishBtn.disabled = true;
      try {
        await callServer('finishLottery', drawingLotteryId);
        showSaveToast(true, 'Розыгрыш завершён, участники оповещены');
        closeDrawModal();
      } catch (error) {
        drawErrorText.textContent = error.message;
        drawErrorText.classList.remove('hidden');
      } finally {
        drawFinishBtn.disabled = false;
      }
    });

    // --- Модалка доски ячеек (Тип1, только просмотр для админа) ---
    const boardModal = document.getElementById('board-modal');
    const boardGrid = document.getElementById('board-grid');

    async function openBoardModal(l) {
      document.getElementById('board-modal-title').textContent = `Доска: ${l.title}`;
      boardGrid.innerHTML = '<div class="col-span-6 text-center text-xs text-gray-400 py-6">Загрузка...</div>';
      boardModal.classList.remove('hidden');
      boardModal.classList.add('flex');

      try {
        const board = await callServer('getAdminLotteryBoard', l.lotteryId);
        boardGrid.innerHTML = '';
        board.cells.forEach(c => {
          const cell = document.createElement('div');
          cell.className = `aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium ${c.taken ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-400'}`;
          cell.textContent = c.cell;
          if (c.taken) cell.title = c.displayName;
          boardGrid.appendChild(cell);
        });
      } catch (error) {
        boardGrid.innerHTML = `<div class="col-span-6 text-center text-xs text-red-500 py-6">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    document.getElementById('board-modal-close').addEventListener('click', () => {
      boardModal.classList.add('hidden');
      boardModal.classList.remove('flex');
    });
  }
};
