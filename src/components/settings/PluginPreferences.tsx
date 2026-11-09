import { useState } from 'react';
import { CHECK_INS, HOME_SECTIONS, PLUGINS, effectivePlugins, setPlugin, type CheckInSettings, type HomeSections, type PluginConfiguration, type PluginId, type PluginSettings } from '../../lib/plugins';
import { PreferenceIcon } from './icons';
import './plugins.css';
import { DISPLAY_OPTIONS, type PluginDisplays } from '../../lib/pluginDisplay';

interface Props { value: PluginConfiguration; onChange: (next: PluginConfiguration) => void; onSetup?: (section: 'periodic' | 'home' | 'spike') => void }
export function PluginPreferences({ value: configuration, onChange: update, onSetup }: Props) {
  const { enabled: value, checks, home, display } = configuration;
  const onChange = (enabled: PluginSettings) => update({ ...configuration, enabled });
  const onChecks = (checks: CheckInSettings) => update({ ...configuration, checks });
  const onHome = (home: HomeSections) => update({ ...configuration, home });
  const onDisplay = (display: PluginDisplays) => update({ ...configuration, display });
  const [expanded, setExpanded] = useState<PluginId>();
  const [search, setSearch] = useState('');
  const active = effectivePlugins(value);
  const shown = PLUGINS.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="plugin-preferences" data-testid="plugin-settings">
    <div className="plugin-intro"><span className="plugin-core-mark"><PreferenceIcon name="note" /></span><div><strong>Markdown at the core</strong><p>Your files, links and editor are always available. Add the workflows you want.</p></div><span className="plugin-core-badge">Always on</span></div>
    <div className="plugin-search"><input type="search" aria-label="Find a plugin" placeholder="Find a plugin…" value={search} onChange={(event) => setSearch(event.target.value)} /><span>{Object.values(active).filter(Boolean).length} enabled</span></div>
    {['Workspace', 'Daily life', 'Planning'].map((group) => {
      const items = shown.filter((item) => item.group === group);
      return items.length > 0 && <section className="plugin-group" key={group}><h3>{group}</h3><div className="plugin-list">{items.map((plugin) => <div className="plugin-item" key={plugin.id} data-plugin={plugin.id}>
        <div className="plugin-row"><span className="plugin-icon"><PreferenceIcon name={plugin.id} /></span><div className="plugin-copy"><strong>{plugin.name}</strong><p>{plugin.description}</p>{value[plugin.id] && !active[plugin.id] && <small>Paused · enable Periodic notes to use this plugin.</small>}</div>
          <button type="button" className="quiet-button" aria-expanded={expanded === plugin.id} aria-label={`Configure ${plugin.name}`} onClick={() => setExpanded(expanded === plugin.id ? undefined : plugin.id)}>Configure</button>
          <input className="preference-switch" type="checkbox" role="switch" aria-label={`Enable ${plugin.name}`} checked={value[plugin.id]} onChange={(event) => onChange(setPlugin(value, plugin.id, event.target.checked))} />
        </div>
        {expanded === plugin.id && plugin.id !== 'spike' && <div className="plugin-options plugin-display-options" aria-label={`${plugin.name} display settings`}>
          <label>Layout<select aria-label={`${plugin.name} layout`} value={display[plugin.id].density} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], density: event.target.value as 'comfortable' | 'compact' } })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          {DISPLAY_OPTIONS[plugin.id].views && <label>{DISPLAY_OPTIONS[plugin.id].viewLabel}<select aria-label={`${plugin.name} default view`} value={display[plugin.id].defaultView} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], defaultView: event.target.value } })}>{DISPLAY_OPTIONS[plugin.id].views!.map((view) => <option key={view}>{view}</option>)}</select></label>}
          <div className="plugin-checks">{DISPLAY_OPTIONS[plugin.id].sections?.map(({ key, label }) => <label key={key}><input type="checkbox" checked={display[plugin.id].sections[key]} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], sections: { ...display[plugin.id].sections, [key]: event.target.checked } } })} />{label}</label>)}</div>
          {DISPLAY_OPTIONS[plugin.id].setup && onSetup && <button type="button" className="quiet-button" onClick={() => onSetup(DISPLAY_OPTIONS[plugin.id].setup!)}>{DISPLAY_OPTIONS[plugin.id].setup === 'periodic' ? 'Folders, dates & templates' : plugin.id === 'library' ? 'Sources & artwork' : 'Homepage details'}</button>}
          <p className="preferences-footnote">Display choices are saved for this vault. Your notes stay unchanged.</p>
        </div>}
        {expanded === 'spike' && plugin.id === 'spike' && <div className="plugin-options"><p>Set up your connection, desktop companion and voice.</p><button type="button" className="quiet-button" onClick={() => onSetup?.('spike')}>Set up Spike</button><p className="preferences-footnote">⌘8 opens and closes the Spike sidebar. Disabling the plugin keeps your conversations and preferences.</p></div>}
        {expanded === plugin.id && plugin.id === 'checkins' && <div className="plugin-options"><p>Show these fields on your daily note. Past entries remain in statistics.</p><div className="plugin-checks">{CHECK_INS.map(({ key, label }) => <label key={key}><input type="checkbox" aria-label={label} checked={checks.metrics.includes(key)} onChange={(event) => onChecks({ ...checks, metrics: event.target.checked ? [...checks.metrics, key] : checks.metrics.filter((item) => item !== key) })} />{label}<small>{key === 'sleep' ? 'Hours & minutes' : 'Daily rating'}</small></label>)}</div></div>}
        {expanded === plugin.id && plugin.id === 'home' && <div className="plugin-options"><p>Make room for what matters on your homepage.</p><div className="plugin-checks">{HOME_SECTIONS.map(({ key, label }) => <label key={key}><input type="checkbox" checked={home[key]} onChange={(event) => onHome({ ...home, [key]: event.target.checked })} />{label}</label>)}</div><p className="preferences-footnote">Library, Quests and daily sections appear when their corresponding plugins are enabled.</p></div>}
      </div>)}</div></section>;
    })}
    {!shown.length && <p className="muted" role="status">No plugins match this search.</p>}
  </div>;
}
