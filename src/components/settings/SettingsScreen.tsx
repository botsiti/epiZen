import { useId, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { today } from '../../lib/dates';
import { parseBirthDate } from '../../lib/home';
import { DEFAULT_RECOGNITION, periodicNamingError, type Period, type PeriodicRecognition, type PeriodicSettings, type PeriodicFeatures } from '../../lib/periodic';
import type { VaultFile } from '../../lib/api';
import { PeriodicFolders, PeriodicRecognitionFields } from '../periodic/PeriodicPreferences';
import { type PodcastSettings } from '../../lib/podcasts';
import { ShortcutReference } from '../workspace/ShortcutReference';
import { DEFAULT_SOURCES, SOURCE_OPTIONS, type LibrarySources, type Source } from '../../lib/librarySources';
import { SOURCE_NAMES } from '../../lib/lookup';
import { DEFAULT_FILE_PREFERENCES, folderProblem, type FilePreferences } from '../../lib/filePreferences';
import { SettingRow } from './SettingRow';
import { DailyImport } from './DailyImport';
import { PreferenceIcon } from './icons';
import { ALL_PLUGINS, DEFAULT_HOME_SECTIONS, checkInSettings, type PluginConfiguration, type PluginSettings, type HomeSections } from '../../lib/plugins';
import { PluginPreferences } from './PluginPreferences';
import { pluginDisplays, type PluginDisplays } from '../../lib/pluginDisplay';
import './settings.css';

export interface SettingsDraft {
  pluginDisplay?: PluginDisplays;
  plugins?: PluginSettings;
  homeSections?: HomeSections;
  recognition?: PeriodicRecognition;
  periodic: PeriodicSettings;
  birthDate: string;
  podcasts: PodcastSettings;
  features: PeriodicFeatures;
  sources: LibrarySources;
  fileDefaults: FilePreferences;
}
interface Props {
  appearance?: 'solid' | 'glass'; ambientMotion?: boolean;
  spikeSettings?: (onBack: () => void) => ReactNode;
  pluginDisplay?: PluginDisplays;
  initialSection?: Section;
  plugins?: PluginSettings;
  homeSections?: HomeSections;
  periodic: PeriodicSettings;
  birthDate: string;
  podcasts: PodcastSettings;
  folders: string[];
  features: PeriodicFeatures;
  sources?: LibrarySources;
  fileDefaults?: FilePreferences;
  recognition?: PeriodicRecognition;
  files?: VaultFile[];
  texts?: ReadonlyMap<string, string>;
  onSave: (settings: SettingsDraft) => Promise<void>;
}
const SECTIONS = [
  { id: 'plugins', title: 'Plugins', group: 'Your vault', hint: 'Start with Markdown. Add only what you use.', words: 'enable disable epiBase bases home library habits cbt check-ins mood energy focus social sleep calendar graph timer spike assistant companion' },
  { id: 'periodic', title: 'Periodic notes', group: 'Your vault', hint: 'A place for your days, weeks and months.', words: 'daily weekly monthly import dates calendar habits thought records format folder' },
  { id: 'files', title: 'Files & folders', group: 'Your vault', hint: 'Choose where new ideas begin.', words: 'new note create folder location' },
  { id: 'home', title: 'Homepage', group: 'Personal', hint: 'A home for your days and the things you love.', words: 'birth birthday memento books podcasts movies films music albums library sources artwork' },
  { id: 'spike', title: 'Spike', group: 'Personal', hint: 'Your companion, on your terms.', words: 'assistant voice connection api companion desktop microphone' },
  { id: 'hotkeys', title: 'Hotkeys', group: 'Personal', hint: 'Move through Epizen without leaving the keyboard.', words: 'keyboard shortcuts commands' },
] as const;
type Section = typeof SECTIONS[number]['id'];

export function SettingsScreen({ appearance = 'solid', ambientMotion = false, spikeSettings, periodic, birthDate, podcasts, features, folders, recognition, plugins, pluginDisplay, initialSection, homeSections = DEFAULT_HOME_SECTIONS, sources = DEFAULT_SOURCES, fileDefaults = DEFAULT_FILE_PREFERENCES, files = [], texts = new Map(), onSave }: Props) {
  const id = useId();
  const heading = useRef<HTMLElement>(null);
  const [section, setSection] = useState<Section>(initialSection ?? (plugins ? 'plugins' : 'periodic'));
  const [seenSection, setSeenSection] = useState(initialSection);
  if (initialSection !== seenSection) { setSeenSection(initialSection); if (initialSection) setSection(initialSection); }
  const [pluginDraft, setPluginDraft] = useState<PluginConfiguration>(() => ({ enabled: plugins ?? ALL_PLUGINS, home: homeSections, checks: checkInSettings(features.checkIns), display: pluginDisplay ?? pluginDisplays() }));
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('day');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(periodic);
  const [recognitionDraft, setRecognitionDraft] = useState(recognition ?? DEFAULT_RECOGNITION);
  const [birth, setBirth] = useState(birthDate);
  const [featureDraft, setFeatureDraft] = useState(features);
  const [podcastDraft, setPodcastDraft] = useState(podcasts);
  const [sourceDraft, setSourceDraft] = useState(sources);
  const [fileDraft, setFileDraft] = useState(fileDefaults);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const [dirty, setDirty] = useState(false);
  const changed = () => { setState({}); setDirty(true); };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const broken = periodicNamingError(draft);
    if (broken) { setSection('periodic'); setState({ error: broken }); return; }
    const born = parseBirthDate(birth);
    if (birth.trim() && (!born || born > today())) { setSection('home'); setState({ error: 'Enter a birth date in the past, such as 1990-04-21.' }); return; }
    const invalidFolder = folderProblem(fileDraft.noteFolder) ?? folderProblem(fileDraft.folderParent);
    if (invalidFolder) { setSection('files'); setState({ error: invalidFolder }); return; }
    setSaving(true); setState({});
    try {
      const nextFeatures = plugins ? { ...featureDraft, habits: pluginDraft.enabled.habits, thoughtRecords: pluginDraft.enabled.cbt, checkIns: { ...pluginDraft.checks, enabled: pluginDraft.enabled.checkins } } : featureDraft;
      await onSave({ ...(plugins ? { plugins: pluginDraft.enabled, homeSections: pluginDraft.home, pluginDisplay: pluginDraft.display } : {}), ...(recognition ? { recognition: recognitionDraft } : {}), periodic: draft, birthDate: birth.trim(), podcasts: podcastDraft, features: nextFeatures, sources: sourceDraft, fileDefaults: fileDraft });
      setDirty(false); setState({ saved: true });
    } catch (error) { setState({ error: String(error) }); }
    finally { setSaving(false); }
  };
  const active = SECTIONS.find((item) => item.id === section)!;
  const shown = SECTIONS.filter((item) => `${item.title} ${item.words}`.toLowerCase().includes(query.trim().toLowerCase()));
  const period = section === 'periodic' ? selectedPeriod : undefined;
  const setReading = (next: PeriodicRecognition) => { setRecognitionDraft(next); changed(); };
  return <section className={`preferences${appearance === 'glass' ? ' has-glass' : ''}${ambientMotion ? ' has-ambient-motion' : ''}`} data-testid="settings">
    <aside className="preferences-nav">
      <h1>Settings</h1>
      <input type="search" aria-label="Search settings" placeholder="Search settings…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <nav aria-label="Settings sections">{['Your vault', 'Personal'].map((group) => <div key={group}><p className="preferences-nav-group">{group}</p>{shown.filter((item) => item.group === group).map((item) => <button type="button" key={item.id} aria-current={section === item.id ? 'page' : undefined} data-testid={`settings-nav-${item.id}`} onClick={() => { setSection(item.id); heading.current?.closest('.main')?.scrollTo?.(0, 0); }}><PreferenceIcon name={item.id} /><span>{item.title}</span></button>)}</div>)}</nav>
      {!shown.length && <p className="muted" role="status">No matching settings.</p>}
      <p className="preferences-nav-foot">A little more your own.</p>
    </aside>
    <div className="preferences-main">
      <header className="preferences-heading" ref={heading}><PreferenceIcon name={section} /><div><h2>{active.title}</h2><p>{active.hint}</p></div></header>
      {section === 'spike' ? <>{spikeSettings?.(() => setSection('plugins')) ?? <p>Open a vault to configure Spike.</p>}{dirty && <footer className="preferences-save"><span>Unsaved plugin preferences</span><button type="button" className="quiet-button" disabled={saving} onClick={() => void save()}>Save changes</button>{state.error && <p role="alert">{state.error}</p>}</footer>}</> : section === 'hotkeys' ? <><ShortcutReference />{dirty && <footer className="preferences-save"><span>Unsaved preferences</span><button type="button" className="quiet-button" disabled={saving} onClick={() => void save()}>Save changes</button>{state.error && <p role="alert">{state.error}</p>}</footer>}</> : <form className="preferences-form" onSubmit={(event) => void save(event)}>
        <fieldset className="preferences-fields" disabled={saving}>
          {section === 'plugins' && <PluginPreferences value={pluginDraft} onChange={(next) => { setPluginDraft(next); changed(); }} onSetup={setSection} />}
          {period && <>
            <div className="preferences-periods" role="group" aria-label="Periodic note type">
              {(['day', 'week', 'month'] as const).map((value) => <button type="button" key={value} aria-pressed={period === value} data-testid={`settings-period-${value}`} onClick={() => setSelectedPeriod(value)}>{value === 'day' ? 'Daily' : value === 'week' ? 'Weekly' : 'Monthly'}</button>)}
            </div>
            <PeriodicFolders value={draft} periods={[period]} folders={folders} onChange={(next) => { setDraft(next); changed(); }} />
            {period === 'day' && recognition && <DailyImport folders={folders} files={files} texts={texts} periodic={draft} value={recognitionDraft} onChange={setReading} />}
            {recognition && <details className="preferences-disclosure"><summary><span><strong>Review existing notes</strong><small>Resolve duplicate dates or link a note with an unusual name.</small></span></summary><div className="preferences-disclosure-body"><PeriodicRecognitionFields periodFilter={period} periodic={draft} value={recognitionDraft} files={files} texts={texts} onChange={setReading} key={period} /></div></details>}
            {period === 'day' && !plugins && <section className="preferences-section" data-testid="settings-features"><h3>On your daily dashboard</h3><div className="preferences-card">{([
              ['habits', 'Habits', 'Your daily routine, with progress across weeks and months.'],
              ['thoughtRecords', 'Thought records', 'A quiet space to work through a thought.'],
            ] as const).map(([key, label, description]) => <SettingRow key={key} title={label} description={description}><input className="preference-switch" type="checkbox" aria-label={label} data-testid={`settings-feature-${key}`} checked={featureDraft[key]} onChange={(event) => { setFeatureDraft({ ...featureDraft, [key]: event.target.checked }); changed(); }} /></SettingRow>)}</div></section>}
          </>}
          {section === 'home' && <>
            <section className="preferences-section" data-testid="settings-home"><h3>Time in perspective</h3><div className="preferences-card"><SettingRow title="Birth date" description="Personalize the life and weeks view on your homepage."><input aria-label="Birth date" value={birth} onChange={(event) => { setBirth(event.target.value); changed(); }} placeholder="YYYY-MM-DD" inputMode="numeric" data-testid="settings-birth-date" /></SettingRow></div></section>
            <section className="preferences-section"><h3>Library sources</h3><p className="preferences-description">Choose where to find titles, details and cover artwork when adding to your library.</p><div className="preferences-card">{([['album', 'Music albums', 'Album and artist information.'], ['film', 'Movies & series', 'Film, director and release information.'], ['book', 'Books', 'Titles, authors and cover artwork.'], ['podcast', 'Podcasts', 'Find a show, then keep your favorite episodes.']] as const).map(([kind, label, description]) => <SettingRow key={kind} title={label} description={description}><select aria-label={`${label} source`} data-testid={`settings-source-${kind}`} value={sourceDraft[kind]} onChange={(event) => { setSourceDraft({ ...sourceDraft, [kind]: event.target.value as Source }); changed(); }}>{SOURCE_OPTIONS[kind].map((source) => <option key={source} value={source}>{SOURCE_NAMES[source]}</option>)}</select></SettingRow>)}</div><p className="preferences-footnote">Search starts when you type in Add. Wikipedia provides podcast show details; enter the episode title yourself. iTunes also lists episodes.</p></section>
            <section className="preferences-section" data-testid="settings-podcasts"><h3>Podcast artwork</h3><div className="preferences-card"><SettingRow title="Artwork for new episodes" description="If your choice is unavailable, use the other artwork."><select aria-label="Artwork for new episodes" data-testid="settings-podcast-artwork" value={podcastDraft.artwork} onChange={(event) => { setPodcastDraft({ artwork: event.target.value === 'episode' ? 'episode' : 'show' }); changed(); }}><option value="show">Show thumbnail</option><option value="episode">Episode artwork</option></select></SettingRow></div></section>
          </>}
          {section === 'files' && <section className="preferences-section"><h3>New items</h3><div className="preferences-card">{(['note', 'folder'] as const).map((kind) => {
            const mode = kind === 'note' ? 'notes' : 'folders', path = kind === 'note' ? 'noteFolder' : 'folderParent';
            return <div key={kind}><SettingRow title={kind === 'note' ? 'New notes' : 'New folders'} description={kind === 'note' ? 'Default location when you create a note.' : 'Default parent when you create a folder.'}><select aria-label={`Location for new ${mode}`} value={fileDraft[mode]} onChange={(event) => { setFileDraft({ ...fileDraft, [mode]: event.target.value }); changed(); }}><option value="current">Same folder as current note</option><option value="root">Top of the vault</option><option value="folder">A specific folder</option></select></SettingRow>{fileDraft[mode] === 'folder' && <SettingRow title={kind === 'note' ? 'Notes folder' : 'Parent folder'} description="A path relative to this vault."><input aria-label={kind === 'note' ? 'Notes folder' : 'Parent folder'} value={fileDraft[path]} list={`${id}-folders`} placeholder="Top of the vault" onChange={(event) => { setFileDraft({ ...fileDraft, [path]: event.target.value }); changed(); }} /></SettingRow>}</div>;
          })}</div><datalist id={`${id}-folders`}>{folders.map((path) => <option key={path}>{path}</option>)}</datalist><p className="preferences-footnote">You can choose a different location each time. With no note open, “Same folder” uses the top of the vault. Daily, weekly and monthly notes use their own locations.</p></section>}
        </fieldset>
        <footer className="preferences-save">{state.error && <p className="form-error" role="alert">{state.error}</p>}<span className={state.saved ? 'save-state' : undefined} role="status">{saving ? 'Saving…' : state.saved ? 'Saved' : dirty ? 'Unsaved changes' : 'Preferences are saved in Epizen.'}</span><button type="submit" className="quiet-button" disabled={saving} data-testid="settings-save">Save changes</button></footer>
      </form>}
    </div>
  </section>;
}
