import {defineOverview} from '../../core/define-overview.js';
import {
  clockDate,
  clockPalette,
  handAngles,
  inheritsBackground,
  clockFormData,
  digitalTime,
  isDigital
} from './model.js';
import strings from './strings.js';

function faceData(ctx) {
  const now = ctx.now();
  const parts = ctx.localParts(now);
  const digital = isDigital(ctx.options.face) ? digitalTime(ctx, now, parts) : null;
  return {
    digital,
    angles: handAngles(parts, ctx.options.show_seconds ? new Date(now).getUTCSeconds() : 0),
    date: clockDate(ctx, parts),
    time: isDigital(ctx.options.face) ? digital.text : ctx.timeParts(now).text
  };
}

const BLACK_BACKGROUND_AFTER_MS = 60_000;
const BACKGROUND_FADE_MS = 2_000;

/** Container units size the dial without measuring; re-checked so a host without them can fall back. */
function hasCqmin() {
  return typeof CSS !== 'undefined' && CSS.supports('width', '1cqmin');
}

function reducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Analogue seconds on the compositor when motion is allowed; reduced motion keeps the JS write. */
function useCompositorSeconds(ctx) {
  return ctx.options.show_seconds && !isDigital(ctx.options.face) && !reducedMotion();
}

/** Use the activation age from the host, independently of a pinned display time. */
function refreshRestingAppearance(ctx, backdrop) {
  if (ctx.mode !== 'screensaver' || !backdrop) return;
  const elapsed = ctx.elapsedMs || 0;
  const resting = elapsed >= BLACK_BACKGROUND_AFTER_MS;
  // Change ink halfway through the fade, when the background is dark enough for light text.
  const lightInk =
    resting && (elapsed >= BLACK_BACKGROUND_AFTER_MS + BACKGROUND_FADE_MS / 2 || reducedMotion());
  if (backdrop.dataset.resting !== String(resting)) backdrop.dataset.resting = String(resting);
  if (backdrop.dataset.restInk !== String(lightInk)) backdrop.dataset.restInk = String(lightInk);
}

/** Size the square dial when the host has no container units (once, and again on resize). */
function measureDial(ctx, board) {
  if (hasCqmin() || !ctx.el || !board) return;
  const target = ctx.el.closest('.hv-screensaver')?.parentElement || ctx.el;
  const rect = target.getBoundingClientRect();
  const side = Math.min(rect.width, rect.height);
  if (side > 0 && board.style.getPropertyValue('--clock-size') !== `${side}px`) {
    board.style.setProperty('--clock-size', `${side}px`);
    board.style.width = `${side}px`;
    board.style.height = `${side}px`;
  }
}

/** Observe the dial host once per mounted overview instance. */
function ensureDialObserver(ctx, board) {
  if (hasCqmin() || !ctx.el || ctx.store.get('dialObserver')) return;
  const target = ctx.el.closest('.hv-screensaver')?.parentElement || ctx.el;
  const ro = new ResizeObserver(() => measureDial(ctx, board));
  ro.observe(target);
  ctx.store.set('dialObserver', ro);
}

/**
 * Align a 60 s linear sweep with the current second (including fractions). Cleared under reduced
 * motion and when seconds are hidden. Changing the delay restarts the animation, so callers do
 * this only when the dial is new or the sweep was paused.
 */
function syncSecondHand(ctx, board) {
  const hand = board.querySelector('.ov-clock-second');
  if (!hand) return;
  if (!useCompositorSeconds(ctx)) {
    hand.removeAttribute('data-sweep');
    hand.style.removeProperty('--clock-second-delay');
    return;
  }
  const now = ctx.now();
  const date = new Date(now);
  const sec = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  const delay = `${-sec}s`;
  hand.dataset.sweep = '';
  // Same delay must not be written again: that restarts the animation and the hand snaps.
  if (hand.style.getPropertyValue('--clock-second-delay') !== delay)
    hand.style.setProperty('--clock-second-delay', delay);
  if (hand.style.transform) hand.style.transform = '';
}

