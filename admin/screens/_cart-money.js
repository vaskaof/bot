'use strict';

/**
 * Чистые денежные функции для «Корзины» (`cart-new.js`) — БЕЗ DOM.
 * IMPLEMENTATION-PLAN-CART-UX.md, §2 (Фаза A) / §5 D4.
 *
 * Вынесены из `cart-new.js` 06.09.2026 по прямому решению VASY («заодно
 * исправь долг god-файлов» — ответ: старые `order-new.js`/`order-edit.js`
 * не трогаем, `cart-new.js` не даём стать третьим, см. план §9 п.8) и
 * потому что вся денежная математика, пока жила внутри DOM-замыканий,
 * ловилась только e2e — здесь она наконец покрывается обычными unit-тестами
 * (`frontend/tests/cart-money.test.js`).
 *
 * **Связка «Сумма ↔ Комиссия % ↔ Комиссия ₽ ↔ Итог»** — ТОЧНО те же четыре
 * функции, что уже годами работают в `order-new.js` (`updateFeeRub`/
 * `updateFeePercent`/`updateTotalPayment`/`updateFromTotalPayment`/
 * `clampTotalPaymentOnBlur`, ~строки 1375-1420), скопировано поведение
 * один-в-один по прямому требованию VASY 06.09.2026 — НЕ переизобретать
 * формулу. `cart-new.js` до этой правки имел только двустороннюю связку
 * %↔₽ и вообще не имел поля «Итог» — прямой репорт VASY «по каждой позиции
 * не вижу итога».
 *
 * Все функции чистые (без побочных эффектов, без DOM) — вызывающая сторона
 * (`cart-new.js`) сама решает, какое поле сейчас в фокусе и не должно
 * перезаписываться (`document.activeElement`), сама применяет
 * `.toFixed(2)`/пустую строку для отображения.
 */

/**
 * «Комиссия ₽» из «Комиссия %» и рублёвой базы (стоимости заявки).
 * Зеркало `order-new.js`'s `updateFeeRub`.
 * @param {number} baseRub
 * @param {number} feePercent
 * @returns {number} >= 0
 */
function feeRubFromPercent(baseRub, feePercent) {
  const base = Number(baseRub) || 0;
  const percent = Number(feePercent) || 0;
  const rub = base * (percent / 100);
  return rub > 0 ? rub : 0;
}

/**
 * «Комиссия %» из «Комиссия ₽» и рублёвой базы.
 * Зеркало `order-new.js`'s `updateFeePercent`.
 * @param {number} baseRub
 * @param {number} feeRub
 * @returns {number} >= 0
 */
function feePercentFromRub(baseRub, feeRub) {
  const base = Number(baseRub) || 0;
  const rub = Number(feeRub) || 0;
  if (base <= 0) return 0;
  const percent = (rub / base) * 100;
  return percent > 0 ? percent : 0;
}

/**
 * «Итог» (клиент платит) = рублёвая база + «Комиссия ₽».
 * Зеркало `order-new.js`'s `updateTotalPayment`.
 * @param {number} baseRub
 * @param {number} feeRub
 * @returns {number}
 */
function totalFromFeeRub(baseRub, feeRub) {
  const base = Number(baseRub) || 0;
  const fee = Number(feeRub) || 0;
  return base + fee;
}

/**
 * Обратный ход: менеджер вписал «Итог» вручную — «Комиссия ₽» = Итог − база
 * (не может быть отрицательной — обрезается в 0, тот же принцип, что
 * `clampTotal` ниже, но здесь мягко, без изменения самого «Итога»).
 * Зеркало `order-new.js`'s `updateFromTotalPayment`.
 * @param {number} baseRub
 * @param {number} total
 * @returns {number} feeRub >= 0
 */
function feeRubFromTotal(baseRub, total) {
  const base = Number(baseRub) || 0;
  const rawTotal = Number(total) || 0;
  const fee = rawTotal - base;
  return fee > 0 ? fee : 0;
}

