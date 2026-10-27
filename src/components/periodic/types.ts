import type { RecordInput, ThoughtRecord } from '../../lib/cbt';
import type { MediaItem } from '../../lib/media';
import type { Period } from '../../lib/periodic';
import type { Quest, QuestEntry } from '../../lib/quests';
import type { DayEntry } from '../../lib/rollup';

/** What a periodic page reads besides its own note. Built by App from the vault; nothing in the note is code. */
export interface PeriodicSpec {
  period: Period;
  /** The day, the week's Monday or the month's first day. */
  date: Date;
  /** The day behind a date: its note, if it has one, and what the note holds. */
  dayOf: (date: Date) => DayEntry;
  /** The weekly note of the week that starts that Monday, and its text. */
  weekOf: (monday: Date) => { path?: string; text?: string };
  exists: (period: Period, date: Date) => boolean;
  /** What each daily number is out of (5, 10 or 100), read from every day that logged it. */
  scales: Record<string, number>;
  /** Rated albums and films by title, for their covers. */
  media: ReadonlyMap<string, MediaItem>;
  /** The task categories the vault uses, most used first. */
  categories: string[];
  /** Every weekly, monthly and mythic quest in the vault. */
  quests: QuestEntry[];
  /** The art file for a quest, if the vault has one. */
  art: (quest: Quest) => string | undefined;
}

export interface PeriodicActions {
  /** Opens the note of that day, week or month, or creates it from its template. */
  onOpenPeriod: (period: Period, date: Date) => void;
  onOpenNote: (path: string) => void;
  onEdit: () => void;
  /** Ticks or unticks the task or habit on that line, if it is still as it was shown. */
  onToggle: (task: { line: number; done: boolean }) => void;
  onSetProperty: (key: string, value: string) => void;
  onAddTask: (category: string, words: string, minutes?: number) => void;
  /** The day's summary, the text of its `[!tldr]` callout. */
  onSetSummary: (summary: string) => void;
  /** Thought records in the day's stream: a new row, a rewritten row, a row taken out. */
  onAddRecord: (input: RecordInput) => void;
  onUpdateRecord: (record: ThoughtRecord, input: RecordInput) => void;
  onDeleteRecord: (record: ThoughtRecord) => void;
  /** Quests live in their own notes; these write there. */
  onQuestToggle: (quest: Quest) => void;
  onQuestProgress: (quest: Quest, value: number) => void;
}
