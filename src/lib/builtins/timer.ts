export const timerPlugin = {
  name: 'Focus timer', group: 'Planning', requires: ['periodic'],
  description: 'Time your work and save completed sessions to daily notes.',
  setup: { page: 'timer', label: 'Focus sessions & timer controls' },
} as const;
