// Page layout presets. They look for widgets by layout ROLE (climate, clock, camera, date, timer), which each
// widget declares in its definition, instead of by type name: calendar plays the `date` role, so the kitchen
// preset takes either. Every preset returns null when its widgets are not all there; the page then packs normally.
import {defaultSizeOf, layoutRolesOf} from '../core/registry.js';

const hasRole = (entry, role) => layoutRolesOf(entry.widget.type).includes(role);
const findRole = (entries, role) => entries.find((entry) => hasRole(entry, role));
const sizeOf = (entry) => entry.widget.size || defaultSizeOf(entry.widget.type);

/** [x, y, w, h] cells -> placements for the chosen entries, in order. */
const place = (chosen, coords) =>
  chosen.map((entry, i) => ({
    ...entry,
    x: coords[i][0],
    y: coords[i][1],
    w: coords[i][2],
    h: coords[i][3]
  }));

const MODULAR_ROLES = ['climate', 'clock', 'camera'];
const MODULAR_COORDS = {
  3: [
    [0, 0, 2, 2],
    [2, 0, 1, 1],
    [2, 1, 1, 1],
    [0, 2, 1, 1],
    [1, 2, 1, 1],
    [2, 2, 1, 1]
  ],
  5: [
    [0, 0, 2, 2],
    [2, 0, 1, 1],
    [3, 0, 2, 1],
    [2, 1, 1, 1],
    [3, 1, 1, 1],
    [4, 1, 1, 1]
  ]
};

/** Big thermostat, clock, camera and three controls on one page (3 or 5 columns). */
export function modular(entries, columns, maxRows) {
  if (![3, 5].includes(columns)) return null;
  const climate = findRole(entries, 'climate');
  const clock = findRole(entries, 'clock');
  const camera = findRole(entries, 'camera');
  const controls = entries.filter((e) => !MODULAR_ROLES.some((role) => hasRole(e, role)));
  if (!climate || !clock || !camera || controls.length < 3 || maxRows < (columns === 3 ? 3 : 2)) {
    return null;
  }
  const plain = [clock, camera, ...controls.slice(0, 3)];
  if (
    sizeOf(climate) !== 'large' ||
    plain.some((e) => e.widget.size && e.widget.size !== 'normal')
  ) {
    return null;
  }
  const chosen = [climate, clock, camera, ...controls.slice(0, 3)];
  return {
    placements: place(chosen, MODULAR_COORDS[columns]),
    rows: columns === 3 ? 3 : 2,
    remaining: entries.filter((e) => !chosen.includes(e))
  };
}

const KITCHEN_ROLES = ['clock', 'date', 'camera', 'timer'];
const KITCHEN_COORDS = {
  3: [
    [0, 0, 1, 1],
    [1, 0, 2, 1],
    [0, 1, 3, 1],
    [0, 2, 3, 1]
  ],
  5: [
    [0, 0, 2, 1],
    [0, 1, 2, 2],
    [2, 0, 3, 2],
    [2, 2, 3, 1]
  ]
};

/** Clock, date (or calendar), camera and timer on one page (3 or 5 columns). */
export function kitchen(entries, columns, maxRows) {
  if (![3, 5].includes(columns) || maxRows < 3) return null;
  const chosen = KITCHEN_ROLES.map((role) => findRole(entries, role));
  if (chosen.some((entry) => !entry)) return null;
  return {
    placements: place(chosen, KITCHEN_COORDS[columns]),
    rows: 3,
    remaining: entries.filter((e) => !chosen.includes(e))
  };
}

/**
 * The `controls` layout for equal-size tiles: full rows of `columns` tiles, the last row stretched to the
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
