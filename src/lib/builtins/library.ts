export const libraryPlugin = {
  name: 'Library', group: 'Workspace', routes: ['library'],
  description: 'Collect books, music, films, podcasts and videos.',
  setup: { page: 'library', label: 'Sources & artwork' },
} as const;
