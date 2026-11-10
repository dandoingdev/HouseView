import {HOUSE_MODES} from './house-modes.js';
import {iconHTML} from './html.js';

/** Stable five-button surface; live labels and state are patched by its controller. */
export function houseModeViewHTML() {
  return `<header class="hm-header"><div class="hm-heading"><small></small><h2></h2></div><button type="button" class="ov-panel-key hm-close" data-action="house-modes-close">${iconHTML('chevron-left')}</button></header><div class="hm-scroll"><section class="hm-current"><span class="hm-current-copy"><small class="hm-caption"></small><strong class="hm-current-name"><span class="hm-current-icon"></span><span></span></strong></span><button type="button" class="hm-end" data-action="house-mode" data-entity="house-mode:home"></button></section><div class="hm-grid">${HOUSE_MODES.map((mode) => `<article class="hm-item"><button type="button" class="hm-mode" data-action="house-mode" data-entity="house-mode:${mode.id}" data-house-mode="${mode.id}" aria-pressed="false"><span class="hm-icon">${iconHTML(mode.icon)}</span><span class="hm-copy"><strong class="hm-name"></strong></span><span class="hm-mark"></span></button></article>`).join('')}</div><p class="hm-status" role="status" aria-live="polite"></p></div><footer class="hm-footer"></footer>`;
}
