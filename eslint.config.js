// ESLint flat config. No plugins: ESLint 10 core only (the recommended set is spelled out below because
// @eslint/js is not a dependency). Enforces the module boundaries of docs/architecture.md and docs/widget-api.md
// section 1: widgets import only core/_shared/their own folder, core imports no controller/editor/elements,
// and hass.callService is reachable only through src/core/context.js.

const browser = [
  'window',
  'document',
  'customElements',
  'navigator',
  'location',
  'history',
  'screen',
  'localStorage',
  'sessionStorage',
  'console',
  'fetch',
  'URL',
  'URLSearchParams',
  'Blob',
  'File',
  'FileReader',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'queueMicrotask',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'getComputedStyle',
  'matchMedia',
  'performance',
  'alert',
  'confirm',
  'btoa',
  'atob',
  'self',
  'HTMLElement',
  'HTMLImageElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLLinkElement',
  'HTMLStyleElement',
  'HTMLTemplateElement',
  'HTMLAudioElement',
  'Element',
  'Node',
  'NodeFilter',
  'Text',
  'ShadowRoot',
  'DocumentFragment',
  'DOMParser',
  'DOMRect',
  'XMLSerializer',
  'SVGElement',
  'CSS',
  'CSSStyleSheet',
  'Image',
  'Audio',
  'AudioContext',
  'webkitAudioContext',
  'Animation',
  'KeyframeEffect',
  'ResizeObserver',
  'MutationObserver',
  'IntersectionObserver',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'TouchEvent',
  'FocusEvent',
  'WheelEvent',
  'MessageChannel',
  'BroadcastChannel'
];

const node = [
  'process',
  'Buffer',
  'console',
  'URL',
  'URLSearchParams',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'queueMicrotask',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'fetch',
  'performance'
];

const asGlobals = (names, value = 'readonly') => Object.fromEntries(names.map((n) => [n, value]));

