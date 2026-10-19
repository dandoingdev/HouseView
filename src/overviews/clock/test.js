export default async function ({mount, check, variants, wait}) {
  let t = await mount(variants.ok);
  check(
    'bold face has four large quarter-hour numerals',
    t
      .qa('.ov-clock-numeral')
      .map((n) => n.textContent)
      .join(',') === '12,3,6,9'
  );
  check(
    'default background uses the dashboard surface base',
    getComputedStyle(t.q('.ov-clock-backdrop')).backgroundColor === 'rgb(129, 124, 112)'
  );
  check(
    'hands and accessible local time are present',
    t.qa('.ov-clock-hand').length === 3 && !!t.q('.ov-clock-board').getAttribute('aria-label')
  );
  t = await mount(variants.sculpted);
  check(
    'sculpted face has a complete ring and configurable blush background',
    t.qa('.ov-clock-numeral').length === 12 &&
      getComputedStyle(t.q('.ov-clock-backdrop')).backgroundColor === 'rgb(224, 188, 185)'
  );
  check(
    'sculpted face supports hiding the date and changing the seconds hand',
    getComputedStyle(t.q('.ov-clock-date')).display === 'none' &&
      getComputedStyle(t.q('.ov-clock-second')).backgroundColor === 'rgb(238, 78, 185)'
  );
  t = await mount(variants.dark);
  check(
    'dark backgrounds use light numerals',
    getComputedStyle(t.q('.ov-clock-numeral')).color === 'rgb(247, 250, 248)'
  );
  t = await mount(variants.light);
  check(
    'light backgrounds keep visible dark hands',
    getComputedStyle(t.q('.ov-clock-hour')).backgroundColor === 'rgb(39, 49, 44)'
  );
  t = await mount(variants.noSeconds);
  check('seconds can be hidden', getComputedStyle(t.q('.ov-clock-second')).display === 'none');
  for (const name of ['digital', 'digitalStacked']) {
    t = await mount(variants[name]);
    check(
      `${name} shows digital hours/minutes with no analogue hands`,
      !!t.q('.ov-clock-digital-hour') && !!t.q('.ov-clock-digital-minute') && !t.q('.ov-clock-hand')
    );
    const board = t.q('.ov-clock-board').getBoundingClientRect();
    check(
      `${name} keeps every digital part inside its square`,
      t
        .qa('.ov-clock-digital-hour,.ov-clock-digital-minute,.ov-clock-digital-meta,.ov-clock-date')
        .every((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.left >= board.left &&
            r.right <= board.right &&
            r.top >= board.top &&
            r.bottom <= board.bottom
          );
        })
    );
  }
  t = await mount(variants.digital12);
  check(
    'digital 12-hour mode shows its localised period and zero-padded minutes',
    t.text('.ov-clock-digital-hour') === '07' &&
      t.text('.ov-clock-digital-minute') === '05' &&
      t.text('.ov-clock-digital-period') === 'PM'
  );
  t = await mount(variants.digitalNoSeconds);
  check(
    'digital seconds can be hidden',
    getComputedStyle(t.q('.ov-clock-digital-second')).display === 'none'
  );
  t = await mount(variants.digitalNoDate);
  check(
    'stacked digital date can be hidden',
    getComputedStyle(t.q('.ov-clock-date')).display === 'none'
  );
  t = await mount(variants.digital, {mode: 'screensaver', freeze: false});
  const digits = t.q('.ov-clock-digital-second');
  const previousDigits = digits.textContent;
  t.advance(1);
  await t.settle();
  check(
    'digital ticks patch the existing seconds in place without services',
    t.q('.ov-clock-digital-second') === digits &&
      digits.textContent !== previousDigits &&
      t.calls.length === 0
  );

  t = await mount(variants.ok, {mode: 'screensaver', freeze: false});
  await t.settle();
  const second = t.q('.ov-clock-second');
  const delayBefore = second.style.getPropertyValue('--clock-second-delay');
  check(
    'analogue seconds sweep on the compositor',
    second.hasAttribute('data-sweep') && !!delayBefore
  );
  t.advance(4);
  await t.settle();
  check(
    'shared ticker leaves the sweeping hand in place without a transform write',
    t.q('.ov-clock-second') === second &&
      second.hasAttribute('data-sweep') &&
      !second.style.transform &&
      second.style.getPropertyValue('--clock-second-delay') === delayBefore
  );
  check('clock never calls services', t.calls.length === 0);
  t.layer.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  await wait(400);
  check('Escape wakes the dashboard', !t.layer);
}
