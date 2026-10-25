//! The app's own settings: the last vault opened and how periodic notes are named. They live
//! in a JSON file in the app's config folder, never in the vault, so a vault stays plain
//! Markdown that only Obsidian's own files sit beside.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};

pub struct Settings {
    file: PathBuf,
    /// One update at a time, so two merges can't drop each other's keys.
    lock: Mutex<()>,
}

const LAST_VAULT: &str = "lastVault";

impl Settings {
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
}
