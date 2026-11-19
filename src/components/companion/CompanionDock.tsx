import './companionDock.css';

export function CaptureIcon({ name }: { name: 'write' | 'voice' | 'send' | 'plus' | 'close' | 'pause' | 'play' | 'conversation' }) {
  const paths = {
    write: 'M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6M10 15l1-4 8-8 3 3-8 8-4 1z',
    voice: 'M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4', send: 'M12 19V5m-6 6 6-6 6 6',
    plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M18 6 6 18', pause: 'M9 6v12m6-12v12',
    play: 'm8 5 11 7-11 7z', conversation: 'M4 4h16v12H9l-5 4z',
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function CompanionDock({ onWrite, onVoice, disabled, voiceDisabled }: { onWrite: () => void; onVoice: () => void; disabled?: boolean; voiceDisabled?: boolean }) {
  return <div className="companion-dock" role="group" aria-label="Talk to Spike">
    <button className="dock-write" type="button" title="Type to Spike · ⇧⌘Space" aria-label="Open quick prompt" disabled={disabled} onClick={onWrite}><CaptureIcon name="write" /></button>
    <button type="button" title="Dictate to Spike · ⌥⇧⌘Space" aria-label="Dictate to Spike" disabled={disabled || voiceDisabled} onClick={onVoice}><CaptureIcon name="voice" /></button>
  </div>;
}
