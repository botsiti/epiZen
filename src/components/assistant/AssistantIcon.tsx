export function AssistantIcon({ name }: { name: 'settings' | 'history' | 'close' }) {
  const path = {
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
    history: 'M4 5h16M4 12h16M4 19h10',
    close: 'm6 6 12 12M18 6 6 18',
  }[name];
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}
