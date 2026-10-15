// HouseView's screen-sized layout: widgets flow in order onto bounded pages, never a long column.
// buildScreens is a named export of the bundle: the
// browser suite imports it.
import {controlPages, expand, pack, span} from './pack.js';

export {span, pack, expand, controlPages};

const DEFAULT_PAGE = {name: 'Home', surface: 'glass'};

/** Page definitions: the configured ones, plus a default for each `page` a widget names that has none. */
function pageDefinitions(widgets, definitions) {
  // `layout` was a page option once: older configs may still carry it, and it does nothing
  const defs = definitions?.length
    ? definitions.map((d) => {
        const copy = {...d};
        delete copy.layout;
        return copy;
      })
    : [{...DEFAULT_PAGE}];
  for (const widget of widgets) {
    if (widget.page && !defs.some((d) => d.name === widget.page)) {
      defs.push({...DEFAULT_PAGE, name: widget.page});
    }
  }
  return defs;
}

/**
 * Columns of a page: phones and portrait tablets (fewer than 5 columns offered) get 2; a wide landscape
 * screen (5 offered) gets the page's `columns` option (2 to 5) or 3.
 */
export function pageColumns(def, columns) {
  if (columns !== 5) return Math.min(columns, 2);
  const wanted =
    Number.isInteger(def.columns) && def.columns >= 2 && def.columns <= 5 ? def.columns : 3;
  return Math.min(columns, wanted);
}

/**
 * Split widgets into screens (carousel pages).
 * @param {Object[]} widgets
 * @param {{name:string, surface?:string, columns?:number}[]|undefined} definitions
 * @param {number} columns   columns the viewport offers (2, 3 or 5)
 * @param {number} maxRows   rows that fit
 * @returns {{key:string, label:string, placements:Object[], rows:number, columns:number}[]}
 */
export function buildScreens(widgets, definitions, columns, maxRows) {
  const screens = [];
  const defs = pageDefinitions(widgets, definitions);
  for (const def of defs) {
    const entries = widgets
      .map((widget, index) => ({widget, index}))
      .filter((entry) => (entry.widget.page || defs[0].name) === def.name);
    if (!entries.length) continue;

    let part = 0;
    const add = (result) => {
      screens.push({
        ...def,
        ...result,
        key: `${def.name}:${part}`,
        label: part++ ? `${def.name} · ${part}` : def.name
      });
    };

    const pageCols = pageColumns(def, columns);
    const equalTiles = entries.every((e) => !e.widget.size || e.widget.size === 'normal');
    if (equalTiles) {
      for (const page of controlPages(entries, pageCols, maxRows)) add(page);
    } else {
      for (const batch of pack(entries, pageCols, maxRows)) {
        add({...expand(batch, pageCols), columns: pageCols});
      }
    }
  }
  return screens;
}
