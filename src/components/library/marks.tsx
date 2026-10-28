import type { MediaKind } from '../../lib/library';

/** A kind's small mark, drawn in lines: a record, a strip of film, a book, a microphone. */
export function KindMark({ kind }: { kind: MediaKind }) {
  const paths: Partial<Record<MediaKind, string>> = {
    album: 'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
    film: 'M3 2.25h10v11.5H3zM5.5 2.25v11.5M10.5 2.25v11.5M3 5.5h2.5M3 8h2.5M3 10.5h2.5M10.5 5.5H13M10.5 8H13M10.5 10.5H13',
    book: 'M3.25 2.75c1.8-.6 3.4-.4 4.75.6v10.4c-1.35-1-2.95-1.2-4.75-.6zM12.75 2.75c-1.8-.6-3.4-.4-4.75.6v10.4c1.35-1 2.95-1.2 4.75-.6z',
    podcast: 'M6 2.25h4v6.5a2 2 0 0 1-4 0zM3.75 7.5a4.25 4.25 0 0 0 8.5 0M8 11.75v2.5M5.75 14.25h4.5',
  };
  return (
    <svg className="kind-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind] ?? ''} />
    </svg>
  );
}
