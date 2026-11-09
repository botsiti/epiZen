/** Original Spike v2 atlas: 8 columns × 11 rows, 192 × 208 pixels per cell. */
export const SPIKE_FRAMES = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  right: { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  left: { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  greeting: { row: 3, durations: [140, 140, 140, 280] },
  happy: { row: 4, durations: [140, 140, 140, 140, 280] },
  error: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  listening: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  thinking: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
} as const;
export type SpikeState = keyof typeof SPIKE_FRAMES;
export function spikeFrame(state: SpikeState, elapsed: number): { column: number; row: number } {
  const animation = SPIKE_FRAMES[state], total = animation.durations.reduce((sum: number, value) => sum + value, 0);
  let time = Math.max(0, elapsed) % total;
  for (let column = 0; column < animation.durations.length; column++) {
    if (time < animation.durations[column]!) return { column, row: animation.row };
    time -= animation.durations[column]!;
  }
  return { column: 0, row: animation.row };
}
/** Direction 0 looks upward; clockwise directions follow the pointer, with a quiet centre. */
export function spikeLook(dx: number, dy: number): { column: number; row: number } | undefined {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 28) return undefined;
  const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
  const frame = Math.round(angle / (Math.PI / 8)) % 16;
  return { column: frame % 8, row: 9 + Math.floor(frame / 8) };
}
