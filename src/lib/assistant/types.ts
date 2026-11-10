import { voiceSettings, type VoiceSettings } from './voice';
import type { Settings, VaultFile } from '../api';
import type { PeriodicRecognition, PeriodicSettings } from '../periodic';

export type AssistantProvider = 'codex' | 'openai';
export interface AssistantSettings {
  provider: AssistantProvider;
  voice: VoiceSettings;
  enabled: boolean;
  desktopPet: boolean;
  petMotion: boolean;
  speakReplies: boolean;
  model: string;
  effort: 'default' | 'low' | 'medium' | 'high' | 'xhigh';
  profilePath: string;
  inboxFolder: string;
  shareCurrentNote: boolean;
  allowChanges: boolean;
}
export const DEFAULT_ASSISTANT: AssistantSettings = {
  provider: 'codex', voice: voiceSettings(undefined),
  enabled: false, desktopPet: false, petMotion: true, speakReplies: false, model: 'gpt-6.1-sol', effort: 'default',
  profilePath: 'Assistant/Profile.md', inboxFolder: 'Inbox', shareCurrentNote: true, allowChanges: false,
};
export interface AssistantContext {
  root: string;
  now: Date;
  files: VaultFile[];
  texts: ReadonlyMap<string, string>;
  currentPath?: string;
  dailyPath?: string;
  dailyAmbiguous?: boolean;
  periodic: PeriodicSettings;
  recognition?: PeriodicRecognition;
  settings: AssistantSettings;
}
export interface ToolCall extends Record<string, unknown> { type: 'function_call'; call_id: string; name: string; arguments: string }
export type ResponseItem = Record<string, unknown>;
export interface AssistantSource { title: string; url: string }
export interface AgentResponse { output: ResponseItem[]; text: string; calls: ToolCall[]; sources?: AssistantSource[] }
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  created: string;
  sources?: AssistantSource[];
}
/** Stored before the next model request so a successful action is never replayed on retry. */
export interface AgentRun {
  id: string;
  root: string;
  input: ResponseItem[];
  historyLength?: number;
  pending: ToolCall[];
  completed: Record<string, string>;
  rounds: number;
  text: string;
  phase: 'ready' | 'tools' | 'complete';
  sources?: AssistantSource[];
}
export interface NoteChange {
  kind: 'note';
  root: string;
  path: string;
  before: string | null;
  after: string;
  description: string;
}
export interface CalendarChange {
  kind: 'calendar';
  root: string;
  calendar: string;
  title: string;
  start: number;
  end: number;
  notes?: string;
  description: string;
}
export type AssistantChange = NoteChange | CalendarChange;
export interface ActionReceipt {
  id: string;
  change: AssistantChange;
  state: 'prepared' | 'done';
  result?: string;
}
export interface ToolResult { value?: unknown; change?: AssistantChange; openPath?: string; openCbt?: boolean }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
/** Stored provider items must not introduce a higher-priority instruction role on replay. */
export function responseItem(value: unknown): ResponseItem {
  const item = object(value);
  if (item.role !== undefined && item.role !== 'user' && item.role !== 'assistant') throw new Error('This conversation contains an invalid message role.');
  if ((item.type === undefined || item.type === 'message') && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') return item;
  if (item.type === 'message' && Array.isArray(item.content) && item.content.every((raw) => { const content = object(raw); return content.type === 'output_text' && typeof content.text === 'string' || content.type === 'refusal' && typeof content.refusal === 'string'; })) return item;
  if (item.type === 'function_call' && typeof item.call_id === 'string' && typeof item.name === 'string' && typeof item.arguments === 'string') return item;
  if (item.type === 'function_call_output' && typeof item.call_id === 'string' && typeof item.output === 'string') return item;
  if (item.type === 'reasoning' && (item.encrypted_content === undefined || typeof item.encrypted_content === 'string') && (item.summary === undefined || Array.isArray(item.summary))) return item;
  if (item.type === 'web_search_call' && typeof item.id === 'string') return item;
  throw new Error('This conversation contains an unsupported provider item. Its saved file is preserved.');
}
export function assistantSettings(value: unknown): AssistantSettings {
  let saved: Record<string, unknown> = {};
  try { saved = object(value); } catch { /* A missing preference uses defaults. */ }
  const text = (key: 'model' | 'profilePath' | 'inboxFolder') => typeof saved[key] === 'string' && saved[key].trim() ? saved[key] : DEFAULT_ASSISTANT[key];
  return {
    provider: saved.provider === 'openai' || saved.provider === undefined && saved.enabled === true ? 'openai' : 'codex',
    voice: voiceSettings(saved.voice, saved.provider === 'openai' || saved.provider === undefined && saved.enabled === true ? 'openai' : 'local'),
    enabled: saved.enabled === true, desktopPet: saved.desktopPet === true, petMotion: saved.petMotion !== false, speakReplies: saved.speakReplies === true,
    shareCurrentNote: saved.shareCurrentNote !== false, allowChanges: saved.allowChanges === true,
    effort: saved.effort === 'low' || saved.effort === 'medium' || saved.effort === 'high' || saved.effort === 'xhigh' ? saved.effort : 'default',
    model: text('model'), profilePath: text('profilePath'), inboxFolder: text('inboxFolder'),
  };
}
export function vaultAssistantSettings(settings: Settings, root: string): AssistantSettings {
  try { return assistantSettings(object(object(settings.vaults)[root]).assistant); }
  catch { return { ...DEFAULT_ASSISTANT }; }
}
export function assistantPreferencesPatch(settings: Settings, root: string, assistant: AssistantSettings): Settings {
  let vaults: Record<string, unknown> = {}, vault: Record<string, unknown> = {};
  try { vaults = object(settings.vaults); vault = object(vaults[root]); } catch { /* A new vault has no preferences yet. */ }
  return { vaults: { ...vaults, [root]: { ...vault, assistant } } };
}
