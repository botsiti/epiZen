import type { Settings } from './api';
import type { PluginDisplays } from './pluginDisplay';

import { PLUGINS, pluginDependencies, type PluginId } from './pluginCatalog';
export { PLUGINS, requiredPlugin, type PluginId } from './pluginCatalog';
export type PluginSettings = Record<PluginId, boolean>;
export interface PluginConfiguration { enabled: PluginSettings; home: HomeSections; checks: CheckInSettings; display: PluginDisplays }
export const NO_PLUGINS = Object.fromEntries(PLUGINS.map(({ id }) => [id, false])) as PluginSettings;
export const ALL_PLUGINS = Object.fromEntries(PLUGINS.map(({ id }) => [id, true])) as PluginSettings;
export const CHECK_INS = [{ key: 'mood', label: 'Mood' }, { key: 'energy', label: 'Energy' }, { key: 'focus', label: 'Focus' }, { key: 'soc', label: 'Social' }, { key: 'sleep', label: 'Sleep' }] as const;
export type CheckInKey = typeof CHECK_INS[number]['key'];
export interface CheckInSettings { enabled: boolean; metrics: CheckInKey[] }
export const DEFAULT_CHECK_INS: CheckInSettings = { enabled: true, metrics: CHECK_INS.map(({ key }) => key) };
export const HOME_SECTIONS = [
  { key: 'profile', label: 'Progress & XP', owner: 'periodic' },
  { key: 'memento', label: 'Memento mori', owner: 'home' },
  { key: 'averages', label: 'Recent check-ins', owner: 'checkins' },
  { key: 'focus', label: 'Focus time', owner: 'periodic' },
  { key: 'today', label: 'Today’s tasks', owner: 'periodic' },
  { key: 'spheres', label: 'Life spheres', owner: 'quests' },
  { key: 'quests', label: 'Quests', owner: 'quests' },
  { key: 'library', label: 'Recent library', owner: 'library' },
] as const satisfies readonly { key: string; label: string; owner: PluginId }[];
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
  return Object.fromEntries(PLUGINS.map(({ id }) => {
    if (typeof saved[id] === 'boolean') return [id, saved[id]];
    if (id === 'spike') return [id, assistant.enabled === true || assistant.desktopPet === true];
    if (id === 'habits' && legacyDefaults) return [id, legacy.habits !== false];
    if (id === 'cbt' && legacyDefaults) return [id, legacy.thoughtRecords !== false];
    // Before the separate switch, only a functioning focus timer showed the status item.
    if (id === 'menubar' && !legacyDefaults) return [id, saved.timer === true && saved.periodic === true];
    return [id, defaults[id]];
  })) as PluginSettings;
}
export function effectivePlugins(configured: PluginSettings): PluginSettings {
  return Object.fromEntries(PLUGINS.map(({ id }) => [id, configured[id] && pluginDependencies[id].every((parent) => configured[parent])])) as PluginSettings;
}
export function setPlugin(configured: PluginSettings, id: PluginId, enabled: boolean): PluginSettings {
  const next = { ...configured, [id]: enabled };
  if (enabled) for (const parent of pluginDependencies[id]) next[parent] = true;
  return next;
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
export function visibleHomeSections(sections: HomeSections, active: PluginSettings): HomeSections {
  return Object.fromEntries(HOME_SECTIONS.map(({ key, owner }) => [key, sections[key] && active[owner]])) as HomeSections;
}
