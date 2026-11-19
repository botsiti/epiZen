import { textIdentity } from './text';

/** Keys are persisted in Markdown. Append new keys without changing existing ones. */
export const illustratedHabitIcons = [
  ['sunrise', 'Forest sunrise', 'morning outdoors nature trees walk'],
  ['moon', 'Crescent moon', 'sleep bedtime night routine'],
  ['tea', 'Tea cup', 'coffee drink break relax'],
  ['candle', 'Candle', 'reflect consciousness spiritual quiet'],
  ['hourglass', 'Hourglass', 'time focus timer useful hours'],
  ['book', 'Open book', 'read reading study learning no news'],
  ['strength', 'Dumbbell', 'lift gym workout exercise weights strength'],
  ['lotus', 'Lotus', 'meditation mindfulness yoga breathe'],
  ['sprout', 'Sprout', 'grow gardening plants nature'],
  ['water-glass', 'Glass of water', 'drink hydration healthy'],
  ['running-shoe', 'Running shoe', 'walk run jogging cardio steps training'],
  ['apple', 'Apple', 'fruit nutrition food snack'],
  ['toothbrush', 'Toothbrush', 'teeth dental brushing hygiene'],
  ['alarm-clock', 'Alarm clock', 'sleep schedule wake up morning punctual time'],
  ['stretch', 'Stretch', 'stretching yoga mobility warmup exercise'],
  ['bicycle', 'Bicycle', 'cycling ride commute cardio exercise'],
  ['hiking-boots', 'Hiking boots', 'walk trails outdoor mountain hike steps'],
  ['capsule', 'Capsule', 'medicine vitamins supplements health'],
  ['soup', 'Soup bowl', 'cook meal food dinner lunch nutrition'],
  ['sugar-shield', 'Sugar shield', 'no sweets dessert sugar candy fast food'],
  ['jump-rope', 'Jump rope', 'skipping cardio workout exercise'],
  ['pillow', 'Pillow', 'rest sleep bedtime nap recovery'],
  ['horizon', 'Sun over hills', 'sunrise morning early outdoors daylight'],
  ['goggles', 'Swim goggles', 'swimming pool water laps sport'],
  ['orange', 'Orange slice', 'fruit citrus nutrition food snack'],
  ['headphones', 'Headphones', 'listen podcast audio music focus'],
  ['paintbrush', 'Paintbrush', 'draw paint art creative craft'],
  ['guitar', 'Guitar', 'music instruments practice strings'],
  ['camera', 'Camera', 'photo photography creative video'],
  ['piano', 'Piano keys', 'keyboard music practice instrument'],
  ['cactus', 'Cactus', 'plant gardening water nature'],
  ['laundry', 'Laundry basket', 'wash clothes tidy chores home'],
  ['broom', 'Broom', 'clean sweep tidy chores home'],
  ['notebook', 'Notebook', 'journal journaling writing study gratitude'],
  ['laptop', 'Laptop', 'code coding computer work study screen'],
  ['coins', 'Coins', 'money finance budget savings spending'],
  ['envelope', 'Envelope', 'mail inbox writing email correspondence'],
  ['chess', 'Chess knight', 'board game strategy puzzle practice'],
  ['paw', 'Paw print', 'pet cat dog play walk care animal'],
  ['hearts', 'Linked hearts', 'family relationship friends social love'],
  ['compass', 'Compass', 'travel plan explore adventure direction'],
] as const;

const emojiIcons = [
  ['🌿', 'Leaf'], ['💧', 'Water'], ['📖', 'Book'], ['👟', 'Walk'], ['🧠', 'Mind'], ['🌙', 'Moon'],
  ['☀️', 'Sun'], ['💪', 'Strength'], ['🎵', 'Music'], ['✍️', 'Pen'], ['❤️', 'Heart'], ['🏔️', 'Mountain'],
].map(([id, name]) => [id!, name!, ''] as const);

export const habitIconOptions = [...illustratedHabitIcons, ...emojiIcons];

const searchText = (text: string) => textIdentity(text).normalize('NFKD').replace(/\p{M}/gu, '');

export function searchHabitIcons(query: string) {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  return habitIconOptions.filter(([id, name, keywords]) => {
    const text = searchText([id, name, keywords].join(' '));
    return terms.every((term) => text.includes(term));
  });
}
