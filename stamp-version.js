'use strict';
/**
 * Единый стемп деплоя (Волна 1, п.1, IMPLEMENTATION-PLAN-ROLES-AND-
 * NOTIFICATIONS.md §1) — заменяет ручные `?v=N` на КАЖДОМ `<script src="...">`
 * ОДНИМ значением на весь деплой, во всех трёх точках входа
 * (`app.html`, `admin/app.html`, `client/app.html`). Раньше версия
 * поднималась вручную на каждом изменённом файле — пропуск хотя бы одного
 * оставлял старую закешированную копию (реальная причина как минимум одной
 * находки в reference_bot_knopka_availability_infra, 06.08.2026, коммит
 * e343109). Запускается deploy-frontend.bat ПЕРЕД git add/commit — стемп
 * входит в тот же коммит, что и остальные правки.
 *
 * Формат — дата+время (YYYYMMDDHHmmss), не git-sha: стемпим ДО commit,
 * sha самого коммита в этот момент ещё не существует (курица/яйцо). Всегда
 * увеличивается и уникален на каждый реальный запуск деплоя — этого
 * достаточно для cache-busting, не обязательно быть git-производным
 * (решение VASY 10.09.2026, план допускал оба варианта).
 *
 * Единый стемп для ВСЕХ локальных скриптов сразу (а не по одному счётчику
 * на файл, как раньше) — намеренное упрощение: любой деплой инвалидирует
 * кеш на все локальные .js разом, даже для файлов, которые в этот раз не
 * менялись. Незначительный лишний трафик (сами файлы небольшие) в обмен на
 * то, что забыть поднять версию физически невозможно — то же обоснование,
 * что в критерии готовности Волны 1.
 *
 * Внешние CDN-теги (tailwindcss/lucide/telegram-web-app.js) НЕ трогаются —
 * они и так без `?v=`, версионирование не их зона ответственности здесь.
 */
const fs = require('fs');
const path = require('path');

const ENTRY_FILES = [
  path.join(__dirname, 'app.html'),
  path.join(__dirname, 'admin', 'app.html'),
  path.join(__dirname, 'client', 'app.html'),
];

// Локальный <script src="..."> — не начинается с http(s):// (внешние CDN).
const LOCAL_SCRIPT_SRC_RE = /(<script src=")([^"]+?)(?:\?v=\d+)?(")/g;

function buildStamp(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * @param {string} filePath
 * @param {string} stamp
 * @returns {number} количество затронутых локальных script-тегов
 */
function stampFile(filePath, stamp) {
  const original = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  const updated = original.replace(LOCAL_SCRIPT_SRC_RE, (match, prefix, src, suffix) => {
    if (/^https?:\/\//i.test(src)) return match; // внешний CDN — не трогаем
    count += 1;
    return `${prefix}${src}?v=${stamp}${suffix}`;
  });
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }
  return count;
}

function stampAll(stamp, entryFiles) {
  const files = entryFiles || ENTRY_FILES;
  const results = files.map((filePath) => ({ filePath, count: stampFile(filePath, stamp) }));
  return { stamp, results };
}

function main() {
  const stamp = process.argv[2] || buildStamp();
  const { results } = stampAll(stamp, ENTRY_FILES);
  let total = 0;
  for (const { filePath, count } of results) {
    console.log(`${path.relative(process.cwd(), filePath)}: ${count} script(s) -> v=${stamp}`);
    total += count;
  }
  console.log(`Стемп деплоя: ${stamp} (${total} тегов всего).`);
}

module.exports = { buildStamp, stampFile, stampAll, ENTRY_FILES, LOCAL_SCRIPT_SRC_RE };

if (require.main === module) {
  main();
}
