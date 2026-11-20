import { useRef, useState, type DragEvent } from 'react';
import { noteFolder, noteTitle } from '../../lib/links';

const NOTE_TYPE = 'application/x-epizen-note';

export function useNoteDrag(move?: (path: string, folder: string) => void) {
  const [drag, setDrag] = useState<string>();
  const [over, setOver] = useState<string>();
  const source = useRef<string>(undefined);
  const cancel = () => { source.current = undefined; setDrag(undefined); setOver(undefined); };
  const start = (event: DragEvent, path: string) => {
    source.current = path;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(NOTE_TYPE, path);
    setDrag(path);
  };
  const allowed = (event: DragEvent, folder: string) =>
    Boolean(source.current && folder !== noteFolder(source.current) && event.dataTransfer.types.includes(NOTE_TYPE));
  const dropTarget = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!allowed(event, folder)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOver(folder);
    },
    onDragLeave: (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setOver((current) => current === folder ? undefined : current);
    },
    onDrop: (event: DragEvent) => {
      if (!allowed(event, folder)) return;
      event.preventDefault();
      const path = source.current;
      cancel();
      if (path && event.dataTransfer.getData(NOTE_TYPE) === path) move?.(path, folder);
    },
  });
  return { start, cancel, dragged: drag, over, dropTarget, label: drag && `Move “${noteTitle(drag)}”` };
}
