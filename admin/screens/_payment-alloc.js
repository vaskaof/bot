'use strict';

/**
 * «Занести оплату» на экране «Оплаты» (волна 4 аудита менеджера,
 * 03.10.2026) — чистые функции подстановки «за что эти деньги»: какие
 * этапы можно закрепить, что подставить по умолчанию и как разложить
 * введённую сумму. Сервер (recordPaymentForStages) пишет платёж и
 * закрепления одной транзакцией; здесь — только предложение, менеджер
 * правит строки руками.
 *
 * Решение VASY 03.10.2026: деньги сами по себе на ДРУГИЕ заказы не
 * разносятся (может уйти на заказ, который реально отслеживают отдельно) —
 * подстановка берёт этапы ОДНОГО заказа, остальное остаётся в пуле, пока
 * менеджер сам не добавит строку.
 */

const PAYMENT_STAGE_ORDER = ['Основная', 'Вес', 'СДЭК', 'СДЭК_Индивидуальная', 'Доставка_РФ'];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Этапы, за которыми ещё можно что-то закрепить: остаток стадии минус уже
 * активные метки (тот же расчёт, что кнопка «Закрепить»). Порядок — старые
 * заказы первыми, внутри заказа — по очереди этапов.
 * @param {{orderId:string, productDisplay:string, isNewModel:boolean, details:{dateOrder:string, stagesBalance:{stage:string, target:number, remaining:number, eligible:boolean}[]}}[]} orders
 * @param {{orderId:string, stage:string, amount:number}[]} earmarks
 * @returns {{orderId:string, stage:string, productDisplay:string, free:number, eligible:boolean}[]}
 */
function stageOptions(orders, earmarks) {
  const options = [];
  const sorted = orders.filter((o) => o.isNewModel).slice()
    .sort((a, b) => new Date(a.details.dateOrder || 0) - new Date(b.details.dateOrder || 0));
  for (const o of sorted) {
    const stages = (o.details.stagesBalance || []).slice()
      .sort((a, b) => PAYMENT_STAGE_ORDER.indexOf(a.stage) - PAYMENT_STAGE_ORDER.indexOf(b.stage));
    for (const s of stages) {
      if (!(s.target > 0)) continue;
      // Метки не вычитаются (04.10.2026, заказ 5C59F9): покрытая уже сидит в
      // paid (вычитать второй раз — этап казался оплаченным), непокрытая — это
      // и есть деньги, которые сейчас заносят; сервер не пишет вторую метку
      // поверх неё (ordersService.reduceByUnfundedEarmarks).
      const free = round2(Math.max(0, s.remaining));
      if (free <= 0.01) continue;
      options.push({ orderId: o.orderId, stage: s.stage, productDisplay: o.productDisplay || '', free, eligible: s.eligible !== false });
    }
  }
  return options;
}

/**
 * Что подставить по умолчанию. С заказом (пришли с карточки заказа/задачи) —
 * его этапы, которые уже пора оплачивать (если таких нет — все его открытые).
 * Без заказа — один этап: самый старый заказ, первый этап, который пора
 * оплачивать (нет такого — самый первый открытый). Нет открытых — пусто (всё в пул).
 * @param {ReturnType<typeof stageOptions>} options
 * @param {string|null} orderId
 */
function defaultTargets(options, orderId) {
  if (orderId) {
    const own = options.filter((o) => o.orderId === orderId);
    const due = own.filter((o) => o.eligible);
    return due.length > 0 ? due : own;
  }
  const first = options.find((o) => o.eligible) || options[0];
  return first ? [first] : [];
}

/**
 * Раскладывает сумму по этапам по очереди, каждому — не больше его
 * свободного остатка. Остаток — в пул.
 * @param {number} amount
 * @param {{free:number}[]} targets
 * @returns {{rows:Object[], leftover:number}}
 */
function distribute(amount, targets) {
  let rest = round2(Math.max(0, Number(amount) || 0));
  const rows = targets.map((t) => {
    const part = round2(Math.min(rest, t.free));
    rest = round2(rest - part);
    return Object.assign({}, t, { amount: part });
  });
  return { rows, leftover: rest };
}

/** Сколько всего к оплате по набору этапов (подсказка «Подставить N ₽»). */
function totalFree(targets) {
  return round2(targets.reduce((sum, t) => sum + t.free, 0));
}

window.PaymentAlloc = { stageOptions, defaultTargets, distribute, totalFree, PAYMENT_STAGE_ORDER };
