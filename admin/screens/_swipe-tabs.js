'use strict';

/**
 * Свайп между вкладками экрана на телефоне (05.10.2026, VASY: «свайп отличный,
 * его можно и по другим вкладкам» — как лента колонок в «Задачах»). Вкладка
 * едет за пальцем; отпустил дальше четверти экрана (или быстрым движением) —
 * уезжает, соседняя въезжает с той стороны; иначе пружинит назад. На краю
 * (соседа нет) — тугое сопротивление. Переключение — тем же кликом по кнопке
 * вкладки, что и пальцем по ней: вся логика экрана остаётся его собственной.
 *
 * Не перехватывает: широкий экран (md+), поля ввода, ленты/таблицы, которые
 * сами листаются вбок, и вертикальную прокрутку (направление решается по
 * первым ~8 px движения).
 *
 * SwipeTabs.attach({ area, keys, getActive, panelFor, activate })
 *   area      — элемент, на котором ловим жест (обычно <main> экрана)
 *   keys()    — ключи вкладок по порядку (функция: набор может зависеть от роли)
 *   getActive() — ключ активной вкладки
 *   panelFor(key) — элемент, который двигать
 *   activate(key) — переключить вкладку (обычно click по её кнопке)
 */
window.SwipeTabs = {
  attach({ area, keys, getActive, panelFor, activate }) {
    if (!area) return;
    let st = null;

    function scrollsSideways(el) {
      for (let n = el; n && n !== area; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
      }
      return false;
    }

    function reset(panel) {
      if (!panel) return;
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.opacity = '';
      panel.style.willChange = '';
    }

    area.addEventListener('touchstart', (e) => {
      st = null;
      if (window.innerWidth >= 768 || e.touches.length !== 1) return;
      if (e.target.closest('input, textarea, select, [data-no-swipe]')) return;
      if (scrollsSideways(e.target)) return;
      const panel = panelFor(getActive());
      if (!panel) return;
      const t = e.touches[0];
      st = { x: t.clientX, y: t.clientY, t: performance.now(), dir: null, dx: 0, panel };
    }, { passive: true });

    area.addEventListener('touchmove', (e) => {
      if (!st) return;
      const t = e.touches[0];
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (!st.dir) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        st.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (st.dir === 'x') {
          area.style.overflowX = 'clip';
          st.panel.style.transition = 'none';
          st.panel.style.willChange = 'transform';
        }
      }
      if (st.dir !== 'x') return;
      const list = keys();
      const i = list.indexOf(getActive());
      const hasNeighbour = dx < 0 ? i < list.length - 1 : i > 0;
      st.dx = dx;
      st.panel.style.transform = `translateX(${hasNeighbour ? dx : dx * 0.25}px)`;
    }, { passive: true });

    function end() {
      if (!st) return;
      const { panel, dx, dir, t } = st;
      st = null;
      if (dir !== 'x') return;
      const list = keys();
      const i = list.indexOf(getActive());
      const target = dx < 0 ? i + 1 : i - 1;
      const w = area.clientWidth || window.innerWidth;
      const speed = Math.abs(dx) / Math.max(1, performance.now() - t);
      const commit = target >= 0 && target < list.length && (Math.abs(dx) > w * 0.25 || (speed > 0.45 && Math.abs(dx) > 30));
      if (!commit) {
        panel.style.transition = 'transform 180ms ease-out';
        panel.style.transform = '';
        setTimeout(() => { reset(panel); area.style.overflowX = ''; }, 200);
        return;
      }
      panel.style.transition = 'transform 150ms ease-in';
      panel.style.transform = `translateX(${dx < 0 ? -w : w}px)`;
      setTimeout(() => {
        reset(panel);
        activate(list[target]);
        const next = panelFor(list[target]);
        if (!next) { area.style.overflowX = ''; return; }
        next.style.transition = 'none';
        next.style.transform = `translateX(${dx < 0 ? w * 0.35 : -w * 0.35}px)`;
        next.style.opacity = '0.4';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          next.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
          next.style.transform = '';
          next.style.opacity = '';
          setTimeout(() => { reset(next); area.style.overflowX = ''; }, 230);
        }));
      }, 150);
    }
    area.addEventListener('touchend', end, { passive: true });
    area.addEventListener('touchcancel', end, { passive: true });
  }
};
