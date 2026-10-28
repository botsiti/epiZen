//! Apple Calendar: its calendars and events, read and written through EventKit on this Mac.
//! Epizen keeps no copy of them. The calendar view shows the events as they are, and a task
//! planned on it becomes an event, so a plan is only ever in one place.
//!
//! Every backend behind `Calendars` is held to the same rules: times are milliseconds since the
//! epoch, an event is one occurrence (`id` and `start`, as a repeating event shares its id), and
//! only a calendar that allows changes is written to.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Whether the user lets Epizen use their calendars.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Access {
    /// Never asked: asking shows the system's prompt.
    Unknown,
    Allowed,
    /// Refused, restricted, or write-only: only System Settings can change it.
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    pub id: String,
    pub title: String,
    /// `#rrggbb`.
    pub color: String,
    pub writable: bool,
    /// Where the system puts a new event.
    pub default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub calendar: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
    /// What Senioro and Epizen put the task's words in.
    pub notes: Option<String>,
    pub url: Option<String>,
    /// Its calendar allows changes.
    pub writable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEvent {
    pub calendar: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub notes: Option<String>,
    pub url: Option<String>,
}

/// One occurrence of an event: its id, and where it starts now.
#[derive(Debug, Clone, Deserialize)]
pub struct Occurrence {
    pub id: String,
    pub start: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct EventChange {
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub title: Option<String>,
    pub notes: Option<String>,
}

pub trait Calendars: Send + Sync {
    fn access(&self) -> Access;
    /// Asks the user the first time, and waits for the answer.
    fn request_access(&self) -> Access;
    fn calendars(&self) -> Result<Vec<CalendarInfo>, String>;
    /// Every event that overlaps `from`..`to`, all-day ones too, in every calendar.
    fn events(&self, from: i64, to: i64) -> Result<Vec<Event>, String>;
    fn create(&self, event: &NewEvent) -> Result<Event, String>;
    fn update(&self, at: &Occurrence, change: &EventChange) -> Result<Event, String>;
    fn delete(&self, at: &Occurrence) -> Result<(), String>;
}

/// An occurrence is found within a minute of where the page last saw it start.
pub const SAME_START_MS: i64 = 60_000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// A start and end an event can take: in order, and at most a week long.
pub fn check_times(start: i64, end: i64) -> Result<(), String> {
    if end <= start {
        return Err("An event ends after it starts.".to_owned());
    }
    if end - start > 7 * DAY_MS {
        return Err("An event from Epizen is at most a week long.".to_owned());
    }
    Ok(())
}

/// The times and title an occurrence will have after `change`, checked.
pub fn changed(start: i64, end: i64, title: &str, change: &EventChange) -> Result<(i64, i64, String), String> {
    let next = (change.start.unwrap_or(start), change.end.unwrap_or(end));
    check_times(next.0, next.1)?;
    let title = change.title.clone().unwrap_or_else(|| title.to_owned());
    if title.trim().is_empty() {
        return Err("An event has a title.".to_owned());
    }
    Ok((next.0, next.1, title))
}

/// Calendars kept in memory: the e2e build's, so a test never reaches the real ones, and the
/// unit tests'.
pub struct MemoryCalendars {
    state: Mutex<Memory>,
}

struct Memory {
    access: Access,
    calendars: Vec<CalendarInfo>,
    events: Vec<Event>,
    next: u64,
}

impl MemoryCalendars {
    pub fn new(access: Access, calendars: Vec<CalendarInfo>, events: Vec<Event>) -> Self {
        Self { state: Mutex::new(Memory { access, calendars, events, next: 1 }) }
    }

