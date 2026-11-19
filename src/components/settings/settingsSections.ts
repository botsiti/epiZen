export const SECTIONS = [
  { id: 'plugins', title: 'Plugins', words: 'enable disable epiBase bases home library habits cbt check-ins mood energy focus social sleep calendar time zone timezone graph timer menu bar sound spike assistant companion' },
  { id: 'home', title: 'Homepage', words: 'birth birthday memento lifetime years sections dashboard' },
  { id: 'periodic', title: 'Periodic notes', words: 'daily task categories tags rewards weekly monthly import dates calendar habits thought records format folder' },
  { id: 'habits', title: 'Habits', words: 'routine track archive reactivate continue history schedule' },
  { id: 'timer', title: 'Focus timer', words: 'pomodoro stopwatch minutes rest recovery' },
  { id: 'library', title: 'Library', words: 'books podcasts movies films music albums library sources artwork' },
  { id: 'quests', title: 'Quests', words: 'task categories life spheres rewards points productivity focus timer' },
  { id: 'files', title: 'Files & folders', words: 'new note create folder location' },
  { id: 'spike', title: 'Spike', words: 'assistant voice connection api companion desktop microphone' },
  { id: 'appearance', title: 'Appearance', words: 'glass transparent opacity animation background theme' },
  { id: 'hotkeys', title: 'Hotkeys', words: 'keyboard shortcuts commands' },
] as const;
export type Section = typeof SECTIONS[number]['id'];
