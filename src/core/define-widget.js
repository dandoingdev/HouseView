// defineWidget: the only way to create a widget module (docs/widget-api.md).
// It fills defaults, checks the shape, deep-freezes the result and remembers that it did so,
// so the registry can refuse objects that did not come through here.

export const SIZES = ['normal', 'wide', 'tall', 'large'];
export const ENTITY_POLICIES = ['required', 'none', 'custom'];
export const AVAILABILITY_POLICIES = ['entity', 'always', 'allow-unknown'];
export const ACTION_AVAILABILITY = ['entity', 'allow-unknown'];
export const OPTION_TYPES = ['text', 'icon', 'enum', 'boolean', 'number', 'entity', 'enum_list'];
export const TAG_NAME = /^houseview-[a-z0-9]+(-[a-z0-9]+)*-card$/;
export const FAMILIES = ['icon-tile'];
export const TYPE_NAME = /^[a-z][a-z0-9_]*$/;
export const ACTION_NAME = /^[a-z][a-z0-9-]*\*?$/;

const DEF_KEYS = new Set([
  'type',
  'tag',
  'overview',
  'label',
  'order',
  'render',
  'entity',
  'domains',
  'aliases',
  'defaultSize',
  'availability',
  'unknownOkDomains',
  'layoutRoles',
  'family',
  'standalone',
  'preview',
  'description',
  'cardRows',
  'standaloneHeight',
  'gridOptions',
  'stub',
  'options',
  'validate',
  'normalize',
  'watch',
  'editor',
  'actions',
  'afterRender',
  'tick',
  'onHass',
  'patch',
  'alwaysPatch',
  'extension'
]);
const ACTION_KEYS = new Set(['immediate', 'availability', 'guard', 'confirm', 'run']);
const OPTION_KEYS = new Set([
  'type',
  'default',
  'values',
  'min',
  'max',
  'step',
  'error',
  'when',
  'domains'
]);
const EXTENSION_KEYS = new Set([
  'configKeys',
  'validateConfig',
  'entities',
  'state',
  'compat',
  'shellClasses',
  'overlay',
  'afterRender',
  'tick',
  'blocksNavigation',
  'onKeydown',
  'onPointerDown',
  'dispose',
  'actions'
]);
const FUNCTION_FIELDS = [
  'render',
  'stub',
  'validate',
  'normalize',
  'watch',
  'afterRender',
  'onHass',
  'patch'
];

/** Definitions that went through defineWidget. */
const defined = new WeakSet();

/** True for an object returned by defineWidget. */
export function isWidgetDefinition(value) {
  return defined.has(value);
}

// In Node (unit tests, CI, the contract linter) a bad definition throws. In a browser it is skipped with
// console.error so one broken widget cannot take the whole dashboard down.
let strict = typeof document === 'undefined';

/** Override the throw/skip behaviour (tests). Pass undefined to restore the environment default. */
export function setStrictDefinitions(value) {
  strict = value === undefined ? typeof document === 'undefined' : !!value;
}

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isFunction = (value) => typeof value === 'function';
const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** Copy plain objects and arrays (functions and other values are kept) and freeze the copy. */
function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (isObject(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freezeCopy(v)]))
    );
  }
  return value;
}

/**
 * Shape check of one action definition. Shared by widget actions, extension actions and registerFeature.
 * @returns {string[]} problems
 */
export function checkActionDef(name, action, where = 'actions') {
  const label = `${where}["${name}"]`;
  const problems = [];
  if (!ACTION_NAME.test(name)) problems.push(`${label}: not a valid action name`);
  if (!isObject(action)) return [...problems, `${label}: must be an object`];
  for (const key of Object.keys(action)) {
    if (!ACTION_KEYS.has(key)) problems.push(`${label}: unknown key "${key}"`);
  }
  if (!isFunction(action.run)) problems.push(`${label}.run must be a function`);
  for (const key of ['guard', 'confirm']) {
    if (action[key] !== undefined && !isFunction(action[key])) {
      problems.push(`${label}.${key} must be a function`);
    }
  }
  if (action.immediate !== undefined && typeof action.immediate !== 'boolean') {
    problems.push(`${label}.immediate must be a boolean`);
  }
  if (action.availability !== undefined && !ACTION_AVAILABILITY.includes(action.availability)) {
    problems.push(`${label}.availability must be one of ${ACTION_AVAILABILITY.join(', ')}`);
  }
  return problems;
}

