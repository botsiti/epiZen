const artwork = import.meta.glob<string>('./icons/*.png', { eager: true, query: '?url', import: 'default' });

function automaticIcon(name: string, kind?: string) {
  if (/morning|sunrise|forest/i.test(name)) return 'sunrise';
  if (/sleep|night|bedtime/i.test(name)) return 'moon';
  if (/sweet|water|tea|coffee|meal/i.test(name)) return 'tea';
  if (/conscious|reflect|journal/i.test(name)) return 'candle';
  if (/hour|focus|time/i.test(name)) return 'hourglass';
  if (/read|book|news/i.test(name)) return 'book';
  if (/exercise|strength|workout|gym/i.test(name)) return 'strength';
  if (/meditat|mindful|breath|yoga/i.test(name)) return 'lotus';
  return kind === 'measure' ? 'hourglass' : 'sprout';
}

export function HabitIcon({ name, icon, kind }: { name: string; icon?: string; kind?: string }) {
  const key = icon ?? automaticIcon(name, kind);
  const art = artwork[`./icons/${key}.png`];
  return <span className="habit-symbol" aria-hidden="true">
    {art
      ? <img src={art} alt="" width="32" height="32" draggable={false} /> : key}
  </span>;
}