function refreshInheritedBackground(ctx) {
  if (!inheritsBackground(ctx.options)) return;
  const shell = ctx.el.closest('.shell');
  if (!shell) return;
  // Read the actual surface base, including active-page and theme changes; no wallpaper sampling.
  const channels = getComputedStyle(shell)
    .backgroundColor.match(/[\d.]+/g)
    ?.map(Number);
  if (channels?.length >= 3 && (channels.length === 3 || channels[3] > 0)) {
    const palette = clockPalette(channels.slice(0, 3), ctx.options.face);
    const backdrop = ctx.el.querySelector('.ov-clock-backdrop');
    for (const [key, value] of Object.entries(palette)) {
      const property = `--clock-${key === 'background' ? 'bg' : key}`;
      if (backdrop.style.getPropertyValue(property) !== value)
        backdrop.style.setProperty(property, value);
    }
  }
}

/** Longer than one shared tick. The ticker does not run while the document is hidden. */
const SWEEP_GAP_MS = 1500;

/** True while the screensaver black fade still needs per-second dataset updates. */
function inRestingFade(ctx) {
  if (ctx.mode !== 'screensaver') return false;
  const elapsed = ctx.elapsedMs || 0;
  return (
    elapsed >= BLACK_BACKGROUND_AFTER_MS - 1000 &&
    elapsed < BLACK_BACKGROUND_AFTER_MS + BACKGROUND_FADE_MS + 500
  );
}

/**
 * The square dial stays centred on tablets; its background fills the entire screen.
 * Analogue seconds sweep on the compositor; hour/minute/date/aria update on the minute (and the
 * resting fade still needs a short window of one-second ticks).
 */
function refresh(ctx) {
  if (!ctx.el) return;
  const board = ctx.el.querySelector('.ov-clock-board');
  if (!board) return;

  const digital = isDigital(ctx.options.face);
  const compositor = useCompositorSeconds(ctx);
  const now = ctx.now();
  const previousTick = ctx.store.get('tickAt') || 0;
  // Stamp every visit, including the early return, so a steady one-second cadence is not a gap.
  ctx.store.set('tickAt', now);
  const minute = Math.floor(now / 60000);
  const lastMinute = ctx.store.get('minute');
  const minuteChanged = lastMinute !== minute;
  const needsDigitalSeconds = digital && ctx.options.show_seconds;
  const needsJsSeconds = ctx.options.show_seconds && !digital && !compositor;
  const fade = inRestingFade(ctx);
  // A replaced board (layer re-render) must prime again even though the store survives.
  const first = ctx.store.get('board') !== board;
  // The shared ticker skips ticks while the document is hidden; that pause is what makes the sweep stale.
  const wakeSweep = compositor && previousTick > 0 && now - previousTick > SWEEP_GAP_MS;

  if (!first && !minuteChanged && !fade && !needsDigitalSeconds && !needsJsSeconds && !wakeSweep) {
    // Wallpaper / theme can change the shell without remounting the dial.
    if (inheritsBackground(ctx.options)) refreshInheritedBackground(ctx);
    // Legacy hosts without container units still need a measure after a viewport change.
    if (!hasCqmin()) {
      ensureDialObserver(ctx, board);
      measureDial(ctx, board);
    }
    return;
  }

  if (wakeSweep && !first && !minuteChanged && !fade && !needsDigitalSeconds && !needsJsSeconds) {
    syncSecondHand(ctx, board);
    if (inheritsBackground(ctx.options)) refreshInheritedBackground(ctx);
    if (!hasCqmin()) {
      ensureDialObserver(ctx, board);
      measureDial(ctx, board);
    }
    return;
  }

  refreshRestingAppearance(ctx, ctx.el.querySelector('.ov-clock-backdrop'));
  ensureDialObserver(ctx, board);
  if (first || !hasCqmin()) measureDial(ctx, board);
  refreshInheritedBackground(ctx);

  const data = faceData(ctx);
  for (const [hand, angle] of Object.entries(data.angles)) {
    if (hand === 'second' && compositor) continue;
    const node = board.querySelector(`.ov-clock-${hand}`);
    const transform = `rotate(${angle}deg)`;
    if (node && node.style.transform !== transform) node.style.transform = transform;
  }
  if (compositor) {
    // A fade tick or a minute roll must not restart the sweep: rewriting the delay snaps the hand.
    if (first || wakeSweep) syncSecondHand(ctx, board);
  } else {
    const second = board.querySelector('.ov-clock-second');
    if (second) {
      second.removeAttribute('data-sweep');
      second.style.removeProperty('--clock-second-delay');
    }
  }
  for (const [part, value] of Object.entries(data.digital || {})) {
    if (part === 'text' || (part === 'second' && !ctx.options.show_seconds)) continue;
    const node = board.querySelector(`.ov-clock-digital-${part}`);
    if (node && node.textContent !== value) node.textContent = value;
  }
  const date = board.querySelector('.ov-clock-date');
  if (date && date.textContent !== data.date) date.textContent = data.date;
  const label = `${data.time}, ${data.date}`;
  if (board.getAttribute('aria-label') !== label) board.setAttribute('aria-label', label);

  ctx.store.set('minute', minute);
  ctx.store.set('board', board);
}

