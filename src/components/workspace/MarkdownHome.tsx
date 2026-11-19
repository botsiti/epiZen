import { noteFolder, noteTitle } from '../../lib/links';
import type { VaultFile } from '../../lib/api';
import './markdownHome.css';

export function MarkdownHome({ name, files, onOpen, onNew, onPlugins }: { name: string; files: VaultFile[]; onOpen: (path: string) => void; onNew: () => void; onPlugins: () => void }) {
  const notes = files.filter((file) => file.kind === 'note').toSorted((a, b) => (b.modified ?? 0) - (a.modified ?? 0)).slice(0, 8);
  return <section className="markdown-home" data-testid="markdown-home"><h1>{name}</h1><div className="markdown-home-actions"><button type="button" className="quiet-button" onClick={onNew}>New note</button><button type="button" className="quiet-button" onClick={onPlugins}>Plugins</button></div>{notes.length > 0 && <><h2>Recently modified</h2><ul>{notes.map((file) => <li key={file.path}><button type="button" onClick={() => onOpen(file.path)}><span>{noteTitle(file.path)}</span><small>{noteFolder(file.path) || 'Vault root'}</small></button></li>)}</ul></>}</section>;
}
export function PluginUnavailable({ name, onSettings }: { name: string; onSettings: () => void }) {
  return <section className="markdown-home" data-testid="plugin-disabled"><p className="eyebrow">Plugin disabled</p><h1>{name}</h1><p className="markdown-home-lead">Your notes are still available in the file explorer.</p><button type="button" className="quiet-button" onClick={onSettings}>Manage plugins</button></section>;
}
