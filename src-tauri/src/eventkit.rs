//! `Calendars` on EventKit: the user's Apple Calendar on this Mac, as Senioro reaches it
//! (`CalendarService.swift`). Every call takes the store's lock and an autorelease pool, so the
//! store is used by one thread at a time and nothing it hands out outlives the call.

use std::sync::Mutex;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::{Retained, autoreleasepool};
use objc2::runtime::Bool;
use objc2::{ClassType, sel};
use objc2_app_kit::NSColorSpace;
use objc2_event_kit::{EKAuthorizationStatus, EKCalendar, EKEntityType, EKEvent, EKEventStore, EKSpan};
use objc2_foundation::{NSDate, NSError, NSString, NSURL};

use crate::calendar::{Access, CalendarInfo, Calendars, Event, EventChange, NewEvent, Occurrence, SAME_START_MS, changed, check_times};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// How long the system's prompt waits for the user before Epizen stops asking.
const PROMPT_WAIT: Duration = Duration::from_secs(600);

/// The store, behind a lock. EventKit's objects aren't marked as safe to send between threads;
/// the lock is what keeps them on one thread at a time.
struct Store(Retained<EKEventStore>);
// SAFETY: the store is only reached through `EventKit::with`, under the mutex.
unsafe impl Send for Store {}

pub struct EventKit {
    store: Mutex<Option<Store>>,
}

impl EventKit {
    pub fn new() -> Self {
        Self { store: Mutex::new(None) }
    }

    /// Runs `f` on the store, made the first time it is needed, once access is given.
    fn with<T>(&self, f: impl FnOnce(&EKEventStore) -> Result<T, String>) -> Result<T, String> {
        if self.access() != Access::Allowed {
            return Err("Epizen can't use your calendars. Allow it in System Settings, under Privacy & Security, Calendars.".to_owned());
        }
        let mut slot = self.store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        autoreleasepool(|_| f(made(&mut slot)))
    }
}

/// The store in the slot, made on first use. Making one never prompts; only asking does.
fn made(slot: &mut Option<Store>) -> &EKEventStore {
    // SAFETY: `new` is how an EKEventStore is made.
    &slot.get_or_insert_with(|| Store(unsafe { EKEventStore::new() })).0
}

fn status() -> EKAuthorizationStatus {
    // SAFETY: a class method that only reads the app's permission.
    unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) }
}

fn date(ms: i64) -> Retained<NSDate> {
    NSDate::dateWithTimeIntervalSince1970(ms as f64 / 1000.0)
}

fn ms(date: &NSDate) -> i64 {
    (date.timeIntervalSince1970() * 1000.0).round() as i64
}

fn message(err: &NSError) -> String {
    err.localizedDescription().to_string()
}

/// `#rrggbb` for a calendar's colour, in sRGB.
fn color(calendar: &EKCalendar) -> String {
    // SAFETY: reads the calendar's colour; a colour that can't be put in sRGB comes out grey.
    let rgb = unsafe { calendar.color() }.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace());
    let [r, g, b] = rgb.map_or([0.6; 3], |c| [c.redComponent(), c.greenComponent(), c.blueComponent()]);
    let byte = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", byte(r), byte(g), byte(b))
}

/// An event as the page sees it. `None` for one EventKit hasn't given an identifier.
fn event(event: &EKEvent) -> Option<Event> {
    // SAFETY: getters on an event the store just returned, inside its call.
    unsafe {
        let calendar = event.calendar();
        Some(Event {
            id: event.eventIdentifier()?.to_string(),
            calendar: calendar.as_ref().map(|c| c.calendarIdentifier().to_string()).unwrap_or_default(),
            title: event.title().to_string(),
            start: ms(&event.startDate()),
            end: ms(&event.endDate()),
            all_day: event.isAllDay(),
            notes: event.notes().map(|notes| notes.to_string()).filter(|notes| !notes.is_empty()),
            url: event.URL().and_then(|url| url.absoluteString()).map(|url| url.to_string()),
            writable: calendar.is_some_and(|c| c.allowsContentModifications()),
        })
    }
}

fn events_between(store: &EKEventStore, from: i64, to: i64) -> Vec<Retained<EKEvent>> {
    // SAFETY: a predicate over every calendar, and the events it matches.
    let found = unsafe {
        let predicate = store.predicateForEventsWithStartDate_endDate_calendars(&date(from), &date(to), None);
        store.eventsMatchingPredicate(&predicate)
    };
    (0..found.count()).map(|i| found.objectAtIndex(i)).collect()
}

/// The occurrence the page means: its id, starting within a minute of where it was seen.
fn occurrence(store: &EKEventStore, at: &Occurrence) -> Result<Retained<EKEvent>, String> {
    events_between(store, at.start - DAY_MS, at.start + DAY_MS)
        .into_iter()
        // SAFETY: getters on events the store just returned.
        .find(|e| unsafe { e.eventIdentifier() }.is_some_and(|id| id.to_string() == at.id) && (unsafe { ms(&e.startDate()) } - at.start).abs() < SAME_START_MS)
        .ok_or_else(|| "That event has changed in Calendar.".to_owned())
}

fn writable(event: &EKEvent) -> Result<(), String> {
    // SAFETY: getters on an event the store just returned.
    match unsafe { event.calendar() } {
        Some(calendar) if unsafe { calendar.allowsContentModifications() } => Ok(()),
        Some(calendar) => Err(format!("{} can't be changed.", unsafe { calendar.title() })),
        None => Err("That event has no calendar.".to_owned()),
    }
}