export default defineOverview({
  type: 'clock',
  label: 'Clock',
  order: 100,
  entity: 'none',
  strings,
  options: {
    face: {
      type: 'enum',
      values: ['bold', 'sculpted', 'digital', 'digital_stacked'],
      default: 'bold'
    },
    use_dashboard_background: {type: 'boolean'},
    background_color: {type: 'colour', when: (data) => data.use_dashboard_background === false},
    second_color: {type: 'colour', default: '#b9edc7'},
    show_seconds: {type: 'boolean', default: true},
    show_date: {type: 'boolean', default: true}
  },
  editor: {toForm: clockFormData},
  render(ctx) {
    const {face, show_date: date, show_seconds: seconds} = ctx.options;
    const palette = clockPalette(ctx.options.background_color, face);
    const data = faceData(ctx);
    if (isDigital(face)) {
      const {hour, minute, second, period} = data.digital;
      return `<div class="ov-scene ov-clock-scene"><div class="ov-clock-backdrop" data-face="${face}" data-seconds="${seconds}" data-date="${date}" style="--clock-bg:${palette.background};--clock-ink:${palette.ink};--clock-second:${clockPalette(ctx.options.second_color).background}"><div class="ov-clock-board" role="img" aria-label="${ctx.esc(`${data.time}, ${data.date}`)}"><div class="ov-clock-digital" aria-hidden="true"><div class="ov-clock-digital-time"><span class="ov-clock-digital-hour">${ctx.esc(hour)}</span><span class="ov-clock-digital-separator">:</span><span class="ov-clock-digital-minute">${ctx.esc(minute)}</span></div><div class="ov-clock-digital-meta"><span class="ov-clock-digital-period">${ctx.esc(period)}</span><span class="ov-clock-digital-second">${ctx.esc(second)}</span></div></div><span class="ov-clock-date" aria-hidden="true">${ctx.esc(data.date)}</span></div></div></div>`;
    }
    const numbers = face === 'bold' ? [12, 3, 6, 9] : Array.from({length: 12}, (_, i) => i + 1);
    const numerals = numbers
      .map((n) => {
        const angle = ((n % 12) * Math.PI) / 6;
        const radius = face === 'bold' ? (n === 12 || n === 6 ? 0.255 : 0.325) : 0.385;
        const x = (50 + Math.sin(angle) * radius * 100).toFixed(3);
        const y = (50 - Math.cos(angle) * radius * 100).toFixed(3);
        const turn = face === 'sculpted' ? (n === 12 ? 0 : n * 30) : 0;
        return `<span class="ov-clock-numeral ov-clock-n${n}" style="left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${turn}deg)" aria-hidden="true">${ctx.esc(ctx.formatNumber(n))}</span>`;
      })
      .join('');
    return `<div class="ov-scene ov-clock-scene"><div class="ov-clock-backdrop" data-face="${face}" data-seconds="${seconds}" data-date="${date}" style="--clock-bg:${palette.background};--clock-ink:${palette.ink};--clock-hand:${palette.hand};--clock-second:${clockPalette(ctx.options.second_color).background}"><div class="ov-clock-board" role="img" aria-label="${ctx.esc(`${data.time}, ${data.date}`)}">${numerals}<i class="ov-clock-hour ov-clock-hand" style="transform:rotate(${data.angles.hour}deg)" aria-hidden="true"></i><i class="ov-clock-minute ov-clock-hand" style="transform:rotate(${data.angles.minute}deg)" aria-hidden="true"></i><i class="ov-clock-second ov-clock-hand" style="transform:rotate(${data.angles.second}deg)" aria-hidden="true"></i><i class="ov-clock-pin" aria-hidden="true"></i><span class="ov-clock-date" aria-hidden="true">${ctx.esc(data.date)}</span></div></div></div>`;
  },
  afterRender(ctx) {
    // A structural patch (wallpaper, face, colours) must reprime even when the board node is reused.
    ctx.store.delete('board');
    refresh(ctx);
  },
  tick: {every: 1000, run: refresh},
  tap: {card: 'open'}
});
