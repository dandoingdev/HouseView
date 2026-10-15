# Tests

`npm test` runs everything below. `node --test` takes globs, not directories: `node --test "tests/unit/*.test.mjs"`.

| Suite | Files | Command |
| --- | --- | --- |
| Unit and contract (Node) | `tests/unit/*.test.mjs`, `tests/contract/*.test.mjs`, `tests/overviews/*.test.mjs` | `npm run test:unit` |
| Browser suite (real Chrome, mock hass) | `tests/browser.html`, `tests/EXPECTED_CHECKS` | `npm run test:browser`, `npm run test:browser:min` (production bundle) |
| Widget suite: every widget's `fixtures.js` and `test.js` | `tests/widgets/`, `src/widgets/<kind>/{fixtures,test}.js` | `npm run test:widgets` |
| Overview suite and real-input scripts | `tests/overviews/`, `src/overviews/<kind>/{fixtures,test}.js` | `npm run test:overviews`, `test:overviews:input`, `test:overviews:timer`, `test:overviews:automatic` |
| Widget and overview linters | `tools/check-widgets.mjs`, `tools/check-overviews.mjs` | `npm run check:widgets`, `npm run check:overviews` |

* `tests/contract/widget-contract.test.mjs` runs every registered widget through the widget contract
  (`docs/widget-api.md`); `check-widgets.test.mjs` tests the linter against `tests/fixtures/mini-engine`, a
  small tree of good and deliberately bad widgets.
* `tests/browser.html` must report exactly the number of checks in `tests/EXPECTED_CHECKS`, so a check that stops
  running fails the suite. Update the number when you add or remove a check.
* `tests/preview.html` mounts every widget variant for eyeballing (`npm run dev`, then open it).
* `tests/fixtures/` holds the shared helpers: `mock-hass.js` (a mock `hass` that records service calls),
  `node-env.mjs` (fixed clock and a stub `window`), `card-host.mjs` (a stand-in controller), `registry.mjs`,
  `html-scan.mjs` and `contract-rules.mjs`.
* A widget's own tests live next to it: `fixtures.js` (named variants of states and options) and `test.js`.
