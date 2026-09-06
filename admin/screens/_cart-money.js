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

window.CartMoney = {
  feeRubFromPercent, feePercentFromRub, totalFromFeeRub, feeRubFromTotal, clampTotal,
  totalBreakdownText, splitProportionallyClient
};
