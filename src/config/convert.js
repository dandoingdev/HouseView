// Conversion between the `widgets:` list and Home Assistant card
// configs (`cards:`). the kind lists come from the registry.
import {
  getWidget,
  onRegistryChange,
  widgetKinds,
  widgetLabels,
  widgetList
} from '../core/registry.js';

/** Config type of the generic reusable card. */
export const WIDGET_CARD = 'custom:houseview-widget-card';

// `kinds` and `labels` are exported as plain arrays and objects. They are refreshed in
// place whenever a widget registers, so an importer that grabbed them early still sees every kind.
export const kinds = [];
export const labels = {};

function syncKindsAndLabels() {
  kinds.length = 0;
  kinds.push(...widgetKinds());
  for (const key of Object.keys(labels)) delete labels[key];
  Object.assign(labels, widgetLabels());
}
onRegistryChange(syncKindsAndLabels);
syncKindsAndLabels();

/** `scene` -> `action`: the canonical type behind a original alias; other types come back unchanged. */
function canonicalType(type) {
  return getWidget(type)?.type ?? type;
}

/** True for `custom:houseview-cover-card` when `cover` is a registered kind. */
function isKindTag(tag) {
  return (
    typeof tag === 'string' &&
    widgetList().some((def) => tag === `custom:${def.tag ?? `houseview-${def.type}-card`}`)
  );
}

/** A widget as a card config for the generic reusable card. */
export function toCard(widget) {
  const {type, ...rest} = widget;
  return {type: WIDGET_CARD, widget_type: canonicalType(type), ...rest};
}

/**
 * Any config shape as a list of card configs. Cards are copied one level deep; a `cards:` entry is not
 * interpreted.
 */
export function toCards(config) {
  if (config.cards) return config.cards.map((card) => ({...card}));
  return (config.widgets ?? []).map(toCard);
}

/**
 * A card config as a widget. HouseView cards become widgets; any other Home Assistant card
 * becomes a `native_card` widget that keeps the original under `_card`.
 */
export function fromCard(card) {
  if (card.type === WIDGET_CARD || isKindTag(card.type)) {
    const {type, widget_type: widgetType, ...rest} = card;
    // 'custom:houseview-' is 17 characters, '-card' is 5: the tag's own middle part is the kind
    return {
      ...rest,
      type:
        widgetType ||
        widgetList().find((def) => `custom:${def.tag ?? `houseview-${def.type}-card`}` === type)
          ?.type ||
        type.slice(17, -5)
    };
  }
  return {
    type: 'native_card',
    _card: card,
    entity: card.entity,
    page: card.view_layout?.houseview_page,
    size: card.view_layout?.houseview_size || 'normal'
  };
}

/** Put a card on a carousel page: HouseView cards carry `page`, native cards `view_layout.houseview_page`. */
export function onPage(card, page) {
  return fromCard(card).type !== 'native_card'
    ? {...card, page}
    : {...card, view_layout: {...card.view_layout, houseview_page: page}};
}
