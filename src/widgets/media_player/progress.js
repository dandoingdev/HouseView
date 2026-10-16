// Media progress and seeking share the widget's normal guarded value-action queue.
export const SEEK = 2;
const active = (state) => ['playing', 'paused'].includes(state?.state);
export const canSeek = (state) =>
  active(state) &&
  !!(state.attributes?.supported_features & SEEK) &&
  Number.isFinite(state.attributes?.media_duration) &&
  state.attributes.media_duration >= 1;

export function clockText(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** HA reports a position at a timestamp; playing tracks advance between updates. */
export function progressOf(ctx) {
  const {
    media_duration: duration,
    media_position: reported,
    media_position_updated_at: at
  } = ctx.attrs;
  if (!ctx.ok || !ctx.num(duration) || duration <= 0) return null;
  let position = ctx.num(reported) ? reported : 0;
  if (ctx.state?.state === 'playing' && at) {
    const since = ctx.time(at);
    if (!Number.isNaN(since)) position += Math.max(0, (ctx.now() - since) / 1000);
  }
  return {position: Math.min(duration, Math.max(0, position)), duration};
}

const mediaKey = (attrs) =>
  JSON.stringify([
    attrs.media_content_id,
    attrs.media_title,
    attrs.media_album_name,
    attrs.media_track,
    attrs.media_duration
  ]);

export function progressRow(ctx) {
  const progress = progressOf(ctx);
  const seekable = ctx.ok && canSeek(ctx.state);
  const label = ctx.esc(ctx.t('media_player.progress'));
  const fraction = progress ? progress.position / progress.duration : 0;
  return `<div class="mc-progress${seekable ? ' mc-seekable' : ''}" style="--seek-position:${fraction * 100}%"${progress && !seekable ? ` role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${Math.round(progress.duration)}" aria-valuenow="${Math.round(progress.position)}"` : !progress ? ' aria-hidden="true"' : ''}>
    <i class="mc-track"><b class="mc-fill" style="transform:scaleX(${fraction.toFixed(4)})"></b></i>
    <input type="range" class="mc-seek" min="0" max="${Math.max(1, Math.floor(progress?.duration || 0))}" step="1" value="${Math.round(progress?.position || 0)}" aria-label="${label}" data-value-action="media-player-seek-" data-value-context="${ctx.esc(mediaKey(ctx.attrs))}" data-entity="${ctx.esc(ctx.entityId)}"${seekable ? '' : ' disabled aria-hidden="true"'}>
    <span class="mc-elapsed">${progress ? clockText(progress.position) : ''}</span>
    <span class="mc-remaining">${progress ? '-' + clockText(progress.duration - progress.position) : ''}</span></div>`;
}

/** Paint local feedback while dragging; only commit the final value, never a stale track's position. */
export function bindProgress(ctx) {
  const input = ctx.el?.querySelector('.mc-seek');
  if (!input) return;
  const control = input.closest('.mc-progress');
  let local = ctx.store.get('seek');
  if (!local || local.input !== input) {
    local = {input, pointer: null, ctx, key: mediaKey(ctx.attrs), optimistic: null};
    ctx.store.set('seek', local);
    const paint = () => paintProgress(local.ctx);
    const restore = () => {
      const pointer = local.pointer;
      local.pointer = null;
      local.optimistic = local.before?.optimistic || null;
      if (pointer != null && control.hasPointerCapture(pointer))
        control.releasePointerCapture(pointer);
      paint();
    };
    local.cancel = restore;
    const update = (event) => {
      const rect = input.getBoundingClientRect();
      if (!rect.width) return;
      local.value = Math.round(
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * Number(input.max)
      );
      input.value = String(local.value);
      paint();
    };
    control.addEventListener('pointerdown', (event) => {
      if (input.disabled) return;
      event.stopPropagation();
      if (event.isPrimary === false) {
        if (local.pointer != null) restore();
        return;
      }
      if (event.button !== 0 || local.pointer !== null) return;
      event.preventDefault();
      input.focus({preventScroll: true});
      local.before = {value: Math.round(local.value), optimistic: local.optimistic};
      local.pointer = event.pointerId;
      control.setPointerCapture(event.pointerId);
      update(event);
    });
    control.addEventListener('pointermove', (event) => {
      if (local.pointer !== event.pointerId || input.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      update(event);
    });
    const finish = (event, cancelled) => {
      if (local.pointer !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (cancelled || input.disabled || !canSeek(local.ctx.state)) {
        restore();
        return;
      }
      update(event);
      local.pointer = null;
      if (control.hasPointerCapture(event.pointerId))
        control.releasePointerCapture(event.pointerId);
      if (local.value !== local.before.value)
        input.dispatchEvent(new Event('change', {bubbles: true}));
      else paint();
    };
    control.addEventListener('pointerup', (event) => finish(event, false));
    control.addEventListener('pointercancel', (event) => finish(event, true));
    control.addEventListener('lostpointercapture', (event) => finish(event, true));
    input.addEventListener('input', () => {
      local.value = Number(input.value);
      local.keyboard = true;
      paint();
    });
    input.addEventListener('change', (event) => {
      local.keyboard = false;
      if (input.disabled || !canSeek(local.ctx.state)) {
        event.stopPropagation();
        paint();
        return;
      }
      local.optimistic = {position: Number(input.value), at: local.ctx.now()};
      paint();
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape' && local.pointer !== null) {
        event.preventDefault();
        restore();
      }
    });
  }
  local.ctx = ctx;
  const key = mediaKey(ctx.attrs);
  if (local.key !== key || !canSeek(ctx.state)) {
    local.key = key;
    local.optimistic = null;
    local.before = null;
    local.keyboard = false;
    if (local.pointer !== null) local.cancel();
  }
  paintProgress(ctx);
}

export function paintProgress(ctx) {
  const el = ctx.el;
  const bar = el?.querySelector('.mc-progress');
  if (!bar) return;
  const local = ctx.store.get('seek');
  const progress = progressOf(ctx);
  if (local?.input === bar.querySelector('.mc-seek')) {
    local.ctx = ctx;
    if (progress && local.pointer === null && !local.keyboard) {
      const optimistic = local.optimistic;
      const expected = optimistic
        ? Math.min(
            progress.duration,
            optimistic.position +
              (ctx.state.state === 'playing' ? Math.max(0, (ctx.now() - optimistic.at) / 1000) : 0)
          )
        : null;
      if (
        optimistic &&
        !ctx.isPending(ctx.entityId) &&
        (Math.abs(progress.position - expected) < 1 || ctx.now() - optimistic.at > 5000)
      )
        local.optimistic = null;
      local.value = local.optimistic ? expected : progress.position;
    }
  }
  const position = progress
    ? Math.max(0, Math.min(progress.duration, local?.value ?? progress.position))
    : 0;
  const set = (selector, text) => {
    const node = bar.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  };
  set('.mc-elapsed', progress ? clockText(position) : '');
  set('.mc-remaining', progress ? '-' + clockText(progress.duration - position) : '');
  const fraction = progress ? position / progress.duration : 0;
  const offset = `${fraction * 100}%`;
  if (bar.style.getPropertyValue('--seek-position') !== offset)
    bar.style.setProperty('--seek-position', offset);
  const fill = bar.querySelector('.mc-fill');
  const transform = `scaleX(${fraction.toFixed(4)})`;
  if (fill.style.transform !== transform) fill.style.transform = transform;
  if (bar.getAttribute('role') === 'progressbar')
    bar.setAttribute('aria-valuenow', String(Math.round(position)));
  const input = bar.querySelector('.mc-seek');
  const value = String(Math.round(position));
  if (input.value !== value) input.value = value;
  if (progress) {
    const label = ctx.t('media_player.position_of', {
      position: clockText(position),
      duration: clockText(progress.duration)
    });
    if (input.getAttribute('aria-valuetext') !== label) input.setAttribute('aria-valuetext', label);
  }
}
