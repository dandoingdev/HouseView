// Test stand-in for src/config/convert.js: the conversions, kinds from the registry.
import {widgetList} from '../../../src/core/registry.js';

export function toCard(widget) {
  const {type, ...rest} = widget;
  const aliased = ['scene', 'script', 'button', 'input_button'].includes(type) ? 'action' : type;
  return {type: 'custom:houseview-widget-card', widget_type: aliased, ...rest};
}
export function toCards(config) {
  if (config.cards) return config.cards.map((c) => ({...c}));
  if (config.widgets) return config.widgets.map(toCard);
  return [
    {type: 'climate', ...config.climate, size: 'large'},
    {type: 'clock'},
    ...['camera', 'scene', 'lock', 'secondary_light', 'light']
      .filter((k) => config[k])
      .map((k) => ({type: k === 'secondary_light' ? 'light' : k, ...config[k]}))
  ].map(toCard);
}
export function fromCard(card) {
  const kinds = widgetList()
    .map((d) => d.type)
    .join('|');
  if (
    card.type === 'custom:houseview-widget-card' ||
    new RegExp(`^custom:houseview-(${kinds})-card$`).test(card.type)
  ) {
    const {type, widget_type, ...rest} = card;
    return {...rest, type: widget_type || type.slice(17, -5)};
  }
  return {
    type: 'native_card',
    _card: card,
    entity: card.entity,
    page: card.view_layout?.houseview_page,
    size: card.view_layout?.houseview_size || 'normal'
  };
}
export function onPage(card, page) {
  return fromCard(card).type !== 'native_card'
    ? {...card, page}
    : {...card, view_layout: {...card.view_layout, houseview_page: page}};
}
