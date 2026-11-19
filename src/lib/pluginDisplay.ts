import type { Settings } from './api';
import { PLUGINS, manifests, type PluginId } from './pluginCatalog';

export interface PluginDisplay { density: 'comfortable' | 'compact'; defaultView: string; sections: Record<string, boolean> }
export type PluginDisplays = Record<PluginId, PluginDisplay>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function pluginDisplays(value?: unknown): PluginDisplays {
  const saved = record(value);
  return Object.fromEntries(PLUGINS.map(({ id }) => {
    const item = record(saved[id]), options = manifests[id], sections = record(item.sections);
    return [id, { density: item.density === 'compact' ? 'compact' : 'comfortable', defaultView: options.views?.includes(String(item.defaultView)) ? item.defaultView : options.views?.[0] ?? '', sections: Object.fromEntries((options.sections ?? []).map(({ key }) => [key, sections[key] !== false])) }];
  })) as PluginDisplays;
}
export function savedPluginDisplays(settings: Settings, root: string): PluginDisplays { return pluginDisplays(record(record(settings.vaults)[root]).pluginDisplay); }
