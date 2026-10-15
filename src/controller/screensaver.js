// Overview host for the controller: the screensaver layer and the data leases of overview cards.
// A mixin of plain methods (see core/mixin.js), attached to HouseViewCard.prototype. No kind names in here.
//
// The controller shell makes exactly five calls into it (docs/overview-api.md):
//   _screensaverSetConfig  after setConfig has validated and stored the config
//   _screensaverConnect    connectedCallback
//   _screensaverDisconnect disconnectedCallback (also called by _screensaverSetConfig)
//   _screensaverHass       the hass setter, last statement
//   _screensaverSync       the end of _renderWidgets
// With no `screensaver` key `_screensaver` is null: nothing is allocated, listened to or inserted.
//
// Two kinds of entry share the one layer (docs/overview-api.md). An `idle` entry starts after idle_timeout seconds
// without a touch and takes part in the round robin. An `event` entry (`overview.activation === 'event'`) is never
// started by idle time: `_screensaverEvents` evaluates its autoShow on every hass update and on the shared tick and
// shows it through the same idle manager (`ss.forced`), replacing whatever is on screen.
//
// Entries come from two places (8.10). Explicit ones are the `screensaver:` block. Implicit ones are added by
// normalizeScreensaver for the dashboard's own timer and media_player widgets (timer_display, music_screensaver).
// Precedence on screen: event overlays above idle entries; among idle entries an activation shows the highest
// `priority` of the ELIGIBLE ones (`_screensaverPick`), equal priorities by the round robin cursor.
import {DEFAULT_IDLE_SECONDS, createIdleManager} from '../core/idle.js';
import {contextFor, layerMarkup, resolveOptions} from '../core/define-overview.js';
import {createOverviewSession} from '../core/overview-session.js';
import {getOverview, normalizeScreensaver, pickEntry} from '../core/overview-registry.js';
import {getWidget} from '../core/registry.js';
import {t} from '../core/i18n.js';
import * as ticker from '../core/ticker.js';

// The ONE shared 1 s ticker. Adapter over core/ticker.js: subscribe(fn) -> token, unsubscribe(token).
const subscribeTick = (fn) => {
  const token = ticker.subscribe(fn);
  return () => ticker.unsubscribe(token);
};

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
export const PREVIEW_RESHOW_SECONDS = 5; // preview: true shows again this long after a dismissal
export const FADE_OUT_MS = 250; // keep in step with .hv-screensaver[data-state='leaving'] in overview.css
export const GUARD_MS = 150; // reduced motion: the layer still stays this long so the tap's click lands on it
export const SWALLOW_MS = 350; // extra click suppression after a tap-wake (same seam as a swipe)
export const COVER_AFTER_MS = 500; // the fade-in is 350 ms: from then on the layer is opaque and hides the carousel

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Home Assistant's edit-mode wrappers and previews. Internal element names: feature-detected, never required. */
const EDIT_HOSTS = new Set(['hui-card-options', 'hui-card-preview', 'hui-card-edit-mode']);

/**
 * Best-effort "is the HA dashboard in edit mode (or an editor preview)?". It walks up through shadow roots.
 * It fails open: an undetected edit mode lets the screensaver run, and the first tap only wakes it.
 * `enabled: false` is the escape hatch. HA internals: re-check after major frontend releases.
 * @param {Element} host
 */
export function isEditMode(host) {
  for (let node = host; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (EDIT_HOSTS.has(node.localName)) return true;
    if (node.lovelace?.editMode === true || node.editMode === true || node.preview === true) {
      return true;
    }
  }
  return false;
}

/** Cheap "did anything this overview reads change?" key. Real HA: object references; mock hass: JSON. */
function signatureOf(hass, entry) {
  const ids = [entry.options.entity, ...(entry.overview.watch?.(entry.options) ?? [])].filter(
    Boolean
  );
  const read = (id) => (hass.connection ? hass.states?.[id] : JSON.stringify(hass.states?.[id]));
  return [
    ...ids.map(read),
    hass.locale?.language,
    hass.locale?.time_format,
    hass.locale?.time_zone,
    hass.config?.unit_system?.temperature
  ];
}
const sameSignature = (a, b) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/** The identity of an event entry across setConfig calls: the same overview on the same entity is the same entry. */
const eventKey = (entry) => `${entry.type}|${entry.options.entity ?? ''}`;

