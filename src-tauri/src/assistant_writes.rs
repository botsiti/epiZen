//! Conditional note actions with durable receipts. A retry after a crash inspects the outcome
//! and never blindly repeats a write. Vault is still the sole note filesystem boundary.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use crate::{Settings, Vault};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NoteAction {
    pub id: String,
    pub root: String,
    pub path: String,
    pub before: Option<String>,
    pub after: String,
}
#[derive(Deserialize, Serialize)]
struct Receipt { id: String, fingerprint: String, path: String, done: bool, draft: Option<String>, #[serde(default)] result: Option<String>, #[serde(default)] abandoned: bool, #[serde(default)] root: String }
fn fingerprint(action: &impl Serialize) -> Result<String, String> {
    serde_json::to_vec(action).map(|bytes| format!("{:x}", Sha256::digest(bytes))).map_err(|_| "Couldn’t identify this action.".to_owned())
}
fn save(settings: &Settings, receipts: &[Receipt]) -> Result<(), String> {
    let value = serde_json::to_value(receipts).map_err(|_| "Couldn’t prepare the action history.".to_owned())?;
    settings.save_assistant_actions(&value).map_err(|_| "Couldn’t save the action history. Your draft is retained; do not repeat this action until storage is available.".to_owned())
}
/// Caller serializes this operation with every other assistant note write.
pub fn apply_note(vault: &Vault, settings: &Settings, action: &NoteAction) -> Result<String, String> {
    if vault.root() != action.root { return Err("The vault changed. This action was not applied.".to_owned()); }
    if action.id.is_empty() || action.id.len() > 200 || action.after.len() > 1_000_000 || action.before.as_ref().is_some_and(|text| text.len() > 1_000_000) {
        return Err("This assistant action is too large or has no identifier.".to_owned());
    }
    let mark = fingerprint(action)?;
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|_| "The action history is unreadable. Review it before making further assistant changes.".to_owned())?)
        .map_err(|_| "The action history has an invalid format. No note was changed.".to_owned())?;
    if let Some(index) = receipts.iter().position(|receipt| receipt.id == action.id) {
        if receipts[index].fingerprint != mark { return Err("This action identifier belongs to a different change.".to_owned()); }
        if receipts[index].abandoned { return Err("Retrying this action was stopped. Start a new request after reviewing the note.".to_owned()); }
        if receipts[index].done { return Ok(action.path.clone()); }
        if vault.read_note(&action.path).ok().as_deref() == Some(action.after.as_str()) {
            receipts[index].done = true; receipts[index].draft = None; save(settings, &receipts)?;
            return Ok(action.path.clone());
        }
        return Err("The earlier save has an uncertain outcome. Your draft is retained in the action history. Review the note before trying a new action.".to_owned());
    }
    if receipts.iter().filter(|receipt| !receipt.done && !receipt.abandoned).count() >= 32 { return Err("Resolve the pending assistant saves before making more changes.".to_owned()); }
    // Completed receipts retain only identifiers and fingerprints, not note contents. Keep
    // them so resuming an old conversation cannot replay a completed action after pruning.
    // Reject known conflicts before creating a pending receipt. Vault repeats the comparison
    // immediately before its atomic replacement to contain external edits during this save.
    if let Some(expected) = &action.before {
        if vault.read_note(&action.path).map_err(|error| error.to_string())? != *expected { return Err("This note changed. Read it again before applying your draft.".to_owned()); }
    } else if vault.read_note(&action.path).is_ok() { return Err("A note already exists here. Nothing was replaced.".to_owned()); }
    receipts.push(Receipt { id: action.id.clone(), fingerprint: mark, path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone() });
    save(settings, &receipts)?;
    match &action.before {
        Some(expected) => vault.write_note(&action.path, &action.after, expected),
        None => vault.create_note(&action.path, &action.after),
    }.map_err(|error| error.to_string())?;
    let receipt = receipts.last_mut().expect("just inserted"); receipt.done = true; receipt.draft = None;
    save(settings, &receipts)?;
    Ok(action.path.clone())
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CalendarAction {
    pub id: String, pub root: String, pub calendar: String, pub title: String,
    pub start: i64, pub end: i64, pub notes: Option<String>,
}
/// Never create an event a second time when its first outcome is uncertain. The receipt keeps
/// that state visible even after a restart, independently of the model's subsequent response.
pub fn apply_calendar(calendars: &dyn crate::Calendars, settings: &Settings, action: &CalendarAction) -> Result<String, String> {
    if action.id.is_empty() || action.id.len() > 200 || action.title.trim().is_empty() || action.title.len() > 1000 || action.notes.as_ref().is_some_and(|text| text.len() > 16000) { return Err("Invalid calendar action.".to_owned()); }
    if action.end.checked_sub(action.start).is_none() { return Err("Invalid event times.".to_owned()); }
    crate::calendar::check_times(action.start, action.end)?;
    let mark = fingerprint(action)?;
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|_| "The action history is unreadable.".to_owned())?).map_err(|_| "The action history is invalid.".to_owned())?;
    if let Some(receipt) = receipts.iter().find(|receipt| receipt.id == action.id) {
        if receipt.fingerprint != mark { return Err("This action identifier belongs to a different change.".to_owned()); }
        if receipt.abandoned { return Err("Retrying this calendar action was stopped.".to_owned()); }
        if receipt.done { return receipt.result.clone().ok_or_else(|| "The event receipt is incomplete.".to_owned()); }
        return Err("The earlier event creation has an uncertain outcome. Check your calendar before creating another event.".to_owned());
    }
    if !calendars.calendars()?.iter().any(|calendar| calendar.id == action.calendar && calendar.writable) { return Err("Choose a writable calendar.".to_owned()); }
    receipts.push(Receipt { id: action.id.clone(), fingerprint: mark, path: format!("calendar:{}", action.calendar), done: false, draft: None, result: None, abandoned: false, root: action.root.clone() });
    save(settings, &receipts)?;
    let event = calendars.create(&crate::NewEvent { calendar: action.calendar.clone(), title: action.title.clone(), start: action.start, end: action.end, notes: action.notes.clone(), url: None })?;
    let receipt = receipts.last_mut().expect("just inserted"); receipt.done = true; receipt.result = Some(event.id.clone());
    save(settings, &receipts)?;
    Ok(event.id)
}

