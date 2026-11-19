import { useId, useState, type CSSProperties } from 'react';
import { addRewardShare, changeTaskCategory, newQuestArea, removeRewardShare, type EditableCategory, type QuestPreferences } from '../../lib/questPreferences';
import { percentBasisPoints, UNASSIGNED } from '../../lib/rewardRules';
import { PreferenceIcon } from './icons';
import { SettingsNameList } from './SettingsNameList';

interface Props { draft: QuestPreferences; onChange: (draft: QuestPreferences) => void; onManageCategories: () => void }
const tiers = ['common', 'rare', 'epic', 'legendary'] as const;

export function QuestRuleFields({ draft, onChange, onManageCategories }: Props) {
  const [selected, setSelected] = useState<string>();
  const categories = draft.categories.filter((item) => !item.archived);
  const task = categories.find((item) => item.id === selected) ?? categories[0];
  const section = useId();
  return <div className="quest-rules">
    <SettingsNameList title="Life spheres" noun="sphere"
      items={draft.areas.map((area) => ({ ...area, discardable: !area.name.trim() && !draft.base.areas.some((item) => item.id === area.id)
        && !draft.categories.some((category) => category.shares.some((share) => share.area === area.id)) }))}
      onAdd={(id) => onChange({ ...draft, areas: [...draft.areas, newQuestArea(id, draft.areas.length)] })}
      onDiscard={(id) => onChange({ ...draft, areas: draft.areas.filter((area) => area.id !== id) })}
      onRename={(id, name) => onChange({ ...draft, areas: draft.areas.map((item) => item.id === id ? { ...item, name } : item) })}
      onArchive={(id, archived) => onChange({ ...draft, areas: draft.areas.map((item) => item.id === id ? { ...item, archived } : item) })} />

    <section className="reward-section" aria-labelledby={section}>
      <header className="rules-heading"><h3 id={section}>Task rewards</h3>
        <button className="rules-link" type="button" onClick={onManageCategories}>Manage categories <span aria-hidden="true">↗</span></button></header>
      <p className="rules-note">Daily tasks and focus sessions earn XP per logged minute. Changes apply from <time>{draft.effectiveFrom}</time>.</p>
      {task ? <div className="reward-workbench">
        <div className="reward-category-list" role="group" aria-label="Task categories">
          {categories.map((item) => <button type="button" aria-pressed={item.id === task.id} key={item.id} onClick={() => setSelected(item.id)}>
            <span className="settings-color-dot" style={{ '--item-color': item.color } as CSSProperties} />{item.tag || 'New category'}
          </button>)}
        </div>
        <div className="reward-editor">
          <div className="reward-rate-row">
            <label className="reward-category-select"><span className="rules-label">Category</span>
              <select aria-label="Task category" value={task.id} onChange={(event) => setSelected(event.target.value)}>
                {categories.map((item) => <option key={item.id} value={item.id}>{item.tag || 'New category'}</option>)}
              </select></label>
            <div className="reward-category-title"><span className="settings-color-dot" style={{ '--item-color': task.color } as CSSProperties} />{task.tag || 'New category'}</div>
            <label className="reward-rate"><span className="rules-label">XP / min</span>
              <input type="number" aria-label="XP per minute" min="0" max="10000" step=".01" placeholder="Profile rate" value={task.rate}
                onChange={(event) => onChange(changeTaskCategory(draft, task.id, { rate: event.target.value }))} /></label>
          </div>
          <SphereSplit task={task} areas={draft.areas} onChange={(shares) => onChange(changeTaskCategory(draft, task.id, { shares }))} />
        </div>
      </div> : <p className="rules-note">Add a daily task category to assign rewards.</p>}
    </section>

    <section className="reward-presets"><header className="rules-heading"><h3>New quest rewards</h3></header>
      <p className="rules-note">Starting XP for each quest tier.</p>
      <div className="reward-tiers">{tiers.map((tier) => <label key={tier}><span>{tier}</span>
        <input type="number" aria-label={`${tier} quest XP`} min="0" step="1" max="1000000000" value={draft.presets[tier]} onChange={(event) => onChange({ ...draft, presets: { ...draft.presets, [tier]: event.target.value } })} />
      </label>)}</div>
    </section>
  </div>;
}

interface SplitProps {
  task: EditableCategory;
  areas: QuestPreferences['areas'];
  onChange: (shares: EditableCategory['shares']) => void;
}
function SphereSplit({ task, areas, onChange }: SplitProps) {
  const destinations = [...areas.filter((area) => area.name.trim() && !area.archived), { id: UNASSIGNED, name: 'Unassigned', color: 'var(--text-faint)' }];
  const available = destinations.find((area) => !task.shares.some((share) => share.area === area.id));
  const rows = task.shares.map((share) => {
    const area = areas.find((item) => item.id === share.area);
    return { ...share, color: area?.color ?? 'var(--text-faint)', name: area?.name || 'Unassigned', basis: percentBasisPoints(share.percent) };
  });
  const total = rows.reduce((sum, row) => sum + (row.basis ?? 0), 0);
  const incomplete = rows.some((row) => row.basis === undefined);
  const balance = incomplete ? 'Check percentages' : total === 10000 ? '100% assigned'
    : total < 10000 ? `${(10000 - total) / 100}% left to assign` : `${(total - 10000) / 100}% over`;
  return <div className="reward-split">
    <div className="reward-split-head"><strong>Life sphere split</strong><span role="status" className={incomplete || total !== 10000 ? 'needs-attention' : undefined}>{balance}</span></div>
    <div className="reward-split-meter" aria-hidden="true">{rows.map((row) => <i key={row.area} style={{ width: `${(row.basis ?? 0) / 100}%`, background: row.color }} />)}</div>
    {rows.map((row, index) => <div className="reward-share-row" key={index}>
      <label className="reward-destination"><span className="settings-color-dot" style={{ '--item-color': row.color } as CSSProperties} />
        <select aria-label={`Reward sphere ${index + 1}`} value={row.area} onChange={(event) => onChange(task.shares.map((s, i) => i === index ? { ...s, area: event.target.value } : s))}>
          {!destinations.some((item) => item.id === row.area) && <option value={row.area}>{row.name} (archived)</option>}
          {destinations.map((area) => <option key={area.id} value={area.id} disabled={area.id !== row.area && rows.some((item) => item.area === area.id)}>{area.name}</option>)}
        </select></label>
      <label className="reward-percent"><input aria-label={`Share ${index + 1} percent`} type="number" min="0" max="100" step=".01" value={row.percent}
        onChange={(event) => onChange(task.shares.map((s, i) => i === index ? { ...s, percent: event.target.value } : s))} /><span>%</span></label>
      {rows.length > 1 && <button type="button" className="catalog-action" aria-label={`Remove share ${index + 1}`} title="Remove share" onClick={() => onChange(removeRewardShare(task.shares, index))}><PreferenceIcon name="remove" /></button>}
    </div>)}
    {available && <button type="button" className="rules-link split-add" onClick={() => onChange(addRewardShare(task.shares, available.id))}><PreferenceIcon name="plus" /> Split with another sphere</button>}
  </div>;
}
