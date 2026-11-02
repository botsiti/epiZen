import { useId, useState, type FormEvent } from 'react';
import { today } from '../lib/dates';
import { parseBirthDate } from '../lib/home';
import { DEFAULT_RECOGNITION, periodicNamingError, type PeriodicRecognition, type PeriodicSettings, type PeriodicFeatures } from '../lib/periodic';
import type { VaultFile } from '../lib/api';
import { PeriodicFolders, PeriodicRecognitionFields } from './periodic/PeriodicPreferences';
import { podcastSettings, type PodcastSettings } from '../lib/podcasts';
import { ShortcutReference } from './workspace/ShortcutReference';

interface Props {
  periodic: PeriodicSettings;
  /** As stored, `YYYY-MM-DD`, or `''` when there is none. */
  birthDate: string;
  podcasts: PodcastSettings;
  folders: string[];
  features: PeriodicFeatures;
  recognition?: PeriodicRecognition;
  files?: VaultFile[];
  texts?: ReadonlyMap<string, string>;
  onSetup?: () => void;
  onSave: (settings: { recognition?: PeriodicRecognition; periodic: PeriodicSettings; birthDate: string; podcasts: PodcastSettings; features: PeriodicFeatures }) => Promise<void>;
}

/**
 * Built-in periodic features, note locations, and personal preferences.
 */
export function SettingsScreen({ periodic, birthDate, podcasts, features, folders, recognition, files = [], texts = new Map(), onSetup, onSave }: Props) {
  const artworkId = useId();
  const [draft, setDraft] = useState(periodic);
  const [recognitionDraft, setRecognitionDraft] = useState(recognition ?? DEFAULT_RECOGNITION);
  const [saving, setSaving] = useState(false);
  const [birth, setBirth] = useState(birthDate);
  const [featureDraft, setFeatureDraft] = useState(features);
  const [podcastDraft, setPodcastDraft] = useState(podcasts);
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const broken = periodicNamingError(draft);
    if (broken) { setState({ error: broken }); return; }
    const born = parseBirthDate(birth);
    if (birth.trim() && (!born || born > today())) {
      setState({ error: 'A birth date is a day that has been, written YYYY-MM-DD, like 1990-04-21.' });
      return;
    }
    setSaving(true);
    onSave({ ...(recognition ? { recognition: recognitionDraft } : {}), periodic: draft, birthDate: birth.trim(), podcasts: podcastDraft, features: featureDraft }).then(
      () => { setState({ saved: true }); setSaving(false); },
      (err: unknown) => { setState({ error: String(err) }); setSaving(false); },
    );
  };

  return (
    <section className="screen settings-screen" data-testid="settings">
      <p className="eyebrow">Settings</p>
      <h1>Preferences</h1>
      <p className="muted">Make Epizen your own. Changes are saved in app settings.</p>
      <form className="form" onSubmit={submit}>
        <div className="settings-intro">
          <h2>Periodic notes</h2>
          <p>Choose where future notes go. Existing notes can use different names and keep their own content. New notes start with Epizen’s dashboard template.</p>
        </div>
        <fieldset className="settings-group settings-features" data-testid="settings-features">
          <legend className="eyebrow">Features</legend>
          {([
            ['habits', 'Habits', 'Show habits on daily, weekly and monthly pages.'],
            ['thoughtRecords', 'Thought records', 'Show the thought record tool and sessions on daily pages.'],
          ] as const).map(([key, label, description]) => (
            <label className="settings-feature" key={key}>
              <span><strong>{label}</strong><small>{description}</small></span>
              <input type="checkbox" data-testid={`settings-feature-${key}`} checked={featureDraft[key]} onChange={(event) => { setFeatureDraft((prev) => ({ ...prev, [key]: event.target.checked })); setState({}); }} />
            </label>
          ))}
          <small className="field-hint">Turning a feature off hides it; your notes stay intact.</small>
        </fieldset>
        <PeriodicFolders value={draft} folders={folders} onChange={(next) => { setDraft(next); setState({}); }} />
        {recognition && <PeriodicRecognitionFields periodic={draft} value={recognitionDraft} files={files} texts={texts} onChange={(next) => { setRecognitionDraft(next); setState({}); }} />}
        {onSetup && <button type="button" className="quiet-button" onClick={onSetup}>Review vault setup</button>}
        <fieldset className="settings-group" data-testid="settings-home">
          <legend className="eyebrow">Homepage</legend>
          <label className="field">
            <span>Birth date</span>
            <input
              value={birth}
              onChange={(e) => {
                setBirth(e.target.value);
                setState({});
              }}
              placeholder="YYYY-MM-DD"
              inputMode="numeric"
              data-testid="settings-birth-date"
            />
            <small className="field-hint">For the memento mori: the weeks till 30. It stays in Epizen’s settings, never in the vault.</small>
          </label>
        </fieldset>
        <fieldset className="settings-group" data-testid="settings-podcasts">
          <legend className="eyebrow">Podcasts</legend>
          <label className="field">
            <span id={`${artworkId}-label`}>Artwork for new episodes</span>
            <select
              value={podcastDraft.artwork}
              onChange={(event) => {
                setPodcastDraft(podcastSettings({ artwork: event.target.value }));
                setState({});
              }}
              data-testid="settings-podcast-artwork"
              aria-labelledby={`${artworkId}-label`}
              aria-describedby={`${artworkId}-hint`}
            >
              <option value="show">Show thumbnail</option>
              <option value="episode">Episode artwork</option>
            </select>
            <small className="field-hint" id={`${artworkId}-hint`}>
              New episodes automatically use this artwork when saved. If it is unavailable, the other artwork is used. Manually entered episodes use the selected show’s thumbnail.
            </small>
          </label>
        </fieldset>
        {state.error && <p className="form-error">{state.error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving} className="quiet-button" data-testid="settings-save">
            Save
          </button>
          {state.saved && <span className="save-state">Saved</span>}
        </div>
      </form>
      <ShortcutReference />
    </section>
  );
}
