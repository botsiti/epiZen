export const SECTIONS = [
  { id: 'plugins', title: 'Plugins', hint: 'Choose the tools available in this vault.', words: 'enable disable epiBase bases home library habits cbt check-ins mood energy focus social sleep calendar time zone timezone graph timer menu bar sound spike assistant companion' },
  { id: 'home', title: 'Homepage', hint: 'Personalize your dashboard and lifetime horizon.', words: 'birth birthday memento lifetime years sections dashboard' },
  { id: 'periodic', title: 'Periodic notes', hint: 'Manage task categories, note locations and date formats.', words: 'daily task categories tags rewards weekly monthly import dates calendar habits thought records format folder' },
  { id: 'habits', title: 'Habits', hint: 'Choose which habits appear in your daily notes.', words: 'routine track archive reactivate continue history schedule' },
  { id: 'timer', title: 'Focus timer', hint: 'Choose a task, time a focus session or take a break.', words: 'pomodoro stopwatch minutes rest recovery' },
  { id: 'library', title: 'Library', hint: 'Choose the catalogues and artwork used for your collection.', words: 'books podcasts movies films music albums library sources artwork' },
  { id: 'quests', title: 'Quests', hint: 'Choose which activities earn XP and where the points go.', words: 'task categories life spheres rewards points productivity focus timer' },
  { id: 'files', title: 'Files & folders', hint: 'Choose where new notes and folders are created.', words: 'new note create folder location' },
  { id: 'spike', title: 'Spike', hint: 'Manage your companion, connection, voice and permissions.', words: 'assistant voice connection api companion desktop microphone' },
  { id: 'appearance', title: 'Appearance', hint: 'Choose how Epizen looks across all your vaults.', words: 'glass transparent opacity animation background theme' },
  { id: 'hotkeys', title: 'Hotkeys', hint: 'Find the keyboard shortcuts for your workspace.', words: 'keyboard shortcuts commands' },
] as const;
export type Section = typeof SECTIONS[number]['id'];
