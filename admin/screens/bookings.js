'use strict';

/**
 * «Брони» — бронь под постом в канале (Б1 блокеров продажи, 09.10.2026, модуль `channel_booking`).
 * Три экрана:
 * - `bookings` — список броней (вкладки «Открытые / Запланированные / Закрытые», свайп — _swipe-tabs.js) и
 *   «Каналы» (подключение, права бота, правила брони по умолчанию — настройки только у админа);
 * - `bookingNew` — повесить бронь на пост: ссылка на пост или пересланный боту пост (`booking-new/<канал>/<пост>`);
 * - `bookingDetail` — места и лист ожидания: «Снять и отдать следующему», «Добавить вручную», «Оформить заказы»
 *   (тип «Место в очереди» — заготовка «Корзины»), повтор заказа после сбоя.
 * Деньги здесь не двигаются: заказы — «Корзина»/createOrder, оплаты — «Я оплатил»/«Оплаты».
 */
window.Screens = window.Screens || {};

const BookingUi = {
  modeLabel(mode) {
    return mode === 'prepay' ? 'Предоплата брони' : 'Место в очереди';
  },
  counter(post) {
    const taken = post.seatsTotal === null ? `Занято мест: ${post.taken}` : `Занято мест: ${post.taken} из ${post.seatsTotal}`;
    return post.waiting > 0 ? `${taken} · в листе ожидания: ${post.waiting}` : taken;
  },
  formatWhen(value) {
    if (!value) return '';
    const d = new Date(value);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  rub(value) {
    return `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
  },
  statusChip(post) {
    const map = {
      open: ['Открыта', 'bg-green-50 text-green-700'],
      scheduled: [`Откроется ${BookingUi.formatWhen(post.opensAt)}`, 'bg-amber-50 text-amber-700'],
      closed: ['Закрыта', 'bg-gray-100 text-gray-500'],
      cancelled: ['Отменена', 'bg-gray-100 text-gray-500']
    };
    const [text, cls] = map[post.status] || ['', ''];
    return `<span class="text-[10px] px-1.5 py-0.5 rounded-full ${cls}">${escapeHtmlClient(text)}</span>`;
  },
  /** Условия брони простыми фразами — что видит клиент и что будет с заказом (VASY 10.10: «понятнее»). */
  terms(post) {
    const lines = [];
    lines.push(post.productOriginal ? `Позиция каталога: ${post.productOriginal}` : 'Позиция каталога не выбрана — в заказ пойдёт название брони.');
    lines.push(post.seatsTotal === null ? 'Мест: без лимита.' : `Мест: ${post.seatsTotal}.`);
    lines.push(post.perClient > 1 ? `Одному клиенту — до ${post.perClient} мест (второе — через бота).` : 'Одному клиенту — одно место.');
    lines.push(post.waitlist ? 'Лист ожидания включён: освободившееся место сразу получает следующий.' : 'Листа ожидания нет: когда места кончатся, кнопка покажет «Мест нет».');
    if (post.mode === 'prepay') {
      lines.push(`Клиент платит бронь ${BookingUi.rub(post.bookingRub)} в течение ${post.payHours} ч после того, как занял место.`);
      lines.push(post.clientTotalRub
        ? `В заказе «Осталось» = ${BookingUi.rub(post.clientTotalRub)} (полная сумма, бронь входит в неё).`
        : 'В заказе пока только бронь — полную сумму впишете после выкупа.');
      lines.push(post.refundable ? 'Бронь возвратная (так написано клиенту в правилах).' : 'Бронь невозвратная (так написано клиенту в правилах).');
    } else {
      lines.push('Денег сейчас не берём — после выкупа «Оформить заказы» соберёт корзину по броням.');
    }
    if (post.priceAmount) lines.push(`Цена выкупа: ${post.priceAmount} ${post.priceCurrency}.`);
    return lines;
  },
  header(title, actionsHtml) {
    document.getElementById('header-left').innerHTML = `<h1 class="text-lg font-semibold text-gray-900 tracking-tight">${escapeHtmlClient(title)}</h1>`;
    document.getElementById('header-actions').innerHTML = actionsHtml || '';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Список броней и каналы
// ─────────────────────────────────────────────────────────────────────────────
window.Screens.bookings = {
  render(root, _dictionaries, params) {
    let currentTab = params && params.tab ? params.tab : 'open';
    const tabs = ['open', 'scheduled', 'closed', 'channels'];
    const isAdmin = window.CURRENT_ACCESS_ROLE === 'admin';

    BookingUi.header('Брони', `
      <button id="booking-add-btn" title="Повесить бронь на пост" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="plus" class="w-6 h-6"></i>
      </button>`);
    document.getElementById('booking-add-btn').addEventListener('click', () => navigateTo('booking-new'));

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl md:max-w-6xl mx-auto">
        <div id="booking-tabs" class="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <button type="button" data-tab="open" class="booking-tab shrink-0 text-xs px-3 py-2 rounded-full font-medium">Открытые</button>
          <button type="button" data-tab="scheduled" class="booking-tab shrink-0 text-xs px-3 py-2 rounded-full font-medium">Запланированные</button>
          <button type="button" data-tab="closed" class="booking-tab shrink-0 text-xs px-3 py-2 rounded-full font-medium">Закрытые</button>
          <button type="button" data-tab="channels" class="booking-tab shrink-0 text-xs px-3 py-2 rounded-full font-medium">Каналы</button>
        </div>
        <div id="booking-panel-open" class="booking-panel"></div>
        <div id="booking-panel-scheduled" class="booking-panel hidden"></div>
        <div id="booking-panel-closed" class="booking-panel hidden"></div>
        <div id="booking-panel-channels" class="booking-panel hidden"></div>
      </main>`;

    const loaded = {};
    function activate(tab) {
      currentTab = tab;
      root.querySelectorAll('.booking-tab').forEach((b) => {
        const active = b.dataset.tab === tab;
        b.className = `booking-tab shrink-0 text-xs px-3 py-2 rounded-full font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`;
      });
      tabs.forEach((t) => document.getElementById(`booking-panel-${t}`).classList.toggle('hidden', t !== tab));
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === 'channels') loadChannels();
        else loadPosts(tab);
      }
    }
    root.querySelectorAll('.booking-tab').forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));
    SwipeTabs.attach({
      area: root.querySelector('main'),
      keys: () => tabs,
      getActive: () => currentTab,
      panelFor: (key) => document.getElementById(`booking-panel-${key}`),
      activate: (key) => activate(key)
    });
    activate(currentTab);

    async function loadPosts(tab) {
      const panel = document.getElementById(`booking-panel-${tab}`);
      panel.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Загружаю…</div>';
      try {
        const posts = await callServer('getBookingPosts', tab);
        if (posts.length === 0) {
          panel.innerHTML = tab === 'open'
            ? `<div class="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-600 space-y-2">
                 <div class="font-medium text-gray-900">Открытых броней нет</div>
                 <div>Чтобы повесить бронь: перешлите боту пост из канала или нажмите «+» вверху и вставьте ссылку на пост.</div>
                 <div class="text-xs text-gray-400">Сначала канал нужно подключить — вкладка «Каналы».</div>
               </div>`
            : '<div class="text-center text-sm text-gray-400 py-10">Здесь пока пусто.</div>';
          return;
        }
        panel.innerHTML = `<div class="space-y-2 wide-grid">${posts.map((p) => `
          <button type="button" data-id="${escapeHtmlClient(p.id)}" class="booking-card w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(p.productTitle)}</div>
                <div class="text-xs text-gray-400 truncate">${escapeHtmlClient(p.channelTitle)} · ${BookingUi.modeLabel(p.mode)}</div>
              </div>
              ${BookingUi.statusChip(p)}
            </div>
            <div class="mt-2 text-xs text-gray-600">${escapeHtmlClient(BookingUi.counter(p))}</div>
          </button>`).join('')}</div>`;
        panel.querySelectorAll('.booking-card').forEach((b) => b.addEventListener('click', () => navigateTo(`booking/${b.dataset.id}`)));
      } catch (error) {
        panel.innerHTML = '';
        showSaveToast(false, error.message);
      }
    }

    async function loadChannels() {
      const panel = document.getElementById('booking-panel-channels');
      panel.innerHTML = '<div class="text-center text-sm text-gray-400 py-10">Загружаю…</div>';
      try {
        const { botUsername, channels } = await callServer('getBookingChannels');
        const how = `
          <div class="bg-indigo-50 rounded-2xl p-4 text-xs text-indigo-900 space-y-1 mb-3">
            <div class="font-medium text-sm">Как подключить канал</div>
            <div>1. В канале: «Администраторы» → «Добавить» → ${botUsername ? `@${escapeHtmlClient(botUsername)}` : 'бот канала'}.</div>
            <div>2. Включите боту право «Редактирование сообщений» (только оно и нужно для кнопки).</div>
            <div>3. Бот пришлёт вам в чат «Подключить канал?» — нажмите «Подключить».</div>
            <div class="text-indigo-700">Бот меняет у постов только кнопку «Забронировать», текст постов не трогает.</div>
          </div>`;
        if (channels.length === 0) {
          panel.innerHTML = how + '<div class="text-center text-sm text-gray-400 py-6">Каналов пока нет.</div>';
          return;
        }
        panel.innerHTML = how + `<div class="space-y-3">${channels.map((c) => channelCard(c)).join('')}</div>`;
        panel.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', () => checkChannel(Number(b.dataset.check))));
        panel.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => saveChannel(Number(b.dataset.save))));
        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        panel.innerHTML = '';
        showSaveToast(false, error.message);
      }
    }

    function channelCard(c) {
      const statusText = c.status === 'active' ? 'Подключён' : (c.status === 'detected' ? 'Ждёт подключения' : 'Выключен');
      const statusCls = c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700';
      const disabled = isAdmin ? '' : 'disabled';
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">${escapeHtmlClient(c.title || 'Канал')}</div>
              <div class="text-xs text-gray-400">${c.username ? '@' + escapeHtmlClient(c.username) : 'закрытый канал'}</div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full ${statusCls}">${statusText}</span>
          </div>
          <div class="text-xs ${c.canEdit ? 'text-green-700' : 'text-red-600'}">
            ${c.canEdit ? '✅ Бот может ставить кнопку под посты' : '⚠️ У бота нет права «Редактирование сообщений»'}
            <button type="button" data-check="${c.id}" class="ml-1 underline text-indigo-600">Проверить</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label class="text-xs text-gray-500">Статус
              <select id="ch-status-${c.id}" ${disabled} class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="active" ${c.status === 'active' ? 'selected' : ''}>Подключён</option>
                <option value="off" ${c.status !== 'active' ? 'selected' : ''}>${c.status === 'detected' ? 'Не подключён' : 'Выключен'}</option>
              </select>
            </label>
            <label class="text-xs text-gray-500">Тип брони по умолчанию
              <select id="ch-mode-${c.id}" ${disabled} class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="queue" ${c.defaultMode === 'queue' ? 'selected' : ''}>Место в очереди</option>
                <option value="prepay" ${c.defaultMode === 'prepay' ? 'selected' : ''}>Предоплата брони</option>
              </select>
            </label>
            <label class="text-xs text-gray-500">Срок оплаты брони, часов
              <input id="ch-hours-${c.id}" type="number" min="1" max="720" ${disabled} value="${c.defaultPayHours}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
            </label>
            <label class="flex items-start gap-2 text-xs text-gray-600 mt-5">
              <input id="ch-auto-${c.id}" type="checkbox" ${disabled} ${c.autoRelease ? 'checked' : ''} class="mt-0.5">
              <span>Снимать неоплаченную бронь автоматически по сроку (только если по заказу нет ни денег, ни заявки «Я оплатил»)</span>
            </label>
          </div>
          <label class="block text-xs text-gray-500">Правила брони (клиент увидит их при бронировании)
            <textarea id="ch-rules-${c.id}" rows="3" ${disabled} class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
              placeholder="Например: не ответили 24 часа — бронь аннулируется">${escapeHtmlClient(c.rulesText)}</textarea>
          </label>
          ${isAdmin ? `<button type="button" data-save="${c.id}" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Сохранить</button>`
            : '<div class="text-[11px] text-gray-400">Настройки канала меняет администратор.</div>'}
        </div>`;
    }

    async function checkChannel(id) {
      try {
        const res = await callServer('checkBookingChannel', id);
        showSaveToast(res.ok, res.message);
        loaded.channels = false;
        activate('channels');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    async function saveChannel(id) {
      try {
        await callServer('saveBookingChannel', {
          channelId: id,
          status: document.getElementById(`ch-status-${id}`).value,
          defaultMode: document.getElementById(`ch-mode-${id}`).value,
          defaultPayHours: Number(document.getElementById(`ch-hours-${id}`).value),
          autoRelease: document.getElementById(`ch-auto-${id}`).checked,
          rulesText: document.getElementById(`ch-rules-${id}`).value
        });
        showSaveToast(true, 'Настройки канала сохранены');
        loaded.channels = false;
        activate('channels');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Форма брони: «Новая бронь» и «Изменить бронь»
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Общая форма (10.10.2026, VASY: бронь должна редактироваться; позиция — из каталога, чтобы «Оформить
 * заказы» собирало корзину сразу по каталогу; данные брони — понятнее). Каждое поле — с пояснением, что с
 * ним станет у клиента и в заказе.
 * @param {HTMLElement} root
 * @param {{mode:'new'|'edit', post?:Object, channel?:Object, channels:Array, params?:Object, hasSeats?:boolean}} o
 */
function renderBookingForm(root, o) {
  const p = o.post || {};
  const isEdit = o.mode === 'edit';
  const fromForward = !isEdit && o.params && o.params.channelId && o.params.messageId;
  const channel = o.channel;
  const mode = p.mode || (channel ? channel.defaultMode : 'queue');
  const hint = (text) => `<span class="block text-[11px] text-gray-400 mt-1 font-normal">${text}</span>`;
  const val = (v) => (v === null || v === undefined ? '' : escapeHtmlClient(String(v)));
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  root.innerHTML = `
    <main class="pt-16 pb-24 px-4 md:px-0 max-w-2xl mx-auto space-y-3">
      ${!isEdit && o.channels.length === 0 ? '<div class="bg-amber-50 text-amber-800 rounded-2xl p-4 text-sm">Нет подключённых каналов. Подключите канал во вкладке «Каналы» раздела «Брони».</div>' : ''}

      <div class="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div class="text-sm font-medium text-gray-900">Пост и что бронируют</div>
        ${isEdit ? `<div class="text-xs text-gray-500">Пост: <a href="${escapeHtmlClient(p.link)}" target="_blank" class="text-indigo-600 underline">открыть в канале</a></div>`
          : fromForward
            ? `<div class="text-sm text-gray-700">Пост №${escapeHtmlClient(o.params.messageId)} из «${escapeHtmlClient(channel ? channel.title : 'канала')}»${o.params.album ? ' (альбом)' : ''}</div>`
            : `<label class="block text-xs font-medium text-gray-500">Ссылка на пост *
                 <input id="bf-link" type="url" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="https://t.me/канал/123">
                 ${hint('В канале: нажмите на пост → «Копировать ссылку». Или просто перешлите пост боту — он откроет эту форму сам.')}
               </label>
               <label class="flex items-center gap-2 text-xs text-gray-600"><input id="bf-album" type="checkbox"> Пост — альбом из нескольких фото</label>
               ${hint('Под альбом Telegram не даёт поставить кнопку — бот опубликует под ним отдельное сообщение с кнопкой.')}`}
        <div class="relative">
          <label class="block text-xs font-medium text-gray-500">Позиция из каталога
            <input id="bf-sku-search" type="text" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Начните вводить название куклы…" value="${p.productOriginal ? val(p.productOriginal) : ''}">
          </label>
          <ul id="bf-sku-dropdown" class="hidden absolute left-0 right-0 z-30 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto mt-1"></ul>
          <div id="bf-sku-chosen" class="text-[11px] mt-1 ${p.productOriginal ? 'text-green-700' : 'text-gray-400'}">${p.productOriginal ? '✅ Связано с каталогом' : 'Необязательно, но удобно: заказы по брони сразу будут с этой позицией каталога.'}</div>
        </div>
        <label class="block text-xs font-medium text-gray-500">Название для клиента *
          <input id="bf-title" type="text" maxlength="200" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Например: Draculaura G3 Core" value="${val(p.productTitle)}">
          ${hint('Так бронь будет называться в чате с ботом, в «Моих бронях» и в списке менеджера.')}
        </label>
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div class="text-sm font-medium text-gray-900">Как работает бронь</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label class="border rounded-xl p-3 text-xs cursor-pointer"><input type="radio" name="bf-mode" value="queue" ${mode === 'queue' ? 'checked' : ''} ${isEdit && o.hasSeats ? 'disabled' : ''}>
            <b>Место в очереди</b><br><span class="text-gray-500">Клиент нажал — занял место. Денег сейчас не берём. После выкупа вы нажимаете «Оформить заказы» — откроется корзина, заполненная по броням.</span></label>
          <label class="border rounded-xl p-3 text-xs cursor-pointer"><input type="radio" name="bf-mode" value="prepay" ${mode === 'prepay' ? 'checked' : ''} ${isEdit && o.hasSeats ? 'disabled' : ''}>
            <b>Предоплата брони</b><br><span class="text-gray-500">Клиент нажал — бот сразу заводит заказ «Ожидает выкупа» и просит оплатить бронь до срока. Оплата — обычным «Я оплатил(а)».</span></label>
        </div>
        ${isEdit && o.hasSeats ? hint('Тип брони не меняется, когда уже есть брони.') : ''}
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-500">Сколько мест
            <input id="bf-seats" type="number" min="1" max="10000" value="${p.seatsTotal === null && isEdit ? '' : val(p.seatsTotal || 50)}" ${p.seatsTotal === null && isEdit ? 'disabled' : ''} class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </label>
          <label class="flex items-center gap-2 text-xs text-gray-600 mt-5"><input id="bf-unlimited" type="checkbox" ${p.seatsTotal === null && isEdit ? 'checked' : ''}> Без лимита</label>
          <label class="text-xs text-gray-500">Мест на одного клиента
            <input id="bf-per-client" type="number" min="1" max="50" value="${val(p.perClient || 1)}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </label>
          <label class="flex items-center gap-2 text-xs text-gray-600 mt-5"><input id="bf-waitlist" type="checkbox" ${p.waitlist === false ? '' : 'checked'}> Лист ожидания</label>
        </div>
        ${hint('Когда места кончатся, следующие нажавшие встают в лист ожидания. Освободилось место — его сразу получает первый из листа, бот ему пишет. Второе место одному клиенту можно взять только через бота — случайный двойной тап его не займёт.')}
      </div>

      <div id="bf-prepay" class="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div class="text-sm font-medium text-gray-900">Деньги по предоплате</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-500">Сумма брони, ₽ *
            <input id="bf-booking" type="number" min="1" value="${val(p.bookingRub)}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </label>
          <label class="text-xs text-gray-500">Срок оплаты, часов
            <input id="bf-hours" type="number" min="1" max="720" value="${val(p.payHours || (channel ? channel.defaultPayHours : 24))}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </label>
        </div>
        ${hint('Сумма брони — сколько клиент платит сейчас; в заказе она пишется в «Бронь/комиссия». Срок считается с момента, когда клиент занял место. Не оплатил к сроку — придёт сводка «не оплатили в срок», снять место вы решаете сами (или автоматически — настройка канала).')}
        <label class="block text-xs text-gray-500">Итого для клиента, ₽ (необязательно)
          <input id="bf-total" type="number" min="1" value="${val(p.clientTotalRub)}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          ${hint('Полная цена для клиента вместе с бронью — она станет «Осталось» в заказе, клиент сразу увидит всю сумму. Не указали — в заказе будет только бронь, полную сумму впишете в заказ после выкупа. Не меньше суммы брони.')}
        </label>
        <label class="flex items-center gap-2 text-xs text-gray-600"><input id="bf-refundable" type="checkbox" ${p.refundable ? 'checked' : ''}> Бронь возвратная</label>
        ${hint('Это только текст для клиента в правилах брони — сами деньги бот никуда не возвращает.')}
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div class="text-sm font-medium text-gray-900">Цена, время и правила</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-gray-500">Цена в валюте (необязательно)
            <input id="bf-price" type="number" min="0" step="0.01" value="${val(p.priceAmount)}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          </label>
          <label class="text-xs text-gray-500">Валюта
            <select id="bf-currency" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              ${['', 'USD', 'EUR', 'KZT', 'RUB', 'CNY', 'JPY'].map((c) => `<option value="${c}" ${(p.priceCurrency || '') === c ? 'selected' : ''}>${c || '—'}</option>`).join('')}
            </select>
          </label>
        </div>
        ${hint('Цена выкупа — подставится в заказ (и в корзину при «Оформить заказы»). Можно не заполнять, если цена ещё неизвестна.')}
        ${!isEdit || p.status === 'scheduled' ? `
        <label class="block text-xs text-gray-500">Открыть бронь позже (необязательно)
          <input id="bf-opens" type="datetime-local" value="${toLocalInput(p.opensAt)}" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
          ${hint('До этого времени на кнопке будет «🔒 Бронь откроется …», нажатия не принимаются. Удобно объявить время заранее — клиенты поставят будильник.')}
        </label>` : ''}
        <label class="block text-xs text-gray-500">Правила брони для клиента
          <textarea id="bf-rules" rows="3" maxlength="1000" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Например: не ответили 24 часа — бронь аннулируется">${val(isEdit ? p.rulesText : (channel ? channel.rulesText : ''))}</textarea>
          ${hint('Клиент увидит их в сообщении бота сразу после брони и в «Моих бронях». По умолчанию — правила канала.')}
        </label>
      </div>

      <button id="bf-save" type="button" class="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium">${isEdit ? 'Сохранить' : 'Повесить бронь'}</button>
    </main>`;

  const prepayBox = document.getElementById('bf-prepay');
  const currentMode = () => root.querySelector('input[name="bf-mode"]:checked').value;
  const syncMode = () => prepayBox.classList.toggle('hidden', currentMode() !== 'prepay');
  root.querySelectorAll('input[name="bf-mode"]').forEach((r) => r.addEventListener('change', syncMode));
  syncMode();
  const seatsEl = document.getElementById('bf-seats');
  document.getElementById('bf-unlimited').addEventListener('change', (e) => {
    seatsEl.disabled = e.target.checked;
    if (!e.target.checked && !seatsEl.value) seatsEl.value = 50;
  });

  // Позиция каталога: поиск тем же searchSku, что «Корзина»; выбор — название подставляется, его можно поправить.
  let productOriginal = p.productOriginal || '';
  const skuInput = document.getElementById('bf-sku-search');
  const skuDropdown = document.getElementById('bf-sku-dropdown');
  const skuChosen = document.getElementById('bf-sku-chosen');
  const titleInput = document.getElementById('bf-title');
  let searchTimer = null;
  skuInput.addEventListener('input', () => {
    productOriginal = '';
    skuChosen.className = 'text-[11px] mt-1 text-gray-400';
    skuChosen.textContent = 'Выберите позицию из списка — или оставьте пустым, если её нет в каталоге.';
    clearTimeout(searchTimer);
    const query = skuInput.value.trim();
    if (query.length < 2) { skuDropdown.classList.add('hidden'); return; }
    searchTimer = setTimeout(async () => {
      let results = [];
      try { results = await callServer('searchSku', query); } catch (_e) { results = []; }
      skuDropdown.innerHTML = results.length === 0
        ? '<li class="p-3 text-sm text-gray-500 text-center">В каталоге не нашлось — можно оставить только название</li>'
        : results.slice(0, 20).map((r) => `<li data-value="${escapeHtmlClient(r.value)}" data-label="${escapeHtmlClient(r.label)}" class="p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 text-sm last:border-0">${escapeHtmlClient(r.label)}</li>`).join('');
      skuDropdown.classList.remove('hidden');
      skuDropdown.querySelectorAll('li[data-value]').forEach((li) => li.addEventListener('mousedown', () => {
        productOriginal = li.dataset.value;
        skuInput.value = li.dataset.value;
        if (!titleInput.value.trim()) titleInput.value = li.dataset.label;
        skuChosen.className = 'text-[11px] mt-1 text-green-700';
        skuChosen.textContent = '✅ Связано с каталогом';
        skuDropdown.classList.add('hidden');
      }));
    }, 300);
  });
  skuInput.addEventListener('blur', () => setTimeout(() => skuDropdown.classList.add('hidden'), 150));

  document.getElementById('bf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const m = currentMode();
    const opensEl = document.getElementById('bf-opens');
    const input = {
      productTitle: titleInput.value,
      productOriginal,
      seatsTotal: document.getElementById('bf-unlimited').checked ? null : seatsEl.value,
      perClient: document.getElementById('bf-per-client').value,
      waitlist: document.getElementById('bf-waitlist').checked,
      bookingRub: m === 'prepay' ? document.getElementById('bf-booking').value : '',
      clientTotalRub: m === 'prepay' ? document.getElementById('bf-total').value : '',
      payHours: m === 'prepay' ? document.getElementById('bf-hours').value : '',
      refundable: m === 'prepay' && document.getElementById('bf-refundable').checked,
      priceAmount: document.getElementById('bf-price').value,
      priceCurrency: document.getElementById('bf-currency').value,
      rulesText: document.getElementById('bf-rules').value
    };
    if (!(isEdit && o.hasSeats)) input.mode = m;
    if (opensEl) input.opensAt = opensEl.value ? new Date(opensEl.value).toISOString() : '';
    btn.disabled = true;
    try {
      if (isEdit) {
        await callServer('updateBookingPost', p.id, input);
        showSaveToast(true, 'Бронь сохранена — кнопка под постом обновится через пару секунд');
        navigateTo(`booking/${p.id}`);
      } else {
        if (fromForward) {
          input.channelId = Number(o.params.channelId);
          input.messageId = Number(o.params.messageId);
          input.album = Boolean(o.params.album);
        } else {
          input.link = document.getElementById('bf-link').value;
          input.album = document.getElementById('bf-album').checked;
        }
        const res = await callServer('createBookingPost', input);
        showSaveToast(true, 'Бронь повешена — кнопка уже под постом');
        navigateTo(`booking/${res.post.id}`);
      }
    } catch (error) {
      showSaveToast(false, error.message);
    } finally {
      btn.disabled = false;
    }
  });
}

window.Screens.bookingNew = {
  async render(root, _dictionaries, params) {
    BookingUi.header('Новая бронь');
    let channels = [];
    try {
      channels = (await callServer('getBookingChannels')).channels.filter((c) => c.status === 'active');
    } catch (error) {
      showSaveToast(false, error.message);
    }
    const fromForward = params && params.channelId;
    const channel = fromForward ? channels.find((c) => String(c.id) === String(params.channelId)) : channels[0];
    renderBookingForm(root, { mode: 'new', channel, channels, params });
  }
};

window.Screens.bookingEdit = {
  async render(root, _dictionaries, params) {
    BookingUi.header('Изменить бронь');
    try {
      const { post, seats } = await callServer('getBookingPost', params.postId);
      const hasSeats = seats.some((s) => s.state === 'active' || s.state === 'waitlist');
      renderBookingForm(root, { mode: 'edit', post, channels: [], hasSeats });
    } catch (error) {
      showSaveToast(false, error.message);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Карточка брони
// ─────────────────────────────────────────────────────────────────────────────
window.Screens.bookingDetail = {
  render(root, _dictionaries, params) {
    const postId = params.postId;
    BookingUi.header('Бронь');
    root.innerHTML = '<main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl md:max-w-4xl mx-auto"><div class="text-center text-sm text-gray-400 py-10">Загружаю…</div></main>';
    load();

    async function load() {
      try {
        draw(await callServer('getBookingPost', postId));
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    function seatLine(post, s) {
      const chips = [];
      if (!s.confirmed) chips.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">ждёт согласия до ${BookingUi.formatWhen(s.holdUntil)}</span>`);
      if (s.source === 'manual') chips.push('<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">вручную</span>');
      if (post.mode === 'prepay' && s.state === 'active' && s.confirmed) {
        if (s.paidAt) chips.push('<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">бронь оплачена</span>');
        else if (s.overdue) chips.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">не оплачено, срок был ${BookingUi.formatWhen(s.holdUntil)}</span>`);
        else if (s.orderId) chips.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">оплатить до ${BookingUi.formatWhen(s.holdUntil)}</span>`);
      }
      if (s.orderState === 'to_create') chips.push('<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">заказ создаётся…</span>');
      if (s.orderState === 'failed') chips.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700" title="${escapeHtmlClient(s.orderError)}">заказ не создан</span>`);
      const place = s.state === 'active' ? `№${s.slot}` : `#${s.queueNo}`;
      return `
        <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
          <div class="w-10 text-xs font-semibold text-gray-500 shrink-0">${place}</div>
          <div class="min-w-0 flex-1">
            <div class="text-sm text-gray-900 truncate">${escapeHtmlClient(s.client)}</div>
            <div class="flex flex-wrap gap-1 mt-0.5">${chips.join('')}</div>
          </div>
          ${s.orderId ? `<button type="button" data-order="${escapeHtmlClient(s.orderId)}" class="text-xs text-indigo-600 underline shrink-0">заказ</button>` : ''}
          ${s.orderState === 'failed' ? `<button type="button" data-retry="${s.id}" class="text-xs text-indigo-600 underline shrink-0">повторить</button>` : ''}
          ${s.state === 'active' || s.state === 'waitlist'
            ? `<button type="button" data-release="${s.id}" class="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 shrink-0">${s.state === 'active' ? 'Снять' : 'Убрать'}</button>` : ''}
        </div>`;
    }

    function draw({ post, seats }) {
      BookingUi.header(post.productTitle);
      const active = seats.filter((s) => s.state === 'active');
      const waiting = seats.filter((s) => s.state === 'waitlist');
      const gone = seats.filter((s) => s.state === 'released' || s.state === 'cancelled');
      const overdue = active.filter((s) => s.overdue);
      const canOrder = post.mode === 'queue' && active.some((s) => s.confirmed && !s.orderId);
      const main = root.querySelector('main');
      main.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 mb-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs text-gray-400">${escapeHtmlClient(post.channelTitle)} · ${BookingUi.modeLabel(post.mode)}${post.mode === 'prepay' ? ` · бронь ${BookingUi.rub(post.bookingRub)}` : ''}</div>
              <div class="text-sm text-gray-900 mt-1">${escapeHtmlClient(BookingUi.counter(post))}</div>
              <div class="text-xs text-gray-500 mt-1">Кнопка под постом: «${escapeHtmlClient(post.buttonLabel)}»</div>
            </div>
            ${BookingUi.statusChip(post)}
          </div>
          <div class="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 space-y-1">${BookingUi.terms(post).map((l) => `<div>${escapeHtmlClient(l)}</div>`).join('')}</div>
          <a href="${escapeHtmlClient(post.link)}" target="_blank" class="text-xs text-indigo-600 underline">Открыть пост</a>
          <div class="flex flex-wrap gap-2 pt-2">
            ${post.status === 'open' ? '<button type="button" id="bd-close" class="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-700">Закрыть бронь</button>' : ''}
            ${post.status === 'closed' || post.status === 'scheduled' ? '<button type="button" id="bd-open" class="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-700">Открыть сейчас</button>' : ''}
            ${post.status !== 'cancelled' ? '<button type="button" id="bd-edit" class="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-700">Изменить</button>' : ''}
            ${post.status !== 'cancelled' ? '<button type="button" id="bd-add" class="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-700">Добавить вручную</button>' : ''}
            ${canOrder ? '<button type="button" id="bd-order" class="text-xs px-3 py-2 rounded-xl bg-indigo-600 text-white">Оформить заказы</button>' : ''}
          </div>
        </div>
        <div id="bd-wishlist" class="hidden bg-indigo-50 rounded-2xl p-3 text-xs text-indigo-900 mb-3"></div>
        ${overdue.length > 0 ? `<div class="bg-red-50 text-red-800 rounded-2xl p-3 text-xs mb-3">Не оплатили бронь в срок: ${overdue.length}. Можно снять их и отдать места следующим.</div>` : ''}
        <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
          <div class="text-xs font-medium text-gray-500 mb-1">Места (${active.length})</div>
          ${active.length ? active.map((s) => seatLine(post, s)).join('') : '<div class="text-sm text-gray-400 py-2">Пока никто не забронировал.</div>'}
        </div>
        ${post.waitlist || waiting.length ? `
        <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
          <div class="text-xs font-medium text-gray-500 mb-1">Лист ожидания (${waiting.length})</div>
          ${waiting.length ? waiting.map((s) => seatLine(post, s)).join('') : '<div class="text-sm text-gray-400 py-2">Пусто.</div>'}
          <div class="text-[11px] text-gray-400 mt-1">Освободилось место — его сразу получает первый из листа, бот ему пишет.</div>
        </div>` : ''}
        ${gone.length ? `
        <details class="bg-white rounded-2xl border border-gray-100 p-4">
          <summary class="text-xs font-medium text-gray-500">Снятые и отменённые (${gone.length})</summary>
          ${gone.map((s) => `<div class="text-xs text-gray-500 py-1">${escapeHtmlClient(s.client)} — ${escapeHtmlClient(s.releaseReason || (s.state === 'cancelled' ? 'отменил(а) клиент' : 'снята'))}</div>`).join('')}
        </details>` : ''}`;

      const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      bind('bd-close', () => setStatus('closed'));
      bind('bd-open', () => setStatus('open'));
      bind('bd-add', addManual);
      bind('bd-edit', () => navigateTo(`booking/${postId}/edit`));
      bind('bd-order', makeOrders);
      main.querySelectorAll('[data-release]').forEach((b) => b.addEventListener('click', () => release(Number(b.dataset.release))));
      main.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', () => retry(Number(b.dataset.retry))));
      main.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(b.dataset.order)}/edit`)));
      if (post.status === 'open' || post.status === 'scheduled') loadWishlist();
    }

    // Вишлист: кто ждёт эту куклу. Похожесть названий может ошибаться — список видит менеджер и сам жмёт «Сообщить».
    async function loadWishlist() {
      const box = document.getElementById('bd-wishlist');
      if (!box || !hasModule('wishlist')) return;
      let info;
      try {
        info = await callServer('getBookingWishlistAudience', postId);
      } catch (_error) {
        return;
      }
      if (!info.available) return;
      if (info.notifiedAt) {
        box.innerHTML = `Клиентам из вишлиста уже написали (${info.notifiedCount}) ${BookingUi.formatWhen(info.notifiedAt)}.`;
        box.classList.remove('hidden');
        return;
      }
      if (info.count === 0) return;
      box.innerHTML = `
        <div class="font-medium">Эту куклу ждут в вишлисте: ${info.count}</div>
        <div class="text-indigo-700 mt-1">${info.clients.slice(0, 10).map((c) => escapeHtmlClient(c)).join(', ')}${info.count > 10 ? ' и другие' : ''}</div>
        <button type="button" id="bd-wishlist-send" class="mt-2 px-3 py-2 rounded-xl bg-indigo-600 text-white">Сообщить им, что бронь открыта</button>`;
      box.classList.remove('hidden');
      document.getElementById('bd-wishlist-send').addEventListener('click', async () => {
        if (!await showConfirmModal(`Написать клиентам из вишлиста (${info.count}): «кукла из вашего вишлиста открыта для брони»? Проверьте список — совпадение по названию бывает неточным.`, { confirmLabel: 'Написать' })) return;
        try {
          const res = await callServer('sendBookingWishlistNotice', postId);
          showSaveToast(true, `Написали: ${res.sent}`);
          loadWishlist();
        } catch (error) {
          showSaveToast(false, error.message);
        }
      });
    }

    async function setStatus(status) {
      if (status === 'closed' && !await showConfirmModal('Закрыть бронь? Новые нажатия приниматься не будут, места останутся за клиентами.', { confirmLabel: 'Закрыть' })) return;
      try {
        draw(await callServer('setBookingPostStatus', postId, status));
        showSaveToast(true, status === 'open' ? 'Бронь открыта' : 'Бронь закрыта');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    async function release(seatId) {
      if (!await showConfirmModal('Снять бронь? Место сразу уйдёт первому из листа ожидания, клиенту придёт сообщение.', { confirmLabel: 'Снять' })) return;
      try {
        let res = await callServer('releaseBookingSeat', seatId, false);
        if (res && res.status === 'confirm') {
          const ok = await showConfirmModal(`Проверьте перед снятием:\n\n${res.warnings.map((w) => '• ' + w).join('\n')}`, { confirmLabel: 'Всё равно снять' });
          if (!ok) return;
          res = await callServer('releaseBookingSeat', seatId, true);
        }
        draw(res);
        showSaveToast(true, res.orderKept ? 'Бронь снята, заказ с деньгами остался — решите его в карточке заказа' : 'Бронь снята');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    async function retry(seatId) {
      try {
        draw(await callServer('retryBookingOrder', seatId));
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    async function addManual() {
      const username = await showPromptModal('Ник клиента в Telegram — бронь из комментариев или лички:', { placeholder: '@dollfan', confirmLabel: 'Добавить' });
      if (!username) return;
      try {
        const res = await callServer('addBookingSeatManual', postId, username);
        draw(res);
        showSaveToast(true, res.outcome === 'waitlist' ? 'Мест нет — клиент в листе ожидания' : 'Бронь добавлена');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }

    async function makeOrders() {
      try {
        const draft = await callServer('getBookingCartDraft', postId);
        sessionStorage.setItem('knopka_cart_duplicate_prefill', JSON.stringify(draft));
        navigateTo('carts/new');
      } catch (error) {
        showSaveToast(false, error.message);
      }
    }
  }
};
