// The generic host for widget `extension` objects (docs/widget-api.md): card-level features that are bigger
// than one tile, such as the camera gallery overlay and the timer alarm banner.
//
// The controller never names the widget that owns an extension. It asks the registry for every extension and
// calls the optional members: state, shellClasses, overlay, retain, afterRender, tick, blocksNavigation, onKeydown,
// onPointerDown, dispose, and the `compat` accessors that keep private names (_galleryOpen,
// _galleryCamera, _refreshGallery, _alarm, _audio, _timerStates) working on the card.
//
// Every call is isolated (hooks.guarded): a broken extension is logged once and cannot stop a render.
import {createExtensionContext} from '../core/context.js';
import {extensions, getWidget} from '../core/registry.js';
import {guarded} from './hooks.js';

const ELEMENT_NODE = 1;

/** Extension contexts get one helper beyond core's createExtensionContext: run an action by name. */
function contextFor(card, type, extra) {
  const ctx = createExtensionContext(card, type);
  ctx.act = (action, id) => card._act(action, id);
  return Object.assign(ctx, extra);
}

/** Make sure `card._ext` holds the state object of every registered extension. Works for any card-like object. */
export function ensureExtensionState(card) {
  const states = (card._ext ||= {});
  for (const {type, extension} of extensions()) {
    if (!(type in states)) states[type] = extension.state ? extension.state() : {};
  }
  return states;
}

// ---- compat accessors ---------------------------------------------------------------------------------------------
// An extension's `compat` map says which private property names live on the card and how to read and write them.
// They are defined on the prototype as accessors that DELEGATE to the extension state (never copy it), so
// `card._galleryOpen = true` and the gallery's own code see one value.

/** Names the controller defines itself as plain delegates; a compat accessor may take them over. */
const OVERRIDABLE = new Set(['_ring', '_stopGallery', '_galleryMarkup']);

/** proto -> {names: Set<string> installed from compat, originals: Map<string, PropertyDescriptor>} */
const installedBy = new WeakMap();

/**
 * Bring the compat accessors on `proto` in line with the registry: define the ones that are provided, remove
 * the ones that no longer are. Safe to call repeatedly (it runs on every registry change).
 * @param {object} proto   HouseViewCard.prototype (or a test double)
 */
export function syncCompat(proto) {
  let record = installedBy.get(proto);
  if (!record) installedBy.set(proto, (record = {names: new Set(), originals: new Map()}));

  const wanted = new Map();
  for (const {type, extension} of extensions()) {
    for (const [name, accessor] of Object.entries(extension.compat || {})) {
      if (wanted.has(name)) {
        console.error(`[HouseView] compat property ${name} of "${type}" is already provided`);
      } else wanted.set(name, accessor);
    }
  }

  for (const name of [...record.names]) {
    if (wanted.has(name)) continue;
    delete proto[name];
    const original = record.originals.get(name);
    if (original) Object.defineProperty(proto, name, original);
    record.names.delete(name);
    record.originals.delete(name);
  }

  for (const [name, accessor] of wanted) {
    const own = Object.getOwnPropertyDescriptor(proto, name);
    if (own && !record.names.has(name)) {
      if (!OVERRIDABLE.has(name)) {
        console.error(`[HouseView] compat property ${name} would replace a controller member`);
        continue;
      }
      record.originals.set(name, own);
    }
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: false,
      get() {
        ensureExtensionState(this);
        return accessor.get(this);
      },
      set(value) {
        ensureExtensionState(this);
        // a read-only compat property ignores writes instead of throwing inside Home Assistant
        if (accessor.set) accessor.set(this, value);
      }
    });
    record.names.add(name);
  }
}

// ---- the mixin ----------------------------------------------------------------------------------------------------

