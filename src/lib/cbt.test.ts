import { describe, expect, it } from 'vitest';
import { addRecord, deleteRecord, emotionOf, parseRecords, recordRow, updateRecord, type RecordInput } from './cbt';

// The stream section as the vault's daily template writes it (Templates/Daily Note.md), with one record filled in.
const STREAM = `### Tasks
- [ ] #daily/code — fix it [minutes::30]

### stream of consciousness
reflection on good thoughts:

Recognise irrational thoughts → dispute them → find rational

| **situation/self-criticism** | **emotions** | **[[10 когнитивных искажений (cognitive distortion)\\|cognitive distortion]]** | **rational response** | **emotions after** |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------ | --------------------- | ------------------ |
|                              |              |                                                                                |                       |                    |
| [21:04] Reviewed the day and thought "I'm falling behind" | Disappointed, Anxious | All-or-nothing | Partial still counts. | Calm |

#### Notes created this day
`;

const INPUT: RecordInput = {
  situation: 'Missed the gym | again\nand felt bad',
  before: ['Guilty'],
  distortions: ['Labeling', 'Should statements'],
  balanced: 'One day is not a habit.',
  after: ['Calm', 'Relieved'],
};

describe('parseRecords', () => {
  it('reads filled rows, their time and lists, and skips the empty template row', () => {
    const [record, ...rest] = parseRecords(STREAM);
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      line: 11,
      time: '21:04',
      situation: 'Reviewed the day and thought "I\'m falling behind"',
      before: ['Disappointed', 'Anxious'],
      distortions: ['All-or-nothing'],
      balanced: 'Partial still counts.',
      after: ['Calm'],
    });
  });

  it('keeps an escaped pipe inside its cell', () => {
    const text = addRecord(STREAM, INPUT, '07:30');
    expect(parseRecords(text)[1]).toMatchObject({ situation: 'Missed the gym | again and felt bad', before: ['Guilty'], after: ['Calm', 'Relieved'] });
  });

  it('finds nothing without the table', () => {
    expect(parseRecords('### stream of consc\nfree text\n')).toEqual([]);
  });
});

describe('recordRow', () => {
  it('stamps the time, joins lists with commas, escapes pipes and folds new lines', () => {
    expect(recordRow(INPUT, '07:30')).toBe('| [07:30] Missed the gym \\| again and felt bad | Guilty | Labeling, Should statements | One day is not a habit. | Calm, Relieved |');
  });
});

describe('addRecord', () => {
  it("adds one row after the table's last row and changes nothing else", () => {
    const after = addRecord(STREAM, INPUT, '07:30');
    const lines = after.split('\n');
    expect(lines[12]).toBe(recordRow(INPUT, '07:30'));
    expect(lines.filter((_, i) => i !== 12)).toEqual(STREAM.split('\n'));
  });

  it('keeps CRLF', () => {
    const crlf = STREAM.replace(/\n/g, '\r\n');
    expect(addRecord(crlf, INPUT, '07:30')).toBe(addRecord(STREAM, INPUT, '07:30').replace(/\n/g, '\r\n'));
  });

  it('adds the table to the stream section when it has none', () => {
    const text = '### stream of consc\nLess news.\n\n## Later\n';
    const after = addRecord(text, INPUT, '07:30');
    expect(after.startsWith('### stream of consc\nLess news.\n\n| **situation/self-criticism**')).toBe(true);
    expect(after.endsWith(`${recordRow(INPUT, '07:30')}\n\n## Later\n`)).toBe(true);
    expect(parseRecords(after)).toHaveLength(1);
  });

  it('adds a stream section at the end of a note that has none', () => {
    const after = addRecord('# Day\n', INPUT, '07:30');
    expect(after.startsWith('# Day\n\n### stream of consciousness\n\n| **situation')).toBe(true);
    expect(after.endsWith(`${recordRow(INPUT, '07:30')}\n`)).toBe(true);
  });

  it('refuses mixed line endings', () => {
    expect(() => addRecord('a\r\nb\n', INPUT, '07:30')).toThrow(/line endings/);
  });
});

describe('updateRecord and deleteRecord', () => {
  const [record] = parseRecords(STREAM);
  if (!record) throw new Error('no record');

  it('rewrites that one row, keeping its time', () => {
    const after = updateRecord(STREAM, record, INPUT);
    const lines = after.split('\n');
    expect(lines[11]).toBe(recordRow(INPUT, '21:04'));
    expect(lines.filter((_, i) => i !== 11)).toEqual(STREAM.split('\n').filter((_, i) => i !== 11));
  });

  it('takes that one row out', () => {
    expect(deleteRecord(STREAM, record)).toBe(STREAM.replace(`${record.raw}\n`, ''));
  });

  it('refuses when the row has changed in the note', () => {
    const changed = STREAM.replace('Partial still counts.', 'Edited in Obsidian.');
    expect(() => updateRecord(changed, record, INPUT)).toThrow(/changed/);
    expect(() => deleteRecord(changed, record)).toThrow(/changed/);
  });
});

describe('emotionOf', () => {
  it("finds a shade's core emotion, in any case", () => {
    expect(emotionOf('lonely')?.name).toBe('Sad');
    expect(emotionOf('Calm')?.name).toBe('Peaceful');
    expect(emotionOf('guilt')).toBeUndefined();
  });
});
