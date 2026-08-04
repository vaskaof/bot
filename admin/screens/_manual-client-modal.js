'use strict';

/**
 * Модалка ручного ввода клиента (непроверенный Telegram) — общий модуль
 * (02.08.2026), раньше дословно дублирован в index.html и edit-order.html.
 * Telegram ID остаётся пустым — привяжется автоматически при первом
 * обращении клиента к боту (ClientService.registerUser).
 *
 * Использование:
 *   root.innerHTML = `...основной контент... ${ManualClientModal.html()}`;
 *   const manualClientModal = ManualClientModal.init({
 *     onSaved: ({ username, name }) => { ...записать в форму заказа... }
 *   });
 *   manualClientModal.open();
 */
window.ManualClientModal = {
  html() {
    return `
      <div id="manual-client-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-[60] px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-semibold text-gray-900">Новый клиент (без подтверждения)</h2>
            <button id="manual-client-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500">Username (с @)</label>
              <input type="text" id="manual-client-username" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="@username">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500">Имя</label>
              <input type="text" id="manual-client-name" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Имя клиента">
            </div>
            <p class="text-xs text-gray-400">Telegram ID не подтверждён — привяжется автоматически при первом обращении клиента к боту.</p>
          </div>
          <div class="p-4 border-t border-gray-100 flex gap-2">
            <button id="manual-client-cancel" class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Отмена</button>
            <button id="manual-client-save" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Использовать</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * @param {{ onSaved: (data:{username:string, name:string}) => void }} options
   * @returns {{ open: () => void }}
   */
  init({ onSaved }) {
    function close() {
      document.getElementById('manual-client-modal').classList.add('hidden');
      document.getElementById('manual-client-modal').classList.remove('flex');
    }

    function open() {
      document.getElementById('manual-client-username').value = '';
      document.getElementById('manual-client-name').value = '';
      document.getElementById('manual-client-modal').classList.remove('hidden');
      document.getElementById('manual-client-modal').classList.add('flex');
    }

    document.getElementById('manual-client-close').addEventListener('click', close);
    document.getElementById('manual-client-cancel').addEventListener('click', close);

    document.getElementById('manual-client-save').addEventListener('click', () => {
      const username = document.getElementById('manual-client-username').value.trim();
      const name = document.getElementById('manual-client-name').value.trim();
      onSaved({ username, name });
      close();
    });

    return { open };
  }
};
