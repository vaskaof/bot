'use strict';

/**
 * «Скриншот оформления → ИИ» в «Новой корзине» (волна 6 аудита менеджера,
 * 04.10.2026). Менеджер прикладывает (или вставляет из буфера) скриншот
 * страницы оформления заказа; сервер (`parseCheckoutScreenshot`, Gemini)
 * распознаёт его 10–35 с — форму в это время можно заполнять дальше
 * («фоном»). Результат — ТОЛЬКО подсказка: показывается блоком, в форму
 * попадает по кнопке «Подставить» и только в пустые поля (решение VASY
 * «я не доверяю конечное решение ИИ»). Вместо уверенности модели —
 * арифметическая сверка «позиции + доставка + налог − скидка = итог».
 *
 * Сам скриншот сохраняется к корзине после её создания (VASY 04.10:
 * «сохраняй на всякий случай») — cart-new.js зовёт getImage()/getParsed().
 *
 * Использование: CheckoutShot.html() в разметке экрана,
 * CheckoutShot.init({ signal, apply(parsed) → {filled:string[], skipped:string[]} }).
 */
window.CheckoutShot = {
  // Ширина важнее высоты: текст на длинном скриншоте с телефона должен
  // остаться читаемым для ИИ. Тело запроса к серверу ограничено 1 МБ,
  // сервер принимает до 700 КБ.
  MAX_WIDTH: 1280,
  MAX_HEIGHT: 4800,
  MAX_BYTES: 650 * 1024,

  /** Количество каждой позиции → отдельные строки по 1 шт. (одна строка = один заказ), не больше max. */
  expandUnits(items, max) {
    const out = [];
    (items || []).forEach((it) => {
      const q = Math.max(1, Math.min(20, parseInt(it.quantity, 10) || 1));
      for (let i = 0; i < q && out.length < max; i++) out.push(it);
    });
    return out;
  },

  html() {
    return `
      <div id="checkout-shot-card" class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-3 p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
            <i data-lucide="scan-text" class="w-5 h-5"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-700">Со скриншота оформления</div>
            <div id="checkout-shot-sub" class="text-[11px] text-gray-400">ИИ подскажет позиции и суммы — проверьте перед сохранением. Можно вставить из буфера.</div>
          </div>
          <label id="checkout-shot-pick" class="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[13px] font-medium cursor-pointer">
            Выбрать
            <input type="file" id="checkout-shot-input" accept="image/*" class="hidden">
          </label>
        </div>
        <div id="checkout-shot-body" class="hidden mt-3"></div>
      </div>
      <div id="checkout-shot-modal" class="fixed inset-0 bg-black/80 hidden items-center justify-center z-[60] p-3">
        <img id="checkout-shot-modal-img" class="max-w-full max-h-full object-contain rounded-lg" alt="">
      </div>`;
  },

  /** Сжатие в JPEG; не картинка/не влезает — Error с понятным текстом. */
  async compress(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Нужна картинка — скриншот страницы оформления заказа.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Не удалось открыть картинку.'));
        el.src = url;
      });
      let scale = Math.min(1, this.MAX_WIDTH / img.naturalWidth, this.MAX_HEIGHT / img.naturalHeight);
      for (let attempt = 0; attempt < 7; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff'; // прозрачный PNG → белый фон, а не чёрный в JPEG
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', attempt < 2 ? 0.85 : 0.7);
        const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (data.length * 0.75 <= this.MAX_BYTES) return { mimeType: 'image/jpeg', data, previewUrl: dataUrl };
        if (attempt >= 1) scale *= 0.8;
      }
      throw new Error('Скриншот слишком большой даже после сжатия — обрежьте лишнее.');
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  init(ctx) {
    const self = this;
    const card = document.getElementById('checkout-shot-card');
    const body = document.getElementById('checkout-shot-body');
    const sub = document.getElementById('checkout-shot-sub');
    const input = document.getElementById('checkout-shot-input');
    const pickLabel = document.getElementById('checkout-shot-pick');
    const modal = document.getElementById('checkout-shot-modal');
    const modalImg = document.getElementById('checkout-shot-modal-img');
    const esc = escapeHtmlClient;

    let image = null; // {mimeType, data, previewUrl}
    let parsed = null;
    let applied = null; // {filled, skipped} после «Подставить»
    let state = 'empty'; // empty | parsing | done | error
    let errorText = '';
    let token = 0; // ответ на старый скриншот после замены — игнорируется

    function money(v) {
      return v === null || v === undefined ? '—' : (Math.round(v * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function thumbHtml() {
      return `<button type="button" data-shot="zoom" title="Открыть скриншот" class="shrink-0"><img src="${image.previewUrl}" class="w-14 h-14 object-cover object-top rounded-lg border border-gray-200" alt=""></button>`;
    }

    function resultHtml() {
      const p = parsed;
      const head = [
        p.store || p.storeDomain ? `Магазин: <b>${esc(p.store || p.storeDomain)}</b>` : '',
        p.currency ? `Валюта: <b>${esc(p.currency)}</b>` : '',
        p.orderNumber ? `Заказ № <b>${esc(p.orderNumber)}</b>` : '',
        p.orderDate ? `Дата: <b>${esc(p.orderDate.split('-').reverse().join('.'))}</b>` : ''
      ].filter(Boolean).join(' · ');
      const items = p.items.length ? p.items.map((it) => `
        <div class="py-1.5 border-b border-gray-50 last:border-0">
          <div class="text-[13px] break-anywhere">${it.quantity > 1 ? `<b>${it.quantity} ×</b> ` : ''}${esc(it.name)}
            <span class="text-gray-500 whitespace-nowrap">— ${money(it.unitPrice)}${it.quantity > 1 ? ' за шт.' : ''}</span></div>
          <div class="text-[11px] ${it.match ? 'text-emerald-700' : 'text-amber-700'}">${it.match ? `✓ в каталоге: ${esc(it.match.shortName)}` : 'нет уверенного совпадения в каталоге — выберите товар сами'}</div>
        </div>`).join('') : '<div class="text-[12px] text-gray-400">Позиции не найдены.</div>';
      const totals = [
        p.check.itemsSum !== null ? `Позиции ${money(p.check.itemsSum)}` : (p.subtotal !== null ? `Подытог ${money(p.subtotal)}` : ''),
        p.shipping ? `доставка ${money(p.shipping)}` : '',
        p.tax ? `налог ${money(p.tax)}` : '',
        p.discount ? `скидка −${money(p.discount)}` : '',
        p.total !== null ? `<b>итог ${money(p.total)}</b>` : ''
      ].filter(Boolean).join(' · ');
      const check = p.check.ok === true
        ? '<div class="text-[12px] text-emerald-700 mt-1">✓ Суммы сходятся с итогом.</div>'
        : p.check.ok === false
          ? `<div class="text-[12px] text-red-700 mt-1">⚠️ Суммы не сходятся с итогом на ${money(Math.abs(p.check.diff))} — сверьте со скриншотом.</div>`
          : '<div class="text-[12px] text-amber-700 mt-1">Сверить итог не по чем — проверьте суммы сами.</div>';
      const report = applied ? `
        <div class="mt-2 p-2 rounded-lg bg-gray-50 text-[12px]">
          ${applied.filled.length ? `<div class="text-emerald-700">Подставлено: ${applied.filled.map(esc).join('; ')}.</div>` : ''}
          ${applied.skipped.length ? `<div class="text-amber-700 mt-0.5">Не тронуто: ${applied.skipped.map(esc).join('; ')}.</div>` : ''}
          <div class="text-gray-500 mt-0.5">Клиентов, комиссию и «Сколько уже оплатили» заполните сами.</div>
        </div>` : '';
      return `
        ${head ? `<div class="text-[12px] text-gray-600 mb-1">${head}</div>` : ''}
        <div>${items}</div>
        ${totals ? `<div class="text-[12px] text-gray-700 mt-1.5">${totals}</div>` : ''}
        ${check}
        ${p.note ? `<div class="text-[11px] text-gray-500 mt-1">ИИ: ${esc(p.note)}</div>` : ''}
        ${report}
        ${applied ? '' : `<div class="flex gap-2 mt-2.5">
          <button type="button" data-shot="apply" class="flex-1 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-medium">Подставить в форму</button>
        </div>`}`;
    }

    function render() {
      pickLabel.firstChild.textContent = image ? 'Заменить ' : 'Выбрать ';
      if (!image) { body.classList.add('hidden'); body.innerHTML = ''; sub.classList.remove('hidden'); return; }
      sub.classList.add('hidden');
      body.classList.remove('hidden');
      let right = '';
      if (state === 'parsing') {
        right = `<div class="flex items-center gap-2 text-[13px] text-gray-600"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>Распознаю… обычно 10–35 с. Форму можно заполнять дальше.</div>`;
      } else if (state === 'error') {
        right = `<div class="text-[13px] text-red-700">${esc(errorText)}</div>
          <button type="button" data-shot="retry" class="mt-1 text-[12px] text-violet-700 font-medium">Повторить распознавание</button>`;
      } else if (state === 'done') {
        right = '<div class="text-[12px] text-gray-500">Скриншот сохранится к корзине.</div>';
      }
      body.innerHTML = `
        <div class="flex items-start gap-3">
          ${thumbHtml()}
          <div class="flex-1 min-w-0">${right}
            <button type="button" data-shot="remove" class="mt-1 text-[11px] text-gray-400">Убрать скриншот</button>
          </div>
        </div>
        ${state === 'done' ? `<div class="mt-2">${resultHtml()}</div>` : ''}`;
      if (window.lucide) window.lucide.createIcons();
    }

    async function parse() {
      const my = ++token;
      state = 'parsing'; parsed = null; applied = null;
      render();
      try {
        const result = await callServer('parseCheckoutScreenshot', { mimeType: image.mimeType, data: image.data });
        if (my !== token) return;
        parsed = result;
        state = 'done';
        render();
        showSaveToast(true, 'Скриншот распознан — проверьте и нажмите «Подставить в форму».');
      } catch (error) {
        if (my !== token) return;
        state = 'error';
        errorText = `Не распознано: ${error.message}. Скриншот всё равно сохранится к корзине.`;
        render();
      }
    }

    async function takeFile(file) {
      try {
        image = await self.compress(file);
      } catch (error) {
        showSaveToast(false, error.message);
        return;
      }
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      parse();
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) takeFile(file);
    }, { signal: ctx.signal });

    // Вставка из буфера (Ctrl+V / «Вставить» на телефоне) — только картинка;
    // обычная вставка текста в поля не перехватывается.
    document.addEventListener('paste', (e) => {
      const fileItem = Array.from((e.clipboardData && e.clipboardData.items) || []).find((it) => it.kind === 'file' && /^image\//.test(it.type));
      if (!fileItem) return;
      e.preventDefault();
      takeFile(fileItem.getAsFile());
    }, { signal: ctx.signal });

    body.addEventListener('click', (e) => {
      const action = e.target.closest('[data-shot]') && e.target.closest('[data-shot]').dataset.shot;
      if (action === 'zoom') { modalImg.src = image.previewUrl; modal.classList.remove('hidden'); modal.classList.add('flex'); }
      else if (action === 'retry') parse();
      else if (action === 'remove') { token++; image = null; parsed = null; applied = null; state = 'empty'; render(); }
      // Один раз на распознавание: повтор добавил бы те же позиции второй раз.
      else if (action === 'apply' && parsed && !applied) {
        applied = ctx.apply(parsed);
        render();
        showSaveToast(true, applied.filled.length ? 'Подставлено из скриншота — проверьте форму.' : 'Подставлять нечего — поля уже заполнены.');
      }
    }, { signal: ctx.signal });
    modal.addEventListener('click', () => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, { signal: ctx.signal });

    return {
      getImage: () => (image ? { mimeType: image.mimeType, data: image.data } : null),
      getParsed: () => parsed
    };
  }
};
