# Habits

Open **Habits** from the sidebar. Add a daily habit with **New habit**, or use **Continue recent
routine** to carry forward the latest habit set found in your daily notes. The History collection
also lets you continue an older habit individually. No existing daily note is rewritten by this step.

Active habits appear in the day's Overview and Habits tab from their start date. Checking one
writes a normal Markdown checkbox to that day's note. The manager and monthly/weekly dashboards
read the same history.

Use **Archive** and choose the first date the habit is no longer needed. It disappears from that
routine; its note, previous completions and best streak remain. Use **Reactivate** to add a new
tracking period. Choose whether to resume the paused streak or start a new current streak. Days
outside tracking periods do not count as missed. Today remains pending until the day ends.

## Markdown format

A habit definition is an ordinary note in `Habits/`, for example:

```yaml
---
type: habit
habit_id: 92ea36f8-example-id
name: No sweets
aliases: []
periods:
  - from: 2026-11-01
    until: 2026-12-01
  - from: 2027-01-01
---
```

`until` is exclusive: December 1 is the first inactive date. A later period can include
`reset: true` to start a fresh current streak. A same-day start/end is an unused, archived period.
The remaining Markdown body belongs to you; schedule edits preserve it.

Daily records use Obsidian-compatible callouts and inline fields:

```markdown
> [!habits]- Habits
> - [x] No sweets [habit::92ea36f8-example-id]
```

Older habit records without IDs are matched by their names and aliases. Do not create another
habit for a return to an old routine: reactivate the existing definition to keep one history.
Conflicting IDs, names, malformed schedules and duplicate daily records are reported, rather
than silently edited. If you rename a definition by hand, keep the former name in `aliases`.