    /// What the e2e build starts with: access given, a calendar for home (the default) and for
    /// work, a read-only one for holidays, an appointment on 14 August 2026 (a day of the demo
    /// vault's) and a holiday all that day.
    pub fn demo() -> Self {
        let calendar = |id: &str, title: &str, color: &str, writable: bool, default: bool| CalendarInfo {
            id: id.to_owned(),
            title: title.to_owned(),
            color: color.to_owned(),
            writable,
            default,
        };
        // Around 12:00 UTC: 14 August wherever the test runs, from UTC−11 to UTC+11. The holiday
        // is all-day but only two hours long, so it stays on the 14th in every time zone too.
        let noon = 1_786_708_800_000;
        let hour = 60 * 60 * 1000;
        Self::new(
            Access::Allowed,
            vec![
                calendar("home", "Home", "#5b8def", true, true),
                calendar("work", "Work", "#e0707f", true, false),
                calendar("holidays", "Holidays", "#86d8ac", false, false),
            ],
            vec![
                Event {
                    id: "dentist".to_owned(),
                    calendar: "home".to_owned(),
                    title: "Dentist".to_owned(),
                    start: noon,
                    end: noon + hour,
                    all_day: false,
                    notes: Some("check-up".to_owned()),
                    url: None,
                    writable: true,
                },
                Event {
                    id: "holiday".to_owned(),
                    calendar: "holidays".to_owned(),
                    title: "Summer holiday".to_owned(),
                    start: noon - hour,
                    end: noon + hour,
                    all_day: true,
                    notes: None,
                    url: None,
                    writable: false,
                },
            ],
        )
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Memory> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Memory {
    fn allowed(&self) -> Result<(), String> {
        match self.access {
            Access::Allowed => Ok(()),
            _ => Err("Epizen can't use your calendars.".to_owned()),
        }
    }

    fn writable(&self, calendar: &str) -> Result<(), String> {
        match self.calendars.iter().find(|c| c.id == calendar) {
            None => Err("That calendar is gone.".to_owned()),
            Some(c) if !c.writable => Err(format!("{} can't be changed.", c.title)),
            Some(_) => Ok(()),
        }
    }

    fn find(&self, at: &Occurrence) -> Result<usize, String> {
        self.events
            .iter()
            .position(|e| e.id == at.id && (e.start - at.start).abs() < SAME_START_MS)
            .ok_or_else(|| "That event has changed in Calendar.".to_owned())
    }
}

impl Calendars for MemoryCalendars {
    fn access(&self) -> Access {
        self.lock().access
    }

    fn request_access(&self) -> Access {
        let mut memory = self.lock();
        if memory.access == Access::Unknown {
            memory.access = Access::Allowed;
        }
        memory.access
    }

    fn calendars(&self) -> Result<Vec<CalendarInfo>, String> {
        let memory = self.lock();
        memory.allowed()?;
        Ok(memory.calendars.clone())
    }

    fn events(&self, from: i64, to: i64) -> Result<Vec<Event>, String> {
        let memory = self.lock();
        memory.allowed()?;
        let mut found: Vec<Event> = memory.events.iter().filter(|e| e.start < to && e.end > from).cloned().collect();
        found.sort_by_key(|e| (e.start, e.end));
        Ok(found)
    }

    fn create(&self, event: &NewEvent) -> Result<Event, String> {
        let mut memory = self.lock();
        memory.allowed()?;
        memory.writable(&event.calendar)?;
        check_times(event.start, event.end)?;
        let made = Event {
            id: format!("memory-{}", memory.next),
            calendar: event.calendar.clone(),
            title: event.title.clone(),
            start: event.start,
            end: event.end,
            all_day: false,
            notes: event.notes.clone(),
            url: event.url.clone(),
            writable: true,
        };
        memory.next += 1;
        memory.events.push(made.clone());
        Ok(made)
    }

    fn update(&self, at: &Occurrence, change: &EventChange) -> Result<Event, String> {
        let mut memory = self.lock();
        memory.allowed()?;
        let index = memory.find(at)?;
        let calendar = memory.events[index].calendar.clone();
        memory.writable(&calendar)?;
        let event = &mut memory.events[index];
        (event.start, event.end, event.title) = changed(event.start, event.end, &event.title, change)?;
        if let Some(notes) = &change.notes {
            event.notes = Some(notes.clone());
        }
        Ok(event.clone())
    }

    fn delete(&self, at: &Occurrence) -> Result<(), String> {
        let mut memory = self.lock();
        memory.allowed()?;
        let index = memory.find(at)?;
        let calendar = memory.events[index].calendar.clone();
        memory.writable(&calendar)?;
        memory.events.remove(index);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: i64 = 60 * 60 * 1000;

    fn plan(calendar: &str, start: i64) -> NewEvent {
        NewEvent {
            calendar: calendar.to_owned(),
            title: "sport".to_owned(),
            start,
            end: start + HOUR,
            notes: Some("evening run".to_owned()),
            url: Some("epizen://task?note=a.md&id=20260814-01".to_owned()),
        }
    }

    #[test]
    fn creates_moves_and_deletes_one_occurrence() {
        let cal = MemoryCalendars::demo();
        // 16 August, two days after the demo's appointment and holiday.
        let start = 1_786_903_200_000;
        let made = cal.create(&plan("home", start)).unwrap();
        assert_eq!(made.url.as_deref(), Some("epizen://task?note=a.md&id=20260814-01"));
        assert_eq!(cal.events(start, start + HOUR).unwrap(), vec![made.clone()]);

        // Found within a minute of where it was seen; the other event is left alone.
        let moved = cal
            .update(&Occurrence { id: made.id.clone(), start: start + 30_000 }, &EventChange { start: Some(start + HOUR), end: Some(start + 2 * HOUR), ..EventChange::default() })
            .unwrap();
        assert_eq!((moved.start, moved.end, moved.title.as_str(), moved.notes.as_deref()), (start + HOUR, start + 2 * HOUR, "sport", Some("evening run")));
        let renamed = cal.update(&Occurrence { id: made.id.clone(), start: start + HOUR }, &EventChange { notes: Some("evening swim".to_owned()), ..EventChange::default() }).unwrap();
        assert_eq!((renamed.title.as_str(), renamed.notes.as_deref()), ("sport", Some("evening swim")));
        assert!(cal.events(start, start + HOUR).unwrap().is_empty());
        assert_eq!(cal.events(0, i64::MAX).unwrap().len(), 3);

        let stale = Occurrence { id: made.id.clone(), start };
        assert!(cal.delete(&stale).unwrap_err().contains("changed"));
        cal.delete(&Occurrence { id: made.id, start: start + HOUR }).unwrap();
        assert_eq!(cal.events(0, i64::MAX).unwrap().len(), 2);
    }

    #[test]
    fn refuses_a_read_only_calendar_a_gone_one_and_times_out_of_order() {
        let cal = MemoryCalendars::demo();
        let start = 1_786_730_400_000;
        assert!(cal.create(&plan("holidays", start)).unwrap_err().contains("can't be changed"));
        assert!(cal.create(&plan("gone", start)).unwrap_err().contains("gone"));
        let mut backwards = plan("home", start);
        backwards.end = start;
        assert!(cal.create(&backwards).unwrap_err().contains("ends after"));
        let mut long = plan("home", start);
        long.end = start + 8 * DAY_MS;
        assert!(cal.create(&long).unwrap_err().contains("a week"));
        let made = cal.create(&plan("work", start)).unwrap();
        let blank = EventChange { title: Some("  ".to_owned()), ..EventChange::default() };
        assert!(cal.update(&Occurrence { id: made.id, start }, &blank).unwrap_err().contains("title"));
    }

    #[test]
    fn reads_nothing_until_access_is_given() {
        let cal = MemoryCalendars::new(Access::Unknown, Vec::new(), Vec::new());
        assert!(cal.events(0, 1).is_err());
        assert_eq!(cal.request_access(), Access::Allowed);
        assert_eq!(cal.events(0, 1).unwrap(), Vec::new());
        let denied = MemoryCalendars::new(Access::Denied, Vec::new(), Vec::new());
        assert_eq!(denied.request_access(), Access::Denied);
        assert!(denied.calendars().is_err());
    }
}
