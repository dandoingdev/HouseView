// Stand-ins for the overviews the automatic displays name, so the framework tests never depend on the real cover art
// overview (which is written separately) and can count calls. `cover_art` here is a stub with the same contract the real
// one has: idle, priority 10, eligible while a speaker plays with a picture, gone when nothing plays.
import {defineOverview} from '../../src/core/define-overview.js';

const strings = (type) => ({
  en: {[`${type}_overview.label`]: `${type} label`, [`${type}_overview.description`]: type}
});

export const counts = {eligible: 0, boom: 0};

export const cover = defineOverview({
  type: 'cover_art',
  label: 'Cover art (stub)',
  order: 977,
  domains: ['media_player'],
  strings: strings('cover_art'),
  priority: 10,
  eligible: (ctx) => {
    counts.eligible++;
    return ctx.state?.state === 'playing' && !!ctx.attrs.entity_picture;
  },
  autoWake: (ctx) => !['playing', 'paused'].includes(ctx.state?.state),
  render: (ctx) => `<div class="ov-scene">${ctx.rawName}|${ctx.attrs.media_title ?? ''}</div>`
});

/** Idle, priority 0 (like weather), no eligible rule. */
export const plain = defineOverview({
  type: 'plain',
  label: 'Plain overview',
  order: 976,
  domains: ['sensor'],
  strings: strings('plain'),
  render: (ctx) => `<div class="ov-scene">plain:${ctx.rawName}</div>`
});

/** Idle, priority 10, always eligible: a second contender at the cover art's rank. */
export const tenA = defineOverview({
  type: 'ten_a',
  label: 'Ten A',
  order: 975,
  domains: ['sensor'],
  strings: strings('ten_a'),
  priority: 10,
  render: (ctx) => `<div class="ov-scene">tenA:${ctx.rawName}</div>`
});
export const tenB = defineOverview({
  type: 'ten_b',
  label: 'Ten B',
  order: 974,
  domains: ['sensor'],
  strings: strings('ten_b'),
  priority: 10,
  render: (ctx) => `<div class="ov-scene">tenB:${ctx.rawName}</div>`
});

/** A priority 99 overview whose eligible rule throws. */
export const boom = defineOverview({
  type: 'boom',
  label: 'Boom',
  order: 973,
  domains: ['sensor'],
  strings: strings('boom'),
  priority: 99,
  eligible: () => {
    counts.boom++;
    throw new Error('eligible exploded');
  },
  render: () => '<div class="ov-scene">boom</div>'
});
