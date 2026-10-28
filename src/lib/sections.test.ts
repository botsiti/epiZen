// @vitest-environment node
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSection, writeSection, WEEK_HEADINGS } from './sections';

// The vault's Obsidian weekly dashboard reads and saves Plus, Minus and Next with these two,
// copied as they are from Templates/Scripts/rpg-week.js. Epizen reads what they read, and writes
// what they write.
const obsidian = {
  extractSection(text: string, heading: string) {
    const lines = String(text || '').split(/\r?\n/);
    const starts: number[] = [];
    lines.forEach((line, index) => {
      if (new RegExp(`^#{3,6}\\s+${heading}\\s*$`, 'i').test(line.trim())) starts.push(index);
    });
    const blocks = [];
    for (const start of starts) {
      const out = [];
      for (let i = start + 1; i < lines.length; i++) {
        if (/^#{3,6}\s+/.test(lines[i] ?? '')) break;
        out.push(lines[i] ?? '');
      }
      const clean = out
        .map((line) => line.trim())
        .filter((line) => line && line !== '-' && line.toLowerCase() !== 'goals')
        .join('\n')
        .trim();
      if (clean) blocks.push(clean);
    }
    return blocks.join('\n\n').trim();
  },
  replaceSection(text: string, heading: string, value: string) {
    const lines = String(text || '').split(/\r?\n/);
    const headingRegex = new RegExp(`^#{3,6}\\s+${heading}\\s*$`, 'i');
    const start = lines.findIndex((line) => headingRegex.test(line.trim()));
    const cleanValue = String(value || '').trim();
    const replacement = cleanValue ? cleanValue.split(/\r?\n/) : [];
    if (start === -1) {
      const prefix = text.trimEnd();
      return `${prefix}${prefix ? '\n\n' : ''}#### ${heading}\n${replacement.join('\n')}\n`;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{3,6}\s+/.test(lines[i] ?? '')) {
        end = i;
        break;
      }
    }
    const next = [...lines.slice(0, start + 1), ...replacement, ...lines.slice(end)];
    return next.join('\n').replace(/\n{4,}/g, '\n\n\n');
  },
};

// demo-vault/Calendar/2026/weeks/2026-W40 - 28.09.26.md, from its hint under the quests: the week
// as the vault's weekly template leaves it, with two Plus headings, "Goals" and a lone "-".
const RUNNING = `Add real weekly quests with the **+ New quest** button in the Quests tab.

#### Plus
Goals

#### Plus
-

#### Minus
-

#### Next
-


#### Statistics
Average mood 4.0, focus 3.0, plan done 91.5% over 2 days.
`;

// demo-vault/Calendar/2026/weeks/2026-W39 - 21.09.26.md, its reflections.
const WRITTEN = `#### Plus
- Shipped on Friday

#### Minus
- Meetings ate Wednesday

#### Next
- Plan the month review

#### Statistics
`;

describe('readSection', () => {
  it("reads what the dashboard reads: no words in the template's Goals and dashes, the list items as they are", () => {
    expect(WEEK_HEADINGS.map((heading) => readSection(RUNNING, heading))).toEqual(['', '', '']);
    expect(WEEK_HEADINGS.map((heading) => readSection(WRITTEN, heading))).toEqual(['- Shipped on Friday', '- Meetings ate Wednesday', '- Plan the month review']);
  });

  it('joins every section of that name, a blank line between, and reads CRLF notes too', () => {
    const twice = RUNNING.replace('Goals', 'Two deep mornings').replace('#### Plus\n-', '#### Plus\n  Slept well  ');
    expect(readSection(twice, 'Plus')).toBe('Two deep mornings\n\nSlept well');
    expect(readSection(WRITTEN.replace(/\n/g, '\r\n'), 'Minus')).toBe('- Meetings ate Wednesday');
  });
});

