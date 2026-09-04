'use strict';

/**
 * Экран "Персонал" (Фаза 2, roles/RBAC, M2.3, 04.09.2026) — admin-only
 * (см. more.js/app.html/router.js — карточка/кнопка скрыты для менеджера;
 * реальный гейт — серверный MANAGER_ALLOWED_METHODS, не этот экран).
 * Использует getStaffList/addStaffMember/updateStaffRole/
 * deactivateStaffMember/reactivateStaffMember/getStaffAuditLog — canonical
 * контракт в backend `webapp-api.md`.
 */
window.Screens = window.Screens || {};
window.Screens.staff = {
  render(root, dictionaries, params, signal) {
    document.getElementById('header-left').innerHTML = '<h1 class="text-lg font-semibold text-gray-900 tracking-tight">Персонал</h1>';
    document.getElementById('header-actions').innerHTML = `
      <button type="button" id="staff-add-toggle-btn" class="p-2 -mr-2 text-indigo-600">
        <i data-lucide="user-plus" class="w-5 h-5"></i>
      </button>
    `;

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="staff-add-form" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 space-y-2">
          <div class="text-sm font-medium text-gray-900 mb-1">Добавить сотрудника</div>
          <input type="text" id="staff-add-telegram-id" placeholder="Telegram ID (только цифры)" inputmode="numeric"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
          <input type="text" id="staff-add-name" placeholder="Имя (для отображения)"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
          <select id="staff-add-role" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400">
            <option value="manager">Менеджер</option>
            <option value="admin">Админ</option>
          </select>
          <button type="button" id="staff-add-save-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Добавить</button>
        </div>
        <div id="staff-list" class="space-y-2"></div>
        <div id="staff-empty" class="hidden text-center text-sm text-gray-400 py-10">Пока нет ни одного сотрудника.</div>
      </main>
    `;

    document.getElementById('staff-add-toggle-btn').addEventListener('click', () => {
      document.getElementById('staff-add-form').classList.toggle('hidden');
    }, { signal });

    document.getElementById('staff-add-save-btn').addEventListener('click', async () => {
      const telegramId = document.getElementById('staff-add-telegram-id').value.trim();
      const name = document.getElementById('staff-add-name').value.trim();
      const accessRole = document.getElementById('staff-add-role').value;
      if (!/^\d+$/.test(telegramId)) {
        showSaveToast(false, 'Telegram ID должен состоять только из цифр.');
        return;
      }
      const btn = document.getElementById('staff-add-save-btn');
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await callServer('addStaffMember', telegramId, name, accessRole);
        showSaveToast(true, 'Сотрудник добавлен.');
        document.getElementById('staff-add-telegram-id').value = '';
        document.getElementById('staff-add-name').value = '';
        document.getElementById('staff-add-form').classList.add('hidden');
        await load();
      } catch (error) {
        showSaveToast(false, error.message || 'Не удалось добавить сотрудника.');
      } finally {
        btn.disabled = false;
      }
    }, { signal });

    if (window.lucide) window.lucide.createIcons();
    load();

    async function load() {
      const listEl = document.getElementById('staff-list');
      const emptyEl = document.getElementById('staff-empty');
      let items;
      try {
        items = await callServer('getStaffList');
      } catch (error) {
        listEl.innerHTML = `<div class="text-center text-sm text-red-500 py-10">${escapeHtmlClient(error.message || 'Не удалось загрузить список.')}</div>`;
        return;
      }

      if (items.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      listEl.innerHTML = items.map(item => `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4" data-telegram-id="${escapeHtmlClient(item.telegramId)}">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(item.name || '(без имени)')}</div>
              <div class="text-xs text-gray-400">ID ${escapeHtmlClient(item.telegramId)}</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] px-2 py-0.5 rounded-full ${item.accessRole === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600'}">${item.accessRole === 'admin' ? 'Админ' : 'Менеджер'}</span>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${item.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}">${item.isActive ? 'Активен' : 'Отключён'}</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" class="staff-role-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600">
              Сделать ${item.accessRole === 'admin' ? 'менеджером' : 'админом'}
            </button>
            <button type="button" class="staff-active-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border ${item.isActive ? 'border-red-200 text-red-500' : 'border-green-200 text-green-600'}">
              ${item.isActive ? 'Деактивировать' : 'Восстановить'}
            </button>
            <button type="button" class="staff-history-toggle-btn text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 ml-auto">
              История
            </button>
          </div>
          <div class="staff-history-block hidden mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1"></div>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-telegram-id]').forEach(card => {
        const telegramId = card.dataset.telegramId;
        const item = items.find(i => i.telegramId === telegramId);

        card.querySelector('.staff-role-toggle-btn').addEventListener('click', async () => {
          const newRole = item.accessRole === 'admin' ? 'manager' : 'admin';
          const ok = await showConfirmModal(`Сменить роль "${item.name || telegramId}" на ${newRole === 'admin' ? 'админа' : 'менеджера'}?`);
          if (!ok) return;
          try {
            await callServer('updateStaffRole', telegramId, newRole);
            showSaveToast(true, 'Роль изменена.');
            await load();
          } catch (error) {
            showSaveToast(false, error.message || 'Не удалось сменить роль.');
          }
        });

        card.querySelector('.staff-active-toggle-btn').addEventListener('click', async () => {
          const willDeactivate = item.isActive;
          const ok = await showConfirmModal(
            willDeactivate ? `Деактивировать "${item.name || telegramId}"? Доступ к панели будет закрыт немедленно.` : `Восстановить доступ "${item.name || telegramId}"?`,
            { danger: willDeactivate }
          );
          if (!ok) return;
          try {
            await callServer(willDeactivate ? 'deactivateStaffMember' : 'reactivateStaffMember', telegramId);
            showSaveToast(true, willDeactivate ? 'Доступ отключён.' : 'Доступ восстановлен.');
            await load();
          } catch (error) {
            showSaveToast(false, error.message || 'Не удалось выполнить действие.');
          }
        });

        card.querySelector('.staff-history-toggle-btn').addEventListener('click', async () => {
          const block = card.querySelector('.staff-history-block');
          if (!block.classList.contains('hidden')) {
            block.classList.add('hidden');
            return;
          }
          block.classList.remove('hidden');
          block.innerHTML = 'Загрузка…';
          try {
            const log = await callServer('getStaffAuditLog', telegramId);
            block.innerHTML = log.length === 0
              ? 'Нет событий.'
              : log.map(e => `<div>${escapeHtmlClient(formatAuditAction(e.action))}${e.details ? ' — ' + escapeHtmlClient(e.details) : ''} · ${escapeHtmlClient(e.actor || '?')}</div>`).join('');
          } catch (error) {
            block.innerHTML = escapeHtmlClient(error.message || 'Не удалось загрузить историю.');
          }
        });
      });

      if (window.lucide) window.lucide.createIcons();
    }

    function formatAuditAction(action) {
      const labels = { added: 'Добавлен', role_changed: 'Смена роли', activated: 'Активирован', deactivated: 'Деактивирован' };
      return labels[action] || action;
    }
  }
};
