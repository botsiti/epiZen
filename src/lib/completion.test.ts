import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { wikilinkSource } from './completion';

const source = wikilinkSource(() => [
  { label: 'Glasshouse Weather', detail: 'Rating/music' },
  { label: '25.10.2026', detail: 'today' },
]);

function complete(doc: string, pos = doc.length) {
  const state = EditorState.create({ doc });
  return source(new CompletionContext(state, pos, false)) as CompletionResult | null;
}

describe('wikilinkSource', () => {
  it('offers notes after [[ and closes the link', () => {
    const result = complete('**Listened:** [[Glass');
    expect(result?.from).toBe('**Listened:** [['.length);
    expect(result?.options.map((option) => option.label)).toEqual(['Glasshouse Weather', '25.10.2026']);
    expect(result?.options[0]?.apply).toBe('Glasshouse Weather]]');
  });

  it("doesn't add ]] when the link is closed already", () => {
    expect(complete('[[Glass]]', '[[Glass'.length)?.options[0]?.apply).toBe('Glasshouse Weather');
  });

  it('stays out of the way outside a link, and after its | alias or # heading', () => {
    expect(complete('plain text')).toBeNull();
    expect(complete('[[Glasshouse Weather|alb')).toBeNull();
    expect(complete('[[Glasshouse Weather#Tra')).toBeNull();
  });
});
