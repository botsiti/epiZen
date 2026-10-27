import { useMemo, type MouseEvent, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VaultFile } from '../lib/api';
import { resolveLink } from '../lib/links';
import { parseVaultUrl, remarkCallouts, remarkWikilinks, urlTransform } from '../lib/markdown';
import { VaultImage } from './VaultImage';

const remarkPlugins = [remarkGfm, remarkCallouts, remarkWikilinks];

interface Props {
  path: string;
  /** The Markdown after the properties. */
  body: string;
  files: VaultFile[];
  onOpenLink: (target: string, fromPath: string) => void;
}

/** A note's Markdown without its properties: wikilinks, embeds and callouts, as in Obsidian. */
export function NoteMarkdown({ path, body, files, onOpenLink }: Props) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const link = parseVaultUrl(href);
        if (link?.kind === 'link') {
          const found = resolveLink(link.target, files, path);
          // A plain link to an image has nowhere to go yet, so it shouldn't look clickable.
          if (found?.kind === 'image') return <span className="wikilink-file">{children}</span>;
          const open = (event: MouseEvent) => {
            event.preventDefault();
            onOpenLink(link.target, path);
          };
          return (
            <a href="#" className={found ? 'wikilink' : 'wikilink is-missing'} data-wikilink={link.target} onClick={open}>
              {children}
            </a>
          );
        }
        // Opening the system browser isn't wired up yet; never navigate the app window away.
        return (
          <a href={href} className="external" title={href} onClick={(event) => event.preventDefault()}>
            {children}
          </a>
        );
      },
      img({ src, alt, width }) {
        const embed = parseVaultUrl(typeof src === 'string' ? src : undefined);
        if (embed?.kind !== 'embed') return <span className="embed-missing">{alt}</span>;
        const file = resolveLink(embed.target, files, path);
        if (file?.kind === 'image') {
          return <VaultImage path={file.path} alt={alt ?? embed.target} width={width ? Number(width) : undefined} />;
        }
        return <EmbedLink target={embed.target} found={Boolean(file)} onOpen={() => onOpenLink(embed.target, path)} />;
      },
    }),
    [files, path, onOpenLink],
  );

  return (
    <div className="note-body">
      <Markdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components}>
        {body}
      </Markdown>
    </div>
  );
}

function EmbedLink({ target, found, onOpen }: { target: string; found: boolean; onOpen: () => void }): ReactNode {
  return (
    <a
      href="#"
      className={found ? 'wikilink' : 'wikilink is-missing'}
      data-wikilink={target}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      {target}
    </a>
  );
}
