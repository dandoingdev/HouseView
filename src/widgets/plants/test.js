// Browser behaviour test. Runs against dist/houseview.js with a recording mock hass (no network, no HA).
export default async function ({mount, check, variants}) {
  let t = await mount(variants.ok);
  const pods = t.qa('.plants-pod');
  check('a pod per plant', pods.length === 3);
  check(
    'the ring shows the humidity and the pod its temperature',
    pods[0].querySelector('.plants-value')?.textContent.startsWith('54') &&
      pods[0].querySelector('.plants-temp')?.textContent === '21.4°C' &&
      pods[0].style.getPropertyValue('--p') === '54'
  );
  check(
    'a plant without a temperature sensor shows a dash',
    pods[2].querySelector('.plants-none')?.textContent === '—'
  );
  check(
    'every plant in range is happy',
    pods.map((pod) => pod.dataset.state).join() === 'ok,ok,ok' &&
      t.text('.plants-summary') === 'All happy'
  );
  await t.click('plants-info', 'sensor.cactus_humidity');
  check(
    'pressing a plant opens the more-info of its humidity sensor',
    t.infos.join() === 'sensor.cactus_humidity' && t.calls.length === 0
  );

  await t.hold('.plants-pod');
  check(
    'holding a plant opens the full-screen plants view',
    !!t.card.shadowRoot.querySelector('.ov-plants-scene') && t.calls.length === 0
  );

  t = await mount(variants.care);
  check(
    'dry, wet and (per-plant floor) dry plants are flagged',
    t
      .qa('.plants-pod')
      .map((pod) => pod.dataset.state)
      .join() === 'dry,wet,dry'
  );
  check(
    'the summary counts the plants that need care',
    t.text('.plants-summary') === '3 need care'
  );
  check('a low battery is marked', !!t.q('.plants-battery'));

  t = await mount(variants.temperature);
  check(
    'a cold room and a hot Fahrenheit reading tint the temperature',
    t
      .qa('.plants-meta')
      .map((meta) => meta.dataset.temp)
      .slice(0, 2)
      .join() === 'cold,hot'
  );

  t = await mount(variants.unavailable);
  check(
    'unavailable sensors give offline pods with a dash',
    t.qa('.plants-pod[data-state="offline"]').length === 3 &&
      t.text('.plants-value').startsWith('—')
  );

  t = await mount(variants.missing);
  check('missing sensors render calmly', t.qa('.plants-pod').length === 3);

  t = await mount(variants.one);
  check('a single plant renders one pod', t.qa('.plants-pod').length === 1);
}
