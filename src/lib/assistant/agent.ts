import type { AgentResponse, AgentRun, AssistantSource, ResponseItem, ToolCall, ToolResult } from './types';
import { object } from './types';

export function parseAgentResponse(value: unknown): AgentResponse {
  const response = object(value);
  if (response.status !== undefined && response.status !== 'completed' && response.status !== 'incomplete') throw new Error('The AI request did not finish. No returned actions were executed.');
  if (response.status === 'incomplete') throw new Error('Spike’s response was cut short. Try a smaller request.');
  if (!Array.isArray(response.output) || response.output.length > 100) throw new Error('The AI service returned an invalid response.');
  const output = response.output.map(object), calls: ToolCall[] = [], messages: string[] = [], sources: AssistantSource[] = [];
  for (const item of output) {
    if (item.type === 'function_call') {
      if (typeof item.call_id !== 'string' || !item.call_id || typeof item.name !== 'string' || typeof item.arguments !== 'string' || item.arguments.length > 200_000) throw new Error('The AI service returned an invalid action.');
      calls.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments });
    } else if (item.type === 'message' && Array.isArray(item.content)) {
      for (const raw of item.content) {
        const content = object(raw);
        if (content.type === 'output_text' && typeof content.text === 'string') messages.push(content.text);
        if (content.type === 'refusal' && typeof content.refusal === 'string') messages.push(content.refusal);
        if (Array.isArray(content.annotations)) for (const raw of content.annotations) {
          const annotation = object(raw);
          if (sources.length < 20 && annotation.type === 'url_citation' && typeof annotation.url === 'string' && /^https?:\/\//i.test(annotation.url) && !sources.some((source) => source.url === annotation.url)) sources.push({ url: annotation.url, title: typeof annotation.title === 'string' ? annotation.title : annotation.url });
        }
      }
    }
  }
  if (new Set(calls.map((call) => call.call_id)).size !== calls.length) throw new Error('The AI service repeated an action identifier.');
  if (!calls.length && !messages.length) throw new Error('The AI service returned no message. Please try again.');
  return { output, calls, text: messages.join('\n\n'), sources: sources.slice(0, 20) };
}
export function startRun(root: string, id: string, history: ResponseItem[], text: string): AgentRun {
  if (!text.trim() || text.length > 32000) throw new Error('Write a message of up to 32,000 characters.');
  return { id, root, historyLength: history.length, input: [...history, { role: 'user', content: text }], pending: [], completed: {}, rounds: 0, text: '', phase: 'ready' };
}
export interface AgentPorts {
  respond: (input: ResponseItem[], signal: AbortSignal) => Promise<AgentResponse>;
  execute: (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
  /** Persists the result and only then allows another external request or action. */
  checkpoint: (run: AgentRun) => Promise<void>;
  onProgress?: (run: AgentRun) => void;
  isCurrentVault: (root: string) => boolean;
}
export class ActionNeedsReview extends Error {
  constructor(readonly call: ToolCall, readonly result: ToolResult) { super('Review the requested change.'); }
}
/** Resumable tool loop. Tool execution owns write receipts and must never blindly retry a write. */
export async function continueRun(initial: AgentRun, ports: AgentPorts, signal: AbortSignal): Promise<AgentRun> {
  let run = structuredClone(initial);
  let repeatedError: { tool: string; message: string; count: number } | undefined;
  const active = () => {
    signal.throwIfAborted();
    if (!ports.isCurrentVault(run.root)) throw new Error('The vault changed. This conversation is paused in its original vault.');
  };
  const save = async () => { await ports.checkpoint(structuredClone(run)); ports.onProgress?.(structuredClone(run)); };
  active();
  await save();
  while (run.phase !== 'complete') {
    active();
    if (run.phase === 'ready') {
      if (run.rounds >= 12) throw new Error('Spike reached the action limit for this message. Review the work completed before continuing.');
      const answer = await ports.respond(run.input, signal);
      active();
      run = { ...run, input: [...run.input, ...answer.output], pending: answer.calls, rounds: run.rounds + 1, text: answer.text || run.text, sources: answer.sources ?? run.sources, phase: answer.calls.length ? 'tools' : 'complete' };
      await save();
    }
    while (run.pending.length) {
      active();
      const call = run.pending[0]!;
      let result = Object.hasOwn(run.completed, call.call_id) ? run.completed[call.call_id] : undefined;
      if (result === undefined) {
        try { result = JSON.stringify(await ports.execute(call, signal)); repeatedError = undefined; }
        catch (error) {
          if (error instanceof ActionNeedsReview || signal.aborted || !ports.isCurrentVault(run.root)) throw error;
          const message = error instanceof Error ? error.message : String(error);
          repeatedError = { tool: call.name, message, count: repeatedError?.tool === call.name && repeatedError.message === message ? repeatedError.count + 1 : 1 };
          result = JSON.stringify({ error: message });
        }
        // A successful operation is recorded even if cancellation happened while it was saving.
        run.completed = { ...run.completed, [call.call_id]: result };
      }
      run.input.push({ type: 'function_call_output', call_id: call.call_id, output: result });
      run.pending.shift();
      await save();
      if (repeatedError && repeatedError.count >= 3) throw new Error(`Spike stopped after the same action failed three times: ${repeatedError.message}`);
    }
    if (run.phase === 'tools') { run.phase = 'ready'; await save(); }
  }
  return run;
}
