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

## Commit and release

This directory is the git repo. The parent workspace is not. Do not read workflows, `tools/release.mjs`, `CONTRIBUTING.md`, or search the tree for the version.

When asked to commit and release:

1. In `repo/`: `git status -sb`, `git log -1 --oneline`, and `git tag -l 'v*' --sort=-v:refname | head -1`. Read only the `## [Unreleased]` block in `CHANGELOG.md`; stop at the next `##`.
2. If the worktree is dirty, commit that work alone first (imperative subject, why in the body). Do not mix it with the version bump.
3. If `HEAD` is already `v<package.json version>` and Unreleased has no bullets, stop. That release already exists.
4. Next version from Unreleased: patch when every bullet is Fixed; minor when any bullet is Added or Changed. Ask before a major. Changelog date is today.
5. `npm version <x.y.z> --no-git-tag-version` updates `package.json` and `package-lock.json` only.
6. Move the Unreleased bullets under `## [x.y.z] - YYYY-MM-DD`. Leave `## [Unreleased]` empty. Add:

```
### Updating

Install the release through HACS or replace the manual installation files, then refresh the Home Assistant frontend and any kiosk or companion-app cache. If the browser retains an older bundle, update the resource cache-busting version to `/local/houseview/houseview.js?v=x.y.z`.
```

7. In `README.md`, change only the cache-bust example (`/local/houseview/houseview.js?v=`) to the new version. Do not replace other version strings. `package-lock.json` contains unrelated dependency versions.
8. Commit: `Release HouseView x.y.z with <shortest user-facing phrase>.` One sentence in the body on why it matters.
9. **Before tagging or pushing the release**, from this directory run `npm run lint` and `npm run test:release`. Do not tag, do not push the version commit to a release branch, and do not push `vx.y.z` until both succeed. `test:release` is the local stand-in for the release workflow (unit, both browser bundles, widgets, overviews, and the real-input scripts including panel). A green lint alone is not enough: v1.10.0's first release PR failed overview and panel suites that still expected hold-only more-info after the short-press tile rule. Fix failures, amend or add commits as allowed, and re-run until green. Prefer waiting for the PR `check` job to pass before merging when `main` is protected. Dropping keys by destructuring (`{surface, layout, ...rest}`) is an unused binding: name them `_surface` and `_layout`. Do not repeat an object key. A page edit does not change the wallpaper: the shell class follows the card `wallpaper` (teal by default), not a page `surface`.
10. Only after step 9 is green: `git tag -a vx.y.z -m "HouseView x.y.z"` on that commit. Never move an existing tag.
11. Push the branch (or merge the release PR), then `git push origin vx.y.z`. Do not run `gh release create`; the release workflow publishes from the tag. If a tag's release workflow fails before a GitHub release exists, fix on main and move that unpublished tag. Do not move a tag that already has a GitHub release. Do not deploy to Home Assistant or edit the parent `RELEASE-STATUS.md` unless the user asked for a local deploy.
12. Reply with the version, the commit, and `https://github.com/dandoingdev/HouseView/releases/tag/vx.y.z`.
