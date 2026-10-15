// The contract suite every overview must pass (docs/overview-api.md, the overview twin of
// tests/contract/widget-contract.test.mjs). It runs in plain Node against src/overviews/index.js, so a new
// overview folder is covered the moment `npm run gen` lists it. With no overview folders it only says so.
import test, {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../fixtures/registry.mjs';
import {createMockHass} from '../fixtures/mock-hass.js';
import {createHost} from '../fixtures/card-host.mjs';
import {scanHtml, tagHistogram, dangerousAttributes} from '../fixtures/html-scan.mjs';
import {checkOptions, contextFor, resolveOptions} from '../../src/core/define-overview.js';
import {validateScreensaver, getOverview} from '../../src/core/overview-registry.js';
import {createRenderContext} from '../../src/core/context.js';
import * as registry from '../../src/core/registry.js';
import {hasString} from '../../src/core/i18n.js';

const OVERVIEWS_DIR = path.join(ROOT, 'src/overviews');
const REQUIRED_FILES = [
  'index.js',
  'strings.js',
  'fixtures.js',
  'test.js',
  'README.md',
  'style.css'
];
const REQUIRED_VARIANTS = ['ok', 'unavailable', 'missing'];
const HOSTILE = '<img src=x onerror=alert(1)>"\'&';

const folders = fs.existsSync(OVERVIEWS_DIR)
  ? fs
      .readdirSync(OVERVIEWS_DIR, {withFileTypes: true})
      .filter((e) => e.isDirectory() && !/^[._]/.test(e.name))
      .map((e) => e.name)
      .filter((name) => fs.existsSync(path.join(OVERVIEWS_DIR, name, 'index.js')))
      .sort()
  : [];
const filter = process.env.HV_KIND ? new Set(process.env.HV_KIND.split(',')) : null;

const read = (kind, file) => {
  const target = path.join(OVERVIEWS_DIR, kind, file);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
};

function frontMatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown ?? '');
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((line) => line.split(/:\s*/))
      .filter((pair) => pair.length >= 2)
      .map(([key, ...value]) => [key.trim(), value.join(': ').trim()])
  );
}

const hassFor = (variant, extra = {}) =>
  createMockHass({...(variant.hass || {}), ...extra, states: variant.states}).hass;

const contextOf = (overview, variant, mode, hass = hassFor(variant)) =>
  contextFor(overview, {hass, config: variant.config || {}, raw: variant.options || {}, mode});

