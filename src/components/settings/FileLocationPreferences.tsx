import { useId } from 'react';
import type { FilePreferences } from '../../lib/filePreferences';
import { PreferenceIcon } from './icons';
import { SettingRow } from './SettingRow';

export function FileLocationPreferences({ value, folders, onChange }: { value: FilePreferences; folders: string[]; onChange: (next: FilePreferences) => void }) {
  const list = useId();
  return <><section className="pref-group"><div className="pref-group-caption"><h3>Default locations</h3><p>Choose where new notes, folders and attachments go.</p></div>
    <div><div className="location-pair">{(['note', 'folder'] as const).map((kind) => {
      const mode = kind === 'note' ? 'notes' : 'folders', path = kind === 'note' ? 'noteFolder' : 'folderParent';
      return <div className="location-choice" key={kind}><label><span><PreferenceIcon name={kind} />New {mode}</span>
        <select aria-label={`Location for new ${mode}`} value={value[mode]} onChange={(event) => onChange({ ...value, [mode]: event.target.value })}>
          <option value="current">Same folder as current note</option><option value="root">Top of the vault</option><option value="folder">A specific folder</option></select>
      </label>{value[mode] === 'folder' && <label>{kind === 'note' ? 'Notes folder' : 'Parent folder'}<input list={list} value={value[path]} placeholder="Top of the vault" onChange={(event) => onChange({ ...value, [path]: event.target.value })} /></label>}</div>;
    })}</div>
      <SettingRow title="New attachments" description="Applies to photos you add to monthly notes.">
        <select aria-label="Location for new attachments" value={value.attachments} onChange={(event) => onChange({ ...value, attachments: event.target.value as FilePreferences['attachments'] })}>
          <option value="subfolder">_attachments beside the note</option><option value="current">Same folder as the note</option><option value="root">Top of the vault</option><option value="folder">A specific folder</option>
        </select>
      </SettingRow>
      {value.attachments === 'folder' && <SettingRow title="Attachments folder"><input aria-label="Attachments folder" list={list} value={value.attachmentFolder} onChange={(event) => onChange({ ...value, attachmentFolder: event.target.value })} /></SettingRow>}
      <p className="preferences-footnote">With no note open, “Same folder” uses the top of the vault. Daily, weekly and monthly notes use their periodic note locations.</p></div>
    <datalist id={list}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
  </section>
    <section className="pref-group"><div className="pref-group-caption"><h3>Links</h3><p>Choose how autocomplete inserts links and how they follow files in this vault.</p></div><div>
      <SettingRow title="New link paths">
        <select aria-label="New link paths" value={value.linkFormat} onChange={(event) => onChange({ ...value, linkFormat: event.target.value as FilePreferences['linkFormat'] })}>
          <option value="shortest">Shortest unambiguous path</option><option value="relative">Relative to the note</option><option value="vault">Full vault path</option>
        </select>
      </SettingRow>
      <SettingRow title="Use wikilinks" description="Inserts [[Note]] in autocomplete. Turn off to insert standard Markdown links.">
        <input type="checkbox" className="preference-switch" aria-label="Use wikilinks" checked={value.wikilinks} onChange={(event) => onChange({ ...value, wikilinks: event.target.checked })} />
      </SettingRow>
      <SettingRow title="Update links on move or rename" description="Updates links in other notes that would otherwise point to the old location.">
        <input type="checkbox" className="preference-switch" aria-label="Update links on move or rename" checked={value.updateLinks} onChange={(event) => onChange({ ...value, updateLinks: event.target.checked })} />
      </SettingRow>
    </div></section></>;
}
