import { homePlugin } from './builtins/home';
import { basesPlugin } from './builtins/bases';
import { libraryPlugin } from './builtins/library';
import { graphPlugin } from './builtins/graph';
import { spikePlugin } from './builtins/spike';
import { periodicPlugin } from './builtins/periodic';
import { checkinsPlugin } from './builtins/checkins';
import { habitsPlugin } from './builtins/habits';
import { cbtPlugin } from './builtins/cbt';
import { questsPlugin } from './builtins/quests';
import { statisticsPlugin } from './builtins/statistics';
import { calendarPlugin } from './builtins/calendar';
import { timerPlugin } from './builtins/timer';
import { menubarPlugin } from './builtins/menubar';
import type { View } from './tabs';

const modules = {
  home: homePlugin,
  bases: basesPlugin,
  library: libraryPlugin,
  graph: graphPlugin,
  spike: spikePlugin,
  periodic: periodicPlugin,
  checkins: checkinsPlugin,
  habits: habitsPlugin,
  cbt: cbtPlugin,
  quests: questsPlugin,
  statistics: statisticsPlugin,
  calendar: calendarPlugin,
  timer: timerPlugin,
  menubar: menubarPlugin,
};
export type PluginId = keyof typeof modules;
export type PluginSetupPage = Extract<(typeof modules)[PluginId], { setup: unknown }>['setup']['page'];

type PluginRouteKey = View['kind'] | 'new-base';

interface PluginManifest {
  name: string;
  group: 'Workspace' | 'Daily life' | 'Planning';
  description: string;
  requires?: readonly PluginId[];
  routes?: readonly PluginRouteKey[];
  setup?: { page: PluginSetupPage; label: string };
  viewLabel?: string;
  views?: readonly string[];
  sections?: readonly { key: string; label: string }[];
}
export const manifests: Readonly<Record<PluginId, PluginManifest>> = modules;
export const PLUGINS = (Object.keys(manifests) as PluginId[]).map((id) => ({ id, ...manifests[id] }));

// Resolve once when the host loads. A bad declaration fails at startup and in the catalog tests.
function dependenciesOf(id: PluginId, path: PluginId[]): PluginId[] {
  if (path.includes(id)) throw new Error(`Circular plugin dependency: ${[...path, id].join(' → ')}`);
  const parents = manifests[id].requires ?? [];
  return [...new Set(parents.flatMap((parent) => [parent, ...dependenciesOf(parent, [...path, id])]))];
}
export const pluginDependencies = Object.fromEntries(PLUGINS.map(({ id }) => [id, dependenciesOf(id, [])])) as Record<PluginId, PluginId[]>;
const routeOwners = new Map<PluginRouteKey, PluginId>();
for (const plugin of PLUGINS) {
  for (const route of plugin.routes ?? []) {
    if (routeOwners.has(route)) throw new Error(`Two plugins own the ${route} view.`);
    routeOwners.set(route, plugin.id);
  }
}
export function requiredPlugin(view: View): PluginId | undefined {
  return routeOwners.get(view.kind === 'new' && view.item === 'base' ? 'new-base' : view.kind);
}
