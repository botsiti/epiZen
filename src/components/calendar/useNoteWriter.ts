import { useCallback, useEffect, useRef } from 'react';
import { readNote, writeNote } from '../../lib/api';

/** Changes a note over the latest text the app knows of it; resolves to the note's text after. */
export type NoteChange = (path: string, edit: (text: string) => string | undefined) => Promise<string>;

/**
 * The calendar's and the timer's writes, like a periodic page's (NoteView's `change`): one at a
 * time, each over the text the app last read or wrote for that note, and written only while the
 * note on disk still holds that text. `edit` returns the new text, or `undefined` for nothing to
 * do. When the edit throws or the note changed on disk, nothing is written: the note is read
 * again, the app learns its text, and the change rejects with the reason.
 */
export function useNoteWriter(texts: ReadonlyMap<string, string>, onSaved: (path: string, text: string) => void): NoteChange {
  const latest = useRef(texts);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const report = useRef(onSaved);
  useEffect(() => {
    latest.current = texts;
  }, [texts]);
  useEffect(() => {
    report.current = onSaved;
  }, [onSaved]);

  return useCallback((path, edit) => {
    const learn = (text: string) => {
      latest.current = new Map(latest.current).set(path, text);
      report.current(path, text);
    };
    const run = queue.current.then(async () => {
      const current = latest.current.get(path) ?? (await readNote(path));
      try {
        const next = edit(current);
        if (next === undefined || next === current) return current;
        await writeNote(path, next, current);
        learn(next);
        return next;
      } catch (err) {
        const fresh = await readNote(path).catch(() => undefined);
        if (fresh !== undefined) learn(fresh);
        throw err instanceof Error ? err : new Error(String(err));
      }
    });
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
}

/** An error's words, without the `Error:` a stringified error starts with. */
export const reason = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error:\s*/, '');
