'use strict';

/**
 * «Мои достижения» (план Б, 05.10.2026; VASY: «достижения за вишлисты и за
 * обучение — в одном месте, удобно и красиво; упор на понятность и
 * геймификацию»).
 *
 * - ClientAchievements.badgeHtml(a, size) — круглый значок: «Обучение» —
 *   фиолетовый, «Мои куклы» — розовый, золотые — золото, закрытые — серые.
 *   Тот же рисунок уходит в картинку «Поделиться» (server/tools/
 *   generate-achievement-badges.js снимает его отсюда).
 * - экран #/achievements: сводка «N из M» и «Ближе всего», полки, плитки с
 *   прогрессом и наградой совами (если на достижение заведено задание),
 *   карточка достижения по нажатию, «Поделиться» — картинка в чат с ботом;
 * - profileCardHtml — карточка наверху «Профиля»;
 * - celebrate(result) — праздник после урока: новые достижения, «+N сов».
 */
(function () {
  const esc = (s) => escapeHtmlClient(s == null ? '' : String(s));
  const GRADIENTS = {
    training: 'linear-gradient(135deg,#818cf8 0%,#7c3aed 100%)',
    dolls: 'linear-gradient(135deg,#f9a8d4 0%,#ec4899 100%)',
    gold: 'linear-gradient(135deg,#fde68a 0%,#f59e0b 100%)'
  };
  const SHELF_ACTION = {
    training: { label: 'Открыть обучение', route: 'training' },
    dolls: { label: 'Открыть «Мои куклы»', route: 'wishlist' }
  };

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const dateRu = (d) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  /** Круглый значок. Инлайн-стили — тот же рисунок рисует генератор картинок для «Поделиться». */
  function badgeHtml(a, size) {
    const s = size || 56;
    const icon = Math.round(s * 0.46);
    if (!a.unlocked) {
      return `<span class="ach-badge" style="width:${s}px;height:${s}px;border-radius:999px;background:#eef0f4;display:inline-flex;align-items:center;justify-content:center;position:relative;color:#c3c8d4">
        <i data-lucide="${esc(a.icon)}" style="width:${icon}px;height:${icon}px;stroke-width:2.2"></i>
        <span style="position:absolute;right:-2px;bottom:-2px;width:${Math.round(s * 0.38)}px;height:${Math.round(s * 0.38)}px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;color:#9ca3af"><i data-lucide="lock" style="width:${Math.round(s * 0.2)}px;height:${Math.round(s * 0.2)}px"></i></span>
      </span>`;
    }
    const bg = a.gold ? GRADIENTS.gold : (GRADIENTS[a.shelf] || GRADIENTS.dolls);
    const ring = a.gold ? 'box-shadow:0 0 0 3px #fef3c7,0 6px 14px rgba(245,158,11,.35)' : 'box-shadow:0 6px 14px rgba(99,102,241,.22)';
    return `<span class="ach-badge" style="width:${s}px;height:${s}px;border-radius:999px;background:${bg};display:inline-flex;align-items:center;justify-content:center;color:#fff;${ring}">
      <i data-lucide="${esc(a.icon)}" style="width:${icon}px;height:${icon}px;stroke-width:2.2"></i>
    </span>`;
  }

  function progressLine(p, compact) {
    if (!p || !p.need) return '';
    const pct = Math.max(0, Math.min(100, Math.round((p.have / p.need) * 100)));
    return `<div class="${compact ? 'mt-1.5' : 'mt-3'} w-full">
      <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full bg-indigo-500" style="width:${pct}%"></div></div>
      <div class="text-[10px] text-gray-400 mt-0.5">${p.have} из ${p.need}</div>
    </div>`;
  }

  function tileHtml(a) {
    return `<button type="button" data-achievement="${esc(a.code)}" class="relative bg-white rounded-2xl border ${a.unlocked ? (a.gold ? 'border-amber-200' : 'border-gray-100') : 'border-dashed border-gray-200'} shadow-sm p-2.5 flex flex-col items-center text-center active:scale-[0.97] transition-transform">
      ${a.isNew ? '<span class="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-pink-500 text-white text-[9px] font-semibold">Новое</span>' : ''}
      ${!a.unlocked && a.rewardSovy > 0 ? `<span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-semibold">🦉 +${a.rewardSovy}</span>` : ''}
      <span class="mt-1">${badgeHtml(a, 52)}</span>
      <span class="text-[11.5px] font-semibold leading-tight mt-2 ${a.unlocked ? 'text-gray-900' : 'text-gray-500'}">${esc(a.title)}</span>
      ${a.unlocked
        ? `<span class="text-[10px] text-gray-400 mt-0.5">${esc(new Date(a.unlockedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))}</span>`
        : (a.progress ? progressLine(a.progress, true) : `<span class="text-[10px] text-gray-400 leading-tight mt-0.5">${esc(a.hint)}</span>`)}
    </button>`;
  }

  function ringSvg(done, total, size, color, track) {
    const r = (size - 8) / 2;
    const c = 2 * Math.PI * r;
    const pct = total ? done / total : 0;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
    </svg>`;
  }

  function nextLine(next) {
    if (!next || !next.progress) return '';
    const left = next.progress.need - next.progress.have;
    const what = next.shelf === 'training'
      ? `ещё ${left} ${plural(left, 'урок', 'урока', 'уроков')}`
      : `ещё ${left} ${plural(left, 'кукла', 'куклы', 'кукол')} на полку`;
    return `Ближе всего: «${esc(next.title)}» — ${what}`;
  }

  /** Карточка наверху «Профиля»: кольцо, последние значки, «Ближе всего». */
  function profileCardHtml(data) {
    const recent = data.items.filter((a) => a.unlocked).sort((x, y) => new Date(y.unlockedAt) - new Date(x.unlockedAt)).slice(0, 5);
    return `<button type="button" id="profile-achievements-card" class="w-full text-left rounded-2xl p-4 mb-4 text-white shadow-sm" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%)">
      <div class="flex items-center gap-3">
        <div class="relative shrink-0" style="width:60px;height:60px">
          ${ringSvg(data.unlockedCount, data.total, 60, '#fff', 'rgba(255,255,255,.25)')}
          <div class="absolute inset-0 flex items-center justify-center text-[15px] font-bold">${data.unlockedCount}</div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[15px] font-semibold">🏆 Мои достижения</div>
          <div class="text-[12px] opacity-90">Открыто ${data.unlockedCount} из ${data.total}</div>
          ${data.next ? `<div class="text-[11.5px] opacity-90 mt-1 leading-snug">${nextLine(data.next)}</div>` : ''}
        </div>
        <i data-lucide="chevron-right" class="w-5 h-5 opacity-80 shrink-0"></i>
      </div>
      ${recent.length ? `<div class="flex gap-1.5 mt-3">${recent.map((a) => `<span style="box-shadow:0 0 0 2px rgba(255,255,255,.7);border-radius:999px;display:inline-flex">${badgeHtml(a, 30)}</span>`).join('')}</div>` : ''}
    </button>`;
  }

  // --- Экран «Мои достижения» ---

  function openSheet(a) {
    const action = SHELF_ACTION[a.shelf] || SHELF_ACTION.dolls;
    const lesson = !a.unlocked && a.shelf === 'training' && window.ClientTraining ? ClientTraining.lessonForAchievement(a.code) : null;
    const el = document.createElement('div');
    el.id = 'achievement-sheet';
    el.className = 'fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[72]';
    el.innerHTML = `<div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center">
      <div class="flex justify-center">${badgeHtml(a, 96)}</div>
      <div class="text-lg font-bold text-gray-900 mt-3">${esc(a.title)}</div>
      <div class="text-[12px] mt-0.5 ${a.unlocked ? 'text-emerald-600' : 'text-gray-400'}">${a.unlocked ? `Открыто ${esc(dateRu(a.unlockedAt))}` : 'Ещё не открыто'}</div>
      <div class="text-[14px] text-gray-700 mt-3 leading-snug">${esc(a.unlocked ? (a.cheer || a.hint) : a.hint)}</div>
      ${!a.unlocked && a.progress ? `<div class="max-w-[220px] mx-auto">${progressLine(a.progress)}</div>` : ''}
      ${!a.unlocked && a.rewardSovy > 0 ? `<div class="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[13px] font-medium">🦉 Награда: +${a.rewardSovy} ${plural(a.rewardSovy, 'сова', 'совы', 'сов')}</div>` : ''}
      <div class="flex gap-2 mt-5">
        <button type="button" data-close class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Закрыть</button>
        ${a.unlocked ? '' : (lesson
          ? `<button type="button" data-lesson="${esc(lesson.id)}" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">▶ ${esc(lesson.title)}</button>`
          : `<button type="button" data-go="${esc(action.route)}" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">${esc(action.label)}</button>`)}
      </div>
    </div>`;
    document.body.appendChild(el);
    if (window.lucide) window.lucide.createIcons();
    const close = () => el.remove();
    el.onclick = (e) => { if (e.target === el) close(); };
    el.querySelector('[data-close]').onclick = close;
    const go = el.querySelector('[data-go]');
    if (go) go.onclick = () => { close(); navigateTo(go.dataset.go); };
    const startLesson = el.querySelector('[data-lesson]');
    if (startLesson) startLesson.onclick = () => { close(); ClientTraining.startLesson(startLesson.dataset.lesson); };
  }

  async function share(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await callServer('shareMyAchievements');
      showSaveToast(true, `Собираем картинку с вашими достижениями (${r.count}) — через несколько секунд она будет в чате с ботом ✨`);
    } catch (error) {
      showSaveToast(false, error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.Screens = window.Screens || {};
  window.Screens.achievements = {
    render(root) {
      document.getElementById('header-left').innerHTML = `
        <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50"><i data-lucide="arrow-left" class="w-6 h-6"></i></button>
        <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Мои достижения</h1>`;
      document.getElementById('header-actions').innerHTML = `
        <button id="share-achievements-btn" title="Поделиться" class="p-2 text-indigo-600 rounded-full hover:bg-white/50"><i data-lucide="share-2" class="w-5 h-5"></i></button>`;
      document.getElementById('back-btn').onclick = () => navigateTo('profile');
      root.innerHTML = `<main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto"><div id="achievements-root"><div class="p-6 text-center text-sm text-gray-400">Загрузка...</div></div></main>`;
      load();

      let data = null;
      document.getElementById('share-achievements-btn').onclick = (e) => {
        if (data && data.unlockedCount === 0) { showSaveToast(false, 'Откройте первое достижение — и будет чем поделиться ✨'); return; }
        share(e.currentTarget);
      };

      async function load() {
        const box = document.getElementById('achievements-root');
        try {
          [data] = await Promise.all([callServer('getMyAchievements'), window.ClientTraining ? ClientTraining.load().catch(() => null) : null]);
        } catch (error) {
          if (box) box.innerHTML = `<div class="p-6 text-center text-sm text-red-500">Ошибка загрузки: ${esc(error.message)}</div>`;
          return;
        }
        if (!document.getElementById('achievements-root')) return;
        render(box);
      }

      function render(box) {
        const training = window.ClientTraining ? ClientTraining.cached() : null;
        box.innerHTML = `
          <div class="rounded-3xl p-5 mb-5 text-white shadow-sm" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%)">
            <div class="flex items-center gap-4">
              <div class="relative shrink-0" style="width:84px;height:84px">
                ${ringSvg(data.unlockedCount, data.total, 84, '#fff', 'rgba(255,255,255,.25)')}
                <div class="absolute inset-0 flex flex-col items-center justify-center leading-none"><span class="text-2xl font-bold">${data.unlockedCount}</span><span class="text-[11px] opacity-80 mt-0.5">из ${data.total}</span></div>
              </div>
              <div class="min-w-0">
                <div class="text-[17px] font-bold">${data.unlockedCount === data.total ? 'Все достижения открыты! 🎉' : (data.unlockedCount ? 'Отличный прогресс!' : 'Здесь будут ваши награды')}</div>
                <div class="text-[12.5px] opacity-90 mt-1 leading-snug">${data.next ? nextLine(data.next) : 'Проходите уроки и собирайте полку — за каждое достижение здесь появится значок.'}</div>
              </div>
            </div>
          </div>
          ${data.shelves.map((s) => {
            const items = data.items.filter((a) => a.shelf === s.key);
            const pct = s.total ? Math.round((s.unlockedCount / s.total) * 100) : 0;
            const nextLesson = s.key === 'training' && training && training.next ? training.next : null;
            return `<section class="mb-6" data-shelf="${esc(s.key)}">
              <div class="flex items-center justify-between px-1 mb-2">
                <div class="text-[15px] font-bold text-gray-900">${esc(s.emoji)} ${esc(s.title)}</div>
                <div class="text-[12px] text-gray-400">${s.unlockedCount} из ${s.total}</div>
              </div>
              <div class="h-1.5 rounded-full bg-gray-200/70 overflow-hidden mx-1 mb-3"><div class="h-full rounded-full" style="width:${pct}%;background:${s.key === 'training' ? GRADIENTS.training : GRADIENTS.dolls}"></div></div>
              <div class="grid grid-cols-3 gap-2.5">${items.map(tileHtml).join('')}</div>
              ${nextLesson ? `<button type="button" data-next-lesson="${esc(nextLesson.id)}" class="mt-3 w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-[13px] font-medium">▶ Следующий урок: ${esc(nextLesson.title)} · ${nextLesson.minutes} мин</button>` : ''}
            </section>`;
          }).join('')}
          <button type="button" id="share-achievements-wide" class="w-full py-3 rounded-2xl bg-white border border-indigo-100 text-indigo-600 text-sm font-medium flex items-center justify-center gap-2 shadow-sm"><i data-lucide="share-2" class="w-4 h-4"></i>Поделиться достижениями</button>
          <div class="text-[11px] text-gray-400 text-center mt-2">Картинка придёт в чат с ботом — оттуда её можно переслать подругам</div>`;
        if (window.lucide) window.lucide.createIcons();
        box.querySelectorAll('[data-achievement]').forEach((b) => {
          b.onclick = () => openSheet(data.items.find((a) => a.code === b.dataset.achievement));
        });
        box.querySelectorAll('[data-next-lesson]').forEach((b) => { b.onclick = () => ClientTraining.startLesson(b.dataset.nextLesson); });
        document.getElementById('share-achievements-wide').onclick = () => document.getElementById('share-achievements-btn').click();
      }
    }
  };

  // --- Праздник после урока ---

  function confettiHtml() {
    const colors = ['#f472b6', '#818cf8', '#fbbf24', '#34d399', '#60a5fa', '#f87171'];
    return Array.from({ length: 36 }, (_, i) => {
      const left = (i * 37) % 100;
      const delay = (i % 9) * 0.08;
      const dur = 1.6 + (i % 5) * 0.25;
      return `<i style="position:absolute;top:-12px;left:${left}%;width:${6 + (i % 3) * 2}px;height:${10 + (i % 4) * 2}px;background:${colors[i % colors.length]};border-radius:2px;animation:achFall ${dur}s ${delay}s ease-in forwards;transform:rotate(${i * 23}deg)"></i>`;
    }).join('');
  }

  /**
   * @param {{achievements?:Array, sovy?:Array<{title:string,reward:number}>, done?:number, total?:number}} result
   * @param {{title:string}} lesson
   */
  function celebrate(result, lesson) {
    const r = result || {};
    const achievements = r.achievements || [];
    const sovy = (r.sovy || []).reduce((sum, s) => sum + (Number(s.reward) || 0), 0);
    const progressText = r.total ? `Пройдено уроков: ${r.done} из ${r.total}` : '';
    if (!achievements.length && !sovy) {
      showSaveToast(true, `🎓 Урок «${lesson ? lesson.title : ''}» пройден!${progressText ? ` ${progressText}` : ''}`);
      return Promise.resolve();
    }
    if (!document.getElementById('ach-celebrate-style')) {
      const st = document.createElement('style');
      st.id = 'ach-celebrate-style';
      st.textContent = '@keyframes achFall{to{transform:translateY(105vh) rotate(540deg);opacity:.2}}@keyframes achPop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}@media (prefers-reduced-motion:reduce){#ach-celebrate i,#ach-celebrate [data-pop]{animation:none!important}}';
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.id = 'ach-celebrate';
    el.className = 'fixed inset-0 z-[80] flex items-center justify-center px-5';
    el.style.background = 'rgba(17,24,39,.6)';
    el.innerHTML = `<div class="absolute inset-0 overflow-hidden pointer-events-none">${confettiHtml()}</div>
      <div class="relative bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
        <div class="text-[12px] font-semibold text-indigo-600 uppercase tracking-wide">${achievements.length ? (achievements.length === 1 ? 'Новое достижение' : 'Новые достижения') : 'Награда'}</div>
        ${achievements.map((a, i) => `
          <div class="mt-4" data-pop style="animation:achPop .6s ${0.15 + i * 0.25}s both">
            <div class="flex justify-center">${badgeHtml({ ...a, unlocked: true }, achievements.length > 1 ? 72 : 104)}</div>
            <div class="text-lg font-bold text-gray-900 mt-2">${esc(a.title)}</div>
            ${a.cheer ? `<div class="text-[13.5px] text-gray-600 mt-0.5">${esc(a.cheer)}</div>` : ''}
          </div>`).join('')}
        ${sovy ? `<div class="text-[12px] text-gray-500 mt-4">${esc((r.sovy || []).map((x) => `За задание «${x.title}»`).join(' · '))}</div>` : ''}
        ${sovy ? `<div class="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-[15px] font-semibold" data-pop style="animation:achPop .6s ${0.3 + achievements.length * 0.25}s both">🦉 +${sovy} ${plural(sovy, 'сова', 'совы', 'сов')}</div>` : ''}
        ${progressText ? `<div class="text-[12px] text-gray-400 mt-3">${esc(progressText)}</div>` : ''}
        <div class="flex gap-2 mt-5">
          <button type="button" data-all class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Все достижения</button>
          <button type="button" data-ok class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium">Отлично!</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    if (window.lucide) window.lucide.createIcons();
    try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success'); } catch (e) { /* без вибрации */ }
    // Праздник закрыли — следом отзыв об уроке (client/training.js).
    return new Promise((resolve) => {
      el.querySelector('[data-ok]').onclick = () => { el.remove(); resolve(); };
      el.querySelector('[data-all]').onclick = () => { el.remove(); navigateTo('achievements'); resolve(); };
    });
  }

  window.ClientAchievements = { badgeHtml, tileHtml, profileCardHtml, celebrate, plural };
})();
