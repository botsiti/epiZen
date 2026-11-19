export const habitsPlugin = {
  name: 'Habits', group: 'Daily life', requires: ['periodic'], routes: ['habits'],
  description: 'Keep a routine and see its history over time.',
  setup: { page: 'habits', label: 'Manage tracked habits' },
  viewLabel: 'Initial collection', views: ['Active', 'Archived', 'History'],
  sections: [{ key: 'today', label: 'Today’s progress' }],
} as const;
