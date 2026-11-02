/** Sleep stays in decimal hours in Markdown; the editor works in whole hours and minutes. */
export function sleepParts(value?: number): { hours: string; minutes: string } {
  if (value === undefined || !Number.isFinite(value)) return { hours: '', minutes: '' };
  const total = Math.round(value * 60);
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

export function sleepValue(hours: string, minutes: string): string {
  const h = hours.trim();
  const m = minutes.trim();
  if (!h && !m) return '';
  if ((h && !/^\d+$/.test(h)) || Number(h) > 24) throw new Error('Sleep hours must be a whole number from 0 to 24.');
  if ((m && !/^\d+$/.test(m)) || Number(m) > 59) throw new Error('Sleep minutes must be a whole number from 0 to 59.');
  const total = Number(h) * 60 + Number(m);
  if (total > 24 * 60) throw new Error('Sleep cannot exceed 24 hours.');
  // Six decimal places keep minute precision without long floating-point tails in YAML.
  return String(Number((total / 60).toFixed(6)));
}
