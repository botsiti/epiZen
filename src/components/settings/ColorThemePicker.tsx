import { useState, type CSSProperties } from 'react';
import type { Appearance } from '../../lib/appearance';
import { colorThemes, importTheme, selectedTheme, type ColorTheme } from '../../lib/colorThemes';
import './colorThemes.css';

function sampleStyle(theme: ColorTheme): CSSProperties {
  return {
    '--sample-bg': theme.background, '--sample-face': theme.surface,
    '--sample-text': theme.text, '--sample-accent': theme.accent,
  } as CSSProperties;
}

function Swatches() {
  return <span className="theme-swatches" aria-hidden="true"><i /><i /><i /><i /></span>;
}

export function ColorThemePicker({ value, change }: { value: Appearance; change: (patch: Partial<Appearance>) => void }) {
  const custom = value.customThemes ?? [];
  const active = selectedTheme(value.theme, custom);
  const [source, setSource] = useState(''), [issue, setIssue] = useState('');
  const [importing, setImporting] = useState(false);
  function addTheme() {
    try {
      const next = importTheme(source);
      if ([...colorThemes, ...custom].some((item) => item.name.toLowerCase() === next.name.toLowerCase()))
        throw new Error('Choose a name that is different from your other themes.');
      if (custom.length >= 32) throw new Error('Remove a custom theme before adding another.');
      change({ theme: next.name, customThemes: [...custom, next] });
      setImporting(false); setSource(''); setIssue('');
    } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); }
  }
  return <section className="theme-picker preferences-section" aria-label="Color theme">
    <div className="theme-preview" style={sampleStyle(active)}>
      <div><p>Color theme</p><strong>{active.name}</strong><Swatches /></div>
      <aside aria-hidden="true"><span>Daily note</span><b>Morning routine</b><small>✓ &nbsp; Take a walk</small></aside>
    </div>
    <fieldset className="theme-library"><legend>Color themes</legend><div className="theme-choices">
      {[...colorThemes, ...custom].map((theme) => <label key={theme.name} style={sampleStyle(theme)}>
        <input type="radio" name="color-theme" aria-label={theme.name} checked={active.name === theme.name} onChange={() => change({ theme: theme.name })} />
        <Swatches /><span>{theme.name}</span><i className="theme-tick" aria-hidden="true">✓</i>
      </label>)}
    </div></fieldset>
    <div className="theme-tools">
      <button type="button" aria-expanded={importing} onClick={() => { setImporting(!importing); setIssue(''); }}>Paste theme…</button>
      {custom.some((item) => item.name === active.name) && <button type="button" onClick={() => change({ theme: colorThemes[0]!.name, customThemes: custom.filter((item) => item.name !== active.name) })}>Remove {active.name}</button>}
    </div>
    {importing && <div className="theme-import"><label>Palette JSON
      <textarea maxLength={4097} rows={7} value={source} placeholder={JSON.stringify({ ...active, name: 'My theme' }, null, 2)} onChange={(event) => { setSource(event.target.value); setIssue(''); }} />
    </label><button type="button" className="preferences-commit" disabled={!source.trim()} onClick={addTheme}>Add theme</button>
    {issue && <p className="preferences-error" role="alert">{issue}</p>}</div>}
  </section>;
}
