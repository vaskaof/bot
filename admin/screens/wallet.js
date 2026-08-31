'use strict';

/**
 * Экран "Кошелёк ₸" (Э2 рефакторинга экономики, хвост "экран менеджера",
 * 25.08.2026, NEXT-SESSION-PROMPT-E2.md) — единственная форма, которой не
 * хватало, чтобы backend Э2 (WAC-кошелёк, задеплоен и закоммичен 25.08.2026,
 * см. project_bot_knopka_economy_refactor) реально заработал: без неё ни
 * один менеджер физически не мог занести конвертацию ₽→₸.
 *
 * "Факт выкупа" сюда НЕ входит — он привязан к конкретному заказу
 * (`orderId` уже известен из контекста) и открывается кнопкой на самом
 * заказе (order-edit.js → PurchaseEventModal), не отсюда — вводить orderId
 * руками на отдельном экране не нужно.
 *
 * Продолжение Э3 (курсовая политика, 25.08.2026, NEXT-SESSION-PROMPT-E3-
 * CONTINUED.md) добавило три блока ниже — backend был задеплоен раньше без
 * UI, ровно та же ситуация, что была с "Кошелёк ₸" перед хвостом Э2.
 *
 * Восемь независимых блоков, каждый сам грузится и сам обрабатывает свою
 * ошибку (тот же принцип, что settings.js — секция не должна блокировать
 * соседние):
 *   1. Форма "Конвертация ₽→₸" (recordFxConversion) — пишет WAC-кошелёк.
 *   2. "Буфер: план и факт по каналам" (getFxBufferPlanVsFactReport) —
 *      план (`fx_buffer_policy`) и факт (`v_buffer_by_channel`, Э2) рядом.
 *      Факт-таблица — ЕДИНСТВЕННЫЙ источник этих данных на экране: старый
 *      отдельный вызов getCostBufferReport убран, потому что возвращал
 *      ровно ту же `v_buffer_by_channel` (costService.getBufferReport —
 *      тонкая обёртка над costRepository.getBufferByChannel, тем же
 *      запросом, что fxPolicyService.getBufferPlanVsFactReport читает под
 *      именем factByChannel) — держать оба вызова означало бы два запроса
 *      за одними и теми же строками.
 *   3. "Алерты валютного риска" (getFxExposureAlerts, F-30) — витрина,
 *      скорее всего пустая ещё несколько дней (штамп курса ставится только
 *      при СОЗДАНИИ заказа начиная с деплоя 25.08.2026, job тикает раз в
 *      час) — это ожидаемо, не баг. Кнопки "разрешить" НЕТ НАМЕРЕННО: на
 *      backend нет метода `resolveFxExposureAlert` (см. NEXT-SESSION-
 *      PROMPT-E3-CONTINUED.md) — заводить его нужно отдельным шагом, не
 *      молча пропускать здесь.
 *   4. Пересчёт буфера — "предпросмотр → применить", ДВА раздельных
 *      действия (getFxBufferRecomputeSuggestion затем applyFxBufferRecompute,
 *      VASY выбрал ручную кнопку именно чтобы видеть число до применения).
 *   5. "Реализованный буфер по каналам" — фактическая часть блока 2 выше
 *      (тот же контейнер, разделены только визуально).
 *   6. "Личные закупки" (getOwnPurchasesReport) — метрика личного контура,
 *      исключённого из остальных дашбордов (Э2, F-07/F-08).
 *   7. "Валовая маржа" (getMarginReport, Э5 раунд 4, 26.08.2026) — цена
 *      клиенту минус ПРИЗНАННЫЙ COGS (costService.syncCogsRecognition),
 *      первая по-настоящему честная маржа в проекте (F-05). Пусто, пока
 *      не появится ни одного заказа с признанной себестоимостью — на
 *      26.08.2026 это ожидаемо (`purchase_events` только запускается).
 *   8. Строка-сигнал "закрыто без учёта себестоимости"
 *      (getClosedWithoutPurchaseReport) — НЕ отдельный алерт-блок с
 *      резолвом (сознательное решение не усложнять то, что сложно
 *      сопровождать вручную), просто count внутри блока 7: скорее всего
 *      означает "менеджер забыл занести факт выкупа" для закрытых заказов.
 *   9. "Баланс кассы ₸" (getWalletBalance, Э5 п.1 оставшегося чек-листа,
 *      D-06, 26.08.2026) — НАСТОЯЩИЙ тенговый остаток кошелька, не
 *      рублёвый эквивалент (`money_movements` книгует "Кассу КЗ" в рублях
 *      по конвенции проводки, см. `ledgerService.js`). Читает
 *      `kzt_wallet_ledger` (Э2) напрямую — тот же атомарный писатель, что
 *      и рублёвая нога проводки, разойтись физически не может. Раньше
 *      баланс был виден только МГНОВЕННО, как результат последней
 *      конвертации (`walletBalanceKztAfter` в блоке 1) — этот блок
 *      персистентный, грузится при заходе на экран.
 */
window.Screens = window.Screens || {};

