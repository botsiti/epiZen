export const calendarPlugin = {
  name: 'Calendar', group: 'Planning', requires: ['periodic'], routes: ['calendar'],
  description: 'Plan time alongside your local Apple calendars.',
  viewLabel: 'Initial calendar view', views: ['Remember last view', 'Week', 'Day'],
} as const;
