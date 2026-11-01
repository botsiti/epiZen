import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPHERES } from '../../lib/categories';
import type { VaultFile } from '../../lib/api';
import { resolveLink } from '../../lib/links';
import { addExpensePhoto, editExpenseText, expensePhotos, expenseText, removeExpensePhoto } from '../../lib/expensePhotos';
import { readMonthlySection, readSphere, sphereValue, writeMonthlySection, type MonthlyField } from '../../lib/monthlyReview';
import { flushBeforeClose, trackSave } from '../../lib/saving';
import type { PeriodicActions } from './types';
import { VaultImage } from '../VaultImage';
import './monthlyReview.css';

interface Props {
  path: string;
  text: string;
  tab: string;
  files?: VaultFile[];
  onImportPhoto?: PeriodicActions['onImportExpensePhoto'];
  onSave: PeriodicActions['onSetMonthlySection'];
  onRecover: PeriodicActions['onRecoverMonthlySection'];
}

/** Kept mounted between month tabs so drafts do not disappear when switching sections. */
export function MonthlyReview({ path, text, tab, files = [], onSave, onRecover, onImportPhoto }: Props) {
  const [sphere, setSphere] = useState<string>(SPHERES[0].name);
  return <div className={['Reflection', 'Expenses', 'Life areas'].includes(tab) ? 'monthly-review is-open' : 'monthly-review'} data-testid="monthly-review">
    <div hidden={tab !== 'Reflection'}>
      <ReviewField field="summary" path={path} text={text} onSave={onSave} onRecover={onRecover} title="The month in your own words" hint="What happened, what mattered, and what would you like to remember?" />
    </div>
    <div hidden={tab !== 'Expenses'}>
      <ReviewField field="expenses" path={path} text={text} files={files} active={tab === 'Expenses'} onSave={onSave} onRecover={onRecover} onImportPhoto={onImportPhoto} title="Money" hint="A little space to reflect on what came in, what went out, and what matters next." />
    </div>
    <div hidden={tab !== 'Life areas'}>
      <section className="card glass monthly-areas">
        <div><p className="kicker">A monthly check-in</p><h2>Life areas</h2><p className="monthly-hint">Rate each area from 0 to 10 and capture what shaped it this month.</p></div>
        <div className="monthly-area-layout"><div className="monthly-area-list" aria-label="Life areas">
          {SPHERES.map((item) => {
            const field = `sphere:${item.name}` as MonthlyField;
            const rating = readSphere(readMonthlySection(text, field).value).rating;
            return <button key={item.name} type="button" className={sphere === item.name ? 'monthly-area is-selected' : 'monthly-area'} data-sphere={item.name} aria-pressed={sphere === item.name} onClick={() => setSphere(item.name)}>
              <span className="monthly-area-dot" style={{ backgroundColor: item.color }} /><span>{item.name}</span><strong>{rating || '—'}<small> / 10</small></strong>
            </button>;
          })}
        </div><div className="monthly-area-detail">{SPHERES.map((item) => <div key={item.name} hidden={sphere !== item.name}>
          <ReviewField field={`sphere:${item.name}`} path={path} text={text} onSave={onSave} onRecover={onRecover} title={item.name} hint="What made this area feel this way?" sphere />
        </div>)}</div></div>
      </section>
    </div>
  </div>;
}

interface FieldProps {
  field: MonthlyField;
  path: string;
  text: string;
  onSave: Props['onSave'];
  onRecover: Props['onRecover'];
  title: string;
  hint: string;
  sphere?: boolean;
  files?: VaultFile[];
  active?: boolean;
  onImportPhoto?: Props['onImportPhoto'];
}

