// Tablet chrome (src/controller/tablet-chrome.js): the only code that touches Home Assistant's private DOM.
// It must be feature-detected, idempotent, fully undoable, and it must fail closed: whatever HA looks like, the
// card keeps working. Tested against a stub tree standing in for home-assistant > home-assistant-main >
// ha-drawer and the hui-root that contains the card.
import {afterEach, beforeEach, describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FakeShadowRoot, installBrowserGlobals} from './controller-env.mjs';

const env = installBrowserGlobals();
const {HouseViewCard} = await import('../../src/controller/houseview-card.js');
const {_resetTabletChromeWarning} = await import('../../src/controller/tablet-chrome.js');

const DRAWER_CSS =
  '.sidebar-shell{display:none!important}.layout{grid-template-columns:1fr!important}.app-content{margin:0!important;padding:0!important;width:100%!important}';
const HEADER_CSS =
  '.header{display:none!important}#view{padding-top:0!important;--header-height:0px}';

/** A Home Assistant stand-in: the drawer's and the dashboard root's shadow roots are where styles go. */
function homeAssistant({withDrawer = true, withRoot = true} = {}) {
  const drawer = {shadowRoot: new FakeShadowRoot()};
  const root = {localName: 'hui-root', shadowRoot: new FakeShadowRoot()};
  const main = {
    shadowRoot: {
      querySelector: (selector) => (selector === 'ha-drawer' && withDrawer ? drawer : null)
    }
  };
  const app = {
    shadowRoot: {querySelector: (selector) => (selector === 'home-assistant-main' ? main : null)}
  };
  env.doc.querySelector = (selector) => (selector === 'home-assistant' ? app : null);
  return {
    drawer,
    root,
    hostFor: (card) => (card.getRootNode = () => ({host: withRoot ? root : undefined}))
  };
}

function newCard(config = {}) {
  const card = new HouseViewCard();
  card._config = config;
  return card;
}

const styleTexts = (shadow) => shadow.children.map((node) => node.textContent);

beforeEach(() => {
  env.win.location.search = '';
  env.doc.querySelector = () => null;
  _resetTabletChromeWarning();
});

afterEach(() => mock.restoreAll());

