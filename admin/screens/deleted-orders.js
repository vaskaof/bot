'use strict';

/**
 * Экран "Удалённые" (16.08.2026, project_bot_knopka_order_deletion) —
 * список soft-deleted заказов ("Удалён?"="Да" на бэкенде) с возможностью
 * восстановить. Открывается иконкой из orders.js (тот же паттерн, что
 * "Коллективки" — НЕ входит в нижнюю навигацию, showNav:true/navKey:null
 * в router.js, см. известный долг frontend-nav.md — не плодить копии
 * <nav> без отдельного обсуждения).
 *
 * Восстановление НЕ откатывает денежные решения, принятые при удалении
 * (см. JSDoc backend `ordersService.restoreOrder`) — платежи, отменённые
 * тогда, заново не появляются; платежи, оставленные "в пул", уже могли уйти
 * на другие открытые заказы клиента. Баннер ниже — explicit предупреждение
 * об этом, не убирать при рефакторинге экрана.
 */
window.Screens = window.Screens || {};
window.Screens.deletedOrders = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Удалённые</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="refresh-deleted-orders" title="Обновить список" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    document.getElementById('back-btn').addEventListener('click', () => navigateTo('orders'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-700">
          Восстановление возвращает заказ в список, но НЕ отменяет решения по оплатам, принятые при удалении — отменённые платежи заново не появятся, а оставленные "в пул" могли уже уйти на другие заказы клиента.
        </div>

        <div class="text-[11px] text-gray-400 px-1 mb-2" id="deleted-orders-count"></div>

        <div id="deleted-orders-list"></div>
        <div id="empty-message" class="hidden text-center text-sm text-gray-400 py-10">Удалённых заказов нет</div>
      </main>
    `;

    const listEl = document.getElementById('deleted-orders-list');
    const countEl = document.getElementById('deleted-orders-count');
    const emptyEl = document.getElementById('empty-message');

    function renderItem(order) {
      const div = document.createElement('div');
      div.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-2';
      div.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(order.productDisplay || order.orderId)}</p>
            <p class="text-xs text-gray-500 truncate">${escapeHtmlClient(order.clientDisplay || '')}</p>
            <p class="text-[11px] text-gray-400 mt-1">${escapeHtmlClient(order.statusOrder || '')}${order.statusOrder && order.statusDelivery ? ' · ' : ''}${escapeHtmlClient(order.statusDelivery || '')}</p>
            <p class="text-[11px] text-gray-400 mt-1">Удалил: ${escapeHtmlClient(order.deletedInfo || '—')}</p>
          </div>
          <button data-restore-id="${escapeHtmlClient(order.orderId)}" class="restore-order-btn shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500 text-indigo-600 hover:bg-indigo-50">Восстановить</button>
        </div>
      `;
      return div;
    }

    async function load() {
      listEl.innerHTML = '';
      let orders;
      try {
        orders = await callServer('getDeletedOrdersList');
      } catch (error) {
        showSaveToast(false, `Не получилось загрузить список: ${error.message}`);
        return;
      }

      countEl.textContent = orders.length > 0 ? `Всего: ${orders.length}` : '';
      emptyEl.classList.toggle('hidden', orders.length > 0);

      orders.forEach((order) => listEl.appendChild(renderItem(order)));

      listEl.querySelectorAll('.restore-order-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const orderId = btn.dataset.restoreId;
          if (!(await showConfirmModal(`Восстановить заказ ${orderId}? Он снова появится в общем списке заказов.`, { confirmLabel: 'Восстановить' }))) return;
          btn.disabled = true;
          btn.textContent = 'Восстанавливаю...';
          try {
            await callServer('restoreOrder', orderId);
            showSaveToast(true, 'Заказ восстановлен');
            load();
          } catch (error) {
            showSaveToast(false, `Не получилось восстановить: ${error.message}`);
            btn.disabled = false;
            btn.textContent = 'Восстановить';
          }
        });
      });

      if (window.lucide) window.lucide.createIcons();
    }

    document.getElementById('refresh-deleted-orders').addEventListener('click', load);
    load();
  }
};
