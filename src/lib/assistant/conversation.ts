import { object, responseItem, type AgentRun, type AssistantChange, type ChatMessage, type ResponseItem, type ToolCall, type ToolResult } from './types';
export interface ConversationAction {
  id: string; call: ToolCall; result: ToolResult; change: AssistantChange;
  status: 'review' | 'approved' | 'saved' | 'failed' | 'declined'; error?: string;
}
export interface Conversation {
  id: string; root: string; title: string; updated: string; draft: string;
  messages: ChatMessage[]; history: ResponseItem[]; actions: ConversationAction[]; run?: AgentRun;
}
export interface ConversationSummary { id: string; title: string; updated: string; error?: boolean }
export function newConversation(root: string): Conversation {
  return { id: crypto.randomUUID(), root, title: 'New conversation', updated: new Date().toISOString(), draft: '', messages: [], history: [], actions: [] };
}
const string = (value: unknown): value is string => typeof value === 'string';
function validCall(value: unknown): value is ToolCall {
  const item = object(value);
  return item.type === 'function_call' && string(item.call_id) && string(item.name) && string(item.arguments);
}
function validArtwork(value: unknown): boolean {
  if (value === undefined) return true;
  const artwork = object(value);
  return string(artwork.url) && string(artwork.path) && string(artwork.embed) && artwork.url.length <= 8000 && artwork.path.length <= 1024 && artwork.embed.length <= 1200;
}
function validChange(value: unknown, root: string): value is AssistantChange {
  const item = object(value);
  return item.root === root && string(item.description) && (item.kind === 'note' ? validArtwork(item.artwork) && string(item.path) && (item.before === null || string(item.before)) && string(item.after) : item.kind === 'calendar' && (item.avoidConflicts === undefined || typeof item.avoidConflicts === 'boolean') && string(item.calendar) && string(item.title) && typeof item.start === 'number' && Number.isFinite(item.start) && typeof item.end === 'number' && Number.isFinite(item.end) && (item.notes === undefined || string(item.notes)));
}
function validSources(value: unknown): boolean {
  return value === undefined || Array.isArray(value) && value.length <= 20 && value.every((raw) => { const source = object(raw); return string(source.title) && string(source.url) && /^https?:\/\//i.test(source.url); });
}
/** Never convert damaged persisted conversations into an empty thread that could overwrite them. */
export function parseConversation(value: unknown, root: string, id: string): { revision: number; state: Conversation } {
  const envelope = object(value), state = object(envelope.state);
  const invalid = () => { throw new Error('This conversation is unreadable. Its saved file has been preserved.'); };
  if (typeof envelope.revision !== 'number' || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1 || state.root !== root || state.id !== id || !string(state.title) || !string(state.updated) || !string(state.draft)) return invalid();
  if (!Array.isArray(state.messages) || !Array.isArray(state.history) || !Array.isArray(state.actions)) return invalid();
  for (const raw of state.messages) {
    const message = object(raw);
    if (!string(message.id) || !['user', 'assistant'].includes(String(message.role)) || !string(message.text) || !string(message.created)) return invalid();
    if (!validSources(message.sources)) return invalid();
  }
  state.history.forEach(responseItem);
  for (const raw of state.actions) {
    const action = object(raw);
    if (!string(action.id) || !validCall(action.call) || !validChange(action.change, root) || !['review', 'approved', 'saved', 'failed', 'declined'].includes(String(action.status)) || (action.error !== undefined && !string(action.error))) return invalid();
    const result = object(action.result);
    if (result.openCalendar !== undefined && (typeof result.openCalendar !== 'number' || !Number.isFinite(result.openCalendar)) || result.openPath !== undefined && !string(result.openPath) || result.openCbt !== undefined && typeof result.openCbt !== 'boolean' || result.startCbt !== undefined && typeof result.startCbt !== 'boolean' || result.change !== undefined && !validChange(result.change, root)) return invalid();
  }
  if (state.run !== undefined) {
    const run = object(state.run);
    if (!string(run.id) || run.root !== root || !string(run.text) || !Array.isArray(run.input) || !Array.isArray(run.pending) || !run.pending.every(validCall) || !['ready', 'tools', 'complete'].includes(String(run.phase)) || typeof run.rounds !== 'number' || !Number.isInteger(run.rounds) || run.rounds < 0 || run.rounds > 12) return invalid();
    run.input.forEach(responseItem);
    if (!validSources(run.sources) || new Set(run.pending.map((call) => object(call).call_id)).size !== run.pending.length) return invalid();
    if (run.historyLength !== undefined && (typeof run.historyLength !== 'number' || !Number.isInteger(run.historyLength) || run.historyLength < 0 || run.historyLength > run.input.length)) return invalid();
    if (!Object.values(object(run.completed)).every(string)) return invalid();
  }
  return { revision: envelope.revision, state: state as unknown as Conversation };
}
export function parseConversationList(value: unknown): ConversationSummary[] {
  if (!Array.isArray(value)) throw new Error('Conversation history is unavailable.');
  return value.map((raw) => { const item = object(raw); if (!string(item.id) || !string(item.title) || !string(item.updated)) throw new Error('Conversation history is unreadable.'); return { id: item.id, title: item.title, updated: item.updated, error: item.error === true }; });
}
/** Trim model context at user-turn boundaries, while retaining the complete stored history. */
export function recentContext(history: ResponseItem[]): ResponseItem[] {
  const starts = history.flatMap((item, index) => item.role === 'user' ? [index] : []);
  for (const start of starts.slice(-8)) {
    const slice = history.slice(start);
    if (slice.length <= 240 && JSON.stringify(slice).length <= 300_000) return slice;
  }
  return [];
}
export function stoppedRun(run: AgentRun): AgentRun {
  const outputs = run.pending.map((call) => ({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ cancelled: true, message: 'The user stopped this action.' }) }));
  return { ...run, pending: [], input: [...run.input, ...outputs], phase: 'complete', text: run.text ? `${run.text}\n\nStopped.` : 'Stopped.' };
}