describe('writeSection', () => {
  it("writes into the template's first Plus, as the dashboard's Save does, and leaves the second", () => {
    const saved = writeSection(RUNNING, 'Plus', 'Two deep mornings\nThe long run');
    expect(saved).toBe(RUNNING.replace('#### Plus\nGoals\n\n', '#### Plus\nTwo deep mornings\nThe long run\n'));
    expect(saved).toBe(obsidian.replaceSection(RUNNING, 'Plus', 'Two deep mornings\nThe long run'));
    expect(readSection(saved, 'Plus')).toBe('Two deep mornings\nThe long run');
  });

  it('puts Minus and Next in place of the dash, trimmed, up to the next heading', () => {
    expect(writeSection(RUNNING, 'Minus', '  Late nights\n')).toBe(RUNNING.replace('#### Minus\n-\n\n', '#### Minus\nLate nights\n'));
    expect(writeSection(RUNNING, 'Next', 'One day without news')).toBe(RUNNING.replace('#### Next\n-\n\n\n', '#### Next\nOne day without news\n'));
    expect(writeSection(WRITTEN, 'Next', '')).toBe(WRITTEN.replace('#### Next\n- Plan the month review\n\n', '#### Next\n'));
  });

  it('writes into the one section of the name that has words, and leaves two with words to the editor', () => {
    const second = RUNNING.replace('#### Plus\n-', '#### Plus\nSlept well');
    expect(writeSection(second, 'Plus', 'Slept well, ran twice')).toBe(RUNNING.replace('#### Plus\n-\n\n', '#### Plus\nSlept well, ran twice\n'));
    const both = second.replace('Goals', 'Shipped');
    expect(() => writeSection(both, 'Plus', 'x')).toThrow('2 Plus sections with words');
  });

  it('keeps CRLF, the last line break, and refuses mixed endings and a line that is a heading', () => {
    const crlf = WRITTEN.replace(/\n/g, '\r\n');
    expect(writeSection(crlf, 'Plus', 'a\nb')).toBe(crlf.replace('#### Plus\r\n- Shipped on Friday\r\n\r\n', '#### Plus\r\na\r\nb\r\n'));
    expect(writeSection('#### Next\n-\n', 'Next', 'x')).toBe('#### Next\nx\n');
    expect(() => writeSection('#### Plus\r\n-\n', 'Plus', 'x')).toThrow('mixes line endings');
    expect(() => writeSection(WRITTEN, 'Plus', 'fine\n#### Minus')).toThrow('new heading');
  });

  it('adds a missing heading at the end, as the dashboard does', () => {
    const plain = '#### Plus\n- Shipped\n';
    expect(writeSection(plain, 'Next', 'Rest')).toBe('#### Plus\n- Shipped\n\n#### Next\nRest\n');
    expect(writeSection(plain, 'Next', 'Rest')).toBe(obsidian.replaceSection(plain, 'Next', 'Rest'));
    expect(writeSection('', 'Minus', 'x')).toBe(obsidian.replaceSection('', 'Minus', 'x'));
  });
});

describe('on every weekly note of a copy of the demo vault', () => {
  const original = fileURLToPath(new URL('../../demo-vault', import.meta.url));
  let copy: string;
  beforeAll(() => {
    copy = join(mkdtempSync(join(tmpdir(), 'epizen-sections-')), 'demo-vault');
    cpSync(original, copy, { recursive: true });
  });
  afterAll(() => rmSync(join(copy, '..'), { recursive: true, force: true }));
  const weeks = () => readdirSync(join(copy, 'Calendar/2026/weeks')).filter((name) => name.endsWith('.md'));

  it('reads and writes Plus, Minus and Next exactly as the Obsidian dashboard does', () => {
    expect(weeks().length).toBe(10);
    for (const name of weeks()) {
      const text = readFileSync(join(copy, 'Calendar/2026/weeks', name), 'utf8');
      for (const heading of WEEK_HEADINGS) {
        expect(readSection(text, heading)).toBe(obsidian.extractSection(text, heading));
        for (const value of ['Slept before midnight', 'One\nTwo\n\n- three', '']) {
          expect(writeSection(text, heading, value)).toBe(obsidian.replaceSection(text, heading, value));
        }
      }
    }
  });
});
