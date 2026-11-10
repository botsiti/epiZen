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
struct Receipt { id: String, fingerprint: String, path: String, done: bool, draft: Option<String>, #[serde(default)] result: Option<String>, #[serde(default)] abandoned: bool, #[serde(default)] root: String, #[serde(default, skip_serializing_if = "Option::is_none")] cover_hash: Option<String> }
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
    receipts.push(Receipt { id: action.id.clone(), fingerprint: mark, path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone(), cover_hash: None });
    save(settings, &receipts)?;
    match &action.before {
        Some(expected) => vault.write_note(&action.path, &action.after, expected),
        None => vault.create_note(&action.path, &action.after),
    }.map_err(|error| error.to_string())?;
    let receipt = receipts.last_mut().expect("just inserted"); receipt.done = true; receipt.draft = None;
    save(settings, &receipts)?;
    Ok(action.path.clone())
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CoverAction { pub id: String, pub root: String, pub note: String, pub path: String, pub url: String }
fn cover_id(action: &CoverAction) -> String { format!("cover:{}", action.id) }
fn validate_cover(vault: &Vault, action: &CoverAction) -> Result<(), String> {
    if action.root != vault.root() { return Err("The vault changed. No cover was saved.".into()); }
    let plain = |path: &str| !path.is_empty() && path.len() <= 1024 && !path.contains('\\') && !path.chars().any(char::is_control) && path.split('/').all(|part| !part.is_empty() && !part.starts_with('.'));
    let folder = action.note.rsplit_once('/').map(|(folder, _)| folder).ok_or("A cover belongs beside its Library note.")?;
    if action.id.is_empty() || action.id.len() > 200 || !plain(&action.note) || !plain(&action.path) || !action.note.starts_with("Rating/") || !action.note.to_ascii_lowercase().ends_with(".md") || action.path.rsplit_once('/').map(|(parent, _)| parent) != Some(format!("{folder}/_attachments").as_str()) {
        return Err("A cover must be a new Library attachment beside the requested note.".into());
    }
    crate::net::image_path(&action.path, crate::net::ImageFormat::Jpeg).map_err(|error| error.to_string())?;
    if action.url.len() > 8000 { return Err("The cover address is too long.".into()); }
    crate::net::allowed(&action.url).map_err(|error| error.to_string())?;
    Ok(())
}
/// Consult the durable receipt before downloading. A retry never creates a second attachment.
/// The caller holds Assistant::writes; no lock is held while awaiting the network.
pub fn cover_status(vault: &Vault, settings: &Settings, action: &CoverAction) -> Result<Option<String>, String> {
    validate_cover(vault, action)?;
    let id = cover_id(action);
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|error| error.to_string())?).map_err(|_| "The action history is unreadable.")?;
    if let Some(receipt) = receipts.iter_mut().find(|receipt| receipt.id == id) {
        if receipt.fingerprint != fingerprint(action)? { return Err("This cover identifier belongs to a different request.".into()); }
        if receipt.abandoned { return Err("Retrying this cover was stopped. Prepare a new Library request.".into()); }
        let bytes = vault.read_image(&receipt.path).map_err(|_| format!("The earlier cover save is unavailable or uncertain. Review {} before creating another attachment.", receipt.path))?;
        if !receipt.done && receipt.cover_hash.as_deref() != Some(format!("{:x}", Sha256::digest(&bytes)).as_str()) {
            return Err("The earlier cover save has an uncertain outcome. Its file was preserved.".into());
        }
        let path = receipt.path.clone();
        if !receipt.done { receipt.done = true; save(settings, &receipts)?; }
        return Ok(Some(path));
    }
    // Do not download or create an orphan cover for a destination already occupied by a note.
    if vault.read_note(&action.note).is_ok() { return Err("A Library note already exists here. Nothing was replaced.".into()); }
    Ok(None)
}
pub fn apply_cover(vault: &Vault, settings: &Settings, action: &CoverAction, bytes: &[u8]) -> Result<String, String> {
    if let Some(path) = cover_status(vault, settings, action)? { return Ok(path); }
    let format = crate::net::ImageFormat::sniff(bytes).ok_or("The catalogue did not return a supported cover image.")?;
    let path = crate::net::image_path(&action.path, format).map_err(|error| error.to_string())?;
    if vault.read_image(&path).is_ok() { return Err("A cover already exists at this destination. Prepare the Library entry again to choose a new filename.".into()); }
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|error| error.to_string())?).map_err(|_| "The action history is unreadable.")?;
    if receipts.iter().filter(|receipt| !receipt.done && !receipt.abandoned).count() >= 32 { return Err("Resolve the pending assistant saves before adding another cover.".into()); }
    receipts.push(Receipt { id: cover_id(action), fingerprint: fingerprint(action)?, path: path.clone(), done: false, draft: None, result: Some(path.clone()), abandoned: false, root: action.root.clone(), cover_hash: Some(format!("{:x}", Sha256::digest(bytes))) });
    save(settings, &receipts)?;
    crate::net::store_image(vault, &action.path, bytes).map_err(|error| error.to_string())?;
    receipts.last_mut().expect("just inserted").done = true;
    save(settings, &receipts)?;
    Ok(path)
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CalendarAction {
    pub id: String, pub root: String, pub calendar: String, pub title: String,
    pub start: i64, pub end: i64, pub notes: Option<String>,
    #[serde(default, rename = "avoidConflicts", skip_serializing_if = "is_false")]
    pub avoid_conflicts: bool,
}
fn is_false(value: &bool) -> bool { !value }
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
    // Recheck a suggested free slot at approval time, after resolving prior receipts so
    // retrying our own successful event never conflicts with itself.
    if action.avoid_conflicts && calendars.events(action.start, action.end)?.iter().any(|event| event.start < action.end && event.end > action.start) {
        return Err("This calendar slot is no longer free. Ask Spike to find another time; no event was created.".to_owned());
    }
    receipts.push(Receipt { id: action.id.clone(), fingerprint: mark, path: format!("calendar:{}", action.calendar), done: false, draft: None, result: None, abandoned: false, root: action.root.clone(), cover_hash: None });
    save(settings, &receipts)?;
    let event = calendars.create(&crate::NewEvent { calendar: action.calendar.clone(), title: action.title.clone(), start: action.start, end: action.end, notes: action.notes.clone(), url: None })?;
    let receipt = receipts.last_mut().expect("just inserted"); receipt.done = true; receipt.result = Some(event.id.clone());
    save(settings, &receipts)?;
    Ok(event.id)
}

