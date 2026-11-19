export const statisticsPlugin = {
  name: 'Statistics', group: 'Daily life', requires: ['periodic'], routes: ['statistics', 'summaries'],
  description: 'Review recorded time, habits and check-ins.',
  viewLabel: 'Initial analysis range', views: ['Monthly', 'Weekly', 'Yearly'],
  sections: [{ key: 'activity', label: 'Focus activity map' }, { key: 'habits', label: 'Habit history' }],
} as const;
