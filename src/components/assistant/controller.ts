import * as api from '../../lib/api';
import { ActionNeedsReview, continueRun, parseAgentResponse, startRun } from '../../lib/assistant/agent';
import { assistantInstructions } from '../../lib/assistant/context';
import { conversationMarkdown, newConversation, parseConversation, parseConversationList, recentContext, stoppedRun, type Conversation, type ConversationAction, type ConversationSummary } from '../../lib/assistant/conversation';
import { ASSISTANT_TOOLS, createToolHandler } from '../../lib/assistant/tools';
import type { AgentRun, AssistantContext, AssistantProvider, ToolCall, ToolResult } from '../../lib/assistant/types';
import { KINDS, noteFileName } from '../../lib/library';
import { parseSearch, readDetails, searchRequests, type Service } from '../../lib/lookup';
import { trackSave } from '../../lib/saving';

export interface AssistantHost {
  context: () => AssistantContext;
  onSaved: (path: string, text: string) => void;
  onOpen: (path: string, cbt?: boolean) => void;
  onRefresh: () => Promise<void>;
  onReply?: (text: string) => void;
}
export interface AssistantSnapshot {
  thread: Conversation; conversations: ConversationSummary[];
  loaded: boolean; configured: boolean; busy: boolean; switching: boolean; progress?: string; error?: string; notice?: string;
}
const reason = (error: unknown) => error instanceof Error ? error.message : String(error);
const PROGRESS: Record<string, string> = { read_note: 'Reading a note', search_notes: 'Finding relevant notes', lookup_media: 'Looking up the title', save_thought_record: 'Preparing your thought record', add_media: 'Preparing a library entry', remember: 'Updating your profile', list_calendars: 'Reading your calendars', list_events: 'Checking your calendar' };

