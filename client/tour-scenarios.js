'use strict';

/**
 * Уроки для клиентов (план Б, 05.10.2026) — шаги для общего движка tour.js.
 * id и названия совпадают с server/src/training/clientTrainingCatalog.js.
 * Тексты — на «вы», коротко, про то, ЗАЧЕМ, на учебном примере
 * (training-sandbox.js). Записать ничего нельзя: песочница отклоняет записи,
 * а «Сообщить об оплате» и «Задать вопрос» в уроке только изображают отправку.
 *
 * 06.10.2026, отзыв VASY после прохождения:
 * - одна история через все уроки — ваша учебная Лагуна (TRN201): ждёт
 *   оплаты, едет к вам, о ней вопрос, она в вишлисте; рядом Дракулаура
 *   (TRN202, едет на склад в США) и Клео (TRN203, уже у вас);
 * - «Мой заказ» — «⏩ Перемотать время»: Лагуна идёт по пути, и экран сам
 *   показывает, когда этап становится «Приоритетно сейчас» (наступил И
 *   сумма подтверждена) и как предварительная сумма становится точной;
 * - ничего не печатаем: поля заполняет урок (пример), их можно поправить,
 *   но урок дальше не убегает — «Далее» нажимают сами;
 * - без вопросов-проверок и упражнений («клиент сопротивляется сложным
 *   задачам, это отталкивает от обучения») и без нажатий «для галочки»:
 *   нажимают только то, что само чему-то учит.
 *
 * startRoute — экран, с которого урок начинается (ClientTraining.startLesson).
 */
