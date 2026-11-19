import { SOURCE_OPTIONS, type LibrarySources, type Source } from '../../lib/librarySources';
import { SOURCE_NAMES } from '../../lib/lookup';
import type { PodcastSettings } from '../../lib/podcasts';
import { KindMark } from '../library/marks';
import { SettingRow } from './SettingRow';

interface Props {
  sources: LibrarySources; podcasts: PodcastSettings;
  onSources: (sources: LibrarySources) => void; onPodcasts: (podcasts: PodcastSettings) => void;
}
export function LibraryPreferences({ sources, podcasts, onSources, onPodcasts }: Props) {
  return <>
    <section className="pref-group"><div className="pref-group-caption"><h3>Library sources</h3><p>Catalogues used for titles, metadata and cover artwork when adding media.</p></div>
      <div><div className="preferences-card">{([['album', 'Music albums'], ['film', 'Movies & series'], ['book', 'Books'], ['podcast', 'Podcasts']] as const).map(([kind, label]) =>
        <label className="preference-row source-row" key={kind}><span><KindMark kind={kind} />{label}</span>
          <select aria-label={`${label} source`} data-testid={`settings-source-${kind}`} value={sources[kind]} onChange={(event) => onSources({ ...sources, [kind]: event.target.value as Source })}>
            {SOURCE_OPTIONS[kind].map((source) => <option key={source} value={source}>{SOURCE_NAMES[source]}</option>)}</select>
        </label>)}</div>
        <p className="preferences-footnote">iTunes lists podcast episodes. With Wikipedia, enter the episode title after choosing a show.</p>
      </div>
    </section>
    <section className="pref-group" data-testid="settings-podcasts"><div className="pref-group-caption"><h3>Podcast artwork</h3></div><div className="preferences-card">
      <SettingRow title="Artwork for new episodes" description="Uses the other artwork when your first choice is unavailable."><select aria-label="Artwork for new episodes" data-testid="settings-podcast-artwork" value={podcasts.artwork} onChange={(event) => onPodcasts({ artwork: event.target.value === 'episode' ? 'episode' : 'show' })}><option value="show">Show thumbnail</option><option value="episode">Episode artwork</option></select></SettingRow>
    </div></section>
  </>;
}