/** exactly one root element, whose first class is ov-scene, with nothing a scene may not carry */
function sceneProblems(html) {
  const problems = [];
  const {elements, roots, problems: scanProblems} = scanHtml(html);
  problems.push(...scanProblems);
  if (roots.length !== 1)
    problems.push(`render must return exactly one root, found ${roots.length}`);
  const root = elements[roots[0]];
  if (root && root.classes[0] !== 'ov-scene') problems.push('the root must carry ov-scene first');
  if (root && 'style' in root.attrs) problems.push('the scene root carries no style attribute');
  for (const element of elements) {
    if ('id' in element.attrs) problems.push(`<${element.tag}> has an id`);
    // A picture is allowed when it is one of the overview's own ov-* layers (cover art, photo frame).
    const ownImage = element.tag === 'img' && element.classes.some((c) => c.startsWith('ov-'));
    if (
      !ownImage &&
      ['script', 'style', 'img', 'link', 'iframe', 'object', 'svg'].includes(element.tag)
    ) {
      problems.push(`<${element.tag}> is not allowed in a scene`);
    }
    if ('data-action' in element.attrs) problems.push('a scene has no data-action');
    if (/url\(|javascript:/i.test(element.attrs.style ?? '')) problems.push('url() in style');
  }
  problems.push(...dangerousAttributes(html));
  return problems;
}

if (!folders.length) {
  test('no overview folders yet: nothing to check', () => {
    assert.deepEqual(folders, []);
  });
} else {
  const index = await import(pathToFileURL(path.join(OVERVIEWS_DIR, 'index.js')).href);

  describe('overview registry', () => {
    it('registers exactly the overview folders (src/overviews/index.js is fresh)', () => {
      assert.deepEqual(
        index.overviews.map((o) => o.type).sort(),
        folders,
        'registered overviews differ from src/overviews/* folders; run `npm run gen`'
      );
    });

    it('has unique type, order, tag and derived widget order', () => {
      const seen = new Map();
      const problems = [];
      for (const overview of index.overviews) {
        for (const [what, key] of [
          ['order', overview.order],
          ['tag', overview.widget.tag],
          ['widget order', overview.widget.order],
          ['widget type', overview.widget.type]
        ]) {
          const id = `${what}:${key}`;
          if (seen.has(id))
            problems.push(`${what} "${key}" used by ${seen.get(id)} and ${overview.type}`);
          else seen.set(id, overview.type);
        }
      }
      assert.deepEqual(problems, []);
    });
  });

  for (const overview of index.overviews) {
    const kind = overview.type;
    if (filter && !filter.has(kind)) continue;

    describe(`overview contract: ${kind}`, () => {
      it('has the required files, in a folder named after the type', () => {
        assert.ok(folders.includes(kind), `no src/overviews/${kind} folder`);
        const missing = REQUIRED_FILES.filter((file) => read(kind, file) === null);
        assert.deepEqual(missing, [], `src/overviews/${kind} is missing files`);
      });

      it('is a frozen, well-formed definition with a derived widget', () => {
        assert.ok(Object.isFrozen(overview), 'defineOverview freezes the module');
        assert.ok(Object.isFrozen(overview.options));
        assert.match(overview.type, /^[a-z][a-z0-9_]*$/);
        assert.ok(Number.isInteger(overview.order));
        const widget = overview.widget;
        assert.equal(widget.type, `${kind}_overview`);
        assert.equal(widget.overview, kind);
        assert.equal(widget.order, 200 + overview.order);
        assert.equal(widget.entity, 'custom');
        assert.equal(widget.availability, 'always');
        assert.equal(widget.defaultSize, 'large');
        assert.equal(getOverview(kind), overview);
        assert.equal(registry.getWidget(widget.type), widget);
        assert.equal(
          registry.widgetByTag?.(widget.tag),
          widget,
          'registry.widgetByTag(tag) resolves the derived widget (integration patch P1)'
        );
        assert.equal(widget.tag, `houseview-${kind.replaceAll('_', '-')}-overview-card`);
      });

      it('declares how it starts: idle (default) or event with an autoShow predicate', () => {
        assert.ok(['idle', 'event'].includes(overview.activation), 'activation is idle or event');
        if (overview.activation === 'event') {
          assert.equal(typeof overview.autoShow, 'function', 'an event overview needs autoShow');
          // An event overview is never started by idle time, so it owes the framework nothing about idle behaviour:
          // no idle_timeout option, no tick hook is required, and `idle_timeout` in its block is only accepted.
          assert.equal('idle_timeout' in overview.options, false);
        } else {
          assert.equal(overview.autoShow, undefined, 'autoShow belongs to activation: event');
        }
        if (overview.autoWake !== undefined) assert.equal(typeof overview.autoWake, 'function');
        const fm = frontMatter(read(kind, 'README.md'));
        if (fm?.activation !== undefined) {
          assert.equal(
            fm.activation,
            overview.activation,
            'README activation matches the definition'
          );
        }
      });

      it('has strings that are prefixed, complete in English and registered', async () => {
        const strings = (
          await import(pathToFileURL(path.join(OVERVIEWS_DIR, kind, 'strings.js')).href)
        ).default;
        const prefix = `${kind}_overview.`;
        assert.ok(strings.en, 'strings.js must export {en: {...}}');
        for (const [language, table] of Object.entries(strings)) {
          for (const key of Object.keys(table)) {
            assert.ok(key.startsWith(prefix), `[${language}] ${key} must start with ${prefix}`);
            if (language !== 'en')
              assert.ok(key in strings.en, `[${language}] ${key} has no English`);
          }
        }
        assert.ok(strings.en[`${prefix}label`] && strings.en[`${prefix}description`]);
        assert.ok(hasString(`${prefix}label`), 'registerOverview registers the strings');
        for (const key of ['screensaver.dismiss', 'screensaver.more_info']) {
          assert.ok(hasString(key), `${key} is a core string`);
        }
        for (const [key, spec] of Object.entries(overview.options)) {
          if (spec.type === 'enum' || spec.type === 'enum_list') {
            const missing = spec.values.filter(
              (v) => !strings.en[`${prefix}option.${key}.value.${v}`]
            );
            assert.deepEqual(missing, [], `option ${key}: enum values without a label string`);
          }
        }
      });

      it('has README front matter that matches the definition', () => {
        const fm = frontMatter(read(kind, 'README.md'));
        assert.ok(fm, 'README.md must start with a --- front matter block');
        for (const key of ['type', 'label', 'entity', 'domains', 'since']) {
          assert.ok(fm[key], `front matter lacks \`${key}\``);
        }
        assert.equal(fm.type, kind);
        assert.equal(fm.label, overview.label);
        assert.equal(fm.entity, overview.entity);
        assert.deepEqual(
          fm.domains
            .replace(/^\[|\]$/g, '')
            .split(/\s*,\s*/)
            .filter(Boolean),
          [...overview.domains]
        );
      });

      it('has fixtures with ok, unavailable, missing (and unknown)', async () => {
        const {variants} = await import(
          pathToFileURL(path.join(OVERVIEWS_DIR, kind, 'fixtures.js')).href
        );
        const need = overview.entity === 'none' ? [] : [...REQUIRED_VARIANTS, 'unknown'];
        assert.deepEqual(
          need.filter((name) => !variants?.[name]),
          [],
          'missing variants'
        );
        assert.ok(variants.ok, 'ok variant');
      });

      it('has default options that pass their own checks', () => {
        const defaults = resolveOptions(overview, {entity: `${overview.domains[0] ?? 'sensor'}.x`});
        assert.doesNotThrow(() => checkOptions(overview, defaults));
      });

      describe('rendering', async () => {
        const fixtures = await import(
          pathToFileURL(path.join(OVERVIEWS_DIR, kind, 'fixtures.js')).href
        );
        for (const [name, variant] of Object.entries(fixtures.variants ?? {})) {
          for (const mode of ['screensaver', 'card']) {
            it(`${name}: renders one ov-scene root in ${mode} mode`, () => {
              const html = overview.render(contextOf(overview, variant, mode), mode);
              assert.equal(typeof html, 'string');
              assert.deepEqual(sceneProblems(html), []);
              assert.equal(
                html,
                overview.render(contextOf(overview, variant, mode), mode),
                'render is pure: the same input gives the same markup'
              );
            });
          }

          if (!name.startsWith('invalid')) {
            it(`${name}: its options pass screensaver validation`, () => {
              assert.doesNotThrow(() =>
                validateScreensaver({widgets: [{}], screensaver: {type: kind, ...variant.options}})
              );
            });
          }

          it(`${name}: card mode through the derived widget renders a section with the scene`, () => {
            const entity = variant.options?.entity;
            const host = createHost({
              states: variant.states,
              hass: variant.hass,
              config: {
                widgets: [{type: overview.widget.type, ...variant.options}],
                ...(variant.config || {})
              }
            });
            const html = overview.widget.render(
              createRenderContext(host, host._config.widgets[0], 2)
            );
            const {elements, roots, problems} = scanHtml(html);
            assert.deepEqual(problems, []);
            assert.equal(roots.length, 1);
            const root = elements[roots[0]];
            assert.equal(root.tag, 'section');
            assert.equal(root.attrs['data-widget'], '2');
            const asTile = variant.options?.display === 'tile';
            assert.deepEqual(root.classes.slice(0, 3), [
              'ov',
              `ov-${kind}`,
              asTile ? 'ov-mode-tile' : 'ov-mode-card'
            ]);
            assert.equal(root.attrs['data-overview'], kind);
            if (asTile) {
              assert.ok(elements.some((e) => e.classes[0] === 'ov-tile-face'));
              assert.equal(
                elements.filter((e) => e.attrs['data-action'] === 'overview-open').length,
                1,
                'one open button'
              );
              return;
            }
            assert.ok(elements.some((e) => e.classes[0] === 'ov-scene'));
            if (overview.tap.card === 'info' && entity) {
              assert.equal(
                elements.filter((e) => e.attrs['data-action'] === 'info').length,
                1,
                'one more-info button'
              );
            }
          });
        }

        it('hostile names create no element', () => {
          const variant = fixtures.variants.ok;
          const states = Object.fromEntries(
            Object.entries(variant.states).map(([id, value]) => [
              id,
              {...value, attributes: {...value.attributes, friendly_name: HOSTILE}}
            ])
          );
          const hostile = {
            ...variant,
            states,
            options: {...variant.options, ...(overview.options.name ? {} : {}), name: HOSTILE}
          };
          for (const mode of ['screensaver', 'card']) {
            for (const v of [hostile, {...variant, states}]) {
              const html = overview.render(contextOf(overview, v, mode), mode);
              const histogram = tagHistogram(html);
              // the overview's own picture layers (class ov-*) may exist; none may come from the hostile text
              const ownImages = (html.match(/<img class="ov-/g) || []).length;
              assert.equal((histogram.img ?? 0) - ownImages, 0, 'no <img> was created from text');
              assert.deepEqual(dangerousAttributes(html), []);
              assert.ok(!html.includes('onerror=alert(1)>'), 'the payload was escaped');
            }
          }
        });

        it('never calls a service, even when callService would throw', async () => {
          const calls = [];
          for (const [name, variant] of Object.entries(fixtures.variants ?? {})) {
            const hass = hassFor(variant);
            hass.callService = (...args) => {
              calls.push([name, ...args]);
              throw new Error('callService must not be reached from an overview');
            };
            for (const mode of ['screensaver', 'card']) {
              overview.render(contextOf(overview, variant, mode, hass), mode);
            }
            overview.autoWake?.(contextOf(overview, variant, 'screensaver', hass));
            overview.autoShow?.(contextOf(overview, variant, 'screensaver', hass));
            const host = createHost({
              states: variant.states,
              hass: variant.hass,
              config: {
                widgets: [{type: overview.widget.type, ...variant.options}],
                ...(variant.config || {})
              }
            });
            host._hass.callService = hass.callService;
            overview.widget.render(createRenderContext(host, host._config.widgets[0], 0));
          }
          assert.deepEqual(calls, []);
        });

        if (overview.activation === 'event') {
          it('autoShow and autoWake are pure predicates over every fixture', () => {
            for (const [name, variant] of Object.entries(fixtures.variants ?? {})) {
              for (const hook of ['autoShow', 'autoWake']) {
                if (!overview[hook]) continue;
                const first = overview[hook](contextOf(overview, variant, 'screensaver'));
                const again = overview[hook](contextOf(overview, variant, 'screensaver'));
                assert.equal(typeof first, 'boolean', `${name}: ${hook} returns a boolean`);
                assert.equal(first, again, `${name}: ${hook} is deterministic`);
              }
            }
          });

          it('autoShow is false for an unavailable, unknown or missing entity', () => {
            for (const name of ['unavailable', 'unknown', 'missing']) {
              const variant = fixtures.variants[name];
              if (!variant) continue;
              assert.equal(
                overview.autoShow(contextOf(overview, variant, 'screensaver')),
                false,
                `${name}: nothing to show`
              );
            }
          });

          it('autoShow and autoWake never both want the same moment (no show/dismiss flapping)', () => {
            if (!overview.autoWake) return;
            for (const [name, variant] of Object.entries(fixtures.variants ?? {})) {
              const ctx = contextOf(overview, variant, 'screensaver');
              assert.ok(
                !(overview.autoShow(ctx) && overview.autoWake(ctx)),
                `${name}: autoShow and autoWake are both true`
              );
            }
          });
        }

        it('declares its place among idle overviews: an integer priority, an optional pure eligible rule', () => {
          assert.ok(Number.isInteger(overview.priority), 'priority is an integer (default 0)');
          const fm = frontMatter(read(kind, 'README.md'));
          if (fm?.priority !== undefined) {
            assert.equal(Number(fm.priority), overview.priority, 'README priority matches');
          }
          if (overview.activation === 'event') {
            assert.equal(overview.eligible, undefined, 'an event overview has no eligible rule');
            assert.equal(overview.priority, 0, 'an event overview is above every idle one');
            return;
          }
          if (overview.eligible === undefined) return;
          assert.equal(typeof overview.eligible, 'function');
          for (const [name, variant] of Object.entries(fixtures.variants ?? {})) {
            const first = overview.eligible(contextOf(overview, variant, 'screensaver'));
            const again = overview.eligible(contextOf(overview, variant, 'screensaver'));
            assert.equal(typeof first, 'boolean', `${name}: eligible returns a boolean`);
            assert.equal(first, again, `${name}: eligible is deterministic`);
            if (['unavailable', 'unknown', 'missing'].includes(name)) {
              assert.equal(first, false, `${name}: an entity that is not there is never eligible`);
            }
            if (overview.autoWake) {
              assert.ok(
                !(first && overview.autoWake(contextOf(overview, variant, 'screensaver'))),
                `${name}: eligible and autoWake are both true (it would show and be dismissed at once)`
              );
            }
          }
        });

        it('a context has no way to change Home Assistant', () => {
          const ctx = contextOf(overview, fixtures.variants.ok, 'screensaver');
          for (const forbidden of ['call', 'card', 'confirm', 'callService', 'isPending', 'info']) {
            assert.equal(forbidden in ctx, false, forbidden);
          }
        });
      });
    });
  }
}
