import { today } from '../../lib/dates';
import { canDeleteHabit, habitDeletionEdits } from '../../lib/habitDeletion';
import { flushAll, trackSave } from '../../lib/saving';
import type { HabitReward } from '../../lib/habitRewards';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { createNote, readAllNotes, readNote, trashNoteWithEdits, vaultStatus, writeNoteScoped, type NoteEdit } from '../../lib/api';
import { readHabitStyle, writeHabitStyle, type HabitStyle } from '../../lib/habitStyle';
import { changeHabit, changeHabitReward, habitActive, habitNameKey, newHabit, readHabit, setHabitCompletion, setHabitValue, type HabitTracking, type Habit, type HabitLifecycle } from '../../lib/habits';

interface Options {
  root?: string;
  habits: Habit[];
  dailyPaths?: ReadonlySet<string>;
  onDeleted?: (path: string, edits: NoteEdit[]) => void;
  onSaved: (path: string, text: string) => void;
  refresh: () => Promise<void>;
  changeDay: (date: Date, edit: (text: string) => string | undefined) => Promise<{ path: string; text: string }>;
}

/** I/O stays here: definitions and completions use the existing conditional vault writes. */
export function useHabitActions({ root, habits, dailyPaths, onDeleted, onSaved, refresh, changeDay }: Options) {
  const current = useRef({ root, habits, dailyPaths });
  const queue = useRef(Promise.resolve());
  useLayoutEffect(() => { current.current = { root, habits, dailyPaths }; }, [root, habits, dailyPaths]);
  const checkRoot = useCallback(async () => {
    const status = await vaultStatus();
    if (!root || current.current.root !== root || status.state !== 'open' || status.root !== root) throw new Error('The open vault changed. Reopen Habits before saving.');
    return root;
  }, [root]);
  const serialize = useCallback((operation: () => Promise<void>) => {
    const job = queue.current.then(operation);
    queue.current = job.catch(() => undefined);
    return job;
  }, []);
  const onCreate = useCallback((name: string, from: string, history?: Habit, tracking?: HabitTracking, style?: HabitStyle) => serialize(async () => {
    await checkRoot();
    const key = habitNameKey(name);
    if (current.current.habits.some((h) => [h.name, ...h.aliases].some((alias) => habitNameKey(alias) === key))) throw new Error('This habit already has a history. Reactivate the existing habit instead.');
    const note = newHabit(name, from, crypto.randomUUID(), history, tracking, style);
    const openRoot = await checkRoot(); await createNote(note.path, note.text, openRoot);
    if (current.current.root !== root) return;
    onSaved(note.path, note.text); await refresh();
  }), [serialize, checkRoot, root, onSaved, refresh]);
  const onLifecycle = useCallback((habit: Habit, change: HabitLifecycle) => serialize(async () => {
    await checkRoot();
    if (!habit.path) throw new Error('Continue this historical habit before changing its schedule.');
    const source = await readNote(habit.path, root); const next = changeHabit(source, habit, change);
    const openRoot = await checkRoot(); await writeNoteScoped(openRoot, habit.path, next, source);
    if (current.current.root === root) onSaved(habit.path, next);
  }), [serialize, checkRoot, onSaved, root]);
  const onPersonalize = useCallback((habit: Habit, style: HabitStyle) => serialize(async () => {
    if (!habit.path || habit.source === undefined) throw new Error('Continue this habit before personalizing it.');
    const openRoot = await checkRoot();
    const next = writeHabitStyle(habit.source, habit, readHabitStyle(style));
    if (next === habit.source) return;
    const styled = readHabit(habit.path, next);
    if (!styled || styled.color !== style.color || styled.icon !== style.icon) throw new Error('Open the habit definition to edit its color or icon.');
    await writeNoteScoped(openRoot, habit.path, next, habit.source);
    if (current.current.root === root) onSaved(habit.path, next);
  }), [serialize, checkRoot, root, onSaved]);
  const onSaveReward = useCallback((habit: Habit, reward: HabitReward) => serialize(async () => {
    if (!habit.path || habit.source === undefined) throw new Error('Continue this habit before editing its XP.');
    const openRoot = await checkRoot();
    const next = changeHabitReward(habit, reward);
    if (next === habit.source) return;
    await writeNoteScoped(openRoot, habit.path, next, habit.source);
    if (current.current.root === root) onSaved(habit.path, next);
  }), [serialize, checkRoot, root, onSaved]);
  const onDelete = useCallback((habit: Habit) => serialize(async () => {
    await checkRoot();
    if (!habit.path || habit.source === undefined || !canDeleteHabit(habit, today())) {
      throw new Error('Only active habits can be deleted.');
    }
    const unsaved = await flushAll();
    if (unsaved.length) throw new Error('Save or recover unsaved notes before deleting a habit.');
    const notes = await readAllNotes();
    const updates = habitDeletionEdits(habit, notes, current.current.dailyPaths ?? new Set());
    const openRoot = await checkRoot();
    const job = trashNoteWithEdits(openRoot, habit.path, habit.source, updates);
    void trackSave(job.then(() => undefined, () => undefined));
    try {
      await job;
    } catch (error) {
      // A second outside edit can prevent rollback. Refresh the displayed notes in that case.
      if (current.current.root === root) await refresh().catch(() => undefined);
      throw error;
    }
    if (current.current.root === root) onDeleted?.(habit.path, updates);
  }), [serialize, checkRoot, root, onDeleted, refresh]);
  const editDay = useCallback((date: Date, habit: Habit, edit: (text: string, fresh: Habit) => string) => serialize(async () => {
    await checkRoot();
    if (!habit.path) throw new Error('Continue this historical habit to track it.');
    const source = await readNote(habit.path, root); const fresh = readHabit(habit.path, source);
    if (!fresh || !habitActive(fresh, date)) throw new Error('This habit is not scheduled on that date. Refresh its schedule.');
    if (fresh.id !== habit.id || fresh.source !== habit.source) throw new Error('The habit definition changed. Reopen it before logging.');
    await checkRoot();
    await changeDay(date, (text) => edit(text, fresh));
  }), [serialize, checkRoot, changeDay, root]);
  const onComplete = (date: Date, habit: Habit, expected: boolean, done: boolean) =>
    editDay(date, habit, (text, fresh) => setHabitCompletion(text, fresh, expected, done));
  const onMeasure = (date: Date, habit: Habit, expected: number | undefined, value: number) =>
    editDay(date, habit, (text, fresh) => setHabitValue(text, fresh, expected, value));
  return { onCreate, onLifecycle, onComplete, onMeasure, onPersonalize, onSaveReward, onDelete };
}