/// Stop retrying an uncertain operation without deleting its recovery draft or undoing a save.
pub fn abandon(settings: &Settings, root: &str, id: &str) -> Result<(), String> {
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|_| "The action history is unreadable.".to_owned())?).map_err(|_| "The action history is invalid.".to_owned())?;
    if let Some(receipt) = receipts.iter_mut().find(|receipt| receipt.id == id) {
        if !receipt.root.is_empty() && receipt.root != root { return Err("This action belongs to another vault.".to_owned()); }
        if receipt.done { return Ok(()); }
        receipt.root = root.to_owned(); receipt.abandoned = true;
        save(settings, &receipts)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn fixture() -> (tempfile::TempDir, Vault, Settings, NoteAction) {
        let dir = tempfile::tempdir().unwrap(); fs::create_dir(dir.path().join("vault")).unwrap();
        let vault = Vault::open(dir.path().join("vault")).unwrap();
        vault.create_note("Keep.md", "Keep [[links]] and spaces  \r\n").unwrap();
        let settings = Settings::new(dir.path().join("config"));
        let action = NoteAction { id: "turn:call".to_owned(), root: vault.root(), path: "Film.md".to_owned(), before: None, after: "---\nWatched: 2026-11-07\n---\nA film.\n".to_owned() };
        (dir, vault, settings, action)
    }
    #[test]
    fn creates_once_and_never_replays_a_completed_operation_after_an_outside_edit() {
        let (_dir, vault, settings, action) = fixture();
        apply_note(&vault, &settings, &action).unwrap();
        vault.write_note("Film.md", "Outside edit", &action.after).unwrap();
        apply_note(&vault, &settings, &action).unwrap();
        assert_eq!(vault.read_note("Film.md").unwrap(), "Outside edit");
        assert_eq!(vault.read_note("Keep.md").unwrap(), "Keep [[links]] and spaces  \r\n");
        let mut reused = action.clone(); reused.after = "Other".to_owned();
        assert!(apply_note(&vault, &settings, &reused).is_err());
    }
    #[test]
    fn recovers_an_interrupted_save_only_when_the_written_content_proves_its_outcome() {
        let (_dir, vault, settings, action) = fixture();
        save(&settings, &[Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone() }]).unwrap();
        assert!(apply_note(&vault, &settings, &action).unwrap_err().contains("uncertain"));
        assert!(vault.read_note(&action.path).is_err());
        vault.create_note(&action.path, &action.after).unwrap();
        apply_note(&vault, &settings, &action).unwrap();
        assert_eq!(settings.assistant_actions().unwrap()[0]["done"], true);
    }
    #[test]
    fn refuses_conflicts_cross_vault_actions_existing_destinations_and_corrupt_receipts() {
        let (dir, vault, settings, mut action) = fixture();
        action.path = "Keep.md".to_owned(); assert!(apply_note(&vault, &settings, &action).is_err());
        action.before = Some("Stale".to_owned()); assert!(apply_note(&vault, &settings, &action).is_err());
        action.root = "/another-vault".to_owned(); assert!(apply_note(&vault, &settings, &action).is_err());
        action.root = vault.root(); action.before = Some(vault.read_note("Keep.md").unwrap());
        fs::create_dir_all(dir.path().join("config")).unwrap(); fs::write(dir.path().join("config/assistant-actions.json"), "{").unwrap();
        assert!(apply_note(&vault, &settings, &action).unwrap_err().contains("unreadable"));
        assert_eq!(vault.read_note("Keep.md").unwrap(), "Keep [[links]] and spaces  \r\n");
    }
    #[test]
    fn calendar_actions_do_not_duplicate_events_on_retry_or_uncertain_outcomes() {
        use crate::Calendars;
        let (_dir, vault, settings, _) = fixture();
        let calendars = crate::MemoryCalendars::demo();
        let calendar = calendars.calendars().unwrap().into_iter().find(|item| item.writable).unwrap().id;
        let mut action = CalendarAction { id: "calendar-1".to_owned(), root: vault.root(), calendar, title: "A reading hour".to_owned(), start: 1_800_000_000_000, end: 1_800_003_600_000, notes: None };
        let first = apply_calendar(&calendars, &settings, &action).unwrap();
        assert_eq!(apply_calendar(&calendars, &settings, &action).unwrap(), first);
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 1);
        action.id = "uncertain".to_owned();
        let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().unwrap()).unwrap();
        receipts.push(Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: "calendar".to_owned(), done: false, draft: None, result: None, abandoned: false, root: action.root.clone() }); save(&settings, &receipts).unwrap();
        assert!(apply_calendar(&calendars, &settings, &action).unwrap_err().contains("uncertain"));
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 1);
        action.id = "overflow".to_owned(); action.start = i64::MIN; action.end = i64::MAX;
        assert!(apply_calendar(&calendars, &settings, &action).is_err());
    }
    #[test]
    fn stopping_an_uncertain_retry_keeps_the_draft_and_prevents_future_replay() {
        let (_dir, vault, settings, action) = fixture();
        save(&settings, &[Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone() }]).unwrap();
        assert!(abandon(&settings, "/other", &action.id).is_err());
        abandon(&settings, &action.root, &action.id).unwrap();
        assert_eq!(settings.assistant_actions().unwrap()[0]["draft"], action.after);
        assert_eq!(settings.assistant_actions().unwrap()[0]["abandoned"], true);
        assert!(apply_note(&vault, &settings, &action).unwrap_err().contains("stopped"));
        assert!(vault.read_note(&action.path).is_err());
    }
}
