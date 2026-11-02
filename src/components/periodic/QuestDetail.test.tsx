import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { parseQuests } from '../../lib/quests';
import { QuestDetail } from './QuestDetail';

const quest = parseQuests('month.md', '- [ ] #quest/monthly - Read books [xp::500] [tier::rare] [target::10] [current::2]')[0]!;
it('edits quest fields and keeps a rejected draft available', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn().mockRejectedValueOnce(new Error('The note changed.')).mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<QuestDetail entry={{ quest }} today={new Date(2026, 8, 1)} onChange={onChange} onClose={onClose} onToggle={vi.fn()} onProgress={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Edit quest' }));
  await user.clear(screen.getByLabelText('Quest title'));
  await user.type(screen.getByLabelText('Quest title'), 'Read better books');
  await user.click(screen.getByRole('button', { name: 'Save quest' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The note changed.');
  expect(screen.getByLabelText('Quest title')).toHaveValue('Read better books');
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save quest' }));
  expect(onChange).toHaveBeenLastCalledWith(quest, expect.objectContaining({ kind: 'edit', title: 'Read better books', target: 10 }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('requires a deliberate confirmation before deleting the quest', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<QuestDetail entry={{ quest }} today={new Date(2026, 8, 1)} onChange={onChange} onClose={onClose} onToggle={vi.fn()} onProgress={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Delete quest' }));
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep quest' }));
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Delete quest' }));
  await user.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  expect(onChange).toHaveBeenCalledWith(quest, { kind: 'delete' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('submits edits against the quest that was opened, even if its props refresh', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn().mockResolvedValue('That quest has changed in its note.');
  const props = { today: new Date(2026, 8, 1), onChange, onClose: vi.fn(), onToggle: vi.fn(), onProgress: vi.fn() };
  const view = render(<QuestDetail {...props} entry={{ quest }} />);
  await user.click(screen.getByRole('button', { name: 'Edit quest' }));
  await user.type(screen.getByLabelText('Quest title'), ' slowly');
  const outside = { ...quest, raw: quest.raw.replace('Read books', 'Outside title'), title: 'Outside title' };
  view.rerender(<QuestDetail {...props} entry={{ quest: outside }} />);
  await user.click(screen.getByRole('button', { name: 'Save quest' }));
  expect(onChange).toHaveBeenCalledWith(quest, expect.objectContaining({ title: 'Read books slowly' }));
  expect(screen.getByLabelText('Quest title')).toHaveValue('Read books slowly');
});
