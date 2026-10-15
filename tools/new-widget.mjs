// Scaffold a widget folder from tools/templates/widget and refresh the generated index files.
//
// Usage: npm run new:widget -- --type humidifier --label "Humidifier" --domains humidifier[,other]
//        [--order 170] [--root <dir>]
//        npm run new:overview -- --type energy --label "Energy" --domains sensor      (= --family overview)
//
// Template placeholders: {{type}} {{Label}} {{order}} {{domains}} (quoted, comma separated) {{firstDomain}}.
// Module families (widgets and overviews) are described by FAMILIES; the generator side is
// MODULE_ROOTS in gen-widgets.mjs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate} from './gen-widgets.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAMILIES = {
  widget: {
    dir: 'src/widgets',
    templates: 'tools/templates/widget',
    noun: 'widget',
    next: 'npm run check:widgets && npm run test:widgets && npm run lint'
  },
  overview: {
    dir: 'src/overviews',
    templates: 'tools/templates/overview',
    noun: 'overview',
    next: 'npm run check:overviews && npm run test:unit && npm run test:overviews && npm run lint'
  }
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`unexpected argument "${argv[i]}"`);
    out[m[1]] = m[2] ?? argv[++i];
  }
  return out;
}

const titleCase = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Next free multiple of 10 above every `order:` already declared in the family's folders. */
function nextOrder(dir) {
  let max = 0;
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, e.name, 'index.js');
      if (!e.isDirectory() || !fs.existsSync(file)) continue;
      const m = /\border:\s*(\d+)/.exec(fs.readFileSync(file, 'utf8'));
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return (Math.floor(max / 10) + 1) * 10;
}

export async function scaffold({repo = REPO, family = 'widget', ...args}) {
  const fam = FAMILIES[family];
  if (!fam) throw new Error(`unknown family "${family}"`);
  const type = args.type;
  if (!type || !/^[a-z][a-z0-9_]*$/.test(type)) {
    throw new Error('--type is required and must be snake_case (^[a-z][a-z0-9_]*$)');
  }
  const label = args.label || titleCase(type);
  const domains = (args.domains || type)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const dir = path.join(repo, fam.dir, type);
  if (fs.existsSync(dir)) throw new Error(`${path.relative(repo, dir)} already exists`);
  const order = args.order ? Number(args.order) : nextOrder(path.join(repo, fam.dir));
  if (!Number.isInteger(order) || order <= 0) throw new Error('--order must be a positive integer');

  const values = {
    type,
    Label: label,
    order: String(order),
    domains: domains.map((d) => `'${d}'`).join(', '),
    firstDomain: domains[0]
  };
  const fill = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);

  const templates = path.join(repo, fam.templates);
  fs.mkdirSync(dir, {recursive: true});
  for (const file of fs.readdirSync(templates).filter((f) => f.endsWith('.tpl'))) {
    const target = path.join(dir, file.replace(/\.tpl$/, ''));
    fs.writeFileSync(target, fill(fs.readFileSync(path.join(templates, file), 'utf8')));
  }
  await generate({repo});
  return {dir, order, next: fam.next, noun: fam.noun};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const {dir, order, next, noun} = await scaffold({
      ...args,
      repo: args.root ? path.resolve(args.root) : REPO
    });
    console.log(
      `new-widget: created ${noun} ${path.relative(process.cwd(), dir)} (order ${order})`
    );
    console.log(`next: edit index.js, then \`${next}\``);
  } catch (e) {
    console.error(`new-widget: ${e.message}`);
    process.exit(1);
  }
}
