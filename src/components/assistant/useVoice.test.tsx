import { Blob as NodeBlob } from 'node:buffer';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantSpeak, assistantTranscribe } from '../../lib/api';
import { useVoice } from './useVoice';
vi.mock('../../lib/api', () => ({ assistantTranscribe: vi.fn(), assistantSpeak: vi.fn() }));
class Recorder {
  static last: Recorder;
  static isTypeSupported(type: string) { return type === 'audio/mp4'; }
  state = 'inactive'; mimeType = 'audio/mp4';
  ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void; onerror?: () => void;
  constructor() { Recorder.last = this; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    const blob = new Blob(['recorded-audio'], { type: this.mimeType });
    Object.defineProperty(blob, 'arrayBuffer', { value: () => Promise.resolve(new TextEncoder().encode('recorded-audio').buffer) });
    this.ondataavailable?.({ data: blob }); this.onstop?.();
  }
}
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
const originalDevices = navigator.mediaDevices;
beforeEach(() => {
  vi.resetAllMocks(); stopTrack = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('Blob', NodeBlob);
  // jsdom's Blob has no arrayBuffer; production WebKit does.
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(() => Promise.resolve(new TextEncoder().encode('recorded-audio').buffer));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalDevices }); });
it('records speech, stops every microphone track and sends the recognized text to the conversation', async () => {
  vi.mocked(assistantTranscribe).mockResolvedValue('Remember my preference.');
  const send = vi.fn().mockResolvedValue(undefined), hook = renderHook(() => useVoice(send));
  await act(() => hook.result.current.start());
  expect(hook.result.current.phase).toBe('recording');
  act(() => hook.result.current.stop());
  await waitFor(() => expect(send).toHaveBeenCalledWith('Remember my preference.'));
  expect(stopTrack).toHaveBeenCalled();
  expect(hook.result.current.phase).toBe('idle');
});
it('routes subscription recordings to local speech and stops capture when the provider changes', async () => {
  vi.mocked(assistantTranscribe).mockResolvedValue('My local transcript.');
  const send = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(({ provider }: { provider: 'codex' | 'openai' }) => useVoice(send, provider), { initialProps: { provider: 'codex' } });
  await act(() => hook.result.current.start());
  act(() => hook.result.current.stop());
  await waitFor(() => expect(send).toHaveBeenCalledWith('My local transcript.'));
  expect(assistantTranscribe).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/mp4', expect.any(AbortSignal), 'codex', undefined);
  await act(() => hook.result.current.start());
  hook.rerender({ provider: 'openai' });
  expect(stopTrack).toHaveBeenCalledTimes(2);
  expect(hook.result.current.phase).toBe('idle');
  expect(assistantTranscribe).toHaveBeenCalledTimes(1);
});
it('retains a failed recording for retry and does not send an invented transcript', async () => {
  vi.mocked(assistantTranscribe).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce('My actual words.');
  const send = vi.fn().mockResolvedValue(undefined), hook = renderHook(() => useVoice(send));
  await act(() => hook.result.current.start()); act(() => hook.result.current.stop());
  await waitFor(() => expect(hook.result.current.canRetry).toBe(true));
  expect(send).not.toHaveBeenCalled();
  act(() => hook.result.current.retry());
  await waitFor(() => expect(send).toHaveBeenCalledWith('My actual words.'));
});
it('handles declined microphone access without attempting transcription', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  const hook = renderHook(() => useVoice(vi.fn()));
  await act(() => hook.result.current.start());
  expect(hook.result.current.error).toContain('Microphone access was declined');
  expect(assistantTranscribe).not.toHaveBeenCalled();
});
it('stops a late microphone grant after the window was closed', async () => {
  let grant: (value: MediaStream) => void = () => undefined;
  getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  const hook = renderHook(() => useVoice(vi.fn()));
  let starting: Promise<void>;
  act(() => { starting = hook.result.current.start(); });
  act(() => hook.result.current.pauseRecording());
  await act(async () => { grant({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream); await starting; });
  expect(stopTrack).toHaveBeenCalled();
  expect(hook.result.current.phase).toBe('idle');
  expect(assistantTranscribe).not.toHaveBeenCalled();
});
it('keeps a paused recording without sending it when the conversation closes', async () => {
  const send = vi.fn(), hook = renderHook(() => useVoice(send));
  await act(() => hook.result.current.start()); act(() => hook.result.current.pauseRecording());
  expect(stopTrack).toHaveBeenCalled(); expect(hook.result.current.canRetry).toBe(true);
  expect(assistantTranscribe).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

class Playback extends EventTarget {
  static instances: Playback[] = [];
  static autoEnd = true;
  pause = vi.fn();
  constructor(readonly src: string) { super(); Playback.instances.push(this); }
  play() { if (Playback.autoEnd) queueMicrotask(() => this.dispatchEvent(new Event('ended'))); return Promise.resolve(); }
}
it('reads every chunk of a long reply and releases all audio resources', async () => {
  Playback.instances = []; Playback.autoEnd = true; vi.stubGlobal('Audio', Playback);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-audio');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.mocked(assistantSpeak).mockResolvedValue(new ArrayBuffer(44));
  const text = 'A full sentence. '.repeat(250), hook = renderHook(() => useVoice(vi.fn()));
  await act(() => hook.result.current.speak(text));
  expect(vi.mocked(assistantSpeak).mock.calls.map(([chunk]) => chunk).join('')).toBe(text);
  expect(assistantSpeak).toHaveBeenCalledTimes(Playback.instances.length);
  expect(Playback.instances.length).toBeGreaterThan(1);
  expect(revoke).toHaveBeenCalledTimes(Playback.instances.length);
  expect(hook.result.current.phase).toBe('idle');
});
it('stops playback immediately and never requests remaining chunks after cancellation', async () => {
  Playback.instances = []; Playback.autoEnd = false; vi.stubGlobal('Audio', Playback);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-audio');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.mocked(assistantSpeak).mockResolvedValue(new ArrayBuffer(44));
  const hook = renderHook(() => useVoice(vi.fn())); let speaking: Promise<void>;
  act(() => { speaking = hook.result.current.speak('Long reply. '.repeat(300)); });
  await waitFor(() => expect(Playback.instances).toHaveLength(1));
  act(() => hook.result.current.cancel()); await act(async () => { await speaking; });
  expect(Playback.instances[0]!.pause).toHaveBeenCalled();
  expect(assistantSpeak).toHaveBeenCalledOnce();
  expect(hook.result.current.phase).toBe('idle');
});

it('does not let an older declined microphone request stop a newer recording', async () => {
  let reject!: (error: Error) => void;
  getUserMedia.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  const hook = renderHook(() => useVoice(vi.fn()));
  let old: Promise<void>;
  act(() => { old = hook.result.current.start(); });
  act(() => hook.result.current.cancel());
  await act(() => hook.result.current.start());
  expect(hook.result.current.phase).toBe('recording');
  await act(async () => { reject(new Error('Old request denied')); await old; });
  expect(hook.result.current.phase).toBe('recording');
  expect(hook.result.current.error).toBeUndefined();
  expect(stopTrack).not.toHaveBeenCalled();
  act(() => hook.result.current.cancel());
  expect(stopTrack).toHaveBeenCalledOnce();
});

it('uses the selected transcription model independently of the assistant subscription', async () => {
  vi.mocked(assistantTranscribe).mockResolvedValue('My words.');
  const voice = { provider: 'openrouter' as const, model: 'microsoft/mai-transcribe-2' };
  const hook = renderHook(() => useVoice(vi.fn().mockResolvedValue(undefined), 'codex', voice));
  await act(() => hook.result.current.start());
  act(() => hook.result.current.stop());
  await waitFor(() => expect(assistantTranscribe).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/mp4', expect.any(AbortSignal), 'codex', voice));
});
