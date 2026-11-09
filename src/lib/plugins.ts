import type { Settings } from './api';
import type { PluginDisplays } from './pluginDisplay';

export const PLUGINS = [
  { id: 'home', name: 'Homepage', description: 'A personal dashboard for your days, progress and collections.', group: 'Workspace' },
  { id: 'bases', name: 'epiBase', description: 'Render Obsidian Bases as tables, cards and lists from your vault properties.', group: 'Workspace' },
  { id: 'library', name: 'Library', description: 'Collect books, music, films, podcasts and videos.', group: 'Workspace' },
  { id: 'graph', name: 'Graph', description: 'Explore connections between your notes.', group: 'Workspace' },
  { id: 'spike', name: 'Spike', description: 'A personal assistant and desktop companion, with text and voice.', group: 'Workspace' },
  { id: 'periodic', name: 'Periodic notes', description: 'Daily, weekly and monthly notes, with calendar navigation.', group: 'Daily life' },
  { id: 'checkins', name: 'Check-ins', description: 'Choose the daily numbers you want to record.', group: 'Daily life', requires: 'periodic' },
  { id: 'habits', name: 'Habits', description: 'Keep a routine and see its history over time.', group: 'Daily life', requires: 'periodic' },
  { id: 'cbt', name: 'CBT', description: 'Thought records and a space to reflect on your thinking.', group: 'Daily life', requires: 'periodic' },
  { id: 'quests', name: 'Quests', description: 'Turn goals into weekly and monthly adventures.', group: 'Daily life', requires: 'periodic' },
  { id: 'statistics', name: 'Statistics', description: 'Review recorded time, habits and check-ins.', group: 'Daily life', requires: 'periodic' },
  { id: 'calendar', name: 'Calendar', description: 'Plan time alongside your local Apple calendars.', group: 'Planning', requires: 'periodic' },
  { id: 'timer', name: 'Focus timer', description: 'Time your work and save completed sessions to daily notes.', group: 'Planning', requires: 'periodic' },
] as const;
export type PluginId = typeof PLUGINS[number]['id'];
export type PluginSettings = Record<PluginId, boolean>;
export interface PluginConfiguration { enabled: PluginSettings; home: HomeSections; checks: CheckInSettings; display: PluginDisplays }
export const NO_PLUGINS = Object.fromEntries(PLUGINS.map(({ id }) => [id, false])) as PluginSettings;
export const ALL_PLUGINS = Object.fromEntries(PLUGINS.map(({ id }) => [id, true])) as PluginSettings;
export const CHECK_INS = [{ key: 'mood', label: 'Mood' }, { key: 'energy', label: 'Energy' }, { key: 'focus', label: 'Focus' }, { key: 'soc', label: 'Social' }, { key: 'sleep', label: 'Sleep' }] as const;
export type CheckInKey = typeof CHECK_INS[number]['key'];
export interface CheckInSettings { enabled: boolean; metrics: CheckInKey[] }
export const DEFAULT_CHECK_INS: CheckInSettings = { enabled: true, metrics: CHECK_INS.map(({ key }) => key) };
export const HOME_SECTIONS = [{ key: 'profile', label: 'Progress & XP' }, { key: 'memento', label: 'Memento mori' }, { key: 'averages', label: 'Recent check-ins' }, { key: 'focus', label: 'Focus time' }, { key: 'today', label: 'Today’s tasks' }, { key: 'spheres', label: 'Life spheres' }, { key: 'quests', label: 'Quests' }, { key: 'library', label: 'Recent library' }] as const;
export type HomeSections = Record<typeof HOME_SECTIONS[number]['key'], boolean>;
export const DEFAULT_HOME_SECTIONS = Object.fromEntries(HOME_SECTIONS.map(({ key }) => [key, true])) as HomeSections;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function checkInSettings(value: unknown): CheckInSettings {
  const stored = record(value);
  return { enabled: stored.enabled !== false, metrics: Array.isArray(stored.metrics) ? CHECK_INS.filter(({ key }) => (stored.metrics as unknown[]).includes(key)).map(({ key }) => key) : [...DEFAULT_CHECK_INS.metrics] };
}
export function homeSections(value: unknown): HomeSections {
  const stored = record(value);
  return Object.fromEntries(HOME_SECTIONS.map(({ key }) => [key, stored[key] !== false])) as HomeSections;
}

/** New vaults are Markdown-only. Existing configured vaults retain their workflows. */
export function pluginSettings(settings: Settings, root: string): PluginSettings {
  const vault = record(record(settings.vaults)[root]);
  const saved = record(vault.plugins);
  const existing = vault.complete === true || settings.legacyPeriodicVault === root;
  const legacyDefaults = existing && !Object.hasOwn(vault, 'plugins');
  const defaults = legacyDefaults ? ALL_PLUGINS : NO_PLUGINS;
  const legacy = record(settings.periodicFeatures);
  const assistant = record(vault.assistant);
  return Object.fromEntries(PLUGINS.map(({ id }) => [id, typeof saved[id] === 'boolean' ? saved[id] : id === 'spike' ? assistant.enabled === true || assistant.desktopPet === true : id === 'habits' && legacyDefaults ? legacy.habits !== false : id === 'cbt' && legacyDefaults ? legacy.thoughtRecords !== false : defaults[id]])) as PluginSettings;
}
export function effectivePlugins(configured: PluginSettings): PluginSettings {
  return Object.fromEntries(PLUGINS.map((plugin) => [plugin.id, configured[plugin.id] && (!('requires' in plugin) || configured[plugin.requires])])) as PluginSettings;
}
export function setPlugin(configured: PluginSettings, id: PluginId, enabled: boolean): PluginSettings {
  const definition = PLUGINS.find((plugin) => plugin.id === id)!;
  return { ...configured, [id]: enabled, ...(enabled && 'requires' in definition ? { [definition.requires]: true } : {}) };
}
export function pluginPreferencesPatch(settings: Settings, root: string, plugins: PluginSettings, sections: HomeSections, checks?: CheckInSettings, display?: PluginDisplays): Settings {
  const vaults = record(settings.vaults);
  return { vaults: { ...vaults, [root]: { ...record(vaults[root]), plugins, homeSections: sections, ...(checks ? { checkIns: checks } : {}), ...(display ? { pluginDisplay: display } : {}) } } };
}
export function savedCheckIns(settings: Settings, root: string): CheckInSettings {
  const vault = record(record(settings.vaults)[root]);
  return checkInSettings(vault.checkIns ?? (vault.complete === true || settings.legacyPeriodicVault === root ? record(settings.periodicFeatures).checkIns : undefined));
}
export function savedHomeSections(settings: Settings, root: string): HomeSections {
  return homeSections(record(record(settings.vaults)[root]).homeSections);
}
export function requiredPlugin(kind: string): PluginId | undefined {
  return ({ home: 'home', library: 'library', graph: 'graph', calendar: 'calendar', habits: 'habits', quests: 'quests', statistics: 'statistics', summaries: 'statistics' } as Record<string, PluginId>)[kind];
}
