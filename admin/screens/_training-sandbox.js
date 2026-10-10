'use strict';

/**
 * Учебная песочница (обучение менеджеров, 04.10.2026; VASY: «смоделируем
 * обучение на учебных кейсах, чтобы уроки не искали кейс, а предоставляли
 * его наглядно»). Пока идёт урок, экраны работают как обычно, но данные
 * для них — учебный пример, а не настоящие заказы:
 *
 * - чтения из `HANDLERS` отдаются отсюда (доска «Задачи», заказы, карточка
 *   заказа, коллективки, «Оплаты», вопросы, «Спрос», поиск клиента; с С5 —
 *   каталог и поиск товара, «уже брал(а)», разбор учебного лота);
 *   остальные чтения (справочники, каталог, курсы) идут на сервер как есть;
 * - любая запись отклоняется здесь же, до сервера (вторая линия защиты
 *   после `block` сценария) — кроме самого обучения (события, отзывы) и
 *   учебных «записей» уроков про коллективку (`WRITE_HANDLERS`): они меняют
 *   только учебный мир в памяти, на сервер не уходят;
 * - на сервер учебные данные не попадают никогда: ни в базу, ни в отчёты,
 *   ни в «Проверено делом» (там считаются только настоящие вызовы).
 *
 * Один учебный мир на все уроки: 4 клиентки (ник с «_uchebnaya»), 8 заказов
 * (№ TRN1xx), 2 коллективки, вопросы, заявка «я оплатил», вишлист. Фото —
 * рисованные силуэты (как у «Моих кукол»), чтобы сразу было видно: пример.
 * Даты — «N дней назад» от момента включения.
 *
 * Формы ответов совпадают с настоящими (сняты с сервера на тестовой базе);
 * сторож — e2e training-sandbox.spec.js: каждый урок проходится целиком на
 * этих данных без ошибок.
 */
