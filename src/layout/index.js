// HouseView's screen-sized layout: pack widgets into bounded pages, never a long column.
// buildScreens is a named export of the bundle: the
// browser suite imports it.
import {expand, pack, span} from './pack.js';
import {controlPages, kitchen, modular} from './presets.js';

export {span, pack, expand};
export {controlPages, kitchen, modular};

const DEFAULT_PAGE = {name: 'Home', surface: 'glass', layout: 'auto'};

/** Page definitions: the configured ones, plus a default for each `page` a widget names that has none. */
function pageDefinitions(widgets, definitions) {
  const defs = definitions?.length ? definitions.map((d) => ({...d})) : [{...DEFAULT_PAGE}];
  for (const widget of widgets) {
    if (widget.page && !defs.some((d) => d.name === widget.page)) {
      defs.push({...DEFAULT_PAGE, name: widget.page});
    }
  }
  return defs;
}

/** Columns of a `controls` page: 5-column screens may ask for 2 to 5, narrower screens get 2. */
function controlColumns(def, columns) {
  if (columns !== 5) return Math.min(columns, 2);
  const wanted =
    Number.isInteger(def.columns) && def.columns >= 2 && def.columns <= 5 ? def.columns : 3;
  return Math.min(columns, wanted);
}

/**
 * Split widgets into screens (carousel pages).
 * @param {Object[]} widgets
 * @param {{name:string, surface?:string, layout?:string, columns?:number}[]|undefined} definitions
 * @param {number} columns   columns the viewport offers
 * @param {number} maxRows   rows that fit
 * @returns {{key:string, label:string, placements:Object[], rows:number, columns?:number}[]}
 */
export function buildScreens(widgets, definitions, columns, maxRows) {
  const screens = [];
  const defs = pageDefinitions(widgets, definitions);
  for (const def of defs) {
    let entries = widgets
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

    const preset =
      def.layout === 'kitchen'
        ? kitchen(entries, columns, maxRows)
        : def.layout === 'modular'
          ? modular(entries, columns, maxRows)
          : null;
    if (preset) {
      add({placements: preset.placements, rows: preset.rows});
      entries = preset.remaining;
    }

    const pageColumns = def.layout === 'controls' ? controlColumns(def, columns) : columns;
    const equalTiles = entries.every((e) => !e.widget.size || e.widget.size === 'normal');
    if (def.layout === 'controls' && equalTiles) {
      for (const page of controlPages(entries, pageColumns, maxRows)) add(page);
    } else {
      for (const batch of pack(entries, pageColumns, maxRows)) {
        add({...expand(batch, pageColumns), columns: pageColumns});
      }
    }
  }
  return screens;
}
