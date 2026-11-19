export const homePlugin = {
  name: 'Homepage', group: 'Workspace', routes: ['home'],
  description: 'A personal dashboard for your days, progress and collections.',
  setup: { page: 'home', label: 'Homepage details' },
} as const;
