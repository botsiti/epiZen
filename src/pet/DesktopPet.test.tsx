import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPet } from './DesktopPet';
import { movePet, openQuickPrompt, petPosition } from '../lib/api';

vi.mock('../components/assistant/Spike', () => ({ Spike: () => <span /> }));
vi.mock('../lib/api', () => ({
  petState: vi.fn().mockResolvedValue({ animation: 'idle', label: 'Talk to Spike', motion: true }),
  onPetWake: vi.fn().mockResolvedValue(() => undefined),
  onPetState: vi.fn().mockResolvedValue(() => undefined),
  petPosition: vi.fn(), movePet: vi.fn(), openQuickPrompt: vi.fn(), hidePet: vi.fn(), setPetMotion: vi.fn(),
}));
function pointer(element: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: 0, screenX: x, screenY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(petPosition).mockResolvedValue({ x: 1000, y: 800, scale: 2 });
  vi.mocked(movePet).mockResolvedValue(undefined);
  vi.mocked(openQuickPrompt).mockResolvedValue(undefined);
});
describe('desktop companion dragging', () => {
  it('moves a captured pointer at Retina scale even when WebKit reports no buttons, without opening chat', async () => {
    render(<DesktopPet />);
    const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
    Object.assign(dog, { setPointerCapture: vi.fn() });
    pointer(dog, 'pointerdown', 550, 450);
    pointer(dog, 'pointermove', 510, 410);
    pointer(dog, 'pointerup', 490, 400);
    await waitFor(() => expect(movePet).toHaveBeenLastCalledWith(880, 700));
    expect(movePet).toHaveBeenNthCalledWith(1, 920, 720);
    pointer(dog, 'pointermove', 450, 350);
    expect(movePet).toHaveBeenCalledTimes(2);
    expect(openQuickPrompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open quick prompt' }));
    expect(openQuickPrompt).toHaveBeenCalledOnce();
  });
  it('contains failed movement and leaves the conversation control usable', async () => {
    vi.mocked(movePet).mockRejectedValueOnce(new Error('Window unavailable'));
    render(<DesktopPet />);
    const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
    Object.assign(dog, { setPointerCapture: vi.fn() });
    pointer(dog, 'pointerdown', 550, 450);
    pointer(dog, 'pointermove', 510, 410);
    pointer(dog, 'pointercancel', 510, 410);
    expect(await screen.findByRole('alert')).toHaveTextContent('Window unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Open quick prompt' }));
    expect(openQuickPrompt).toHaveBeenCalledOnce();
  });
});

it('opens the quick prompt for a click or keyboard activation without moving the companion', async () => {
  render(<DesktopPet />);
  const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
  Object.assign(dog, { setPointerCapture: vi.fn() });
  pointer(dog, 'pointerdown', 550, 450); pointer(dog, 'pointerup', 551, 450);
  await waitFor(() => expect(openQuickPrompt).toHaveBeenCalledOnce());
  expect(movePet).not.toHaveBeenCalled();
  fireEvent.keyDown(dog, { key: 'Enter' });
  expect(openQuickPrompt).toHaveBeenCalledTimes(2);
});
it('coalesces rapid pointer movement while native movement is pending', async () => {
  let complete!: () => void;
  vi.mocked(movePet).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  render(<DesktopPet />);
  const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
  Object.assign(dog, { setPointerCapture: vi.fn() });
  pointer(dog, 'pointerdown', 550, 450); pointer(dog, 'pointermove', 560, 450);
  await waitFor(() => expect(movePet).toHaveBeenCalledOnce());
  for (let i = 1; i <= 100; i++) pointer(dog, 'pointermove', 560 + i, 450);
  pointer(dog, 'pointerup', 660, 450); complete();
  await waitFor(() => expect(movePet).toHaveBeenLastCalledWith(1220, 800));
  expect(movePet).toHaveBeenCalledTimes(2);
  expect(openQuickPrompt).not.toHaveBeenCalled();
});

it('starts a new drag before the previous native movement settles without waiting on its own queue', async () => {
  let complete!: () => void;
  vi.mocked(movePet).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  vi.mocked(petPosition).mockResolvedValueOnce({ x: 1000, y: 800, scale: 2 }).mockResolvedValue({ x: 1020, y: 800, scale: 2 });
  render(<DesktopPet />);
  const dog = screen.getByRole('button', { name: 'Talk to Spike · drag to move' });
  Object.assign(dog, { setPointerCapture: vi.fn() });
  pointer(dog, 'pointerdown', 550, 450); pointer(dog, 'pointermove', 560, 450);
  await waitFor(() => expect(movePet).toHaveBeenCalledOnce());
  pointer(dog, 'pointerup', 560, 450);
  pointer(dog, 'pointerdown', 600, 450); pointer(dog, 'pointermove', 620, 450); pointer(dog, 'pointerup', 620, 450);
  complete();
  await waitFor(() => expect(movePet).toHaveBeenLastCalledWith(1060, 800));
  expect(movePet).toHaveBeenCalledTimes(2);
});

it('offers separate text and dictation controls', () => {
  render(<DesktopPet />);
  fireEvent.click(screen.getByRole('button', { name: 'Dictate to Spike' }));
  expect(openQuickPrompt).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open quick prompt' }));
  expect(openQuickPrompt).toHaveBeenLastCalledWith();
});