/**
 * Clamp «Итога» на потере фокуса поля — отрицательная комиссия невозможна,
 * «Итог» не может быть меньше самой рублёвой базы. Зеркало `order-new.js`'s
 * `clampTotalPaymentOnBlur`.
 * @param {number} baseRub
 * @param {number} total
 * @returns {number}
 */
function clampTotal(baseRub, total) {
  const base = Number(baseRub) || 0;
  const rawTotal = Number(total) || 0;
  return Math.max(rawTotal, base);
}

/**
 * Текст разложения «Итога» на карточке — «база стоимость + комиссия
 * комиссия», под полем «Итог» (§4 C2). Вынесена сюда 06.09.2026 (найдено
 * целевым ревью перед деплоем — та же строка была буквально скопирована 4
 * раза: позиция/updateTotalDisplay, позиция/updateFromTotal, строка
 * лота/updateRowTotalDisplay, строка лота/updateRowFromTotal) — один текст,
 * не 4 копии, которые придётся синхронизировать вручную при любой правке
 * формулировки.
 * @param {number} baseRub
 * @param {number} feeRub
 * @returns {string} пусто, если и база, и комиссия равны 0
 */
function totalBreakdownText(baseRub, feeRub) {
  const base = Number(baseRub) || 0;
  const fee = Number(feeRub) || 0;
  return (base > 0 || fee > 0) ? `${base.toFixed(2)} стоимость + ${fee.toFixed(2)} комиссия` : '';
}

/**
 * Разбивка суммы между заявками пропорционально весу поверх уже известных
 * базовых цен — клиентская копия backend `splitProportionally`
 * (`server/src/lots/splitProportionally.js`), намеренное дублирование (см.
 * её JSDoc), только для мгновенного визуального фидбека до сохранения.
 * Backend — единственная версия, что реально пишется в БД, не доверяет этой
 * клиентской копии.
 *
 * Перенесена сюда из `cart-new.js` 06.09.2026 (была вынесена туда 05.09.2026
 * из локальной области видимости `addLotItem`, теперь второй уровень выноса
 * — общий чистый модуль вместо экрана).
 *
 * @param {number} pool Сумма для распределения (₽)
 * @param {{id:string, weight?:number|null, basePrice?:number|null}[]} rows
 * @param {number} roundingStep Шаг округления (1/10/50); `0`/`null` — до копейки.
 * @returns {Map<string, number>} id -> итоговая сумма
 */
function splitProportionallyClient(pool, rows, roundingStep) {
  const step = roundingStep && roundingStep > 0 ? roundingStep : 0.01;
  const result = new Map();
  if (rows.length === 0) return result;
  const basePrices = rows.map((r) => Number(r.basePrice) || 0);
  const basesSum = basePrices.reduce((s, v) => s + v, 0);
  const remainder = pool - basesSum;
  const weights = rows.map((r) => (r.weight === null || r.weight === undefined ? 1 : Number(r.weight) || 0));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const rawShares = rows.map((r, i) => (totalWeight > 0 ? (remainder * weights[i]) / totalWeight : 0));
  const rawFinals = rows.map((r, i) => basePrices[i] + rawShares[i]);
  let roundedSum = 0, largestIndex = 0;
  rows.forEach((r, i) => {
    const rounded = Math.round(rawFinals[i] / step) * step;
    result.set(r.id, rounded);
    roundedSum += rounded;
    if (rawShares[i] > rawShares[largestIndex]) largestIndex = i;
  });
  const roundingRemainder = pool - roundedSum;
  const targetId = rows[largestIndex].id;
  result.set(targetId, (result.get(targetId) || 0) + roundingRemainder);
  return result;
}

