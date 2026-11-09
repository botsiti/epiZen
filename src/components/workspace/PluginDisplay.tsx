import { createContext, useContext, type ReactNode } from 'react';
import { pluginDisplays, type PluginDisplays } from '../../lib/pluginDisplay';
import { PLUGINS, type PluginId } from '../../lib/plugins';
import { ErrorBoundary } from '../ErrorBoundary';
import './pluginDisplay.css';

const Display = createContext(pluginDisplays());
export function PluginDisplayProvider({ value, children }: { value: PluginDisplays; children: ReactNode }) { return <Display value={value}>{children}</Display>; }
// Views read only their own preferences. Persistence and draft ownership stay in Settings.
// eslint-disable-next-line react-refresh/only-export-components
export function usePluginDisplay(id: PluginId) { return useContext(Display)[id]; }
export function PluginAppearance({ id, children }: { id: PluginId; children: ReactNode }) {
  const display = usePluginDisplay(id);
  return <div className="plugin-display" data-plugin-display={id} data-density={display.density}>{children}</div>;
}
/** Navigation and sibling modules stay mounted when an optional screen fails. */
export function PluginSurface({ id, children }: { id: PluginId; children: ReactNode }) {
  return <ErrorBoundary key={id} label={PLUGINS.find((plugin) => plugin.id === id)!.name}><PluginAppearance id={id}>{children}</PluginAppearance></ErrorBoundary>;
}
