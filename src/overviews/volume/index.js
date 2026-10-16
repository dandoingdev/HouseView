import {defineOverview} from '../../core/define-overview.js';
import {canSetVolume, canMuteVolume, volumeOf} from '../../core/media-volume.js';
import {bindVerticalLevel} from '../_shared/vertical-level.js';
import {panelHeader, panelKey} from '../_shared/control-panel.js';
import strings from './strings.js';

export default defineOverview({
  type: 'volume',
  label: 'Volume view',
  order: 110,
  entity: 'required',
  domains: ['media_player'],
  strings,
  selectable: false,
  interactive: true,
  controls: true,
  actions: ['media-player-volume-mute'],
  tap: {card: 'none'},
  render(ctx, mode) {
    const value = volumeOf(ctx.state);
    const adjustable = ctx.ok && canSetVolume(ctx.attrs);
    const muted = ctx.attrs.is_volume_muted === true;
    const header = panelHeader(ctx, mode, {
      closeLabel: ctx.t('volume_overview.close'),
      detailsLabel: ctx.t('volume_overview.more_info')
    });
    const mute =
      ctx.ok && canMuteVolume(ctx.attrs)
        ? panelKey(ctx, {
            action: 'media-player-volume-mute',
            icon: muted ? 'volume-high' : 'volume-off',
            label: ctx.t(`volume_overview.${muted ? 'unmute' : 'mute'}`)
          })
        : '';
    return `<div class="ov-scene ov-volume-scene" role="group" aria-label="${ctx.name}">${header}<div class="ov-volume-control" style="--volume:${value}%"><div class="ov-volume-fill" aria-hidden="true"></div><div class="ov-volume-readout" aria-hidden="true">${ctx.icon(muted ? 'volume-off' : 'volume-high').replace('<ha-icon', '<ha-icon class="ov-volume-icon"')}<div><span class="ov-volume-value">${ctx.ok ? value : '—'}</span><span class="ov-volume-percent">%</span></div></div><input class="ov-volume-input" type="range" min="0" max="100" step="1" value="${value}" aria-orientation="vertical" aria-label="${ctx.esc(ctx.t('volume_overview.volume'))}" data-value-action="media-player-volume-set-" data-entity="${ctx.esc(ctx.entityId)}"${adjustable ? '' : ' disabled'}></div><footer class="ov-volume-foot">${!ctx.ok ? ctx.esc(ctx.t('volume_overview.unavailable')) : mute}${muted && ctx.ok ? `<span class="ov-volume-muted">${ctx.esc(ctx.t('volume_overview.muted'))}</span>` : ''}</footer></div>`;
  },
  afterRender: (ctx) =>
    bindVerticalLevel(ctx, {
      prefix: 'volume',
      readValue: volumeOf,
      storeKey: 'volume',
      property: '--volume'
    })
});
