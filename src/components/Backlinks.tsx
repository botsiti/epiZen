import type { Backlink } from '../lib/linkIndex';
import { noteFolder, noteTitle } from '../lib/links';
import { openClicks } from './workspace/clicks';

/** The notes that link to this one, each with the line that does. `newTab` for a ⌘-click or a middle click. */
export function Backlinks({ links, onOpen }: { links: Backlink[]; onOpen: (path: string, newTab: boolean) => void }) {
  return (
    <div className="backlinks" data-testid="backlinks" data-count={links.length}>
      {links.length ? (
        <ul>
          {links.map((link) => (
            <li key={link.from}>
              <button type="button" className="backlink" title={link.from} {...openClicks((newTab) => onOpen(link.from, newTab))} data-testid="backlink" data-path={link.from}>
                <span className="backlink-title">{noteTitle(link.from)}</span>
                {noteFolder(link.from) && <span className="backlink-folder">{noteFolder(link.from)}</span>}
                {link.context && <span className="backlink-context">{link.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-quiet">No links to this note yet.</p>
      )}
    </div>
  );
}
