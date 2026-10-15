// Automatic conformance suite: every REGISTERED widget must obey docs/widget-api.md.
//
//   node --test tests/contract/widget-contract.test.mjs
//   HV_KIND=cover node --test tests/contract/widget-contract.test.mjs        (or: -- --kind=cover)
//
// With an empty src/ the suite reports "no widgets registered yet" and passes; as soon as a widget is registered it
// is held to the full contract. All engine knowledge (what `card` must offer core/context.js and core/dispatch.js)
// lives in tests/fixtures/card-host.mjs.

import {describe, it, test} from 'node:test';
import assert from 'node:assert/strict';
import {pinTimeZone, withEnv, trapDom, deepFreeze, FIXED_NOW} from '../fixtures/node-env.mjs';
import {
  loadRegistry,
  loadFixtures,
  loadStrings,
  readWidgetFile,
  widgetFolders,
  kindFilter
} from '../fixtures/registry.mjs';
import {createHost, normalizeForNew} from '../fixtures/card-host.mjs';
import {mockFromVariant, HASS_FLAVOURS} from '../fixtures/mock-hass.js';
import {scanHtml, actionsIn, dangerousAttributes} from '../fixtures/html-scan.mjs';
import * as rules from '../fixtures/contract-rules.mjs';

pinTimeZone();

const loaded = await loadRegistry();
const filter = kindFilter();
const MATRIX_SIZES = [undefined, 'normal', 'wide', 'tall', 'large'];
const EVIL = '<img src=x onerror=alert(1)>';

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const ownsKey = (actions, name) =>
  Object.keys(actions || {}).some((k) =>
    k.endsWith('*') ? name.startsWith(k.slice(0, -1)) : k === name
  );
const actionDefFor = (def, name) => {
  const tables = [def.actions, def.extension?.actions];
  for (const table of tables) {
    if (!table) continue;
    if (table[name]) return table[name];
    for (const [k, v] of Object.entries(table))
      if (k.endsWith('*') && name.startsWith(k.slice(0, -1))) return v;
  }
  return null;
};

/** Does some module (a widget, an extension, a core action or a feature) own this data-action? */
function resolves(name) {
  const reg = loaded.core.registry;
  if (reg?.resolveAction) {
    try {
      if (reg.resolveAction(name)) return true;
    } catch {
      /* fall through to the table based answer */
    }
  }
  if (rules.CORE_ACTIONS.includes(name) || rules.FEATURE_ACTIONS.includes(name)) return true;
  for (const def of loaded.widgets.values())
    if (ownsKey(def.actions, name) || ownsKey(def.extension?.actions, name)) return true;
  return false;
}

/** All render cases of a widget: variant x size x pending (+ a 'bare' hass flavour for the default size). */
function* renderCases(def, variants) {
  for (const [variantName, variant] of Object.entries(variants)) {
    for (const size of MATRIX_SIZES) {
      for (const pending of [false, true]) {
        const flavours = size === undefined && !pending ? Object.keys(HASS_FLAVOURS) : ['default'];
        for (const flavour of flavours)
          yield {
            variantName,
            variant,
            size,
            pending,
            flavour,
            label: `${def.type}/${variantName} [size=${size ?? '-'} pending=${pending} hass=${flavour}]`
          };
      }
    }
  }
}

function buildCase(def, c, {states, widgetPatch = {}} = {}) {
  const widget = {
    type: def.type,
    ...c.variant.widget,
    ...(c.size ? {size: c.size} : {}),
    ...widgetPatch
  };
  const pending = c.pending && widget.entity ? [widget.entity] : [];
  const variant = states ? {...c.variant, states} : c.variant;
  const mock = mockFromVariant(variant, HASS_FLAVOURS[c.flavour] || {});
  const host = createHost({
    mock,
    config: {...(c.variant.config || {}), widgets: [widget]},
    pending
  });
  const normalised = normalizeForNew(def, widget, host._config);
  host._config = {...host._config, widgets: [normalised]};
  return {host, widget: normalised, mock};
}

