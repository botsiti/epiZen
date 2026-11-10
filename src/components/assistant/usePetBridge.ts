import { useEffect, useRef, useState } from 'react';
import { enablePet, onMainHidden, onPetCommand, publishPet, type PetStatus } from '../../lib/api';
import { object } from '../../lib/assistant/types';
interface Props { root: string; enabled: boolean; status: PetStatus; onOpen: () => void; onHide: () => Promise<void>; onMotion: (motion: boolean) => Promise<void>; onMainHidden: () => void }
export function usePetBridge(props: Props) {
  const latest = useRef(props), [error, setError] = useState<string>();
  useEffect(() => { latest.current = props; });
  useEffect(() => {
    let gone = false;
    void enablePet(props.root, props.enabled).then(() => { if (!gone) setError(undefined); }).catch((error: unknown) => { if (!gone) setError(String(error)); });
    return () => { gone = true; };
  }, [props.root, props.enabled]);
  useEffect(() => () => { void enablePet(props.root, false).catch(() => undefined); }, [props.root]);
  const { animation, label, motion } = props.status;
  useEffect(() => { void publishPet(props.root, { animation, label, motion }).catch((error: unknown) => setError(String(error))); }, [props.root, animation, label, motion]);
  useEffect(() => {
    let gone = false; const stops: (() => void)[] = [];
    const accept = (stop: () => void) => { if (gone) stop(); else stops.push(stop); };
    void onPetCommand((raw) => {
      try {
        if (gone) return;
        const command = object(raw), current = latest.current;
        if (command.root !== current.root) return;
        if (command.type === 'open') current.onOpen();
        else if (command.type === 'hide') void current.onHide().catch((error: unknown) => setError(String(error)));
        else if (command.type === 'motion' && typeof command.motion === 'boolean') void current.onMotion(command.motion).catch((error: unknown) => setError(String(error)));
      } catch { /* Ignore malformed commands from unrelated windows. */ }
    }).then(accept).catch((error: unknown) => { if (!gone) setError(String(error)); });
    void onMainHidden(() => { if (!gone) latest.current.onMainHidden(); }).then(accept).catch((error: unknown) => { if (!gone) setError(String(error)); });
    return () => { gone = true; stops.forEach((stop) => stop()); };
  }, []);
  return error;
}
