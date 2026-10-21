// The generic host for widget extensions and hooks (src/controller/extensions.js, hooks.js): overlays, keyboard,
// pointer, ticks, disposal, and the per-widget hooks (afterRender, tick, onHass). The controller must run all of
// this without knowing which widget owns an extension; the stand-ins in controller-env.mjs have the shape of the
// real camera (gallery) and timer (alarm) widgets.
import {afterEach, beforeEach, describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import {FakeNode, fakeHass, installBrowserGlobals, registerStandIns} from './controller-env.mjs';
import {defineWidget} from '../../src/core/define-widget.js';
import {_resetRegistry, registerWidget} from '../../src/core/registry.js';
import {_resetStrings} from '../../src/core/i18n.js';
import * as ticker from '../../src/core/ticker.js';

installBrowserGlobals();
const {HouseViewCard} = await import('../../src/controller/houseview-card.js');
const {ensureExtensionState} = await import('../../src/controller/extensions.js');
const {guarded} = await import('../../src/controller/hooks.js');

let log;

beforeEach(() => {
  _resetRegistry();
  _resetStrings();
  log = [];
  registerStandIns({log});
});

afterEach(() => {
  ticker._reset();
  mock.restoreAll();
});

function newCard() {
  const card = new HouseViewCard();
  card._hass = fakeHass();
  return card;
}

/** Pretend `widgets` are rendered on the current page: each gets a tile root the hooks can see. */
function mount(card, widgets) {
  card._config = {widgets};
  card._renderedCards = new Map(
    widgets.map((_, index) => [
      index,
      {localName: 'houseview-widget-card', firstElementChild: {name: `tile${index}`}}
    ])
  );
  return card;
}

const names = (entries, prefix = '') =>
  entries.filter(([n]) => n.startsWith(prefix)).map(([n]) => n);

describe('extension state', () => {
  it('creates the state of every extension once, with the extension’s own initial value', () => {
    const card = newCard();
    assert.deepEqual(card._ext.camera, {open: false, camera: null, refreshes: 0});
    const state = card._ext.camera;
    card._ensureExtensionState();
    assert.equal(card._ext.camera, state, 'a second call keeps the object');
  });

  it('gives an extension without state() an empty object and picks up late registrations', () => {
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        extension: {shellClasses: () => ['x']}
      })
    );
    const card = newCard();
    assert.deepEqual(card._ext.sensor, {});
    registerWidget(
      defineWidget({
        type: 'fan',
        label: 'Fan',
        order: 80,
        render: () => '<i></i>',
        extension: {state: () => ({n: 1})}
      })
    );
    assert.equal(ensureExtensionState(card).fan.n, 1);
  });
});

describe('navigation and shell classes', () => {
  it('is blocked while any extension says so', () => {
    const card = newCard();
    assert.equal(card._navigationBlocked(), false);
    card._galleryOpen = true;
    assert.equal(card._navigationBlocked(), true);
  });

  it('collects the extensions’ shell classes', () => {
    const card = newCard();
    assert.deepEqual(card._extensionShellClasses(), []);
    card._galleryOpen = true;
    assert.deepEqual(card._extensionShellClasses(), ['camera-view-open']);
  });

  it('a throwing extension never blocks and is reported once', () => {
    const errors = mock.method(console, 'error', () => {});
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        extension: {
          blocksNavigation: () => {
            throw new Error('nope');
          }
        }
      })
    );
    const card = newCard();
    assert.equal(card._navigationBlocked(), false);
    assert.equal(card._navigationBlocked(), false);
    assert.equal(errors.mock.callCount(), 1);
  });
});

