import { useCallback, useEffect, useState } from 'react';
import { assistantConnection } from '../../lib/api';
import type { AssistantProvider, AssistantSettings as Preferences } from '../../lib/assistant/types';
import { AssistantSettings } from './AssistantSettings';
import './assistant.css';

/** Settings entry point; connection failures must not block the local companion controls. */
export function AssistantConfiguration({ value, pluginEnabled, profileExists, onSave, onOpenProfile, onBack }: {
  value: Preferences; pluginEnabled: boolean; profileExists: boolean;
  onSave: (value: Preferences) => Promise<void>; onOpenProfile: () => void; onBack: () => void;
}) {
  const [configured, setConfigured] = useState(false);
  const check = useCallback(async (provider: AssistantProvider = value.provider) => { setConfigured((await assistantConnection(provider)).configured); }, [value.provider]);
  useEffect(() => {
    let gone = false;
    void assistantConnection(value.provider).then((connection) => { if (!gone) setConfigured(connection.configured); }).catch(() => { if (!gone) setConfigured(false); });
    return () => { gone = true; };
  }, [value.provider]);
  return <div className="spike-configuration">
    {!pluginEnabled && <p className="preferences-description">Enable Spike in Plugins and save your changes to use the sidebar and desktop companion. You can configure it here first.</p>}
    <AssistantSettings backLabel="Plugins" value={value} configured={configured} profileExists={profileExists} onSave={onSave} onCompanionChange={(patch) => onSave({ ...value, ...patch })} onConnection={check} onProfile={onOpenProfile} onBack={onBack} />
  </div>;
}
