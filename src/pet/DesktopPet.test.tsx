import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPet } from './DesktopPet';
import { movePet, openPetConversation, petPosition } from '../lib/api';

vi.mock('../components/assistant/Spike', () => ({ Spike: () => <span /> }));
vi.mock('../lib/api', () => ({
  petState: vi.fn().mockResolvedValue({ animation: 'idle', label: 'Talk to Spike', motion: true }),
  onPetState: vi.fn().mockResolvedValue(() => undefined),
  petPosition: vi.fn(), movePet: vi.fn(), openPetConversation: vi.fn(), hidePet: vi.fn(), setPetMotion: vi.fn(),
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
  vi.mocked(openPetConversation).mockResolvedValue(undefined);
});
describe('desktop companion dragging', () => {
  it('moves a captured pointer at Retina scale even when WebKit reports no buttons, without opening chat', async () => {
    render(<DesktopPet />);
    const dog = screen.getByRole('img', { name: 'Spike · drag to move' });
    Object.assign(dog, { setPointerCapture: vi.fn() });
    pointer(dog, 'pointerdown', 550, 450);
    pointer(dog, 'pointermove', 510, 410);
    pointer(dog, 'pointerup', 490, 400);
    await waitFor(() => expect(movePet).toHaveBeenLastCalledWith(880, 700));
    expect(movePet).toHaveBeenNthCalledWith(1, 920, 720);
    pointer(dog, 'pointermove', 450, 350);
    expect(movePet).toHaveBeenCalledTimes(2);
    expect(openPetConversation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(openPetConversation).toHaveBeenCalledOnce();
  });
  it('contains failed movement and leaves the conversation control usable', async () => {
    vi.mocked(movePet).mockRejectedValueOnce(new Error('Window unavailable'));
    render(<DesktopPet />);
    const dog = screen.getByRole('img', { name: 'Spike · drag to move' });
    Object.assign(dog, { setPointerCapture: vi.fn() });
    pointer(dog, 'pointerdown', 550, 450);
    pointer(dog, 'pointermove', 510, 410);
    pointer(dog, 'pointercancel', 510, 410);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t do that');
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(openPetConversation).toHaveBeenCalledOnce();
  });
});
