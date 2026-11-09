import { createContext, useContext, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VaultFile } from '../lib/api';
import { resolveLink } from '../lib/links';
import { highlightInk, remarkHighlights } from '../lib/highlights';
import { parseVaultUrl, remarkCallouts, remarkWikilinks, urlTransform } from '../lib/markdown';
import { VaultImage } from './VaultImage';
import { openClicks } from './workspace/clicks';
import { BaseBlock } from './bases/BaseBlock';
import { BaseDocument } from './bases/BaseDocument';
import { ErrorBoundary } from './ErrorBoundary';
import { useBases } from './bases/context';
import { baseBlockOccurrence } from '../lib/bases/document';

const remarkPlugins = [remarkGfm, remarkCallouts, remarkHighlights, remarkWikilinks];
interface Props {
  path: string; body: string; files: VaultFile[];
  onOpenLink: (target: string, fromPath: string, newTab?: boolean) => void;
  onChangeBase?: (before: string, after: string, occurrence: number) => Promise<void>;
  onRecoverBase?: (path: string, draft: string, problem: string) => void;
}
const Context = createContext<Props | undefined>(undefined);
const useNote = () => useContext(Context)!;
// Stable component types are essential: metadata refreshes must not remount an unsaved Base editor.
const components: Components = {
  pre: function MarkdownPre({ node, children }) {
    const { path, body, onOpenLink, onChangeBase, onRecoverBase } = useNote();
    const bases = useBases();
    const enabled = bases?.enabled !== false;
    const code = node?.children[0], languages = code?.type === 'element' ? code.properties.className : undefined;
    const language = Array.isArray(languages) && languages.includes('language-base') ? 'base' : Array.isArray(languages) && languages.includes('language-dataview') ? 'dataview' : undefined;
    if (language && (enabled || language === 'base') && code?.type === 'element') {
      const source = code.children.filter((child) => child.type === 'text').map((child) => child.value).join('').replace(/\n$/, '');
      // epiBase's legacy compatibility is for TABLE queries; other Dataview blocks stay inert.
      if (language === 'dataview' && !/^\s*table\s/i.test(source)) return <pre>{children}</pre>;
      const occurrence = baseBlockOccurrence(body, source, node?.position?.start.offset ?? 0);
      return <ErrorBoundary label="This table"><BaseBlock source={source} language={language} path={path} onOpenLink={onOpenLink} onSaveSource={language === 'base' && onChangeBase ? (before, after) => onChangeBase(before, after, occurrence) : undefined} onRecover={(draft, problem) => (onRecoverBase ?? bases?.onRecover)?.(path, draft, `Unsaved embedded Base YAML. ${problem}`)} /></ErrorBoundary>;
    }
    return <pre>{children}</pre>;
  },
  p: function MarkdownParagraph({ node, children }) {
    const hasBase = node?.children.some((child) => child.type === 'element' && child.tagName === 'img' && /\.base$/i.test(parseVaultUrl(String(child.properties.src))?.target ?? ''));
    return hasBase ? <div className="note-base-embed">{children}</div> : <p>{children}</p>;
  },
  mark({ node, children }) { const color = node?.properties?.dataHighlightColor; const hex = typeof color === 'string' ? color : undefined; return <mark className="note-highlight" style={hex ? { backgroundColor: hex, color: highlightInk(hex) } : undefined}>{children}</mark>; },
  span({ node, children, className }) { const color = node?.properties?.dataHighlightColor; return <span className={className} style={typeof color === 'string' ? { color } : undefined}>{children}</span>; },
  a: function MarkdownLink({ href, children }) {
    const { path, files, onOpenLink } = useNote(); const link = parseVaultUrl(href);
    if (link?.kind === 'link') {
      const found = resolveLink(link.target.split('#')[0]!, files, path);
      if (found?.kind === 'image') return <span className="wikilink-file">{children}</span>;
      return <a href="#" className={found ? 'wikilink' : 'wikilink is-missing'} data-wikilink={link.target} {...openClicks((newTab) => onOpenLink(link.target, path, newTab))}>{children}</a>;
    }
    return <a href={href} className="external" title={href} onClick={(event) => event.preventDefault()}>{children}</a>;
  },
  img: function MarkdownImage({ src, alt, width, node }) {
    const { path, files, onOpenLink, onRecoverBase } = useNote();
    const bases = useBases();
    const embed = parseVaultUrl(typeof src === 'string' ? src : undefined);
    if (embed?.kind !== 'embed') return <span className="embed-missing">{alt}</span>;
    const file = resolveLink(embed.target, files, path);
    if (file?.kind === 'image') return <VaultImage path={file.path} alt={alt ?? embed.target} width={width ? Number(width) : undefined} />;
    if (file?.kind === 'base') return <ErrorBoundary label="This base"><BaseDocument key={file.path} embedded path={file.path} from={path} defaultView={typeof node?.properties.dataBaseView === 'string' ? node.properties.dataBaseView : undefined} onOpenLink={onOpenLink} onRecover={onRecoverBase ?? bases?.onRecover} /></ErrorBoundary>;
    return <EmbedLink target={embed.target} found={Boolean(file)} onOpen={(newTab) => onOpenLink(embed.target, path, newTab)} />;
  },
};
export function NoteMarkdown(props: Props) {
  return <Context.Provider value={props}><div className="note-body"><Markdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components}>{props.body}</Markdown></div></Context.Provider>;
}
function EmbedLink({ target, found, onOpen }: { target: string; found: boolean; onOpen: (newTab: boolean) => void }): ReactNode {
  return <a href="#" className={found ? 'wikilink' : 'wikilink is-missing'} data-wikilink={target} {...openClicks(onOpen)}>{target}</a>;
}
