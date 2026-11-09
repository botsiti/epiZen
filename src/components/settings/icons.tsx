export function PreferenceIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    plugins: 'M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z',
    bases: 'M2 4h16v13H2zM2 8h16M7 8v9',
    library: 'M3 3h4v14H3zM8 5h4v12H8zM13 4l3-1 3 13-3 1z',
    habits: 'M4 10l4 4 8-9M2 3h16v15H2z',
    cbt: 'M3 3h14v10H8l-5 4zM6 7h8m-8 3h5',
    checkins: 'M3 15V9m5 6V5m5 10v-7m5 7V3',
    graph: 'M5 5l10 2-5 9zM3 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0M13 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0M8 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
    timer: 'M8 2h4M10 2v3M10 8v4l3 2M3 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0',
    quests: 'M4 18V3m0 0h11l-3 4 3 4H4',
    statistics: 'M3 17h14M5 14V9m5 5V3m5 11V6',
    calendar: 'M5 3v4m10-4v4M3 9h14M4 5h12v12H4zM7 12h2v2H7z',
    periodic: 'M5 3v4m10-4v4M3 9h14M5 5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M6 12h1m3 0h1m3 0h1M6 15h1m3 0h1m3 0h1',
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
