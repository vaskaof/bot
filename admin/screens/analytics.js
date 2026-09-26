'use strict';

/**
 * Экран "Аналитика" (17.08.2026, project_bot_knopka_admin_bottom_nav_redesign)
 * — читает `getUsageAnalytics(days)` (см. `webapp-api.md` за форматом ответа).
 * Закрывает долг project_bot_knopka_usage_analytics — сбор данных был готов
 * с 16.08.2026, UI сознательно не делался до этого раунда.
 *
 * НЕ входит в основную нижнюю навигацию (6 постоянных пунктов) — открывается
 * с экрана "Ещё" (`more.js`) на узких экранах, на широких становится обычной
 * inline-кнопкой нав-бара (см. app.html). Нет диаграммной библиотеки в
 * проекте — гистограмма по дням нарисована обычными div'ами
 * (высота — процент от максимума), тот же принцип "минимум зависимостей",
 * что и у остального фронтенда.
 *
 * Per-user срез (17.08.2026, продолжение того же долга) — блок "Активные
 * пользователи" читает `getUsageTopUsers(days, limit)`; клик по строке
 * переключает экран в режим drill-down на одного пользователя
 * (`getUserUsageAnalytics(telegramId, days)`, `state.userView`). Отдельного
 * route на это НЕ заведено — переключение чисто внутри `render()`, "Назад"
 * из drill-down возвращает к общей сводке (не к предыдущему экрану).
 *
 * "Почти бесплатные" срезы (17.08.2026, тот же день) — те же данные, что уже
 * собирались, просто раньше не показывались: дельта к предыдущему такому же
 * окну на KPI-плитках (`summary.prevTotals`), тепловая карта активности по
 * часам/дням недели (`summary.byHourDow`, одна последовательная шкала
 * indigo — светлота = величина, см. dataviz-skill), таблица медленных
 * методов по `duration_ms` (`summary.slowMethods`, HAVING count>=3 — один
 * выброс не должен возглавлять список). Только на общей сводке, НЕ на
 * per-user drill-down.
 *
 * Вторая фаза долга (17.08.2026, тот же день, продолжение) — три новых
 * среза, тоже только на общей сводке:
 * - `getUsageRetention(days)` — retention/новые-вернувшиеся, ТОЛЬКО клиенты
 *   (админы исключены на бэкенде — иначе метрика всегда ~100%, см.
 *   analyticsRepository.getRetentionSummary). `dataSince` — с какого момента
 *   вообще копится `analytics_events`; если этот момент моложе 2×`days`,
 *   предыдущее окно неполное и retention/new-count статистически ненадёжны
 *   — экран показывает предупреждение вместо чисел, а не молчит.
 * - `getUsageErrorTrend(days)` — тренд ошибок по методам во времени
 *   (top-5 методов по числу ошибок + дневная раскладка), "прочее" считается
 *   на фронте как `totalByDay - Σ(top-5 в этот день)`, отдельного запроса
 *   под это нет.
 * - `exportUsageEvents(days)` — CSV сырых событий окна (не агрегаты — они и
 *   так на экране), кнопка в шапке рядом с "Обновить". Сервер режет на
 *   MAX_EXPORT_ROWS=20000 строк молча (см. analyticsService) — экран это
 *   никак не сигналит, риск принят как разумный для внутреннего инструмента.
 *   Доп. правка тем же днём — CSV-разделитель `,`→`;` (Excel в ru-локали
 *   Windows иначе кладёт всё в один столбец, см. webapp-api.md).
 *
 * Воронка каталог→вишлист→заказ (17.08.2026, п.9 бэклога, `getUsageFunnel
 * (days)`, тоже только на общей сводке) — согласовано с VASY ДВА раздельных
 * числа, не единая 3-ступенчатая воронка (см. `funnelBlock`): "Вишлист →
 * Заказ" точный (Wishlist_ID match, серверная сторона в `funnelService.js`),
 * "Поиск → Вишлист" — эвристика (Postgres, соседство по времени в
 * `analyticsRepository.getSearchToWishlistConversion`), помечена на экране
 * как "оценка", не смешивается с точной цифрой в один общий процент.
 *
 * Человекочитаемые названия методов (14.09.2026, запрос VASY) — до этого
 * "Топ методов"/"Медленные методы"/"Тренд ошибок"/"Последние ошибки" везде
 * показывали сырой технический идентификатор метода (`getOrdersList` и
 * т.п.) без перевода. METHOD_LABELS/methodLabel() ниже — статический
 * словарь на основе `server/src/api/contract.js` (ADMIN_METHODS+
 * CLIENT_METHODS), показывает "Название (technicalName)"; метод, которого
 * нет в словаре (новый метод, GAS-прокси route:'proxy' и т.п.) — тихий
 * фолбэк на сырой идентификатор, как было раньше. Пополнять словарь при
 * добавлении новых методов НЕ обязательно (не блокирует работу экрана),
 * но желательно для читаемости.
 */
window.Screens = window.Screens || {};