describe('overlays', () => {
  const classesOf = (shell) => shell.children.map((node) => [...node.classNames].join(' '));

  function shellWith(...existing) {
    const shell = new FakeNode('ha-card');
    for (const name of existing) {
      const node = new FakeNode('div');
      node.classNames.add(name);
      shell.append(node);
    }
    return shell;
  }

  it('inserts each extension’s markup at the end of the shell, the alarm banner before the gallery', () => {
    const card = newCard();
    card._galleryOpen = true;
    card._alarm = true;
    const shell = shellWith('face', 'page-nav', 'feedback');
    card._syncOverlays(shell, true);
    assert.deepEqual(classesOf(shell), [
      'face',
      'page-nav',
      'feedback',
      'timer-alarm',
      'camera-gallery'
    ]);
  });

  it('inserts nothing for extensions that return no markup', () => {
    const card = newCard();
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    assert.deepEqual(classesOf(shell), ['face']);
  });

  it('a full render removes what it inserted before and inserts fresh markup', () => {
    const card = newCard();
    card._galleryOpen = true;
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    const first = shell.children[1];
    card._syncOverlays(shell, true);
    assert.equal(shell.children.length, 2);
    assert.notEqual(shell.children[1], first);
    assert.equal(first.parentNode, null);
  });

  it('an update leaves an overlay in place, adds a missing one, and drops one that became empty', () => {
    const card = newCard();
    card._galleryOpen = true;
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    const gallery = shell.children[1];
    card._syncOverlays(shell, false);
    assert.equal(shell.children[1], gallery, 'same node: images inside keep loading');
    card._alarm = true;
    card._syncOverlays(shell, false);
    assert.deepEqual(classesOf(shell), ['face', 'camera-gallery', 'timer-alarm']);
    card._galleryOpen = false;
    card._syncOverlays(shell, false);
    assert.deepEqual(classesOf(shell), ['face', 'timer-alarm']);
    card._alarm = false;
    card._syncOverlays(shell, false);
    assert.deepEqual(classesOf(shell), ['face']);
  });

  it('puts an overlay back when its node was removed from the shell (the extension removed it itself)', () => {
    const card = newCard();
    card._alarm = true;
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    shell.children[1].remove();
    card._syncOverlays(shell, false);
    assert.deepEqual(classesOf(shell), ['face', 'timer-alarm']);
  });

  it('moves to a new shell when the shell was rebuilt', () => {
    const card = newCard();
    card._alarm = true;
    const oldShell = shellWith('face');
    card._syncOverlays(oldShell, true);
    const newShell = shellWith('face');
    card._syncOverlays(newShell, false);
    assert.deepEqual(classesOf(newShell), ['face', 'timer-alarm']);
  });

  it('a state update keeps a retained overlay without asking for markup again', () => {
    let built = 0;
    registerWidget(
      defineWidget({
        type: 'fan',
        label: 'Fan',
        order: 80,
        render: () => '<i></i>',
        extension: {
          state: () => ({open: true}),
          retain: (ctx) => ctx.ext.open,
          overlay() {
            built += 1;
            return '<section class="fan-overlay">fan</section>';
          }
        }
      })
    );
    const card = newCard();
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    const overlay = shell.children.find((node) => node.classNames.has('fan-overlay'));
    card._syncOverlays(shell, false);
    assert.equal(built, 1);
    assert.equal(
      shell.children.find((node) => node.classNames.has('fan-overlay')),
      overlay
    );
    card._ext.fan.open = false;
    card._syncOverlays(shell, false);
    assert.equal(built, 1, 'retain false removes the overlay without building markup');
    assert.equal(
      shell.children.some((node) => node.classNames.has('fan-overlay')),
      false
    );
  });

  it('a throwing overlay is isolated: the other extensions still insert', () => {
    const errors = mock.method(console, 'error', () => {});
    _resetRegistry();
    registerStandIns({log});
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        extension: {
          overlay: () => {
            throw new Error('bad overlay');
          }
        }
      })
    );
    const card = newCard();
    card._galleryOpen = true;
    const shell = shellWith('face');
    card._syncOverlays(shell, true);
    assert.deepEqual(classesOf(shell), ['face', 'camera-gallery']);
    assert.equal(errors.mock.callCount(), 1);
  });
});

describe('extension contexts', () => {
  it('carry the extension state, the type, the root, a way to run actions, and the dispose reason', async () => {
    const card = newCard();
    const seen = [];
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        extension: {
          state: () => ({mine: true}),
          afterRender: (ctx) => seen.push(ctx),
          dispose: (ctx) => seen.push(ctx)
        }
      })
    );
    card._ensureExtensionState();
    card._afterRenderExtensions();
    card._disposeExtensions('disconnect');
    const [after, dispose] = seen;
    assert.equal(after.type, 'sensor');
    assert.deepEqual(after.ext, {mine: true});
    assert.equal(after.root, card.shadowRoot);
    assert.equal(after.hass, card._hass);
    assert.equal(dispose.reason, 'disconnect');
    const acts = [];
    card._act = (...args) => acts.push(args);
    after.act('camera-back', '');
    assert.deepEqual(acts, [['camera-back', '']]);
  });

  it('afterRender runs for every extension that has one', () => {
    const card = newCard();
    card._afterRenderExtensions();
    assert.deepEqual(log, [['camera.extension.afterRender', false]]);
  });

  it('dispose says why: a re-render or a disconnect', () => {
    const card = newCard();
    card._disposeExtensions();
    card._disposeExtensions('disconnect');
    assert.deepEqual(
      log.filter(([n]) => n.endsWith('dispose')),
      [
        ['camera.dispose', 'render'],
        ['timer.dispose', 'render'],
        ['camera.dispose', 'disconnect'],
        ['timer.dispose', 'disconnect']
      ]
    );
  });
});

