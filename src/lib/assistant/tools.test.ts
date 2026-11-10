import { withSavedCover } from './changes';
import { parseNote } from '../frontmatter';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PERIODIC } from '../periodic';
import { DEFAULT_ASSISTANT, type AssistantContext, type ToolCall } from './types';
import { createToolHandler, type AssistantToolPorts } from './tools';
const context: AssistantContext = { root: '/copy', now: new Date(2026, 10, 8, 12), periodic: DEFAULT_PERIODIC, settings: DEFAULT_ASSISTANT, files: [{ path: 'Keep.md', kind: 'note' }], texts: new Map([['Keep.md', 'Original text.']]) };
const call = (name: string, args: unknown): ToolCall => ({ type: 'function_call', call_id: 'call', name, arguments: JSON.stringify(args) });
const signal = () => new AbortController().signal;
function setup() {
  const ports: AssistantToolPorts = { context: () => context, readNote: vi.fn().mockResolvedValue('Original text.'), lookupMedia: vi.fn().mockResolvedValue([]), listCalendars: vi.fn().mockResolvedValue([{ id: 'personal', title: 'Personal', writable: true }]), listEvents: vi.fn().mockResolvedValue([]) };
  return { ports, execute: createToolHandler('/copy', ports) };
}
it('requires reading the exact current note before proposing a change and refuses an outside edit', async () => {
  const { execute, ports } = setup();
  await expect(execute(call('append_note', { path: 'Keep.md', text: 'New thought.' }), signal())).rejects.toThrow('Read this note');
  await execute(call('read_note', { path: 'Keep.md' }), signal());
  const proposal = await execute(call('append_note', { path: 'Keep.md', text: 'New thought.' }), signal());
  expect(proposal.change).toMatchObject({ before: 'Original text.', after: 'Original text.\n\nNew thought.\n', root: '/copy' });
  vi.mocked(ports.readNote).mockResolvedValue('Outside edit.');
  await expect(execute(call('append_note', { path: 'Keep.md', text: 'More.' }), signal())).rejects.toThrow('changed since');
});
it('routes CBT to today and memory to the configured profile as proposals, without performing writes', async () => {
  const { execute } = setup();
  const thought = await execute(call('save_thought_record', { situation: 'I missed something.', before: ['Sad'], distortions: [], balanced: '', after: [] }), signal());
  expect(thought.change).toMatchObject({ kind: 'note', before: null });
  expect(thought.openCbt).toBe(true);
  const memory = await execute(call('remember', { text: 'I prefer short replies.' }), signal());
  expect(memory.change).toMatchObject({ path: 'Assistant/Profile.md', before: null });
});
it('prepares an ordinary note in the configured inbox and preserves exact Markdown', async () => {
  const { execute, ports } = setup();
  ports.context = () => ({ ...context, settings: { ...context.settings, inboxFolder: 'Notes/Capture' } });
  const text = '---\r\ntags: [idea]\r\n---\r\n\r\n# An idea\r\n\r\nKeep [[Keep]] and spaces  \r\n';
  const result = await execute(call('create_note', { title: 'An idea', path: '', text }), signal());
  expect(result).toMatchObject({ change: { kind: 'note', root: '/copy', path: 'Notes/Capture/An idea.md', before: null, after: text }, openPath: 'Notes/Capture/An idea.md' });
  expect(ports.readNote).not.toHaveBeenCalled();
  const selected = await execute(call('create_note', { title: 'An idea', path: 'Projects/Draft.md', text }), signal());
  expect(selected.change).toMatchObject({ path: 'Projects/Draft.md', before: null, after: text });
});
it('refuses existing, hidden or outside destinations and empty new notes', async () => {
  const { execute } = setup();
  for (const path of ['Keep.md', 'keep.MD', '../Outside.md', '/Outside.md', '.private/Note.md']) {
    await expect(execute(call('create_note', { title: 'An idea', path, text: 'Keep this thought.' }), signal())).rejects.toThrow();
  }
  await expect(execute(call('create_note', { title: 'An idea', path: '', text: '  ' }), signal())).rejects.toThrow('content');
});
it('requires a known writable calendar and timezone-qualified event times', async () => {
  const { execute } = setup();
  const event = { calendar: 'personal', title: 'Read', start: '2026-11-08T18:00:00+03:00', end: '2026-11-08T19:00:00+03:00', notes: '' };
  await expect(execute(call('create_event', event), signal())).rejects.toThrow('List calendars');
  await execute(call('list_calendars', {}), signal());
  expect((await execute(call('create_event', event), signal())).change).toMatchObject({ kind: 'calendar', title: 'Read' });
  await expect(execute(call('create_event', { ...event, start: '2026-11-08T18:00:00' }), signal())).rejects.toThrow('timezone');
});
it('rejects unknown tools, hidden paths and malformed arguments before any I/O', async () => {
  const { execute, ports } = setup();
  await expect(execute(call('run_shell', { command: 'anything' }), signal())).rejects.toThrow('Unknown');
  await expect(execute(call('read_note', { path: '../outside.md' }), signal())).rejects.toThrow('inside this vault');
  await expect(execute(call('read_note', { path: 'Keep.md', extra: true }), signal())).rejects.toThrow('schema');
  expect(ports.readNote).not.toHaveBeenCalled();
});
it('ignores a slow lookup after switching vaults', async () => {
  const { execute, ports } = setup();
  ports.lookupMedia = () => { ports.context = () => ({ ...context, root: '/other' }); return Promise.resolve([]); };
  await expect(execute(call('lookup_media', { kind: 'film', query: 'A film' }), signal())).rejects.toThrow('vault changed');
});

