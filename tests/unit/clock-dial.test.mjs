// The dial (src/widgets/clock/dial.js) runs every second on every clock widget. A second that changes nothing must
// write nothing (a DOM write means style recalculation and layout on a weak tablet), and the two Intl formatters
// must be built once, not once per second.
import {afterEach, describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import {updateDial} from '../../src/widgets/clock/dial.js';

/** A clock widget that counts every write to the three things updateDial touches. */
function fakeClock({withCaption = true} = {}) {
  const writes = {transform: 0, label: 0, caption: 0};
  const hand = () => {
    let value = '';
    return {
      style: {
        get transform() {
          return value;
        },
        set transform(next) {
          writes.transform++;
          value = next;
        }
      }
    };
  };
  const hour = hand();
  const minute = hand();
  let label = null;
  let captionText = '';
  const caption = {
    get textContent() {
      return captionText;
    },
    set textContent(next) {
      writes.caption++;
      captionText = next;
    }
  };
  return {
    writes,
    hour,
    minute,
    get label() {
      return label;
    },
    get caption() {
      return captionText;
    },
    querySelector: (selector) =>
      ({'.hour': hour, '.minute': minute, '.clock-date': withCaption ? caption : null})[selector] ??
      null,
    getAttribute: (name) => (name === 'aria-label' ? label : null),
    setAttribute(name, value) {
      if (name === 'aria-label') {
        writes.label++;
        label = value;
      }
    }
  };
}

const at = (h, m, s = 0) => new Date(2026, 9, 15, h, m, s);

afterEach(() => mock.restoreAll());

describe('updateDial', () => {
  it('points the hands, labels the tile and writes the date', () => {
    const clock = fakeClock();
    updateDial(clock, at(10, 10), 'en-GB');
    assert.equal(clock.hour.style.transform, 'rotate(305deg)');
    assert.equal(clock.minute.style.transform, 'rotate(60deg)');
    assert.match(clock.label, /^10:10$/);
    assert.equal(clock.caption, 'Thursday 15 October');
  });

  it('writes nothing when the minute has not changed', () => {
    const clock = fakeClock();
    updateDial(clock, at(10, 10, 0), 'en-GB');
    const first = {...clock.writes};
    assert.deepEqual(first, {transform: 2, label: 1, caption: 1});
    for (let second = 1; second < 60; second++) updateDial(clock, at(10, 10, second), 'en-GB');
    assert.deepEqual(clock.writes, first, 'fifty-nine more seconds: not one write');
  });

  it('moves on when the minute changes, and again at midnight', () => {
    const clock = fakeClock();
    updateDial(clock, at(23, 59), 'en-GB');
    updateDial(clock, new Date(2026, 9, 16, 0, 0), 'en-GB');
    assert.equal(clock.caption, 'Friday 16 October');
    assert.match(clock.label, /^0?0:00$/);
    assert.equal(clock.minute.style.transform, 'rotate(0deg)');
  });

  it('repairs what something else overwrote', () => {
    const clock = fakeClock();
    updateDial(clock, at(10, 10), 'en-GB');
    clock.setAttribute('aria-label', 'Current time'); // a morph back to the static markup
    clock.querySelector('.clock-date').textContent = ''; // and the caption lost its text
    const before = {...clock.writes};
    updateDial(clock, at(10, 10, 30), 'en-GB');
    assert.match(clock.label, /^10:10$/);
    assert.equal(clock.caption, 'Thursday 15 October');
    assert.equal(clock.writes.label, before.label + 1);
    assert.equal(clock.writes.caption, before.caption + 1);
    assert.equal(
      clock.writes.transform,
      before.transform,
      'the hands were untouched and are left alone'
    );
  });

  it('serves several tiles from one formatting pass per minute', () => {
    const formats = mock.method(Intl, 'DateTimeFormat');
    const a = fakeClock();
    const b = fakeClock();
    // a language this test file has not used yet, so the formatters are built here and counted
    updateDial(a, at(11, 11), 'fr-FR');
    const built = formats.mock.callCount();
    assert.ok(built <= 2, `at most the time and the date formatter are built (${built})`);
    updateDial(b, at(11, 11), 'fr-FR');
    updateDial(a, at(11, 11, 30), 'fr-FR');
    updateDial(b, at(11, 12), 'fr-FR');
    assert.equal(formats.mock.callCount(), built, 'no formatter is built again');
    assert.match(b.label, /12/);
  });

  it('copes with a tile that has no caption, no hands, or does not exist', () => {
    assert.doesNotThrow(() => updateDial(fakeClock({withCaption: false}), at(1, 2), 'en-GB'));
    assert.doesNotThrow(() => updateDial(null, at(1, 2), 'en-GB'));
    assert.doesNotThrow(() =>
      updateDial(
        {querySelector: () => null, getAttribute: () => null, setAttribute() {}},
        at(1, 2),
        undefined
      )
    );
  });
});
