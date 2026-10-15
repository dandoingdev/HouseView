// Define the card elements and the Lovelace picker entries, all driven by the widget registry.
//
//   houseview-widget-card        the generic card (`widget_type:` picks the kind)
//   houseview-<kind>-card        one per registered widget with `standalone` true (a subclass that fixes the kind)
//
// Nothing here lists a kind: registering a widget adds its element and its picker entry. Every define goes
// through defineOnce and every picker entry through registerCustomCard, so loading the resource twice is safe.
import {DOCUMENTATION_URL, defineOnce, registerCustomCard} from '../define.js';
import {hasString, translate} from '../core/i18n.js';
import {widgetList} from '../core/registry.js';
import {HouseViewWidgetCard} from './widget-card.js';

const GENERIC_DESCRIPTION = 'Shared HouseView styling and controls.';

/** The element tag of a widget: its own `tag` (overviews), otherwise `houseview-<type>-card`. */
export const tagOf = (def) => def.tag ?? `houseview-${def.type}-card`;

/** Picker description: the widget's own, then its translated `<type>.description`, then a generic one. */
function descriptionOf(def) {
  if (def.description) return def.description;
  const key = `${def.type}.description`;
  return hasString(key) ? translate(undefined, key) : GENERIC_DESCRIPTION;
}

/** A subclass of the generic card that is fixed to one widget kind. */
function kindClass(type) {
  return class SpecificWidget extends HouseViewWidgetCard {
    static widgetKind = type;
  };
}

/** The generic card: element and picker entry. */
export function registerGenericWidgetCard() {
  defineOnce('houseview-widget-card', HouseViewWidgetCard);
  registerCustomCard({
    type: 'houseview-widget-card',
    name: 'HouseView · Widget',
    description: 'A reusable glass widget with native HA settings.',
    preview: true,
    documentationURL: DOCUMENTATION_URL
  });
}

/**
 * Define `houseview-<kind>-card` for every registered standalone widget. Call again after registering more
 * widgets: kinds that already have an element are skipped.
 * @returns {string[]} the tags this call defined
 */
export function registerKindCards() {
  const defined = [];
  for (const def of widgetList()) {
    if (!def.standalone) continue;
    const tag = tagOf(def);
    if (defineOnce(tag, kindClass(def.type))) defined.push(tag);
    registerCustomCard({
      type: tag,
      name: `HouseView · ${def.label}`,
      description: descriptionOf(def),
      preview: def.preview,
      documentationURL: DOCUMENTATION_URL
    });
  }
  return defined;
}
