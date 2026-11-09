import { arithmetic, compareValues, containsValue, dateTime, dateValue, duration, equalValues, formatDateValue, isRecord, kind, ownValue, textValue, type Lookup, type Value } from './values';
export { compareValues, type Value, type Lookup } from './values';

type Node = { kind: 'literal'; value: Value } | { kind: 'variable'; name: string } | { kind: 'member'; value: Node; key: Node } | { kind: 'list'; values: Node[] } | { kind: 'unary'; op: string; value: Node } | { kind: 'binary'; op: string; left: Node; right: Node } | { kind: 'call'; name: string; args: Node[]; receiver?: Node };
interface Token { text: string; value?: Value }
const GLOBALS = new Set(['if', 'date', 'duration', 'today', 'now', 'number', 'list', 'min', 'max', 'link', 'image', 'file', 'icon', 'escapeHTML', 'html', 'contains', 'dateformat']);
const METHODS = new Set(['contains', 'containsAll', 'containsAny', 'startsWith', 'endsWith', 'isEmpty', 'isTruthy', 'isType', 'toString', 'lower', 'upper', 'title', 'trim', 'replace', 'repeat', 'reverse', 'slice', 'split', 'abs', 'ceil', 'floor', 'round', 'toFixed', 'format', 'date', 'time', 'relative', 'filter', 'map', 'reduce', 'flat', 'join', 'sort', 'unique', 'mean', 'sum', 'min', 'max', 'median', 'stddev', 'inFolder', 'hasTag', 'hasLink', 'hasProperty', 'asLink', 'asFile', 'linksTo', 'keys', 'values', 'matches']);
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor', 'window', 'document', 'globalThis', 'process', 'require', 'eval', 'Function']);
function tokenize(source: string): Token[] {
  if (source.length > 8192) throw new Error('This expression is too long.');
  const result: Token[] = []; let at = 0;
  while (at < source.length) {
    const rest = source.slice(at), whitespace = /^\s+/.exec(rest);
    if (whitespace) { at += whitespace[0].length; continue; }
    const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(rest);
    if (quoted) { const raw = quoted[0]; result.push({ text: raw, value: raw[0] === '"' ? JSON.parse(raw) as string : raw.slice(1, -1).replace(/\\(['\\])/g, '$1') }); at += raw.length; continue; }
    const previous = result.at(-1)?.text;
    if (rest[0] === '/' && (!previous || ['(', ',', '==', '!=', '&&', '||', '['].includes(previous))) {
      const regex = /^\/((?:[^/\\]|\\.)+)\/([gimuys]*)/.exec(rest);
      if (regex) { safeRegex(regex[1]!, regex[2]!); result.push({ text: regex[0], value: { $kind: 'regex', source: regex[1]!, flags: regex[2]! } }); at += regex[0].length; continue; }
    }
    const number = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest), word = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(rest), op = /^(?:==|!=|>=|<=|&&|\|\||[=><!()[\].,+*/%:-])/.exec(rest);
    const text = number?.[0] ?? word?.[0] ?? op?.[0];
    if (!text) throw new Error(`Unsupported expression near “${rest.slice(0, 24)}”.`);
    result.push({ text, ...(number ? { value: Number(text) } : ['true', 'false', 'null'].includes(text) ? { value: text === 'null' ? null : text === 'true' } : {}) }); at += text.length;
    if (result.length > 1024) throw new Error('This expression is too complex.');
  }
  return result;
}
function safeRegex(source: string, flags: string): RegExp {
  const structure = source.replace(/\[(?:[^\]\\]|\\.)*\]/g, 'C').replace(/\\./g, 'L');
  const repetitions = [...structure.matchAll(/[*+?]|\{(\d+)(?:,(\d*))?\}/g)];
  const variable = repetitions.filter((match) => !match[1] || match[0].includes(','));
  if (source.length > 256 || /\\[1-9]/.test(source) || /[()|]/.test(structure) || variable.length > 1 || variable.length === 1 && !source.startsWith('^') || repetitions.some((match) => Number(match[1]) > 1000 || Number(match[2]) > 1000)) throw new Error('This regular expression is too complex to run safely. Use a simple anchored or fixed-length pattern.');
  return new RegExp(source, flags);
}
function regexText(value: string): string {
  if (value.length > 4096) throw new Error('This text is too long for a regular-expression operation.');
  return value;
}
function parser(source: string): Node {
  const tokens = tokenize(source); let at = 0, depth = 0;
  const peek = () => tokens[at]?.text;
  const take = (text: string) => { if (peek() !== text) return false; at++; return true; };
  const require = (text: string) => { if (!take(text)) throw new Error(`Expected “${text}” near “${peek() ?? 'end'}”.`); };
  const argumentsOf = (end: string): Node[] => { const list: Node[] = []; if (!take(end)) { do { list.push(expression(0)); } while (take(',')); require(end); } return list; };
  const primary = (): Node => {
    if (++depth > 40) throw new Error('This expression is nested too deeply.');
    let node: Node;
    const token = tokens[at++]; if (!token) throw new Error('Expected a value or property.');
    if ('value' in token) node = { kind: 'literal', value: token.value! };
    else if (token.text === '(') { node = expression(0); require(')'); }
    else if (token.text === '[') node = { kind: 'list', values: argumentsOf(']') };
    else if (['!', 'not', '-', '+'].includes(token.text)) node = { kind: 'unary', op: token.text, value: primary() };
    else if (/^[\p{L}_$]/u.test(token.text) && !UNSAFE.has(token.text)) {
      if (take('(')) { if (!GLOBALS.has(token.text)) throw new Error(`Unknown function “${token.text}”.`); node = { kind: 'call', name: token.text, args: argumentsOf(')') }; }
      else node = { kind: 'variable', name: token.text };
    } else throw new Error(`Unexpected “${token.text}”.`);
    while (peek() === '.' || peek() === '[') {
      if (take('.')) {
        const name = tokens[at++]?.text;
        if (!name || !/^[\p{L}_$]/u.test(name) || UNSAFE.has(name)) throw new Error('Invalid property or function.');
        if (take('(')) { if (!METHODS.has(name)) throw new Error(`Unknown function “${name}”.`); node = { kind: 'call', name, args: argumentsOf(')'), receiver: node }; }
        else node = { kind: 'member', value: node, key: { kind: 'literal', value: name } };
      } else { require('['); const key = expression(0); require(']'); node = { kind: 'member', value: node, key }; }
    }
    depth--; return node;
  };
  const precedence: Record<string, number> = { '||': 1, or: 1, '&&': 2, and: 2, '==': 3, '=': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  const expression = (minimum: number): Node => {
    let left = primary();
    while (peek() && (precedence[peek()!] ?? -1) >= minimum) { const op = tokens[at++]!.text, right = expression(precedence[op]! + 1); left = { kind: 'binary', op, left, right }; }
    return left;
  };
  const node = expression(0); if (at !== tokens.length) throw new Error(`Unsupported expression near “${peek()}”.`); return node;
}
function access(value: Value, key: string): Value {
  if (UNSAFE.has(key)) throw new Error('Invalid property.');
  if (key === 'length' && (typeof value === 'string' || Array.isArray(value))) return value.length;
  if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)] ?? null;
  if (kind(value, 'date')) {
    const date = new Date(dateTime(value)!);
    const fields: Record<string, number> = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(), millisecond: date.getMilliseconds() };
    return fields[key] ?? null;
  }
  return ownValue(value, key);
}
function pathOf(node: Node): string | undefined {
  if (node.kind === 'variable') return node.name;
  if (node.kind === 'member' && node.key.kind === 'literal' && typeof node.key.value === 'string') { const prefix = pathOf(node.value); return prefix ? `${prefix}.${node.key.value}` : undefined; }
  return undefined;
}
function member(node: Extract<Node, { kind: 'member' }>, read: Lookup, run: (n: Node, r?: Lookup) => Value): Value {
  const path = pathOf(node);
  if (path && /^(?:note|file|formula|this)\./.test(path) && (path.split('.').length <= 2 || /^this\.file\.[^.]+$/.test(path))) return read(path);
  return access(run(node.value), textValue(run(node.key)));
}
export function compileExpression(source: string): (lookup: Lookup) => Value {
  const root = parser(source);
  return (lookup) => {
    let budget = 25000;
    const evaluate = (node: Node, read = lookup): Value => {
      if (--budget < 0) throw new Error('This expression took too many steps.');
      const run = (n: Node, r = read) => evaluate(n, r);
      if (node.kind === 'literal') return node.value;
      if (node.kind === 'variable') return read(node.name);
      if (node.kind === 'list') return node.values.map((n) => run(n));
      if (node.kind === 'member') return member(node, read, run);
      if (node.kind === 'unary') { const value = run(node.value); return node.op === '!' || node.op === 'not' ? !value : value === null ? null : node.op === '-' ? -Number(value) : Number(value); }
      if (node.kind === 'binary') {
        const a = run(node.left);
        if (['&&', 'and'].includes(node.op)) return Boolean(a && run(node.right));
        if (['||', 'or'].includes(node.op)) return Boolean(a || run(node.right));
        const b = run(node.right);
        if (['==', '='].includes(node.op)) return equalValues(a, b);
        if (node.op === '!=') return !equalValues(a, b);
        if (['>', '<', '>=', '<='].includes(node.op)) { if (a === null || b === null) return false; const cmp = compareValues(a, b); return node.op === '>' ? cmp > 0 : node.op === '<' ? cmp < 0 : node.op === '>=' ? cmp >= 0 : cmp <= 0; }
        return arithmetic(a, b, node.op);
      }
      const name = node.name;
      if (!node.receiver && name === 'if') { if (node.args.length < 2 || node.args.length > 3) throw new Error('if() needs a condition and two choices.'); return run(node.args[0]!) ? run(node.args[1]!) : node.args[2] ? run(node.args[2]) : null; }
      const value = node.receiver ? run(node.receiver) : null;
      if (node.receiver && ['filter', 'map', 'reduce'].includes(name)) {
        if (value === null) return [];
        if (!Array.isArray(value) || value.length > 10000 || !node.args[0]) throw new Error(`${name}() needs a list and an expression.`);
        const local = (item: Value, index: number, acc: Value): Lookup => (key) => key === 'value' ? item : key.startsWith('value.') ? key.slice(6).split('.').reduce(access, item) : key === 'index' ? index : key === 'acc' ? acc : read(key);
        if (name === 'map') return value.map((item, index) => run(node.args[0]!, local(item, index, null)));
        if (name === 'filter') return value.filter((item, index) => Boolean(run(node.args[0]!, local(item, index, null))));
        let acc = node.args[1] ? run(node.args[1]) : null;
        value.forEach((item, index) => { acc = run(node.args[0]!, local(item, index, acc)); }); return acc;
      }
      const args = node.args.map((n) => run(n)), arg = (n = 0) => args[n] ?? null;
      const count = (min: number, max = min) => { if (args.length < min || args.length > max) throw new Error(`${name}() needs ${min === max ? min : `${min}–${max}`} argument(s).`); };
      if (!node.receiver) {
        switch (name) {
          case 'date': count(1); return dateValue(arg());
          case 'duration': count(1); return duration(arg());
          case 'now': count(0); return dateValue(new Date().toISOString());
          case 'today': { count(0); const now = new Date(); return dateValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`); }
          case 'number': { count(1); const v = arg(), n = kind(v, 'date') ? dateTime(v) : Number(v); if (n === undefined || !Number.isFinite(n)) throw new Error('Cannot convert this value to a number.'); return n; }
          case 'list': count(1); return Array.isArray(arg()) ? arg() : [arg()];
          case 'min': case 'max': { if (!args.length) return null; const numbers = args.map(Number); return name === 'min' ? Math.min(...numbers) : Math.max(...numbers); }
          case 'file': count(1); return read(`@file:${kind(arg(), 'link') || kind(arg(), 'file') ? textValue(ownValue(arg(), 'path')) : textValue(arg())}`);
          case 'link': case 'image': { count(1, 2); const raw = kind(arg(), 'link') || kind(arg(), 'file') ? textValue(ownValue(arg(), 'path')) : textValue(arg()), match = /^!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/.exec(raw); const path = match?.[1] ?? raw; const found = read(`@file:${path}`); return { $kind: name, path: kind(found, 'file') ? ownValue(found, 'path') : path, label: args[1] !== undefined ? textValue(arg(1)) : match?.[2] ?? path }; }
          case 'icon': count(1); return { $kind: 'icon', name: textValue(arg()) };
          case 'html': case 'escapeHTML': count(1); return textValue(arg()).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          case 'contains': count(2); return containsValue(arg(), arg(1));
          case 'dateformat': count(2); return formatDateValue(arg(), textValue(arg(1)));
        }
      }
      if (name === 'isEmpty') { count(0); return value === null || value === '' || Array.isArray(value) && value.length === 0 || isRecord(value) && !Object.keys(value).length; }
      if (name === 'isTruthy') { count(0); return Boolean(value); }
      if (name === 'isType') { count(1); return textValue(arg()) === (kind(value, 'date') ? 'date' : kind(value, 'link') ? 'link' : kind(value, 'file') ? 'file' : Array.isArray(value) ? 'list' : value === null ? 'null' : typeof value); }
      if (name === 'toString') { count(0); return textValue(value); }
      if (value === null) return null;
      if (name === 'contains' || name === 'containsAll' || name === 'containsAny') { count(1, name === 'contains' ? 1 : 100); return name === 'containsAll' ? args.every((a) => containsValue(value, a)) : args.some((a) => containsValue(value, a)); }
      if (kind(value, 'file')) {
        const path = textValue(ownValue(value, 'path'));
        if (name === 'inFolder') { count(1); const folder = textValue(arg()).replace(/\/$/, ''), own = textValue(ownValue(value, 'folder')); return !folder || own === folder || own.startsWith(`${folder}/`); }
        if (name === 'hasTag') { count(1, 100); const tags = ownValue(value, 'tags'); return Array.isArray(tags) && args.some((a) => tags.some((tag) => { const wanted = textValue(a).replace(/^#/, '').toLowerCase(), own = textValue(tag).replace(/^#/, '').toLowerCase(); return own === wanted || own.startsWith(`${wanted}/`); })); }
        if (name === 'hasProperty') { count(1); const props = ownValue(value, 'properties'); return isRecord(props) && Object.hasOwn(props, textValue(arg())); }
        if (name === 'hasLink') { count(1); const target = kind(arg(), 'file') || kind(arg(), 'link') ? ownValue(arg(), 'path') : ownValue(read(`@file:${textValue(arg())}`), 'path'); const links = ownValue(value, 'links'); return Array.isArray(links) && links.some((item) => ownValue(item, 'path') === target); }
        if (name === 'asLink') { count(0, 1); return { $kind: 'link', path, label: args.length ? textValue(arg()) : textValue(ownValue(value, 'basename')) }; }
      }
      if (kind(value, 'link')) {
        if (name === 'asFile') { count(0); return read(`@file:${textValue(ownValue(value, 'path'))}`); }
        if (name === 'linksTo') { count(1); const file = read(`@file:${textValue(ownValue(value, 'path'))}`), links = ownValue(file, 'links'); return Array.isArray(links) && links.some((link) => equalValues(link, arg())); }
      }
      if (kind(value, 'date') || dateTime(value) !== undefined && ['format', 'date', 'time', 'relative'].includes(name)) {
        if (name === 'format') { count(1); return formatDateValue(value, textValue(arg())); }
        if (name === 'date') { count(0); return dateValue(formatDateValue(value, 'YYYY-MM-DD')); }
        if (name === 'time') { count(0); return formatDateValue(value, 'HH:mm:ss'); }
        if (name === 'relative') { count(0); const days = Math.round((dateTime(value)! - Date.now()) / 86400000); return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(days, 'day'); }
      }
      if (typeof value === 'string') {
        if (name === 'startsWith' || name === 'endsWith') { count(1); return value[name](textValue(arg())); }
        if (['lower', 'upper', 'trim', 'title', 'reverse'].includes(name)) { count(0); return name === 'lower' ? value.toLowerCase() : name === 'upper' ? value.toUpperCase() : name === 'trim' ? value.trim() : name === 'reverse' ? [...value].reverse().join('') : value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()); }
        if (name === 'repeat') { count(1); const n = Number(arg()); if (!Number.isInteger(n) || n < 0 || n * value.length > 100000) throw new Error('Repeated text is too large.'); return value.repeat(n); }
        if (name === 'slice') { count(1, 2); return value.slice(Number(arg()), args[1] === undefined ? undefined : Number(arg(1))); }
        if (name === 'split' || name === 'replace') {
          count(name === 'split' ? 1 : 2, 2); const first = arg(); const pattern = kind(first, 'regex') ? safeRegex(textValue(ownValue(first, 'source')), textValue(ownValue(first, 'flags'))) : textValue(first);
          const input = pattern instanceof RegExp ? regexText(value) : value;
          const replacement = textValue(arg(1));
          if (name === 'replace' && (input.length + 1) * replacement.length > 1_000_000) throw new Error('The replacement could produce too much text.');
          return name === 'split' ? input.split(pattern, args[1] === undefined ? undefined : Number(arg(1))) : pattern instanceof RegExp ? input.replace(pattern, replacement) : input.replaceAll(pattern, replacement);
        }
      }
      if (typeof value === 'number') {
        if (['abs', 'ceil', 'floor'].includes(name)) { count(0); return name === 'abs' ? Math.abs(value) : name === 'ceil' ? Math.ceil(value) : Math.floor(value); }
        if (name === 'round' || name === 'toFixed') { count(0, 1); const digits = Number(arg() ?? 0); if (!Number.isInteger(digits) || digits < 0 || digits > 20) throw new Error('Use 0–20 decimal places.'); return name === 'round' ? Math.round(value * 10 ** digits) / 10 ** digits : value.toFixed(digits); }
      }
      if (Array.isArray(value)) {
        if (name === 'join') { count(0, 1); return value.map(textValue).join(args.length ? textValue(arg()) : ', '); }
        if (name === 'slice') { count(1, 2); return value.slice(Number(arg()), args[1] === undefined ? undefined : Number(arg(1))); }
        if (name === 'reverse') { count(0); return value.toReversed(); }
        if (name === 'flat') { count(0); return value.flat(); }
        if (name === 'sort') { count(0); return value.toSorted(compareValues); }
        if (name === 'unique') { count(0); return value.filter((item, index) => value.findIndex((other) => equalValues(item, other)) === index); }
        if (['sum', 'mean', 'min', 'max', 'median', 'stddev'].includes(name)) { count(0); const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).toSorted((a, b) => a - b); if (!numbers.length) return null; const sum = numbers.reduce((a, b) => a + b, 0), mean = sum / numbers.length, middle = Math.floor(numbers.length / 2); return name === 'sum' ? sum : name === 'mean' ? mean : name === 'min' ? numbers[0]! : name === 'max' ? numbers.at(-1)! : name === 'stddev' ? Math.sqrt(numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / numbers.length) : numbers.length % 2 ? numbers[middle]! : (numbers[middle - 1]! + numbers[middle]!) / 2; }
      }
      if (kind(value, 'regex') && name === 'matches') { count(1); return safeRegex(textValue(ownValue(value, 'source')), textValue(ownValue(value, 'flags'))).test(regexText(textValue(arg()))); }
      if (isRecord(value) && (name === 'keys' || name === 'values')) { count(0); return name === 'keys' ? Object.keys(value).filter((key) => key !== '$kind') : Object.entries(value).filter(([key]) => key !== '$kind').map(([, v]) => v); }
      throw new Error(`“${name}” cannot be used with this value.`);
    };
    return evaluate(root);
  };
}
