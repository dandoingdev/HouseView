# mini-engine

A throw-away, ~150 line implementation of the engine contract (`defineWidget`, registry, render context, dispatcher)
plus two reference widgets written straight from docs/WIDGET-API.md sections 12 and 13 (`light`, `cover`) and eight
deliberately broken `bad_*` widgets. It exists ONLY to test the test harness before the real engine is merged:

* `tests/contract/harness-meta.test.mjs` runs the contract suite against this tree
  (`HV_ROOT=tests/fixtures/mini-engine`) and asserts that the good widgets pass and every bad widget is caught.
* `tools/check-widgets.mjs --root=tests/fixtures/mini-engine` is exercised the same way.

It is not shipped, not linted, and must never be imported by `src/`. Linters and formatters must ignore this folder
(it contains intentionally wrong code), and a bare `node --test` must not be pointed at it.
