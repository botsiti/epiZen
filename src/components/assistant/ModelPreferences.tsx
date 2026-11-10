import { useState } from 'react';
import type { AssistantSettings } from '../../lib/assistant/types';
const MODELS = [
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', detail: 'Everyday conversations and actions' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', detail: 'Complex questions and deeper reasoning' },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', detail: 'Technical and coding work' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', detail: 'Quick, lightweight tasks' },
];
export function ModelPreferences({ value, onChange }: { value: AssistantSettings; onChange: (value: AssistantSettings) => void }) {
  const [custom, setCustom] = useState(!MODELS.some((model) => model.id === value.model));
  return <section className="spike-settings-group" aria-label="Intelligence">
    <h3>Intelligence</h3>
    <label>Model<select aria-label="Assistant model" value={custom ? 'custom' : value.model} onChange={(event) => {
      const model = event.target.value; setCustom(model === 'custom');
      if (model !== 'custom') onChange({ ...value, model });
    }}>{MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}<option value="custom">Custom model…</option></select></label>
    {custom ? <label>Model identifier<input aria-label="Custom assistant model" value={value.model} spellCheck={false} onChange={(event) => onChange({ ...value, model: event.target.value })} /></label> : <p className="assistant-hint">{MODELS.find((model) => model.id === value.model)?.detail}. Availability depends on your connection.</p>}
    <label>Reasoning effort<select aria-label="Reasoning effort" value={value.effort} onChange={(event) => onChange({ ...value, effort: event.target.value as AssistantSettings['effort'] })}><option value="low">Quick · low</option><option value="medium">Balanced · medium</option><option value="high">Thorough · high</option><option value="xhigh">Deep · extra high</option></select></label>
    <p className="assistant-hint">More reasoning can take longer. This choice applies to your next message.</p>
  </section>;
}
