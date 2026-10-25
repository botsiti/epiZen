import type { Backlink } from '../lib/linkIndex';
import { noteFolder, noteTitle } from '../lib/links';

/** The notes that link to this one, each with the line that does. */
export function Backlinks({ links, onOpen }: { links: Backlink[]; onOpen: (path: string) => void }) {
  return (
    <section className="backlinks" data-testid="backlinks">
      <p className="eyebrow">{links.length ? `Linked from ${links.length} ${links.length === 1 ? 'note' : 'notes'}` : 'No links to this note yet'}</p>
      <ul>
        {links.map((link) => (
          <li key={link.from}>
            <button type="button" className="backlink" onClick={() => onOpen(link.from)} data-testid="backlink" data-path={link.from}>
              <span className="backlink-title">{noteTitle(link.from)}</span>
              {noteFolder(link.from) && <span className="backlink-folder">{noteFolder(link.from)}</span>}
              {link.context && <span className="backlink-context">{link.context}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
