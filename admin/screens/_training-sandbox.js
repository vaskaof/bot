'use strict';

/**
 * Учебная песочница (обучение менеджеров, 04.10.2026; VASY: «смоделируем
 * обучение на учебных кейсах, чтобы уроки не искали кейс, а предоставляли
 * его наглядно»). Пока идёт урок, экраны работают как обычно, но данные
 * для них — учебный пример, а не настоящие заказы:
 *
 * - чтения из `HANDLERS` отдаются отсюда (доска «Задачи», заказы, карточка
 *   заказа, коллективки, «Оплаты», вопросы, «Спрос», поиск клиента);
 *   остальные чтения (справочники, каталог, курсы) идут на сервер как есть;
 * - любая запись отклоняется здесь же, до сервера (вторая линия защиты
 *   после `block` сценария) — кроме самого обучения (события, отзывы);
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
      id: 'TRN101', client: 'trn-anya', product: 'Monster High Lagoona Blue Ghouls Rule', short: 'Лагуна Ghouls Rule', hue: 190,
      channel: 'Mattel Creations', account: 'mattel-1@учебный', cargo: 'Карго Алматы', amount: 60, rateKzt: '480', rateRub: '0.19',
      daysAgo: 12, statusDelivery: 'Ожидает отправки с магазина', statusOrder: 'Актуально, в доставке', stage: 'e3',
      stages: [['Основная', 7500, 4500, true, false], ['Вес', 0, 0, false, null], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
      tasks: [{ kind: 'stage_unpaid', stage: 'Основная', label: 'Основная оплата: ждёт оплаты', hint: 'Осталось: 3 000 ₽', severity: 'warning', days: 4 }]
    },
    {
      id: 'TRN102', client: 'trn-anya', product: 'Monster High Draculaura Skulltimate Secrets', short: 'Дракулаура Skulltimate', hue: 330,
      channel: 'eBay', account: 'ebay-2@учебный', cargo: 'Карго Алматы', amount: 85, rateKzt: '480', rateRub: '0.19',
      daysAgo: 30, statusDelivery: 'На складе в Казахстане', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1', units: 2,
      stages: [['Основная', 6800, 6800, true, false], ['Вес', 2000, 0, true, false], ['СДЭК', 0, 0, false, null], ['Доставка_РФ', 0, 0, false, null]],
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
      daysAgo: 25, statusDelivery: 'На складе в Казахстане', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 900, 0, false, true], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN106', client: 'trn-masha', product: 'Monster High Abbey Bominable Core', short: 'Эбби Core', hue: 210,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 24, statusDelivery: 'На складе в Казахстане', statusOrder: 'Актуально, в доставке', stage: 'e5', collective: 'TRNC1', legPaid: true,
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 900, 900, true, false], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN107', client: 'trn-masha', product: 'Monster High Ghoulia Yelps Core', short: 'Гулия Core', hue: 260,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 9, statusDelivery: 'На складе в Казахстане', statusOrder: 'Актуально, в доставке', stage: 'e5',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 900, 0, false, true], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    },
    {
      id: 'TRN108', client: 'trn-katya', product: 'Monster High Toralei Stripe Core', short: 'Торалей Core', hue: 300,
      channel: 'AmazonUSA', account: 'amazon-1@учебный', cargo: 'Карго Алматы', amount: 30, rateKzt: '480', rateRub: '0.19',
      daysAgo: 8, statusDelivery: 'На складе в Казахстане', statusOrder: 'Актуально, в доставке', stage: 'e5',
      stages: [['Основная', 3900, 3900, true, false], ['Вес', 700, 700, true, false], ['СДЭК', 900, 0, false, true], ['Доставка_РФ', 0, 0, false, null]],
      tasks: []
    }
  ];

  const COLLECTIVE_DEFS = [
    { id: 'TRNC1', name: 'СДЭК 12.10 (учебная)', stage: 'КЗ→РФ', status: 'Формируется', daysAgo: 3, track: '' },
    { id: 'TRNC2', name: 'Отправка по РФ 28.09 (учебная)', stage: 'По РФ', status: 'Отправлено', daysAgo: 7, track: '10012345678', orderCount: 2 }
  ];

  // --- Сборка мира ---
  function isoDay(d) { return d.toISOString().slice(0, 10); }
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
      return { def, date, client: c, stagesBalance, items, imageUrl: doll(def.hue) };
    });
    const byId = new Map(orders.map((o) => [o.def.id, o]));
    return { now, orders, byId };
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
    const col = o.def.collective && COLLECTIVE_DEFS.find((c) => c.id === o.def.collective);
    return col ? [{ collectiveId: col.id, name: col.name, stage: col.stage }] : [];
  }

  function listItem(o) {
    const { def, client } = o;
    return {
      orderId: def.id, productDisplay: def.short, productOriginal: def.product, remark: '',
      statusOrder: def.statusOrder, statusDelivery: def.statusDelivery, managerId: me(), deliveryLadder: null,
      stage: STAGE_KEYS[def.stage] || null, purchaseChannel: def.channel, clientDisplay: display(client),
      dateOrderDisplay: ruDay(o.date), dateOrderSort: o.date.getTime(), searchTags: '', imageUrl: o.imageUrl, inCatalog: true,
      collectiveId: def.collective || '', collectiveLinks: collectiveLinks(o), lotId: '', cartId: '',
      amount: String(def.amount), currency: 'Доллар', productShort: def.short,
      client: { telegramId: client.telegramId, username: client.username, name: client.name }, money: orderMoney(o)
    };
  }

  function details(o) {
    const { def, client } = o;
    const sb = (stage) => o.stagesBalance.find((s) => s.stage === stage) || { target: 0, paid: 0 };
    const main = sb('Основная');
    const col = def.collective && COLLECTIVE_DEFS.find((c) => c.id === def.collective);
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

  function collectiveOrders(colId) {
    return world.orders.filter((o) => o.def.collective === colId).map((o) => ({
      orderId: o.def.id, productDisplay: o.def.short, productOriginal: o.def.product, clientDisplay: display(o.client),
      imageUrl: o.imageUrl, statusOrder: o.def.statusOrder, statusDelivery: o.def.statusDelivery, remark: '',
      logisticsUnitsRaw: o.def.units || null, logisticsUnitsEffective: o.def.units || 1, ownLegPaid: !!o.def.legPaid, lotId: null
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

  function collectiveHead(def) {
    const created = new Date(world.now - def.daysAgo * DAY);
    const list = collectiveOrders(def.id);
    return {
      collectiveId: def.id, name: def.name, trackNumber: def.track, status: def.status, stage: def.stage,
      createdAt: ruDay(created), sentAt: null, sentAtDisplay: '', orderCount: def.orderCount || list.length
    };
  }

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
    getClientSkuPurchaseCounts: (tid) => (isTrnClient(tid) ? {} : undefined),
    getCollectivesList: () => COLLECTIVE_DEFS.map(collectiveHead),
    getCollectiveDetails: (id) => {
      const def = COLLECTIVE_DEFS.find((c) => c.id === id);
      if (!def) return undefined;
      const list = collectiveOrders(id);
      return { ...collectiveHead(def), actualLogisticsCosts: { ...NO_COSTS }, orders: list, summary: collectiveSummary(list) };
    },
    getCollectiveLogisticsContext: (id) => {
      if (!COLLECTIVE_DEFS.some((c) => c.id === id)) return undefined;
      const list = collectiveOrders(id).map((o) => ({ ...o, alreadyEstimated: 0, units: o.logisticsUnitsEffective }));
      return { orders: list, actualLogisticsCosts: { ...NO_COSTS }, summary: collectiveSummary(list) };
    },
    searchOrdersForCollective: () => [],
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
    CLIENTS
  };
})();