describe('extension actions go through the dispatcher', () => {
  it('runs immediate extension actions with the extension state', async () => {
    const card = newCard();
    await card._act('camera-grid', '');
    assert.equal(card._galleryOpen, true);
    await card._act('camera-back', '');
    assert.equal(card._galleryOpen, false);
    card._alarm = true;
    await card._act('dismiss-alarm', '');
    assert.equal(card._alarm, false);
  });
});

describe('keyboard and pointer', () => {
  const key = (name) => ({
    key: name,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  it('the first extension that returns exactly true handles the key', () => {
    const card = newCard();
    card._galleryOpen = true;
    const escape = key('Escape');
    assert.equal(card._extensionKeydown(escape), true);
    assert.equal(escape.prevented, true);
    assert.equal(card._galleryOpen, false);
    assert.equal(card._extensionKeydown(key('Escape')), false, 'nothing open: not handled');
  });

  it('a truthy but not-true result does not count as handled', () => {
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        extension: {onKeydown: () => 1}
      })
    );
    assert.equal(newCard()._extensionKeydown(key('a')), false);
  });

  it('pointerdown reaches every extension that listens', () => {
    const card = newCard();
    card._extensionPointerDown({});
    assert.deepEqual(names(log, ''), ['camera.pointerdown', 'timer.pointerdown']);
  });
});

describe('extension ticks', () => {
  it('runs a tick at most every `every` ms and only while `when` says so', () => {
    const card = newCard();
    card._tickExtensions(0);
    assert.equal(names(log, 'camera.gallery').length, 0, 'gallery closed');
    card._galleryOpen = true;
    card._tickExtensions(1000);
    card._tickExtensions(2000);
    card._tickExtensions(5900);
    assert.equal(names(log, 'camera.gallery').length, 1);
    card._tickExtensions(6000);
    assert.equal(names(log, 'camera.gallery').length, 2);
    card._galleryOpen = false;
    card._tickExtensions(20000);
    assert.equal(names(log, 'camera.gallery').length, 2);
  });
});

describe('thin delegates for extension methods', () => {
  it('_stopGallery disposes only the extension of the widget with the camera role', () => {
    const card = newCard();
    card._stopGallery();
    assert.deepEqual(
      log.filter(([n]) => n.endsWith('dispose')),
      [['camera.dispose', 'render']]
    );
  });

  it('_galleryMarkup returns that extension’s overlay, empty when closed', () => {
    const card = newCard();
    assert.equal(card._galleryMarkup(), '');
    card._galleryOpen = true;
    assert.equal(card._galleryMarkup(), '<section class="camera-gallery">gallery</section>');
  });
});

