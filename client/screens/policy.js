'use strict';

/**
 * Экран "Политика конфиденциальности" (17.08.2026, project_bot_knopka_
 * privacy_policy) — не пункт нижней навигации (тот же паттерн, что
 * order-details/deleted-orders — доступ по ссылке, не по нав-бару). Открывается
 * из «Профиль» и из /start бота (deep-link на #/policy). Текст — POLICY_HTML
 * из policyText.js, ОДИН источник с гейтом согласия в common.js.
 */
window.Screens = window.Screens || {};
window.Screens.policy = {
  render(root) {
    document.getElementById('header-left').innerHTML = `
      <button type="button" id="back-btn" title="Назад" class="p-2 text-indigo-600 rounded-full hover:bg-white/50 transition-colors">
        <i data-lucide="arrow-left" class="w-6 h-6"></i>
      </button>
      <h1 class="text-lg font-semibold text-gray-900 tracking-tight ml-2">Политика конфиденциальности</h1>
    `;
    document.getElementById('header-actions').innerHTML = '';

    root.innerHTML = `
      <main class="pt-16 pb-6 px-4 md:px-0 max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-[13px] text-gray-600 leading-relaxed">
          ${window.PolicyText.POLICY_HTML}
        </div>
      </main>
    `;

    document.getElementById('back-btn').addEventListener('click', () => history.back());
  }
};
