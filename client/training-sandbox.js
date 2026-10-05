'use strict';

/**
 * Учебный пример для уроков клиента (план Б, 05.10.2026; эталон — уроки
 * менеджеров на учебном примере, admin/screens/_training-sandbox.js).
 * Пока идёт урок, экраны работают как обычно, но данные — учебные:
 *
 * - чтения из HANDLERS отдаются отсюда: «Мои заказы» и карточка заказа
 *   (TRN201–TRN203), оплаты, вопросы, «Мои куклы», коллекции, задания,
 *   розыгрыш, совы и билеты; остальное (настройки, «Что нового») идёт на
 *   сервер как есть;
 * - «Сообщить об оплате» и «Задать вопрос» в уроке как будто отправляются
 *   (экран показывает то же, что в жизни), но на сервер не уходит ничего;
 *   любая другая запись отклоняется здесь же;
 * - на сервер учебные данные не попадают никогда — кроме событий самого
 *   урока (recordMyLessonEvent).
 *
 * Фото — рисованные силуэты «Моих кукол» (картинки нет — силуэт), чтобы
 * сразу было видно: это пример. Формы ответов совпадают с настоящими
 * (сняты с тестовой базы); сторож — e2e client-training.spec.js.
 */
(function () {
  const realCallServer = window.callServer;
  let active = false;
  let sent = { claims: [], questions: [] };

  const ALLOWED_WRITES = new Set(['recordMyLessonEvent', 'setMyLessonPrefs', 'markMyWhatsNewSeen', 'reportClientBootIssue', 'recordPrivacyConsent']);
  // В уроке «как будто отправилось»: экран показывает обычный ответ, на сервер — ничего.
  const SIMULATED = {
    submitPaymentClaim: (amount, proof, orderId) => { sent.claims.push({ amount, orderId }); return { claimId: 'TRN-CLAIM', status: 'pending' }; },
    submitOrderQuestion: (orderId, text) => { sent.questions.push({ orderId, text }); return { questionId: 'TRN-Q', duplicate: false }; }
  };
  const WRITE_RE = /^(create|record|update|set|assign|delete|save|submit|mark|confirm|claim|share|add|join|book|answer|scan|discard|reject|resolve|match)/;

  const STAGE = (stage, target, paid, isForecast) => ({
    stage, target, paid, remaining: Math.round((target - paid) * 100) / 100,
    covered: target > 0 && paid >= target, isForecast: target > 0 ? isForecast : null
  });
  const dateAgo = (days) => {
    const d = new Date(Date.now() - days * 86400000);
    return { display: d.toLocaleDateString('ru-RU'), sort: d.getTime() };
  };

  /** Учебные заказы клиента. step — укрупнённый шаг пути (0..7), как на сервере. */
  const ORDERS = [
    {
      orderId: 'TRN201', productDisplay: 'Лагуна Блю Ghouls Rule', productOriginal: 'Monster High Skullector Ghouls Rule Lagoona Blue Doll',
      statusDelivery: 'Ожидает выкупа', statusOrder: 'Актуально', step: 0, daysAgo: 3, isCompleted: false, sov: { accrued: false, amount: 150 },
      stages: [STAGE('Основная', 7500, 4500, false), STAGE('Вес', 0, 0, null), STAGE('СДЭК', 0, 0, null), STAGE('Доставка_РФ', 0, 0, null)]
    },
    {
      orderId: 'TRN202', productDisplay: 'Дракулаура Skulltimate Secrets', productOriginal: 'Monster High Skulltimate Secrets Draculaura',
      statusDelivery: 'Едет на склад в Казахстане', statusOrder: 'Актуально, в доставке', step: 2, daysAgo: 16, isCompleted: false, sov: { accrued: true, amount: 180 },
      collectiveLabel: '',
      stages: [STAGE('Основная', 9000, 9000, false), STAGE('Вес', 650, 0, true), STAGE('СДЭК', 0, 0, null), STAGE('Доставка_РФ', 0, 0, null)]
    },
    {
      orderId: 'TRN203', productDisplay: 'Клео де Нил G3', productOriginal: 'Monster High Cleo De Nile G3 Doll',
      statusDelivery: 'Получено клиентом', statusOrder: 'Выполнен', step: 7, daysAgo: 48, isCompleted: true, sov: { accrued: true, amount: 120 },
      dateReceivedDaysAgo: 6, duration: '42 дня',
      stages: [STAGE('Основная', 6000, 6000, false), STAGE('Вес', 520, 520, false), STAGE('СДЭК', 380, 380, false), STAGE('Доставка_РФ', 300, 300, false)]
    }
  ];
  const STEP_LABELS = ['Ожидает выкупа', 'Выкуплен', 'Едет в Казахстан', 'У посредника в Казахстане', 'Едет в Россию', 'У посредника в России', 'Едет к вам', 'Получен'];

  const known = (o) => o.stages.filter((s) => s.target > 0);
  const remainingOf = (o) => known(o).reduce((sum, s) => sum + Math.max(s.remaining, 0), 0);
  const debtSummary = (o) => (known(o).length === 0 ? 'Уточняется' : (remainingOf(o) <= 0.01 ? 'Оплачено' : `К оплате: ${remainingOf(o).toFixed(2)} ₽`));
  const progress = (o) => ({ index: o.step, total: STEP_LABELS.length, label: STEP_LABELS[o.step] });

  function listItem(o) {
    const d = dateAgo(o.daysAgo);
    return {
      orderId: o.orderId, productDisplay: o.productDisplay, productOriginal: o.productOriginal, statusDelivery: o.statusDelivery,
      deliveryLadder: null, progressStep: progress(o), statusOrder: o.statusOrder, dateOrderDisplay: d.display, dateOrderSort: d.sort,
      isCompleted: o.isCompleted, debtSummary: debtSummary(o), imageUrl: '', sovInfo: o.sov
    };
  }

  function details(orderId) {
    const o = ORDERS.find((x) => x.orderId === orderId);
    if (!o) throw new Error('Заказ не найден.');
    const main = o.stages[0];
    return {
      ...listItem(o),
      dateReceivedDisplay: o.dateReceivedDaysAgo ? dateAgo(o.dateReceivedDaysAgo).display : '',
      durationDisplay: o.duration || '',
      collectiveLabel: o.collectiveLabel || '',
      payments: {},
      mainBalance: { target: main.target, paid: main.paid, remaining: main.remaining },
      creditBalanceRub: 0,
      isNewModel: true,
      stagesBalance: o.stages,
      pendingReceiptClaim: null
    };
  }

  // Приоритет «прямо сейчас» — основная оплата TRN201 (кукла ещё не выкуплена);
  // вес TRN202 — когда кукла доедет до склада (сумма пока предварительная).
  const ROLLUP = { totalPaid: 0, totalRemaining: 3650, priorityAmount: 3000, priorityStage: 'Основная', priorityIsForecast: false };

  function questions() {
    return [
      ...sent.questions.map((q, i) => ({ questionId: `TRN-Q${i}`, orderId: q.orderId, productDisplay: q.orderId ? (ORDERS.find((o) => o.orderId === q.orderId) || {}).productDisplay || 'Общий вопрос' : 'Общий вопрос', text: q.text, status: 'Новый', answer: '', createdAtDisplay: dateAgo(0).display })),
      { questionId: 'TRN-Q1', orderId: 'TRN202', productDisplay: 'Дракулаура Skulltimate Secrets', text: 'Когда примерно приедет Дракулаура?', status: 'Отвечено', answer: 'Сейчас она едет на склад в Казахстане, обычно это 7–10 дней. Как приедет — пришлём сообщение и сумму за вес.', createdAtDisplay: dateAgo(2).display },
      { questionId: 'TRN-Q2', orderId: 'TRN201', productDisplay: 'Лагуна Блю Ghouls Rule', text: 'Можно оплатить остаток завтра?', status: 'Новый', answer: '', createdAtDisplay: dateAgo(0).display }
    ];
  }

  const WISH = (id, title, status, extra) => ({
    wishlistId: id, telegramId: 'trn-me', username: '', clientName: '', clientDisplay: '', skuOriginal: '', isUnknown: false,
    productDisplay: title, rawTitle: title, shortNameRu: '', rawDescription: '', sourceUrl: '', rawImageUrl: '', imageUrl: '',
    status, createdAtDisplay: dateAgo(extra.days || 10).display, createdAtSort: dateAgo(extra.days || 10).sort, isGrail: false,
    acquiredAt: null, huntDays: status === 'Хочу' ? (extra.days || 10) : null, isReference: false, seriesPath: extra.series || '',
    matchState: '', match: { state: '', source: '', applied: null, options: [] }, hunt: null, arrivedUnseen: false, ...extra.over
  });
  const WISHLIST = [
    WISH('TRNW1', 'Лагуна Блю Ghouls Rule', 'Хочу', { days: 20, series: 'Monster High · Skullector', over: { hunt: { stage: 'ordered', stageIndex: 1, stepLabel: 'Ожидает выкупа', orderId: 'TRN201', trackNumber: '' } } }),
    WISH('TRNW2', 'Френки Штейн Skullector', 'Хочу', { days: 64, series: 'Monster High · Skullector', over: { isGrail: true } }),
    WISH('TRNW3', 'Гулия Йелпс G3', 'Хочу', { days: 9, series: 'Monster High · G3' }),
    WISH('TRNW4', 'Клео де Нил G3', 'Куплено', { days: 50, series: 'Monster High · G3', over: { huntDays: 42 } }),
    WISH('TRNW5', 'Дракулаура G1', 'Есть', { days: 120, series: 'Monster High · G1' })
  ];

  const HANDLERS = {
    getClientOrdersList: () => ORDERS.map(listItem),
    getClientOrderDetails: (orderId) => details(orderId),
    getMyPaymentsRollup: () => ROLLUP,
    getMyCreditBalance: () => 0,
    getMyPoolLeftover: () => 0,
    getTransitOfferCount: () => ({ count: 0 }),
    getTransitOffers: () => [],
    getReferralInfo: () => ({ link: 'https://t.me/knopka_bot?start=ref_uchebnaya', inviteeReward: 10, referrerReward: 100, conversionRateRub: 5000, sovyPerTicket: 100, balance: { sovyProgress: 60, tickets: 1 } }),
    getClientQuestionsList: () => questions(),
    getClientWishlist: () => WISHLIST,
    getHuntState: () => ({ introSeen: true, celebrations: [], arrivals: [], achievements: [] }),
    getChecklistImportSuggestions: () => [],
    getClientCollections: () => ({
      hasChecklistItems: true,
      collections: [{ id: 990001, name: 'Monster High G3 — первая волна', description: 'Учебная коллекция', coverImageUrl: '', totalCount: 6, ownedCount: 2, wantCount: 1, progressPercent: 33 }]
    }),
    getTasksList: () => [
      { taskId: 'TRN-T1', title: '⭐ Добавьте куклу в вишлист', description: 'Совы за каждую куклу в вишлисте — до 5 раз', type: 'Авто', reward: 5, status: 'done', repeatable: true, maxAccruals: 5, answerHint: '', action: '', progress: null },
      { taskId: 'TRN-T2', title: '🎓 Пройдите 3 урока', description: 'Совы за прогресс в обучении', type: 'Авто', reward: 10, status: 'not_done', repeatable: false, maxAccruals: null, answerHint: '', action: 'training', progress: { have: 1, need: 3 } },
      { taskId: 'TRN-T3', title: '📸 Отзыв с фото', description: 'Пришлите ссылку на пост с куклой — менеджер проверит', type: 'Ручное', reward: 30, status: 'not_done', repeatable: false, maxAccruals: null, answerHint: 'Ссылка на пост', action: '', progress: null }
    ],
    getLotteriesList: () => [
      { lotteryId: 'TRN-L1', title: 'Розыгрыш куклы месяца', prize: 'Абби Боминейбл G3', type: 'Тип0', participantCount: 14, alreadyJoined: false, conditionMet: true, conditions: [{ title: '⭐ Добавьте куклу в вишлист', description: '', done: true }] }
    ]
  };

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  const later = (v) => new Promise((resolve) => setTimeout(() => resolve(clone(v)), 120));

  function sandboxCall(method, ...args) {
    if (!active) return realCallServer(method, ...args);
    if (HANDLERS[method]) {
      try { return later(HANDLERS[method](...args)); } catch (e) { return Promise.reject(e); }
    }
    if (SIMULATED[method]) return later(SIMULATED[method](...args));
    if (WRITE_RE.test(method) && !ALLOWED_WRITES.has(method)) {
      return Promise.reject(new Error('В уроке это не сохраняется — это учебный пример.'));
    }
    if (/"TRN/.test(JSON.stringify(args))) {
      console.warn(`[учебный пример] нет учебного ответа для ${method}`, args);
      return Promise.reject(new Error('В учебном примере этого нет.'));
    }
    return realCallServer(method, ...args);
  }
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

  window.TrainingSandbox = {
    activate() { sent = { claims: [], questions: [] }; active = true; banner(true); },
    deactivate() { if (!active) return; active = false; banner(false); },
    isActive: () => active,
    sent: () => clone(sent),
    ORDERS: ORDERS.map((o) => o.orderId)
  };
})();
