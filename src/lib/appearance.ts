export interface Appearance { surface: 'solid' | 'glass'; opacity: number; motion: boolean }
export function appearanceSettings(value: unknown): Appearance {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { surface: saved.surface === 'glass' ? 'glass' : 'solid', opacity: typeof saved.opacity === 'number' && Number.isFinite(saved.opacity) ? Math.max(.45, Math.min(.95, saved.opacity)) : .72, motion: saved.motion === true };
}
