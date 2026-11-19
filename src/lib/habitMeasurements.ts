export type HabitTracking =
  | { kind: 'goal'; unit: string; target: number }
  | { kind: 'measure'; unit: string };

export function readHabitTracking(input: unknown): HabitTracking | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || !('kind' in input) || !('unit' in input)
    || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 32 || /[\r\n]/.test(input.unit)) {
    throw new Error('Choose a unit of up to 32 characters for this habit.');
  }
  const unit = input.unit.trim();
  if (input.kind === 'measure') return { kind: 'measure', unit };
  if (input.kind === 'goal' && 'target' in input && typeof input.target === 'number' && Number.isFinite(input.target) && input.target > 0) {
    return { kind: 'goal', unit, target: input.target };
  }
  throw new Error('Choose a supported habit type and a positive daily target.');
}

// Ignore examples inside comments and inline code. Keep the offset into the original task
// so a value edit preserves its surrounding prose, spacing and any Obsidian block ID.
export function habitValueField(body: string) {
  const visible = body.replace(/<!--.*?(?:-->|$)|(`+).*?\1/g, (match) => ' '.repeat(match.length));
  const markers = [...visible.matchAll(/\[habit_value::/gi)];
  if (!markers.length) return undefined;
  const match = /^\[habit_value::\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\]/i.exec(visible.slice(markers[0]!.index));
  if (markers.length !== 1 || !match || !Number.isFinite(Number(match[1]))) return { invalid: true } as const;
  const start = markers[0]!.index + match[0].indexOf(match[1]!);
  return { value: Number(match[1]), start, end: start + match[1]!.length };
}
