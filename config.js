/**
 * config.js — общие технические константы для всех страниц Web App панели.
 * НЕ содержит бизнес-данные (структуру заказа, справочники, курсы) — это
 * источник истины на бэкенде (WebAppApi), фронтенд их запрашивает, не хранит.
 * Здесь — только то, что технически нужно ДО первого обращения к серверу.
 */
const APP_CONFIG = {
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbyJjJnomBDsWPWUpbkrYF0qarQd53Obza5Dqqug_NVdPU_cxFdUCnt4PXPzqdwEgU3R/exec',
  TIMEZONE: 'Europe/Moscow'
};