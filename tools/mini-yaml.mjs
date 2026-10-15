// A tiny YAML reader for the dashboards in examples/ (tools/screenshots.mjs). It understands the subset the examples
// use: block maps and lists, flow maps and lists, quoted and plain scalars, comments. Anchors, multi-line scalars and
// multiple documents are not supported.

function splitFlow(text) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(last, i));
      last = i + 1;
    }
  }
  if (text.slice(last).trim()) parts.push(text.slice(last));
  return parts;
}

function scalar(text) {
  const t = text.trim();
  if (t.startsWith('{')) {
    const out = {};
    for (const part of splitFlow(t.slice(1, -1))) {
      const colon = part.indexOf(':');
      out[part.slice(0, colon).trim()] = scalar(part.slice(colon + 1));
    }
    return out;
  }
  if (t.startsWith('[')) return splitFlow(t.slice(1, -1)).map(scalar);
  if (/^(["']).*\1$/.test(t)) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function stripComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const clean = stripComment(raw).trimEnd();
    if (!clean.trim()) continue;
    lines.push({indent: clean.length - clean.trimStart().length, text: clean.trim()});
  }
  let i = 0;
  function block(indent) {
    return lines[i].text.startsWith('-') ? list(indent) : map(indent);
  }
  function list(indent) {
    const out = [];
    while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('-')) {
      const rest = lines[i].text.slice(1).trimStart();
      if (!rest) {
        i++;
        out.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null);
      } else if (/^[^\s{["'][^:]*:(\s|$)/.test(rest)) {
        lines[i] = {indent: indent + (lines[i].text.length - rest.length), text: rest};
        out.push(map(lines[i].indent));
      } else {
        i++;
        out.push(scalar(rest));
      }
    }
    return out;
  }
  function map(indent) {
    const out = {};
    while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('- ')) {
      const m = /^([^:]+?):(?:\s+(.*))?$/.exec(lines[i].text);
      if (!m) throw new Error(`cannot parse: ${lines[i].text}`);
      i++;
      if (m[2] !== undefined && m[2] !== '') out[m[1]] = scalar(m[2]);
      else if (
        i < lines.length &&
        (lines[i].indent > indent || (lines[i].indent === indent && lines[i].text.startsWith('-')))
      )
        out[m[1]] = block(lines[i].indent);
      else out[m[1]] = null;
    }
    return out;
  }
  return lines.length ? block(lines[0].indent) : null;
}

/** Every object in `doc` (at any depth) for which `predicate` is true, in document order. */
export function findAll(doc, predicate, out = []) {
  if (Array.isArray(doc)) for (const item of doc) findAll(item, predicate, out);
  else if (doc && typeof doc === 'object') {
    if (predicate(doc)) out.push(doc);
    for (const value of Object.values(doc)) findAll(value, predicate, out);
  }
  return out;
}