const METHOD_LABELS = {
  // ADMIN_METHODS (server/src/api/contract.js)
  addCatalogLink: 'Добавить ссылку в каталог',
  addCatalogLinkWithResolve: 'Добавить ссылку в каталог (с автоподбором)',
  addDictionaryValue: 'Добавить значение в справочник',
  addStaffMember: 'Добавить сотрудника',
  addWishlistItemForClient: 'Добавить позицию в вишлист клиента',
  applyCollectiveLogisticsSharesToOrders: 'Применить доли логистики коллективки к заказам',
  applyCreditToOldModelOrder: 'Применить кредит к заказу (старая модель)',
  applyFxBufferRecompute: 'Применить пересчёт валютного буфера',
  approvePaymentClaim: 'Подтвердить заявку об оплате',
  approveTaskSubmission: 'Одобрить выполнение задания',
  assignClientPayoutRole: 'Назначить роль выплаты клиенту',
  assignOrderToCollective: 'Привязать заказ к коллективке',
  assignOrdersToCollective: 'Привязать заказы к коллективке',
  blockClient: 'Заблокировать клиента',
  bulkDeleteOrders: 'Массовое удаление заказов',
  cancelClientPayment: 'Отменить платёж клиента',
  cancelLottery: 'Отменить лотерею',
  cancelManualAllocation: 'Отменить ручное распределение',
  cancelOrderPayment: 'Отменить оплату заказа',
  checkClientWishlistMatch: 'Проверить совпадение с вишлистом клиента',
  findClientWishlistMatch: 'Найти позицию вишлиста клиента для заказа',
  setOrderWishlistLink: 'Связать заказ с вишлистом',
  getOrderLinkSuggestions: 'Спрос: подсказки «уже заказано — связать»',
  getHuntInviteCandidates: 'Клиенты: кого пригласить в «Мои куклы»',
  sendHuntInvite: 'Клиенты: приглашение в «Мои куклы» отправлено',
  createCart: 'Создать корзину',
  createCollective: 'Создать коллективку',
  createLot: 'Создать лот',
  createLottery: 'Создать лотерею',
  createManualAllocation: 'Создать ручное распределение',
  createNews: 'Создать новость',
  createOrder: 'Создать заказ',
  createOrdersBatch: 'Создать заказы пачкой',
  createSku: 'Создать позицию каталога',
  createTask: 'Создать задание',
  deactivateStaffMember: 'Деактивировать сотрудника',
  deleteCatalogLink: 'Удалить ссылку каталога',
  deleteCollective: 'Удалить коллективку',
  deleteFinancialSetting: 'Удалить финансовую настройку',
  deleteNews: 'Удалить новость',
  deleteOrder: 'Удалить заказ',
  deleteSku: 'Удалить позицию каталога',
  drawLotteryPrize: 'Разыграть приз лотереи',
  editClientPayment: 'Изменить платёж клиента',
  editOrderPayment: 'Изменить оплату заказа',
  exportUsageEvents: 'Экспорт событий аналитики (CSV)',
  findDuplicateCatalogClusters: 'Найти дубли в каталоге',
  finishLottery: 'Завершить лотерею',
  getAdminLotteriesList: 'Список лотерей (админ)',
  getAdminLotteryBoard: 'Доска лотереи (админ)',
  getAdminTasksList: 'Список заданий (админ)',
  getBankStatementRows: 'Строки банковской выписки',
  getBulkOrderDeletionPreview: 'Превью массового удаления заказов',
  getCalculatorKztToRubRate: 'Курс ₸→₽ (калькулятор)',
  getCartDetails: 'Детали корзины',
  getCartsList: 'Список корзин',
  getCatalogLinksForSku: 'Ссылки позиции каталога',
  getCatalogList: 'Список каталога',
  getCatalogLinesTree: 'Справочник линеек',
  createCatalogLine: 'Создать ветку линеек',
  updateCatalogLine: 'Изменить ветку линеек',
  moveCatalogLine: 'Перенести ветку линеек',
  deleteCatalogLine: 'Удалить ветку линеек',
  setCatalogLineReferenceStatus: 'Отметить «состав сверен»',
  getCatalogSeriesMapping: 'Разметка серий',
  assignCatalogSeriesToLine: 'Разметить серию в ветку',
  setCatalogSkuLine: 'Линейка позиции каталога',
  setCatalogSkuExtraLines: '«Также в ветке» позиции каталога',
  listCatalogCharacters: 'Словарь персонажей',
  createCatalogCharacter: 'Добавить персонажа',
  updateCatalogCharacter: 'Изменить персонажа',
  deleteCatalogCharacter: 'Удалить персонажа',
  getCatalogCheckReport: 'Проверка каталога',
  getCatalogCheckCount: 'Счётчик проверки каталога',
  getCatalogNameDictionary: 'Словарь русских имён',
  saveCatalogNameDictionary: 'Сохранение русских имён',
  getCatalogTagShortNames: 'Названия по тегам',
  applyCatalogTagShortNames: 'Применение названий по тегам',
  rejectCatalogTagShortName: 'Отказ от названия по тегам',
  chooseCatalogReferenceCandidate: 'Выбрать куклу из справочника',
  dismissCatalogCheckItem: 'Скрыть строку проверки каталога',
  runCatalogReferenceAudit: 'Проверить каталог сейчас',
  refreshDollReference: 'Обновить справочник кукол',
  getCatalogOrdersAudit: 'Аудит заказов по каталогу',
  getCatalogTagValues: 'Значения тегов каталога',
  getClientBlockLog: 'Журнал блокировок клиента',
  getClientByTelegramId: 'Клиент по Telegram ID',
  getClientCreditBalance: 'Кредитный баланс клиента',
  getClientPaymentsRollup: 'Сводка платежей клиента',
  getClientPayoutRoles: 'Роли выплат клиента',
  getClientReport: 'Отчёт по клиенту',
  getClientsList: 'Список клиентов',
  getClientsMoneyContext: 'Денежный контекст клиентов',
  getClosedWithoutPurchaseReport: 'Отчёт "закрыты без выкупа"',
  getCollectiveAutomationConfig: 'Настройки автоматизации коллективки',
  getCollectiveDetails: 'Детали коллективки',
  getCollectiveLogisticsContext: 'Контекст логистики коллективки',
  getCollectivesList: 'Список коллективок',
  getCommissionLowReasonReport: 'Отчёт по заниженной комиссии',
  getContestDashboard: 'Дашборд конкурсов/билетов',
  getCostBufferReport: 'Отчёт по буферу расходов',
  getDeletedOrdersList: 'Список удалённых заказов',
  getDictionaries: 'Справочники',
  getEarmarksForClient: 'Метки/резервы клиента',
  getEntityAuditLog: 'Журнал изменений сущности',
  getFinancialSettings: 'Финансовые настройки',
  getFxBufferPlanVsFactReport: 'План/факт валютного буфера',
  getFxBufferRecomputeSuggestion: 'Предпросмотр пересчёта буфера',
  getFxExposureAlerts: 'Алерты валютного риска',
  getIntermediaryCommissionRate: 'Комиссия посредника',
  getLotDetails: 'Детали лота',
  getLotsList: 'Список лотов',
  getLotteryParticipants: 'Участники лотереи',
  getManagerPerformanceReport: 'Отчёт по менеджерам',
  getMarginReport: 'Отчёт по марже',
  getMyAccessInfo: 'Информация о доступе (свой аккаунт)',
  getNewsList: 'Список новостей',
  getOrderDeletionPreview: 'Превью удаления заказа',
  getOrderDetails: 'Детали заказа',
  getOrderForecast: 'Прогноз расходов заказа',
  getOrderPurchaseSummary: 'Сводка выкупов по заказу',
  getOrderWriteoffs: 'Списания по заказу',
  getOrdersForClientAdmin: 'Заказы клиента (админ)',
  getOrdersList: 'Список заказов',
  getOwnPurchasesReport: 'Отчёт по личным закупкам',
  getPaymentsForClient: 'Платежи клиента',
  getPendingPaymentClaims: 'Заявки об оплате (ожидают)',
  getPendingTaskSubmissions: 'Заявки на задания (ожидают)',
  getPnlSnapshot: 'Снимок P&L',
  getQuestionsForClientAdmin: 'Вопросы клиента (админ)',
  getQuestionsList: 'Список вопросов',
  getRatesForDate: 'Курс на дату',
  getRecentApprovedTaskSubmissions: 'Недавно одобренные задания',
  getRemainingLotteryParticipants: 'Оставшиеся участники лотереи',
  getReminders: 'Напоминания',
  getRemindersSummary: 'Сводка напоминаний',
  getSharePayoutsReport: 'Отчёт по выплатам долей',
  getShippingRecommendations: 'Рекомендации по отправке',
  getSkuCostByChannelReport: 'Себестоимость по каналам',
  getSkuCostHistoryReport: 'История себестоимости SKU',
  getSkuDetails: 'Детали позиции каталога',
  getStaffAuditLog: 'Журнал действий персонала',
  getStaffList: 'Список персонала',
  getStaffFilterOptions: 'Список персонала для фильтра',
  getUsageAnalytics: 'Аналитика использования (сводка)',
  getUsageErrorTrend: 'Тренд ошибок',
  getUsageFunnel: 'Воронка каталог→вишлист→заказ',
  getUsageRetention: 'Возврат клиентов',
  getUsageTopUsers: 'Активные пользователи',
  getUserUsageAnalytics: 'Аналитика по пользователю',
  getWalletBalance: 'Баланс кошелька',
  getWishlistDemand: 'Спрос по вишлисту',
  getWishlistMatchQueue: 'Недобавленные из вишлиста',
  getWishlistMatchQueueCount: 'Недобавленные из вишлиста: счётчик',
  resolveWishlistQueueGroup: 'Недобавленные из вишлиста: решение',
  searchWishlistCandidatesAdmin: 'Поиск куклы (каталог + справочник)',
  getWishlistForClientAdmin: 'Вишлист клиента (админ)',
  getWorkingCapitalFundBalance: 'Остаток фонда оборотных средств',
  importBankStatement: 'Импорт банковской выписки',
  linkStaffAccounts: 'Связать аккаунты сотрудника',
  linkWishlistItemToSku: 'Привязать вишлист к каталогу',
  listBankStatements: 'Список банковских выписок',
  listOrderWriteoffs: 'Список списаний',
  listPnlSnapshots: 'Список снимков P&L',
  markSharePayout: 'Отметить выплату доли',
  previewApplyCollectiveLogisticsSharesToOrders: 'Превью применения долей логистики',
  previewDeliveryStatusChange: 'Превью смены статуса доставки',
  publishLottery: 'Опубликовать лотерею',
  publishNews: 'Опубликовать новость',
  reactivateStaffMember: 'Восстановить сотрудника',
  recordCartPurchaseEvent: 'Записать выкуп по корзине',
  recordClientPaymentDirect: 'Записать платёж клиента напрямую',
  recordFxConversion: 'Записать конвертацию валюты',
  recordOrderPayment: 'Записать оплату заказа',
  recordOrderWriteoff: 'Записать списание по заказу',
  recordPurchaseEvent: 'Записать факт выкупа',
  refreshCatalogList: 'Обновить список каталога',
  refreshOrdersList: 'Обновить список заказов',
  refreshRate: 'Обновить курс валют',
  refundClientCredit: 'Вернуть кредит клиенту',
  rejectPaymentClaim: 'Отклонить заявку об оплате',
  rejectTaskSubmission: 'Отклонить выполнение задания',
  releaseClientCredit: 'Списать кредит клиента',
  releaseClientCreditForClient: 'Списать кредит клиента (со счёта клиента)',
  renameStaffMember: 'Переименовать сотрудника',
  replacePayoutShares: 'Заменить доли выплат',
  resolveOrderProductLink: 'Распознать ссылку товара для заказа',
  resolveProductLinkForAdmin: 'Распознать ссылку товара (админ)',
  getReferenceModelPrefill: 'Новая позиция из справочника кукол',
  restoreOrder: 'Восстановить заказ',
  revokeClientPayoutRole: 'Снять роль выплаты клиента',
  revokeTaskReward: 'Отозвать награду за задание',
  saveCollectiveLogisticsReconciliation: 'Сохранить сверку логистики коллективки',
  saveQuestionAnswer: 'Сохранить ответ на вопрос',
  searchClients: 'Поиск клиентов',
  searchOrdersForCollective: 'Поиск заказов для коллективки',
  searchSku: 'Поиск по каталогу',
  setCartManagerId: 'Назначить менеджера корзины',
  setClientIntermediary: 'Отметить клиента посредником (легаси)',
  setClientManagerId: 'Назначить менеджера клиента',
  setClientType: 'Изменить тип клиента',
  setCollectiveSentAt: 'Указать дату отправки коллективки',
  setCollectiveStatusMapping: 'Настроить соответствие статусов коллективки',
  setIntermediaryCommissionRate: 'Установить комиссию посредника',
  setOrderLogisticsUnits: 'Указать единицы логистики заказа',
  setOrdersDeliveryStatus: 'Массовая смена статуса доставки',
  setOrdersStatusOrder: 'Массовая смена статуса заказа',
  setReminderStageAmount: 'Указать сумму стадии напоминания',
  setStaffCanViewAllClients: 'Настроить видимость всех клиентов сотруднику',
  snoozeReminder: 'Отложить напоминание',
  takePnlSnapshot: 'Сделать снимок P&L',
  toggleTaskActive: 'Включить/выключить задание',
  unassignOrderFromCollective: 'Отвязать заказ от коллективки',
  unassignOrdersFromCollective: 'Отвязать заказы от коллективки',
  unblockClient: 'Разблокировать клиента',
  unlinkStaffAccounts: 'Отвязать аккаунты сотрудника',
  updateCollective: 'Изменить коллективку',
  updateLottery: 'Изменить лотерею',
  updateNews: 'Изменить новость',
  updateOrder: 'Изменить заказ',
  updateSku: 'Изменить позицию каталога',
  updateStaffRole: 'Изменить роль сотрудника',
  updateTask: 'Изменить задание',
  upsertFinancialSetting: 'Сохранить финансовую настройку',
  // CLIENT_METHODS (server/src/api/contract.js)
  addWishlistItem: 'Добавить в вишлист',
  bookLotteryCell: 'Забронировать ячейку лотереи',
  deleteWishlistItem: 'Удалить из вишлиста',
  getClientNewsFeed: 'Лента новостей',
  getClientOrderDetails: 'Детали заказа (клиент)',
  getClientOrdersList: 'Список заказов (клиент)',
  getClientQuestionsList: 'Список вопросов (клиент)',
  getClientWishlist: 'Вишлист',
  confirmWishlistMatch: 'Вишлист: «Да, это она»',
  rejectWishlistMatch: 'Вишлист: «Нет, другая»',
  searchWishlistCandidates: 'Вишлист: поиск куклы по названию',
  getLotteriesList: 'Список лотерей',
  getLotteryBoard: 'Доска лотереи',
  getMyCreditBalance: 'Мой кредитный баланс',
  getMyNotificationSettings: 'Настройки уведомлений',
  getMyPaymentClaims: 'Мои заявки об оплате',
  getMyPaymentsRollup: 'Сводка моих платежей',
  getMyPoolLeftover: 'Остаток моего пула',
  getReferralInfo: 'Реферальная информация',
  getTasksList: 'Список заданий',
  getUserContext: 'Контекст пользователя',
  joinLottery: 'Участвовать в лотерее',
  recordPrivacyConsent: 'Согласие с политикой конфиденциальности',
  resolveWishlistLink: 'Распознать ссылку для вишлиста',
  searchSkuForClient: 'Поиск по каталогу (клиент)',
  setMyNotificationSettings: 'Сохранить настройки уведомлений',
  setNewsSubscription: 'Подписка на новости',
  submitOrderQuestion: 'Задать вопрос',
  submitPaymentClaim: 'Заявить об оплате',
  submitTaskProof: 'Отправить задание на проверку',
  updateWishlistItem: 'Изменить позицию вишлиста',
  updateWishlistItemStatus: 'Изменить статус позиции вишлиста',
  getHuntState: 'Охота: анонс и праздники',
  markCelebrationsSeen: 'Охота: праздник показан',
  markArrivedSeen: 'Охота: «на полку» показано',
  getTransitOffers: 'Охота: «Ваши заказы в пути»',
  getTransitOfferCount: 'Заказы: приглашение «отметьте в Моих куклах»',
  getMyAchievements: 'Профиль: достижения',
  markAchievementsSeen: 'Охота: достижение показано',
  answerTransitOffers: 'Охота: отметить заказы в пути',
  markHuntIntroSeen: 'Охота: анонс показан',
  setWishlistItemGrail: 'Грааль: поставить/снять',
  getClientCollectionDetail: 'Альбом коллекции'
};

