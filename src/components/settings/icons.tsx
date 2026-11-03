export function PreferenceIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    day: 'M5 3v4m10-4v4M3 9h14M5 5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 12h2v2H7z',
    week: 'M5 3v4m10-4v4M3 9h14M5 5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M6 13h8',
    month: 'M5 3v4m10-4v4M3 9h14M5 5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M6 12h1m3 0h1m3 0h1M6 15h1m3 0h1m3 0h1',
    files: 'M3 6V4h5l2 2h7v10H3z',
    home: 'm2 9 8-6 8 6M4 8v9h4v-5h4v5h4V8',
    hotkeys: 'M2 5h16v11H2zM5 8h1m3 0h1m3 0h2M5 11h1m3 0h1m3 0h2M6 14h8',
    note: 'M5 2h7l4 4v12H5zM12 2v5h4M8 11h5m-5 3h5',
    folder: 'M2 6V4h6l2 2h8v11H2zM10 9v5m-2.5-2.5h5',
  };
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.files} /></svg>;
}
