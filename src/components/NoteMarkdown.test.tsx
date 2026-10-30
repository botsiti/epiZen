import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteMarkdown } from './NoteMarkdown';

const props = { path: 'note.md', files: [], onOpenLink: vi.fn() };

describe('note highlights', () => {
  it('renders Obsidian highlights and colored text with nested Markdown', () => {
    const { container } = render(<NoteMarkdown {...props} body={'==sage **strong**== and <mark style="background: #FFF3A3A6;">gold *words*</mark> and <font color="#00b050">green</font>'} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent('sage strong');
    expect(marks[0]?.querySelector('strong')).toHaveTextContent('strong');
    expect(marks[1]).toHaveTextContent('gold words');
    expect(marks[1]?.querySelector('em')).toHaveTextContent('words');
    expect(marks[1]).toHaveStyle({ backgroundColor: '#FFF3A3A6' });
    expect(screen.getByText('green')).toHaveStyle({ color: '#00b050' });
    expect(screen.getByText('green').tagName).toBe('SPAN');
  });

  it('leaves code, escaped delimiters, incomplete and unsafe HTML as text', () => {
    const body = '`==code==` and \\==literal== and <mark style="background: url(evil)">unsafe</mark>\n\n<mark style="background: #fff;">unfinished';
    const { container } = render(<NoteMarkdown {...props} body={body} />);
    expect(container.querySelector('code')).toHaveTextContent('==code==');
    expect(container.querySelector('mark')).toBeNull();
    expect(container).toHaveTextContent('==literal==');
    expect(container).toHaveTextContent('<mark style="background: url(evil)">unsafe</mark>');
    expect(container).toHaveTextContent('<mark style="background: #fff;">unfinished');
  });

  it('updates the rendered highlight as text changes', () => {
    const { container, rerender } = render(<NoteMarkdown {...props} body="==in progress" />);
    expect(container.querySelector('mark')).toBeNull();
    rerender(<NoteMarkdown {...props} body="==in progress== and <mark>also highlighted</mark>" />);
    expect(container.querySelector('mark')).toHaveTextContent('in progress');
    expect(container.querySelectorAll('mark')[1]).toHaveTextContent('also highlighted');
  });
});
