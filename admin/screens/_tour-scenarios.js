'use strict';

/**
 * Сценарии обучения менеджеров (этап 1, 04.10.2026) — шаги для `_tour.js`.
 * id и названия совпадают с server/src/training/trainingCatalog.js (там же
 * список всего курса, значки и уровни). Тексты — коротко, на «ты», про то,
 * ЗАЧЕМ кнопка, а не только где она.
 *
 * Учебный режим ничего не записывает: в «Быстром выкупе» сохранение корзины
 * заблокировано, скриншот — учебный, без вызова ИИ (токены не тратятся).
 *
 * Шаг: { target, title?, text, advance: 'next'|'click'|{until}, optional?,
 * group?, groupLeader?, skipIf?, missingIf?, wait?, free?, actions?, skippedText?, quiz? } —
 * подробности в JSDoc `_tour.js`. Шаг без target — объяснение по центру.
 *
 * Этап 4 (04.10.2026): `momentScreens` — экраны, где делают то же самое по-
 * настоящему: туда один раз всплывает «здесь есть урок» (_training-ui.js).
 * Деньги/отправки — с вопросами-проверками в конце (`quiz`).
 */
(function () {
  const nav = (key) => `#bottom-nav [data-nav-key="${key}"]`;
  const onScreen = (...names) => () => names.includes(Tour.currentScreen());

  // Учебный скриншот: товар из реального каталога, суммы придуманы.
  const SAMPLE_PRODUCT = 'Monster High Skullector Ghouls Rule Lagoona Blue Doll';
  async function useTrainingCheckout() {
    let match = null;
    try {
      // searchSku ищет подстроку целиком — запрос должен быть куском названия.
      const found = (await callServer('searchSku', 'Ghouls Rule Lagoona')) || [];
      const exact = found.find((f) => f.value === SAMPLE_PRODUCT) || found[0];
      if (exact) match = { skuOriginal: exact.value, shortName: exact.label, imageUrl: exact.imageUrl || '' };
    } catch (e) { /* без совпадения — форма попросит выбрать товар, тоже полезно */ }
    await CheckoutShot.useTrainingSample('assets/training-checkout.svg', {
      store: 'Mattel Creations', storeDomain: 'creations.mattel.com', currency: 'Доллар',
      orderNumber: 'TRAINING-001', orderDate: '',
      items: [{ name: SAMPLE_PRODUCT, quantity: 1, unitPrice: 60, lineTotal: 60, match }],
      subtotal: 60, shipping: 9.99, tax: 5.25, discount: null, total: 75.24,
      note: 'Учебный пример. В работе ИИ распознаёт твой скриншот за 10–35 секунд.',
      check: { ok: true, itemsSum: 60, expectedTotal: 75.24, diff: 0 }
    });
  }

  const firstCartCard = '#cart-items-list > div:first-child';

  // Тот же критерий, что Tour.findTarget: на телефоне колонки доски «Задачи»
  // лежат лентой — карточка соседней колонки за краем экрана не считается.
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
  };
  const firstShown = (sel) => Array.from(document.querySelectorAll(sel)).find(shown) || null;
  const boardEmpty = () => { const e = document.getElementById('empty-message'); return !!e && !e.classList.contains('hidden'); };
  const boardReady = () => boardEmpty() || !!firstShown('#reminders-list [data-order-card]');

  // Вопрос для «Вопросов и вишлиста»: лучше новый (у него есть «Закрыть без ответа»).
  function questionCard() {
    const fresh = firstShown('#questions-list .close-question-btn');
    const any = fresh || firstShown('#questions-list .answer-input');
    return any ? any.closest('#questions-list > div') : null;
  }

  window.TourScenarios = {
    'nav-overview': {
      id: 'nav-overview',
      title: 'Где что теперь',
      screens: ['home', 'reminders', 'orders', 'catalog', 'payments', 'more'],
      steps: [
        { target: nav('home'), title: 'Главная', text: 'Открой «Главную».', advance: 'click', skipIf: onScreen('home') },
        { target: '#tab-switcher', title: 'Новости и вопросы', text: '«Новости» — что видят клиенты и админы. <b>«Вопросы»</b> — вопросы клиентов по заказам: цифра — новые, на них отвечай в первую очередь. Ответ уходит клиенту в бот.' },
        { target: nav('reminders'), title: 'Задачи', text: 'Всё, что ждёт твоего действия. Открой.', advance: 'click' },
        { target: '#reminders-tabs', title: 'Доска задач', text: 'Задачи разложены по этапам заказа: что оплатить, что выкупить, кого перевести дальше. <b>Начинай день отсюда</b> — не нужно листать все заказы. Подробно — сценарий «Утро менеджера».' },
        { target: nav('orders'), title: 'Заказы', text: 'Все заказы и всё про новые выкупы. Открой.', advance: 'click' },
        { target: '#order-search', title: 'Поиск', text: 'Ищи по товару, клиенту или номеру заказа; ниже — сортировка. Поиск и место в списке сохраняются, когда возвращаешься из заказа.' },
        { target: '#new-cart-btn', title: '«Корзина»', text: 'Единственный вход для нового выкупа — и один заказ, и сразу несколько, и лот. Подробно — сценарий «Быстрый выкуп».' },
        { target: '#purchases-btn', title: '«Покупки»', text: 'Что и каким лотом куплено. Раньше были отдельные «Лоты» и «Корзины» — теперь всё здесь, с фильтром «только лоты».', optional: true },
        { target: '#collectives-btn', title: 'Коллективки', text: 'Общие отправки: собрать заказы в одну посылку и вести её статус — статус меняется сразу у всех заказов внутри.', optional: true },
        { target: '#select-mode-btn', title: 'Выбрать несколько', text: 'Массовые действия: в коллективку, статус доставки, статус заказа, «Повторить». Быстрее — <b>долгое нажатие на заказ</b>: выбор включится сам.', optional: true },
        { target: nav('catalog'), title: 'Каталог', text: 'Открой «Каталог».', advance: 'click' },
        { target: '.catalog-tabs', title: '4 вкладки каталога', text: '<b>Каталог</b> — позиции с фото и короткими названиями; товар в корзину берётся только отсюда. <b>Спрос</b> — что хотят клиенты по вишлистам (цифра — новые совпадения). <b>Порядок</b> — проверка, похожие названия, теги. <b>Справочники</b> — линейки и коллекции.' },
        { target: nav('payments'), title: 'Оплаты', text: 'Открой «Оплаты».', advance: 'click' },
        { target: '#payments-client-search', title: 'Оплаты клиента', text: 'Найди клиента — откроются его заказы, что оплачено и что осталось по этапам, и кнопка <b>«Занести оплату»</b>: деньги сразу за конкретный заказ и этап, с чеком.' },
        { target: '#tab-switcher', title: 'Заявки клиентов', text: '«Заявки клиентов» — клиент сам сообщил в приложении, что оплатил. Проверь поступление и подтверди — тогда деньги разнесутся по его заказам.', optional: true },
        { target: nav('more'), title: 'Ещё', text: 'Открой «Ещё».', advance: 'click', optional: true },
        { target: '.more-item[data-route="clients"]', title: 'Клиенты', text: 'Карточка клиента: все его заказы, вишлист, вопросы, «Добавить в вишлист». Здесь же — <b>«Обучение»</b>: весь курс и твои достижения.', optional: true },
        { target: '#header-help-btn', title: 'Помощь — на каждом экране', text: 'Эта кнопка есть везде: сценарии про текущий экран и <b>«💡 Неудобно / идея»</b>. Пиши туда всё, что мешает, — это уходит VASY.' }
      ]
    },

    'morning-tasks': {
      id: 'morning-tasks',
      title: 'Утро менеджера: «Задачи»',
      screens: ['reminders', 'orderEdit'],
      momentScreens: ['reminders'],
      steps: [
        { target: nav('reminders'), title: 'Открой «Задачи»', text: 'Рабочий день начинается здесь.', advance: 'click', skipIf: onScreen('reminders') },
        { target: '#reminders-tabs', title: 'Клиентские и личные', text: '«Клиентские» — заказы клиентов. «Личные» — твои собственные покупки: там нет оплат, только движение.' },
        { target: () => { const el = document.getElementById('stage-tabs'); return el && el.children.length ? el : null; }, title: 'Этапы', text: 'Просчёт → Выкуп → Логистика → Консолидация → Доставка в РФ → Выдача. Цифра — сколько задач на этапе.', optional: true },
        {
          target: '#reminders-list [data-order-card]', title: 'Карточка задачи', group: 'card', groupLeader: true, optional: true, wait: 12000,
          missingIf: () => { const empty = document.getElementById('empty-message'); return !!empty && !empty.classList.contains('hidden'); },
          text: 'Один заказ — одна карточка. Красная точка — срочно, жёлтая — ждёт денег. Ниже — что именно нужно сделать.',
          skippedText: 'Сейчас задач нет 🎉 на этой вкладке (свои покупки — во вкладке «Личные»). Когда появятся — здесь будут карточки заказов, а «Следующий шаг» в заказе подскажет, что делать.'
        },
        {
          target: '#reminders-list [data-order-card] .snooze-btn', title: '«Отложить» — осторожно', optional: true, group: 'card',
          text: 'Только если правда ждёшь (например, ответа клиента). Задача вернётся через 3 дня — а клиент всё это время ждёт. Если ждать нечего, лучше сделать шаг сразу.'
        },
        { target: '#reminders-list [data-order-card] [data-open]', title: 'Открой заказ', text: 'Нажми на карточку — откроется заказ.', advance: 'click', optional: true, group: 'card', groupLeader: true },
        {
          target: '#order-next-step', title: '«Следующий шаг»', optional: true, group: 'card', groupLeader: true, wait: 12000,
          text: 'Система сама говорит, что сделать по этому заказу, а кнопка ведёт прямо к нужному полю. Не нужно листать всю карточку.'
        },
        { target: '.next-task-btn', title: 'Следующая задача', optional: true, group: 'card', text: 'Сделал — переходи к следующему заказу из очереди, не возвращаясь на доску.' },
        { target: '.copy-client-status-btn', title: 'Статус для клиента', optional: true, group: 'card', text: 'Копирует готовый текст для ответа клиенту: что с заказом и что сейчас к оплате.' },
        { target: '#back-btn', title: 'Назад — на то же место', optional: true, group: 'card', skipIf: () => Tour.currentScreen() !== 'orderEdit', text: 'Вернёшься на доску туда же, где был. Так и работай: <b>доска → заказ → следующий шаг → следующая задача</b>.' }
      ]
    },

    'quick-purchase': {
      id: 'quick-purchase',
      title: 'Быстрый выкуп по скриншоту',
      screens: ['orders', 'cartNew'],
      momentScreens: ['cartNew'],
      // Учебный режим: корзину не создаём — ничего не запишется.
      block: ['#save-cart-btn'],
      onComplete: () => navigateTo('training'),
      steps: [
        { target: nav('orders'), title: 'Открой «Заказы»', text: 'Новый выкуп начинается здесь.', advance: 'click', skipIf: onScreen('orders', 'cartNew') },
        { target: '#new-cart-btn', title: '«Корзина»', text: 'Нажми — откроется форма нового выкупа.', advance: 'click', skipIf: onScreen('cartNew') },
        {
          target: '#checkout-shot-card', title: 'Сначала — скриншот',
          text: 'Сделай скриншот страницы оформления, где видно товары и итог, и нажми «Выбрать» (или вставь из буфера). ИИ распознает его за 10–35 секунд — форму можно заполнять дальше.<br><br>Для тренировки возьмём учебный скриншот.',
          actions: [{ label: 'Взять учебный скриншот', run: useTrainingCheckout }],
          advance: { until: () => !!document.querySelector('[data-shot="apply"]') }
        },
        { target: '#checkout-shot-body', title: 'Что увидел ИИ', text: 'Товары, совпадение с каталогом (зелёная галочка) и сверка сумм. Это только подсказка: в форму ничего не попадёт, пока ты сам не нажмёшь.' },
        { target: '[data-shot="apply"]', title: 'Подставить', text: 'Заполнятся только пустые поля — то, что ты уже ввёл руками, не тронется.', advance: 'click' },
        { target: firstCartCard, title: 'Проверь заявку', text: 'Товар взят из каталога, а сумма — <b>итог по чеку</b> (с доставкой и налогом), не цена куклы. Именно эту сумму заплатили.', free: true },
        {
          target: () => { const sel = document.querySelector('select[data-dict="purchaseChannel"]'); return sel ? sel.closest('.bg-white') : null; },
          title: 'Сверь и дозаполни', free: true,
          text: 'ИИ видит только то, что есть на скриншоте. <b>Сверь каждую позицию со скриншотом</b> и заполни то, чего на нём нет: канал выкупа, аккаунт, карго, дату. Сомневаешься — лучше спроси, чем угадывать.'
        },
        { target: `${firstCartCard} .client-search`, title: 'Клиент', text: 'Для тренировки — учебный клиент: начни вводить <b>vaskaofv</b> и выбери из списка. Потом «Далее».', free: true, scroll: true, place: 'away' },
        { target: '#cart-payments-list', title: 'Сколько уже оплатили', text: 'В конце — выбрать обязательно: <b>Ничего / Часть / Всё</b>. Это деньги, которые клиент уже перевёл.', optional: true, free: true },
        { target: '#save-cart-btn', title: 'Сохранить', text: 'В работе здесь — «Сохранить»: покажется сводка, проверишь и подтвердишь. Сейчас учебный режим — <b>не сохраняем</b>, ничего не запишется.' }
      ]
    },

    // Этап 4: коллективка — общая отправка. Учимся на настоящих экранах, но
    // ничего не записываем: выбор коллективки в списке, «Создать», статусы,
    // «Убрать/Перенести», доли и сверка логистики — заблокированы.
    'collective': {
      id: 'collective',
      title: 'Коллективка: собрать и отправить',
      screens: ['orders', 'collectives', 'collectiveDetail'],
      momentScreens: ['collectives', 'collectiveDetail'],
      block: [
        '#collective-picker-list > *', '#collective-picker-create-save', '#bulk-create-collective-btn', '#bulk-delete-btn',
        '#delivery-status-apply-btn', '#delivery-status-force-btn', '#create-collective-save',
        '#detail-save-btn', '#logistics-save-btn', '#apply-costs-btn', '#apply-costs-confirm', '#detail-delete-btn',
        '#bulk-unassign-btn', '#bulk-transfer-btn', '#bulk-continue-rf-btn', '.unassign-order-btn', '.units-slider',
        '#detail-order-dropdown > *'
      ],
      steps: [
        { target: nav('orders'), title: 'Открой «Заказы»', text: 'Отправку собирают из заказов.', advance: 'click', skipIf: onScreen('orders') },
        {
          title: 'Что такое коллективка',
          text: 'Несколько заказов, которые едут <b>одной посылкой</b>. Два этапа: <b>КЗ→РФ</b> — из Казахстана в Россию (СДЭК) и <b>По РФ</b> — по России до клиентов. Статус меняешь <b>один раз у коллективки</b> — и он меняется у всех заказов внутри. Расход на доставку делится между заказами.'
        },
        { target: '#select-mode-btn', title: 'Выбрать несколько', text: 'Нажми «Выбрать». Быстрее — долгое нажатие на заказ: выбор включится сам.', advance: 'click' },
        {
          target: '#orders-list > div', title: 'Отметь заказы', free: true, scroll: false,
          text: 'Отметь 1–2 заказа, которые едут вместе, — нажатием на карточку.',
          advance: { until: () => { const c = document.getElementById('bulk-selected-count'); return !!c && Number(c.textContent) > 0; } }
        },
        {
          target: '#bulk-assign-btn', title: '«В коллективку»',
          text: '<b>«В коллективку»</b> — добавить в уже существующую. <b>«Создать коллективку»</b> — новая из выбранных. Нажми «В коллективку» — посмотрим список (сейчас ничего не запишется).',
          advance: 'click'
        },
        {
          target: '#collective-picker-modal .bg-white', title: 'Выбор коллективки', optional: true,
          text: 'Сверху поиск, ниже — коллективки с числом заказов. «+ Создать новую» — если нужной ещё нет. В работе выбираешь — система спросит подтверждение. Сейчас просто закрой окно крестиком.',
          advance: { until: () => { const m = document.getElementById('collective-picker-modal'); return !m || m.classList.contains('hidden'); } }
        },
        {
          target: '#bulk-status-btn', title: '«Статус доставки»',
          text: 'Один статус сразу всем выбранным заказам — когда они едут не в коллективке. Если по заказу не хватает оплаты или данных — система покажет, у кого, и попросит подтвердить отдельно.'
        },
        { target: '#bulk-cancel-btn', title: 'Выйти из выбора', text: 'Нажми «Отменить» — выбор снимется.', advance: 'click' },
        { target: '#collectives-btn', title: 'Все коллективки', text: 'Открой «Коллективки».', advance: 'click' },
        {
          target: '#stage-filter-tabs', title: 'Этапы',
          text: '<b>КЗ→РФ</b> — посылки из Казахстана, <b>По РФ</b> — отправки по России. Заказ проходит оба: в коллективке КЗ→РФ выбираешь заказы → «Продолжить как «По РФ»» — второе плечо, первое остаётся.'
        },
        {
          target: '#add-collective-btn', title: 'Новая коллективка', optional: true,
          text: 'Здесь создаётся новая: название (например, «СДЭК 12.10»), трек-номер, этап. Сейчас не создаём.'
        },
        {
          target: '#collective-list > div', title: 'Открой коллективку', advance: 'click', optional: true, group: 'detail', groupLeader: true,
          text: 'Карточка: название, этап, статус, сколько заказов. Нажми на любую — посмотрим, что внутри.',
          skippedText: 'Коллективок пока нет. Когда появятся — здесь будет список; внутри каждой статус, заказы и расходы.'
        },
        {
          target: '#detail-status', title: 'Статус коллективки', group: 'detail', optional: true, wait: 10000,
          text: 'Главное поле. Посылка двинулась — меняешь статус здесь и «Сохранить». Откроется окно «статус доставки для всех N заказов» — проверь и «Применить». У кого не хватает оплаты или данных — список отдельно: решай по каждому.'
        },
        {
          target: '#summary-paid-count', title: 'Кто оплатил плечо', group: 'detail', optional: true,
          text: '«Оплатили плечо» — сколько заказов уже оплатили эту доставку. Не все — напомни клиентам до выдачи.'
        },
        {
          target: '#detail-order-search', title: 'Добавить заказ', group: 'detail', optional: true,
          text: 'Забыли заказ — найди здесь по номеру, товару или клиенту. Убрать — крестик на карточке заказа или «Выбрать» → «Убрать из коллективки» / «Перенести в другую».'
        },
        {
          target: '#order-list .units-slider', title: 'Доля в расходах', group: 'detail', optional: true,
          text: 'Сколько доставки «несёт» заказ: <b>1</b> — обычный, <b>2</b> — вдвое тяжелее (большая коробка), <b>0</b> — не участвует. По долям делится реальный расход СДЭК/такси.'
        },
        {
          target: '#cost-fields-grid', title: 'Факт. расход', group: 'detail', optional: true,
          text: 'Пришёл чек СДЭК или такси — сумма сюда и «Сохранить сверку». <b>«Применить расход в заказы»</b> меняет клиентам сумму к оплате за доставку — не уверен(а), спроси VASY.'
        },
        {
          title: 'Проверка',
          text: 'Посылка СДЭК с 6 заказами уехала из Казахстана. Как отметить?',
          quiz: { options: [
            { label: 'Сменить статус у коллективки → «Сохранить» → «Применить»', correct: true, explain: 'Один раз — и у всех 6 заказов статус доставки поменяется. Клиенты получат уведомление, если оно включено.' },
            { label: 'Открыть каждый заказ и поменять статус', explain: 'Долго, и легко пропустить один — тогда появится задача «Отстал от коллективки». Меняй у коллективки.' },
            { label: 'Ничего, статус обновится сам', explain: 'Сам не обновится — статус коллективки меняешь ты, когда посылка двинулась.' }
          ] }
        }
      ]
    },

    // Этап 4 (04.10.2026): деньги — самое рискованное, поэтому подробно и с
    // вопросами-проверками в конце. Ничего не записывается: «Занести»,
    // «Взять из остатка», «Одобрить/Отклонить» заявки, отправка напоминания,
    // правка/удаление оплат — заблокированы.
    'pay-in': {
      id: 'pay-in',
      title: 'Занести оплату',
      screens: ['payments'],
      momentScreens: ['payments'],
      block: [
        '#rp-save', '#em-save', '#rm-send', '#rf-save', '#ac-save', '.approve-claim-btn', '.reject-claim-btn',
        '[data-action="edit-payment"]', '[data-action="cancel-payment"]', '[data-action="cancel-earmark"]',
        '#release-credit-btn', '#open-refund-btn'
      ],
      steps: [
        { target: nav('payments'), title: 'Открой «Оплаты»', text: 'Все деньги клиентов — здесь.', advance: 'click', skipIf: onScreen('payments') },
        {
          target: '#tab-switcher', title: 'Три вкладки',
          text: '<b>Кто должен</b> — все, кому сейчас пора платить. <b>Клиент</b> — работа с одним клиентом: его заказы, оплаты, «Занести оплату». <b>Заявки</b> — клиент сам написал в приложении «я оплатил», ждёт проверки.'
        },
        {
          target: '#due-list [data-due-client]', title: 'Кто должен', optional: true, wait: 8000,
          missingIf: () => { const l = document.getElementById('due-list'); return !!l && /никто ничего не должен/i.test(l.textContent); },
          text: 'Карточка клиента: сколько к оплате <b>сейчас</b> и за что. Сумма — только этапы, которые по статусу заказа уже пора оплачивать, минус свободный остаток клиента. «Занести оплату» откроет того же клиента сразу с окном оплаты.',
          skippedText: 'Сейчас никто ничего не должен 🎉 Когда появятся долги — здесь будет список: кто, сколько и за что.'
        },
        {
          target: '#tab-switcher [data-tab="client"]', title: 'Вкладка «Клиент»', text: 'Работаем с одним клиентом. Открой.', advance: 'click',
          skipIf: () => { const t = document.getElementById('client-tab'); return !!t && !t.classList.contains('hidden'); }
        },
        {
          target: '#client-search-card', title: 'Найди клиента', free: true, place: 'away',
          text: 'Для тренировки — учебный клиент: начни вводить <b>vaskaofv</b> и выбери его из списка. В работе — ищи по нику или имени из перевода.',
          advance: { until: () => !!document.getElementById('open-record-payment-btn') }
        },
        {
          target: '[data-tour="pay-due"]', title: '«Сейчас к оплате»',
          text: 'Главное число. Это этапы заказов, которые <b>по статусу уже пора оплачивать</b>, за вычетом свободного остатка клиента. Ниже — за что именно: этап и номер заказа. Если зелёное «платить нечего» — клиент ничего не должен прямо сейчас.'
        },
        {
          target: '[data-tour="pay-tiles"]', title: 'Итоги клиента', optional: true,
          text: '«Осталось по всем заказам» — сколько клиент заплатит до конца, но не всё уже пора. <b>«Долг по полученным»</b> красный — заказ уже у клиента, а деньги не дошли: такой долг сам не закроется, его надо собрать.'
        },
        { target: '#open-record-payment-btn', title: 'Клиент перевёл деньги', text: 'Деньги пришли на счёт → «Занести оплату». Нажми.', advance: 'click' },
        {
          target: '#rp-amount', title: 'Сколько пришло', free: true,
          text: 'Сумма, которая <b>реально пришла в банк</b> — смотри в банке, не в переписке. Одна запись = один перевод. Кнопка «Подставить…» под полем вставит сумму к оплате. Для тренировки впиши, например, <b>1000</b>.'
        },
        {
          target: '#rp-alloc-section', title: 'За что эти деньги', free: true,
          text: 'Система сама предложила этапы <b>одного</b> заказа (старый — первым) и разложила сумму. На другие заказы деньги сами не уходят: нужно — «+ ещё заказ или этап». Не разнесённое останется у клиента свободным остатком — это видно строкой ниже.'
        },
        {
          target: '#rp-receipt-row', title: 'Скриншот чека', optional: true,
          text: 'Прикрепляй всегда, когда есть. Будет вопрос «а точно платил?» — чек найдётся прямо у платежа.'
        },
        {
          target: '#rp-notify-row', title: 'Сообщить клиенту', optional: true,
          text: 'С галочкой клиенту в Telegram уйдёт «получили оплату». Снимай, только если писать ему не нужно.'
        },
        { target: '#rp-save', title: '«Занести»', text: 'В работе — «Занести»: платёж и разнесение по этапам запишутся одной записью. Сейчас учебный режим — <b>не сохраняем</b>.' },
        { target: '#rp-cancel', title: 'Закрой окно', text: 'Нажми «Отмена».', advance: 'click' },
        {
          target: '[data-action="record-for-stage"], [data-action="open-earmark"]', title: 'Кнопки на этапе заказа', optional: true,
          text: 'Ниже — заказы клиента по этапам. <b>«Оплата»</b> — пришли НОВЫЕ деньги именно за этот этап. <b>«Из остатка»</b> — новых денег нет, но у клиента уже лежат свободные (переплатил раньше): берём оттуда.'
        },
        {
          title: '«Оплата» или «Из остатка»?',
          text: 'Правило одно: <b>пришли деньги в банк — «Занести оплату»</b> (или «Оплата» на этапе). <b>«Из остатка»</b> — только перенос денег, которые уже лежат у клиента, без нового перевода; кнопка появляется, когда свободный остаток есть. Перепутать — значит записать деньги, которых не было, или «потерять» пришедшие.'
        },
        {
          target: '[data-tour="pay-balance"]', title: 'Баланс и кредит', optional: true,
          text: 'Свободный остаток, кредит и все внесённые платежи — здесь. <b>Исправить или удалить уже внесённую оплату, вернуть деньги, кредит — делает VASY.</b> Ошибся — не исправляй сам, напиши ему или спроси помощника 🤖.'
        },
        { target: '#tab-switcher [data-tab="claims"]', title: 'Заявки клиентов', text: 'Открой «Заявки».', advance: 'click' },
        {
          target: '#claims-list > *', title: 'Клиент написал «я оплатил»', optional: true,
          text: 'Сначала проверь банк: деньги правда пришли — «Одобрить», они запишутся клиенту и разнесутся по его заказам. Не пришли — «Отклонить» и напиши причину: клиенту в Telegram придёт «заявка отклонена» с твоим комментарием.',
          skippedText: 'Сейчас заявок нет. Когда клиент нажмёт в приложении «Я оплатил», заявка появится здесь: сначала проверь банк, потом «Одобрить» — деньги разнесутся сами. Не пришли — «Отклонить» с причиной.'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиент одним переводом прислал <b>5 000 ₽ за два заказа</b>. Что делаешь?',
          quiz: { options: [
            { label: 'Одна «Занести оплату» на 5 000 ₽, в «За что» — оба заказа', correct: true, explain: 'Один перевод — одна запись, как в банке. По двум заказам раскладываешь строками «За что» (+ ещё заказ или этап).' },
            { label: 'Две оплаты по 2 500 ₽', explain: 'В банке был один перевод — и запись должна быть одна, иначе потом не сверить с банком.' },
            { label: '«Из остатка» на каждый заказ', explain: '«Из остатка» — только для денег, которые уже лежат у клиента. Новые деньги — всегда «Занести оплату».' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Ты занёс(ла) оплату <b>1 500 ₽</b>, а в банке потом увидел(а), что пришло <b>1 050 ₽</b>. Что делаешь?',
          quiz: { options: [
            { label: 'Удалю оплату и занесу заново', explain: 'Исправить или удалить уже внесённую оплату может только VASY — за ней уже могли разнестись этапы и уйти сообщение клиенту.' },
            { label: 'Занесу ещё одну оплату, чтобы сошлось', explain: 'Лишняя запись только запутает: в банке её нет. Исправляет VASY.' },
            { label: 'Напишу VASY (или помощнику 🤖): какая оплата и сколько пришло на самом деле', correct: true, explain: 'Ошибки во внесённых деньгах исправляет VASY. Твоя задача — заметить и сразу сказать.' }
          ] }
        },
        { target: '#header-help-btn', title: 'Сомневаешься — спроси', text: 'С деньгами лучше спросить, чем угадать: помощник 🤖 и VASY — в «Помощи». Готово!' }
      ]
    },

    // Этап 4, С4: что делать с задачей, которую сейчас не сделать. Ничего не
    // записывается: «Отложить», «Пропустить», «Отменить» пропуск, кнопки
    // «Следующего шага», галочка «Товар выкупил сам клиент» и «Сохранить»
    // заказа — заблокированы. Пропуск есть только у «Не заполнено: канал/
    // аккаунт/карго/валюта» (сервер, DISMISSIBLE_KINDS), отложить — только
    // пункты про оплату и сроки (SNOOZABLE_KINDS): тексты — ровно про это.
    'reminders-skip': {
      id: 'reminders-skip',
      title: 'Пропустить с причиной или отложить',
      screens: ['reminders', 'orderEdit'],
      momentScreens: ['reminders'],
      block: [
        '.snooze-btn', '.dismiss-item-btn', '.undismiss-btn', '#order-next-step button',
        '#client-self-purchased-checkbox', '#save-order-btn', '#save-order-sticky-btn'
      ],
      steps: [
        { target: nav('reminders'), title: 'Открой «Задачи»', text: 'Разберём, что делать с задачей, которую прямо сейчас не сделать.', advance: 'click', skipIf: onScreen('reminders') },
        {
          title: 'Три выхода',
          text: 'У каждой задачи три выхода:<br>1) <b>Сделать</b> — лучший, задача уйдёт сама.<br>2) <b>Отложить</b> — ты ждёшь понятного события: клиент обещал оплатить в пятницу.<br>3) <b>Пропустить с причиной</b> — сделать уже невозможно: старый заказ, данных не восстановить.<br>Листать мимо — не выход: задача краснеет и прячет за собой новые.'
        },
        {
          target: () => firstShown('#reminders-list [data-order-card] .snooze-btn'), title: '«Отложить на 3 дня»', optional: true, wait: 12000,
          missingIf: () => boardReady() && !firstShown('#reminders-list .snooze-btn'),
          text: 'Есть только у задач про оплату и сроки. Эти пункты заказа пропадут с доски на 3 дня и вернутся сами. Откладывай, когда <b>знаешь, чего ждёшь</b>. Ждать нечего — «Напомнить» клиенту или «Занести оплату», если деньги уже пришли.',
          skippedText: 'Сейчас на доске нечего откладывать. Кнопка «Отложить на 3 дня» появляется у задач про оплату и сроки: эти пункты пропадут на 3 дня и вернутся сами. Откладывай, только когда знаешь, чего ждёшь.'
        },
        {
          target: () => { const b = firstShown('#reminders-list .dismiss-item-btn'); return b ? b.closest('[data-items] > div') : null; },
          title: '«Пропустить (данные утеряны)»', optional: true, wait: 12000,
          missingIf: () => boardReady() && !firstShown('#reminders-list .dismiss-item-btn'),
          text: 'Есть только у пункта «Не заполнено: канал, аккаунт, карго, валюта». Сначала попробуй заполнить в заказе. Заказ старый и данных уже не вспомнить — «Пропустить» и напиши <b>причину</b>: её видят VASY и все, кто откроет заказ. Данные нашлись — пропуск отменяется в карточке заказа.',
          skippedText: 'Сейчас пропускать нечего. Кнопка «Пропустить (данные утеряны)» бывает у пункта «Не заполнено: канал, аккаунт…» — для старых заказов, где этого уже не вспомнить. Причина обязательна, отменить пропуск можно в карточке заказа.'
        },
        {
          title: 'Что пропустить нельзя',
          text: 'У долга, оплаты, списания, «Отстал от коллективки» и «Клиент отметил получение» кнопки «Пропустить» нет — <b>это деньги и посылки</b>. Их делают: «Занести оплату», «Напомнить», «Перевести». Кажется, что задача неверная, — «?» → «🆘 Что-то не работает», VASY разберётся.'
        },
        {
          target: () => firstShown('#reminders-list [data-order-card] [data-open]'), title: 'Открой любой заказ', advance: 'click',
          optional: true, group: 'order', groupLeader: true, wait: 12000, missingIf: boardEmpty,
          text: 'Посмотрим то же самое в карточке заказа. Нажми на карточку.',
          skippedText: 'Задач нет — карточку заказа посмотрим в другой раз. В заказе «Следующий шаг» показывает те же кнопки, а пропущенное — серой плашкой «Пропущено» с причиной и кнопкой «Отменить».'
        },
        {
          target: '#order-next-step', title: '«Следующий шаг»', optional: true, group: 'order', groupLeader: true, wait: 12000,
          text: 'Здесь те же решения, что на доске: «Заполнить» или «Пропустить (данные утеряны)». Пропущенное видно сверху серой плашкой «Пропущено: …» с причиной — там же «Отменить», если данные нашлись.'
        },
        {
          target: 'section[data-block="client"] [data-block-toggle]', title: 'Блок «Клиент»', advance: 'click', optional: true, group: 'order',
          skipIf: () => { const b = document.querySelector('section[data-block="client"] .order-block-body'); return !!b && !b.classList.contains('hidden'); },
          text: 'Открой блок «Клиент» — там ещё один частый случай.'
        },
        {
          target: () => { const c = document.getElementById('client-self-purchased-checkbox'); return c ? c.closest('label') : null; },
          title: '«Товар выкупил сам клиент»', optional: true, group: 'order',
          text: 'Пункт «Курсы и сумма не подтверждены» не пропускается. Но бывает, что клиент <b>сам купил</b> куклу, а мы только везём, — курса выкупа у нас просто нет. Тогда ставь эту галочку и «Сохранить»: пункт уйдёт. Комиссию в таком заказе вводи суммой. Сейчас ничего не меняем.'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиент написал: «оплачу в пятницу». Сегодня вторник. Что делаешь с задачей «ждёт оплаты»?',
          quiz: { options: [
            { label: 'Пропущу с причиной «оплатит в пятницу»', explain: 'У оплаты пропуска нет: долг не исчезает оттого, что его не видно.' },
            { label: 'Отложу на 3 дня', correct: true, explain: 'Ждёшь понятного события — откладывай. В пятницу задача вернётся сама; оплаты нет — «Напомнить».' },
            { label: 'Ничего, пусть висит', explain: 'Будет краснеть и прятать новые задачи. Ждёшь — отложи.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Заказ прошлого года: «Не заполнено: аккаунт». С какого аккаунта выкупали, никто не помнит. Что делаешь?',
          quiz: { options: [
            { label: 'Выберу любой аккаунт, чтобы задача ушла', explain: 'Неверные данные хуже пустых: испортят отчёты по аккаунтам, и ошибку потом не найти.' },
            { label: 'Отложу на 3 дня', explain: 'Здесь «Отложить» нет — откладываются только оплата и сроки. И через 3 дня никто не вспомнит.' },
            { label: '«Пропустить (данные утеряны)» с причиной «старый заказ, аккаунт не восстановить»', correct: true, explain: 'Причина видна всем, а если данные найдутся — пропуск отменяется в заказе.' }
          ] }
        },
        { target: '#header-help-btn', title: 'Сомневаешься — спроси', text: 'Не уверен(а), можно ли пропустить, — спроси помощника 🤖 в «Помощи». Готово!' }
      ]
    },

    // Этап 4, С4: вопросы клиентов и вишлист за клиента. Ничего не
    // записывается: «Отправить ответ», «Закрыть без ответа», «Добавить» в
    // вишлист, распознавание ссылки (внешний запрос) и «Оформить заказ» из
    // «Спроса» — заблокированы.
    'questions-wishlist': {
      id: 'questions-wishlist',
      title: 'Вопросы клиентов и вишлист',
      screens: ['home', 'wishlistDemand', 'clients'],
      momentScreens: ['home', 'wishlistDemand'],
      block: [
        '.save-answer-btn', '.close-question-btn', '#manual-wishlist-save', '#manual-wishlist-resolve-btn',
        '#manual-wishlist-use-manual-client', '.order-from-demand-btn', '.ordered-chip'
      ],
      steps: [
        { target: nav('home'), title: 'Открой «Главную»', text: 'Вопросы клиентов — здесь.', advance: 'click', skipIf: onScreen('home') },
        {
          target: '#tab-switcher [data-tab="questions"]', title: 'Вопросы', advance: 'click',
          skipIf: () => { const t = document.getElementById('questions-tab'); return !!t && !t.classList.contains('hidden'); },
          text: 'Вопросы клиентов из бота и приложения. Цифра — новые, без ответа: на них — в первую очередь. Открой.'
        },
        {
          target: questionCard, title: 'Вопрос клиента', optional: true, group: 'question', groupLeader: true, wait: 10000,
          missingIf: () => { const e = document.getElementById('questions-empty-message'); return !!e && !e.classList.contains('hidden'); },
          text: 'Сверху — товар и номер заказа (нажатие откроет заказ), имя клиента и «написать» — его чат в Telegram. Жёлтая карточка — новый вопрос, без ответа.',
          skippedText: 'Сейчас вопросов нет 🎉 Когда клиент спросит в боте или в приложении, здесь появится карточка: товар, заказ, вопрос и поле для ответа. Ответ уходит клиенту в бот. Случайное сообщение («ок», стикер) — «Закрыть без ответа»: клиенту ничего не придёт.'
        },
        {
          target: () => { const c = questionCard(); return c ? c.querySelector('.answer-input') : null; },
          title: 'Ответ', optional: true, group: 'question', free: true,
          text: 'Пиши как в чат: что с заказом и когда ждать. «Отправить ответ» — и он уйдёт клиенту в бот. Не знаешь ответа — открой заказ или спроси VASY, но не оставляй вопрос на день. Можешь попробовать написать — сейчас не отправится.'
        },
        {
          target: () => { const c = questionCard(); return c ? c.querySelector('.close-question-btn') : null; },
          title: '«Закрыть без ответа»', optional: true, group: 'question',
          text: 'Только для случайных сообщений боту: стикер, «ок», «спасибо», нажал не туда. Клиенту ничего не придёт, вопрос уйдёт из новых. Настоящий вопрос так не закрывай.'
        },
        { target: nav('catalog'), title: 'Открой «Каталог»', text: 'Вишлисты клиентов — в каталоге, вкладка «Спрос».', advance: 'click', skipIf: onScreen('catalog', 'wishlistDemand') },
        { target: '[data-catalog-tab="demand"]', title: '«Спрос»', text: 'Что хотят клиенты по своим вишлистам. Открой.', advance: 'click', skipIf: onScreen('wishlistDemand') },
        {
          target: () => { const t = firstShown('#demand-list [data-toggle]'); return t ? t.parentElement : null; },
          title: 'Кто что хочет', optional: true, wait: 10000,
          missingIf: () => { const e = document.getElementById('demand-empty'); return !!e && !e.classList.contains('hidden'); },
          text: 'Кукла и «Хотят: N» — сколько клиентов её ждут. Нажатие на карточку раскроет список клиентов, у каждого — «Оформить заказ»: корзина откроется уже с клиентом и куклой. Нашли куклу — смотри сюда первым делом.',
          skippedText: 'Сейчас желаний нет. Когда клиенты добавят кукол в вишлист, здесь будет «кто что хочет»: кукла, сколько клиентов её ждут и «Оформить заказ» для каждого.'
        },
        {
          target: '#add-manual-wishlist-btn', title: 'Добавить за клиента', advance: 'click',
          text: 'Клиент написал в личку «если найдёте Лагуну — хочу»? Не записывай себе — добавь в <b>его вишлист</b>: тогда это видно в «Спросе», а клиент видит куклу у себя в «Моих куклах». Нажми «+».'
        },
        {
          target: '#manual-wishlist-client-search', title: 'Клиент', free: true, place: 'away',
          text: 'Для тренировки — учебный клиент: начни вводить <b>vaskaofv</b> и выбери из списка. Потом «Далее».'
        },
        {
          target: () => { const i = document.getElementById('manual-wishlist-catalog-search'); return i ? i.closest('div') : null; },
          title: 'Какая кукла', free: true, place: 'away',
          text: 'Лучше всего — <b>из каталога</b>: начни вводить название. Тогда у клиента сразу фото, а в «Спросе» желания разных клиентов складываются в одну карточку. Нет в каталоге — вставь ссылку выше («Распознать» подтянет название и фото) или впиши название вручную.'
        },
        { target: '#manual-wishlist-save', title: '«Добавить»', text: 'В работе — «Добавить»: кукла появится в вишлисте клиента. Сейчас учебный режим — <b>не сохраняем</b>.' },
        { target: '#manual-wishlist-cancel', title: 'Закрой окно', text: 'Нажми «Отмена».', advance: 'click' },
        {
          title: 'Из карточки клиента',
          text: 'То же самое — в «Ещё» → «Клиенты» → клиент → «Добавить в вишлист»: клиент подставится сам. Там же все его вопросы и что уже лежит в вишлисте.'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиент ответил боту «👍» на сообщение о посылке — в «Вопросах» новый вопрос. Что делаешь?',
          quiz: { options: [
            { label: 'Отвечу «Хорошо!»', explain: 'Клиенту уйдёт лишнее сообщение. Для таких — «Закрыть без ответа».' },
            { label: 'Оставлю как есть', explain: 'Он будет висеть новым и прятать настоящие вопросы.' },
            { label: '«Закрыть без ответа»', correct: true, explain: 'Клиенту ничего не придёт, а в «Вопросах» останутся только настоящие.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Клиентка пишет в личку: «Если появится Дракулаура Skulltimate — возьму». Что делаешь?',
          quiz: { options: [
            { label: 'Добавлю куклу в её вишлист', correct: true, explain: 'Желание видно в «Спросе» всем, и клиентка сама видит его в «Моих куклах». Найдётся кукла — о ней не забудут.' },
            { label: 'Запишу себе в заметки', explain: 'Заметку видишь только ты, в «Спросе» её нет — когда кукла найдётся, о клиентке могут не вспомнить.' },
            { label: 'Сразу оформлю корзину', explain: 'Корзина — когда куклу нашли и выкупили. Пока клиентка только хочет — вишлист.' }
          ] }
        }
      ]
    }
  };
})();
