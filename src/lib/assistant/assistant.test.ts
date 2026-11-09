import { describe, expect, it, vi } from 'vitest';
import { parseNote } from '../frontmatter';
import { DEFAULT_PERIODIC } from '../periodic';
import { parseRecords } from '../cbt';
import { assistantInstructions, currentAssistantContext, routingContext, searchNotes } from './context';
import { addMediaChange, captureLinkChange, replaceExcerpt, safeNotePath, thoughtRecordChange } from './changes';
import { continueRun, parseAgentResponse, startRun, ActionNeedsReview, type AgentPorts } from './agent';
import { DEFAULT_ASSISTANT, assistantPreferencesPatch, vaultAssistantSettings, type AgentRun, type AssistantContext, type ToolCall } from './types';

const context: AssistantContext = {
  root: '/demo-copy', now: new Date(2026, 10, 8, 15, 30), periodic: DEFAULT_PERIODIC,
  settings: { ...DEFAULT_ASSISTANT, enabled: true }, files: [], texts: new Map(),
};
const call: ToolCall = { type: 'function_call', call_id: 'call-1', name: 'add_media', arguments: '{}' };
const response = (text: string) => parseAgentResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });

describe('assistant routing and note changes', () => {
  it('refreshes the daily-note route after midnight even if the main view has not rendered again', () => {
    const next = currentAssistantContext({ ...context, dailyPath: 'Yesterday.md' }, new Date(2026, 10, 9, 0, 30));
    expect(next.dailyPath).toBeUndefined();
    expect(routingContext(next).today).toBe('2026-11-09');
    expect(thoughtRecordChange(next, null, { situation: 'A new day', before: [], distortions: [], balanced: '', after: [] }).path).not.toBe('Yesterday.md');
    expect(() => thoughtRecordChange({ ...next, dailyAmbiguous: true }, null, { situation: 'Ambiguous', before: [], distortions: [], balanced: '', after: [] })).toThrow('Several notes match');
  });
  it('keeps assistant access and profile selection scoped to the chosen vault', () => {
    const settings = { vaults: { work: { complete: true }, personal: { complete: true } } };
    const patch = assistantPreferencesPatch(settings, 'personal', { ...DEFAULT_ASSISTANT, enabled: true, allowChanges: true, profilePath: 'Personal/About me.md' });
    expect(vaultAssistantSettings(patch, 'personal').enabled).toBe(true);
    expect(vaultAssistantSettings(patch, 'work')).toEqual(DEFAULT_ASSISTANT);
    expect(patch).toMatchObject({ vaults: { work: { complete: true }, personal: { complete: true } } });
  });
  it('routes a watched film into the existing library format and preserves the supplied date', () => {
    const change = addMediaChange(context, 'film', { title: 'The Lighthouse Accountant', maker: '', year: '2019', rating: '', genres: ['drama'], date: '2026-11-07', started: '' }, 'Watched with a friend.');
    expect(change.path).toBe('Rating/kino/The Lighthouse Accountant.md');
    expect(change.before).toBeNull();
    expect(parseNote(change.after).properties).toMatchObject({ Watched: '2026-11-07', Year: 2019, Genre: ['drama'] });
    expect(change.after).toContain('Watched with a friend.');
    expect(() => addMediaChange({ ...context, files: [{ path: change.path, kind: 'note' }] }, 'film', { title: 'The Lighthouse Accountant', maker: '', year: '', rating: '', genres: [], date: '', started: '' })).toThrow(/already exists/);
  });
  it('writes CBT into the recognized daily note without inventing feelings afterward or changing prior prose', () => {
    const existing = '---\r\ndate: 2026-11-08\r\n---\r\n# Sunday\r\nKeep [[my notes]]  \r\n';
    const change = thoughtRecordChange({ ...context, dailyPath: 'Journal/Sunday.md' }, existing, { situation: 'I missed a deadline | I feel stuck', before: ['Disappointed'], distortions: [], balanced: '', after: [] });
    expect(change.path).toBe('Journal/Sunday.md');
    expect(change.before).toBe(existing);
    expect(change.after.startsWith(existing)).toBe(true);
    expect(parseRecords(change.after)[0]).toMatchObject({ situation: 'I missed a deadline | I feel stuck', before: ['Disappointed'], balanced: '', after: [] });
    expect(change.after.replaceAll('\r\n', '')).not.toContain('\n');
  });
  it('captures links as ordinary Markdown and refuses existing destinations and unsafe schemes', () => {
    const saved = captureLinkChange(context, 'A useful article', 'https://example.com/story', 'My discussion notes.');
    expect(saved.path).toBe('Inbox/A useful article.md');
    expect(parseNote(saved.after).properties.source).toBe('https://example.com/story');
    expect(() => captureLinkChange(context, 'Bad', 'javascript:alert(1)', '')).toThrow();
    expect(() => captureLinkChange(context, 'Bad', 'https://name:password@example.com', '')).toThrow();
  });
  it.each(['../private.md', '/absolute.md', 'folder/.secret.md', 'folder\\other.md', 'folder//empty.md', 'wrong.base'])('refuses an unsafe assistant note destination: %s', (path) => expect(() => safeNotePath(path)).toThrow());
  it('edits only a uniquely identified excerpt and keeps literal replacement characters', () => {
    const text = 'Before\r\nSelected paragraph\r\nAfter';
    expect(replaceExcerpt(text, 'Selected paragraph', 'Cost: $&\nNext')).toBe('Before\r\nCost: $&\r\nNext\r\nAfter');
    expect(() => replaceExcerpt('same same', 'same', 'other')).toThrow(/more than once/);
    expect(() => replaceExcerpt(text, 'gone', 'other')).toThrow(/missing/);
  });
  it('retrieves bounded relevant context and honors the current-note sharing switch', () => {
    const texts = new Map([['Films.md', 'A film worth revisiting.'], ['Private.md', 'An unrelated journal.'], ['Assistant/Profile.md', 'I prefer short replies.']]);
    const ctx = { ...context, texts, files: [...texts.keys()].map((path) => ({ path, kind: 'note' as const })), currentPath: 'Private.md', settings: { ...context.settings, shareCurrentNote: false } };
    expect(searchNotes(ctx, 'film').map((note) => note.path)).toEqual(['Films.md']);
    expect(assistantInstructions(ctx)).not.toContain('An unrelated journal.');
    expect(assistantInstructions(ctx)).toContain('I prefer short replies.');
    expect(routingContext(ctx).today).toBe('2026-11-08');
    expect(routingContext(ctx).library.film).toBe('Rating/kino');
  });
});

