// Actions that belong to no widget: the shared `info` and `toggle`, and the card-level features
// (`dim`, `page-prev`, `page-next`, `page-select`).
//
// Pure data. The registry seeds itself from this file, so every consumer sees these names without an
// import-order requirement, and this file never imports the registry (no cycle).
import {iconHTML} from './html.js';
import {translate} from './i18n.js';

const freeze = Object.freeze;

/** Open the more-info dialog; nothing is called, nothing is pending. */
const info = freeze({
  // Pressing `info` on an entity whose state is "unknown" opens more-info even though the
  // entity does not count as available. Read by the dispatcher.
  infoWhenUnknown: true,
  guard: () => 'info',
  run: (ctx, id) => ctx.info(id)
});

/** Flip any entity through the generic Home Assistant service. */
const toggle = freeze({
  run: (ctx, id) => ctx.call('homeassistant', 'toggle', {entity_id: id})
});

export const coreActions = freeze({info, toggle});

// ---- card-level features: run with a context that also carries `card` ---------------------------------------

const setPage = (ctx, index) => ctx.card._setPage(index);

/**
 * The bedtime dim button. The controller may provide `_toggleDim`; this is the original behaviour for a card
 * that does not (shell class, aria-label and button content are all updated in place, no re-render).
 */
function toggleDim(ctx) {
  const card = ctx.card;
  if (typeof card._toggleDim === 'function') return card._toggleDim();
  card._dim = !card._dim;
  const root = card.shadowRoot;
  root?.querySelector('.shell')?.classList.toggle('screen-dim', card._dim);
  const button = root?.querySelector('.dim-screen');
  if (!button) return undefined;
  const language = ctx.lang();
  const text = (key) => translate(language, key);
  button.setAttribute('aria-label', text(card._dim ? 'dim.restore' : 'dim.dim_screen'));
  button.innerHTML = `${iconHTML(card._dim ? 'brightness-6' : 'weather-night')}<span>${text(
    card._dim ? 'dim.brighter' : 'dim.dim'
  )}</span>`;
  return undefined;
}

/** Open an overview card's full-page layer (the weather widget). Nothing is called on Home Assistant. */
function openOverview(ctx, id) {
  return ctx.card._screensaverOpen?.(id);
}

/** Show the month calendar full screen (a clock, date or calendar widget was pressed). Nothing is called on Home Assistant. */
function openCalendar(ctx) {
  return ctx.card._screensaverOpenType?.('calendar_month');
}

/**
 * Jump to the carousel page that holds a widget (the home overview's chips and headers). The id is `widget:<index>`,
 * the index of the widget in the card's normalised `widgets` list (its `data-widget` number). An unknown index, or a
 * widget that is on no page, does nothing. Nothing is called on Home Assistant.
 */
function gotoWidget(ctx, id) {
  const match = /^widget:(\d+)$/.exec(String(id ?? ''));
  if (!match) return undefined;
  const index = Number(match[1]);
  const page = ctx.card._screens?.findIndex((screen) =>
    screen.placements?.some((placement) => placement.index === index)
  );
  return page >= 0 ? setPage(ctx, page) : undefined;
}

export const featureActions = freeze({
  'goto-widget': freeze({immediate: true, run: gotoWidget}),
  'calendar-view': freeze({immediate: true, run: openCalendar}),
  'overview-open': freeze({immediate: true, run: openOverview}),
  'home-view': freeze({
    immediate: true,
    run: (ctx) =>
      ctx.card._screensaverOpenType?.(
        'home',
        ctx.card._config?.home_title ? {title: ctx.card._config.home_title} : {}
      )
  }),
  dim: freeze({immediate: true, run: toggleDim}),
  'page-next': freeze({
    immediate: true,
    run: (ctx) => setPage(ctx, (ctx.card._pageIndex || 0) + 1)
  }),
  'page-prev': freeze({
    immediate: true,
    run: (ctx) => setPage(ctx, (ctx.card._pageIndex || 0) - 1)
  }),
  // The page dots call _setPage directly with data-page; this name is reserved so no widget can claim it.
  'page-select': freeze({immediate: true, run: (ctx, id) => setPage(ctx, Number(id))})
});
