import { describe, expect, it } from 'vitest';
import { readMonthlySection, readSphere, sphereValue, writeMonthlySection } from './monthlyReview';

const original = '---\ntype: monthly\n---\n\n## Month Summary\n```dataview\ntable mood\n## Monthly reflection\n```\n\n## Notes\nKeep this, exactly.\n';

describe('monthly review sections', () => {
  it.each(['\n', '\r\n'])('adds independent sections without changing other Markdown (%s)', (eol) => {
    const text = original.replaceAll('\n', eol);
    const first = writeMonthlySection(text, 'summary', 'A thoughtful month.', '');
    expect(first.startsWith(text)).toBe(true);
    const second = writeMonthlySection(first, 'expenses', 'Travel and rent.\n\n![[receipt.png]]', '');
    const rating = sphereValue('7', 'I made time to rest.');
    const third = writeMonthlySection(second, 'sphere:Health/Fitness', rating, '');
    expect(third.startsWith(second)).toBe(true);
    expect(readMonthlySection(third, 'summary').value).toBe('A thoughtful month.');
    expect(readMonthlySection(third, 'expenses').value).toBe('Travel and rent.\n\n![[receipt.png]]');
    expect(readSphere(readMonthlySection(third, 'sphere:Health/Fitness').value)).toEqual({ rating: '7', notes: 'I made time to rest.' });
    expect(writeMonthlySection(third, 'summary', 'A thoughtful month.', readMonthlySection(third, 'summary').snapshot)).toBe(third);
    const changed = writeMonthlySection(third, 'summary', 'A different month.', readMonthlySection(third, 'summary').snapshot);
    expect(changed).toBe(third.replace('A thoughtful month.', 'A different month.'));
  });

  it('preserves a draft on outside changes and refuses ambiguous or unsafe input', () => {
    const text = `${original}\n## Monthly reflection\nBefore\n`;
    const shown = readMonthlySection(text, 'summary');
    expect(() => writeMonthlySection(text.replace('Before', 'Outside edit'), 'summary', 'My draft', shown.snapshot)).toThrow('changed outside');
    const duplicate = `${text}\n## Monthly reflection\nAnother\n`;
    expect(readMonthlySection(duplicate, 'summary').problem).toMatch(/more than one/);
    expect(() => writeMonthlySection(duplicate, 'summary', 'Draft', '')).toThrow(/more than one/);
    expect(() => writeMonthlySection(text, 'summary', 'Text\n## Other heading', shown.snapshot)).toThrow('level 3');
    expect(() => writeMonthlySection(text + '\r\n', 'expenses', 'Text', '')).toThrow('line endings');
    expect(() => sphereValue('11', '')).toThrow('0 to 10');
  });

  it('ignores frontmatter and commented headings, and refuses unfinished Markdown containers', () => {
    const text = '---\nnotes: |\n  ## Monthly reflection\n  Keep this YAML.\n---\n\nReal note. <!--\n## Monthly reflection\nHidden.\n-->\n';
    const written = writeMonthlySection(text, 'summary', 'A reflection.', '');
    expect(written.startsWith(text)).toBe(true);
    expect(readMonthlySection(written, 'summary').value).toBe('A reflection.');
    const withBom = `\uFEFF${text}`;
    expect(writeMonthlySection(withBom, 'summary', 'A reflection.', '').startsWith(withBom)).toBe(true);
    const severalComments = 'Intro <!-- first --> <!-- second\n## Monthly reflection\nHidden.\n-->\n';
    expect(writeMonthlySection(severalComments, 'summary', 'A reflection.', '').startsWith(severalComments)).toBe(true);
    expect(() => writeMonthlySection('---\ntitle: unfinished\n', 'summary', 'Words', '')).toThrow('unclosed frontmatter');
    expect(() => writeMonthlySection('```md\nunfinished\n', 'summary', 'Words', '')).toThrow('unclosed code fence');
    expect(() => writeMonthlySection('Text\n<!-- unfinished', 'summary', 'Words', '')).toThrow('unclosed comment');
    expect(writeMonthlySection('', 'summary', '```md\n## A code example\n```', '')).toContain('## A code example');
    expect(() => writeMonthlySection('', 'summary', '```md\nunfinished', '')).toThrow('unclosed code fence');
  });

  it('shows an older plain Month Summary without changing it and detects edits to it', () => {
    const text = '## Month Summary\nAn earlier reflection.\n\n## Other\nKeep this.\n';
    const shown = readMonthlySection(text, 'summary');
    expect(shown.value).toBe('An earlier reflection.');
    expect(writeMonthlySection(text, 'summary', shown.value, shown.snapshot)).toBe(text);
    expect(() => writeMonthlySection(text.replace('earlier', 'outside'), 'summary', 'My draft.', shown.snapshot)).toThrow('changed outside');
    const updated = writeMonthlySection(text, 'summary', 'An updated reflection.', shown.snapshot);
    expect(updated).toBe(text.replace('An earlier reflection.', 'An updated reflection.'));
    expect(readMonthlySection(updated, 'summary').value).toBe('An updated reflection.');
    const cleared = writeMonthlySection(text, 'summary', '', shown.snapshot);
    expect(readMonthlySection(cleared, 'summary').value).toBe('');
    expect(cleared).toBe(text.replace('An earlier reflection.\n', ''));
  });

  it('round-trips trailing blank lines in a draft without accumulating them', () => {
    const text = '## Monthly reflection\nOld\n\n## Other\nKeep this.\n';
    const first = writeMonthlySection(text, 'summary', 'First\n\n', readMonthlySection(text, 'summary').snapshot);
    expect(readMonthlySection(first, 'summary').value).toBe('First\n\n');
    const second = writeMonthlySection(first, 'summary', 'Second\n', readMonthlySection(first, 'summary').snapshot);
    expect(readMonthlySection(second, 'summary').value).toBe('Second\n');
    expect(second).toBe('## Monthly reflection\nSecond\n\n\n## Other\nKeep this.\n');
    expect(writeMonthlySection(second, 'summary', 'Second\n', readMonthlySection(second, 'summary').snapshot)).toBe(second);
  });

  it.each(['\n', '\r\n'])('reads and updates the existing Obsidian monthly sections in place (%s)', (eol) => {
    const text = [
      '---', 'cssclasses: [rpg-month]', '---', '',
      '### Spheres of Life', '- Career/Work: 8 — Projects', '- Health/Fitness: 5 — Rest and running', '- Social: 0', '',
      '### Expenses', '![[expenses.png]]', 'Rent and travel.', '',
      '### Month Summary', 'A meaningful month.', '',
      '### Other', 'Leave this unchanged.', '',
    ].join(eol);
    const health = readMonthlySection(text, 'sphere:Health/Fitness');
    expect(readSphere(health.value)).toEqual({ rating: '5', notes: 'Rest and running' });
    expect(readSphere(readMonthlySection(text, 'sphere:Social').value).rating).toBe('0');
    expect(readMonthlySection(text, 'expenses').value).toBe('![[expenses.png]]\nRent and travel.');
    expect(readMonthlySection(text, 'summary').value).toBe('A meaningful month.');
    const rated = writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('7', 'Feeling better'), health.snapshot);
    expect(rated).toBe(text.replace('- Health/Fitness: 5 — Rest and running', '- Health/Fitness: 7 — Feeling better'));
    const expenses = readMonthlySection(rated, 'expenses');
    const spent = writeMonthlySection(rated, 'expenses', '![[expenses.png]]\nRent, travel and books.', expenses.snapshot);
    expect(spent).toBe(rated.replace('Rent and travel.', 'Rent, travel and books.'));
    const summary = readMonthlySection(spent, 'summary');
    expect(writeMonthlySection(spent, 'summary', 'Updated reflection.', summary.snapshot)).toBe(spent.replace('A meaningful month.', 'Updated reflection.'));
    expect(() => writeMonthlySection(rated.replace('Feeling better', 'Outside edit'), 'sphere:Health/Fitness', sphereValue('8', 'My draft'), readMonthlySection(rated, 'sphere:Health/Fitness').snapshot)).toThrow('changed outside');
    expect(() => writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('7', 'Two\nlines'), health.snapshot)).toThrow('one line');
    expect(writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('0', 'Rest'), health.snapshot)).toContain('- Health/Fitness: 0 — Rest');
  });

  it('keeps other life areas when adding or removing a rating and refuses ambiguous nested data', () => {
    const text = '### Spheres of Life\n- Career/Work: 8 — Work\n- Social: 5 — Friends\n\n### Expenses\nRent\n';
    const added = writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('6', 'Exercise'), readMonthlySection(text, 'sphere:Health/Fitness').snapshot);
    expect(added).toContain('- Health/Fitness: 6 — Exercise');
    expect(added).toContain('- Career/Work: 8 — Work\n- Social: 5 — Friends');
    const removed = writeMonthlySection(added, 'sphere:Health/Fitness', '', readMonthlySection(added, 'sphere:Health/Fitness').snapshot);
    expect(removed).toBe(text);
    const duplicate = text.replace('- Social: 5 — Friends', '- Social: 5 — Friends\n- Social: 4 — Again');
    expect(readMonthlySection(duplicate, 'sphere:Social').problem).toMatch(/more than one/);
    const nested = text.replace('- Social: 5 — Friends', '- Social: 5 — Friends\n  A nested paragraph.');
    expect(readMonthlySection(nested, 'sphere:Social').problem).toMatch(/nested/);
    expect(readMonthlySection('## Expenses and finances\nText\n### Spheres of Life\n- Social: 4\n', 'expenses').problem).toMatch(/contains another monthly section/);
  });

  it('preserves an existing life-area line’s spacing and comment when only its rating changes', () => {
    const text = '### Spheres of Life\n  *  Health/Fitness :   5  -  A carefully spaced comment.  \n';
    const entry = readMonthlySection(text, 'sphere:Health/Fitness');
    const result = writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('7', 'A carefully spaced comment.'), entry.snapshot);
    expect(result).toBe(text.replace('   5  -', '   7  -'));
  });
});

