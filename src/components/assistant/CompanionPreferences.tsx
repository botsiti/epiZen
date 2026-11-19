import { openQuickPrompt } from '../../lib/api';
import { useState } from 'react';
import { CompanionDock } from '../companion/CompanionDock';
import { Spike } from './Spike';

interface Props {
  visible: boolean; motion: boolean; enabled: boolean; connected: boolean;
  onVisibility: () => void; onMotion: () => void;
}

export function CompanionPreferences({ visible, motion, enabled, connected, onVisibility, onMotion }: Props) {
  const [error, setError] = useState('');
  const open = (voice: boolean) => { setError(''); void openQuickPrompt(voice).catch((e: unknown) => setError(String(e))); };
  return <section className="companion-preferences" aria-label="Desktop companion">
    <div className="companion-stage"><Spike size={90} motion={motion} />
      <CompanionDock onWrite={() => open(false)} onVoice={() => open(true)} disabled={!enabled} voiceDisabled={!connected} /></div>
    <div className="companion-choices"><h3>Desktop companion</h3><p>Type or speak beneath Spike while you work. Drag him to move, or right-click to hide.</p>
      <div className="companion-toggles"><button type="button" className="companion-visibility" aria-pressed={visible} disabled={!enabled} aria-label={visible ? 'Hide desktop Spike' : 'Show Spike on desktop'} onClick={onVisibility}><span>Show on desktop</span><i aria-hidden="true" /></button>
      <label className="companion-motion"><span>Animate Spike</span><input type="checkbox" checked={motion} onChange={onMotion} /></label></div>
      <dl><div><dt>Quick prompt</dt><dd><kbd>⇧⌘Space</kbd></dd></div><div><dt>Dictation</dt><dd><kbd>⌥⇧⌘Space</kbd></dd></div></dl>
      {error && <p className="assistant-error" role="alert">{error}</p>}
    </div>
  </section>;
}
