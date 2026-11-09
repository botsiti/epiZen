import { useCallback, useEffect, useRef, useState } from 'react';
import { assistantSpeak, assistantTranscribe } from '../../lib/api';
import { speechChunks } from '../../lib/assistant/speech';
import type { VoiceSettings } from '../../lib/assistant/voice';
import type { AssistantProvider } from '../../lib/assistant/types';

export type VoicePhase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'speaking';
const LIMIT = 20 * 1024 * 1024;
export function useVoice(onTranscript: (text: string) => Promise<void>, provider: AssistantProvider = 'openai', voice?: VoiceSettings, transcriber = assistantTranscribe) {
  const [phase, setPhase] = useState<VoicePhase>('idle'), [error, setError] = useState<string>(), [seconds, setSeconds] = useState(0), [canRetry, setCanRetry] = useState(false);
  const voiceProvider = voice?.provider, voiceModel = voice?.model;
  const callback = useRef(onTranscript), alive = useRef(false), recorder = useRef<MediaRecorder | undefined>(undefined), stream = useRef<MediaStream | undefined>(undefined), saved = useRef<Blob | undefined>(undefined), request = useRef<AbortController | undefined>(undefined), playback = useRef<HTMLAudioElement | undefined>(undefined), objectUrl = useRef<string | undefined>(undefined), timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined), limitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), generation = useRef(0), recording = useRef(false), sendOnStop = useRef(true);
  useEffect(() => { callback.current = onTranscript; }, [onTranscript]);
  const clearAudio = useCallback(() => {
    playback.current?.pause(); playback.current = undefined;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = undefined;
  }, []);
  const clearCapture = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = undefined;
    clearInterval(timer.current); clearTimeout(limitTimer.current); recording.current = false;
  }, []);
  const transcribe = useCallback(async (blob: Blob) => {
    const token = ++generation.current; request.current?.abort(); const abort = new AbortController(); request.current = abort;
    setError(undefined); setPhase('transcribing'); setCanRetry(false);
    try {
      const text = await transcriber(new Uint8Array(await blob.arrayBuffer()), blob.type, abort.signal, provider, voiceProvider ? { provider: voiceProvider, model: voiceModel ?? '' } : undefined);
      if (!alive.current || generation.current !== token) return;
      if (!text.trim()) throw new Error('No speech was detected. Try recording again.');
      // Keep the recording until its transcript has been handed to the persistent controller.
      await callback.current(text.trim()); saved.current = undefined;
    } catch (error) {
      if (alive.current && generation.current === token && !abort.signal.aborted) { setError(String(error)); setCanRetry(true); }
    } finally { if (alive.current && generation.current === token) setPhase('idle'); }
  }, [provider, voiceProvider, voiceModel, transcriber]);
  const pauseRecording = useCallback(() => {
    sendOnStop.current = false;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else { generation.current++; request.current?.abort(); clearAudio(); setPhase('idle'); setCanRetry(Boolean(saved.current)); }
    clearCapture();
  }, [clearCapture, clearAudio]);
  const connection = `${provider}:${voiceProvider ?? ''}:${voiceModel ?? ''}`;
  const previousProvider = useRef(connection);
  useEffect(() => { if (previousProvider.current !== connection) { previousProvider.current = connection; pauseRecording(); } }, [connection, pauseRecording]);
  const cancel = useCallback(() => {
    generation.current++; request.current?.abort(); sendOnStop.current = false;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    if (phase !== 'speaking') { saved.current = undefined; setCanRetry(false); }
    clearCapture(); clearAudio(); setPhase('idle');
  }, [phase, clearAudio, clearCapture]);
  const start = useCallback(async () => {
    if (recording.current) return;
    const token = ++generation.current; request.current?.abort(); clearAudio(); setError(undefined); setCanRetry(false); setPhase('requesting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is unavailable in this window. You can still type to Spike.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || generation.current !== token) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This microphone format is unsupported. You can still type to Spike.');
      const device = new MediaRecorder(media, { mimeType: mime }); recorder.current = device;
      const chunks: Blob[] = []; let bytes = 0; sendOnStop.current = true;
      device.ondataavailable = (event) => {
        if (!alive.current || generation.current !== token) return;
        if (!event.data.size) return;
        bytes += event.data.size;
        if (bytes > LIMIT) { sendOnStop.current = false; setError('The recording reached 20 MB. Please record a shorter message.'); device.stop(); return; }
        chunks.push(event.data);
      };
      device.onerror = () => { if (!alive.current || generation.current !== token) return; sendOnStop.current = false; clearCapture(); setError('The microphone stopped unexpectedly. Try again.'); setPhase('idle'); };
      device.onstop = () => {
        if (!alive.current || generation.current !== token) return;
        clearCapture();
        const blob = new Blob(chunks, { type: device.mimeType || mime }); saved.current = blob;
        if (sendOnStop.current && blob.size) void transcribe(blob);
        else { setPhase('idle'); setCanRetry(blob.size > 0); }
      };
      device.start(1000); recording.current = true; setSeconds(0); setPhase('recording');
      const started = Date.now(); timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
      limitTimer.current = setTimeout(() => { if (device.state === 'recording') device.stop(); }, 5 * 60_000);
    } catch (error) {
      if (alive.current && generation.current === token) { clearCapture(); setError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access was declined. Allow Epizen in macOS Privacy & Security → Microphone, or type your message.' : String(error)); setPhase('idle'); }
    }
  }, [clearAudio, clearCapture, transcribe]);
  const stop = useCallback(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);
  const retry = useCallback(() => { if (saved.current) void transcribe(saved.current); }, [transcribe]);
  const speak = useCallback(async (text: string) => {
    if (recording.current) return;
    const token = ++generation.current; request.current?.abort(); clearAudio(); const abort = new AbortController(); request.current = abort;
    setError(undefined); setPhase('speaking');
    try {
      for (const chunk of speechChunks(text).filter((chunk) => chunk.trim())) {
        abort.signal.throwIfAborted();
        const bytes = await assistantSpeak(chunk, abort.signal, provider);
        if (!alive.current || generation.current !== token) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); objectUrl.current = url;
        const audio = new Audio(url); playback.current = audio;
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => { audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); abort.signal.removeEventListener('abort', stopped); };
          const ended = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error('Audio playback failed.')); };
          const stopped = () => { cleanup(); audio.pause(); reject(new DOMException('Stopped', 'AbortError')); };
          audio.addEventListener('ended', ended, { once: true }); audio.addEventListener('error', failed, { once: true }); abort.signal.addEventListener('abort', stopped, { once: true });
          void audio.play().catch((error: unknown) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); });
        });
        clearAudio();
      }
      if (alive.current && generation.current === token) setPhase('idle');
    } catch (error) { if (alive.current && generation.current === token) { clearAudio(); setPhase('idle'); if (!abort.signal.aborted) setError(`Couldn’t read this reply aloud. ${String(error)}`); } }
  }, [clearAudio, provider]);
  const dispose = useCallback(() => { alive.current = false; generation.current++; request.current?.abort(); sendOnStop.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); clearCapture(); clearAudio(); }, [clearCapture, clearAudio]);
  useEffect(() => { alive.current = true; return dispose; }, [dispose]);
  return { phase, error, seconds, canRetry, start, stop, pauseRecording, cancel, retry, speak };
}
export type VoiceControls = ReturnType<typeof useVoice>;
