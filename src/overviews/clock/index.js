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

/** The square dial stays centred on tablets; its background fills the entire screen. */
function refresh(ctx) {
  if (!ctx.el) return;
  const board = ctx.el.querySelector('.ov-clock-board');
  if (!board) return;
  if (!CSS.supports('width', '1cqmin')) {
    const target = ctx.el.closest('.hv-screensaver')?.parentElement || ctx.el;
    const rect = target.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    if (side > 0 && board.style.getPropertyValue('--clock-size') !== `${side}px`) {
      board.style.setProperty('--clock-size', `${side}px`);
      board.style.width = `${side}px`;
      board.style.height = `${side}px`;
    }
  }
  if (inheritsBackground(ctx.options)) {
    const shell = ctx.el.closest('.shell');
    if (shell) {
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
  }
  const data = faceData(ctx);
  for (const [hand, angle] of Object.entries(data.angles)) {
    const node = board.querySelector(`.ov-clock-${hand}`);
    const transform = `rotate(${angle}deg)`;
    if (node && node.style.transform !== transform) node.style.transform = transform;
  }
  for (const [part, value] of Object.entries(data.digital || {})) {
    if (part === 'text' || (part === 'second' && !ctx.options.show_seconds)) continue;
    const node = board.querySelector(`.ov-clock-digital-${part}`);
    if (node && node.textContent !== value) node.textContent = value;
  }
  const date = board.querySelector('.ov-clock-date');
  if (date.textContent !== data.date) date.textContent = data.date;
  const label = `${data.time}, ${data.date}`;
  if (board.getAttribute('aria-label') !== label) board.setAttribute('aria-label', label);
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
  afterRender: refresh,
  tick: {every: 1000, run: refresh},
  tap: {card: 'open'}
});