describe('resumable agent actions', () => {
  function setup() {
    let stored: AgentRun | undefined;
    const ports: AgentPorts = {
      respond: vi.fn().mockResolvedValueOnce({ output: [call], calls: [call], text: '' }).mockResolvedValue(response('Added the film.')),
      execute: vi.fn().mockResolvedValue({ value: { path: 'Rating/kino/Film.md' } }),
      checkpoint: vi.fn((run: AgentRun) => { stored = run; return Promise.resolve(); }),
      isCurrentVault: () => true,
    };
    return { ports, stored: () => stored! };
  }
  it('resumes a failed model continuation without executing a successful action again', async () => {
    const { ports, stored } = setup();
    vi.mocked(ports.respond).mockReset().mockResolvedValueOnce({ output: [call], calls: [call], text: '' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(response('Added the film.'));
    await expect(continueRun(startRun(context.root, 'turn', [], 'Add the film'), ports, new AbortController().signal)).rejects.toThrow('Offline');
    expect(stored().completed['call-1']).toContain('Rating/kino/Film.md');
    const done = await continueRun(stored(), ports, new AbortController().signal);
    expect(ports.execute).toHaveBeenCalledTimes(1);
    expect(done.text).toBe('Added the film.');
    expect(done.phase).toBe('complete');
  });
  it('keeps a proposed action pending for review and resumes the same call', async () => {
    const { ports, stored } = setup();
    vi.mocked(ports.execute).mockRejectedValueOnce(new ActionNeedsReview(call, { value: 'Review the film' })).mockResolvedValue({ value: 'Saved' });
    await expect(continueRun(startRun(context.root, 'turn', [], 'Add a film'), ports, new AbortController().signal)).rejects.toBeInstanceOf(ActionNeedsReview);
    expect(stored().pending).toEqual([call]);
    expect(stored().phase).toBe('tools');
    await continueRun(stored(), ports, new AbortController().signal);
    expect(ports.respond).toHaveBeenCalledTimes(2);
  });
  it('stops a repeated failed-tool loop, checkpoints the errors and allows a fresh explicit retry', async () => {
    const { ports, stored } = setup(); let calls = 0;
    vi.mocked(ports.respond).mockReset().mockImplementation(() => {
      const next = { ...call, name: 'capture_link', call_id: `failed-${++calls}` };
      return Promise.resolve({ output: [next], calls: [next], text: '' });
    });
    vi.mocked(ports.execute).mockRejectedValue(new Error('Use a valid URL.'));
    await expect(continueRun(startRun(context.root, 'turn', [], 'Save my record'), ports, new AbortController().signal)).rejects.toThrow('same action failed three times');
    expect(ports.respond).toHaveBeenCalledTimes(3);
    expect(ports.execute).toHaveBeenCalledTimes(3);
    expect(stored().input.filter((item) => item.type === 'function_call_output')).toHaveLength(3);
    vi.mocked(ports.respond).mockResolvedValue(response('Please clarify the destination.'));
    const resumed = await continueRun(stored(), ports, new AbortController().signal);
    expect(resumed.phase).toBe('complete');
    expect(ports.execute).toHaveBeenCalledTimes(3);
  });
  it('stops before tool execution when the user switches vaults during a response', async () => {
    const { ports } = setup(); let current = true;
    ports.isCurrentVault = () => current;
    ports.respond = () => { current = false; return Promise.resolve({ output: [call], calls: [call], text: '' }); };
    await expect(continueRun(startRun(context.root, 'turn', [], 'Add a film'), ports, new AbortController().signal)).rejects.toThrow('vault changed');
    expect(ports.execute).not.toHaveBeenCalled();
  });
  it('records a finished write even if cancellation arrives while it is saving', async () => {
    const { ports, stored } = setup(), abort = new AbortController();
    ports.execute = () => { abort.abort(); return Promise.resolve({ value: 'Saved' }); };
    await expect(continueRun(startRun(context.root, 'turn', [], 'Add a film'), ports, abort.signal)).rejects.toThrow();
    expect(stored().completed['call-1']).toContain('Saved');
  });
  it('does not treat inherited object names as completed action identifiers', async () => {
    const { ports } = setup();
    const special = { ...call, call_id: '__proto__' };
    vi.mocked(ports.respond).mockReset().mockResolvedValueOnce({ output: [special], calls: [special], text: '' }).mockResolvedValue(response('Done'));
    const done = await continueRun(startRun(context.root, 'turn', [], 'Add a film'), ports, new AbortController().signal);
    expect(ports.execute).toHaveBeenCalledOnce();
    expect(Object.hasOwn(done.completed, '__proto__')).toBe(true);
  });
  it('rejects malformed, empty and truncated provider responses', () => {
    for (const value of [null, {}, { output: [] }, { status: 'failed', output: [call] }, { status: 'incomplete', output: [] }, { output: [{ type: 'function_call', name: 'x' }] }, { output: [call, call] }]) expect(() => parseAgentResponse(value)).toThrow();
  });
});
