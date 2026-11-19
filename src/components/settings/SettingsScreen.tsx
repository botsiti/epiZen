import { ErrorBoundary } from '../ErrorBoundary';
import { manifests, type PluginId } from '../../lib/pluginCatalog';
import { PluginSurface } from '../workspace/PluginDisplay';
import type { WallpaperLibrary } from './useWallpapers';
import { CalendarZonePicker } from '../calendar/CalendarZonePicker';
import { HomepagePreferences } from './HomepagePreferences';
import { LibraryPreferences } from './LibraryPreferences';
import { FileLocationPreferences } from './FileLocationPreferences';
import { SettingsToolbar } from './SettingsToolbar';
import { SECTIONS, type Section } from './settingsSections';
import { DailyTaskCategories } from './DailyTaskCategories';
import { QuestRuleFields } from './QuestRuleFields';
import { CategoryNameError, editQuestPreferences, saveQuestPreferences, type QuestPreferences } from '../../lib/questPreferences';
import type { QuestRulesDocument } from './useQuestRules';
import type { RewardSettings } from '../../lib/rewardRules';
import { AppearancePreferences } from './AppearancePreferences';
import type { Appearance } from '../../lib/appearance';
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { today } from '../../lib/dates';
import { DEFAULT_LIFETIME_YEARS, parseBirthDate, validLifetimeYears } from '../../lib/home';
import { DEFAULT_RECOGNITION, periodicNamingError, type Period, type PeriodicRecognition, type PeriodicSettings, type PeriodicFeatures } from '../../lib/periodic';
import type { VaultFile } from '../../lib/api';
import { PeriodicFolders, PeriodicRecognitionFields } from '../periodic/PeriodicPreferences';
import { type PodcastSettings } from '../../lib/podcasts';
import { ShortcutReference } from '../workspace/ShortcutReference';
import { DEFAULT_SOURCES, type LibrarySources } from '../../lib/librarySources';
import { DEFAULT_FILE_PREFERENCES, folderProblem, type FilePreferences } from '../../lib/filePreferences';
import { SettingRow } from './SettingRow';
import { DailyImport } from './DailyImport';
import { ALL_PLUGINS, DEFAULT_HOME_SECTIONS, checkInSettings, effectivePlugins, setPlugin, type PluginConfiguration, type PluginSettings, type HomeSections } from '../../lib/plugins';
import { PluginPreferences } from './PluginPreferences';
import { pluginDisplays, type PluginDisplays } from '../../lib/pluginDisplay';
import './settings.css';
import './questRules.css';