(function () {
  const realCallServer = window.callServer;
  let active = false;
  let world = null;

  // Записи, которые разрешены и в учебном режиме: само обучение и служебное.
  const ALLOWED_WRITES = new Set([
    'recordTrainingEvent', 'submitStaffFeedback', 'markTrainingBadgesSeen', 'markWhatsNewSeen',
    'reportUiError', 'reportClientBootIssue', 'recordPrivacyConsent'
  ]);
  const WRITE_RE = /^(create|record|update|set|assign|unassign|delete|save|approve|reject|snooze|dismiss|undismiss|close|add|cancel|edit|apply|attach|send|release|refund|bulk|link|resolve|merge|publish|submit|mark|confirm|import|take|move|restore|clear|toggle|join|draw|finish|book|ask|rate)/;

  const DAY = 86400000;
  // Учебные заказы — «мои» для того, кто учится: у менеджера списки фильтруются по нему.
  const me = () => String(window.CURRENT_STAFF_TELEGRAM_ID || '');

  // --- Картинки: силуэт куклы, как в «Моих куклах» (client/hunt.js) ---
  function doll(h) {
    const hair = `hsl(${h} 38% 58%)`, body = `hsl(${h} 34% 64%)`, face = `hsl(${h} 45% 82%)`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${h} 70% 93%)"/><path d="M22 50 C18 16 82 16 78 50 C80 70 84 84 86 100 L14 100 C16 84 20 70 22 50 Z" fill="${hair}"/><path d="M18 100 C20 83 35 77 50 77 C65 77 80 83 82 100 Z" fill="${body}"/><rect x="44" y="62" width="12" height="17" rx="4" fill="${face}"/><ellipse cx="50" cy="47" rx="21" ry="23" fill="${face}"/><path d="M28 46 C27 22 73 20 72 44 C66 34 56 30 48 33 C40 36 33 41 28 46 Z" fill="${hair}"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const CLIENTS = {
    'trn-anya': { telegramId: 'trn-anya', name: 'Аня Смирнова', username: '@anya_uchebnaya' },
    'trn-olya': { telegramId: 'trn-olya', name: 'Оля Петрова', username: '@olya_uchebnaya' },
    'trn-katya': { telegramId: 'trn-katya', name: 'Катя Белова', username: '@katya_uchebnaya' },
    'trn-masha': { telegramId: 'trn-masha', name: 'Маша Иванова', username: '@masha_uchebnaya' }
  };
  const display = (c) => `${c.name} (${c.username})`;

  const STAGE_KEYS = {
    e3: { key: 'e3', label: 'Выкуп' },
    e5: { key: 'e5', label: 'Консолидация в КЗ' },
    e7: { key: 'e7', label: 'Выдача' }
  };
  const ITEM_STAGE_LABELS = { 'Основная': 'Основная оплата', 'Вес': 'Вес', 'СДЭК': 'СДЭК (КЗ→РФ)', 'Доставка_РФ': 'Доставка по РФ' };
  const money = (n) => (Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  /**
   * Заказы учебного мира. stages: [этап, цель ₽, оплачено ₽, пора платить?, прогноз?].
   * tasks — пункты доски (как их собрал бы сервер для такого заказа).
   */
  const ORDER_DEFS = [
    {
      id: 'TRN101', client: 'trn-anya', product: 'Monster High Skullector Ghouls Rule Lagoona Blue Doll', short: 'Лагуна Ghouls Rule', hue: 190,
      channel: 'Mattel Creations', account: 'mattel-1@учебный', cargo: 'Карго Алматы', amount: 60, rateKzt: '480', rateRub: '0.19',
      daysAgo: 12, statusDelivery: 'Ожидает отправки с магазина', statusOrder: 'Актуально, в доставке', stage: 'e3',
      stages: [['Основная', 7500, 4500, true, false], ['Вес', 0, 0, false, null], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: [{ kind: 'stage_unpaid', stage: 'Основная', label: 'Основная оплата: ждёт оплаты', hint: 'Осталось: 3 000 ₽', severity: 'warning', days: 4 }]
    },
    {
      id: 'TRN102', client: 'trn-anya', product: 'Monster High Draculaura Skulltimate Secrets', short: 'Дракулаура Skulltimate', hue: 330,
      channel: 'eBay', account: 'ebay-2@учебный', cargo: 'Карго Алматы', amount: 85, rateKzt: '480', rateRub: '0.19',
      daysAgo: 30, statusDelivery: 'У посредника в КЗ', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1', units: 2,
      stages: [['Основная', 6800, 6800, true, false], ['Вес', 2000, 0, true, false], ['СДЭК', 0, 0, true, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: [{ kind: 'stage_unpaid', stage: 'Вес', label: 'Вес: ждёт оплаты', hint: 'Осталось: 2 000 ₽', severity: 'warning', days: 2 }]
    },
    {
      id: 'TRN103', client: 'trn-olya', product: 'Monster High Cleo de Nile Boo York', short: 'Клео Boo York', hue: 45,
      channel: 'eBay', account: '', cargo: 'Карго Алматы', amount: 40, rateKzt: '470', rateRub: '0.18', dateOrder: '2025-03-12',
      statusDelivery: 'Получено клиентом', statusOrder: 'Выполнен', stage: 'e7',
      stages: [['Основная', 5200, 5200, true, false], ['Вес', 800, 800, true, false], ['СДЭК', 600, 600, true, false], ['Доставка_РФ', 400, 400, true, false]],
      tasks: [{ kind: 'fields_missing', label: 'Не заполнено: аккаунт', hint: 'Откройте заказ и заполните. Если уже не восстановить — «Пропустить с причиной».', severity: 'info', days: 0 }]
    },
    {
      id: 'TRN104', client: 'trn-olya', product: 'Monster High Frankie Stein Skulltimate Secrets', short: 'Фрэнки Skulltimate', hue: 140,
      channel: 'Mattel Creations', account: 'mattel-1@учебный', cargo: 'Карго Алматы', amount: 75, rateKzt: '', rateRub: '',
      daysAgo: 6, statusDelivery: 'Ожидает отправки с магазина', statusOrder: 'Актуально, в доставке', stage: 'e3',
      stages: [['Основная', 0, 0, true, null], ['Вес', 0, 0, false, null], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: [{ kind: 'price_missing', label: 'Курсы и сумма не подтверждены', hint: 'Не заполнено: Тенге к валюте, Тенге к рублю, Итог Руб', severity: 'critical', days: 6 }]
    },
    {
      id: 'TRN105', client: 'trn-katya', product: 'Monster High Clawdeen Wolf Core', short: 'Клодин Core', hue: 25,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 25, statusDelivery: 'У посредника в КЗ', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 0, 0, true, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN106', client: 'trn-masha', product: 'Monster High Abbey Bominable Core', short: 'Эбби Core', hue: 210,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 24, statusDelivery: 'У посредника в КЗ', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 0, 0, true, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN107', client: 'trn-masha', product: 'Monster High Ghoulia Yelps Core', short: 'Гулия Core', hue: 260,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 9, statusDelivery: 'На складе КЗ (карго)', statusOrder: 'Актуально, в доставке', stage: 'e5',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN108', client: 'trn-katya', product: 'Monster High Toralei Stripe Core', short: 'Торалей Core', hue: 300,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 8, statusDelivery: 'На складе КЗ (карго)', statusOrder: 'Актуально, в доставке', stage: 'e5',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    }
  ];

  /**
   * Учебный каталог (С5, 05.10.2026): те же куклы, что в заказах и «Спросе»,
   * плюс две куклы учебного лота. Поиск («Каталог», карточка позиции, поиск
   * товара в «Корзине») во время урока идёт по нему — урок «Каталог без
   * дублей» всегда находит ту же Гулию, что лежит в заказе Маши.
   * [оригинал, коротко, персонаж, серия, ветка, оттенок силуэта]
   */
  const SKU_DEFS = [
    ['Monster High Skullector Ghouls Rule Lagoona Blue Doll', 'Лагуна Ghouls Rule', 'Lagoona Blue', 'Ghouls Rule', 9104, 190],
    ['Monster High Draculaura Skulltimate Secrets', 'Дракулаура Skulltimate', 'Draculaura', 'Skulltimate Secrets', 9103, 330],
    ['Monster High Cleo de Nile Boo York', 'Клео Boo York', 'Cleo de Nile', 'Boo York', 9105, 45],
    ['Monster High Frankie Stein Skulltimate Secrets', 'Фрэнки Skulltimate', 'Frankie Stein', 'Skulltimate Secrets', 9103, 140],
    ['Monster High Clawdeen Wolf Core', 'Клодин Core', 'Clawdeen Wolf', 'Core', 9102, 25],
    ['Monster High Abbey Bominable Core', 'Эбби Core', 'Abbey Bominable', 'Core', 9102, 210],
    ['Monster High Ghoulia Yelps Core', 'Гулия Core', 'Ghoulia Yelps', 'Core', 9102, 260],
    ['Monster High Toralei Stripe Core', 'Торалей Core', 'Toralei Stripe', 'Core', 9102, 300],
    ['Monster High Operetta Core', 'Оперетта Core', 'Operetta', 'Core', 9102, 10],
    ['Monster High Twyla Boogeyman Core', 'Твайла Core', 'Twyla', 'Core', 9102, 230]
  ];
  const LINES = [
    { id: 9101, parentId: null, name: 'Monster High' },
    { id: 9102, parentId: 9101, name: 'Core' },
    { id: 9103, parentId: 9101, name: 'Skulltimate Secrets' },
    { id: 9104, parentId: 9101, name: 'Skullector' },
    { id: 9105, parentId: 9101, name: 'Boo York' }
  ];

  /** Учебный лот на eBay: Оперетта, Твайла и две подставки — $70 за всё. */
  const LOT_URL_MARK = 'uchebnyj-lot';
  const LOT_PARSE = {
    positions: [
      { name: 'Monster High Operetta Core', quantity: 1, itemType: 'product', confidence: 0.93, note: '' },
      { name: 'Monster High Twyla Boogeyman Core', quantity: 1, itemType: 'product', confidence: 0.88, note: '' },
      { name: 'Подставка для куклы', quantity: 2, itemType: 'accessory', confidence: 0.81, note: '' }
    ],
    sourceTitle: 'Monster High Core lot: Operetta + Twyla + 2 stands (учебный)'
  };

  const COLLECTIVE_DEFS = [
    { id: 'TRNC1', name: 'СДЭК 12.10 (учебная)', stage: 'КЗ→РФ', status: 'Формируется', daysAgo: 3, track: '' },
    { id: 'TRNC2', name: 'Отправка по РФ 28.09 (учебная)', stage: 'По РФ', status: 'Отправлено', daysAgo: 7, track: '10012345678', orderCount: 2 }
  ];

  // --- Сборка мира ---
  // Местная дата, не toISOString(): та сдвигает на день назад (UTC) — «было 30 $ (25.09)» при заказе 26.09.
  function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function ruDay(d) { return d.toLocaleDateString('ru-RU'); }

  function buildWorld() {
    const now = Date.now();
    const orders = ORDER_DEFS.map((def) => {
      const date = def.dateOrder ? new Date(def.dateOrder + 'T12:00:00') : new Date(now - def.daysAgo * DAY);
      const c = CLIENTS[def.client];
      const stagesBalance = def.stages.map(([stage, target, paid, eligible, isForecast]) => ({
        stage, target, paid, remaining: Math.max(0, target - paid), covered: target > 0 && paid >= target, isForecast, eligible
      }));
      const items = def.tasks.map((t) => ({
        kind: t.kind, label: t.label, hint: t.hint, severity: t.severity, sinceMs: t.days ? now - t.days * DAY : 0,
        ...(t.stage ? { stage: t.stage } : {})
      }));
      return { def, date, client: c, stagesBalance, items, imageUrl: doll(def.hue), collective: def.collective || null, units: def.units || null };
    });
    const byId = new Map(orders.map((o) => [o.def.id, o]));
    const collectives = COLLECTIVE_DEFS.map((d) => ({ ...d, forecast: null, costs: { ...NO_COSTS } }));
    return { now, orders, byId, collectives };
  }

  const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

  function boardCard(o) {
    const { def, items, client } = o;
    const ranks = items.map((i) => SEVERITY_RANK[i.severity]);
    const rank = Math.min(...ranks);
    const dated = items.map((i) => i.sinceMs).filter((ms) => ms > 0);
    const oldest = dated.length ? Math.min(...dated) : 0;
    const debt = o.stagesBalance.filter((s) => s.isForecast === false).reduce((a, s) => a + s.remaining, 0);
    return {
      orderId: def.id, productDisplay: def.short, productOriginal: def.product,
      clientDisplay: display(client), clientTelegramId: client.telegramId, clientName: client.name, clientUsername: client.username,
      purchaseChannel: def.channel, managerId: me(), statusOrder: def.statusOrder, statusDelivery: def.statusDelivery, statusPosition: null,
      stage: STAGE_KEYS[def.stage] || null, isOwnPurchase: false, collective: null, quiet: false,
      severity: Object.keys(SEVERITY_RANK).find((k) => SEVERITY_RANK[k] === rank),
      priorityScore: (2 - rank) * 1e13 - oldest, oldestSinceMs: oldest, debtRub: debt,
      canSnooze: items.some((i) => ['stage_forecast', 'stage_unpaid', 'stage_upcoming', 'debt_on_close', 'stage_duration_outlier'].includes(i.kind)),
      items: items.map((i) => ({ ...i })), imageUrl: o.imageUrl
    };
  }

  function orderMoney(o) {
    const known = o.stagesBalance.filter((s) => s.target > 0);
    const total = known.reduce((a, s) => a + s.target, 0);
    if (!total) return null;
    const paid = known.reduce((a, s) => a + s.paid, 0);
    const due = known.reduce((a, s) => a + s.remaining, 0);
    const dueNow = known.filter((s) => s.eligible && s.isForecast === false).reduce((a, s) => a + s.remaining, 0);
    return { total, paid, due, dueNow };
  }

  function collectiveLinks(o) {
    const col = o.collective && findCol(o.collective);
    return col ? [{ collectiveId: col.id, name: col.name, stage: col.stage }] : [];
  }

  function listItem(o) {
    const { def, client } = o;
    return {
      orderId: def.id, productDisplay: def.short, productOriginal: def.product, remark: '',
      statusOrder: def.statusOrder, statusDelivery: def.statusDelivery, managerId: me(), deliveryLadder: null,
      stage: STAGE_KEYS[def.stage] || null, purchaseChannel: def.channel, clientDisplay: display(client),
      dateOrderDisplay: ruDay(o.date), dateOrderSort: o.date.getTime(), searchTags: '', imageUrl: o.imageUrl, inCatalog: true,
      collectiveId: o.collective || '', collectiveLinks: collectiveLinks(o), lotId: '', cartId: '',
      amount: String(def.amount), currency: 'Доллар', productShort: def.short,
      client: { telegramId: client.telegramId, username: client.username, name: client.name }, money: orderMoney(o)
    };
  }

  function details(o) {
    const { def, client } = o;
    const sb = (stage) => o.stagesBalance.find((s) => s.stage === stage) || { target: 0, paid: 0 };
    const main = sb('Основная');
    const col = o.collective && findCol(o.collective);
    return {
      orderId: def.id, cartId: '', wishlistId: '', remark: '', productOriginal: def.product, productShort: def.short,
      imageUrl: o.imageUrl, inCatalog: true, purchaseLink: '', statusDelivery: def.statusDelivery, deliveryLadder: null,
      stage: STAGE_KEYS[def.stage] || null, statusOrder: def.statusOrder, purchaseChannel: def.channel, purchaseAccount: def.account,
      cargo: def.cargo, dateOrder: isoDay(o.date), dateReceived: def.statusDelivery === 'Получено клиентом' ? isoDay(new Date(o.date.getTime() + 40 * DAY)) : '',
      client: { telegramId: client.telegramId, username: client.username, name: client.name }, managerId: me(),
      lotId: null, lotWeightCoefficient: null, currency: 'Доллар', amount: String(def.amount),
      amountBeforeReconciliation: '', reconciliationDelta: '', rateKztToCurrency: def.rateKzt, rateRubToKzt: def.rateRub,
      sdekDeliveryType: '', collectiveId: col ? col.id : '', collectiveLabel: col ? col.name : '', collectiveLinks: collectiveLinks(o),
      totalRub: main.target ? String(main.target) : '', profitRub: '',
      payments: {
        booking: { paid: 'Да', sum: main.target ? String(Math.round(main.target * 0.15)) : '' },
        main: { paid: main.paid >= main.target && main.target > 0 ? 'Да' : '', sum: main.target },
        weight: { paid: '', sum: sb('Вес').target ? String(sb('Вес').target) : '' },
        deliveryKzRf: { paid: '', sum: sb('СДЭК').target ? String(sb('СДЭК').target) : '', taxiKz: '', sdek: '', taxiRf: '' },
        deliveryRf: { paid: '', sum: '', taxiRfSend: '', shippingRf: '', taxiRfReceive: '' }
      },
      mainBalance: { target: main.target, paid: main.paid, remaining: Math.max(0, main.target - main.paid), payments: [] },
      creditBalanceRub: 0, isOwnPurchase: false, clientSelfPurchased: false, isNewModel: true,
      stagesBalance: o.stagesBalance.map((s) => ({ ...s }))
    };
  }

  function clientOrders(tid) {
    return world.orders.filter((o) => o.client.telegramId === tid);
  }

  /** Платежи клиента — ровно столько, сколько уже разнесено по его этапам (остатка нет). */
  function clientPayments(tid) {
    return clientOrders(tid)
      .filter((o) => o.stagesBalance.some((s) => s.paid > 0))
      .map((o, i) => ({
        id: `trn-pay-${o.def.id}`, amount: o.stagesBalance.reduce((a, s) => a + s.paid, 0),
        date: new Date(o.date.getTime() + DAY).toISOString(), reason: `Перевод за № ${o.def.id}`, hasReceipt: i % 2 === 0
      }));
  }

  function dueParts(tid) {
    const parts = [];
    for (const o of clientOrders(tid)) {
      for (const s of o.stagesBalance) {
        if (s.eligible && s.isForecast === false && s.remaining > 0.01) parts.push({ o, s });
      }
    }
    return parts;
  }

  function preview(tid) {
    const c = CLIENTS[tid];
    const parts = dueParts(tid);
    const toPay = parts.reduce((a, p) => a + p.s.remaining, 0);
    const pays = clientPayments(tid);
    const last = pays[pays.length - 1];
    const lines = parts.map((p) => `• ${p.o.def.short} (№ ${p.o.def.id}) — ${ITEM_STAGE_LABELS[p.s.stage]}: ${money(p.s.remaining)} ₽`).join('\n');
    return {
      text: `Здравствуйте, ${c.name.split(' ')[0]}! Напоминаем об оплате заказов:\n\n${lines}\n\nИтого к оплате: ${money(toPay)} ₽.\n\nЕсли вы уже оплатили — просто напишите нам, мы проверим.`,
      dueTotal: toPay, poolLeftover: 0, toPay, ordersCount: new Set(parts.map((p) => p.o.def.id)).size,
      lastPayment: last ? { amount: last.amount, at: last.date } : null, lastReminder: null, canSend: true, cannotSendReason: ''
    };
  }

  function overviewClient(tid) {
    const c = CLIENTS[tid];
    const parts = dueParts(tid);
    if (!parts.length) return null;
    const p = preview(tid);
    const orders = [];
    for (const part of parts) {
      let entry = orders.find((x) => x.orderId === part.o.def.id);
      if (!entry) { entry = { orderId: part.o.def.id, productDisplay: part.o.def.short, imageUrl: part.o.imageUrl, parts: [] }; orders.push(entry); }
      entry.parts.push({ stage: part.s.stage, label: ITEM_STAGE_LABELS[part.s.stage], remaining: part.s.remaining });
    }
    return {
      telegramId: tid, display: display(c), name: c.name, username: c.username, pending: false,
      toPay: p.toPay, poolLeftover: 0, lastPayment: p.lastPayment, lastReminderAt: null, orders
    };
  }

  const membersOf = (colId) => world.orders.filter((o) => o.collective === colId);
  const sdekStage = (o) => o.stagesBalance.find((s) => s.stage === 'СДЭК');
  const sdekPaidUp = (o) => { const s = sdekStage(o); return !!s && s.isForecast === false && s.target > 0 && s.paid >= s.target; };

  function collectiveOrders(colId) {
    return membersOf(colId).map((o) => ({
      orderId: o.def.id, productDisplay: o.def.short, productOriginal: o.def.product, clientDisplay: display(o.client),
      imageUrl: o.imageUrl, statusOrder: o.def.statusOrder, statusDelivery: o.def.statusDelivery, remark: '',
      logisticsUnitsRaw: o.units, logisticsUnitsEffective: o.units ?? 1, ownLegPaid: sdekPaidUp(o), lotId: null
    }));
  }

  function collectiveSummary(list) {
    return {
      orderCount: list.length,
      unitsSum: list.reduce((a, o) => a + o.logisticsUnitsEffective, 0),
      ownLegPaidCount: list.filter((o) => o.ownLegPaid).length
    };
  }

  const NO_COSTS = {
    sdekCost: 0, taxiKzCost: 0, taxiRfCost: 0, sdekCostCurrency: 'RUB', sdekCostOriginal: null,
    taxiKzCostCurrency: 'RUB', taxiKzCostOriginal: null, taxiRfCostCurrency: 'RUB', taxiRfCostOriginal: null
  };

  function collectiveHead(col) {
    const created = new Date(world.now - col.daysAgo * DAY);
    const list = collectiveOrders(col.id);
    const sent = col.sentDaysAgo ? new Date(world.now - col.sentDaysAgo * DAY) : null;
    return {
      collectiveId: col.id, name: col.name, trackNumber: col.track, status: col.status, stage: col.stage,
      createdAt: ruDay(created), sentAt: sent ? sent.toISOString() : null, sentAtDisplay: sent ? ruDay(sent) : '',
      orderCount: col.orderCount || list.length, lastActivityAt: (sent || created).toISOString(),
      progress: sdekPayments(col.id).progress
    };
  }

  const findCol = (id) => (world.collectives || []).find((c) => c.id === id);
  const round2 = (n) => Math.round(n * 100) / 100;
  // Позиция статуса на лестнице доставки (server/src/orders/deliveryLadder.js): < 8 — ещё не у посредника.
  const POSITIONS = { 'Ожидает отправки с магазина': 2, 'На складе КЗ (карго)': 6, 'У посредника в КЗ': 8, 'Получено клиентом': 12 };
  const costTotal = (col) => (Number(col.costs.sdekCost) || 0) + (Number(col.costs.taxiKzCost) || 0) + (Number(col.costs.taxiRfCost) || 0);

  /** Доли «во сколько раз тяжелее обычного» → коэффициенты (как collectiveUnitRatios на сервере). */
  function unitRatios(colId) {
    const list = membersOf(colId);
    const sum = list.reduce((a, o) => a + (o.units ?? 1), 0);
    return new Map(list.map((o) => [o.def.id, sum > 0 ? (o.units ?? 1) / sum : 0]));
  }

  /** «Оплата СДЭК» учебной коллективки — та же форма, что getCollectiveSdekPayments. */
  function sdekPayments(id) {
    const col = findCol(id);
    const paymentStage = col.stage === 'По РФ' ? 'Доставка_РФ' : 'СДЭК';
    const byClient = new Map();
    for (const o of membersOf(id)) {
      const s = o.stagesBalance.find((x) => x.stage === paymentStage) || { target: 0, paid: 0, isForecast: null };
      const priceState = s.isForecast === false ? 'priced' : (s.isForecast === true ? 'forecast' : 'missing');
      const isClosed = o.def.statusDelivery === 'Получено клиентом';
      const key = o.client.telegramId;
      if (!byClient.has(key)) {
        byClient.set(key, { clientTelegramId: key, clientName: o.client.name, clientUsername: o.client.username, clientDisplay: display(o.client), orders: [] });
      }
      byClient.get(key).orders.push({
        orderId: o.def.id, productDisplay: o.def.short, statusDelivery: o.def.statusDelivery, position: POSITIONS[o.def.statusDelivery] || null,
        stage: paymentStage, priceState, isClosed, target: s.target, paid: s.paid,
        remaining: priceState === 'priced' ? Math.max(0, s.target - s.paid) : 0,
        forecastRemaining: priceState === 'forecast' && !isClosed ? round2(Math.max(0, s.target - s.paid)) : 0
      });
    }
    const clients = [...byClient.values()].map((c) => {
      const priced = c.orders.filter((o) => o.priceState === 'priced');
      return {
        ...c,
        targetSum: priced.reduce((a, o) => a + o.target, 0),
        paidSum: c.orders.reduce((a, o) => a + o.paid, 0),
        remainingSum: priced.reduce((a, o) => a + o.remaining, 0),
        forecastRemainingSum: round2(c.orders.reduce((a, o) => a + o.forecastRemaining, 0)),
        priceMissingCount: c.orders.filter((o) => o.priceState !== 'priced').length
      };
    });
    clients.sort((a, b) => (b.remainingSum - a.remainingSum) || (b.priceMissingCount - a.priceMissingCount) || a.clientDisplay.localeCompare(b.clientDisplay, 'ru'));
    const all = clients.flatMap((c) => c.orders);
    const unpaid = all.filter((o) => o.remaining > 0.01);
    const notAtBroker = membersOf(id).filter((o) => (POSITIONS[o.def.statusDelivery] || 99) < 8);
    const totals = {
      targetSum: clients.reduce((a, c) => a + c.targetSum, 0), paidSum: clients.reduce((a, c) => a + c.paidSum, 0),
      remainingSum: clients.reduce((a, c) => a + c.remainingSum, 0), unpaidClients: clients.filter((c) => c.remainingSum > 0.01).length,
      priceMissingCount: clients.reduce((a, c) => a + c.priceMissingCount, 0),
      forecastTargetSum: round2(all.filter((o) => o.priceState === 'forecast').reduce((a, o) => a + o.target, 0)),
      forecastRemainingSum: round2(clients.reduce((a, c) => a + c.forecastRemainingSum, 0)),
      notCollectedClients: clients.filter((c) => c.remainingSum + c.forecastRemainingSum > 0.01).length
    };
    return {
      collectiveId: id, stage: col.stage, paymentStage, behindOrders: [],
      notAtBrokerOrders: notAtBroker.map((o) => ({ orderId: o.def.id, productDisplay: o.def.short, clientDisplay: display(o.client), statusDelivery: o.def.statusDelivery })),
      clients, totals, sdekForecast: col.forecast ? { ...col.forecast } : null,
      progress: {
        orderCount: all.length, notAtBrokerCount: notAtBroker.length, sdekPriced: all.length - totals.priceMissingCount, sdekPriceMissing: totals.priceMissingCount,
        sdekPriceExempt: 0, sdekUnpaid: unpaid.length, sdekUnpaidClients: totals.unpaidClients, sdekRemainingRub: totals.remainingSum,
        behindCount: 0, reconciled: costTotal(col) > 0, isTerminal: false, done: false
      }
    };
  }

  /** «Разложить по заказам»: как ordersService.computeCollectiveSdekForecast — прогноз только заказам без цены. */
  function forecastPlan(id, input) {
    const col = findCol(id);
    if (costTotal(col) > 0) throw new Error('Чек СДЭК уже внесён — прогноз больше не нужен, используйте «Применить расход в заказы».');
    const rub = round2(Number(input && input.totalRub) || 0);
    if (!(rub > 0)) throw new Error('Введите ожидаемую сумму СДЭК больше нуля.');
    const forecast = { rub, currency: input.currency === 'KZT' ? 'KZT' : 'RUB', original: input.original === undefined ? null : input.original };
    const ratios = unitRatios(id);
    const orders = [];
    const skipped = [];
    for (const c of sdekPayments(id).clients) {
      for (const o of c.orders) {
        const base = { orderId: o.orderId, productDisplay: o.productDisplay, clientDisplay: c.clientDisplay, paid: o.paid };
        if (o.isClosed) { skipped.push({ ...base, reason: 'closed', target: o.target }); continue; }
        if (o.priceState === 'priced') { skipped.push({ ...base, reason: 'priced', target: o.target }); continue; }
        const after = round2(rub * (ratios.get(o.orderId) || 0));
        orders.push({ ...base, before: o.priceState === 'forecast' ? o.target : null, after, surplus: round2(Math.max(0, o.paid - after)) });
      }
    }
    return { col, forecast, orders, skipped };
  }

  /** «Внести цену по чеку» / «Применить расход»: доля чека каждому заказу (как computeCollectiveOrderShares). */
  function sharesPlan(id, options) {
    const col = findCol(id);
    const total = costTotal(col);
    if (!(total > 0)) throw new Error('Сначала сохраните сверку — внесите чек и «Сохранить сверку».');
    const ratios = unitRatios(id);
    const onlyUnpriced = !!(options && options.onlyUnpriced);
    return membersOf(id)
      .filter((o) => {
        if (!onlyUnpriced) return true;
        const s = sdekStage(o);
        return o.def.statusDelivery !== 'Получено клиентом' && (!s || s.isForecast !== false);
      })
      .map((o) => {
        const s = sdekStage(o);
        return { o, s, before: s && s.isForecast === false ? s.target : null, after: round2(total * (ratios.get(o.def.id) || 0)), alreadyPaid: s ? s.paid : 0 };
      });
  }

  /** Записать цель СДЭК в учебном мире. Метка покрывает не больше цели — лишнее у клиента (в учебном мире не показываем). */
  function setSdekTarget(o, target, isForecast) {
    const s = sdekStage(o);
    s.target = target;
    s.isForecast = isForecast;
    s.paid = Math.min(s.paid, target);
    s.remaining = Math.max(0, s.target - s.paid);
    s.covered = s.target > 0 && s.paid >= s.target;
  }

  /**
   * Учебные «записи» уроков про коллективку (10.10.2026, Коллективки 2.0 э4):
   * меняют только учебный мир в памяти — на сервер не уходит ничего. Так
   * менеджер сам нажимает «В коллективку» / «Разложить» / «Внести цену» и
   * видит результат. Чужие (не учебные) id — undefined: запись отклоняется.
   */
  const WRITE_HANDLERS = {
    assignOrdersToCollective: (ids, colId) => {
      const list = (Array.isArray(ids) ? ids : []).map(String);
      if (!findCol(colId) || !list.every((id) => trnOrder(id))) return undefined;
      list.forEach((id) => { trnOrder(id).collective = colId; });
      return { moved: [], added: list, failed: [] };
    },
    applyCollectiveSdekForecast: (id, input) => {
      if (!findCol(id)) return undefined;
      const plan = forecastPlan(id, input);
      plan.col.forecast = plan.forecast;
      plan.orders.forEach((p) => setSdekTarget(trnOrder(p.orderId), p.after, true));
      return { forecast: plan.forecast, applied: plan.orders.map((p) => ({ orderId: p.orderId, amount: p.after })), failed: [], skippedCount: plan.skipped.length };
    },
    applyCollectiveLogisticsSharesToOrders: (id, options) => {
      if (!findCol(id)) return undefined;
      const plan = sharesPlan(id, options);
      plan.forEach((p) => setSdekTarget(p.o, p.after, false));
      return { applied: plan.map((p) => ({ orderId: p.o.def.id, amount: p.after })), failed: [] };
    },
    // Ползунок «Доля» на учебной коллективке: без него менеджер, тронувший
    // ползунок, получал красное «не удалось сохранить долю» посреди урока.
    setOrderLogisticsUnits: (orderId, units) => {
      const o = trnOrder(orderId);
      if (!o) return undefined;
      const n = units === null || units === undefined || units === '' ? null : Number(units);
      if (n !== null && !(n >= 0 && n <= 2)) throw new Error('Доля логистики должна быть числом от 0 до 2.');
      o.units = n;
      return { orderId: o.def.id, logisticsUnits: n };
    }
  };

  /**
   * «⏩ Перемотать время» в уроке «Собрать на СДЭК заранее»: что случилось и
   * что стало (было → стало) — экран «Прошло N дней» (Tour.showTimeSkip).
   */
  const SDEK_STORY = [
    {
      skip: {
        days: 3, event: 'Катя и Маша перевели по 600 ₽ за СДЭК — ты занёс(ла) их через «Занести»',
        changes: [['Собрано на СДЭК', '0 ₽', '1 200 ₽'], ['Не внесли', '3 клиентки', '1 — Аня']]
      },
      apply: () => ['TRN105', 'TRN106'].forEach((id) => { const s = sdekStage(trnOrder(id)); s.paid = Math.min(600, s.target); s.remaining = Math.max(0, s.target - s.paid); s.covered = s.paid >= s.target; })
    },
    {
      skip: {
        days: 5, event: 'Посылка уехала, пришёл чек СДЭК — 2 000 ₽. Его вписали в «Расходы» и нажали «Сохранить сверку»',
        changes: [['Статус коллективки', 'Формируется', 'Отправлено (СДЭК)'], ['СДЭК за посылку', 'ожидали ≈2 400 ₽', 'вышло 2 000 ₽']]
      },
      apply: () => {
        const col = findCol('TRNC1');
        col.costs = { ...NO_COSTS, sdekCost: 2000 };
        col.status = 'Отправлено (СДЭК)';
        col.track = '1098765432';
        col.sentDaysAgo = 1;
      }
    }
  ];
  let storyStep = 0;

  const ago = (days, hours = 0) => new Date(world.now - days * DAY - hours * 3600000);

  function questions() {
    const q = (id, tid, orderId, text, status, answer, when) => {
      const c = CLIENTS[tid];
      const o = world.byId.get(orderId);
      return {
        questionId: id, orderId, text, answer: answer || '', status, source: 'Чат бота',
        createdAtDisplay: ruDay(when), createdAtSort: when.getTime(),
        productDisplay: o ? o.def.short : 'Общий вопрос', clientDisplay: c.name, clientUsername: c.username
      };
    };
    return [
      q('TRNQ1', 'trn-katya', 'TRN105', 'Здравствуйте! Когда приедет Клодин? Жду уже почти месяц 🙏', 'Новый', '', ago(0, 3)),
      q('TRNQ2', 'trn-olya', 'TRN103', '👍', 'Новый', '', ago(0, 5)),
      q('TRNQ3', 'trn-anya', 'TRN101', 'Можно оплатить Лагуну частями?', 'Отвечено', 'Да, конечно: сначала выкуп, вес и доставку — когда кукла приедет на склад.', ago(5))
    ];
  }

  function demand() {
    const cl = (tid) => ({ ...CLIENTS[tid], display: display(CLIENTS[tid]), orderedOrderId: '' });
    return {
      demand: [
        { skuOriginal: 'Monster High Operetta Core', productDisplay: 'Оперетта Core', imageUrl: doll(10), activeCount: 2, orderedCount: 0, purchasedCount: 0, description: '', link: '', reference: null, clients: [cl('trn-katya'), cl('trn-anya')] },
        { skuOriginal: 'Monster High Twyla Boogeyman Core', productDisplay: 'Твайла Core', imageUrl: doll(230), activeCount: 1, orderedCount: 0, purchasedCount: 0, description: '', link: '', reference: null, clients: [cl('trn-masha')] }
      ],
      unknown: [],
      ordered: {}
    };
  }

  function claims() {
    const c = CLIENTS['trn-anya'];
    return [{
      id: 900001, clientTelegramId: c.telegramId, clientDisplay: display(c), clientName: c.name, clientUsername: c.username,
      amountRub: 3000, scopeOrderId: 'TRN101', proofText: 'Перевела 3 000 ₽ на Сбер сегодня в 14:20, за Лагуну',
      createdAt: ago(0, 2).toISOString(), status: 'pending'
    }];
  }

  // --- Каталог ---
  function sku([original, shortName, character, series, lineId, hue]) {
    return {
      original, shortName, brand: 'Monster High', character, series, imageUrl: doll(hue), lineId,
      description: 'Учебная позиция каталога.', orderCount: world.orders.filter((o) => o.def.product === original).length
    };
  }
  const catalog = () => SKU_DEFS.map(sku);
  const findSku = (original) => SKU_DEFS.find((d) => d[0].toLowerCase() === String(original || '').trim().toLowerCase());

  /** Тот же порядок, что у сервера (catalogService.searchRelevanceScore). */
  function searchCatalog(query) {
    const text = String(query || '').trim().toLowerCase();
    if (!text) return [];
    const score = (s) => {
      const o = s.original.toLowerCase();
      if (o === text) return 100;
      if (o.startsWith(text)) return 80;
      if (o.includes(text)) return 40;
      return s.shortName.toLowerCase().includes(text) ? 30 : 20;
    };
    return catalog()
      .filter((s) => `${s.original} ${s.shortName} ${s.brand} ${s.character} ${s.series}`.toLowerCase().includes(text))
      .sort((a, b) => score(b) - score(a))
      .map((s) => ({ value: s.original, label: s.shortName, imageUrl: s.imageUrl }));
  }

  /** «Уже брал(а) N раз» по заказам учебной клиентки. */
  function skuCounts(tid) {
    const result = {};
    clientOrders(tid).forEach((o) => {
      const e = result[o.def.product] || { count: 0, lastDate: '', lastSort: 0 };
      e.count += 1;
      if (o.date.getTime() >= e.lastSort) { e.lastSort = o.date.getTime(); e.lastDate = ruDay(o.date); }
      result[o.def.product] = e;
    });
    Object.values(result).forEach((e) => { delete e.lastSort; });
    return result;
  }

  /** «спрос: N» у строк разбора лота — по учебному «Спросу». */
  function demandForNames(names) {
    const entries = demand().demand;
    return (names || []).map((name) => {
      const key = String(name || '').trim().toLowerCase();
      const hit = key && entries.find((e) => e.skuOriginal.toLowerCase() === key || e.productDisplay.toLowerCase() === key);
      return hit ? { name, count: hit.clients.length, clients: hit.clients.map((c) => ({ display: c.display })) } : { name, count: 0, clients: [] };
    });
  }

  /** Учебный ответ помощника: тот же вид, что настоящий (ответ, шаги), но заготовленный. */
  function assistantDemo(payload) {
    const question = String((payload && payload.text) || '').trim();
    const money = /оплат|перев|деньг|₽|долг/i.test(question);
    const answer = money
      ? 'Это учебный ответ — в уроке я не думаю по-настоящему, и обращение не тратится. В работе ответ был бы про твой вопрос, например так:'
      : 'Это учебный ответ — в уроке я не думаю по-настоящему, и обращение не тратится. В работе я отвечу именно на твой вопрос: коротко и по шагам.';
    const steps = money
      ? ['«Оплаты» → вкладка «Клиент» → найди клиентку.', '«Занести оплату»: сумма — сколько пришло в банк.', '«За что» — разложи по заказам и «Занести».']
      : ['Пиши своими словами, как коллеге.', 'Прочитай ответ и шаги.', 'Отметь «Помогло» или «Не помогло» — «Не помогло» уйдёт VASY.'];
    return {
      id: -1, status: 'open', handoff: '', screen: 'Обучение', canAsk: false, hasScreenshot: false,
      messages: [
        { role: 'manager', text: question, data: {} },
        { role: 'assistant', text: answer, data: { answer: { answer, steps, clarify: '', scenarioId: '' } } }
      ]
    };
  }

  const trnOrder = (id) => world.byId.get(String(id || ''));
  const isTrnClient = (tid) => !!CLIENTS[String(tid || '')];

  /** Чтения учебного мира. undefined — «не наше», идёт на сервер как обычно. */
  const HANDLERS = {
    getTasksBoard: () => {
      const cards = world.orders.filter((o) => o.items.length).map(boardCard).sort((a, b) => b.priorityScore - a.priorityScore);
      const stageTotals = {};
      cards.forEach((c) => { const k = c.stage ? c.stage.key : ''; stageTotals[k] = (stageTotals[k] || 0) + 1; });
      return { cards, stageTotals };
    },
    getRemindersSummary: () => ({ criticalCount: world.orders.filter((o) => o.items.some((i) => i.severity === 'critical')).length }),
    getShippingRecommendations: () => [],
    getOrdersList: () => world.orders.slice().sort((a, b) => b.date - a.date).map(listItem),
    refreshOrdersList: () => world.orders.slice().sort((a, b) => b.date - a.date).map(listItem),
    getOrderDetails: (id) => (trnOrder(id) ? details(trnOrder(id)) : undefined),
    getOrderTasks: (id) => (trnOrder(id) ? { card: trnOrder(id).items.length ? boardCard(trnOrder(id)) : null } : undefined),
    getOrderHistory: (id) => (trnOrder(id) ? [] : undefined),
    getReminderDismissalsForOrder: (id) => (trnOrder(id) ? [] : undefined),
    getOrderDebtForWriteoff: (id) => (trnOrder(id) ? { writeoffs: [], canWriteOff: false, totalRemaining: 0 } : undefined),
    getOrderWriteoffs: (id) => (trnOrder(id) ? [] : undefined),
    getOrderPurchaseSummary: (id) => (trnOrder(id) ? { orderId: id, count: 1, totalAmountInCurrency: trnOrder(id).def.amount, totalCostActualRub: 0, lastOccurredAt: null, orderCurrency: 'Доллар', orderAmountInCurrency: trnOrder(id).def.amount } : undefined),
    findClientWishlistMatch: (tid) => (isTrnClient(tid) ? null : undefined),
    getClientSkuPurchaseCounts: (tid) => (isTrnClient(tid) ? skuCounts(tid) : undefined),
    // «Итог и оплаты» в «Корзине»: свободного остатка и кредита у учебных клиенток нет.
    getClientsMoneyContext: (ids) => {
      const list = (Array.isArray(ids) ? ids : []).map(String);
      if (!list.some(isTrnClient)) return undefined;
      return list.filter(isTrnClient).map((telegramId) => ({ telegramId, creditRub: 0, poolLeftoverRub: 0 }));
    },
    getCatalogList: () => catalog(),
    refreshCatalogList: () => catalog(),
    searchSku: (query) => searchCatalog(query),
    getSkuDetails: (original) => {
      const def = findSku(original);
      if (!def) return undefined;
      const { orderCount, ...rest } = sku(def);
      return { ...rest, extraLineIds: [] };
    },
    getCatalogLinksForSku: (original) => (findSku(original) ? [] : undefined),
    getCatalogLinesTree: () => ({ lines: LINES.map((l) => ({ ...l, directSkus: 0, totalSkus: 0 })) }),
    parseLotPositions: (url) => (String(url || '').includes(LOT_URL_MARK)
      ? { ...clone(LOT_PARSE), imageCount: 2, imageUrls: [doll(10), doll(230)] }
      : undefined),
    getWishlistDemandForNames: (names) => demandForNames(names),
    // Урок «Твой помощник»: учебный разговор — модель не зовётся, обращение не тратится.
    getMyAssistant: () => ({ remaining: 5, perDay: 5, sessions: [] }),
    askAssistant: (payload) => ({ session: assistantDemo(payload), remaining: 5, perDay: 5 }),
    rateAssistantSession: (id, helped) => ({ status: helped ? 'helped' : 'not_helped' }),
    getCollectivesList: () => world.collectives.map(collectiveHead),
    getCollectiveDetails: (id) => {
      const col = findCol(id);
      if (!col) return undefined;
      const list = collectiveOrders(id);
      return { ...collectiveHead(col), actualLogisticsCosts: { ...col.costs }, orders: list, summary: collectiveSummary(list) };
    },
    getCollectiveLogisticsContext: (id) => {
      const col = findCol(id);
      if (!col) return undefined;
      const list = collectiveOrders(id).map((o) => ({ ...o, alreadyEstimated: 0, units: o.logisticsUnitsEffective }));
      return { orders: list, actualLogisticsCosts: { ...col.costs }, summary: collectiveSummary(list) };
    },
    searchOrdersForCollective: () => [],
    // Коллективки 2.0 э2–э4 (10.10.2026) — «Что осталось сделать», «Оплата СДЭК», «Сбор на СДЭК».
    getCollectiveSdekPayments: (id) => (findCol(id) ? sdekPayments(id) : undefined),
    previewCollectiveSdekForecast: (id, input) => {
      if (!findCol(id)) return undefined;
      const { col, forecast, orders, skipped } = forecastPlan(id, input);
      return {
        collectiveId: id, forecast, previousForecast: col.forecast ? { ...col.forecast } : null, orders, skipped,
        totals: {
          forecastSum: round2(orders.reduce((a, o) => a + o.after, 0)), paidSum: round2(orders.reduce((a, o) => a + o.paid, 0)),
          surplusSum: round2(orders.reduce((a, o) => a + o.surplus, 0)),
          skippedPricedSum: round2(skipped.filter((x) => x.reason === 'priced').reduce((a, x) => a + x.target, 0))
        }
      };
    },
    previewApplyCollectiveLogisticsSharesToOrders: (id, options) => (findCol(id)
      ? sharesPlan(id, options).map((p) => ({ orderId: p.o.def.id, before: p.before, after: p.after, alreadyPaid: p.alreadyPaid }))
      : undefined),
    // Коллективки 2.0 (10.10.2026) — «Без коллективки»: учебные заказы без коллективки.
    getCollectivePool: () => world.orders
      .filter((o) => !o.collective && o.def.statusDelivery !== 'Получено клиентом')
      .map((o) => {
        const sdek = o.stagesBalance.find((s) => s.stage === 'СДЭК') || { target: 0, paid: 0, isForecast: null };
        return {
          orderId: o.def.id, productDisplay: o.def.short, clientDisplay: display(o.client), imageUrl: o.imageUrl,
          statusDelivery: o.def.statusDelivery, group: o.def.statusDelivery === 'Ожидает отправки с магазина' ? 'store' : 'kz',
          dateOrderDisplay: ruDay(o.date), daysSinceOrder: Math.floor((world.now - o.date.getTime()) / DAY),
          sdekTarget: sdek.target, sdekPaid: sdek.paid, sdekIsForecast: sdek.isForecast
        };
      }),
    getPaymentsOverview: () => ({ clients: Object.keys(CLIENTS).map(overviewClient).filter(Boolean).sort((a, b) => b.toPay - a.toPay), coveredByBalanceCount: 0 }),
    getPendingPaymentClaims: () => claims(),
    searchClients: (query) => {
      const q = String(query || '').toLowerCase().replace(/^@/, '');
      return Object.values(CLIENTS)
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q))
        .map((c) => ({ telegramId: c.telegramId, name: c.name, username: c.username, displayName: display(c), pending: false }));
    },
    getClientByTelegramId: (tid) => (isTrnClient(tid) ? { ...CLIENTS[tid] } : undefined),
    getPaymentsScreenOrders: (tid) => (isTrnClient(tid) ? clientOrders(tid).map((o) => ({
      orderId: o.def.id, productDisplay: o.def.short, statusDelivery: o.def.statusDelivery, statusOrder: o.def.statusOrder,
      dateOrderDisplay: ruDay(o.date), isCompleted: o.def.statusOrder === 'Выполнен', isNewModel: true, imageUrl: o.imageUrl,
      details: {
        stagesBalance: o.stagesBalance.map((s) => ({ ...s })), statusDelivery: o.def.statusDelivery, dateOrder: isoDay(o.date), isOwnPurchase: false,
        mainBalance: details(o).mainBalance
      }
    })) : undefined),
    getPaymentsForClient: (tid) => (isTrnClient(tid) ? clientPayments(tid) : undefined),
    getEarmarksForClient: (tid) => (isTrnClient(tid) ? [] : undefined),
    getClientCreditBalance: (tid) => (isTrnClient(tid) ? 0 : undefined),
    getClientPaymentsRollup: (tid) => {
      if (!isTrnClient(tid)) return undefined;
      const all = clientOrders(tid).flatMap((o) => o.stagesBalance);
      return {
        totalPaid: all.reduce((a, s) => a + s.paid, 0),
        totalRemaining: all.filter((s) => s.isForecast === false).reduce((a, s) => a + s.remaining, 0),
        priorityAmount: 0, priorityStage: null, priorityIsForecast: null
      };
    },
    getPaymentReminderPreview: (tid) => (isTrnClient(tid) ? preview(tid) : undefined),
    getPaymentReceipt: (tid) => (isTrnClient(tid) ? null : undefined),
    getQuestionsList: () => questions(),
    getWishlistDemand: () => demand(),
    getWishlistMatchQueue: () => ({ groups: [] }),
    getWishlistMatchQueueCount: () => 0,
    getOrderLinkSuggestions: () => []
  };

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  function sandboxCall(method, ...args) {
    if (!active) return realCallServer(method, ...args);
    const handler = HANDLERS[method];
    if (handler) {
      let result;
      try { result = handler(...args); } catch (e) { return Promise.reject(e); }
      if (result !== undefined) return new Promise((resolve) => setTimeout(() => resolve(clone(result)), 120));
    }
    const write = WRITE_HANDLERS[method];
    if (write) {
      let result;
      try { result = write(...args); } catch (e) { return Promise.reject(e); }
      if (result !== undefined) return new Promise((resolve) => setTimeout(() => resolve(clone(result)), 150));
    }
    if (WRITE_RE.test(method) && !ALLOWED_WRITES.has(method)) {
      return Promise.reject(new Error('Учебный режим: ничего не записывается.'));
    }
    // Учебный ID ушёл бы на сервер — там его нет. Лучше сразу сказать, чем ловить «не найден».
    const raw = JSON.stringify(args);
    if (/"(TRN\d|TRNC\d|trn-)/.test(raw)) {
      console.warn(`[учебный режим] нет учебного ответа для ${method}`, args);
      return Promise.reject(new Error('Учебный режим: этого в учебном примере нет.'));
    }
    return realCallServer(method, ...args);
  }

  // Подменяем глобальную функцию один раз: вне урока — просто прокидываем.
  window.callServer = sandboxCall;

  function banner(show) {
    let el = document.getElementById('training-sandbox-banner');
    if (!show) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'training-sandbox-banner';
    el.className = 'fixed left-1/2 -translate-x-1/2 z-[92] pointer-events-none px-3 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[11px] font-semibold shadow whitespace-nowrap';
    el.style.top = 'calc(env(safe-area-inset-top, 0px) + 2px)';
    el.textContent = '🎓 Учебный пример';
    document.body.appendChild(el);
  }

  /** Убираем следы учебного мира из того, что экраны помнят между заходами. */
  function cleanup() {
    try {
      const raw = localStorage.getItem('payments_recent_clients');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) localStorage.setItem('payments_recent_clients', JSON.stringify(list.filter((c) => !isTrnClient(c && c.telegramId))));
      }
    } catch (e) { /* нет хранилища — нечего чистить */ }
    try {
      const q = JSON.parse(sessionStorage.getItem('tasksBoardQueue') || 'null');
      if (q && Array.isArray(q.ids) && q.ids.some((id) => String(id).startsWith('TRN'))) sessionStorage.removeItem('tasksBoardQueue');
    } catch (e) { /* то же */ }
  }

  window.TrainingSandbox = {
    activate() {
      world = buildWorld();
      storyStep = 0;
      active = true;
      banner(true);
    },
    deactivate() {
      if (!active) return;
      active = false;
      banner(false);
      cleanup();
      world = null;
    },
    isActive: () => active,
    CLIENTS,
    /** «⏩ Перемотать время» в уроке «Собрать на СДЭК заранее»: учебная коллективка — на следующий шаг истории. */
    advanceStory() {
      if (!active || storyStep >= SDEK_STORY.length) return storyStep;
      SDEK_STORY[storyStep].apply();
      storyStep += 1;
      return storyStep;
    },
    storyStep: () => storyStep,
    nextStorySkip: () => (storyStep < SDEK_STORY.length ? clone(SDEK_STORY[storyStep].skip) : null),
    // Ссылка учебного лота: «Разобрать лот» отвечает по ней из учебного мира.
    LOT_URL: `https://www.ebay.com/itm/${LOT_URL_MARK}-monster-high-core`
  };
})();