// ESLint's own "recommended" rules, written out.
const recommended = {
  'constructor-super': 'error',
  'for-direction': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-case-declarations': 'error',
  'no-class-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': 'error',
  'no-const-assign': 'error',
  'no-constant-binary-expression': 'error',
  'no-constant-condition': ['error', {checkLoops: false}],
  'no-control-regex': 'error',
  'no-debugger': 'error',
  'no-delete-var': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-else-if': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-empty': ['error', {allowEmptyCatch: true}],
  'no-empty-character-class': 'error',
  'no-empty-pattern': 'error',
  'no-empty-static-block': 'error',
  'no-ex-assign': 'error',
  'no-extra-boolean-cast': 'error',
  'no-fallthrough': 'error',
  'no-func-assign': 'error',
  'no-global-assign': 'error',
  'no-import-assign': 'error',
  'no-invalid-regexp': 'error',
  'no-irregular-whitespace': 'error',
  'no-loss-of-precision': 'error',
  'no-misleading-character-class': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-nonoctal-decimal-escape': 'error',
  'no-obj-calls': 'error',
  'no-octal': 'error',
  'no-prototype-builtins': 'error',
  'no-redeclare': 'error',
  'no-regex-spaces': 'error',
  'no-self-assign': 'error',
  'no-setter-return': 'error',
  'no-shadow-restricted-names': 'error',
  'no-sparse-arrays': 'error',
  'no-this-before-super': 'error',
  'no-undef': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unused-labels': 'error',
  'no-unused-private-class-members': 'error',
  'no-unused-vars': [
    'error',
    {args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none'}
  ],
  'no-useless-backreference': 'error',
  'no-useless-catch': 'error',
  'no-useless-escape': 'error',
  'no-with': 'error',
  'require-yield': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
};

const style = {
  eqeqeq: ['error', 'always', {null: 'ignore'}],
  'no-var': 'error',
  'prefer-const': ['error', {destructuring: 'all'}]
};

/** Imports that may never appear in widget code (contract: docs/widget-api.md). */
const widgetBoundaries = {
  regex: [
    {
      // ../<other-widget>/..., but ../_shared/... and ../../core/... stay legal
      regex: '^\\.\\./(?!_shared/|\\.\\./core/)[^./][^/]*/',
      message:
        'Widgets import only ../../core/*, ../_shared/* and their own folder, never another widget.'
    },
    {
      regex: '(?:^|/)(?:controller|elements|editor)/',
      message: 'Widgets must not import controller/, elements/ or editor/ (docs/architecture.md).'
    },
    {
      regex: '^\\.\\./\\.\\./(?!core/)',
      message: 'Widgets may only reach into src/core from outside their folder.'
    }
  ]
};

const coreBoundaries = {
  regex: [
    {
      regex: '(?:^|/)(?:controller|elements|editor)/',
      message: 'core/ must not import controller/, elements/ or editor/ (docs/architecture.md).'
    },
    {
      regex: '(?:^|/)widgets/[^/]+/',
      message: 'core/ must not import a widget kind; kinds are registered through the registry.'
    }
  ]
};

const controllerBoundaries = {
  regex: [
    {
      regex: '(?:^|/)widgets/[^/]+/',
      message: 'The controller holds no kind names; use the registry (docs/architecture.md).'
    }
  ]
};

const callServiceBan = [
  {
    selector: "MemberExpression[property.name='callService']",
    message: 'hass.callService is reachable only through ctx.call (src/core/context.js).'
  },
  {
    selector: "Property[key.name='callService']",
    message: 'hass.callService is reachable only through ctx.call (src/core/context.js).'
  }
];

export default [
  {
    ignores: [
      'dist/**',
      'dist-min/**',
      'node_modules/**',
      'themes/**',
      'tools/templates/**',
      'tools/.scratch*/**',
      // Intentionally broken widgets that prove the contract suite catches them (tests/fixtures/mini-engine/README.md).
      'tests/fixtures/mini-engine/**',
      '.tmp/**'
    ]
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules: {...recommended, ...style}
  },
  {
    // The bundle build injects the version (tools/build.mjs `define`).
    files: ['src/**/*.js'],
    languageOptions: {globals: {...asGlobals(browser), __HV_VERSION__: 'readonly'}},
    rules: {
      'no-restricted-syntax': ['error', ...callServiceBan]
    }
  },
  {
    files: ['src/core/**/*.js'],
    rules: {'no-restricted-imports': ['error', {patterns: coreBoundaries.regex}]}
  },
  {
    files: ['src/controller/**/*.js'],
    rules: {'no-restricted-imports': ['error', {patterns: controllerBoundaries.regex}]}
  },
  {
    files: ['src/widgets/**/*.js'],
    ignores: ['src/widgets/index.js', 'src/widgets/**/test.js'],
    rules: {
      'no-restricted-imports': ['error', {patterns: widgetBoundaries.regex}],
      'no-restricted-globals': [
        'error',
        {name: 'localStorage', message: 'Widgets keep no browser storage (docs/widget-api.md).'},
        {
          name: 'sessionStorage',
          message: 'Widgets keep no browser storage (docs/widget-api.md).'
        },
        {name: 'fetch', message: 'Widgets never fetch; the card owns network access.'},
        {name: 'confirm', message: 'Use the confirm seam (def.confirm), not window.confirm.'}
      ],
      'no-restricted-properties': [
        'error',
        {object: 'window', property: 'confirm', message: 'Use the confirm seam (def.confirm).'},
        {object: 'window', property: 'localStorage', message: 'Widgets keep no browser storage.'},
        {object: 'window', property: 'fetch', message: 'Widgets never fetch.'}
      ]
    }
  },
  {
    // Overviews (docs/overview-api.md): the widget rules, plus no timers, clock or randomness in scene code.
    files: ['src/overviews/**/*.js'],
    ignores: ['src/overviews/index.js', 'src/overviews/**/test.js'],
    rules: {
      'no-restricted-imports': ['error', {patterns: widgetBoundaries.regex}],
      'no-restricted-globals': [
        'error',
        {name: 'localStorage', message: 'Overviews keep no browser storage.'},
        {name: 'sessionStorage', message: 'Overviews keep no browser storage.'},
        {name: 'fetch', message: 'Overviews never fetch; the card owns network access.'},
        {name: 'confirm', message: 'An overview cannot ask for confirmation.'},
        {name: 'setInterval', message: 'Use the tick hook on the shared ticker.'},
        {name: 'requestAnimationFrame', message: 'No JS per frame: animate in CSS.'}
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'confirm',
          message: 'An overview cannot ask for confirmation.'
        },
        {object: 'window', property: 'localStorage', message: 'Overviews keep no browser storage.'},
        {object: 'window', property: 'fetch', message: 'Overviews never fetch.'},
        {object: 'Math', property: 'random', message: 'render must be pure.'},
        {object: 'Date', property: 'now', message: 'Use ctx.now() so preview_time and tests work.'}
      ],
      'no-restricted-syntax': [
        'error',
        ...callServiceBan,
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use ctx.now() so preview_time and tests work.'
        }
      ]
    }
  },
  {
    // Generated registration file: imports every overview by design.
    files: ['src/overviews/index.js'],
    rules: {'no-restricted-imports': 'off'}
  },
  {
    // The single legal home of hass.callService.
    files: ['src/core/context.js'],
    rules: {'no-restricted-syntax': 'off'}
  },
  {
    // Generated registration files import every widget by design.
    files: ['src/widgets/index.js'],
    rules: {'no-restricted-imports': 'off'}
  },
  {
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: {globals: asGlobals(node, 'readonly')},
    rules: {'no-restricted-syntax': 'off'}
  },
  {
    // Node-side tooling that drives a browser also evaluates code inside it.
    files: ['tools/run-tests.mjs', 'tools/screenshots.mjs'],
    languageOptions: {globals: asGlobals(browser)}
  },
  {
    // Browser-side test harness code and per-widget tests: documents, windows and stubs are the point.
    files: [
      'tests/widgets/**/*.js',
      'tests/fixtures/**/*.js',
      'tests/preview*.js',
      'tests/overviews/**/*.js',
      'src/widgets/**/test.js',
      'src/overviews/**/test.js'
    ],
    languageOptions: {globals: asGlobals(browser)},
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off'
    }
  }
];
