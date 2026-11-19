export const questsPlugin = {
  name: 'Quests', group: 'Daily life', requires: ['periodic'], routes: ['quests'],
  description: 'Turn goals into weekly and monthly adventures.',
  setup: { page: 'quests', label: 'Life spheres & XP' },
  sections: [{ key: 'progress', label: 'Quest XP and progress summary' }],
} as const;
