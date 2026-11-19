export const periodicPlugin = {
  name: 'Periodic notes', group: 'Daily life',
  description: 'Daily, weekly and monthly notes, with calendar navigation.',
  setup: { page: 'periodic', label: 'Folders, dates & templates' },
  viewLabel: 'Open daily notes on', views: ['Remember last tab', 'Overview', 'Tasks', 'Habits', 'Quests', 'CBT'],
} as const;
