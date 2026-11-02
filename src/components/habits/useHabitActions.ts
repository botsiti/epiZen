import { useCallback, useLayoutEffect, useRef } from 'react';
import { createNote, readNote, vaultStatus, writeNote } from '../../lib/api';
import { changeHabit, habitActive, habitNameKey, newHabit, readHabit, setHabitCompletion, type Habit, type HabitLifecycle } from '../../lib/habits';

interface Options {
  root?: string;
  habits: Habit[];
  onSaved: (path: string, text: string) => void;
  refresh: () => Promise<void>;
  changeDay: (date: Date, edit: (text: string) => string | undefined) => Promise<{ path: string; text: string }>;
}

/** I/O stays here: definitions and completions use the existing conditional vault writes. */
export function useHabitActions({ root, habits, onSaved, refresh, changeDay }: Options) {
  const current = useRef({ root, habits });
  const queue = useRef(Promise.resolve());
  useLayoutEffect(() => { current.current = { root, habits }; }, [root, habits]);
  const checkRoot = useCallback(async () => {
    const status = await vaultStatus();
    if (!root || current.current.root !== root || status.state !== 'open' || status.root !== root) throw new Error('The open vault changed. Reopen Habits before saving.');
  }, [root]);
  const serialize = useCallback((operation: () => Promise<void>) => {
    const job = queue.current.then(operation);
    queue.current = job.catch(() => undefined);
    return job;
  }, []);
  const onCreate = useCallback((name: string, from: string, history?: Habit) => serialize(async () => {
    await checkRoot();
    const key = habitNameKey(name);
    if (current.current.habits.some((h) => [h.name, ...h.aliases].some((alias) => habitNameKey(alias) === key))) throw new Error('This habit already has a history. Reactivate the existing habit instead.');
    const note = newHabit(name, from, crypto.randomUUID(), history);
    await checkRoot(); await createNote(note.path, note.text);
    if (current.current.root !== root) return;
    onSaved(note.path, note.text); await refresh();
  }), [serialize, checkRoot, root, onSaved, refresh]);
  const onLifecycle = useCallback((habit: Habit, change: HabitLifecycle) => serialize(async () => {
    await checkRoot();
    if (!habit.path) throw new Error('Continue this historical habit before changing its schedule.');
    const source = await readNote(habit.path); const next = changeHabit(source, habit, change);
    await checkRoot(); await writeNote(habit.path, next, source);
    if (current.current.root === root) onSaved(habit.path, next);
  }), [serialize, checkRoot, onSaved, root]);
  const onComplete = useCallback((date: Date, habit: Habit, expected: boolean, done: boolean) => serialize(async () => {
    await checkRoot();
    if (!habit.path) throw new Error('Continue this historical habit to track it.');
    const source = await readNote(habit.path); const fresh = readHabit(habit.path, source);
    if (!fresh || !habitActive(fresh, date)) throw new Error('This habit is not scheduled on that date. Refresh its schedule.');
    await checkRoot();
    await changeDay(date, (text) => setHabitCompletion(text, fresh, expected, done));
  }), [serialize, checkRoot, changeDay]);
  return { onCreate, onLifecycle, onComplete };
}
