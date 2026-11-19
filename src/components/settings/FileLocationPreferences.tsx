import { useId } from 'react';
import type { FilePreferences } from '../../lib/filePreferences';
import { PreferenceIcon } from './icons';

export function FileLocationPreferences({ value, folders, onChange }: { value: FilePreferences; folders: string[]; onChange: (next: FilePreferences) => void }) {
  const list = useId();
  return <section className="pref-group"><div className="pref-group-caption"><h3>Default locations</h3><p>Choose a starting location for each new item. You can choose a different folder when creating it.</p></div>
    <div><div className="location-pair">{(['note', 'folder'] as const).map((kind) => {
      const mode = kind === 'note' ? 'notes' : 'folders', path = kind === 'note' ? 'noteFolder' : 'folderParent';
      return <div className="location-choice" key={kind}><label><span><PreferenceIcon name={kind} />New {mode}</span>
        <select aria-label={`Location for new ${mode}`} value={value[mode]} onChange={(event) => onChange({ ...value, [mode]: event.target.value })}>
          <option value="current">Same folder as current note</option><option value="root">Top of the vault</option><option value="folder">A specific folder</option></select>
      </label>{value[mode] === 'folder' && <label>{kind === 'note' ? 'Notes folder' : 'Parent folder'}<input list={list} value={value[path]} placeholder="Top of the vault" onChange={(event) => onChange({ ...value, [path]: event.target.value })} /></label>}</div>;
    })}</div><p className="preferences-footnote">With no note open, “Same folder” uses the top of the vault. Daily, weekly and monthly notes use their periodic note locations.</p></div>
    <datalist id={list}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
  </section>;
}