/**
 * Per-entry bookkeeping of the enabled event entries; an empty Map when there are none.
 * `last` is the previous predicate value, `pending` = wants to show, `parked` = was replaced by (or skipped for)
 * another event layer and not dismissed, so it comes back when that layer is gone. `previous` is the old Map when
 * setConfig runs again: an entry that is still configured keeps what it knew, so a dismissal survives a config
 * reload (the same timer, still running, must not pop up again) and an undismissed layer comes back.
 */
function eventStates(entries, previous) {
  const old = new Map();
  for (const [entry, state] of previous ?? []) old.set(eventKey(entry), state);
  return new Map(
    entries
      .filter((e) => e.enabled && e.event)
      .map((e) => {
        const kept = old.get(eventKey(e));
        old.delete(eventKey(e)); // two entries for one timer do not share one state
        return [
          e,
          kept
            ? {...kept, sig: null, reshowAt: null}
            : {last: false, pending: false, parked: false, sig: null, reshowAt: null}
        ];
      })
  );
}

export const screensaverMixin = {
  // ---- integration point 1: setConfig (after validation and after this._config is assigned) ----
  _screensaverSetConfig(config) {
    this._screensaverDisconnect();
    const previous = this._screensaver?.events; // what the old entries knew (see eventStates)
    const entries = normalizeScreensaver(config); // validate.js already threw on bad input
    this._screensaver = entries.some((e) => e.enabled)
      ? {
          entries,
          cursor: 0,
          idle: null,
          sessions: new Map(),
          active: null,
          leaving: null,
          events: eventStates(entries, previous), // entry -> {last, pending, parked, sig, reshowAt}; empty without event entries
          forced: null // the event entry `_screensaverShow` must show instead of the next idle entry
        }
      : null; // no screensaver (or all disabled): nothing is allocated, nothing is rendered
    if (this._screensaver && this.isConnected) this._screensaverConnect();
  },

  // ---- integration point 2: connectedCallback ----
  _screensaverConnect() {
    this._overviewSync();
    const ss = this._screensaver;
    if (!ss || ss.idle) return;
    ss.idle = createIdleManager({
      subscribe: subscribeTick, // the ONE shared 1 s ticker; no interval of our own
      blocked: () => this._screensaverBlocked(),
      onActivate: () => this._screensaverShow(),
      onDeactivate: (reason) => this._screensaverHide(reason),
      onTick: (now) => {
        if (!ss.active) this._screensaverRetime();
        if (ss.events?.size) this._screensaverEvents(now, true);
        if (ss.active) this._screensaverTick(now);
      },
      timeout: this._screensaverTimeoutNow()
    });
    ss.onActivity = () => ss.idle?.activity();
    ss.onVisibility = () => ss.idle?.visibility(document.hidden);
    for (const type of ACTIVITY_EVENTS) {
      // Capture phase on the shadow root, so native cards that stop propagation still count as activity.
      this.shadowRoot.addEventListener(type, ss.onActivity, {capture: true, passive: true});
    }
    document.addEventListener('visibilitychange', ss.onVisibility);
    for (const entry of ss.entries) {
      if (entry.enabled) ss.sessions.set(entry.index, this._screensaverSession(entry));
    }
    ss.idle.start();
    if (this._screensaverLead()?.preview) ss.idle.activate(); // shows as soon as a hass and a shell exist
    if (ss.events?.size) this._screensaverEvents(Date.now(), true); // a timer that is already running
  },

  // ---- integration point 3: disconnectedCallback (also called by setConfig) ----
  _screensaverDisconnect() {
    const ss = this._screensaver;
    this._overviewDispose();
    if (!ss) return;
    ss.idle?.dispose(); // wake('dispose') removes the layer immediately, then unsubscribes from the ticker
    ss.idle = null;
    if (ss.onActivity) {
      for (const type of ACTIVITY_EVENTS) {
        this.shadowRoot.removeEventListener(type, ss.onActivity, {capture: true});
      }
      document.removeEventListener('visibilitychange', ss.onVisibility);
      ss.onActivity = ss.onVisibility = null;
    }
    for (const session of ss.sessions.values()) session.dispose();
    ss.sessions.clear();
    ss.pendingShow = false;
    this._screensaverRemoveLayer(ss);
  },

  // ---- integration point 4: the hass setter (last statement; independent of the card's own signature) ----
  _screensaverHass() {
    const ss = this._screensaver;
    for (const session of this._overviewSessions?.values() ?? []) session.sync();
    if (!ss?.idle) return;
    for (const session of ss.sessions.values()) session.sync();
    try {
      if (ss.pendingShow) this._screensaverShow();
      else if (ss.active) {
        if (this._screensaverAutoWake(ss.active.entry)) ss.idle.wake('auto');
        else this._screensaverRender(false);
      }
      if (ss.events?.size) this._screensaverEvents(Date.now(), false);
    } catch (error) {
      // A broken overview must never break the card's hass setter.
      console.error('[houseview] screensaver update failed', error);
    }
  },

  // ---- integration point 5: end of _renderWidgets ----
  _screensaverSync() {
    const ss = this._screensaver;
    if (ss) {
      const shell = this.shadowRoot.querySelector('ha-card.shell');
      // The shell was recreated by a render: put the layer back on top of the new one.
      if (ss.active && shell && ss.active.layer.parentNode !== shell) {
        shell.append(ss.active.layer);
        if (ss.active.covered) shell.dataset.covered = ''; // the new shell is covered by the layer too
      }
      if (ss.pendingShow) this._screensaverShow(); // preview: waiting for the first shell
      if (ss.events?.size && ss.idle) this._screensaverEvents(Date.now(), false);
    }
    this._overviewSync();
  },

  // ---- manual open: an overview card's tile shows its full-page layer on a tap (the `overview-open` action) ----

  /**
   * Show the overview of the card tile for `entityId` as a one-off layer, whether or not a screensaver is
   * configured. The entry never auto-starts (idle_timeout 0) and is dropped when the layer is dismissed, so a
   * configured screensaver keeps its own rotation. The layer behaves exactly like the screensaver: the first tap
   * only wakes and nothing underneath is pressed.
   */
  _screensaverOpen(entityId) {
    // An id like `overview:3` names a card of an overview without an entity by its position on the card.
    const byPosition = /^overview:(\d+)$/.exec(entityId || '');
    const widget = byPosition
      ? this._config?.widgets?.[Number(byPosition[1])]
      : this._config?.widgets?.find(
          (w) => w.entity === entityId && getOverview(getWidget(w.type)?.overview)
        );
    if (!widget || !getOverview(getWidget(widget.type)?.overview)) return;
    if (!widget || !this._hass) return;
    const overviewType = getWidget(widget.type).overview;
    const [entry] = normalizeScreensaver({
      screensaver: {
        ...widget,
        type: overviewType,
        enabled: true,
        idle_timeout: 0,
        start_in_edit_mode: true,
        preview: false
      }
    });
    if (!entry) return;
    this._screensaverShowManual(entry);
  },

  /**
   * Open an overview by type (a clock, date or calendar widget asking for the month calendar). The options of an
   * explicit screensaver entry of that type apply; otherwise the defaults.
   */
  _screensaverOpenType(type) {
    if (!this._hass || !getOverview(type) || this._config?.calendar_view === false) return;
    const [entry] = normalizeScreensaver({
      screensaver: {type, enabled: true, idle_timeout: 0, start_in_edit_mode: true, preview: false}
    });
    if (!entry) return;
    const configured = this._screensaver?.entries.find(
      (e) => e.type === type && !e.implicit && !e.manual
    );
    if (configured) entry.options = {...configured.options};
    this._screensaverShowManual(entry);
  },

  /** Show `entry` once, over whatever is showing nothing: it is dropped when the layer goes away. */
  _screensaverShowManual(entry) {
    entry.manual = true;
    entry.event = false; // opened by hand: an idle entry for the rotation bookkeeping, whatever its activation
    let ss = this._screensaver;
    if (ss?.active) return; // already showing something
    if (!ss) {
      ss = this._screensaver = {
        entries: [entry],
        cursor: 0,
        idle: null,
        sessions: new Map(),
        active: null,
        leaving: null,
        transient: true
      };
      if (this.isConnected) this._screensaverConnect();
    } else {
      entry.index = 1000 + ss.entries.length;
      ss.entries.push(entry);
      ss.sessions.set(entry.index, this._screensaverSession(entry));
      ss.cursor = ss.entries.length - 1;
    }
    ss.forced = entry; // shown as asked, whatever the priority and eligibility of the entries around it
    ss.idle?.activate();
  },

  /** A manual entry lives for one showing. Called as the layer goes away. */
  _screensaverDropManual(ss, entry) {
    const at = ss.entries.indexOf(entry);
    if (at < 0) return;
    ss.entries.splice(at, 1);
    ss.sessions.get(entry.index)?.dispose();
    ss.sessions.delete(entry.index);
    ss.cursor = 0;
    if (ss.transient && !ss.entries.length) {
      // Nothing else is configured: take the machinery down again once the fade-out is over.
      setTimeout(() => {
        if (this._screensaver !== ss || ss.entries.length || ss.active) return;
        this._screensaverDisconnect();
        this._screensaver = null;
      }, FADE_OUT_MS + 150);
    }
  },

  // -------------------------------------------------------------------------------------------------

  /**
   * Seconds of idle time before `entry` (the lead entry) starts. 0 = never: there is no idle entry. An implicit entry
   * carries the default, so it never defines a timeout of its own (it only matters when no explicit entry exists).
   */
  _screensaverTimeout(entry) {
    if (!entry) return 0;
    return entry.preview ? PREVIEW_RESHOW_SECONDS : (entry.idleTimeout ?? DEFAULT_IDLE_SECONDS);
  },

  /**
   * The idle timeout right now. Normally the lead entry's. An implicit entry whose overview declares `onPageIdle`
   * (cover art: 5 s) shortens it while its own widget is on the page that is showing and it is eligible (music is
   * playing): that is "show the album art soon after I have stopped touching the music page". An explicit
   * `idle_timeout: 0` (the user switched idle screensavers off) is never overridden.
   */
  _screensaverTimeoutNow() {
    const ss = this._screensaver;
    let seconds = this._screensaverTimeout(this._screensaverLead());
    if (!seconds) return seconds;
    for (const entry of ss.entries) {
      const quick = entry.overview.onPageIdle;
      if (
        entry.implicit &&
        entry.enabled &&
        quick &&
        quick < seconds &&
        this._screensaverEligible(entry)
      ) {
        seconds = quick;
      }
    }
    return seconds;
  },

  /** Re-apply the timeout when the answer changed (music started, the page changed). Cheap: a few comparisons. */
  _screensaverRetime() {
    const ss = this._screensaver;
    if (!ss?.idle) return;
    const seconds = this._screensaverTimeoutNow();
    if (seconds !== ss.timeoutNow) {
      ss.timeoutNow = seconds;
      ss.idle.configure({timeout: seconds});
    }
  },

  /** Is a widget of this entry's entity on the page that is showing? */
  _screensaverOnPage(entry) {
    const screen = this._screens?.[this._pageIndex];
    const id = entry.options?.entity;
    return !!screen?.placements.some((p) => this._config?.widgets?.[p.index]?.entity === id);
  },

  /**
   * The entry that stands for idle time itself: the explicit idle entry that is next (priority, then the cursor), else
   * an implicit one. Its timeout is the idle timeout, its `preview` starts the preview at connect, and it decides the
   * blockers while nothing is on screen. Eligibility is NOT asked here (this runs every second); the entry that is
   * actually shown is picked by `_screensaverPick` at the moment of activation.
   */
  _screensaverLead() {
    const ss = this._screensaver;
    return (
      pickEntry(ss.entries, ss.cursor, {explicitOnly: true}).entry ??
      pickEntry(ss.entries, ss.cursor).entry
    );
  },

  /** Is `entry` in the running for this activation? No `eligible` = always; a throwing one counts as not eligible. */
  _screensaverEligible(entry) {
    // Album art is for the music page: an implicit entry with `onPageIdle` only runs while its widget is on screen.
    if (entry.implicit && entry.overview.onPageIdle && !this._screensaverOnPage(entry))
      return false;
    const eligible = entry.overview.eligible;
    if (!eligible || entry.preview) return true; // a preview is shown to be looked at, whatever the state
    try {
      return !!eligible(this._screensaverContext(entry));
    } catch (error) {
      console.error('[houseview] overview eligible failed', error);
      return false;
    }
  },

  /**
   * The idle entry an activation shows: of the enabled idle entries that are eligible (and not held back by edit
   * mode), the highest priority; equal priorities by the round robin cursor. Nothing eligible = undefined.
   */
  _screensaverPick() {
    const ss = this._screensaver;
    return pickEntry(ss.entries, ss.cursor, {
      eligible: (entry) =>
        !(!entry.startInEditMode && !entry.preview && isEditMode(this)) &&
        this._screensaverEligible(entry)
    });
  },

  /** True while something else owns the screen. Blockers count as activity (the timeout restarts afterwards). */
  _screensaverBlocked() {
    const ss = this._screensaver;
    if (!this._hass || !this.isConnected || !ss) return true;
    // While a layer is up it is the entry that matters (its pending-call and edit-mode rules), not the next idle one.
    return this._screensaverBlockedFor(ss.active?.entry ?? this._screensaverLead());
  },

  /**
   * The blockers for showing (or keeping) `entry`: the gallery, the timer alarm, a pending service call and edit mode.
   * An event entry ignores the pending call: starting a timer from a HouseView tile must be able to trigger it.
   */
  _screensaverBlockedFor(entry) {
    if (this._galleryOpen || this._alarm) return true;
    if (this._pending?.size && !entry?.event) return true;
    return !!entry && !entry.startInEditMode && !entry.preview && isEditMode(this);
  },

  /** Does the overview want its layer gone? A preview (idle or event) ignores it: it has to stay up to be looked at. */
  _screensaverAutoWake(entry) {
    if (entry.preview) return false;
    return !!entry.overview.autoWake?.(this._screensaverContext(entry));
  },

  // ---- event overviews (activation: 'event'): shown by their own autoShow instead of by idle time ----

  /**
   * Evaluate every enabled event entry. Called from the hass setter (`fromTick` false: an entry is only re-evaluated
   * when something it reads changed), from the shared tick and at connect (`fromTick` true: always, for time based
   * predicates). `state.last` is the previous predicate value, so only a false -> true edge arms `state.pending`; a
   * pending entry shows as soon as nothing blocks and then stays away until the predicate has gone false and true
   * again (a dismissal never re-arms it). The first pending entry wins and replaces whatever is on screen.
   */
  _screensaverEvents(now = Date.now(), fromTick = false) {
    const ss = this._screensaver;
    if (!ss?.idle || !ss.events?.size || !this._hass) return;
    try {
      const shown = ss.active?.entry;
      if (fromTick && shown?.event && this._screensaverAutoWake(shown)) ss.idle.wake('auto');
      let first = null;
      for (const [entry, state] of ss.events) {
        const sig = signatureOf(this._hass, entry);
        if (fromTick || !sameSignature(state.sig, sig)) {
          state.sig = sig;
          this._screensaverEdge(entry, state, now);
        }
        if (state.pending && ss.active?.entry === entry)
          state.pending = false; // already on screen
        else if (state.pending) first ||= entry;
      }
      if (!first || this._screensaverEventBlocked(first)) return;
      if (!this.shadowRoot.querySelector('ha-card.shell')) return; // a render is owed: _screensaverSync retries
      for (const [entry, state] of ss.events) {
        // `first` is shown now; any other pending entry would be replaced at once: park it, it comes back when
        // `first` is gone (it was not dismissed, so it must not be lost).
        if (state.pending && entry !== first) state.parked = true;
        state.pending = false;
      }
      this._screensaverEventShow(first);
    } catch (error) {
      // A broken overview must never break the card's hass setter or the shared ticker.
      console.error('[houseview] screensaver event failed', error);
    }
  },

  /** One predicate evaluation: arm `pending` on the false -> true edge, disarm when it goes false. */
  _screensaverEdge(entry, state, now) {
    let wanted = entry.preview; // an event preview is shown whatever the predicate says
    if (!wanted) {
      try {
        wanted = !!entry.overview.autoShow(this._screensaverContext(entry));
      } catch (error) {
        console.error('[houseview] overview autoShow failed', error);
      }
    }
    if (wanted && !state.last) state.pending = true;
    else if (!wanted) state.pending = false;
    if (state.reshowAt != null && now >= state.reshowAt && wanted) {
      state.reshowAt = null; // preview: five seconds after a dismissal it comes back
      state.pending = true;
    }
    state.last = wanted;
  },

  /** Event blockers: the common ones, plus a hidden page (nothing is shown to nobody). */
  _screensaverEventBlocked(entry) {
    return (
      !this._hass || !this.isConnected || !!document.hidden || this._screensaverBlockedFor(entry)
    );
  },

  /** Show `entry` through the idle manager, bypassing its timing and the round-robin cursor. */
  _screensaverEventShow(entry) {
    const ss = this._screensaver;
    const replaced = ss.active?.entry;
    // An event layer that gives way is not dismissed: park it, so it comes back when this one is gone.
    if (replaced?.event && replaced !== entry) ss.events.get(replaced).parked = true;
    if (ss.idle.active) ss.idle.wake('replace'); // an idle screensaver (or another event layer) gives way at once
    ss.events.get(entry).parked = false;
    ss.forced = entry;
    try {
      ss.idle.activate();
    } catch (error) {
      ss.forced = null;
      ss.idle.wake('api');
      throw error;
    }
  },

  _screensaverSession(entry) {
    return createOverviewSession({
      overview: entry.overview,
      options: entry.options,
      getHass: () => this._hass,
      onChange: () => this._screensaverRender(true, entry)
    });
  },

  _screensaverContext(entry) {
    return contextFor(entry.overview, {
      hass: this._hass,
      config: this._config,
      raw: entry.options,
      mode: 'screensaver'
    });
  },

  _screensaverShow() {
    const ss = this._screensaver;
    const shell = this.shadowRoot.querySelector('ha-card.shell');
    if (!ss || !this._hass || !shell) {
      if (ss) ss.pendingShow = true; // no hass or shell yet: show on the first update
      return;
    }
    ss.pendingShow = false;
    // An event entry (or one opened by hand) is shown as it was asked for: the cursor is not moved by it.
    const forced = ss.forced;
    ss.forced = null;
    const {entry, next} = forced ? {entry: forced, next: ss.cursor} : this._screensaverPick();
    if (!entry) return void ss.idle.wake('api'); // nothing eligible: the idle timeout starts over
    ss.cursor = next;
    this._screensaverRemoveLayer(ss); // a layer still fading out from the previous dismissal

    const scene = entry.overview.render(this._screensaverContext(entry), 'screensaver');
    const template = document.createElement('template');
    template.innerHTML = layerMarkup(entry.overview, scene, {
      label: t(this._hass, `${entry.overview.type}_overview.label`),
      dismiss: t(this._hass, 'screensaver.dismiss')
    });
    const layer = template.content.firstElementChild;
    this._screensaverBind(layer);
    const focusReturn = this.shadowRoot.activeElement;
    shell.append(layer); // an overlay: nothing else in the shell is touched, re-rendered or made inert
    void layer.offsetWidth; // commit the opacity:0 start state, then fade in
    layer.dataset.state = 'on';
    if (focusReturn) layer.querySelector('.ov-dismiss').focus({preventScroll: true});
    ss.active = {
      entry,
      layer,
      focusReturn,
      sig: signatureOf(this._hass, entry),
      lastTick: 0,
      shownAt: Date.now(),
      covered: false,
      store: new Map()
    };
    this._screensaverAfterRender(); // an overview that fixes up its DOM does it before the first second is over
    ss.idle.configure({timeout: this._screensaverTimeoutNow()});
  },

  /** The layer swallows every gesture: the first tap only wakes. Nothing reaches the controller's listeners. */
  _screensaverBind(layer) {
    const stop = (e) => e.stopPropagation();
    const wake = (reason) => this._screensaver?.idle?.wake(reason);
    layer.addEventListener('pointerdown', stop);
    layer.addEventListener('pointercancel', stop);
    layer.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      wake('tap'); // a swipe wakes too; the layer stays for a moment so the trailing click is swallowed
    });
    layer.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      wake('tap');
    });
    layer.addEventListener('keydown', (e) => {
      e.stopPropagation(); // arrow keys must not turn the page underneath
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        wake('key');
      } else if (e.key === 'Tab') {
        e.preventDefault(); // the dismiss button is the only stop
      }
    });
  },

  /** idle.onDeactivate: reasons are 'tap' | 'key' | 'blocked' | 'auto' | 'api' | 'hidden' | 'dispose'. */
  _screensaverHide(reason) {
    const ss = this._screensaver;
    if (!ss) return;
    ss.pendingShow = false; // deactivated before the first shell/hass arrived: nothing to show any more
    const active = ss.active;
    if (!active) return;
    ss.active = null;
    if (active.entry.manual) this._screensaverDropManual(ss, active.entry);
    const event = ss.events?.get(active.entry);
    if (event) {
      if (reason === 'blocked' || reason === 'hidden' || reason === 'dispose')
        event.pending = event.last; // still wanted, never dismissed: back when nothing blocks (or the card is back)
      else if (active.entry.preview && reason !== 'replace') {
        event.reshowAt = Date.now() + PREVIEW_RESHOW_SECONDS * 1000;
      }
      this._screensaverUnpark(ss, reason);
    }
    // A teardown, or a layer that another one replaces right now, has nothing to catch up.
    this._screensaverUncover(active, reason !== 'dispose' && reason !== 'replace');
    ss.idle.configure({timeout: this._screensaverTimeoutNow()});
    if (reason === 'tap' || reason === 'key') {
      this._suppressClickUntil = Math.max(this._suppressClickUntil || 0, Date.now() + SWALLOW_MS);
    }
    if (reason === 'hidden' || reason === 'dispose' || reason === 'replace') {
      return void this._screensaverRemoveLayer(ss, active);
    }
    active.layer.dataset.state = 'leaving'; // stays in the DOM, still catching taps, until it has faded
    ss.leaving = {
      ...active,
      timer: setTimeout(
        () => this._screensaverRemoveLayer(ss),
        reducedMotion() || this._perf === 'lite' ? GUARD_MS : FADE_OUT_MS + 50
      )
    };
  },

  /**
   * An event layer is gone: bring back the entries it had replaced. Not while another event layer takes its place
   * ('replace': they stay parked), and not after a tap or key, which asked for the page underneath: those are dropped.
   */
  _screensaverUnpark(ss, reason) {
    if (reason === 'replace') return;
    const dismissed = reason === 'tap' || reason === 'key';
    for (const state of ss.events.values()) {
      if (!state.parked) continue;
      state.parked = false;
      if (!dismissed) state.pending = state.last;
    }
  },

  _screensaverRemoveLayer(ss, target = ss.leaving || ss.active) {
    if (!target) return;
    if (ss.leaving?.layer === target.layer) {
      clearTimeout(ss.leaving.timer);
      ss.leaving = null;
    }
    target.layer.remove();
    if (target.focusReturn?.isConnected) target.focusReturn.focus({preventScroll: true});
  },

  /** Patch the scene in place (never the carousel). `force` = data changed, otherwise only when a watched state did. */
  _screensaverRender(force, entry) {
    const active = this._screensaver?.active;
    if (!active || (entry && entry !== active.entry)) return;
    const sig = signatureOf(this._hass, active.entry);
    if (!force && sameSignature(active.sig, sig)) return;
    active.sig = sig;
    const scene = active.entry.overview.render(
      this._screensaverContext(active.entry),
      'screensaver'
    );
    const current = active.layer.querySelector('.ov');
    const next = current.cloneNode(false);
    next.innerHTML = scene;
    this._patchNode(current, next, true); // the controller's own DOM patcher: keeps focus, no flicker
    this._screensaverAfterRender();
  },

  /** The overview's `afterRender` hook for the layer that is up (the same one a card runs after each render). */
  _screensaverAfterRender() {
    const active = this._screensaver?.active;
    const hook = active?.entry.overview.afterRender;
    if (!hook) return;
    try {
      hook({
        ...this._screensaverContext(active.entry),
        el: active.layer.querySelector('.ov'),
        requestRender: () => this._screensaverRender(true),
        store: active.store
      });
    } catch (error) {
      console.error('[houseview] overview afterRender failed', error);
    }
  },

  /**
   * Runs on the shared ticker while a layer is up. Two jobs: once the fade-in is over the layer hides the carousel
   * underneath (`_screensaverCover`), and the overview's `tick` hook runs when it is due. A hook with
   * `every >= 60000` and `align: 'minute'` runs when the wall-clock minute changes instead of 60 s after its last run
   * (the weather clock shows hours and minutes: no work for the 59 other seconds).
   */
  _screensaverTick(now) {
    const active = this._screensaver?.active;
    if (!active) return;
    if (!active.covered && now - active.shownAt >= COVER_AFTER_MS) this._screensaverCover(active);
    const tick = active.entry.overview.tick;
    if (!tick) return;
    const due =
      tick.align === 'minute'
        ? Math.floor(now / 60000) !== Math.floor(active.lastTick / 60000)
        : now - active.lastTick >= tick.every;
    if (!due) return;
    active.lastTick = now;
    try {
      tick.run({
        ...this._screensaverContext(active.entry),
        el: active.layer.querySelector('.ov'),
        requestRender: () => this._screensaverRender(true),
        store: active.store
      });
    } catch (error) {
      console.error('[houseview] overview tick failed', error);
    }
  },

  /** True while the layer is opaque over the carousel: nothing under it is rendered, updated or polled. */
  _screensaverCovered() {
    return !!this._screensaver?.active?.covered;
  },

  /** The layer is fully opaque: hide what is underneath (visibility, see styles/performance) and stop its work. */
  _screensaverCover(active) {
    const shell = this.shadowRoot.querySelector('ha-card.shell');
    if (!shell || active.layer.parentNode !== shell) return;
    active.covered = true;
    shell.dataset.covered = '';
  },

  /** Wake: show the carousel again and catch it up with what it missed (`_resumeAfterCover`, controller/hooks.js). */
  _screensaverUncover(active, resume = true) {
    if (!active.covered) return;
    active.covered = false;
    const shell = this.shadowRoot.querySelector('ha-card.shell');
    if (shell) delete shell.dataset.covered;
    if (resume) this._resumeAfterCover?.();
  },

  // ---- card-mode overviews: only their data leases live here (render/tick/afterRender are the derived widget's) ----

  _overviewSync() {
    if (!this.isConnected || !this._config?.widgets) return;
    const wanted = new Map();
    for (const index of this._renderedCards?.keys() ?? []) {
      const widget = this._config.widgets[index];
      const overview = widget && getOverview(getWidget(widget.type)?.overview);
      if (overview) wanted.set(index, {overview, options: resolveOptions(overview, widget)});
    }
    if (!wanted.size && !this._overviewSessions?.size) return; // nothing to lease, nothing allocated
    const sessions = (this._overviewSessions ||= new Map());
    for (const [index, session] of sessions) {
      if (!wanted.has(index)) {
        session.dispose();
        sessions.delete(index);
      }
    }
    for (const [index, {overview, options}] of wanted) {
      const session =
        sessions.get(index) ??
        createOverviewSession({
          overview,
          options,
          getHass: () => this._hass,
          onChange: () => this._renderedCards.get(index)?.update()
        });
      sessions.set(index, session);
      session.setOptions(options);
    }
  },

  _overviewDispose() {
    for (const session of this._overviewSessions?.values() ?? []) session.dispose();
    this._overviewSessions?.clear();
  }
};