/** Owns drafts outside the sidebar's rendering boundary. Only this main-window controller runs tools. */
export class AssistantController {
  private snapshot: AssistantSnapshot;
  private listeners = new Set<() => void>();
  private revisions = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private abort?: AbortController;
  private alive = false;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private connectionGeneration = 0;
  private provider: AssistantProvider;
  private exported?: string;
  private executeTool: ReturnType<typeof createToolHandler>;
  constructor(readonly root: string, private host: AssistantHost) {
    this.provider = host.context().settings.provider;
    this.snapshot = { thread: newConversation(root), conversations: [], configured: false, loaded: false, busy: false, switching: false };
    this.executeTool = createToolHandler(root, {
      context: () => this.context(), readNote: api.assistantReadNote,
      lookupMedia: async (kind, query) => {
        const source = KINDS.find((spec) => spec.kind === kind)?.source;
        if (!source) return [];
        const answers: Partial<Record<Service, unknown>> = {};
        const results = await Promise.allSettled(searchRequests(source, query).map(async ({ service, url }) => { answers[service] = await api.lookupJson(url); }));
        if (results.every((result) => result.status === 'rejected') && results.length) throw new Error('The catalogue is unavailable. You can still enter this title manually.');
        const found = parseSearch(source, answers).slice(0, 8);
        return Promise.all(found.map((result) => readDetails(result, api.lookupJson).catch(() => result)));
      },
      listCalendars: async () => {
        const access = await api.calendarAccess();
        if (access !== 'allowed' && await api.requestCalendarAccess() !== 'allowed') throw new Error('Calendar access is unavailable. Enable it in macOS settings to schedule with Spike.');
        return api.listCalendars();
      },
      listEvents: api.calendarEvents,
      searchConversations: (root, query) => api.assistantSearchChats(root, query, this.snapshot.thread.messages.at(-1)?.id),
    });
  }
  getSnapshot = () => this.snapshot;
  updateHost = (host: AssistantHost) => {
    this.host = host;
    if (this.provider !== host.context().settings.provider) {
      this.provider = host.context().settings.provider;
      this.stop(); this.update({ configured: false });
      if (this.alive) void this.checkConnection().catch((error: unknown) => this.update({ notice: reason(error) }));
    }
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AssistantSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private context() { if (!this.alive || this.host.context().root !== this.root) throw new Error('The vault changed.'); return this.host.context(); }
  private active(signal?: AbortSignal) { signal?.throwIfAborted(); const context = this.context(); if (!context.settings.enabled || !this.snapshot.configured) throw new Error('Spike is switched off or disconnected. Enable the connection before continuing.'); }
  mount = () => { this.alive = true; void this.load(); };
  destroy = () => { this.alive = false; this.generation++; this.connectionGeneration++; this.abort?.abort(); clearTimeout(this.draftTimer); void this.flush().catch(() => undefined); };
  load = async () => {
    const generation = ++this.generation;
    const connectionGeneration = ++this.connectionGeneration;
    try {
      const [connection, raw] = await Promise.all([api.assistantConnection(this.host.context().settings.provider).then((value) => ({ ...value, problem: undefined as string | undefined })).catch((error: unknown) => ({ configured: false, problem: reason(error) })), api.assistantListChats(this.root)]);
      if (!this.alive || generation !== this.generation) return;
      const conversations = parseConversationList(raw);
      this.update({ conversations, ...(connectionGeneration === this.connectionGeneration ? { configured: connection.configured, notice: connection.problem } : {}) });
      for (const latest of conversations.filter((item) => !item.error)) {
        try {
          const saved = parseConversation(await api.assistantLoadChat(this.root, latest.id), this.root, latest.id);
          if (!this.alive || generation !== this.generation) return;
          this.revisions.set(latest.id, saved.revision); this.update({ thread: saved.state }); break;
        } catch {
          if (!this.alive || generation !== this.generation) return;
          this.update({ conversations: this.snapshot.conversations.map((item) => item.id === latest.id ? { ...item, error: true } : item), error: 'A saved conversation could not be opened. Its file is preserved; your other conversations are available.' });
        }
      }
      if (this.alive && generation === this.generation) this.update({ loaded: true });
    } catch (error) { if (this.alive && generation === this.generation) this.update({ error: reason(error), loaded: false }); }
  };
  checkConnection = async (provider: AssistantProvider = this.host.context().settings.provider) => {
    const generation = ++this.connectionGeneration;
    const connection = await api.assistantConnection(provider);
    if (this.alive && generation === this.connectionGeneration && provider === this.provider) { this.stop(); this.update({ configured: connection.configured, notice: undefined }); }
  };
  clearError = () => this.update({ error: undefined });
  setDraft = (draft: string) => {
    if (!this.snapshot.loaded || this.snapshot.switching) return;
    this.update({ thread: { ...this.snapshot.thread, draft } });
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => void this.persist().catch((error: unknown) => this.update({ error: reason(error) })), 400);
  };
  private persist(state = this.snapshot.thread): Promise<void> {
    clearTimeout(this.draftTimer);
    const saved = structuredClone({ ...state, updated: new Date().toISOString() });
    const job = this.queue.catch(() => undefined).then(async () => {
      const revision = await api.assistantSaveChat(this.root, saved.id, saved, this.revisions.get(saved.id) ?? 0);
      this.revisions.set(saved.id, revision);
      if (this.snapshot.thread.id === saved.id) {
        const conversations = [{ id: saved.id, title: saved.title, updated: saved.updated }, ...this.snapshot.conversations.filter((item) => item.id !== saved.id)];
        this.update({ conversations });
      }
    });
    this.queue = job;
    void trackSave(job.then(() => undefined, () => 'Spike conversation'));
    return job;
  }
  flush = async () => { if (this.snapshot.loaded) await this.persist(); else await this.queue; };
  newChat = async () => {
    if (this.snapshot.busy || this.snapshot.switching) return;
    this.update({ switching: true });
    try {
      try { await this.flush(); } catch (error) { if (this.exported !== JSON.stringify(this.snapshot.thread)) throw error; }
      this.update({ thread: newConversation(this.root), error: undefined }); this.exported = undefined; await this.persist();
    }
    catch (error) { this.update({ error: reason(error) }); }
    finally { this.update({ switching: false }); }
  };
  select = async (id: string) => {
    if (this.snapshot.busy || this.snapshot.switching) return;
    this.update({ switching: true });
    try {
      if (this.snapshot.loaded) await this.flush();
      const saved = parseConversation(await api.assistantLoadChat(this.root, id), this.root, id);
      if (!this.alive) return;
      this.revisions.set(id, saved.revision); this.update({ thread: saved.state, error: undefined });
    } catch (error) { this.update({ error: reason(error) }); throw error; }
    finally { this.update({ switching: false }); }
  };
  send = async (text = this.snapshot.thread.draft) => {
    if (this.snapshot.busy || this.snapshot.switching || !text.trim()) return;
    if (!this.snapshot.loaded || !this.snapshot.configured || !this.context().settings.enabled) { this.update({ error: 'Connect and enable Spike before sending a message.' }); return; }
    if (this.snapshot.thread.run && this.snapshot.thread.run.phase !== 'complete') { this.update({ error: 'Resume or finish the interrupted turn before sending another message.' }); return; }
    try {
      const thread = this.snapshot.thread, run = startRun(this.root, crypto.randomUUID(), recentContext(thread.history), text);
      const next = { ...thread, draft: '', title: thread.messages.length ? thread.title : text.trim().slice(0, 70), messages: [...thread.messages, { id: crypto.randomUUID(), role: 'user' as const, text, created: new Date().toISOString() }], run };
      this.update({ thread: next, error: undefined, busy: true }); await this.persist(); await this.run(run);
    } catch (error) { this.update({ error: reason(error), busy: false }); }
  };
  /** A durable handoff from the quick prompt; retries acknowledge an existing turn, never replay it. */
  acceptQuickPrompt = async (id: string, text: string) => {
    this.active();
    if (!this.snapshot.loaded) throw new Error('The conversation is still loading. Retry in a moment.');
    if (this.snapshot.thread.messages.some((message) => message.id === id)) { await this.flush(); return; }
    if (this.snapshot.busy || this.snapshot.switching) throw new Error('Spike is finishing another request. Your prompt is retained.');
    this.update({ switching: true });
    try {
      if (await api.assistantHasMessage(this.root, id)) return;
      this.active();
      if (this.snapshot.thread.run && this.snapshot.thread.run.phase !== 'complete') throw new Error('Open the conversation to review or finish the previous turn, then retry this prompt.');
      const thread = this.snapshot.thread, run = startRun(this.root, crypto.randomUUID(), recentContext(thread.history), text);
      this.update({ busy: true, switching: false, error: undefined, thread: { ...thread, title: thread.messages.length ? thread.title : text.trim().slice(0, 70), messages: [...thread.messages, { id, role: 'user', text, created: new Date().toISOString() }], run } });
      await this.persist();
      // Acknowledge only after saving the user message. Actions retain the ordinary review path.
      void this.run(run).catch((error: unknown) => this.update({ error: reason(error), busy: false }));
    } catch (error) { this.update({ error: reason(error), busy: false }); throw error; }
    finally { this.update({ switching: false }); }
  };
  receiveVoice = async (text: string) => {
    this.active();
    if (this.snapshot.switching || !this.snapshot.loaded) throw new Error('The conversation is switching. Retry your recording when it is ready.');
    this.setDraft([this.snapshot.thread.draft.trim(), text.trim()].filter(Boolean).join('\n'));
    await this.flush();
    if (!this.snapshot.busy && (!this.snapshot.thread.run || this.snapshot.thread.run.phase === 'complete')) void this.send();
  };
  exportConversation = async () => {
    if (this.snapshot.busy || this.snapshot.switching) return;
    this.update({ switching: true, notice: undefined });
    const state = structuredClone(this.snapshot.thread);
    try {
      const name = `${noteFileName(state.title).slice(0, 80) || 'Spike conversation'}-${state.id.slice(0, 8)}.md`;
      const destination = await api.assistantExportChat(name, conversationMarkdown(state));
      if (destination) { this.exported = JSON.stringify(state); this.update({ notice: 'Conversation exported, including your unsent draft and any unresolved changes.' }); }
    } catch (error) { this.update({ error: reason(error) }); }
    finally { this.update({ switching: false }); }
  };
  resume = async () => { const run = this.snapshot.thread.run; if (run && run.phase !== 'complete' && !this.snapshot.busy) await this.run(run); };
  stop = () => { this.abort?.abort(); };
  private async finish(run: AgentRun) {
    const thread = this.snapshot.thread;
    const message = { id: run.id, role: 'assistant' as const, text: run.text || 'Done.', created: new Date().toISOString(), sources: run.sources };
    const history = thread.messages.some((item) => item.id === run.id) ? thread.history : [...thread.history, ...run.input.slice(run.historyLength ?? 0)];
    this.update({ thread: { ...thread, run, history, messages: [...thread.messages.filter((item) => item.id !== run.id), message] } });
    await this.persist();
  }
  finishInterrupted = async () => {
    if (this.snapshot.busy || !this.snapshot.thread.run) return;
    try { await this.finish(stoppedRun(this.snapshot.thread.run)); this.update({ error: undefined }); }
    catch (error) { this.update({ error: reason(error) }); }
  };
  private async run(initial: AgentRun) {
    this.active(); const abort = new AbortController(); this.abort = abort;
    this.update({ busy: true, error: undefined, progress: 'Thinking' });
    try {
      const done = await continueRun(initial, {
        isCurrentVault: (root) => this.alive && root === this.host.context().root,
        respond: async (input, signal) => {
          this.active(signal); this.update({ progress: 'Thinking' });
          const context = this.context();
          const raw = await api.assistantRespond({ provider: context.settings.provider, model: context.settings.model, instructions: assistantInstructions(context), input, tools: [...ASSISTANT_TOOLS, { type: 'web_search' }] }, signal);
          this.active(signal); return parseAgentResponse(raw);
        },
        execute: (call, signal) => this.execute(call, signal),
        checkpoint: async (run) => { this.update({ thread: { ...this.snapshot.thread, run } }); await this.persist(); },
      }, abort.signal);
      await this.finish(done);
      if (this.alive) this.host.onReply?.(done.text);
    } catch (error) {
      if (error instanceof ActionNeedsReview) this.update({ progress: 'Ready for your review' });
      else if (abort.signal.aborted) {
        // Keep an unmounted vault's pending run resumable; a visible Stop ends this turn.
        if (this.alive && this.snapshot.thread.run) await this.finish(stoppedRun(this.snapshot.thread.run)).catch((failure: unknown) => this.update({ error: reason(failure) }));
      } else this.update({ error: reason(error) });
    } finally { this.update({ busy: false, progress: undefined }); this.abort = undefined; }
  }
  private action(change: ConversationAction) {
    this.update({ thread: { ...this.snapshot.thread, actions: [...this.snapshot.thread.actions.filter((item) => item.id !== change.id), change] } });
  }
  private async execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    this.active(signal); this.update({ progress: PROGRESS[call.name] ?? 'Working on your request' });
    const id = `${this.snapshot.thread.run!.id}:${call.call_id}`;
    let entry = this.snapshot.thread.actions.find((action) => action.id === id);
    const result = entry ? entry.result : await this.executeTool(call, signal);
    this.active(signal);
    if (result.change) {
      if (!entry) {
        entry = { id, call, result, change: result.change, status: this.context().settings.allowChanges ? 'approved' : 'review' };
        this.action(entry);
        try { await this.persist(); } catch (error) { this.action({ ...entry, status: 'failed', error: reason(error) }); throw new ActionNeedsReview(call, result); }
      }
      if (entry.status === 'review' || entry.status === 'failed') throw new ActionNeedsReview(call, result);
      if (entry.status === 'declined') return { value: 'The user declined this change.' };
      if (entry.status !== 'saved') {
        this.active(signal);
        let written = false;
        try {
          const change = entry.change;
          if (change.kind === 'note') {
            await api.assistantApplyNote({ id, root: this.root, path: change.path, before: change.before, after: change.after });
            if (this.alive) this.host.onSaved(change.path, change.after);
          } else await api.assistantApplyCalendar({ id, root: this.root, calendar: change.calendar, title: change.title, start: change.start, end: change.end, notes: change.notes });
          written = true;
          this.action({ ...entry, status: 'saved', error: undefined }); await this.persist();
        } catch (error) {
          this.action({ ...entry, status: written ? 'saved' : 'failed', error: reason(error) });
          this.update({ error: written ? 'Your change was saved, but the conversation could not be saved. Resume once storage is available.' : reason(error) });
          await this.persist().catch(() => undefined);
          throw new ActionNeedsReview(call, result);
        }
      }
      if (this.alive && !signal.aborted) {
        if (result.openPath) this.host.onOpen(result.openPath, result.openCbt);
        // A refresh failure must not turn a confirmed save into a repeatable failed write.
        await this.host.onRefresh().catch(() => this.update({ error: 'Your change was saved. Refresh the vault to see its latest state.' }));
      }
      return { value: { saved: true, description: entry.change.description, path: entry.change.kind === 'note' ? entry.change.path : undefined } };
    }
    if (result.openPath) this.host.onOpen(result.openPath, result.openCbt);
    return result;
  }
  review = async (id: string, accept: boolean) => {
    if (this.snapshot.busy) return;
    const entry = this.snapshot.thread.actions.find((item) => item.id === id);
    if (!entry || entry.status === 'saved') return;
    try { if (!accept && entry.status === 'failed') await api.assistantAbandonAction(this.root, id); this.action({ ...entry, status: accept ? 'approved' : 'declined' }); await this.persist(); await this.resume(); }
    catch (error) { this.update({ error: reason(error) }); }
  };
}
