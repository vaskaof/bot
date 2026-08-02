'use strict';

/**
 * Общие хелперы форм заказа — раньше дословно дублировались в index.html и
 * edit-order.html (populateSelect/initTagToggle/renderDropdown). Используются
 * order-new.js/order-edit.js.
 */
window.FormHelpers = {
  /** Заполняет <select> значениями справочника с плейсхолдером "не выбрано". */
  populateSelect(selector, values) {
    const select = document.querySelector(selector);
    if (!select || !values) return;
    const placeholder = '<option value="" selected disabled>— не выбрано —</option>';
    select.innerHTML = placeholder + values.map(v => `<option value="${v}">${v}</option>`).join('');
  },

  /**
   * Универсальный обработчик тэг-переключателей Да/Нет. Состояние хранится
   * в data-value контейнера.
   */
  initTagToggle(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const buttons = container.querySelectorAll('.toggle-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.toggleValue;
        container.dataset.value = value;

        buttons.forEach(b => {
          const active = b.dataset.toggleValue === value;
          b.classList.toggle('border-indigo-500', active);
          b.classList.toggle('bg-indigo-50', active);
          b.classList.toggle('text-indigo-600', active);
          b.classList.toggle('border-gray-200', !active);
          b.classList.toggle('text-gray-500', !active);
        });
      });
    });
  },

  /** Программно выставляет состояние тэг-переключателя (для предзаполнения из загруженных данных). */
  setTagToggle(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.value = value;
    container.querySelectorAll('.toggle-btn').forEach(b => {
      const active = b.dataset.toggleValue === value;
      b.classList.toggle('border-indigo-500', active);
      b.classList.toggle('bg-indigo-50', active);
      b.classList.toggle('text-indigo-600', active);
      b.classList.toggle('border-gray-200', !active);
      b.classList.toggle('text-gray-500', !active);
    });
  },

  /** Общий рендер выпадающего списка автокомплита (release/client search). */
  renderDropdown(container, items, templateFn, onSelect) {
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center">Ничего не найдено</div>';
    } else {
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors last:border-0';
        li.innerHTML = templateFn(item);
        li.addEventListener('click', (e) => {
          const editBtn = e.target.closest('.sku-edit-icon');
          if (editBtn) {
            e.stopPropagation();
            onSelect(null, editBtn);
            return;
          }
          onSelect(item, null);
        });
        container.appendChild(li);
      });
    }
    container.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  }
};
