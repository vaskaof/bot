'use strict';

/**
 * Сценарии обучения менеджеров (этап 1, 04.10.2026) — шаги для `_tour.js`.
 * id и названия совпадают с server/src/training/trainingCatalog.js (там же
 * список всего курса, значки и уровни). Тексты — коротко, на «ты», про то,
 * ЗАЧЕМ кнопка, а не только где она.
 *
 * Учебный пример (отзыв VASY 04.10: «уроки не должны искать кейс, а
 * предоставлять его наглядно»): на время урока экраны показывают учебный
 * мир из `_training-sandbox.js` — клиентки Аня, Оля, Катя, Маша, заказы
 * № TRN101–TRN108, коллективка «СДЭК 12.10 (учебная)». Поэтому шаги
 * опираются на конкретные карточки (`[data-order-card="TRN101"]`) и тексты
 * рассказывают историю этих клиенток: что случилось и что делаешь.
 * Записать что-то нельзя дважды: кнопки в `block` сценария, а песочница
 * отклоняет любую запись до сервера.
 *
 * Шаг: { target, title?, text, advance: 'next'|'click'|{until}, optional?,
 * group?, groupLeader?, skipIf?, missingIf?, wait?, free?, actions?, skippedText?,
 * quiz?, onEnter?, allowClick? } — подробности в JSDoc `_tour.js`. Шаг без
 * target — объяснение по центру.
 *
 * Этап 4: `momentScreens` — экраны, где делают то же самое по-настоящему:
 * туда один раз всплывает «здесь есть урок» (_training-ui.js).
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

  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
  };

  // --- Учебный пример: конкретные карточки ---
  const boardCard = (id) => `#reminders-list [data-order-card="${id}"]`;
  /**
   * На телефоне колонки доски лежат лентой — карточка нужной клиентки может
   * быть в соседней колонке за краем. Докручиваем ленту к ней (заодно видно,
   * что этапы — это колонки).
   */
  const revealBoardCard = (id) => () => {
    const card = Array.from(document.querySelectorAll(boardCard(id))).find((el) => el.getClientRects().length > 0);
    if (card && !shown(card)) card.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  const byText = (sel, text) => () => Array.from(document.querySelectorAll(sel)).find((el) => shown(el) && el.textContent.includes(text)) || null;
  const orderListCard = (id) => byText('#orders-list > div', `№ ${id}`);
  const questionCardWith = (text) => () => {
    const card = Array.from(document.querySelectorAll('#questions-list > div')).find((el) => el.textContent.includes(text));
    return card && shown(card) ? card : null;
  };
  const bulkCount = () => { const c = document.getElementById('bulk-selected-count'); return c ? Number(c.textContent) : 0; };

  // Кнопки, которые в уроках про заказы ничего не должны делать.
  const ORDER_WRITES = [
    '.snooze-btn', '.dismiss-item-btn', '.undismiss-btn', '#reminders-list [data-actions] button', '.claim-approve-btn', '.claim-reject-btn',
    '#order-next-step button', '#client-self-purchased-checkbox', '#save-order-btn', '#save-order-sticky-btn'
  ];

  /** Окно помощника (_assistant.js) — его карточка, без затемнения вокруг. */
  const assistantSheet = () => { const s = document.getElementById('training-assistant-sheet'); return s && !s.classList.contains('hidden') ? s.firstElementChild : null; };

  // --- Лот в «Корзине» (_cart-lot.js): карточка лота и её строки ---
  const LOT = '#cart-items-list > div.border-l-indigo-400';
  const lotPart = (sel) => `${LOT} ${sel}`;
  /** Поле лота вместе с подписью. */
  const lotField = (sel) => () => { const i = document.querySelector(`${LOT} ${sel}`); return i ? i.closest('.mb-2') : null; };
  const lotRowPart = (n, sel) => `${LOT} .lot-positions-list > div:nth-child(${n}) ${sel}`;
  const lotRowClient = (n) => { const i = document.querySelector(lotRowPart(n, '.client-search')); return i ? i.value.toLowerCase() : ''; };
  const lotParseRows = () => {
    const box = document.querySelector(`${LOT} .lot-parse-confirm`);
    return box && !box.classList.contains('hidden') ? box.querySelectorAll('.lot-parse-rows > div').length : 0;
  };
  async function pasteLotLink() {
    const input = document.querySelector(`${LOT} .lot-purchase-link-input`);
    if (!input) throw new Error('Не вижу карточку лота — раскрой её.');
    input.value = window.TrainingSandbox.LOT_URL;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change')); // канал корзины подберётся по ссылке (eBay)
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
        { target: '#reminders-tabs', title: 'Доска задач', text: 'Задачи разложены по этапам заказа: что оплатить, что выкупить, кого перевести дальше. <b>Начинай день отсюда</b> — не нужно листать все заказы. Подробно — урок «Утро менеджера».' },
        { target: nav('orders'), title: 'Заказы', text: 'Все заказы и всё про новые выкупы. Открой.', advance: 'click' },
        { target: '#order-search', title: 'Поиск', text: 'Ищи по товару, клиенту или номеру заказа; ниже — сортировка. Поиск и место в списке сохраняются, когда возвращаешься из заказа.' },
        { target: '#new-cart-btn', title: '«Корзина»', text: 'Единственный вход для нового выкупа — и один заказ, и сразу несколько, и лот. Подробно — урок «Быстрый выкуп».' },
        { target: '#purchases-btn', title: '«Покупки»', text: 'Что и каким лотом куплено. Раньше были отдельные «Лоты» и «Корзины» — теперь всё здесь, с фильтром «только лоты».', optional: true },
        { target: '#collectives-btn', title: 'Коллективки', text: 'Общие отправки: собрать заказы в одну посылку и вести её статус — статус меняется сразу у всех заказов внутри.', optional: true },
        { target: '#select-mode-btn', title: 'Выбрать несколько', text: 'Массовые действия: в коллективку, статус доставки, статус заказа, «Повторить». Быстрее — <b>долгое нажатие на заказ</b>: выбор включится сам.', optional: true },
        { target: nav('catalog'), title: 'Каталог', text: 'Открой «Каталог».', advance: 'click' },
        { target: '.catalog-tabs', title: '4 вкладки каталога', text: '<b>Каталог</b> — позиции с фото и короткими названиями; товар в корзину берётся только отсюда. <b>Спрос</b> — что хотят клиенты по вишлистам. <b>Порядок</b> — проверка, похожие названия, теги. <b>Справочники</b> — линейки и коллекции.' },
        { target: nav('payments'), title: 'Оплаты', text: 'Открой «Оплаты».', advance: 'click' },
        { target: '#tab-switcher', title: 'Три вкладки', text: '<b>Кто должен</b> — кому сейчас пора платить. <b>Клиент</b> — его заказы, оплаты и «Занести оплату». <b>Заявки</b> — клиент сам написал «я оплатил».' },
        { target: nav('more'), title: 'Ещё', text: 'Открой «Ещё».', advance: 'click', optional: true },
        { target: '.more-item[data-route="clients"]', title: 'Клиенты', text: 'Карточка клиента: все его заказы, вишлист, вопросы, «Добавить в вишлист». Здесь же — <b>«Обучение»</b>: весь курс и твои достижения.', optional: true },
        { target: '#header-help-btn', title: 'Помощь — на каждом экране', text: 'Эта кнопка есть везде: уроки про текущий экран и <b>«💡 Неудобно / идея»</b>. Пиши туда всё, что мешает, — это уходит VASY.' }
      ]
    },

    'morning-tasks': {
      id: 'morning-tasks',
      title: 'Утро менеджера: «Задачи»',
      screens: ['reminders', 'orderEdit'],
      momentScreens: ['reminders'],
      block: ORDER_WRITES,
      steps: [
        { target: nav('reminders'), title: 'Открой «Задачи»', text: 'Рабочий день начинается здесь.', advance: 'click', skipIf: onScreen('reminders') },
        {
          title: 'Учебная доска',
          text: 'Сейчас на доске — <b>учебный пример</b>: 4 задачи по клиенткам Ане и Оле. Всё как в работе, только настоящие заказы не трогаем — смело нажимай.'
        },
        { target: '#reminders-tabs', title: 'Клиентские и личные', text: '«Клиентские» — заказы клиентов. «Личные» — твои собственные покупки: там нет оплат, только движение.' },
        {
          target: '#stage-tabs', title: 'Этапы заказа',
          text: 'Задачи разложены по этапам заказа: Выкуп → Логистика → Консолидация в КЗ → Доставка в РФ → Выдача. Цифра — сколько задач на этапе, пустые этапы не показываются. На телефоне этапы листаются свайпом.'
        },
        {
          target: boardCard('TRN104'), title: 'Самое срочное — сверху', onEnter: revealBoardCard('TRN104'),
          text: 'Карточки идут по срочности. Красная точка у пункта — срочно: у Оли по Фрэнки <b>«Курсы и сумма не подтверждены»</b>, ждёт 6 дней — поэтому карточка красная.'
        },
        {
          target: boardCard('TRN101'), title: 'Карточка Ани', onEnter: revealBoardCard('TRN101'),
          text: 'Лагуна Ани: <b>«Основная оплата: ждёт оплаты — осталось 3 000 ₽»</b>. Справа красным — сколько клиентка должна. Жёлтая точка — ждём денег.'
        },
        {
          target: `${boardCard('TRN101')} [data-actions]`, title: 'Кнопки на карточке',
          text: '<b>«Занести оплату»</b> — деньги пришли: откроются «Оплаты» сразу на этом заказе. <b>«Напомнить»</b> — денег нет: готовый текст клиентке. <b>«Отложить на 3 дня»</b> — только если правда ждёшь (Аня обещала оплатить в пятницу).'
        },
        { target: `${boardCard('TRN101')} [data-open]`, title: 'Открой заказ', text: 'Нажми на карточку Ани — откроется заказ.', advance: 'click', onEnter: revealBoardCard('TRN101') },
        {
          target: '#order-next-step', title: '«Следующий шаг»', wait: 12000,
          text: 'То же, что на доске: <b>«Ждёт оплаты — Основная — осталось 3 000 ₽»</b>, и кнопка «Записать оплату» ведёт прямо в «Оплаты». Листать всю карточку не нужно.'
        },
        { target: '.next-task-btn', title: 'Следующая задача', optional: true, text: 'Сделал — переходи к следующему заказу из очереди доски, не возвращаясь на неё.' },
        { target: '.copy-client-status-btn', title: 'Статус для клиента', optional: true, text: 'Копирует готовый текст для ответа: «Ваш заказ «Лагуна…», статус, к оплате 3 000 ₽». Вставь в чат с клиенткой.' },
        { target: '#back-btn', title: 'Назад — на то же место', text: 'Вернёшься на доску туда же, где был. Так и работай: <b>доска → заказ → следующий шаг → следующая задача</b>.' },
        {
          title: 'Проверка',
          text: 'Утро, на доске 12 задач. С чего начинаешь?',
          quiz: { options: [
            { label: 'С верхней карточки: доска уже сложила задачи по срочности', correct: true, explain: 'Сверху — красные и самые старые. Сделал — «Следующая задача», и так по очереди.' },
            { label: 'Открываю «Заказы» и листаю все подряд', explain: 'Долго, и легко пропустить то, что горит. Доска уже собрала всё, что ждёт тебя.' },
            { label: 'С тех, кто громче пишет в личку', explain: 'Тогда тихие клиенты ждут неделями. Порядок — по доске.' }
          ] }
        }
      ]
    },

    'quick-purchase': {
      id: 'quick-purchase',
      title: 'Быстрый выкуп по скриншоту',
      screens: ['orders', 'cartNew'],
      momentScreens: ['cartNew'],
      // Учебный режим: корзину не создаём — ничего не запишется.
      block: ['#save-cart-btn'],
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
        { target: `${firstCartCard} .client-search`, title: 'Клиент', text: 'Для тренировки — учебная клиентка: начни вводить <b>Аня</b> и выбери её из списка. Потом «Далее».', free: true, scroll: true, place: 'away' },
        { target: '#cart-payments-list', title: 'Сколько уже оплатили', text: 'В конце — выбрать обязательно: <b>Ничего / Часть / Всё</b>. Это деньги, которые клиент уже перевёл.', optional: true, free: true },
        { target: '#save-cart-btn', title: 'Сохранить', text: 'В работе здесь — «Сохранить»: покажется сводка, проверишь и подтвердишь. Сейчас учебный режим — <b>не сохраняем</b>, ничего не запишется.' }
      ]
    },

    // Коллективка — общая отправка. Учебный пример: Гулия Маши и Торалей Кати
    // ещё не в коллективке, а в «СДЭК 12.10 (учебная)» уже лежат Дракулаура
    // Ани (большая коробка, доля 2), Клодин Кати и Эбби Маши (плечо оплачено).
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
          text: 'Несколько заказов, которые едут <b>одной посылкой</b>. Два плеча: <b>КЗ→РФ</b> — из Казахстана в Россию (СДЭК) и <b>По РФ</b> — по России до клиентов. Статус меняешь <b>один раз у коллективки</b> — и он меняется у всех заказов внутри.'
        },
        { target: '#select-mode-btn', title: 'Выбрать несколько', text: 'На складе в Казахстане лежат Гулия Маши и Торалей Кати — соберём их в отправку. Нажми «Выбрать». Быстрее — долгое нажатие на заказ.', advance: 'click' },
        {
          target: orderListCard('TRN107'), title: 'Отметь заказы', free: true,
          text: 'Отметь <b>Гулию</b> (№ TRN107) нажатием на карточку. Можно и Торалей (№ TRN108) — она рядом.',
          advance: { until: () => bulkCount() > 0 }
        },
        {
          target: '#bulk-assign-btn', title: '«В коллективку»',
          text: '<b>«В коллективку»</b> — добавить в уже собранную. <b>«Создать коллективку»</b> — новая из выбранных. Нажми «В коллективку».',
          advance: 'click'
        },
        {
          target: '#collective-picker-modal .bg-white', title: 'Выбор коллективки',
          text: 'Сверху поиск, ниже — уже собранные: <b>«СДЭК 12.10 (учебная)»</b>, в ней 3 заказа. В работе выбираешь — система спросит подтверждение. Нужной нет — закрой и нажми «Создать коллективку». Сейчас закрой окно крестиком.',
          advance: { until: () => { const m = document.getElementById('collective-picker-modal'); return !m || m.classList.contains('hidden'); } }
        },
        {
          target: '#bulk-status-btn', title: '«Статус доставки»',
          text: 'Один статус сразу всем выбранным — когда заказы едут <b>не</b> в коллективке. Не хватает оплаты или данных — система покажет у кого и попросит подтвердить отдельно.'
        },
        { target: '#bulk-cancel-btn', title: 'Выйти из выбора', text: 'Нажми «Отменить» — выбор снимется.', advance: 'click' },
        { target: '#collectives-btn', title: 'Все коллективки', text: 'Открой «Коллективки».', advance: 'click' },
        {
          target: '#stage-filter-tabs', title: 'Два плеча',
          text: '<b>КЗ→РФ</b> — посылки из Казахстана, <b>По РФ</b> — отправки по России. Заказ проходит оба: в коллективке КЗ→РФ выбираешь заказы → «Продолжить как «По РФ»».'
        },
        { target: '#add-collective-btn', title: 'Новая коллективка', optional: true, text: 'Здесь создаётся новая: название («СДЭК 12.10»), трек-номер, плечо. Сейчас не создаём.' },
        {
          target: byText('#collective-list > div', 'СДЭК 12.10'), title: 'Открой «СДЭК 12.10»', advance: 'click',
          text: 'Карточка: название, плечо, статус, сколько заказов. Нажми — посмотрим, что внутри.'
        },
        {
          target: '#detail-status', title: 'Статус коллективки', wait: 10000,
          text: 'Главное поле. Посылка уехала — меняешь здесь на «Отправлено (СДЭК)» и «Сохранить». Откроется окно «статус доставки для всех 3 заказов» — проверь и «Применить».'
        },
        {
          target: '#summary-paid-count', title: 'Кто оплатил плечо',
          text: '<b>1/3</b> — доставку уже оплатила только Маша (за Эбби). Аня и Катя ещё должны — напомни до выдачи.'
        },
        {
          target: '#detail-order-search', title: 'Добавить заказ',
          text: 'Забыли заказ — найди здесь по номеру, товару или клиенту. Убрать — крестик на карточке заказа или «Выбрать» → «Убрать из коллективки» / «Перенести в другую».'
        },
        {
          target: '#order-list .units-slider', title: 'Доля в расходах',
          text: 'У Дракулауры Ани большая коробка — доля <b>2</b>: она несёт вдвое больше расхода на СДЭК. Обычный заказ — <b>1</b>, не участвует — <b>0</b>.'
        },
        {
          target: '#cost-fields-grid', title: 'Факт. расход', optional: true,
          text: 'Пришёл чек СДЭК или такси — сумма сюда и «Сохранить сверку». <b>«Применить расход в заказы»</b> меняет клиентам сумму к оплате за доставку — не уверен(а), спроси VASY.'
        },
        {
          title: 'Проверка',
          text: 'Посылка «СДЭК 12.10» с этими 3 заказами уехала из Казахстана. Как отметить?',
          quiz: { options: [
            { label: 'Сменить статус у коллективки → «Сохранить» → «Применить»', correct: true, explain: 'Один раз — и у всех 3 заказов статус доставки поменяется. Клиентки получат уведомление, если оно включено.' },
            { label: 'Открыть каждый заказ и поменять статус', explain: 'Долго, и легко пропустить один — тогда появится задача «Отстал от коллективки». Меняй у коллективки.' },
            { label: 'Ничего, статус обновится сам', explain: 'Сам не обновится — статус коллективки меняешь ты, когда посылка двинулась.' }
          ] }
        }
      ]
    },

    // Деньги — самое рискованное, поэтому подробно и с вопросами-проверками.
    // Учебный пример: Аня должна 5 000 ₽ — основная оплата Лагуны 3 000 и вес
    // Дракулауры 2 000; перевела 5 000 одним переводом. Ещё её заявка «я
    // оплатила 3 000». Ничего не записывается.
    'pay-in': {
      id: 'pay-in',
      title: 'Занести оплату',
      screens: ['payments'],
      momentScreens: ['payments'],
      block: [
        '#rp-save', '#em-save', '#rm-send', '#rf-save', '#ac-save', '.approve-claim-btn', '.reject-claim-btn',
        '[data-action="edit-payment"]', '[data-action="cancel-payment"]', '[data-action="cancel-earmark"]',
        '#release-credit-btn', '#open-refund-btn', '.attach-receipt-input'
      ],
      steps: [
        { target: nav('payments'), title: 'Открой «Оплаты»', text: 'Все деньги клиентов — здесь.', advance: 'click', skipIf: onScreen('payments') },
        {
          target: '#tab-switcher', title: 'Три вкладки',
          text: '<b>Кто должен</b> — кому сейчас пора платить. <b>Клиент</b> — работа с одним клиентом: заказы, оплаты, «Занести оплату». <b>Заявки</b> — клиент сам написал в приложении «я оплатил».'
        },
        {
          target: '[data-due-client="trn-anya"]', title: 'Кто должен', wait: 8000,
          text: 'Аня должна <b>5 000 ₽</b>: Лагуна — основная оплата 3 000 ₽, Дракулаура — вес 2 000 ₽. Сюда попадают только этапы, которые по статусу заказа уже пора платить.'
        },
        {
          target: '#tab-switcher [data-tab="client"]', title: 'Вкладка «Клиент»', text: 'Аня перевела деньги — работаем с ней. Открой «Клиент».', advance: 'click',
          skipIf: () => { const t = document.getElementById('client-tab'); return !!t && !t.classList.contains('hidden'); }
        },
        {
          target: '#client-search-card', title: 'Найди Аню', free: true, place: 'away',
          text: 'Начни вводить <b>Аня</b> и выбери её из списка. В работе — ищи по нику или по имени из перевода.',
          advance: { until: () => !!document.getElementById('open-record-payment-btn') }
        },
        {
          target: '[data-tour="pay-due"]', title: '«Сейчас к оплате»',
          text: 'Главное число — <b>5 000 ₽</b>. Ниже — за что: основная оплата № TRN101 — 3 000 ₽ и вес № TRN102 — 2 000 ₽. Зелёное «платить нечего» — значит, сейчас клиент ничего не должен.'
        },
        {
          target: '[data-tour="pay-tiles"]', title: 'Итоги клиентки',
          text: '«Оплачено всего» — сколько Аня уже заплатила. «Осталось по всем заказам» — что ещё будет, но не всё уже пора. <b>«Долг по полученным»</b> красный — кукла уже у клиента, а денег нет: такой долг сам не закроется.'
        },
        { target: '#open-record-payment-btn', title: 'Аня перевела 5 000 ₽', text: 'В банке пришло 5 000 ₽ от Ани. Нажми «Занести оплату».', advance: 'click' },
        {
          target: '#rp-amount', title: 'Сколько пришло', free: true,
          text: 'Впиши <b>5000</b> — сумму, которая <b>реально пришла в банк</b>. Смотри в банке, не в переписке. Один перевод — одна запись.',
          advance: { until: () => { const el = document.getElementById('rp-amount'); return !!el && Number(el.value) === 5000; } }
        },
        {
          target: '#rp-alloc-section', title: 'За что эти деньги', free: true,
          text: 'Система сама положила <b>2 000 ₽ на вес Дракулауры</b> — старый заказ идёт первым. Оставшиеся 3 000 ₽ пока «в пул клиента». Нажми <b>«+ ещё заказ или этап»</b> — добавится основная оплата Лагуны.',
          advance: { until: () => document.querySelectorAll('#rp-alloc-rows [data-alloc-index]').length >= 2 }
        },
        {
          target: '#rp-alloc-section', title: 'Вся сумма разнесена',
          text: '2 000 + 3 000 = 5 000 ₽ — «Вся сумма закреплена». Один перевод — одна запись, разложенная по двум заказам. Ошибся в строке — выбери другой этап в списке.'
        },
        { target: '#rp-receipt-row', title: 'Скриншот чека', optional: true, text: 'Прикрепляй всегда, когда есть. Будет вопрос «а точно платила?» — чек найдётся прямо у платежа.' },
        { target: '#rp-notify-row', title: 'Сообщить клиентке', optional: true, text: 'С галочкой Ане в Telegram уйдёт «получили оплату». Снимай, только если писать ей не нужно.' },
        { target: '#rp-save', title: '«Занести»', text: 'В работе — «Занести»: платёж и разнесение запишутся одной записью. Сейчас учебный режим — <b>не сохраняем</b>.' },
        { target: '#rp-cancel', title: 'Закрой окно', text: 'Нажми «Отмена».', advance: 'click' },
        {
          target: '[data-order-card="TRN101"] [data-action="record-for-stage"]', title: 'Кнопки на этапе заказа',
          text: 'Ниже — заказы Ани по этапам. <b>«Оплата»</b> — пришли новые деньги именно за этот этап. <b>«Из остатка»</b> появляется, когда у клиента лежат свободные деньги (переплатил раньше). У Ани их нет — поэтому такой кнопки нет.'
        },
        {
          title: '«Оплата» или «Из остатка»?',
          text: 'Правило одно: <b>пришли деньги в банк — «Занести оплату»</b> (или «Оплата» на этапе). <b>«Из остатка»</b> — только перенос денег, которые уже лежат у клиента. Перепутать — значит записать деньги, которых не было, или «потерять» пришедшие.'
        },
        {
          target: '[data-tour="pay-balance"]', title: 'Баланс и кредит', optional: true,
          text: 'Свободный остаток, кредит и все внесённые платежи — здесь. <b>Исправить или удалить уже внесённую оплату, вернуть деньги — делает VASY.</b> Ошибся — напиши ему или спроси помощника 🤖.'
        },
        { target: '#tab-switcher [data-tab="claims"]', title: 'Заявки клиентов', text: 'Открой «Заявки».', advance: 'click' },
        {
          target: '#claims-list > *', title: 'Аня написала «я оплатила»', wait: 8000,
          text: 'Аня сама нажала в приложении «Я оплатил»: «3 000 ₽ на Сбер в 14:20, за Лагуну». <b>Сначала проверь банк.</b> Пришли — «Одобрить»: деньги запишутся и разнесутся сами. Нет — «Отклонить» с причиной, Аня её увидит.'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиент одним переводом прислал <b>5 000 ₽ за два заказа</b>. Что делаешь?',
          quiz: { options: [
            { label: 'Одна «Занести оплату» на 5 000 ₽, в «За что» — оба заказа', correct: true, explain: 'Один перевод — одна запись, как в банке. По двум заказам раскладываешь строками «За что» — как только что с Аней.' },
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

    // Задачу сейчас не сделать. Учебный пример: Аня обещала оплатить в
    // пятницу (отложить), у старого заказа Оли не вспомнить аккаунт
    // (пропустить с причиной), Фрэнки Оля купила сама (галочка в заказе).
    // Пропуск есть только у «Не заполнено» (сервер, DISMISSIBLE_KINDS),
    // отложить — только оплата и сроки (SNOOZABLE_KINDS).
    'reminders-skip': {
      id: 'reminders-skip',
      title: 'Пропустить с причиной или отложить',
      screens: ['reminders', 'orderEdit'],
      momentScreens: ['reminders'],
      block: ORDER_WRITES,
      steps: [
        { target: nav('reminders'), title: 'Открой «Задачи»', text: 'Разберём задачи, которые прямо сейчас не сделать.', advance: 'click', skipIf: onScreen('reminders') },
        {
          title: 'Три выхода',
          text: 'У каждой задачи три выхода:<br>1) <b>Сделать</b> — лучший, задача уйдёт сама.<br>2) <b>Отложить</b> — ждёшь понятного события.<br>3) <b>Пропустить с причиной</b> — сделать уже невозможно.<br>Листать мимо — не выход: задача краснеет и прячет новые.'
        },
        {
          target: `${boardCard('TRN101')} .snooze-btn`, title: 'Аня: «оплачу в пятницу»', onEnter: revealBoardCard('TRN101'),
          text: 'Аня написала, что оплатит Лагуну в пятницу. Задача про оплату — значит, можно <b>«Отложить на 3 дня»</b>: пункт пропадёт и сам вернётся. Ждать нечего — «Напомнить».'
        },
        {
          target: () => { const b = document.querySelector(`${boardCard('TRN103')} .dismiss-item-btn`); return b && shown(b) ? b.closest('[data-items] > div') : null; },
          title: 'Старый заказ Оли', onEnter: revealBoardCard('TRN103'),
          text: 'Клео Оли — заказ от 12.03.2025, кукла давно у клиентки, а <b>«Не заполнено: аккаунт»</b>. С какого аккаунта выкупали, никто не помнит. Это и есть <b>«Пропустить (данные утеряны)»</b> + причина: её увидят VASY и все, кто откроет заказ.'
        },
        {
          title: 'Что пропустить нельзя',
          text: 'У долга, оплаты, «Курсы и сумма не подтверждены», «Отстал от коллективки» кнопки «Пропустить» нет — <b>это деньги и посылки</b>. Их делают. Кажется, что задача неверная, — «?» → «🆘 Что-то не работает».'
        },
        {
          target: `${boardCard('TRN104')} [data-open]`, title: 'Фрэнки Оли', advance: 'click', onEnter: revealBoardCard('TRN104'),
          text: 'У Оли по Фрэнки — «Курсы и сумма не подтверждены», пропустить нельзя. Но тут особый случай. Открой заказ.'
        },
        {
          target: '#order-next-step', title: '«Следующий шаг»', wait: 12000,
          text: 'Система просит <b>«Заполнить курсы и сумму»</b>. Но Оля купила Фрэнки сама, на своём аккаунте, — мы только везём. Курса выкупа у нас просто нет.'
        },
        {
          target: 'section[data-block="client"] [data-block-toggle]', title: 'Блок «Клиент»', advance: 'click',
          skipIf: () => { const b = document.querySelector('section[data-block="client"] .order-block-body'); return !!b && !b.classList.contains('hidden'); },
          text: 'Открой блок «Клиент».'
        },
        {
          target: () => { const c = document.getElementById('client-self-purchased-checkbox'); return c ? c.closest('label') : null; },
          title: '«Товар выкупил сам клиент»',
          text: 'Вот он: ставь галочку и «Сохранить» — пункт про курсы уйдёт. Комиссию в таком заказе вводи суммой. Сейчас ничего не меняем.'
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

    // Вопросы клиентов и вишлист за клиента. Учебный пример: Катя спрашивает
    // про Клодин, Оля ответила боту «👍», Оперетту хотят Катя и Аня.
    'questions-wishlist': {
      id: 'questions-wishlist',
      title: 'Вопросы клиентов и вишлист',
      screens: ['home', 'wishlistDemand', 'clients'],
      momentScreens: ['home', 'wishlistDemand'],
      block: [
        '.save-answer-btn', '.close-question-btn', '#manual-wishlist-save', '#manual-wishlist-resolve-btn',
        '#manual-wishlist-use-manual-client', '.order-from-demand-btn', '.ordered-chip', '.chat-link'
      ],
      steps: [
        { target: nav('home'), title: 'Открой «Главную»', text: 'Вопросы клиентов — здесь.', advance: 'click', skipIf: onScreen('home') },
        {
          target: '#tab-switcher [data-tab="questions"]', title: 'Вопросы', advance: 'click',
          skipIf: () => { const t = document.getElementById('questions-tab'); return !!t && !t.classList.contains('hidden'); },
          text: 'Вопросы клиентов из бота и приложения. Цифра — новые, без ответа. Открой.'
        },
        {
          target: questionCardWith('Клодин'), title: 'Катя спрашивает', wait: 10000,
          text: 'Катя: «Когда приедет Клодин?» Сверху — кукла и заказ № TRN105 (нажатие откроет его), имя и «написать» — её чат в Telegram. Жёлтая карточка — новый вопрос.'
        },
        {
          target: () => { const c = questionCardWith('Клодин')(); return c ? c.querySelector('.answer-input') : null; },
          title: 'Ответ', free: true,
          text: 'Пиши как в чат: что с заказом и когда ждать. Например: «Клодин уже на складе в Казахстане, на этой неделе уедет в Россию». Попробуй — сейчас не отправится. Не знаешь ответа — открой заказ.'
        },
        {
          target: () => { const c = questionCardWith('👍')(); return c ? c.querySelector('.close-question-btn') : null; },
          title: '«👍» — не вопрос', onEnter: () => { const c = Array.from(document.querySelectorAll('#questions-list > div')).find((el) => el.textContent.includes('👍')); if (c) c.scrollIntoView({ block: 'center' }); },
          text: 'Оля ответила боту «👍» — это не вопрос. <b>«Закрыть без ответа»</b>: Оле ничего не придёт, вопрос уйдёт из новых. Настоящий вопрос так не закрывай.'
        },
        { target: nav('catalog'), title: 'Открой «Каталог»', text: 'Вишлисты клиентов — в каталоге, вкладка «Спрос».', advance: 'click', skipIf: onScreen('catalog', 'wishlistDemand') },
        { target: '[data-catalog-tab="demand"]', title: '«Спрос»', text: 'Что хотят клиенты по своим вишлистам. Открой.', advance: 'click', skipIf: onScreen('wishlistDemand') },
        {
          target: () => { const t = byText('#demand-list [data-toggle]', 'Оперетта')(); return t ? t.parentElement : null; },
          title: 'Кто что хочет', wait: 10000,
          text: '<b>Оперетту</b> хотят двое — Катя и Аня («Хотят: 2»). Нашли такую куклу — смотри сюда первым делом: сразу видно, кому предложить.'
        },
        {
          target: byText('#demand-list [data-toggle]', 'Оперетта'), title: 'Раскрой', advance: 'click',
          text: 'Нажми на карточку — раскроется список клиенток.'
        },
        {
          target: () => { const t = byText('#demand-list [data-toggle]', 'Оперетта')(); const b = t && t.parentElement.querySelector('.clients-block'); return b && shown(b) ? b : null; },
          title: '«Оформить заказ»',
          text: 'У каждой клиентки — <b>«Оформить заказ»</b>: откроется корзина уже с ней и с куклой. Сейчас не оформляем.'
        },
        {
          target: '#add-manual-wishlist-btn', title: 'Добавить за клиента', advance: 'click',
          text: 'Катя написала в личку: «Если найдёте Дракулауру Skulltimate — хочу». Не записывай себе — добавь в <b>её вишлист</b>: тогда видно в «Спросе», а Катя видит куклу в «Моих куклах». Нажми «+».'
        },
        {
          target: '#manual-wishlist-client-search', title: 'Клиентка', free: true, place: 'away',
          text: 'Начни вводить <b>Катя</b> и выбери её из списка. Потом «Далее».'
        },
        {
          target: () => { const i = document.getElementById('manual-wishlist-catalog-search'); return i ? i.closest('div') : null; },
          title: 'Какая кукла', free: true, place: 'away',
          text: 'Лучше всего — <b>из каталога</b>: начни вводить «Draculaura». Тогда у Кати сразу фото, а в «Спросе» желания разных клиентов складываются в одну карточку. Нет в каталоге — ссылка или название вручную.'
        },
        { target: '#manual-wishlist-save', title: '«Добавить»', text: 'В работе — «Добавить»: кукла появится в вишлисте Кати. Сейчас учебный режим — <b>не сохраняем</b>.' },
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
    },

    // Лот (С5, 05.10.2026). Учебный пример: на eBay лот «Оперетта + Твайла +
    // 2 подставки» за $70. Оперетту ждут Катя и Аня («Спрос»), Твайлу — Маша.
    // Разбор ссылки отвечает песочница (учебная ссылка), ИИ не зовётся.
    'lot': {
      id: 'lot',
      title: 'Лот: несколько кукол одной покупкой',
      screens: ['orders', 'cartNew'],
      block: ['#save-cart-btn', '.lot-purchase-link-resolve-btn'],
      steps: [
        { target: nav('orders'), title: 'Открой «Заказы»', text: 'Лот оформляется в «Корзине».', advance: 'click', skipIf: onScreen('orders', 'cartNew') },
        { target: '#new-cart-btn', title: '«Корзина»', text: 'Нажми — откроется новый выкуп.', advance: 'click', skipIf: onScreen('cartNew') },
        {
          title: 'Что такое лот',
          text: 'Лот — <b>несколько кукол одной покупкой</b>: одна ссылка, один продавец, <b>одна цена за всё</b>.<br><br>Сегодня на eBay нашёлся лот: <b>Оперетта, Твайла и 2 подставки за $70</b>. Оперетту давно ждут Катя и Аня, Твайлу — Маша.<br><br>Если у каждой куклы в чеке своя цена — это не лот, а обычные позиции корзины.'
        },
        { target: '#add-lot-btn', title: '«+ Добавить лот»', text: 'Пустая «Позиция» сверху — для обычной покупки, сейчас она не нужна. Нажми «+ Добавить лот».', advance: 'click' },
        {
          target: lotPart('.lot-summary-row'), title: 'Карточка лота', text: 'Лот свёрнут. Нажми на него — раскроется.', advance: 'click',
          skipIf: () => { const b = document.querySelector(`${LOT} .lot-body`); return !!b && !b.classList.contains('hidden'); }
        },
        {
          target: lotField('.lot-purchase-link-input'), title: 'Одна ссылка на весь лот', free: true,
          text: 'Ссылка на объявление — <b>одна на весь лот</b>, не на каждую куклу. В работе вставляешь её из браузера. Сейчас возьмём учебную.',
          actions: [{ label: 'Вставить учебную ссылку', run: pasteLotLink }],
          advance: { until: () => { const i = document.querySelector(LOT + ' .lot-purchase-link-input'); return !!i && i.value.includes('uchebnyj-lot'); } }
        },
        {
          target: lotPart('.lot-parse-btn'), title: 'Разобрать лот', advance: { until: () => lotParseRows() > 0 },
          text: 'ИИ прочитает объявление и фото и предложит, какие куклы внутри. Нажми <b>«Разобрать лот по ссылке»</b>.'
        },
        {
          target: lotPart('.lot-parse-confirm'), title: 'Что нашёл ИИ', wait: 10000,
          text: 'Две куклы и подставки. Проценты — уверенность ИИ, это подсказка, не факт: <b>сверь с фото и описанием</b>. «спрос: 2» — Оперетту ждут двое (это «Спрос» из каталога). Подставки — «Аксессуар», галочки нет: заказами они не станут.'
        },
        { target: lotPart('.lot-parse-apply-btn'), title: '«Применить»', text: 'Отмеченные куклы станут строками лота. Нажми «Применить».', advance: 'click' },
        {
          target: lotRowPart(1, '.client-row'), title: 'Оперетта — Кате', free: true, place: 'away',
          text: 'Первой Оперетту попросила Катя. В строке Оперетты начни вводить <b>Катя</b> и выбери её из списка.',
          advance: { until: () => lotRowClient(1).includes('katya') }
        },
        {
          target: lotRowPart(2, '.client-row'), title: 'Твайла — Маше', free: true, place: 'away',
          text: 'Во второй строке — <b>Маша</b>: начни вводить и выбери её.',
          advance: { until: () => lotRowClient(2).includes('masha') }
        },
        {
          target: lotField('.lot-amount-input'), title: 'Цена всего лота', free: true,
          text: 'Впиши <b>70</b> — сколько заплатили за весь лот, как в чеке (с доставкой и налогом магазина).',
          advance: { until: () => { const i = document.querySelector(LOT + ' .lot-amount-input'); return !!i && Number(i.value) === 70; } }
        },
        {
          target: lotRowPart(1, '.cost-slider'), title: 'Кто сколько платит', free: true,
          text: 'Сейчас $70 делятся поровну. Но Оперетта редкая и стоит дороже. Сдвинь у неё бегунок <b>«Доля в общих тратах»</b> на <b>×2</b> — она возьмёт вдвое больше, чем Твайла.',
          advance: { until: () => { const s = document.querySelector(`${LOT} .lot-positions-list > div:nth-child(1) .cost-slider`); return !!s && Number(s.value) === 2; } }
        },
        {
          target: lotRowPart(1, '.lot-row-breakdown'), title: 'Сколько платит Катя',
          text: '<b>База позиции</b> — её часть от $70 в рублях: теперь 2/3 лота. Ниже комиссия и <b>«Клиент платит»</b> — эту сумму Катя заплатит за Оперетту. Комиссию вписываешь, как в обычной позиции.'
        },
        {
          target: lotRowPart(2, '.known-price-input'), title: 'Если цена известна',
          text: 'Бывает, продавец пишет цену каждой куклы. Тогда впиши её в <b>«Цена товара»</b>: кукла возьмёт ровно эту сумму, а остаток лота поделят остальные по своим долям. Не знаешь — оставь пустым.'
        },
        {
          target: lotField('.lot-weight-total-input'), title: 'Вес на весь лот', free: true,
          text: 'Карго считает вес за всю посылку. Пришёл счёт: <b>2 400 ₽</b> за этот лот — впиши. Не знаешь сейчас — оставь пустым: возьмётся прогноз, сумму зададут позже на карточке лота.',
          advance: { until: () => { const i = document.querySelector(LOT + ' .lot-weight-total-input'); return !!i && Number(i.value) === 2400; } }
        },
        {
          target: lotPart('.lot-weight-split-hint'), title: 'Вес по куклам',
          text: 'Вес делится по <b>«Доле веса»</b> в строках: обе куклы ×1 — по 1 200 ₽. Большая коробка — ×2, кукла без коробки — меньше.'
        },
        { target: '#save-cart-btn', title: 'Сохранить', text: 'В работе — «Сохранить»: из лота получится по заказу на каждую куклу, у Кати и Маши они появятся в «Моих заказах». Сейчас учебный режим — <b>не сохраняем</b>.' },
        {
          title: 'Проверка 1 из 2',
          text: 'На сайте Mattel купили 3 куклы одним заказом. В чеке у каждой своя цена. Как оформить?',
          quiz: { options: [
            { label: 'Лот на всю покупку', explain: 'Лот — когда цена одна на всё. Здесь цены по строкам чека известны.' },
            { label: 'Три позиции в одной корзине, у каждой своя сумма', correct: true, explain: 'Каждая кукла — своя позиция со своей суммой по чеку. Общую доставку и налог корзина поделит сама.' },
            { label: 'Три отдельные корзины', explain: 'Покупка одна — и корзина одна: так видно, что выкупали вместе.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Лот из 3 кукол за <b>$100</b>. Продавец написал, что одна из них стоит <b>$60</b>. Что делаешь?',
          quiz: { options: [
            { label: 'Делю поровну — так проще', explain: 'Тогда две клиентки переплатят за чужую дорогую куклу.' },
            { label: 'Впишу $60 в «Цена товара» у этой куклы', correct: true, explain: 'Она возьмёт ровно $60, а оставшиеся $40 поделят две другие по своим долям.' },
            { label: 'Сделаю отдельную корзину на эту куклу', explain: 'Покупка одна — это один лот. Известную цену вписывают в строку лота.' }
          ] }
        }
      ]
    },

    // Повторить покупку (С5). Учебный пример: Маша просит ещё одну Гулию —
    // в подарок сестре. Повторяем её заказ № TRN107 через «Выбрать».
    'repeat': {
      id: 'repeat',
      title: 'Повторить покупку',
      screens: ['orders', 'orderEdit'],
      block: ['#save-cart-btn', '#bulk-assign-btn', '#bulk-create-collective-btn', '#bulk-status-btn', '#bulk-status-order-btn', '#bulk-delete-btn'],
      steps: [
        { target: nav('orders'), title: 'Открой «Заказы»', text: 'Повтор начинается со старого заказа.', advance: 'click', skipIf: onScreen('orders') },
        {
          title: 'Ещё одну такую же',
          text: 'Маша пишет: <b>«Возьмите мне ещё одну Гулию — в подарок сестре»</b>. Набирать корзину с нуля не нужно: повторим её прошлый заказ — товар и клиентка подставятся сами.'
        },
        { target: '#select-mode-btn', title: '«Выбрать»', text: 'Нажми «Выбрать». Быстрее — <b>долгое нажатие на заказ</b>: выбор включится сам.', advance: 'click' },
        {
          target: orderListCard('TRN107'), title: 'Гулия Маши', free: true,
          text: 'Отметь <b>Гулию</b> (№ TRN107) нажатием на карточку. Можно отметить несколько заказов — повторятся все.',
          advance: { until: () => bulkCount() > 0 }
        },
        { target: '#bulk-repeat-btn', title: '«Повторить»', text: 'Нажми «Повторить».', advance: 'click' },
        {
          target: '#dup-positions-modal .bg-white', title: 'Повторить покупку',
          text: '<b>− / +</b> — сколько штук: каждая штука — отдельный заказ (×2 — два заказа). <b>Цена не переносится</b>: у редких и б/у кукол она каждый раз другая — старая будет только подсказкой.'
        },
        {
          target: () => { const c = document.querySelector('#dup-positions-list .dup-same-client'); return c ? c.closest('label') : null; },
          title: '«тот же клиент»', free: true,
          text: 'По умолчанию клиент <b>не</b> переносится — чаще повторяют для другой клиентки. Сейчас Гулия снова для Маши: поставь галочку <b>«тот же клиент»</b>.',
          advance: { until: () => { const c = document.querySelector('#dup-positions-list .dup-same-client'); return !!c && c.checked; } }
        },
        { target: '#dup-positions-modal-confirm', title: '«Повторить (1)»', text: 'Нажми — откроется новая корзина.', advance: 'click' },
        {
          target: () => { const c = document.querySelector(`${firstCartCard} .client-search`); return c ? c.closest('.relative') : null; }, title: 'Корзина готова', wait: 10000,
          text: 'Гулия уже в корзине: клиентка — Маша, ниже товар из каталога. Канал, валюта и процент комиссии — как в прошлый раз (аккаунт и карго проверь), статусы — заново.'
        },
        {
          target: `${firstCartCard} .product-repeat-hint`, title: '«Уже брала»', optional: true,
          text: 'Подсказка: Маша <b>уже брала</b> эту куклу — сколько раз и когда последний. Видно и при обычном выборе товара: так замечаешь постоянных клиентов.'
        },
        {
          target: `${firstCartCard} .amount-input`, title: 'Новая цена', free: true,
          text: 'В поле суммы — серая подсказка <b>«было 30 Доллар»</b>: это прошлая цена, она не подставилась. Впиши сумму из нового чека — например, <b>35</b>.',
          advance: { until: () => { const i = document.querySelector(`${firstCartCard} .amount-input`); return !!i && Number(i.value) > 0; } }
        },
        {
          title: 'Из карточки заказа — тоже',
          text: 'Повторить можно и из заказа: кнопка <b>«Повторить покупку»</b> в шапке. Если заказ был в корзине с другими куклами — откроется тот же выбор «сколько каждой».'
        },
        { target: '#save-cart-btn', title: 'Сохранить', text: 'Дальше всё как в обычной корзине: аккаунт, «Итог и оплаты», «Сохранить». Сейчас учебный режим — <b>не сохраняем</b>.' },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиентка: «Хочу ещё две такие же Клодин, как в прошлый раз». Что делаешь?',
          quiz: { options: [
            { label: '«Повторить» её заказ: ×2 и «тот же клиент»', correct: true, explain: 'Два заказа с той же куклой и той же клиенткой — за пару нажатий. Цены — из нового чека.' },
            { label: 'Новая корзина, ищу куклу и клиентку заново', explain: 'Можно, но дольше — и легко выбрать не ту позицию каталога.' },
            { label: 'Один заказ с пометкой «2 шт.»', explain: 'Один заказ — одна кукла: так считаются статусы и «Мои куклы» клиентки. ×2 — два заказа.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Повторяешь заказ, в прошлый раз кукла стоила <b>$30</b>. Какая цена будет в новой корзине?',
          quiz: { options: [
            { label: '$30 — подставится сама', explain: 'Не подставится: старая цена — только серая подсказка. Иначе клиентке ушёл бы неверный долг.' },
            { label: 'Та, что я впишу по новому чеку', correct: true, explain: 'Да. Подсказка «было $30» — чтобы сравнить, а сумма всегда из нового чека.' }
          ] }
        }
      ]
    },

    // Каталог без дублей (С5). Учебный каталог из песочницы: Маша просит
    // Гулию — она уже есть, создавать вторую нельзя.
    'catalog': {
      id: 'catalog',
      title: 'Каталог без дублей',
      screens: ['catalog'],
      momentScreens: ['catalog'],
      block: ['#create-sku-save', '#sku-delete-btn', '#duplicate-force-btn', '#sku-link-add-btn', '#sku-exists-use', '.duplicate-choice-btn'],
      steps: [
        { target: nav('catalog'), title: 'Открой «Каталог»', text: 'Все куклы, которые мы возим, — здесь.', advance: 'click', skipIf: onScreen('catalog') },
        {
          title: 'Одна кукла — одна позиция',
          text: 'Из каталога берётся товар для корзины, вишлиста и «Спроса». Если завести одну куклу <b>дважды</b>, её заказы, спрос и «Мои куклы» клиенток разъедутся по двум карточкам — и уже не видно, кто её ждёт.<br><br>Главное правило: <b>сначала найди, потом создавай</b>.'
        },
        {
          target: byText('#catalog-list > div', 'Гулия Core'), title: 'Карточка позиции', wait: 10000,
          text: 'Сверху — <b>короткое название</b> по-русски (его видят клиентки), под ним — полное, как в магазине. Теги: бренд, персонаж, серия. Ниже — ветка и сколько заказов.'
        },
        {
          target: () => { const i = document.getElementById('catalog-search'); return i ? i.closest('div') : null; }, title: 'Сначала — поиск', free: true, place: 'away',
          text: 'Маша прислала ссылку: «Monster High Ghoulia Yelps Core Doll 2022 NEW». Ищи по <b>одному слову</b>, а не всей строкой из магазина: впиши <b>Ghoulia</b> (или по-русски «Гулия»).',
          advance: { until: () => { const i = document.getElementById('catalog-search'); return !!i && i.value.trim().length >= 3 && document.querySelectorAll('#catalog-list > div').length === 1; } }
        },
        {
          target: byText('#catalog-list > div', 'Гулия Core'), title: 'Нашлась',
          text: 'Гулия <b>уже есть</b> — создавать не нужно: в корзину берёшь эту. Вся строка из магазина («…Doll 2022 NEW») ничего бы не нашла — поэтому ищи по слову.'
        },
        { target: '#add-sku-btn', title: 'А если не нашлось', text: '«+» — новая позиция. Нажми: посмотрим, как каталог сам ловит дубли.', advance: 'click' },
        {
          target: () => { const i = document.getElementById('sku-original-input'); return i ? i.parentElement : null; }, title: '«Выпуск»', free: true, place: 'away',
          text: 'Полное название, как в магазине. Начни вводить <b>Ghoulia</b> — ниже сразу появятся похожие позиции. Нажми на найденную <b>«Гулия Core»</b>: откроется существующая, новая не создастся.',
          advance: { until: () => { const t = document.getElementById('sku-modal-title'); return !!t && t.textContent.includes('Редактирование'); } }
        },
        {
          target: () => { const i = document.getElementById('sku-original-input'); return i ? i.closest('.relative').parentElement : null; }, title: 'Та же Гулия', wait: 8000,
          text: 'Это та самая позиция из заказа Маши. Здесь её можно <b>дополнить</b> — фото, ссылка, теги, — но не заводить вторую. В работе — «Сохранить изменения»; сейчас не сохраняем.'
        },
        { target: '#create-sku-close', title: 'Закрой окно', text: 'Нажми крестик.', advance: 'click' },
        {
          title: 'Новая кукла',
          text: 'Поиск правда пустой — тогда «+»:<br>• <b>Выпуск</b> — полное название из магазина;<br>• <b>Короткое название RU</b> — как зовёшь куклу, его видят клиентки;<br>• фото и ссылка.<br>При «Сохранить» каталог проверит ещё раз. «Похоже, такая уже есть» — <b>выбери найденную</b>, а не «Всё равно сохранить».'
        },
        {
          target: '.catalog-tabs', title: 'Нашлись две одинаковые',
          text: 'Видишь двойника — не удаляй сам: у обеих могут быть заказы. Дубли собраны во вкладке <b>«Порядок» → «Проверка»</b>; не уверен(а) — напиши в «💡 Неудобно / идея».'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Клиентка прислала ссылку «Monster High Clawdeen Wolf Core Doll 2022 NEW!!!». Поиск по всей строке ничего не нашёл. Что делаешь?',
          quiz: { options: [
            { label: 'Создаю новую позицию — раз не нашлось', explain: 'Сначала поищи по слову: длинная строка из магазина почти никогда не совпадает целиком.' },
            { label: 'Ищу по слову «Clawdeen» или «Клодин»', correct: true, explain: 'Так находится и «Клодин Core». Не нашлось и по слову — тогда «+».' },
            { label: 'Беру любую похожую Клодин', explain: 'Другой выпуск — другая кукла: клиентке приедет не то. Ищи именно этот выпуск.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Сохраняешь новую позицию, а каталог пишет: <b>«Похоже, такая позиция уже есть: Клодин Core»</b>. Это та же кукла. Что нажимаешь?',
          quiz: { options: [
            { label: 'Найденную «Клодин Core»', correct: true, explain: 'Новая не создастся — возьмётся существующая, со всеми её заказами и спросом.' },
            { label: '«Всё равно сохранить как отдельную позицию»', explain: 'Получится дубль. Эта кнопка — только когда это правда другая кукла (другой выпуск или серия).' }
          ] }
        }
      ]
    },

    // Субботняя сводка (С5). Сводка приходит в Telegram — экрана у неё нет,
    // поэтому учебный пример рисуется поверх «Обучения» (summaryMock), а
    // кнопка «Кто должен» ведёт в «Оплаты» учебного мира. В конце — своя
    // настоящая сводка (getMyWeeklySummaryPreview только читает).
    'weekly-summary': {
      id: 'weekly-summary',
      title: 'Субботняя сводка',
      screens: ['home'],
      block: ['#rp-save', '#rm-send', '.approve-claim-btn', '.reject-claim-btn'],
      onComplete: () => SummaryMock.hide(),
      onExit: () => SummaryMock.hide(),
      steps: [
        {
          target: '#training-summary-mock > div', title: 'Сводка недели', onEnter: () => SummaryMock.showSample(),
          text: 'Каждую <b>субботу в 11:00 МСК</b> бот присылает в Telegram итоги твоей недели и <b>до 3 главных дел</b> на следующую. Вот как она выглядит на учебном примере.'
        },
        { target: '#training-summary-mock [data-part="week"]', title: 'Что сделано', onEnter: () => SummaryMock.showSample(), text: 'Твои заказы, оплаты и сколько заказов поехало дальше. Считается только твоё.' },
        { target: '#training-summary-mock [data-part="praise"]', title: '🌟 Похвала', onEnter: () => SummaryMock.showSample(), text: 'Только за качество: заказы дошли до клиентов, неделя без срочных задач, пройденные уроки. За количество не хвалим.' },
        {
          target: '#training-summary-mock [data-part="tasks"]', title: 'Главное на неделю', onEnter: () => SummaryMock.showSample(),
          text: 'До 3 дел, <b>самое важное первым</b>. Здесь: Аня должна 5 000 ₽ и ждёт дольше всех — 4 дня; и 2 заказа, где не хватает цены или данных.'
        },
        { target: '#training-summary-mock [data-part="training"]', title: '🎓 Обучение', onEnter: () => SummaryMock.showSample(), text: 'Сколько уроков пройдено и какой следующий.' },
        {
          target: '#training-summary-mock [data-route="payments"]', title: 'Кнопки', onEnter: () => SummaryMock.showSample(), advance: 'click',
          text: 'Кнопки под сводкой ведут прямо в приложение. Нажми <b>«💰 Кто должен»</b>.'
        },
        {
          target: '[data-due-client="trn-anya"]', title: 'Дело №1', wait: 10000,
          text: 'Вот дело из сводки: <b>Аня, 5 000 ₽</b>. Иди сверху вниз: деньги пришли — «Занести оплату», нет — «Напомнить».'
        },
        {
          title: 'Что делать с очередью',
          text: 'В понедельник открой сводку и пройди дела <b>по порядку</b>. Сделанное само исчезнет из следующей сводки.<br><br>Дело не сделать — клиентка обещала оплатить позже или данных уже не найти — «Отложить» или «Пропустить с причиной» (урок «Пропустить или отложить»). Висящее дело будет приходить каждую субботу.'
        },
        {
          title: 'Твоя сводка', onEnter: () => SummaryMock.hide(),
          text: 'А теперь — <b>твоя</b> сводка, какой она была бы, если бы суббота была сегодня: на твоих настоящих заказах.',
          actions: [{ label: 'Показать мою сводку', run: () => SummaryMock.showMine() }],
          advance: { until: () => SummaryMock.kind() === 'mine' }
        },
        {
          target: '#training-summary-mock > div', title: 'Твоя сводка',
          text: 'В субботу она придёт в Telegram. Пусто в «Главное» — значит, срочных дел нет. Непонятна строка — спроси помощника 🤖.'
        },
        {
          title: 'Проверка 1 из 2', onEnter: () => SummaryMock.hide(),
          text: 'В сводке: <b>«💰 Собрать оплату: 3 клиента должны 12 000 ₽»</b>. Что делаешь?',
          quiz: { options: [
            { label: '«Кто должен» → по каждому: пришли деньги — «Занести оплату», нет — «Напомнить»', correct: true, explain: 'Сводка показывает, что важно; разбираешь сверху вниз в «Оплатах».' },
            { label: 'Пишу всем трём одно сообщение «оплатите, пожалуйста»', explain: 'Сначала проверь банк: кто-то мог уже заплатить. И у каждой своя сумма — «Напомнить» готовит её текст.' },
            { label: 'Жду: в следующую субботу посмотрю снова', explain: 'Долг сам не исчезнет, а неделя пройдёт. Сводка — чтобы начать с главного.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'В сводке: <b>«✏️ Дозаполнить 2 заказа: не хватает цены или данных»</b>. Что делаешь?',
          quiz: { options: [
            { label: 'Впишу примерные данные, чтобы пункт ушёл', explain: 'Неверные данные хуже пустых: испортят отчёты и деньги.' },
            { label: '«Задачи» → открыть заказ → «Следующий шаг»; данных не найти — «Пропустить с причиной»', correct: true, explain: 'Доска покажет оба заказа, «Следующий шаг» — какое поле заполнить.' },
            { label: 'Ничего — это не про деньги', explain: 'Без цены и курса не посчитать, сколько клиентка должна. Это тоже деньги.' }
          ] }
        }
      ]
    },

    // Урок 12 «Твой помощник» (С6; текст согласован с VASY 05.10, род нейтральный).
    // Только объяснения и вопросы — помощник не зовётся, токены не тратятся.
    'assistant': {
      id: 'assistant',
      title: 'Твой помощник',
      screens: ['home', 'training'],
      steps: [
        {
          title: '🎉 Ты прошёл(ла) весь курс!',
          text: 'Теперь ты знаешь, где что лежит и как вести клиентку от корзины до выдачи. Но в работе всегда будут ситуации, которых не было в уроках. На такие случаи у тебя есть <b>личный помощник</b>.'
        },
        {
          target: '#assistant-fab', title: 'Помощник всегда под рукой', wait: 6000,
          text: 'Эта кнопка есть на каждом экране. Ещё помощник есть в <b>«?» → «🤖 Спросить помощника»</b> и на красной подсказке, когда что-то пошло не так.'
        },
        // Учебный разговор (отзыв VASY №27): ответ заготовлен в песочнице, обращение не тратится.
        { target: '#assistant-fab', title: 'Попробуй', text: 'Нажми на кнопку — зададим учебный вопрос. В уроке обращение <b>не тратится</b>.', advance: 'click' },
        {
          target: assistantSheet, title: 'Задай вопрос', wait: 6000, place: 'away',
          text: 'Напиши любой вопрос, например: «как занести оплату за два заказа?» — и нажми <b>«Отправить»</b>.',
          advance: { until: () => !!document.querySelector('#training-assistant-sheet [data-helped]') }
        },
        {
          target: assistantSheet, title: 'Ответ', place: 'away',
          text: 'Так выглядит ответ: коротко и по шагам. Сейчас он учебный. Отметь <b>«✅ Помогло»</b> или <b>«❌ Не помогло»</b> — во втором случае можно дописать, что не так, и это уйдёт VASY.',
          advance: { until: () => /Рад, что помог|Ушло VASY/.test((document.getElementById('training-assistant-sheet') || {}).textContent || '') }
        },
        { target: '#training-assistant-sheet [data-close]', title: 'Закрой окно', text: 'Нажми крестик — продолжим.', advance: 'click', place: 'away' },
        {
          title: 'О чём писать',
          text: 'Пиши своими словами, как коллеге:<br>• <b>вопрос</b> — «как занести оплату, если клиентка перевела сразу за два заказа?»;<br>• <b>ошибку</b> — «нажимаю «Сохранить», а ничего не происходит»;<br>• <b>предложение</b> — «было бы удобнее, если бы…».'
        },
        {
          title: 'Объяснять, где ты, не нужно',
          text: 'Помощник сам видит экран, на котором ты сейчас, и твои последние действия. Имён клиентов он не видит.'
        },
        {
          title: 'Если вопрос сложный',
          text: 'Помощник не станет угадывать. Если он не уверен или нужно исправить деньги, он <b>передаст твой вопрос VASY</b> вместе с экраном. VASY разберётся сам и ответит. Ни один вопрос не потеряется, даже если помощник не помог.'
        },
        {
          title: '«Помогло» / «Не помогло»',
          text: 'Отметь после ответа. «Не помогло» тоже уходит VASY: так мы узнаём, что в приложении неудобно.'
        },
        {
          title: '5 обращений в день',
          text: 'В каждом разговоре можно задать вопрос и до 3 уточнений. Поэтому лучше <b>один подробный вопрос</b>, чем пять коротких. Если обращения кончились, пиши в «💡 Неудобно / идея» или VASY напрямую.'
        },
        {
          title: 'Проверка 1 из 2',
          text: 'Нажимаешь «Сохранить» — красная ошибка, непонятно почему. Что делаешь?',
          quiz: { options: [
            { label: 'Нажимаю «Сохранить» ещё раз, пока не получится', explain: 'Повтор той же ошибки ничего не изменит, а иногда создаёт дубли. Спроси, в чём дело.' },
            { label: '«🤖 Спросить» прямо на подсказке ошибки', correct: true, explain: 'Помощник сразу увидит и экран, и текст ошибки — объяснять ничего не нужно.' },
            { label: 'Закрываю и делаю вид, что ничего не было', explain: 'Тогда данные могут не сохраниться, и никто не узнает почему.' }
          ] }
        },
        {
          title: 'Проверка 2 из 2',
          text: 'Помощник ответил: <b>«Передал VASY»</b>. Что это значит?',
          quiz: { options: [
            { label: 'Всё в порядке: VASY посмотрит и ответит, продолжаю работу', correct: true, explain: 'Вопрос записан вместе с экраном — VASY разберётся сам.' },
            { label: 'Помощник сломался, надо спросить ещё раз', explain: 'Не сломался: так и задумано для сложных вопросов. Повтор только потратит обращение.' },
            { label: 'Мой вопрос был глупым', explain: 'Глупых вопросов нет. Сложный вопрос — повод для VASY посмотреть лично.' }
          ] }
        }
      ]
    }
  };

  /**
   * Сводка недели поверх экрана (урок «Субботняя сводка»): учебный пример —
   * те же клиентки и цифры, что в учебных «Задачах» и «Оплатах»; формат —
   * как у weeklySummaryService.buildManagerText на сервере.
   */
  const SummaryMock = (() => {
    const ID = 'training-summary-mock';
    const ddmm = (d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    function sample() {
      const until = new Date();
      const since = new Date(until.getTime() - 7 * 86400000);
      const name = String(window.CURRENT_STAFF_NAME || '').replace(/\s*\d+\s*$/, '').trim();
      return {
        parts: [
          ['head', `👋 ${name ? `${escapeHtmlClient(name)}, привет! ` : ''}<b>Итоги недели</b> · ${ddmm(since)}–${ddmm(until)}`],
          ['week', 'За неделю: 3 новых заказа, 2 оплаты на 8 900 ₽, 4 заказа поехали дальше.'],
          ['praise', '🌟 1 заказ дошёл до клиента — отлично!<br>🌟 Пройдено обучение: «Занести оплату».'],
          ['tasks', '<b>Главное на следующую неделю:</b><br>1. 💰 Собрать оплату: 1 клиент должен 5 000 ₽. Дольше всех — @anya_uchebnaya: 4 дня.<br>2. ✏️ Дозаполнить 2 заказа: не хватает цены или данных.'],
          ['training', '🎓 Обучение: пройдено 5 из 12 — дальше «Лот: несколько кукол одной покупкой» (~4 мин).']
        ],
        buttons: [{ text: '💰 Кто должен', route: 'payments' }, { text: '📋 Задачи', route: 'reminders' }]
      };
    }
    function render({ parts, buttons, caption, kind }) {
      hide();
      const el = document.createElement('div');
      el.id = ID;
      el.dataset.kind = kind;
      el.className = 'fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pointer-events-none';
      el.style.paddingTop = 'calc(env(safe-area-inset-top, 0px) + 64px)';
      // Фон «чата Telegram» — сводка не сливается с экраном под ней.
      el.innerHTML = `
        <div class="w-full max-w-sm bg-sky-100 rounded-3xl p-2.5 shadow-2xl pointer-events-auto">
          <div class="text-center mb-1.5"><span class="inline-block px-2.5 py-0.5 rounded-full bg-sky-900/70 text-white text-[11px]">${caption}</span></div>
          <div class="bg-white rounded-2xl rounded-bl-md shadow p-3 text-[13px] leading-snug text-gray-800 space-y-2 max-h-[46vh] overflow-y-auto">
            ${parts.map(([key, html]) => `<div data-part="${key}">${html}</div>`).join('')}
          </div>
          <div data-part="buttons" class="grid grid-cols-2 gap-1.5 mt-1.5">
            ${buttons.map((b) => `<button type="button" data-route="${escapeHtmlClient(b.route)}" class="py-2 rounded-xl bg-white/95 text-indigo-700 text-[13px] font-medium shadow">${escapeHtmlClient(b.text)}</button>`).join('')}
          </div>
        </div>`;
      el.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => { hide(); navigateTo(b.dataset.route); }));
      document.body.appendChild(el);
    }
    function hide() { const el = document.getElementById(ID); if (el) el.remove(); }
    return {
      showSample() { if (!document.getElementById(ID)) render({ ...sample(), kind: 'sample', caption: '📱 Так сводка приходит в Telegram (учебный пример)' }); },
      hide,
      kind() { const el = document.getElementById(ID); return el ? el.dataset.kind : ''; },
      async showMine() {
        let r;
        try {
          r = await callServer('getMyWeeklySummaryPreview');
        } catch (error) {
          r = { text: `Не получилось собрать сводку: ${escapeHtmlClient(error.message || 'ошибка')}. В субботу она всё равно придёт.`, buttons: [] };
        }
        const parts = String(r.text || '').split('\n\n').map((block, i) => [`mine-${i}`, block.split('\n').join('<br>')]);
        render({ parts, buttons: r.buttons || [], kind: 'mine', caption: '📱 Твоя сводка, если бы суббота была сегодня' });
      }
    };
  })();
})();
