import { addRecord, type RecordInput } from '../cbt';
import { formatDate } from '../dates';
import { readDay } from '../datePicker';
import { draftProblem, findOverview, KINDS, mediaNoteText, noteFileName, notePath, type MediaDraft, type MediaKind } from '../library';
import { builtInPeriodicText, periodicPath } from '../periodic';
import { lineEnding } from '../text';
import type { AssistantContext, NoteChange } from './types';

/** Defense in depth; the native Vault boundary performs authoritative path checks too. */
export function safeNotePath(path: string): string {
  if (!path || path.length > 1024 || path.includes('\\') || [...path].some((char) => char.charCodeAt(0) < 32) || path.startsWith('/') || !/\.md$/i.test(path) || path.split('/').some((part) => !part || part.startsWith('.'))) throw new Error('Choose a normal Markdown path inside this vault.');
  return path;
}
export function appendText(text: string, addition: string): string {
  const eol = lineEnding(text);
  if (!eol) throw new Error('This note mixes line endings. Its source needs attention before appending.');
  const value = addition.trim();
  if (!value) return text;
  const gap = !text || text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol;
  return text + gap + value.replace(/\r?\n/g, eol) + eol;
}
export function noteChange(context: AssistantContext, path: string, before: string | null, after: string, description: string): NoteChange {
  safeNotePath(path);
  if (after.length > 1_000_000) throw new Error('This change is too large for one assistant action.');
  if (before === null && context.files.some((file) => file.path.normalize('NFC').toLocaleLowerCase() === path.normalize('NFC').toLocaleLowerCase())) throw new Error('A file already exists there. Read it before proposing an edit.');
  return { kind: 'note', root: context.root, path, before, after, description };
}
export function createNoteChange(context: AssistantContext, title: string, text: string, path = ''): NoteChange {
  const name = noteFileName(title);
  if (!name || !text.trim()) throw new Error('Give the new note a title and some content.');
  const folder = context.settings.inboxFolder.replace(/\/$/, '');
  const destination = path || `${folder ? `${folder}/` : ''}${name}.md`;
  return noteChange(context, destination, null, text, `Create ${title.replace(/[\r\n]/g, ' ')}`);
}
export function addMediaChange(context: AssistantContext, kind: MediaKind, draft: MediaDraft, thoughts = ''): NoteChange {
  const spec = KINDS.find((item) => item.kind === kind);
  if (!spec) throw new Error('Choose a supported library kind.');
  const problem = draftProblem(draft);
  if (problem) throw new Error(problem);
  const destination = notePath(spec, draft.title, context.files);
  if (destination.taken) throw new Error('This title already exists in your library. Read its note before changing it.');
  const year = draft.date ? readDay(draft.date)!.getFullYear() : context.now.getFullYear();
  const text = mediaNoteText(spec, draft, { overview: findOverview(spec, context.files, year) });
  return noteChange(context, destination.path, null, thoughts ? appendText(text, thoughts) : text, `Add ${draft.title} to ${spec.tab.toLowerCase()}`);
}
export function captureLinkChange(context: AssistantContext, title: string, url: string, summary: string): NoteChange {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a web link without embedded credentials.');
  const name = noteFileName(title);
  if (!name) throw new Error('Give this link a useful title.');
  const folder = context.settings.inboxFolder.replace(/\/$/, '');
  const path = `${folder ? `${folder}/` : ''}${name}.md`;
  const text = `---\nsource: ${JSON.stringify(parsed.href)}\ncaptured: ${formatDate(context.now, 'YYYY-MM-DD')}\n---\n\n# ${title.replace(/[\r\n]/g, ' ')}\n\n${summary.trim()}\n`;
  return noteChange(context, path, null, text, `Save ${title} in ${folder || 'your vault'}`);
}
export function thoughtRecordChange(context: AssistantContext, before: string | null, record: RecordInput): NoteChange {
  if (context.dailyAmbiguous) throw new Error('Several notes match today. Choose the daily note in Periodic notes settings before saving this thought record.');
  if (!record.situation.trim()) throw new Error('Describe the situation before saving a thought record.');
  const path = context.dailyPath ?? periodicPath('day', context.now, context.periodic);
  const text = before ?? builtInPeriodicText('day', context.now);
  return noteChange(context, path, before, addRecord(text, record, formatDate(context.now, 'HH:mm')), 'Save this thought record in today’s note');
}
export function replaceExcerpt(text: string, before: string, after: string): string {
  if (!before || text.indexOf(before) < 0 || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('The selected passage is missing or appears more than once. Read the note again and choose a unique passage.');
  const eol = lineEnding(text);
  if (!eol) throw new Error('This note mixes line endings.');
  return text.replace(before, () => after.replace(/\r?\n/g, eol));
}
