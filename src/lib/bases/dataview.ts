import { compileExpression } from './expression';
import { lookupRow, parseBase, propertyValue, validProperty, type BaseDefinition, type BaseSort } from './bases';

/** Compatibility for declarative TABLE queries in older MOCs. No Dataview plugin or JS runs. */
export function parseDataview(source: string): BaseDefinition {
  const match = /^\s*table\s+(without\s+id\s+)?([\s\S]+?)(?=\n\s*(?:from|where|sort|limit)\b|$)/i.exec(source);
  if (!match) throw new Error('Only declarative Dataview TABLE queries are supported.');
  const columns = match[2]!.split(',').map((entry) => {
    const column = /^\s*([\p{L}\p{N}_.-]+)(?:\s+as\s+"([^"]+)")?\s*$/iu.exec(entry);
    if (!column) throw new Error(`Unsupported table column: ${entry.trim()}`);
    return { property: validProperty(column[1]!), label: column[2] ?? column[1]!.replace(/^file\./, '') };
  });
  if (!match[1]) columns.unshift({ property: 'file.name', label: 'Name' });
  const rest = source.slice(match[0].length).trim();
  const clauses = rest ? rest.split(/\n(?=\s*(?:from|where|sort|limit)\b)/i) : [];
  const predicates: ReturnType<typeof compileExpression>[] = [];
  const sort: BaseSort[] = [];
  let limit: number | undefined;
  const seen = new Set<string>();
  for (const clause of clauses) {
    const parts = /^(from|where|sort|limit)\s+([\s\S]+)$/i.exec(clause.trim());
    if (!parts) throw new Error(`Unsupported query clause: ${clause.trim()}`);
    const kind = parts[1]!.toLowerCase(), value = parts[2]!.trim();
    if (seen.has(kind)) throw new Error(`Repeated ${kind} clauses are not supported.`);
    seen.add(kind);
    if (kind === 'from') {
      if (!/^"[^"\n]*"$/.test(value)) throw new Error('Choose one quoted folder as the table source.');
      predicates.push(compileExpression(`file.inFolder(${value})`));
    } else if (kind === 'where') predicates.push(compileExpression(value));
    else if (kind === 'sort') for (const part of value.split(',')) {
      const sorting = /^\s*([\p{L}\p{N}_.-]+)(?:\s+(asc|desc))?\s*$/iu.exec(part);
      if (!sorting) throw new Error('Unsupported table sort.');
      sort.push({ property: validProperty(sorting[1]!), direction: sorting[2]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' });
    } else {
      if (!/^\d+$/.test(value)) throw new Error('The row limit must be a non-negative whole number.');
      limit = Number(value);
    }
  }
  const base = parseBase('views: [{type: table, name: Table}]');
  return { ...base, views: [{ ...base.views[0]!, columns, sort, limit, value: propertyValue, accepts: (row) => row.file.kind === 'note' && predicates.every((predicate) => Boolean(predicate(lookupRow(row)))) }] };
}