export interface SettingsDraft {
  calendarTimeZone?: string | null;
  rewards?: { revision: number; value: RewardSettings };
  pluginDisplay?: PluginDisplays;
  plugins?: PluginSettings;
  homeSections?: HomeSections;
  recognition?: PeriodicRecognition;
  periodic: PeriodicSettings;
  birthDate: string;
  lifetimeYears: number;
  podcasts: PodcastSettings;
  features: PeriodicFeatures;
  sources: LibrarySources;
  fileDefaults: FilePreferences;
}
interface Props {
  wallpaperLibrary?: WallpaperLibrary;
  calendarTimeZone?: string;
  rewardDocument?: QuestRulesDocument;
  rewardError?: string;
  retryRewards?: () => void;
  rewardDate?: string;
  observedTags?: string[];
  appearance?: Appearance; onSaveAppearance?: (value: Appearance) => Promise<void>; appearanceError?: string;
  habitSettings?: ReactNode;
  timerSettings?: () => ReactNode;
  menuBarNotice?: ReactNode;
  spikeSettings?: (onBack: () => void) => ReactNode;
  pluginDisplay?: PluginDisplays;
  initialSection?: Section;
  plugins?: PluginSettings;
  homeSections?: HomeSections;
  periodic: PeriodicSettings;
  birthDate: string;
  lifetimeYears?: number;
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

export function SettingsScreen({ menuBarNotice, habitSettings, timerSettings, wallpaperLibrary, calendarTimeZone, rewardDocument, rewardError, retryRewards, rewardDate, observedTags = [], appearance, onSaveAppearance, appearanceError, spikeSettings, periodic, birthDate, lifetimeYears = DEFAULT_LIFETIME_YEARS, podcasts, features, folders, recognition, plugins, pluginDisplay, initialSection, homeSections = DEFAULT_HOME_SECTIONS, sources = DEFAULT_SOURCES, fileDefaults = DEFAULT_FILE_PREFERENCES, files = [], texts = new Map(), onSave }: Props) {
  const id = useId();
  const heading = useRef<HTMLElement>(null);
  const [section, setSection] = useState<Section>(initialSection ?? (plugins ? 'plugins' : 'periodic'));
  const [seenSection, setSeenSection] = useState(initialSection);
  if (initialSection !== seenSection) { setSeenSection(initialSection); if (initialSection) setSection(initialSection); }
  const [pluginDraft, setPluginDraft] = useState<PluginConfiguration>(() => ({ enabled: plugins ?? ALL_PLUGINS, home: homeSections, checks: checkInSettings(features.checkIns), display: pluginDisplay ?? pluginDisplays() }));
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('day');
  const [query, setQuery] = useState('');
  // Keep unsubmitted connection fields in this Settings tab while browsing its sections.
  const [visitedSpike, setVisitedSpike] = useState(false);
  if (section === 'spike' && !visitedSpike) setVisitedSpike(true);
  const [draft, setDraft] = useState(periodic);
  const [recognitionDraft, setRecognitionDraft] = useState(recognition ?? DEFAULT_RECOGNITION);
  const [zoneDraft, setZoneDraft] = useState<string | null>();
  const [years, setYears] = useState(String(lifetimeYears));
  const [birth, setBirth] = useState(birthDate);
  const [featureDraft, setFeatureDraft] = useState(features);
  const [podcastDraft, setPodcastDraft] = useState(podcasts);
  const [sourceDraft, setSourceDraft] = useState(sources);
  const [appearanceDraft, setAppearanceDraft] = useState<Appearance>();
  const [fileDraft, setFileDraft] = useState(fileDefaults);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const initialRules = useMemo(() => rewardDocument && rewardDate ? editQuestPreferences(rewardDocument.value, rewardDocument.revision, rewardDate, observedTags) : undefined, [rewardDocument, rewardDate, observedTags]);
  const [rulesDraft, setRulesDraft] = useState<QuestPreferences>();
  const rules = rulesDraft ?? initialRules;
  const [dirty, setDirty] = useState(false);
  const changed = () => { setState({}); setDirty(true); };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const broken = periodicNamingError(draft);
    if (broken) { setSection('periodic'); setState({ error: broken }); return; }
    const born = parseBirthDate(birth);
    if (birth.trim() && (!born || born > today())) { setSection('home'); setState({ error: 'Enter a birth date in the past, such as 1990-04-21.' }); return; }
    if (!validLifetimeYears(Number(years))) { setSection('home'); setState({ error: 'Enter a positive whole number of years within the calendar range.' }); return; }
    const invalidFolder = folderProblem(fileDraft.noteFolder) ?? folderProblem(fileDraft.folderParent);
    if (invalidFolder) { setSection('files'); setState({ error: invalidFolder }); return; }
    let rewards: SettingsDraft['rewards'];
    if (rulesDraft) {
      try {
        if (rewardDate && rulesDraft.effectiveFrom < rewardDate) throw new Error(`The next available date for XP changes is ${rewardDate}. Save again to apply the rules from that day.`);
        rewards = { revision: rulesDraft.revision, value: saveQuestPreferences(rulesDraft, observedTags) };
      } catch (error) {
        if (rewardDate && rulesDraft.effectiveFrom < rewardDate) setRulesDraft({ ...rulesDraft, effectiveFrom: rewardDate });
        if (error instanceof CategoryNameError) { setSection('periodic'); setSelectedPeriod('day'); }
        else setSection('quests');
        setState({ error: error instanceof Error ? error.message : String(error) }); return;
      }
    }
    setSaving(true); setState({});
    try {
      const nextFeatures = plugins ? { ...featureDraft, habits: pluginDraft.enabled.habits, thoughtRecords: pluginDraft.enabled.cbt, checkIns: { ...pluginDraft.checks, enabled: pluginDraft.enabled.checkins } } : featureDraft;
      await onSave({ ...(zoneDraft !== undefined ? { calendarTimeZone: zoneDraft } : {}), ...(rewards ? { rewards } : {}), ...(plugins ? { plugins: pluginDraft.enabled, homeSections: pluginDraft.home, pluginDisplay: pluginDraft.display } : {}), ...(recognition ? { recognition: recognitionDraft } : {}), periodic: draft, birthDate: birth.trim(), lifetimeYears: Number(years), podcasts: podcastDraft, features: nextFeatures, sources: sourceDraft, fileDefaults: fileDraft });
      setRulesDraft(undefined); setZoneDraft(undefined); setDirty(false); setState({ saved: true });
    } catch (error) { setState({ error: String(error) }); }
    finally { setSaving(false); }
  };
  const active = SECTIONS.find((item) => item.id === section)!;
  useLayoutEffect(() => { heading.current?.closest('.main')?.scrollTo?.(0, 0); }, [section]);
  const navigate = (next: Section) => { setSection(next); setQuery(''); };
  const owner = Object.hasOwn(manifests, section) ? section as PluginId : undefined;
  const running = effectivePlugins(pluginDraft.enabled);
  const liveSettings = section === 'habits' || section === 'timer';
  const ownForm = liveSettings || section === 'hotkeys' || section === 'spike' || section === 'appearance' && !!appearance && !!onSaveAppearance;
  const period = section === 'periodic' ? selectedPeriod : undefined;
  const changeRules = (next: QuestPreferences) => { setRulesDraft(next); changed(); };
  const manageCategories = () => { navigate('periodic'); setSelectedPeriod('day'); };
  const rulesStatus = rewardError
    ? <p role="alert">{rewardError} <button type="button" className="quiet-button" onClick={retryRewards}>Retry settings</button></p>
    : <p role="status">Loading categories and rewards…</p>;
  const setReading = (next: PeriodicRecognition) => { setRecognitionDraft(next); changed(); };
  return <section className="preferences" data-testid="settings" data-section={section}>
    <SettingsToolbar section={section} query={query} onQuery={setQuery} onNavigate={navigate}
      action={(!ownForm || dirty) && <button type={ownForm ? 'button' : 'submit'} form={ownForm ? undefined : id}
        className="preferences-commit" data-dirty={dirty} disabled={saving} data-testid="settings-save"
        onClick={ownForm ? () => void save() : undefined}>{section === 'appearance' || section === 'spike' ? 'Save workspace changes' : 'Save changes'}</button>}
      status={saving ? 'Saving…' : state.saved ? 'Saved' : dirty ? 'Unsaved changes' : ''} error={state.error} />
    <div className="preferences-main">
      <header className="preferences-heading" ref={heading}>
        <div className="preferences-heading-copy"><h2>{active.title}</h2></div>
        {section === 'plugins' && <div className="preferences-plugin-count"><strong>{Object.values(pluginDraft.enabled).filter(Boolean).length}</strong>
          <span>of {Object.keys(pluginDraft.enabled).length} enabled</span></div>}
        {owner && plugins && <label className="preferences-plugin-toggle">
          <span>{!pluginDraft.enabled[owner] ? 'Disabled' : running[owner] ? 'Enabled' : 'Paused'}</span>
          <input type="checkbox" role="switch" className="preference-switch" aria-label={`Enable ${active.title}`} disabled={saving}
            checked={pluginDraft.enabled[owner]} onChange={(event) => { setPluginDraft({ ...pluginDraft, enabled: setPlugin(pluginDraft.enabled, owner, event.target.checked) }); changed(); }} />
        </label>}
      </header>
      {visitedSpike && <div hidden={section !== 'spike'}><ErrorBoundary label="Spike settings">{spikeSettings?.(() => { setVisitedSpike(false); navigate('plugins'); }) ?? <p>Open a vault to configure Spike.</p>}</ErrorBoundary></div>}
      <ErrorBoundary key={section} label={active.title + ' settings'}>
      {liveSettings ? <PluginSurface id={section}>{running[section] && (!plugins || effectivePlugins(plugins)[section])
        ? section === 'habits' ? habitSettings : timerSettings?.()
        : <p className="preferences-footnote">Enable {active.title} and save changes to use these controls.</p>}</PluginSurface>
        : section === 'appearance' && appearance && onSaveAppearance ? <AppearancePreferences library={wallpaperLibrary} value={appearanceDraft ?? appearance} onChange={setAppearanceDraft} onSave={async (next) => { await onSaveAppearance(next); setAppearanceDraft(undefined); }} nativeError={appearanceError} /> : section === 'spike' ? null : section === 'hotkeys' ? <ShortcutReference /> : <form id={id} className="preferences-form" onSubmit={(event) => void save(event)}>
        <fieldset className="preferences-fields" disabled={saving}>
          {section === 'plugins' && menuBarNotice}
          {section === 'plugins' && <PluginPreferences value={pluginDraft} onChange={(next) => { setPluginDraft(next); changed(); }} onSetup={navigate}
            calendarZoneControl={<CalendarZonePicker value={zoneDraft === undefined ? calendarTimeZone : zoneDraft ?? undefined} instant={today().getTime()}
              onSave={(zone) => { setZoneDraft(zone ?? null); changed(); return Promise.resolve(); }} />} />}
          {period && <>
            <div className="preferences-periods" role="group" aria-label="Periodic note type">
              {(['day', 'week', 'month'] as const).map((value) => <button type="button" key={value} aria-pressed={period === value} data-testid={`settings-period-${value}`} onClick={() => setSelectedPeriod(value)}>{value === 'day' ? 'Daily' : value === 'week' ? 'Weekly' : 'Monthly'}</button>)}
            </div>
            {period === 'day' && (rules ? <DailyTaskCategories draft={rules} onChange={changeRules} /> : rewardDate && rulesStatus)}
            <PeriodicFolders value={draft} periods={[period]} folders={folders} onChange={(next) => { setDraft(next); changed(); }} />
            {period === 'day' && recognition && <DailyImport folders={folders} files={files} texts={texts} periodic={draft} value={recognitionDraft} onChange={setReading} />}
            {recognition && <details className="preferences-disclosure"><summary><span><strong>Review existing notes</strong><small>Resolve duplicate dates or link a note with an unusual name.</small></span></summary><div className="preferences-disclosure-body"><PeriodicRecognitionFields periodFilter={period} periodic={draft} value={recognitionDraft} files={files} texts={texts} onChange={setReading} key={period} /></div></details>}
            {period === 'day' && !plugins && <section className="preferences-section" data-testid="settings-features"><h3>On your daily dashboard</h3><div className="preferences-card">{([
              ['habits', 'Habits', 'Your daily routine, with progress across weeks and months.'],
              ['thoughtRecords', 'Thought records', 'A quiet space to work through a thought.'],
            ] as const).map(([key, label, description]) => <SettingRow key={key} title={label} description={description}><input className="preference-switch" type="checkbox" aria-label={label} data-testid={`settings-feature-${key}`} checked={featureDraft[key]} onChange={(event) => { setFeatureDraft({ ...featureDraft, [key]: event.target.checked }); changed(); }} /></SettingRow>)}</div></section>}
          </>}
          {section === 'home' && <HomepagePreferences birth={birth} years={years} sections={plugins && pluginDraft.home}
            onBirth={(next) => { setBirth(next); changed(); }} onYears={(next) => { setYears(next); changed(); }}
            onSections={(home) => { setPluginDraft({ ...pluginDraft, home }); changed(); }} />}
          {section === 'quests' && (rules ? <QuestRuleFields draft={rules} onManageCategories={manageCategories} onChange={changeRules} /> : rulesStatus)}
          {section === 'library' && <LibraryPreferences sources={sourceDraft} podcasts={podcastDraft}
            onSources={(next) => { setSourceDraft(next); changed(); }} onPodcasts={(next) => { setPodcastDraft(next); changed(); }} />}
          {section === 'files' && <FileLocationPreferences value={fileDraft} folders={folders} onChange={(next) => { setFileDraft(next); changed(); }} />}
        </fieldset>
      </form>}
      </ErrorBoundary>
    </div>
  </section>;
}
