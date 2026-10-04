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
 * group?, groupLeader?, skipIf?, missingIf?, wait?, free?, actions?, skippedText? } —
 * подробности в JSDoc `_tour.js`.
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
        { target: `${firstCartCard} .client-search`, title: 'Клиент', text: 'Для тренировки — учебный клиент: начни вводить <b>vaskaofv</b> и выбери из списка. Потом «Далее».', free: true, scroll: true },
        { target: '#cart-payments-list', title: 'Сколько уже оплатили', text: 'В конце — выбрать обязательно: <b>Ничего / Часть / Всё</b>. Это деньги, которые клиент уже перевёл.', optional: true, free: true },
        { target: '#save-cart-btn', title: 'Сохранить', text: 'В работе здесь — «Сохранить»: покажется сводка, проверишь и подтвердишь. Сейчас учебный режим — <b>не сохраняем</b>, ничего не запишется.' }
      ]
    }
  };
})();