describe('tablet chrome', () => {
  it('does nothing unless asked for', () => {
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), false);
    assert.equal(ha.drawer.shadowRoot.children.length, 0);
    assert.equal(ha.root.shadowRoot.children.length, 0);
  });

  it('?tablet=1 hides the sidebar and the header and sets the chrome height to zero', () => {
    env.win.location.search = '?tablet=1';
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), true);
    assert.deepEqual(styleTexts(ha.drawer.shadowRoot), [DRAWER_CSS]);
    assert.deepEqual(styleTexts(ha.root.shadowRoot), [HEADER_CSS]);
    assert.equal(ha.drawer.shadowRoot.children[0].dataset.houseviewChrome, '');
    assert.equal(card.style.getPropertyValue('--hv-chrome'), '0px');
  });

  it('tablet_mode: true in the config does the same without the URL parameter', () => {
    const ha = homeAssistant();
    const card = newCard({tablet_mode: true});
    ha.hostFor(card);
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), true);
    assert.equal(ha.drawer.shadowRoot.children.length, 1);
  });

  it('only the exact value 1 counts for the URL parameter', () => {
    env.win.location.search = '?tablet=yes';
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), false);
  });

  it('is idempotent: render and layout call it every time', () => {
    env.win.location.search = '?tablet=1';
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    for (let i = 0; i < 4; i++) card._tabletChrome();
    assert.equal(ha.drawer.shadowRoot.children.length, 1);
    assert.equal(ha.root.shadowRoot.children.length, 1);
  });

  it('puts the styles back when Home Assistant dropped them', () => {
    env.win.location.search = '?tablet=1';
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    card._tabletChrome();
    ha.drawer.shadowRoot.children[0].remove();
    card._tabletChrome();
    assert.equal(ha.drawer.shadowRoot.children.length, 1);
    assert.equal(
      ha.root.shadowRoot.children.length,
      1,
      'the surviving style was replaced, not duplicated'
    );
  });

  it('restores everything when the card leaves or the request goes away', () => {
    env.win.location.search = '?tablet=1';
    const ha = homeAssistant();
    const card = newCard();
    ha.hostFor(card);
    card._tabletChrome();
    card._restoreChrome();
    assert.equal(card.hasAttribute('tablet-mode'), false);
    assert.equal(ha.drawer.shadowRoot.children.length, 0);
    assert.equal(ha.root.shadowRoot.children.length, 0);
    assert.equal(card.style.getPropertyValue('--hv-chrome'), '');
    card._tabletChrome();
    env.win.location.search = '';
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), false);
    assert.equal(ha.drawer.shadowRoot.children.length, 0);
  });

  it('a standalone widget card never uses it', () => {
    env.win.location.search = '?tablet=1';
    const ha = homeAssistant();
    const card = newCard({single_widget: true});
    ha.hostFor(card);
    card._tabletChrome();
    assert.equal(card.hasAttribute('tablet-mode'), false);
    assert.equal(ha.drawer.shadowRoot.children.length, 0);
  });

  describe('feature detection', () => {
    for (const [name, options] of [
      ['no ha-drawer', {withDrawer: false}],
      ['no hui-root around the card', {withRoot: false}]
    ]) {
      it(`${name}: keeps the attribute, injects nothing, does not throw`, () => {
        env.win.location.search = '?tablet=1';
        const ha = homeAssistant(options);
        const card = newCard();
        ha.hostFor(card);
        assert.doesNotThrow(() => card._tabletChrome());
        assert.equal(card.hasAttribute('tablet-mode'), true);
        assert.equal(ha.drawer.shadowRoot.children.length, 0);
        assert.equal(ha.root.shadowRoot.children.length, 0);
        assert.equal(card.style.getPropertyValue('--hv-chrome'), '');
      });
    }

    it('outside Home Assistant altogether (a test page) it only sets the attribute', () => {
      env.win.location.search = '?tablet=1';
      const card = newCard();
      assert.doesNotThrow(() => card._tabletChrome());
      assert.equal(card.hasAttribute('tablet-mode'), true);
    });

    it('walks up through nested shadow roots to find the dashboard root', () => {
      env.win.location.search = '?tablet=1';
      const ha = homeAssistant();
      const card = newCard();
      const stack = {
        localName: 'hui-vertical-stack-card',
        parentElement: null,
        getRootNode: () => ({host: ha.root})
      };
      card.getRootNode = () => ({host: stack});
      card._tabletChrome();
      assert.equal(ha.root.shadowRoot.children.length, 1);
    });
  });

  describe('fails closed', () => {
    it('undoes its work, warns once and carries on when Home Assistant behaves unexpectedly', () => {
      env.win.location.search = '?tablet=1';
      const warn = mock.method(console, 'warn', () => {});
      const ha = homeAssistant();
      const card = newCard();
      ha.hostFor(card);
      card._tabletChrome();
      assert.equal(ha.drawer.shadowRoot.children.length, 1);
      // a later HA release makes the lookup throw
      env.doc.querySelector = () => {
        throw new Error('shadow DOM changed');
      };
      ha.drawer.shadowRoot.children[0].remove();
      assert.doesNotThrow(() => card._tabletChrome());
      assert.equal(card.hasAttribute('tablet-mode'), false);
      assert.equal(card.style.getPropertyValue('--hv-chrome'), '');
      assert.doesNotThrow(() => card._tabletChrome());
      assert.equal(warn.mock.callCount(), 1, 'warned once, not on every render');
    });

    it('a failing style insert leaves no half-applied state behind', () => {
      env.win.location.search = '?tablet=1';
      mock.method(console, 'warn', () => {});
      const ha = homeAssistant();
      const card = newCard();
      ha.hostFor(card);
      ha.root.shadowRoot.append = () => {
        throw new Error('read-only');
      };
      assert.doesNotThrow(() => card._tabletChrome());
      assert.equal(card.hasAttribute('tablet-mode'), false);
      assert.equal(ha.drawer.shadowRoot.children.length, 0, 'the drawer style was taken back');
    });

    it('_restoreChrome never throws', () => {
      mock.method(console, 'warn', () => {});
      const card = newCard();
      card.removeAttribute = () => {
        throw new Error('detached');
      };
      assert.doesNotThrow(() => card._restoreChrome());
    });
  });
});

describe('quarantine', () => {
  it('no other source file touches Home Assistant’s private shell elements', () => {
    const PRIVATE = /home-assistant-main|ha-drawer|['"`]hui-root['"`]/;
    const allowed = new Set(['controller/tablet-chrome.js']);
    const walk = (dir, out = []) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = `${dir}${entry.name}`;
        if (entry.isDirectory()) walk(`${full}/`, out);
        else if (entry.name.endsWith('.js')) out.push(full);
      }
      return out;
    };
    const root = new URL('../../src/', import.meta.url).pathname;
    for (const file of walk(root)) {
      const relative = file.slice(root.length);
      if (allowed.has(relative)) continue;
      const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.ok(!PRIVATE.test(code), `${relative} reaches into Home Assistant's private DOM`);
    }
  });
});