export const extensionsMixin = {
  _ensureExtensionState() {
    return ensureExtensionState(this);
  },

  /** The context an extension hook receives (see core/context.js createExtensionContext, plus `act`). */
  _extensionContext(type, extra) {
    return contextFor(this, type, extra);
  },

  /** True while an extension owns the screen and page navigation must not happen (gallery open). */
  _navigationBlocked() {
    this._ensureExtensionState();
    return extensions().some(({type, extension}) =>
      guarded(extension, 'blocksNavigation', `${type}.extension.blocksNavigation`, this._ext[type])
    );
  },

  /** Extra classes for the shell, in registry order (the gallery adds `camera-view-open`). */
  _extensionShellClasses() {
    this._ensureExtensionState();
    return extensions().flatMap(
      ({type, extension}) =>
        guarded(extension, 'shellClasses', `${type}.extension.shellClasses`, this) || []
    );
  },

  /**
   * Put each extension's overlay markup into the shell.
   * `rebuild` (a full render) removes what was inserted before and inserts fresh markup; otherwise (a state
   * update) an overlay that is still in the DOM is left alone, a missing one is inserted, and one whose
   * extension now returns no markup is removed. `retain` can answer that without building markup: true keeps
   * the nodes (afterRender syncs them), false removes them.
   * Extensions are processed in reverse registry order so the timer alarm banner precedes the camera gallery
   * in the DOM.
   */
  _syncOverlays(shell, rebuild) {
    this._ensureExtensionState();
    const nodes = (this._overlayNodes ||= new Map());
    for (const {type, extension} of [...extensions()].reverse()) {
      if (!extension.overlay) continue;
      let current = nodes.get(type) || [];
      const connected =
        current.length > 0 &&
        current.every((node) => node.isConnected && shell.contains(node));
      if (!rebuild && connected && extension.retain) {
        const keep = guarded(
          extension,
          'retain',
          `${type}.extension.retain`,
          this._extensionContext(type)
        );
        if (keep === true) continue;
        if (keep === false) {
          current.forEach((node) => node.remove());
          nodes.delete(type);
          continue;
        }
      }
      const html =
        guarded(extension, 'overlay', `${type}.extension.overlay`, this._extensionContext(type)) ||
        '';
      if (rebuild) {
        current.forEach((node) => node.remove());
        current = [];
      } else if (connected) {
        if (!html) {
          current.forEach((node) => node.remove());
          nodes.delete(type);
        }
        continue;
      } else {
        current.forEach((node) => node.remove());
        current = [];
      }
      if (!html) {
        nodes.delete(type);
        continue;
      }
      const before = shell.childNodes.length;
      shell.insertAdjacentHTML('beforeend', html);
      nodes.set(
        type,
        [...shell.childNodes].slice(before).filter((node) => node.nodeType === ELEMENT_NODE)
      );
    }
  },

  /** Extensions' afterRender (the gallery refreshes its images in place). */
  _afterRenderExtensions() {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (extension.afterRender) {
        guarded(
          extension,
          'afterRender',
          `${type}.extension.afterRender`,
          this._extensionContext(type)
        );
      }
    }
  },

  /**
   * Release what extensions hold: gallery image connections, the audio context.
   * @param {'render'|'disconnect'} reason  every re-render, or the card leaving the page. An extension that keeps
   *   something across renders (an unlocked AudioContext) lets go of it only for 'disconnect'.
   */
  _disposeExtensions(reason = 'render') {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (extension.dispose) {
        guarded(
          extension,
          'dispose',
          `${type}.extension.dispose`,
          this._extensionContext(type, {reason})
        );
      }
    }
  },

  /** keydown: the first extension that handles the key wins. Returns true when one did. */
  _extensionKeydown(event) {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (!extension.onKeydown) continue;
      const handled = guarded(
        extension,
        'onKeydown',
        `${type}.extension.onKeydown`,
        this._extensionContext(type),
        event
      );
      if (handled === true) return true;
    }
    return false;
  },

  /** pointerdown: every extension may react (the timer unlocks audio on the first touch). */
  _extensionPointerDown(event) {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (extension.onPointerDown) {
        guarded(
          extension,
          'onPointerDown',
          `${type}.extension.onPointerDown`,
          this._extensionContext(type),
          event
        );
      }
    }
  },

  /** Scheduled work of the extensions (the gallery refreshes its images every 5 s while it is open). */
  _tickExtensions(now) {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      const tick = extension.tick;
      if (!tick) continue;
      if (tick.when && !guarded(tick, 'when', `${type}.extension.tick.when`, this._ext[type]))
        continue;
      this._tickWorkIfDue(`ext:${type}`, tick.every, now, () =>
        guarded(tick, 'run', `${type}.extension.tick`, this._extensionContext(type))
      );
    }
  },

  // ---- thin delegates for method names that belong to an extension --------------------------------------
  // A widget's `compat` map can provide the same names and takes over; these keep the names alive otherwise.

  /** Ring the timer chime. Nothing to do unless an extension provides `_ring` through compat. */
  _ring() {},

  /** Release the camera gallery's image connections (the extension of the widget with role `camera`). */
  _stopGallery() {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (extension.dispose && getWidget(type)?.layoutRoles.includes('camera')) {
        guarded(
          extension,
          'dispose',
          `${type}.extension.dispose`,
          this._extensionContext(type, {reason: 'render'})
        );
      }
    }
  },

  /** The camera gallery's markup ('' when it is closed). */
  _galleryMarkup() {
    this._ensureExtensionState();
    for (const {type, extension} of extensions()) {
      if (extension.overlay && getWidget(type)?.layoutRoles.includes('camera')) {
        return (
          guarded(
            extension,
            'overlay',
            `${type}.extension.overlay`,
            this._extensionContext(type)
          ) || ''
        );
      }
    }
    return '';
  }
};
