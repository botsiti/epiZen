import { useEffect, useState } from 'react';
import { useEscape } from '../components/calendar/useEscape';
import { useNow } from '../components/calendar/useNow';
import { hideTray, onTrayShown, onTrayState, openMainWindow, quitApp, trayCommand, trayState } from '../lib/api';
import type { PanelView, TrayCommand } from '../lib/tray';
import { TrayPanel } from './TrayPanel';

const isView = (value: unknown): value is PanelView => typeof value === 'object' && value !== null && 'day' in value && 'tasks' in value;

/** The panel's window: what the main window published, kept current, and its buttons sent back. */
export function TrayApp() {
  const [view, setView] = useState<PanelView>();
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    const take = (value: unknown) => setView(isView(value) ? value : undefined);
    const fetch = () => void trayState().then(take, () => undefined);
    fetch();
    const published = onTrayState(take);
    // Opened again: what is published may have changed while the panel was hidden.
    const shown = onTrayShown(() => {
      setShownAt(Date.now());
      fetch();
    });
    return () => {
      void published.then((unlisten) => unlisten());
      void shown.then((unlisten) => unlisten());
    };
  }, []);
  const counting = Boolean(view?.rest ?? (view?.session && view.session.pausedAt === undefined));
  const ticking = useNow(true, counting ? 250 : 1000);
  const now = Math.max(ticking, shownAt);
  useEscape(() => void hideTray());
  return (
    <TrayPanel
      view={view}
      now={now}
      send={(command: TrayCommand) => void trayCommand(command)}
      onOpen={() => void openMainWindow()}
      onQuit={() => void quitApp()}
    />
  );
}
