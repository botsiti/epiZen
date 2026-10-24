import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../lib/api';
import { NoteContent } from './NoteView';

vi.mock('../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)),
}));

const files: VaultFile[] = [
  { path: 'Calendar/2026/weeks/2026-W33 - 10.08.26.md', kind: 'note' },
  { path: 'Rating/music/Glasshouse Weather.md', kind: 'note' },
  { path: 'Rating/music/_attachments/glasshouse-weather.svg', kind: 'image' },
];

const DAY = `---
done: 60
mood: 9
genre:
  - ambient
---
> [!navigation]+ Navigation
> [[13.08.2026|← Yesterday]] | [[2026-W33 - 10.08.26|Week]]

### Tasks
- [ ] #daily/code — fix the login bug [minutes::45]
- [x] #daily/sport — run 5 km [minutes::30]

**Listened:** [[Glasshouse Weather]]

![[glasshouse-weather.svg|240]]

\`\`\`dataview
table mood from "[[not a link]]"
\`\`\`
`;

function renderDay(onOpenLink = vi.fn()) {
  render(<NoteContent path="Calendar/2026/days 2026/14.08.2026.md" text={DAY} files={files} onOpenLink={onOpenLink} />);
  return onOpenLink;
}

describe('NoteContent', () => {
  it('shows the title, folder and properties', () => {
    renderDay();
    expect(screen.getByTestId('note-title')).toHaveTextContent('14.08.2026');
    expect(screen.getByText('Calendar/2026/days 2026')).toBeInTheDocument();
    expect(screen.getByTestId('properties')).toHaveTextContent('mood9');
    expect(screen.getByTestId('properties')).toHaveTextContent('genreambient');
  });

  it('shows tasks as checkboxes the user cannot tick from here', async () => {
    renderDay();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeDisabled();
    await userEvent.click(boxes[0]!);
    expect(boxes[0]).not.toBeChecked();
  });

  it('opens wikilinks through the app, and marks the ones that lead nowhere', async () => {
    const onOpenLink = renderDay();
    const week = screen.getByRole('link', { name: 'Week' });
    expect(week).toHaveClass('wikilink');
    expect(screen.getByRole('link', { name: '← Yesterday' })).toHaveClass('is-missing');

    await userEvent.click(week);
    expect(onOpenLink).toHaveBeenCalledWith('2026-W33 - 10.08.26', 'Calendar/2026/days 2026/14.08.2026.md');
  });

  it('renders callouts and leaves code blocks as written', () => {
    const { container } = render(<NoteContent path="d.md" text={DAY} files={files} onOpenLink={vi.fn()} />);
    expect(container.querySelector('.callout[data-callout="navigation"] .callout-title')).toHaveTextContent('Navigation');
    expect(container.querySelector('pre code')).toHaveTextContent('[[not a link]]');
  });

  it('shows embedded images from the vault', async () => {
    renderDay();
    const cover = await screen.findByTestId('vault-image');
    expect(cover).toHaveAttribute('width', '240');
    expect(cover.getAttribute('src')).toMatch(/^blob:/);
  });
});
