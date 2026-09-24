'use strict';

/**
 * Вставили ссылку на товар → какая это позиция каталога
 * (IMPLEMENTATION-PLAN-GAMIFICATION.md §11.12, уровни А/Б/В, VASY «да»
 * 24.09.2026). Общий разбор ответа `resolveOrderProductLink` для «Корзины»
 * (позиция, лот) и карточки заказа — чтобы три места вели себя одинаково.
 *
 * - `matched` (А: та же ссылка или код модели) → позиция каталога сразу;
 * - `suggest` (Б) → окно выбора: сначала «есть у нас», ниже — «из
 *   справочника» (новая позиция, заполненная моделью), «Новая позиция» по
 *   странице, «Отмена»;
 * - `unmatched` (В или ничего) → новая позиция, форма заполнена из
 *   справочника (если модель нашлась) или по странице.
 *
 * Использование:
 *   const choice = await LinkMatch.resolve(result);
 *   // {kind:'sku', sku:{original, shortName, imageUrl}} | {kind:'new', prefill} | null (отмена)
 *   // prefill — третий параметр SkuModal.open('create', null, prefill)
 */
window.LinkMatch = (() => {
  const REASONS = {
    url_conflict: 'Код в ссылке указывает на одну куклу, а слова в адресе — на другую. Проверьте, какая это.',
    same_code: 'Такой код модели есть у нескольких позиций каталога.',
    several_codes: 'В ссылке несколько кодов модели.',
    by_title: 'Похоже по названию страницы — проверьте.'
  };

  function ensureModal() {
    let modal = document.getElementById('link-match-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'link-match-modal';
    modal.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-[75] px-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-base font-semibold text-gray-900">Какая это кукла?</h2>
          <button type="button" id="link-match-close" title="Закрыть" class="p-1 text-gray-400 hover:text-gray-600">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div id="link-match-body" class="p-4 overflow-y-auto space-y-3"></div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function thumb(url) {
    return url
      ? `<img src="${escapeHtmlClient(url)}" alt="" class="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0" onerror="this.style.visibility='hidden'">`
      : '<div class="w-12 h-12 rounded-lg bg-gray-100 shrink-0"></div>';
  }

  function facts(o) {
    const series = o.line && o.subline && !o.line.includes('›') ? `${o.line} › ${o.subline}` : (o.line || o.subline || '');
    return [series, o.year, o.modelCode].filter(Boolean).map(v => escapeHtmlClient(String(v))).join(' · ');
  }

  function prefillFromResolved(resolved, reference) {
    const r = resolved || {};
    const tags = r.suggestedTags || null;
    return {
      original: r.title || (reference && reference.title) || '',
      description: r.description || '',
      imageUrl: r.imageUrl || (reference && reference.imageUrl) || '',
      brand: tags && tags.brand,
      character: tags && tags.character,
      series: tags && tags.series,
      modelCode: reference ? reference.modelCode : ''
    };
  }

  async function prefillFromModel(key, resolved) {
    const { model, suggestedTags } = await callServer('getReferenceModelPrefill', key);
    const r = resolved || {};
    return {
      original: r.title || model.title || '',
      description: r.description || '',
      imageUrl: r.imageUrl || model.imageUrl || '',
      brand: suggestedTags.brand,
      character: suggestedTags.character,
      series: suggestedTags.series,
      modelCode: model.modelCode || ''
    };
  }

  function choose(result) {
    const modal = ensureModal();
    const body = document.getElementById('link-match-body');
    const catalog = result.catalog || [];
    const reference = result.reference || [];

    body.innerHTML = `
      <div class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">${escapeHtmlClient(REASONS[result.reason] || REASONS.by_title)}</div>
      ${catalog.length > 0 ? `
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Есть у нас в каталоге</div>
        ${catalog.map((o, i) => `
          <div class="flex items-center gap-2 p-2 border border-indigo-100 bg-indigo-50/40 rounded-xl">
            ${thumb(o.imageUrl)}
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 break-words">${escapeHtmlClient(o.shortName || o.original)}</div>
              <div class="text-[11px] text-gray-500">${facts(o)}</div>
            </div>
            <button type="button" class="link-match-sku shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium" data-i="${i}">Это она</button>
          </div>`).join('')}` : ''}
      ${reference.length > 0 ? `
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-1">Из справочника — в каталоге нет</div>
        ${reference.map((m, i) => `
          <div class="flex items-center gap-2 p-2 border border-gray-200 rounded-xl">
            ${thumb(m.imageUrl)}
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 break-words">${escapeHtmlClient((m.characters || []).join(' & ') || m.title || '')}</div>
              <div class="text-[11px] text-gray-500">${facts(m)}</div>
            </div>
            <button type="button" class="link-match-ref shrink-0 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-medium" data-i="${i}">Новая — эта</button>
          </div>`).join('')}` : ''}
      <div class="flex gap-2 pt-1">
        <button type="button" id="link-match-new" class="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-700">Другая — новая позиция</button>
        <button type="button" id="link-match-cancel" class="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500">Отмена</button>
      </div>
      <div id="link-match-error" class="text-xs text-red-600 hidden"></div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();

    return new Promise((resolve) => {
      let done = false;
      function finish(value) {
        if (done) return;
        done = true;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        resolve(value);
      }
      document.getElementById('link-match-close').onclick = () => finish(null);
      document.getElementById('link-match-cancel').onclick = () => finish(null);
      document.getElementById('link-match-new').onclick = () => finish({ kind: 'new', prefill: prefillFromResolved(result.resolved, null) });
      body.querySelectorAll('.link-match-sku').forEach(btn => {
        btn.onclick = () => {
          const o = catalog[Number(btn.dataset.i)];
          finish({ kind: 'sku', sku: { original: o.original, shortName: o.shortName, imageUrl: o.imageUrl } });
        };
      });
      body.querySelectorAll('.link-match-ref').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            const prefill = await prefillFromModel(reference[Number(btn.dataset.i)].key, result.resolved);
            finish({ kind: 'new', prefill });
          } catch (error) {
            const err = document.getElementById('link-match-error');
            err.textContent = error.message;
            err.classList.remove('hidden');
            btn.disabled = false;
          }
        };
      });
    });
  }

  /**
   * @param {Object} result ответ resolveOrderProductLink
   * @returns {Promise<{kind:'sku', sku:Object}|{kind:'new', prefill:Object}|null>}
   */
  async function resolve(result) {
    if (!result) return null;
    if (result.status === 'matched') {
      const s = result.sku;
      return { kind: 'sku', sku: { original: s.original, shortName: s.shortName || s.original, imageUrl: s.imageUrl || '' }, via: result.via };
    }
    if (result.status === 'suggest') return choose(result);
    return { kind: 'new', prefill: prefillFromResolved(result.resolved, result.reference || null) };
  }

  return { resolve };
})();
