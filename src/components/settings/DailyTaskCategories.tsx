import { changeTaskCategory, newTaskRule, type QuestPreferences } from '../../lib/questPreferences';
import { SettingsNameList } from './SettingsNameList';

export function DailyTaskCategories({ draft, onChange }: { draft: QuestPreferences; onChange: (value: QuestPreferences) => void }) {
  return <SettingsNameList title="Task categories" noun="category"
    description="Daily tasks and the focus timer use these names. Spaces become hyphens in #daily/ tags."
    items={draft.categories.map((item) => ({ ...item, name: item.tag, discardable: !item.tag.trim() && !item.aliases.length && !draft.base.categories.some((category) => category.id === item.id) }))}
    onAdd={(id) => onChange({ ...draft, categories: [...draft.categories, newTaskRule(id, draft.effectiveFrom, draft.categories.length)] })}
    onDiscard={(id) => onChange({ ...draft, categories: draft.categories.filter((item) => item.id !== id) })}
    onRename={(id, tag) => onChange(changeTaskCategory(draft, id, { tag }))}
    onArchive={(id, archived) => onChange(changeTaskCategory(draft, id, { archived }))} />;
}