/// Stop retrying an uncertain operation without deleting its recovery draft or undoing a save.
pub fn abandon(settings: &Settings, root: &str, id: &str) -> Result<(), String> {
    let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().map_err(|_| "The action history is unreadable.".to_owned())?).map_err(|_| "The action history is invalid.".to_owned())?;
    let cover = format!("cover:{id}");
    for receipt in receipts.iter_mut().filter(|receipt| receipt.id == id || receipt.id == cover) {
        if !receipt.root.is_empty() && receipt.root != root { return Err("This action belongs to another vault.".to_owned()); }
        if receipt.done { continue; }
        receipt.root = root.to_owned(); receipt.abandoned = true;
    }
    save(settings, &receipts)?;
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
    fn cover_action(vault: &Vault) -> CoverAction {
        CoverAction { id: "film-cover".into(), root: vault.root(), note: "Rating/kino/Assistant cover test.md".into(), path: "Rating/kino/_attachments/assistant-cover-test.jpg".into(), url: "https://upload.wikimedia.org/cover.jpg".into() }
    }
    const COVER: &[u8] = include_bytes!("../../test/fixtures/lookup/cover-1.png");
    fn copy_tree(from: &std::path::Path, to: &std::path::Path) {
        fs::create_dir_all(to).unwrap();
        for entry in fs::read_dir(from).unwrap() {
            let entry = entry.unwrap(); let target = to.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() { copy_tree(&entry.path(), &target); }
            else { fs::copy(entry.path(), target).unwrap(); }
        }
    }
    fn bytes_in(root: &std::path::Path) -> std::collections::BTreeMap<String, Vec<u8>> {
        fn visit(root: &std::path::Path, folder: &std::path::Path, found: &mut std::collections::BTreeMap<String, Vec<u8>>) {
            for entry in fs::read_dir(folder).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() { visit(root, &path, found); }
                else { found.insert(path.strip_prefix(root).unwrap().to_string_lossy().into_owned(), fs::read(path).unwrap()); }
            }
        }
        let mut found = std::collections::BTreeMap::new(); visit(root, root, &mut found); found
    }
    #[test]
    fn library_cover_and_note_on_a_demo_copy_only_add_the_requested_files_and_retry_once() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault");
        copy_tree(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo-vault"), &root);
        let vault = Vault::open(&root).unwrap(); let settings = Settings::new(dir.path().join("config"));
        let before = bytes_in(&root); let action = cover_action(&vault);
        assert!(cover_status(&vault, &settings, &action).unwrap().is_none());
        let cover = apply_cover(&vault, &settings, &action, COVER).unwrap();
        assert!(cover.ends_with(".png"));
        let text = format!("---\nWatched: 2026-11-09\nRating: 90\n---\n![[{cover}|300]]\n\nI liked the cinematography.\n");
        let note = NoteAction { id: action.id.clone(), root: vault.root(), path: action.note.clone(), before: None, after: text.clone() };
        apply_note(&vault, &settings, &note).unwrap();
        assert_eq!(apply_cover(&vault, &settings, &action, b"should never be used").unwrap(), cover);
        apply_note(&vault, &settings, &note).unwrap();
        let mut after = bytes_in(&root);
        assert_eq!(after.remove(&cover).unwrap(), COVER);
        assert_eq!(after.remove(&action.note).unwrap(), text.as_bytes());
        assert_eq!(after, before, "every other file must remain byte-identical");
    }
    #[test]
    fn covers_preserve_collisions_and_outside_paths_and_recover_only_verified_bytes() {
        let (_dir, vault, settings, _) = fixture(); let mut action = cover_action(&vault);
        assert!(apply_cover(&vault, &settings, &action, b"not an image").is_err());
        let path = crate::net::image_path(&action.path, crate::net::ImageFormat::Png).unwrap();
        vault.create_file(&path, COVER).unwrap();
        assert!(apply_cover(&vault, &settings, &action, COVER).unwrap_err().contains("already exists"));
        action.path = "../outside.png".into(); assert!(apply_cover(&vault, &settings, &action, COVER).is_err());
        action = cover_action(&vault);
        save(&settings, &[Receipt { id: cover_id(&action), fingerprint: fingerprint(&action).unwrap(), path: path.clone(), done: false, draft: None, result: None, abandoned: false, root: vault.root(), cover_hash: Some(format!("{:x}", Sha256::digest(COVER))) }]).unwrap();
        assert_eq!(cover_status(&vault, &settings, &action).unwrap(), Some(path.clone()));
        assert_eq!(settings.assistant_actions().unwrap()[0]["done"], true);
        action.url = "https://upload.wikimedia.org/different.png".into(); assert!(cover_status(&vault, &settings, &action).is_err());
        assert_eq!(vault.read_image(&path).unwrap(), COVER);
    }
    #[test]
    fn incomplete_cover_can_be_stopped_without_deleting_a_file_or_replaying_a_write() {
        let (_dir, vault, settings, _) = fixture(); let action = cover_action(&vault);
        let path = "Rating/kino/_attachments/assistant-cover-test.png";
        save(&settings, &[Receipt { id: cover_id(&action), fingerprint: fingerprint(&action).unwrap(), path: path.into(), done: false, draft: None, result: None, abandoned: false, root: vault.root(), cover_hash: Some("mismatched".into()) }]).unwrap();
        assert!(cover_status(&vault, &settings, &action).unwrap_err().contains("uncertain"));
        vault.create_file(path, COVER).unwrap();
        assert!(cover_status(&vault, &settings, &action).unwrap_err().contains("uncertain"));
        abandon(&settings, &action.root, &action.id).unwrap();
        assert!(cover_status(&vault, &settings, &action).unwrap_err().contains("stopped"));
        assert_eq!(vault.read_image(path).unwrap(), COVER);
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
        save(&settings, &[Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone(), cover_hash: None }]).unwrap();
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
    fn free_slot_approval_rechecks_conflicts_but_a_completed_retry_remains_idempotent() {
        use crate::Calendars;
        let (_dir, vault, settings, _) = fixture();
        let calendars = crate::MemoryCalendars::demo();
        let calendar = calendars.calendars().unwrap().into_iter().find(|item| item.writable).unwrap().id;
        let mut action = CalendarAction { id: "plan-block".into(), root: vault.root(), calendar, title: "code".into(), start: 1_800_000_000_000, end: 1_800_005_400_000, notes: Some("Feature work".into()), avoid_conflicts: true };
        let saved = apply_calendar(&calendars, &settings, &action).unwrap();
        assert_eq!(apply_calendar(&calendars, &settings, &action).unwrap(), saved);
        action.id = "conflicting-block".into();
        assert!(apply_calendar(&calendars, &settings, &action).unwrap_err().contains("no longer free"));
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 1);
        let receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().unwrap()).unwrap();
        assert_eq!(receipts.len(), 1, "a known conflict must not leave an uncertain receipt");
        action.avoid_conflicts = false;
        assert!(serde_json::to_value(&action).unwrap().get("avoidConflicts").is_none(), "legacy fingerprints must remain compatible");
        apply_calendar(&calendars, &settings, &action).unwrap();
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 2, "explicit overlapping events remain supported");
    }
    #[test]
    fn calendar_actions_do_not_duplicate_events_on_retry_or_uncertain_outcomes() {
        use crate::Calendars;
        let (_dir, vault, settings, _) = fixture();
        let calendars = crate::MemoryCalendars::demo();
        let calendar = calendars.calendars().unwrap().into_iter().find(|item| item.writable).unwrap().id;
        let mut action = CalendarAction { id: "calendar-1".to_owned(), root: vault.root(), calendar, title: "A reading hour".to_owned(), start: 1_800_000_000_000, end: 1_800_003_600_000, notes: None, avoid_conflicts: false };
        let first = apply_calendar(&calendars, &settings, &action).unwrap();
        assert_eq!(apply_calendar(&calendars, &settings, &action).unwrap(), first);
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 1);
        action.id = "uncertain".to_owned();
        let mut receipts: Vec<Receipt> = serde_json::from_value(settings.assistant_actions().unwrap()).unwrap();
        receipts.push(Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: "calendar".to_owned(), done: false, draft: None, result: None, abandoned: false, root: action.root.clone(), cover_hash: None }); save(&settings, &receipts).unwrap();
        assert!(apply_calendar(&calendars, &settings, &action).unwrap_err().contains("uncertain"));
        assert_eq!(calendars.events(action.start, action.end).unwrap().len(), 1);
        action.id = "overflow".to_owned(); action.start = i64::MIN; action.end = i64::MAX;
        assert!(apply_calendar(&calendars, &settings, &action).is_err());
    }
    #[test]
    fn stopping_an_uncertain_retry_keeps_the_draft_and_prevents_future_replay() {
        let (_dir, vault, settings, action) = fixture();
        save(&settings, &[Receipt { id: action.id.clone(), fingerprint: fingerprint(&action).unwrap(), path: action.path.clone(), done: false, draft: Some(action.after.clone()), result: None, abandoned: false, root: action.root.clone(), cover_hash: None }]).unwrap();
        assert!(abandon(&settings, "/other", &action.id).is_err());
        abandon(&settings, &action.root, &action.id).unwrap();
        assert_eq!(settings.assistant_actions().unwrap()[0]["draft"], action.after);
        assert_eq!(settings.assistant_actions().unwrap()[0]["abandoned"], true);
        assert!(apply_note(&vault, &settings, &action).unwrap_err().contains("stopped"));
        assert!(vault.read_note(&action.path).is_err());
    }
}
