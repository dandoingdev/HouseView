# HouseView AI development rules

## Touch controls and icons

- Design for fingers on wall panels and tablets. Overview and full-screen dialog round buttons must be at least 64 × 64 CSS pixels; use the shared overview size token to scale them up on larger screens. Shared dashboard navigation and transport buttons should be at least 56 × 56 CSS pixels. Compact widget controls must retain at least 44 × 44 CSS pixels and must never overlap.
- Size the actual interactive button, not just its icon or a decorative circle. Prevent flex shrinking, use border-box sizing, and remove native padding from icon-only buttons.
- Centre icons on both axes with grid or flex. Clear inherited icon margins and baseline spacing. Keep the icon itself smaller than the target; increasing the glyph alone does not improve touch usability.
- Reuse `src/overviews/_shared/control-panel.css` and `control-panel.js` for overview controls. Define shared sizing on the scene so headers, footers, colour controls and mute controls inherit the same size.
- Preserve accessible names, native button semantics, keyboard activation, visible focus and disabled states.
- Check actual browser bounding boxes at 480 × 480, a narrow phone/card, and tablet portrait and landscape sizes. Verify target dimensions, equal circle dimensions, icon/button centre alignment (within 1 CSS pixel), no clipping or overlap, and reachable controls. Include container-query fallbacks for older supported WebViews.
- Extend existing browser interaction checks when changing shared control geometry. Verify real touch actions as well as appearance; inspect a screenshot before finishing.

## Working in this repository

- Read `CONTRIBUTING.md` and the relevant widget/overview API documentation before extending their contracts.
- Preserve existing user changes. Keep edits scoped to the request and do not reset unrelated work.
- Use synthetic entities and images in fixtures. Household data in the parent workspace must never enter this publishable repository.
- Build and run the relevant browser suites after CSS changes. Report what was verified and any remaining limitation. Editing local source does not deploy to Home Assistant; deploy only when requested.

## Maintainability and performance

- Share behaviour where its semantics match. Reuse the core locale/time-zone helpers and `src/core/intl.js`; do not introduce another formatter cache or construct Intl formatters in render/tick loops.
- Bound caches that are keyed by user input. Document their lifetime and invalidation, and verify registration, configuration changes, locale changes and disconnect/reconnect behaviour where relevant.
- Keep public registry collections defensive: callers must not be able to mutate cached registry state. Invalidate derived lookups whenever definitions change.
- Preserve DOM identity for live controls, focus, images and animations. In frequently used update code, avoid temporary collections and duplicate DOM writes when a direct traversal or change check is sufficient.
- Measure before claiming a performance improvement. Benchmark the intended visible state, ensure automatic overlays do not hide the measured dashboard, and distinguish targeted microbenchmarks from whole-app measurements.
- Keep browser suite check counts in `tests/EXPECTED_CHECKS` aligned with the actual suites so missing checks fail validation.
- GitHub CI (`.github/workflows/ci.yml`, job `check`) is the gate, and the release workflow runs the same scripts. Finish a change only after the scripts that cover it pass. Run `npm run build:dev` before any browser script: those suites load `dist/`, not `src/`. Screensaver wake, cover, prefetch, and disconnect are owned by `npm run test:overviews:input`.
- A covered screensaver wake paints under an opaque shield for two animation frames, then reveals the page. Neighbour-page prefetch waits until that reveal. Disconnect during the wake cancels that one pending paint frame and removes the layer. When a browser check fails, log the observed values next to the `FAIL` line.
- Prefer focused refactors over broad rewrites. Preserve config validation order, error messages, availability policies, locale fallbacks and supported WebView compatibility.
