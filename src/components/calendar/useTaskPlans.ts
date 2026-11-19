import { useCallback, useLayoutEffect, useRef } from 'react';
import { calendarAccess, calendarEvents, deleteEvent, updateEvent } from '../../lib/api';
import { parseTaskUrl, planText, planWindow, sameLink } from '../../lib/plans';
import type { TaskChange } from './types';

/** The Calendar plugin follows linked task edits only while it owns this vault's subscription. */
export function useTaskPlans(root?: string, vaultName?: string) {
  const subscription = useRef<{ root: string; signal: AbortSignal }>(undefined);
  useLayoutEffect(() => {
    if (!root) return;
    const controller = new AbortController();
    subscription.current = { root, signal: controller.signal };
    return () => { controller.abort(); subscription.current = undefined; };
  }, [root]);

  return useCallback(async (change: TaskChange) => {
    const current = subscription.current;
    if (!current || current.root !== root || !vaultName || !change.focusId) return;
    const { signal } = current;
    if (await calendarAccess() !== 'allowed' || signal.aborted) return;
    const { from, to } = planWindow(change.date);
    const events = await calendarEvents(from, to);
    const link = { vault: vaultName, note: change.path, id: change.focusId };
    for (const event of events) {
      if (signal.aborted) return;
      if (!sameLink(parseTaskUrl(event.url), link)) continue;
      if (change.kind === 'deleted') await deleteEvent(event);
      else {
        const text = planText(change.after.category, change.after.label);
        if (event.title !== text.title || event.notes !== text.notes) await updateEvent(event, text);
      }
    }
  }, [root, vaultName]);
}
