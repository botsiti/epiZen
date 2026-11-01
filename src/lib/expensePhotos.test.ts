import { describe, expect, it } from 'vitest';
import { addExpensePhoto, editExpenseText, expensePhotos, expenseText, removeExpensePhoto } from './expensePhotos';

describe('the money editor’s photo projection', () => {
  it('hides image syntax while preserving exact unchanged text and other Markdown', () => {
    const raw = '![[Expenses chart.png|400]]\nRent and travel.\n\n- Keep this list\n![Receipt](receipt.jpg)\n';
    expect(expenseText(raw)).toBe('Rent and travel.\n\n- Keep this list\n');
    expect(editExpenseText(raw, expenseText(raw))).toBe(raw);
    expect(editExpenseText(raw, 'Rent and books.\n\n- Keep this list\n')).toBe(raw.replace('Rent and travel.', 'Rent and books.'));
    expect(expensePhotos(raw).map((photo) => photo.target)).toEqual(['Expenses chart.png', 'receipt.jpg']);
  });

  it('keeps every photo even when a text selection crosses one', () => {
    const raw = 'Before ![[one.png]] middle ![[two.jpg]] after';
    const updated = editExpenseText(raw, 'A replacement');
    expect(expensePhotos(updated).map((photo) => photo.target)).toEqual(['one.png', 'two.jpg']);
    expect(expenseText(updated)).toBe('A replacement');
    const betweenLines = 'Before\n![[chart.png|300]]\nAfter';
    const replaced = editExpenseText(betweenLines, 'A replacement');
    expect(expenseText(replaced)).toBe('A replacement');
    expect(expensePhotos(replaced).map((photo) => photo.embed)).toEqual(['![[chart.png|300]]']);
  });

  it('keeps photo order and exactly the text typed across common placements', () => {
    const samples = [
      '![[one.png]]\nBefore\n![[two.png]]\nAfter',
      'Before ![[one.png]] between ![[two.png]] after',
      'Before\n![[one.png]]\nAfter\n![[two.png]]',
    ];
    for (const raw of samples) for (const text of ['', 'A replacement', 'A\nB']) {
      const result = editExpenseText(raw, text);
      expect(expenseText(result)).toBe(text);
      expect(expensePhotos(result).map((photo) => photo.target)).toEqual(['one.png', 'two.png']);
    }
  });

  it('adds and removes links without deleting or changing other text', () => {
    const original = '![[old.png]]\nA note.';
    const next = addExpensePhoto(original, 'Calendar/_attachments/expense-2.png');
    expect(expenseText(next)).toBe('A note.');
    expect(expensePhotos(next)).toHaveLength(2);
    expect(removeExpensePhoto(next, 1)).toBe('![[Calendar/_attachments/expense-2.png]]\nA note.');
    expect(removeExpensePhoto(next, 10)).toBe(next);
    expect(() => addExpensePhoto(original, 'bad]]name.png')).toThrow('safely');
  });
});
