# Contributing to HouseView

Thank you for helping. This page explains how the project is organised, how to run the checks, and how to add a widget or an
overview. The structure is described in [docs/architecture.md](docs/architecture.md); the exact contracts are in
[docs/widget-api.md](docs/widget-api.md) and [docs/overview-api.md](docs/overview-api.md). Everyone taking part is expected to
follow the [code of conduct](CODE_OF_CONDUCT.md).

Terms: a **widget** is any element on a page (clock, light, camera, ...); an **overview** is a full-screen view (the weather
scene, the photo frame, ...) that can be a screensaver, appear automatically, open when you press a widget, or be used as a
card; a **page** is one swipeable screen; the **carousel** is `custom:houseview-card`.

## Ground rules

* **Keep configurations working.** A configuration that works in a released version keeps working and renders the same.
  Changing a default, a class name, the markup or an error message needs a discussion in an issue first.
* **No runtime dependencies.** The plugin is plain ES modules with no framework and no external requests. Development tools
  (esbuild, ESLint, Prettier, puppeteer-core) are `devDependencies` only.
* **Works in the Home Assistant frontend**: Chrome 105 and the Android WebView. Do not use newer syntax or APIs than that
  without a fallback.
* **Never put real data in the repository**: no real entity ids, host names, addresses, tokens or camera images in code,
  fixtures, examples, screenshots or issues. Use `light.living_room`, `weather.home` and similar placeholders.
* **Widgets never call services directly.** All service calls go through `ctx.call`; confirmation goes through the confirm
  seam. Overviews cannot call services at all.
* **Original work only.** Do not add third-party fonts, icons, images or code that is not compatible with the MIT licence.

## Set up

You need Node 24 or newer and Google Chrome (set `CHROME_PATH` if it is not at the default location; the browser tests use it
headlessly).

```sh
git clone https://github.com/dandoingdev/HouseView.git
cd houseview
npm install
npm run build:dev      # dist/houseview.js, unminified; the browser tests run against it
npm test               # unit, browser, widget and overview suites
```

`npm run dev` runs a watch build and a static server on `http://127.0.0.1:8765`; open `/tests/preview.html` for a playground
that renders every widget variant. Nothing in the tooling contacts a real Home Assistant: tests use a mock `hass`, and the
servers listen on `127.0.0.1` only.

## Project layout

| Path | What it holds |
| --- | --- |
| `src/core/` | The engine: widget and overview registries, render context, action dispatcher, ticker, idle manager, confirm seam. Knows no widget kind |
| `src/controller/` | The `HouseViewCard` class and its mixins (events, rendering, navigation, tablet mode, overview host, ...) |
| `src/config/`, `src/layout/` | `setConfig` validation and conversion; page packing and the layouts |
| `src/widgets/<type>/` | One folder per widget. This is where most contributions go |
| `src/overviews/<type>/` | One folder per overview |
| `src/editor/` | The visual editors |
| `src/styles/` | CSS for the base, layouts, surfaces and the cascade phases |
| `tests/` | Unit, contract, browser, widget and overview suites (see [tests/README.md](tests/README.md)) |
| `tools/` | Build, generators, linters and test runners (see [tools/README.md](tools/README.md)) |
| `docs/`, `examples/` | Public documentation and example dashboards |

## Commands

| Command | What it does |
| --- | --- |
| `npm run build`, `npm run build:dev` | Production and development bundles in `dist/` |
| `npm run gen` | Regenerates `src/widgets/index.js`, `src/overviews/index.js` and the test manifests. Run after adding or removing a folder |
| `npm run gen-docs` | Regenerates `docs/widgets/*` and `docs/overviews/*` from the READMEs next to the code |
| `npm run lint`, `npm run format`, `npm run format:check` | ESLint and Prettier |
| `npm run check:widgets`, `npm run check:overviews` | The widget and overview contract linters |
| `npm run test:unit` | Node unit and contract tests |
| `npm run test:browser`, `npm run test:widgets`, `npm run test:overviews` | Browser suites against `dist/` (run `npm run build:dev` first) |
| `npm run test:overviews:input`, `:timer`, `:automatic` | Scripts that drive a real browser with real touch and keyboard events |
| `npm test` | Everything above, in order |
| `npm run size` | The size budget of the production bundle |
| `npm run perf` | The performance bench; see [docs/performance.md](docs/performance.md) |
| `npm run screenshots`, `npm run overview-shots` | Redraw `docs/images/*.png` and overview pictures from the examples and a mock `hass` |
| `npm run new:widget`, `npm run new:overview` | Scaffold a new widget or overview |

