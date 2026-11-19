export const cbtPlugin = {
  name: 'CBT', group: 'Daily life', requires: ['periodic'],
  description: 'Thought records and a space to reflect on your thinking.',
  sections: [{ key: 'emotions', label: 'Emotion tags on thought records' }],
} as const;
