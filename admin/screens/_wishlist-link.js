'use strict';

/**
 * «Связать с вишлистом клиента» (IMPLEMENTATION-PLAN-GAMIFICATION.md §3.0,
 * «Путь охоты», B2/B4 — VASY «ок» 26.09.2026). Одна галочка для «Корзины»
 * (позиция, строки «Размножить», позиции лота) и карточки заказа.
 *
 * Выбраны клиент и товар → сервер ищет активную позицию вишлиста клиента
 * (по SKU или по ключу модели справочника). Нашлась — галочка появляется
 * ВКЛЮЧЁННОЙ (снять — «вдруг заказывают не себе»), нет — блок скрыт.
 * Итоговую связь всё равно проверяет сервер (B3).
 *
 * Использование:
 *   const link = WishlistLink.attach(containerEl);
 *   link.refresh(telegramId, skuOriginal);   // после каждой смены клиента/товара
 *   link.preset({wishlistId, telegramId});   // пришли из «Спроса» с готовой позицией
 *   link.value();                            // wishlistId или ''
 */
window.WishlistLink = (() => {
  function attach(containerEl, { orderId = '', compact = false, defaultChecked = true } = {}) {
    const wrap = document.createElement('label');
    wrap.className = `wishlist-link hidden flex items-start gap-2 ${compact ? 'text-[11px] mt-1' : 'text-xs mb-2'} text-pink-700 cursor-pointer select-none`;
    wrap.innerHTML = `
      <input type="checkbox" class="wishlist-link-checkbox ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} mt-0.5 accent-pink-600 cursor-pointer">
      <span><span class="font-medium">Связать с вишлистом клиента</span><span class="wishlist-link-name text-pink-500"></span></span>`;
    containerEl.appendChild(wrap);
    const checkbox = wrap.querySelector('.wishlist-link-checkbox');
    const nameEl = wrap.querySelector('.wishlist-link-name');

    let current = null; // {wishlistId, name}
    let presetLink = null; // {wishlistId, telegramId}
    let requestSeq = 0;
    let lastKey = null;

    function show(match) {
      const changed = !current || !match || current.wishlistId !== match.wishlistId;
      current = match;
      wrap.classList.toggle('hidden', !match);
      if (!match) return;
      nameEl.textContent = match.name ? ` — «${match.name}»` : '';
      if (changed) checkbox.checked = defaultChecked; // новая позиция — снова по умолчанию
    }

    async function refresh(telegramId, skuOriginal) {
      const tg = (telegramId || '').toString().trim();
      const sku = (skuOriginal || '').toString().trim();
      const key = `${tg}|${sku.toLowerCase()}`;
      if (key === lastKey) return;
      lastKey = key;
      const seq = ++requestSeq;
      const fallback = presetLink && presetLink.telegramId === tg ? { wishlistId: presetLink.wishlistId, name: '' } : null;
      if (!tg || !sku) { show(fallback); return; }
      let match = null;
      try {
        match = await callServer('findClientWishlistMatch', tg, sku, orderId);
      } catch (_e) { match = null; /* подсказка, не блокирует оформление */ }
      if (seq !== requestSeq) return; // успели выбрать другого клиента/товар
      show(match || fallback);
    }

    return {
      refresh,
      preset(link) {
        if (!link || !link.wishlistId) return;
        presetLink = { wishlistId: String(link.wishlistId), telegramId: (link.telegramId || '').toString().trim() };
        show({ wishlistId: presetLink.wishlistId, name: link.name || '' });
      },
      value() { return current && checkbox.checked ? current.wishlistId : ''; },
      /** Показанная позиция независимо от галочки (карточка заказа: что связать). */
      shownId() { return current ? current.wishlistId : ''; },
      setChecked(on) { checkbox.checked = on; },
      /** Уже связанная позиция в карточке заказа: показать включённой. */
      setLinked(link) {
        presetLink = link ? { wishlistId: String(link.wishlistId), telegramId: (link.telegramId || '').toString().trim() } : null;
        show(link ? { wishlistId: String(link.wishlistId), name: link.name || '' } : null);
        if (link) checkbox.checked = true;
      },
      onChange(fn) { checkbox.addEventListener('change', () => fn(checkbox.checked)); },
      el: wrap
    };
  }

  return { attach };
})();
