// Page packing: put widgets on bounded pages, never one long column. Two paths, one behaviour: equal-size tiles
// are balanced into rows (`controlPages`), anything else is first-fit packed and then expanded (`pack`, `expand`).
// The climate-is-large rule comes from the registry.
import {defaultSizeOf} from '../core/registry.js';

/** Grid cells (columns x rows) a widget covers, never more than the page offers. */
export function span(widget, columns, maxRows) {
  const size = widget.size || defaultSizeOf(widget.type);
  return {
    w: Math.min(columns, size === 'large' || size === 'wide' ? 2 : 1),
    h: Math.min(maxRows, size === 'large' || size === 'tall' ? 2 : 1)
  };
}

const emptyGrid = (rows, columns) => Array.from({length: rows}, () => Array(columns).fill(false));

function fits(grid, x, y, w, h) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) if (grid[y + dy][x + dx]) return false;
  return true;
}

function occupy(grid, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) grid[y + dy][x + dx] = true;
}

/**
 * First-fit packing in reading order. A widget that no longer fits starts the next page.
 * @param {{widget: Object, index: number}[]} entries
 * @returns {Object[][]} one list of placements ({...entry, x, y, w, h}) per page
 */
export function pack(entries, columns, maxRows) {
  const batches = [];
  let current = [];
  let grid = emptyGrid(maxRows, columns);

  const place = (entry) => {
    const {w, h} = span(entry.widget, columns, maxRows);
    for (let y = 0; y <= maxRows - h; y++) {
      for (let x = 0; x <= columns - w; x++) {
        if (!fits(grid, x, y, w, h)) continue;
        occupy(grid, x, y, w, h);
        current.push({...entry, x, y, w, h});
        return true;
      }
    }
    return false;
  };

  for (const entry of entries) {
    if (place(entry)) continue;
    batches.push(current);
    current = [];
    grid = emptyGrid(maxRows, columns);
    place(entry);
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Grow placements into free neighbouring cells (first to the right, then downwards) so a page has no holes.
 * Mutates the placements it is given.
 * @returns {{placements: Object[], rows: number}}
 */
export function expand(placements, columns) {
  const rows = Math.max(...placements.map((p) => p.y + p.h));
  const grid = emptyGrid(rows, columns);
  for (const p of placements) occupy(grid, p.x, p.y, p.w, p.h);

  const free = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) if (grid[y + dy]?.[x + dx]) return false;
    return true;
  };

  for (const p of placements) {
    while (p.x + p.w < columns && free(p.x + p.w, p.y, 1, p.h)) {
      for (let y = p.y; y < p.y + p.h; y++) grid[y][p.x + p.w] = true;
      p.w++;
    }
    while (p.y + p.h < rows && free(p.x, p.y + p.h, p.w, 1)) {
      for (let x = p.x; x < p.x + p.w; x++) grid[p.y + p.h][x] = true;
      p.h++;
    }
  }
  return {placements, rows};
}

/**
 * Equal-size tiles (every widget normal): full rows of `columns` tiles, the last row stretched to the
 * full width. One page per columns x maxRows tiles.
 * @returns {{placements: Object[], rows: number, columns: number}[]}
 */
export function controlPages(entries, columns, maxRows) {
  const pages = [];
  for (let start = 0; start < entries.length; start += columns * maxRows) {
    const batch = entries.slice(start, start + columns * maxRows);
    const rows = Math.ceil(batch.length / columns);
    const lastCount = batch.length - (rows - 1) * columns;
    let lastX = 0;
    const placements = batch.map((entry, i) => {
      const y = Math.floor(i / columns);
      const last = y === rows - 1;
      const w = last
        ? Math.floor(columns / lastCount) + (i % columns < columns % lastCount ? 1 : 0)
        : 1;
      const x = last ? lastX : i % columns;
      if (last) lastX += w;
      return {...entry, x, y, w, h: 1};
    });
    pages.push({placements, rows, columns});
  }
  return pages;
}
