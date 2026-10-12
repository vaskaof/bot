/**
 * Каналы К4 (IMPLEMENTATION-PLAN-STOREFRONTS.md «К4 — детальный план»): переключатель канала в шапке админки.
 *
 * Выбор едет в каждом запросе полем `channel` (common.js → callServer спрашивает `ChannelSwitch.param()`):
 * `"all"` — «Все вместе» (только админу), `"main"` — основной канал, число — канал витрины. Сервер сам
 * проверяет, можно ли сотруднику этот выбор (граница — там, здесь — удобство).
 *
 * Последний выбор помнится на устройстве (localStorage), по умолчанию — `defaultChannel` из getMyAccessInfo
 * (админу «Все вместе», менеджеру — его канал). Каналов меньше двух — переключателя нет, поле не шлётся.
 */
(function () {
  const STORAGE_KEY = 'knopka.adminChannel';
  // Цвет канала — чтобы с первого взгляда было видно, в каком канале работаешь. Основной — фирменный индиго.
  const PALETTE = ['#4f46e5', '#db2777', '#0d9488', '#d97706', '#7c3aed', '#0284c7'];
  const ALL_COLOR = '#6b7280';

  let channels = []; // [{id:null|number, title}]
  let canSeeAll = false;
  let current; // 'all' | 'main' | number

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function readSaved() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function save(value) {
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch (e) { /* не запомнили — не страшно */ }
  }

  /** @private Значение из хранилища/сервера → допустимый выбор или null. */
  function normalize(raw) {
    if (raw === 'all') return canSeeAll ? 'all' : null;
    if (raw === 'main') return 'main';
    if (raw === null || raw === undefined || raw === '') return null;
    const id = Number(raw);
    return channels.some((c) => c.id === id) ? id : null;
  }

  /**
   * Вызывается один раз после getMyAccessInfo (common.js initAccessCheck).
   * @param {{channels?:Array<{id:number|null,title:string}>, canSeeAllChannels?:boolean, defaultChannel?:string|number|null}} info
   */
  function init(info) {
    channels = info && Array.isArray(info.channels) ? info.channels : [];
    canSeeAll = !!(info && info.canSeeAllChannels);
    if (channels.length < 2) { channels = []; current = undefined; return; }
    current = normalize(readSaved()) || normalize(info.defaultChannel) || 'main';
    renderChip();
  }

  /** Поле `channel` запроса; `undefined` — не слать (каналов нет). */
  function param() {
    return channels.length ? current : undefined;
  }

  /** Канал выбранного режима: null — основной, число — витрина, undefined — «Все вместе» или каналов нет. */
  function currentStorefrontId() {
    if (!channels.length || current === 'all') return undefined;
    return current === 'main' ? null : current;
  }

  function enabled() {
    return channels.length > 0;
  }

  function isAll() {
    return channels.length > 0 && current === 'all';
  }

  function indexOf(storefrontId) {
    const id = storefrontId ? Number(storefrontId) : null;
    return channels.findIndex((c) => c.id === id);
  }

  /** Название канала записи (null — основной). */
  function titleOf(storefrontId) {
    const i = indexOf(storefrontId);
    return i >= 0 ? channels[i].title : (storefrontId ? 'другой канал' : 'основной');
  }

  function colorOf(storefrontId) {
    const i = indexOf(storefrontId);
    return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
  }

  function currentTitle() {
    return current === 'all' ? 'Все вместе' : titleOf(currentStorefrontId());
  }

  function currentColor() {
    return current === 'all' ? ALL_COLOR : colorOf(currentStorefrontId());
  }

  /**
   * Метка канала записи: в «Все вместе» — всегда, в канале — только у записи ЧУЖОГО канала (заказ другого канала
   * в коллективке, коллективка другого канала). Каналов нет — пусто.
   * @param {number|null|undefined} storefrontId канал записи
   * @param {{prefix?:string, always?:boolean}} [opts]
   */
  function badgeHtml(storefrontId, opts) {
    if (!channels.length) return '';
    const o = opts || {};
    const own = !isAll() && indexOf(storefrontId) === indexOf(currentStorefrontId());
    if (own && !o.always) return '';
    const color = colorOf(storefrontId);
    return `<span class="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style="color:${color};background:${color}1a">${esc((o.prefix || '') + titleOf(storefrontId))}</span>`;
  }

  /**
   * Каналы К6: доля посредника канала `{pct, since, intermediaryTitle}` или null (основной канал, доли нет).
   * @param {number|null|undefined} storefrontId
   */
  function shareOf(storefrontId) {
    const i = indexOf(storefrontId);
    return i >= 0 && channels[i].share ? channels[i].share : null;
  }

  /** Доля канала, выбранного в шапке; в «Все вместе» — null (канал заказа ещё не известен). */
  function currentShare() {
    if (!channels.length || isAll()) return null;
    return shareOf(currentStorefrontId());
  }

  /** Каналы К6: текст предупреждения о полной комиссии для канала с долей посредника. */
  function shareWarningText(storefrontId) {
    const share = shareOf(storefrontId);
    if (!share) return '';
    return `В канале «${titleOf(storefrontId)}» комиссию пишите ПОЛНУЮ — обе половины. ${share.intermediaryTitle} получит свои ${String(share.pct).replace('.', ',')}% автоматически, у DD останется остальное.`;
  }

  /**
   * Строка «Создаётся в канале …» для форм создания; пусто, если каналов нет.
   * @param {{commission?:boolean}} [opts] commission — форма с комиссией (корзина, лот): у канала с долей посредника —
   *   ещё и предупреждение «пишите полную комиссию» (каналы К6).
   */
  function createHintHtml(opts) {
    if (!channels.length) return '';
    const text = isAll()
      ? 'Сейчас «Все вместе»: новая запись попадёт в канал клиента/менеджера (корзина, лот, коллективка — в основной). Чтобы выбрать канал — переключите его в шапке.'
      : `Создаётся в канале «${titleOf(currentStorefrontId())}».`;
    const share = opts && opts.commission && !isAll() ? shareWarningText(currentStorefrontId()) : '';
    return `<div class="channel-create-hint text-[12px] rounded-xl px-3 py-2 mb-3 font-medium" style="color:${currentColor()};background:${currentColor()}14">${esc(text)}${share ? `<div class="mt-1 font-semibold">⚠️ ${esc(share)}</div>` : ''}</div>`;
  }

  /** @private Кнопка-канал в шапке (живёт в шелле, экраны её не перерисовывают) + цветная полоска сверху. */
  function renderChip() {
    const header = document.getElementById('screen-header');
    const help = document.getElementById('header-help-btn');
    if (!header || !help) return;
    let chip = document.getElementById('channel-switch-btn');
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'channel-switch-btn';
      chip.title = 'Канал: чьи заказы, клиенты и оплаты показывать';
      // Название канала — всегда целиком (репорт VASY 12.10.2026: на телефоне обрезалось и сжимало заголовок);
      // не помещается рядом с кнопками — уходит второй строкой шапки (layoutHeader).
      chip.className = 'flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors whitespace-nowrap shrink-0';
      chip.addEventListener('click', openPicker);
      help.parentNode.insertBefore(chip, help);
      watchHeader(header);
    }
    const color = currentColor();
    chip.style.color = color;
    chip.style.borderColor = color + '55';
    chip.style.background = color + '12';
    chip.innerHTML = `<span>${esc(currentTitle())}</span><span aria-hidden="true">▾</span>`;
    header.style.boxShadow = `inset 0 3px 0 ${color}`;
    queueLayout();
  }

  // Заголовку экрана оставляем хотя бы столько, прежде чем увести переключатель во вторую строку.
  const MIN_TITLE_PX = 150;

  /** @private Естественная ширина содержимого (обрезаемые подписи — по полному тексту). */
  function naturalWidth(el) {
    let w = 0;
    for (const child of el.children) {
      if (child.offsetParent === null) continue; // скрыт
      let cw = child.scrollWidth;
      child.querySelectorAll('*').forEach((d) => { if (d.offsetParent !== null) cw = Math.max(cw, d.scrollWidth); });
      const st = getComputedStyle(child);
      w += cw + (parseFloat(st.marginLeft) || 0) + (parseFloat(st.marginRight) || 0);
    }
    return w;
  }

  /**
   * @private Переключатель — в строке с кнопками, если рядом остаётся место заголовку; иначе — второй строкой шапки
   * справа. Решение не зависит от того, где переключатель сейчас (без «прыжков»). Лишнюю высоту шапки — контенту
   * отступом (--header-extra).
   */
  function layoutHeader() {
    const header = document.getElementById('screen-header');
    const help = document.getElementById('header-help-btn');
    const left = document.getElementById('header-left');
    const chip = document.getElementById('channel-switch-btn');
    if (!header || !help || !left || !chip) return;
    const group = help.parentNode;
    const inGroup = chip.parentNode === group;
    const chipW = chip.offsetWidth;
    const groupW = group.scrollWidth - (inGroup ? chipW + 4 : 0);
    const avail = header.clientWidth - 32;
    const fits = avail - groupW - chipW - 8 >= Math.min(naturalWidth(left), MIN_TITLE_PX);
    let lineBreak = document.getElementById('header-line-break');
    if (!lineBreak) {
      lineBreak = document.createElement('div');
      lineBreak.id = 'header-line-break';
      lineBreak.className = 'basis-full h-0';
    }
    if (fits && !inGroup) {
      chip.classList.remove('ml-auto', 'mb-2');
      lineBreak.remove();
      group.insertBefore(chip, help);
    } else if (!fits && inGroup) {
      chip.classList.add('ml-auto', 'mb-2');
      header.appendChild(lineBreak);
      header.appendChild(chip);
    }
    document.documentElement.style.setProperty('--header-extra', `${Math.max(0, header.offsetHeight - 56)}px`);
  }

  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => { layoutQueued = false; layoutHeader(); });
  }

  /** @private Перекладка шапки: смена экрана (заголовок/кнопки), канала, ширины окна. */
  function watchHeader(header) {
    window.addEventListener('resize', queueLayout);
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(queueLayout);
      ['header-left', 'header-actions'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) mo.observe(el, { childList: true, subtree: true, characterData: true });
      });
    }
    queueLayout();
  }

  /** @private Выбор канала — лист снизу. */
  function openPicker() {
    const old = document.getElementById('channel-switch-sheet');
    if (old) old.remove();
    const options = [
      ...channels.map((c) => ({ value: c.id === null ? 'main' : c.id, title: c.title, color: colorOf(c.id) })),
      ...(canSeeAll ? [{ value: 'all', title: 'Все вместе', color: ALL_COLOR, hint: 'все каналы сразу, у записей — метка канала' }] : [])
    ];
    const sheet = document.createElement('div');
    sheet.id = 'channel-switch-sheet';
    sheet.className = 'fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/30';
    sheet.innerHTML = `
      <div class="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-5 pb-8 shadow-xl">
        <div class="text-[15px] font-semibold text-gray-900">Канал</div>
        <div class="text-[12px] text-gray-500 mt-1 mb-3">Заказы, клиенты, оплаты, вопросы, корзины и коллективки — только этого канала. Новые записи создаются в нём. Каталог и настройки — общие.</div>
        <div class="space-y-2">
          ${options.map((op) => `
            <button type="button" data-value="${esc(op.value)}" class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left ${String(op.value) === String(current) ? 'border-2' : 'border-gray-100'}" style="${String(op.value) === String(current) ? `border-color:${op.color}` : ''}">
              <span class="w-3 h-3 rounded-full shrink-0" style="background:${op.color}"></span>
              <span class="min-w-0">
                <span class="block text-[14px] font-medium text-gray-900">${esc(op.title)}</span>
                ${op.hint ? `<span class="block text-[11px] text-gray-400">${esc(op.hint)}</span>` : ''}
              </span>
            </button>`).join('')}
        </div>
      </div>`;
    sheet.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (btn) {
        const raw = btn.dataset.value;
        choose(raw === 'all' || raw === 'main' ? raw : Number(raw));
      }
      if (btn || e.target === sheet) sheet.remove();
    });
    document.body.appendChild(sheet);
  }

  /** Сменить канал: запомнить и перерисовать текущий экран (данные — уже нового канала). */
  function choose(value) {
    const next = normalize(value);
    if (next === null || next === current) return;
    current = next;
    save(current);
    renderChip();
    if (typeof window.rerenderCurrentRoute === 'function') window.rerenderCurrentRoute();
  }

  /** Каналы арендатора [{id, title}] (пусто — переключателя нет). Каналы К5: выбор канала для переноса заказа. */
  function list() {
    return channels.slice();
  }

  window.ChannelSwitch = {
    init, param, enabled, isAll, currentStorefrontId, titleOf, colorOf, badgeHtml, createHintHtml, choose, list,
    shareOf, currentShare, shareWarningText
  };
})();
