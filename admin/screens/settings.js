'use strict';

/**
 * Экран "Настройки" (13.08.2026, project_bot_knopka_financial_settings_ui,
 * Фаза 1) — комиссия/налоговый резерв/доли выплат, редактируемые без
 * деплоя. Заменяет ручную правку листа "Настройки_Финансов".
 *
 * Категория `payout_share` (доли выплат) — ОСОБЫЙ блок, редактируется ТОЛЬКО
 * целиком через `replacePayoutShares` (сервер отказывает целиком, если сумма
 * ≠ 100%, см. `financialSettingsRepository.js`) — правки долей копятся
 * локально (`sharesDraft`), кнопка "Сохранить доли" неактивна, пока сумма ≠
 * 100%. Остальные категории (`commission`/`tax_reserve`/`forecast`)
 * редактируются построчно, сохранение сразу по кнопке у строки.
 */
window.Screens = window.Screens || {};

const CATEGORY_LABELS = {
  commission: 'Комиссия',
  tax_reserve: 'Налоговый резерв',
  forecast: 'Прогноз расходов на заказ',
  payout_share: 'Доли выплат'
};
const CATEGORY_ORDER = ['commission', 'tax_reserve', 'forecast', 'payout_share'];
const SHARE_SUM_TOLERANCE = 0.01;

function slugKey(label) {
  return label.trim().replace(/\s+/g, '_');
}