(function () {
  const nav = (key) => `#bottom-nav [data-nav-key="${key}"]`;
  const hideToast = () => { const t = document.getElementById('save-toast'); if (t) t.classList.add('hidden'); };
  const closeHuntSheet = () => { const scrim = document.querySelector('.hn-scrim'); if (scrim) scrim.click(); };
  const sovyCard = () => { const bar = document.getElementById('sovy-progress-bar'); return bar ? bar.closest('.rounded-2xl') : null; };
  const modalBox = (id) => () => document.querySelector(`#${id} > div`);
  /** Вписать пример в поле формы так, будто его набрали (экран слушает input). */
  const fill = (id, value) => {
    const el = document.getElementById(id);
    if (!el || el.value) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** «⏩ Перемотать время»: Лагуна — на следующий шаг пути, экран перерисовывается. */
  const rewind = {
    label: '⏩ Перемотать время',
    run: async () => {
      if (!window.TrainingSandbox) return;
      window.TrainingSandbox.advanceStory();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };
  const afterRewind = (n) => ({ until: () => !!window.TrainingSandbox && window.TrainingSandbox.storyStep() >= n });
  const payments = '#d-payments-list';
  const orderRollup = '#d-order-rollup';

  window.TourScenarios = {
    where: {
      id: 'where', title: 'Где что', startRoute: 'news',
      steps: [
        { title: 'Привет! 👋', text: 'Сейчас вы на «Главной» — здесь новости магазина. Внизу шесть разделов — пройдёмся по ним. Это учебный пример: ваша учебная Лагуна и её подружки, ничего не сломается.' },
        { target: nav('orders'), advance: 'click', title: 'Заказы', text: 'Главное — ваши заказы. Нажмите «Заказы».' },
        { target: nav('wishlist'), advance: 'click', title: 'Это «Заказы»', text: 'Каждая кукла, где она сейчас и сколько осталось оплатить. Сверху — что нужно оплатить прямо сейчас. Дальше — «Мои куклы».' },
        { target: nav('contests'), advance: 'click', title: 'Это «Мои куклы»', text: 'Вишлист — кого ищете, полка — кто уже у вас, и коллекции. Теперь «Конкурсы».' },
        { target: nav('questions'), advance: 'click', title: 'Это «Конкурсы»', text: 'Задания, за которые начисляются совы, и розыгрыши. Дальше — «Вопросы».' },
        { target: nav('profile'), advance: 'click', title: 'Это «Вопросы»', text: 'Спросить менеджера, сообщить о проблеме или предложить идею. Ответ придёт сюда и сообщением в чат. И последний — «Профиль».' },
        { title: 'Это «Профиль» 🎉', text: 'Совы и билеты, ваши достижения, обучение и уведомления. Теперь вы знаете, где что лежит. Дальше — урок «Мой заказ»: из чего цена и что когда платить.' }
      ]
    },

    'my-order': {
      id: 'my-order', title: 'Мой заказ', startRoute: 'orders',
      block: ['#refresh-btn', '#back-btn', '#report-payment-btn', '#ask-question-btn', '#mark-received-btn'],
      steps: [
        { target: '[data-order-card="TRN201"]', advance: 'click', title: 'Ваша Лагуна', text: 'Это ваш учебный заказ — Лагуна. Её ещё не выкупили: сначала нужно оплатить основную сумму. Откройте её карточку.' },
        {
          target: payments, title: 'Из чего цена',
          text: 'Платите не всё сразу, а по этапам:<br>• <b>Основная</b> — стоимость выкупа куклы и наша комиссия;<br>• <b>Вес</b> — доставка из США в Казахстан;<br>• <b>СДЭК</b> — из Казахстана в Россию;<br>• <b>Доставка по России</b> — до вас.<br>«(предварительно)» — сумма примерная: точную узнают, когда кукла доедет до этого этапа.'
        },
        {
          target: orderRollup, actions: [rewind], advance: afterRewind(1),
          title: 'Приоритетно сейчас',
          text: '<b>«Приоритетно сейчас»</b> — то, что нужно оплатить сейчас: этап наступил и сумма подтверждена. У Лагуны это <b>3 000 ₽</b> основной оплаты.<br><br>Предварительные суммы тоже можно оплатить заранее, но их скорее всего пересчитают.<br><br>Перемотаем время: вы оплатили 3 000 ₽.'
        },
        {
          target: orderRollup, actions: [rewind], advance: afterRewind(2),
          title: 'Лагуну выкупили ✅',
          text: 'Основная оплачена, магазин отправляет Лагуну на склад в США. Сейчас платить ничего не нужно: вес пока предварительный — 1 300 ₽. Перемотаем дальше.'
        },
        {
          target: payments, actions: [rewind], advance: afterRewind(3),
          title: 'Лагуну взвесили ⚖️',
          text: 'Лагуна на складе в США. Вес стал точным: <b>1 150 ₽</b> вместо примерных 1 300 — и сразу «Приоритетно сейчас».<br><br>Если бы вы оплатили 1 300 ₽ заранее, 150 ₽ остались бы на вашем балансе и пошли в следующие оплаты. Оплатим вес и перемотаем.'
        },
        {
          target: payments, actions: [rewind], advance: afterRewind(4),
          title: 'Лагуна в Казахстане',
          text: 'Лагуна у посредника в Казахстане. Подтвердили СДЭК — <b>600 ₽</b>, теперь его нужно оплатить. Перемотаем дальше.'
        },
        {
          target: payments, actions: [rewind], advance: afterRewind(5),
          title: 'Лагуна в России',
          text: 'Лагуна у посредника в России. Осталась доставка до вас — <b>250 ₽</b>. Оплатим — и в путь.'
        },
        { target: '#d-delivery-ladder', title: 'Лагуна у вас! 🎉', text: 'Все этапы оплачены, путь пройден. Так идёт каждый заказ: «Приоритетно сейчас» появляется, когда этап наступил и сумма подтверждена, — тогда и платите.' }
      ]
    },

    paid: {
      id: 'paid', title: '«Я оплатил(а)»', startRoute: 'order-details/TRN201',
      block: ['#mark-received-btn', '#ask-question-btn', '#back-btn'],
      steps: [
        { target: '#report-payment-btn', advance: 'click', title: 'Перевели деньги?', text: 'Вы перевели 3 000 ₽ за Лагуну. Сообщите об этом — менеджер быстрее найдёт перевод и отметит оплату. Нажмите «Сообщить об оплате».' },
        {
          target: modalBox('report-payment-modal'), allowClick: true, place: 'away',
          onEnter: () => { fill('rp-modal-amount', '3000'); fill('rp-modal-proof', 'Сбербанк, 14:20'); },
          title: 'Мы заполнили пример',
          text: '<b>Сумма</b> — сколько перевели. <b>За что</b>: «Только за этот заказ» — деньги закрепятся за Лагуной, «За все мои заказы» — уйдут в общий остаток и сами распределятся. Внизу — ссылка на чек или пара слов о переводе. По-настоящему впишете свои.'
        },
        { target: '#rp-modal-send', advance: 'click', title: 'Отправляем', text: 'Нажмите «Отправить». В уроке ничего никуда не уйдёт.' },
        { title: 'Готово! ✅', text: 'Менеджер найдёт перевод и отметит оплату — «Приоритетно сейчас» у Лагуны исчезнет, а полоска этапа заполнится.' }
      ]
    },

    'order-question': {
      id: 'order-question', title: 'Вопрос по заказу', startRoute: 'order-details/TRN202',
      block: ['#mark-received-btn', '#report-payment-btn', '#open-bug-report-btn', '#open-suggestion-btn', '#back-btn'],
      steps: [
        { target: '#ask-question-btn', advance: 'click', title: 'Вопрос из заказа', text: 'Хотите узнать, когда приедет Дракулаура? Спросите прямо из её заказа — менеджер сразу увидит, о какой кукле речь. Нажмите «Задать вопрос».' },
        {
          target: '#question-send-btn', advance: 'click',
          onEnter: () => fill('question-text-input', 'Когда примерно приедет?'),
          title: 'Отправляем', text: 'Мы вписали пример вопроса — по-настоящему напишете свой. Нажмите «Отправить». В уроке вопрос никуда не уходит.'
        },
        {
          target: '[data-question-id="TRN-Q1"]',
          onEnter: () => { hideToast(); if (Tour.currentScreen() !== 'questions') navigateTo('questions'); },
          title: 'Ответ — в «Вопросах»', text: 'Все вопросы и ответы — в разделе «Вопросы». Вот ответ менеджера про Дракулауру. Ещё бот пришлёт его сообщением в чат.'
        },
        { target: '#open-ask-question-btn', title: 'Не про заказ?', text: '«Вопрос» — спросить о чём угодно. «Проблема» — если что-то не работает, «Идея» — если есть предложение.' }
      ]
    },

    'my-dolls': {
      id: 'my-dolls', title: 'Мои куклы', startRoute: 'wishlist',
      block: ['[data-act="own"]', '[data-act="grail"]', '[data-act="del"]', '[data-act="edit"]', '#share-btn', '#refresh-btn'],
      steps: [
        { target: '#tab-switcher', title: 'Мои куклы', text: 'Три вкладки: <b>Вишлист</b> — кого ищете, <b>Чеклист</b> — кто уже на полке, <b>Коллекции</b> — наборы, которые можно собрать.' },
        { target: '[data-wid="TRNW1"]', title: 'Ваша Лагуна', text: 'Лагуна тоже здесь: вы её заказали, и точки на плитке показывают путь — заказана → выкуплена → едет → получена. Приедет — переедет на полку.' },
        { target: '[data-wid="TRNW2"]', title: 'Грааль ⭐', text: 'Френки — ваш Грааль, кукла мечты: золотая звёздочка. Граалей можно отметить до 5 — за них мы особенно стараемся.' },
        { target: '[data-wid="TRNW3"]', advance: 'click', title: 'Карточка куклы', text: 'Нажмите на Гулию — откроется её карточка.' },
        { target: '.hn-sheet.show .hn-acts', wait: 4000, place: 'away', title: 'Что можно сделать', text: '«У меня!» — кукла переедет на полку. «Сделать Граалем» — отметить мечту. В уроке не нажимаем.' },
        { target: '#add-item-btn', onEnter: closeHuntSheet, title: 'Добавить куклу', text: 'Плюс вверху: <b>по фото</b> (ИИ сам узнает кукол, можно несколько сразу), из каталога или вручную — по названию или ссылке.' }
      ]
    },

    shelf: {
      id: 'shelf', title: 'Полка и коллекции', startRoute: 'wishlist',
      block: ['#share-bar-confirm-btn', '[data-act]', '#refresh-btn', '#collections-list button', '#collections-list [data-collection-id]'],
      steps: [
        { target: '.tab-btn[data-tab="checklist"]', advance: 'click', title: 'Ваша полка', text: 'Откройте «Чеклист» — это ваша полка.' },
        { target: '#share-btn', advance: 'click', title: 'Кто уже у вас', text: 'Здесь куклы, которые уже у вас, — Клео и Дракулаура. За полку открываются достижения: первая кукла, 5, 10 и 25 кукол.<br><br>Полкой можно похвастаться — нажмите «Поделиться» вверху.' },
        {
          target: '#checklist-list', advance: { until: () => /\(\d+\)/.test((document.getElementById('share-bar-count') || {}).textContent || '') },
          title: 'Отметьте кукол', text: 'Нажмите на куклу — на ней появится галочка.'
        },
        { target: '#share-bar', title: 'Картинка в чат', text: 'Кнопка внизу пришлёт в чат с ботом красивую картинку с вашими куклами — её легко переслать подругам. В уроке не отправляем. За первый раз — достижение «Есть чем гордиться».' },
        { target: '.tab-btn[data-tab="collections"]', advance: 'click', title: 'Коллекции', text: 'Теперь откройте «Коллекции».' },
        { target: '#collections-list', title: 'Соберите всю', text: 'Коллекция — набор кукол одной волны. Полоска — сколько уже на полке: <b>2 из 6</b>. Соберёте всю — откроется золотое достижение «Полный комплект».' }
      ]
    },

    contests: {
      id: 'contests', title: 'Конкурсы, совы и билеты', startRoute: 'contests',
      block: ['#lotteries-list button', '#tasks-list button', '#refresh-btn'],
      steps: [
        { target: '#tasks-list', title: 'Задания', text: 'За задания начисляются совы. Авто-задания засчитываются сами, ручные — отправляете на проверку менеджеру.' },
        { target: '[data-task-id="TRN-T2"]', title: 'Совы за обучение', text: 'Например: пройдите 3 урока — <b>+10 сов</b>. Прогресс виден прямо в карточке.' },
        { target: '#lotteries-list', title: 'Розыгрыши', text: 'В розыгрыше участвуете, когда выполнены условия — они отмечены галочками. В «Премиум»-розыгрышах ячейку бронируют за 1 билет.' },
        { target: nav('profile'), advance: 'click', title: 'Где ваши совы', text: 'Совы и билеты лежат в «Профиле». Нажмите его внизу.' },
        { target: sovyCard, title: 'Совы и билеты', text: 'Когда шкала сов заполнится, получите билет — у вас уже есть 1. Подробности с цифрами — «Как устроены Совы и Билеты?» под шкалой.' }
      ]
    }
  };
})();
