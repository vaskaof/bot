'use strict';

/**
 * Общие помощники справочника линеек (IMPLEMENTATION-PLAN-GAMIFICATION.md
 * §2.7 Т1) — экран «Линейки» (catalog-lines.js) и поле «Линейка» в карточке
 * SKU (_sku-modal.js) показывают ветку одинаково: полным путём.
 */
window.LinesUtil = {
  /**
   * Плоский список веток с сервера (getCatalogLinesTree().lines) → в порядке
   * обхода дерева, с глубиной и полным путём «Monster High › G1 › Dead Tired».
   * @returns {Array<Object>} те же объекты + depth, path, childIds
   */
  ordered(lines) {
    const byParent = new Map();
    for (const line of lines) {
      const key = line.parentId || 0;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(line);
    }
    const out = [];
    const walk = (parentId, depth, prefix) => {
      for (const line of byParent.get(parentId) || []) {
        const path = prefix ? `${prefix} › ${line.name}` : line.name;
        out.push({ ...line, depth, path, childIds: (byParent.get(line.id) || []).map(c => c.id) });
        walk(line.id, depth + 1, path);
      }
    };
    walk(0, 0, '');
    return out;
  },

  /** id ветки и всех её потомков — чтобы не предлагать перенос внутрь себя. */
  subtreeIds(lines, rootId) {
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const line of lines) {
        if (line.parentId && ids.has(line.parentId) && !ids.has(line.id)) { ids.add(line.id); grew = true; }
      }
    }
    return ids;
  },

  /** <option>-ы для выбора ветки, с отступом по глубине. */
  optionsHtml(ordered, selectedId, emptyLabel) {
    const opts = [`<option value="">${escapeHtmlClient(emptyLabel || '— не выбрана —')}</option>`];
    for (const line of ordered) {
      const pad = '  '.repeat(line.depth);
      opts.push(`<option value="${line.id}"${line.id === selectedId ? ' selected' : ''}>${pad}${escapeHtmlClient(line.name)}</option>`);
    }
    return opts.join('');
  }
};
