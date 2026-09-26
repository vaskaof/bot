'use strict';

/**
 * «Охота» — общие элементы геймификации «Мои куклы» (IMPLEMENTATION-PLAN-
 * GAMIFICATION.md, Волна 1): плитка куклы с силуэтом вместо отсутствующего
 * фото, нижний лист, праздник «Добыто!» (S2/S3), сводка, анонс «Открыт сезон
 * охоты», вибрация Telegram, полёт плитки к табу. Используется экранами
 * wishlist.js и collection-album.js. Стили — свои (`hn-*`), вставляются
 * один раз при загрузке файла.
 */
(function () {
  const CONFETTI_SRC = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js';
  const S2_MS = 4000;
  const S3_MS = 6000;

  const CSS = `
  .hn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 10px}
  @media (max-width:359px){.hn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .hn-strip{display:flex;gap:14px;overflow-x:auto;padding:6px 4px 8px;margin:0 -4px;scrollbar-width:none}
  .hn-strip::-webkit-scrollbar{display:none}
  .hn-strip .hn-tile{width:108px;flex:none}
  .hn-sec{display:flex;align-items:baseline;justify-content:space-between;margin:14px 2px 8px}
  .hn-sec h2{margin:0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4b5563}
  .hn-sec span{font-size:12px;color:#9ca3af}
  .hn-sec.gold h2{color:#8A5A00;display:flex;align-items:center;gap:5px}
  .hn-sec.gold h2 svg{color:#E8B130;fill:#E8B130;width:13px;height:13px}
  .hn-tile{display:block;text-align:left;min-width:0;width:100%;background:none;border:0;padding:0}
  .hn-ph{position:relative;aspect-ratio:1;border-radius:16px;overflow:hidden;background:#fff;transition:transform .12s}
  .hn-ph img{width:100%;height:100%;display:block;object-fit:contain;background:#fff}
  .hn-tile:active .hn-ph{transform:scale(.97)}
  .hn-tile.want .hn-ph::after{content:"";position:absolute;inset:0;border-radius:16px;border:1.5px dashed #bfc4dc;pointer-events:none}
  .hn-tile.owned .hn-ph{box-shadow:0 1px 3px rgba(17,24,39,.10)}
  .hn-tile.grail .hn-ph{outline:2.5px solid #E8B130;outline-offset:2.5px}
  .hn-tile.grail .hn-ph::after{display:none}
  .hn-tile.missing .hn-ph{background:#eef0f6}
  .hn-tile.missing .hn-ph img{filter:grayscale(1);opacity:.35}
  .hn-tile.missing .hn-nm{color:#9ca3af;font-weight:500}
  .hn-tile.selected .hn-ph{outline:3px solid #4f46e5;outline-offset:2px}
  .hn-nm{font-size:12px;font-weight:600;color:#111827;margin-top:6px;padding:0 2px;line-height:1.3;height:2.6em;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow-wrap:anywhere}
  .hn-chip{position:absolute;top:6px;left:6px;font-size:10px;font-weight:700;border-radius:999px;padding:3px 7px;line-height:1.1;display:flex;align-items:center;gap:3px}
  .hn-chip.gold{background:#E8B130;color:#fff;padding:4px}
  .hn-chip.gold svg{fill:#fff;color:#fff;width:11px;height:11px}
  .hn-chip.amber{background:#FEF3C7;color:#B45309}
  .hn-chip.gray{background:rgba(255,255,255,.92);color:#4b5563;font-weight:600}
  .hn-badge{position:absolute;right:6px;bottom:6px;width:22px;height:22px;border-radius:999px;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.15)}
  .hn-badge svg{width:13px;height:13px}
  .hn-badge.win{background:#10B981;color:#fff}
  .hn-badge.want{background:#fff;color:#4f46e5}
  .hn-badge.want svg{fill:#4f46e5}
  .hn-badge.add{background:#fff;color:#4b5563}
  .hn-badge.sel{background:#4f46e5;color:#fff}
  .hn-pop .hn-ph{animation:hn-bounce .6s cubic-bezier(.2,.9,.3,1.2)}
  @keyframes hn-bounce{0%{transform:scale(1)}45%{transform:scale(1.1)}100%{transform:scale(1)}}
  .hn-bump{display:inline-block;animation:hn-bumpk .5s cubic-bezier(.2,.9,.3,1.2)}
  @keyframes hn-bumpk{0%{transform:scale(1)}40%{transform:scale(1.55)}100%{transform:scale(1)}}

  .hn-scrim{position:fixed;inset:0;background:rgba(17,24,39,.42);z-index:70;opacity:0;transition:opacity .2s}
  .hn-scrim.show{opacity:1}
  .hn-sheet{position:fixed;left:0;right:0;bottom:0;z-index:71;background:#fff;border-radius:24px 24px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);max-height:88vh;overflow-y:auto;max-width:42rem;margin:0 auto}
  .hn-sheet.show{transform:none}
  .hn-grab{width:38px;height:4px;border-radius:9px;background:#dfe2ea;margin:0 auto 14px}
  .hn-sh-top{display:flex;gap:14px;align-items:flex-start}
  .hn-sh-top .hn-ph{width:112px;flex:none}
  .hn-sh-name{font-size:18px;font-weight:700;line-height:1.25;color:#111827}
  .hn-sh-sub{font-size:13px;color:#9ca3af;margin-top:3px}
  .hn-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .hn-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px}
  .hn-tag svg{width:11px;height:11px}
  .hn-tag.win{background:#D1FAE5;color:#047857}
  .hn-tag.gold{background:#FDF3D7;color:#8A5A00}
  .hn-tag.gold svg{fill:#E8B130;color:#E8B130}
  .hn-tag.amber{background:#FEF3C7;color:#B45309}
  .hn-meta{font-size:13px;color:#4b5563;margin-top:12px;display:flex;flex-direction:column;gap:6px}
  .hn-meta div{display:flex;align-items:center;gap:6px}
  .hn-meta svg{color:#9ca3af;width:15px;height:15px;flex:none}
  .hn-desc{font-size:13px;color:#6b7280;margin-top:10px;line-height:1.45}
  .hn-link{color:#4f46e5;font-size:13px;font-weight:600;text-decoration:none}
  .hn-acts{display:flex;flex-direction:column;gap:8px;margin-top:18px}
  .hn-btn{height:48px;border-radius:14px;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;width:100%}
  .hn-btn svg{width:18px;height:18px}
  .hn-btn:disabled{opacity:.5}
  .hn-btn.primary{background:#4f46e5;color:#fff}
  .hn-btn.soft{background:#f3f4f9;color:#111827}
  .hn-btn.gold{background:#E8B130;color:#fff}
  .hn-btn.plain{height:40px;background:none;color:#4b5563;font-weight:600;font-size:14px}
  .hn-btn.danger{height:40px;background:none;color:#dc2626;font-weight:600;font-size:14px}
  .hn-err{font-size:12.5px;color:#B45309;background:#FEF3C7;border-radius:10px;padding:8px 10px}
  .hn-confirm{display:flex;gap:8px}
  .hn-confirm .hn-btn{height:44px;font-size:14px}
  .hn-confirm .red{background:#fee2e2;color:#dc2626}

  .hn-cel{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(17,24,39,.55);opacity:0;transition:opacity .22s}
  .hn-cel.show{opacity:1}
  .hn-card{position:relative;width:100%;max-width:380px;background:#fff;border-radius:28px;padding:22px 20px 14px;text-align:center;overflow:hidden;transform:translateY(16px) scale(.96);transition:transform .45s cubic-bezier(.2,.9,.3,1.2)}
  .hn-cel.show .hn-card{transform:none}
  .hn-card.s3{background:linear-gradient(180deg,#FFF6DE 0%,#fff 55%);box-shadow:0 0 0 2px #E8B130 inset}
  .hn-eyebrow{font-size:12.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#4f46e5}
  .hn-card.s3 .hn-eyebrow{color:#8A5A00}
  .hn-cph{width:208px;max-width:70%;aspect-ratio:1;margin:14px auto 0;border-radius:26px;overflow:hidden;box-shadow:0 12px 30px -12px rgba(79,70,229,.45);transform:scale(.6) rotate(-7deg);opacity:0}
  .hn-cel.show .hn-cph{animation:hn-popin .6s cubic-bezier(.2,.9,.3,1.2) .08s forwards}
  .hn-card.s3 .hn-cph{box-shadow:0 0 0 4px #E8B130,0 14px 34px -10px rgba(232,177,48,.6)}
  @keyframes hn-popin{to{transform:none;opacity:1}}
  .hn-cph img{width:100%;height:100%;object-fit:contain;background:#fff;display:block}
  .hn-cname{font-size:19px;font-weight:800;margin-top:16px;color:#111827}
  .hn-csub{font-size:13.5px;color:#4b5563;margin-top:4px}
  .hn-coll{text-align:left;background:#f3f4f9;border-radius:16px;padding:12px;margin-top:16px}
  .hn-card.s3 .hn-coll{background:rgba(253,243,215,.7)}
  .hn-coll-r{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin-bottom:7px}
  .hn-coll-r b{font-weight:700;color:#111827;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hn-coll-r span{color:#4b5563;font-weight:600;flex:none;font-variant-numeric:tabular-nums}
  .hn-bar{height:8px;border-radius:99px;background:#e5e7ef;overflow:hidden}
  .hn-bar i{display:block;height:100%;border-radius:99px;background:#4f46e5;transition:width .9s cubic-bezier(.2,.9,.3,1.2)}
  .hn-bar.gold i{background:linear-gradient(90deg,#E8B130,#F6D365)}
  .hn-last{font-size:12.5px;font-weight:700;color:#B45309;margin-top:8px;opacity:0;transition:opacity .3s .9s}
  .hn-last.on{opacity:1}
  .hn-cacts{display:flex;flex-direction:column;gap:4px;margin-top:16px}
  .hn-undo{font-size:12px;color:#9ca3af;margin-top:4px;height:28px;background:none;border:0}
  .hn-timer{position:absolute;left:0;bottom:0;height:3px;width:100%;background:#4f46e5;opacity:.35;transform-origin:left}
  .hn-card.s3 .hn-timer{background:#E8B130}
  .hn-thumbs{display:flex;justify-content:center;gap:10px;margin-top:14px}
  .hn-thumbs .hn-ph{width:76px;border-radius:16px}
  .hn-slist{text-align:left;margin-top:14px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#4b5563}
  .hn-slist b{color:#111827}
  .hn-conf{position:fixed;inset:0;width:100%;height:100%;z-index:90;pointer-events:none}
  .hn-ghost{position:fixed;z-index:85;border-radius:16px;overflow:hidden;pointer-events:none}
  .hn-ghost img{width:100%;height:100%;object-fit:contain;background:#fff}

  .hn-segs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:18px}
  .hn-segs i{height:3px;border-radius:9px;background:#e5e7ef}
  .hn-segs i.on{background:#4f46e5}
  .hn-ill{height:160px;display:flex;align-items:center;justify-content:center}
  .hn-ill .row{display:flex;gap:12px;align-items:flex-end}
  .hn-ill .mini{width:70px}
  .hn-ill .mini .hn-ph{border-radius:14px}
  .hn-ill .hero{animation:hn-lift 2.4s ease-in-out infinite}
  @keyframes hn-lift{0%,20%{transform:none}45%,70%{transform:translateY(-16px) scale(1.12)}100%{transform:none}}
  .hn-ill .hero .hn-badge{animation:hn-check 2.4s ease-in-out infinite}
  @keyframes hn-check{0%,40%{opacity:0;transform:scale(.4)}55%,80%{opacity:1;transform:scale(1)}100%{opacity:0}}
  .hn-ill .big{width:104px}
  .hn-ill .big .hn-ph{outline:3px solid #E8B130;outline-offset:3px;animation:hn-glow 2s ease-in-out infinite}
  @keyframes hn-glow{50%{box-shadow:0 0 24px rgba(232,177,48,.55)}}
  .hn-ill .shelf{display:grid;grid-template-columns:repeat(3,46px);gap:7px}
  .hn-ill .shelf .hn-ph{border-radius:10px}
  .hn-ill .shelf .off img{filter:grayscale(1);opacity:.35}
  .hn-ill .col{display:flex;flex-direction:column;gap:12px;align-items:center}
  .hn-ill .col .hn-bar{width:158px}
  .hn-ill .col .hn-bar i{animation:hn-fill 2.6s ease-out infinite}
  @keyframes hn-fill{0%{width:0}60%,100%{width:66%}}
  .hn-intro h3{font-size:21px;font-weight:800;margin:14px 0 6px;color:#111827}
  .hn-intro p{font-size:14px;line-height:1.5;color:#4b5563;margin:0 auto;max-width:30ch}
  .hn-foot{display:flex;gap:8px;margin-top:20px}
  .hn-foot .hn-btn{flex:1 1 0;width:auto;min-width:0}
  .hn-foot .hn-btn.plain{flex:0 0 auto;padding:0 14px;height:48px}

  .hn-chip.ask{background:#4f46e5;color:#fff;padding:3px 8px}
  .hn-match{margin-top:14px;border-radius:16px;background:#EEF2FF;padding:12px}
  .hn-match h3{margin:0 0 8px;font-size:13px;font-weight:700;color:#3730a3}
  .hn-match .hn-was{font-size:12px;color:#6b7280;margin:-4px 0 8px}
  .hn-mcard{display:flex;gap:10px;align-items:center;background:#fff;border-radius:12px;padding:8px}
  .hn-mcard+.hn-mcard{margin-top:8px}
  .hn-mph{width:60px;height:60px;border-radius:10px;overflow:hidden;flex:none;background:#f3f4f6}
  .hn-mph img{width:100%;height:100%;object-fit:contain;background:#fff;display:block}
  .hn-mtx{flex:1;min-width:0}
  .hn-mname{font-size:14px;font-weight:700;color:#111827;line-height:1.25}
  .hn-msub{font-size:12px;color:#6b7280;margin-top:2px}
  .hn-mwarn{font-size:12px;color:#B45309;margin-top:2px;font-weight:600}
  .hn-myes{height:36px;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;font-size:13px;padding:0 10px;border:0;flex:none}
  .hn-myes:disabled,.hn-mno:disabled{opacity:.5}
  .hn-mno{background:none;border:0;color:#4b5563;font-size:13px;font-weight:600;margin-top:6px;padding:6px 0}
  .hn-mhint{margin-top:8px}
  .hn-mhint input{width:100%;height:40px;border:1px solid #d1d5db;border-radius:10px;padding:0 10px;font-size:14px;background:#fff}
  .hn-mhint .hn-btn{height:40px;font-size:14px;margin-top:6px}
  .hn-banner{display:flex;align-items:center;gap:10px;background:#EEF2FF;color:#3730a3;border-radius:14px;padding:10px 12px;margin:8px 0 0;font-size:13.5px;font-weight:600;border:0;width:100%;text-align:left}
  .hn-banner svg{width:18px;height:18px;flex:none}
  .hn-batch-item{padding-bottom:12px;border-bottom:1px solid #eef0f4;margin-bottom:12px}
  .hn-batch-item:last-child{border-bottom:0;margin-bottom:0}

  /* «Путь охоты» (§3.2 плана, Волна 2): этап заказа на плитке и в листе. */
  .hn-chip.hunt{background:rgba(255,255,255,.94);color:#4f46e5;gap:2px;padding:4px 6px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .hn-chip.hunt i{width:6px;height:6px;border-radius:999px;background:#e5e7eb;display:block}
  .hn-chip.hunt i.on{background:#4f46e5}
  .hn-tile.transit .hn-ph img{opacity:.6}
  .hn-badge.truck{background:#fff;color:#4f46e5}
  .hn-land .hn-ph img{animation:hn-land 1.1s ease-out both}
  @keyframes hn-land{from{opacity:.6;transform:scale(.94)}60%{transform:scale(1.03)}to{opacity:1;transform:scale(1)}}
  .hn-path{margin-top:14px;border-radius:16px;background:#F5F6FB;padding:12px}
  .hn-path h3{margin:0 0 10px;font-size:13px;font-weight:700;color:#111827}
  .hn-steps{display:flex;align-items:flex-start}
  .hn-step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative;font-size:10.5px;color:#9ca3af;text-align:center;line-height:1.2}
  .hn-step b{width:12px;height:12px;border-radius:999px;background:#e5e7eb;display:block;margin-bottom:5px;position:relative;z-index:1}
  .hn-step+.hn-step::before{content:"";position:absolute;top:5px;right:50%;width:100%;height:2px;background:#e5e7eb}
  .hn-step.on{color:#4338ca;font-weight:600}
  .hn-step.on b,.hn-step.on::before{background:#4f46e5}
  .hn-step.cur b{box-shadow:0 0 0 4px #E0E7FF}
  .hn-path-now{margin-top:10px;font-size:13px;color:#374151;display:flex;align-items:center;justify-content:space-between;gap:8px}
  .hn-path-now a{color:#4f46e5;font-weight:600;white-space:nowrap}
  .hn-path-track{margin-top:6px;font-size:12.5px;color:#6b7280;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .hn-path-track b{color:#111827;font-weight:600;user-select:all;word-break:break-all}
  .hn-path-track button{color:#4f46e5;font-weight:600;font-size:12px;padding:2px 6px;border-radius:6px;background:#eef2ff}

  @media (prefers-reduced-motion: reduce){
    .hn-cel *,.hn-sheet,.hn-cel,.hn-scrim,.hn-pop .hn-ph,.hn-bump,.hn-ill *,.hn-land .hn-ph img{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
  }`;

  function injectStyles() {
    if (document.getElementById('hn-styles')) return;
    const style = document.createElement('style');
    style.id = 'hn-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  injectStyles();

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_e) { return false; }
  }

  function icons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function esc(value) {
    return escapeHtmlClient(value == null ? '' : String(value));
  }

  function plural(n, one, few, many) {
    const m = n % 10, h = n % 100;
    if (m === 1 && h !== 11) return one;
    if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return few;
    return many;
  }

  function days(n) {
    return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  }

  /** Вибрация Telegram (WebApp ≥ 6.1); вне Telegram — тихо ничего. */
  function haptic(kind) {
    try {
      const wa = window.Telegram && window.Telegram.WebApp;
      if (!wa || !wa.HapticFeedback || (wa.isVersionAtLeast && !wa.isVersionAtLeast('6.1'))) return;
      const h = wa.HapticFeedback;
      if (kind === 'selection') h.selectionChanged();
      else if (kind === 'light') h.impactOccurred('light');
      else if (kind === 'heavy') { h.notificationOccurred('success'); h.impactOccurred('heavy'); }
      else h.notificationOccurred('success');
    } catch (_e) { /* вибрация — украшение */ }
  }

  // --- Силуэт вместо фото (§1.4 плана) — стабильный по названию ---
  const silhouetteCache = new Map();
  function hashHue(s) {
    let h = 0;
    for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }
  // Хэш и рисунок ЗЕРКАЛИТ сервер: server/assets/silhouettes/h-<оттенок>.jpg
  // отрисованы из silhouetteSvg() этого файла (server/tools/generate-
  // silhouettes.js), а wishlistShareService.hashHue — копия hashHue ниже
  // (сверяется тестом). Меняете рисунок/хэш — перегенерируйте картинки.
  function silhouetteSvg(h) {
    const style = ['long', 'bob', 'pig', 'bun', 'long', 'bob'][h % 6];
    const hair = `hsl(${h} 38% 58%)`, body = `hsl(${h} 34% 64%)`, face = `hsl(${h} 45% 82%)`;
    const back = {
      long: `<path d="M22 50 C18 16 82 16 78 50 C80 70 84 84 86 100 L14 100 C16 84 20 70 22 50 Z" fill="${hair}"/>`,
      bob: `<path d="M24 48 C20 16 80 16 76 48 C78 58 79 66 80 73 L20 73 C21 66 22 58 24 48 Z" fill="${hair}"/>`,
      pig: `<ellipse cx="18" cy="58" rx="9" ry="17" fill="${hair}"/><ellipse cx="82" cy="58" rx="9" ry="17" fill="${hair}"/><path d="M27 46 C25 17 75 17 73 46 Z" fill="${hair}"/>`,
      bun: `<circle cx="50" cy="16" r="11" fill="${hair}"/><path d="M27 46 C25 17 75 17 73 46 Z" fill="${hair}"/>`
    }[style];
    const star = (x, y, r, o) => `<path d="M${x} ${y - r} L${x + r * .28} ${y - r * .28} L${x + r} ${y} L${x + r * .28} ${y + r * .28} L${x} ${y + r} L${x - r * .28} ${y + r * .28} L${x - r} ${y} L${x - r * .28} ${y - r * .28} Z" fill="#fff" opacity="${o}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 93%)"/><stop offset="1" stop-color="hsl(${(h + 30) % 360} 62% 84%)"/></linearGradient><radialGradient id="f" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>${back}<path d="M18 100 C20 83 35 77 50 77 C65 77 80 83 82 100 Z" fill="${body}"/><rect x="44" y="62" width="12" height="17" rx="4" fill="${face}"/><ellipse cx="50" cy="47" rx="21" ry="23" fill="${face}"/><ellipse cx="50" cy="47" rx="21" ry="23" fill="url(#f)"/><path d="M28 46 C27 22 73 20 72 44 C66 34 56 30 48 33 C40 36 33 41 28 46 Z" fill="${hair}"/>${star(80, 18, 6, .9)}${star(88, 31, 3.2, .75)}${star(17, 80, 3.6, .6)}</svg>`;
    return svg;
  }
  function silhouette(name) {
    const key = String(name || '');
    if (silhouetteCache.has(key)) return silhouetteCache.get(key);
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(silhouetteSvg(hashHue(key)));
    silhouetteCache.set(key, uri);
    return uri;
  }

  /** <img> куклы: фото, а без фото или при битой ссылке — силуэт (см. wireImages). */
  function imgHtml(imageUrl, title) {
    const src = imageUrl ? imageUrl : silhouette(title);
    return `<img src="${esc(src)}" alt="" data-hn-name="${esc(title)}" loading="lazy">`;
  }

  function wireImages(root) {
    (root || document).querySelectorAll('img[data-hn-name]').forEach((img) => {
      if (img.dataset.hnWired) return;
      img.dataset.hnWired = '1';
      img.addEventListener('error', () => {
        const fallback = silhouette(img.dataset.hnName);
        if (img.src !== fallback) img.src = fallback;
      });
    });
  }

  /**
   * Плитка куклы. state: 'want' | 'owned' | 'missing'. chip — HTML чипа в
   * углу фото (не больше одного, §1.3 плана), badge — HTML значка внизу справа.
   */
  function tileHtml(opts) {
    const cls = ['hn-tile', opts.state];
    if (opts.isGrail && opts.state !== 'missing') cls.push('grail');
    if (opts.selected) cls.push('selected');
    if (opts.extraClass) cls.push(opts.extraClass);
    if (opts.pop) cls.push('hn-pop');
    return `<button type="button" class="${cls.join(' ')}" ${opts.attrs || ''}>
      <div class="hn-ph">${imgHtml(opts.imageUrl, opts.title)}${opts.chip || ''}${opts.badge || ''}</div>
      <div class="hn-nm">${esc(opts.title)}</div>
    </button>`;
  }

  // --- Нижний лист ---
  function sheet(html, onMount) {
    closeSheet(true);
    const scrim = document.createElement('div');
    scrim.className = 'hn-scrim';
    const el = document.createElement('div');
    el.className = 'hn-sheet';
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="hn-grab"></div>' + html;
    document.body.append(scrim, el);
    icons();
    wireImages(el);
    requestAnimationFrame(() => { scrim.classList.add('show'); el.classList.add('show'); });
    scrim.addEventListener('click', () => closeSheet());
    if (onMount) onMount(el);
    return el;
  }
  function closeSheet(instant) {
    document.querySelectorAll('.hn-sheet,.hn-scrim').forEach((el) => {
      if (instant) { el.remove(); return; }
      el.classList.remove('show');
      setTimeout(() => el.remove(), 280);
    });
  }

  // --- Конфетти (ленивая загрузка при первом празднике) ---
  let confettiPromise = null;
  let confettiFire = null;
  function loadConfetti() {
    if (confettiPromise) return confettiPromise;
    confettiPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = CONFETTI_SRC;
      s.onload = () => resolve(window.confetti || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return confettiPromise;
  }
  async function burst(gold) {
    if (reducedMotion()) return;
    const lib = await loadConfetti();
    if (!lib) return;
    if (!confettiFire) {
      const canvas = document.createElement('canvas');
      canvas.className = 'hn-conf';
      document.body.appendChild(canvas);
      confettiFire = lib.create(canvas, { resize: true, useWorker: false });
    }
    if (gold) {
      const colors = ['#E8B130', '#F6D365', '#FFF4CC', '#ffffff', '#C98A12'];
      confettiFire({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0, y: 0.55 }, colors });
      confettiFire({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1, y: 0.55 }, colors });
    } else {
      confettiFire({ particleCount: 110, spread: 78, startVelocity: 38, origin: { x: 0.5, y: 0.32 }, colors: ['#6366f1', '#f472b6', '#34d399', '#ffffff', '#a5b4fc'] });
    }
  }

  /**
   * Показывает карточку праздника. Resolve: 'shelf' | 'undo' | 'auto' |
   * 'close' | 'extra' (кнопка opts.extraAction). Любое касание карточки
   * останавливает авто-закрытие.
   */
  function showCard(opts) {
    return new Promise((resolve) => {
      const gold = opts.gold;
      const el = document.createElement('div');
      el.className = 'hn-cel';
      el.setAttribute('role', 'dialog');
      el.innerHTML = `<div class="hn-card${gold ? ' s3' : ''}">${opts.inner}<div class="hn-timer"></div></div>`;
      document.body.appendChild(el);
      icons();
      wireImages(el);
      requestAnimationFrame(() => el.classList.add('show'));
      haptic(gold ? 'heavy' : 'success');
      setTimeout(() => burst(gold), 220);

      const card = el.querySelector('.hn-card');
      const timer = el.querySelector('.hn-timer');
      const duration = gold ? S3_MS : S2_MS;
      let autoTimer = null;
      let done = false;
      function finish(kind) {
        if (done) return;
        done = true;
        clearTimeout(autoTimer);
        el.classList.remove('show');
        setTimeout(() => el.remove(), 220);
        resolve(kind);
      }
      if (opts.autoClose === false || reducedMotion()) {
        timer.remove();
      } else {
        setTimeout(() => {
          if (done) return;
          if (timer.animate) timer.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: 'linear', fill: 'forwards' });
          autoTimer = setTimeout(() => finish('auto'), duration);
        }, 650);
      }
      card.addEventListener('pointerdown', () => { clearTimeout(autoTimer); timer.style.display = 'none'; }, { once: true });
      if (opts.onMount) opts.onMount(el);
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hn-act]');
        if (btn) {
          const act = btn.dataset.hnAct;
          if (act === 'share' && opts.onShare) { opts.onShare(btn); return; }
          finish(act);
          return;
        }
        if (e.target === el) finish('close');
      });
    });
  }

  /** Главная коллекция для шкалы: закрытая, иначе самая заполненная. */
  function primaryCollection(list) {
    if (!list || list.length === 0) return null;
    const completed = list.find((c) => c.completed);
    if (completed) return completed;
    return list.slice().sort((a, b) => (b.after / b.total) - (a.after / a.total))[0];
  }

  /**
   * Праздник «Добыто!» по данным сервера (huntService.buildCelebrations).
   * S3 — Грааль или закрытая коллекция, иначе S2.
   */
  function celebrate(c, opts) {
    const coll = primaryCollection(c.collections);
    const completed = Boolean(coll && coll.completed);
    const gold = c.isGrail || completed;
    const eyebrow = c.isGrail ? 'Грааль найден!' : completed ? 'Коллекция собрана!' : 'Добыто!';
    let sub;
    if (c.huntDays === null || c.huntDays === undefined) sub = 'Теперь на вашей полке';
    else if (c.huntDays === 0) sub = 'Добыта в тот же день';
    else sub = `Охота длилась <b>${days(c.huntDays)}</b>`;
    const extra = c.isGrail && completed ? '<div class="hn-csub" style="color:#8A5A00;font-weight:700;margin-top:6px">…и коллекция собрана целиком</div>' : '';
    const collHtml = coll ? `<div class="hn-coll"><div class="hn-coll-r"><b>${esc(coll.name)}</b><span data-hn-cnt>${coll.before} из ${coll.total}</span></div><div class="hn-bar${gold ? ' gold' : ''}"><i data-hn-bar style="width:${coll.before / coll.total * 100}%"></i></div>${coll.total - coll.after === 1 ? '<div class="hn-last" data-hn-last>Осталась всего одна!</div>' : ''}</div>` : '';
    const actions = gold
      ? '<button type="button" class="hn-btn gold" data-hn-act="share"><i data-lucide="send"></i>Поделиться</button><button type="button" class="hn-btn plain" data-hn-act="shelf">На полку</button>'
      : '<button type="button" class="hn-btn primary" data-hn-act="shelf">На полку</button><button type="button" class="hn-btn plain" data-hn-act="share">Поделиться</button>';
    const undo = opts && opts.allowUndo ? '<button type="button" class="hn-undo" data-hn-act="undo">Отменить</button>' : '';
    const inner = `<div class="hn-eyebrow">${eyebrow}</div><div class="hn-cph">${imgHtml(c.imageUrl, c.title)}</div><div class="hn-cname">${esc(c.title)}</div><div class="hn-csub">${sub}</div>${extra}${collHtml}<div class="hn-cacts">${actions}</div>${undo}`;
    return showCard({
      gold,
      inner,
      onShare: (btn) => share([c.wishlistId], btn),
      onMount: (el) => {
        if (!coll) return;
        setTimeout(() => {
          const bar = el.querySelector('[data-hn-bar]');
          if (bar) bar.style.width = (coll.after / coll.total * 100) + '%';
          const cnt = el.querySelector('[data-hn-cnt]');
          if (cnt) cnt.textContent = `${coll.after} из ${coll.total}`;
          const last = el.querySelector('[data-hn-last]');
          if (last) last.classList.add('on');
        }, reducedMotion() ? 0 : 700);
      }
    });
  }

  /** Сводка, когда праздников несколько — одна карточка вместо очереди (§1.2 плана). */
  function summary(list) {
    const gold = list.some((c) => c.isGrail || (c.collections || []).some((k) => k.completed));
    const viaUs = list.every((c) => c.viaUs);
    const shown = list.slice(0, 3);
    const rest = list.length - shown.length;
    const thumbs = shown.map((c) => `<div class="hn-ph">${imgHtml(c.imageUrl, c.title)}</div>`).join('') +
      (rest > 0 ? `<div class="hn-ph" style="display:grid;place-items:center;background:#eef0f6;font-weight:800;color:#4b5563">+${rest}</div>` : '');
    const lines = list.slice(0, 5).map((c) => `<div><b>${esc(c.title)}</b>${c.huntDays ? ` — охота длилась ${days(c.huntDays)}` : ''}</div>`).join('');
    const completedNames = [];
    list.forEach((c) => (c.collections || []).forEach((k) => { if (k.completed && !completedNames.includes(k.name)) completedNames.push(k.name); }));
    const completedHtml = completedNames.map((n) => `<div style="color:#8A5A00;font-weight:700">Коллекция «${esc(n)}» собрана!</div>`).join('');
    const inner = `<div class="hn-eyebrow">${viaUs ? 'Пока вас не было' : 'Новые куклы'}</div><div class="hn-cname" style="margin-top:8px">+${list.length} ${plural(list.length, 'кукла', 'куклы', 'кукол')} на полке</div><div class="hn-thumbs">${thumbs}</div><div class="hn-slist">${lines}${completedHtml}</div><div class="hn-cacts"><button type="button" class="hn-btn primary" data-hn-act="shelf">Посмотреть полку</button></div>`;
    return showCard({ gold, inner, autoClose: false });
  }

  async function share(wishlistIds, btn) {
    if (btn) btn.disabled = true;
    try {
      await callServer('shareWishlistCollage', wishlistIds);
      showSaveToast(true, 'Картинка придёт вам в чат с ботом через несколько секунд');
    } catch (error) {
      showSaveToast(false, error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function markSeen(ids) {
    callServer('markCelebrationsSeen', ids).catch(() => { /* покажем ещё раз — не страшно */ });
  }

  // --- «Путь охоты» (IMPLEMENTATION-PLAN-GAMIFICATION.md §3.2, Волна 2) ---
  // Этапы сервера: wanted → ordered → secured → shipping → arrived (huntPath.js).
  const HUNT_STEPS = ['Хочу', 'Заказана', 'Выкуплена', 'Едет', 'Получена'];
  const HUNT_CAPTIONS = {
    ordered: 'Заказана · ищем и выкупаем',
    secured: 'Выкуплена · скоро отправят',
    shipping: 'Едет к вам',
    arrived: 'Получена'
  };

  /** Кукла ещё едет: этап заказа до «Получена». */
  function inTransit(hunt) {
    return Boolean(hunt && hunt.stage !== 'arrived');
  }

  /** Чип этапа на плитке Витрины: точки пройденных этапов (из 4 после «Хочу»). */
  function huntChip(hunt) {
    if (!inTransit(hunt)) return '';
    const dots = [1, 2, 3, 4].map((i) => `<i class="${i <= hunt.stageIndex ? 'on' : ''}"></i>`).join('');
    return `<span class="hn-chip hunt" title="${esc(HUNT_CAPTIONS[hunt.stage] || '')}">${dots}</span>`;
  }

  /** Степпер для нижнего листа + подпись и ссылка на заказ. */
  function huntPathHtml(hunt) {
    if (!hunt) return '';
    const steps = HUNT_STEPS.map((label, i) =>
      `<div class="hn-step${i <= hunt.stageIndex ? ' on' : ''}${i === hunt.stageIndex ? ' cur' : ''}"><b></b>${esc(label)}</div>`).join('');
    const caption = HUNT_CAPTIONS[hunt.stage] || '';
    const now = hunt.stage !== 'arrived' && hunt.stepLabel ? `Сейчас: ${esc(hunt.stepLabel)}` : esc(caption);
    return `<div class="hn-path">
      <h3>${esc(caption)}</h3>
      <div class="hn-steps">${steps}</div>
      <div class="hn-path-now"><span>${now}</span><a href="#/order-details/${encodeURIComponent(hunt.orderId)}" data-act="order">Заказ →</a></div>
      ${hunt.trackNumber && hunt.stage !== 'arrived' ? `<div class="hn-path-track">Трек: <b>${esc(hunt.trackNumber)}</b> <button type="button" data-act="copy-track" data-track="${esc(hunt.trackNumber)}">Скопировать</button></div>` : ''}
    </div>`;
  }

  /**
   * «На полку» (S1+, §1.2): плитки полученных кукол «приземляются» —
   * из полупрозрачных становятся полноцветными, вибрация успеха и ОДИН тост
   * (несколько кукол разом — одним сообщением, два праздника подряд не бывает).
   * @param {Array<{wishlistId, name}>} arrivals
   * @param {(id:string) => Element|null} tileFor плитка на Полке
   */
  function arrive(arrivals, tileFor) {
    if (!arrivals || arrivals.length === 0) return;
    callServer('markArrivedSeen', arrivals.map((a) => a.wishlistId)).catch(() => { /* покажем ещё раз — не страшно */ });
    arrivals.forEach((a) => {
      const tile = tileFor(a.wishlistId);
      if (tile) tile.classList.add('hn-land');
    });
    haptic('success');
    const first = arrivals[0];
    // Дни охоты (§3.5, г) — сервер отдаёт их только для настоящей охоты от недели.
    const text = arrivals.length === 1
      ? `${first.name} теперь на полке${first.huntDays ? ` — охота заняла ${days(first.huntDays)}` : ''}`
      : `На полку: ${arrivals.length} ${plural(arrivals.length, 'кукла', 'куклы', 'кукол')}`;
    showSaveToast(true, text);
  }

  /** Полёт миниатюры от плитки к табу «Чеклист» (§2.3 плана). */
  function fly(fromEl, toEl) {
    return new Promise((resolve) => {
      if (reducedMotion() || !fromEl || !toEl || !fromEl.animate) { resolve(); return; }
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      if (a.width === 0 || b.width === 0) { resolve(); return; }
      const ghost = document.createElement('div');
      ghost.className = 'hn-ghost';
      const img = fromEl.querySelector('img');
      ghost.innerHTML = img ? `<img src="${esc(img.src)}" alt="">` : '';
      Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
      document.body.appendChild(ghost);
      fromEl.style.visibility = 'hidden';
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      const anim = ghost.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(.6)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(.16)`, opacity: 0.25 }
      ], { duration: 700, easing: 'cubic-bezier(.45,0,.3,1)' });
      anim.onfinish = () => { ghost.remove(); resolve(); };
    });
  }

  /**
   * «У меня!» — перевод позиции в Чеклист с праздником. Возвращает
   * 'celebrated' | 'undone' | 'plain' (праздника нет — кукла уже была
   * добыта) | 'failed'.
   */
  async function acquire(wishlistId) {
    let result;
    try {
      result = await callServer('updateWishlistItemStatus', wishlistId, 'Есть');
    } catch (error) {
      showSaveToast(false, `Не удалось отметить: ${error.message}`);
      return 'failed';
    }
    if (!result || !result.celebration) return 'plain';
    markSeen([wishlistId]);
    const outcome = await celebrate(result.celebration, { allowUndo: true });
    if (outcome !== 'undo') return 'celebrated';
    try {
      await callServer('updateWishlistItemStatus', wishlistId, 'Хочу');
      showSaveToast(true, 'Отменено — кукла снова в вишлисте');
    } catch (error) {
      showSaveToast(false, `Не удалось отменить: ${error.message}`);
    }
    return 'undone';
  }

  // --- Анонс «Открыт сезон охоты» (§2.3а плана) ---
  function intro(opts) {
    const shelfEmpty = Boolean(opts && opts.shelfEmpty);
    const mini = (name, cls, extra) => `<div class="mini ${cls || ''}"><div class="hn-ph">${imgHtml('', name)}${extra || ''}</div></div>`;
    const slides = [
      {
        h: 'Открыт сезон охоты!',
        p: 'Каждая кукла из вишлиста — ваша цель. Мы поможем её найти, а когда она окажется у вас — отпразднуем.',
        ill: `<div class="row">${mini('Руби')}${mini('Клео', 'hero', '<span class="hn-badge win" style="opacity:0"><i data-lucide="check"></i></span>')}${mini('Спектра')}</div>`
      },
      {
        h: 'Ваши Граали',
        p: 'Отметьте до пяти кукол мечты — они всегда будут первыми на витрине.',
        ill: `<div class="row" style="align-items:center">${mini('Рэйвен')}<div class="big"><div class="hn-ph">${imgHtml('', 'Пеннивайз')}<span class="hn-chip gold"><i data-lucide="star"></i></span></div></div>${mini('Рошель')}</div>`
      },
      {
        h: 'Соберите полку',
        p: 'Отметьте кукол, которые у вас уже есть, — и увидите, сколько осталось до целой коллекции.',
        ill: `<div class="col"><div class="shelf">${['Дракулаура', 'Фрэнки', 'Клодин', 'Лагуна', 'Клео', 'Дьюс'].map((n, i) => `<div class="hn-ph ${i > 3 ? 'off' : ''}">${imgHtml('', n)}</div>`).join('')}</div><div class="hn-bar"><i></i></div></div>`
      }
    ];
    if (shelfEmpty) slides.unshift(slides.pop());

    return new Promise((resolve) => {
      let i = 0;
      const el = document.createElement('div');
      el.className = 'hn-cel hn-intro';
      el.setAttribute('role', 'dialog');
      document.body.appendChild(el);
      function draw() {
        const s = slides[i];
        const last = i === slides.length - 1;
        el.innerHTML = `<div class="hn-card"><div class="hn-segs">${slides.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div><div class="hn-ill">${s.ill}</div><h3>${s.h}</h3><p>${s.p}</p><div class="hn-foot">${last ? '<button type="button" class="hn-btn primary" data-hn-next>Начать охоту</button>' : '<button type="button" class="hn-btn plain" data-hn-skip>Пропустить</button><button type="button" class="hn-btn primary" data-hn-next>Дальше</button>'}</div></div>`;
        icons();
      }
      function close(started) {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 220);
        callServer('markHuntIntroSeen').catch(() => {});
        resolve(started ? 'start' : 'skip');
      }
      draw();
      requestAnimationFrame(() => el.classList.add('show'));
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-hn-skip]')) { close(false); return; }
        if (e.target.closest('[data-hn-next]')) {
          if (i < slides.length - 1) { haptic('selection'); i++; draw(); }
          else { haptic('light'); close(true); }
        }
      });
    });
  }

  window.Hunt = {
    haptic,
    silhouette,
    silhouetteSvg,
    hashHue,
    imgHtml,
    wireImages,
    tileHtml,
    sheet,
    closeSheet,
    celebrate,
    summary,
    markSeen,
    inTransit,
    huntChip,
    huntPathHtml,
    arrive,
    fly,
    acquire,
    intro,
    share,
    plural,
    days,
    MAX_GRAILS: 5
  };
})();