Before opening a pull request run `npm run gen`, `npm run lint`, `npm run format:check`, `npm run check:widgets`,
`npm run check:overviews`, `npm run build:dev` and `npm test`. CI runs the same checks, and also checks that the generated
files are up to date.

## Add a widget

Example: a `humidifier` widget. You touch only `src/widgets/humidifier/` plus the generated files.

1. **Scaffold.** `npm run new:widget -- --type humidifier --label "Humidifier" --domains humidifier` copies the templates into
   `src/widgets/humidifier/`, picks the next free `order` and runs the generator. The type is snake_case and equals the folder
   name.
2. **Describe it** in `index.js` with `defineWidget({...})`: `type`, `label`, `order`, `domains` and any of `defaultSize`,
   `availability`, `family`, `layoutRoles`, `options`, `validate`, `normalize`. `render(ctx)` is a pure function that returns
   **one** root element string from `ctx.tile(...)` or `ctx.root(...)`; escape everything dynamic with `ctx.esc`, and show a
   disabled "Unavailable" state when `!ctx.ok`.
3. **Add behaviour.** Put actions in `actions`, named `humidifier-<verb>`, each with an optional `guard` and `confirm` and a
   `run` that calls `ctx.call(domain, service, {entity_id: id, ...})`. Use `afterRender`, `tick`, `onHass`, `patch` or an
   `extension` only when you need DOM work or card-level features; they must be idempotent and cheap.
