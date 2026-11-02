import { useId, useState } from 'react';
import { metricColor } from '../../lib/metricStatus';
import { sleepParts, sleepValue } from '../../lib/sleep';

interface Props {
  value?: number;
  onCommit: (value: string) => void | Promise<string | undefined>;
}

/** The pair commits together, so moving from hours to minutes cannot save a partial edit. */
export function SleepField({ value, onCommit }: Props) {
  const hint = useId();
  const [draft, setDraft] = useState<ReturnType<typeof sleepParts>>();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const shown = draft ?? sleepParts(value);
  const commit = async () => {
    if (!draft || saving) return;
    try {
      const next = sleepValue(draft.hours, draft.minutes);
      const previous = sleepParts(value);
      if (draft.hours === previous.hours && draft.minutes === previous.minutes) { setDraft(undefined); setProblem(undefined); return; }
      setSaving(true);
      const failed = await onCommit(next);
      if (failed) throw new Error(failed);
      setDraft(undefined);
      setProblem(undefined);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="sleep-field" role="group" aria-label="Sleep duration" aria-busy={saving} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) void commit();
    }}>
      <div className="number-field sleep-inputs" style={{ color: metricColor('sleep', value) }}>
        {(['hours', 'minutes'] as const).map((part) => <label key={part}>
          <input type="text" inputMode="numeric" aria-label={`Sleep ${part}`} aria-describedby={hint} aria-invalid={problem ? true : undefined} value={shown[part]} disabled={saving} placeholder="—" data-testid={`sleep-${part}`}
            onChange={(event) => { setDraft({ ...shown, [part]: event.target.value }); setProblem(undefined); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); setDraft(undefined); setProblem(undefined); }
            }} />
          <span aria-hidden="true">{part === 'hours' ? 'h' : 'm'}</span>
        </label>)}
      </div>
      <span id={hint} className="sleep-hint">{saving ? 'Saving…' : 'hours + minutes'}</span>
      {problem && <span className="sleep-problem" role="alert">{problem} Your entry is kept; correct it or press Enter to retry.</span>}
    </div>
  );
}