it('uses only a selected catalogue result for a cover, preserving the supplied date, rating and comments', async () => {
  const { execute, ports } = setup();
  const result = { id: 'wiki:film-1', title: 'A Film', maker: 'A Director', year: '2024', genres: ['drama'], cover: 'https://upload.wikimedia.org/a-film.jpg' };
  vi.mocked(ports.lookupMedia).mockResolvedValue([result]);
  const args = { id: `film:${result.id}`,  date: '2026-11-07', rating: '90', thoughts: 'I liked the cinematography. It is about memory. Cost: $&.' };
  await expect(execute(call('add_lookup_media', args), signal())).rejects.toThrow('Look up');
  await execute(call('lookup_media', { kind: 'film', query: 'A Film' }), signal());
  const proposal = await execute(call('add_lookup_media', args), signal());
  if (proposal.change?.kind !== 'note') throw new Error('Expected a Library note');
  expect(proposal.openPath).toBe(proposal.change.path);
  expect(proposal.change.artwork).toMatchObject({ url: result.cover, path: 'Rating/kino/_attachments/a-film.jpg' });
  const saved = withSavedCover(proposal.change, 'Rating/kino/_attachments/a-film.png');
  expect(saved).toContain('![[Rating/kino/_attachments/a-film.png|');
  expect(saved).toContain(args.thoughts);
  expect(parseNote(saved).properties).toMatchObject({ Watched: '2026-11-07', Rating: 90 });
  const change = proposal.change, embed = change.artwork!.embed;
  expect(() => withSavedCover({ ...change, after: change.after + embed }, 'cover.png')).toThrow('ambiguous');
  await expect(execute(call('add_lookup_media', { ...args, id: 'https://outside.invalid/arbitrary.png' }), signal())).rejects.toThrow('Look up');
});
it('keeps entries without a catalogue cover usable and rejects an unsafe artwork address', async () => {
  const { execute, ports } = setup();
  vi.mocked(ports.lookupMedia).mockResolvedValue([{ id: 'manual', title: 'Coverless Film', genres: [] }]);
  await execute(call('lookup_media', { kind: 'film', query: 'Coverless Film' }), signal());
  const noCover = await execute(call('add_lookup_media', { id: 'film:manual', date: '', rating: '', thoughts: '' }), signal());
  expect(noCover.change).not.toHaveProperty('artwork');
  vi.mocked(ports.lookupMedia).mockResolvedValue([{ id: 'unsafe', title: 'Unsafe Film', genres: [], cover: 'http://localhost/private' }]);
  await execute(call('lookup_media', { kind: 'film', query: 'Unsafe Film' }), signal());
  await expect(execute(call('add_lookup_media', { id: 'film:unsafe', date: '', rating: '', thoughts: '' }), signal())).rejects.toThrow('unsupported cover');
});
