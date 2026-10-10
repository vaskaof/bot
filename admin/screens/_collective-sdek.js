'use strict';

/**
 * Коллективки 2.0, этап 2 (10.10.2026, IMPLEMENTATION-PLAN-COLLECTIVES-2.md) —
 * чистые функции карточки коллективки: шаги «Что осталось сделать», что
 * подставить в «Занести оплату» из блока «Оплата СДЭК», когда задавать
 * вопрос «уехали / вернуть в пул» при отправке. Данные — сервер
 * `getCollectiveSdekPayments` (тот же расчёт, что `progress` в списке).
 * Без DOM — покрыто frontend/tests/collective-sdek.test.js.
 */

const COLLECTIVE_STATUSES_BY_STAGE = {
  'КЗ→РФ': ['Формируется', 'Отправлено (СДЭК)', 'Прибыло к посреднику РФ', 'Завершено'],
  'По РФ': ['Формируется', 'Отправлено', 'Доставлено']
};

function collectiveLegLabel(stage) {
  return stage === 'По РФ' ? 'доставки по РФ' : 'СДЭК';
}

function collectiveRub(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${v.toLocaleString('ru-RU')} ₽`;
}

/**
 * 7 шагов «Что осталось сделать». `action` — что делает кнопка шага
 * (обрабатывает экран), `null` — шаг закрыт, кнопки нет.
 * @param {Object} progress `getCollectiveSdekPayments().progress`
 * @param {{stage:string, status:string, trackNumber:string, sentAt:string|null}} head
 * @returns {{key:string, label:string, done:boolean, detail:string, action:string|null, actionLabel:string}[]}
 */
function collectiveChecklistSteps(progress, head) {
  const p = progress || {};
  const leg = collectiveLegLabel(head.stage);
  const hasTrack = !!(head.trackNumber && head.trackNumber.trim());
  const hasSent = !!head.sentAt;
  const priceDetail = [];
  if (p.sdekPriceMissing > 0) priceDetail.push(`не выставлена: ${p.sdekPriceMissing}`);
  if (p.sdekPriceExempt > 0) priceDetail.push(`получены без цены, не трогаем: ${p.sdekPriceExempt}`);
  const steps = [
    {
      key: 'gathered', label: 'Заказы у посредника', done: !(p.notAtBrokerCount > 0),
      detail: p.notAtBrokerCount > 0 ? `ещё не у посредника: ${p.notAtBrokerCount}` : '',
      action: 'not-at-broker', actionLabel: 'Разобрать'
    },
    {
      key: 'sent', label: 'Отправлено: трек и дата', done: hasTrack && hasSent,
      detail: [hasTrack ? '' : 'нет трека', hasSent ? '' : 'нет даты отправки'].filter(Boolean).join(', '),
      action: 'focus-sent', actionLabel: 'Заполнить'
    },
    {
      key: 'check', label: `Чек ${leg} внесён`, done: !!p.reconciled,
      detail: p.reconciled ? '' : 'факт. расход не введён',
      action: 'focus-costs', actionLabel: 'Внести чек'
    },
    {
      key: 'price', label: `Цена ${leg} у всех заказов`, done: !(p.sdekPriceMissing > 0),
      detail: priceDetail.join(' · '),
      action: 'to-sdek', actionLabel: 'Открыть'
    },
    {
      key: 'paid', label: `Все оплатили ${leg}`, done: !(p.sdekUnpaid > 0),
      detail: p.sdekUnpaid > 0 ? `не оплатили — клиентов: ${p.sdekUnpaidClients}, ${collectiveRub(p.sdekRemainingRub)}` : '',
      action: 'to-sdek', actionLabel: 'Открыть'
    },
    {
      key: 'catchup', label: 'Статусы заказов догнаны', done: !(p.behindCount > 0),
      detail: p.behindCount > 0 ? `отстали по статусу: ${p.behindCount}` : '',
      action: 'catch-up', actionLabel: 'Догнать'
    },
    {
      key: 'terminal', label: 'Коллективка завершена', done: !!p.isTerminal,
      detail: p.isTerminal ? '' : `сейчас «${head.status}»`,
      action: 'focus-status', actionLabel: 'Сменить статус'
    }
  ];
  return steps.map((s) => (s.done ? { ...s, detail: s.key === 'price' ? s.detail : '', action: null } : s));
}

/**
 * Что подставить в «Занести оплату» по клиенту: каждый его заказ с
 * подтверждённой ценой и остатком — этап плеча на остаток.
 * @param {{orders:{orderId:string, stage:string, priceState:string, remaining:number}[]}} client
 * @returns {{orderId:string, stage:string, amount:number}[]}
 */
function collectiveSdekPrefill(client) {
  return ((client && client.orders) || [])
    .filter((o) => o.priceState === 'priced' && o.remaining > 0.01)
    .map((o) => ({ orderId: o.orderId, stage: o.stage, amount: Math.round(o.remaining * 100) / 100 }));
}

/**
 * Параметр `prefill` для перехода в «Оплаты» → обратно в массив. Мусор —
 * пустой массив (окно откроется как обычно).
 * @param {string} raw
 * @returns {{orderId:string, stage:string, amount:number}[]}
 */
function parseSdekPrefill(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a.orderId === 'string' && typeof a.stage === 'string' && Number(a.amount) > 0)
      .map((a) => ({ orderId: a.orderId, stage: a.stage, amount: Math.round(Number(a.amount) * 100) / 100 }));
  } catch (e) {
    return [];
  }
}

/**
 * Переход коллективки в «отправленный»: из «Формируется» в любой
 * следующий статус этапа. Тогда спрашиваем про заказы, ещё не у посредника.
 */
function isCollectiveSendTransition(stage, fromStatus, toStatus) {
  const list = COLLECTIVE_STATUSES_BY_STAGE[stage] || COLLECTIVE_STATUSES_BY_STAGE['КЗ→РФ'];
  const from = list.indexOf(fromStatus);
  const to = list.indexOf(toStatus);
  return to >= 1 && from < 1;
}

/**
 * Клиенты (среди тех, чьи заказы уезжают), у которых на плечо ещё ничего не
 * внесено — предупреждение в окне отправки (не запрет).
 * @param {{clients:{clientDisplay:string, orders:{orderId:string, paid:number, isClosed:boolean}[]}[]}} sdekData
 * @param {Set<string>} leavingIds заказы, которые остаются в коллективке
 * @returns {string[]} подписи клиентов
 */
function clientsWithoutSdekMoney(sdekData, leavingIds) {
  const result = [];
  for (const c of (sdekData && sdekData.clients) || []) {
    const leaving = c.orders.filter((o) => leavingIds.has(o.orderId) && !o.isClosed);
    if (leaving.length === 0) continue;
    if (leaving.every((o) => !(o.paid > 0.01))) result.push(c.clientDisplay);
  }
  return result;
}

window.CollectiveSdek = {
  STATUSES_BY_STAGE: COLLECTIVE_STATUSES_BY_STAGE,
  legLabel: collectiveLegLabel,
  rub: collectiveRub,
  checklistSteps: collectiveChecklistSteps,
  prefillForClient: collectiveSdekPrefill,
  parsePrefill: parseSdekPrefill,
  isSendTransition: isCollectiveSendTransition,
  clientsWithoutSdekMoney
};