describe('widget hooks', () => {
  const widgets = () => [
    {type: 'camera', entity: 'camera.a', name: 'cam'},
    {type: 'light', entity: 'light.a'},
    {type: 'timer', entity: 'timer.a'}
  ];

  it('afterRender runs for mounted widgets that have the hook, with their tile and extension state, then the extensions', () => {
    const card = mount(newCard(), widgets());
    card._runAfterRender();
    assert.deepEqual(log, [
      ['camera.afterRender', 0, 'tile0', false],
      ['timer.afterRender', 2],
      ['camera.extension.afterRender', false]
    ]);
  });

  it('hands the hook the mounted tile root', () => {
    const seen = [];
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        afterRender: (ctx) => seen.push([ctx.el, ctx.index, ctx.type, ctx.widget.entity])
      })
    );
    const card = mount(newCard(), [{type: 'sensor', entity: 'sensor.x'}]);
    card._runAfterRender();
    assert.deepEqual(seen, [[{name: 'tile0'}, 0, 'sensor', 'sensor.x']]);
  });

  it('skips native cards and widgets that are not on the page', () => {
    const card = mount(newCard(), widgets());
    card._config.widgets.push({type: 'native_card', _card: {}});
    card._renderedCards.set(3, {localName: 'div', firstElementChild: {}});
    card._renderedCards.delete(2);
    card._runAfterRender();
    assert.deepEqual(names(log, 'timer'), []);
  });

  it('a throwing hook is reported once and the others still run', () => {
    const errors = mock.method(console, 'error', () => {});
    registerWidget(
      defineWidget({
        type: 'sensor',
        label: 'Sensor',
        order: 110,
        render: () => '<i></i>',
        afterRender: () => {
          throw new Error('hook');
        }
      })
    );
    const card = mount(newCard(), [{type: 'sensor', entity: 'sensor.x'}, ...widgets()]);
    card._runAfterRender();
    card._runAfterRender();
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(names(log, 'timer.afterRender').length, 2);
  });

  it('the refresh methods run the hooks of the widgets with the matching role', () => {
    const card = mount(newCard(), widgets());
    card._countdowns();
    assert.deepEqual(log, [['timer.afterRender', 2]]);
    log.length = 0;
    card._camera();
    assert.deepEqual(log, [['camera.afterRender', 0, 'tile0', false]]);
    log.length = 0;
    card._clock();
    assert.deepEqual(log, [], 'no widget with the clock role is registered');
  });

  it('requestRender updates just that widget', () => {
    const card = mount(newCard(), widgets());
    const updates = [];
    card._renderedCards.get(1).update = () => updates.push(1);
    card._requestWidgetRender(1);
    card._requestWidgetRender(9);
    assert.deepEqual(updates, [1]);
  });
});

