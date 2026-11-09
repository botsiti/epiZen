import { useState } from 'react';
import type { Filter } from '../../lib/bases/bases';
import { FILTER_OPERATORS, filterGroup, readFilterRule, writeFilterRule, type FilterRule } from '../../lib/bases/filterRules';
import { PROPERTY_LABELS } from '../../lib/bases/rows';

export interface PropertyOption { property: string; label: string }
export function FilterEditor({ value, onChange, properties, depth = 0 }: { value?: Filter; onChange: (value: Filter | undefined) => void; properties: PropertyOption[]; depth?: number }) {
  const group = filterGroup(value);
  const commit = (children: Filter[], operator = group.operator) => onChange({ [operator]: children } as Filter);
  return <div className="base-filter-group">
    <div className="base-filter-group-head"><select aria-label={depth ? 'Filter group match' : 'Filter match'} value={group.operator} onChange={(event) => commit(group.children, event.target.value as typeof group.operator)}><option value="and">All of the following are true</option><option value="or">Any of the following are true</option><option value="not">None of the following are true</option></select></div>
    {group.children.map((child, index) => <div className="base-filter-line" key={index}>{typeof child === 'string' ? <Rule value={child} properties={properties} onChange={(next) => commit(group.children.map((item, i) => i === index ? next : item))} /> : <FilterEditor value={child} depth={depth + 1} properties={properties} onChange={(next) => commit(group.children.map((item, i) => i === index ? next ?? { and: [] } : item))} />}<button type="button" className="base-icon-action" aria-label={`Remove condition ${index + 1}`} onClick={() => commit(group.children.filter((_, i) => i !== index))}>×</button></div>)}
    <div className="base-filter-add"><button type="button" onClick={() => commit([...group.children, 'file.folder == ""'])}>+ Add filter</button>{depth < 8 && <button type="button" onClick={() => commit([...group.children, { and: [] }])}>+ Add filter group</button>}</div>
  </div>;
}
function Rule({ value, properties, onChange }: { value: string; properties: PropertyOption[]; onChange: (value: string) => void }) {
  const rule = readFilterRule(value);
  const [code, setCode] = useState(!rule);
  const comparisonLabel = (operator: string, fallback: string) => ({ '>': rule?.type === 'date' ? 'after' : 'greater than', '<': rule?.type === 'date' ? 'before' : 'less than', '>=': rule?.type === 'date' ? 'on or after' : 'at least', '<=': rule?.type === 'date' ? 'on or before' : 'at most' } as Record<string, string>)[operator] ?? fallback;
  const change = (next: Partial<FilterRule>) => rule && onChange(writeFilterRule({ ...rule, ...next }));
  return <div className="base-rule">{code || !rule ? <input className="base-expression" aria-label="Filter expression" value={value} onChange={(event) => onChange(event.target.value)} /> : <>
    <select aria-label="Filter property" value={rule.property} onChange={(event) => change({ property: event.target.value })}>{!properties.some((item) => item.property === rule.property) && <option value={rule.property}>{PROPERTY_LABELS[rule.property] ?? rule.property}</option>}{properties.map((item) => <option key={item.property} value={item.property}>{item.label}</option>)}</select>
    <select aria-label="Filter comparison" value={rule.operator} onChange={(event) => change({ operator: event.target.value })}>{FILTER_OPERATORS.map(([operator, name]) => <option key={operator} value={operator}>{comparisonLabel(operator, name)}</option>)}</select>
    {!rule.operator.includes('empty') && <>{rule.type === 'checkbox' ? <select aria-label="Filter value" value={rule.value} onChange={(event) => change({ value: event.target.value })}><option value="true">Checked</option><option value="false">Unchecked</option></select> : <input aria-label="Filter value" type={rule.type === 'date' ? 'date' : rule.type === 'number' ? 'number' : 'text'} value={rule.value} onChange={(event) => change({ value: event.target.value })} />}<select aria-label="Filter value type" className="base-value-type" value={rule.type} onChange={(event) => change({ type: event.target.value as FilterRule['type'] })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Checkbox</option></select></>}
  </>}<button type="button" className="base-icon-action" aria-label={code ? 'Use filter controls' : 'Edit filter expression'} title="Filter expression" onClick={() => setCode(!code)}>&lt;/&gt;</button></div>;
}
