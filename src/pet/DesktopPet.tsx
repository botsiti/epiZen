import { useEffect, useRef, useState } from 'react';
import { dragPet, hidePet, onPetWake, onPetState, openQuickPrompt, petState, setPetMotion, type PetStatus } from '../lib/api';
import { CompanionDock, CaptureIcon } from '../components/companion/CompanionDock';
import { Spike } from '../components/assistant/Spike';
import { SPIKE_FRAMES, type SpikeState } from '../lib/assistant/spike';

export function DesktopPet() {
  const [wake, setWake] = useState(false);
  useEffect(() => {
    let gone = false, stop: (() => void) | undefined, timer: ReturnType<typeof setTimeout>;
    void onPetWake(() => { if (gone) return; setWake(true); clearTimeout(timer); timer = setTimeout(() => setWake(false), 700); }).then((off) => { if (gone) off(); else stop = off; }).catch(() => undefined);
    return () => { gone = true; stop?.(); clearTimeout(timer); };
  }, []);
  const [status, setStatus] = useState<PetStatus>({ animation: 'idle', label: 'Talk to Spike', motion: true });
  const [error, setError] = useState<string>();
  const gesture = useRef(false);
  useEffect(() => {
    let gone = false, stop: (() => void) | undefined;
    const accept = (next: PetStatus) => { if (!gone && next && Object.hasOwn(SPIKE_FRAMES, next.animation) && typeof next.label === 'string' && typeof next.motion === 'boolean') setStatus(next); };
    void onPetState(accept).then((off) => { if (gone) off(); else stop = off; }).catch((error: unknown) => { if (!gone) setError(String(error)); });
    void petState().then(accept).catch((error: unknown) => { if (!gone) setError(String(error)); });
    return () => { gone = true; stop?.(); };
  }, []);
  const perform = (action: () => Promise<void>) => { setError(undefined); void action().catch((error: unknown) => setError(String(error))); };
  return <main className={`desktop-pet${status.promptOpen ? ' has-prompt' : ''}`} data-testid="desktop-pet">
    <div className={`pet-body${wake && status.motion ? ' is-waking' : ''}`} role="button" tabIndex={0} aria-label="Talk to Spike · drag to move" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); perform(() => openQuickPrompt()); } }} onContextMenu={(event) => { event.preventDefault(); perform(hidePet); }} title={`${status.label} · Drag to move · Right-click to hide · ⇧⌘Space to show`} onPointerDown={(event) => {
      if (event.button !== 0 || gesture.current) return;
      event.preventDefault();
      gesture.current = true;
      perform(async () => {
        try {
          if (!await dragPet(event.clientX, event.clientY)) await openQuickPrompt();
        } finally { gesture.current = false; }
      });
    }}>
      <Spike size={132} state={status.animation as SpikeState} motion={status.motion} followPointer />
    </div>
    <div className="pet-tools">
      <CompanionDock onWrite={() => perform(() => openQuickPrompt())} onVoice={() => perform(() => openQuickPrompt(true))} />
      <button className="pet-motion" type="button" title={status.motion ? 'Pause animation' : 'Resume animation'} aria-label={status.motion ? 'Pause animation' : 'Resume animation'}
        onClick={() => perform(() => setPetMotion(!status.motion))}><CaptureIcon name={status.motion ? 'pause' : 'play'} /></button>
    </div>
    {!error && status.animation !== 'idle' && <span className="pet-status" role="status">{status.label}</span>}
    {error && <p className="pet-error" role="alert" title={error}>{error}</p>}
  </main>;
}
