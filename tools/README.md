# Developer tools

Requires Node 24, Google Chrome (default path `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
override with `CHROME_PATH`) for the browser tools, and the devDependencies (`npm install`). Nothing here
touches Home Assistant: the mock `hass` never calls a real service, and the servers listen on 127.0.0.1 only
(the exception, `serve.mjs --lan` for measuring a wall tablet, serves just the bench page and the bundles).

| File | Purpose |
| --- | --- |
| `build.mjs` | esbuild driver: `npm run build` (production, `dist/`), `build:dev` (unminified, inline sourcemap), `build:min` (production bundle into `dist-min/`). |
| `assemble-css.mjs`, `css-parse.mjs` | Assemble the CSS sources under `src/` in cascade-phase order (`src/styles/phases.json`); used by the build. |
| `gen-widgets.mjs` | `npm run gen`, `gen:check`: the discovery files `src/widgets/index.js`, `src/overviews/index.js` and the test manifests. |
| `gen-docs.mjs` | `npm run gen-docs`, `gen-docs:check`: `docs/widgets/*` and `docs/overviews/*` from the module READMEs. |
| `check-widgets.mjs`, `check-overviews.mjs` | The contract linters (`npm run check:widgets`, `check:overviews`). |
| `new-widget.mjs` | `npm run new:widget`, `new:overview`: scaffold a module from `templates/`. |
| `dev.mjs` | `npm run dev`: esbuild watch plus the static server. Open `/tests/browser.html` or `/tests/preview.html`. |
| `serve.mjs` | Static server. `/bundle/houseview.js` is answered with a re-export of the bundle of the chosen `--target` (`dist`, `dist-min`, `src`). |
| `run-tests.mjs` | Headless Chrome runner for pages that report into `#summary` / `#results` (`tests/browser.html`, `tests/widgets/index.html`, `tests/overviews/index.html`). `--target=dist\|dist-min\|src`, `--expect=N`; the default count comes from `tests/EXPECTED_CHECKS`. |
| `size-check.mjs` | `npm run size`: bundle size budget (a warning by default, `--strict` fails). |
| `perf-bench.mjs`, `perf-bench.html` | `npm run perf`: performance bench for low-end tablets (CDP throttling, mock hass). `--write-budgets` records `tools/perf-budgets.json`, which later runs check; without it nothing is enforced. See `docs/performance.md`. |
| `lite-glass.mjs`, `lite-glass.html` | Calibrates the opaque tint of `performance: lite` against the full glass (`--check` fails above a difference of 6). |
| `screenshots.mjs`, `mini-yaml.mjs` | `npm run screenshots`: redraws `docs/images/*.png` from `examples/*.yaml` and a mock `hass`. `--only=a,b` draws named pictures. `--out=<dir>` writes elsewhere. Pictures marked `frame: 'nspanel'` are the 480 × 480 panel inside a mock NSPanel Pro. |
| `overview-shots.mjs`, `overview-shots.html` | `npm run overview-shots`: weather overview pictures into `.tmp/overview-shots/`. |
| `release.mjs` | `npm run release`: verify the version, changelog and bundle, and stage the release assets. |
| `deploy.mjs` | `npm run deploy -- --dest <dir> [--dry-run]`: copy the release files from `dist/` to a directory. |
| `bump-cache.mjs` | `npm run bump-cache -- --file <houseview.js> --storage <lovelace_resources>`: set the HouseView resource `?v=` to `<version>-<sha256 prefix>` so browsers fetch the new file. |

`--target=dist` runs the development bundle (`npm run build:dev`); `--target=dist-min` runs the minified production
bundle built into `dist-min/` (`npm run test:browser:min` does both steps).