/**
 * Вес заявки для разбивки разницы КОРЗИНЫ (§2 A3, IMPLEMENTATION-PLAN-
 * CART-UX-2.md, 07.09.2026) — НЕ путать с фиксированным
 * `getCostCoefficient()` заявки (0/1, другая цель — читает её
 * `getPayload()` заявки для контракта createOrder, см. её JSDoc).
 * Перенесена сюда из `cart-new.js` (была там чистой функцией, замкнутой на
 * `diffSplitMode`) для unit-покрытия (§10 плана) — `cart-new.js` вызывает
 * её через тонкую обёртку `diffWeightFor(it)`, подставляющую
 * `it.getManualRub()`/`it.getTotalRub()`.
 *
 * Ручная фиксация доли — всегда вне разницы (вес 0), иначе режим 'amount'
 * — вес = известная сумма заявки (крупная заявка получает бОльшую долю
 * разницы), режим 'equal' — все заявки поровну (вес 1, старое поведение
 * до этой фазы).
 * @param {'amount'|'equal'} mode
 * @param {number|null|undefined} manualRub null/undefined, если заявка НЕ зафиксирована вручную
 * @param {number} totalRub СЫРАЯ известная база заявки (её `getTotalRub()`)
 * @returns {number} >= 0
 */
function diffWeightFor(mode, manualRub, totalRub) {
  if (manualRub !== null && manualRub !== undefined) return 0;
  return mode === 'amount' ? (Number(totalRub) || 0) : 1;
}

/**
 * A4, вырожденный случай (IMPLEMENTATION-PLAN-CART-UX-2.md §2 A4) — если
 * сумма весов ВСЕХ заявок <= 0 (например, режим "по сумме" и ни у одной
 * ещё не введена сумма), `splitProportionallyClient` положила бы весь пул
 * на первую заявку молча, без объяснения — вырожденный случай её формулы
 * (totalWeight<=0 в её коде), не отдельная ошибка. Пересобирает веса в 1
 * (эквивалент "поровну") — молча, без тоста, это нормальное состояние
 * "менеджер ещё не всё ввёл".
 *
 * ИСПРАВЛЕНО 12.09.2026 (найдено code-review перед деплоем «Скидка/общие
 * расходы») — до этой правки функция игнорировала `r.fixed` и пересобирала
 * в 1 ВСЕ заявки, включая зафиксированные вручную (`fixedShareRub`),
 * расходясь с `cartsService.createCart`, которая уже в этом же раунде
 * научилась исключать зафиксированные из этой нормализации (см. её JSDoc
 * — "их вес 0 намеренный, не вырожденный"). Пример расхождения: одна
 * заявка зафиксирована, остальные ещё без суммы (тоже вес 0) — старый код
 * показывал на экране, что разница размазывается ПОРОВНУ на всех, включая
 * зафиксированную, а сервер уже клал её только на незафиксированные.
 * Теперь считает сумму весов ТОЛЬКО по незафиксированным строкам и
 * пересобирает в 1 тоже только их — 1-в-1 формула сервера.
 *
 * Остаточный неполный случай, ОБЩИЙ с сервером (не новый регресс этой
 * правки) — если зафиксированы АБСОЛЮТНО ВСЕ заявки, отдать разницу
 * действительно некому: они все остаются на весе 0, и
 * `splitProportionallyClient` (как и её серверный аналог) в этом случае
 * по-прежнему молча кладёт весь пул на первую заявку — тот же непокрытый
 * уголок, что и в `cartsService.createCart`.
 * @param {{id:string, weight:number, basePrice?:number|null, fixed?:boolean}[]} rows
 * @returns {{id:string, weight:number, basePrice?:number|null, fixed?:boolean}[]}
 */
function normalizeDegenerateWeights(rows) {
  const nonFixedWeightSum = rows.reduce((s, r) => s + (r.fixed ? 0 : (Number(r.weight) || 0)), 0);
  if (nonFixedWeightSum > 0) return rows;
  return rows.map((r) => (r.fixed ? r : { ...r, weight: 1 }));
}

/**
 * Подпись слайдера доли (внутри лота) человеческим языком вместо голого
 * множителя (§5 D3, IMPLEMENTATION-PLAN-CART-UX.md) — репорт-мотивация:
 * "1.00" ничего не значит менеджеру, не знакомому с формулой
 * `splitProportionally`. Диапазон слайдера — 0..2, шаг 0.25 (`cost-slider`/
 * `weight-slider` в cart-new.js) — три канонических значения из плана
 * (0/1/2) плюс обобщение на промежуточные шаги, которые план явно не
 * перечислил, но слайдер их допускает.
 * @param {number} value 0..2
 * @returns {string}
 */