/// The prompt as macOS 13 and earlier ask it.
#[allow(deprecated)]
fn ask_before_macos_14(store: &EKEventStore, answered: &RcBlock<dyn Fn(Bool, *mut NSError)>) {
    // SAFETY: as in `request_access`.
    unsafe { store.requestAccessToEntityType_completion(EKEntityType::Event, RcBlock::as_ptr(answered)) };
}

impl Calendars for EventKit {
    fn access(&self) -> Access {
        match status() {
            EKAuthorizationStatus::NotDetermined => Access::Unknown,
            EKAuthorizationStatus::FullAccess => Access::Allowed,
            _ => Access::Denied,
        }
    }

    fn request_access(&self) -> Access {
        if self.access() != Access::Unknown {
            return self.access();
        }
        let (tx, rx) = mpsc::channel();
        let answered = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
            let _ = tx.send(granted.as_bool());
        });
        {
            let mut slot = self.store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let store = made(&mut slot);
            // SAFETY: EventKit copies the block and keeps it until it answers; macOS 14 renamed the call.
            if EKEventStore::class().responds_to(sel!(requestFullAccessToEventsWithCompletion:)) {
                unsafe { store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&answered)) };
            } else {
                ask_before_macos_14(store, &answered);
            }
        }
        if rx.recv_timeout(PROMPT_WAIT).unwrap_or(false) {
            // A store made before access was given holds no calendars until it is reset.
            let guard = self.store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(store) = guard.as_ref() {
                // SAFETY: drops the store's cached state.
                unsafe { store.0.reset() };
            }
        }
        self.access()
    }

    fn calendars(&self) -> Result<Vec<CalendarInfo>, String> {
        self.with(|store| {
            // SAFETY: getters on the store and the calendars it returns.
            unsafe {
                let default = store.defaultCalendarForNewEvents().map(|c| c.calendarIdentifier().to_string());
                let all = store.calendarsForEntityType(EKEntityType::Event);
                Ok((0..all.count())
                    .map(|i| {
                        let calendar = all.objectAtIndex(i);
                        let id = calendar.calendarIdentifier().to_string();
                        CalendarInfo {
                            default: default.as_deref() == Some(id.as_str()),
                            title: calendar.title().to_string(),
                            color: color(&calendar),
                            writable: calendar.allowsContentModifications(),
                            id,
                        }
                    })
                    .collect())
            }
        })
    }

    fn events(&self, from: i64, to: i64) -> Result<Vec<Event>, String> {
        if to <= from || to - from > 62 * DAY_MS {
            return Err("Epizen reads at most two months of events at a time.".to_owned());
        }
        self.with(|store| {
            let mut found: Vec<Event> = events_between(store, from, to).iter().filter_map(|e| event(e)).collect();
            found.sort_by_key(|e| (e.start, e.end));
            Ok(found)
        })
    }

    fn create(&self, new: &NewEvent) -> Result<Event, String> {
        check_times(new.start, new.end)?;
        self.with(|store| {
            // SAFETY: a new event in the store, set up and saved inside this call.
            unsafe {
                let calendar = store.calendarWithIdentifier(&NSString::from_str(&new.calendar)).ok_or("That calendar is gone.")?;
                if !calendar.allowsContentModifications() {
                    return Err(format!("{} can't be changed.", calendar.title()));
                }
                let made = EKEvent::eventWithEventStore(store);
                made.setCalendar(Some(&calendar));
                made.setTitle(Some(&NSString::from_str(&new.title)));
                made.setStartDate(Some(&date(new.start)));
                made.setEndDate(Some(&date(new.end)));
                if let Some(notes) = &new.notes {
                    made.setNotes(Some(&NSString::from_str(notes)));
                }
                if let Some(url) = &new.url {
                    made.setURL(NSURL::URLWithString(&NSString::from_str(url)).as_deref());
                }
                store.saveEvent_span_commit_error(&made, EKSpan::ThisEvent, true).map_err(|err| message(&err))?;
                event(&made).ok_or_else(|| "Calendar saved the event without an id.".to_owned())
            }
        })
    }

    fn update(&self, at: &Occurrence, change: &EventChange) -> Result<Event, String> {
        self.with(|store| {
            let found = occurrence(store, at)?;
            writable(&found)?;
            // SAFETY: setters on an event the store just returned, saved inside this call.
            unsafe {
                let (start, end, title) = changed(ms(&found.startDate()), ms(&found.endDate()), &found.title().to_string(), change)?;
                found.setStartDate(Some(&date(start)));
                found.setEndDate(Some(&date(end)));
                found.setTitle(Some(&NSString::from_str(&title)));
                if let Some(notes) = &change.notes {
                    found.setNotes(Some(&NSString::from_str(notes)));
                }
                store.saveEvent_span_commit_error(&found, EKSpan::ThisEvent, true).map_err(|err| message(&err))?;
            }
            event(&found).ok_or_else(|| "Calendar lost the event's id.".to_owned())
        })
    }

    fn delete(&self, at: &Occurrence) -> Result<(), String> {
        self.with(|store| {
            let found = occurrence(store, at)?;
            writable(&found)?;
            // SAFETY: removes an event the store just returned.
            unsafe { store.removeEvent_span_commit_error(&found, EKSpan::ThisEvent, true) }.map_err(|err| message(&err))
        })
    }
}