describe('the 1 s tick', () => {
  const widgets = () => [
    {type: 'camera', entity: 'camera.a'},
    {type: 'timer', entity: 'timer.a'}
  ];

  it('runs each mounted widget tick on its own period', () => {
    const card = mount(newCard(), widgets());
    card._tick(0);
    card._tick(1000);
    card._tick(2000);
    assert.equal(names(log, 'timer.tick').length, 3, 'every 1000 ms: each tick');
    assert.equal(names(log, 'camera.tick').length, 1, 'every 30000 ms: the first tick only');
    card._tick(29900);
    assert.equal(names(log, 'camera.tick').length, 1);
    card._tick(30000);
    assert.equal(names(log, 'camera.tick').length, 2);
  });

  it('is not thrown off by a tick that arrives a few ms early', () => {
    const card = mount(newCard(), widgets());
    card._tick(0);
    card._tick(996);
    assert.equal(names(log, 'timer.tick').length, 2);
  });

  it('only ticks widgets that are on the page, and does nothing without a config', () => {
    const card = mount(newCard(), widgets());
    card._renderedCards.delete(1);
    card._tick(0);
    assert.deepEqual(names(log, 'timer.tick'), []);
    const bare = newCard();
    assert.doesNotThrow(() => bare._tick(0));
  });

  it('runs the extension ticks too', () => {
    const card = mount(newCard(), widgets());
    card._galleryOpen = true;
    card._tick(0);
    assert.equal(names(log, 'camera.gallery').length, 1);
  });

  it('restarts the throttling when the card is connected again', () => {
    const card = mount(newCard(), widgets());
    card._start();
    card._tick(0);
    card._stop();
    card._start();
    card._tick(1);
    assert.equal(names(log, 'camera.tick').length, 2);
    card._stop();
  });

  it('does nothing while a screensaver covers the card, and runs everything once when it goes', () => {
    const card = mount(newCard(), widgets());
    card._tick(0);
    assert.equal(names(log, 'timer.tick').length, 1);
    card._screensaver = {active: {covered: true}};
    card._tick(1000);
    card._tick(2000);
    card._tick(31000);
    assert.equal(names(log, 'timer.tick').length, 1, 'no countdown work under the layer');
    assert.equal(names(log, 'camera.tick').length, 1, 'no snapshot request under the layer');
    // the layer fades: the controller catches up at once, whatever the periods say
    card._screensaver = {active: null};
    card._resumeAfterCover();
    assert.equal(names(log, 'timer.tick').length, 2);
    assert.equal(names(log, 'camera.tick').length, 2, 'the picture is refreshed right away');
  });

  it('an uncovered card ticks as before; a covered one with no layer state is just a normal card', () => {
    const card = mount(newCard(), widgets());
    card._screensaver = null;
    card._tick(0);
    card._screensaver = {active: {covered: false}};
    card._tick(1000);
    assert.equal(names(log, 'timer.tick').length, 2);
  });

  it('defers the tile repaint and the native card hass while covered, and pays both on resume', () => {
    const card = mount(newCard(), widgets());
    let rendered = 0;
    let forwarded = 0;
    card._render = () => rendered++;
    card._forwardHassToNativeCards = () => forwarded++;
    card.shadowRoot.selectors.set('.shell.adaptive', {}); // a carousel shell exists: hass updates go through _updateWidgets
    card._updateWidgets(); // no face in the stand-in shadow root: falls back to a render
    assert.equal(rendered, 1);
    card._screensaver = {active: {covered: true}};
    card._updateWidgets();
    card._applyHass(fakeHass());
    assert.equal(rendered, 1, 'no repaint under the layer');
    assert.equal(forwarded, 0, 'native cards keep the hass they had');
    assert.equal(card._underlayStale, true);
    card._screensaver = {active: null};
    card._resumeAfterCover();
    assert.equal(rendered, 2, 'one repaint when the layer goes');
    assert.equal(forwarded, 1, 'and the newest hass for the native cards');
    assert.equal(card._underlayStale, false);
    assert.equal(card._nativeHassStale, false);
    card._resumeAfterCover();
    assert.equal(rendered, 2, 'nothing owed the second time');
  });

  it('a widget tick with align: minute runs when the wall-clock minute changes', () => {
    const runs = [];
    registerWidget(
      defineWidget({
        type: 'clock',
        label: 'Clock',
        order: 20,
        entity: 'none',
        availability: 'always',
        render: (ctx) => ctx.root('div', '', ''),
        tick: {every: 60000, align: 'minute', run: () => runs.push('run')}
      })
    );
    const card = mount(newCard(), [{type: 'clock'}]);
    const at = (h, m, sec) => Date.UTC(2026, 9, 15, h, m, sec);
    card._tick(at(10, 9, 5));
    card._tick(at(10, 9, 30));
    card._tick(at(10, 9, 59));
    assert.equal(runs.length, 1, 'once for the whole of 10:09');
    card._tick(at(10, 10, 0));
    assert.equal(
      runs.length,
      2,
      'again as soon as the minute changes, even 55 s after the last run'
    );
    card._tick(at(10, 10, 1));
    assert.equal(runs.length, 2);
  });

  it('ticks without throwing', () => {
    const card = newCard();
    card._config = {climate: {entity: 'climate.t'}};
    assert.doesNotThrow(() => card._tick(0));
  });
});

describe('guarded()', () => {
  it('returns the hook result, or undefined when it is missing or throws', () => {
    const errors = mock.method(console, 'error', () => {});
    const owner = {
      ok: (a, b) => a + b,
      bad: () => {
        throw new Error('x');
      }
    };
    assert.equal(guarded(owner, 'ok', 'label', 1, 2), 3);
    assert.equal(guarded(owner, 'missing', 'label'), undefined);
    assert.equal(guarded(owner, 'bad', 'label'), undefined);
    assert.equal(guarded(owner, 'bad', 'label'), undefined);
    assert.equal(errors.mock.callCount(), 1);
  });

  it('calls the hook as a method of its owner', () => {
    const owner = {
      value: 7,
      read() {
        return this.value;
      }
    };
    assert.equal(guarded(owner, 'read', 'label'), 7);
  });
});

describe('without any extension', () => {
  it('every host entry point is a harmless no-op', () => {
    _resetRegistry();
    const card = newCard();
    const shell = new FakeNode('ha-card');
    card._syncOverlays(shell, true);
    card._afterRenderExtensions();
    card._disposeExtensions();
    card._tickExtensions(0);
    assert.equal(card._extensionKeydown({key: 'a'}), false);
    assert.equal(card._navigationBlocked(), false);
    assert.deepEqual(card._extensionShellClasses(), []);
    assert.equal(card._galleryMarkup(), '');
    assert.equal(shell.children.length, 0);
  });
});
