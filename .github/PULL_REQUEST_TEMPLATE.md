## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm run gen` leaves no diff, and `npm run lint` and `npm run format:check` are clean
- [ ] `npm run check:widgets`, `npm run check:overviews` and `npm run test:unit` pass
- [ ] `npm run build:dev && npm test` pass
- [ ] New or changed widget: fixtures, `test.js`, `strings.js` and the README updated; see [CONTRIBUTING.md](../CONTRIBUTING.md) and [docs/widget-api.md](../docs/widget-api.md)
- [ ] New or changed overview: `npm run check:overviews` and `npm run test:overviews` pass; see [docs/overview-api.md](../docs/overview-api.md)
- [ ] Documentation changed: `npm run gen-docs` leaves no diff (the pages in `docs/widgets` and `docs/overviews` are generated)
- [ ] Visual change: a screenshot rendered from the mock data is attached, or the difference is explained above
- [ ] New config option: documented in `docs/configuration.md` or the widget or overview README, with an example that validates
- [ ] CHANGELOG.md has an entry
- [ ] No real entity ids, hostnames, addresses, tokens or camera images in code, fixtures, examples, screenshots or this description
