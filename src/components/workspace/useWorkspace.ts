import { useCallback, useEffect, useRef, useState } from 'react';
import { updateSettings } from '../../lib/api';
import { flushBeforeClose } from '../../lib/saving';
import { fromStored, newWorkspace, toStored, type Workspace } from '../../lib/tabs';

/**
 * The open tabs (src/lib/tabs.ts), brought back from the app's settings when a vault opens and
 * written back to them, never to the vault, a moment after they change and once more on quit.
 */
export function useWorkspace() {
  const [ws, setWs] = useState<Workspace>(newWorkspace);
  // The vault the tabs belong to; nothing is stored until the tabs of the open vault are restored.
  const vault = useRef<string | undefined>(undefined);
  const latest = useRef(ws);
  const stored = useRef<string | undefined>(undefined);
  useEffect(() => {
    latest.current = ws;
  }, [ws]);

  const persist = useCallback(async () => {
    if (!vault.current) return;
    const value = toStored(latest.current, vault.current);
    const json = JSON.stringify(value);
    if (json === stored.current) return;
    stored.current = json;
    await updateSettings({ workspace: value }).catch(() => {
      stored.current = undefined;
    });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void persist(), 300);
    return () => clearTimeout(timer);
  }, [ws, persist]);
  useEffect(() => flushBeforeClose(() => persist().then(() => undefined)), [persist]);

  /** The tabs the settings keep for this vault, checked against its notes. */
  const restore = useCallback((value: unknown, context: { vault: string; notes: ReadonlySet<string> }) => {
    const next = fromStored(value, context);
    vault.current = context.vault;
    stored.current = JSON.stringify(toStored(next, context.vault));
    setWs(next);
  }, []);
  /** Another vault is opening: one home tab, and nothing stored until its own tabs are restored. */
  const reset = useCallback(() => {
    vault.current = undefined;
    setWs(newWorkspace());
  }, []);

  return { ws, update: setWs, restore, reset };
}
