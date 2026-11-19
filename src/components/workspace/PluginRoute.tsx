import type { ReactNode } from 'react';
import { manifests, requiredPlugin } from '../../lib/pluginCatalog';
import type { PluginSettings } from '../../lib/plugins';
import type { View } from '../../lib/tabs';
import { PluginUnavailable } from './MarkdownHome';
import { PluginSurface } from './PluginDisplay';

/** All workspace entry points, including restored tabs and Back, pass through the same gate. */
export function PluginRoute({ view, active, markdownHome, onSettings, children }: {
  view: View;
  active: PluginSettings;
  markdownHome: ReactNode;
  onSettings: () => void;
  children: ReactNode;
}) {
  const owner = requiredPlugin(view);
  if (!owner) return children;
  if (active[owner]) return <PluginSurface id={owner}>{children}</PluginSurface>;
  return view.kind === 'home' ? markdownHome : <PluginUnavailable name={manifests[owner].name} onSettings={onSettings} />;
}