function checkOptions(options, problems) {
  if (!isObject(options)) return problems.push('options must be an object');
  for (const [name, spec] of Object.entries(options)) {
    const label = `options.${name}`;
    if (!isObject(spec) || !OPTION_TYPES.includes(spec.type)) {
      problems.push(`${label}.type must be one of ${OPTION_TYPES.join(', ')}`);
      continue;
    }
    for (const key of Object.keys(spec)) {
      if (!OPTION_KEYS.has(key)) problems.push(`${label}: unknown key "${key}"`);
    }
    if (spec.type === 'entity' && !(isStringArray(spec.domains) && spec.domains.length)) {
      problems.push(`${label} is an entity and needs a non-empty domains list`);
    }
    if (spec.type === 'enum' || spec.type === 'enum_list') {
      if (!isStringArray(spec.values) || !spec.values.length) {
        problems.push(`${label} is an enum and needs a non-empty values list`);
      } else if (
        spec.default !== undefined &&
        !(spec.type === 'enum_list'
          ? Array.isArray(spec.default) && spec.default.every((v) => spec.values.includes(v))
          : spec.values.includes(spec.default))
      ) {
        problems.push(`${label}.default is not one of its values`);
      }
    }
    if (spec.error !== undefined && typeof spec.error !== 'string') {
      problems.push(`${label}.error must be a string`);
    }
    if (spec.when !== undefined && !isFunction(spec.when)) {
      problems.push(`${label}.when must be a function`);
    }
  }
}

function checkTick(tick, where, problems) {
  if (!isObject(tick) || !Number.isFinite(tick.every) || tick.every <= 0 || !isFunction(tick.run)) {
    problems.push(`${where} needs {every: number > 0, run: function}`);
  } else if (tick.when !== undefined && !isFunction(tick.when)) {
    problems.push(`${where}.when must be a function`);
  } else if (tick.align !== undefined && tick.align !== 'minute') {
    problems.push(`${where}.align must be 'minute' when given`);
  }
}

function checkCompat(compat, problems) {
  if (!isObject(compat)) return problems.push('extension.compat must be an object');
  for (const [name, accessor] of Object.entries(compat)) {
    if (!isObject(accessor) || !isFunction(accessor.get)) {
      problems.push(`extension.compat.${name} needs a get function`);
    } else if (accessor.set !== undefined && !isFunction(accessor.set)) {
      problems.push(`extension.compat.${name}.set must be a function`);
    }
  }
}

function checkExtensionActions(actions, problems) {
  if (!isObject(actions)) return problems.push('extension.actions must be an object');
  for (const [name, action] of Object.entries(actions)) {
    problems.push(...checkActionDef(name, action, 'extension.actions'));
  }
}

function checkExtension(extension, problems) {
  if (!isObject(extension)) return problems.push('extension must be an object');
  for (const [key, value] of Object.entries(extension)) {
    if (!EXTENSION_KEYS.has(key)) problems.push(`extension: unknown key "${key}"`);
    else if (key === 'configKeys') {
      if (!isStringArray(value)) problems.push('extension.configKeys must be a list of strings');
    } else if (key === 'tick') checkTick(value, 'extension.tick', problems);
    else if (key === 'compat') checkCompat(value, problems);
    else if (key === 'actions') checkExtensionActions(value, problems);
    else if (!isFunction(value)) problems.push(`extension.${key} must be a function`);
  }
}