it('stores decisions independently and normalizes manually entered spending', async () => {
  const { spendingValue, readSpending, spendingLabel } = await import('./monthlyReview');
  const amount = spendingValue('150,000.50', 'rub');
  expect(readSpending(amount)).toEqual({ amount: '150000.5', currency: 'RUB' });
  expect(spendingLabel(amount)).toBe('150,000.5 RUB');
  expect(spendingLabel(spendingValue('0', ''))).toBe('0');
  expect(spendingLabel('')).toBe('—');
  for (const invalid of ['-10', '150,00', '1e5', 'NaN']) expect(() => spendingValue(invalid, '')).toThrow();
  expect(() => spendingValue('100', 'money')).toThrow('currency');
  let text = writeMonthlySection(original, 'decisions', 'Choose a quieter place.\n\nRevisit in December.', '');
  text = writeMonthlySection(text, 'spending', amount, '');
  expect(text.startsWith(original)).toBe(true);
  expect(readMonthlySection(text, 'summary').value).toBe('');
  expect(readMonthlySection(text, 'decisions').value).toContain('Revisit in December.');
  const section = readMonthlySection(text, 'spending');
  expect(writeMonthlySection(text, 'spending', amount, section.snapshot)).toBe(text);
  expect(() => writeMonthlySection(text.replace('150000.5', '200000'), 'spending', spendingValue('500', ''), section.snapshot)).toThrow('changed outside');
});