function ReviewField({ field, path, text, onSave, onRecover, title, hint, sphere, files = [], active, onImportPhoto }: FieldProps) {
  const section = readMonthlySection(text, field);
  const [draft, setDraft] = useState(section.value);
  const [base, setBase] = useState(section);
  const [status, setStatus] = useState<{ saving?: boolean; message?: string; failed?: boolean }>({});
  const state = useRef({ draft, base, source: text });
  const lastSource = useRef(text);
  const callbacks = useRef({ onSave, onRecover, onImportPhoto });
  const [seenText, setSeenText] = useState(text);
  const mounted = useRef(false);
  const pending = useRef<Promise<string | undefined> | undefined>(undefined);
  const pendingPhoto = useRef<Promise<string | undefined> | undefined>(undefined);
  const [addingPhoto, setAddingPhoto] = useState(false);
  if (text !== seenText) {
    setSeenText(text);
    if (section.snapshot !== base.snapshot && (draft === base.value || draft === section.value)) {
      setBase(section);
      setDraft(section.value);
    }
  }
  useLayoutEffect(() => {
    callbacks.current = { onSave, onRecover, onImportPhoto };
    const source = text === lastSource.current ? state.current.source : text;
    lastSource.current = text;
    state.current = { draft, base, source };
  }, [draft, base, text, onSave, onRecover, onImportPhoto]);

  const persist = useCallback(async (recover = false): Promise<string | undefined> => {
    while (pendingPhoto.current) {
      const problem = await pendingPhoto.current;
      if (problem) return path;
    }
    while (pending.current) {
      const problem = await pending.current;
      if (problem) return path;
    }
    const { draft: value, base: seen, source } = state.current;
    if (value === seen.value) return undefined;
    if (seen.problem) {
      if (recover || !mounted.current) callbacks.current.onRecover(field, value, source, seen.snapshot, seen.problem);
      else setStatus({ message: seen.problem, failed: true });
      return path;
    }
    if (mounted.current) setStatus({ saving: true });
    const work = callbacks.current.onSave(field, value, seen.snapshot).catch((err: unknown) => err instanceof Error ? err.message : String(err));
    pending.current = work;
    const problem = await work;
    pending.current = undefined;
    if (problem) {
      if (recover || !mounted.current) callbacks.current.onRecover(field, value, source, seen.snapshot, problem);
      else setStatus({ message: problem, failed: true });
      return path;
    }
    // Future saves start from the section we just wrote, even before React renders the updated note.
    let savedText: string;
    try { savedText = writeMonthlySection(source, field, value, seen.snapshot); }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      callbacks.current.onRecover(field, state.current.draft, source, seen.snapshot, message);
      return path;
    }
    const updated = readMonthlySection(savedText, field);
    state.current.base = updated;
    state.current.source = savedText;
    if (mounted.current) {
      setBase(updated);
      setStatus({ message: 'Saved' });
    }
    return undefined;
  }, [field, path]);

  useEffect(() => {
    mounted.current = true;
    const unregister = flushBeforeClose(() => persist(true));
    return () => {
      mounted.current = false;
      unregister();
      void trackSave(persist(true));
    };
  }, [persist]);

  const update = (value: string) => { state.current.draft = value; setDraft(value); setStatus({}); };
  const addPhoto = (file: File | undefined) => {
    if (!file || pendingPhoto.current) return;
    setAddingPhoto(true);
    setStatus({});
    const work = (async (): Promise<string | undefined> => {
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
        if (!callbacks.current.onImportPhoto) throw new Error('Photo upload is unavailable.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const saved = await callbacks.current.onImportPhoto(bytes);
        const value = addExpensePhoto(state.current.draft, saved);
        state.current.draft = value;
        if (mounted.current) { setDraft(value); setStatus({ message: 'Photo added. Save to keep it with this month.' }); }
        return undefined;
      } catch (err) {
        const problem = err instanceof Error ? err.message : String(err);
        if (mounted.current) setStatus({ message: problem, failed: true });
        else callbacks.current.onRecover(field, state.current.draft, state.current.source, state.current.base.snapshot, `The photo could not be added: ${problem}`);
        return problem;
      }
    })();
    pendingPhoto.current = work;
    void work.then(() => { if (pendingPhoto.current === work) pendingPhoto.current = undefined; if (mounted.current) setAddingPhoto(false); });
    void trackSave(work.then((problem) => problem ? path : undefined));
  };
  const current = sphere ? readSphere(draft) : undefined;
  const label = sphere ? `${title} reflection` : field === 'expenses' ? 'Money reflection' : title;
  const hasImages = field === 'expenses' && active && expensePhotos(draft).length > 0;
  return <div className={sphere ? 'monthly-field is-area' : field === 'expenses' ? 'card glass monthly-field money-field' : 'card glass monthly-field'} data-testid="monthly-field" data-field={field}>
    <div className="monthly-field-head"><div>{field === 'expenses' && <p className="kicker">Monthly finances</p>}<h2>{title}</h2><p className="monthly-hint">{hint}{sphere && (section.snapshot.startsWith('legacy-sphere:') || !section.snapshot) ? ' Choose a rating; this format keeps each reflection on one line.' : ''}</p></div><span role="status" className={status.failed ? 'monthly-status is-error' : 'monthly-status'}>{status.message}</span></div>
    {sphere && <label className="monthly-rating">Rating <select aria-label={`${title} rating`} value={current?.rating ?? ''} onChange={(event) => update(sphereValue(event.target.value, current?.notes ?? ''))}>
      <option value="">Not rated</option>{Array.from({ length: 11 }, (_, i) => <option key={i} value={String(i)}>{i} / 10</option>)}
    </select></label>}
    <div className={field === 'expenses' ? 'money-layout' : undefined}>
      {field === 'expenses' && <div className="money-photos"><div className="money-photos-head"><div><span className="money-label">Photos</span><p>Keep a receipt or a snapshot of the month alongside your reflection.</p><small>PNG, JPEG, GIF or WebP · up to 10 MB</small></div><label className={addingPhoto || section.problem ? 'money-photo-add is-disabled' : 'money-photo-add'}><span aria-hidden="true">＋</span>{addingPhoto ? 'Adding…' : 'Add photo'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Add photo" disabled={addingPhoto || Boolean(section.problem)} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; addPhoto(file); }} /></label></div>
        {hasImages ? <><ExpenseImages text={draft} path={path} files={files} disabled={addingPhoto} onRemove={(index) => update(removeExpensePhoto(state.current.draft, index))} /><p className="money-photo-hint">Removing a photo here keeps its file in your vault.</p></> : <p className="money-photos-empty">No photos yet <span>· optional</span></p>}
      </div>}
      <label className="money-writing">{field === 'expenses' && <span className="money-label">Your reflection</span>}
        <textarea aria-label={label} value={field === 'expenses' ? expenseText(draft) : current?.notes ?? draft} onChange={(event) => update(field === 'expenses' ? editExpenseText(state.current.draft, event.target.value) : sphere ? sphereValue(current?.rating ?? '', event.target.value) : event.target.value)} placeholder={field === 'expenses' ? 'How did the month feel financially?' : sphere ? 'Write a reflection…' : 'Write here…'} rows={sphere ? 6 : field === 'expenses' ? 7 : 10} />
      </label>
    </div>
    {section.problem && <p className="monthly-problem" role="alert">{section.problem}</p>}
    <div className="monthly-actions"><span>{draft === base.value ? 'Stored in this month’s note' : 'Unsaved changes'}</span><button type="button" className="primary-button" data-testid="monthly-save" disabled={draft === base.value || Boolean(status.saving) || addingPhoto || Boolean(section.problem)} onClick={() => void persist()}>{status.saving ? 'Saving…' : 'Save'}</button></div>
  </div>;
}

/** Show local Obsidian image embeds using the same vault resolver as ordinary notes. */
function ExpenseImages({ text, path, files, disabled, onRemove }: { text: string; path: string; files: VaultFile[]; disabled: boolean; onRemove: (index: number) => void }) {
  return <div className="money-photo-grid" aria-label="Expense photos">{expensePhotos(text).map(({ target }, i) => {
    const file = resolveLink(target, files, path);
    return <figure className="money-photo" key={`${target}:${i}`}>
      {file?.kind === 'image' ? <VaultImage path={file.path} alt={target} className="money-photo-image" /> : <span className="money-photo-missing">Photo unavailable</span>}
      <figcaption><span title={target}>Photo {i + 1}</span><button type="button" aria-label={`Remove photo ${i + 1}`} title="Remove from this month; keep the file" disabled={disabled} onClick={() => onRemove(i)}>Remove</button></figcaption>
    </figure>;
  })}</div>;
}
