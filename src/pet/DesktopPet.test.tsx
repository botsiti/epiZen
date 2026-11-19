import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DesktopPet } from './DesktopPet';
import { dragPet, hidePet, openQuickPrompt } from '../lib/api';

vi.mock('../components/assistant/Spike', () => ({ Spike: () => <span /> }));
vi.mock('../lib/api', () => ({
  petState: vi.fn().mockResolvedValue({ animation: 'idle', label: 'Talk to Spike', motion: true }),
  onPetWake: vi.fn().mockResolvedValue(() => undefined),
  onPetState: vi.fn().mockResolvedValue(() => undefined),
  dragPet: vi.fn(), openQuickPrompt: vi.fn(), hidePet: vi.fn(), setPetMotion: vi.fn(),
}));
function pointer(element: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dragPet).mockResolvedValue(false);
  vi.mocked(hidePet).mockResolvedValue(undefined);
  vi.mocked(openQuickPrompt).mockResolvedValue(undefined);
});
it('hands a single gesture to AppKit with the exact grab offset, even when the pointer leaves the webview', async () => {
  let finish!: (dragged: boolean) => void;
  vi.mocked(dragPet).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(<DesktopPet />);
  const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
  pointer(dog, 'pointerdown', 53, 41);
  pointer(dog, 'pointerdown', 45, 38);
  expect(dragPet).toHaveBeenCalledExactlyOnceWith(53, 41);
  finish(true);
  await waitFor(() => expect(openQuickPrompt).not.toHaveBeenCalled());
  pointer(dog, 'pointerdown', 55, 40);
  await waitFor(() => expect(openQuickPrompt).toHaveBeenCalledOnce());
  fireEvent.keyDown(dog, { key: 'Enter' });
  expect(openQuickPrompt).toHaveBeenCalledTimes(2);
});

it('keeps the conversation control usable after a failed native drag', async () => {
  vi.mocked(dragPet).mockRejectedValueOnce('Window unavailable');
  render(<DesktopPet />);
  pointer(screen.getByRole('button', { name: 'Talk to Spike · drag to move' }), 'pointerdown', 42, 20);
  expect(await screen.findByRole('alert')).toHaveTextContent('Window unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Open quick prompt' }));
  expect(openQuickPrompt).toHaveBeenCalledOnce();
});

it('offers separate text and dictation controls', () => {
  render(<DesktopPet />);
  fireEvent.click(screen.getByRole('button', { name: 'Dictate to Spike' }));
  expect(openQuickPrompt).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open quick prompt' }));
  expect(openQuickPrompt).toHaveBeenLastCalledWith();
});

it('right-click hides Spike without opening a prompt or starting a drag, and reports a failure', async () => {
  render(<DesktopPet />);
  const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
  fireEvent.contextMenu(dog);
  await waitFor(() => expect(hidePet).toHaveBeenCalledOnce());
  expect(openQuickPrompt).not.toHaveBeenCalled();
  expect(dragPet).not.toHaveBeenCalled();
  vi.mocked(hidePet).mockRejectedValueOnce(new Error('Keep the prompt open to recover your draft'));
  fireEvent.contextMenu(dog);
  expect(await screen.findByRole('alert')).toHaveTextContent('recover your draft');
  fireEvent.keyDown(dog, { key: 'Enter' });
  expect(openQuickPrompt).toHaveBeenCalledOnce();
});