window.Screens.settings = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Настройки</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-10 px-4 md:px-0 max-w-2xl mx-auto">
        <div id="settings-body" class="text-center text-sm text-gray-400 py-10">Загрузка...</div>
      </main>
    `;

    let sharesDraft = null; // {key,label,value}[] — черновик долей выплат, до "Сохранить доли"
    let allSettingsCache = []; // плоский список всех настроек (не-payout_share) — нужен save-row-btn'у для label/type

    load();

    async function load() {
      const body = document.getElementById('settings-body');
      try {
        const settings = await callServer('getFinancialSettings');
        allSettingsCache = settings;
        sharesDraft = settings.filter(s => s.category === 'payout_share').map(s => ({ ...s }));
        renderBody(settings);
      } catch (error) {
        body.innerHTML = `<div class="text-center text-sm text-red-500 py-10">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function renderBody(settings) {
      const body = document.getElementById('settings-body');
      const byCategory = {};
      settings.forEach(s => {
        if (s.category === 'payout_share') return; // рендерится из sharesDraft, не из сырого списка
        (byCategory[s.category] = byCategory[s.category] || []).push(s);
      });

      body.innerHTML = CATEGORY_ORDER.map(cat => cat === 'payout_share' ? sharesSectionHtml() : plainSectionHtml(cat, byCategory[cat] || [])).join('');

      CATEGORY_ORDER.filter(c => c !== 'payout_share').forEach(cat => wirePlainSection(cat));
      wireSharesSection();
      wireAddPosition();
      if (window.lucide) window.lucide.createIcons();
    }

    function plainSectionHtml(category, rows) {
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS[category]}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" data-category="${category}">
            ${rows.length === 0 ? '<div class="p-4 text-sm text-gray-400">Пока пусто</div>' : rows.map(rowHtml).join('')}
          </div>
        </section>
      `;
    }

    function rowHtml(s) {
      return `
        <div class="flex items-center gap-2 p-3" data-row-key="${escapeHtmlClient(s.key)}">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(s.label)}</div>
            <div class="text-[11px] text-gray-400">${escapeHtmlClient(s.key)}</div>
          </div>
          <input type="number" step="0.01" class="value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${s.value}" />
          <span class="text-sm text-gray-400 w-4">${s.type === 'percent' ? '%' : '₽'}</span>
          <button type="button" class="save-row-btn p-2 text-indigo-600 rounded-full hover:bg-indigo-50" title="Сохранить">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <button type="button" class="delete-row-btn p-2 text-gray-400 rounded-full hover:bg-red-50 hover:text-red-500" title="Удалить">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function wirePlainSection(category) {
      const container = document.querySelector(`[data-category="${category}"]`);
      if (!container) return;

      container.querySelectorAll('[data-row-key]').forEach(row => {
        const key = row.dataset.rowKey;
        const setting = (allSettingsCache || []).find(s => s.key === key);
        row.querySelector('.save-row-btn').addEventListener('click', async () => {
          const input = row.querySelector('.value-input');
          const value = parseFloat(input.value);
          if (isNaN(value)) { showSaveToast(false, 'Значение должно быть числом.'); return; }
          try {
            await callServer('upsertFinancialSetting', { key, label: setting.label, value, type: setting.type, category: setting.category });
            showSaveToast(true, 'Сохранено.');
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
        row.querySelector('.delete-row-btn').addEventListener('click', async () => {
          if (!confirm(`Удалить параметр «${setting.label}»?`)) return;
          try {
            await callServer('deleteFinancialSetting', key);
            showSaveToast(true, 'Удалено.');
            load();
          } catch (error) {
            showSaveToast(false, error.message);
          }
        });
      });
    }

    function sharesSectionHtml() {
      const sum = sharesDraft.reduce((total, s) => total + (parseFloat(s.value) || 0), 0);
      const sumOk = Math.abs(sum - 100) <= SHARE_SUM_TOLERANCE;
      return `
        <section class="mb-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">${CATEGORY_LABELS.payout_share}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100" id="shares-list">
            ${sharesDraft.length === 0 ? '<div class="p-4 text-sm text-gray-400">Пока пусто</div>' : sharesDraft.map((s, i) => shareRowHtml(s, i)).join('')}
          </div>
          <div class="flex items-center justify-between mt-2 px-1">
            <span id="shares-sum" class="text-sm font-medium ${sumOk ? 'text-green-600' : 'text-red-500'}">Сумма: ${sum}%${sumOk ? '' : ' — должно быть 100%'}</span>
            <button type="button" id="add-share-btn" class="text-xs font-medium text-indigo-600">+ Добавить долю</button>
          </div>
          <button type="button" id="save-shares-btn" ${sumOk ? '' : 'disabled'}
            class="w-full mt-2 py-2.5 rounded-xl text-sm font-medium ${sumOk ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}">
            Сохранить доли
          </button>
        </section>
      `;
    }

    function shareRowHtml(s, index) {
      return `
        <div class="flex items-center gap-2 p-3" data-share-index="${index}">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(s.label)}</div>
            <div class="text-[11px] text-gray-400">${escapeHtmlClient(s.key)}</div>
          </div>
          <input type="number" step="0.01" class="share-value-input w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right" value="${s.value}" />
          <span class="text-sm text-gray-400 w-4">%</span>
          <button type="button" class="remove-share-btn p-2 text-gray-400 rounded-full hover:bg-red-50 hover:text-red-500" title="Убрать (не сохранено, пока не нажата 'Сохранить доли')">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }

    function wireSharesSection() {
      document.querySelectorAll('.share-value-input').forEach(input => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.closest('[data-share-index]').dataset.shareIndex, 10);
          sharesDraft[idx].value = parseFloat(input.value) || 0;
          refreshSharesSum();
        });
      });
      document.querySelectorAll('.remove-share-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.closest('[data-share-index]').dataset.shareIndex, 10);
          sharesDraft.splice(idx, 1);
          rerenderShares();
        });
      });
      const addBtn = document.getElementById('add-share-btn');
      if (addBtn) addBtn.addEventListener('click', () => {
        const label = prompt('Название доли (например, "Реклама"):');
        if (!label || !label.trim()) return;
        sharesDraft.push({ key: 'Доля_' + slugKey(label) + '_Процент', label: label.trim(), value: 0 });
        rerenderShares();
      });
      const saveBtn = document.getElementById('save-shares-btn');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохраняю...';
        try {
          await callServer('replacePayoutShares', sharesDraft);
          showSaveToast(true, 'Доли сохранены.');
          load();
        } catch (error) {
          showSaveToast(false, error.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Сохранить доли';
        }
      });
    }

    function refreshSharesSum() {
      const sum = sharesDraft.reduce((total, s) => total + (parseFloat(s.value) || 0), 0);
      const sumOk = Math.abs(sum - 100) <= SHARE_SUM_TOLERANCE;
      const sumLabel = document.getElementById('shares-sum');
      const saveBtn = document.getElementById('save-shares-btn');
      if (sumLabel) {
        sumLabel.textContent = `Сумма: ${sum}%${sumOk ? '' : ' — должно быть 100%'}`;
        sumLabel.className = `text-sm font-medium ${sumOk ? 'text-green-600' : 'text-red-500'}`;
      }
      if (saveBtn) {
        saveBtn.disabled = !sumOk;
        saveBtn.className = `w-full mt-2 py-2.5 rounded-xl text-sm font-medium ${sumOk ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`;
      }
    }

    function rerenderShares() {
      const section = document.getElementById('shares-list').closest('section');
      section.outerHTML = sharesSectionHtml();
      wireSharesSection();
      if (window.lucide) window.lucide.createIcons();
    }

    function wireAddPosition() {
      const body = document.getElementById('settings-body');
      const addSection = document.createElement('div');
      addSection.className = 'mt-2';
      addSection.innerHTML = `<button type="button" id="add-position-btn" class="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500">+ Добавить позицию</button>`;
      body.appendChild(addSection);
      document.getElementById('add-position-btn').addEventListener('click', async () => {
        const label = prompt('Название параметра:');
        if (!label || !label.trim()) return;
        const category = prompt('Категория — commission / tax_reserve / forecast:', 'forecast');
        if (!category || !['commission', 'tax_reserve', 'forecast'].includes(category.trim())) {
          showSaveToast(false, 'Категория должна быть commission, tax_reserve или forecast.');
          return;
        }
        const type = prompt('Тип — percent / fixed:', 'percent');
        if (!type || !['percent', 'fixed'].includes(type.trim())) {
          showSaveToast(false, 'Тип должен быть percent или fixed.');
          return;
        }
        const valueRaw = prompt('Значение:', '0');
        const value = parseFloat(valueRaw);
        if (isNaN(value)) { showSaveToast(false, 'Значение должно быть числом.'); return; }
        try {
          await callServer('upsertFinancialSetting', { key: slugKey(label), label: label.trim(), value, type: type.trim(), category: category.trim() });
          showSaveToast(true, 'Добавлено.');
          load();
        } catch (error) {
          showSaveToast(false, error.message);
        }
      });
    }
  }
};
