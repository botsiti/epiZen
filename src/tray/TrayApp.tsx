import { useEffect, useState } from 'react';
import { useEscape } from '../components/calendar/useEscape';
import { useNow } from '../components/calendar/useNow';
import { hideTray, onTrayHidden, onTrayShown, onTrayState, openMainWindow, quitApp, trayCommand, trayState } from '../lib/api';
import type { PanelView } from '../lib/tray';
import { TrayPanel } from './TrayPanel';

const isView = (value: unknown): value is PanelView => typeof value === 'object' && value !== null && 'day' in value && 'tasks' in value;

/** The panel's window: what the main window published, kept current, and its buttons sent back. */
export function TrayApp() {
  const [view, setView] = useState<PanelView>();
  const [visible, setVisible] = useState(true);
  const [shownAt, setShownAt] = useState(0);
  const [problem, setProblem] = useState<string>();
  const perform = (action: () => Promise<void>, failure: string) => {
    setProblem(undefined);
    void action().catch(() => setProblem(failure));
  };
  useEffect(() => {
    let closed = false;
    let version = 0;
    const take = (value: unknown) => {
      if (!closed) setView(isView(value) ? value : undefined);
    };
    const fetch = () => {
      const requested = ++version;
      void trayState().then((value) => {
        if (requested === version) take(value);
      }, () => {
        if (!closed && requested === version) setProblem('The tray couldn’t load. Close and reopen it to retry.');
      });
    };
    const published = onTrayState((value) => {
      version += 1;
      take(value);
    });
    const shown = onTrayShown(() => {
      setVisible(true);
      setShownAt(Date.now());
      setProblem(undefined);
      fetch();
    });
    const hidden = onTrayHidden(() => setVisible(false));
    const listeners = [published, shown, hidden];
    void Promise.all(listeners).then(() => {
      if (!closed) fetch();
    }, () => {
      if (!closed) setProblem('The tray couldn’t connect to Epizen.');
    });
    return () => {
      closed = true;
      for (const listener of listeners) void listener.then((unlisten) => unlisten(), () => undefined);
    };
  }, []);
  const counting = Boolean(view?.rest ?? (view?.session && view.session.pausedAt === undefined));
  const ticking = useNow(visible, counting ? 250 : 1000);
  const now = Math.max(ticking, shownAt);
  useEscape(() => perform(hideTray, 'The tray couldn’t close. Try again.'));
  return (
    <TrayPanel
      view={view}
      now={now}
      problem={problem}
      send={(command) => perform(() => trayCommand({ ...command, scope: view?.scope }), 'The timer didn’t respond. Try again.')}
      onOpen={(destination) => perform(() => openMainWindow(destination, view?.scope), 'Epizen couldn’t open. Try again.')}
      onQuit={() => perform(quitApp, 'Epizen couldn’t quit. Try again.')}
    />
  );
}
