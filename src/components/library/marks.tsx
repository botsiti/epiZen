import type { MediaKind } from '../../lib/library';

/** A kind's small mark, drawn in lines: a music note, a camera, a book, a microphone and a play symbol. */
export function KindMark({ kind }: { kind: MediaKind }) {
  const paths: Partial<Record<MediaKind, string>> = {
    album: 'M6 11.5V3.75l6.5-1.5v8M6 6l6.5-1.5M6 11.5c0 1-1 1.75-2.25 1.75S1.5 12.5 1.5 11.5s1-1.75 2.25-1.75S6 10.5 6 11.5ZM12.5 10.25c0 1-1 1.75-2.25 1.75S8 11.25 8 10.25 9 8.5 10.25 8.5s2.25.75 2.25 1.75Z',
    film: 'M2 5h8v8H2zM10 7.25l4-2v7.5l-4-2M3.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
    book: 'M3.25 2.75c1.8-.6 3.4-.4 4.75.6v10.4c-1.35-1-2.95-1.2-4.75-.6zM12.75 2.75c-1.8-.6-3.4-.4-4.75.6v10.4c1.35-1 2.95-1.2 4.75-.6z',
    video: 'M2 3h12v10H2zM6.25 5.25l4 2.75-4 2.75z',
    podcast: 'M6 2.25h4v6.5a2 2 0 0 1-4 0zM3.75 7.5a4.25 4.25 0 0 0 8.5 0M8 11.75v2.5M5.75 14.25h4.5',
  };
  return (
    <svg className="kind-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind] ?? ''} />
    </svg>
  );
}

const TOOLS = {
  calendar: 'M3 3.5h10v10H3zM3 6.5h10M5.5 2v3M10.5 2v3M5.5 9h.5M9.5 9h.5',
  covers: 'M2.75 2.75h4v4h-4zM9.25 2.75h4v4h-4zM2.75 9.25h4v4h-4zM9.25 9.25h4v4h-4z',
  list: 'M2.75 3.75h1.5M6.75 3.75h6.5M2.75 8h1.5M6.75 8h6.5M2.75 12.25h1.5M6.75 12.25h6.5',
  choose: 'M5.5 6.25 8 3.75l2.5 2.5M5.5 9.75 8 12.25l2.5-2.5',
  sort: 'M5 3v10M2.75 10.75 5 13l2.25-2.25M11 13V3M8.75 5.25 11 3l2.25 2.25',
  filter: 'M2.75 4.5h10.5M4.75 8h6.5M6.75 11.5h2.5',
  columns: 'M2.75 3.25h10.5v9.5H2.75zM6.25 3.25v9.5M9.75 3.25v9.5',
  search: 'M7 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM10.25 10.25l3 3',
  check: 'M3.75 8.25 6.75 11.25 12.25 4.75',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  arrow: 'M3 8h9.5M9 4.5 12.5 8 9 11.5',
};

/** The toolbar's small marks, drawn in lines like the kinds'. */
export function ToolMark({ name }: { name: keyof typeof TOOLS }) {
  return (
    <svg className="kind-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d={TOOLS[name]} />
    </svg>
  );
}
