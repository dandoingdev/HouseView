import {defineWidget} from '../../core/define-widget.js';
import {calendarTap} from '../_shared/calendar-tap.js';
import {DIAL_HANDS, dialNumbers, dialTicks, updateDial} from './dial.js';

// Analogue clock widget: a dial with hands and an optional name (the date widget shows the date). It has no entity and is always available.
// `render` only writes the static dial; the hands and the aria-label are DOM work done by `refresh`,
// once after each render and then every second (a bare `render` could not move the hands without re-rendering).
//
// The dial size is not set here: the controller sizes every `.clock` tile's `.dial` after layout (it needs the
// tile's measured size), see `_sizeDial` in controller/screen-model.js.

/** Move the hands and set the labels of the mounted tile. `ctx.now` honours the carousel's `preview_time`. */
function refresh(ctx) {
  updateDial(ctx.el, new Date(ctx.now()), ctx.lang() || undefined);
}

export default defineWidget({
  type: 'clock',
  label: 'Clock',
  order: 20,
  entity: 'none',
  availability: 'always',
  layoutRoles: ['clock'],

  render(ctx) {
    // The default name is the type itself ("clock"); that would only repeat the tile, so it shows nothing.
    const name = ctx.name === 'clock' ? '' : ctx.name;
    // The aria-label is overwritten with the time by `refresh`; this is the value before the first tick.
    return (
      `<div ${ctx.attr} class="tile ${ctx.cls}" role="group" aria-label="${ctx.esc(ctx.t('clock.current_time'))}">` +
      `<div class="dial">${dialTicks()}${dialNumbers()}${DIAL_HANDS}</div>` +
      `<div class="clock-caption"><strong>${name}</strong></div>` +
      calendarTap(ctx) +
      `</div>`
    );
  },

  afterRender: refresh,
  tick: {every: 1000, run: refresh}
});
