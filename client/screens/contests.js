'use strict';

/**
 * Экран "Конкурсы" — перенесён из client/contests.html (Phase 2 SPA,
 * 02.08.2026). Как и в wishlist.js, всё состояние и обвязка модалок, которые
 * раньше жили на верхнем уровне <script> страницы, перенесены ВНУТРЬ render(),
 * чтобы не утекать между заходами на экран в общем SPA-контексте.
 * showSaveToast — общая функция из router.js.
 *
 * Баланс сов/билетов + рефералка ПЕРЕНЕСЕНЫ на новый экран "Профиль"
 * (Подфаза 3.1+3.2 client_display_overhaul, 12.08.2026) — этот экран теперь
 * только лотереи/задания. Помощь по «?» оставлена — билеты по-прежнему
 * тратятся именно здесь (бронь ячеек лотерей Тип1).
 */
window.Screens = window.Screens || {};
window.Screens.contests = {
  render(root) {
    // Текст подсказки собран по реальной механике из backend (EconomyService.js,
    // CONSTANTS.ECONOMY_SOVY_PER_TICKET=100) — не выдумка, см. анализ юзерфрендли
    // фронтенда 05.08.2026.
    const balanceHelpBody = `
      <p><b>🦉 Совы</b> — начисляются за приглашение друга, за выполненные задания
      и при оплате заказа (в среднем 5000 ₽ оплаты ≈ 100 сов, точный курс задаёт
      команда).</p>
      <p>Каждые <b>100 Сов</b> автоматически превращаются в <b>1 Билет</b> — шкала
      выше показывает прогресс до следующего билета.</p>
      <p><b>🎟️ Билеты</b> нужны для лотерей с ячейками (бейдж «Премиум» на карточке):
      1 билет = 1 попытка забронировать ячейку на доске. Если ячейку в этот момент
      уже занял кто-то другой — билет не списывается, можно сразу попробовать другую.</p>
      <p>Обычные лотереи (без бейджа «Премиум») бесплатны — участие только по кнопке
      «Участвовать», без списания билетов.</p>
    `;

    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Конкурсы</h1>';
    document.getElementById('header-actions').innerHTML = `
      ${helpIcon('Совы, Билеты и лотереи', balanceHelpBody, { header: true })}
      <button id="refresh-btn" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="text-[11px] text-gray-400 px-1 mb-2">Лотереи</div>
        <div id="lotteries-list"></div>
        <div id="lotteries-empty-message" class="hidden">${buildEmptyState('ticket', 'Активных лотерей пока нет.')}</div>

        <div class="text-[11px] text-gray-400 px-1 mb-2">Задания</div>
        <div id="tasks-list"></div>
        <div id="empty-message" class="hidden">${buildEmptyState('clipboard-list', 'Заданий пока нет.')}</div>
      </main>

      <div id="proof-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id="proof-modal-title" class="text-base font-semibold text-gray-900">Отправить на проверку</h2>
            <button id="proof-modal-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p id="proof-modal-description" class="text-xs text-gray-500"></p>
            <div>
              <label class="text-xs font-medium text-gray-500">Текст или ссылка *</label>
              <textarea id="proof-text-input" rows="4"
                class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none"
                placeholder="Например: ссылка на пост с отзывом"></textarea>
            </div>
          </div>
          <div id="proof-error-text" class="px-4 text-xs text-red-500 hidden"></div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="proof-modal-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="proof-modal-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отправить</button>
          </div>
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
            <div class="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block"></span>Свободна</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-400 inline-block"></span>Занята</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span>Ваша</span>
            </div>
            <div id="board-error-text" class="text-xs text-red-500 hidden"></div>
            <div id="board-grid" class="grid grid-cols-6 gap-1.5"></div>
          </div>
          <div class="p-4"></div>
        </div>
      </div>
    `;

    let reloadAll = null;
    let submittingTaskId = null;
    let boardLotteryId = null;

    const tasksList = document.getElementById('tasks-list');
    const emptyMessage = document.getElementById('empty-message');
    const lotteriesList = document.getElementById('lotteries-list');
    const lotteriesEmptyMessage = document.getElementById('lotteries-empty-message');
    const refreshBtn = document.getElementById('refresh-btn');

    loadAll();
    reloadAll = loadAll;

    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await loadAll();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    async function loadAll() {
      await Promise.all([loadTasks(), loadLotteries()]);
    }

    async function loadLotteries() {
      lotteriesList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const lotteries = await callServer('getLotteriesList');
        renderLotteries(lotteries);
      } catch (error) {
        lotteriesList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderLotteries(lotteries) {
      lotteriesList.innerHTML = '';
      if (lotteries.length === 0) {
        lotteriesEmptyMessage.classList.remove('hidden');
        return;
      }
      lotteriesEmptyMessage.classList.add('hidden');
      lotteries.forEach(l => lotteriesList.appendChild(buildLotteryCard(l)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildLotteryCard(l) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      const conditionsHtml = l.conditions && l.conditions.length > 0
        ? l.conditions.map(c => `
            <div class="text-[12px] ${c.done ? 'text-green-600' : 'text-gray-500'} flex items-start gap-1">
              <span>${c.done ? '✓' : '•'}</span>
              <span>${escapeHtmlClient(c.title)}${c.description ? ` — ${escapeHtmlClient(c.description)}` : ''}</span>
            </div>
          `).join('')
        : '<div class="text-[12px] text-gray-400">Без условий — вход всем</div>';

      const isType1 = l.type === 'Тип1';
      const countLine = isType1
        ? `Забронировано: ${l.bookedCount} из ${l.totalCells} · Ваших ячеек: ${l.myCellCount}/${l.maxCellsPerClient}`
        : `Участников: ${l.participantCount}`;

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(l.title)}</div>
            ${isType1 ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">Премиум</span>' : ''}
          </div>
        </div>
        ${l.prize ? `<div class="text-[13px] text-gray-500 mt-1">Приз: ${escapeHtmlClient(l.prize)}</div>` : ''}
        <div class="mt-2 space-y-0.5">${conditionsHtml}</div>
        <div class="text-[12px] text-gray-400 mt-2">${countLine}</div>
        ${isType1 ? '<div class="text-[11px] text-gray-400 mt-0.5">Бронь ячейки — 1 билет за попытку, спишется только при удаче</div>' : ''}
      `;

      if (isType1) {
        if (!l.conditionMet) {
          const hint = document.createElement('div');
          hint.className = 'mt-3 text-[12px] text-gray-500';
          hint.textContent = 'Сначала выполните условия выше, отмеченные точкой.';
          card.appendChild(hint);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium';
          btn.textContent = 'Открыть доску';
          btn.addEventListener('click', () => openBoardModal(l));
          card.appendChild(btn);
        }
        return card;
      }

      if (l.alreadyJoined) {
        const badge = document.createElement('div');
        badge.className = 'mt-3 w-full py-2 rounded-xl bg-green-50 text-green-700 text-xs font-medium text-center';
        badge.textContent = 'Вы участвуете';
        card.appendChild(badge);
      } else if (l.conditionMet) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium';
        btn.textContent = 'Участвовать';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await callServer('joinLottery', l.lotteryId);
            showSaveToast(true, 'Вы участвуете в розыгрыше');
            loadLotteries();
          } catch (error) {
            btn.disabled = false;
            showSaveToast(false, `Не удалось: ${error.message}`);
          }
        });
        card.appendChild(btn);
      } else {
        const hint = document.createElement('div');
        hint.className = 'mt-3 text-[12px] text-gray-500';
        hint.textContent = 'Сначала выполните условия выше, отмеченные точкой.';
        card.appendChild(hint);
      }

      return card;
    }

    async function loadTasks() {
      tasksList.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      try {
        const tasks = await callServer('getTasksList');
        renderTasks(tasks);
      } catch (error) {
        tasksList.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function renderTasks(tasks) {
      tasksList.innerHTML = '';
      if (tasks.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }
      emptyMessage.classList.add('hidden');
      tasks.forEach(t => tasksList.appendChild(buildTaskCard(t)));
      if (window.lucide) window.lucide.createIcons();
    }

    function buildTaskCard(t) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3';

      const statusBadges = {
        done: '<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Выполнено</span>',
        pending: '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">На проверке</span>',
        rejected: '<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">Отклонено</span>',
        not_done: '<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Не выполнено</span>',
      };

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="font-semibold text-gray-900 text-[15px]">${escapeHtmlClient(t.title)}</div>
          ${statusBadges[t.status] || ''}
        </div>
        ${t.description ? `<div class="text-[13px] text-gray-500 mt-1">${escapeHtmlClient(t.description)}</div>` : ''}
        <div class="text-[12px] text-indigo-600 mt-2 font-medium">+${t.reward} сов</div>
      `;

      // Повторяемые задания (баг-репорт и т.п.) — кнопка отправки доступна
      // всегда, независимо от статуса предыдущей заявки: клиент может
      // прислать сразу несколько разных заявок по одному заданию.
      const canSubmit = t.type === 'Ручное' && (t.repeatable || t.status === 'not_done' || t.status === 'rejected');
      if (canSubmit) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium';
        btn.textContent = t.repeatable && (t.status === 'done' || t.status === 'pending')
          ? 'Отправить ещё одну заявку'
          : (t.status === 'rejected' ? 'Отправить снова' : 'Отправить на проверку');
        btn.addEventListener('click', () => openProofModal(t));
        card.appendChild(btn);
      }

      return card;
    }

    // --- Модалка отправки доказательства ---
    const proofModal = document.getElementById('proof-modal');
    const proofTextInput = document.getElementById('proof-text-input');
    const proofErrorText = document.getElementById('proof-error-text');

    function openProofModal(task) {
      submittingTaskId = task.taskId;
      proofTextInput.value = '';
      proofErrorText.classList.add('hidden');
      document.getElementById('proof-modal-title').textContent = task.title;
      document.getElementById('proof-modal-description').textContent = task.description || '';
      proofModal.classList.remove('hidden');
      proofModal.classList.add('flex');
    }

    function closeProofModal() {
      proofModal.classList.add('hidden');
      proofModal.classList.remove('flex');
      submittingTaskId = null;
    }
    document.getElementById('proof-modal-close').addEventListener('click', closeProofModal);
    document.getElementById('proof-modal-cancel').addEventListener('click', closeProofModal);

    const proofModalSaveBtn = document.getElementById('proof-modal-save');
    proofModalSaveBtn.addEventListener('click', async () => {
      proofErrorText.classList.add('hidden');
      const text = proofTextInput.value.trim();
      if (text === '') {
        proofErrorText.textContent = 'Добавьте текст или ссылку.';
        proofErrorText.classList.remove('hidden');
        return;
      }

      proofModalSaveBtn.disabled = true;
      try {
        await callServer('submitTaskProof', submittingTaskId, text);
        closeProofModal();
        showSaveToast(true, 'Отправлено на проверку');
        if (reloadAll) reloadAll();
      } catch (error) {
        proofErrorText.textContent = error.message;
        proofErrorText.classList.remove('hidden');
      } finally {
        proofModalSaveBtn.disabled = false;
      }
    });

    // --- Модалка доски ячеек (Тип1) ---
    const boardModal = document.getElementById('board-modal');
    const boardGrid = document.getElementById('board-grid');
    const boardErrorText = document.getElementById('board-error-text');

    async function openBoardModal(l) {
      boardLotteryId = l.lotteryId;
      boardErrorText.classList.add('hidden');
      document.getElementById('board-modal-title').textContent = l.title;
      boardModal.classList.remove('hidden');
      boardModal.classList.add('flex');
      await refreshBoardModal();
    }

    async function refreshBoardModal() {
      boardGrid.innerHTML = '<div class="col-span-6 text-center text-xs text-gray-400 py-6">Загрузка...</div>';
      try {
        const board = await callServer('getLotteryBoard', boardLotteryId);
        boardGrid.innerHTML = '';
        board.cells.forEach(c => {
          const cell = document.createElement('button');
          cell.type = 'button';
          let style = 'bg-gray-100 text-gray-500 hover:bg-gray-200';
          if (c.mine) style = 'bg-green-500 text-white';
          else if (c.taken) style = 'bg-gray-400 text-white cursor-not-allowed';
          cell.className = `aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium ${style}`;
          cell.textContent = c.cell;
          cell.disabled = c.taken;
          cell.addEventListener('click', () => bookCell(c.cell));
          boardGrid.appendChild(cell);
        });
      } catch (error) {
        boardGrid.innerHTML = `<div class="col-span-6 text-center text-xs text-red-500 py-6">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    async function bookCell(cellNumber) {
      boardErrorText.classList.add('hidden');
      if (!confirm(`Забронировать ячейку №${cellNumber} за 1 билет?`)) return;

      try {
        await callServer('bookLotteryCell', boardLotteryId, cellNumber);
        showSaveToast(true, `Ячейка №${cellNumber} забронирована`);
        await refreshBoardModal();
        if (reloadAll) reloadAll();
      } catch (error) {
        boardErrorText.textContent = error.message;
        boardErrorText.classList.remove('hidden');
        await refreshBoardModal(); // могли проиграть гонку — обновляем доску, чтобы не давать давить на уже занятую ячейку
      }
    }

    document.getElementById('board-modal-close').addEventListener('click', () => {
      boardModal.classList.add('hidden');
      boardModal.classList.remove('flex');
      boardLotteryId = null;
      if (reloadAll) reloadAll();
    });
  }
};