/** Every shape problem of a raw definition, as readable sentences. */
function problemsOf(def, entity) {
  const problems = [];
  const check = (ok, message) => ok || problems.push(message);

  for (const key of Object.keys(def)) {
    if (!DEF_KEYS.has(key)) problems.push(`unknown field "${key}"`);
  }
  check(typeof def.type === 'string' && TYPE_NAME.test(def.type), 'type must be snake_case');
  check(
    typeof def.tag === 'string' &&
      (def.tag === `houseview-${def.type}-card` || TAG_NAME.test(def.tag)),
    'tag must look like houseview-<name>-card'
  );
  check(
    def.overview === undefined || typeof def.overview === 'string',
    'overview must be a string'
  );
  check(typeof def.label === 'string' && def.label.length > 0, 'label must be a non-empty string');
  check(Number.isInteger(def.order) && def.order > 0, 'order must be a positive integer');
  check(isFunction(def.render), 'render must be a function');
  check(ENTITY_POLICIES.includes(entity), `entity must be one of ${ENTITY_POLICIES.join(', ')}`);
  check(isStringArray(def.domains), 'domains must be a list of strings');
  if (entity === 'none') check(!def.domains?.length, 'a widget with entity "none" has no domains');
  check(
    isStringArray(def.aliases) && def.aliases.every((a) => TYPE_NAME.test(a)),
    'aliases must be a list of snake_case strings'
  );
  check(SIZES.includes(def.defaultSize), `defaultSize must be one of ${SIZES.join(', ')}`);
  check(
    AVAILABILITY_POLICIES.includes(def.availability),
    `availability must be one of ${AVAILABILITY_POLICIES.join(', ')}`
  );
  check(isStringArray(def.unknownOkDomains), 'unknownOkDomains must be a list of strings');
  check(isStringArray(def.layoutRoles), 'layoutRoles must be a list of strings');
  check(
    def.family === null || FAMILIES.includes(def.family),
    `family must be ${FAMILIES.join(', ')} or null`
  );
  check(typeof def.standalone === 'boolean', 'standalone must be a boolean');
  check(typeof def.preview === 'boolean', 'preview must be a boolean');
  check(
    def.description === undefined || typeof def.description === 'string',
    'description must be a string'
  );
  check(Number.isFinite(def.cardRows), 'cardRows must be a number');
  check(Number.isFinite(def.standaloneHeight), 'standaloneHeight must be a number');
  check(isObject(def.gridOptions), 'gridOptions must be an object');
  check(isObject(def.editor), 'editor must be an object');
  for (const field of FUNCTION_FIELDS) {
    check(def[field] === undefined || isFunction(def[field]), `${field} must be a function`);
  }
  check(
    def.alwaysPatch === undefined || typeof def.alwaysPatch === 'boolean',
    'alwaysPatch must be a boolean'
  );

  checkOptions(def.options, problems);
  if (def.tick !== undefined) checkTick(def.tick, 'tick', problems);
  if (def.extension !== undefined) checkExtension(def.extension, problems);
  if (!isObject(def.actions)) problems.push('actions must be an object');
  else {
    for (const [name, action] of Object.entries(def.actions)) {
      problems.push(...checkActionDef(name, action));
    }
  }
  return problems;
}

function fail(type, problems) {
  const message = `defineWidget(${type}): ${problems.join('; ')}`;
  if (strict) throw new Error(message);
  console.error(`[HouseView] ${message}. The widget is skipped.`);
  return null;
}

/**
 * Validate a widget definition, fill the defaults and freeze it.
 * Returns the module, or null (after console.error) for a bad definition outside strict mode.
 * @param {Object} definition   see docs/widget-api.md
 */
export function defineWidget(definition) {
  if (!isObject(definition)) return fail('?', ['the definition must be an object']);
  // An explicit `undefined` means "use the default".
  const given = Object.fromEntries(Object.entries(definition).filter(([, v]) => v !== undefined));
  const entity = given.entity ?? 'required';
  const def = {
    domains: entity === 'none' ? [] : [given.type],
    aliases: [],
    defaultSize: 'normal',
    availability: 'entity',
    unknownOkDomains: [],
    layoutRoles: [],
    family: null,
    standalone: true,
    preview: true,
    cardRows: 3,
    standaloneHeight: 240,
    gridOptions: {},
    options: {},
    actions: {},
    tag: `houseview-${given.type}-card`,
    ...given,
    entity,
    editor: {name: true, ...given.editor}
  };
  const problems = problemsOf(def, entity);
  if (problems.length) return fail(String(given.type ?? '?'), problems);

  const frozen = Object.freeze(
    Object.fromEntries(Object.entries(def).map(([key, value]) => [key, freezeCopy(value)]))
  );
  defined.add(frozen);
  return frozen;
}