4. **Words and looks.** Every visible string goes in `strings.js` under keys that start with `humidifier.`; English is
   required. Styles go in `style.css`, see [CSS rules](#css-rules).
5. **Prove it.** Write `fixtures.js` (at least `ok`, `unavailable`, `missing`, and `unknown` where it matters, plus a variant per
   state the widget reads), `test.js` (browser behaviour against a recording mock `hass`) and `README.md` (front matter, a
   description, an option table that matches `options`, an example). Run `npm run gen`, `npm run check:widgets`,
   `npm run test:widgets`, `npm run lint` and `npm run gen-docs`.
6. **Announce it.** Add a line to `CHANGELOG.md` and open the pull request using the template.

The widget then exists as `custom:houseview-humidifier-card`, in the card picker as "HouseView · Humidifier", in the editor's
widget list and as `widget_type: humidifier`. No other file lists the kinds. Copy `src/widgets/light` for an icon widget and
`src/widgets/cover` for a panel with several buttons. The full contract is the [widget API](docs/widget-api.md).

## Add an overview

An overview is a module that paints a full-screen view. The same module is a screensaver (`screensaver.type: <type>`), can
start automatically or be opened by pressing a widget, and is a card (`custom:houseview-<type>-overview-card`). It can only
read data: its context has no way to call a service. Example: `energy`.

1. **Scaffold.** `npm run new:overview -- --type energy --label "Energy" --domains sensor` creates `src/overviews/energy/`
   from `tools/templates/overview/` and runs the generator.
2. **Define it** in `index.js` with `defineOverview({...})`: `type`, `label`, `order`, `entity`, `domains`, `options` and a
   `render(ctx, mode)` that returns one `ov-scene` root. `mode` is `'screensaver'` or `'card'`. Choose `activation: 'idle'`
   (the default) or `'event'` with an `autoShow` predicate; for idle overviews `priority`, `eligible` and `tap` are optional.
3. **Data.** Read state through `ctx`. Keep the data mapping in a pure `model.js` and unit-test it. If you need a websocket
   subscription, declare it in `data()`; the framework shares and releases it. Update the DOM over time only from a `tick`
   hook that patches text nodes; never re-render from it.
4. **Strings and CSS.** Strings use keys `energy_overview.*`. Styles go in `style.css` under `/* @phase overviews */`, see
   [CSS rules](#css-rules).
5. **Prove it.** Provide `fixtures.js`, `test.js` and a `README.md` with front matter. Run `npm run gen`,
   `npm run check:overviews`, `npm run test:unit`, `npm run test:overviews`, `npm run lint` and `npm run gen-docs`.
6. **Announce it** in the changelog.

The full contract, including activation, priority, eligibility, taps, manual opening and implicit entries, is the
[overview API](docs/overview-api.md).

## CSS rules

The stylesheet is assembled from small files in a fixed order, and many rules have equal specificity and are decided by
position, so order is behaviour.

1. Every CSS file is a series of sections introduced by `/* @phase <name> */`, in the order of `src/styles/phases.json`. A
   section in the wrong order is rejected by the build. A file starts with `/* @owns class-a class-b */` naming the classes it
   owns. Widget files go in `carousel-widgets` unless a surface or layout refinement needs a later phase; overviews use
   `overviews`.
2. A widget owns the selectors whose subject (the right-most compound) is one of its own classes. Selectors that name several
   widgets stay in the shared files.
3. Keep specificity at most `(0,3,0)`, no `!important` (or a `/* @important reason */` comment for a widget), no `@import`, no
   `@layer`, no `url()` (the wallpapers in `src/styles/surfaces/` are the only exception), and no rules whose subject is
   `.surface-*`, `.night-mode` or `.layout-*`.
4. Use the tokens `--hv-glass`, `--hv-edge`, `--hv-text` and `--mdc-icon-size` rather than literal colours.
5. **Weak devices.** Overview CSS may not use `filter: blur()`, `backdrop-filter`, SVG filters, `!important` or `url()`, may
   animate only `transform` and `opacity`, must not animate under `prefers-reduced-motion`, and keeps rules that apply only to
   weak devices under `.perf-lite`. Avoid large blurred or layered areas in widgets too; see
   [docs/performance.md](docs/performance.md).
6. Do not rename classes or delete rules that look unused without checking the tests: class names are used by the editor,
   the layout code and the test suites.

`npm run check:widgets` and `npm run check:overviews` check these rules.

## Tests

* **Unit and contract tests** (`npm run test:unit`) run in plain Node with a mock `hass`: the config pipeline, the registry,
  the dispatcher, the idle manager, the editors' pure functions, every widget and overview against its contract.
* **Browser suites** run in headless Chrome against the built bundle: the whole-card browser tests (`tests/browser.html`), each
  widget's `test.js` and each overview's `test.js`, plus scripts with real input events.
* A bug fix comes with a test that fails without it. A new option comes with a fixture variant and a check.
* `node --test` takes globs, not directories: use `npm run test:unit` instead of a bare `node --test`.

## Documentation and examples

* Document every option in the widget or overview `README.md`; `npm run gen-docs` turns it into the public page. Do not edit
  files in `docs/widgets/` or `docs/overviews/` by hand.
* Other docs live in `docs/`. Describe only what the code does, and use the terms widget, overview, page and carousel.
* Examples in `examples/` use placeholder entity ids and must stay valid configurations.
* Screenshots in `docs/images/` are generated from the mock `hass`; never commit a screenshot of a real home.

## Code style

* ES modules, no build-time-only syntax; Prettier decides the formatting (`npm run format`): 2 spaces, single quotes, no
  trailing commas, 100 columns.
* ESLint (`npm run lint`) enforces the module boundaries: widgets import only from `core/`, `_shared/` and their own folder;
  `core/` never imports `controller/`, `editor/` or `elements/`.
* Small, readable functions; a comment where Home Assistant behaviour is not obvious; no dead code.
* Names: widget and overview types are snake_case, action names are `<type>-<verb>`, string keys are `<type>.<key>`.

## Commits and pull requests

* One topic per pull request, branched from `main`. Describe what changed and why; link the issue.
* Commit messages: a short imperative summary line (about 70 characters), then a body when the why is not obvious. For
  example `Add the humidifier widget` or `Fix the timer display staying up after cancel`.
* Keep `CHANGELOG.md` up to date: add a line under an `Unreleased` heading in your pull request.
* The pull request template lists the checks. A visual change needs a screenshot rendered from the mock data.
* Be patient and kind in reviews; see the [code of conduct](CODE_OF_CONDUCT.md).

## Releasing (maintainers)

1. Set the new version in `package.json` and write its section in `CHANGELOG.md` (`## [x.y.z] - date`).
2. Run the full check, `npm run build` and `npm run size`.
3. Tag `vx.y.z` and push the tag. The release workflow checks that the tag, the version and the changelog agree, runs the
   checks, builds, and attaches the release files (`tools/release.mjs` lists them).
4. Try the release on a real wall tablet before telling users to upgrade.