function humanFractionLabel(value) {
  const v = Number(value) || 0;
  if (v === 0) return '0 — не участвует';
  if (v === 1) return '×1 — как у всех';
  if (v === 2) return '×2 — вдвое больше';
  const vLabel = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return v < 1 ? `×${vLabel} — меньше, чем у всех` : `×${vLabel} — больше, чем у всех`;
}

/**
 * Символы валют корзины — общая статическая таблица (§5 D4, перенесена из
 * cart-new.js при разделении на модули: `_cart-position.js`/`_cart-lot.js`
 * обе читают её, а после разделения на файлы модульного `const` из
 * cart-new.js им уже не видно — нужен общий, window-уровня, источник).
 * `'Тенге': '₸'` добавлена 12.09.2026 (Волна 6, находка 2) — та же валюта,
 * что backend'а `currencyService.RUS_NAME_TO_CODE`, теперь выбираема в
 * `#cart-currency-select` (cart-new.js).
 */
const CURRENCY_SYMBOLS = { 'Доллар': '$', 'Юань': '¥', 'Евро': '€', 'Фунт': '£', 'Тенге': '₸' };

/**
 * Прогноз расходов (§4 C1 "Прогноз логистики") — имена полей позиции,
 * которые складывает липкая панель итогов (cart-new.js's
 * updateSummaryPanelDetails) — суммируется ТОЛЬКО по отдельным позициям:
 * строки внутри лота не имеют этих полей вообще (прогноз лота считается на
 * бэкенде одним вызовом на весь лот, см. lotsService.createLot JSDoc).
 * Общий источник для cart-new.js (агрегация) И `_cart-position.js`
 * (проводка слушателей 'input' на эти же поля, §5 D4).
 */
const FORECAST_FIELD_KEYS = ['weightSumEl', 'taxiKzEl', 'sdekEl', 'taxiRfEl', 'taxiRfSendEl', 'shippingRfEl', 'taxiRfReceiveEl'];

/**
 * Слияние «Новый заказ»→«Корзина» (05.09.2026, IMPLEMENTATION-PLAN-CART-
 * MERGE.md §0) — единственное место, где считается формула замены старой
 * пары «Оплачена ли бронь?»+«Уже получено при оформлении» на одно число
 * «Сколько уже оплачено, ₽». Возвращает ровно тот же контракт, который
 * раньше заполнял менеджер вручную через toggle+модалку `#booking-overlap-
 * modal` в order-new.js — НЕ живой статус, фиксируется один раз при
 * отправке формы. Перенесена сюда из cart-new.js 06.09.2026 (§5 D4) — уже
 * была чистой (без DOM), просто жила не в том файле. Используется только
 * `_cart-position.js` (лот вычисляет это же на СЕРВЕРЕ, см. lotsService.
 * createLot JSDoc — сюда с лота уходит только сырое значение).
 * @param {number} bookingSumRub
 * @param {number} alreadyPaidRub
 * @returns {{bookingPaid: 'Да'|'Нет', bookingAlreadyInMainAmount: boolean}}
 */
function computeBookingFields(bookingSumRub, alreadyPaidRub) {
  const bookingCovered = bookingSumRub > 0 && alreadyPaidRub >= bookingSumRub;
  return { bookingPaid: bookingCovered ? 'Да' : 'Нет', bookingAlreadyInMainAmount: bookingCovered };
}

window.CartMoney = {
  feeRubFromPercent, feePercentFromRub, totalFromFeeRub, feeRubFromTotal, clampTotal,
  totalBreakdownText, splitProportionallyClient, humanFractionLabel,
  CURRENCY_SYMBOLS, computeBookingFields, FORECAST_FIELD_KEYS,
  diffWeightFor, normalizeDegenerateWeights
};
