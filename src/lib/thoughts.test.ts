import { describe, expect, it } from 'vitest';
import { CHANGED_ELSEWHERE, firstThoughtLead, replaceThoughts, splitThoughts } from './thoughts';

// demo-vault/Rating/kino/Static Bloom.md, as written.
const FILM = `---
Year: 2024
Watched: 2026-09-21
genre:
  - sci-fi
rating: 68
---
[[00. Kino 2026]]

![[static-bloom.svg|200]]

Watched on [[21.09.2026]]. Would watch again with friends.
`;
const HEAD = FILM.slice(0, FILM.indexOf('Watched on'));

// The owner's vault writes the overview link and the text with no blank line between them.
const TIGHT = '---\nDirector: Max Mayer\nRating: 40\n---\n[[00. Kino 2024 MOC]]\nAdam, a lonely man.\n';
// And most albums have no text at all yet.
const EMPTY = '---\nArtist: Suede\nrating: 64\n---\n[[00. Music 2024 MOC]]\n';

describe('splitThoughts', () => {
  it('keeps the properties, the overview link and the cover above the text', () => {
    const parts = splitThoughts(FILM);
    expect(parts.properties).toBe(FILM.slice(0, FILM.indexOf('[[00.')));
    expect(parts.links).toBe('[[00. Kino 2026]]\n\n![[static-bloom.svg|200]]\n\n');
    expect(parts.thoughts).toBe('Watched on [[21.09.2026]]. Would watch again with friends.\n');
    expect(parts.properties + parts.links + parts.thoughts).toBe(FILM);
  });

  it('starts the text on its first line that is more than links, even right under the link', () => {
    expect(splitThoughts(TIGHT).thoughts).toBe('Adam, a lonely man.\n');
    expect(splitThoughts('---\nrating: 1\n---\nA link to [[Elsewhere]] in a sentence.\n').thoughts).toBe('A link to [[Elsewhere]] in a sentence.\n');
  });

  it('finds no text in a note that has only its link, or nothing under its properties', () => {
    expect(splitThoughts(EMPTY)).toEqual({ properties: '---\nArtist: Suede\nrating: 64\n---\n', links: '[[00. Music 2024 MOC]]\n', thoughts: '' });
    expect(splitThoughts('---\nrating: 1\n---\n').thoughts).toBe('');
  });

  it('keeps a CRLF note whole', () => {
    const crlf = FILM.replaceAll('\n', '\r\n');
    const parts = splitThoughts(crlf);
    expect(parts.thoughts).toBe('Watched on [[21.09.2026]]. Would watch again with friends.\r\n');
    expect(parts.properties + parts.links + parts.thoughts).toBe(crlf);
  });
});

describe('replaceThoughts', () => {
  it('rewrites the text and nothing above it', () => {
    expect(replaceThoughts(FILM, splitThoughts(FILM).thoughts, 'Better the second time.\n')).toBe(`${HEAD}Better the second time.\n`);
    expect(replaceThoughts(TIGHT, 'Adam, a lonely man.\n', 'Gentle.')).toBe('---\nDirector: Max Mayer\nRating: 40\n---\n[[00. Kino 2024 MOC]]\nGentle.');
  });

  it('gives a first thought its own paragraph under the link', () => {
    expect(firstThoughtLead(EMPTY)).toBe('\n');
    expect(replaceThoughts(EMPTY, '', '\nWeird and lovely.')).toBe(`${EMPTY}\nWeird and lovely.`);
    // Under a blank line already, or with no link to keep apart from: nothing more.
    expect(firstThoughtLead(`${EMPTY}\n`)).toBe('');
    expect(firstThoughtLead('---\nrating: 1\n---\n')).toBe('');
    // A last line with no line break gets one first.
    expect(firstThoughtLead('---\nrating: 1\n---\n[[00. Books]]')).toBe('\n\n');
    expect(firstThoughtLead('---\nrating: 1\n---')).toBe('\n');
    expect(firstThoughtLead(EMPTY.replaceAll('\n', '\r\n'))).toBe('\r\n');
  });

  it('leaves the note as it was when a first thought is typed and erased', () => {
    for (const note of [EMPTY, `${EMPTY}\n`, '---\nrating: 1\n---\n', '---\nrating: 1\n---\n[[00. Books]]', '---\nrating: 1\n---', EMPTY.replaceAll('\n', '\r\n')]) {
      const lead = firstThoughtLead(note);
      const typed = replaceThoughts(note, '', `${lead}W`);
      expect(splitThoughts(typed).thoughts, JSON.stringify(note)).toBe('W');
      expect(replaceThoughts(typed, `${lead}W`, ''), JSON.stringify(note)).toBe(note);
    }
  });

  it('keeps a rating set while the text was being written', () => {
    const rated = FILM.replace('rating: 68', 'rating: 75');
    expect(replaceThoughts(rated, splitThoughts(FILM).thoughts, 'New.\n')).toBe(`${HEAD.replace('rating: 68', 'rating: 75')}New.\n`);
  });

  it('can take the text away, leaving the lines above it', () => {
    expect(replaceThoughts(FILM, splitThoughts(FILM).thoughts, '')).toBe(HEAD);
  });

  it('keeps a text that is only a link as text the next time', () => {
    const once = replaceThoughts(EMPTY, '', '\n[[Radiohead]]');
    expect(replaceThoughts(once, '\n[[Radiohead]]', '\n[[Radiohead]] and [[Portishead]]')).toBe(`${EMPTY}\n[[Radiohead]] and [[Portishead]]`);
  });

  it('refuses when the text changed somewhere else, rather than write over it', () => {
    const edited = FILM.replace('with friends.', 'with friends. And alone.');
    expect(() => replaceThoughts(edited, splitThoughts(FILM).thoughts, 'Mine.\n')).toThrow(CHANGED_ELSEWHERE);
    // A first thought, where Obsidian has meanwhile written one.
    expect(() => replaceThoughts(TIGHT, '', 'Mine.')).toThrow(CHANGED_ELSEWHERE);
    // Words put in front of the text, which a write would mix with these.
    expect(() => replaceThoughts(TIGHT.replace('Adam, a lonely man.', 'Not Adam, a lonely man.'), 'a lonely man.\n', 'a man.\n')).toThrow(CHANGED_ELSEWHERE);
    expect(() => replaceThoughts(TIGHT.replace('Adam,', 'First.\n\nAdam,'), 'Adam, a lonely man.\n', 'Adam.\n')).toThrow(CHANGED_ELSEWHERE);
  });

  it('leaves the note as it is when nothing changed', () => {
    expect(replaceThoughts(FILM, splitThoughts(FILM).thoughts, splitThoughts(FILM).thoughts)).toBe(FILM);
    expect(replaceThoughts(EMPTY, '', '')).toBe(EMPTY);
  });
});
