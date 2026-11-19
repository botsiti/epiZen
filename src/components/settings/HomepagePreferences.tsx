import { today } from '../../lib/dates';
import { memento, parseBirthDate, validLifetimeYears } from '../../lib/home';
import { HOME_SECTIONS, type HomeSections } from '../../lib/plugins';
import { PreferenceIcon } from './icons';

interface Props {
  birth: string; years: string; sections?: HomeSections;
  onBirth: (value: string) => void; onYears: (value: string) => void; onSections: (value: HomeSections) => void;
}
const icons: Record<keyof HomeSections, string> = {
  profile: 'home', memento: 'timer', averages: 'checkins', focus: 'statistics', today: 'day', spheres: 'graph', quests: 'quests', library: 'library',
};

export function HomepagePreferences({ birth, years, sections, onBirth, onYears, onSections }: Props) {
  const date = parseBirthDate(birth), now = today();
  const life = date && date <= now && validLifetimeYears(Number(years)) ? memento(now, date, Number(years)).life : undefined;
  return <>
    <section className="pref-group" data-testid="settings-home">
      <div className="pref-group-caption"><h3>Time in perspective</h3><p>Your birth date and expected lifespan set the lifetime bar on Home and Summaries.</p></div>
      <div className="lifetime-editor"><div className="lifetime-fields">
        <label>Birth date<input aria-label="Birth date" value={birth} onChange={(event) => onBirth(event.target.value)} placeholder="YYYY-MM-DD" inputMode="numeric" data-testid="settings-birth-date" /></label>
        <label>Expected years to live<input aria-label="Expected years to live" type="number" min="1" step="1" value={years} onChange={(event) => onYears(event.target.value)} data-testid="settings-lifetime-years" /></label>
      </div>{life && <div className="lifetime-readback"><div><span>Lifetime lived</span><strong>{(life.share * 100).toFixed(1)}%</strong></div>
        <progress aria-label="Lifetime lived" max={1} value={life.share} /></div>}</div>
    </section>
    {sections && <section className="pref-group"><div className="pref-group-caption"><h3>Homepage sections</h3><p>Choose the sections to show. Plugin sections appear when their plugin is enabled.</p></div>
      <div className="home-section-list">{HOME_SECTIONS.map(({ key, label }) => <label key={key}><PreferenceIcon name={icons[key]} /><span>{label}</span>
        <input className="preference-switch" type="checkbox" aria-label={label} checked={sections[key]} onChange={(event) => onSections({ ...sections, [key]: event.target.checked })} /></label>)}</div>
    </section>}
  </>;
}
