/** A filename remains a heading, with a clear keyboard-accessible rename action. */
export function NoteTitle({ title, onRename, className }: { title: string; onRename?: () => void; className?: string }) {
  return <h1 className={className} data-testid="note-title">{onRename ? <button type="button" className="note-title-button" onClick={onRename} aria-label={`Rename ${title}`} title="Rename note">{title}</button> : title}</h1>;
}