const renderIn = (def, host, widget, index = 0, {trap = false, now = FIXED_NOW} = {}) =>
  withEnv(
    () => {
      const ctx = loaded.core.context.createRenderContext(host, widget, index);
      if (!trap) return def.render(ctx);
      const {result, violations} = trapDom(() => def.render(ctx));
      assert.deepEqual(violations, [], 'render touched the DOM or window');
      return result;
    },
    {now}
  );

const fail = (failures, max = 10) =>
  `${failures.length} problem(s):\n${failures.slice(0, max).join('\n')}${failures.length > max ? `\n... and ${failures.length - max} more` : ''}`;

function frontMatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown || '');
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => l.split(/:\s*/))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k.trim(), v.join(': ').trim()])
  );
}

function ownedClasses(css) {
  const owns = new Set();
  let found = false;
  for (const m of (css || '').matchAll(/@owns\s+([^*]*?)\s*\*\//g)) {
    found = true;
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => owns.add(c.replace(/^\./, '')));
  }
  return found ? owns : null;
}

// ---------------------------------------------------------------------------------------------------------------------

if (!loaded.available) {
  test('widget contract (no widgets registered yet)', {skip: loaded.reason}, () => {});
  if (loaded.errors.length) {
    test('widget contract: modules that failed to import', () => {
      assert.fail(
        loaded.errors
          .map((e) => `${e.file}: ${e.error.stack?.split('\n')[0] || e.error.message}`)
          .join('\n')
      );
    });
  }
} else {
  describe('registry', () => {
    it('imported without errors', () => {
      assert.deepEqual(
        loaded.errors.map((e) => `${e.file}: ${e.error.message}`),
        []
      );
    });

    it('registers exactly the widget folders (src/widgets/index.js is fresh)', () => {
      const folders = widgetFolders();
      const types = [...loaded.widgets.keys()].sort();
      assert.deepEqual(
        types,
        folders,
        'registered types differ from src/widgets/* folders; run `npm run gen`'
      );
    });

    it('has unique order, tag, alias and action names', () => {
      const problems = [];
      const seen = (map, key, owner, what) => {
        if (map.has(key))
          problems.push(`${what} "${key}" used by both ${map.get(key)} and ${owner}`);
        else map.set(key, owner);
      };
      const orders = new Map();
      const tags = new Map();
      const aliases = new Map();
      const actions = new Map();
      for (const [type, def] of loaded.widgets) {
        seen(orders, def.order, type, 'order');
        seen(tags, `houseview-${type}-card`, type, 'tag');
        for (const a of def.aliases || []) {
          seen(aliases, a, type, 'alias');
          if (loaded.widgets.has(a)) problems.push(`alias "${a}" of ${type} is also a widget type`);
        }
        for (const name of [
          ...Object.keys(def.actions || {}),
          ...Object.keys(def.extension?.actions || {})
        ]) {
          seen(actions, name, type, 'action');
          if (rules.CORE_ACTIONS.includes(name) || rules.FEATURE_ACTIONS.includes(name))
            problems.push(`${type} declares "${name}" which core owns`);
        }
      }
      assert.deepEqual(problems, []);
    });

    it('has order values that are integers', () => {
      for (const [type, def] of loaded.widgets)
        assert.ok(Number.isInteger(def.order) && def.order > 0, `${type}.order`);
    });
  });

  for (const [type, def] of loaded.widgets) {
    if (filter && !filter.has(type)) continue;
    describe(`contract: ${type}`, () => {
      // ---- files and static shape ------------------------------------------------------------------------------------
      it('has the required files', () => {
        const missing = [
          'index.js',
          'strings.js',
          'fixtures.js',
          'test.js',
          'README.md',
          'style.css'
        ].filter((f) => readWidgetFile(type, f) === null);
        assert.deepEqual(missing, [], `src/widgets/${type} is missing files`);
      });

      it('is a frozen, well-formed definition', () => {
        const problems = [];
        const check = (ok, msg) => ok || problems.push(msg);
        check(Object.isFrozen(def), 'definition is not frozen (use defineWidget)');
        check(rules.TYPE_NAME.test(def.type), `type "${def.type}" is not snake_case`);
        check(
          typeof def.label === 'string' && def.label.length > 0,
          'label must be a non-empty string'
        );
        check(typeof def.render === 'function', 'render must be a function');
        check(
          rules.ENTITY_POLICIES.includes(def.entity),
          `entity must be one of ${rules.ENTITY_POLICIES}`
        );
        check(Array.isArray(def.domains), 'domains must be an array');
        if (def.entity === 'none')
          check(def.domains.length === 0, 'entity "none" widgets must have no domains');
        check(
          Array.isArray(def.aliases) && def.aliases.every((a) => rules.TYPE_NAME.test(a)),
          'aliases must be snake_case strings'
        );
        check(rules.SIZES.includes(def.defaultSize), 'defaultSize invalid');
        check(rules.AVAILABILITY_POLICIES.includes(def.availability), 'availability invalid');
        check(Array.isArray(def.unknownOkDomains), 'unknownOkDomains must be an array');
        check(Array.isArray(def.layoutRoles), 'layoutRoles must be an array');
        check(
          def.family === null || rules.FAMILIES.includes(def.family),
          `family must be null or one of ${rules.FAMILIES}`
        );
        check(
          typeof def.standalone === 'boolean' && typeof def.preview === 'boolean',
          'standalone/preview must be booleans'
        );
        check(
          Number.isFinite(def.cardRows) && Number.isFinite(def.standaloneHeight),
          'cardRows/standaloneHeight must be numbers'
        );
        check(
          def.gridOptions && typeof def.gridOptions === 'object',
          'gridOptions must be an object'
        );
        for (const [name, spec] of Object.entries(def.options || {})) {
          check(rules.OPTION_TYPES.includes(spec?.type), `option "${name}" has invalid type`);
          if (spec?.type === 'enum') {
            check(
              Array.isArray(spec.values) && spec.values.length > 0,
              `enum option "${name}" needs values`
            );
            if (spec.default !== undefined)
              check(
                spec.values?.includes(spec.default),
                `enum option "${name}" default is not one of its values`
              );
          }
        }
        for (const [table, actions] of [
          ['actions', def.actions],
          ['extension.actions', def.extension?.actions]
        ]) {
          for (const [name, action] of Object.entries(actions || {})) {
            check(rules.ACTION_NAME.test(name), `${table}["${name}"] is not a valid action name`);
            check(typeof action?.run === 'function', `${table}["${name}"].run must be a function`);
            for (const fn of ['guard', 'confirm'])
              check(
                action?.[fn] === undefined || typeof action[fn] === 'function',
                `${table}["${name}"].${fn} must be a function`
              );
            check(
              action?.availability === undefined ||
                ['entity', 'allow-unknown'].includes(action.availability),
              `${table}["${name}"].availability invalid`
            );
            const nameOk =
              rules.GRANDFATHERED_ACTIONS.includes(name) ||
              name.startsWith(`${type}-`) ||
              // action names are kebab-case, so a snake_case kind (media_player) prefixes with hyphens
              name.startsWith(`${type.replaceAll('_', '-')}-`);
            check(
              nameOk,
              `${table}["${name}"] must be "${type}-<verb>" (or a name kept for compatibility)`
            );
          }
        }
        for (const hook of [
          'afterRender',
          'onHass',
          'patch',
          'normalize',
          'validate',
          'watch',
          'stub'
        ])
          check(
            def[hook] === undefined || typeof def[hook] === 'function',
            `${hook} must be a function`
          );
        if (def.tick !== undefined)
          check(
            Number.isFinite(def.tick.every) &&
              def.tick.every > 0 &&
              typeof def.tick.run === 'function',
            'tick needs {every:number>0, run:function}'
          );
        check(
          def.alwaysPatch === undefined || typeof def.alwaysPatch === 'boolean',
          'alwaysPatch must be boolean'
        );
        assert.deepEqual(problems, []);
      });

      it('lives in a folder named after its type', () => {
        assert.notEqual(
          readWidgetFile(type, 'index.js'),
          null,
          `src/widgets/${type}/index.js not found`
        );
      });

      // ---- strings ---------------------------------------------------------------------------------------------------
      it('has well-formed strings (keys prefixed, English present, label matches)', async () => {
        const s = await loadStrings(type);
        assert.ok(!s.missing, 'strings.js is missing');
        assert.ifError(s.error);
        assert.ok(s.strings?.en, 'strings.js must export {en: {...}}');
        const problems = [];
        for (const [lang, table] of Object.entries(s.strings)) {
          for (const key of Object.keys(table)) {
            if (!key.startsWith(`${type}.`))
              problems.push(`${lang}: key "${key}" must start with "${type}."`);
            if (lang !== 'en' && !(key in s.strings.en))
              problems.push(`${lang}: key "${key}" has no English original`);
          }
        }
        if (
          s.strings.en[`${type}.label`] !== undefined &&
          s.strings.en[`${type}.label`] !== def.label
        )
          problems.push(
            `en "${type}.label" ("${s.strings.en[`${type}.label`]}") differs from definition label ("${def.label}")`
          );
        for (const [name, spec] of Object.entries(def.options || {})) {
          if (
            !['icon', 'text'].includes(spec.type) &&
            !(`${type}.option.${name}.label` in s.strings.en)
          )
            problems.push(`option "${name}" needs en "${type}.option.${name}.label"`);
        }
        assert.deepEqual(problems, []);
      });

      it('uses only string keys that exist (static scan of index.js and parts)', async () => {
        const s = await loadStrings(type);
        const en = s.strings?.en || {};
        const sources = ['index.js'];
        const problems = [];
        for (const file of sources) {
          const text = readWidgetFile(type, file) || '';
          for (const m of text.matchAll(/(?:\bctx\.t|\bt)\(\s*(['"`])([^'"`$]+)\1/g)) {
            const key = m[2];
            const core =
              rules.CORE_STRING_KEYS.includes(key) ||
              rules.CORE_STRING_PREFIXES.some((p) => key.startsWith(p));
            if (!core && !key.startsWith(`${type}.`))
              problems.push(`${file}: t("${key}") is neither a core key nor prefixed "${type}."`);
            else if (!core && !(key in en))
              problems.push(`${file}: t("${key}") is missing from strings.js (en)`);
          }
        }
        assert.deepEqual(problems, []);
      });

      it('has README front matter that matches the definition', () => {
        const fm = frontMatter(readWidgetFile(type, 'README.md'));
        assert.ok(fm, 'README.md must start with a --- front matter block');
        assert.equal(fm.type, type, 'front matter type');
        assert.equal(fm.label, def.label, 'front matter label');
        assert.equal(fm.entity, def.entity, 'front matter entity');
        assert.ok(fm.since, 'front matter needs `since`');
      });

      // ---- fixtures --------------------------------------------------------------------------------------------------
      it('has fixtures with the required variants', async () => {
        const f = await loadFixtures(type);
        assert.ok(!f.missing, 'fixtures.js is missing');
        assert.ifError(f.error);
        const names = Object.keys(f.variants);
        const problems = [];
        if (def.entity !== 'none')
          for (const required of rules.REQUIRED_VARIANTS)
            if (!names.includes(required)) problems.push(`variant "${required}" is required`);
        if (def.entity === 'none' && !names.includes('ok'))
          problems.push('variant "ok" is required');
        for (const [name, v] of Object.entries(f.variants)) {
          if (
            !v ||
            typeof v !== 'object' ||
            typeof v.widget !== 'object' ||
            typeof v.states !== 'object'
          )
            problems.push(`variant "${name}" must be {widget, states}`);
          else if (
            v.widget.type !== undefined &&
            v.widget.type !== type &&
            !(def.aliases || []).includes(v.widget.type)
          )
            problems.push(`variant "${name}" has widget.type "${v.widget.type}"`);
        }
        assert.deepEqual(problems, []);
      });

      // ---- rendering -------------------------------------------------------------------------------------------------
      describe('render', () => {
        const run = async (t, body) => {
          const f = await loadFixtures(type);
          if (!f.variants) return assert.fail('no fixtures to render');
          const failures = [];
          let n = 0;
          for (const c of renderCases(def, f.variants)) {
            n++;
            try {
              body(c, failures);
            } catch (e) {
              failures.push(`${c.label}: ${e.message.split('\n')[0]}`);
            }
          }
          t.diagnostic(`${n} cases`);
          assert.equal(failures.length, 0, fail(failures));
        };

        it('returns exactly one well-formed root element carrying data-widget', (t) =>
          run(t, (c, failures) => {
            const {host, widget} = buildCase(def, c);
            const index = 3;
            const html = renderIn(def, host, widget, index);
            if (typeof html !== 'string')
              return failures.push(`${c.label}: returned ${typeof html}`);
            const scan = scanHtml(html);
            if (scan.problems.length) failures.push(`${c.label}: ${scan.problems.join('; ')}`);
            if (scan.roots.length !== 1)
              return failures.push(`${c.label}: ${scan.roots.length} root elements`);
            const root = scan.elements[scan.roots[0]];
            if (root.attrs['data-widget'] !== String(index))
              failures.push(
                `${c.label}: root data-widget is "${root.attrs['data-widget']}", expected "${index}"`
              );
            if (!root.classes.includes('widget') || !root.classes.includes(type))
              failures.push(
                `${c.label}: root classes "${root.classes.join(' ')}" lack "widget ${type}"`
              );
            const size = c.size || widget.size || def.defaultSize;
            if (!root.classes.includes(`size-${size}`))
              failures.push(`${c.label}: root lacks size-${size}`);
          }));

        it('is pure: same input twice gives identical output, inputs are not mutated, no DOM/window access', (t) =>
          run(t, (c, failures) => {
            const a = buildCase(def, c);
            const b = buildCase(def, c);
            deepFreeze(a.host._hass);
            deepFreeze(a.widget);
            deepFreeze(a.host._config);
            const first = renderIn(def, a.host, a.widget, 0, {trap: true});
            const second = renderIn(def, a.host, a.widget, 0, {trap: true});
            const third = renderIn(def, b.host, b.widget, 0);
            if (first !== second)
              failures.push(`${c.label}: two renders of the same context differ`);
            if (first !== third)
              failures.push(`${c.label}: renders from two identical contexts differ`);
          }));

        it('does not read the clock (output identical at two different times)', (t) => {
          if (rules.CLOCK_DEPENDENT.includes(type))
            return t.skip(
              `${type} is clock-dependent by design (the clock is pinned by the harness)`
            );
          return run(t, (c, failures) => {
            const {host, widget} = buildCase(def, c);
            const a = renderIn(def, host, widget, 0, {now: FIXED_NOW});
            const b = renderIn(def, host, widget, 0, {now: FIXED_NOW + 36 * 3600 * 1000 + 12345});
            if (a !== b) failures.push(`${c.label}: output depends on the current time`);
          });
        });

        it('every data-action it renders resolves to an owner', (t) =>
          run(t, (c, failures) => {
            const {host, widget} = buildCase(def, c);
            for (const action of new Set(actionsIn(renderIn(def, host, widget))))
              if (!resolves(action))
                failures.push(`${c.label}: data-action="${action}" has no owner`);
          }));

        it('renders a disabled, unavailable state when the entity is missing or unavailable', async (t) => {
          if (def.entity === 'none') return t.skip('widget has no entity');
          const f = await loadFixtures(type);
          const problems = [];
          for (const name of ['unavailable', 'missing']) {
            const v = f.variants?.[name];
            if (!v) continue;
            const c = {
              variantName: name,
              variant: v,
              size: undefined,
              pending: false,
              flavour: 'default',
              label: `${type}/${name}`
            };
            const {host, widget} = buildCase(def, c);
            const html = renderIn(def, host, widget);
            if (v.config?.camera_gallery?.length) continue; // a gallery keeps the camera widget usable
            const buttons = scanHtml(html).elements.filter(
              (e) => e.tag === 'button' && e.attrs['data-action'] !== 'info'
            );
            const enabled = buttons.filter((e) => !('disabled' in e.attrs));
            if (enabled.length)
              problems.push(
                `${name}: ${enabled.length} control button(s) not disabled (${enabled.map((e) => e.attrs['data-action']).join(', ')})`
              );
            // Value widgets (sensor) keep the em dash for "no value": the markup contract forbids replacing it
            // with the word, so the dash counts as the unavailable marker (docs/widget-api.md).
            if (!/unavailable|offline|\u2014/i.test(html))
              problems.push(`${name}: no "Unavailable"/"Offline" text (or em dash) rendered`);
          }
          assert.deepEqual(problems, []);
        });

        it('escapes hostile names, states and attributes (no new elements, no handlers, no raw markup)', (t) =>
          run(t, (c, failures) => {
            if (c.size || c.pending || c.flavour !== 'default') return; // one pass per variant is enough
            const states = Object.fromEntries(
              Object.entries(c.variant.states).map(([id, s]) => [
                id,
                {
                  ...s,
                  state:
                    id === c.variant.widget.entity && /^(sensor|weather)\./.test(id)
                      ? EVIL
                      : s.state,
                  attributes: Object.fromEntries(
                    Object.entries(s.attributes || {}).map(([k, v]) => [
                      k,
                      typeof v === 'string' ? EVIL : v
                    ])
                  )
                }
              ])
            );
            const {host, widget} = buildCase(def, c, {
              states,
              widgetPatch: {
                name: EVIL,
                ...(c.variant.widget.note !== undefined ? {note: EVIL} : {})
              }
            });
            const html = renderIn(def, host, widget);
            const scan = scanHtml(html);
            if (html.includes(EVIL)) failures.push(`${c.label}: hostile text appears unescaped`);
            if (scan.elements.some((e) => e.tag === 'img' && e.attrs.src === 'x'))
              failures.push(`${c.label}: hostile text created an <img>`);
            const bad = dangerousAttributes(html);
            if (bad.length) failures.push(`${c.label}: dangerous attributes ${bad.join(', ')}`);
          }));

        it('leaks no raw string keys, "undefined" or "[object Object]" into the markup', (t) =>
          run(t, (c, failures) => {
            if (c.flavour !== 'default') return;
            const {host, widget} = buildCase(def, c);
            const html = renderIn(def, host, widget);
            const text = html.replace(/<[^>]*>/g, ' ');
            const leaked = new RegExp(
              `\\b(${type}|state|common|editor|error)\\.[a-z_]+(\\.[a-z_]+)*\\b`,
              'i'
            ).exec(text);
            if (leaked && !/\b[a-z_]+\.test\b/.test(leaked[0]))
              failures.push(`${c.label}: looks like an untranslated key "${leaked[0]}"`);
            if (/\bundefined\b|\[object Object\]|NaN%?/.test(text))
              failures.push(`${c.label}: contains undefined/[object Object]/NaN text`);
          }));

        it('uses only classes it owns on its root, and no surface/layout classes anywhere', async (t) => {
          const f = await loadFixtures(type);
          const css = readWidgetFile(type, 'style.css');
          const owns = ownedClasses(css);
          const problems = [];
          const sizes = new Set(rules.SIZES.map((s) => `size-${s}`));
          const external = new Set();
          for (const c of renderCases(def, f.variants)) {
            if (c.size || c.pending || c.flavour !== 'default') continue;
            const {host, widget} = buildCase(def, c);
            const scan = scanHtml(renderIn(def, host, widget));
            for (const e of scan.elements) {
              for (const cls of e.classes) {
                if (/^(surface-|layout-)/.test(cls) || cls === 'night-mode')
                  problems.push(`${c.label}: class "${cls}" belongs to a surface/layout`);
              }
            }
            const root = scan.elements[scan.roots[0]];
            if (!root || !owns) continue;
            for (const cls of root.classes) {
              if (
                cls === type ||
                sizes.has(cls) ||
                rules.SHARED_ROOT_CLASSES.includes(cls) ||
                owns.has(cls)
              )
                continue;
              problems.push(`${c.label}: root class "${cls}" is not in style.css @owns`);
            }
            for (const e of scan.elements)
              for (const cls of e.classes)
                if (
                  !owns.has(cls) &&
                  !rules.SHARED_ROOT_CLASSES.includes(cls) &&
                  cls !== type &&
                  !sizes.has(cls)
                )
                  external.add(cls);
          }
          if (!owns)
            t.diagnostic('style.css has no @owns marker yet: root-class ownership not checked');
          else if (external.size)
            t.diagnostic(
              `classes rendered but not in @owns (shared with other widgets or core?): ${[...external].sort().join(' ')}`
            );
          assert.deepEqual([...new Set(problems)], []);
        });
      });

      // ---- configuration ---------------------------------------------------------------------------------------------
      it('has a stub() that passes its own validate()', async () => {
        const f = await loadFixtures(type);
        const states = Object.assign({}, ...Object.values(f.variants || {}).map((v) => v.states));
        const mock = mockFromVariant({states});
        const extra = def.stub ? def.stub(mock.hass) : {};
        assert.ok(extra && typeof extra === 'object', 'stub() must return an object');
        const domain = (def.domains && def.domains[0]) || type;
        const entity =
          def.entity === 'none'
            ? undefined
            : Object.keys(states).find((id) =>
                (def.domains.length ? def.domains : [type]).includes(id.split('.')[0])
              ) || `${domain}.test`;
        const widget = {type, ...(entity ? {entity} : {}), size: 'normal', ...extra};
        if (def.validate)
          assert.doesNotThrow(
            () => def.validate(widget, {widgets: [widget]}),
            'validate() rejected the stub config'
          );
        for (const [name, spec] of Object.entries(def.options || {})) {
          if (spec.type === 'enum' && widget[name] !== undefined)
            assert.ok(
              spec.values.includes(widget[name]),
              `stub sets ${name} to an invalid enum value`
            );
        }
      });

      it('validate() accepts every fixture widget', async () => {
        if (!def.validate) return;
        const f = await loadFixtures(type);
        const problems = [];
        for (const [name, v] of Object.entries(f.variants || {})) {
          const widget = {type, ...v.widget};
          try {
            def.validate(widget, {...(v.config || {}), widgets: [widget]});
          } catch (e) {
            problems.push(`${name}: validate threw "${e.message}" for a fixture widget`);
          }
        }
        assert.deepEqual(problems, []);
      });

      // ---- actions ---------------------------------------------------------------------------------------------------
      describe('actions', () => {
        const dispatchable = () =>
          loaded.core.dispatch?.dispatchAction && loaded.core.context?.createActionContext;

        /** Dispatch each rendered action in each variant and let `check` look at the outcome. */
        async function exercise(t, check, {confirm = false} = {}) {
          const f = await loadFixtures(type);
          const failures = [];
          const seen = new Set();
          for (const [variantName, variant] of Object.entries(f.variants)) {
            const c = {
              variantName,
              variant,
              size: undefined,
              pending: false,
              flavour: 'default',
              label: `${type}/${variantName}`
            };
            const probe = buildCase(def, c);
            const actions = [
              ...new Set(
                scanHtml(renderIn(def, probe.host, probe.widget))
                  .elements.filter((e) => 'data-action' in e.attrs)
                  .map(
                    (e) =>
                      `${e.attrs['data-action']}\u0000${e.attrs['data-entity'] ?? ''}\u0000${'disabled' in e.attrs}`
                  )
              )
            ];
            for (const key of actions) {
              const [action, id, disabledFlag] = key.split('\u0000');
              const tag = `${c.label}: ${action} on "${id}"`;
              if (seen.has(tag)) continue;
              seen.add(tag);
              const {host, widget, mock} = buildCase(def, c);
              try {
                await withEnv(async () => {
                  globalThis.window.confirm = () => confirm;
                  await loaded.core.dispatch.dispatchAction(host, action, id);
                });
              } catch (e) {
                failures.push(`${tag}: dispatchAction threw ${e.message}`);
                continue;
              }
              const problem = check({
                action,
                id,
                disabled: disabledFlag === 'true',
                host,
                mock,
                widget,
                variantName
              });
              if (problem) failures.push(`${tag}: ${problem}`);
            }
          }
          assert.equal(failures.length, 0, fail(failures));
        }

        it('never issues a service call for a missing or unavailable entity', async (t) => {
          if (def.entity === 'none') return t.skip('widget has no entity');
          if (!dispatchable())
            return t.skip(
              'core/dispatch.js dispatchAction and core/context.js createActionContext are not both available yet'
            );
          await exercise(t, ({mock, id}) => {
            const state = mock.hass.states[id];
            const gone = !state || state.state === 'unavailable';
            if (!gone) return null;
            return mock.calls.length
              ? `issued ${JSON.stringify(mock.calls)} although the entity is ${state ? 'unavailable' : 'missing'}`
              : null;
          });
        });

        it('sends service calls only for the entity it was pressed on, as {entity_id: id, ...}', async (t) => {
          if (!dispatchable())
            return t.skip(
              'core/dispatch.js dispatchAction and core/context.js createActionContext are not both available yet'
            );
          await exercise(
            t,
            ({mock, id}) => {
              const bad = mock.calls.filter((c) => !c.data || c.data.entity_id !== id);
              return bad.length
                ? `service call payload without entity_id "${id}": ${JSON.stringify(bad)}`
                : null;
            },
            {confirm: true}
          );
        });

        it('honours guards: a guard returning false calls nothing, "info" opens more-info', async (t) => {
          if (!dispatchable())
            return t.skip(
              'core/dispatch.js dispatchAction and core/context.js createActionContext are not both available yet'
            );
          await exercise(t, ({action, id, host, mock}) => {
            const action_ = actionDefFor(def, action);
            if (!action_?.guard || !host._available(id)) return null;
            let verdict;
            try {
              verdict = withEnv(() =>
                action_.guard(loaded.core.context.createActionContext(host, action, id), id)
              );
            } catch (e) {
              return `guard threw ${e.message}`;
            }
            if (verdict === false && mock.calls.length)
              return `guard returned false but ${mock.calls.length} service call(s) were made`;
            if (verdict === 'info' && (mock.calls.length || !host.infos.includes(id)))
              return `guard returned "info": expected more-info for ${id} and no call`;
            return null;
          });
        });

        it('surfaces a failing service as an error message instead of throwing', async (t) => {
          if (def.entity === 'none') return t.skip('widget has no entity');
          if (!dispatchable())
            return t.skip(
              'core/dispatch.js dispatchAction and core/context.js createActionContext are not both available yet'
            );
          const f = await loadFixtures(type);
          const v = f.variants.ok;
          if (!v || !Object.keys({...def.actions}).length)
            return t.skip('no ok variant or no actions of its own');
          const c = {
            variantName: 'ok',
            variant: v,
            size: undefined,
            pending: false,
            flavour: 'default',
            label: `${type}/ok`
          };
          const probe = buildCase(def, c);
          const rendered = scanHtml(renderIn(def, probe.host, probe.widget)).elements.filter(
            (e) => 'data-action' in e.attrs && !('disabled' in e.attrs)
          );
          let rejectedOnce = false;
          for (const e of rendered) {
            const {host, mock} = buildCase(def, c);
            mock.rejectWith('Permission denied');
            await withEnv(async () => {
              globalThis.window.confirm = () => true;
              await loaded.core.dispatch.dispatchAction(
                host,
                e.attrs['data-action'],
                e.attrs['data-entity']
              );
            });
            if (mock.calls.length) {
              rejectedOnce = true;
              assert.match(
                host._message,
                /Could not complete action: Permission denied/,
                `${e.attrs['data-action']}: error text`
              );
              assert.equal(
                host._pending.has(e.attrs['data-entity']),
                false,
                `${e.attrs['data-action']}: pending must be released after an error`
              );
            }
          }
          if (!rejectedOnce)
            t.diagnostic(
              'no rendered action of the ok variant calls a service; error path not exercised'
            );
        });
      });
    });
  }
}
