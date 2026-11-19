import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PreferenceIcon } from './icons';
import { SECTIONS, type Section } from './settingsSections';

interface Props {
  section: Section;
  query: string;
  onQuery: (query: string) => void;
  onNavigate: (section: Section) => void;
  action: ReactNode;
  status: string;
  error?: string;
}

export function SettingsToolbar({ section, query, onQuery, onNavigate, action, status, error }: Props) {
  const id = useId();
  const nav = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const term = query.trim().toLowerCase();
  const shown = SECTIONS.filter((item) => `${item.title} ${item.words}`.toLowerCase().includes(term));
  if (term) shown.sort((a, b) => Number(b.title.toLowerCase().startsWith(term)) - Number(a.title.toLowerCase().startsWith(term)));
  const browsing = expanded || !!term;
  useEffect(() => {
    // Reveal the current tab horizontally without scrolling the page under its toolbar.
    const strip = nav.current;
    const item = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !item) return;
    const bounds = strip.getBoundingClientRect(), tab = item.getBoundingClientRect();
    if (tab.right > bounds.right) strip.scrollLeft += tab.right - bounds.right;
    else if (tab.left < bounds.left) strip.scrollLeft -= bounds.left - tab.left;
  }, [section, query, expanded]);
  const choose = (target: Section) => { setExpanded(false); onNavigate(target); };
  const searchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { onQuery(''); setExpanded(false); }
    if (event.key === 'ArrowDown') { event.preventDefault(); nav.current?.querySelector('button')?.focus(); }
    if (event.key === 'Enter' && query.trim() && shown[0]) { event.preventDefault(); choose(shown[0].id); }
  };
  return <div className="settings-toolbar">
    <div className="settings-toolbar-line">
      <div className="settings-wordmark"><PreferenceIcon name="settings" /><h1>Settings</h1></div>
      <button type="button" className="settings-browse" aria-label="Browse settings sections" aria-controls={id} aria-expanded={browsing}
        onClick={() => { if (browsing) onQuery(''); setExpanded(!browsing); }}><PreferenceIcon name="sections" /></button>
      <label className="settings-finder"><PreferenceIcon name="search" />
        <input type="search" aria-label="Search settings" placeholder="Find a setting…" value={query}
          onChange={(event) => onQuery(event.target.value)} onKeyDown={searchKey} /></label>
      <div className="settings-save-tools">
        <span role="status" className={status === 'Saved' ? 'save-state' : undefined}>{status}</span>{action}
      </div>
    </div>
    <nav ref={nav} id={id} aria-label="Settings sections" className="settings-section-strip" data-expanded={browsing}>
      {shown.map((item) => <button type="button" key={item.id} aria-current={section === item.id ? 'page' : undefined}
        data-testid={`settings-nav-${item.id}`} onClick={() => choose(item.id)}><PreferenceIcon name={item.id} />{item.title}</button>)}
      {!shown.length && <span role="status" className="settings-no-match">No matching settings.</span>}
    </nav>
    {error && <div className="preferences-error" role="alert">{error}</div>}
  </div>;
}