/** Human-readable recovery/export; never include API credentials or opaque provider reasoning. */
export function conversationMarkdown(thread: Conversation): string {
  const quote = (text: string) => text.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  const code = (text: string) => { const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1))); return `${fence}markdown\n${text}\n${fence}`; };
  const lines = [`# ${thread.title.replace(/[\r\n]/g, ' ')}`, '', 'Conversation with Spike', ''];
  for (const message of thread.messages) {
    lines.push(`## ${message.role === 'user' ? 'You' : 'Spike'} · ${message.created}`, '', quote(message.text), '');
    for (const source of message.sources ?? []) lines.push(`Source: ${source.title} — ${source.url}`, '');
  }
  if (thread.draft) lines.push('## Unsent draft', '', quote(thread.draft), '');
  if (thread.run?.text && !thread.messages.some((message) => message.id === thread.run?.id)) lines.push('## In-progress reply', '', quote(thread.run.text), '');
  if (thread.actions.length) lines.push('## Actions', '');
  for (const action of thread.actions) {
    lines.push(`### ${action.change.description.replace(/[\r\n]/g, ' ')}`, '', `Status: ${action.status}`, '');
    if (action.error) lines.push(quote(action.error), '');
    if (action.change.kind === 'note') {
      lines.push(`Note: ${action.change.path}`, '');
      if (action.status !== 'saved') {
        if (action.change.before !== null) lines.push('Original text read by this action:', '', code(action.change.before), '');
        lines.push('Proposed text (check the note to confirm what was saved):', '', code(action.change.after), '');
      }
    } else lines.push(`Event: ${action.change.title}`, `${new Date(action.change.start).toISOString()} → ${new Date(action.change.end).toISOString()}`, quote(action.change.notes ?? ''), '');
  }
  return lines.join('\n');
}
