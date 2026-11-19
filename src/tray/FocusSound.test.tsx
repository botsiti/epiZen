import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusSound } from './FocusSound';

function mockAudio() {
  const contexts: Context[] = [];
  const resume = vi.fn(() => Promise.resolve());
  class Context {
    sampleRate = 1000;
    currentTime = 1;
    destination = {};
    gain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
    source = { buffer: undefined, loop: false, connect: vi.fn(), start: vi.fn() };
    createGain = () => this.gain;
    createBufferSource = () => this.source;
    createBuffer = vi.fn((_channels: number, length: number) => {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    });
    resume = resume;
    close = vi.fn(() => Promise.resolve());

    constructor() {
      contexts.push(this);
    }
  }
  vi.stubGlobal('AudioContext', Context);
  return { contexts, resume };
}

afterEach(() => vi.unstubAllGlobals());

describe('focus sounds', () => {
  it('loops a user-selected sound, keeps it playing when collapsed, and stops it on request', async () => {
    const { contexts } = mockAudio();
    const user = userEvent.setup();
    const { rerender } = render(<FocusSound expanded />);
    const white = screen.getByRole('button', { name: 'White noise' });
    expect(contexts).toHaveLength(0);

    await user.click(white);
    const active = contexts[0]!;
    expect(white).toHaveAttribute('aria-pressed', 'true');
    expect(active.createBuffer).toHaveBeenCalledWith(1, 8000, 1000);
    expect(active.source.loop).toBe(true);
    expect(active.source.start).toHaveBeenCalledOnce();

    rerender(<FocusSound expanded={false} />);
    expect(screen.queryByRole('button', { name: 'White noise' })).toBeNull();
    expect(active.close).not.toHaveBeenCalled();

    rerender(<FocusSound expanded />);
    fireEvent.change(screen.getByRole('slider', { name: 'Sound volume' }), { target: { value: '50' } });
    expect(active.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 1, 0.03);
    await user.click(white);
    expect(white).toHaveAttribute('aria-pressed', 'false');
    expect(active.close).toHaveBeenCalledOnce();
  });

  it('recovers from a failed start and keeps one sound active when switching', async () => {
    const { contexts, resume } = mockAudio();
    resume.mockRejectedValueOnce(new Error('Audio is unavailable'));
    const user = userEvent.setup();
    const { unmount } = render(<FocusSound expanded />);
    const brown = screen.getByRole('button', { name: 'Brown noise' });
    const white = screen.getByRole('button', { name: 'White noise' });

    await user.click(brown);
    expect(screen.getByRole('status')).toHaveTextContent('Sound couldn’t start');
    expect(contexts[0]?.close).toHaveBeenCalledOnce();
    await user.click(brown);
    expect(brown).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(white);
    expect(contexts[1]?.close).toHaveBeenCalledOnce();
    expect(brown).toHaveAttribute('aria-pressed', 'false');
    expect(white).toHaveAttribute('aria-pressed', 'true');
    unmount();
    expect(contexts[2]?.close).toHaveBeenCalledOnce();
  });
});
