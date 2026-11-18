import { useId, useState } from 'react';
import { newQuestArea, newTaskRule, type EditableCategory, type QuestPreferences } from '../../lib/questPreferences';
import type { Tier } from '../../lib/quests';
import { UNASSIGNED } from '../../lib/rewardRules';
import { SettingRow } from './SettingRow';

interface Props { draft: QuestPreferences; observed: string[]; onChange: (draft: QuestPreferences) => void }

export function QuestRuleFields({ draft, observed, onChange }: Props) {
  const [areaId, setAreaId] = useState(draft.areas[0]?.id);
  const [taskId, setTaskId] = useState(draft.categories[0]?.id);
  const area = draft.areas.find((item) => item.id === areaId);
  const task = draft.categories.find((item) => item.id === taskId);
  const tags = useId();
  const nextShare = task && [UNASSIGNED, ...draft.areas.filter((item) => !item.archived).map((item) => item.id)].find((id) => !task.shares.some((share) => share.area === id));
  function changeTask(edit: Partial<EditableCategory>) {
    onChange({ ...draft, categories: draft.categories.map((item) => item.id === taskId ? { ...item, ...edit } : item) });
  }
  function addArea() {
    const next = newQuestArea(crypto.randomUUID(), draft.areas.length);
    onChange({ ...draft, areas: [...draft.areas, next] }); setAreaId(next.id);
  }
  function addCategory() {
    const next = newTaskRule(crypto.randomUUID(), draft.effectiveFrom, draft.categories.length);
    onChange({ ...draft, categories: [...draft.categories, next] }); setTaskId(next.id);
  }
  return <>
    <section className="preferences-section">
      <div className="quest-settings-heading"><h3>Life spheres</h3><button type="button" className="quiet-button" onClick={addArea}>Add sphere</button></div>
      <div className="preferences-card">
        <SettingRow title="Life sphere"><select aria-label="Life sphere" value={areaId ?? ''} onChange={(event) => setAreaId(event.target.value)}>{draft.areas.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || 'New sphere'}{entry.archived ? ' (archived)' : ''}</option>)}</select></SettingRow>
        {area && <><SettingRow title="Sphere name"><input aria-label="Sphere name" maxLength={80} value={area.name} onChange={(event) => onChange({ ...draft, areas: draft.areas.map((item) => item.id === area.id ? { ...item, name: event.target.value } : item) })} /></SettingRow>
          <SettingRow title="Archive sphere" description="Keep earned XP. Future task shares for this sphere go to Unassigned."><input className="preference-switch" type="checkbox" checked={area.archived} onChange={(event) => onChange({ ...draft, areas: draft.areas.map((item) => item.id === area.id ? { ...item, archived: event.target.checked } : item) })} /></SettingRow></>}
      </div>
    </section>
    <section className="preferences-section">
      <div className="quest-settings-heading"><h3>Task rewards</h3><button type="button" className="quiet-button" onClick={addCategory}>Add category</button></div>
      <p className="preferences-description">Logged minutes earn XP, including focus timer sessions. Changes to rates and splits apply from {draft.effectiveFrom}.</p>
      <div className="preferences-card">
        <SettingRow title="Task category"><select aria-label="Task category" value={taskId ?? ''} onChange={(event) => setTaskId(event.target.value)}>{draft.categories.map((item) => <option key={item.id} value={item.id}>{item.tag || 'New category'}{item.archived ? ' (archived)' : ''}</option>)}</select></SettingRow>
        {task && <>
          <SettingRow title="Task tag" description="Matches #daily/ tags in notes. Previous spellings still count."><input aria-label="Task tag" value={task.tag} list={tags} maxLength={80} onChange={(event) => changeTask({ tag: event.target.value })} /></SettingRow>
          <datalist id={tags}>{observed.map((tag) => <option key={tag} value={tag} />)}</datalist>
          <SettingRow title="XP per minute" description="Set to 0 to exclude this activity from XP."><input type="number" aria-label="XP per minute" min="0" max="10000" step=".01" placeholder="Use reward profile" value={task.rate} onChange={(event) => changeTask({ rate: event.target.value })} /></SettingRow>
          <div className="quest-settings-split"><strong>Life sphere split</strong>
            {task.shares.map((share, index) => <div className="quest-settings-share" key={index}>
              <select aria-label={`Reward sphere ${index + 1}`} value={share.area} onChange={(event) => changeTask({ shares: task.shares.map((s, i) => i === index ? { ...s, area: event.target.value } : s) })}>
                <option value={UNASSIGNED}>Unassigned</option>{draft.areas.filter((item) => !item.archived || item.id === share.area).map((item) => <option key={item.id} value={item.id}>{item.name || 'New sphere'}{item.archived ? ' (archived)' : ''}</option>)}
              </select>
              <input aria-label={`Share ${index + 1} percent`} type="number" min="0" max="100" step=".01" value={share.percent} onChange={(event) => changeTask({ shares: task.shares.map((s, i) => i === index ? { ...s, percent: event.target.value } : s) })} /><span>%</span>
              {task.shares.length > 1 && <button type="button" className="quiet-button" aria-label={`Remove share ${index + 1}`} onClick={() => changeTask({ shares: task.shares.filter((_, i) => i !== index) })}>Remove</button>}
            </div>)}
            {nextShare && <button type="button" className="quiet-button" onClick={() => changeTask({ shares: [...task.shares, { area: nextShare, percent: '0' }] })}>Add share</button>}
          </div>
          <SettingRow title="Archive task category" description="Hide it in new task pickers. Existing tasks keep their rules."><input type="checkbox" className="preference-switch" checked={task.archived} onChange={(event) => changeTask({ archived: event.target.checked })} /></SettingRow>
        </>}
      </div>
    </section>
    <section className="preferences-section"><h3>New quest rewards</h3>
      <p className="preferences-description">Starting XP for each quest tier. You can adjust the reward when creating a quest.</p>
      <div className="preferences-card">{(['common', 'rare', 'epic', 'legendary'] as Tier[]).map((tier) => <SettingRow key={tier} title={tier[0]!.toUpperCase() + tier.slice(1)}>
        <input type="number" aria-label={`${tier} quest XP`} min="0" step="1" max="1000000000" value={draft.presets[tier]} onChange={(event) => onChange({ ...draft, presets: { ...draft.presets, [tier]: event.target.value } })} />
      </SettingRow>)}</div>
    </section>
  </>;
}
