import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MUSIC_BASE, MUSIC_DATAVIEW } from '../../../test/fixtures/music-base';
import { BasesProvider } from './context';
import { NoteMarkdown } from '../NoteMarkdown';
import { TableBuilder } from './TableBuilder';

const texts = new Map([
  ['Rating/music/High.md', '---\nArtist: Maker\nrating: 95\nlistened: 2025-01-01\ngenre: [post-punk]\n---\nMusic'],
  ['Rating/music/Recent.md', '---\nArtist: Another\nrating: 70\nlistened: 2025-12-31\n"favorite tracks": ["[[Track|Favorite]]"]\n---\nMore'],
  ['Rating/music/Old.md', '---\nrating: 60\nlistened: 2024-06-01\n---\nOlder'],
]);
const files = [...texts.keys()].map((path) => ({ path, kind: 'note' as const }));
const onOpenLink = vi.fn();
const props = { path: 'Rating/music/MOC.md', files, onOpenLink };
const markup = (source: string, language = 'base') => `Intro stays visible.\n\n\`\`\`${language}\n${source}\n\`\`\`\n\n[[Other note]]`;
function setup(source = MUSIC_BASE, refresh = vi.fn().mockResolvedValue(undefined), language = 'base') {
  return render(<BasesProvider files={files} texts={texts} onRefresh={refresh}><NoteMarkdown {...props} body={markup(source, language)} /></BasesProvider>);
}
const names = () => within(screen.getByRole('table')).getAllByRole('link').map((link) => link.textContent);

describe('embedded tables', () => {
  it('renders views and links, searches, sorts and restores the saved order', async () => {
    const user = userEvent.setup(); setup();
    expect(names()).toEqual(['Recent', 'Favorite', 'High']);
    fireEvent.click(screen.getByRole('link', { name: 'Recent' }), { metaKey: true });
    expect(onOpenLink).toHaveBeenCalledWith('Rating/music/Recent.md', props.path, true);
    await user.selectOptions(screen.getByLabelText('Table view'), '1');
    expect(names()).toEqual(['High', 'Recent']);
    await user.click(screen.getByRole('button', { name: /rating/ }));
    expect(names()).toEqual(['Recent', 'High']);
    await user.click(screen.getByRole('button', { name: 'Restore saved sort' }));
    expect(names()).toEqual(['High', 'Recent']);
    await user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'Another');
    expect(names()).toEqual(['Recent']);
    await user.clear(screen.getByRole('searchbox', { name: 'Search table' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'not here');
    expect(screen.getByText('No notes match your search.')).toBeVisible();
  });
  it('renders legacy music queries and leaves Dataview tasks, DataviewJS and ordinary code inert', () => {
    setup(MUSIC_DATAVIEW, undefined, 'dataview');
    expect(names()).toEqual(['Old']);
    const { container } = render(<NoteMarkdown {...props} body={'```dataviewjs\nalert("no")\n```\n\n```js\nlet x = 1\n```\n\n```dataview\nTASK\nWHERE !completed\n```'} />);
    expect(container.querySelectorAll('pre code')).toHaveLength(3);
    expect(container.querySelector('.base-block')).toBeNull();
  });
  it('shows unsupported source and leaves the surrounding note and links usable', async () => {
    const user = userEvent.setup(); setup('views: [{type: map}]');
    expect(screen.getByRole('alert')).toHaveTextContent('This view type is unavailable');
    expect(screen.getByText('views: [{type: map}]')).toBeVisible();
    expect(screen.getByText('Intro stays visible.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Other note' }));
    expect(onOpenLink).toHaveBeenCalledWith('Other note', props.path, false);
  });
  it('retains rows after a refresh failure, retries, and follows updated vault data', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockRejectedValueOnce('Vault unavailable').mockResolvedValueOnce(undefined);
    const view = setup(MUSIC_BASE, refresh);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vault unavailable');
    expect(names()).toContain('High');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).toBeNull();
    const next = new Map(texts); next.set('Rating/music/High.md', '---\nlistened: 2026-01-01\n---\nOutside the year');
    view.rerender(<BasesProvider files={files} texts={next} onRefresh={refresh}><NoteMarkdown {...props} body={markup(MUSIC_BASE)} /></BasesProvider>);
    expect(names()).not.toContain('High');
    expect(screen.getByText('Intro stays visible.')).toBeVisible();
  });
  it('previews a new table, keeps choices after failure and saves portable YAML', async () => {
    const user = userEvent.setup(); const save = vi.fn().mockRejectedValueOnce('Changed on disk').mockResolvedValueOnce(undefined);
    render(<BasesProvider files={files} texts={texts} onRefresh={vi.fn()}><TableBuilder {...props} onSave={save} onCancel={vi.fn()} /></BasesProvider>);
    await user.click(screen.getByRole('checkbox', { name: 'rating' }));
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.selectOptions(screen.getByLabelText('Filter 1 property'), 'note.rating');
    await user.selectOptions(screen.getByLabelText('Filter 1 comparison'), '>=');
    await user.type(screen.getByLabelText('Filter 1 value'), '80');
    expect(names()).toEqual(['High']);
    await user.click(screen.getByRole('button', { name: 'Add to note' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your choices are still here');
    expect(screen.getByLabelText('Filter 1 value')).toHaveValue('80');
    await user.click(screen.getByRole('button', { name: 'Add to note' }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toContain('note["rating"] >= 80');
    expect(save.mock.calls[1]![0]).toContain('type: table');
  });
});
