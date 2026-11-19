import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calendarMoment, calendarZonePreference, systemCalendarZone } from '../../lib/calendarZone';
import { Layer } from '../Layer';

interface Props {
  value?: string;
  instant: number;
  onSave: (zone: string | undefined) => Promise<void>;
}

const readable = (id: string) => id.replaceAll('_', ' ');
const city = (zone: string) => readable(zone.split('/').at(-1) ?? zone);
const searchable = (name: string) => readable(name).toLowerCase().replace(/[ /-]+/g, ' ').trim();

export function CalendarZonePicker({ value, instant, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = value ?? systemCalendarZone();
  const offset = calendarMoment(instant, current).offset.replace('-', '−');
  return <>
    <button type="button" ref={trigger} className="nav-chip cal-zone-trigger" aria-label="Calendar time zone" aria-haspopup="dialog" aria-expanded={open}
      title={`${value ? 'Calendar time zone' : 'Mac time zone'} · ${current}`} onClick={() => setOpen(true)} data-testid="cal-time-zone">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><ellipse cx="10" cy="10" rx="3.5" ry="7.5"/><path d="M2.5 10h15"/></svg>
      <span>{city(current)}</span><small>UTC{offset}</small>
    </button>
    {open && <ZoneDialog value={value} onSave={onSave} onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} />}
  </>;
}

function ZoneDialog({ value, onSave, onClose }: Omit<Props, 'instant'> & { onClose: () => void }) {
  const [query, setQuery] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const title = useId(), local = systemCalendarZone();
  useEffect(() => {
    const node = dialog.current;
    if (node?.showModal) node.showModal();
    else node?.setAttribute('open', '');
    searchInput.current?.focus();
  }, []);
  const all = useMemo(() => [...new Set(['UTC', local, ...(value ? [value] : []), ...(Intl.supportedValuesOf?.('timeZone') ?? ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'])])].sort(), [local, value]);
  const filtered = useMemo(() => {
    const search = searchable(query);
    const matches = all.filter((zone) => searchable(zone).includes(search));
    const typed = query.trim() && calendarZonePreference(query.trim().replaceAll(' ', '_'));
    if (typed && !matches.includes(typed)) matches.unshift(typed);
    return matches;
  }, [all, query]);
  const close = () => { dialog.current?.close?.(); onClose(); };
  const choose = async (next: string | undefined) => {
    if (saving) return;
    if (next === value) { close(); return; }
    setSaving(true); setError('');
    try { await onSave(next); close(); }
    catch (reason) { setError(`Couldn’t save the calendar time zone. ${String(reason)}`); setSaving(false); }
  };
  return <Layer><dialog ref={dialog} className="cal-zone-dialog" aria-labelledby={title} onCancel={(event) => { event.preventDefault(); if (!saving) close(); }}
    onClick={(event) => { if (event.target === dialog.current && !saving) close(); }}>
    <div className="cal-zone-content">
      <header><h2 id={title}>Calendar time zone</h2><button type="button" aria-label="Close time zones" disabled={saving} onClick={close}>×</button></header>
      <button className="cal-zone-option is-system" type="button" aria-pressed={!value} disabled={saving} onClick={() => void choose(undefined)}>
        <span>Follow Mac time zone<small>{readable(local)}</small></span><span aria-hidden="true">{!value && '✓'}</span>
      </button>
      <input ref={searchInput} type="search" aria-label="Search time zones" placeholder="Search city or region…" autoFocus value={query}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && filtered.length === 1) void choose(filtered[0]);
          if (event.key === 'ArrowDown') { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('.cal-zone-list button')?.focus(); }
        }} />
      <div className="cal-zone-list" role="group" aria-label="Time zones">
        {filtered.map((zone) => <button type="button" className="cal-zone-option" key={zone} aria-pressed={value === zone} disabled={saving} onClick={() => void choose(zone)}>
          <span>{readable(zone)}</span><span aria-hidden="true">{value === zone && '✓'}</span></button>)}
        {!filtered.length && <p role="status">No matching time zones.</p>}
      </div>
      {error && <p className="note-warning" role="alert">{error}</p>}
    </div>
  </dialog></Layer>;
}
