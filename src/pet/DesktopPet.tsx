import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { hidePet, movePet, onPetState, openPetConversation, petPosition, petState, setPetMotion, type PetPosition, type PetStatus } from '../lib/api';
import { Spike } from '../components/assistant/Spike';
import { SPIKE_FRAMES, type SpikeState } from '../lib/assistant/spike';

export function DesktopPet() {
  const [status, setStatus] = useState<PetStatus>({ animation: 'idle', label: 'Talk to Spike', motion: true });
  const [dragging, setDragging] = useState<SpikeState>(), [error, setError] = useState<string>();
  const drag = useRef<{ id: number; x: number; y: number; origin: Promise<PetPosition> } | undefined>(undefined);
  const movement = useRef(Promise.resolve());
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.screenX - active.x, dy = event.screenY - active.y;
    movement.current = movement.current.then(async () => {
      const origin = await active.origin;
      await movePet(Math.round(origin.x + dx * origin.scale), Math.round(origin.y + dy * origin.scale));
    }).catch((error: unknown) => setError(String(error)));
  };
  const endDrag = () => { drag.current = undefined; setDragging(undefined); };
  useEffect(() => {
    let gone = false, stop: (() => void) | undefined;
    const accept = (next: PetStatus) => { if (!gone && next && Object.hasOwn(SPIKE_FRAMES, next.animation) && typeof next.label === 'string' && typeof next.motion === 'boolean') setStatus(next); };
    void onPetState(accept).then((off) => { if (gone) off(); else stop = off; }).catch((error: unknown) => { if (!gone) setError(String(error)); });
    void petState().then(accept).catch((error: unknown) => { if (!gone) setError(String(error)); });
    return () => { gone = true; stop?.(); };
  }, []);
  const perform = (action: () => Promise<void>) => { setError(undefined); void action().catch((error: unknown) => setError(String(error))); };
  return <main className="desktop-pet" data-testid="desktop-pet">
    <div className="pet-body" role="img" aria-label="Spike · drag to move" title={`${status.label} · Drag to move`} onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); setError(undefined); setDragging('right');
      // Pointer capture survives leaving the transparent window. Track the active
      // pointer rather than `buttons`, which WebKit can report as zero on macOS.
      event.currentTarget.setPointerCapture(event.pointerId);
      const origin = movement.current.then(petPosition);
      void origin.catch((error: unknown) => { endDrag(); setError(String(error)); });
      drag.current = { id: event.pointerId, x: event.screenX, y: event.screenY, origin };
    }} onPointerMove={move} onPointerUp={(event) => { move(event); endDrag(); }} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <Spike size={144} state={dragging ?? status.animation as SpikeState} motion={status.motion} followPointer />
    </div>
    <div className="pet-tools"><button type="button" aria-label="Open conversation" onClick={() => perform(openPetConversation)}>Talk</button><button type="button" aria-label={status.motion ? 'Pause animation' : 'Resume animation'} onClick={() => perform(() => setPetMotion(!status.motion))}>{status.motion ? 'Ⅱ' : '▷'}</button><button type="button" aria-label="Hide Spike" onClick={() => perform(hidePet)}>×</button></div>
    {!error && status.animation !== 'idle' && <span className="pet-status" role="status">{status.label}</span>}
    {error && <p className="pet-error" role="alert" title={error}>Couldn’t do that. Try again.</p>}
  </main>;
}