function methodLabel(method) {
  const label = METHOD_LABELS[method];
  return label ? `${label} (${method})` : method;
}

/**
 * Блок "Бот: активность по командам" (план "Навигация бота", Этап Н5,
 * 16.09.2026, запрос VASY "понимать активность пользователей") — читает
 * `getBotUsageSummary(days)`, ОТДЕЛЬНЫЙ от `getUsageAnalytics` источник
 * (таблица `bot_command_events`, не `analytics_events` — те два домена не
 * смешиваются, см. миграцию `create-bot-command-events`). Те же
 * "Название (technicalName)" подписи, что METHOD_LABELS выше (14.09.2026,
 * запрос VASY) — тот же принцип, отдельный небольшой словарь, т.к. это
 * команды бота, не методы API.
 */
const BOT_COMMAND_LABELS = {
  start: 'Запуск бота',
  menu: 'Команда /menu',
  my_orders: 'Мои заказы (команда)',
  history: 'Завершённые (команда)',
  payments: 'Оплаты (команда)',
  calc: 'Курс валют (команда)',
  invite: 'Пригласить друга (команда)',
  wishlist_photo: 'Фото в вишлист (команда)',
  'menu:open': 'Открыть меню (кнопка на якоре)',
  'menu:home': 'Главное меню',
  'menu:ord:a': 'Меню → Мои заказы',
  'menu:ord:c': 'Меню → Завершённые',
  'menu:fx': 'Меню → Курс валют',
  'menu:wish': 'Меню → Фото в вишлист',
  'menu:bonus': 'Меню → Бонусы и друзья',
  'menu:help': 'Меню → Связаться'
};

