// t: language fallback, interpolation, registration, and the core English strings.
import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import en from '../../src/i18n/en.js';
import {
  _resetStrings,
  hasString,
  interpolate,
  languageChain,
  languageOf,
  languages,
  registerStrings,
  t,
  translate
} from '../../src/core/i18n.js';

beforeEach(() => _resetStrings());

describe('lookup order', () => {
  beforeEach(() => {
    registerStrings({
      en: {'a.hello': 'Hello', 'a.only_en': 'Only English'},
      de: {'a.hello': 'Hallo'},
      'de-AT': {'a.hello': 'Servus'},
      'pt-BR': {'a.hello': 'Olá'}
    });
  });

  it('exact locale, then base language, then en, then the key', () => {
    assert.equal(translate('de-AT', 'a.hello'), 'Servus');
    assert.equal(translate('de-CH', 'a.hello'), 'Hallo');
    assert.equal(translate('de', 'a.hello'), 'Hallo');
    assert.equal(translate('fr', 'a.hello'), 'Hello');
    assert.equal(translate('de', 'a.only_en'), 'Only English');
    assert.equal(translate('de', 'a.missing'), 'a.missing');
  });

  it('is case and separator insensitive', () => {
    assert.equal(translate('DE-at', 'a.hello'), 'Servus');
    assert.equal(translate('de_AT', 'a.hello'), 'Servus');
    assert.equal(translate('pt-br', 'a.hello'), 'Olá');
    assert.equal(translate('pt', 'a.hello'), 'Hello');
  });

  it('no language means English', () => {
    assert.equal(translate(undefined, 'a.hello'), 'Hello');
    assert.equal(translate('', 'a.hello'), 'Hello');
    assert.equal(translate(null, 'a.hello'), 'Hello');
  });

  it('languageChain', () => {
    assert.deepEqual(languageChain('de-AT'), ['de-at', 'de', 'en']);
    assert.deepEqual(languageChain('en'), ['en']);
    assert.deepEqual(languageChain('en-GB'), ['en-gb', 'en']);
    assert.deepEqual(languageChain(undefined), ['en']);
  });
});

describe('t(hass, key, vars)', () => {
  it('uses hass.locale.language', () => {
    registerStrings({en: {'k.x': 'Open'}, de: {'k.x': 'Auf'}});
    assert.equal(t({locale: {language: 'de'}}, 'k.x'), 'Auf');
    assert.equal(t({locale: {language: 'en-GB'}}, 'k.x'), 'Open');
    assert.equal(t({}, 'k.x'), 'Open');
    assert.equal(t(undefined, 'k.x'), 'Open');
    assert.equal(languageOf({locale: {language: 'fr'}}), 'fr');
    assert.equal(languageOf(null), undefined);
  });

  it('interpolates {name} placeholders', () => {
    registerStrings({en: {'k.pct': '{n}% open', 'k.two': '{a} and {b}', 'k.same': '{a}{a}'}});
    assert.equal(t({}, 'k.pct', {n: 40}), '40% open');
    assert.equal(t({}, 'k.pct', {n: 0}), '0% open');
    assert.equal(t({}, 'k.two', {a: 'x', b: 'y'}), 'x and y');
    assert.equal(t({}, 'k.same', {a: 1}), '11');
  });

  it('leaves a placeholder without a value visible, and does not touch text without vars', () => {
    registerStrings({en: {'k.pct': '{n}% open'}});
    assert.equal(t({}, 'k.pct'), '{n}% open');
    assert.equal(t({}, 'k.pct', {}), '{n}% open');
    assert.equal(t({}, 'k.pct', {n: null}), '{n}% open');
    assert.equal(interpolate('{n}', undefined), '{n}');
  });

  it('does not escape (callers use ctx.esc)', () => {
    registerStrings({en: {'k.x': '<b>{v}</b>'}});
    assert.equal(t({}, 'k.x', {v: '<i>'}), '<b><i></b>');
  });
});

describe('registerStrings', () => {
  it('merges tables and a later registration wins', () => {
    registerStrings({en: {'k.a': '1'}});
    registerStrings({en: {'k.b': '2', 'k.a': 'one'}});
    assert.equal(translate('en', 'k.a'), 'one');
    assert.equal(translate('en', 'k.b'), '2');
  });

  it('ignores junk', () => {
    assert.doesNotThrow(() => registerStrings(undefined));
    assert.doesNotThrow(() => registerStrings(null));
    assert.doesNotThrow(() => registerStrings({de: null, fr: 'x'}));
    assert.deepEqual(languages(), ['en']);
  });

  it('hasString and languages', () => {
    registerStrings({de: {'only.de': 'x'}});
    assert.equal(hasString('only.de'), true);
    assert.equal(hasString('nope'), false);
    assert.deepEqual(languages().sort(), ['de', 'en']);
  });
});

describe('core English strings', () => {
  const core = (key) => translate('en', key);

  it('states, errors and card chrome', () => {
    assert.equal(core('state.unavailable'), 'Unavailable');
    assert.equal(core('state.offline'), 'Offline');
    assert.equal(core('common.on'), 'On');
    assert.equal(core('common.off'), 'Off');
    assert.equal(t({}, 'error.action', {reason: 'x'}), 'Could not complete action: x');
    assert.equal(core('error.try_again'), 'please try again');
    assert.equal(t({}, 'nav.go_to', {label: 'Kitchen'}), 'Go to Kitchen');
    assert.equal(core('nav.previous'), 'Previous page');
    assert.equal(core('nav.next'), 'Next page');
    assert.equal(core('nav.label'), 'HouseView pages');
    assert.equal(t({}, 'face.label', {title: 'Home'}), 'Home dashboard');
    assert.equal(t({}, 'page.label', {label: 'Kitchen'}), 'Kitchen page');
    assert.equal(core('empty.cards'), 'Add cards using Edit dashboard → Edit card.');
    assert.equal(core('native.loading'), 'Loading card…');
    assert.deepEqual(['dim.dim', 'dim.dim_screen', 'dim.brighter', 'dim.restore'].map(core), [
      'Dim',
      'Dim screen',
      'Brighter',
      'Restore brightness'
    ]);
  });

  it('editor labels', () => {
    assert.equal(core('editor.widget_type'), 'Widget type');
    assert.equal(core('editor.name'), 'Label');
    assert.equal(core('editor.bedtime'), 'Night mode and dim button');
    assert.equal(core('editor.room'), 'Room / thermostat caption');
    assert.equal(core('option.page'), 'Use page backgrounds');
  });

  it('every core key is a string, namespaced, and has a use of a documented prefix', () => {
    for (const [key, text] of Object.entries(en)) {
      assert.equal(typeof text, 'string', key);
      assert.match(key, /^[a-z_]+(\.[a-z_]+)+$/, key);
    }
    for (const key of [
      'state.unavailable',
      'state.offline',
      'common.on',
      'common.off',
      'editor.widget_type',
      'editor.entity',
      'editor.name',
      'editor.size',
      'editor.icon',
      'error.action',
      'error.try_again'
    ]) {
      assert.ok(key in en, `core key ${key}`);
    }
  });

  it('placeholders in core strings are all {word}', () => {
    for (const [key, text] of Object.entries(en)) {
      for (const match of text.match(/\{[^}]*\}/g) || []) assert.match(match, /^\{\w+\}$/, key);
    }
  });
});
