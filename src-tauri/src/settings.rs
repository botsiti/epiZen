//! The app's own settings: the last vault opened and how periodic notes are named. They live
//! in a JSON file in the app's config folder, never in the vault, so a vault stays plain
//! Markdown that only Obsidian's own files sit beside.

mod prompt;

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

pub struct Settings {
    file: PathBuf,
    /// One update at a time, so two merges can't drop each other's keys.
    lock: Mutex<()>,
}

const LAST_VAULT: &str = "lastVault";

impl Settings {
    pub fn assistant_runtime_dir(&self) -> PathBuf { self.file.with_file_name("assistant-runtime") }
    pub fn new(dir: impl AsRef<Path>) -> Self {
        Self {
            file: dir.as_ref().join("settings.json"),
            lock: Mutex::new(()),
        }
    }

    /// Every setting. A missing or unreadable file reads as no settings.
    pub fn load(&self) -> Map<String, Value> {
        fs::read(&self.file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|value| match value {
                Value::Object(map) => Some(map),
                _ => None,
            })
            .unwrap_or_default()
    }

    /// Merges `patch` into the settings by top-level key; a `null` value removes the key.
    pub fn update(&self, patch: Map<String, Value>) -> io::Result<Map<String, Value>> {
        let _guard = self
            .lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut settings = self.load();
        for (key, value) in patch {
            if value.is_null() {
                settings.remove(&key);
            } else {
                settings.insert(key, value);
            }
        }
        self.save(&settings)?;
        Ok(settings)
    }

    /// Keys only the backend sets: the page may not choose the folder the app opens.
    pub fn is_private(key: &str) -> bool {
        key == LAST_VAULT
    }

    pub fn last_vault(&self) -> Option<PathBuf> {
        self.load().get(LAST_VAULT)?.as_str().map(PathBuf::from)
    }

    pub fn set_last_vault(&self, path: &Path) -> io::Result<()> {
        let value = Value::String(path.to_string_lossy().into_owned());
        self.update(Map::from_iter([(LAST_VAULT.to_owned(), value)]))
            .map(|_| ())
    }

    /// Per-vault XP settings live in the app config, never beside a user's notes.
    fn reward_location(&self, root: &str) -> io::Result<(PathBuf, String)> {
        if root.is_empty() || root.len() > 4096 { return Err(io::Error::other("Invalid vault identifier.")); }
        let vault_root = Path::new(root).canonicalize()?;
        if !vault_root.is_dir() { return Err(io::Error::other("The vault is unavailable.")); }
        let parent = self.file.parent().unwrap_or(Path::new("."));
        // Resolve existing ancestors before creating anything, including a missing config folder.
        let mut existing = parent;
        let mut missing = Vec::new();
        while !existing.exists() {
            missing.push(existing.file_name().ok_or_else(|| io::Error::other("Invalid settings location."))?.to_owned());
            existing = existing.parent().ok_or_else(|| io::Error::other("Invalid settings location."))?;
        }
        let mut resolved = existing.canonicalize()?;
        for component in missing.iter().rev() { resolved.push(component); }
        if resolved.starts_with(&vault_root) { return Err(io::Error::other("Keep Epizen settings outside the vault before using XP rules.")); }
        Ok((parent.to_path_buf(), format!("xp-rules-{:x}.md", Sha256::digest(root.as_bytes()))))
    }

