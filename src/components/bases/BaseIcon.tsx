const paths: Record<string, string> = {
  Views: 'M2 3h12v10H2zM2 6h12M6 6v7',
  Sort: 'M5 2v12m-3-3 3 3 3-3M11 14V2m-3 3 3-3 3 3',
  Group: 'M2 3h12v3H2zM2 8h12v5H2z',
  Filter: 'M2 3h12M4 7h8M6 11h4',
  Properties: 'M2 3h3v3H2zM2 10h3v3H2zM8 4.5h6M8 11.5h6',
};
export function BaseIcon({ name }: { name: string }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.Views} /></svg>;
}
