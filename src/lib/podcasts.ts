export type PodcastArtwork = 'show' | 'episode';

export interface PodcastSettings {
  artwork: PodcastArtwork;
}

/** New episodes use the show's thumbnail unless the saved setting explicitly prefers episode art. */
export function podcastSettings(value: unknown): PodcastSettings {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return { artwork: stored.artwork === 'episode' ? 'episode' : 'show' };
}
