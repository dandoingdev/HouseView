import {defineOverview} from '../../core/define-overview.js';
import {brightnessOf, canDim, colorOf, colourModes} from '../../core/light.js';
import {colourMarkup, bindColour} from './colour.js';
import strings from './strings.js';
import {bindVerticalLevel} from '../_shared/vertical-level.js';
import {panelHeader, panelKey} from '../_shared/control-panel.js';

export default defineOverview({
  type: 'light',
  label: 'Light view',
  order: 80,
  entity: 'required',
  domains: ['light'],
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  actions: ['light'],
  tap: {card: 'none'},
  options: {icon: {type: 'icon'}},
  render(ctx, mode) {
    const value = brightnessOf(ctx.state);
    const adjustable = ctx.ok && canDim(ctx.attrs);
    const header = panelHeader(ctx, mode, {
      closeLabel: ctx.t('light_overview.close'),
      detailsLabel: ctx.t('light_overview.more_info')
    });
    const icon = ctx.options.icon || ctx.attrs.icon || 'lightbulb-outline';
    const input = `<input class="ov-light-input" type="range" min="0" max="100" step="1" value="${value}" aria-orientation="vertical" aria-label="${ctx.esc(ctx.t('light_overview.brightness'))}" data-value-action="light-brightness-" data-entity="${ctx.esc(ctx.entityId)}"${adjustable ? '' : ' disabled'}>`;
    return (
      `<div class="ov-scene ov-light-scene" role="group" aria-label="${ctx.name}">` +
      `<div class="ov-light-dimmer">` +
      header +
      `<div class="ov-light-control" style="--brightness:${value}%;--light-color:${colorOf(ctx.attrs)}">` +
      `<div class="ov-light-fill" aria-hidden="true"></div><div class="ov-light-readout" aria-hidden="true">${ctx.icon(icon).replace('<ha-icon', '<ha-icon class="ov-light-icon"')}<div><span class="ov-light-value">${ctx.ok ? value : '—'}</span><span class="ov-light-percent">%</span></div></div>${input}</div>` +
      `<footer class="ov-light-foot">${ctx.ok && Object.values(colourModes(ctx.attrs)).some(Boolean) ? `<button type="button" class="ov-panel-key ov-light-open-colour" aria-label="${ctx.esc(ctx.t('light_overview.colour'))}">${ctx.icon('palette').replace('<ha-icon', '<ha-icon class="ov-panel-icon"')}</button>` : ''}${!ctx.ok ? ctx.esc(ctx.t('light_overview.unavailable')) : panelKey(ctx, {action: 'light', icon: 'power', label: ctx.t('light_overview.toggle')})}</footer></div>${colourMarkup(ctx)}</div>`
    );
  },
  afterRender(ctx) {
    bindVerticalLevel(ctx, {
      prefix: 'light',
      readValue: brightnessOf,
      storeKey: 'brightness',
      property: '--brightness'
    });
    bindColour(ctx);
  }
});
