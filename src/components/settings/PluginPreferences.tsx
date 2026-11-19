import { useState, type ReactNode } from 'react';
import { CHECK_INS, HOME_SECTIONS, PLUGINS, effectivePlugins, setPlugin, type CheckInSettings, type HomeSections, type PluginConfiguration, type PluginId, type PluginSettings } from '../../lib/plugins';
import { PreferenceIcon } from './icons';
import './plugins.css';
import type { PluginDisplays } from '../../lib/pluginDisplay';
import { manifests, pluginDependencies, type PluginSetupPage } from '../../lib/pluginCatalog';

interface Props { calendarZoneControl?: ReactNode; value: PluginConfiguration; onChange: (next: PluginConfiguration) => void; onSetup?: (section: PluginSetupPage) => void }
export function PluginPreferences({ calendarZoneControl, value: configuration, onChange: update, onSetup }: Props) {
  const { enabled: value, checks, home, display } = configuration;
  const onChange = (enabled: PluginSettings) => update({ ...configuration, enabled });
  const onChecks = (checks: CheckInSettings) => update({ ...configuration, checks });
  const onHome = (home: HomeSections) => update({ ...configuration, home });
  const onDisplay = (display: PluginDisplays) => update({ ...configuration, display });
  const [expanded, setExpanded] = useState<PluginId>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Enabled' | 'Disabled'>('All');
  const active = effectivePlugins(value);
  const shown = PLUGINS.filter((item) => (filter === 'All' || value[item.id] === (filter === 'Enabled')) &&
    `${item.name} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groupList = (group: string) => {
      const items = shown.filter((item) => item.group === group);
      return items.length > 0 && <section className="plugin-group" key={group}><h3>{group}</h3><div className="plugin-list">{items.map((plugin) => <div className="plugin-item" key={plugin.id} data-plugin={plugin.id}>
        <div className="plugin-row">
          <button type="button" className="plugin-open" aria-expanded={expanded === plugin.id} aria-label={`Configure ${plugin.name}`} onClick={() => setExpanded(expanded === plugin.id ? undefined : plugin.id)}>
            <span className="plugin-icon" data-enabled={active[plugin.id]}><PreferenceIcon name={plugin.id} /></span>
            <span className="plugin-copy"><strong>{plugin.name}</strong><span>{plugin.description}</span>{value[plugin.id] && !active[plugin.id] && <small>Paused · enable {pluginDependencies[plugin.id].filter((id) => !active[id]).map((id) => manifests[id].name).join(', ')} to use this plugin.</small>}</span>
            <PreferenceIcon name="configure" />
          </button>
          <input className="preference-switch" type="checkbox" role="switch" aria-label={`Enable ${plugin.name}`} checked={value[plugin.id]} onChange={(event) => onChange(setPlugin(value, plugin.id, event.target.checked))} />
        </div>
        {expanded === plugin.id && plugin.id !== 'spike' && <div className="plugin-options plugin-display-options" aria-label={`${plugin.name} display settings`}>
          <label>Layout<select aria-label={`${plugin.name} layout`} value={display[plugin.id].density} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], density: event.target.value as 'comfortable' | 'compact' } })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          {plugin.views && <label>{plugin.viewLabel}<select aria-label={`${plugin.name} default view`} value={display[plugin.id].defaultView} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], defaultView: event.target.value } })}>{plugin.views.map((view) => <option key={view}>{view}</option>)}</select></label>}
          {plugin.id === 'calendar' && calendarZoneControl && <div className="plugin-zone-setting"><span>Calendar time zone</span>{calendarZoneControl}</div>}
          <div className="plugin-checks">{plugin.sections?.map(({ key, label }) => <label key={key}><input type="checkbox" checked={display[plugin.id].sections[key]} onChange={(event) => onDisplay({ ...display, [plugin.id]: { ...display[plugin.id], sections: { ...display[plugin.id].sections, [key]: event.target.checked } } })} />{label}</label>)}</div>
          {plugin.setup && onSetup && <button type="button" className="quiet-button" onClick={() => onSetup(plugin.setup!.page)}>{plugin.setup.label}</button>}

        </div>}
        {expanded === 'spike' && plugin.id === 'spike' && <div className="plugin-options"><p>Set up your connection, desktop companion and voice.</p><button type="button" className="quiet-button" onClick={() => onSetup?.(manifests.spike.setup!.page)}>{manifests.spike.setup!.label}</button><p className="preferences-footnote">⌘8 opens and closes the Spike sidebar. Disabling the plugin keeps your conversations and preferences.</p></div>}
        {expanded === plugin.id && plugin.id === 'checkins' && <div className="plugin-options"><p>Show these fields on your daily note. Past entries remain in statistics.</p><div className="plugin-checks">{CHECK_INS.map(({ key, label }) => <label key={key}><input type="checkbox" aria-label={label} checked={checks.metrics.includes(key)} onChange={(event) => onChecks({ ...checks, metrics: event.target.checked ? [...checks.metrics, key] : checks.metrics.filter((item) => item !== key) })} />{label}<small>{key === 'sleep' ? 'Hours & minutes' : 'Daily rating'}</small></label>)}</div></div>}
        {expanded === plugin.id && plugin.id === 'home' && <div className="plugin-options"><p>Homepage sections</p><div className="plugin-checks">{HOME_SECTIONS.map(({ key, label }) => <label key={key}><input type="checkbox" checked={home[key]} onChange={(event) => onHome({ ...home, [key]: event.target.checked })} />{label}</label>)}</div><p className="preferences-footnote">Library, Quests and daily sections appear when their corresponding plugins are enabled.</p></div>}
      </div>)}</div></section>;
  };
  return <div className="plugin-preferences" data-testid="plugin-settings">
    <div className="plugin-controls">
      <div className="preferences-periods" role="group" aria-label="Filter plugins">{(['All', 'Enabled', 'Disabled'] as const).map((item) =>
        <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
      <label className="settings-finder"><PreferenceIcon name="search" /><input type="search" aria-label="Find a plugin" placeholder="Find a plugin…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <div className="plugin-columns">{[['Workspace', 'Planning'], ['Daily life']].map((groups) =>
      groups.some((group) => shown.some((item) => item.group === group)) && <div className="plugin-column" key={groups[0]}>{groups.map(groupList)}</div>)}</div>
    {!shown.length && <p className="muted" role="status">No matching plugins.</p>}
  </div>;
}