const BUFFER_CHANNEL_MIN_ORDERS = 30; // R-07, REFACTOR-ECONOMY.md §6

window.Screens.wallet = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Кошелёк ₸</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';
    document.getElementById('back-btn').addEventListener('click', () => history.back());

    root.innerHTML = `
      <main class="pt-16 pb-10 px-4 md:px-0 max-w-2xl mx-auto space-y-5">
        <section class="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-gray-600 leading-relaxed">
          <div class="font-semibold text-indigo-700 mb-1.5">Как читать этот экран за 30 секунд</div>
          <ul class="list-disc pl-4 space-y-1">
            <li><b>Баланс / Конвертация</b> — сколько тенге сейчас в кассе и по какому реальному курсу они куплены.</li>
            <li><b>Буфер</b> — совпадает ли закладка в цену клиента (план) с тем, что вышло по факту.</li>
            <li><b>Алерты / Пересчёт</b> — предупреждение, если курс валюты уехал, и ручная подстройка буфера.</li>
            <li><b>Личные закупки / Маржа / Причины / Билеты</b> — контрольные отчёты: свои закупки отдельно от продаж клиентам, настоящая прибыль по факту, подозрительно низкие комиссии, обязательства по конкурсам.</li>
          </ul>
          <div class="mt-1.5 text-gray-400">Рядом с названием каждого блока — своя кнопка "?" с подробностями именно про него.</div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Баланс кассы ₸${helpIcon('Баланс кассы ₸', '<p>Реальный остаток тенге в кассе — не рублёвый эквивалент по курсу ЦБ.</p><p><b>WAC</b> — средневзвешенная цена одного тенге в рублях по всем прошлым конвертациям. Например, WAC = 5.20 ₽/₸ значит: каждый потраченный сейчас тенге на самом деле обошёлся компании в 5.20 ₽ — это и есть настоящая себестоимость покупки, а не сегодняшний биржевой курс.</p>')}</div>
          <div id="wallet-balance-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Конвертация ₽ → ₸${helpIcon('Конвертация ₽ → ₸', '<p>Заносите сюда каждый раз, когда меняете рубли на тенге в банке — сколько реально отдали рублей и сколько реально получили тенге, по выписке, а не «курс из интернета».</p><p>Так система узнаёт настоящий курс с учётом спреда и комиссии банка. Если банк списал комиссию отдельной строкой — впишите её в третье поле, чтобы «Отдано рублей» точно совпадало с выпиской.</p>')}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Отдано рублей</label>
              <input type="number" id="fx-rub-out-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Получено тенге</label>
              <input type="number" id="fx-kzt-in-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Комиссия банка, ₽ (если выделена отдельной строкой)</label>
              <input type="number" id="fx-bank-fee-input" step="0.01" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="0.00">
            </div>
            <div id="fx-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2"></div>
            <div id="fx-result" class="hidden text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1"></div>
            <button type="button" id="fx-submit-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Записать конвертацию</button>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Буфер: план и факт по каналам${helpIcon('Буфер: план и факт', '<p>«Буфер» — на сколько % себестоимость товара в валюте оказывается выше «чистой» суммы после конвертации в рубли, из-за курсовых скачков, комиссий обмена и налога.</p><p><b>План</b> — то, что сейчас закладывается в цену клиента при создании нового заказа. <b>Факт</b> — то, что реально получилось по уже занесённым фактам выкупа.</p><p>Если факт заметно выше плана — стоит пересчитать буфер (блок «Пересчёт буфера» ниже), иначе новые заказы будут закладывать в цену меньше, чем реально тратится.</p>')}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <div>
              <div class="text-[11px] font-medium text-gray-400 mb-1.5">План (текущая курсовая политика)</div>
              <div id="fx-plan-body" class="text-sm text-gray-400">Загрузка...</div>
            </div>
            <div class="pt-3 border-t border-gray-100">
              <div class="text-[11px] font-medium text-gray-400 mb-1.5">Факт по каналам (Э2, из записанных фактов выкупа)</div>
              <div id="buffer-report-body" class="text-sm text-gray-400">Загрузка...</div>
            </div>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Алерты валютного риска${helpIcon('Алерты валютного риска', '<p>Раз в час система сравнивает курс, зафиксированный на заказе в момент его создания, с текущим курсом валюты. Если курс вырос больше порога — появится алерт: значит по этому заказу есть риск заплатить за товар больше, чем заложено в цену клиента.</p><p>Алертов долго нет — это нормально: механизм видит только заказы, созданные начиная с 25.08.2026, и проверка идёт раз в час.</p>')}</div>
          <div id="fx-alerts-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Пересчёт буфера${helpIcon('Пересчёт буфера', '<p>Нажмите «Посчитать» — система предложит новое значение буфера на основе реальной волатильности курса и накопленных фактов выкупа. Это только предпросмотр, ничего не меняет.</p><p>«Применить» становится доступно только после предпросмотра и требует отдельного подтверждения — так число нельзя случайно поменять, не увидев его сначала.</p><p>Делать это стоит примерно раз в месяц, или сразу, если «Факт» в блоке выше сильно разошёлся с «Планом».</p>')}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <p class="text-xs text-gray-500">Считает предложенное значение по формуле §4.4, ничего не меняет. Применить — отдельное действие ниже, после того как число видно.</p>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Валюта</label>
              <select id="fx-recompute-currency-select" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="Доллар">USD ($)</option>
                <option value="Юань">CNY (¥)</option>
                <option value="Евро">EUR (€)</option>
                <option value="Фунт">GBP (£)</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Канал</label>
              <select id="fx-recompute-channel-select" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Все каналы (по умолчанию)</option>
              </select>
            </div>
            <div id="fx-recompute-result" class="hidden text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1"></div>
            <button type="button" id="fx-recompute-preview-btn" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Посчитать</button>
            <button type="button" id="fx-recompute-apply-btn" class="hidden w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Применить</button>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Личные закупки${helpIcon('Личные закупки', '<p>Заказы «для себя» (без реального покупателя-клиента) — у них никогда не будет отметки «оплачено», поэтому они намеренно исключены из остальных дашбордов продаж и маржи, чтобы не искажать цифры.</p><p>Здесь — просто отдельный счётчик, сколько на такие закупки потрачено.</p>')}</div>
          <div id="own-purchases-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Валовая маржа${helpIcon('Валовая маржа', '<p>Настоящая прибыль = цена, которую заплатил клиент, минус то, что товар РЕАЛЬНО стоил — не прогноз при оформлении заказа («Итог Руб»), а факт из «Кошелька ₸».</p><p>Заказ появляется здесь только после того, как по нему занесён «Факт выкупа» (кнопка на экране самого заказа) — до этого его настоящая маржа просто не может быть посчитана.</p>')}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <p class="text-xs text-gray-500">Цена клиенту минус признанная себестоимость (не "Итог Руб" — реальный факт выкупа). Пусто, пока по заказу не записан хотя бы один факт выкупа.</p>
            <div id="margin-summary-body" class="text-sm text-gray-400">Загрузка...</div>
            <div id="margin-by-channel-body" class="text-sm text-gray-400"></div>
            <div id="margin-closed-without-purchase-note" class="hidden text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2"></div>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Мотивы занижения комиссии${helpIcon('Мотивы занижения комиссии', '<p>Если менеджер ставит комиссию ниже установленного порога, форма заказа требует написать причину — здесь список всех таких случаев для проверки: обоснованная скидка постоянному клиенту или нежелательный демпинг.</p><p>Нижний раздел («Без причины») — заказы с комиссией ниже порога СЕЙЧАС, у которых причину никогда не спрашивали: обычно это заказы, оформленные до внедрения проверки (26.08.2026), либо ни разу не пересохранённые с тех пор с изменением комиссии.</p>')}</div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <p class="text-xs text-gray-500">Список для ручного просмотра — причина занижения свободным текстом, без автоматической кластеризации. Клик по строке — заказ.</p>
            <div>
              <div class="text-[11px] font-medium text-gray-400 mb-1.5">С указанной причиной (гейт сработал на сохранении)</div>
              <div id="commission-reasons-with-body" class="text-sm text-gray-400">Загрузка...</div>
            </div>
            <div class="pt-3 border-t border-gray-100">
              <div class="text-[11px] font-medium text-gray-400 mb-1.5">Без причины — комиссия ниже порога сейчас, гейт по этому заказу ни разу не срабатывал</div>
              <p class="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">Заказы, сохранённые до внедрения гейта (26.08.2026) либо ни разу не пересохранённые с изменением комиссии с тех пор — причина никогда не запрашивалась, хотя комиссия объективно ниже действующего порога сейчас.</p>
              <div id="commission-reasons-without-body" class="text-sm text-gray-400">Загрузка...</div>
            </div>
          </div>
        </section>

        <section>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2 inline-flex items-center gap-1">Билеты / Конкурсы${helpIcon('Билеты / Конкурсы', '<p>Клиенты копят «Совы» за задания и обменивают их на «Билеты» участия в розыгрышах. «Обязательство» — сколько рублей компания фактически должна, если ВСЕ билеты на руках у клиентов сейчас будут выиграны (билетов × «Оценка билета» из Настроек).</p><p>Когда обязательство приближается к выделенному бюджету на конкурсы — экран сам подсказывает красным, что пора провести розыгрыш и погасить накопленные билеты.</p><p>Числа последнего розыгрыша — сырые факты (сколько билетов потрачено, сколько участников, сколько заказали снова), без готового вывода об окупаемости — это оценивать вам самим, выборка клиентов пока слишком мала для честной статистики.</p>')}</div>
          <div id="contest-dashboard-body" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-sm text-gray-400">Загрузка...</div>
        </section>
      </main>
    `;

    wireFxForm();
    loadWalletBalance();
    loadFxPolicyOverview();
    loadFxAlerts();
    wireFxRecomputeForm();
    loadOwnPurchases();
    loadMarginReport();
    loadCommissionLowReasonReport();
    loadContestDashboard();
    if (window.lucide) window.lucide.createIcons();

    // Э5, D-06 (26.08.2026). Реальный ₸-остаток, не рублёвый эквивалент.
    async function loadWalletBalance() {
      const body = document.getElementById('wallet-balance-body');
      try {
        const balance = await callServer('getWalletBalance');
        if (!balance) {
          body.innerHTML = `<div class="text-gray-400">Касса пуста — ещё не было ни одной конвертации ₽ → ₸.</div>`;
          return;
        }
        const lastEntry = new Date(balance.lastEntryAt).toLocaleString('ru-RU');
        body.innerHTML = `
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="text-[11px] text-gray-400">Остаток</div>
              <div class="text-lg font-semibold text-gray-900">${Number(balance.balanceKzt).toLocaleString('ru-RU')} ₸</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">WAC</div>
              <div class="text-lg font-semibold text-gray-900">${Number(balance.wac).toFixed(4)} ₽/₸</div>
            </div>
          </div>
          <div class="text-[11px] text-gray-400 mt-2 text-center">По состоянию на ${lastEntry}</div>
        `;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function wireFxForm() {
      const submitBtn = document.getElementById('fx-submit-btn');
      submitBtn.addEventListener('click', async () => {
        if (submitBtn.disabled) return;
        document.getElementById('fx-error').classList.add('hidden');
        document.getElementById('fx-result').classList.add('hidden');

        const rubOut = parseFloat(document.getElementById('fx-rub-out-input').value);
        const kztIn = parseFloat(document.getElementById('fx-kzt-in-input').value);
        const bankFeeRawInput = document.getElementById('fx-bank-fee-input').value;
        const bankFeeRub = bankFeeRawInput ? parseFloat(bankFeeRawInput) : undefined;

        if (!(rubOut > 0)) { showFxError('«Отдано рублей» должно быть больше нуля.'); return; }
        if (!(kztIn > 0)) { showFxError('«Получено тенге» должно быть больше нуля.'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Записываю...';
        try {
          const result = await callServer('recordFxConversion', { rubOut, kztIn, bankFeeRub });
          showFxResult(result);
          document.getElementById('fx-rub-out-input').value = '';
          document.getElementById('fx-kzt-in-input').value = '';
          document.getElementById('fx-bank-fee-input').value = '';
          loadWalletBalance();
        } catch (error) {
          showFxError(error.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Записать конвертацию';
        }
      });
    }

    function showFxError(message) {
      const el = document.getElementById('fx-error');
      el.textContent = message;
      el.classList.remove('hidden');
    }

    function showFxResult(result) {
      const el = document.getElementById('fx-result');
      el.innerHTML = `
        <div>Эффективный курс: <b>${result.effectiveRate.toFixed(4)} ₽/₸</b></div>
        <div>Новый баланс кошелька: ${result.walletBalanceKztAfter.toFixed(2)} ₸</div>
        <div>Новый WAC: ${result.wacAfter.toFixed(4)} ₽/₸</div>
      `;
      el.classList.remove('hidden');
    }

    // Данные последнего загруженного плана — нужны, чтобы в модалке
    // подтверждения пересчёта показать "было → станет" реальным числом
    // (не только новое значение).
    let fxPlanData = [];

    async function loadFxPolicyOverview() {
      const planBody = document.getElementById('fx-plan-body');
      const factBody = document.getElementById('buffer-report-body');
      try {
        const report = await callServer('getFxBufferPlanVsFactReport');
        fxPlanData = report.plan || [];
        const factRows = report.factByChannel || [];

        planBody.innerHTML = fxPlanData.length === 0
          ? `<div class="text-gray-400">Политика буфера не найдена.</div>`
          : `
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-400">
                    <th class="pb-2 pr-2">Валюта</th>
                    <th class="pb-2 pr-2">Канал</th>
                    <th class="pb-2 pr-2 text-right">Буфер</th>
                    <th class="pb-2 pr-2 text-right">Комиссии</th>
                    <th class="pb-2 pr-2 text-right">σ</th>
                    <th class="pb-2 pr-2 text-right">Лаг, дн</th>
                    <th class="pb-2 pr-2 text-right">N</th>
                    <th class="pb-2 text-right">С</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${fxPlanData.map(planRowHtml).join('')}
                </tbody>
              </table>
            </div>
          `;

        factBody.innerHTML = factRows.length === 0
          ? `<div class="text-gray-400">Пока нет ни одного факта выкупа — буфер посчитать не из чего.</div>`
          : `
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-400">
                    <th class="pb-2 pr-2">Канал</th>
                    <th class="pb-2 pr-2 text-right">Заказов</th>
                    <th class="pb-2 pr-2 text-right">Средний</th>
                    <th class="pb-2 pr-2 text-right">Медиана</th>
                    <th class="pb-2 text-right">Мин–Макс</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${factRows.map(rowHtml).join('')}
                </tbody>
              </table>
            </div>
          `;

        // Реальные каналы для формы пересчёта — из того же факта, не
        // угадываем и не заводим свободный текстовый ввод (риск опечатки
        // создаёт policy-строку для несуществующего канала).
        const channelSelect = document.getElementById('fx-recompute-channel-select');
        if (channelSelect) {
          const existingValues = Array.from(channelSelect.options).map((o) => o.value);
          const knownChannels = [...new Set(factRows.map((r) => r.purchase_channel).filter(Boolean))];
          knownChannels.forEach((ch) => {
            if (existingValues.includes(ch)) return;
            const opt = document.createElement('option');
            opt.value = ch;
            opt.textContent = ch;
            channelSelect.appendChild(opt);
          });
        }
      } catch (error) {
        planBody.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
        factBody.innerHTML = '';
      }
    }

    function planRowHtml(p) {
      const channelLabel = p.channel ? escapeHtmlClient(p.channel) : 'Все (по умолч.)';
      const effFrom = p.effective_from ? new Date(p.effective_from).toLocaleDateString('ru-RU') : '—';
      return `
        <tr class="text-gray-700">
          <td class="py-2 pr-2 font-medium">${escapeHtmlClient(p.currency)}</td>
          <td class="py-2 pr-2">${channelLabel}</td>
          <td class="py-2 pr-2 text-right font-medium">${Number(p.buffer_pct).toFixed(4)}%</td>
          <td class="py-2 pr-2 text-right">${p.fee_load_pct !== null ? Number(p.fee_load_pct).toFixed(4) + '%' : '—'}</td>
          <td class="py-2 pr-2 text-right">${p.sigma_pct !== null ? Number(p.sigma_pct).toFixed(4) + '%' : '—'}</td>
          <td class="py-2 pr-2 text-right">${p.lag_days_p50 !== null ? Number(p.lag_days_p50).toFixed(1) : '—'}</td>
          <td class="py-2 pr-2 text-right">${p.sample_size}</td>
          <td class="py-2 text-right text-gray-400">${effFrom}</td>
        </tr>
      `;
    }

    function rowHtml(r) {
      const ordersN = parseInt(r.orders_n, 10) || 0;
      const lowData = ordersN < BUFFER_CHANNEL_MIN_ORDERS;
      return `
        <tr class="text-gray-700">
          <td class="py-2 pr-2 font-medium">${escapeHtmlClient(r.purchase_channel || '—')}</td>
          <td class="py-2 pr-2 text-right ${lowData ? 'text-amber-600' : ''}">${ordersN}${lowData ? ' ⚠' : ''}</td>
          <td class="py-2 pr-2 text-right">${r.buffer_avg_pct !== null ? Number(r.buffer_avg_pct).toFixed(2) + '%' : '—'}</td>
          <td class="py-2 pr-2 text-right">${r.buffer_median_pct !== null ? Number(r.buffer_median_pct).toFixed(2) + '%' : '—'}</td>
          <td class="py-2 text-right">${r.buffer_min_pct !== null ? Number(r.buffer_min_pct).toFixed(2) : '—'}–${r.buffer_max_pct !== null ? Number(r.buffer_max_pct).toFixed(2) + '%' : '—'}</td>
        </tr>
        ${lowData ? `<tr><td colspan="5" class="pb-2 text-[10px] text-amber-600">⚠ Меньше ${BUFFER_CHANNEL_MIN_ORDERS} заказов с фактом — среднее ещё не показательно (R-07).</td></tr>` : ''}
      `;
    }

    async function loadFxAlerts() {
      const body = document.getElementById('fx-alerts-body');
      try {
        const alerts = await callServer('getFxExposureAlerts');
        if (!alerts || alerts.length === 0) {
          body.innerHTML = `<div class="text-gray-400">Алертов нет. Проверка идёт раз в час и срабатывает только на заказах со штампом курса, проставленным при создании (заказы начиная с 25.08.2026) — реальные алерты, скорее всего, появятся не раньше, чем через несколько дней обычной работы.</div>`;
          return;
        }
        body.innerHTML = `<div class="divide-y divide-gray-100">${alerts.map(alertRowHtml).join('')}</div>`;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    function alertRowHtml(a) {
      const fired = a.fired_at ? new Date(a.fired_at).toLocaleString('ru-RU') : '—';
      const exposure = (a.exposure_rub !== null && a.exposure_rub !== undefined)
        ? `${Number(a.exposure_rub).toLocaleString('ru-RU')} ₽`
        : '—';
      return `
        <div class="py-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-700">Заказ ${escapeHtmlClient(a.order_id)}</span>
            <span class="text-amber-600 font-semibold">+${Number(a.drift_pct).toFixed(2)}% ⚠</span>
          </div>
          <div class="text-gray-400 mt-0.5">${fired} · курс ${Number(a.stamped_rate).toFixed(4)} → ${Number(a.current_rate).toFixed(4)}</div>
          <div class="text-gray-400">Экспозиция: ${exposure} · порог: ${Number(a.threshold_pct).toFixed(1)}%</div>
        </div>
      `;
    }

    function wireFxRecomputeForm() {
      const previewBtn = document.getElementById('fx-recompute-preview-btn');
      const applyBtn = document.getElementById('fx-recompute-apply-btn');
      const resultEl = document.getElementById('fx-recompute-result');
      let lastProposal = null;

      function resetPreview() {
        resultEl.classList.add('hidden');
        applyBtn.classList.add('hidden');
        lastProposal = null;
      }

      // Смена валюты/канала обесценивает уже посчитанный предпросмотр —
      // не даём применить число, посчитанное для другой пары.
      document.getElementById('fx-recompute-currency-select').addEventListener('change', resetPreview);
      document.getElementById('fx-recompute-channel-select').addEventListener('change', resetPreview);

      previewBtn.addEventListener('click', async () => {
        if (previewBtn.disabled) return;
        resetPreview();
        const channel = document.getElementById('fx-recompute-channel-select').value;
        const currency = document.getElementById('fx-recompute-currency-select').value;

        previewBtn.disabled = true;
        previewBtn.textContent = 'Считаю...';
        try {
          const proposal = await callServer('getFxBufferRecomputeSuggestion', channel, currency);
          if (!proposal.ok) {
            resultEl.innerHTML = `<div class="text-red-600">${escapeHtmlClient(proposal.reason)}</div>`;
            resultEl.classList.remove('hidden');
            return;
          }
          lastProposal = proposal;
          const warn = proposal.lowConfidence
            ? `<div class="text-amber-600 mt-1">⚠ Меньше ${BUFFER_CHANNEL_MIN_ORDERS} заказов с фактом по этой паре — число ещё не показательно (R-07).</div>`
            : '';
          resultEl.innerHTML = `
            <div>Новый буфер: <b>${proposal.bufferPct.toFixed(4)}%</b></div>
            <div>В т.ч. нагрузка по комиссиям: ${proposal.feeLoadPct !== null ? Number(proposal.feeLoadPct).toFixed(4) + '%' : '—'}</div>
            <div>σ курса (окно ${Math.round(proposal.lagDaysP50)} дн.): ${proposal.sigmaPct.toFixed(4)}%</div>
            <div>Выборка: ${proposal.sampleSize} заказ(ов)</div>
            ${warn}
          `;
          resultEl.classList.remove('hidden');
          applyBtn.classList.remove('hidden');
        } catch (error) {
          resultEl.innerHTML = `<div class="text-red-600">Ошибка: ${escapeHtmlClient(error.message)}</div>`;
          resultEl.classList.remove('hidden');
        } finally {
          previewBtn.disabled = false;
          previewBtn.textContent = 'Посчитать';
        }
      });

      applyBtn.addEventListener('click', async () => {
        if (applyBtn.disabled || !lastProposal) return;
        const channel = document.getElementById('fx-recompute-channel-select').value;
        const currency = document.getElementById('fx-recompute-currency-select').value;
        const channelText = channel ? `, канал «${channel}»` : ' (все каналы)';
        const oldPolicy = fxPlanData.find((p) => (p.channel || '') === channel && p.currency === currency);
        const oldText = oldPolicy ? `${Number(oldPolicy.buffer_pct).toFixed(4)}%` : 'не задан';

        const confirmed = await showConfirmModal(
          `Буфер для «${currency}»${channelText}: ${oldText} → ${lastProposal.bufferPct.toFixed(4)}%.\n\nПрименить новое значение?`,
          { confirmLabel: 'Применить' }
        );
        if (!confirmed) return;

        applyBtn.disabled = true;
        applyBtn.textContent = 'Применяю...';
        try {
          await callServer('applyFxBufferRecompute', channel, currency);
          resultEl.innerHTML += `<div class="text-emerald-700 mt-1">✓ Применено — новая политика активна.</div>`;
          applyBtn.classList.add('hidden');
          lastProposal = null;
          loadFxPolicyOverview(); // обновить план — новая активная строка уже записана
        } catch (error) {
          resultEl.innerHTML += `<div class="text-red-600 mt-1">Ошибка применения: ${escapeHtmlClient(error.message)}</div>`;
        } finally {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Применить';
        }
      });
    }

    async function loadOwnPurchases() {
      const body = document.getElementById('own-purchases-body');
      try {
        const report = await callServer('getOwnPurchasesReport');
        body.innerHTML = `
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="text-[11px] text-gray-400">Заказов</div>
              <div class="text-base font-semibold text-gray-900">${report.orderCount}</div>
            </div>
            <div>
              <div class="text-[11px] text-gray-400">Потрачено</div>
              <div class="text-base font-semibold text-gray-900">${Number(report.totalSpentRub).toLocaleString('ru-RU')} ₽</div>
            </div>
          </div>
          <div class="text-[11px] text-gray-400 mt-2 text-center">Личный контур (client_kind='own') — исключён из остальных дашбордов, у него нет плательщика.</div>
        `;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }

    // Э5 раунд 4 (REFACTOR-ECONOMY.md §5, продолжение F-05, 26.08.2026).
    async function loadMarginReport() {
      const summaryBody = document.getElementById('margin-summary-body');
      const channelBody = document.getElementById('margin-by-channel-body');
      const noteEl = document.getElementById('margin-closed-without-purchase-note');
      try {
        const [report, closedWithoutPurchase] = await Promise.all([
          callServer('getMarginReport'),
          callServer('getClosedWithoutPurchaseReport')
        ]);
        const byOrder = report.byOrder || [];
        const byChannel = report.byChannel || [];

        if (byOrder.length === 0) {
          summaryBody.innerHTML = `<div class="text-gray-400">Пока ни одного заказа с признанной себестоимостью.</div>`;
        } else {
          const totalPrice = byOrder.reduce((s, r) => s + Number(r.price_client_rub || 0), 0);
          const totalCogs = byOrder.reduce((s, r) => s + Number(r.cogs_rub || 0), 0);
          const totalMargin = totalPrice - totalCogs;
          summaryBody.innerHTML = `
            <div class="grid grid-cols-3 gap-3 text-center">
              <div>
                <div class="text-[11px] text-gray-400">Заказов</div>
                <div class="text-base font-semibold text-gray-900">${byOrder.length}</div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Себестоимость</div>
                <div class="text-base font-semibold text-gray-900">${totalCogs.toLocaleString('ru-RU')} ₽</div>
              </div>
              <div>
                <div class="text-[11px] text-gray-400">Маржа</div>
                <div class="text-base font-semibold ${totalMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}">${totalMargin.toLocaleString('ru-RU')} ₽</div>
              </div>
            </div>
          `;
        }

        channelBody.innerHTML = byChannel.length === 0 ? '' : `
          <div class="overflow-x-auto pt-3 border-t border-gray-100">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-gray-400">
                  <th class="pb-2 pr-2">Канал</th>
                  <th class="pb-2 pr-2 text-right">Заказов</th>
                  <th class="pb-2 pr-2 text-right">Маржа</th>
                  <th class="pb-2 text-right">Средняя %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${byChannel.map((r) => `
                  <tr class="text-gray-700">
                    <td class="py-2 pr-2 font-medium">${escapeHtmlClient(r.purchase_channel || '—')}</td>
                    <td class="py-2 pr-2 text-right">${Number(r.orders_n)}</td>
                    <td class="py-2 pr-2 text-right">${Number(r.margin_total_rub).toLocaleString('ru-RU')} ₽</td>
                    <td class="py-2 text-right">${r.margin_avg_pct !== null ? Number(r.margin_avg_pct).toFixed(1) + '%' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        if (closedWithoutPurchase.count > 0) {
          noteEl.textContent = `⚠ ${closedWithoutPurchase.count} заказ(ов) в статусе «Получено клиентом» без учтённой себестоимости — вероятно, факт выкупа не занесён. На старте механизма (26.08.2026) это ожидаемо для всей истории; если число растёт на СВЕЖИХ заказах — стоит напомнить менеджерам про кнопку «Факт выкупа».`;
          noteEl.classList.remove('hidden');
        }
      } catch (error) {
        summaryBody.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
        channelBody.innerHTML = '';
      }
    }

    /**
     * Отчёт "мотивы занижения комиссии" (Э6, чек-лист п.6, 26.08.2026) — два
     * раздела, см. JSDoc financeService.getCommissionLowReasonReport для
     * итемизированного видения (пробел "до гейта" — согласовано с VASY).
     */
    async function loadCommissionLowReasonReport() {
      const withBody = document.getElementById('commission-reasons-with-body');
      const withoutBody = document.getElementById('commission-reasons-without-body');

      function sectionHtml(section, { showReason }) {
        if (section.count === 0) return `<div class="text-gray-400">Пусто.</div>`;
        return `
          <div class="text-[11px] text-gray-500 mb-2">Всего: ${section.count}, средняя комиссия: ${section.avgPct !== null ? section.avgPct.toFixed(1) + '%' : '—'}${section.byChannel.length > 0 ? ' · ' + section.byChannel.map((c) => `${escapeHtmlClient(c.channel || '(без канала)')}: ${c.count}`).join(', ') : ''}</div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-gray-400">
                  <th class="pb-2 pr-2">Заказ</th>
                  <th class="pb-2 pr-2">Канал</th>
                  <th class="pb-2 pr-2">Клиент</th>
                  <th class="pb-2 pr-2 text-right">Комиссия</th>
                  ${showReason ? '<th class="pb-2">Причина</th>' : ''}
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${section.rows.map((r) => `
                  <tr class="text-gray-700 cursor-pointer hover:bg-gray-50" data-order-id="${escapeHtmlClient(r.orderId)}">
                    <td class="py-2 pr-2 font-medium">${escapeHtmlClient(r.orderId)}</td>
                    <td class="py-2 pr-2">${escapeHtmlClient(r.purchaseChannel || '—')}</td>
                    <td class="py-2 pr-2">${escapeHtmlClient(r.clientName || r.telegramId || '—')}</td>
                    <td class="py-2 pr-2 text-right">${Number(r.commissionPct).toFixed(1)}%</td>
                    ${showReason ? `<td class="py-2 max-w-[180px] truncate" title="${escapeHtmlClient(r.reason || '')}">${escapeHtmlClient(r.reason || '')}</td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      function wireRowClicks(container) {
        container.querySelectorAll('tr[data-order-id]').forEach((row) => {
          row.addEventListener('click', () => navigateTo(`orders/${encodeURIComponent(row.dataset.orderId)}/edit`));
        });
      }

      try {
        const report = await callServer('getCommissionLowReasonReport');
        withBody.innerHTML = sectionHtml(report.withReason, { showReason: true });
        withoutBody.innerHTML = sectionHtml(report.withoutReason, { showReason: false });
        wireRowClicks(withBody);
        wireRowClicks(withoutBody);
      } catch (error) {
        withBody.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
        withoutBody.innerHTML = '';
      }
    }

    /**
     * Дашборд "Билеты/Конкурсы" (Э7, 26.08.2026) — бюджет vs потрачено,
     * текущее обязательство по билетам, сигнал "пора делать конкурс" и
     * сырые числа последнего розыгрыша БЕЗ вывода об окупаемости (см.
     * ticketEconomyService.js JSDoc — на таком объёме клиентов честную
     * атрибуцию посчитать нельзя, показываем факты, оценку делает VASY сам).
     */
    async function loadContestDashboard() {
      const body = document.getElementById('contest-dashboard-body');
      try {
        const d = await callServer('getContestDashboard');
        const rub = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

        const budgetHtml = d.budgetConfigured ? `
          <div class="grid grid-cols-3 gap-2 text-center">
            <div><div class="text-[10px] text-gray-400">Бюджет</div><div class="text-sm font-semibold text-gray-900">${rub(d.budgetRub)}</div></div>
            <div><div class="text-[10px] text-gray-400">Потрачено</div><div class="text-sm font-semibold text-gray-900">${rub(d.spentRub)}</div></div>
            <div><div class="text-[10px] text-gray-400">Осталось</div><div class="text-sm font-semibold ${d.remainingRub >= 0 ? 'text-emerald-700' : 'text-red-600'}">${rub(d.remainingRub)}</div></div>
          </div>
        ` : `<div class="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">Бюджет на конкурсы не задан (0 ₽) — настройка "Бюджет_Маркетинг_Конкурсы" в "Настройках" → "Экономика".</div>`;

        const faceValueHtml = d.faceValueRub > 0
          ? `<div class="text-[11px] text-gray-500">Оценка билета: ${rub(d.faceValueRub)}</div>`
          : `<div class="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">Билет не оценён (0 ₽) — проводки по обязательству не пишутся, пока не задана настройка "Билет_Оценка_Руб". Вводится ПОСЛЕ лотереи-погашения накопленных сов.</div>`;

        const signalHtml = d.timeToRunContest
          ? `<div class="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-medium">Пора делать конкурс — обязательство уже ${d.liabilityPctOfBudget}% бюджета (порог ${d.signalThresholdPct}%).</div>`
          : (d.liabilityPctOfBudget !== null ? `<div class="text-[11px] text-gray-500">Обязательство: ${rub(d.liabilityRub)} (${d.liabilityPctOfBudget}% бюджета, порог сигнала ${d.signalThresholdPct}%)</div>` : `<div class="text-[11px] text-gray-500">Обязательство: ${rub(d.liabilityRub)}</div>`);

        const lastContestHtml = d.lastContest ? `
          <div class="pt-3 border-t border-gray-100">
            <div class="text-[11px] font-medium text-gray-400 mb-1.5">Последний завершённый розыгрыш: «${escapeHtmlClient(d.lastContest.title)}» (${new Date(d.lastContest.finishedAt).toLocaleDateString('ru-RU')})</div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div><div class="text-[10px] text-gray-400">Билетов потрачено</div><div class="text-sm font-semibold text-gray-900">${d.lastContest.ticketsSpent}</div></div>
              <div><div class="text-[10px] text-gray-400">Участников</div><div class="text-sm font-semibold text-gray-900">${d.lastContest.participants}</div></div>
              <div><div class="text-[10px] text-gray-400">Заказали снова за 14 дн.</div><div class="text-sm font-semibold text-gray-900">${d.lastContest.reorderedWithin14Days}</div></div>
            </div>
            <div class="text-[10px] text-gray-400 mt-1.5">Сырые числа, без вывода об окупаемости — оцените сами.</div>
          </div>
        ` : `<div class="pt-3 border-t border-gray-100 text-gray-400">Ещё ни один розыгрыш не завершён.</div>`;

        body.innerHTML = `<div class="space-y-3">${budgetHtml}${faceValueHtml}${signalHtml}${lastContestHtml}</div>`;
      } catch (error) {
        body.innerHTML = `<div class="text-red-500">Ошибка загрузки: ${escapeHtmlClient(error.message)}</div>`;
      }
    }
  }
};
