// HouseView bundle entry (tools/build.mjs bundles this file into dist/houseview.js).
//
// Order matters and is the whole startup sequence:
//   1. widgets register themselves in the registry (generated src/widgets/index.js)
//   2. the editors register their elements and strings
//   3. the card elements are defined, driven by what the registry now holds
//   4. the version banner prints once
//
// The named exports are used by tests (the browser suite imports `buildScreens`, `toCards` and `fromCard` from
// the bundle) and by anyone who wants to build configs programmatically.
import './widgets/index.js';
import './overviews/index.js';
import './editor/index.js';
import {fromCard, kinds, labels, onPage, toCards} from './config/convert.js';
import {HouseViewCard} from './controller/houseview-card.js';
import * as registry from './core/registry.js';
import {getOverview, overviewList, overviewTypes} from './core/overview-registry.js';
import {DOCUMENTATION_URL, defineOnce, registerCustomCard} from './define.js';
import {registerGenericWidgetCard, registerKindCards} from './elements/register.js';
import {HouseViewWidgetCard} from './elements/widget-card.js';
import {buildScreens} from './layout/index.js';
import {VERSION} from './version.js';

// Generic card first: the carousel creates `houseview-widget-card` elements while it renders.
registerGenericWidgetCard();
registerKindCards();

defineOnce('houseview-card', HouseViewCard);
registerCustomCard({
  type: 'houseview-card',
  name: 'HouseView',
  description: 'A full-height HouseView carousel of reusable cards with native HA editing.',
  documentationURL: DOCUMENTATION_URL
});

function printBanner() {
  // Two copies of the resource (HACS plus a manual entry) print one banner.
  if (globalThis.__houseviewBanner) return;
  globalThis.__houseviewBanner = true;
  console.info(
    `%c HOUSEVIEW %c v${VERSION} `,
    'color:#fff;background:#0f8c8c;font-weight:700;border-radius:3px 0 0 3px',
    'color:#0f8c8c;background:#e6f4f4;font-weight:700;border-radius:0 3px 3px 0'
  );
}
printBanner();

export {HouseViewCard, HouseViewWidgetCard, VERSION};
export {buildScreens, fromCard, kinds, labels, onPage, registry, toCards};
export {getOverview, overviewList, overviewTypes};
