'use strict';

/**
 * $→₽ для суммы веса (волна 5, 03.10.2026) — тот же приём, что калькулятор
 * веса на карточке заказа (order-edit.js): вес платят в долларах, менеджер
 * вводит доллары, рубли подставляются по курсу refreshRate. Доллар нигде не
 * сохраняется — итог остаётся в ₽-поле. Курс запрашивается один раз на
 * страницу (общий промис).
 *
 * Использование: WeightUsd.wire(usdInputEl, rubInputEl, rateLabelEl?)
 */
window.WeightUsd = {
  _ratePromise: null,
  loadRate() {
    if (!this._ratePromise) {
      this._ratePromise = callServer('refreshRate').then((rates) => {
        const rate = rates && rates.finalRates ? parseFloat((rates.finalRates['Доллар'] || '').toString().replace(',', '.')) : NaN;
        return !isNaN(rate) && rate > 0 ? rate : 0;
      }).catch(() => { this._ratePromise = null; return 0; });
    }
    return this._ratePromise;
  },
  wire(usdInputEl, rubInputEl, rateLabelEl) {
    let rate = 0;
    this.loadRate().then((r) => {
      rate = r;
      if (rateLabelEl) rateLabelEl.textContent = r > 0 ? r.toFixed(2) : '—';
    });
    usdInputEl.addEventListener('input', () => {
      const usd = parseFloat(usdInputEl.value) || 0;
      if (rate > 0 && usd > 0) {
        rubInputEl.value = (usd * rate).toFixed(2);
        rubInputEl.dispatchEvent(new Event('input'));
      }
    });
  }
};
