// A small, strict CSS reader used by tools/assemble-css.mjs.
//
// Nothing here touches the file system. The reader is a tokenizer-level scanner (comments, strings,
// url, parentheses and brackets are tracked), not a regex pass, and it throws on anything it does not
// understand (CSS nesting, unbalanced braces) instead of guessing.

const WHITESPACE = /\s/;

/** Index just after the string that opens at `i`. */
function skipString(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') j += 2;
    else if (text[j] === quote) return j + 1;
    else if (text[j] === '\n')
      return j; // unterminated string ends at the newline (CSS error recovery)
    else j++;
  }
  return j;
}

/** Index just after the comment that opens at `i`. */
function skipComment(text, i) {
  const close = text.indexOf('*/', i + 2);
  if (close === -1) throw new Error(`unterminated comment at offset ${i}`);
  return close + 2;
}

/**
 * Walk `text` from `start`, calling `visit(char, index)` for every character that is not inside a string or a
 * comment. `visit` may return a number to jump to that index (used to skip balanced groups).
 */
function scan(text, start, end, visit) {
  let i = start;
  while (i < end) {
    const c = text[i];
    if (c === '"' || c === "'") i = skipString(text, i);
    else if (c === '/' && text[i + 1] === '*') i = skipComment(text, i);
    else if (c === '\\') i += 2;
    else {
      const jump = visit(c, i);
      i = typeof jump === 'number' ? jump : i + 1;
    }
  }
}

/** Replace every comment with spaces of the same length (newlines kept), leaving strings alone. */
export function blankComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const j = skipString(text, i);
      out += text.slice(i, j);
      i = j;
    } else if (c === '/' && text[i + 1] === '*') {
      const j = skipComment(text, i);
      out += text.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Split `text` on `separator` characters that sit outside strings, parentheses and brackets. */
export function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let last = 0;
  scan(text, 0, text.length, (c, i) => {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && c === separator) {
      parts.push(text.slice(last, i));
      last = i + 1;
    }
  });
  parts.push(text.slice(last));
  return parts;
}

/** Index of the `}` matching the `{` at `open`; throws when the block never closes. */
function findBlockEnd(text, open, end) {
  let depth = 0;
  let close = -1;
  scan(text, open, end, (c, i) => {
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        return end;
      }
    }
  });
  if (close === -1) throw new Error(`unbalanced "{" at offset ${open}`);
  return close;
}

/** Offset of the first `{`, `;` or `}` outside parentheses/brackets/strings/comments (or `end`). */
function findPreludeEnd(text, start, end) {
  let depth = 0;
  let stop = end;
  scan(text, start, end, (c, i) => {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth <= 0 && (c === '{' || c === ';' || c === '}')) {
      stop = i;
      return end;
    }
  });
  return stop;
}

/** @returns {(offset:number)=>number} 1-based line of an offset. */
export function lineResolver(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Stylesheet parser

/** At-rules whose block is a declaration list. */
const DECLARATION_AT_RULES = new Set(['font-face', 'page', 'property', 'counter-style']);

/**
 * @typedef {Object} Declaration
 * @property {string} prop        lower-cased, except custom properties which are case-sensitive
 * @property {string} value       trimmed, `!important` removed, comments removed
 * @property {boolean} important
 *
 * @typedef {Object} Node
 * @property {'comment'|'rule'|'at'|'statement'} type
 * @property {number} start       offset of the first character
 * @property {number} end         offset after the last character
 * @property {number} line        1-based line of `start`
 * @property {number} endLine
 * @property {string} [text]            comment: the text between the delimiters
 * @property {string} [selectorText]    rule: the raw selector list, comments removed, trimmed
 * @property {string[]} [selectors]     rule: one entry per complex selector
 * @property {Declaration[]} [decls]    rule / declaration at-rules
 * @property {string} [name]            at-rule name without `@`, lower-cased
 * @property {string} [prelude]         at-rule prelude, trimmed
 * @property {Node[]|null} [children]   at-rule with a rule block
 */

/**
 * Parse `text` into top-level nodes. Throws on structural errors.
 * @param {string} text
 * @returns {{nodes: Node[], lineOf: (offset:number)=>number}}
 */
export function parseStylesheet(text) {
  const lineOf = lineResolver(text);
  return {nodes: parseBlock(text, 0, text.length, lineOf), lineOf};
}

function parseBlock(text, start, end, lineOf) {
  const nodes = [];
  let i = start;
  while (i < end) {
    if (WHITESPACE.test(text[i])) {
      i++;
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      const stop = skipComment(text, i);
      const closed = text.slice(i, stop).endsWith('*/') && stop - i >= 4;
      nodes.push({
        type: 'comment',
        text: text.slice(i + 2, closed ? stop - 2 : stop),
        start: i,
        end: stop,
        line: lineOf(i),
        endLine: lineOf(stop - 1)
      });
      i = stop;
      continue;
    }
    if (text[i] === '}') throw new Error(`unexpected "}" at line ${lineOf(i)}`);
    if (text[i] === ';') {
      i++;
      continue;
    }
    const preludeEnd = findPreludeEnd(text, i, end);
    if (preludeEnd >= end || text[preludeEnd] === '}') {
      throw new Error(`unterminated rule at line ${lineOf(i)}`);
    }
    const rawPrelude = text.slice(i, preludeEnd);
    const prelude = blankComments(rawPrelude).trim();
    if (text[preludeEnd] === ';') {
      const at = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      nodes.push({
        type: 'statement',
        name: at ? at[1].toLowerCase() : '',
        prelude: at ? at[2].trim() : prelude,
        start: i,
        end: preludeEnd + 1,
        line: lineOf(i),
        endLine: lineOf(preludeEnd)
      });
      i = preludeEnd + 1;
      continue;
    }
    const close = findBlockEnd(text, preludeEnd, end);
    const base = {start: i, end: close + 1, line: lineOf(i), endLine: lineOf(close)};
    if (prelude.startsWith('@')) {
      const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      if (!m) throw new Error(`bad at-rule at line ${base.line}`);
      const name = m[1].toLowerCase();
      const node = {type: 'at', name, prelude: m[2].trim(), children: null, ...base};
      if (DECLARATION_AT_RULES.has(name))
        node.decls = parseDeclarations(text.slice(preludeEnd + 1, close));
      else node.children = parseBlock(text, preludeEnd + 1, close, lineOf);
      nodes.push(node);
    } else {
      const selectors = splitTop(prelude, ',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!selectors.length) throw new Error(`empty selector at line ${base.line}`);
      nodes.push({
        type: 'rule',
        selectorText: prelude,
        selectors,
        decls: parseDeclarations(text.slice(preludeEnd + 1, close)),
        ...base
      });
    }
    i = close + 1;
  }
  return nodes;
}

/** Declarations of one block body. Comments are dropped; a nested `{` is rejected. */
export function parseDeclarations(body) {
  const clean = blankComments(body);
  const decls = [];
  for (const piece of splitTop(clean, ';')) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (/\{/.test(trimmed.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, ''))) {
      throw new Error(`CSS nesting is not supported: "${trimmed.slice(0, 60)}"`);
    }
    const colon = trimmed.indexOf(':');
    if (colon === -1) throw new Error(`declaration without a colon: "${trimmed.slice(0, 60)}"`);
    const rawProp = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    decls.push({
      prop: rawProp.startsWith('--') ? rawProp : rawProp.toLowerCase(),
      value,
      important
    });
  }
  return decls;
}