function botCommandLabel(command) {
  const label = BOT_COMMAND_LABELS[command];
  return label ? `${label} (${command})` : command;
}

window.Screens.analytics = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Аналитика</h1>
    `;
    document.getElementById('header-actions').innerHTML = `
      <button id="export-analytics" title="Экспорт в CSV" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="download" class="w-5 h-5"></i>
      </button>
      <button id="refresh-analytics" title="Обновить" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
      </button>
    `;
    // drill-down состояние: null — общая сводка, иначе {telegramId, label}
    // выбранного пользователя (см. topUsersList → openUser).
    let activeUser = null;

    document.getElementById('back-btn').addEventListener('click', () => {
      if (activeUser) {
        activeUser = null;
        load();
        return;
      }
      navigateTo('more');
    });

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="flex items-center justify-between mb-3">
          <div id="analytics-subtitle" class="text-[11px] text-gray-400">Кто и как пользуется приложением</div>
          <select id="days-select" class="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-indigo-400">
            <option value="7">7 дней</option>
            <option value="14" selected>14 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
          </select>
        </div>

        <div id="analytics-body">
          <div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>
        </div>
      </main>
    `;

    const daysSelect = document.getElementById('days-select');
    const refreshBtn = document.getElementById('refresh-analytics');
    const exportBtn = document.getElementById('export-analytics');
    const body = document.getElementById('analytics-body');
    const subtitle = document.getElementById('analytics-subtitle');

    load();

    daysSelect.addEventListener('change', load);
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      await load();
      const liveIcon = refreshBtn.querySelector('svg');
      if (liveIcon) liveIcon.classList.remove('animate-spin');
    });

    // Экспорт CSV — guard-check + disabled на время запроса (тот же fail-safe
    // паттерн, что и у форм записи, хотя тут только чтение — большой days
    // может занять заметное время на сервере).
    exportBtn.addEventListener('click', async () => {
      if (exportBtn.disabled) return;
      exportBtn.disabled = true;
      const icon = exportBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      try {
        const days = Number(daysSelect.value);
        const csv = await callServer('exportUsageEvents', days);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_events_${days}d.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        showSaveToast(false, `Ошибка экспорта: ${error.message}`);
      } finally {
        exportBtn.disabled = false;
        const liveIcon = exportBtn.querySelector('svg');
        if (liveIcon) liveIcon.classList.remove('animate-spin');
      }
    });

    async function load() {
      body.innerHTML = '<div class="p-6 text-center text-sm text-gray-400">Загрузка...</div>';
      const days = Number(daysSelect.value);
      try {
        if (activeUser) {
          subtitle.textContent = activeUser.label;
          const summary = await callServer('getUserUsageAnalytics', activeUser.telegramId, days);
          renderUser(summary);
        } else {
          subtitle.textContent = 'Кто и как пользуется приложением';
          const [summary, topUsers, retention, errorTrend, funnel, botUsage] = await Promise.all([
            callServer('getUsageAnalytics', days),
            callServer('getUsageTopUsers', days, 10),
            callServer('getUsageRetention', days),
            callServer('getUsageErrorTrend', days),
            callServer('getUsageFunnel', days),
            callServer('getBotUsageSummary', days)
          ]);
          render(summary, topUsers, retention, errorTrend, funnel, days, botUsage);
        }
      } catch (error) {
        body.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${error.message}</div>`;
      }
    }

    function openUser(telegramId, label) {
      activeUser = { telegramId, label };
      load();
    }

    function render(summary, topUsers, retention, errorTrend, funnel, days, botUsage) {
      const { totals, prevTotals, byMethod, byDay, recentErrors, slowMethods, byHourDow } = summary;
      const successRate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0;
      const prevSuccessRate = prevTotals.total > 0 ? Math.round((prevTotals.success / prevTotals.total) * 100) : 0;

      body.innerHTML = `
        <div class="grid grid-cols-2 gap-2 mb-4">
          ${kpiTile('activity', 'Вызовов всего', totals.total, deltaBadge(totals.total, prevTotals.total, 'neutral'))}
          ${kpiTile('check-circle', 'Успешно', `${successRate}%`, deltaBadge(successRate, prevSuccessRate, 'up'))}
          ${kpiTile('alert-triangle', 'Ошибок', totals.failed, deltaBadge(totals.failed, prevTotals.failed, 'down'))}
          ${kpiTile('user', 'Активных админов', totals.uniqueAdmins)}
          ${kpiTile('users', 'Активных клиентов', totals.uniqueClients)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Вызовов по дням</div>
          ${byDay.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : dayChart(byDay)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Активность по часам и дням недели</div>
          ${byHourDow.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : heatmap(byHourDow)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Топ методов</div>
          ${byMethod.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : methodTable(byMethod)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Медленные методы</div>
          ${slowMethods.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : slowMethodsTable(slowMethods)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Возврат клиентов (только клиенты, без админов)</div>
          ${retentionBlock(retention, days)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Тренд ошибок по методам</div>
          ${errorTrend.totalByDay.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Ошибок нет 🎉</div>' : errorTrendChart(errorTrend)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Каталог → Вишлист → Заказ</div>
          ${funnelBlock(funnel)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Бот: активность по командам</div>
          ${botUsageBlock(botUsage)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Активные пользователи</div>
          ${topUsers.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : topUsersList(topUsers)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Последние ошибки</div>
          ${recentErrors.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Ошибок нет 🎉</div>' : errorsList(recentErrors)}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      body.querySelectorAll('[data-user-telegram-id]').forEach((el) => {
        el.addEventListener('click', () => openUser(el.dataset.userTelegramId, el.dataset.userLabel));
      });
    }

    function renderUser(summary) {
      const { totals, byMethod, byDay } = summary;
      const successRate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0;

      body.innerHTML = `
        <button type="button" id="back-to-users" class="text-xs text-indigo-600 mb-3 flex items-center gap-1">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Все пользователи
        </button>

        <div class="grid grid-cols-3 gap-2 mb-4">
          ${kpiTile('activity', 'Вызовов', totals.total)}
          ${kpiTile('check-circle', 'Успешно', `${successRate}%`)}
          ${kpiTile('alert-triangle', 'Ошибок', totals.failed)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Вызовов по дням</div>
          ${byDay.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : dayChart(byDay)}
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div class="text-sm font-semibold text-gray-900 mb-3">Топ методов</div>
          ${byMethod.length === 0 ? '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>' : methodTable(byMethod)}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      document.getElementById('back-to-users').addEventListener('click', () => {
        activeUser = null;
        load();
      });
    }

    function kpiTile(icon, label, value, deltaHtml) {
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div class="flex items-center gap-1.5 text-gray-400 mb-1">
            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
            <span class="text-[11px]">${escapeHtmlClient(label)}</span>
          </div>
          <div class="text-xl font-semibold text-gray-900">${escapeHtmlClient(String(value))}${deltaHtml || ''}</div>
        </div>
      `;
    }

    /**
     * Дельта к предыдущему такому же окну (см. summary.prevTotals) — signed,
     * цвет = направление × "хорошо ли расти" (goodDirection). 'neutral' —
     * рост объёма вызовов сам по себе не хороший и не плохой, показываем
     * серым, без оценки. previous=0 — делить не на что, дельту не показываем
     * (не "разово было 0, стало N" в проценты — вводит в заблуждение).
     */
    function deltaBadge(current, previous, goodDirection) {
      if (!previous) return '';
      const pct = Math.round(((current - previous) / previous) * 100);
      const up = pct > 0;
      let colorClass = 'text-gray-400';
      if (goodDirection === 'up') colorClass = up ? 'text-green-600' : (pct < 0 ? 'text-red-500' : 'text-gray-400');
      else if (goodDirection === 'down') colorClass = up ? 'text-red-500' : (pct < 0 ? 'text-green-600' : 'text-gray-400');
      const arrow = pct === 0 ? '' : (up ? '▲' : '▼');
      return ` <span class="text-[10px] font-normal ${colorClass}">${arrow}${Math.abs(pct)}%</span>`;
    }

    function dayChart(byDay) {
      const max = Math.max(...byDay.map(d => d.count), 1);
      return `
        <div class="flex items-end gap-1 h-24">
          ${byDay.map(d => `
            <div class="flex-1 flex flex-col items-center justify-end h-full" title="${escapeHtmlClient(d.day)}: ${d.count}">
              <div class="w-full bg-indigo-500 rounded-t" style="height: ${Math.max(4, Math.round((d.count / max) * 100))}%"></div>
            </div>
          `).join('')}
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>${escapeHtmlClient(byDay[0].day)}</span>
          <span>${escapeHtmlClient(byDay[byDay.length - 1].day)}</span>
        </div>
      `;
    }

    /**
     * Тепловая карта активности — одна последовательная шкала (indigo,
     * светлота = величина), не палитра identity-цветов, поэтому
     * categorical-валидатор dataviz-skill сюда не применяется (см. его же
     * color-formula.md: "sequential ramp — не категориальная проверка").
     * Пн-первым для удобства чтения — Postgres отдаёт DOW 0=Вс..6=Сб как есть,
     * переупорядочиваем только на отрисовке.
     */
    function heatmap(byHourDow) {
      const dowLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const dowOrder = [1, 2, 3, 4, 5, 6, 0];
      const lookup = {};
      let max = 1;
      byHourDow.forEach(d => {
        lookup[`${d.dow}-${d.hour}`] = d.count;
        if (d.count > max) max = d.count;
      });

      const rows = dowOrder.map((dow, i) => {
        const cells = [];
        for (let hour = 0; hour < 24; hour++) {
          const count = lookup[`${dow}-${hour}`] || 0;
          const opacity = count === 0 ? 0.04 : Math.max(0.15, count / max).toFixed(2);
          cells.push(`<div class="aspect-square rounded-sm" style="background-color: rgba(79,70,229,${opacity})" title="${dowLabels[i]}, ${hour}:00–${hour + 1}:00: ${count}"></div>`);
        }
        return `
          <div class="flex items-center gap-1">
            <div class="w-5 text-[9px] text-gray-400 shrink-0">${dowLabels[i]}</div>
            <div class="flex-1 grid gap-0.5" style="grid-template-columns: repeat(24, 1fr);">${cells.join('')}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="space-y-1">${rows}</div>
        <div class="flex justify-between text-[9px] text-gray-400 mt-1 pl-6">
          <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
      `;
    }

    /**
     * Возврат клиентов — только клиенты (см. backend getUsageRetention).
     * `dataSince` моложе 2×days — предыдущее окно неполное, retention/
     * new-count статистически ненадёжны (левая граница истории), показываем
     * предупреждение вместо чисел, а не тихо врём точностью.
     */
    function retentionBlock(retention, days) {
      const { activeCurrent, activePrevious, retained, newCount, returningCount, dataSince } = retention;
      const historyDays = dataSince ? Math.floor((Date.now() - new Date(dataSince).getTime()) / 86400000) : 0;
      const insufficientHistory = historyDays < days * 2;
      const retentionPct = activePrevious > 0 ? Math.round((retained / activePrevious) * 100) : null;

      const warning = insufficientHistory
        ? `<div class="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-3">
             Данные собираются с ${escapeHtmlClient(new Date(dataSince || Date.now()).toLocaleDateString('ru-RU'))}
             — истории меньше двух окон по ${days} дн., retention и "новые/вернувшиеся" пока неточны.
           </div>`
        : '';

      return `
        ${warning}
        <div class="grid grid-cols-2 gap-2">
          ${kpiTile('repeat', 'Retention', retentionPct === null ? '—' : `${retentionPct}%`)}
          ${kpiTile('users', 'Активных клиентов', activeCurrent)}
          ${kpiTile('sparkles', 'Новых', newCount)}
          ${kpiTile('rotate-ccw', 'Вернувшихся', returningCount)}
        </div>
      `;
    }

    /**
     * Тренд ошибок — стековая столбчатая диаграмма по дням, топ-5 методов
     * своим цветом + "прочее" серым (totalByDay минус сумма top-5 за день,
     * не отдельный запрос). Палитра — 5 фиксированных цветов по индексу,
     * не переиспользует indigo heatmap (та — sequential-шкала одного цвета,
     * тут категориальное различие методов).
     */
    function errorTrendChart(errorTrend) {
      const { topMethods, totalByDay, byDayByMethod } = errorTrend;
      const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899'];
      const routeLabels = { admin: 'Админ', client: 'Клиент', proxy: 'GAS', invalid: 'Некорр.' };

      const byDayLookup = {};
      byDayByMethod.forEach((r) => {
        byDayLookup[r.day] = byDayLookup[r.day] || {};
        byDayLookup[r.day][`${r.method}|${r.route}`] = r.count;
      });

      const max = Math.max(...totalByDay.map((d) => d.count), 1);
      const bars = totalByDay.map((d) => {
        const dayData = byDayLookup[d.day] || {};
        let knownSum = 0;
        const segments = topMethods.map((m, i) => {
          const count = dayData[`${m.method}|${m.route}`] || 0;
          knownSum += count;
          const pct = d.count > 0 ? (count / d.count) * 100 : 0;
          return pct > 0 ? `<div style="height:${pct}%; background-color:${colors[i]}"></div>` : '';
        }).join('');
        const otherCount = Math.max(0, d.count - knownSum);
        const otherPct = d.count > 0 ? (otherCount / d.count) * 100 : 0;
        const otherSegment = otherPct > 0 ? `<div style="height:${otherPct}%; background-color:#d1d5db"></div>` : '';
        return `
          <div class="flex-1 flex flex-col items-center justify-end h-full" title="${escapeHtmlClient(d.day)}: ${d.count} ошибок">
            <div class="w-full flex flex-col-reverse justify-start rounded-t overflow-hidden" style="height: ${Math.max(4, Math.round((d.count / max) * 100))}%">
              ${segments}${otherSegment}
            </div>
          </div>
        `;
      }).join('');

      const legend = topMethods.map((m, i) => `
        <div class="flex items-center gap-1 text-[10px] text-gray-500">
          <span class="w-2 h-2 rounded-full shrink-0" style="background-color:${colors[i]}"></span>
          <span class="text-[9px] px-1 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${escapeHtmlClient(routeLabels[m.route] || m.route)}</span>
          <span class="truncate">${escapeHtmlClient(methodLabel(m.method))} (${m.failed})</span>
        </div>
      `).join('');

      return `
        <div class="flex items-end gap-1 h-24 mb-2">${bars}</div>
        <div class="flex justify-between text-[10px] text-gray-400 mb-3">
          <span>${escapeHtmlClient(totalByDay[0].day)}</span>
          <span>${escapeHtmlClient(totalByDay[totalByDay.length - 1].day)}</span>
        </div>
        <div class="space-y-1">
          ${legend}
          <div class="flex items-center gap-1 text-[10px] text-gray-400">
            <span class="w-2 h-2 rounded-full shrink-0 bg-gray-300"></span>
            <span>Прочее</span>
          </div>
        </div>
      `;
    }

    /**
     * Воронка каталог→вишлист→заказ — ДВА раздельных числа, не единая
     * 3-ступенчатая воронка с общим процентом (согласовано с VASY явно —
     * см. backend webapp-api.md/funnelService.js): "Вишлист → Заказ" точный
     * (Wishlist_ID match), "Поиск → Вишлист" — эвристика по соседству во
     * времени, помечена как оценка, не факт.
     */
    function funnelBlock(funnel) {
      const { wishlistToOrder, searchToWishlist } = funnel;
      const pctOrDash = (v) => (v === null ? '—' : `${v}%`);

      return `
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-[11px] text-gray-400 mb-1">Вишлист → Заказ</div>
            <div class="text-xl font-semibold text-gray-900">${pctOrDash(wishlistToOrder.conversionPct)}</div>
            <div class="text-[10px] text-gray-400 mt-1">${wishlistToOrder.converted} из ${wishlistToOrder.total} позиций, точно (по Wishlist_ID)</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-[11px] text-gray-400 mb-1">Поиск → Вишлист <span class="italic">(оценка)</span></div>
            <div class="text-xl font-semibold text-gray-900">${pctOrDash(searchToWishlist.conversionPct)}</div>
            <div class="text-[10px] text-gray-400 mt-1">${searchToWishlist.converted} из ${searchToWishlist.total} поисков, приблизительно</div>
          </div>
        </div>
      `;
    }

    function slowMethodsTable(slowMethods) {
      const routeLabels = { admin: 'Админ', client: 'Клиент', proxy: 'GAS', invalid: 'Некорр.' };
      return `
        <div class="space-y-1.5">
          ${slowMethods.map(m => `
            <div class="flex items-center justify-between text-[13px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${escapeHtmlClient(routeLabels[m.route] || m.route)}</span>
                <span class="text-gray-800 truncate">${escapeHtmlClient(methodLabel(m.method))}</span>
              </div>
              <div class="shrink-0 text-right">
                <div class="text-gray-500">~${m.avgMs} мс</div>
                <div class="text-[10px] text-gray-400">p95 ${m.p95Ms} мс</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function methodTable(byMethod) {
      const routeLabels = { admin: 'Админ', client: 'Клиент', proxy: 'GAS', invalid: 'Некорр.' };
      return `
        <div class="space-y-1.5">
          ${byMethod.map(m => `
            <div class="flex items-center justify-between text-[13px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${escapeHtmlClient(routeLabels[m.route] || m.route)}</span>
                <span class="text-gray-800 truncate">${escapeHtmlClient(methodLabel(m.method))}</span>
              </div>
              <div class="shrink-0 text-gray-500">${m.count}${m.failed > 0 ? ` <span class="text-red-500">(${m.failed} ошиб.)</span>` : ''}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    /**
     * "Бот: активность по командам" — см. JSDoc `botCommandLabel`/
     * `BOT_COMMAND_LABELS` (модульный уровень, выше в файле) за обоснованием
     * отдельного источника (`getBotUsageSummary`, таблица `bot_command_
     * events`, НЕ `analytics_events`). Переиспользует `kpiTile`/`dayChart`/
     * `topUsersList` этого же экрана — та же вёрстка, что у остальных
     * блоков сводки, не второй визуальный язык ради одной новой секции.
     */
    function botUsageBlock(botUsage) {
      if (!botUsage || botUsage.totals.total === 0) {
        return '<div class="text-center text-sm text-gray-400 py-4">Данных пока нет.</div>';
      }
      const { totals, byCommand, byDay, topUsers } = botUsage;

      return `
        <div class="grid grid-cols-2 gap-2 mb-3">
          ${kpiTile('activity', 'Нажатий/команд', totals.total)}
          ${kpiTile('users', 'Уникальных пользователей', totals.uniqueUsers)}
        </div>
        ${byDay.length > 0 ? `<div class="mb-3">${dayChart(byDay)}</div>` : ''}
        <div class="text-[11px] text-gray-400 mb-1.5 mt-3">По командам</div>
        ${byCommand.length === 0 ? '<div class="text-center text-sm text-gray-400 py-2">Данных пока нет.</div>' : botCommandTable(byCommand)}
        ${topUsers.length > 0 ? `
          <div class="text-[11px] text-gray-400 mb-1.5 mt-3">Активнее всех в боте</div>
          ${topUsersList(topUsers.map(u => ({ ...u, isAdmin: false })))}
        ` : ''}
      `;
    }

    function botCommandTable(byCommand) {
      return `
        <div class="space-y-1.5">
          ${byCommand.map(c => `
            <div class="flex items-center justify-between text-[13px]">
              <span class="text-gray-800 truncate">${escapeHtmlClient(botCommandLabel(c.command))}</span>
              <div class="shrink-0 text-right">
                <div class="text-gray-500">${c.count}</div>
                <div class="text-[10px] text-gray-400">${c.uniqueUsers} польз.</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function topUsersList(topUsers) {
      return `
        <div class="space-y-1.5">
          ${topUsers.map(u => {
            const label = u.name || u.username || u.telegramId;
            const sub = u.name && u.username ? u.username : '';
            const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleString('ru-RU') : '';
            return `
              <div class="flex items-center justify-between text-[13px] cursor-pointer hover:bg-gray-50 rounded-lg px-1 -mx-1 py-1" data-user-telegram-id="${escapeHtmlClient(u.telegramId)}" data-user-label="${escapeHtmlClient(label)}">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${u.isAdmin ? 'Админ' : 'Клиент'}</span>
                  <div class="min-w-0">
                    <div class="text-gray-800 truncate">${escapeHtmlClient(label)}</div>
                    ${sub ? `<div class="text-[10px] text-gray-400 truncate">${escapeHtmlClient(sub)}</div>` : ''}
                  </div>
                </div>
                <div class="shrink-0 text-right">
                  <div class="text-gray-500">${u.count}</div>
                  ${lastActive ? `<div class="text-[10px] text-gray-400">${escapeHtmlClient(lastActive)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function errorsList(recentErrors) {
      return `
        <div class="space-y-2">
          ${recentErrors.map(e => `
            <div class="text-[12px] border-l-2 border-red-300 pl-2">
              <div class="text-gray-500">${escapeHtmlClient(methodLabel(e.method))} · ${escapeHtmlClient(e.isAdmin ? 'админ' : 'клиент')}${e.telegramId ? ` (${escapeHtmlClient(e.telegramId)})` : ''}</div>
              <div class="text-red-600">${escapeHtmlClient(e.errorMessage || 'без текста ошибки')}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
};