    fn reward_document(&self, root: &str) -> io::Result<Option<(u64, Value, String)>> {
        let (parent, name) = self.reward_location(root)?;
        match fs::symlink_metadata(parent.join(&name)) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => return Err(io::Error::other("The XP settings file is not a regular file.")),
            Ok(metadata) if metadata.len() > 20 * 1024 * 1024 => return Err(io::Error::other("The XP settings history is too large to open safely.")),
            Ok(_) => {},
        }
        let vault = crate::Vault::open(&parent).map_err(io::Error::other)?;
        let text = vault.read_note(&name).map_err(io::Error::other)?;
        if text.len() > 20 * 1024 * 1024 { return Err(io::Error::other("The XP settings history is too large to open safely.")); }
        let parsed: Value = serde_json::from_str(&text).map_err(|_| io::Error::other("The XP settings could not be read. The original file has not been changed."))?;
        let revision = parsed.get("revision").and_then(Value::as_u64).filter(|number| *number > 0).ok_or_else(|| io::Error::other("The XP settings revision is invalid. The original file has not been changed."))?;
        let state = parsed.get("state").filter(|value| value.is_object()).ok_or_else(|| io::Error::other("The XP settings are invalid. The original file has not been changed."))?.clone();
        Ok(Some((revision, state, text)))
    }

    pub fn reward_settings(&self, root: &str) -> io::Result<Option<Value>> {
        self.reward_document(root).map(|document| document.map(|(revision, state, _)| serde_json::json!({ "revision": revision, "state": state })))
    }

    /// Revision-checked, no-clobber creation and conditional atomic replacement. Retrying a
    /// completed save is safe: the same state returns its existing revision without writing.
    pub fn save_reward_settings(&self, root: &str, expected: u64, state: &Value) -> io::Result<u64> {
        self.save_reward_settings_with(root, expected, state, || {})
    }

    fn save_reward_settings_with(&self, root: &str, expected: u64, state: &Value, before_write: impl FnOnce()) -> io::Result<u64> {
        if !state.is_object() || state.get("version").and_then(Value::as_u64) != Some(1) { return Err(io::Error::other("These XP rules need a different version of Epizen. They have not been replaced.")); }
        let current = self.reward_document(root)?;
        if let Some((revision, previous, _)) = &current {
            if previous.get("version").and_then(Value::as_u64) != Some(1) { return Err(io::Error::other("These XP rules need a different version of Epizen. They have not been replaced.")); }
            if previous == state { return Ok(*revision); }
        }
        let revision = current.as_ref().map_or(0, |(revision, _, _)| *revision);
        if revision != expected { return Err(io::Error::other("XP settings changed in another window. Your draft has been retained.")); }
        let next = revision.checked_add(1).ok_or_else(|| io::Error::other("XP settings revision overflow."))?;
        let text = serde_json::to_string_pretty(&serde_json::json!({ "revision": next, "state": state }))?;
        if text.len() > 20 * 1024 * 1024 { return Err(io::Error::other("The XP settings history is too large. Export your draft before making changes.")); }
        let (parent, name) = self.reward_location(root)?;
        fs::create_dir_all(&parent)?;
        // Re-check after creation so a settings folder inside the vault cannot be used.
        self.reward_location(root)?;
        let vault = crate::Vault::open(parent).map_err(io::Error::other)?;
        before_write();
        match current {
            Some((_, _, previous)) => vault.write_note(&name, &text, &previous),
            None => vault.create_note(&name, &text),
        }.map_err(|error| io::Error::other(format!("XP settings were not saved: {error}")))?;
        Ok(next)
    }

    /// Assistant action receipts are kept outside the vault. Corruption must block actions,
    /// never silently erase the evidence that a write may already have happened.
    pub fn assistant_actions(&self) -> io::Result<Value> {
        let path = self.file.with_file_name("assistant-actions.json");
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Array(vec![])),
            Err(error) => Err(error),
        }
    }

    pub fn save_assistant_actions(&self, value: &Value) -> io::Result<()> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let path = self.file.with_file_name("assistant-actions.json");
        let dir = path.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(dir)?;
        let temp = path.with_extension(format!("{}.tmp", std::process::id()));
        let mut file = fs::File::create(&temp)?;
        file.write_all(&serde_json::to_vec(value)?)?;
        file.sync_all()?;
        fs::rename(temp, path)
    }

    fn chat_path(&self, root: &str, id: &str) -> io::Result<PathBuf> {
        if root.is_empty() || root.len() > 4096 || id.is_empty() || id.len() > 80 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err(io::Error::other("Invalid conversation identifier."));
        }
        let folder = format!("{:x}", Sha256::digest(root.as_bytes()));
        Ok(self.file.parent().unwrap_or(Path::new(".")).join("assistant-conversations").join(folder).join(format!("{id}.json")))
    }

    pub fn assistant_chat(&self, root: &str, id: &str) -> io::Result<Value> {
        let bytes = fs::read(self.chat_path(root, id)?)?;
        serde_json::from_slice(&bytes).map_err(io::Error::other)
    }

    pub fn assistant_chats(&self, root: &str) -> io::Result<Vec<Value>> {
        let parent = self.chat_path(root, "index")?.parent().unwrap().to_owned();
        let entries = match fs::read_dir(parent) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(vec![]),
            Err(error) => return Err(error),
        };
        let mut chats = vec![];
        for entry in entries {
            let entry = entry?; let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "json") || !entry.file_type()?.is_file() { continue; }
            let id = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or_default();
            match self.assistant_chat(root, id) {
                Ok(value) if value["revision"].as_u64().is_some_and(|revision| revision > 0) && value["state"]["id"].as_str() == Some(id) && value["state"]["root"].as_str() == Some(root) && value["state"]["title"].is_string() && value["state"]["updated"].is_string() => chats.push(serde_json::json!({ "id": id, "title": value["state"]["title"], "updated": value["state"]["updated"] })),
                _ => chats.push(serde_json::json!({ "id": id, "title": "Unreadable conversation", "updated": "", "error": true })),
            }
        }
        chats.sort_by(|a, b| b["updated"].as_str().cmp(&a["updated"].as_str()));
        Ok(chats)
    }

    /// Only bounded, relevant excerpts leave local conversation storage.
    pub fn search_assistant_chats(&self, root: &str, query: &str, exclude_message: Option<&str>) -> io::Result<Vec<Value>> {
        let words: Vec<String> = query.split(|c: char| !c.is_alphanumeric()).filter(|word| word.chars().count() >= 2).take(8).map(str::to_lowercase).collect();
        if query.len() > 1000 || words.is_empty() { return Ok(vec![]); }
        let mut found: Vec<(usize, String, Value)> = vec![];
        for summary in self.assistant_chats(root)? {
            if summary["error"] == true { continue; }
            let id = summary["id"].as_str().unwrap_or_default();
            let Ok(chat) = self.assistant_chat(root, id) else { continue };
            let Some(messages) = chat["state"]["messages"].as_array() else { continue };
            for message in messages {
                if exclude_message.is_some() && message["id"].as_str() == exclude_message { continue; }
                let Some(text) = message["text"].as_str() else { continue };
                let role = message["role"].as_str().unwrap_or_default();
                if !matches!(role, "user" | "assistant") { continue; }
                let lower = text.to_lowercase();
                let score = words.iter().filter(|word| lower.contains(word.as_str())).count();
                if score == 0 { continue; }
                let offset = words.iter().filter_map(|word| lower.find(word)).min().unwrap_or(0);
                let start = lower[..offset].chars().count().saturating_sub(160);
                let excerpt: String = text.chars().skip(start).take(1600).collect();
                let date = message["created"].as_str().unwrap_or_default().to_owned();
                found.push((score, date.clone(), serde_json::json!({ "conversation": id, "title": summary["title"], "date": date, "role": role, "excerpt": excerpt, "truncated": start > 0 || text.chars().count() > 1600 })));
                if found.len() > 8 { found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1))); found.truncate(8); }
            }
        }
        found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
        Ok(found.into_iter().take(8).map(|(_, _, value)| value).collect())
    }

    #[cfg(feature = "e2e")]
    pub fn assistant_fixture_export_folder(&self) -> io::Result<PathBuf> {
        let folder = self.file.parent().unwrap_or(Path::new(".")).join("assistant-exports"); fs::create_dir_all(&folder)?; Ok(folder)
    }

    /// Compare-and-save contains stale windows; each conversation has its own atomic file.
    pub fn save_assistant_chat(&self, root: &str, id: &str, state: Value, expected_revision: u64) -> io::Result<u64> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let path = self.chat_path(root, id)?;
        if !state.is_object() || state["id"].as_str() != Some(id) || state["root"].as_str() != Some(root) { return Err(io::Error::other("Conversation identity does not match.")); }
        let revision = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice::<Value>(&bytes).map_err(io::Error::other)?["revision"].as_u64().ok_or_else(|| io::Error::other("Conversation revision is unreadable."))?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => 0,
            Err(error) => return Err(error),
        };
        if revision != expected_revision { return Err(io::Error::other("This conversation changed in another window. Your draft has been retained.")); }
        let next = revision.checked_add(1).ok_or_else(|| io::Error::other("Conversation revision overflow."))?;
        let bytes = serde_json::to_vec(&serde_json::json!({ "revision": next, "state": state }))?;
        if bytes.len() > 20 * 1024 * 1024 { return Err(io::Error::other("This conversation is full. Export it and start a new one; its history is retained.")); }
        fs::create_dir_all(path.parent().unwrap())?;
        let temp = path.with_extension(format!("{}.tmp", std::process::id()));
        let mut file = fs::File::create(&temp)?; file.write_all(&bytes)?; file.sync_all()?;
        fs::rename(temp, path)?;
        Ok(next)
    }

    /// Written beside the file and renamed over it, so a crash never leaves half a file.
    fn save(&self, settings: &Map<String, Value>) -> io::Result<()> {
        let dir = self.file.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(dir)?;
        let temp = self
            .file
            .with_extension(format!("json.{}.tmp", std::process::id()));
        let mut file = fs::File::create(&temp)?;
        file.write_all(&serde_json::to_vec_pretty(settings)?)?;
        file.sync_all()?;
        fs::rename(&temp, &self.file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn object(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            _ => panic!("not an object"),
        }
    }

    #[test]
    fn reward_settings_are_scoped_revision_checked_and_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("first"); let second = dir.path().join("second");
        fs::create_dir_all(&first).unwrap(); fs::create_dir_all(&second).unwrap();
        let first = first.canonicalize().unwrap().to_string_lossy().into_owned();
        let second = second.canonicalize().unwrap().to_string_lossy().into_owned();
        let settings = Settings::new(dir.path().join("config"));
        let initial = json!({"version":1,"id":"first","policies":[{"id":"initial"}]});
        let changed = json!({"version":1,"id":"first","policies":[{"id":"future"}]});
        assert!(settings.reward_settings(&first).unwrap().is_none());
        assert_eq!(settings.save_reward_settings(&first, 0, &initial).unwrap(), 1);
        assert_eq!(settings.save_reward_settings(&second, 0, &json!({"version":1,"id":"second"})).unwrap(), 1);
        assert_eq!(settings.save_reward_settings(&first, 0, &initial).unwrap(), 1, "a retry must not duplicate a revision");
        assert!(settings.save_reward_settings(&first, 0, &changed).unwrap_err().to_string().contains("draft has been retained"));
        assert_eq!(settings.save_reward_settings(&first, 1, &changed).unwrap(), 2);
        assert_eq!(settings.reward_settings(&first).unwrap().unwrap(), json!({"revision":2,"state":changed}));
        assert_eq!(settings.reward_settings(&second).unwrap().unwrap()["state"]["id"], "second");
    }

    #[test]
    fn competing_reward_saves_preserve_the_winner_and_report_the_conflict() {
        use std::sync::{Arc, Barrier};
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault"); fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap().to_string_lossy().into_owned();
        let first = Settings::new(dir.path().join("config")); let second = Settings::new(dir.path().join("config"));
        first.save_reward_settings(&root, 0, &json!({"version":1,"value":"original"})).unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let (a, b) = std::thread::scope(|scope| {
            let left_barrier = barrier.clone(); let right_barrier = barrier.clone();
            let left_settings = &first; let right_settings = &second; let root = &root;
            let left = scope.spawn(move || left_settings.save_reward_settings_with(root, 1, &json!({"version":1,"value":"left"}), || { left_barrier.wait(); }));
            let right = scope.spawn(move || right_settings.save_reward_settings_with(root, 1, &json!({"version":1,"value":"right"}), || { right_barrier.wait(); }));
            (left.join().unwrap(), right.join().unwrap())
        });
        assert_ne!(a.is_ok(), b.is_ok());
        let saved = first.reward_settings(&root).unwrap().unwrap();
        assert_eq!(saved["revision"], 2);
        assert_eq!(saved["state"]["value"], if a.is_ok() { "left" } else { "right" });
    }

    #[test]
    fn damaged_or_newer_reward_settings_are_never_replaced_and_other_settings_still_work() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault"); fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap().to_string_lossy().into_owned();
        let settings = Settings::new(dir.path().join("config"));
        settings.save_reward_settings(&root, 0, &json!({"version":1})).unwrap();
        let (parent, name) = settings.reward_location(&root).unwrap(); let path = parent.join(name);
        for original in ["{broken", "{\"revision\":3,\"state\":{\"version\":2,\"future\":true}}"] {
            fs::write(&path, original).unwrap();
            assert!(settings.save_reward_settings(&root, 3, &json!({"version":1})).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), original);
            settings.update(object(json!({"theme":"dark"}))).unwrap();
            assert_eq!(settings.load()["theme"], "dark");
        }
    }

    #[test]
    fn refuses_a_settings_location_inside_the_vault_without_creating_anything() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault"); fs::create_dir(&root).unwrap();
        let settings = Settings::new(root.join("not-created"));
        let error = settings.save_reward_settings(&root.canonicalize().unwrap().to_string_lossy(), 0, &json!({"version":1})).unwrap_err();
        assert!(error.to_string().contains("outside the vault"));
        assert!(!root.join("not-created").exists());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_reward_file_without_touching_the_target_note() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault"); fs::create_dir(&root).unwrap();
        let note = root.join("Keep.md"); fs::write(&note, "Original\n").unwrap();
        let settings = Settings::new(dir.path().join("config"));
        let root = root.canonicalize().unwrap().to_string_lossy().into_owned();
        let (parent, name) = settings.reward_location(&root).unwrap(); fs::create_dir_all(&parent).unwrap();
        std::os::unix::fs::symlink(&note, parent.join(name)).unwrap();
        assert!(settings.save_reward_settings(&root, 0, &json!({"version":1})).is_err());
        assert_eq!(fs::read_to_string(note).unwrap(), "Original\n");
    }

    #[test]
    fn starts_empty_and_merges_updates_by_key() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Settings::new(dir.path().join("config"));
        assert!(settings.load().is_empty());
        assert_eq!(settings.last_vault(), None);

        settings
            .set_last_vault(Path::new("/Users/me/Kaizen"))
            .unwrap();
        settings
            .update(object(
                json!({ "periodic": { "day": { "format": "DD.MM.YYYY" } } }),
            ))
            .unwrap();
        assert_eq!(
            settings.last_vault(),
            Some(PathBuf::from("/Users/me/Kaizen"))
        );
        assert_eq!(settings.load()["periodic"]["day"]["format"], "DD.MM.YYYY");

        settings
            .update(object(json!({ "lastVault": null })))
            .unwrap();
        assert_eq!(settings.last_vault(), None);
        assert!(settings.load().contains_key("periodic"));
    }

    #[test]
    fn a_broken_file_reads_as_no_settings() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), "{ not json").unwrap();
        let settings = Settings::new(dir.path());
        assert!(settings.load().is_empty());
        settings.set_last_vault(Path::new("/v")).unwrap();
        assert_eq!(settings.last_vault(), Some(PathBuf::from("/v")));
    }
    #[test]
    fn assistant_conversations_are_isolated_conditional_and_preserve_corrupt_history() {
        let dir = tempfile::tempdir().unwrap(); let settings = Settings::new(dir.path());
        let state = serde_json::json!({ "id": "chat-1", "root": "/one", "title": "Hello", "updated": "2026-11-08", "draft": "Keep this" });
        assert_eq!(settings.save_assistant_chat("/one", "chat-1", state.clone(), 0).unwrap(), 1);
        assert_eq!(settings.assistant_chat("/one", "chat-1").unwrap()["state"]["draft"], "Keep this");
        assert!(settings.assistant_chats("/two").unwrap().is_empty());
        assert!(settings.save_assistant_chat("/one", "chat-1", state.clone(), 0).is_err());
        assert!(settings.save_assistant_chat("/one", "../outside", state.clone(), 0).is_err());
        assert!(settings.save_assistant_chat("/two", "chat-1", state.clone(), 0).is_err());
        fs::write(settings.chat_path("/one", "chat-1").unwrap(), "{").unwrap();
        assert!(settings.save_assistant_chat("/one", "chat-1", state, 1).is_err());
        assert_eq!(settings.assistant_chats("/one").unwrap()[0]["error"], true);
        assert_eq!(fs::read_to_string(settings.chat_path("/one", "chat-1").unwrap()).unwrap(), "{");
    }
    #[test]
    fn conversation_search_is_bounded_role_aware_and_never_crosses_vaults() {
        let dir = tempfile::tempdir().unwrap(); let settings = Settings::new(dir.path());
        for (root, text) in [("/personal", "I missed a deadline and felt anxious."), ("/work", "A different private deadline.")] {
            let state = serde_json::json!({ "id":"chat", "root":root, "title":"Earlier conversation", "updated":"2026-11-08", "messages":[{"id":"old","role":"user","created":"2026-11-07","text":text},{"id":"current","role":"user","created":"2026-11-08","text":"What did I say about that deadline?"}] });
            settings.save_assistant_chat(root, "chat", state, 0).unwrap();
        }
        let results = settings.search_assistant_chats("/personal", "deadline", Some("current")).unwrap();
        assert_eq!(results.len(), 1); assert_eq!(results[0]["role"], "user");
        assert!(results[0]["excerpt"].as_str().unwrap().contains("felt anxious"));
        assert!(!serde_json::to_string(&results).unwrap().contains("different private"));
    }
}
