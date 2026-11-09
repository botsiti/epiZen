import type { Settings } from './api';
import { PLUGINS, type PluginId } from './plugins';

export interface PluginDisplay { density: 'comfortable' | 'compact'; defaultView: string; sections: Record<string, boolean> }
export type PluginDisplays = Record<PluginId, PluginDisplay>;
interface DisplayOptions { views?: readonly string[]; viewLabel?: string; sections?: readonly { key: string; label: string }[]; setup?: 'periodic' | 'home' }
/** The plugin catalog's presentation contract. Every option is consumed by its owning screen. */
export const DISPLAY_OPTIONS: Record<PluginId, DisplayOptions> = {
  home: { setup: 'home' }, bases: {}, library: { setup: 'home' }, graph: {}, spike: {},
  periodic: { views: ['Remember last tab', 'Overview', 'Tasks', 'Habits', 'Quests', 'CBT'], viewLabel: 'Open daily notes on', setup: 'periodic' },
  checkins: {},
  habits: { views: ['Active', 'Archived', 'History'], viewLabel: 'Initial collection', sections: [{ key: 'today', label: 'Today’s progress' }] },
  cbt: { sections: [{ key: 'emotions', label: 'Emotion tags on thought records' }] },
  quests: { sections: [{ key: 'progress', label: 'Quest XP and progress summary' }] },
  statistics: { views: ['Monthly', 'Weekly', 'Yearly'], viewLabel: 'Initial analysis range', sections: [{ key: 'activity', label: 'Focus activity map' }, { key: 'habits', label: 'Habit history' }] },
  calendar: { views: ['Remember last view', 'Week', 'Day'], viewLabel: 'Initial calendar view' },
  timer: {},
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function pluginDisplays(value?: unknown): PluginDisplays {
  const saved = record(value);
  return Object.fromEntries(PLUGINS.map(({ id }) => {
    const item = record(saved[id]), options = DISPLAY_OPTIONS[id], sections = record(item.sections);
    return [id, { density: item.density === 'compact' ? 'compact' : 'comfortable', defaultView: options.views?.includes(String(item.defaultView)) ? item.defaultView : options.views?.[0] ?? '', sections: Object.fromEntries((options.sections ?? []).map(({ key }) => [key, sections[key] !== false])) }];
  })) as PluginDisplays;
}
export function savedPluginDisplays(settings: Settings, root: string): PluginDisplays { return pluginDisplays(record(record(settings.vaults)[root]).pluginDisplay); }
