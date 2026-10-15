// A tiny, dependency-free HTML scanner for render output (no jsdom in this repo).
//
// Widget markup is machine generated: quoted attributes, escaped text, no comments, no `<script>`. The scanner
// is deliberately strict about that and reports anything it cannot understand as `problems`, which the contract
// suite treats as a failure.

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr'
]);
const TAG =
  /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * @typedef {Object} ScannedElement
 * @property {string} tag
 * @property {Record<string,string>} attrs
 * @property {string[]} classes
 * @property {number} depth
 * @property {number} parent   index into elements, -1 for roots
 */

/**
 * @param {string} html
 * @returns {{elements: ScannedElement[], roots: number[], problems: string[]}}
 */
export function scanHtml(html) {
  const elements = [];
  const roots = [];
  const problems = [];
  const stack = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      problems.push(`unparseable markup near: ${html.slice(lt, lt + 40)}`);
      i = lt + 1;
      continue;
    }
    i = TAG.lastIndex;
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const open = stack.pop();
      if (open === undefined || elements[open].tag !== tag) {
        problems.push(`unbalanced </${tag}>`);
        if (open !== undefined) stack.push(open);
      }
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const parent = stack.length ? stack[stack.length - 1] : -1;
    const element = {
      tag,
      attrs,
      classes: (attrs.class || '').split(/\s+/).filter(Boolean),
      depth: stack.length,
      parent
    };
    elements.push(element);
    if (parent === -1) roots.push(elements.length - 1);
    if (!VOID.has(tag) && !selfClose) stack.push(elements.length - 1);
  }
  if (stack.length) problems.push(`unclosed <${elements[stack[stack.length - 1]].tag}>`);
  return {elements, roots, problems};
}

/** All values of `data-action` in the markup, in order. */
export function actionsIn(html) {
  return scanHtml(html)
    .elements.filter((e) => 'data-action' in e.attrs)
    .map((e) => e.attrs['data-action']);
}

/** Every class used anywhere in the markup. */
export function classesIn(html) {
  const set = new Set();
  for (const e of scanHtml(html).elements) for (const c of e.classes) set.add(c);
  return set;
}

/** Tag name histogram, used to prove hostile text did not create elements. */
export function tagHistogram(html) {
  const out = {};
  for (const e of scanHtml(html).elements) out[e.tag] = (out[e.tag] || 0) + 1;
  return out;
}

/** Event-handler or scripting attributes anywhere in the markup. */
export function dangerousAttributes(html) {
  const found = [];
  for (const e of scanHtml(html).elements) {
    for (const name of Object.keys(e.attrs)) {
      if (/^on/.test(name) || (name === 'src' && /^\s*javascript:/i.test(e.attrs[name])))
        found.push(`${e.tag}[${name}]`);
    }
    if (e.tag === 'script') found.push('script');
  }
  return found;
}
