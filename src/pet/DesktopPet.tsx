import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { movePet, onPetWake, onPetState, openQuickPrompt, petPosition, petState, setPetMotion, type PetPosition, type PetStatus } from '../lib/api';
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
  const [dragging, setDragging] = useState<SpikeState>(), [error, setError] = useState<string>();
  const drag = useRef<{ id: number; x: number; y: number; origin: Promise<PetPosition>; moved: boolean; token: number } | undefined>(undefined);
  const movement = useRef(Promise.resolve());
  const epoch = useRef(0);
  const nextMove = useRef<{ origin: Promise<PetPosition>; dx: number; dy: number; token: number } | undefined>(undefined);
  const moving = useRef(false);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.screenX - active.x, dy = event.screenY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true; setDragging(dx < 0 ? 'left' : 'right');
    nextMove.current = { origin: active.origin, dx, dy, token: active.token };
    if (moving.current) return;
    moving.current = true;
    void (async () => {
      while (nextMove.current) {
        const latest = nextMove.current; nextMove.current = undefined;
        const origin = await latest.origin;
        if (latest.token !== epoch.current) continue;
        // Track only the native move, never the drain loop: a new gesture may wait for
        // this command while that same loop is about to process the new gesture.
        movement.current = movePet(Math.round(origin.x + latest.dx * origin.scale), Math.round(origin.y + latest.dy * origin.scale));
        await movement.current;
      }
    })().catch((error: unknown) => { nextMove.current = undefined; setError(String(error)); }).finally(() => { moving.current = false; });
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
    <div className={`pet-body${wake && status.motion ? ' is-waking' : ''}`} role="button" tabIndex={0} aria-label="Talk to Spike · drag to move" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); perform(() => openQuickPrompt()); } }} title={`${status.label} · Drag to move`} onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); setError(undefined);
      // Pointer capture survives leaving the transparent window. Track the active
      // pointer rather than `buttons`, which WebKit can report as zero on macOS.
      event.currentTarget.setPointerCapture(event.pointerId);
      const token = ++epoch.current; nextMove.current = undefined;
      const origin = movement.current.catch(() => undefined).then(petPosition);
      void origin.catch((error: unknown) => { endDrag(); setError(String(error)); });
      drag.current = { id: event.pointerId, x: event.screenX, y: event.screenY, origin, moved: false, token };
    }} onPointerMove={move} onPointerUp={(event) => { move(event); const active = drag.current; endDrag(); if (active && !active.moved) perform(() => openQuickPrompt()); }} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <Spike size={144} state={dragging ?? status.animation as SpikeState} motion={status.motion} followPointer />
    </div>
    <div className="pet-tools"><button type="button" aria-label="Dictate to Spike" onClick={() => perform(() => openQuickPrompt(true))}>Speak</button><button type="button" aria-label={status.motion ? 'Pause animation' : 'Resume animation'} onClick={() => perform(() => setPetMotion(!status.motion))}>{status.motion ? 'Ⅱ' : '▷'}</button><button type="button" aria-label="Open quick prompt" onClick={() => perform(() => openQuickPrompt())}>Text</button></div>
    {!error && status.animation !== 'idle' && <span className="pet-status" role="status">{status.label}</span>}
    {error && <p className="pet-error" role="alert" title={error}>{error}</p>}
  </main>;
}
