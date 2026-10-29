import { genreName } from '../../lib/library';

/** Suggestions are ordered by library frequency by the caller. */
export function GenreSuggestions({ query, selected, suggestions, onSelect }: { query: string; selected: string[]; suggestions: string[]; onSelect: (value: string) => void }) {
  const needle = genreName(query);
  if (!needle || needle.includes(',')) return null;
  const chosen = new Set(selected.map(genreName));
  const match = (value: string) => {
    const name = genreName(value);
    if (name.includes(needle)) return 0;
    if (needle.length >= 4 && [...needle].some((_, index) => name.includes(needle.slice(0, index) + needle.slice(index + 1)))) return 1;
    return 2;
  };
  const matches = suggestions.filter((value) => !chosen.has(genreName(value)) && match(value) < 2).sort((a, b) => match(a) - match(b)).slice(0, 8);
  if (!matches.length) return null;
  return <div className="genre-suggestions" role="group" aria-label="Suggested genres">
    {matches.map((value) => <button type="button" key={value} onClick={() => onSelect(value)}>{value}</button>)}
  </div>;
}
