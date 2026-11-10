import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AssistantContext, AssistantSettings } from '../../lib/assistant/types';
import { flushBeforeClose } from '../../lib/saving';
import { ErrorBoundary } from '../ErrorBoundary';
import { AssistantController } from './controller';
import { AssistantPanel } from './AssistantPanel';
import { useVoice } from './useVoice';
import { currentAssistantContext } from '../../lib/assistant/context';
import { useQuickBridge } from './useQuickBridge';
import { usePetBridge } from './usePetBridge';
import './assistant.css';

interface Props {
  context: AssistantContext; open: boolean; onOpen: () => void; onClose: () => void;
  onSaved: (path: string, text: string) => void; onOpenNote: (path: string, cbt?: boolean) => void;
  onRefresh: () => Promise<void>; onSaveSettings: (value: AssistantSettings) => Promise<void>;
}
export function AssistantWorkspace(props: Props) {
  const [controller] = useState(() => new AssistantController(props.context.root, {
    context: () => currentAssistantContext(props.context),
    onSaved: props.onSaved, onOpen: props.onOpenNote, onRefresh: props.onRefresh,
  }));
  const voice = useVoice(controller.receiveVoice, props.context.settings.provider, props.context.settings.voice);
  const { speak, pauseRecording } = voice;
  useEffect(() => { controller.updateHost({ context: () => currentAssistantContext(props.context), onSaved: props.onSaved, onOpen: props.onOpenNote, onRefresh: props.onRefresh, onReply: (text) => { if (props.context.settings.speakReplies) void speak(text); } }); }, [controller, props, speak]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const quickError = useQuickBridge(props.context.root, controller, snapshot, props.context.settings);
  const petError = usePetBridge({ root: props.context.root, enabled: props.context.settings.desktopPet, status: { animation: voice.phase === 'recording' ? 'listening' : snapshot.busy ? 'thinking' : snapshot.error ? 'error' : snapshot.thread.actions.some((action) => action.status === 'review') ? 'review' : 'idle', label: snapshot.busy ? 'Working on your request' : snapshot.error ? 'Needs attention' : 'Talk to Spike', motion: props.context.settings.petMotion }, onOpen: props.onOpen, onHide: () => props.onSaveSettings({ ...props.context.settings, desktopPet: false }), onMotion: (petMotion) => props.onSaveSettings({ ...props.context.settings, petMotion }), onMainHidden: voice.pauseRecording });
  useEffect(() => { controller.mount(); return () => controller.destroy(); }, [controller]);
  useEffect(() => { if (!props.context.settings.enabled) { controller.stop(); pauseRecording(); } }, [controller, props.context.settings.enabled, pauseRecording]);
  useEffect(() => flushBeforeClose(() => controller.flush().then(() => undefined, () => 'Spike conversation')), [controller]);
  return <>
    {props.open && <ErrorBoundary label="Spike" frame={(message) => <aside className="assistant-sidebar">{message}<button type="button" className="quiet-button" onClick={() => { voice.pauseRecording(); props.onClose(); }}>Close assistant</button></aside>}><AssistantPanel companionError={petError ?? quickError} controller={controller} snapshot={snapshot} voice={voice} settings={props.context.settings} currentPath={props.context.currentPath} profileExists={props.context.files.some((file) => file.path === props.context.settings.profilePath)} onSaveSettings={props.onSaveSettings} onOpenNote={props.onOpenNote} onClose={() => { voice.pauseRecording(); props.onClose(); }} /></ErrorBoundary>}
  </>;
}
