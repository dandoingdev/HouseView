// The "Automatic displays" section of the carousel editor: two boolean fields, lists survive in YAML.
import test from 'node:test';
import assert from 'node:assert/strict';
import './editor-env.mjs';

const {registerOverview} = await import('../../src/core/overview-registry.js');
const {default: timer} = await import('../../src/overviews/timer/index.js');
const form = await import('../../src/editor/automatic-displays-form.js');
const {text} = await import('../../src/editor/form.js');

test('the section is offered when the timer or cover art overview is in the bundle, or a key is set', () => {
  assert.equal(form.showAutomatic({}), false, 'nothing registered yet');
  assert.equal(form.showAutomatic({music_screensaver: false}), true, 'a key already in the YAML');
  assert.equal(form.showAutomatic({timer_display: ['timer.a']}), true);
  registerOverview(timer);
  assert.equal(form.showAutomatic({}), true);
});

test('three native boolean fields, in this order', () => {
  const schema = form.automaticSchema();
  assert.deepEqual(
    schema.map((f) => [f.name, f.selector]),
    [
      ['timer_display', {boolean: {}}],
      ['music_screensaver', {boolean: {}}],
      ['home_overview', {boolean: {}}]
    ]
  );
});

test('labels are the owner strings', () => {
  assert.equal(text({}, 'editor.automatic_displays'), 'Automatic displays');
  assert.equal(text({}, 'editor.timer_display'), 'Show the timer display while a timer runs');
  assert.equal(
    text({}, 'editor.music_screensaver'),
    'Show album art when music has been playing for a while'
  );
});

test('data: on by default, off only for false, a list reads as on', () => {
  assert.deepEqual(form.automaticData({}), {
    timer_display: true,
    music_screensaver: true,
    home_overview: false
  });
  assert.deepEqual(form.automaticData({timer_display: false, music_screensaver: true}), {
    timer_display: false,
    music_screensaver: true,
    home_overview: false
  });
  assert.deepEqual(form.automaticData({timer_display: ['timer.a'], music_screensaver: []}), {
    timer_display: true,
    music_screensaver: true,
    home_overview: false
  });
});

test('home overview is off unless the config says true; the switch writes true or removes the key', () => {
  assert.equal(form.automaticData({home_overview: true}).home_overview, true);
  assert.deepEqual(
    form.applyAutomatic({}, {...form.automaticData({}), home_overview: true}).home_overview,
    true
  );
  assert.equal(
    'home_overview' in
      form.applyAutomatic(
        {home_overview: true},
        {...form.automaticData({home_overview: true}), home_overview: false}
      ),
    false
  );
});

test('turning a switch off writes false, turning it on removes the key', () => {
  const off = form.applyAutomatic(
    {wallpaper: 'teal'},
    {timer_display: false, music_screensaver: true}
  );
  assert.deepEqual(off, {wallpaper: 'teal', timer_display: false});
  const on = form.applyAutomatic(off, {timer_display: true, music_screensaver: true});
  assert.deepEqual(on, {wallpaper: 'teal'});
  assert.equal('timer_display' in on, false);
});

test('a list survives while its switch is not touched, and is replaced when it is', () => {
  const config = {timer_display: ['timer.a', 'timer.b'], music_screensaver: ['media_player.x']};
  const untouched = form.applyAutomatic(config, {timer_display: true, music_screensaver: false});
  assert.deepEqual(untouched.timer_display, ['timer.a', 'timer.b'], 'only music was flipped');
  assert.equal(untouched.music_screensaver, false);
  const flipped = form.applyAutomatic(untouched, {timer_display: false, music_screensaver: false});
  assert.equal(flipped.timer_display, false);
});

test('applyAutomatic does not mutate its input and keeps unrelated keys', () => {
  const config = Object.freeze({cards: [], timer_display: false});
  const next = form.applyAutomatic(config, {timer_display: true, music_screensaver: true});
  assert.deepEqual(next, {cards: []});
  assert.deepEqual(config, {cards: [], timer_display: false});
});
